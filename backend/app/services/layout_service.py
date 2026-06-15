import numpy as np
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession
import time
import logging

from .source_service import SourceService
from .substance_service import SubstanceService
from backend.app.core.emissions_calculation_math.math_numba import calculate_concentration_chunk
from ..core.emissions_calculation_math.state import pollution_state
from ..core.emissions_calculation_math.discretization import discretize_sources
from ..core.emissions_calculation_math.coloring import colorize_tile_numpy

logger = logging.getLogger("uvicorn")

R_DRY_AIR = 287.058


class LayoutService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.source_service = SourceService(db)
        self.substance_service = SubstanceService(db)

    def get_tile_bounds(self, tx: int, ty: int, zoom: int):
        equator = 40075016.685578488
        tile_size = equator / (2 ** zoom)
        origin = equator / 2.0
        min_x = tx * tile_size - origin
        max_x = (tx + 1) * tile_size - origin
        max_y = origin - ty * tile_size
        min_y = origin - (ty + 1) * tile_size
        return min_x, min_y, max_x, max_y

    def _air_density(self, temperature_c: float, pressure_hpa: float) -> float:

        T_k = float(temperature_c) + 273.15
        P_pa = float(pressure_hpa) * 100.0  # гПа → Па
        return P_pa / (R_DRY_AIR * T_k)

    def _air_viscosity_sutherland(self, temperature_c: float) -> float:

        T = float(temperature_c) + 273.15
        mu0 = 1.716e-5
        T0 = 273.15
        S = 111.0
        return mu0 * ((T / T0) ** 1.5) * (T0 + S) / (T + S)

    def _compute_weather_factors(
            self,
            temperature: float,
            pressure: float
    ) -> tuple[float, float, float]:

        rho = self._air_density(temperature, pressure)
        rho_ref = self._air_density(20.0, 1013.25)

        mu = self._air_viscosity_sutherland(temperature)
        mu_ref = self._air_viscosity_sutherland(20.0)

        density_ratio = rho_ref / rho
        visc_ratio = mu / mu_ref

        kH = 0.35
        height_factor = float(np.clip(density_ratio ** kH, 0.85, 1.30))

        kSigma_rho = 0.20
        kSigma_mu = 0.10
        sigma_factor = float(np.clip(
            (density_ratio ** kSigma_rho) * (visc_ratio ** (-kSigma_mu)),
            0.90, 1.20
        ))

        settling_factor = float(np.clip(mu_ref / mu, 0.75, 1.35))

        logger.debug(
            f"WeatherFactors T={temperature}°C P={pressure}hPa → "
            f"rho={rho:.3f} mu={mu:.2e} | "
            f"H×{height_factor:.3f} σ×{sigma_factor:.3f} vs×{settling_factor:.3f}"
        )

        return height_factor, sigma_factor, settling_factor

    def _cache_key(self, substance_id: int, scenario_id) -> str:
        return '{}_{}'.format(substance_id, scenario_id or 'none')

    async def _get_prepared_sources(
            self,
            substance_id: int,
            scenario_id: int | None = None
    ):

        current_time = time.time()

        if not isinstance(pollution_state.cached_sources, dict):
            pollution_state.cached_sources = {}
            pollution_state.sources_time = {}

        key = self._cache_key(substance_id, scenario_id)

        if (key in pollution_state.cached_sources and
                (current_time - pollution_state.sources_time.get(key, 0) < 2)):
            return pollution_state.cached_sources[key]

        all_sources = await self.source_service.get_sources_by_substance_internal(substance_id)

        sources_db = (
            [s for s in all_sources if s.scenario_id == scenario_id]
            if scenario_id is not None
            else list(all_sources)
        )

        substance = await self.substance_service.get_substance_by_id(substance_id)
        mcl = substance.mcl if substance else 0.008

        if not sources_db:
            empty = tuple(np.array([], dtype=np.float32) for _ in range(7))
            pollution_state.cached_sources[key] = (empty, mcl)
            pollution_state.sources_time[key] = current_time
            return pollution_state.cached_sources[key]

        prepared_data = discretize_sources(sources_db)

        pollution_state.cached_sources[key] = (prepared_data, mcl)
        pollution_state.sources_time[key] = current_time
        return pollution_state.cached_sources[key]

    async def render_tile(
            self,
            substance_id: int,
            tx: int,
            ty: int,
            tz: int,
            scenario_id: int | None = None,
            wind_speed: float = 3.0,
            wind_direction: float = 180.0,
            temperature: float = 20.0,  # °C
            pressure: float = 1013.0,  # гПа
            sun_brightness: float = 20000,
            cloud_density: int = 0
    ) -> Image.Image:

        if tz < 11:
            return Image.new("RGBA", (256, 256), (0, 0, 0, 0))

        min_x, min_y, max_x, max_y = self.get_tile_bounds(tx, ty, tz)
        res = 256
        px_size = (max_x - min_x) / res

        u = float(wind_speed)
        wind_math_rad = np.radians((270.0 - float(wind_direction)) % 360.0)

        height_factor, sigma_factor, settling_factor = self._compute_weather_factors(
            temperature, pressure
        )

        prepared_data, mcl = await self._get_prepared_sources(substance_id, scenario_id)

        src_xs, src_ys, src_rates, src_heights, src_sy0, src_sz0, src_settling = prepared_data

        if len(src_xs) == 0:
            return Image.new("RGBA", (256, 256), (0, 0, 0, 0))

        BUFFER = 200_000  # метры
        mask = (
                (src_xs > min_x - BUFFER) & (src_xs < max_x + BUFFER) &
                (src_ys > min_y - BUFFER) & (src_ys < max_y + BUFFER)
        )

        if not np.any(mask):
            return Image.new("RGBA", (256, 256), (0, 0, 0, 0))

        s_xs = src_xs[mask]
        s_ys = src_ys[mask]
        s_rates = src_rates[mask]

        s_heights_eff = src_heights[mask].astype(np.float32) * height_factor
        s_sy0_eff = src_sy0[mask].astype(np.float32) * sigma_factor
        s_sz0_eff = src_sz0[mask].astype(np.float32) * sigma_factor
        s_settling_eff = src_settling[mask].astype(np.float32) * settling_factor

        px_half = px_size / 2.0
        xs = np.linspace(min_x + px_half, max_x - px_half, res, dtype=np.float32)
        ys = np.linspace(max_y - px_half, min_y + px_half, res, dtype=np.float32)
        xv, yv = np.meshgrid(xs, ys)

        conc_flat = calculate_concentration_chunk(
            xv.ravel(), yv.ravel(),
            s_xs, s_ys, s_rates, s_heights_eff,
            s_sy0_eff, s_sz0_eff, s_settling_eff,
            u, wind_math_rad, sun_brightness, cloud_density
        )

        grid_conc = conc_flat.reshape((res, res))

        img_data = colorize_tile_numpy(grid_conc, pdk=mcl, alpha_bg=110)

        return Image.fromarray(img_data, 'RGBA')
