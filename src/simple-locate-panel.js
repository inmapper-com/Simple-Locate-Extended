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
 * @version 1.2.0
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
        '.slp-logs-pane{display:flex;flex-direction:column;height:100%;}' +
        '.slp-btn-row{display:flex;gap:6px;margin-top:8px;}' +
        '.slp-btn-full{flex:1;padding:8px 10px;border:none;border-radius:6px;font-size:12px;font-weight:600;' +
        'cursor:pointer;background:#e0e7ff;color:#3730a3;transition:background .15s;}' +
        '.slp-btn-full:hover{background:#c7d2fe;}' +
        '.slp-btn-full.draw{background:#e91e63;color:#fff;}.slp-btn-full.draw:hover{background:#c2185b;}' +
        '.slp-btn-full.ok{background:#16a34a;color:#fff;}.slp-btn-full.ok:hover{background:#15803d;}' +
        '.slp-btn-full.cancel{background:#e5e7eb;color:#374151;}.slp-btn-full.cancel:hover{background:#d1d5db;}' +
        '.slp-btn-full.ghost{background:#f3f4f6;color:#6b7280;}.slp-btn-full.ghost:hover{background:#e5e7eb;}' +
        '.slp-hint{font-size:11px;color:#6b7280;background:#fef3c7;border:1px solid #fde68a;border-radius:6px;' +
        'padding:7px 9px;margin-top:8px;line-height:1.4;}' +
        '.slp-float-status{position:fixed;top:max(10px,env(safe-area-inset-top,0px));left:50%;' +
        'transform:translateX(-50%);z-index:99998;pointer-events:none;font-family:system-ui,-apple-system,sans-serif;' +
        'max-width:calc(100vw - 24px);}' +
        '.slp-float-pill{display:flex;align-items:stretch;gap:0;padding:5px 12px 5px 10px;border-radius:14px;' +
        'background:rgba(17,24,39,.88);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);' +
        'box-shadow:0 2px 14px rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.08);}' +
        '.slp-float-left{display:flex;align-items:center;gap:6px;flex:1;min-width:0;flex-wrap:nowrap;}' +
        '.slp-float-pill .slp-badge{font-size:10px;padding:3px 8px;border-radius:8px;letter-spacing:.2px;white-space:nowrap;flex-shrink:0;}' +
        '.slp-float-meta{font-size:11px;font-weight:600;color:#d1d5db;font-variant-numeric:tabular-nums;white-space:nowrap;flex-shrink:0;}' +
        '.slp-float-gf{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.35px;padding:2px 6px;' +
        'border-radius:6px;background:rgba(255,255,255,.08);white-space:nowrap;flex-shrink:0;}' +
        '.slp-float-divider{width:1px;margin:4px 10px 4px 6px;background:rgba(255,255,255,.12);align-self:stretch;flex-shrink:0;}' +
        '.slp-float-alt{display:flex;flex-direction:column;justify-content:center;align-items:flex-end;gap:1px;' +
        'flex-shrink:0;min-width:52px;}' +
        '.slp-float-alt-val{font-size:13px;font-weight:700;color:#e8dcc8;line-height:1.15;font-variant-numeric:tabular-nums;white-space:nowrap;}' +
        '.slp-float-alt-floor{font-size:9px;font-weight:600;color:#b08d57;line-height:1.15;letter-spacing:.25px;' +
        'text-transform:uppercase;white-space:nowrap;max-width:110px;overflow:hidden;text-overflow:ellipsis;}' +
        '.slp-share-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:999999;display:flex;' +
        'align-items:center;justify-content:center;padding:16px;font-family:system-ui,-apple-system,sans-serif;' +
        '-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);}' +
        '.slp-share-card{background:#fff;border-radius:16px;padding:18px;max-width:360px;width:100%;' +
        'max-height:88vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.25);}' +
        '.slp-share-title{margin:0 0 4px;font-size:16px;font-weight:700;color:#111827;}' +
        '.slp-share-sub{margin:0 0 14px;font-size:12px;color:#6b7280;word-break:break-all;}' +
        '.slp-share-open{width:100%;padding:14px;border:none;border-radius:10px;background:#3b82f6;color:#fff;' +
        'font-size:15px;font-weight:700;cursor:pointer;margin-bottom:8px;display:flex;align-items:center;' +
        'justify-content:center;gap:6px;transition:background .15s;}' +
        '.slp-share-open:active{background:#2563eb;}' +
        '.slp-share-open.ok{background:#16a34a;}' +
        '.slp-share-ghost{width:100%;padding:11px;border:1px solid #e5e7eb;border-radius:9px;background:#f9fafb;' +
        'color:#374151;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:8px;display:flex;' +
        'align-items:center;justify-content:center;gap:6px;}' +
        '.slp-share-ghost:active{background:#f3f4f6;}' +
        '.slp-share-ghost.ok{background:#dcfce7;border-color:#86efac;color:#15803d;}' +
        '.slp-share-divider{display:flex;align-items:center;gap:8px;margin:12px 0 8px;color:#9ca3af;font-size:11px;}' +
        '.slp-share-divider::before,.slp-share-divider::after{content:"";flex:1;height:1px;background:#e5e7eb;}' +
        '.slp-share-text{width:100%;box-sizing:border-box;height:84px;resize:none;border:1px solid #e5e7eb;' +
        'border-radius:8px;padding:8px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:10px;' +
        'color:#374151;background:#f9fafb;line-height:1.4;margin-bottom:6px;-webkit-user-select:text;user-select:text;}' +
        '.slp-share-hint{font-size:11px;color:#9ca3af;margin:0 0 12px;line-height:1.4;}' +
        '.slp-share-cancel{width:100%;padding:9px;border:none;border-radius:8px;background:transparent;' +
        'color:#9ca3af;font-size:13px;font-weight:600;cursor:pointer;}';

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
    // Pano kopyalama yedeği (clipboard API yoksa / webview'de): gizli textarea + execCommand
    function legacyCopy(text) {
        try {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.top = '-9999px';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            ta.setSelectionRange(0, text.length);
            var ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return ok;
        } catch (e) {
            return false;
        }
    }
    // Kat adını ada/log için tek satırda göster ("Zemin - Varış" → "Zemin · Varış")
    function formatFloorLabel(floorName, floor) {
        if (floorName) return String(floorName).replace(/\s*[-–—]\s*/g, ' · ').trim();
        if (floor != null) return 'Kat ' + floor;
        return null;
    }
    function buildShareFile(json, filename, mime) {
        var blob = new Blob([json], { type: mime });
        return new File([blob], filename, { type: mime, lastModified: Date.now() });
    }
    // Bu ortam Web Share ile DOSYA paylaşımını gerçekten destekliyor mu?
    function supportsFileShare() {
        if (typeof navigator.share !== 'function') return false;
        if (typeof navigator.canShare !== 'function') return false;
        if (typeof File !== 'function' || typeof Blob !== 'function') return false;
        try {
            return navigator.canShare({ files: [buildShareFile('{}', 'test.json', 'application/json')] });
        } catch (e) {
            return false;
        }
    }
    // Paylaşım dosyasını tıklama anında (senkron) seç — desteklenen ilk MIME türü
    function pickShareFile(json, filename) {
        if (typeof File !== 'function' || typeof Blob !== 'function') return null;
        var isAndroid = /Android/i.test(navigator.userAgent);
        var mimes = isAndroid
            ? ['text/plain', 'application/octet-stream', 'application/json']
            : ['application/json', 'text/plain', 'application/octet-stream'];
        var best = null;
        for (var i = 0; i < mimes.length; i++) {
            try {
                var file = buildShareFile(json, filename, mimes[i]);
                if (!best) best = file;
                if (!navigator.canShare || navigator.canShare({ files: [file] })) {
                    return file;
                }
            } catch (e) { /* sonraki MIME */ }
        }
        return best;
    }
    function fmtBytes(n) {
        if (n == null) return '';
        if (n < 1024) return n + ' B';
        if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
        return (n / 1048576).toFixed(1) + ' MB';
    }
    function formatAltitudeParts(altitude, floorName, floor) {
        var parts = [];
        if (altitude != null && isFinite(altitude)) parts.push('yük ' + num(altitude, 1) + 'm');
        var fl = formatFloorLabel(floorName, floor);
        if (fl) parts.push(fl);
        return parts;
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
            geofenceSince: Date.now(),
            altitude: null,        // son filtrelenmiş yükseklik (m, MSL)
            floor: null,           // son tespit edilen kat
            floorName: null        // son kat adı
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
            orientationUpdates: 0,
            displayUpdates: 0,
            pdrSteps: 0,
            pdrBlocked: 0,
            jumps: 0,
            drSessions: 0,
            drTotalMs: 0,
            modeDurations: { real: 0, fallback: 0, pdr: 0, rejected: 0 }
        };

        // Önceki core istatistik snapshot'ı (red sebebi tespiti için)
        this._prevCoreStats = this._snapshotCoreStats();
        this._lastRaw = null;
        this._lastPosKey = null;
        this._lastAngle = null;
        this._jumpActive = false; // isJump bayrağı yeni ham fix gelene kadar yapışık kalır; sadece yükselen kenarda logla
    }

    LocateLogger.prototype._posKey = function (payload) {
        if (!payload || payload.lat == null || payload.lng == null) return null;
        return Math.round(payload.lat * 1e6) + ':' + Math.round(payload.lng * 1e6) + ':' +
            Math.round((payload.accuracy || 0) * 10);
    };

    LocateLogger.prototype._resolveDisplayMode = function (payload) {
        var ctrl = this.ctrl;
        var isPDR = !!(payload.isPDR || (ctrl && ctrl._pdr && ctrl._pdr.active));
        var isFallback = !!(payload.isFallback || (ctrl && ctrl._isFallbackLocation));
        var rawOutside = this.state.geofenceInside === false;

        if (isPDR) return 'pdr';
        if (isFallback) return 'fallback';
        if (rawOutside) return 'fallback';
        return 'real';
    };

    LocateLogger.prototype._isOrientationOnly = function (payload) {
        if (payload.updateKind === 'orientation') return true;
        if (payload.updateKind === 'reject') return false;
        if (payload.lat == null || payload.lng == null) return true;
        var key = this._posKey(payload);
        if (key && key === this._lastPosKey) return true;
        return false;
    };

    LocateLogger.prototype._applyModeChange = function (mode, now) {
        if (mode === this.state.mode) return;
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
    };

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

    // PDR sinyal teşhisi (saniyede bir) — adım sayılmama nedenini gösterir
    LocateLogger.prototype.notePdrSample = function (info) {
        if (!info) return;
        var max = info.maxLinear != null ? num(info.maxLinear, 2) : '--';
        var th = info.threshold != null ? num(info.threshold, 2) : '--';
        var lvl = 'info';
        var note = '';
        if (info.stepsDelta > 0) {
            note = info.stepsDelta + ' adım';
        } else if (info.maxLinear != null && info.threshold != null && info.maxLinear < info.threshold) {
            lvl = 'warn';
            note = 'zirve eşik altında (yürüyüş yok / sinyal zayıf)';
        } else if (info.maxLinear != null && info.threshold != null && info.maxLinear >= info.threshold) {
            note = 'zirve eşik üstü ama adım yok (cooldown/min-peak)';
        }
        this.log('dr', lvl,
            'PDR sinyal · max ' + max + ' / eşik ' + th + ' · ' + (info.hz || 0) + 'Hz · ' +
            (info.source || '--') + (note ? ' · ' + note : ''),
            { maxLinear: info.maxLinear, threshold: info.threshold, hz: info.hz,
              source: info.source, stepsDelta: info.stepsDelta });
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
        if (info.moved === false) {
            this.stats.pdrBlocked = (this.stats.pdrBlocked || 0) + 1;
            this.log('step', 'warn',
                'Adım algılandı ama konum güncellenmedi' +
                (info.blockedReason ? ' (' + info.blockedReason + ')' : ''),
                { heading: info.heading != null ? num(info.heading, 0) + '°' : '--',
                  lat: info.lat, lng: info.lng, accuracy: info.accuracy,
                  blockedReason: info.blockedReason });
            this._notify();
            return;
        }
        this.stats.pdrSteps++;
        if (this.drSession) this.drSession.steps++;
        this.log('step', 'info',
            'PDR adım #' + (info.stepCount != null ? info.stepCount : this.stats.pdrSteps),
            { stepCount: info.stepCount, heading: info.heading != null ? num(info.heading, 0) + '°' : '--',
              lat: info.lat, lng: info.lng, accuracy: info.accuracy });
    };

    // Her konum güncellemesi (afterDeviceMove) — ana durum makinesi
    LocateLogger.prototype.ingestUpdate = function (payload) {
        if (!payload) return;
        var ctrl = this.ctrl;
        var now = Date.now();
        var isRejected = !!payload.isRejected;
        var inside = this.state.geofenceInside;
        var orientationOnly = !isRejected && this._isOrientationOnly(payload);

        // Yükseklik/kat bilgisini her güncellemede yakala (canlı durumda güncel kalsın)
        if (payload.altitude != null && isFinite(payload.altitude)) this.state.altitude = payload.altitude;
        if (payload.floor != null) this.state.floor = payload.floor;
        if (payload.floorName != null) this.state.floorName = payload.floorName;

        // ----- Red olayı (gösterim modundan ayrı) -----
        if (isRejected) {
            this.stats.rejected++;
            var cur = this._snapshotCoreStats();
            var prev = this._prevCoreStats;
            var reason = 'bilinmiyor';
            if (cur.geofenceRejections > prev.geofenceRejections) { reason = 'alan dışı (geofence)'; this.stats.rejGeofence++; }
            else if (cur.accuracyRejections > prev.accuracyRejections) { reason = 'düşük doğruluk'; this.stats.rejAccuracy++; }
            else if (cur.speedRejections > prev.speedRejections) { reason = 'aşırı hız (sıçrama)'; this.stats.rejSpeed++; }
            if (payload.locationError) reason = 'GPS hatası: ' + payload.locationError.message;
            var rejParts = formatAltitudeParts(this.state.altitude, this.state.floorName, this.state.floor);
            var rejSuffix = rejParts.length ? ' · ' + rejParts.join(' · ') : '';
            this.log('reject', payload.locationError ? 'error' : 'warn',
                'Ham GPS reddedildi — ' + reason + rejSuffix,
                { lat: payload.lat, lng: payload.lng, accuracy: payload.accuracy, reason: reason });
            this._prevCoreStats = cur;

            var displayMode = this._resolveDisplayMode(payload);
            if (ctrl && ctrl._pdr && ctrl._pdr.active) {
                displayMode = 'pdr';
            } else if (payload.lat != null && payload.lng != null && displayMode !== 'real') {
                displayMode = 'fallback';
            } else if (payload.lat == null || payload.lng == null) {
                displayMode = 'rejected';
            }
            this._applyModeChange(displayMode, now);
            this._notify();
            return;
        }

        // ----- Yön güncellemesi (konum değişmedi — log gürültüsünü kes) -----
        if (orientationOnly) {
            this.stats.orientationUpdates++;
            if (this._lastPosKey || this.state.mode !== 'idle') {
                this._applyModeChange(this._resolveDisplayMode(payload), now);
            }
            this._lastAngle = payload.angle;
            this._notify();
            return;
        }

        // ----- Gerçek konum güncellemesi -----
        this.stats.accepted++;
        this.stats.displayUpdates++;
        this._prevCoreStats = this._snapshotCoreStats();

        if (payload.isJump) {
            if (!this._jumpActive) {
                this._jumpActive = true;
                this.stats.jumps++;
                this.log('filter', 'warn', 'Ani sıçrama (jump) tespit edildi ve filtrelendi',
                    { lat: payload.lat, lng: payload.lng });
            }
        } else {
            this._jumpActive = false;
        }

        var mode = this._resolveDisplayMode(payload);
        this._applyModeChange(mode, now);

        if (mode === 'fallback') this.stats.fallbackUpdates++;

        var parts = [];
        parts.push('acc ' + num(payload.accuracy, 1) + 'm');
        if (payload.confidence != null) parts.push('güven %' + num(payload.confidence, 0));
        var altVal = (payload.altitude != null && isFinite(payload.altitude)) ? payload.altitude : this.state.altitude;
        var flName = payload.floorName != null ? payload.floorName : this.state.floorName;
        var flNum = payload.floor != null ? payload.floor : this.state.floor;
        parts = parts.concat(formatAltitudeParts(altVal, flName, flNum));
        if (payload.angle != null) parts.push(num(payload.angle, 0) + '°');
        if (payload.pdrStepCount != null && payload.isPDR) parts.push('adım ' + payload.pdrStepCount);

        var mlabel = (MODE_INFO[mode] || MODE_INFO.idle).label;
        var lvl = mode === 'real' ? 'success' : 'info';
        var gfHint = inside === false && mode !== 'real' ? ' · ham sinyal dışarıda' : '';

        this.log('location', lvl,
            mlabel + ' güncellendi · ' + parts.join(' · ') + gfHint,
            {
                lat: payload.lat, lng: payload.lng, accuracy: payload.accuracy,
                confidence: payload.confidence, mode: mode, geofenceInside: inside,
                floor: payload.floor, floorName: payload.floorName, angle: payload.angle,
                altitude: payload.altitude, isPDR: payload.isPDR, pdrStepCount: payload.pdrStepCount,
                updateKind: payload.updateKind
            });

        this._lastPosKey = this._posKey(payload);
        this._lastAngle = payload.angle;
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
            drSteps: this.drSession ? this.drSession.steps : 0,
            altitude: this.state.altitude,
            floor: this.state.floor,
            floorName: this.state.floorName
        };
    };

    // ----- Export -----
    LocateLogger.prototype.exportJSON = function () {
        var stats = Object.assign({}, this.stats);
        if (this.drSession) {
            stats.drTotalMs += Date.now() - this.drSession.start;
        }
        return JSON.stringify({
            exportedAt: new Date().toISOString(),
            stats: stats,
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
            self._renderFloatStatus();
            if (self.open && self.activeTab === 'logs') self._renderLiveStatus();
        }, 500);
    }

    // ---- Core instance metodlarını sar (olayları yakala) ----
    SimpleLocatePanel.prototype._hookControl = function () {
        var self = this;
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

        // PDR adımı algılandı
        if (typeof ctrl._onStepDetected === 'function') {
            var origStep = ctrl._onStepDetected;
            ctrl._onStepDetected = function () {
                var before = this._pdr ? {
                    lat: this._pdr.currentLatitude,
                    lng: this._pdr.currentLongitude,
                    stepCount: this._pdr.stepCount
                } : null;
                var result = origStep.apply(this, arguments);
                if (this._pdr && before) {
                    var moved = result === 'ok';
                    logger.noteStep({
                        stepCount: this._pdr.stepCount,
                        heading: this._angle,
                        lat: this._pdr.currentLatitude,
                        lng: this._pdr.currentLongitude,
                        accuracy: this._pdr.currentAccuracy,
                        moved: moved,
                        blockedReason: result === 'no_heading' ? 'pusula yok'
                            : (result === 'geofence' ? 'geofence sınırı' : null)
                    });
                }
                return result;
            };
        }

        // Motion izni değişince paneldeki durum göstergesini güncelle
        var prevMotionCb = ctrl.options ? ctrl.options.onMotionPermissionChange : null;
        if (ctrl.options) {
            ctrl.options.onMotionPermissionChange = function (state) {
                try { self._renderMotionStatus(); } catch (e) {}
                if (typeof prevMotionCb === 'function') {
                    try { return prevMotionCb.apply(this, arguments); } catch (e) {}
                }
            };
        }

        // PDR sinyal teşhisi (saniyede bir) — adım sayılmama nedenini görmek için
        if (typeof ctrl._pdrSampleTick === 'function') {
            var origTick = ctrl._pdrSampleTick;
            ctrl._pdrSampleTick = function (info) {
                try { logger.notePdrSample(info); } catch (e) {}
                return origTick.apply(this, arguments);
            };
        }

        // Konum güncelleme akışı.
        // Extended katmanı varsa onDeviceMove aboneliğini kullan (zenginleştirme orada
        // BİR KEZ yapılır; çift sarma/çift hesaplama olmaz). Yoksa option'ı sar (fallback).
        if (typeof ctrl.onDeviceMove === 'function') {
            ctrl.onDeviceMove(function (enriched) {
                try { logger.ingestUpdate(enriched); } catch (e) {}
            });
        } else {
            var origADM = ctrl.options ? ctrl.options.afterDeviceMove : null;
            ctrl.options.afterDeviceMove = function (loc) {
                var enriched = loc;
                if (typeof ctrl._enrichLocationPayload === 'function') {
                    try { enriched = ctrl._enrichLocationPayload(loc); } catch (e) {}
                }
                try { logger.ingestUpdate(enriched); } catch (e) {}
                if (typeof origADM === 'function') {
                    try { return origADM.apply(this, arguments); } catch (e) {}
                }
            };
        }
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

        // Üst orta — canlı durum chip'i (panel kapalıyken de görünür)
        this.floatStatusEl = document.createElement('div');
        this.floatStatusEl.className = 'slp-float-status';
        this.floatStatusEl.innerHTML = '<div class="slp-float-pill"></div>';
        document.body.appendChild(this.floatStatusEl);

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
        this._renderFloatStatus();
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

        // Paylaş — webview'de indirme çalışmadığında yerel paylaş menüsü (Slack/WhatsApp/e-posta),
        // desteklenmiyorsa panoya kopyalama yedeği
        var shareBtn = document.createElement('button');
        shareBtn.className = 'slp-btn';
        shareBtn.textContent = '📤 Paylaş';
        shareBtn.addEventListener('click', function () { self._shareLogs(shareBtn); });
        toolbar.appendChild(shareBtn);

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

    SimpleLocatePanel.prototype._renderFloatStatus = function () {
        if (!this.floatStatusEl) return;
        var pill = this.floatStatusEl.querySelector('.slp-float-pill');
        if (!pill) return;

        var s = this.logger.getLiveStatus();
        var mi = MODE_INFO[s.mode] || MODE_INFO.idle;
        var alt = s.altitude != null && isFinite(s.altitude) ? s.altitude : null;
        var floorLbl = formatFloorLabel(s.floorName, s.floor);

        var html = '<div class="slp-float-left">';
        html += '<span class="slp-badge" style="background:' + mi.color + '">' + mi.label + '</span>';
        html += '<span class="slp-float-meta">' + fmtDur(s.modeFor) + '</span>';

        if (s.geofenceInside === false) {
            html += '<span class="slp-float-gf" style="color:#fcd34d">DIŞARIDA</span>';
        } else if (s.geofenceInside === true) {
            html += '<span class="slp-float-gf" style="color:#86efac">İÇERİDE</span>';
        }

        if (s.drActive && s.drSteps > 0) {
            html += '<span class="slp-float-meta" style="color:#c4b5fd">' + s.drSteps + ' adım</span>';
        }
        html += '</div>';

        html += '<div class="slp-float-divider"></div>';
        html += '<div class="slp-float-alt">';
        html += '<span class="slp-float-alt-val">' + (alt != null ? alt.toFixed(0) + ' m' : '-- m') + '</span>';
        if (floorLbl) {
            html += '<span class="slp-float-alt-floor">' + floorLbl + '</span>';
        }
        html += '</div>';

        pill.innerHTML = html;
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
        if (s.altitude != null && isFinite(s.altitude)) {
            html += '<div class="slp-kv"><span class="k">Yükseklik</span><span class="v" style="color:#b08d57">' + s.altitude.toFixed(1) + ' m</span></div>';
        } else {
            html += '<div class="slp-kv"><span class="k">Yükseklik</span><span class="v" style="color:#64748b">--</span></div>';
        }
        var liveFloor = formatFloorLabel(s.floorName, s.floor);
        if (liveFloor) {
            html += '<div class="slp-kv"><span class="k">Kat</span><span class="v" style="color:#b08d57">' + liveFloor + '</span></div>';
        }
        this.statusEl.innerHTML = html;
    };

    SimpleLocatePanel.prototype._renderStats = function () {
        if (!this.statsEl) return;
        var st = this.logger.stats;
        var items = [
            [st.rawFixes, 'Ham GPS'],
            [st.displayUpdates || st.accepted, 'Gösterim'],
            [st.rejected, 'Red'],
            [st.fallbackUpdates, 'Son iyi'],
            [st.pdrSteps, 'PDR adım'],
            [st.pdrBlocked || 0, 'PDR engel'],
            [st.drSessions, 'DR oturum'],
            [fmtDur(st.drTotalMs + (this.logger.drSession ? Date.now() - this.logger.drSession.start : 0)), 'Top. DR'],
            [st.orientationUpdates || 0, 'Yön (sessiz)']
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

    SimpleLocatePanel.prototype._renderMotionStatus = function () {
        if (!this._motionStatusEl) return;
        var ctrl = this.ctrl;
        var state = typeof ctrl.getMotionPermissionState === 'function'
            ? ctrl.getMotionPermissionState() : 'unknown';
        var el = this._motionStatusEl;
        el.style.display = '';
        if (state === 'granted' || state === 'not-required') {
            el.style.background = '#dcfce7';
            el.style.borderColor = '#86efac';
            el.style.color = '#166534';
            el.innerHTML = '✓ Hareket sensörü etkin — PDR adım sayımı çalışabilir.';
        } else if (state === 'denied') {
            el.style.background = '#fee2e2';
            el.style.borderColor = '#fca5a5';
            el.style.color = '#991b1b';
            el.innerHTML = '✕ Hareket sensörü izni reddedildi. <b>Konum butonuna</b> tekrar dokunup ' +
                'izni onaylayın (iOS). Reddettiyseniz Ayarlar → Safari → Hareket ve Yön erişimini açın.';
        } else {
            el.style.background = '#fef3c7';
            el.style.borderColor = '#fde68a';
            el.style.color = '#92400e';
            el.innerHTML = '⏳ Hareket sensörü izni bekleniyor. PDR için <b>konum butonuna</b> dokunun.';
        }
    };

    SimpleLocatePanel.prototype._bindLogger = function () {
        var self = this;
        var schedule = window.requestAnimationFrame
            ? function (fn) { window.requestAnimationFrame(fn); }
            : function (fn) { window.setTimeout(fn, 16); };
        this.logger.onChange(function () {
            self._renderFloatStatus();
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
        // Hareket sensörü izni durumu (yalnızca bilgi — ayrı buton yok, konum butonu tetikler)
        this._motionStatusEl = document.createElement('div');
        this._motionStatusEl.className = 'slp-hint';
        fs.appendChild(this._motionStatusEl);
        this._renderMotionStatus();
        this._toggle(fs, 'Son İyi Konum Fallback', o.enableLastGoodLocation !== false, function (v) {
            self._setFeature('lastGoodLocation', v, function () { ctrl.options.enableLastGoodLocation = v; });
        });
        this._toggle(fs, 'Fallback Marker Soluklaştır', o.fadeMarkerOnFallback !== false, function (v) {
            self._setFeature('fadeMarkerOnFallback', v, function () { ctrl.options.fadeMarkerOnFallback = v; });
        });

        // --- Deneysel (test) ---
        var exp = this._section(pane, 'Sabit-Hız Kalman Füzyonu');
        this._toggle(exp, 'Sabit-Hız Kalman Füzyonu', !!o.experimentalFusion, function (v) {
            self._setFeature('experimentalFusion', v, function () {
                ctrl.options.experimentalFusion = v;
                if (ctrl._kalmanFilter) {
                    ctrl._kalmanFilter.v_lat = 0;
                    ctrl._kalmanFilter.v_lng = 0;
                    ctrl._kalmanFilter.cvTime = null;
                }
            });
        });
        var expHint = document.createElement('div');
        expHint.className = 'slp-hint';
        expHint.innerHTML = 'Yürürken GPS takip gecikmesini azaltmayı dener.';
        exp.appendChild(expHint);

        // --- Geofence (görünürlük + interaktif çizim) ---
        if (typeof ctrl.toggleGeofence === 'function') {
            this._buildGeofenceSection(pane);
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

    // ---- Geofence bölümü (görünürlük + interaktif çizim) ----
    SimpleLocatePanel.prototype._buildGeofenceSection = function (pane) {
        var self = this;
        var ctrl = this.ctrl;
        var sec = this._section(pane, 'Geofence');

        // Görünürlük toggle
        this._toggle(sec, 'Geofence Çizimini Göster', ctrl.isGeofenceVisible(), function (v) {
            ctrl.toggleGeofence(v);
        });

        // Çizim butonları satırı
        this._gfDrawBtn = document.createElement('button');
        this._gfDrawBtn.className = 'slp-btn-full draw';
        this._gfDrawBtn.textContent = '✏️ Haritada Çiz';
        this._gfDrawBtn.addEventListener('click', function () {
            if (self._drawing) self._finishDrawGeofence();
            else self._startDrawGeofence();
        });

        this._gfCancelBtn = document.createElement('button');
        this._gfCancelBtn.className = 'slp-btn-full cancel';
        this._gfCancelBtn.textContent = '✕ İptal';
        this._gfCancelBtn.style.display = 'none';
        this._gfCancelBtn.addEventListener('click', function () { self._cancelDrawGeofence(); });

        var row1 = document.createElement('div');
        row1.className = 'slp-btn-row';
        row1.appendChild(this._gfDrawBtn);
        row1.appendChild(this._gfCancelBtn);
        sec.appendChild(row1);

        // Yardımcı butonlar
        var clearBtn = document.createElement('button');
        clearBtn.className = 'slp-btn-full ghost';
        clearBtn.textContent = '🗑 Temizle';
        clearBtn.addEventListener('click', function () { self._clearGeofence(); });

        var copyBtn = document.createElement('button');
        copyBtn.className = 'slp-btn-full ghost';
        copyBtn.textContent = '⬇ Koordinatları Kopyala';
        copyBtn.addEventListener('click', function () { self._copyGeofence(copyBtn); });

        var row2 = document.createElement('div');
        row2.className = 'slp-btn-row';
        row2.appendChild(clearBtn);
        row2.appendChild(copyBtn);
        sec.appendChild(row2);

        // İpucu metni (çizim sırasında görünür)
        this._gfHint = document.createElement('div');
        this._gfHint.className = 'slp-hint';
        this._gfHint.style.display = 'none';
        sec.appendChild(this._gfHint);
    };

    SimpleLocatePanel.prototype._startDrawGeofence = function () {
        var self = this;
        var map = this.ctrl._map;
        if (!map) return;

        this._drawing = true;
        this._drawPoints = [];
        this._drawVertices = [];
        if (this._drawPreview) { map.removeLayer(this._drawPreview); this._drawPreview = null; }

        // Mevcut geofence çizimini gizle (karışmasın)
        this._gfWasVisible = this.ctrl.isGeofenceVisible();
        this.ctrl.hideGeofence();

        map.getContainer().style.cursor = 'crosshair';
        if (map.doubleClickZoom) map.doubleClickZoom.disable();
        this._drawClickHandler = function (e) { self._onDrawClick(e); };
        map.on('click', this._drawClickHandler);

        this._gfDrawBtn.className = 'slp-btn-full ok';
        this._gfDrawBtn.textContent = '✓ Bitir (0)';
        this._gfCancelBtn.style.display = '';
        this._gfHint.style.display = '';
        this._gfHint.textContent = 'Haritaya tıklayarak köşe noktalarını ekle. En az 3 nokta gerekli, sonra "Bitir"e bas.';

        if (this.logger) this.logger.log('geofence', 'info', 'Geofence çizim modu başladı', null);
    };

    SimpleLocatePanel.prototype._onDrawClick = function (e) {
        var map = this.ctrl._map;
        var ll = e.latlng;
        this._drawPoints.push({ lat: ll.lat, lng: ll.lng });

        var v = L.circleMarker(ll, {
            radius: 5, color: '#fff', weight: 2,
            fillColor: '#e91e63', fillOpacity: 1, interactive: false
        }).addTo(map);
        this._drawVertices.push(v);

        var latlngs = this._drawPoints.map(function (p) { return [p.lat, p.lng]; });
        if (!this._drawPreview) {
            this._drawPreview = L.polygon(latlngs, {
                color: '#e91e63', weight: 2, dashArray: '5, 5',
                fillColor: '#e91e63', fillOpacity: 0.08, interactive: false
            }).addTo(map);
        } else {
            this._drawPreview.setLatLngs(latlngs);
        }

        this._gfDrawBtn.textContent = '✓ Bitir (' + this._drawPoints.length + ')';
    };

    SimpleLocatePanel.prototype._finishDrawGeofence = function () {
        var map = this.ctrl._map;
        if (this._drawPoints.length < 3) {
            this._gfHint.textContent = 'En az 3 nokta gerekli (' + this._drawPoints.length + ' eklendi).';
            return;
        }
        var points = this._drawPoints.slice();

        // Geofence'i uygula
        if (typeof this.ctrl.setGeofence === 'function') {
            this.ctrl.setGeofence({ polygon: points });
        } else {
            this.ctrl.options.geofencePolygon = points;
        }
        if (typeof this.ctrl.refreshGeofenceLayer === 'function') this.ctrl.refreshGeofenceLayer();
        this.ctrl.showGeofence();

        this._teardownDraw();
        if (this.logger) {
            this.logger.log('geofence', 'success',
                'Yeni geofence çizildi (' + points.length + ' nokta) ve uygulandı', { points: points });
        }
    };

    SimpleLocatePanel.prototype._cancelDrawGeofence = function () {
        this._teardownDraw();
        if (this._gfWasVisible) this.ctrl.showGeofence();
        if (this.logger) this.logger.log('geofence', 'info', 'Geofence çizimi iptal edildi', null);
    };

    SimpleLocatePanel.prototype._teardownDraw = function () {
        var map = this.ctrl._map;
        this._drawing = false;
        if (map && this._drawClickHandler) map.off('click', this._drawClickHandler);
        this._drawClickHandler = null;
        if (map) {
            map.getContainer().style.cursor = '';
            if (map.doubleClickZoom) map.doubleClickZoom.enable();
        }
        if (this._drawVertices && map) {
            this._drawVertices.forEach(function (v) { map.removeLayer(v); });
        }
        this._drawVertices = [];
        if (this._drawPreview && map) { map.removeLayer(this._drawPreview); this._drawPreview = null; }
        this._drawPoints = [];

        if (this._gfDrawBtn) {
            this._gfDrawBtn.className = 'slp-btn-full draw';
            this._gfDrawBtn.textContent = '✏️ Haritada Çiz';
        }
        if (this._gfCancelBtn) this._gfCancelBtn.style.display = 'none';
        if (this._gfHint) this._gfHint.style.display = 'none';
    };

    SimpleLocatePanel.prototype._clearGeofence = function () {
        if (this._drawing) this._teardownDraw();
        this.ctrl.hideGeofence();
        this.ctrl.options.geofencePolygon = null;
        this.ctrl.options.geofenceBounds = null;
        this.ctrl.options.geofenceCenter = null;
        this.ctrl.options.geofenceRadius = null;
        if (this.ctrl._geofenceCache) this.ctrl._geofenceCache.isInside = null;
        if (typeof this.ctrl.refreshGeofenceLayer === 'function') this.ctrl.refreshGeofenceLayer();
        if (this.logger) this.logger.log('geofence', 'warn', 'Geofence temizlendi', null);
    };

    SimpleLocatePanel.prototype._copyGeofence = function (btn) {
        var poly = this.ctrl.options.geofencePolygon;
        if (!poly || !poly.length) {
            btn.textContent = 'Geofence yok';
            var self0 = this;
            setTimeout(function () { btn.textContent = '⬇ Koordinatları Kopyala'; }, 1500);
            return;
        }
        var lines = poly.map(function (p) {
            return '    { lat: ' + p.lat.toFixed(6) + ', lng: ' + p.lng.toFixed(6) + ' }';
        });
        var text = 'const geofencePolygon = [\n' + lines.join(',\n') + '\n];';
        var done = function () {
            btn.textContent = '✓ Kopyalandı';
            setTimeout(function () { btn.textContent = '⬇ Koordinatları Kopyala'; }, 1500);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, done);
        } else {
            done();
        }
    };

    // Logları paylaş — tek bir "paylaşım merkezi" modalı her ortamda çalışan
    // en az bir yol sunar: Web Share (varsa) · panoya kopyala · indir · elle seç.
    // iOS/Android tarayıcı + uygulama içi WebView + masaüstü için güvenli.
    SimpleLocatePanel.prototype._shareLogs = function (btn) {
        var json = this.logger.exportJSON();
        var filename = 'locate-log-' + Date.now() + '.json';

        // Açık entegrasyon: host uygulama (WebView) native paylaşım köprüsü verdiyse ona devret.
        var nativeCb = this.options && this.options.onShareLogs;
        if (typeof nativeCb === 'function') {
            try {
                nativeCb({ json: json, filename: filename, mime: 'application/json' });
                if (btn) {
                    var o0 = btn.textContent;
                    btn.textContent = '✓ Uygulamaya gönderildi';
                    setTimeout(function () { btn.textContent = o0; }, 2200);
                }
                return;
            } catch (e) { /* modala düş */ }
        }

        this._showShareModal(json, filename);
    };

    // Web Share ile dosya paylaşımı — modal butonunun kendi tıklama gesture'ı içinde çağrılır.
    SimpleLocatePanel.prototype._invokeFileShare = function (json, filename, statusBtn, onDone) {
        var file = pickShareFile(json, filename);
        if (!file) { if (onDone) onDone(false); return; }

        var payload = { files: [file] };
        if (/Android/i.test(navigator.userAgent)) payload.title = 'Konum logları';

        navigator.share(payload)
            .then(function () {
                if (statusBtn) { statusBtn.classList.add('ok'); statusBtn.innerHTML = '✓ Paylaşıldı'; }
                if (onDone) onDone(true);
            })
            .catch(function (err) {
                if (err && err.name === 'AbortError') { if (onDone) onDone(false); return; }
                if (statusBtn) statusBtn.innerHTML = '✕ Paylaşım açılamadı';
                if (onDone) onDone(false);
            });
    };

    // Paylaşım merkezi modalı — her platformda en az bir çalışan yol garanti eder.
    SimpleLocatePanel.prototype._showShareModal = function (json, filename) {
        var self = this;
        this._closeShareModal();

        var size = '';
        try { size = fmtBytes(new Blob([json]).size); } catch (e) { /* yok say */ }
        var count = (this.logger && this.logger.entries) ? this.logger.entries.length : 0;
        var canShareFiles = supportsFileShare();

        var overlay = document.createElement('div');
        overlay.className = 'slp-share-overlay';
        overlay.id = 'slp-share-overlay';

        var card = document.createElement('div');
        card.className = 'slp-share-card';

        var title = document.createElement('p');
        title.className = 'slp-share-title';
        title.textContent = 'Logları paylaş';

        var sub = document.createElement('p');
        sub.className = 'slp-share-sub';
        sub.textContent = filename + (size ? ' · ' + size : '') + (count ? ' · ' + count + ' olay' : '');

        card.appendChild(title);
        card.appendChild(sub);

        // 1) Web Share (destekleniyorsa) → sistem paylaş menüsü → Slack/Drive/Mail vb.
        if (canShareFiles) {
            var openBtn = document.createElement('button');
            openBtn.className = 'slp-share-open';
            openBtn.innerHTML = '📤 Uygulamayla paylaş';
            openBtn.addEventListener('click', function () {
                openBtn.disabled = true;
                self._invokeFileShare(json, filename, openBtn, function (ok) {
                    openBtn.disabled = false;
                    if (ok) setTimeout(function () { self._closeShareModal(); }, 900);
                });
            });
            card.appendChild(openBtn);
        }

        // 2) Panoya kopyala — neredeyse her ortamda çalışır
        var copyBtn = document.createElement('button');
        copyBtn.className = 'slp-share-ghost';
        copyBtn.innerHTML = '📋 Panoya kopyala';
        copyBtn.addEventListener('click', function () {
            self._copyLogsToClipboard(json, function (ok) {
                copyBtn.classList.toggle('ok', ok);
                copyBtn.innerHTML = ok ? '✓ Kopyalandı' : '✕ Kopyalanamadı — metni elle seçin';
                setTimeout(function () {
                    copyBtn.classList.remove('ok');
                    copyBtn.innerHTML = '📋 Panoya kopyala';
                }, 1800);
            });
        });
        card.appendChild(copyBtn);

        // 3) Garanti yedek: paylaşım/pano engelliyse metni elle seç-kopyala
        var divider = document.createElement('div');
        divider.className = 'slp-share-divider';
        divider.textContent = 'veya metni elle kopyala';
        card.appendChild(divider);

        var ta = document.createElement('textarea');
        ta.className = 'slp-share-text';
        ta.readOnly = true;
        ta.value = json;
        ta.addEventListener('focus', function () { ta.select(); });
        ta.addEventListener('click', function () { ta.select(); });
        card.appendChild(ta);

        var hint = document.createElement('p');
        hint.className = 'slp-share-hint';
        hint.textContent = 'Paylaşım çalışmazsa kutuya dokunup tümünü seçin, kopyalayıp Slack’e yapıştırın.';
        card.appendChild(hint);

        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'slp-share-cancel';
        cancelBtn.textContent = 'Kapat';
        cancelBtn.addEventListener('click', function () { self._closeShareModal(); });
        card.appendChild(cancelBtn);

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) self._closeShareModal();
        });

        overlay.appendChild(card);
        document.body.appendChild(overlay);
    };

    SimpleLocatePanel.prototype._closeShareModal = function () {
        var el = document.getElementById('slp-share-overlay');
        if (el) el.remove();
    };

    // Panoya kopyala — cb(success). Clipboard API yoksa/başarısızsa execCommand yedeği.
    SimpleLocatePanel.prototype._copyLogsToClipboard = function (text, cb) {
        cb = cb || function () {};
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(
                function () { cb(true); },
                function () { cb(legacyCopy(text)); }
            );
            return;
        }
        cb(legacyCopy(text));
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
        if (this._drawing) this._teardownDraw();
        if (this._tick) clearInterval(this._tick);
        if (this.handle && this.handle.parentNode) this.handle.parentNode.removeChild(this.handle);
        if (this.floatStatusEl && this.floatStatusEl.parentNode) this.floatStatusEl.parentNode.removeChild(this.floatStatusEl);
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
