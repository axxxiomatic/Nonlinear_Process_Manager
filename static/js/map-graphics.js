window.MapGraphics = {
    pollutionLayer:     null,
    windVectors:        [],
    sourceGeoObjects:   [],
    currentSubstanceId: null,
    currentScenarioId:  null,

    // Текущие погодные параметры
    weatherParams: {
        wind_speed:     3.0,
        wind_direction: 180.0,
        temperature:    20.0,
        pressure:       1013.0,
        sun_brightness: 20000,   // добавлено
        cloud_density:  0        // добавлено
    },

    _buildTileUrlTemplate: function() {
        var subId = this.currentSubstanceId || 1;
        var sid   = this.currentScenarioId  || '';
        var wp    = this.weatherParams;
        var ts    = Date.now();

        return '/api/simulation/tiles/' + subId +
               '/%z/%x/%y.png' +
               '?scenario_id='    + sid +
               '&wind_speed='     + wp.wind_speed +
               '&wind_direction=' + wp.wind_direction +
               '&temperature='    + wp.temperature +
               '&pressure='       + wp.pressure +
               '&sun_brightness=' + wp.sun_brightness +   // добавлено
               '&cloud_density='  + wp.cloud_density  +   // добавлено
               '&t='              + ts;
    },

    setWeatherParams: function(params) {
        if (params.wind_speed     !== undefined) this.weatherParams.wind_speed     = params.wind_speed;
        if (params.wind_direction !== undefined) this.weatherParams.wind_direction = params.wind_direction;
        if (params.temperature    !== undefined) this.weatherParams.temperature    = params.temperature;
        if (params.pressure       !== undefined) this.weatherParams.pressure       = params.pressure;
        if (params.sun_brightness !== undefined) this.weatherParams.sun_brightness = params.sun_brightness; // добавлено
        if (params.cloud_density  !== undefined) this.weatherParams.cloud_density  = params.cloud_density;   // добавлено
    },

    refreshPollutionLayer: function(map, newSubstanceId, newScenarioId, weatherParams) {
        if (newSubstanceId !== undefined && newSubstanceId !== null) {
            this.currentSubstanceId = newSubstanceId;
        }
        if (newScenarioId !== undefined) {
            this.currentScenarioId = newScenarioId || null;
        }
        if (weatherParams) {
            this.setWeatherParams(weatherParams);
        }

        if (this.pollutionLayer) {
            map.layers.remove(this.pollutionLayer);
            this.pollutionLayer = null;
        }

        if (!this.currentScenarioId) return;

        var tileUrl = this._buildTileUrlTemplate();
        this.pollutionLayer = new ymaps.Layer(tileUrl, {
            tileTransparent: true,
            zIndex:   5000,
            minZoom:  9,
            maxZoom:  19
        });
        map.layers.add(this.pollutionLayer);
    },

    clearSources: function(map) {
        this.sourceGeoObjects.forEach(function(obj) {
            map.geoObjects.remove(obj);
        });
        this.sourceGeoObjects = [];
    },

    drawSources: function(map, sources) {
        this.clearSources(map);
        var self = this;

        sources.forEach(function(source) {
            var geoObj;
            var balloonContent =
                '<b>' + source.name + '</b><br>' +
                'Тип: '    + source.type        + '<br>' +
                'Выброс: ' + source.emissionRate + ' г/с<br>' +
                'Высота: ' + source.height       + ' м';

            if (source.type === 'point' || !source.coordinates) {
                geoObj = new ymaps.Placemark(
                    [source.lat, source.lng],
                    { balloonContent: balloonContent },
                    { preset: 'islands#redIcon' }
                );
            } else if (source.type === 'line') {
                geoObj = new ymaps.Polyline(
                    source.coordinates,
                    { balloonContent: balloonContent },
                    { strokeColor: '#2c3e50', strokeWidth: 4, strokeOpacity: 0.7 }
                );
            } else if (source.type === 'polygon') {
                geoObj = new ymaps.Polygon(
                    [source.coordinates],
                    { balloonContent: balloonContent },
                    {
                        fillColor:     '#2c3e50',
                        fillOpacity:   0.25,
                        strokeColor:   '#2c3e50',
                        strokeWidth:   3,
                        strokeOpacity: 0.7
                    }
                );
            }

            if (geoObj) {
                map.geoObjects.add(geoObj);
                self.sourceGeoObjects.push(geoObj);
                source.placemark = geoObj;
            }
        });
    },

    drawWindVectors: function(map, sources, windDirection) {
        this.windVectors.forEach(function(pm) {
            map.geoObjects.remove(pm);
        });
        this.windVectors = [];

        var self = this;
        sources.forEach(function(source) {
            if (!source.lat || !source.lng) return;

            var plumeDir = (windDirection + 180) % 360;
            var dirRad   = (plumeDir * Math.PI) / 180;
            var length   = 1500;

            var dLat = (length * Math.cos(dirRad)) / 111000;
            var dLng = (length * Math.sin(dirRad)) /
                       (111000 * Math.cos(source.lat * Math.PI / 180));

            var polyline = new ymaps.Polyline(
                [
                    [source.lat, source.lng],
                    [source.lat + dLat, source.lng + dLng]
                ],
                {},
                { strokeColor: '#3498db', strokeWidth: 3, strokeOpacity: 0.8 }
            );

            map.geoObjects.add(polyline);
            self.windVectors.push(polyline);
        });
    }
};