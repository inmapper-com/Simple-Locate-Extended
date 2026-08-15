/**
 * SimpleLocate Replay — tarayıcıda kaydedilmiş logu güncel filtre zincirinden geçirir.
 *
 * Ham GPS ("Ham GPS sinyali") kayıtları L.Control.SimpleLocate._onLocationFound
 * üzerinden tekrar oynatılır. Amaç: saha logunun o anki kaydı (orijinal) ile
 * şu an yüklü eklenti kodunun üreteceği gösterimi (simülasyon) karşılaştırmak.
 *
 * PDR/ivmeölçer replay edilmez (deterministik değil). Geofence, logdaki
 * geofenceInside işaretlerinden türetilir.
 *
 * @requires leaflet-simple-locate.js
 */
(function (root) {
    'use strict';

    function haversine(lat1, lng1, lat2, lng2) {
        var R = 6371000;
        var toRad = function (x) { return (x * Math.PI) / 180; };
        var dLat = toRad(lat2 - lat1);
        var dLng = toRad(lng2 - lng1);
        var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
    }

    function extractRawFixes(log) {
        var out = [];
        var entries = (log && log.entries) || [];
        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            if (entry.category !== 'location' || entry.level !== 'info') continue;
            if (!/^Ham GPS/.test(entry.message || '')) continue;
            var d = entry.data || {};
            if (d.lat == null || d.lng == null) continue;
            out.push({
                seq: entry.seq,
                t: entry.t,
                latitude: d.lat,
                longitude: d.lng,
                accuracy: d.accuracy != null ? d.accuracy : 30,
                timestamp: entry.t,
                heading: d.heading != null ? d.heading : d.course,
                speed: d.speed != null ? d.speed : null,
                altitude: d.altitude != null ? d.altitude : d.altitudeRaw,
                geofenceInside: d.geofenceInside
            });
        }
        return out;
    }

    function inBox(f, b) {
        return f.latitude >= b.latMin && f.latitude <= b.latMax &&
            f.longitude >= b.lngMin && f.longitude <= b.lngMax;
    }

    function derivePolygonFromLog(fixes) {
        var ins = fixes.filter(function (f) { return f.geofenceInside === true; });
        var outs = fixes.filter(function (f) { return f.geofenceInside === false; });
        if (!ins.length) return null;

        var latMin = Infinity, latMax = -Infinity, lngMin = Infinity, lngMax = -Infinity;
        for (var i = 0; i < ins.length; i++) {
            var f = ins[i];
            latMin = Math.min(latMin, f.latitude);
            latMax = Math.max(latMax, f.latitude);
            lngMin = Math.min(lngMin, f.longitude);
            lngMax = Math.max(lngMax, f.longitude);
        }

        var edges = [
            { key: 'latMin', pick: function (x) { return x.latitude; }, dir: 1 },
            { key: 'latMax', pick: function (x) { return x.latitude; }, dir: -1 },
            { key: 'lngMin', pick: function (x) { return x.longitude; }, dir: 1 },
            { key: 'lngMax', pick: function (x) { return x.longitude; }, dir: -1 }
        ];
        var box = { latMin: latMin, latMax: latMax, lngMin: lngMin, lngMax: lngMax };
        for (var e = 0; e < edges.length; e++) {
            var edge = edges[e];
            var best = box[edge.key];
            var bestScore = -Infinity;
            var candidates = outs.map(edge.pick).concat([box[edge.key]]);
            for (var c = 0; c < candidates.length; c++) {
                var trial = Object.assign({}, box);
                trial[edge.key] = candidates[c];
                var score = 0;
                for (var a = 0; a < ins.length; a++) score += inBox(ins[a], trial) ? 1 : -1;
                for (var b = 0; b < outs.length; b++) score += inBox(outs[b], trial) ? -1 : 1;
                if (score > bestScore) { bestScore = score; best = candidates[c]; }
            }
            box[edge.key] = best;
        }
        return [
            { lat: box.latMin, lng: box.lngMin },
            { lat: box.latMax, lng: box.lngMin },
            { lat: box.latMax, lng: box.lngMax },
            { lat: box.latMin, lng: box.lngMax }
        ];
    }

    function posKey(p) {
        if (!p || p.lat == null || p.lng == null) return null;
        return Math.round(p.lat * 1e6) + ':' + Math.round(p.lng * 1e6) + ':' +
            Math.round((p.accuracy || 0) * 10);
    }

    function stubMap() {
        return {
            locate: function () {}, stopLocate: function () {},
            on: function () { return this; }, off: function () { return this; },
            hasLayer: function () { return false; },
            addLayer: function () {}, removeLayer: function () {},
            getZoom: function () { return 18; }, setView: function () {},
            getCenter: function () { return { lat: 0, lng: 0 }; },
            latLngToLayerPoint: function () { return { x: 0, y: 0 }; }
        };
    }

    /**
     * Ham fix'leri şu an yüklü SimpleLocate ile oynatır.
     * @param {Array} fixes extractRawFixes çıktısı
     * @param {Object} opts { polygon, isIOS, controlOptions }
     */
    function replay(fixes, opts) {
        opts = opts || {};
        var Lref = (typeof window !== 'undefined' && window.L) || root.L;
        if (!Lref || !Lref.Control || !Lref.Control.SimpleLocate) {
            throw new Error('SimpleLocate yüklü değil — leaflet-simple-locate.js gerekli');
        }

        var events = [];
        var currentFix = null;
        var SimpleLocate = Lref.Control.SimpleLocate;

        var userOpts = opts.controlOptions || {};
        var ctrl = new SimpleLocate(Object.assign({
            geofencePolygon: opts.polygon || null,
            enableGeofence: !!opts.polygon,
            indoorMode: true,
            enableDeadReckoning: false,
            enableAltitude: false,
            drawCircle: false,
            controlPanel: false
        }, userOpts, {
            enableDeadReckoning: false,
            controlPanel: false,
            drawCircle: false,
            afterDeviceMove: function (payload) {
                events.push({
                    fixSeq: currentFix ? currentFix.seq : null,
                    t: Date.now(),
                    lat: payload.lat,
                    lng: payload.lng,
                    accuracy: payload.accuracy,
                    angle: payload.angle,
                    isRejected: !!payload.isRejected,
                    isFallback: !!payload.isFallback,
                    isJump: !!payload.isJump,
                    coarseDisplay: !!payload.coarseDisplay,
                    updateKind: payload.updateKind,
                    rejectReason: payload.rejectReason || null,
                    reanchor: payload.reanchor || null,
                    displayJump: payload.displayJump || null
                });
            }
        }));

        ctrl._map = stubMap();
        if (opts.isIOS != null) ctrl._isIOS = !!opts.isIOS;

        if (opts.geoFromLog !== false) {
            var recorded = {};
            for (var i = 0; i < fixes.length; i++) {
                var fx = fixes[i];
                if (fx.geofenceInside == null) continue;
                recorded[Math.round(fx.latitude * 1e7) + ':' + Math.round(fx.longitude * 1e7)] =
                    fx.geofenceInside;
            }
            var originalCheck = ctrl._isInsideGeofence.bind(ctrl);
            ctrl._isInsideGeofence = function (lat, lng) {
                var hit = recorded[Math.round(lat * 1e7) + ':' + Math.round(lng * 1e7)];
                if (hit != null) return { inside: hit, distance: 0, source: 'log' };
                return originalCheck(lat, lng);
            };
        }

        var realNow = Date.now;
        var virtual = fixes.length ? fixes[0].t : realNow();
        Date.now = function () { return virtual; };

        try {
            ctrl._locateSessionStart = fixes.length ? fixes[0].t : virtual;
            var prevStats = Object.assign({}, ctrl._locationStats || {});
            for (var k = 0; k < fixes.length; k++) {
                var fix = fixes[k];
                currentFix = fix;
                virtual = fix.t;
                var before = events.length;
                ctrl._onLocationFound({
                    latitude: fix.latitude,
                    longitude: fix.longitude,
                    accuracy: fix.accuracy,
                    timestamp: fix.timestamp,
                    heading: fix.heading,
                    speed: fix.speed,
                    altitude: fix.altitude
                });
                var st = ctrl._locationStats || {};
                var causes = [];
                if ((st.accuracyRejections || 0) > (prevStats.accuracyRejections || 0)) causes.push('acc');
                if ((st.geofenceRejections || 0) > (prevStats.geofenceRejections || 0)) causes.push('geo');
                if ((st.speedRejections || 0) > (prevStats.speedRejections || 0)) causes.push('speed');
                if ((st.reanchors || 0) > (prevStats.reanchors || 0)) causes.push('REANCHOR');
                prevStats = Object.assign({}, st);
                for (var n = before; n < events.length; n++) events[n].cause = causes.join('+') || '';
                if (events.length === before) {
                    events.push({
                        fixSeq: fix.seq, t: fix.t, lat: null, lng: null,
                        accuracy: null, isRejected: false, isFallback: false,
                        isJump: false, updateKind: 'swallowed', cause: causes.join('+') || ''
                    });
                }
            }
        } finally {
            Date.now = realNow;
        }

        return { events: events, stats: ctrl._locationStats || {} };
    }

    function analyze(fixes, events) {
        var t0 = fixes.length ? fixes[0].t : 0;
        var lastKey = null;
        for (var i = 0; i < events.length; i++) {
            var ev = events[i];
            if (ev.updateKind === 'swallowed') { ev.panel = 'silent-no-callback'; continue; }
            if (ev.isRejected) { ev.panel = 'reject'; continue; }
            var key = posKey(ev);
            if (key && key === lastKey) { ev.panel = 'silent-same-position'; continue; }
            lastKey = key;
            ev.panel = ev.isFallback ? 'fallback' : 'real';
        }

        var realShown = events.filter(function (e) { return e.panel === 'real'; });
        var firstReal = realShown.length ? (realShown[0].t - t0) / 1000 : null;

        function isDisplayed(e) {
            return (e.panel === 'real' || e.panel === 'fallback') && e.lat != null;
        }

        var displayed = events.filter(isDisplayed);
        var jumps = [];
        for (var j = 1; j < displayed.length; j++) {
            var a = displayed[j - 1];
            var b = displayed[j];
            var dt = (b.t - a.t) / 1000;
            if (dt <= 0 || dt > 5) continue;
            var dist = haversine(a.lat, a.lng, b.lat, b.lng);
            jumps.push({
                fromSeq: a.fixSeq, toSeq: b.fixSeq, dist: dist, dt: dt,
                speed: dist / dt, kind: b.updateKind
            });
        }
        jumps.sort(function (x, y) { return y.dist - x.dist; });

        var reanchors = [];
        var prevDisplayed = null;
        for (var r = 0; r < events.length; r++) {
            var evr = events[r];
            if (evr.reanchor) {
                reanchors.push({
                    fixSeq: evr.fixSeq,
                    sec: (evr.t - t0) / 1000,
                    accuracy: evr.reanchor.accuracy,
                    fixCount: evr.reanchor.fixCount,
                    spanMs: evr.reanchor.spanMs,
                    lat: evr.lat, lng: evr.lng,
                    displayShift: prevDisplayed && evr.lat != null
                        ? haversine(prevDisplayed.lat, prevDisplayed.lng, evr.lat, evr.lng) : null
                });
            }
            if (isDisplayed(evr)) prevDisplayed = evr;
        }

        var lastDisplayed = null;
        var displayAt = {};
        for (var d = 0; d < events.length; d++) {
            var evd = events[d];
            if (evd.fixSeq == null) continue;
            if (isDisplayed(evd)) lastDisplayed = evd;
            if (lastDisplayed) displayAt[evd.fixSeq] = lastDisplayed;
        }
        var worstStale = { fixes: 0, sec: 0, fromSeq: null, toSeq: null, maxDist: 0 };
        var staleStart = null, staleFixes = 0, staleMax = 0;
        for (var s = 0; s < fixes.length; s++) {
            var fix = fixes[s];
            var disp = displayAt[fix.seq];
            var trustworthy = fix.accuracy <= 25;
            var distS = disp ? haversine(fix.latitude, fix.longitude, disp.lat, disp.lng) : 0;
            var bad = trustworthy && disp && distS > 30;
            if (bad) {
                if (staleStart == null) { staleStart = fix; staleFixes = 0; staleMax = 0; }
                staleFixes++;
                staleMax = Math.max(staleMax, distS);
            } else if (staleStart != null) {
                var sec = (fix.t - staleStart.t) / 1000;
                if (staleFixes > worstStale.fixes) {
                    worstStale = { fixes: staleFixes, sec: sec, fromSeq: staleStart.seq,
                        toSeq: fix.seq, maxDist: staleMax };
                }
                staleStart = null;
            }
        }

        return {
            fixes: fixes.length,
            firstRealAfterSec: firstReal,
            reanchors: reanchors,
            bigJumps: {
                over40: jumps.filter(function (j) { return j.dist > 40; }).length,
                over25: jumps.filter(function (j) { return j.dist > 25; }).length,
                maxDist: jumps.length ? jumps[0].dist : 0
            },
            counts: {
                real: events.filter(function (e) { return e.panel === 'real'; }).length,
                fallback: events.filter(function (e) { return e.panel === 'fallback'; }).length,
                reject: events.filter(function (e) { return e.panel === 'reject'; }).length,
                silentSamePosition: events.filter(function (e) { return e.panel === 'silent-same-position'; }).length,
                silentNoCallback: events.filter(function (e) { return e.panel === 'silent-no-callback'; }).length
            },
            worstStale: worstStale,
            topDisplayJumps: jumps.slice(0, 5),
            displayed: displayed,
            lag: measureLag(displayed, fixes, { matchSeq: true })
        };
    }

    function meanArr(arr) {
        if (!arr.length) return null;
        var s = 0;
        for (var i = 0; i < arr.length; i++) s += arr[i];
        return s / arr.length;
    }

    function percentileArr(arr, p) {
        if (!arr.length) return null;
        var a = arr.slice().sort(function (x, y) { return x - y; });
        var i = Math.min(a.length - 1, Math.max(0, Math.round((a.length - 1) * p)));
        return a[i];
    }

    /**
     * “Arkadan geliyor / durunca yetişiyor” ölçümü.
     *
     * displayed: {t, lat, lng, fixSeq?, panel?, kind?}[]
     * Ham GPS yürürken gösterim gerideyse meanMovingM yükselir.
     * Yürüme→duruştan sonra 3 m içine girene kadar geçen süre catchupMedianSec.
     */
    function measureLag(displayed, fixes, opts) {
        opts = opts || {};
        var empty = {
            meanMovingM: null, p90MovingM: null, maxMovingM: null,
            meanStoppedM: null, catchupMedianSec: null, catchupN: 0,
            catchupTimeoutN: 0, gapAfter3M: null, gapAtStopM: null,
            samplesMoving: 0, samplesStopped: 0, lagTicks: []
        };
        if (!displayed || !displayed.length || !fixes || !fixes.length) return empty;

        var rawBySeq = {};
        for (var i = 0; i < fixes.length; i++) {
            var sp = null;
            if (i > 0) {
                var dt = (fixes[i].t - fixes[i - 1].t) / 1000;
                if (dt > 0.05 && dt < 10) {
                    sp = haversine(
                        fixes[i - 1].latitude, fixes[i - 1].longitude,
                        fixes[i].latitude, fixes[i].longitude
                    ) / dt;
                }
            }
            fixes[i]._speed = sp;
            if (fixes[i].seq != null) rawBySeq[fixes[i].seq] = i;
        }

        function rawAt(t, seq) {
            if (opts.matchSeq !== false && seq != null && rawBySeq[seq] != null) {
                return fixes[rawBySeq[seq]];
            }
            var lo = 0, hi = fixes.length - 1, ans = 0;
            while (lo <= hi) {
                var mid = (lo + hi) >> 1;
                if (fixes[mid].t <= t) { ans = mid; lo = mid + 1; }
                else hi = mid - 1;
            }
            return fixes[ans];
        }

        var moving = [];
        var stopped = [];
        var ticks = [];
        var tickEvery = Math.max(1, Math.floor(displayed.length / 36));

        for (var d = 0; d < displayed.length; d++) {
            var p = displayed[d];
            if (p.lat == null || p.lng == null) continue;
            var kind = p.panel || p.kind;
            var isHold = kind === 'fallback' || kind === 'pdr' || kind === 'reject';
            var raw = rawAt(p.t, p.fixSeq);
            if (!raw) continue;
            var off = haversine(p.lat, p.lng, raw.latitude, raw.longitude);
            var spd = raw._speed;
            var isMoving = spd != null && spd >= 0.7;
            var isStopped = spd != null && spd < 0.35;
            if (!isHold && isMoving) {
                moving.push(off);
                if (d % tickEvery === 0 && off > 2.5) {
                    ticks.push({
                        from: [p.lat, p.lng],
                        to: [raw.latitude, raw.longitude],
                        offset: off
                    });
                }
            } else if (!isHold && isStopped) {
                stopped.push(off);
            }
        }

        function dispAt(t) {
            var best = null;
            for (var di = 0; di < displayed.length; di++) {
                var dx = displayed[di];
                if (dx.lat == null) continue;
                if (dx.t <= t) best = dx;
                else break;
            }
            return best;
        }

        // Gerçek duruş: önce net yer değişimi (zikzak GPS sayılmaz), sonra 2.5 sn hareketsizlik.
        var stops = [];
        var ni = 0;
        while (ni < fixes.length - 4) {
            var walkEnd = ni;
            while (walkEnd < fixes.length && (fixes[walkEnd].t - fixes[ni].t) < 10000) walkEnd++;
            walkEnd = Math.max(ni + 2, walkEnd - 1);
            var pathLen = 0;
            for (var w = ni + 1; w <= walkEnd; w++) {
                pathLen += haversine(
                    fixes[w - 1].latitude, fixes[w - 1].longitude,
                    fixes[w].latitude, fixes[w].longitude
                );
            }
            var net = haversine(
                fixes[ni].latitude, fixes[ni].longitude,
                fixes[walkEnd].latitude, fixes[walkEnd].longitude
            );
            var isWalk = net >= 10 && pathLen > 0 && (net / pathLen) >= 0.4;
            if (!isWalk) { ni++; continue; }

            var foundStop = false;
            var k = walkEnd;
            while (k < fixes.length && (fixes[k].t - fixes[walkEnd].t) < 8000) {
                var k2 = k;
                while (k2 < fixes.length && (fixes[k2].t - fixes[k].t) < 2500) k2++;
                if (k2 - k >= 2) {
                    var qNet = haversine(
                        fixes[k].latitude, fixes[k].longitude,
                        fixes[k2 - 1].latitude, fixes[k2 - 1].longitude
                    );
                    var maxSp = 0;
                    for (var u = k + 1; u < k2; u++) {
                        if (fixes[u]._speed != null) maxSp = Math.max(maxSp, fixes[u]._speed);
                    }
                    if (qNet < 5 && maxSp < 0.6) {
                        var slat = 0, slng = 0, cnt = 0;
                        for (var c = k; c < k2; c++) {
                            slat += fixes[c].latitude;
                            slng += fixes[c].longitude;
                            cnt++;
                        }
                        stops.push({
                            t: fixes[k].t,
                            lat: slat / cnt,
                            lng: slng / cnt
                        });
                        ni = k2;
                        foundStop = true;
                        break;
                    }
                }
                k++;
            }
            if (!foundStop) ni = walkEnd;
        }

        var catchups = [];
        var timeouts = 0;
        var gap3s = [];
        var gap0s = [];
        for (var s = 0; s < stops.length; s++) {
            var stop = stops[s];
            var at0 = dispAt(stop.t);
            if (!at0) continue;
            var gap0 = haversine(at0.lat, at0.lng, stop.lat, stop.lng);
            // Zaten oradaysa bu "arkadan yetişme" değil, atla
            if (gap0 < 6) continue;
            gap0s.push(gap0);
            var target = Math.max(5, Math.min(10, gap0 * 0.4));
            var tHit = null;
            var gap3 = gap0;
            for (var q = 0; q < displayed.length; q++) {
                var dp = displayed[q];
                if (dp.lat == null || dp.t < stop.t) continue;
                var g = haversine(dp.lat, dp.lng, stop.lat, stop.lng);
                if (dp.t - stop.t <= 3000) gap3 = g;
                if (g <= target) {
                    tHit = (dp.t - stop.t) / 1000;
                    break;
                }
                if (dp.t - stop.t > 15000) break;
            }
            gap3s.push(gap3);
            if (tHit == null) timeouts++;
            else catchups.push(tHit);
        }

        return {
            meanMovingM: meanArr(moving),
            p90MovingM: percentileArr(moving, 0.9),
            maxMovingM: moving.length ? Math.max.apply(null, moving) : null,
            meanStoppedM: meanArr(stopped),
            catchupMedianSec: percentileArr(catchups, 0.5),
            catchupN: catchups.length + timeouts,
            catchupTimeoutN: timeouts,
            gapAfter3M: meanArr(gap3s),
            gapAtStopM: meanArr(gap0s),
            samplesMoving: moving.length,
            samplesStopped: stopped.length,
            lagTicks: ticks
        };
    }

    /** Kayıtlı logdaki gösterilen konum yolunu çıkarır (orijinal oturum). */
    function extractOriginalPath(log) {
        var entries = (log && log.entries) || [];
        var t0 = entries.length ? entries[0].t : 0;
        var path = [];
        var firstRealSec = null;
        var reanchors = 0;
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            var d = e.data || {};
            var msg = e.message || '';
            if (/Yeniden çıpalandı/i.test(msg)) reanchors++;
            var lat = d.lat != null ? d.lat : d.baseLat;
            var lng = d.lng != null ? d.lng : d.baseLng;
            if (lat == null || lng == null) continue;
            var kind = null;
            if (e.category === 'reject' || /reddedildi/i.test(msg)) kind = 'reject';
            else if (e.category === 'filter' || /sıçrama|jump/i.test(msg)) kind = 'jump';
            else if (e.category === 'step' || d.isPDR || /DEAD RECKONING|PDR adım/i.test(msg)) kind = 'pdr';
            else if (/GERÇEK KONUM güncellendi|güncellendi ·/i.test(msg) && e.level === 'success') kind = 'real';
            else if (/SON İYİ|fallback|Kaba gösterim/i.test(msg)) kind = 'fallback';
            if (kind === 'real' || kind === 'pdr' || kind === 'fallback') {
                if (kind === 'real' && firstRealSec == null) firstRealSec = (e.t - t0) / 1000;
                path.push({
                    seq: e.seq, t: e.t, lat: +lat, lng: +lng,
                    accuracy: d.accuracy, angle: d.angle, kind: kind,
                    coarseDisplay: !!d.coarseDisplay
                });
            }
        }
        var jumps = [];
        for (var j = 1; j < path.length; j++) {
            var dt = (path[j].t - path[j - 1].t) / 1000;
            if (dt <= 0 || dt > 5) continue;
            jumps.push(haversine(path[j - 1].lat, path[j - 1].lng, path[j].lat, path[j].lng));
        }
        jumps.sort(function (a, b) { return b - a; });

        // Ham GPS güvenilirken gösterim hâlâ 30m+ uzaktaysa "hatalı donma"
        var raw = extractRawFixes(log);
        var worstStaleFixes = 0;
        var staleStart = null, staleCount = 0;
        var pathIdx = 0;
        for (var s = 0; s < raw.length; s++) {
            var fix = raw[s];
            while (pathIdx < path.length - 1 && path[pathIdx + 1].t <= fix.t) pathIdx++;
            var disp = path[pathIdx];
            var trustworthy = (fix.accuracy == null ? 99 : fix.accuracy) <= 25;
            var distS = (disp && disp.t <= fix.t)
                ? haversine(fix.latitude, fix.longitude, disp.lat, disp.lng) : 0;
            var bad = trustworthy && disp && disp.t <= fix.t && distS > 30;
            if (bad) {
                if (staleStart == null) { staleStart = fix; staleCount = 0; }
                staleCount++;
            } else if (staleStart != null) {
                if (staleCount > worstStaleFixes) worstStaleFixes = staleCount;
                staleStart = null;
            }
        }
        if (staleStart != null && staleCount > worstStaleFixes) worstStaleFixes = staleCount;

        return {
            path: path,
            firstRealAfterSec: firstRealSec,
            reanchors: reanchors,
            maxJump: jumps[0] || 0,
            jumpOver25: jumps.filter(function (d) { return d > 25; }).length,
            staleFixes: worstStaleFixes
        };
    }

    root.SimpleLocateReplay = {
        haversine: haversine,
        extractRawFixes: extractRawFixes,
        derivePolygonFromLog: derivePolygonFromLog,
        replay: replay,
        analyze: analyze,
        extractOriginalPath: extractOriginalPath,
        measureLag: measureLag
    };
})(typeof window !== 'undefined' ? window : this);
