let monitoringMap = null;
let isDrawingMode = false;
let currentDrawingType = null;
let drawingPoints = [];
let tempLineObject = null;
let tempPolygonObject = null;
let isSimulatorMode = false;
let isLoggedIn = false;

const appState = {
    currentSubstanceId: 4,
    currentSubstanceName: "CO",
    sources: [],
    currentTimeIndex: 5
};

const timeLabels = [
    "14:00", "14:30", "15:00", "15:30",
    "16:00", "16:30", "17:00", "17:30",
    "18:00", "18:30"
];

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    initYandexMap();
    initEventListeners();
    initNewOverlay();
    initSimulatorLoginToggle();
    initModeToggle();
});

function initYandexMap() {
    if (typeof ymaps === 'undefined') {
        console.error('Yandex Maps API не загружен');
        setTimeout(initYandexMap, 500);
        return;
    }

    ymaps.ready(async () => {
        monitoringMap = new ymaps.Map('map', {
            center: [55.978746, 37.204738],
            zoom: 13,
            controls: ['zoomControl']
        });

        monitoringMap.events.add('click', onMapClick);
        monitoringMap.events.add('dblclick', onMapDoubleClick);

        await loadSubstances();
        await loadSourcesFromDB();
        MapGraphics.initPollutionLayer(monitoringMap, appState.currentSubstanceId);

        console.log('Карта инициализирована');
    });
}

function onMapClick(e) {
    if (!isDrawingMode) return;

    const coords = e.get('coords');
    drawingPoints.push(coords);

    if (currentDrawingType === 'point') {
        finishDrawing();
    } else if (currentDrawingType === 'line') {
        updateTempLine();
    } else if (currentDrawingType === 'polygon') {
        updateTempPolygon();
    }
}

function onMapDoubleClick(e) {
    if (!isDrawingMode) return;
    if (currentDrawingType === 'line' || currentDrawingType === 'polygon') {
        e.preventDefault();
        finishDrawing();
    }
}

function updateTempLine() {
    if (tempLineObject) {
        monitoringMap.geoObjects.remove(tempLineObject);
    }
    if (drawingPoints.length >= 2) {
        tempLineObject = new ymaps.Polyline(drawingPoints, {}, {
            strokeColor: '#00c853',
            strokeWidth: 4,
            strokeOpacity: 0.8
        });
        monitoringMap.geoObjects.add(tempLineObject);
    }
}

function updateTempPolygon() {
    if (tempPolygonObject) {
        monitoringMap.geoObjects.remove(tempPolygonObject);
    }
    if (drawingPoints.length >= 3) {
        const closedPoints = [...drawingPoints, drawingPoints[0]];
        tempPolygonObject = new ymaps.Polygon([closedPoints], {}, {
            fillColor: '#00c853',
            fillOpacity: 0.3,
            strokeColor: '#00c853',
            strokeWidth: 3
        });
        monitoringMap.geoObjects.add(tempPolygonObject);
    }
}

function clearTempDrawings() {
    if (tempLineObject) {
        monitoringMap.geoObjects.remove(tempLineObject);
        tempLineObject = null;
    }
    if (tempPolygonObject) {
        monitoringMap.geoObjects.remove(tempPolygonObject);
        tempPolygonObject = null;
    }
}

function finishDrawing() {
    if (drawingPoints.length === 0) {
        resetDrawingMode();
        return;
    }

    const name = document.getElementById('source-name')?.value.trim() || document.getElementById('overlay-source-name')?.value.trim();
    if (!name) {
        alert('Пожалуйста, введите название источника');
        return;
    }

    const height = parseFloat(document.getElementById('source-height')?.value || document.getElementById('overlay-source-height')?.value);
    const emissionRate = parseFloat(document.getElementById('source-emission')?.value || document.getElementById('overlay-source-emission')?.value);
    const category = document.getElementById('source-category')?.value || document.getElementById('overlay-source-category')?.value;
    const substanceName = document.getElementById('source-substance')?.value || document.getElementById('overlay-source-substance')?.value;
    const substanceId = getSubstanceId(substanceName);

    if (isNaN(height) || height <= 0) {
        alert('Высота должна быть положительным числом');
        return;
    }

    if (isNaN(emissionRate) || emissionRate <= 0) {
        alert('Интенсивность выброса должна быть положительным числом');
        return;
    }

    let sourceData = {
        name: name,
        type: currentDrawingType,
        height: height,
        emission_rate: emissionRate,
        substance_id: substanceId,
        category: category
    };

    if (currentDrawingType === 'point') {
        sourceData.latitude = drawingPoints[0][0];
        sourceData.longitude = drawingPoints[0][1];
    } else if (currentDrawingType === 'line') {
        sourceData.coordinates = drawingPoints;
        sourceData.latitude = drawingPoints[0][0];
        sourceData.longitude = drawingPoints[0][1];
    } else if (currentDrawingType === 'polygon') {
        sourceData.coordinates = drawingPoints;
        sourceData.latitude = drawingPoints[0][0];
        sourceData.longitude = drawingPoints[0][1];
    }

    addSourceToDB(sourceData).then(result => {
        if (result && result.success !== false) {
            alert(`Источник "${name}" успешно добавлен!`);
            if (document.getElementById('source-name')) document.getElementById('source-name').value = '';
            if (document.getElementById('overlay-source-name')) document.getElementById('overlay-source-name').value = '';
            resetDrawingMode();
            loadSourcesFromDB();
            MapGraphics.refreshPollutionLayer(monitoringMap, appState.currentSubstanceId);
        } else {
            alert('Ошибка при добавлении источника');
        }
    });
}

function resetDrawingMode() {
    isDrawingMode = false;
    currentDrawingType = null;
    drawingPoints = [];
    clearTempDrawings();

    const startBtn = document.getElementById('start-drawing-btn');
    const cancelBtn = document.getElementById('cancel-drawing-btn');
    const drawingStatus = document.getElementById('drawing-status');
    const startOverlayBtn = document.getElementById('start-drawing-overlay-btn');
    const cancelOverlayBtn = document.getElementById('cancel-drawing-overlay-btn');
    const drawingOverlayStatus = document.getElementById('drawing-status-overlay');

    if (startBtn) startBtn.style.display = 'block';
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (drawingStatus) drawingStatus.style.display = 'none';
    if (startOverlayBtn) startOverlayBtn.style.display = 'block';
    if (cancelOverlayBtn) cancelOverlayBtn.style.display = 'none';
    if (drawingOverlayStatus) drawingOverlayStatus.style.display = 'none';

    if (monitoringMap) {
        monitoringMap.cursors.push('arrow');
    }
}

function startDrawing() {
    const activeBtn = document.querySelector('.source-type-btn.active');
    if (!activeBtn) {
        alert('Выберите тип источника');
        return;
    }

    currentDrawingType = activeBtn.dataset.type;
    isDrawingMode = true;
    drawingPoints = [];
    clearTempDrawings();

    if (monitoringMap) {
        monitoringMap.cursors.push('crosshair');
    }

    const typeNames = {
        'point': 'Точечный источник - кликните на карте для установки',
        'line': 'Линейный источник - кликайте для добавления точек, двойной клик для завершения',
        'polygon': 'Площадной источник - кликайте для контура, двойной клик для завершения'
    };

    const statusText = document.getElementById('drawing-status-text');
    const statusDiv = document.getElementById('drawing-status');
    const startBtn = document.getElementById('start-drawing-btn');
    const cancelBtn = document.getElementById('cancel-drawing-btn');

    if (statusText) statusText.textContent = typeNames[currentDrawingType];
    if (statusDiv) statusDiv.style.display = 'block';
    if (startBtn) startBtn.style.display = 'none';
    if (cancelBtn) cancelBtn.style.display = 'block';
}
// ПРОСТАЯ ФУНКЦИЯ ПОИСКА - ВСТАВЬТЕ ЭТУ ФУНКЦИЮ ПЕРЕД initEventListeners
function searchAddress(query) {
    if (!monitoringMap) {
        alert('Карта ещё не загружена');
        return;
    }

    // Проверяем что ymaps.geocode существует
    if (!ymaps || typeof ymaps.geocode !== 'function') {
        alert('API карт ещё не загружен');
        return;
    }

    ymaps.geocode(query, { results: 1 }).then(
        function (res) {
            if (res && res.geoObjects && res.geoObjects.getLength() > 0) {
                const first = res.geoObjects.get(0);
                const coords = first.geometry.getCoordinates();
                const address = first.getAddressLine();

                // Перемещаем карту
                monitoringMap.setCenter(coords, 16);

                // Удаляем старую метку
                if (window.myPlacemark) {
                    monitoringMap.geoObjects.remove(window.myPlacemark);
                }

                // Добавляем новую метку
                window.myPlacemark = new ymaps.Placemark(coords, {
                    balloonContent: address
                });
                monitoringMap.geoObjects.add(window.myPlacemark);
                window.myPlacemark.balloon.open();
            } else {
                alert('Ничего не найдено: ' + query);
            }
        },
        function (err) {
            console.error('Ошибка геокодирования:', err);
            alert('Ошибка поиска: ' + (err.message || 'неизвестная ошибка'));
        }
    );
}
function initEventListeners() {
    document.querySelectorAll('.pollutants-bar span').forEach(span => {
        span.addEventListener('click', () => {
            document.querySelectorAll('.pollutants-bar span').forEach(s => s.classList.remove('active'));
            span.classList.add('active');

            appState.currentSubstanceName = span.dataset.substance;
            appState.currentSubstanceId = getSubstanceId(span.dataset.substance);

            if (document.getElementById('source-substance')) {
                document.getElementById('source-substance').value = span.dataset.substance;
            }
            if (document.getElementById('overlay-source-substance')) {
                document.getElementById('overlay-source-substance').value = span.dataset.substance;
            }

            if (MapGraphics && MapGraphics.refreshPollutionLayer) {
                MapGraphics.refreshPollutionLayer(monitoringMap, appState.currentSubstanceId);
            }

            loadSourcesFromDB();
        });
    });

    document.querySelectorAll('.source-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.source-type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    const startDrawBtn = document.getElementById('start-drawing-btn');
    if (startDrawBtn) {
        startDrawBtn.addEventListener('click', startDrawing);
    }

    const cancelDrawBtn = document.getElementById('cancel-drawing-btn');
    if (cancelDrawBtn) {
        cancelDrawBtn.addEventListener('click', resetDrawingMode);
    }

    const timeSlider = document.getElementById('time-slider');
    const timeDisplay = document.getElementById('current-time-display');
    if (timeSlider) {
        timeSlider.addEventListener('input', () => {
            appState.currentTimeIndex = parseInt(timeSlider.value);
            if (timeDisplay) timeDisplay.textContent = timeLabels[appState.currentTimeIndex];
        });
    }

    document.getElementById('btn-open')?.addEventListener('click', () => alert('Открытие сценария...'));
    document.getElementById('btn-add')?.addEventListener('click', () => alert('Добавление нового сценария'));
    document.getElementById('btn-compare')?.addEventListener('click', () => alert('Сравнение сценариев'));

    // ПРОСТОЙ ПОИСК АДРЕСА
    const searchBtn = document.getElementById('search-btn');
    const searchInput = document.getElementById('search-input');

    if (searchBtn && searchInput) {
        searchBtn.addEventListener('click', () => {
            const query = searchInput.value.trim();
            if (query) searchAddress(query);
        });

        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const query = searchInput.value.trim();
                if (query) searchAddress(query);
            }
        });
    }
}



async function loadSubstances() {
    const substances = await apiCall('/api/substances');
    if (substances && substances.length > 0) {
        const coSubstance = substances.find(s => s.short_name === 'CO') || substances[0];
        appState.currentSubstanceId = coSubstance.id;
        appState.currentSubstanceName = coSubstance.short_name;
    }
}

async function loadSourcesFromDB() {
    const allSources = await apiCall('/api/sources');
    if (!allSources) return;

    console.log('Загружены все источники:', allSources.length);
    console.log('Текущее вещество ID:', appState.currentSubstanceId);

    appState.sources = allSources
        .filter(source => source.substance_id === appState.currentSubstanceId)
        .map(source => ({
            id: source.id,
            name: source.name || `Источник ${source.id}`,
            type: source.type,
            lat: source.latitude,
            lng: source.longitude,
            coordinates: source.coordinates,
            emissionRate: source.emission_rate || 3.7,
            height: source.height || 40,
            category: source.category || 'industrial'
        }));

    console.log('Отфильтровано источников:', appState.sources.length);

    if (monitoringMap && MapGraphics && MapGraphics.drawSources) {
        MapGraphics.drawSources(monitoringMap, appState.sources);
    }

    updateSourcesList();
    updateOverlaySourcesList();
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
    const container = document.getElementById('sources-list');
    if (!container) return;

    if (!isSimulatorMode || !isLoggedIn) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = '';

    if (appState.sources.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#64748b; padding:20px;">Нет источников</p>';
        return;
    }

    const categoryNames = {
        'industrial': '🏭 Промышленный',
        'domestic': '🏠 Бытовой',
        'transport': '🚗 Транспортный'
    };

    const typeNames = {
        'point': 'Точечный',
        'line': 'Линейный',
        'polygon': 'Площадной'
    };

    appState.sources.forEach(source => {
        const div = document.createElement('div');
        div.className = 'source-item';
        div.innerHTML = `
            <div class="source-info">
                <strong>${escapeHtml(source.name)}</strong>
                <div>
                    <small>${typeNames[source.type] || source.type} • ${source.emissionRate} г/с</small>
                    <span style="display:inline-block; padding:2px 6px; border-radius:4px; font-size:10px; margin-left:6px; background:#e2e8f0;">${categoryNames[source.category] || source.category}</span>
                </div>
                <small>Высота: ${source.height} м</small>
            </div>
            <div class="source-actions">
                <button onclick="flyToSource(${source.id})" class="small-btn" title="Показать">📍</button>
                <button onclick="deleteSource(${source.id})" class="small-btn danger" title="Удалить">🗑️</button>
            </div>
        `;
        container.appendChild(div);
    });
}

window.deleteSource = async function (sourceId) {
    if (!confirm('Удалить этот источник?')) return;

    const result = await deleteSourceFromDB(sourceId);
    if (result && result.success !== false) {
        await loadSourcesFromDB();
        if (MapGraphics && MapGraphics.refreshPollutionLayer) {
            MapGraphics.refreshPollutionLayer(monitoringMap, appState.currentSubstanceId);
        }
        alert('Источник удален');
    } else {
        alert('Ошибка при удалении');
    }
};

window.flyToSource = function (sourceId) {
    const source = appState.sources.find(s => s.id === sourceId);
    if (!source || !monitoringMap) return;

    let center;
    if (source.type === 'point' && source.lat && source.lng) {
        center = [source.lat, source.lng];
    } else if (source.coordinates && source.coordinates.length > 0) {
        center = source.coordinates[0];
    } else {
        return;
    }

    monitoringMap.panTo(center, { duration: 800 });
    setTimeout(() => monitoringMap.setZoom(15, { duration: 500 }), 400);
};

async function apiCall(url, options = {}) {
    try {
        const response = await fetch(url, {
            headers: { 'Content-Type': 'application/json' },
            ...options
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        return text ? JSON.parse(text) : { success: true };
    } catch (error) {
        console.error('API Error:', error);
        return null;
    }
}

function getSubstanceId(name) {
    const map = { "SO2": 1, "NO": 2, "NO2": 3, "CO": 4, "H2S": 5, "PM25": 6, "PM10": 7 };
    return map[name] || 4;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function (m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function generateScenarioName() {
    const now = new Date();
    const login = localStorage.getItem('user_login') || 'Гость';
    const date = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const storageKey = `scenario_count_${date}_${login}`;
    let scenarioNumber = parseInt(localStorage.getItem(storageKey) || '0');
    scenarioNumber++;
    localStorage.setItem(storageKey, scenarioNumber.toString());
    return `${login} ${date} №${scenarioNumber}`;
}

function initNewOverlay() {
    const scenarioNameEl = document.getElementById('scenario-name');
    if (scenarioNameEl) {
        scenarioNameEl.textContent = generateScenarioName();
    }

    document.querySelectorAll('.collapse-header').forEach(header => {
        header.addEventListener('click', () => {
            const section = header.closest('.collapse-section');
            section.classList.toggle('expanded');
        });
    });

    const firstSection = document.querySelector('.collapse-section');
    if (firstSection) {
        firstSection.classList.add('expanded');
    }
}

function initOverlaySourceHandlers() {
    document.querySelectorAll('#sources-content .source-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#sources-content .source-type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    const startDrawBtn = document.getElementById('start-drawing-overlay-btn');
    const cancelDrawBtn = document.getElementById('cancel-drawing-overlay-btn');
    const drawingStatus = document.getElementById('drawing-status-overlay');
    const drawingStatusText = document.getElementById('drawing-status-text-overlay');

    if (startDrawBtn) {
        startDrawBtn.addEventListener('click', () => {
            const activeBtn = document.querySelector('#sources-content .source-type-btn.active');
            if (!activeBtn) {
                alert('Выберите тип источника');
                return;
            }

            currentDrawingType = activeBtn.dataset.type;
            isDrawingMode = true;
            drawingPoints = [];
            clearTempDrawings();

            if (monitoringMap) {
                monitoringMap.cursors.push('crosshair');
            }

            const typeNames = {
                'point': 'Точечный источник - кликните на карте',
                'line': 'Линейный - клики для точек, двойной клик для завершения',
                'polygon': 'Площадной - клики для контура, двойной клик для завершения'
            };

            if (drawingStatusText) drawingStatusText.textContent = typeNames[currentDrawingType];
            if (drawingStatus) drawingStatus.style.display = 'block';
            if (startDrawBtn) startDrawBtn.style.display = 'none';
            if (cancelDrawBtn) cancelDrawBtn.style.display = 'block';
        });
    }

    if (cancelDrawBtn) {
        cancelDrawBtn.addEventListener('click', () => {
            resetDrawingMode();
        });
    }
}

function initWeatherHandlers() {
    const windSpeed = document.getElementById('wind-speed');
    const windSpeedValue = document.getElementById('wind-speed-value');
    const temperature = document.getElementById('temperature');
    const temperatureValue = document.getElementById('temperature-value');
    const pressure = document.getElementById('pressure');
    const pressureValue = document.getElementById('pressure-value');
    const windDirection = document.getElementById('wind-direction');
    const compassArrow = document.getElementById('compass-arrow');

    if (windSpeed && windSpeedValue) {
        windSpeed.addEventListener('input', () => {
            windSpeedValue.textContent = parseFloat(windSpeed.value).toFixed(1);
        });
    }

    if (temperature && temperatureValue) {
        temperature.addEventListener('input', () => {
            temperatureValue.textContent = temperature.value;
        });
    }

    if (pressure && pressureValue) {
        pressure.addEventListener('input', () => {
            pressureValue.textContent = pressure.value;
        });
    }

    if (windDirection && compassArrow) {
        windDirection.addEventListener('change', () => {
            const angle = parseInt(windDirection.value);
            compassArrow.style.transform = `rotate(${angle}deg)`;
        });
        const initialAngle = parseInt(windDirection.value);
        compassArrow.style.transform = `rotate(${initialAngle}deg)`;
    }

    const applyBtn = document.getElementById('apply-weather-btn');
    if (applyBtn) {
        applyBtn.addEventListener('click', () => {
            const weatherData = {
                windDirection: parseInt(windDirection?.value || 180),
                windSpeed: parseFloat(windSpeed?.value || 3),
                temperature: parseInt(temperature?.value || 20),
                pressure: parseInt(pressure?.value || 1013),
                stabilityClass: document.getElementById('stability-class')?.value || 'D'
            };

            console.log('Применены погодные условия:', weatherData);

            if (MapGraphics && MapGraphics.drawWindVectors && monitoringMap && appState.sources) {
                MapGraphics.drawWindVectors(monitoringMap, appState.sources, weatherData.windDirection);
            }

            alert('Погодные условия применены к модели');
        });
    }
}

function initModelHandlers() {
    const calcRadius = document.getElementById('calc-radius');
    const calcRadiusValue = document.getElementById('calc-radius-value');

    if (calcRadius && calcRadiusValue) {
        calcRadius.addEventListener('input', () => {
            calcRadiusValue.textContent = calcRadius.value;
        });
    }

    const runBtn = document.getElementById('run-simulation-btn');
    if (runBtn) {
        runBtn.addEventListener('click', () => {
            const modelParams = {
                dispersionModel: document.getElementById('dispersion-model')?.value,
                gridResolution: parseInt(document.getElementById('grid-resolution')?.value || 100),
                timeStep: parseInt(document.getElementById('time-step')?.value || 60),
                calcRadius: parseInt(calcRadius?.value || 10),
                dryDeposition: document.getElementById('dry-deposition')?.checked || false,
                wetDeposition: document.getElementById('wet-deposition')?.checked || false
            };

            console.log('Запуск расчёта с параметрами:', modelParams);

            if (MapGraphics && MapGraphics.refreshPollutionLayer && monitoringMap) {
                MapGraphics.refreshPollutionLayer(monitoringMap, appState.currentSubstanceId);
            }

            alert('Расчёт запущен! Результаты появятся на карте.');
        });
    }
}

function updateOverlaySourcesList() {
    const container = document.getElementById('overlay-sources-container');
    const sourcesCount = document.getElementById('sources-count');

    if (!container) return;

    if (sourcesCount) {
        sourcesCount.textContent = appState.sources.length;
    }

    if (appState.sources.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#64748b; padding:20px;">Нет добавленных источников</p>';
        return;
    }

    const typeNames = { 'point': 'Точечный', 'line': 'Линейный', 'polygon': 'Площадной' };
    const categoryIcons = { 'industrial': '🏭', 'domestic': '🏠', 'transport': '🚗' };

    container.innerHTML = '';

    appState.sources.forEach(source => {
        const div = document.createElement('div');
        div.className = 'overlay-source-item';
        div.innerHTML = `
            <div class="overlay-source-info">
                <strong>${escapeHtml(source.name)}</strong>
                <small>${typeNames[source.type] || source.type} • ${source.emissionRate} г/с • ${categoryIcons[source.category] || ''}</small>
                <small>Высота: ${source.height} м</small>
            </div>
            <div class="overlay-source-actions">
                <button class="overlay-delete-btn" onclick="deleteSource(${source.id})">🗑️</button>
            </div>
        `;
        container.appendChild(div);
    });
}

function initSimulatorLoginToggle() {
    const simulatorToggle = document.getElementById('simulator-mode');
    const modeBlock = document.getElementById('mode-block');
    const loginBlock = document.getElementById('login-block');
    const scenariosBlock = document.getElementById('scenarios-block');

    simulatorToggle.addEventListener('change', () => {
        if (simulatorToggle.checked) {
            modeBlock.classList.add('simulator-active');
            loginBlock.style.display = 'block';
            isSimulatorMode = true;
            isLoggedIn = false;
        } else {
            modeBlock.classList.remove('simulator-active');
            loginBlock.style.display = 'none';
            scenariosBlock.style.display = 'none';
            isSimulatorMode = false;
            isLoggedIn = false;
            updateUIBasedOnMode();
        }
    });

    // Кнопка "Вход в систему"
    document.getElementById('login-btn').addEventListener('click', () => {
        const login = document.getElementById('login-input').value.trim() || 'Гость';
        localStorage.setItem('user_login', login);
        isLoggedIn = true;
        loginBlock.style.display = 'none';
        scenariosBlock.style.display = 'block';
        updateUIBasedOnMode();
        alert(`Добро пожаловать, ${login}!`);
    });
}

function initModeToggle() {
    const currentStateToggle = document.getElementById('current-state');

    if (currentStateToggle) {
        currentStateToggle.addEventListener('change', () => {
            console.log('Текущее состояние:', currentStateToggle.checked);
        });
    }
}

function updateUIBasedOnMode() {
    const leftPanel = document.querySelector('.left-panel');
    const scenarioOverlay = document.getElementById('scenario-overlay');
    const scenariosBlock = document.querySelector('.scenarios-block');
    const sourcesList = document.getElementById('sources-list');

    const isFullMode = isSimulatorMode && isLoggedIn;

    if (scenarioOverlay) {
        scenarioOverlay.style.display = isFullMode ? 'flex' : 'none';
    }

    if (scenariosBlock) {
        scenariosBlock.style.display = isFullMode ? 'block' : 'none';
    }

    if (sourcesList) {
        sourcesList.style.display = isFullMode ? 'block' : 'none';
    }

    if (!isSimulatorMode) {
        if (sourcesList) sourcesList.style.display = 'none';
    }

    updateSourcesList();
}