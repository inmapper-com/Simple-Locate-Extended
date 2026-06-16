/**
 * SimpleLocate Extended Plugin
 * 
 * Ana plugin'in üzerine ek özellikler ekler:
 * - Runtime'da özellik açma/kapama
 * - Ayarlar paneli
 * - WeiYe bilgi paneli
 * - Gelişmiş API
 * 
 * @requires leaflet-simple-locate.js
 * @version 1.4.0
 */
(function () {
    'use strict';

    if (typeof window === 'undefined') return;
    if (typeof window.L === 'undefined' || !window.L.Control) {
        console.warn('Leaflet not found. Include Leaflet before extended plugin.');
        return;
    }

    var Base = window.L.Control.SimpleLocate;
    if (!Base) {
        console.warn('SimpleLocate not found. Make sure leaflet-simple-locate.js is loaded.');
        return;
    }

    var Extended = Base.extend({
        
        initialize: function (options) {
            // Base initialize çağır
            Base.prototype.initialize.call(this, options);

            this._extendedFeatures = true;
            options = options || {};

            // Geofence ayarı
            if (options.geofence) {
                try {
                    this.setGeofence(options.geofence);
                } catch (e) {
                    console.warn('Failed to set geofence:', e);
                }
            }

            // Özellik bayrakları
            this._features = {
                advancedFiltering: options.advancedFiltering !== false,
                lastGoodLocation: options.lastGoodLocation !== false,
                circleWatcher: options.circleWatcher !== false,
                deadReckoning: !!options.enableDeadReckoning,
                fadeMarkerOnFallback: options.fadeMarkerOnFallback !== false,
                controlPanel: !!options.controlPanel,
                experimentalFusion: !!options.experimentalFusion
            };

            // Birleşik kontrol paneli (Ayarlar + Loglar drawer) ayarları
            this._panelOptions = options.panelOptions || {};

            // Tek noktadan konum olayı dağıtımı (zenginleştirme + dinleyiciler + kullanıcı callback'i)
            this._setupDeviceMoveDispatch(options);
        },

        /**
         * afterDeviceMove için TEK sarmalayıcı: konum verisini bir kez zenginleştirir,
         * kayıtlı dinleyicilere ve kullanıcı callback'ine dağıtır.
         * (Eski çift sarma + çift zenginleştirme sorununu giderir.)
         */
        _setupDeviceMoveDispatch: function (options) {
            var self = this;
            this._deviceMoveListeners = [];
            this._userAfterDeviceMove = this.options.afterDeviceMove || (options && options.afterDeviceMove) || null;

            this.options.afterDeviceMove = function (location) {
                var enriched = self._enrichLocationPayload(location);
                for (var i = 0; i < self._deviceMoveListeners.length; i++) {
                    try { self._deviceMoveListeners[i](enriched); }
                    catch (e) { console.error('onDeviceMove listener error:', e); }
                }
                if (typeof self._userAfterDeviceMove === 'function') {
                    try { self._userAfterDeviceMove(enriched); }
                    catch (e) { console.error('afterDeviceMove error:', e); }
                }
            };
        },

        /**
         * Konum güncellemelerine abone ol (zenginleştirilmiş veri ile).
         * @param {Function} fn - (enrichedLocation) => void
         */
        onDeviceMove: function (fn) {
            if (typeof fn === 'function' && this._deviceMoveListeners) {
                this._deviceMoveListeners.push(fn);
            }
            return this;
        },

        /**
         * Konum güncelleme aboneliğini kaldır.
         */
        offDeviceMove: function (fn) {
            if (this._deviceMoveListeners) {
                this._deviceMoveListeners = this._deviceMoveListeners.filter(function (f) { return f !== fn; });
            }
            return this;
        },

        /**
         * Konum verisini zenginleştir
         */
        _enrichLocationPayload: function (location) {
            if (!location) return location;

            var geofenceResult = { inside: true };
            var speedResult = { valid: true, speed: 0 };
            var confidence = location.confidence || 0;

            if (typeof this._isInsideGeofence === 'function') {
                geofenceResult = this._isInsideGeofence(location.lat, location.lng);
            }

            if (typeof this._checkSpeedValidity === 'function') {
                speedResult = this._checkSpeedValidity(
                    location.lat, 
                    location.lng, 
                    location.timestamp || Date.now()
                );
            }

            if (typeof this._calculateLocationConfidence === 'function') {
                try {
                    confidence = this._calculateLocationConfidence(location, geofenceResult, speedResult);
                } catch (e) {
                    confidence = 0;
                }
            }

            return Object.assign({}, location, {
                confidence: confidence,
                geofence: geofenceResult,
                speedCheck: speedResult,
                locationStats: this._locationStats
            });
        },

        /**
         * Özelliği aç/kapat
         * @param {string} name - Özellik adı
         * @param {boolean} enabled - Aktif mi
         */
        enableFeature: function (name, enabled) {
            if (!this._features || !(name in this._features)) {
                console.warn('Unknown feature:', name);
                return this;
            }

            enabled = !!enabled;
            this._features[name] = enabled;

            // Core options'a da yansıt
            switch (name) {
                case 'advancedFiltering':
                    this.options.enableFiltering = enabled;
                    break;
                case 'lastGoodLocation':
                    this.options.enableLastGoodLocation = enabled;
                    break;
                case 'circleWatcher':
                    this.enableCircleWatcher(enabled);
                    break;
                case 'deadReckoning':
                    this.options.enableDeadReckoning = enabled;
                    if (!enabled && this._pdr && this._pdr.active) {
                        this._stopDeadReckoning("kullanıcı tarafından kapatıldı");
                    }
                    break;
                case 'fadeMarkerOnFallback':
                    this.options.fadeMarkerOnFallback = enabled;
                    if (typeof this._applyMarkerFallbackStyle === 'function') {
                        this._applyMarkerFallbackStyle();
                    }
                    break;
                case 'experimentalFusion':
                    this.options.experimentalFusion = enabled;
                    // Sabit-hız durumunu temizle ki temiz yeniden başlasın
                    if (this._kalmanFilter) {
                        this._kalmanFilter.v_lat = 0;
                        this._kalmanFilter.v_lng = 0;
                        this._kalmanFilter.cvTime = null;
                    }
                    break;
            }

            console.log('Feature', name, 'set to', enabled);
            return this;
        },

        /**
         * Filtre parametrelerini güncelle
         */
        setFilterParams: function (params) {
            if (!params) return this;

            if (params.medianWindowSize !== undefined) {
                this.options.medianWindowSize = params.medianWindowSize;
                if (this._medianFilter) {
                    this._medianFilter.windowSize = params.medianWindowSize;
                }
            }

            if (params.kalmanProcessNoise !== undefined) {
                this.options.kalmanProcessNoise = params.kalmanProcessNoise;
                if (this._kalmanFilter) {
                    this._kalmanFilter.Q_lat = params.kalmanProcessNoise;
                    this._kalmanFilter.Q_lng = params.kalmanProcessNoise;
                }
            }

            if (params.kalmanMeasurementNoise !== undefined) {
                this.options.kalmanMeasurementNoise = params.kalmanMeasurementNoise;
                if (this._kalmanFilter) {
                    this._kalmanFilter.R_lat = params.kalmanMeasurementNoise;
                    this._kalmanFilter.R_lng = params.kalmanMeasurementNoise;
                }
            }

            if (params.lowPassFilterTau !== undefined) {
                this.options.lowPassFilterTau = params.lowPassFilterTau;
                if (this._lowPassFilterLat && this._lowPassFilterLat.setTau) {
                    this._lowPassFilterLat.setTau(params.lowPassFilterTau);
                    this._lowPassFilterLng.setTau(params.lowPassFilterTau);
                }
            }

            return this;
        },

        /**
         * Belirli filtre modülünü aç/kapat
         */
        enableFilterModule: function (moduleName, enabled) {
            enabled = !!enabled;

            switch (moduleName) {
                case 'lowpass':
                    this.options.enableLowPassFilter = enabled;
                    break;
                case 'median':
                    this.options._medianEnabled = enabled;
                    if (!enabled) this.options.medianWindowSize = 1;
                    break;
                case 'kalman':
                    this.options._kalmanEnabled = enabled;
                    break;
                default:
                    console.warn('Unknown filter module:', moduleName);
                    return this;
            }

            console.log('Filter module', moduleName, '=', enabled);
            return this;
        },

        /**
         * Belirli filtre modülünün parametrelerini ayarla
         */
        setFilterModuleParams: function (moduleName, params) {
            if (!params) return this;

            switch (moduleName) {
                case 'lowpass':
                    if (params.tau !== undefined) {
                        this.options.lowPassFilterTau = params.tau;
                        if (this._lowPassFilterLat && this._lowPassFilterLat.setTau) {
                            this._lowPassFilterLat.setTau(params.tau);
                            this._lowPassFilterLng.setTau(params.tau);
                        }
                    }
                    break;

                case 'median':
                    if (params.windowSize !== undefined) {
                        this.options.medianWindowSize = params.windowSize;
                        if (this._medianFilter) {
                            this._medianFilter.windowSize = params.windowSize;
                        }
                    }
                    break;

                case 'kalman':
                    if (params.processNoise !== undefined) {
                        this.options.kalmanProcessNoise = params.processNoise;
                    }
                    if (params.measurementNoise !== undefined) {
                        this.options.kalmanMeasurementNoise = params.measurementNoise;
                    }
                    if (this._kalmanFilter) {
                        this._kalmanFilter.Q_lat = this.options.kalmanProcessNoise;
                        this._kalmanFilter.Q_lng = this.options.kalmanProcessNoise;
                        this._kalmanFilter.R_lat = this.options.kalmanMeasurementNoise;
                        this._kalmanFilter.R_lng = this.options.kalmanMeasurementNoise;
                    }
                    break;

                default:
                    console.warn('Unknown filter module:', moduleName);
            }

            return this;
        },

        /**
         * Son iyi konumu al
         */
        getLastGoodLocation: function () {
            return this._lastGoodLocation || null;
        },

        /**
         * Son iyi konumu temizle
         */
        clearLastGoodLocation: function () {
            this._lastGoodLocation = {
                latitude: null,
                longitude: null,
                accuracy: null,
                timestamp: null,
                confidence: 0
            };
            return this;
        },

        /**
         * Circle watcher'ı aç/kapat (artık kullanılmıyor, geriye uyumluluk için korundu)
         */
        enableCircleWatcher: function (enabled) {
            return this;
        },

        /**
         * Zemin kat kalibrasyonu yap (cihaz zemin kattayken çağrılmalı)
         * @returns {number|null} Kalibre edilen zemin kat rakımı (MSL)
         */
        calibrateGroundFloor: function () {
            if (typeof this._altitude === 'undefined') return null;
            return L.Control.SimpleLocate.prototype.calibrateGroundFloor.call(this);
        },
        
        /**
         * Kat tanımlarını ayarla
         * @param {Array} floors - [{floor: 0, name: "Zemin", minAlt: 1050, maxAlt: 1053}, ...]
         */
        setFloors: function (floors) {
            if (typeof this._validateFloors === 'function') {
                this._validateFloors(floors);
            }
            this.options.floors = floors;
            this.options.enableFloorDetection = true;
            this.options.enableAltitude = true;
            return this;
        },
        
        /**
         * Geoid ondülasyonunu ayarla (bölgeye göre)
         * @param {number} N - Geoid ondülasyonu (metre)
         */
        setGeoidUndulation: function (N) {
            this.options.geoidUndulation = N;
            return this;
        },

        /**
         * Geofence sınırını harita katmanı olarak oluştur
         * (polygon / bounds / center+radius önceliğine göre)
         */
        _buildGeofenceLayer: function () {
            var o = this.options;
            var style = L.Util.extend({
                color: '#1976d2', weight: 2,
                fillColor: '#1976d2', fillOpacity: 0.1,
                dashArray: '5, 5', interactive: false
            }, o.geofenceStyle || {});

            if (o.geofencePolygon && o.geofencePolygon.length >= 3) {
                var latlngs = o.geofencePolygon.map(function (p) { return [p.lat, p.lng]; });
                return L.polygon(latlngs, style);
            }
            if (o.geofenceBounds) {
                return L.rectangle(o.geofenceBounds, style);
            }
            if (o.geofenceCenter && o.geofenceRadius) {
                return L.circle(o.geofenceCenter, L.Util.extend({ radius: o.geofenceRadius }, style));
            }
            return null;
        },

        /**
         * Geofence çizimini göster
         */
        showGeofence: function () {
            if (!this._map) return this;
            if (!this._geofenceLayer) this._geofenceLayer = this._buildGeofenceLayer();
            if (this._geofenceLayer && !this._map.hasLayer(this._geofenceLayer)) {
                this._geofenceLayer.addTo(this._map);
            }
            this._geofenceVisible = true;
            return this;
        },

        /**
         * Geofence çizimini gizle
         */
        hideGeofence: function () {
            if (this._geofenceLayer && this._map && this._map.hasLayer(this._geofenceLayer)) {
                this._map.removeLayer(this._geofenceLayer);
            }
            this._geofenceVisible = false;
            return this;
        },

        /**
         * Geofence çizimini aç/kapat
         * @param {boolean} [show] - Belirtilmezse mevcut durumu tersine çevirir
         */
        toggleGeofence: function (show) {
            if (show === undefined) show = !this._geofenceVisible;
            return show ? this.showGeofence() : this.hideGeofence();
        },

        /**
         * Geofence çizimi görünür mü?
         */
        isGeofenceVisible: function () {
            return !!this._geofenceVisible;
        },

        /**
         * Geofence yeniden tanımlandığında çizimi tazele
         */
        refreshGeofenceLayer: function () {
            var wasVisible = this._geofenceVisible;
            if (this._geofenceLayer && this._map && this._map.hasLayer(this._geofenceLayer)) {
                this._map.removeLayer(this._geofenceLayer);
            }
            this._geofenceLayer = null;
            if (wasVisible) this.showGeofence();
            return this;
        },

        /**
         * Birleşik kontrol panelini (Ayarlar + Loglar drawer) oluştur
         */
        addControlPanel: function () {
            if (this._controlPanel) return this._controlPanel;
            if (typeof window.SimpleLocatePanel !== 'function') {
                console.warn('SimpleLocatePanel bulunamadı. simple-locate-panel.js dosyasını dahil edin.');
                return null;
            }
            this._controlPanel = new window.SimpleLocatePanel(this, this._panelOptions);
            return this._controlPanel;
        },

        /**
         * Kontrol paneli örneğini al
         */
        getPanel: function () {
            return this._controlPanel || null;
        },

        /**
         * Log motoru örneğini al
         */
        getLogger: function () {
            return this._controlPanel ? this._controlPanel.logger : null;
        },

        /**
         * Plugin'i haritaya ekle (override)
         */
        addTo: function (map) {
            var control = Base.prototype.addTo.call(this, map);

            // Geofence çizimi (panel toggle'ı başlangıç durumunu okuyabilsin diye panelden önce)
            if (this.options.drawGeofence) {
                this.showGeofence();
            }

            // Birleşik kontrol paneli (Ayarlar + Loglar) — en son sarılmalı
            if (this._features && this._features.controlPanel) {
                this.addControlPanel();
            }

            return control;
        }
    });

    // Factory fonksiyonları
    window.L.Control.SimpleLocateExtended = Extended;

    window.L.control.simpleLocateExtended = function (options) {
        return new Extended(options);
    };

    // Kısayol alias
    window.L.simplelocate = function (options) {
        return new Extended(options);
    };

    // SimpleLocate Extended loaded
})();