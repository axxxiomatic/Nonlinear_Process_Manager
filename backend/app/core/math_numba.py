import numpy as np
from numba import njit, prange

E_WGS84 = 0.0818191908426215
R_EARTH = 6378137.0


@njit(fastmath=True)
def lat_lon_to_meters_yandex_single(lat, lon):
    if lat > 89.9: lat = 89.9
    if lat < -89.9: lat = -89.9
    phi = lat * (np.pi / 180.0)
    lam = lon * (np.pi / 180.0)
    x = R_EARTH * lam
    sin_phi = np.sin(phi)
    con = E_WGS84 * sin_phi
    com = (1.0 - con) / (1.0 + con)
    factor = np.power(com, 0.5 * E_WGS84)
    tan_val = np.tan(0.5 * (np.pi * 0.5 - phi))
    ts = tan_val / factor
    y = -R_EARTH * np.log(ts)
    return x, y


@njit(fastmath=True, parallel=True)
def calculate_concentration_chunk(
        x_grid_flat, y_grid_flat, src_xs, src_ys, src_rates, src_heights,
        u, base_wind_rad
):
    n_pixels = len(x_grid_flat)
    n_sources = len(src_xs)

    # Инициализация нулями
    result = np.zeros(n_pixels, dtype=np.float32)

    for i in prange(n_pixels):
        px = x_grid_flat[i]
        py = y_grid_flat[i]
        val = 0.0

        for k in range(n_sources):
            dx = px - src_xs[k]
            dy = py - src_ys[k]

            # Дистанция от источника
            dist = np.sqrt(dx * dx + dy * dy)
            if dist < 1.0:
                dist = 1.0

            # 1. ЗАКРУЧИВАНИЕ (Swirl): Угол ветра слегка меняется с расстоянием (имитация рельефа/Кориолиса)
            swirl_angle = dist * 0.000015 * (15.0 / max(u, 1.0))
            current_angle = base_wind_rad + swirl_angle

            cos_a = np.cos(current_angle)
            sin_a = np.sin(current_angle)

            # Проекция на ветер
            downwind = dx * cos_a + dy * sin_a
            crosswind = -dx * sin_a + dy * cos_a

            # Разрешаем небольшое распространение "против" ветра (диффузия)
            if downwind < -200.0:
                continue

            # 2. ИСКРИВЛЕНИЕ (Meandering): Облако виляет как змейка
            wiggle = np.sin(dist / 1500.0) * (dist * 0.08)
            crosswind += wiggle

            # 3. РАСШИРЕНИЕ: Облако становится шире быстрее, чем в классической модели
            # Базовые 40 метров, чтобы не было точек-пикселей при сильном зуме
            sigma_y = 0.18 * abs(downwind) / np.sqrt(1.0 + 0.0001 * abs(downwind)) + 40.0
            sigma_z = 0.10 * abs(downwind) / np.sqrt(1.0 + 0.0015 * abs(downwind)) + 10.0

            Q = src_rates[k] * 1000.0

            # Главный шлейф
            peak = Q / (6.283185 * max(u, 0.5) * sigma_y * sigma_z)
            exp_y = np.exp(-0.5 * (crosswind / sigma_y) ** 2)
            exp_z = np.exp(-0.5 * (src_heights[k] / sigma_z) ** 2)

            # 4. РАДИАЛЬНОЕ ОБЛАКО: Пятно газа прямо над заводом (расходится во все стороны)
            puff = (Q / 800.0) * np.exp(-0.5 * (dist / 120.0) ** 2)

            val += peak * exp_y * exp_z + puff

        result[i] = val

    return result