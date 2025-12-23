window.appConfig = {
    YMAPS_API_KEY: '{{ config.YMAPS_API_KEY }}',
    YMAPS_LANG: '{{ config.YMAPS_LANG }}',
    YWEATHER_API_KEY: '{{ config.YWEATHER_API_KEY }}',
};

const CONFIG = {
    MAX_DISTANCE: 10000, // Максимальное расстояние для расчета (м)
    MIN_DISTANCE: 1,     // Минимальное расстояние для расчета (м)
    PDK_H2S: 0.008,      // ПДК сероводорода (мг/м3)
    MAX_ZOOM: 18
};

// Коэффициенты Пасквилла-Гиффорда для разных классов устойчивости атмосферы
const STABILITY_PARAMS = {
    'A': { a: 0.22, b: 0.0001, c: -0.5, d: 0.2 },  // Очень неустойчивая
    'B': { a: 0.16, b: 0.0001, c: -0.5, d: 0.12 }, // Неустойчивая
    'C': { a: 0.11, b: 0.0001, c: -0.5, d: 0.08 }, // Слабо неустойчивая
    'D': { a: 0.08, b: 0.0001, c: -0.5, d: 0.06 }, // Нейтральная
    'E': { a: 0.06, b: 0.0001, c: -0.5, d: 0.03 }, // Слабо устойчивая
    'F': { a: 0.04, b: 0.0001, c: -0.5, d: 0.016 } // Устойчивая
};

// Зависимость радиуса влияния точек тепловой карты от уровня зума
const ZOOM_RADIUS_MAP = {
    0: 3,
    1: 2,
    2: 2,
    3: 2,
    4: 3,
    5: 4,
    6: 8,
    7: 12,
    8: 18,
    9: 24,
    10: 32,
    11: 50,
    12: 80,
    13: 100,
    14: 130,
    15: 160,
    16: 210,
    17: 260,
    18: 320,
    19: 400,
    20: 490,
    21: 600
};

// Глобальные переменные
let map = null;
let heatmapInstance = null;
let sourcePlacemarks = [];
let windVectorPlacemarks = [];
let heatmapModuleLoaded = false;

const state = {
    sources: [],
    isPlacingSource: false,
    sourceToDelete: null,
    isCalculating: false,
    heatmapRadius: 100,             // Так как значение зума по умолчанию - 13
    heatmapOpacity: 0.8,
    heatmapDissipating: true,
    heatmapVisible: true,
    heatmapData: [],
    gridStep: 70,                   // Постоянный шаг сетки 70 пикселей
    visualizationThreshold: 0.0001, // 0.01% от ПДК
    maxTotalPoints: 50000,
    windSpeed: 2.4,
    windDirection: 180,
    windEffectStrength: 0.8,
    dispersionMode: 'anisotropic',
    stabilityClass: 'D',
    showWindVectors: true
};

// Глобальные функции
window.requestDeleteSource = function(sourceId) {
    state.sourceToDelete = state.sources.find(s => s.id === sourceId);
    if (state.sourceToDelete) {
        document.getElementById('confirm-modal').style.display = 'block';
    }
};

window.updateHeatmapData = async function() {
    if (!map || state.isCalculating) {
        updateDebugStatus("Карта не готова или идет расчет");
        return;
    }

    // Проверка инициализации тепловой карты
    if (!heatmapInstance) {
        updateDebugStatus("Тепловая карта не инициализирована, идёт создание...");
        await initHeatmap();
        if (!heatmapInstance) {
            updateDebugStatus("Не удалось создать тепловую карту");
            return;
        }
    }

    state.isCalculating = true;
    updateDebugStatus("Расчет рассеивания загрязнений...");
    console.log("Расчет рассеивания загрязнений...");

    document.getElementById('loading-indicator').style.display = 'block';
    document.getElementById('progress-text').textContent = '0%';
    document.getElementById('progress-fill').style.width = '0%';

    if (state.sources.length === 0) {
        if (heatmapInstance && heatmapInstance.setData) {
            heatmapInstance.setData([]);
        }

        document.getElementById('loading-indicator').style.display = 'none';
        state.isCalculating = false;
        updateCalculationInfo();
        updateDebugStatus("Нет источников - тепловая карта очищена");
        console.log("Нет источников - тепловая карта очищена");
        return;
    }

    updateWindVectors();

    const allPoints = [];
    let totalGeneratedPoints = 0;
    let maxConcentration = 0;

    for (let i = 0; i < state.sources.length; i++) {
        const source = state.sources[i];
        updateDebugStatus(`Расчет для источника ${i+1}/${state.sources.length}...`);

        const sourcePoints = generateDispersionPointsForSource(source);
        sourcePoints.forEach(point => {
            const existingPoint = allPoints.find(p =>
                calculateDistance(p.lat, p.lng, point.lat, point.lng) < state.gridStep / 2
            );

            if (existingPoint) {
                existingPoint.concentration += point.concentration;
                existingPoint.pdkPercent = (existingPoint.concentration / CONFIG.PDK_H2S) * 100;
                existingPoint.weight = Math.min(existingPoint.pdkPercent / 100, 1.0);
            } else {
                allPoints.push(point);
            }

            if (point.concentration > maxConcentration) {
                maxConcentration = point.concentration;
            }
        });

        totalGeneratedPoints += sourcePoints.length;

        const progress = Math.floor((i + 1) / state.sources.length * 100);
        document.getElementById('progress-text').textContent = progress + '%';
        document.getElementById('progress-fill').style.width = progress + '%';

        if (allPoints.length > state.maxTotalPoints) {
            updateDebugStatus("Достигнут лимит точек, расчёт остановлен");
            break;
        }
    }

    console.log(`Сгенерировано ${totalGeneratedPoints} исходных точек, объединено в ${allPoints.length} точек`);
    updateDebugStatus(`Точек: ${allPoints.length}, Макс. конц.: ${maxConcentration.toExponential(3)} мг/м³`);

    const heatmapPoints = [];
    let pointsAboveThreshold = 0;

    allPoints.forEach(point => {
        if (point.pdkPercent >= state.visualizationThreshold * 100) {
            pointsAboveThreshold++;
            // Формат: [lat, lng, weight]
            heatmapPoints.push([point.lat, point.lng, point.weight]);
        }
    });

    console.log(`Точек выше порога: ${pointsAboveThreshold}/${allPoints.length}`);
    updateDebugStatus(`Визуализируется: ${pointsAboveThreshold} точек`);

    try {
        heatmapInstance.setData(heatmapPoints);
        updateDebugStatus("Тепловая карта обновлена");
        console.log("Данные тепловой карты успешно обновлены");
        updateCalculationInfo(maxConcentration);
    } catch (error) {
        console.error("Ошибка при обновлении данных тепловой карты:", error);
        updateDebugStatus("Ошибка обновления: " + error.message);
        showErrorMessage("Ошибка при обновлении тепловой карты: " + error.message);
    }

    setTimeout(() => {
        document.getElementById('loading-indicator').style.display = 'none';
        state.isCalculating = false;
        updateDebugStatus("Расчет завершен");
        console.log("Расчет рассеивания завершен");
    }, 500);
};

window.toggleDebugInfo = function() {
    const debugInfo = document.getElementById('debug-info');
    debugInfo.style.display = debugInfo.style.display === 'block' ? 'none' : 'block';
};

// Вспомогательные функции
function updateDebugStatus(status) {
    const debugStatus = document.getElementById('debug-status');
    if (debugStatus) {
        debugStatus.textContent = status;
    }
    console.log("Debug: " + status);
}

function updateZoomDisplay() {
    if (!map) return;

    const zoom = map.getZoom();
    const radiusValue = document.getElementById('radius-value');

    // Обновление радиуса тепловой карты в зависимости от зума
    const newRadius = ZOOM_RADIUS_MAP[zoom] || 100;
    if (state.heatmapRadius !== newRadius) {
        state.heatmapRadius = newRadius;
        if (heatmapInstance && heatmapInstance.options && heatmapInstance.options.set) {
            heatmapInstance.options.set('radius', state.heatmapRadius);
            console.log(`Радиус тепловой карты обновлен: ${state.heatmapRadius}px (зум: ${zoom})`);
        }
    }

    if (radiusValue) {
        radiusValue.textContent = `Радиус: ${state.heatmapRadius} пикселей`;
    }
}

function updateWindVectors() {
    if (!map || !state.showWindVectors) {
        if (windVectorPlacemarks.length > 0) {
            windVectorPlacemarks.forEach(placemark => {
                map.geoObjects.remove(placemark);
            });
            windVectorPlacemarks = [];
        }
        return;
    }

    if (windVectorPlacemarks.length > 0) {
        windVectorPlacemarks.forEach(placemark => {
            map.geoObjects.remove(placemark);
        });
        windVectorPlacemarks = [];
    }

    // Добавление векторов ветра для каждого источника
    state.sources.forEach(source => {
        const windDirectionRad = (state.windDirection * Math.PI) / 180;
        const vectorLength = 1000; // метров
        const dx = vectorLength * Math.sin(windDirectionRad);
        const dy = vectorLength * Math.cos(windDirectionRad);

        const dLat = dy / 111000; // 1 градус широты ~ 111 км
        const dLng = dx / (111000 * Math.cos(source.lat * Math.PI / 180));
        const endLat = source.lat + dLat;
        const endLng = source.lng + dLng;

        const windVector = new ymaps.Polyline([
            [source.lat, source.lng],
            [endLat, endLng]
        ], {
            balloonContent: `Ветер: ${state.windSpeed} м/с, направление: ${state.windDirection}°`
        }, {
            strokeColor: '#3498db',
            strokeWidth: 2,
            strokeOpacity: 0.7,
            zIndex: 400
        });

        const arrowSize = 0.0005;
        const arrowAngle = 30 * Math.PI / 180;
        const arrowPoint1Lat = endLat - arrowSize * Math.cos(windDirectionRad - arrowAngle);
        const arrowPoint1Lng = endLng - arrowSize * Math.sin(windDirectionRad - arrowAngle);
        const arrowPoint2Lat = endLat - arrowSize * Math.cos(windDirectionRad + arrowAngle);
        const arrowPoint2Lng = endLng - arrowSize * Math.sin(windDirectionRad + arrowAngle);

        const windArrow = new ymaps.Polygon([
            [
                [endLat, endLng],
                [arrowPoint1Lat, arrowPoint1Lng],
                [arrowPoint2Lat, arrowPoint2Lng],
                [endLat, endLng]
            ]
        ], {
            balloonContent: `Направление ветра: ${state.windDirection}°`
        }, {
            fillColor: '#3498db',
            strokeColor: '#3498db',
            strokeWidth: 1,
            strokeOpacity: 0.7,
            fillOpacity: 0.7,
            zIndex: 401
        });

        map.geoObjects.add(windVector);
        map.geoObjects.add(windArrow);
        windVectorPlacemarks.push(windVector, windArrow);
    });
}

function updateWindDisplay() {
    const windDirectionArrow = document.getElementById('wind-direction-arrow');
    const windDirectionLabel = document.getElementById('wind-direction-label');

    if (windDirectionArrow) {
        windDirectionArrow.style.transform = `translateX(-50%) rotate(${state.windDirection}deg)`;
    }

    if (windDirectionLabel) {
        windDirectionLabel.textContent = `${state.windDirection}°`;
    }

    const windSpeedValue = document.getElementById('wind-speed-value');
    if (windSpeedValue) {
        windSpeedValue.textContent = `${state.windSpeed.toFixed(1)} м/с`;
    }

    const windDirectionValue = document.getElementById('wind-direction-value');
    if (windDirectionValue) {
        const directionName = getWindDirectionName(state.windDirection);
        windDirectionValue.textContent = `${state.windDirection}° (${directionName})`;
    }

    const windSpeedDisplay = document.getElementById('wind-speed-display');
    const windDirectionDisplay = document.getElementById('wind-direction-display');
    const stabilityClassDisplay = document.getElementById('stability-class-display');

    if (windSpeedDisplay) windSpeedDisplay.textContent = state.windSpeed.toFixed(1);
    if (windDirectionDisplay) windDirectionDisplay.textContent = getWindDirectionName(state.windDirection);
    if (stabilityClassDisplay) stabilityClassDisplay.textContent = state.stabilityClass;
}

function updateWindVisualization() {
    updateWindDisplay();

    if (state.sources.length > 0) {
        updateHeatmapData();
    }

    const windInfo = `Ветер: ${state.windSpeed.toFixed(1)} м/с, направление: ${state.windDirection}°\n` +
                     `Влияние ветра: ${Math.round(state.windEffectStrength * 100)}%\n` +
                     `Вытягивание шлейфа: ${(1.0 + (state.windSpeed * 0.3) * state.windEffectStrength).toFixed(2)}x`;

    updateDebugStatus(windInfo);
}

function getWindDirectionName(degrees) {
    const directions = [
        { name: 'Север', min: 337.5, max: 22.5 },
        { name: 'Северо-восток', min: 22.5, max: 67.5 },
        { name: 'Восток', min: 67.5, max: 112.5 },
        { name: 'Юго-восток', min: 112.5, max: 157.5 },
        { name: 'Юг', min: 157.5, max: 202.5 },
        { name: 'Юго-запад', min: 202.5, max: 247.5 },
        { name: 'Запад', min: 247.5, max: 292.5 },
        { name: 'Северо-запад', min: 292.5, max: 337.5 }
    ];

    const normalizedDegrees = degrees % 360;
    for (const direction of directions) {
        if (direction.min > direction.max) {
            // Для севера (охватывает 337.5-360 и 0-22.5)
            if (normalizedDegrees >= direction.min || normalizedDegrees <= direction.max) {
                return direction.name;
            }
        } else if (normalizedDegrees >= direction.min && normalizedDegrees <= direction.max) {
            return direction.name;
        }
    }
    return 'Не определено';
}

window.resetWindSettings = function() {
    state.windSpeed = 2.4;
    state.windDirection = 180;
    state.windEffectStrength = 0.8;
    state.dispersionMode = 'anisotropic';

    const windSpeed = document.getElementById('wind-speed');
    const windDirection = document.getElementById('wind-direction');

    if (windSpeed) windSpeed.value = state.windSpeed;
    if (windDirection) windDirection.value = state.windDirection;

    updateWindDisplay();
    updateDebugStatus("Настройки ветра сброшены");

    if (state.sources.length > 0) {
        updateHeatmapData();
    }
};

function calculateGaussianConcentration(source, distance, angle) {
    if (distance < CONFIG.MIN_DISTANCE || distance > CONFIG.MAX_DISTANCE) {
        return 0;
    }

    // Параметры для текущего класса устойчивости
    const params = STABILITY_PARAMS[state.stabilityClass] || STABILITY_PARAMS['D'];

    // Базовые дисперсии (sigma_y и sigma_z) по модели Пасквилла-Гиффорда
    const baseSigmaY = params.a * distance * Math.pow(1 + params.b * distance, params.c);
    const baseSigmaZ = params.d * distance;

    if (baseSigmaY <= 0 || baseSigmaZ <= 0) return 0;

    let effectiveSigmaY = baseSigmaY;
    let effectiveSigmaZ = baseSigmaZ;
    const windDirectionRad = (state.windDirection * Math.PI) / 180;
    let angleDiff = angle - windDirectionRad;

    // Нормализация разницы углов в диапазон [-pi, pi]
    angleDiff = ((angleDiff + Math.PI) % (2 * Math.PI)) - Math.PI;

    // Коэффициент вытягивания по ветру (линейно зависит от скорости ветра)
    const windStretchFactor = 1.0 + (state.windSpeed * 0.3) * state.windEffectStrength;

    // Коэффициент сжатия поперек ветра
    const crossWindCompressionFactor = 1.0 / (1.0 + (state.windSpeed * 0.2) * state.windEffectStrength);

    if (state.dispersionMode === 'anisotropic' || state.dispersionMode === 'debug') {
        // Влияние угла относительно направления ветра
        const cosAngleDiff = Math.cos(angleDiff);
        const absAngleDiff = Math.abs(angleDiff);

        if (state.dispersionMode === 'anisotropic') {
            // Для точек по направлению ветра - вытягивание
            // Для точек поперек ветра - сжатие
            const alongWindFactor = windStretchFactor;

            // Вращение поля рассеивания
            // Чем больше скорость ветра, тем сильнее поворот "шлейфа"
            const rotationStrength = Math.min(state.windSpeed * 0.05 * state.windEffectStrength, 0.8);
            const rotatedAngle = angle - rotationStrength * Math.sin(angleDiff);

            // Пересчет sigma_y с учетом вращения и вытягивания по ветру
            // Сильное вытягивание вдоль направления ветра, сильное сжатие поперек
            effectiveSigmaY = baseSigmaY * Math.sqrt(
                Math.pow(alongWindFactor * Math.cos(rotatedAngle - windDirectionRad), 2) +
                Math.pow(crossWindCompressionFactor * 0.3 * Math.sin(rotatedAngle - windDirectionRad), 2)
            );

            // sigma_z также может зависеть от ветра
            effectiveSigmaZ = baseSigmaZ * (1.0 + state.windSpeed * 0.02 * state.windEffectStrength);
        }
    }

    // Гауссова модель рассеивания
    const Q = source.emissionRate * 1000;     // Перевод г/с в мг/с
    const u = Math.max(state.windSpeed, 0.1); // Скорость ветра (м/с), минимум 0.1

    // Расстояние вдоль направления ветра (x) и поперек (y)
    const x = distance * Math.cos(angleDiff); // По ветру (+), против ветра (-)
    const y = distance * Math.sin(angleDiff); // Поперек ветра

    // Расчет концентрации с учетом ветра
    const concentration = (Q / (2 * Math.PI * u * effectiveSigmaY * effectiveSigmaZ)) *
                           Math.exp(-0.5 * Math.pow(y / effectiveSigmaY, 2)) *
                           Math.exp(-0.5 * Math.pow(source.height / effectiveSigmaZ, 2)) *
                           Math.exp(-0.1 * Math.abs(x) / (effectiveSigmaY * u)); // Дополнительное затухание против ветра

    // Дополнительный множитель для направления по ветру
    const windDirectionFactor = x > 0 ?
        1.0 + (windStretchFactor - 1.0) * (1.0 - Math.exp(-Math.abs(x) / 500)) : // По ветру - усиление
        0.1 + 0.2 * Math.exp(-Math.abs(x) / 200);                                // Против ветра - ослабление

    return Math.max(concentration * windDirectionFactor, 0);
}

function updateSourceMarkers() {
    if (!map) return;

    if (sourcePlacemarks.length > 0) {
        sourcePlacemarks.forEach(placemark => {
            map.geoObjects.remove(placemark);
        });
        sourcePlacemarks = [];
    }

    state.sources.forEach(source => {
        const placemark = new ymaps.Placemark(
            [source.lat, source.lng],
            {
                balloonContent: `<b>${source.name}</b><br>Высота: ${source.height} м<br>Выброс: ${source.emissionRate} г/с`
            },
            {
                preset: 'islands#redIcon',
                iconColor: '#e74c3c',
                draggable: false,
                zIndex: 300
            }
        );

        map.geoObjects.add(placemark);
        sourcePlacemarks.push(placemark);
    });

    console.log(`Добавлено ${sourcePlacemarks.length} меток на карту`);
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Радиус Земли в метрах
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                       Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                       Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function generateDispersionPointsForSource(source) {
    const points = [];
    const centerLat = source.lat;
    const centerLng = source.lng;
    const maxTestRadius = 5000;
    let maxRadius = 0;

    const directions = state.dispersionMode === 'isotropic' ? 16 : 8;
    for (let dir = 0; dir < directions; dir++) {
        const angle = (dir * 2 * Math.PI) / directions;
        let testDistance = state.gridStep;

        while (testDistance <= maxTestRadius) {
            const concentration = calculateGaussianConcentration(source, testDistance, angle);
            const pdkPercent = (concentration / CONFIG.PDK_H2S) * 100;

            if (pdkPercent >= state.visualizationThreshold * 100) {
                if (testDistance > maxRadius) {
                    maxRadius = testDistance;
                }
                testDistance += state.gridStep;
            } else {
                break;
            }
        }
    }

    if (maxRadius === 0) {
        maxRadius = state.gridStep * 2;
    }

    // Сетка точек с шагом 70 метров
    const gridSize = Math.ceil(maxRadius / state.gridStep);

    for (let i = -gridSize; i <= gridSize; i++) {
        for (let j = -gridSize; j <= gridSize; j++) {
            const dx = i * state.gridStep;
            const dy = j * state.gridStep;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > maxRadius || distance === 0) continue;

            const dLat = dy / 111000;
            const dLng = dx / (111000 * Math.cos(centerLat * Math.PI / 180));
            const pointLat = centerLat + dLat;
            const pointLng = centerLng + dLng;
            const angle = Math.atan2(dy, dx);
            const concentration = calculateGaussianConcentration(source, distance, angle);
            const pdkPercent = (concentration / CONFIG.PDK_H2S) * 100;

            if (pdkPercent >= state.visualizationThreshold * 100) {
                const normalizedValue = Math.min(pdkPercent / 100, 1.0);
                const weight = Math.max(normalizedValue, 0.01);

                points.push({
                    lat: pointLat,
                    lng: pointLng,
                    weight: weight,
                    concentration: concentration,
                    pdkPercent: pdkPercent,
                    angle: angle,
                    distance: distance
                });
            }
        }
    }

    const centerConcentration = calculateGaussianConcentration(source, 1, 0);
    const centerPdkPercent = (centerConcentration / CONFIG.PDK_H2S) * 100;
    if (centerPdkPercent >= state.visualizationThreshold * 100) {
        points.push({
            lat: centerLat,
            lng: centerLng,
            weight: Math.min(centerPdkPercent / 100, 1.0),
            concentration: centerConcentration,
            pdkPercent: centerPdkPercent,
            angle: 0,
            distance: 0
        });
    }

    return points;
}

function loadHeatmapModule() {
    return new Promise((resolve, reject) => {
        if (typeof ymaps.modules === 'undefined') {
            reject(new Error("ymaps.modules не определен"));
            return;
        }

        updateDebugStatus("Загрузка модуля тепловых карт...");

        ymaps.modules.require(['Heatmap'], function (Heatmap) {
            updateDebugStatus("Модуль тепловых карт загружен");
            heatmapModuleLoaded = true;
            resolve(Heatmap);
        }, function (err) {
            updateDebugStatus("Ошибка загрузки тепловых карт");
            reject(new Error("Не удалось загрузить модуль тепловых карт: " + err));
        });
    });
}

async function initHeatmap() {
    if (!map) {
        console.error("Карта не инициализирована для создания тепловой карты");
        updateDebugStatus("Карта не инициализирована");
        return;
    }

    try {
        updateDebugStatus("Инициализация тепловой карты...");

        const Heatmap = await loadHeatmapModule();
        const currentZoom = map.getZoom();
        const initialRadius = ZOOM_RADIUS_MAP[currentZoom] || 100;
        state.heatmapRadius = initialRadius;

        heatmapInstance = new Heatmap([], {
            radius: state.heatmapRadius,
            dissipating: true,
            opacity: state.heatmapOpacity,
            intensityOfMidpoint: 0.2,
            gradient: {
                0.1: 'rgba(0, 255, 0, 0.3)',     // < 20% ПДК
                0.2: 'rgba(127, 255, 0, 0.5)',   // 20-40% ПДК
                0.4: 'rgba(255, 255, 0, 0.7)',   // 40-60% ПДК
                0.6: 'rgba(255, 165, 0, 0.8)',   // 60-80% ПДК
                0.8: 'rgba(255, 0, 0, 0.9)',     // 80-100% ПДК
                1.0: 'rgba(255, 0, 0, 1.0)'      // > 100% ПДК
            }
        });

        heatmapInstance.setMap(map);
            updateDebugStatus("Тепловая карта создана");
            console.log("Тепловая Яндекс.Карта инициализирована");
            updateHeatmapData();

    } catch (error) {
        console.error("Ошибка при инициализации тепловой карты:", error);
        updateDebugStatus("Ошибка: " + error.message);
        showErrorMessage("Ошибка при создании тепловой карты: " + error.message);
    }
}

function initMap() {
    try {
        document.getElementById('loading-indicator').style.display = 'block';
        document.getElementById('progress-text').textContent = 'Загрузка карты...';
        document.getElementById('progress-fill').style.width = '30%';
        updateDebugStatus("Инициализация карты...");

        map = new ymaps.Map('map', {
            center: [55.7558, 37.6173],
            zoom: 13,
            controls: ['zoomControl', 'typeSelector', 'fullscreenControl']
        });

        map.events.add('boundschange', function(e) {
            updateZoomDisplay();
        });

        document.getElementById('progress-fill').style.width = '100%';
        document.getElementById('progress-text').textContent = 'Карта загружена';
        updateDebugStatus("Карта загружена");

        setTimeout(() => {
            document.getElementById('loading-indicator').style.display = 'none';
        }, 500);

        console.log("Яндекс.Карта инициализирована");
        setTimeout(updateZoomDisplay, 100);

        init();
        setTimeout(() => {
            initHeatmap();
        }, 1000);

    } catch (error) {
        console.error("Ошибка при инициализации карты:", error);
        document.getElementById('loading-indicator').style.display = 'none';
        document.getElementById('error-message').style.display = 'block';
        updateDebugStatus("Ошибка: " + error.message);
        showErrorMessage("Ошибка загрузки карты: " + error.message);
    }
}

function updateCalculationInfo(maxConcentration = 0) {
    const calculationResults = document.getElementById('calculation-results');
    if (!calculationResults) return;

    if (state.sources.length === 0) {
        calculationResults.innerHTML = '<p>Добавьте источники для расчета</p>';
        return;
    }

    let totalEmission = 0;
    let maxSourceConcentration = 0;

    state.sources.forEach(source => {
        totalEmission += source.emissionRate;
        const concentration = calculateGaussianConcentration(source, 1, 0);
        if (concentration > maxSourceConcentration) {
            maxSourceConcentration = concentration;
        }
    });

    const avgEmission = totalEmission / state.sources.length;
    const maxPdkPercent = ((maxConcentration || maxSourceConcentration) / CONFIG.PDK_H2S) * 100;

    let dispersionModeName = '';
    switch(state.dispersionMode) {
        case 'anisotropic': dispersionModeName = 'Анизотропный (ветер)'; break;
        default: dispersionModeName = state.dispersionMode;
    }

    let html = `
        <div class="calculation-status" style="background: #d4edda; border-color: #c3e6cb;">
            Гауссова модель рассеивания активна
        </div>
        <div style="margin-top: 10px;">
            <p><strong>Параметры расчета:</strong></p>
            <p>Класс устойчивости: ${state.stabilityClass}</p>
            <p>Режим рассеивания: ${dispersionModeName}</p>
            <p>Ветер: ${state.windSpeed.toFixed(1)} м/с, направление: ${state.windDirection}° (${getWindDirectionName(state.windDirection)})</p>
            <p>Влияние ветра: ${Math.round(state.windEffectStrength * 100)}%</p>
            <p>Шаг сетки: ${state.gridStep} м (постоянный)</p>
            <p>Порог визуализации: ${(state.visualizationThreshold * 100).toFixed(4)}% ПДК (постоянный)</p>
            <p>Радиус влияния: ${state.heatmapRadius}px (зависит от зума)</p>
            <p>Текущий масштаб: ${map ? map.getZoom() : 'N/A'}</p>
            <hr>
            <p><strong>Результаты:</strong></p>
            <p>Количество источников: ${state.sources.length}</p>
            <p>Суммарный выброс: ${totalEmission.toFixed(2)} г/с</p>
            <p>Средний выброс: ${avgEmission.toFixed(2)} г/с</p>
            <p>Макс. концентрация: ${(maxConcentration || maxSourceConcentration).toExponential(3)} мг/м³</p>
            <p>Макс. % ПДК: ${maxPdkPercent.toFixed(4)}%</p>
    `;

    if (maxPdkPercent > 100) {
        html += `<p style="color: red; font-weight: bold;">Превышение ПДК в ${(maxPdkPercent/100).toFixed(2)} раз!</p>`;
    } else if (maxPdkPercent > 80) {
        html += `<p style="color: orange;">Концентрация близка к ПДК</p>`;
    } else if (maxPdkPercent > 0) {
        html += `<p style="color: green;">Концентрация в допустимых пределах</p>`;
    }

    html += `<p><small><i>Модель: гауссово рассеивание с коэффициентами Пасквилла-Гиффорда и учетом ветра</i></small></p>`;
    html += `</div>`;
    calculationResults.innerHTML = html;
}

function showErrorMessage(message) {
    console.error("Сообщение об ошибке:", message);
    const errorMessage = document.getElementById('error-message');
    if (errorMessage) {
        errorMessage.innerHTML = `
            <h3 style="color: red; margin-top: 0;">Ошибка</h3>
            <p>${message}</p>
            <button onclick="location.reload()" style="padding: 5px 15px; margin-top: 10px;">Перезагрузить</button>
        `;
        errorMessage.style.display = 'block';
    }
    updateDebugStatus("Ошибка: " + message);
}

async function apiCall(url, options = {}) {
    try {
        const response = await fetch(url, {
            headers: { 'Content-Type': 'application/json', ...options.headers },
            ...options
        });
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        return null;
    }
}

async function loadSourcesFromDB() {
    const sources = await apiCall('/api/sources');
    if (sources) {
        state.sources = sources.map(source => ({
            ...source,
            id: source.id,
            lat: source.latitude,
            lng: source.longitude,
            emissionRate: source.emission_rate,
            height: source.height
        }));
        updateSourcesList();
        updateSourceMarkers();

        if (state.sources.length > 0) {
            setTimeout(() => {
                updateHeatmapData();
            }, 1500);
        }
    }
}

async function addSourceToDB(sourceData) {
    return await apiCall('/api/sources', {
        method: 'POST',
        body: JSON.stringify(sourceData)
    });
}

async function deleteSourceFromDB(sourceId) {
    return await apiCall(`/api/sources/${sourceId}`, { method: 'DELETE' });
}

function updateSourcesList() {
    const sourcesList = document.getElementById('sources-list');
    if (!sourcesList) return;

    sourcesList.innerHTML = '';
    state.sources.forEach(source => {
        const sourceEl = document.createElement('div');
        sourceEl.className = 'enterprise-source-item';
        sourceEl.innerHTML = `
            <div>${source.name}<br><small>${source.emissionRate} г/с</small></div>
            <button class="btn-delete" onclick="requestDeleteSource(${source.id})">Удалить</button>`;
        sourcesList.appendChild(sourceEl);
    });
}

function init() {
    setupEventListeners();
    loadSourcesFromDB().then(() => {
        console.log("Источники выбросов загружены");
        updateDebugStatus("Источники выбросов загружены");
    });
}

function setupEventListeners() {
    const heatmapToggle = document.getElementById('heatmap-toggle');
    if (heatmapToggle) {
        heatmapToggle.addEventListener('change', function() {
            state.heatmapVisible = this.checked;
            if (heatmapInstance && heatmapInstance.options && heatmapInstance.options.set) {
                heatmapInstance.options.set('visible', state.heatmapVisible);
                updateDebugStatus(`Видимость: ${state.heatmapVisible}`);
            }
            if (state.heatmapVisible && state.sources.length > 0) {
                updateHeatmapData();
            }
        });
    }

    const windSpeed = document.getElementById('wind-speed');
    if (windSpeed) {
        windSpeed.addEventListener('input', function() {
            state.windSpeed = parseFloat(this.value);
            updateWindVisualization();
        });
    }

    const windDirection = document.getElementById('wind-direction');
    if (windDirection) {
        windDirection.addEventListener('input', function() {
            state.windDirection = parseInt(this.value);
            updateWindVisualization();
        });
    }

    const showWindVectors = document.getElementById('show-wind-vectors');
    if (showWindVectors) {
        showWindVectors.addEventListener('change', function() {
            state.showWindVectors = this.checked;
            updateDebugStatus(`Векторы ветра: ${state.showWindVectors ? 'вкл' : 'выкл'}`);
            if (state.sources.length > 0) {
                updateHeatmapData();
            }
        });
    }

    const resetWindBtn = document.getElementById('reset-wind-btn');
    if (resetWindBtn) {
        resetWindBtn.addEventListener('click', resetWindSettings);
    }

    const addSourceBtn = document.getElementById('add-source-btn');
    if (addSourceBtn) {
        addSourceBtn.addEventListener('click', enableSourcePlacement);
    }

    const updateHeatmapBtn = document.getElementById('update-heatmap-btn');
    if (updateHeatmapBtn) {
        updateHeatmapBtn.addEventListener('click', updateHeatmapData);
    }

    const toggleDebugBtn = document.getElementById('toggle-debug-btn');
    if (toggleDebugBtn) {
        toggleDebugBtn.addEventListener('click', toggleDebugInfo);
    }

    const testWindEffectBtn = document.getElementById('test-wind-effect');
    if (testWindEffectBtn) {
        testWindEffectBtn.addEventListener('click', function() {
            const originalWindSpeed = state.windSpeed;
            const originalWindDirection = state.windDirection;

            let angle = 0;
            const interval = setInterval(() => {
                state.windDirection = angle % 360;
                updateWindVisualization();
                angle += 10;

                if (angle >= 360) {
                    clearInterval(interval);
                    state.windSpeed = originalWindSpeed;
                    state.windDirection = originalWindDirection;
                    setTimeout(() => updateWindVisualization(), 1000);
                }
            }, 100);
        });
    }

    document.querySelectorAll('.close').forEach(el => el.addEventListener('click',
        () => { document.getElementById('confirm-modal').style.display = 'none'; }));

    const cancelDelete = document.getElementById('cancel-delete');
    if (cancelDelete) {
        cancelDelete.addEventListener('click', () => {
            document.getElementById('confirm-modal').style.display = 'none';
        });
    }

    const confirmDelete = document.getElementById('confirm-delete');
    if (confirmDelete) {
        confirmDelete.addEventListener('click', confirmDeleteSource);
    }

    updateWindDisplay();
}

async function addSource(lat, lng, height, emissionRate) {
    const emission = parseFloat(emissionRate.toString().replace(',', '.'));

    const result = await addSourceToDB({
        name: `Источник ${Date.now() % 10000}`,
        type: 'point',
        latitude: lat,
        longitude: lng,
        height: height,
        emission_rate: emission
    });
    if (result && result.success) {
        await loadSourcesFromDB();
        updateHeatmapData();
    }
}

function enableSourcePlacement() {
    if (state.isPlacingSource) {
        disableSourcePlacement();
        return;
    }
    state.isPlacingSource = true;

    const addSourceBtn = document.getElementById('add-source-btn');
    if (addSourceBtn) {
        addSourceBtn.textContent = 'Отменить (клик на карте)';
        addSourceBtn.style.background = '#e74c3c';
    }
    map.events.add('click', handleMapClickForPlacement);

    const mapContainer = document.getElementById('map');
    if (mapContainer) {
        mapContainer.style.cursor = 'crosshair';
    }
}

function disableSourcePlacement() {
    state.isPlacingSource = false;
    const addSourceBtn = document.getElementById('add-source-btn');
    if (addSourceBtn) {
        addSourceBtn.textContent = 'Добавить источник';
        addSourceBtn.style.background = '';
    }
    map.events.remove('click', handleMapClickForPlacement);

    const mapContainer = document.getElementById('map');
    if (mapContainer) {
        mapContainer.style.cursor = '';
    }
}

async function handleMapClickForPlacement(e) {
    const coords = e.get('coords');
    const sourceHeight = document.getElementById('source-height');
    const emissionRate = document.getElementById('emission-rate');

    if (sourceHeight && emissionRate) {
        await addSource(
            coords[0],
            coords[1],
            parseInt(sourceHeight.value),
            emissionRate.value
        );
    }
    disableSourcePlacement();
}

async function confirmDeleteSource() {
    if (!state.sourceToDelete) return;

    const result = await deleteSourceFromDB(state.sourceToDelete.id);
    if (result && result.success) {
        await loadSourcesFromDB();
        updateHeatmapData();
    }

    const confirmModal = document.getElementById('confirm-modal');
    if (confirmModal) {
        confirmModal.style.display = 'none';
    }
    state.sourceToDelete = null;
}

ymaps.ready(initMap);
