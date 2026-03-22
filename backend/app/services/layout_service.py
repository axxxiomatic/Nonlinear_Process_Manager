import numpy as np
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession
import logging
import time

from ..services.source_service import SourceService
from ..services.simulation_params_service import SimulationParamsService
from ..core.math_numba import calculate_concentration_chunk, lat_lon_to_meters_yandex_single

logger = logging.getLogger("uvicorn")


class PollutionState:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(PollutionState, cls).__new__(cls)
            cls._instance.cached_sources = None
            cls._instance.sources_time = 0
            cls._instance.cached_params = None
            cls._instance.params_time = 0
        return cls._instance


pollution_state = PollutionState()


# НОВАЯ ФУНКЦИЯ ПОКРАСКИ (Работает идеально ровно и без стыков)
def colorize_tile_numpy(conc_grid, pdk=0.008, alpha_bg=110):
    c = conc_grid.flatten()

    # Цвета (R, G, B, Alpha)
    color_green = np.array([46, 204, 113, alpha_bg])  # Фон (< 20% ПДК)
    color_yellow = np.array([241, 196, 15, 180])  # Желтый (20% - 60% ПДК)
    color_orange = np.array([230, 126, 34, 210])  # Оранжевый (60% - 100% ПДК)
    color_red = np.array([231, 76, 60, 240])  # Красный (> ПДК)

    rgba = np.zeros((len(c), 4), dtype=np.float32)

    # Пороги
    t0 = pdk * 0.001
    t1 = pdk * 0.2
    t2 = pdk * 0.6
    t3 = pdk * 1.0

    # Маски (условия)
    m_bg = c <= t0
    m_gy = (c > t0) & (c <= t1)
    m_yo = (c > t1) & (c <= t2)
    m_or = (c > t2)

    # Применяем зеленый фон
    rgba[m_bg] = color_green

    # Градиент: Зеленый -> Желтый
    if np.any(m_gy):
        f = (c[m_gy] - t0) / (t1 - t0)
        rgba[m_gy] = color_green * (1 - f[:, None]) + color_yellow * f[:, None]

    # Градиент: Желтый -> Оранжевый
    if np.any(m_yo):
        f = (c[m_yo] - t1) / (t2 - t1)
        rgba[m_yo] = color_yellow * (1 - f[:, None]) + color_orange * f[:, None]

    # Градиент: Оранжевый -> Красный
    if np.any(m_or):
        f = np.clip((c[m_or] - t2) / (t3 - t2), 0, 1)  # clip чтобы не ушло за 100% красного
        rgba[m_or] = color_orange * (1 - f[:, None]) + color_red * f[:, None]

    return rgba.astype(np.uint8).reshape((256, 256, 4))


class LayoutService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.source_service = SourceService(db)
        self.params_service = SimulationParamsService(db)

    def get_tile_bounds(self, tx, ty, zoom):
        equator = 40075016.685578488
        tile_size = equator / (2 ** zoom)
        origin = equator / 2.0
        min_x = tx * tile_size - origin
        max_x = (tx + 1) * tile_size - origin
        max_y = origin - ty * tile_size
        min_y = origin - (ty + 1) * tile_size
        return min_x, min_y, max_x, max_y

    async def _get_prepared_sources(self):
        current_time = time.time()
        if pollution_state.cached_sources is not None and (current_time - pollution_state.sources_time < 2):
            return pollution_state.cached_sources

        sources_db = await self.source_service.get_all_sources()
        n = len(sources_db)
        src_xs = np.zeros(n, dtype=np.float32)
        src_ys = np.zeros(n, dtype=np.float32)
        src_rates = np.zeros(n, dtype=np.float32)
        src_heights = np.zeros(n, dtype=np.float32)

        for i, s in enumerate(sources_db):
            mx, my = lat_lon_to_meters_yandex_single(s.latitude, s.longitude)
            src_xs[i] = mx
            src_ys[i] = my
            src_rates[i] = s.emission_rate
            src_heights[i] = s.height

        pollution_state.cached_sources = (src_xs, src_ys, src_rates, src_heights)
        pollution_state.sources_time = current_time
        return pollution_state.cached_sources

    async def render_tile(self, tx, ty, tz):
        # Отключаем рендер при сильном отдалении
        if tz < 9:
            return Image.new("RGBA", (256, 256), (0, 0, 0, 0))

        min_x, min_y, max_x, max_y = self.get_tile_bounds(tx, ty, tz)
        res = 256
        px_size = (max_x - min_x) / res

        current_time = time.time()
        if pollution_state.cached_params is not None and (current_time - pollution_state.params_time < 2):
            params = pollution_state.cached_params
        else:
            params_list = await self.params_service.get_simulation_params()
            params = params_list[-1] if params_list else None
            pollution_state.cached_params = params
            pollution_state.params_time = current_time

        u = float(params.wind_speed) if params else 3.0
        wind_dir = float(params.wind_direction) if params else 180.0

        # Угол для Numba
        wind_math_rad = np.radians((270 - wind_dir) % 360)

        src_xs, src_ys, src_rates, src_heights = await self._get_prepared_sources()

        BUFFER = 150000
        mask = (src_xs > min_x - BUFFER) & (src_xs < max_x + BUFFER) & \
               (src_ys > min_y - BUFFER) & (src_ys < max_y + BUFFER)

        PDK = 0.008

        # Оптимизация: пустой тайл возвращаем зелёным (без вызова Numba)
        if not np.any(mask):
            return Image.new("RGBA", (256, 256), (46, 204, 113, 110))

        s_xs = src_xs[mask]
        s_ys = src_ys[mask]
        s_rates = src_rates[mask]
        s_heights = src_heights[mask]

        px_half = px_size / 2.0
        xs = np.linspace(min_x + px_half, max_x - px_half, res, dtype=np.float32)
        ys = np.linspace(max_y - px_half, min_y + px_half, res, dtype=np.float32)
        xv, yv = np.meshgrid(xs, ys)

        # Запускаем Numba (передаем только угол, тригонометрия внутри)
        conc_flat = calculate_concentration_chunk(
            xv.ravel(), yv.ravel(),
            s_xs, s_ys, s_rates, s_heights,
            u, wind_math_rad
        )

        grid_conc = conc_flat.reshape((res, res))

        # Красим через нашу новую функцию
        img_data = colorize_tile_numpy(grid_conc, pdk=PDK, alpha_bg=110)

        return Image.fromarray(img_data, 'RGBA')