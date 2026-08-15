/**
 * Offline log replay — kaydedilmiş bir SimpleLocate log JSON'undaki ham GPS fix'lerini
 * gerçek filtre zincirinden (leaflet-simple-locate.js) tekrar geçirir ve konum
 * davranışını ölçer. Filtre değişikliklerini sahaya çıkmadan karşılaştırmak için.
 *
 * Kullanım:
 *   node tools/replay-log.js <log.json> [--trace 300-320] [--android] [--json out.json]
 *
 * Değişiklik öncesi/sonrası karşılaştırmak için eski kaynağı git'ten çıkarıp --src ile ver:
 *   mkdir tools/.baseline-src
 *   git show HEAD:src/leaflet-simple-locate.js > tools/.baseline-src/leaflet-simple-locate.js
 *   git show HEAD:src/low-pass-filter.js      > tools/.baseline-src/low-pass-filter.js
 *   node tools/replay-log.js <log.json> --src tools/.baseline-src
 *
 * Leaflet yerine minimal bir stub kullanılır; marker/harita çizimi devre dışıdır
 * (ctrl._geolocation set edilmediği için _updateMarker callback'ten sonra çıkar).
 */
'use strict';

const fs = require('fs');
const path = require('path');

let SRC_DIR = path.join(__dirname, '..', 'src');

// Saha polygonu log'da yok; kaynak logdaki içeride/dışarıda kararlarını yeniden üreten
// kutu: yürünen tüm koridoru kapsar, ~150m güneydeki multipath uçlarını dışarıda bırakır.
const DEFAULT_POLYGON = [
    { lat: 41.25950, lng: 28.73900 },
    { lat: 41.26120, lng: 28.73900 },
    { lat: 41.26120, lng: 28.74460 },
    { lat: 41.25950, lng: 28.74460 }
];

const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';

function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = (x) => (x * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const s = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function makeLeafletStub() {
    const L = {};

    L.latLng = function (a, b) {
        if (a && typeof a === 'object') {
            if (Array.isArray(a)) return L.latLng(a[0], a[1]);
            return L.latLng(a.lat, a.lng);
        }
        return {
            lat: a,
            lng: b,
            distanceTo: function (other) {
                const p = L.latLng(other);
                return haversine(a, b, p.lat, p.lng);
            }
        };
    };

    L.Util = {
        setOptions: function (obj, options) {
            obj.options = Object.assign({}, obj.options, options || {});
            return obj.options;
        },
        extend: Object.assign,
        stamp: function () { return 1; }
    };

    function makeExtend(Base) {
        return function extend(proto) {
            const NewClass = function () {
                if (this.initialize) this.initialize.apply(this, arguments);
            };
            NewClass.prototype = Object.create(Base.prototype);
            Object.assign(NewClass.prototype, proto);
            NewClass.prototype.options = Object.assign({}, Base.prototype.options, proto.options || {});
            NewClass.prototype.constructor = NewClass;
            NewClass.extend = makeExtend(NewClass);
            return NewClass;
        };
    }

    L.Control = function () {};
    L.Control.prototype = { options: { position: 'topright' } };
    L.Control.extend = makeExtend(L.Control);
    L.control = {};

    const layerStub = {
        addTo: function () { return this; },
        setLatLng: function () { return this; },
        setRadius: function () { return this; },
        setStyle: function () { return this; },
        setIcon: function () { return this; },
        setOpacity: function () { return this; },
        remove: function () { return this; },
        getElement: function () { return null; },
        on: function () { return this; }
    };

    L.marker = () => Object.create(layerStub);
    L.circle = () => Object.create(layerStub);
    L.polygon = () => Object.create(layerStub);
    L.divIcon = () => ({});
    L.DomUtil = {
        create: () => ({ style: { setProperty() {} }, classList: { add() {}, remove() {} } }),
        addClass() {}, removeClass() {}, setPosition() {}
    };
    L.DomEvent = {
        on() { return L.DomEvent; },
        off() { return L.DomEvent; },
        disableClickPropagation() {},
        disableScrollPropagation() {},
        stopPropagation() {},
        preventDefault() {}
    };

    return L;
}

function loadPlugin(userAgent) {
    global.window = global;
    global.self = global;
    global.navigator = { userAgent: userAgent, vendor: '', maxTouchPoints: 5 };
    global.screen = {};
    global.L = makeLeafletStub();

    const lowPass = fs.readFileSync(path.join(SRC_DIR, 'low-pass-filter.js'), 'utf8');
    const core = fs.readFileSync(path.join(SRC_DIR, 'leaflet-simple-locate.js'), 'utf8');

    // new Function → module/exports/define kapsam dışı kalır, UMD tarayıcı dalına düşer
    new Function(lowPass)();
    new Function(core)();

    if (!global.L.Control.SimpleLocate) throw new Error('SimpleLocate yüklenemedi');
    return global.L.Control.SimpleLocate;
}

function extractRawFixes(log) {
    const out = [];
    for (const entry of log.entries || []) {
        if (entry.category !== 'location' || entry.level !== 'info') continue;
        if (!/^Ham GPS/.test(entry.message || '')) continue;
        const d = entry.data || {};
        if (d.lat == null || d.lng == null) continue;
        out.push({
            seq: entry.seq,
            t: entry.t,
            latitude: d.lat,
            longitude: d.lng,
            accuracy: d.accuracy != null ? d.accuracy : 30,
            timestamp: entry.t,
            geofenceInside: d.geofenceInside
        });
    }
    return out;
}

// Saha polygonu log'a yazılmıyor, ama her ham fix için "içeride mi" kararı yazılıyor.
// Bu kararlardan, içeride işaretli fix'leri kapsayan ve dışarıda işaretlilerin çoğunu
// dışlayan eksen hizalı bir kutu türetilir. Kutu yalnızca ham fix OLMAYAN sorgular
// (yeniden çıpalama küme merkezi gibi) için kullanılır; ham fix'lerde kaydın kendisi
// esas alınır, böylece replay orijinal oturumun geofence davranışını birebir izler.
function derivePolygonFromLog(fixes) {
    const ins = fixes.filter((f) => f.geofenceInside === true);
    const outs = fixes.filter((f) => f.geofenceInside === false);
    if (!ins.length) return null;

    let latMin = Infinity, latMax = -Infinity, lngMin = Infinity, lngMax = -Infinity;
    for (const f of ins) {
        latMin = Math.min(latMin, f.latitude);
        latMax = Math.max(latMax, f.latitude);
        lngMin = Math.min(lngMin, f.longitude);
        lngMax = Math.max(lngMax, f.longitude);
    }

    // Her kenarı, dışarıda işaretli fix'lerin en çoğunu dışlayacak şekilde daralt:
    // kenarı içeri çekmenin bedeli yanlış dışlanan içeride fix'leridir.
    const edges = [
        { key: 'latMin', pick: (f) => f.latitude, dir: 1 },
        { key: 'latMax', pick: (f) => f.latitude, dir: -1 },
        { key: 'lngMin', pick: (f) => f.longitude, dir: 1 },
        { key: 'lngMax', pick: (f) => f.longitude, dir: -1 }
    ];
    const box = { latMin, latMax, lngMin, lngMax };
    for (const e of edges) {
        let best = box[e.key];
        let bestScore = -Infinity;
        const candidates = outs.map(e.pick).concat([box[e.key]]);
        for (const c of candidates) {
            const v = e.dir > 0 ? c : c;
            const trial = Object.assign({}, box, { [e.key]: v });
            let score = 0;
            for (const f of ins) score += inBox(f, trial) ? 1 : -1;
            for (const f of outs) score += inBox(f, trial) ? -1 : 1;
            if (score > bestScore) { bestScore = score; best = v; }
        }
        box[e.key] = best;
    }

    return [
        { lat: box.latMin, lng: box.lngMin },
        { lat: box.latMax, lng: box.lngMin },
        { lat: box.latMax, lng: box.lngMax },
        { lat: box.latMin, lng: box.lngMax }
    ];
}

function inBox(f, b) {
    return f.latitude >= b.latMin && f.latitude <= b.latMax &&
        f.longitude >= b.lngMin && f.longitude <= b.lngMax;
}

// Panelin log görünürlüğü mantığı (LocateLogger._posKey / _isOrientationOnly)
function posKey(p) {
    if (!p || p.lat == null || p.lng == null) return null;
    return Math.round(p.lat * 1e6) + ':' + Math.round(p.lng * 1e6) + ':' +
        Math.round((p.accuracy || 0) * 10);
}

function replay(fixes, opts) {
    const SimpleLocate = loadPlugin(opts.userAgent);

    const events = [];
    let currentFix = null;

    const ctrl = new SimpleLocate(Object.assign({
        geofencePolygon: opts.polygon,
        enableGeofence: true,
        indoorMode: true,
        enableDeadReckoning: false,   // replay'de ivmeölçer yok → PDR deterministik değil
        enableAltitude: false,        // log'da ham altitude yok
        drawCircle: false
    }, opts.controlOptions || {}, {
        afterDeviceMove: function (payload) {
            events.push({
                fixSeq: currentFix ? currentFix.seq : null,
                t: Date.now(),
                lat: payload.lat,
                lng: payload.lng,
                accuracy: payload.accuracy,
                isRejected: !!payload.isRejected,
                isFallback: !!payload.isFallback,
                isJump: !!payload.isJump,
                updateKind: payload.updateKind,
                rejectReason: payload.rejectReason || null,
                reanchor: payload.reanchor || null,
                displayJump: payload.displayJump || null
            });
        }
    }));

    ctrl._map = {
        locate() {}, stopLocate() {}, on() {}, off() {},
        hasLayer() { return false; }, addLayer() {}, removeLayer() {},
        getZoom() { return 18; }, setView() {}, getCenter() { return { lat: 0, lng: 0 }; }
    };

    // Ham fix'lerde kaydedilen geofence kararını kullan (poligon yaklaşımı yerine).
    // Diğer sorgular (küme merkezi vb.) türetilmiş poligona düşer.
    if (opts.geoFromLog) {
        const recorded = new Map();
        for (const f of fixes) {
            if (f.geofenceInside == null) continue;
            recorded.set(Math.round(f.latitude * 1e7) + ':' + Math.round(f.longitude * 1e7),
                f.geofenceInside);
        }
        const originalCheck = ctrl._isInsideGeofence.bind(ctrl);
        ctrl._isInsideGeofence = function (lat, lng) {
            const hit = recorded.get(Math.round(lat * 1e7) + ':' + Math.round(lng * 1e7));
            if (hit != null) return { inside: hit, distance: 0, source: 'log' };
            return originalCheck(lat, lng);
        };
    }

    const realNow = Date.now;
    let virtual = fixes.length ? fixes[0].t : realNow();
    Date.now = () => virtual;

    try {
        ctrl._locateSessionStart = fixes.length ? fixes[0].t : virtual;
        let prevStats = Object.assign({}, ctrl._locationStats);
        for (const fix of fixes) {
            currentFix = fix;
            virtual = fix.t;
            const before = events.length;
            ctrl._onLocationFound({
                latitude: fix.latitude,
                longitude: fix.longitude,
                accuracy: fix.accuracy,
                timestamp: fix.timestamp
            });

            // Bu fix hangi kontrolde takıldı? (istatistik farkından)
            const st = ctrl._locationStats;
            const causes = [];
            if (st.accuracyRejections > (prevStats.accuracyRejections || 0)) causes.push('acc');
            if (st.geofenceRejections > (prevStats.geofenceRejections || 0)) causes.push('geo');
            if (st.speedRejections > (prevStats.speedRejections || 0)) causes.push('speed');
            if ((st.reanchors || 0) > (prevStats.reanchors || 0)) causes.push('REANCHOR');
            prevStats = Object.assign({}, st);
            for (let k = before; k < events.length; k++) events[k].cause = causes.join('+') || '';

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

    return events;
}

function analyze(fixes, events) {
    const t0 = fixes.length ? fixes[0].t : 0;

    // Panelin göreceği kayıtlar (aynı posKey → sessiz)
    let lastKey = null;
    const visible = [];
    for (const ev of events) {
        if (ev.updateKind === 'swallowed') { ev.panel = 'silent-no-callback'; continue; }
        if (ev.isRejected) { ev.panel = 'reject'; visible.push(ev); lastKey = lastKey; continue; }
        const key = posKey(ev);
        if (key && key === lastKey) { ev.panel = 'silent-same-position'; continue; }
        lastKey = key;
        ev.panel = ev.isFallback ? 'fallback' : 'real';
        visible.push(ev);
    }

    const realShown = events.filter((e) => e.panel === 'real');

    let firstReal = null;
    if (realShown.length) firstReal = (realShown[0].t - t0) / 1000;

    // Marker'ın gerçekten kıpırdamadığı en uzun seri: bir fix, gösterilen konumu >1m
    // değiştirdiyse "hizmet edilmiş" sayılır. Etiket (gerçek/fallback) değil, ekranda görülen
    // konumun tazelenip tazelenmediği ölçülür. Ham fix'in gelmediği GPS boşlukları sayılmaz.
    const isDisplayed = (ev) => (ev.panel === 'real' || ev.panel === 'fallback') && ev.lat != null;
    const perFix = new Map();
    let prevShown = null;
    for (const ev of events) {
        if (ev.fixSeq == null || !isDisplayed(ev)) continue;
        const moved = !prevShown || haversine(prevShown.lat, prevShown.lng, ev.lat, ev.lng) > 1;
        if (moved) { perFix.set(ev.fixSeq, ev); prevShown = ev; }
    }
    let longestStarve = { fixes: 0, sec: 0, fromSeq: null, toSeq: null };
    let runStart = null;
    let runFixes = 0;
    for (const fix of fixes) {
        const shown = perFix.has(fix.seq);
        if (shown) {
            if (runStart != null) {
                const sec = (fix.t - runStart.t) / 1000;
                if (runFixes > longestStarve.fixes) {
                    longestStarve = { fixes: runFixes, sec: sec, fromSeq: runStart.seq, toSeq: fix.seq };
                }
            }
            runStart = null;
            runFixes = 0;
        } else {
            if (runStart == null) runStart = fix;
            runFixes++;
        }
    }
    if (runStart != null && runFixes > longestStarve.fixes) {
        const lastT = fixes[fixes.length - 1].t;
        longestStarve = { fixes: runFixes, sec: (lastT - runStart.t) / 1000, fromSeq: runStart.seq, toSeq: null };
    }

    // "Hatalı donma": GÜVENİLİR bir ham fix (acc ≤ 25m) gelmesine rağmen gösterilen konumun
    // o fix'ten 30m'den uzak kaldığı ardışık seri. Duruş halinde marker'ın kıpırdamaması ya da
    // çöp fix'lerde donması buraya girmez — yalnızca "kanıt vardı, ekran yanlış yerdeydi".
    let lastDisplayed = null;
    const displayAt = new Map();
    for (const ev of events) {
        if (ev.fixSeq == null) continue;
        if (isDisplayed(ev)) lastDisplayed = ev;
        if (lastDisplayed) displayAt.set(ev.fixSeq, lastDisplayed);
    }
    let worstStale = { fixes: 0, sec: 0, fromSeq: null, toSeq: null, maxDist: 0 };
    let staleStart = null;
    let staleFixes = 0;
    let staleMax = 0;
    for (const fix of fixes) {
        const disp = displayAt.get(fix.seq);
        const trustworthy = fix.accuracy <= 25;
        const dist = disp ? haversine(fix.latitude, fix.longitude, disp.lat, disp.lng) : 0;
        const bad = trustworthy && disp && dist > 30;
        if (bad) {
            if (staleStart == null) { staleStart = fix; staleFixes = 0; staleMax = 0; }
            staleFixes++;
            staleMax = Math.max(staleMax, dist);
        } else if (staleStart != null) {
            const sec = (fix.t - staleStart.t) / 1000;
            if (staleFixes > worstStale.fixes) {
                worstStale = { fixes: staleFixes, sec: sec, fromSeq: staleStart.seq, toSeq: fix.seq, maxDist: staleMax };
            }
            staleStart = null;
        }
    }

    // Görüntü uzayında sıçramalar: kullanıcının gördüğü tüm konumlar (gerçek + fallback),
    // yalnızca birbirine yakın zamanlı güncellemeler (uzun GPS boşlukları yürüyüş sayılır)
    const displayed = events.filter((e) => (e.panel === 'real' || e.panel === 'fallback') && e.lat != null);
    const jumps = [];
    for (let i = 1; i < displayed.length; i++) {
        const a = displayed[i - 1];
        const b = displayed[i];
        const dt = (b.t - a.t) / 1000;
        if (dt <= 0 || dt > 5) continue;
        const dist = haversine(a.lat, a.lng, b.lat, b.lng);
        jumps.push({
            fromSeq: a.fixSeq, toSeq: b.fixSeq, dist: dist, dt: dt,
            speed: dist / dt, kind: b.updateKind
        });
    }
    jumps.sort((x, y) => y.dist - x.dist);

    // Yeniden çıpalamalar ve her birinin ekranda yol açtığı kayma
    const reanchors = [];
    let prevDisplayed = null;
    for (const ev of events) {
        if (ev.reanchor) {
            reanchors.push({
                fixSeq: ev.fixSeq,
                sec: (ev.t - t0) / 1000,
                accuracy: ev.reanchor.accuracy,
                fixCount: ev.reanchor.fixCount,
                spanMs: ev.reanchor.spanMs,
                displayShift: prevDisplayed && ev.lat != null
                    ? haversine(prevDisplayed.lat, prevDisplayed.lng, ev.lat, ev.lng) : null
            });
        }
        if ((ev.panel === 'real' || ev.panel === 'fallback') && ev.lat != null) prevDisplayed = ev;
    }

    return {
        fixes: fixes.length,
        callbacks: events.length,
        reanchors: reanchors,
        bigJumps: {
            over40: jumps.filter((j) => j.dist > 40).length,
            over25: jumps.filter((j) => j.dist > 25).length,
            maxDist: jumps.length ? jumps[0].dist : 0
        },
        counts: {
            real: events.filter((e) => e.panel === 'real').length,
            fallback: events.filter((e) => e.panel === 'fallback').length,
            reject: events.filter((e) => e.panel === 'reject').length,
            silentSamePosition: events.filter((e) => e.panel === 'silent-same-position').length,
            silentNoCallback: events.filter((e) => e.panel === 'silent-no-callback').length
        },
        firstRealAfterSec: firstReal,
        longestStarve: longestStarve,
        worstStale: worstStale,
        kinds: events.reduce((acc, e) => {
            const k = e.updateKind || '?';
            acc[k] = (acc[k] || 0) + 1;
            return acc;
        }, {}),
        topDisplayJumps: jumps.slice(0, 5)
    };
}

function main() {
    const args = process.argv.slice(2);
    if (!args.length) {
        console.error('Kullanım: node tools/replay-log.js <log.json> [--trace 300-320] [--android] [--json out.json]');
        process.exit(1);
    }

    const logPath = args[0];
    let trace = null;
    let userAgent = IOS_UA;
    let jsonOut = null;
    let geoFromLog = false;
    const controlOptions = {};
    for (let i = 1; i < args.length; i++) {
        if (args[i] === '--trace' && args[i + 1]) {
            const m = args[++i].match(/^(\d+)-(\d+)$/);
            if (m) trace = { from: +m[1], to: +m[2] };
        } else if (args[i] === '--android') {
            userAgent = ANDROID_UA;
        } else if (args[i] === '--json' && args[i + 1]) {
            jsonOut = args[++i];
        } else if (args[i] === '--src' && args[i + 1]) {
            SRC_DIR = path.resolve(args[++i]);
        } else if (args[i] === '--geo-from-log') {
            geoFromLog = true;
        } else if (args[i] === '--opt' && args[i + 1]) {
            // --opt reanchorMaxSpeed=3 → parametre taramasını kaynağı düzenlemeden yapmak için
            const kv = args[++i].split('=');
            const num = parseFloat(kv[1]);
            controlOptions[kv[0]] = isNaN(num) ? (kv[1] === 'true' ? true : kv[1] === 'false' ? false : kv[1]) : num;
        }
    }

    const log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    const fixes = extractRawFixes(log);
    let polygon = DEFAULT_POLYGON;
    if (geoFromLog) {
        const derived = derivePolygonFromLog(fixes);
        if (derived) {
            polygon = derived;
            console.log('türetilen poligon  : lat ' + derived[0].lat.toFixed(6) + '–' +
                derived[1].lat.toFixed(6) + ', lng ' + derived[0].lng.toFixed(6) + '–' +
                derived[2].lng.toFixed(6));
        }
    }
    if (Object.keys(controlOptions).length) {
        console.log('geçersiz kılınan ayar:', Object.entries(controlOptions)
            .map(([k, v]) => k + '=' + v).join(', '));
    }
    const events = replay(fixes, {
        polygon: polygon, userAgent: userAgent, geoFromLog: geoFromLog,
        controlOptions: controlOptions
    });
    const summary = analyze(fixes, events);

    const t0 = fixes.length ? fixes[0].t : 0;

    console.log('=== REPLAY ÖZET ===');
    console.log('ham fix           :', summary.fixes);
    console.log('callback           :', summary.callbacks);
    console.log('panelde GERÇEK     :', summary.counts.real);
    console.log('panelde fallback   :', summary.counts.fallback);
    console.log('panelde red        :', summary.counts.reject);
    console.log('sessiz (aynı konum):', summary.counts.silentSamePosition);
    console.log('sessiz (callback yok):', summary.counts.silentNoCallback);
    console.log('ilk gerçek konum   :', summary.firstRealAfterSec != null ? summary.firstRealAfterSec.toFixed(1) + 's' : '—');
    console.log('en uzun konumsuz seri:', summary.longestStarve.fixes + ' fix / ' +
        summary.longestStarve.sec.toFixed(1) + 's (#' + summary.longestStarve.fromSeq +
        ' → #' + summary.longestStarve.toSeq + ')');
    console.log('hatalı donma       :', summary.worstStale.fixes + ' fix / ' +
        summary.worstStale.sec.toFixed(1) + 's, ekran ham fixten ' +
        summary.worstStale.maxDist.toFixed(0) + 'm uzakta (#' + summary.worstStale.fromSeq +
        ' → #' + summary.worstStale.toSeq + ')');
    console.log('güncelleme tipleri :', Object.entries(summary.kinds)
        .map(([k, v]) => k + '=' + v).join(', '));
    console.log('ekran sıçraması    : >40m=' + summary.bigJumps.over40 +
        ', >25m=' + summary.bigJumps.over25 +
        ', en büyük=' + summary.bigJumps.maxDist.toFixed(0) + 'm');
    console.log('yeniden çıpalama   :', summary.reanchors.length);
    for (const r of summary.reanchors) {
        console.log('  #' + r.fixSeq + ' t+' + r.sec.toFixed(1) + 's ±' +
            (r.accuracy != null ? r.accuracy.toFixed(0) : '?') + 'm, ' + r.fixCount + ' fix / ' +
            ((r.spanMs || 0) / 1000).toFixed(1) + 's → ekran kayması ' +
            (r.displayShift != null ? r.displayShift.toFixed(0) + 'm' : '—'));
    }
    console.log('\n--- en büyük ekran sıçramaları ---');
    for (const j of summary.topDisplayJumps) {
        console.log('  fix #' + j.fromSeq + ' → #' + j.toSeq + ': ' +
            j.dist.toFixed(1) + 'm / ' + j.dt.toFixed(2) + 's = ' + j.speed.toFixed(1) + ' m/s' +
            (j.kind && j.kind !== 'position' ? ' [' + j.kind + ']' : ''));
    }

    if (trace) {
        console.log('\n--- iz (fix #' + trace.from + '–' + trace.to + ') ---');
        for (const ev of events) {
            if (ev.fixSeq == null || ev.fixSeq < trace.from || ev.fixSeq > trace.to) continue;
            const pos = ev.lat != null ? ev.lat.toFixed(6) + ',' + ev.lng.toFixed(6) : '—';
            const fix = fixes.find((f) => f.seq === ev.fixSeq);
            console.log('  #' + String(ev.fixSeq).padStart(3) + ' ' +
                ((ev.t - t0) / 1000).toFixed(1).padStart(6) + 's ' +
                'ham=' + (fix ? fix.latitude.toFixed(6) + ',' + fix.longitude.toFixed(6) +
                    '/' + fix.accuracy.toFixed(0) : '?') + ' ' +
                String(ev.cause || '-').padEnd(9) + ' ' +
                String(ev.panel).padEnd(20) + ' ' + String(ev.updateKind).padEnd(9) + ' ' + pos +
                ' acc=' + (ev.accuracy != null ? Number(ev.accuracy).toFixed(1) : '-') +
                (ev.isJump ? ' JUMP' : ''));
        }
    }

    if (jsonOut) {
        fs.writeFileSync(jsonOut, JSON.stringify({ summary, events }, null, 2));
        console.log('\nJSON yazıldı:', jsonOut);
    }
}

if (require.main === module) {
    main();
} else {
    module.exports = {
        haversine, loadPlugin, replay, analyze, extractRawFixes, derivePolygonFromLog,
        setSrcDir: (dir) => { SRC_DIR = path.resolve(dir); },
        DEFAULT_POLYGON, IOS_UA, ANDROID_UA
    };
}
