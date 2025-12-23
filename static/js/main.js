window.appConfig = {
    YMAPS_API_KEY: '{{ config.YMAPS_API_KEY }}',
    YMAPS_LANG: '{{ config.YMAPS_LANG }}',
    YWEATHER_API_KEY: '{{ config.YWEATHER_API_KEY }}',
};

function qs(sel, root = document) { return root.querySelector(sel) }
function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)) }

let map, gridCollection = null;
const CENTER = [55.75, 37.62];
const GRID_STEP = 0.015;

// Объектная модель документа
const slider = document.createElement('input');
slider.type = 'range';
slider.min = 0; slider.max = 100; slider.value = 50; slider.className = 'slider';

document.addEventListener('DOMContentLoaded', () => {
    // Инициализация слайдеров проходит, только если они есть на странице
    const timelineWraps = qsa('.timeline-wrap');
    if (timelineWraps.length > 0) {
        timelineWraps.forEach(wrap => {
            const tl = wrap.querySelector('.timeline');
            if (tl) {
                tl.appendChild(slider.cloneNode(true));
            }
        });
        attachControls();
    }

    // Инициализация карты проходит, только если её контейнер существует
    const mapContainer = document.getElementById('map');
    if (mapContainer) {
        const path = window.location.pathname;
        if (path === '/' || path === '/enterprise') {
            initMonitoringMap();
        } else {
            initYandexMap();
        }
    }
});

function attachControls() {
    const timeLabels = qsa('.time-label');
    if (timeLabels.length > 0) {
        timeLabels.forEach(el => {
            if (el) el.textContent = 'Сейчас';
        });
    }

    qsa('.timeline-wrap').forEach((wrap, i) => {
        const sl = wrap.querySelector('.slider');
        const handle = wrap.querySelector('.handle');
        const timeLabel = wrap.querySelector('.time-label');

        // Проверка существования всех необходимых элементов
        if (!sl || !handle || !timeLabel) return;

        function updateHandle() {
            const pct = sl.value;
            handle.style.left = pct + '%';
            const base = new Date();
            base.setMinutes(Math.round((parseInt(pct) / 100) * 180) - 90 + base.getMinutes());
            const hh = base.getHours().toString().padStart(2, '0');
            const mm = base.getMinutes().toString().padStart(2, '0');
            timeLabel.textContent = `${hh}:${mm}`;
            if (typeof updateGridForValue === 'function') updateGridForValue(parseInt(sl.value));
        }
        sl.addEventListener('input', updateHandle);
        updateHandle();
    });

    // Обработчики элементов подключаются, только если они существуют
    const addSourceBtns = qsa('.add-source-btn');
    if (addSourceBtns.length > 0) {
        addSourceBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const heightInput = document.querySelector('.input-height');
                const qtyInput = document.querySelector('.input-qty');
                const h = heightInput ? parseFloat(heightInput.value) || 40 : 40;
                const q = qtyInput ? parseFloat(qtyInput.value) || 3.7 : 3.7;
                if (typeof addSourceMarker === 'function') {
                    addSourceMarker(CENTER, { height: h, qty: q });
                }
            });
        });
    }

    const removeSourceBtns = qsa('.remove-source-btn');
    if (removeSourceBtns.length > 0) {
        removeSourceBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                if (typeof removeAllSources === 'function') {
                    removeAllSources();
                }
            });
        });
    }
}

function initYandexMap() {
    if (typeof ymaps === 'undefined') return;

    ymaps.ready(() => {
        const mapContainer = document.getElementById('map');
        if (!mapContainer) return;

        map = new ymaps.Map('map', {
            center: [55.7558, 37.6176],
            zoom: 10,
            controls: ['zoomControl', 'fullscreenControl']
        });

        if (window.location.pathname === '/enterprise') {
            let clickHandler = (e) => {
                const coords = e.get('coords');
                const heightInput = document.querySelector('.input-height');
                const qtyInput = document.querySelector('.input-qty');
                const height = heightInput ? parseFloat(heightInput.value) || 40 : 40;
                const emission = qtyInput ? parseFloat(qtyInput.value) || 3.7 : 3.7;

                addEnterpriseSource(coords, height, emission);
            };
            map.events.add('click', clickHandler);
        }

        if (typeof loadSourcesForEnterprise === 'function') {
            loadSourcesForEnterprise();
        }
    });
}

function onYMapsReady() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer || typeof ymaps === 'undefined') return;

    map = new ymaps.Map('map', {
        center: CENTER,
        zoom: 10,
        controls: ['zoomControl', 'typeSelector', 'fullscreenControl', 'geolocationControl']
    }, { suppressMapOpenBlock: true });

    const placemark = new ymaps.Placemark(CENTER, { balloonContent: 'Пример источника' }, { preset: 'islands#redDotIcon' });
    map.geoObjects.add(placemark);
}

function drawGridAroundCenter(center, step = 0.02, radiusCount = 10) {
    if (!ymaps || !map || !gridCollection) return;
    gridCollection.removeAll();
    const [latC, lonC] = center;
    const half = step * radiusCount;
    const latStart = latC - half;
    const lonStart = lonC - half;
    const rows = Math.round((half * 2) / step);
    const cols = rows;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const lat1 = latStart + r * step;
            const lon1 = lonStart + c * step;
            const lat2 = lat1 + step;
            const lon2 = lon1 + step;
            const dist = Math.hypot((lat1 - latC), (lon1 - lonC));
            const intensity = Math.max(0, 1 - dist / (half * 1.2));
            const color = colorForIntensity(intensity, 50);
            const poly = new ymaps.Polygon([[
                [lat1, lon1],
                [lat1, lon2],
                [lat2, lon2],
                [lat2, lon1]
            ]], {}, {
                fillColor: color,
                strokeColor: 'rgba(0,0,0,0.02)',
                strokeWidth: 1,
                interactivityModel: 'default#opaque'
            });
            gridCollection.add(poly);
        }
    }
}

function updateGridForValue(value) {
    if (!gridCollection) return;
    const total = gridCollection.getLength();
    for (let i = 0; i < total; i++) {
        const g = gridCollection.get(i);
        const baseIntensity = 1 - (i / total);
        const newColor = colorForIntensity(baseIntensity, value);
        g.options.set('fillColor', newColor);
    }
}

function colorForIntensity(intensity, sliderVal) {
    const s = sliderVal / 100;
    const hue = Math.round(120 * (1 - (intensity * s)));
    const saturation = 80;
    const light = 50 - Math.round(20 * (1 - intensity));
    const alpha = 0.45 * (0.6 + 0.4 * intensity);
    const rgb = hslToRgb(hue / 360, saturation / 100, light / 100);
    return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

function hslToRgb(h, s, l) {
    let r, g, b;
    if (s == 0) r = g = b = l;
    else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// Специфичные для вкладки "Режим предприятия" функции
let enterpriseSources = [];

async function addEnterpriseSource(coords = null, height = 40, emission = 3.7) {
    if (!map || typeof ymaps === 'undefined') return;

    if (!coords) coords = map.getCenter(); // Если координаты не переданы, источник ставится по центру карты

    const placemark = new ymaps.Placemark(coords, {
        hintContent: 'Точечный источник выбросов',
        balloonContent: `
            <div style="padding:10px;font-family:Arial,sans-serif;">
                <strong>Источник выбросов</strong><br>
                Высота трубы: ${height} м<br>
                Выброс H₂S: ${emission.toFixed(2)} г/с<br><br>
                <button onclick="deleteEnterpriseSource(this)"
                        style="background:#e74c3c;color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;">
                    Удалить источник
                </button>
            </div>
        `
    }, {
        preset: 'islands#orangeFactoryIcon',
        draggable: true
    });

    let sourceId = null;

    // Сохранение источника в базе данных
    try {
        const resp = await fetch('/api/sources', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: `Источник ${enterpriseSources.length + 1}`,
                latitude: coords[0],
                longitude: coords[1],
                height: height,
                emission_rate: emission,
                source_type: 'point'
            })
        });
        const data = await resp.json();
        if (data.success && data.source_id) {
            sourceId = data.source_id;
            placemark.properties.set('sourceId', sourceId);
        }
    } catch (err) {
        console.error('Ошибка сохранения:', err);
    }

    map.geoObjects.add(placemark);
    enterpriseSources.push(placemark);

    appendSourceToList(placemark, height, emission, sourceId);

    // Обновление координат источника при перетаскивании метки
    placemark.events.add('dragend', async () => {
        const newCoords = placemark.geometry.getCoordinates();
        if (sourceId) {
            await fetch(`/api/sources/${sourceId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    latitude: newCoords[0],
                    longitude: newCoords[1]
                })
            });
        }
    });
}

window.deleteEnterpriseSource = async function (button) {
    const balloonContent = button.closest('.ymaps-balloon__content');
    if (!balloonContent) return;

    // Обнаружение метки источника на карте
    let placemarkToRemove = null;
    if (map) {
        map.geoObjects.each(obj => {
            if (obj.balloon && obj.balloon.isOpen() && obj.balloon.getContent().includes(button.textContent)) {
                placemarkToRemove = obj;
            }
        });
    }

    if (!placemarkToRemove && balloonContent.__parent) {
        placemarkToRemove = balloonContent.__parent;
    }

    if (placemarkToRemove) {
        const sourceId = placemarkToRemove.properties.get('sourceId');
        if (sourceId) {
            await fetch(`/api/sources/${sourceId}`, { method: 'DELETE' });
        }
        if (map) map.geoObjects.remove(placemarkToRemove);
        enterpriseSources = enterpriseSources.filter(p => p !== placemarkToRemove);

        const listItem = document.querySelector(`[data-source-id="${sourceId}"]`);
        if (listItem) listItem.remove();
    }
};

function appendSourceToList(placemark, height, emission, sourceId) {
    const legend = qs('.legend-items') || qs('.panel');
    if (!legend) return;

    const div = document.createElement('div');
    div.className = 'source-item';
    div.dataset.sourceId = sourceId || '';
    div.innerHTML = `
        <div>Источник ${enterpriseSources.length}, точечный</div>
        <small>Высота: ${height} м, выброс: ${emission} г/с</small>
        <button class="btn-delete" onclick="deleteEnterpriseSource(this.closest('.source-item').querySelector('button') || this)">Удалить</button>
    `;
    legend.appendChild(div);
}

// Специфичные для вкладки "Мониторинг" функции
const CONFIG = {
    MAX_DISTANCE: 10000,
    MIN_DISTANCE: 10,
    PDK_H2S: 0.008,
    POLYGON_DETAIL: 4000,
    METERS_IN_DEGREE_LAT: 111132.954
};

const PASQUILL_COEFFS = {
    'A': { Iy: -1.104, Jy: 0.9878, Ky: -0.0076, Iz: 4.679, Jz: -1.7172, Kz: 0.2770 },
    'B': { Iy: -1.634, Jy: 1.0350, Ky: -0.0096, Iz: -1.999, Jz: 0.8752, Kz: 0.0136 },
    'C': { Iy: -2.054, Jy: 1.0231, Ky: -0.0076, Iz: -2.341, Jz: 0.9477, Kz: -0.0020 },
    'D': { Iy: -2.555, Jy: 1.0423, Ky: -0.0087, Iz: -3.186, Jz: 1.1737, Kz: -0.0316 },
    'E': { Iy: -2.754, Jy: 1.0106, Ky: -0.0064, Iz: -3.783, Jz: 1.3010, Kz: -0.0450 },
    'F': { Iy: -3.143, Jy: 1.0148, Ky: -0.0070, Iz: -4.490, Jz: 1.4024, Kz: -0.0540 }
};

// Легенда цветов по уровням ПДК
const COLOR_SCHEME = [
    { threshold: 0.2, color: '#00FF00' },
    { threshold: 0.4, color: '#7FFF00' },
    { threshold: 0.6, color: '#FFFF00' },
    { threshold: 0.8, color: '#FFA500' },
    { threshold: 1.0, color: '#FF0000' }
];

let monitoringMap;
const monitoringState = {
    sources: [],
    pollutionLayers: [],
    isPlacingSource: false,
    sourceToDelete: null,
    isHeatmapVisible: true,
    isCalculating: false
};

function initMonitoringMap() {
    if (typeof ymaps === 'undefined') return;

    ymaps.ready(() => {
        const mapContainer = document.getElementById('map');
        if (!mapContainer) return;

        monitoringMap = new ymaps.Map('map', {
            center: [55.7558, 37.6173],
            zoom: 13,
            controls: ['zoomControl', 'typeSelector', 'fullscreenControl']
        });

        // Проверяем, что мы на странице мониторинга
        if (window.location.pathname === '/') {
            initMonitoring();
        }
    });
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
        clearAllMapObjects();
        const windSpeedInput = document.getElementById('wind-speed');
        const windDirectionInput = document.getElementById('wind-direction');
        const stabilityClassInput = document.getElementById('stability-class');

        monitoringState.sources = sources.map(source => ({
            ...source, id: source.id, lat: source.latitude, lng: source.longitude,
            emissionRate: source.emission_rate,
            windSpeed: windSpeedInput ? parseFloat(windSpeedInput.value) : 3,
            windDirection: windDirectionInput ? windDirectionInput.value : '270',
            stabilityClass: stabilityClassInput ? stabilityClassInput.value : 'D',
            placemark: null
        }));
        updateSourcesOnMap();
        updateSourcesList();
    }
}

async function addSourceToDB(sourceData) {
    return await apiCall('/api/sources', {
        method: 'POST',
        body: JSON.stringify(sourceData)
    });
}

async function deleteSourceFromDB(sourceId) {
    return await apiCall(`/api/sources/${sourceId}`, {
        method: 'DELETE'
    });
}

async function updateParamsInDB(params) {
    return await apiCall('/api/params', {
        method: 'POST',
        body: JSON.stringify(params)
    });
}

function clearAllMapObjects() {
    if (!monitoringMap) return;

    monitoringState.sources.forEach(source => {
        if (source.placemark) monitoringMap.geoObjects.remove(source.placemark);
    });
    monitoringState.pollutionLayers.forEach(layer => monitoringMap.geoObjects.remove(layer));
    monitoringState.pollutionLayers = [];
}

function calculateSigma(x, coeffs) {
    if (x <= CONFIG.MIN_DISTANCE) return { sigmaY: 0, sigmaZ: 0 };
    const logX = Math.log(x);
    const sigmaY = Math.exp(coeffs.Iy + coeffs.Jy * logX + coeffs.Ky * Math.pow(logX, 2));
    const sigmaZ = Math.exp(coeffs.Iz + coeffs.Jz * logX + coeffs.Kz * Math.pow(logX, 2));
    return { sigmaY, sigmaZ };
}

function calculateMaxConcentration(source) {
    const coeffs = PASQUILL_COEFFS[source.stabilityClass] || PASQUILL_COEFFS['D'];
    let xMax = 0, cMax = 0;
    for (let x = CONFIG.MIN_DISTANCE; x <= CONFIG.MAX_DISTANCE; x += 100) {
        const { sigmaY, sigmaZ } = calculateSigma(x, coeffs);
        if (sigmaY <= 0 || sigmaZ <= 0) continue;
        const c = (source.emissionRate * 1000) / (Math.PI * source.windSpeed * sigmaY * sigmaZ) * Math.exp(-0.5 * Math.pow(source.height / sigmaZ, 2));
        if (c > cMax) { cMax = c; xMax = x; }
    }
    return { distance: xMax, concentration: cMax };
}

function calculatePollutionPolygon(source, concentrationThreshold, color) {
    const coeffs = PASQUILL_COEFFS[source.stabilityClass] || PASQUILL_COEFFS['D'];
    const plumeDirectionRad = (parseFloat(source.windDirection) + 180) * Math.PI / 180;

    const pointsPositiveY = [];
    const pointsNegativeY = [];
    let x_tip = 0;

    const step = CONFIG.MAX_DISTANCE / CONFIG.POLYGON_DETAIL;

    for (let x = CONFIG.MIN_DISTANCE; x <= CONFIG.MAX_DISTANCE; x += step) {
        const { sigmaY, sigmaZ } = calculateSigma(x, coeffs);
        if (sigmaY <= 0 || sigmaZ <= 0) continue;

        const verticalTerm = Math.exp(-0.5 * Math.pow(source.height / sigmaZ, 2));
        const A = (source.emissionRate * 1000) / (2 * Math.PI * source.windSpeed * sigmaY * sigmaZ) * verticalTerm;

        const logTerm = Math.log(concentrationThreshold / A);
        const y = (logTerm < 0) ? sigmaY * Math.sqrt(-2 * logTerm) : 0;

        if (y > 0) {
            x_tip = x;

            const dE = x * Math.sin(plumeDirectionRad) + y * Math.cos(plumeDirectionRad);
            const dN = x * Math.cos(plumeDirectionRad) - y * Math.sin(plumeDirectionRad);
            const dE_neg = x * Math.sin(plumeDirectionRad) - y * Math.cos(plumeDirectionRad);
            const dN_neg = x * Math.cos(plumeDirectionRad) + y * Math.sin(plumeDirectionRad);

            const metersInDegreeLon = CONFIG.METERS_IN_DEGREE_LAT * Math.cos(source.lat * Math.PI / 180);

            const lat = source.lat + dN / CONFIG.METERS_IN_DEGREE_LAT;
            const lon = source.lng + dE / metersInDegreeLon;
            pointsPositiveY.push([lat, lon]);

            const lat_neg = source.lat + dN_neg / CONFIG.METERS_IN_DEGREE_LAT;
            const lon_neg = source.lng + dE_neg / metersInDegreeLon;
            pointsNegativeY.push([lat_neg, lon_neg]);
        }
    }

    if (pointsPositiveY.length < 2) return null;

    const dE_tip = x_tip * Math.sin(plumeDirectionRad);
    const dN_tip = x_tip * Math.cos(plumeDirectionRad);
    const metersInDegreeLon_tip = CONFIG.METERS_IN_DEGREE_LAT * Math.cos(source.lat * Math.PI / 180);
    const tipLat = source.lat + dN_tip / CONFIG.METERS_IN_DEGREE_LAT;
    const tipLon = source.lng + dE_tip / metersInDegreeLon_tip;
    const tipPointGeo = [tipLat, tipLon];

    const polygonContour = [
        [source.lat, source.lng],
        ...pointsPositiveY,
        tipPointGeo,
        ...pointsNegativeY.reverse(),
        [source.lat, source.lng]
    ];

    return new ymaps.Polygon([polygonContour], {}, {
        fillColor: color,
        strokeWidth: 0,
        fillOpacity: 0.45,
        zIndex: Math.round(concentrationThreshold / CONFIG.PDK_H2S * 100)
    });
}

function updatePollutionZones() {
    if (monitoringState.isCalculating || !monitoringMap) return;
    monitoringState.isCalculating = true;

    const calculationResults = document.getElementById('calculation-results');
    if (calculationResults) {
        calculationResults.innerHTML = '<div class="calculation-status">⏳ Выполняется расчет...</div>';
    }

    monitoringState.pollutionLayers.forEach(layer => monitoringMap.geoObjects.remove(layer));
    monitoringState.pollutionLayers = [];

    if (monitoringState.sources.length === 0) {
        updateCalculationResults([]);
        monitoringState.isCalculating = false;
        return;
    }

    const maxResults = [];
    let totalPolygons = 0;

    setTimeout(() => {
        monitoringState.sources.forEach(source => {
            maxResults.push({
                ...calculateMaxConcentration(source),
                height: source.height,
                emission: source.emissionRate
            });

            COLOR_SCHEME.forEach(level => {
                const concentrationThreshold = level.threshold * CONFIG.PDK_H2S;
                const polygon = calculatePollutionPolygon(source, concentrationThreshold, level.color);
                if (polygon) {
                    monitoringState.pollutionLayers.push(polygon);
                    monitoringMap.geoObjects.add(polygon);
                    totalPolygons++;
                }
            });
        });

        updateCalculationResults(maxResults);
        monitoringState.isCalculating = false;

        if (calculationResults) {
            const statusMsg = totalPolygons > 0
                ? `Расчет завершен. Построено полигонов: ${totalPolygons}.`
                : `Концентрации ниже порогов отображения.`;
            const statusStyle = totalPolygons > 0
                ? 'background: #d4edda; border-color: #c3e6cb;'
                : 'background: #f8d7da; border-color: #f5c6cb;';

            calculationResults.innerHTML = `<div class="calculation-status" style="${statusStyle}">${statusMsg}</div>` + calculationResults.innerHTML;
        }
    }, 50);
}

function updateCalculationResults(results) {
    const calculationResults = document.getElementById('calculation-results');
    if (!calculationResults) return;

    if (results.length === 0) {
        calculationResults.innerHTML = '<p>Нет данных для отображения.</p>';
        return;
    }

    let html = '';
    results.forEach((result, index) => {
        const pdkPercent = (result.concentration / CONFIG.PDK_H2S) * 100;
        const pdkClass = pdkPercent > 100 ? 'style="color: red; font-weight: bold;"' : pdkPercent > 80 ? 'style="color: orange;"' : '';
        html += `
      <div class="result-item" style="border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 10px;">
        <p><strong>Источник #${index + 1}</strong></p>
        <p>Выброс: ${result.emission.toFixed(3)} г/с, Высота: ${result.height} м</p>
        <p ${pdkClass}>Макс. концентрация: ${result.concentration.toFixed(6)} мг/м³ (${pdkPercent.toFixed(1)}% ПДК)</p>
        <p>На расстоянии: ${(result.distance / 1000).toFixed(1)} км</p>
      </div>`;
    });
    calculationResults.innerHTML = html;
}

function initMonitoring() {
    // Инициализация проходит, если мы на странице мониторинга
    if (window.location.pathname !== '/') return;

    setupMonitoringEventListeners();
    loadSourcesFromDB();
}

function setupMonitoringEventListeners() {
    // Обработчики элементов добавляются, только если они существуют
    const addSourceBtn = document.getElementById('add-source-btn');
    const updateBtn = document.getElementById('update-btn');
    const toggleHeatmapBtn = document.getElementById('toggle-heatmap-btn');
    const cancelDeleteBtn = document.getElementById('cancel-delete');
    const confirmDeleteBtn = document.getElementById('confirm-delete');

    if (addSourceBtn) {
        addSourceBtn.addEventListener('click', enableSourcePlacement);
    }

    if (updateBtn) {
        updateBtn.addEventListener('click', updateAllSources);
    }

    if (toggleHeatmapBtn) {
        toggleHeatmapBtn.addEventListener('click', toggleHeatmap);
    }

    // Обработчики модального окна подключаются, если оно существует
    const closeButtons = document.querySelectorAll('.close');
    if (closeButtons.length > 0) {
        closeButtons.forEach(el => {
            el.addEventListener('click', () => {
                const modal = document.getElementById('confirm-modal');
                if (modal) modal.style.display = 'none';
            });
        });
    }

    if (cancelDeleteBtn) {
        cancelDeleteBtn.addEventListener('click', () => {
            const modal = document.getElementById('confirm-modal');
            if (modal) modal.style.display = 'none';
        });
    }

    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', confirmDeleteSource);
    }
}

function updateSourcesOnMap() {
    if (!monitoringMap) return;

    monitoringState.sources.forEach(source => {
        if (source.placemark) monitoringMap.geoObjects.remove(source.placemark);
    });

    monitoringState.sources.forEach(source => {
        source.placemark = new ymaps.Placemark([source.lat, source.lng], {
            balloonContent: `<b>${source.name}</b><br>Высота: ${source.height} м<br>Выброс: ${source.emissionRate.toFixed(3)} г/с H2S`
        }, { preset: 'islands#redIcon' });
        monitoringMap.geoObjects.add(source.placemark);
    });
}

async function addSource(lat, lng, height, emissionRate) {
    const result = await addSourceToDB({
        name: `Источник ${Date.now() % 10000}`,
        type: 'point',
        latitude: lat,
        longitude: lng,
        height: height,
        emission_rate: emissionRate
    });

    if (result && result.success) {
        await loadSourcesFromDB();
        if (monitoringState.isHeatmapVisible) updatePollutionZones();
    }
}

function updateSourcesList() {
    const sourcesList = document.getElementById('sources-list');
    if (!sourcesList) return;

    sourcesList.innerHTML = monitoringState.sources.length === 0
        ? '<p style="text-align: center; color: #7f8c8d;">Нет источников</p>'
        : '';

    monitoringState.sources.forEach(source => {
        const sourceEl = document.createElement('div');
        sourceEl.className = 'source-item';
        sourceEl.innerHTML = `
      <strong>${source.name}</strong><br>
      <small>Высота: ${source.height} м, выброс: ${source.emissionRate.toFixed(3)} г/с</small>
      <div class="source-actions">
        <button onclick="flyToSource(${source.id})">На карте</button>
        <button onclick="requestDeleteSource(${source.id})" class="danger">Удалить</button>
      </div>`;
        sourcesList.appendChild(sourceEl);
    });
}

function enableSourcePlacement() {
    if (!monitoringMap || monitoringState.isPlacingSource) {
        disableSourcePlacement();
        return;
    }

    monitoringState.isPlacingSource = true;
    const addSourceBtn = document.getElementById('add-source-btn');
    if (addSourceBtn) {
        addSourceBtn.textContent = 'Отменить (клик на карте)';
        addSourceBtn.style.background = '#e74c3c';
    }

    monitoringMap.events.add('click', handleMapClickForPlacement);
    monitoringMap.setOptions('cursor', 'crosshair');
}

function disableSourcePlacement() {
    monitoringState.isPlacingSource = false;
    const addSourceBtn = document.getElementById('add-source-btn');
    if (addSourceBtn) {
        addSourceBtn.textContent = 'Добавить источник на карту';
        addSourceBtn.style.background = '';
    }

    if (monitoringMap) {
        monitoringMap.events.remove('click', handleMapClickForPlacement);
        monitoringMap.setOptions('cursor', 'grab');
    }
}

async function handleMapClickForPlacement(e) {
    const coords = e.get('coords');
    const sourceHeightInput = document.getElementById('source-height');
    const emissionRateInput = document.getElementById('emission-rate');

    await addSource(
        coords[0],
        coords[1],
        sourceHeightInput ? parseFloat(sourceHeightInput.value) : 40,
        emissionRateInput ? parseFloat(emissionRateInput.value) : 3.7
    );
    disableSourcePlacement();
}

async function updateAllSources() {
    if (monitoringState.isCalculating) {
        alert('Дождитесь завершения текущего расчета.');
        return;
    }

    const windSpeedInput = document.getElementById('wind-speed');
    const windDirectionInput = document.getElementById('wind-direction');
    const stabilityClassInput = document.getElementById('stability-class');

    const params = {
        wind_speed: windSpeedInput ? parseFloat(windSpeedInput.value) : 3,
        wind_direction: windDirectionInput ? windDirectionInput.value : '270',
        stability_class: stabilityClassInput ? stabilityClassInput.value : 'D'
    };

    await updateParamsInDB(params);
    monitoringState.sources.forEach(source => {
        source.windSpeed = params.wind_speed;
        source.windDirection = params.wind_direction;
        source.stabilityClass = params.stability_class;
    });

    if (monitoringState.isHeatmapVisible) updatePollutionZones();
}

function requestDeleteSource(sourceId) {
    monitoringState.sourceToDelete = monitoringState.sources.find(s => s.id === sourceId);
    if (monitoringState.sourceToDelete) {
        const modal = document.getElementById('confirm-modal');
        if (modal) modal.style.display = 'block';
    }
}

async function confirmDeleteSource() {
    if (!monitoringState.sourceToDelete) return;

    const result = await deleteSourceFromDB(monitoringState.sourceToDelete.id);
    if (result && result.success) {
        await loadSourcesFromDB();
        if (monitoringState.isHeatmapVisible) updatePollutionZones();
    }

    const modal = document.getElementById('confirm-modal');
    if (modal) modal.style.display = 'none';
    monitoringState.sourceToDelete = null;
}

function flyToSource(sourceId) {
    if (!monitoringMap) return;

    const source = monitoringState.sources.find(s => s.id === sourceId);
    if (source) {
        monitoringMap.panTo([source.lat, source.lng], { duration: 1000, flying: true }).then(() => {
            monitoringMap.setZoom(15, { duration: 500 });
            if (source.placemark) source.placemark.balloon.open();
        });
    }
}

function toggleHeatmap() {
    if (monitoringState.isCalculating) {
        alert('Дождитесь завершения расчета.');
        return;
    }

    monitoringState.isHeatmapVisible = !monitoringState.isHeatmapVisible;
    const toggleHeatmapBtn = document.getElementById('toggle-heatmap-btn');

    if (toggleHeatmapBtn) {
        toggleHeatmapBtn.textContent = monitoringState.isHeatmapVisible
            ? 'Скрыть зоны загрязнения'
            : 'Показать зоны загрязнения';
        toggleHeatmapBtn.style.background = monitoringState.isHeatmapVisible
            ? 'linear-gradient(180deg, #27ae60, #219653)'
            : '';
    }

    if (monitoringState.isHeatmapVisible) {
        updatePollutionZones();
    } else {
        monitoringState.pollutionLayers.forEach(layer => {
            if (monitoringMap) monitoringMap.geoObjects.remove(layer);
        });
        monitoringState.pollutionLayers = [];
    }
}

// Глобальные функции для использования в HTML
window.requestDeleteSource = requestDeleteSource;
window.flyToSource = flyToSource;

// Анимация ветра для вкладки "Мониторинг"
let weatherData = { wind_speed: 3, wind_dir: 'n', prec_type: 0, prec_strength: 0 };
let isWindOn = true;
let isRainOn = true;

// Перевод направления ветра из API в текст
function dirToText(dir) {
    const map = { n:'С', ne:'СВ', e:'В', se:'ЮВ', s:'Ю', sw:'ЮЗ', w:'З', nw:'СЗ' };
    return map[dir] || 'С';
}

// Обновление текстовой панели с данными о погоде
async function refreshWeather() {
    try {
        const res = await fetch('https://api.weather.yandex.ru/v2/forecast?lat=55.7558&lon=37.6173&limit=1', {
            headers: { 'X-Yandex-API-Key': windows.appConfig.YWEATHER_API_KEY }
        });

        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }

        const data = await res.json();
        const f = data.fact;

        weatherData = {
            wind_speed: f.wind_speed,
            wind_dir: f.wind_dir,
            pressure_mm: f.pressure_mm,
            humidity: f.humidity,
            visibility: f.visibility ? (f.visibility/1000).toFixed(1) : 10,
            prec_type: f.prec_type || 0,
            prec_strength: f.prec_strength || 0
        };

        const panel = document.querySelector('.map-meta');
        if (panel) {
            panel.textContent = `Ветер: ${f.wind_speed} м/с, ${dirToText(f.wind_dir)}    Давление: ${f.pressure_mm} мм рт. ст.    Влажность: ${f.humidity}%    Дальность видимости: ${weatherData.visibility} км    Изотермия: не наблюдается`;
        }
    } catch (e) {
        console.warn('Погода не загрузилась, используем дефолт');
        // Устанавливаем значения по умолчанию
        weatherData = {
            wind_speed: 3,
            wind_dir: 'n',
            pressure_mm: 764,
            humidity: 61,
            visibility: '61',
            prec_type: 0,
            prec_strength: 0
        };
    }
}

// Анимация
let canvas, ctx, particles = [], animationId;

function startWeatherAnimation() {
    if (!map?.container) return;

    canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute; top:0; left:0; pointer-events:none; z-index:1000;';
    const container = map.container.getElement();
    container.style.position = 'relative';
    container.appendChild(canvas);

    function resize() {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
    }
    resize();
    window.addEventListener('resize', resize);
    if (map.events) {
        map.events.add('boundschange', resize);
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const ws = weatherData.wind_speed * 1.2;
        const angle = { n:0, ne:45, e:90, se:135, s:180, sw:225, w:270, nw:315 }[weatherData.wind_dir] || 0;
        const rad = angle * Math.PI / 180;

        // Ветер
        if (isWindOn) {
            if (particles.length < 70) {
                particles.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    life: 1
                });
            }
            particles.forEach((p, i) => {
                p.x += Math.cos(rad) * ws;
                p.y += Math.sin(rad) * ws;
                p.life -= 0.01;

                if (p.life > 0) {
                    ctx.strokeStyle = `rgba(52, 152, 219, ${p.life})`;
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(p.x - Math.cos(rad)*30, p.y - Math.sin(rad)*30);
                    ctx.stroke();
                } else {
                    particles.splice(i, 1);
                }
            });
        }

        // Дождь и снег
        if (isRainOn && weatherData.prec_strength > 0) {
            for (let i = 0; i < 5 * weatherData.prec_strength; i++) {
                particles.push({
                    x: Math.random() * canvas.width,
                    y: -10,
                    life: 1,
                    isRain: true
                });
            }
            particles.forEach((p, i) => {
                if (!p.isRain) return;
                p.y += 10;
                p.life -= 0.02;
                if (p.life > 0 && p.y < canvas.height) {
                    ctx.strokeStyle = weatherData.prec_type === 2 ? 'rgba(255,255,255,0.8)' : 'rgba(100,180,255,0.7)';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(p.x, p.y + 12);
                    ctx.stroke();
                } else if (p.y >= canvas.height) {
                    particles.splice(i, 1);
                }
            });
        }

        animationId = requestAnimationFrame(animate);
    }
    ctx = canvas.getContext('2d');
    animate();
}

if (typeof ymaps !== 'undefined') {
    ymaps.ready(() => {
        // Анимация погоды инициализируется, если есть карта
        const mapContainer = document.getElementById('map');
        if (!mapContainer) return;

        if (typeof map === 'undefined' || !map) {
            map = new ymaps.Map('map', {
                center: [55.7558, 37.6173],
                zoom: 10,
                controls: ['zoomControl', 'fullscreenControl']
            });
        }

        // Каждые 10 минут данные о погоде обновляются
        setTimeout(() => {
            refreshWeather();
            setInterval(refreshWeather, 600000);

            // Анимация запускается, если есть карта
            if (map) {
                startWeatherAnimation();
            }

            // Обработчики элементов добавляются, если они существуют
            const toggleWindBtn = document.getElementById('toggleWind');
            const togglePrecipBtn = document.getElementById('togglePrecip');
            const updateWeatherBtn = document.getElementById('updateWeather');

            if (toggleWindBtn) {
                toggleWindBtn.addEventListener('click', () => {
                    isWindOn = !isWindOn;
                    toggleWindBtn.textContent = `Ветер: ${isWindOn ? 'Вкл' : 'Выкл'}`;
                });
            }

            if (togglePrecipBtn) {
                togglePrecipBtn.addEventListener('click', () => {
                    isRainOn = !isRainOn;
                    togglePrecipBtn.textContent = `Осадки: ${isRainOn ? 'Вкл' : 'Выкл'}`;
                });
            }

            if (updateWeatherBtn) {
                updateWeatherBtn.addEventListener('click', refreshWeather);
            }
        }, 1500);
    });
}
