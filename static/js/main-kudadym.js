/* =============================================================
   main-kudadym.js
   ============================================================= */

var monitoringMap      = null;
var isDrawingMode      = false;
var currentDrawingType = null;
var drawingPoints      = [];
var tempLineObject     = null;
var tempPolygonObject  = null;
var isSimulatorMode    = false;
var isLoggedIn         = false;

var appState = {
    currentSubstanceId:   null,
    currentSubstanceName: null,
    currentScenarioId:    null,
    currentScenarioName:  null,
    substances:           [],
    sources:              [],
    currentTimeIndex:     5
};

var timeLabels = [
    '14:00','14:30','15:00','15:30',
    '16:00','16:30','17:00','17:30',
    '18:00','18:30'
];

// ── Токен ────────────────────────────────────────────────────
function getToken()        { return localStorage.getItem('access_token'); }
function setToken(t)       { localStorage.setItem('access_token', t); }
function clearToken()      { localStorage.removeItem('access_token'); }
function isAuthenticated() { return !!getToken(); }

function getUserIdFromToken() {
    var token = getToken();
    if (!token) return null;
    try {
        var parts = token.split('.');
        if (parts.length < 2) return null;
        return JSON.parse(atob(parts[1])).user_id || null;
    } catch(e) { return null; }
}

function getUserNameFromToken() {
    var token = getToken();
    if (!token) return null;
    try {
        var payload = JSON.parse(atob(token.split('.')[1]));
        return payload.first_name || payload.email || 'Пользователь';
    } catch(e) { return null; }
}

// ── Точка входа ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
    console.log('=== DOMContentLoaded ===');
    loadSubstancesFromDB();
    initYandexMap();
    initSimulatorLoginToggle();
    initAuthForms();
    initEventListeners();
    initOverlaySourceHandlers();
    initWeatherHandlers();
    initModelHandlers();
    initCollapseHandlers();
    console.log('=== Инициализация завершена ===');
});

function el(id) {
    var e = document.getElementById(id);
    if (!e) console.warn('Не найден: #' + id);
    return e;
}

// ── API ──────────────────────────────────────────────────────
function apiCall(url, options) {
    options = options || {};
    var headers = { 'Content-Type': 'application/json' };
    var token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (options.headers) {
        Object.keys(options.headers).forEach(function(k) {
            headers[k] = options.headers[k];
        });
    }
    var fetchOptions = {};
    Object.keys(options).forEach(function(k) { fetchOptions[k] = options[k]; });
    fetchOptions.headers = headers;

    return fetch(url, fetchOptions).then(function(response) {
        if (response.status === 401) {
            clearToken();
            isLoggedIn = false;
            console.warn('401 на ' + url);
            if (isSimulatorMode) {
                var sb = el('scenarios-block');
                var lb = el('login-block');
                if (sb) sb.style.display = 'none';
                if (lb) lb.style.display = 'block';
            }
            return null;
        }
        if (!response.ok) {
            return response.text().then(function(txt) {
                console.error('API ' + response.status + ' на ' + url + ':', txt);
                return null;
            });
        }
        return response.text().then(function(txt) {
            if (!txt) return { success: true };
            try { return JSON.parse(txt); }
            catch(e) { return null; }
        });
    }).catch(function(err) {
        console.error('fetch error ' + url + ':', err);
        return null;
    });
}

function apiLogin(email, password) {
    var body = new URLSearchParams({ username: email, password: password });
    return fetch('/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    body.toString()
    }).then(function(r) {
        if (!r.ok) { console.error('Логин статус:', r.status); return null; }
        return r.json();
    }).catch(function(e) { console.error('apiLogin:', e); return null; });
}

function apiRegister(userData) {
    return fetch('/users/', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(userData)
    }).then(function(r) {
        if (!r.ok) {
            return r.text().then(function(t) {
                console.error('Регистрация:', t); return null;
            });
        }
        return r.json();
    }).catch(function(e) { console.error('apiRegister:', e); return null; });
}

// ── Погода → бэкенд ──────────────────────────────────────────
function applyWeatherToBackend() {
    var windSpeed = parseFloat((el('wind-speed')     || {value: 3}).value);
    var windDir   = parseFloat((el('wind-direction') || {value: 180}).value);
    var temp      = parseFloat((el('temperature')    || {value: 20}).value);
    var pressure  = parseFloat((el('pressure')       || {value: 1013}).value);
    var sunBright = parseFloat((el('sun-brightness') || {value: 20000}).value); // добавлено
    var cloudDens = parseInt(  (el('cloud-density')  || {value: 0}).value, 10);  // добавлено

    var params = {
        wind_speed:     windSpeed,
        wind_direction: windDir,
        temperature:    temp,
        pressure:       pressure,
        sun_brightness: sunBright,   // добавлено
        cloud_density:  cloudDens    // добавлено
    };

    console.log('Применяю погоду к тайлам:', params);

    if (monitoringMap && window.MapGraphics && appState.currentScenarioId) {
        MapGraphics.refreshPollutionLayer(
            monitoringMap,
            appState.currentSubstanceId,
            appState.currentScenarioId,
            params
        );

        if (MapGraphics.drawWindVectors && appState.sources.length > 0) {
            MapGraphics.drawWindVectors(monitoringMap, appState.sources, windDir);
        }
    }
}

// ── Яндекс.Карта ─────────────────────────────────────────────
function initYandexMap() {
    if (typeof ymaps === 'undefined') {
        setTimeout(initYandexMap, 300);
        return;
    }
    ymaps.ready(function() {
        if (!document.getElementById('map')) return;
        monitoringMap = new ymaps.Map('map', {
            center:   [55.978746, 37.204738],
            zoom:     13,
            controls: ['zoomControl']
        });
        monitoringMap.events.add('click',    onMapClick);
        monitoringMap.events.add('dblclick', onMapDoubleClick);
        console.log('Карта готова');
    });
}

// ── Рисование ────────────────────────────────────────────────
function onMapClick(e) {
    if (!isDrawingMode) return;
    var coords = e.get('coords');
    drawingPoints.push(coords);
    if      (currentDrawingType === 'point')   finishDrawing();
    else if (currentDrawingType === 'line')    updateTempLine();
    else if (currentDrawingType === 'polygon') updateTempPolygon();
}

function onMapDoubleClick(e) {
    if (!isDrawingMode) return;
    if (currentDrawingType === 'line' || currentDrawingType === 'polygon') {
        e.preventDefault();
        finishDrawing();
    }
}

function updateTempLine() {
    if (tempLineObject) monitoringMap.geoObjects.remove(tempLineObject);
    if (drawingPoints.length >= 2) {
        tempLineObject = new ymaps.Polyline(drawingPoints, {}, {
            strokeColor: '#00c853', strokeWidth: 4, strokeOpacity: 0.8
        });
        monitoringMap.geoObjects.add(tempLineObject);
    }
}

function updateTempPolygon() {
    if (tempPolygonObject) monitoringMap.geoObjects.remove(tempPolygonObject);
    if (drawingPoints.length >= 3) {
        var closed = drawingPoints.concat([drawingPoints[0]]);
        tempPolygonObject = new ymaps.Polygon([closed], {}, {
            fillColor: '#00c853', fillOpacity: 0.3,
            strokeColor: '#00c853', strokeWidth: 3
        });
        monitoringMap.geoObjects.add(tempPolygonObject);
    }
}

function clearTempDrawings() {
    if (!monitoringMap) return;
    if (tempLineObject) {
        monitoringMap.geoObjects.remove(tempLineObject);
        tempLineObject = null;
    }
    if (tempPolygonObject) {
        monitoringMap.geoObjects.remove(tempPolygonObject);
        tempPolygonObject = null;
    }
}

function resetDrawingMode() {
    isDrawingMode      = false;
    currentDrawingType = null;
    drawingPoints      = [];
    clearTempDrawings();

    var startBtn  = el('start-drawing-overlay-btn');
    var cancelBtn = el('cancel-drawing-overlay-btn');
    var statusDiv = el('drawing-status-overlay');
    if (startBtn)  startBtn.style.display  = 'block';
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (statusDiv) statusDiv.style.display = 'none';
    if (monitoringMap) monitoringMap.cursors.push('arrow');
}

function finishDrawing() {
    if (drawingPoints.length === 0) { resetDrawingMode(); return; }

    if (!appState.currentScenarioId) {
        alert('Сначала откройте или создайте сценарий');
        resetDrawingMode();
        return;
    }

    var nameEl       = el('overlay-source-name');
    var name         = nameEl ? nameEl.value.trim() : '';
    if (!name) { alert('Введите название источника'); return; }

    var height       = parseFloat((el('overlay-source-height')   || {value:0}).value);
    var emissionRate = parseFloat((el('overlay-source-emission')  || {value:0}).value);
    var category     = (el('overlay-source-category')            || {value:'industrial'}).value;
    var substanceId  = parseInt((el('overlay-source-substance')  || {value:0}).value);

    if (!height || height <= 0)             { alert('Высота должна быть положительным числом'); return; }
    if (!emissionRate || emissionRate <= 0) { alert('Интенсивность должна быть положительным числом'); return; }

    var sourceData = {
        name:          name,
        type:          currentDrawingType,
        height:        height,
        emission_rate: emissionRate,
        substance_id:  substanceId,
        scenario_id:   appState.currentScenarioId,
        category:      category,
        latitude:      drawingPoints[0][0],
        longitude:     drawingPoints[0][1],
        coordinates:   currentDrawingType !== 'point' ? drawingPoints : null
    };

    apiCall('/api/sources/', {
        method: 'POST',
        body:   JSON.stringify(sourceData)
    }).then(function(result) {
        if (result) {
            if (nameEl) nameEl.value = '';
            resetDrawingMode();
            loadSourcesForCurrentScenario();
            if (monitoringMap && window.MapGraphics && appState.currentScenarioId) {
                MapGraphics.refreshPollutionLayer(
                    monitoringMap,
                    appState.currentSubstanceId,
                    appState.currentScenarioId
                );
            }
        } else {
            alert('Ошибка при добавлении источника');
        }
    });
}

// ── Поиск ────────────────────────────────────────────────────
function searchAddress(query) {
    if (!monitoringMap || typeof ymaps === 'undefined') return;
    ymaps.geocode(query, { results: 1 }).then(function(res) {
        if (res.geoObjects.getLength() > 0) {
            var first  = res.geoObjects.get(0);
            var coords = first.geometry.getCoordinates();
            monitoringMap.setCenter(coords, 16);
            if (window._searchPm) monitoringMap.geoObjects.remove(window._searchPm);
            window._searchPm = new ymaps.Placemark(coords,
                { balloonContent: first.getAddressLine() });
            monitoringMap.geoObjects.add(window._searchPm);
            window._searchPm.balloon.open();
        } else {
            alert('Ничего не найдено: ' + query);
        }
    });
}

// ── Вещества ─────────────────────────────────────────────────
function loadSubstancesFromDB() {
    var bar = el('pollutants-bar');
    fetch('/api/substances').then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    }).then(function(substances) {
        if (!substances || substances.length === 0) {
            if (bar) bar.innerHTML = '<span style="color:#aaa;">Нет данных</span>';
            return;
        }
        appState.substances = substances;
        var def = null;
        for (var i = 0; i < substances.length; i++) {
            if (substances[i].short_name === 'CO') { def = substances[i]; break; }
        }
        if (!def) def = substances[0];
        appState.currentSubstanceId   = def.id;
        appState.currentSubstanceName = def.short_name;
        renderPollutantsBar(substances, def.id);
        fillSubstanceSelect(substances, def.id);
    }).catch(function(e) {
        console.error('Вещества:', e);
        if (bar) bar.innerHTML = '<span style="color:#e74c3c;">Ошибка</span>';
    });
}

function renderPollutantsBar(substances, activeId) {
    var bar = el('pollutants-bar');
    if (!bar) return;
    bar.innerHTML = '';
    substances.forEach(function(s) {
        var span = document.createElement('span');
        span.textContent = s.short_name;
        span.title       = s.name;
        if (s.id === activeId) span.classList.add('active');
        span.addEventListener('click', function() {
            bar.querySelectorAll('span').forEach(function(x) { x.classList.remove('active'); });
            span.classList.add('active');
            appState.currentSubstanceId   = s.id;
            appState.currentSubstanceName = s.short_name;
            var sel = el('overlay-source-substance');
            if (sel) sel.value = s.id;
            if (appState.currentScenarioId && window.MapGraphics) {
                MapGraphics.refreshPollutionLayer(monitoringMap, s.id, appState.currentScenarioId);
            }
            if (appState.currentScenarioId) loadSourcesForCurrentScenario();
        });
        bar.appendChild(span);
    });
}

function fillSubstanceSelect(substances, selectedId) {
    var sel = el('overlay-source-substance');
    if (!sel) return;
    sel.innerHTML = '';
    substances.forEach(function(s) {
        var opt = document.createElement('option');
        opt.value    = s.id;
        opt.text     = s.short_name + ' — ' + s.name;
        opt.selected = (s.id === selectedId);
        sel.appendChild(opt);
    });
}

// ── Тоггл режима симулятора ───────────────────────────────────
function initSimulatorLoginToggle() {
    var toggle     = el('simulator-mode');
    var modeBlock  = el('mode-block');
    var loginBlock = el('login-block');
    var scenBlock  = el('scenarios-block');

    if (!toggle) { console.error('#simulator-mode не найден!'); return; }

    toggle.addEventListener('change', function() {
        if (toggle.checked) {
            if (modeBlock) modeBlock.classList.add('simulator-active');
            isSimulatorMode = true;

            if (isAuthenticated()) {
                isLoggedIn = true;
                if (loginBlock) loginBlock.style.display = 'none';
                if (scenBlock)  scenBlock.style.display  = 'block';
                showLogoutBlock();
                updateUIBasedOnMode();
            } else {
                var fl = el('form-login');
                var fr = el('form-register');
                if (fl) fl.style.display = 'block';
                if (fr) fr.style.display = 'none';
                if (loginBlock) loginBlock.style.display = 'block';
                if (scenBlock)  scenBlock.style.display  = 'none';
                isLoggedIn = false;
            }
        } else {
            if (modeBlock)  modeBlock.classList.remove('simulator-active');
            if (loginBlock) loginBlock.style.display = 'none';
            if (scenBlock)  scenBlock.style.display  = 'none';

            var overlay = el('scenario-overlay');
            if (overlay) overlay.style.display = 'none';

            hideLogoutBlock();
            isSimulatorMode            = false;
            isLoggedIn                 = false;
            appState.currentScenarioId = null;
            appState.sources           = [];

            if (window.MapGraphics && monitoringMap) {
                MapGraphics.refreshPollutionLayer(monitoringMap, appState.currentSubstanceId, null);
                if (MapGraphics.clearSources) MapGraphics.clearSources(monitoringMap);
            }

            showScenariosView();
        }
    });
}

// ── Выход / вход UI ──────────────────────────────────────────
function showLogoutBlock() {
    var logoutBlock = el('logout-block');
    var userLabel   = el('user-info-label');
    if (!logoutBlock) return;

    var name = 'Пользователь';
    try {
        var token = getToken();
        if (token) {
            var payload = JSON.parse(atob(token.split('.')[1]));
            if (payload.first_name) name = payload.first_name;
        }
    } catch(e) {}

    if (userLabel) userLabel.textContent = '👤 ' + name;
    logoutBlock.style.display = 'block';
}

function hideLogoutBlock() {
    var logoutBlock = el('logout-block');
    if (logoutBlock) logoutBlock.style.display = 'none';
}

// ── Авторизация ───────────────────────────────────────────────
function initAuthForms() {
    var goReg  = el('go-register-btn');
    var goLog  = el('go-login-btn');
    var addGrp = el('add-group-btn');
    var logBtn = el('login-submit-btn');
    var regBtn = el('register-submit-btn');
    var pwdFld = el('login-password');
    var logOut = el('logout-btn');
    var roleEl = el('reg-role');

    if (goReg) goReg.addEventListener('click', function() {
        var fl = el('form-login'); var fr = el('form-register');
        if (fl) fl.style.display = 'none';
        if (fr) fr.style.display = 'block';
        clearAuthErrors();
    });

    if (goLog) goLog.addEventListener('click', function() {
        var fl = el('form-login'); var fr = el('form-register');
        if (fr) fr.style.display = 'none';
        if (fl) fl.style.display = 'block';
        clearAuthErrors();
    });

    if (roleEl) {
        roleEl.addEventListener('change', function() {
            updateGroupsUIForRole(roleEl.value);
        });
        updateGroupsUIForRole(roleEl.value);
    }

    if (addGrp) {
        addGrp.addEventListener('click', function() {
            var container = el('groups-container');
            if (!container) return;
            var row = document.createElement('div');
            row.className = 'group-row';
            row.innerHTML =
                '<input type="text" class="group-input" placeholder="например: ИБ-102">' +
                '<button type="button" class="btn-remove-group">✕</button>';
            row.querySelector('.btn-remove-group').addEventListener('click', function() {
                row.remove();
            });
            container.appendChild(row);
        });
    }

    if (logBtn) logBtn.addEventListener('click', handleLogin);
    if (regBtn) regBtn.addEventListener('click', handleRegister);
    if (pwdFld) pwdFld.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') handleLogin();
    });
    if (logOut) logOut.addEventListener('click', handleLogout);
}

function updateGroupsUIForRole(role) {
    var addGrpBtn   = el('add-group-btn');
    var groupsLabel = el('groups-label');
    var groupsBlock = el('groups-block');

    if (role === 'professor') {
        if (addGrpBtn)   addGrpBtn.style.display   = 'block';
        if (groupsLabel) groupsLabel.innerHTML =
            'Группы для ведения <span class="optional">(необязательно)</span>';
    } else {
        if (addGrpBtn) addGrpBtn.style.display = 'none';
        if (groupsLabel) groupsLabel.innerHTML =
            'Группа <span class="required">*</span>';

        var container = el('groups-container');
        if (container) {
            var rows = container.querySelectorAll('.group-row');
            for (var i = 1; i < rows.length; i++) {
                rows[i].remove();
            }
        }
    }
}

function handleLogout() {
    if (!confirm('Выйти из аккаунта?')) return;

    clearToken();
    isLoggedIn = false;
    appState.currentScenarioId = null;
    appState.sources = [];

    var overlay   = el('scenario-overlay');
    var scenBlock = el('scenarios-block');
    var srcList   = el('sources-list');
    var backBtn   = el('back-to-scenarios-btn');
    var loginBlock = el('login-block');
    var fl = el('form-login');
    var fr = el('form-register');

    if (overlay)   overlay.style.display   = 'none';
    if (srcList)   srcList.style.display   = 'none';
    if (backBtn)   backBtn.style.display   = 'none';
    if (scenBlock) scenBlock.style.display = 'none';

    if (fl) fl.style.display = 'block';
    if (fr) fr.style.display = 'none';
    if (loginBlock) loginBlock.style.display = 'block';

    hideLogoutBlock();
    clearAuthErrors();

    if (window.MapGraphics && monitoringMap) {
        MapGraphics.refreshPollutionLayer(monitoringMap, appState.currentSubstanceId, null);
        if (MapGraphics.clearSources) MapGraphics.clearSources(monitoringMap);
    }

    console.log('Выход выполнен');
}

function handleLogin() {
    var emailEl = el('login-email');
    var passEl  = el('login-password');
    var errEl   = el('login-error');
    var btn     = el('login-submit-btn');

    var email    = emailEl ? emailEl.value.trim() : '';
    var password = passEl  ? passEl.value         : '';

    if (!email || !password) { showAuthError(errEl, 'Введите email и пароль'); return; }
    if (btn) { btn.disabled = true; btn.textContent = 'Вход…'; }

    apiLogin(email, password).then(function(tokenData) {
        if (btn) { btn.disabled = false; btn.textContent = 'Войти'; }
        if (!tokenData || !tokenData.access_token) {
            showAuthError(errEl, 'Неверный email или пароль');
            return;
        }
        setToken(tokenData.access_token);
        isLoggedIn = true;

        var lb = el('login-block');
        var sb = el('scenarios-block');
        if (lb) lb.style.display = 'none';
        if (sb) sb.style.display = 'block';

        showLogoutBlock();
        clearAuthErrors();
        updateUIBasedOnMode();
        console.log('Вход выполнен!');
    });
}

function handleRegister() {
    var errEl = el('register-error');
    var btn   = el('register-submit-btn');

    var firstName  = (el('reg-firstname')        || {value:''}).value.trim();
    var lastName   = (el('reg-lastname')         || {value:''}).value.trim();
    var patronymic = (el('reg-patronymic')       || {value:''}).value.trim();
    var email      = (el('reg-email')            || {value:''}).value.trim();
    var password   = (el('reg-password')         || {value:''}).value;
    var passConf   = (el('reg-password-confirm') || {value:''}).value;
    var roleEl     = el('reg-role');
    var role       = roleEl ? roleEl.value : 'student';

    var groups = [];
    document.querySelectorAll('.group-input').forEach(function(inp) {
        var v = inp.value.trim();
        if (v) groups.push(v);
    });

    if (!firstName || !lastName) {
        showAuthError(errEl, 'Введите имя и фамилию'); return;
    }
    if (!email) {
        showAuthError(errEl, 'Введите email'); return;
    }
    if (!password) {
        showAuthError(errEl, 'Введите пароль'); return;
    }
    if (password !== passConf) {
        showAuthError(errEl, 'Пароли не совпадают'); return;
    }

    if (role === 'student') {
        if (groups.length === 0) {
            showAuthError(errEl, 'Укажите вашу группу'); return;
        }
        if (groups.length > 1) {
            showAuthError(errEl, 'Студент может быть только в одной группе'); return;
        }
    }

    if (groups.length === 0) {
        if (role === 'professor') {
            groups = [''];
        }
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Регистрация…'; }

    apiRegister({
        first_name: firstName,
        last_name:  lastName,
        patronymic: patronymic || null,
        email:      email,
        password:   password,
        role:       role,
        group:      groups
    }).then(function(result) {
        if (btn) { btn.disabled = false; btn.textContent = 'Зарегистрироваться'; }

        if (!result) {
            showAuthError(errEl, 'Ошибка регистрации. Возможно, email уже занят.');
            return;
        }

        return apiLogin(email, password).then(function(tokenData) {
            if (tokenData && tokenData.access_token) {
                setToken(tokenData.access_token);
                isLoggedIn = true;
                var lb = el('login-block');
                var sb = el('scenarios-block');
                if (lb) lb.style.display = 'none';
                if (sb) sb.style.display = 'block';
                showLogoutBlock();
                clearAuthErrors();
                updateUIBasedOnMode();
                alert('Добро пожаловать, ' + firstName + '!');
            } else {
                var fl = el('form-login'); var fr = el('form-register');
                if (fr) fr.style.display = 'none';
                if (fl) fl.style.display = 'block';
                var le = el('login-email');
                if (le) le.value = email;
                showAuthError(el('login-error'), 'Аккаунт создан. Войдите в систему.');
            }
        });
    });
}

function showAuthError(elArg, msg) {
    if (!elArg) return;
    elArg.textContent = msg;
    elArg.style.display = 'block';
}

function clearAuthErrors() {
    ['login-error','register-error'].forEach(function(id) {
        var e = el(id);
        if (e) { e.textContent = ''; e.style.display = 'none'; }
    });
}

// ── Сценарии ──────────────────────────────────────────────────
function onOpenScenarios() {
    var dropdown = el('scenarios-dropdown');
    var listEl   = el('scenarios-list');
    if (!dropdown || !listEl) return;

    if (dropdown.style.display === 'block') {
        dropdown.style.display = 'none';
        return;
    }

    listEl.innerHTML       = '<p style="padding:10px;color:#64748b;">Загрузка…</p>';
    dropdown.style.display = 'block';

    apiCall('/scenarios/').then(function(scenarios) {
        if (!scenarios) {
            listEl.innerHTML = '<p style="padding:10px;color:#e74c3c;">Ошибка загрузки</p>';
            return;
        }
        if (scenarios.length === 0) {
            listEl.innerHTML = '<p style="padding:10px;color:#64748b;">Нет доступных сценариев</p>';
            return;
        }

        listEl.innerHTML = '';
        scenarios.forEach(function(sc) {
            if (!sc.id) { console.warn('Сценарий без id:', sc); return; }

            var item = document.createElement('div');
            item.className = 'scenario-list-item';

            var dateStr = sc.created_at
                ? new Date(sc.created_at).toLocaleDateString('ru-RU', {
                    day: '2-digit', month: '2-digit', year: 'numeric'
                  })
                : '—';
            var owner = sc.user
                ? (sc.user.last_name + ' ' + sc.user.first_name)
                : '';

            item.innerHTML =
                '<div class="scenario-item-body">' +
                    '<div class="scenario-item-name">' + escapeHtml(sc.name) + '</div>' +
                    '<div class="scenario-item-meta">' +
                        (owner ? '<span class="sc-owner">👤 ' + escapeHtml(owner) + '</span>' : '') +
                        '<span class="sc-date">📅 ' + dateStr + '</span>' +
                    '</div>' +
                '</div>' +
                '<div class="scenario-item-actions">' +
                    '<button class="sc-open-btn" title="Открыть">▶</button>' +
                    '<button class="sc-delete-btn" title="Удалить">🗑️</button>' +
                '</div>';

            (function(scenario, itemEl) {
                itemEl.querySelector('.sc-open-btn').addEventListener('click', function(e) {
                    e.stopPropagation();
                    dropdown.style.display = 'none';
                    openScenario(scenario);
                });
                itemEl.querySelector('.sc-delete-btn').addEventListener('click', function(e) {
                    e.stopPropagation();
                    deleteScenario(scenario.id, scenario.name, itemEl);
                });
                itemEl.querySelector('.scenario-item-body').addEventListener('click', function() {
                    dropdown.style.display = 'none';
                    openScenario(scenario);
                });
            })(sc, item);

            listEl.appendChild(item);
        });
    });
}

function deleteScenario(scenarioId, scenarioName, itemEl) {
    if (!confirm('Удалить сценарий «' + scenarioName + '»?\nВсе источники будут удалены.')) return;

    apiCall('/scenarios/' + scenarioId, { method: 'DELETE' }).then(function(res) {
        if (res !== null) {
            if (appState.currentScenarioId === scenarioId) {
                appState.currentScenarioId   = null;
                appState.currentScenarioName = null;
                appState.sources             = [];
                var overlay = el('scenario-overlay');
                if (overlay) overlay.style.display = 'none';
                showScenariosView();
                if (window.MapGraphics && monitoringMap) {
                    MapGraphics.refreshPollutionLayer(monitoringMap, appState.currentSubstanceId, null);
                    if (MapGraphics.clearSources) MapGraphics.clearSources(monitoringMap);
                }
            }
            if (itemEl && itemEl.parentNode) itemEl.parentNode.removeChild(itemEl);
            var listEl = el('scenarios-list');
            if (listEl && listEl.children.length === 0) {
                listEl.innerHTML = '<p style="padding:10px;color:#64748b;">Нет доступных сценариев</p>';
            }
        } else {
            alert('Ошибка при удалении сценария');
        }
    });
}

function onAddScenario() {
    var userId = getUserIdFromToken();
    if (!userId) { alert('Войдите снова'); return; }

    var name = prompt('Название нового сценария:', generateScenarioName());
    if (!name || !name.trim()) return;

    apiCall('/scenarios/', {
        method: 'POST',
        body:   JSON.stringify({ name: name.trim(), user_id: userId })
    }).then(function(result) {
        if (!result || !result.id) { alert('Ошибка при создании сценария'); return; }
        openScenario(result);
    });
}

function openScenario(sc) {
    console.log('Открываю сценарий:', sc);
    if (!sc || !sc.id) { console.error('Невалидный сценарий:', sc); return; }

    appState.currentScenarioId   = sc.id;
    appState.currentScenarioName = sc.name;

    var nameEl = el('scenario-name');
    if (nameEl) nameEl.textContent = sc.name;

    var overlay = el('scenario-overlay');
    if (overlay) overlay.style.display = 'flex';

    var firstSection = document.querySelector('#scenario-overlay .collapse-section');
    if (firstSection && !firstSection.classList.contains('expanded')) {
        firstSection.classList.add('expanded');
    }

    showSourcesView();

    if (monitoringMap && window.MapGraphics) {
        MapGraphics.refreshPollutionLayer(
            monitoringMap,
            appState.currentSubstanceId,
            appState.currentScenarioId
        );
    }

    loadSourcesForCurrentScenario();
}

function showScenariosView() {
    var scenBlock = el('scenarios-block');
    var srcList   = el('sources-list');
    var backBtn   = el('back-to-scenarios-btn');
    if (scenBlock) scenBlock.style.display = 'block';
    if (srcList)   srcList.style.display   = 'none';
    if (backBtn)   backBtn.style.display   = 'none';
}

function showSourcesView() {
    var scenBlock = el('scenarios-block');
    var srcList   = el('sources-list');
    var backBtn   = el('back-to-scenarios-btn');
    if (scenBlock) scenBlock.style.display = 'none';
    if (srcList)   srcList.style.display   = 'block';
    if (backBtn)   backBtn.style.display   = 'flex';
}

// ── Источники ─────────────────────────────────────────────────
function loadSourcesForCurrentScenario() {
    if (!appState.currentScenarioId) return;

    apiCall('/api/sources/').then(function(allSources) {
        if (!allSources) return;

        appState.sources = allSources
            .filter(function(s) {
                return s.scenario_id  === appState.currentScenarioId &&
                       s.substance_id === appState.currentSubstanceId;
            })
            .map(function(s) {
                return {
                    id:           s.id,
                    name:         s.name || ('Источник ' + s.id),
                    type:         s.type,
                    lat:          s.latitude,
                    lng:          s.longitude,
                    coordinates:  s.coordinates,
                    emissionRate: s.emission_rate,
                    height:       s.height,
                    category:     s.category || 'industrial',
                    substance_id: s.substance_id,
                    scenario_id:  s.scenario_id
                };
            });

        console.log('Источников:', appState.sources.length);

        if (monitoringMap && window.MapGraphics && MapGraphics.drawSources) {
            MapGraphics.drawSources(monitoringMap, appState.sources);
        }

        updateSourcesLeftPanel();
        updateOverlaySourcesList();
    });
}

window.deleteSource = function(sourceId) {
    if (!confirm('Удалить источник?')) return;
    apiCall('/api/sources/' + sourceId, { method: 'DELETE' }).then(function(res) {
        if (res !== null) {
            loadSourcesForCurrentScenario();
            if (window.MapGraphics && appState.currentScenarioId) {
                MapGraphics.refreshPollutionLayer(
                    monitoringMap,
                    appState.currentSubstanceId,
                    appState.currentScenarioId
                );
            }
        } else {
            alert('Ошибка при удалении');
        }
    });
};

window.flyToSource = function(sourceId) {
    var s = null;
    for (var i = 0; i < appState.sources.length; i++) {
        if (appState.sources[i].id === sourceId) { s = appState.sources[i]; break; }
    }
    if (!s || !monitoringMap) return;
    var center = s.type === 'point'
        ? [s.lat, s.lng]
        : (s.coordinates && s.coordinates[0]);
    if (!center) return;
    monitoringMap.panTo(center, { duration: 800 });
    setTimeout(function() { monitoringMap.setZoom(15, { duration: 500 }); }, 400);
};

// ── Левая панель: список источников ──────────────────────────
function updateSourcesLeftPanel() {
    var container = el('sources-list');
    if (!container) return;

    var header =
        '<div class="sources-panel-header">' +
            '<span class="sources-panel-title">📌 ' +
                escapeHtml(appState.currentScenarioName || 'Сценарий') +
            '</span>' +
            '<span class="sources-panel-count">' + appState.sources.length + '</span>' +
        '</div>';

    if (appState.sources.length === 0) {
        container.innerHTML = header +
            '<p style="text-align:center;color:#64748b;padding:20px;font-size:13px;">' +
            'Нет источников.<br>Добавьте источник в правой панели.</p>';
        return;
    }

    var typeNames     = { point: 'Точечный', line: 'Линейный', polygon: 'Площадной' };
    var categoryNames = { industrial: '🏭', domestic: '🏠', transport: '🚗' };
    var html = header;

    appState.sources.forEach(function(src) {
        html +=
            '<div class="source-item">' +
                '<div class="source-info">' +
                    '<strong>' + escapeHtml(src.name) + '</strong>' +
                    '<div>' +
                        '<small>' + (typeNames[src.type]||src.type) +
                        ' · ' + src.emissionRate + ' г/с</small>' +
                        '<span class="source-category-badge">' +
                            (categoryNames[src.category]||'') + '</span>' +
                    '</div>' +
                    '<small>Высота: ' + src.height + ' м</small>' +
                '</div>' +
                '<div class="source-actions">' +
                    '<button onclick="flyToSource(' + src.id + ')" ' +
                            'class="small-btn" title="Перейти">📍</button>' +
                    '<button onclick="deleteSource(' + src.id + ')" ' +
                            'class="small-btn danger" title="Удалить">🗑️</button>' +
                '</div>' +
            '</div>';
    });

    container.innerHTML = html;
}

// ── Правый оверлей: список источников ────────────────────────
function updateOverlaySourcesList() {
    var container  = el('overlay-sources-container');
    var countBadge = el('sources-count');
    if (!container) return;
    if (countBadge) countBadge.textContent = appState.sources.length;

    if (appState.sources.length === 0) {
        container.innerHTML =
            '<p style="text-align:center;color:#64748b;padding:16px;font-size:12px;">' +
            'Нет источников</p>';
        return;
    }

    var typeNames     = { point: 'Точечный', line: 'Линейный', polygon: 'Площадной' };
    var categoryIcons = { industrial: '🏭', domestic: '🏠', transport: '🚗' };

    container.innerHTML = '';
    appState.sources.forEach(function(src) {
        var div = document.createElement('div');
        div.className = 'overlay-source-item';
        div.innerHTML =
            '<div class="overlay-source-info">' +
                '<strong>' + escapeHtml(src.name) + '</strong>' +
                '<small>' + (typeNames[src.type]||src.type) +
                    ' · ' + src.emissionRate + ' г/с' +
                    ' · ' + (categoryIcons[src.category]||'') + '</small>' +
                '<small>Высота: ' + src.height + ' м</small>' +
            '</div>' +
            '<div class="overlay-source-actions">' +
                '<button class="overlay-delete-btn" ' +
                        'onclick="deleteSource(' + src.id + ')">🗑️</button>' +
            '</div>';
        container.appendChild(div);
    });
}

// ── UI ────────────────────────────────────────────────────────
function updateUIBasedOnMode() {
    var isFullMode = isSimulatorMode && isLoggedIn;
    var overlay    = el('scenario-overlay');
    var scenBlock  = el('scenarios-block');

    if (isFullMode) {
        if (appState.currentScenarioId) {
            showSourcesView();
            if (overlay) overlay.style.display = 'flex';
        } else {
            showScenariosView();
            if (overlay) overlay.style.display = 'none';
        }
    } else {
        if (scenBlock) scenBlock.style.display = 'none';
        var srcList = el('sources-list');
        if (srcList)  srcList.style.display = 'none';
        if (overlay)  overlay.style.display = 'none';
    }
}

// ── Общие обработчики ─────────────────────────────────────────
function initEventListeners() {
    var searchBtn   = el('search-btn');
    var searchInput = el('search-input');
    var timeSlider  = el('time-slider');
    var timeDisplay = el('current-time-display');
    var btnOpen     = el('btn-open');
    var btnAdd      = el('btn-add');
    var btnCompare  = el('btn-compare');
    var btnClose    = el('scenarios-dropdown-close');
    var backBtn     = el('back-to-scenarios-btn');

    if (searchBtn) searchBtn.addEventListener('click', function() {
        var q = searchInput ? searchInput.value.trim() : '';
        if (q) searchAddress(q);
    });
    if (searchInput) searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') { var q = searchInput.value.trim(); if (q) searchAddress(q); }
    });
    if (timeSlider) timeSlider.addEventListener('input', function() {
        appState.currentTimeIndex = parseInt(timeSlider.value);
        if (timeDisplay) timeDisplay.textContent = timeLabels[appState.currentTimeIndex];
    });

    if (btnOpen)    btnOpen.addEventListener('click', onOpenScenarios);
    if (btnAdd)     btnAdd.addEventListener('click', onAddScenario);
    if (btnCompare) btnCompare.addEventListener('click', function() {
        alert('Сравнение — в разработке');
    });
    if (btnClose) btnClose.addEventListener('click', function() {
        var dd = el('scenarios-dropdown');
        if (dd) dd.style.display = 'none';
    });

    if (backBtn) backBtn.addEventListener('click', function() {
        appState.currentScenarioId   = null;
        appState.currentScenarioName = null;
        appState.sources             = [];

        var overlay = el('scenario-overlay');
        if (overlay) overlay.style.display = 'none';

        if (window.MapGraphics && monitoringMap) {
            MapGraphics.refreshPollutionLayer(monitoringMap, appState.currentSubstanceId, null);
            if (MapGraphics.clearSources) MapGraphics.clearSources(monitoringMap);
        }
        showScenariosView();
    });
}

// ── Collapse ──────────────────────────────────────────────────
function initCollapseHandlers() {
    document.querySelectorAll('.collapse-header').forEach(function(header) {
        header.addEventListener('click', function() {
            var section = header.closest('.collapse-section');
            if (section) section.classList.toggle('expanded');
        });
    });
    var first = document.querySelector('.collapse-section');
    if (first) first.classList.add('expanded');
}

// ── Оверлей: тип источника + рисование ───────────────────────
function initOverlaySourceHandlers() {
    document.querySelectorAll('#sources-content .source-type-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('#sources-content .source-type-btn')
                .forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
        });
    });

    var startBtn   = el('start-drawing-overlay-btn');
    var cancelBtn  = el('cancel-drawing-overlay-btn');
    var statusDiv  = el('drawing-status-overlay');
    var statusText = el('drawing-status-text-overlay');

    if (startBtn) startBtn.addEventListener('click', function() {
        if (!appState.currentScenarioId) {
            alert('Сначала откройте или создайте сценарий'); return;
        }
        var activeBtn = document.querySelector('#sources-content .source-type-btn.active');
        if (!activeBtn) { alert('Выберите тип источника'); return; }

        currentDrawingType = activeBtn.dataset.type;
        isDrawingMode      = true;
        drawingPoints      = [];
        clearTempDrawings();
        if (monitoringMap) monitoringMap.cursors.push('crosshair');

        var hints = {
            point:   'Точечный — кликните на карте',
            line:    'Линейный — клики для точек, двойной клик завершает',
            polygon: 'Площадной — клики для контура, двойной клик завершает'
        };
        if (statusText) statusText.textContent  = hints[currentDrawingType] || '';
        if (statusDiv)  statusDiv.style.display = 'block';
        startBtn.style.display                  = 'none';
        if (cancelBtn) cancelBtn.style.display  = 'block';
    });

    if (cancelBtn) cancelBtn.addEventListener('click', resetDrawingMode);
}

// ── Погода ────────────────────────────────────────────────────
function initWeatherHandlers() {
    // Вспомогательная функция для остальных слайдеров
    function bindSlider(sliderId, valueId, fmt) {
        var s = el(sliderId);
        var v = el(valueId);
        if (s && v) {
            s.addEventListener('input', function() {
                v.textContent = fmt ? fmt(s.value) : s.value;
            });
        }
    }

    // Старые слайдеры (работают как раньше)
    bindSlider('wind-speed', 'wind-speed-value', function(v) { return parseFloat(v).toFixed(1); });
    bindSlider('temperature', 'temperature-value');
    bindSlider('pressure', 'pressure-value');
    bindSlider('calc-radius', 'calc-radius-value');

    // Яркость солнца – прямая привязка
    var sunSlider = el('sun-brightness');
    var sunValue  = el('sun-brightness-value');
    if (sunSlider && sunValue) {
        sunSlider.addEventListener('input', function() {
            sunValue.textContent = this.value;
        });
    }

    // Облачность – прямая привязка
    var cloudSlider = el('cloud-density');
    var cloudValue  = el('cloud-density-value');
    if (cloudSlider && cloudValue) {
        cloudSlider.addEventListener('input', function() {
            cloudValue.textContent = this.value;
        });
    }

    // Направление ветра и компас (без изменений)
    var windDir = el('wind-direction');
    var compass = el('compass-arrow');
    if (windDir && compass) {
        var rotate = function() {
            compass.style.transform = 'rotate(' + windDir.value + 'deg)';
        };
        windDir.addEventListener('change', rotate);
        rotate();
    }

    // Кнопка «Применить и пересчитать»
    var applyBtn = el('apply-weather-btn');
    if (applyBtn) {
        applyBtn.addEventListener('click', function() {
            if (!appState.currentScenarioId) {
                alert('Сначала откройте сценарий');
                return;
            }
            applyBtn.disabled = true;
            applyBtn.textContent = 'Применяю…';
            applyWeatherToBackend();
            setTimeout(function() {
                applyBtn.disabled = false;
                applyBtn.textContent = 'Применить и пересчитать';
            }, 500);
        });
    }
}

function initModelHandlers() {
    var runBtn = el('run-simulation-btn');
    if (runBtn) runBtn.addEventListener('click', function() {
        if (!appState.currentScenarioId) {
            alert('Сначала откройте или создайте сценарий'); return;
        }
        runBtn.disabled    = true;
        runBtn.textContent = '⏳ Расчёт…';
        applyWeatherToBackend();
        setTimeout(function() {
            runBtn.disabled    = false;
            runBtn.textContent = '🚀 Запустить расчёт';
        }, 500);
    });
}

// ── Утилиты ───────────────────────────────────────────────────
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function generateScenarioName() {
    var date = new Date().toLocaleDateString('ru-RU');
    var key  = 'sc_n_' + date;
    var n    = parseInt(localStorage.getItem(key) || '0') + 1;
    localStorage.setItem(key, n);
    return 'Сценарий ' + date + ' №' + n;
}