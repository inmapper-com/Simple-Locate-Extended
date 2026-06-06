/**
 * SimpleLocate Panel
 *
 * Ayarlar + Loglama birleşik kontrol bileşeni (sağdan açılan drawer).
 *
 * İçerik:
 * - LocateLogger: gerçek zamanlı olay/durum kaydı (durum makinesi, süre takibi,
 *   istatistik, JSON/CSV export)
 * - SimpleLocatePanel: drawer UI (Ayarlar sekmesi + Loglar sekmesi)
 *
 * Bir L.Control.SimpleLocate (veya Extended) örneğine bağlanır; core koduna
 * dokunmadan instance metodlarını sararak olayları yakalar.
 *
 * @requires leaflet-simple-locate.js
 * @version 1.0.0
 */
(function () {
    'use strict';

    if (typeof window === 'undefined') return;

    // ============================================================
    // CSS ENJEKSİYONU
    // ============================================================
    var STYLE_ID = 'simple-locate-panel-styles';
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        var css = '' +
        '.slp-handle{position:fixed;top:50%;right:0;transform:translateY(-50%);z-index:100000;' +
        'width:30px;height:64px;background:#1f2937;color:#fff;border:none;border-radius:8px 0 0 8px;' +
        'cursor:pointer;box-shadow:-2px 0 8px rgba(0,0,0,.2);display:flex;align-items:center;' +
        'justify-content:center;font-size:18px;transition:right .28s ease;font-family:system-ui,sans-serif;}' +
        '.slp-handle:hover{background:#374151;}' +
        '.slp-handle.open{right:360px;}' +
        '.slp-drawer{position:fixed;top:0;right:0;height:100%;width:360px;max-width:88vw;z-index:99999;' +
        'background:#f7f8fa;box-shadow:-4px 0 24px rgba(0,0,0,.18);transform:translateX(100%);' +
        'transition:transform .28s ease;display:flex;flex-direction:column;' +
        'font-family:system-ui,-apple-system,sans-serif;font-size:13px;color:#1f2937;}' +
        '.slp-drawer.open{transform:translateX(0);}' +
        '.slp-tabs{display:flex;background:#1f2937;flex:0 0 auto;}' +
        '.slp-tab{flex:1;padding:13px 0;text-align:center;color:#9ca3af;cursor:pointer;font-weight:600;' +
        'font-size:13px;border:none;background:none;transition:color .15s,background .15s;}' +
        '.slp-tab:hover{color:#d1d5db;}' +
        '.slp-tab.active{color:#fff;background:#111827;box-shadow:inset 0 -3px 0 #3b82f6;}' +
        '.slp-pane{flex:1 1 auto;overflow-y:auto;overflow-x:hidden;}' +
        '.slp-pane.hidden{display:none;}' +
        '.slp-section{padding:12px 14px;border-bottom:1px solid #e5e7eb;}' +
        '.slp-section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;' +
        'color:#6b7280;margin-bottom:10px;}' +
        '.slp-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px;gap:10px;}' +
        '.slp-row:last-child{margin-bottom:0;}' +
        '.slp-row label{color:#374151;font-size:12.5px;flex:1;}' +
        '.slp-row .slp-val{font-size:11px;color:#6b7280;min-width:42px;text-align:right;font-variant-numeric:tabular-nums;}' +
        '.slp-switch{position:relative;width:40px;height:22px;flex:0 0 auto;}' +
        '.slp-switch input{position:absolute;width:40px;height:22px;opacity:0;cursor:pointer;margin:0;z-index:2;}' +
        '.slp-switch .slp-track{position:absolute;inset:0;background:#cbd5e1;border-radius:22px;transition:background .2s;}' +
        '.slp-switch .slp-track::before{content:"";position:absolute;width:16px;height:16px;left:3px;bottom:3px;' +
        'background:#fff;border-radius:50%;transition:transform .2s;box-shadow:0 1px 2px rgba(0,0,0,.2);}' +
        '.slp-switch input:checked + .slp-track{background:#3b82f6;}' +
        '.slp-switch input:checked + .slp-track::before{transform:translateX(18px);}' +
        '.slp-range{width:120px;accent-color:#3b82f6;}' +
        '.slp-num{width:64px;padding:4px 6px;border:1px solid #d1d5db;border-radius:5px;font-size:12px;text-align:right;}' +
        '.slp-status{display:flex;flex-wrap:wrap;gap:8px;padding:12px 14px;background:#fff;border-bottom:1px solid #e5e7eb;}' +
        '.slp-badge{padding:3px 9px;border-radius:12px;font-size:11px;font-weight:700;color:#fff;}' +
        '.slp-kv{display:flex;flex-direction:column;gap:2px;min-width:70px;}' +
        '.slp-kv .k{font-size:9.5px;text-transform:uppercase;letter-spacing:.4px;color:#9ca3af;font-weight:700;}' +
        '.slp-kv .v{font-size:13px;font-weight:600;color:#1f2937;font-variant-numeric:tabular-nums;}' +
        '.slp-stats{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:#e5e7eb;border-bottom:1px solid #e5e7eb;}' +
        '.slp-stat{background:#fff;padding:8px 6px;text-align:center;}' +
        '.slp-stat .n{font-size:16px;font-weight:700;color:#1f2937;font-variant-numeric:tabular-nums;}' +
        '.slp-stat .l{font-size:9.5px;color:#9ca3af;text-transform:uppercase;letter-spacing:.3px;margin-top:1px;}' +
        '.slp-toolbar{display:flex;gap:6px;padding:8px 10px;background:#111827;flex-wrap:wrap;align-items:center;}' +
        '.slp-btn{padding:5px 10px;border:none;border-radius:5px;font-size:11px;font-weight:600;cursor:pointer;' +
        'background:#374151;color:#e5e7eb;transition:background .15s;}' +
        '.slp-btn:hover{background:#4b5563;}' +
        '.slp-btn.active{background:#3b82f6;color:#fff;}' +
        '.slp-btn.danger{background:#7f1d1d;}.slp-btn.danger:hover{background:#991b1b;}' +
        '.slp-filter{display:flex;gap:4px;padding:6px 10px;background:#1f2937;flex-wrap:wrap;}' +
        '.slp-chip{padding:3px 8px;border-radius:10px;font-size:10px;font-weight:600;cursor:pointer;' +
        'background:#374151;color:#9ca3af;border:1px solid transparent;}' +
        '.slp-chip.on{background:#1e3a5f;color:#93c5fd;border-color:#3b82f6;}' +
        '.slp-logs{flex:1 1 auto;overflow-y:auto;background:#0f172a;font-family:"Cascadia Code","Fira Code",Consolas,monospace;' +
        'font-size:11px;line-height:1.45;padding:4px 0;}' +
        '.slp-log{display:flex;gap:6px;padding:3px 10px;border-bottom:1px solid rgba(255,255,255,.04);align-items:flex-start;}' +
        '.slp-log:hover{background:rgba(255,255,255,.04);}' +
        '.slp-log .t{color:#64748b;flex:0 0 auto;font-size:10px;}' +
        '.slp-log .c{flex:0 0 auto;font-weight:700;font-size:9px;padding:1px 5px;border-radius:4px;text-transform:uppercase;}' +
        '.slp-log .m{color:#e2e8f0;flex:1;word-break:break-word;}' +
        '.slp-log .m .d{color:#7c8aa0;font-size:10px;}' +
        '.slp-log.lv-success .m{color:#86efac;}' +
        '.slp-log.lv-warn .m{color:#fcd34d;}' +
        '.slp-log.lv-error .m{color:#fca5a5;}' +
        '.slp-empty{color:#475569;text-align:center;padding:24px 10px;font-style:italic;}' +
        '.slp-logs-pane{display:flex;flex-direction:column;height:100%;}';

        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = css;
        document.head.appendChild(style);
    }

    // Kategori renkleri (log rozetleri)
    var CAT_COLORS = {
        location: '#3b82f6',
        geofence: '#0ea5e9',
        dr: '#a855f7',
        step: '#8b5cf6',
        fallback: '#f59e0b',
        reject: '#ef4444',
        filter: '#14b8a6',
        altitude: '#92806a',
        system: '#64748b',
        error: '#dc2626'
    };

    var MODE_INFO = {
        real:     { label: 'GERÇEK KONUM', color: '#16a34a' },
        fallback: { label: 'SON İYİ KONUM', color: '#f59e0b' },
        pdr:      { label: 'DEAD RECKONING', color: '#a855f7' },
        rejected: { label: 'REDDEDİLDİ', color: '#ef4444' },
        idle:     { label: 'BEKLENİYOR', color: '#64748b' }
    };

    function pad2(n) { return n < 10 ? '0' + n : '' + n; }
    function fmtTime(t) {
        var d = new Date(t);
        return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()) +
            '.' + (d.getMilliseconds() + '').padStart(3, '0');
    }
    function fmtDur(ms) {
        if (ms == null) return '--';
        if (ms < 1000) return ms + 'ms';
        var s = ms / 1000;
        if (s < 60) return s.toFixed(1) + 's';
        var m = Math.floor(s / 60);
        return m + 'd ' + Math.round(s % 60) + 's';
    }
    function num(v, d) {
        if (v == null || isNaN(v)) return '--';
        return Number(v).toFixed(d == null ? 0 : d);
    }

    // ============================================================
    // LOG MOTORU
    // ============================================================
    function LocateLogger(ctrl, options) {
        options = options || {};
        this.ctrl = ctrl;
        this.maxEntries = options.maxEntries || 3000;
        this.entries = [];
        this.seq = 0;
        this.paused = false;
        this.listeners = [];

        // Durum makinesi
        this.state = {
            mode: 'idle',
            modeSince: Date.now(),
            geofenceInside: null,
            geofenceSince: Date.now()
        };

        // Aktif DR oturumu
        this.drSession = null; // { start, steps, baseLat, baseLng }

        // İstatistikler
        this.stats = {
            rawFixes: 0,
            accepted: 0,
            rejected: 0,
            rejGeofence: 0,
            rejAccuracy: 0,
            rejSpeed: 0,
            fallbackUpdates: 0,
            pdrSteps: 0,
            jumps: 0,
            drSessions: 0,
            drTotalMs: 0,
            modeDurations: { real: 0, fallback: 0, pdr: 0, rejected: 0 }
        };

        // Önceki core istatistik snapshot'ı (red sebebi tespiti için)
        this._prevCoreStats = this._snapshotCoreStats();
        this._lastRaw = null;
    }

    LocateLogger.prototype._snapshotCoreStats = function () {
        var s = (this.ctrl && this.ctrl._locationStats) || {};
        return {
            geofenceRejections: s.geofenceRejections || 0,
            accuracyRejections: s.accuracyRejections || 0,
            speedRejections: s.speedRejections || 0,
            totalLocations: s.totalLocations || 0
        };
    };

    LocateLogger.prototype.onChange = function (cb) {
        if (typeof cb === 'function') this.listeners.push(cb);
    };

    LocateLogger.prototype._notify = function () {
        for (var i = 0; i < this.listeners.length; i++) {
            try { this.listeners[i](); } catch (e) {}
        }
    };

    LocateLogger.prototype.log = function (category, level, message, data) {
        if (this.paused) return;
        var entry = {
            seq: ++this.seq,
            t: Date.now(),
            category: category,
            level: level || 'info',
            message: message,
            data: data || null
        };
        this.entries.push(entry);
        if (this.entries.length > this.maxEntries) {
            this.entries.splice(0, this.entries.length - this.maxEntries);
        }
        this._notify();
        return entry;
    };

    LocateLogger.prototype.clear = function () {
        this.entries = [];
        this.seq = 0;
        this._notify();
    };

    // Ham GPS sinyali geldi (henüz filtrelenmedi)
    LocateLogger.prototype.noteRawFix = function (raw) {
        this.stats.rawFixes++;
        this._lastRaw = raw;

        // Geofence durumunu HAM sinyale göre belirle (gerçek iç/dış durumu)
        var inside = null;
        if (this.ctrl && typeof this.ctrl._isInsideGeofence === 'function' &&
            raw.lat != null && raw.lng != null) {
            try { inside = this.ctrl._isInsideGeofence(raw.lat, raw.lng).inside; } catch (e) {}
        }
        if (inside !== null && inside !== this.state.geofenceInside) {
            var now = Date.now();
            if (this.state.geofenceInside !== null) {
                var gd = now - this.state.geofenceSince;
                this.log('geofence', inside ? 'success' : 'warn',
                    inside ? 'Alana GİRİLDİ — sinyal geri geldi (dışarıda ' + fmtDur(gd) + ' kalındı)'
                           : 'Alandan ÇIKILDI — sinyal kayboldu (içeride ' + fmtDur(gd) + ' kalındı)',
                    { inside: inside, prevDurationMs: gd, lat: raw.lat, lng: raw.lng });
            } else {
                this.log('geofence', inside ? 'success' : 'warn',
                    inside ? 'Başlangıç: ham sinyal alan İÇİNDE' : 'Başlangıç: ham sinyal alan DIŞINDA',
                    { inside: inside });
            }
            this.state.geofenceInside = inside;
            this.state.geofenceSince = now;
        }

        this.log('location', 'info',
            'Ham GPS sinyali' + (inside === false ? ' (alan dışı)' : ''),
            { lat: raw.lat, lng: raw.lng, accuracy: raw.accuracy, geofenceInside: inside });
    };

    // Dead reckoning başladı
    LocateLogger.prototype.noteDRStart = function (info) {
        this.drSession = { start: Date.now(), steps: 0, baseLat: info.baseLat, baseLng: info.baseLng };
        this.stats.drSessions++;
        this.log('dr', 'warn',
            'Dead reckoning BAŞLADI (iç mekan sinyali kesildi)',
            { baseLat: info.baseLat, baseLng: info.baseLng, accuracy: info.accuracy });
    };

    // Dead reckoning durdu
    LocateLogger.prototype.noteDRStop = function (info) {
        var dur = this.drSession ? (Date.now() - this.drSession.start) : null;
        var steps = this.drSession ? this.drSession.steps : (info.steps || 0);
        if (dur != null) this.stats.drTotalMs += dur;
        this.log('dr', 'info',
            'Dead reckoning DURDU — sebep: ' + (info.reason || 'bilinmiyor'),
            { sure: fmtDur(dur), adim: steps, reason: info.reason });
        this.drSession = null;
    };

    // PDR adımı algılandı
    LocateLogger.prototype.noteStep = function (info) {
        this.stats.pdrSteps++;
        if (this.drSession) this.drSession.steps++;
        this.log('step', 'info',
            'PDR adım #' + (info.stepCount != null ? info.stepCount : this.stats.pdrSteps) +
            (info.moved === false ? ' (sınırda, konum sabit)' : ''),
            { stepCount: info.stepCount, heading: info.heading != null ? num(info.heading, 0) + '°' : '--',
              lat: info.lat, lng: info.lng, accuracy: info.accuracy });
    };

    // Her konum güncellemesi (afterDeviceMove) — ana durum makinesi
    LocateLogger.prototype.ingestUpdate = function (payload) {
        if (!payload) return;
        var ctrl = this.ctrl;
        var now = Date.now();

        // ----- Mod tespiti -----
        var isPDR = !!(payload.isPDR || (ctrl && ctrl._pdr && ctrl._pdr.active));
        var isRejected = !!payload.isRejected;
        var isFallback = !!(payload.isFallback || (ctrl && ctrl._isFallbackLocation));
        var mode;
        if (isPDR) mode = 'pdr';
        else if (isRejected) mode = 'rejected';
        else if (isFallback) mode = 'fallback';
        else mode = 'real';

        // ----- Geofence durumu (gösterilen konum; raw durumu noteRawFix'te izlenir) -----
        var inside = this.state.geofenceInside;

        // ----- Red sebebi tespiti (core stat diff) -----
        if (isRejected) {
            this.stats.rejected++;
            var cur = this._snapshotCoreStats();
            var prev = this._prevCoreStats;
            var reason = 'bilinmiyor';
            if (cur.geofenceRejections > prev.geofenceRejections) { reason = 'alan dışı (geofence)'; this.stats.rejGeofence++; }
            else if (cur.accuracyRejections > prev.accuracyRejections) { reason = 'düşük doğruluk'; this.stats.rejAccuracy++; }
            else if (cur.speedRejections > prev.speedRejections) { reason = 'aşırı hız (sıçrama)'; this.stats.rejSpeed++; }
            if (payload.locationError) reason = 'GPS hatası: ' + payload.locationError.message;
            this.log('reject', payload.locationError ? 'error' : 'warn',
                'Konum reddedildi — ' + reason,
                { lat: payload.lat, lng: payload.lng, accuracy: payload.accuracy, reason: reason });
        } else {
            this.stats.accepted++;
        }
        this._prevCoreStats = this._snapshotCoreStats();

        // ----- Jump tespiti -----
        if (payload.isJump) {
            this.stats.jumps++;
            this.log('filter', 'warn', 'Ani sıçrama (jump) tespit edildi ve filtrelendi',
                { lat: payload.lat, lng: payload.lng });
        }

        // ----- Mod geçişi -----
        if (mode !== this.state.mode) {
            var prevDur = now - this.state.modeSince;
            if (this.stats.modeDurations[this.state.mode] != null) {
                this.stats.modeDurations[this.state.mode] += prevDur;
            }
            var mi = MODE_INFO[mode] || MODE_INFO.idle;
            var pmi = MODE_INFO[this.state.mode] || MODE_INFO.idle;
            var lvl = mode === 'real' ? 'success' : (mode === 'rejected' ? 'error' : 'warn');
            this.log('system', lvl,
                'Durum değişti: ' + pmi.label + ' → ' + mi.label + ' (önceki ' + fmtDur(prevDur) + ' sürdü)',
                { from: this.state.mode, to: mode, prevDurationMs: prevDur });
            this.state.mode = mode;
            this.state.modeSince = now;
        }

        // ----- Fallback sayacı -----
        if (mode === 'fallback') this.stats.fallbackUpdates++;

        // ----- Konum güncelleme kaydı (kompakt) -----
        if (!isRejected) {
            var parts = [];
            parts.push('acc ' + num(payload.accuracy, 1) + 'm');
            if (payload.confidence != null) parts.push('güven %' + num(payload.confidence, 0));
            if (payload.floorName) parts.push(payload.floorName);
            else if (payload.floor != null) parts.push('kat ' + payload.floor);
            if (payload.angle != null) parts.push(num(payload.angle, 0) + '°');
            var mlabel = (MODE_INFO[mode] || MODE_INFO.idle).label;
            this.log('location', mode === 'real' ? 'success' : 'info',
                mlabel + ' güncellendi · ' + parts.join(' · '),
                {
                    lat: payload.lat, lng: payload.lng, accuracy: payload.accuracy,
                    confidence: payload.confidence, mode: mode, geofenceInside: inside,
                    floor: payload.floor, floorName: payload.floorName, angle: payload.angle,
                    altitude: payload.altitude, isPDR: isPDR, pdrStepCount: payload.pdrStepCount
                });
        }

        this._notify();
    };

    // Anlık durum özeti (canlı kart için)
    LocateLogger.prototype.getLiveStatus = function () {
        var now = Date.now();
        return {
            mode: this.state.mode,
            modeFor: now - this.state.modeSince,
            geofenceInside: this.state.geofenceInside,
            geofenceFor: now - this.state.geofenceSince,
            drActive: !!this.drSession,
            drFor: this.drSession ? now - this.drSession.start : 0,
            drSteps: this.drSession ? this.drSession.steps : 0
        };
    };

    // ----- Export -----
    LocateLogger.prototype.exportJSON = function () {
        return JSON.stringify({
            exportedAt: new Date().toISOString(),
            stats: this.stats,
            entries: this.entries
        }, null, 2);
    };

    LocateLogger.prototype.exportCSV = function () {
        var rows = ['seq,time,category,level,message,data'];
        for (var i = 0; i < this.entries.length; i++) {
            var e = this.entries[i];
            var data = e.data ? JSON.stringify(e.data).replace(/"/g, "'") : '';
            var msg = (e.message || '').replace(/"/g, "'");
            rows.push([e.seq, new Date(e.t).toISOString(), e.category, e.level,
                '"' + msg + '"', '"' + data + '"'].join(','));
        }
        return rows.join('\n');
    };

    LocateLogger.prototype.download = function (content, filename, mime) {
        var blob = new Blob([content], { type: mime || 'text/plain' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    };

    // ============================================================
    // DRAWER UI
    // ============================================================
    function SimpleLocatePanel(ctrl, options) {
        injectStyles();
        options = options || {};
        this.ctrl = ctrl;
        this.options = options;
        this.activeTab = 'logs';
        this.open = !!options.startOpen;
        this.activeFilters = null; // null = hepsi
        this._renderScheduled = false;

        this.logger = new LocateLogger(ctrl, options);

        this._hookControl();
        this._buildDOM();
        this._bindLogger();

        // Canlı durum/süre sayaçları için periyodik güncelleme
        var self = this;
        this._tick = setInterval(function () {
            if (self.open && self.activeTab === 'logs') self._renderLiveStatus();
        }, 500);
    }

    // ---- Core instance metodlarını sar (olayları yakala) ----
    SimpleLocatePanel.prototype._hookControl = function () {
        var ctrl = this.ctrl;
        var logger = this.logger;
        if (!ctrl || ctrl._slpHooked) return;
        ctrl._slpHooked = true;

        // Ham GPS sinyali
        if (typeof ctrl._onLocationFound === 'function') {
            var origFound = ctrl._onLocationFound;
            ctrl._onLocationFound = function (event) {
                try {
                    logger.noteRawFix({
                        lat: event.latitude, lng: event.longitude,
                        accuracy: event.accuracy, t: event.timestamp || Date.now()
                    });
                } catch (e) {}
                return origFound.apply(this, arguments);
            };
        }

        // DR başlat
        if (typeof ctrl._startDeadReckoning === 'function') {
            var origStart = ctrl._startDeadReckoning;
            ctrl._startDeadReckoning = function () {
                var wasActive = this._pdr && this._pdr.active;
                var r = origStart.apply(this, arguments);
                if (!wasActive && this._pdr && this._pdr.active) {
                    logger.noteDRStart({
                        baseLat: this._pdr.baseLatitude, baseLng: this._pdr.baseLongitude,
                        accuracy: this._pdr.currentAccuracy
                    });
                }
                return r;
            };
        }

        // DR durdur
        if (typeof ctrl._stopDeadReckoning === 'function') {
            var origStop = ctrl._stopDeadReckoning;
            ctrl._stopDeadReckoning = function (reason) {
                var wasActive = this._pdr && this._pdr.active;
                var r = origStop.apply(this, arguments);
                if (wasActive) {
                    logger.noteDRStop({ reason: reason, steps: this._pdr ? this._pdr.stepCount : 0 });
                }
                return r;
            };
        }

        // PDR adım
        if (typeof ctrl._onStepDetected === 'function') {
            var origStep = ctrl._onStepDetected;
            ctrl._onStepDetected = function () {
                var before = this._pdr ? { lat: this._pdr.currentLatitude, lng: this._pdr.currentLongitude } : null;
                var r = origStep.apply(this, arguments);
                if (this._pdr) {
                    var moved = before && (before.lat !== this._pdr.currentLatitude || before.lng !== this._pdr.currentLongitude);
                    logger.noteStep({
                        stepCount: this._pdr.stepCount, heading: this._angle,
                        lat: this._pdr.currentLatitude, lng: this._pdr.currentLongitude,
                        accuracy: this._pdr.currentAccuracy, moved: moved
                    });
                }
                return r;
            };
        }

        // afterDeviceMove — ana güncelleme akışı
        var origADM = ctrl.options ? ctrl.options.afterDeviceMove : null;
        ctrl.options.afterDeviceMove = function (loc) {
            try { logger.ingestUpdate(loc); } catch (e) {}
            if (typeof origADM === 'function') {
                try { return origADM.apply(this, arguments); } catch (e) {}
            }
        };
    };

    // ---- DOM kurulumu ----
    SimpleLocatePanel.prototype._buildDOM = function () {
        var self = this;

        // Handle (ok)
        this.handle = document.createElement('button');
        this.handle.className = 'slp-handle' + (this.open ? ' open' : '');
        this.handle.innerHTML = this.open ? '›' : '‹';
        this.handle.title = 'Konum Paneli';
        this.handle.addEventListener('click', function () { self.toggle(); });
        document.body.appendChild(this.handle);

        // Drawer
        this.drawer = document.createElement('div');
        this.drawer.className = 'slp-drawer' + (this.open ? ' open' : '');

        // Sekmeler
        var tabs = document.createElement('div');
        tabs.className = 'slp-tabs';
        this.tabLogs = this._makeTab('Loglar', 'logs');
        this.tabSettings = this._makeTab('Ayarlar', 'settings');
        tabs.appendChild(this.tabLogs);
        tabs.appendChild(this.tabSettings);
        this.drawer.appendChild(tabs);

        // Loglar paneli
        this.logsPane = document.createElement('div');
        this.logsPane.className = 'slp-pane slp-logs-pane';
        this._buildLogsPane(this.logsPane);
        this.drawer.appendChild(this.logsPane);

        // Ayarlar paneli
        this.settingsPane = document.createElement('div');
        this.settingsPane.className = 'slp-pane hidden';
        this._buildSettingsPane(this.settingsPane);
        this.drawer.appendChild(this.settingsPane);

        document.body.appendChild(this.drawer);

        // Harita olaylarına karışmasın
        if (window.L && L.DomEvent) {
            L.DomEvent.disableClickPropagation(this.drawer);
            L.DomEvent.disableScrollPropagation(this.drawer);
        }

        this._switchTab(this.activeTab);
    };

    SimpleLocatePanel.prototype._makeTab = function (label, id) {
        var self = this;
        var t = document.createElement('button');
        t.className = 'slp-tab' + (this.activeTab === id ? ' active' : '');
        t.textContent = label;
        t.addEventListener('click', function () { self._switchTab(id); });
        return t;
    };

    SimpleLocatePanel.prototype._switchTab = function (id) {
        this.activeTab = id;
        this.tabLogs.classList.toggle('active', id === 'logs');
        this.tabSettings.classList.toggle('active', id === 'settings');
        this.logsPane.classList.toggle('hidden', id !== 'logs');
        this.settingsPane.classList.toggle('hidden', id !== 'settings');
        if (id === 'logs') { this._renderLiveStatus(); this._renderLogs(); }
    };

    SimpleLocatePanel.prototype.toggle = function () {
        this.open = !this.open;
        this.drawer.classList.toggle('open', this.open);
        this.handle.classList.toggle('open', this.open);
        this.handle.innerHTML = this.open ? '›' : '‹';
        if (this.open) { this._renderLiveStatus(); this._renderLogs(); }
    };

    // ============================================================
    // LOGLAR SEKMESİ
    // ============================================================
    SimpleLocatePanel.prototype._buildLogsPane = function (pane) {
        var self = this;

        // Canlı durum kartı
        this.statusEl = document.createElement('div');
        this.statusEl.className = 'slp-status';
        pane.appendChild(this.statusEl);

        // İstatistik grid
        this.statsEl = document.createElement('div');
        this.statsEl.className = 'slp-stats';
        pane.appendChild(this.statsEl);

        // Araç çubuğu
        var toolbar = document.createElement('div');
        toolbar.className = 'slp-toolbar';

        this.pauseBtn = document.createElement('button');
        this.pauseBtn.className = 'slp-btn';
        this.pauseBtn.textContent = '⏸ Duraklat';
        this.pauseBtn.addEventListener('click', function () {
            self.logger.paused = !self.logger.paused;
            self.pauseBtn.textContent = self.logger.paused ? '▶ Devam' : '⏸ Duraklat';
            self.pauseBtn.classList.toggle('active', self.logger.paused);
        });
        toolbar.appendChild(this.pauseBtn);

        var clearBtn = document.createElement('button');
        clearBtn.className = 'slp-btn danger';
        clearBtn.textContent = '🗑 Temizle';
        clearBtn.addEventListener('click', function () { self.logger.clear(); });
        toolbar.appendChild(clearBtn);

        var jsonBtn = document.createElement('button');
        jsonBtn.className = 'slp-btn';
        jsonBtn.textContent = '⬇ JSON';
        jsonBtn.addEventListener('click', function () {
            self.logger.download(self.logger.exportJSON(), 'locate-log-' + Date.now() + '.json', 'application/json');
        });
        toolbar.appendChild(jsonBtn);

        var csvBtn = document.createElement('button');
        csvBtn.className = 'slp-btn';
        csvBtn.textContent = '⬇ CSV';
        csvBtn.addEventListener('click', function () {
            self.logger.download(self.logger.exportCSV(), 'locate-log-' + Date.now() + '.csv', 'text/csv');
        });
        toolbar.appendChild(csvBtn);

        pane.appendChild(toolbar);

        // Kategori filtre çipleri
        var filterBar = document.createElement('div');
        filterBar.className = 'slp-filter';
        var cats = [
            ['location', 'Konum'], ['system', 'Durum'], ['geofence', 'Geofence'],
            ['dr', 'DR'], ['step', 'Adım'], ['reject', 'Red'], ['filter', 'Filtre']
        ];
        this._filterChips = {};
        cats.forEach(function (c) {
            var chip = document.createElement('span');
            chip.className = 'slp-chip on';
            chip.textContent = c[1];
            chip.dataset.cat = c[0];
            chip.addEventListener('click', function () {
                chip.classList.toggle('on');
                self._updateFilters();
            });
            filterBar.appendChild(chip);
            self._filterChips[c[0]] = chip;
        });
        pane.appendChild(filterBar);

        // Log listesi
        this.logsEl = document.createElement('div');
        this.logsEl.className = 'slp-logs';
        pane.appendChild(this.logsEl);

        this._renderLiveStatus();
        this._renderStats();
    };

    SimpleLocatePanel.prototype._updateFilters = function () {
        var active = [];
        for (var cat in this._filterChips) {
            if (this._filterChips[cat].classList.contains('on')) active.push(cat);
        }
        this.activeFilters = active;
        this._renderLogs();
    };

    SimpleLocatePanel.prototype._renderLiveStatus = function () {
        if (!this.statusEl) return;
        var s = this.logger.getLiveStatus();
        var mi = MODE_INFO[s.mode] || MODE_INFO.idle;
        var gf = s.geofenceInside === null ? '--' : (s.geofenceInside ? 'İÇERİDE' : 'DIŞARIDA');
        var gfColor = s.geofenceInside === null ? '#64748b' : (s.geofenceInside ? '#16a34a' : '#f59e0b');
        var html = '';
        html += '<span class="slp-badge" style="background:' + mi.color + '">' + mi.label + '</span>';
        html += '<div class="slp-kv"><span class="k">Süre</span><span class="v">' + fmtDur(s.modeFor) + '</span></div>';
        html += '<div class="slp-kv"><span class="k">Geofence</span><span class="v" style="color:' + gfColor + '">' + gf + '</span></div>';
        if (s.drActive) {
            html += '<div class="slp-kv"><span class="k">DR Süre</span><span class="v" style="color:#a855f7">' + fmtDur(s.drFor) + '</span></div>';
            html += '<div class="slp-kv"><span class="k">DR Adım</span><span class="v" style="color:#a855f7">' + s.drSteps + '</span></div>';
        }
        this.statusEl.innerHTML = html;
    };

    SimpleLocatePanel.prototype._renderStats = function () {
        if (!this.statsEl) return;
        var st = this.logger.stats;
        var items = [
            [st.rawFixes, 'Ham GPS'],
            [st.accepted, 'Kabul'],
            [st.rejected, 'Red'],
            [st.rejGeofence, 'Alan dışı'],
            [st.rejAccuracy, 'Düşük doğr.'],
            [st.rejSpeed, 'Hız ihlali'],
            [st.pdrSteps, 'PDR adım'],
            [st.drSessions, 'DR oturum'],
            [fmtDur(st.drTotalMs), 'Top. DR']
        ];
        var html = '';
        for (var i = 0; i < items.length; i++) {
            html += '<div class="slp-stat"><div class="n">' + items[i][0] + '</div><div class="l">' + items[i][1] + '</div></div>';
        }
        this.statsEl.innerHTML = html;
    };

    SimpleLocatePanel.prototype._renderLogs = function () {
        if (!this.logsEl) return;
        var entries = this.logger.entries;
        var filters = this.activeFilters;
        var maxShow = 400;
        var out = [];
        var shown = 0;
        for (var i = entries.length - 1; i >= 0 && shown < maxShow; i--) {
            var e = entries[i];
            if (filters && filters.indexOf(e.category) === -1) continue;
            shown++;
            var color = CAT_COLORS[e.category] || '#64748b';
            var dataStr = '';
            if (e.data) {
                var ds = [];
                if (e.data.lat != null && e.data.lng != null) {
                    ds.push(Number(e.data.lat).toFixed(6) + ',' + Number(e.data.lng).toFixed(6));
                }
                if (ds.length) dataStr = ' <span class="d">[' + ds.join(' ') + ']</span>';
            }
            out.push('<div class="slp-log lv-' + e.level + '">' +
                '<span class="t">' + fmtTime(e.t) + '</span>' +
                '<span class="c" style="background:' + color + '33;color:' + color + '">' + e.category + '</span>' +
                '<span class="m">' + this._esc(e.message) + dataStr + '</span></div>');
        }
        this.logsEl.innerHTML = out.length
            ? out.join('')
            : '<div class="slp-empty">Henüz log yok — konum takibi başlayınca görünecek.</div>';
        this._renderStats();
    };

    SimpleLocatePanel.prototype._esc = function (s) {
        return ('' + s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };

    SimpleLocatePanel.prototype._bindLogger = function () {
        var self = this;
        var schedule = window.requestAnimationFrame
            ? function (fn) { window.requestAnimationFrame(fn); }
            : function (fn) { window.setTimeout(fn, 16); };
        this.logger.onChange(function () {
            if (!self.open || self.activeTab !== 'logs') return;
            if (self._renderScheduled) return;
            self._renderScheduled = true;
            schedule(function () {
                self._renderScheduled = false;
                self._renderLogs();
            });
        });
    };

    // ============================================================
    // AYARLAR SEKMESİ
    // ============================================================
    SimpleLocatePanel.prototype._buildSettingsPane = function (pane) {
        var self = this;
        var ctrl = this.ctrl;
        var o = ctrl.options || {};

        // --- Özellikler ---
        var fs = this._section(pane, 'Özellikler');
        this._toggle(fs, 'Gelişmiş Filtreleme', o.enableFiltering !== false, function (v) {
            self._setFeature('advancedFiltering', v, function () { ctrl.options.enableFiltering = v; });
        });
        this._toggle(fs, 'Dead Reckoning (PDR)', !!o.enableDeadReckoning, function (v) {
            self._setFeature('deadReckoning', v, function () { ctrl.options.enableDeadReckoning = v; });
        });
        this._toggle(fs, 'Son İyi Konum Fallback', o.enableLastGoodLocation !== false, function (v) {
            self._setFeature('lastGoodLocation', v, function () { ctrl.options.enableLastGoodLocation = v; });
        });
        this._toggle(fs, 'Fallback Marker Soluklaştır', o.fadeMarkerOnFallback !== false, function (v) {
            self._setFeature('fadeMarkerOnFallback', v, function () { ctrl.options.fadeMarkerOnFallback = v; });
        });
        if (typeof ctrl.toggleGeofence === 'function') {
            this._toggle(fs, 'Geofence Çizimi', ctrl.isGeofenceVisible(), function (v) {
                ctrl.toggleGeofence(v);
            });
        }

        // --- Filtre Parametreleri ---
        var fp = this._section(pane, 'Filtre Parametreleri');
        this._number(fp, 'Maks. Doğruluk (m)', o.maxAcceptableAccuracy != null ? o.maxAcceptableAccuracy : 100, 1, 500, 1, function (v) {
            ctrl.options.maxAcceptableAccuracy = v;
        });
        this._range(fp, 'Low-Pass Tau', o.lowPassFilterTau != null ? o.lowPassFilterTau : 0.5, 0.1, 3, 0.1, function (v) {
            if (typeof ctrl.setFilterModuleParams === 'function') ctrl.setFilterModuleParams('lowpass', { tau: v });
            else ctrl.options.lowPassFilterTau = v;
        });
        this._range(fp, 'Median Pencere', o.medianWindowSize != null ? o.medianWindowSize : 3, 1, 15, 1, function (v) {
            if (typeof ctrl.setFilterModuleParams === 'function') ctrl.setFilterModuleParams('median', { windowSize: v });
            else ctrl.options.medianWindowSize = v;
        });
        this._range(fp, 'Kalman Q (süreç)', o.kalmanProcessNoise != null ? o.kalmanProcessNoise : 0.05, 0.01, 1, 0.01, function (v) {
            if (typeof ctrl.setFilterModuleParams === 'function') ctrl.setFilterModuleParams('kalman', { processNoise: v });
            else ctrl.options.kalmanProcessNoise = v;
        });
        this._range(fp, 'Kalman R (ölçüm)', o.kalmanMeasurementNoise != null ? o.kalmanMeasurementNoise : 0.2, 0.01, 2, 0.01, function (v) {
            if (typeof ctrl.setFilterModuleParams === 'function') ctrl.setFilterModuleParams('kalman', { measurementNoise: v });
            else ctrl.options.kalmanMeasurementNoise = v;
        });

        // --- PDR Parametreleri ---
        var pp = this._section(pane, 'Dead Reckoning Parametreleri');
        this._range(pp, 'Adım Uzunluğu (m)', o.pdrStepLength != null ? o.pdrStepLength : 0.65, 0.3, 1.2, 0.05, function (v) {
            ctrl.options.pdrStepLength = v;
        });
        this._range(pp, 'Adım Eşiği (g)', o.pdrStepThreshold != null ? o.pdrStepThreshold : 1.2, 0.4, 3, 0.1, function (v) {
            ctrl.options.pdrStepThreshold = v;
        });
        this._number(pp, 'Adım Cooldown (ms)', o.pdrStepCooldown != null ? o.pdrStepCooldown : 400, 100, 2000, 50, function (v) {
            ctrl.options.pdrStepCooldown = v;
        });
        this._number(pp, 'Maks. Süre (sn)', (o.pdrMaxDuration != null ? o.pdrMaxDuration : 60000) / 1000, 5, 600, 5, function (v) {
            ctrl.options.pdrMaxDuration = v * 1000;
        });
    };

    SimpleLocatePanel.prototype._setFeature = function (name, v, fallback) {
        if (typeof this.ctrl.enableFeature === 'function') {
            try { this.ctrl.enableFeature(name, v); return; } catch (e) {}
        }
        if (fallback) fallback();
    };

    SimpleLocatePanel.prototype._section = function (pane, title) {
        var sec = document.createElement('div');
        sec.className = 'slp-section';
        var t = document.createElement('div');
        t.className = 'slp-section-title';
        t.textContent = title;
        sec.appendChild(t);
        pane.appendChild(sec);
        return sec;
    };

    SimpleLocatePanel.prototype._toggle = function (sec, label, initial, onChange) {
        var row = document.createElement('div');
        row.className = 'slp-row';
        var lab = document.createElement('label');
        lab.textContent = label;
        var sw = document.createElement('span');
        sw.className = 'slp-switch';
        var input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!initial;
        var track = document.createElement('span');
        track.className = 'slp-track';
        sw.appendChild(input);
        sw.appendChild(track);
        input.addEventListener('change', function () { onChange(input.checked); });
        row.appendChild(lab);
        row.appendChild(sw);
        sec.appendChild(row);
    };

    SimpleLocatePanel.prototype._range = function (sec, label, initial, min, max, step, onChange) {
        var row = document.createElement('div');
        row.className = 'slp-row';
        var lab = document.createElement('label');
        lab.textContent = label;
        var val = document.createElement('span');
        val.className = 'slp-val';
        val.textContent = initial;
        var input = document.createElement('input');
        input.type = 'range';
        input.className = 'slp-range';
        input.min = min; input.max = max; input.step = step; input.value = initial;
        input.addEventListener('input', function () {
            var v = parseFloat(input.value);
            val.textContent = v;
            onChange(v);
        });
        row.appendChild(lab);
        row.appendChild(input);
        row.appendChild(val);
        sec.appendChild(row);
    };

    SimpleLocatePanel.prototype._number = function (sec, label, initial, min, max, step, onChange) {
        var row = document.createElement('div');
        row.className = 'slp-row';
        var lab = document.createElement('label');
        lab.textContent = label;
        var input = document.createElement('input');
        input.type = 'number';
        input.className = 'slp-num';
        input.min = min; input.max = max; input.step = step; input.value = initial;
        input.addEventListener('change', function () {
            var v = parseFloat(input.value);
            if (!isNaN(v)) onChange(v);
        });
        row.appendChild(lab);
        row.appendChild(input);
        sec.appendChild(row);
    };

    SimpleLocatePanel.prototype.destroy = function () {
        if (this._tick) clearInterval(this._tick);
        if (this.handle && this.handle.parentNode) this.handle.parentNode.removeChild(this.handle);
        if (this.drawer && this.drawer.parentNode) this.drawer.parentNode.removeChild(this.drawer);
    };

    // Expose
    window.LocateLogger = LocateLogger;
    window.SimpleLocatePanel = SimpleLocatePanel;
    if (window.L) {
        window.L.simpleLocatePanel = function (ctrl, options) {
            return new SimpleLocatePanel(ctrl, options);
        };
    }
})();
