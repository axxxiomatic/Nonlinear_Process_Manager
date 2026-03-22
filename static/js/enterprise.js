window.appConfig = {
    YMAPS_API_KEY: '{{ config.YMAPS_API_KEY }}',
    YMAPS_LANG: '{{ config.YMAPS_LANG }}',
    YWEATHER_API_KEY: '{{ config.YWEATHER_API_KEY }}',
};

// Глобальные переменные
let map = null;
let pollutionLayer = null; // Слой загрязнения (тайлы с бэкенда)
let sourcePlacemarks = [];
let windVectorPlacemarks = [];

// Таймер для debouncing (чтобы не спамить API при движении ползунков)
let paramsUpdateTimeout = null;

const state = {
    sources: [],
    isPlacingSource: false,
    sourceToDelete: null,
    isCalculating: false,
    heatmapVisible: true,
    windSpeed: 2.4,
    windDirection: 180,
    stabilityClass: 'D',
    showWindVectors: true
};

// --- Глобальные функции для HTML вызовов ---

window.requestDeleteSource = function(sourceId) {
    state.sourceToDelete = state.sources.find(s => s.id === sourceId);
    if (state.sourceToDelete) {
        document.getElementById('confirm-modal').style.display = 'block';
    }
};

window.toggleDebugInfo = function() {
    const debugInfo = document.getElementById('debug-info');
    if (debugInfo) {
        debugInfo.style.display = debugInfo.style.display === 'block' ? 'none' : 'block';
    }
};

window.resetWindSettings = function() {
    state.windSpeed = 2.4;
    state.windDirection = 180;

    // Обновляем инпуты
    const windSpeedEl = document.getElementById('wind-speed');
    const windDirectionEl = document.getElementById('wind-direction');
    if (windSpeedEl) windSpeedEl.value = state.windSpeed;
    if (windDirectionEl) windDirectionEl.value = state.windDirection;

    updateWindDisplay();
    updateWindVectors();

    // Сохраняем в БД и обновляем карту
    saveSimulationParamsAndRefresh();
};

window.updateHeatmapData = function() {
    // В новой логике это просто принудительное обновление слоя
    refreshPollutionLayer();
};

// --- Работа с API и БД ---

async function apiCall(url, options = {}) {
    try {
        const response = await fetch(url, {
            headers: { 'Content-Type': 'application/json', ...options.headers },
            ...options
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
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
        updateWindVectors();

        // После загрузки источников обновляем слой
        refreshPollutionLayer();
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

// Сохранение параметров симуляции (ветер) в БД, так как бэкенд использует их для рендеринга
async function saveSimulationParamsAndRefresh() {
    updateDebugStatus("Обновление параметров и перерисовка...");

    // Формируем объект параметров
    // (Структура должна соответствовать вашей Pydantic схеме SimulationParamsCreate)
    const paramsData = {
        wind_speed: state.windSpeed,
        wind_direction: state.windDirection.toString(),
        stability_class: state.stabilityClass
    };

    try {
        const result = await apiCall('/api/simulation_params/', {
            method: 'POST',
            body: JSON.stringify(paramsData)
        });

        if (result) {
            console.log("Параметры симуляции сохранены");
            refreshPollutionLayer();
        }
    } catch (e) {
        console.error("Ошибка сохранения параметров", e);
    }
}

// --- Логика карты и слоев ---

function initMap() {
    try {
        document.getElementById('loading-indicator').style.display = 'block';
        document.getElementById('progress-text').textContent = 'Загрузка карты...';
        document.getElementById('progress-fill').style.width = '50%';

        updateDebugStatus("Инициализация карты...");

        map = new ymaps.Map('map', {
            center: [55.7558, 37.6173],
            zoom: 13,
            controls: ['zoomControl', 'typeSelector', 'fullscreenControl']
        });

        document.getElementById('progress-fill').style.width = '100%';
        document.getElementById('progress-text').textContent = 'Карта загружена';
        updateDebugStatus("Карта загружена");

        setTimeout(() => {
            document.getElementById('loading-indicator').style.display = 'none';
        }, 500);

        // Инициализация слоя загрязнения
        initPollutionLayer();

        // Загрузка данных и настройка событий
        init();

        map.events.add('boundschange', function() {
            // При зуме может потребоваться обновление инфо
            // Но тайлы обновляются сами благодаря ymaps.Layer
        });

    } catch (error) {
        console.error("Ошибка при инициализации карты:", error);
        document.getElementById('loading-indicator').style.display = 'none';
        showErrorMessage("Ошибка загрузки карты: " + error.message);
    }
}

function initPollutionLayer() {
    if (!map) return;

    const tileUrlTemplate = '/api/simulation/tiles/%z/%x/%y.png?t=' + Date.now();

    pollutionLayer = new ymaps.Layer(tileUrlTemplate, {
        tileTransparent: true,
        zIndex: 5000
    });

    // ОГРАНИЧЕНИЕ: Слой запрашивается и отрисовывается только от 9 до 19 зума
    // Это сэкономит трафик и вычислительные мощности при отдалении на уровень континентов
    pollutionLayer.options.set('minZoom', 9);
    pollutionLayer.options.set('maxZoom', 19);

    if (state.heatmapVisible) {
        map.layers.add(pollutionLayer);
    }
}

function refreshPollutionLayer() {
    if (!pollutionLayer || !state.heatmapVisible) return;

    updateDebugStatus("Запрос новых тайлов...");

    // Метод update заставляет слой пересчитать URL тайлов.
    // Мы меняем timestamp, чтобы браузер не брал картинки из кеша.
    pollutionLayer.update(function () {
        return '/api/simulation/tiles/%z/%x/%y.png?t=' + Date.now();
    });

    // Иногда требуется передернуть слой, чтобы отрисовка началась мгновенно
    map.layers.remove(pollutionLayer);
    map.layers.add(pollutionLayer);

    updateDebugStatus("Слой обновлен");
}

// --- Визуализация UI и маркеров ---

function updateDebugStatus(status) {
    const debugStatus = document.getElementById('debug-status');
    if (debugStatus) {
        debugStatus.textContent = status;
    }
}

function showErrorMessage(message) {
    const errorMessage = document.getElementById('error-message');
    if (errorMessage) {
        errorMessage.innerHTML = `<p>${message}</p><button onclick="location.reload()">Перезагрузить</button>`;
        errorMessage.style.display = 'block';
    }
}

function updateSourceMarkers() {
    if (!map) return;

    // Удаляем старые метки
    if (sourcePlacemarks.length > 0) {
        sourcePlacemarks.forEach(pm => map.geoObjects.remove(pm));
        sourcePlacemarks = [];
    }

    // Рисуем новые
    state.sources.forEach(source => {
        const placemark = new ymaps.Placemark(
            [source.lat, source.lng],
            {
                balloonContent: `<b>${source.name}</b><br>Высота: ${source.height} м<br>Выброс: ${source.emissionRate} г/с`
            },
            {
                preset: 'islands#redIcon',
                iconColor: '#e74c3c'
            }
        );
        map.geoObjects.add(placemark);
        sourcePlacemarks.push(placemark);
    });
}

function updateWindVectors() {
    if (!map || !state.showWindVectors) {
        windVectorPlacemarks.forEach(pm => map.geoObjects.remove(pm));
        windVectorPlacemarks = [];
        return;
    }

    windVectorPlacemarks.forEach(pm => map.geoObjects.remove(pm));
    windVectorPlacemarks = [];

    state.sources.forEach(source => {
        // ИСПРАВЛЕНО: Ветер метеорологический (откуда дует). Шлейф идет в сторону +180 градусов
        const plumeDirection = (state.windDirection + 180) % 360;
        const windDirectionRad = (plumeDirection * Math.PI) / 180;
        const vectorLength = 1500; // визуальная длина (метров)

        const dx = vectorLength * Math.sin(windDirectionRad);
        const dy = vectorLength * Math.cos(windDirectionRad);

        const dLat = dy / 111000;
        const dLng = dx / (111000 * Math.cos(source.lat * Math.PI / 180));

        const endLat = source.lat + dLat;
        const endLng = source.lng + dLng;

        const polyline = new ymaps.Polyline([[source.lat, source.lng], [endLat, endLng]], {}, {
            strokeColor: '#3498db',
            strokeWidth: 3, // Сделал чуть толще
            strokeOpacity: 0.8
        });

        map.geoObjects.add(polyline);
        windVectorPlacemarks.push(polyline);
    });
}

async function saveSimulationParamsAndRefresh() {
    updateDebugStatus("Обновление параметров и перерисовка...");

    const paramsData = {
        wind_speed: state.windSpeed,
        wind_direction: state.windDirection, // Убрали .toString(), т.к. бэкенд теперь ждет float
        stability_class: state.stabilityClass
    };

    try {
        const result = await apiCall('/api/simulation/params', { // ИСПРАВЛЕНО на правильный роут
            method: 'POST',
            body: JSON.stringify(paramsData)
        });

        if (result) {
            refreshPollutionLayer();
        }
    } catch (e) {
        console.error("Ошибка сохранения параметров", e);
    }
}

function updateWindDisplay() {
    // Обновляем стрелку и текст в UI
    const windDirectionArrow = document.getElementById('wind-direction-arrow');
    const windDirectionLabel = document.getElementById('wind-direction-label');
    const windSpeedValue = document.getElementById('wind-speed-value');
    const windDirectionValue = document.getElementById('wind-direction-value');

    if (windDirectionArrow) windDirectionArrow.style.transform = `translateX(-50%) rotate(${state.windDirection}deg)`;
    if (windDirectionLabel) windDirectionLabel.textContent = `${state.windDirection}°`;
    if (windSpeedValue) windSpeedValue.textContent = `${state.windSpeed.toFixed(1)} м/с`;

    if (windDirectionValue) {
        const dirs = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];
        const idx = Math.round(state.windDirection / 45) % 8;
        windDirectionValue.textContent = `${state.windDirection}° (${dirs[idx]})`;
    }
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

// --- Обработка событий ---

function init() {
    setupEventListeners();
    loadSourcesFromDB();
}

function handleWindChange() {
    updateWindDisplay();
    updateWindVectors();

    // Debounce: ждем 500мс после последнего изменения, прежде чем отправлять на сервер
    if (paramsUpdateTimeout) clearTimeout(paramsUpdateTimeout);
    paramsUpdateTimeout = setTimeout(() => {
        saveSimulationParamsAndRefresh();
    }, 500);
}

function setupEventListeners() {
    // Чекбокс видимости слоя
    const heatmapToggle = document.getElementById('heatmap-toggle');
    if (heatmapToggle) {
        heatmapToggle.addEventListener('change', function() {
            state.heatmapVisible = this.checked;
            if (map && pollutionLayer) {
                if (state.heatmapVisible) {
                    map.layers.add(pollutionLayer);
                } else {
                    map.layers.remove(pollutionLayer);
                }
            }
        });
    }

    // Ползунок скорости ветра
    const windSpeedEl = document.getElementById('wind-speed');
    if (windSpeedEl) {
        windSpeedEl.addEventListener('input', function() {
            state.windSpeed = parseFloat(this.value);
            handleWindChange();
        });
    }

    // Ползунок направления ветра
    const windDirectionEl = document.getElementById('wind-direction');
    if (windDirectionEl) {
        windDirectionEl.addEventListener('input', function() {
            state.windDirection = parseInt(this.value);
            handleWindChange();
        });
    }

    // Чекбокс векторов ветра
    const showWindVectorsEl = document.getElementById('show-wind-vectors');
    if (showWindVectorsEl) {
        showWindVectorsEl.addEventListener('change', function() {
            state.showWindVectors = this.checked;
            updateWindVectors();
        });
    }

    // Кнопки добавления/обновления
    const addSourceBtn = document.getElementById('add-source-btn');
    if (addSourceBtn) addSourceBtn.addEventListener('click', enableSourcePlacement);

    const updateHeatmapBtn = document.getElementById('update-heatmap-btn');
    if (updateHeatmapBtn) updateHeatmapBtn.addEventListener('click', refreshPollutionLayer);

    const toggleDebugBtn = document.getElementById('toggle-debug-btn');
    if (toggleDebugBtn) toggleDebugBtn.addEventListener('click', toggleDebugInfo);

    const resetWindBtn = document.getElementById('reset-wind-btn');
    if (resetWindBtn) resetWindBtn.addEventListener('click', resetWindSettings);

    // Модальное окно удаления
    document.querySelectorAll('.close').forEach(el =>
        el.addEventListener('click', () => document.getElementById('confirm-modal').style.display = 'none')
    );
    const cancelDelete = document.getElementById('cancel-delete');
    if (cancelDelete) cancelDelete.addEventListener('click', () => document.getElementById('confirm-modal').style.display = 'none');

    const confirmDelete = document.getElementById('confirm-delete');
    if (confirmDelete) confirmDelete.addEventListener('click', confirmDeleteSource);

    updateWindDisplay();
}

// --- Логика добавления источника (клик по карте) ---

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
    map.cursors.push('crosshair');
}

function disableSourcePlacement() {
    state.isPlacingSource = false;
    const addSourceBtn = document.getElementById('add-source-btn');
    if (addSourceBtn) {
        addSourceBtn.textContent = 'Добавить источник';
        addSourceBtn.style.background = '';
    }
    map.events.remove('click', handleMapClickForPlacement);
    // Сброс курсора (неидеально, но работает для дефолтного)
    // map.cursors.push('arrow');
}

async function handleMapClickForPlacement(e) {
    const coords = e.get('coords');
    const sourceHeight = document.getElementById('source-height');
    const emissionRate = document.getElementById('emission-rate');

    const h = sourceHeight ? parseInt(sourceHeight.value) : 40;
    const rate = emissionRate ? parseFloat(emissionRate.value.replace(',', '.')) : 3.7;

    await addSource(coords[0], coords[1], h, rate);
    disableSourcePlacement();
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

    if (result) {
        await loadSourcesFromDB(); // Это также вызовет refreshPollutionLayer
    }
}

async function confirmDeleteSource() {
    if (!state.sourceToDelete) return;

    const result = await deleteSourceFromDB(state.sourceToDelete.id);
    if (result) {
        await loadSourcesFromDB();
    }

    document.getElementById('confirm-modal').style.display = 'none';
    state.sourceToDelete = null;
}

// Запуск
ymaps.ready(initMap);