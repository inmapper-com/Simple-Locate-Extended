/**
 * Sentetik senaryo testleri — konsensüs yeniden çıpalama ve görüntü sıçrama korumasının
 * yanlış pozitif üretmediğini doğrular. Gerçek log replay'i (replay-log.js) düzeltmenin
 * çalıştığını gösterir; buradaki senaryolar ise BOZMADIĞINI gösterir.
 *
 * Kullanım: node tools/filter-scenarios.js [--src <dizin>]
 */
'use strict';

const { replay, haversine, IOS_UA, setSrcDir } = require('./replay-log.js');

const srcIdx = process.argv.indexOf('--src');
if (srcIdx > -1 && process.argv[srcIdx + 1]) setSrcDir(process.argv[srcIdx + 1]);

const BASE = { lat: 41.0, lng: 29.0 };
const POLYGON = [
    { lat: 40.9970, lng: 28.9970 },
    { lat: 41.0030, lng: 28.9970 },
    { lat: 41.0030, lng: 29.0030 },
    { lat: 40.9970, lng: 29.0030 }
];

const M_PER_DEG_LAT = 111320;
const mPerDegLng = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

function offset(meters, bearingDeg, from) {
    const origin = from || BASE;
    const rad = (bearingDeg * Math.PI) / 180;
    return {
        lat: origin.lat + (meters * Math.cos(rad)) / M_PER_DEG_LAT,
        lng: origin.lng + (meters * Math.sin(rad)) / mPerDegLng(origin.lat)
    };
}

const T0 = 1700000000000;

// Gerçek GPS hiç aynı noktayı iki kez vermez; deterministik küçük jitter ekleyerek
// "aynı konum" optimizasyonlarının testi yapay biçimde etkilemesini engelle (±~1.5m)
function jitter(point, seq) {
    const a = Math.sin(seq * 12.9898) * 1.5;
    const b = Math.cos(seq * 78.233) * 1.5;
    return {
        lat: point.lat + a / M_PER_DEG_LAT,
        lng: point.lng + b / mPerDegLng(point.lat)
    };
}

function fix(seq, point, accuracy, seconds) {
    const p = jitter(point, seq);
    return {
        seq: seq,
        t: T0 + seconds * 1000,
        latitude: p.lat,
        longitude: p.lng,
        accuracy: accuracy,
        timestamp: T0 + seconds * 1000
    };
}

// Cold-start kapısı senaryoların odağı değil; her senaryo A'da 6 tutarlı fix'le başlar
function warmup(point, acc) {
    const out = [];
    for (let i = 0; i < 6; i++) out.push(fix(i + 1, point, acc, i));
    return out;
}

function run(name, fixes, expectations) {
    const events = replay(fixes, {
        polygon: POLYGON,
        userAgent: IOS_UA,
        controlOptions: { coldStartGate: true }
    });

    const displayed = events.filter((e) => e.lat != null && !e.isRejected &&
        e.updateKind !== 'hold' && e.updateKind !== 'orientation');
    const reanchors = events.filter((e) => e.reanchor).length;
    const teleports = events.filter((e) => e.displayJump && !e.displayJump.resync &&
        !e.displayJump.reanchored).length;

    let maxStep = 0;
    for (let i = 1; i < displayed.length; i++) {
        const dt = (displayed[i].t - displayed[i - 1].t) / 1000;
        if (dt <= 0 || dt > 10) continue;
        maxStep = Math.max(maxStep, haversine(
            displayed[i - 1].lat, displayed[i - 1].lng, displayed[i].lat, displayed[i].lng));
    }

    const last = displayed[displayed.length - 1];
    const actual = { reanchors, teleports, maxStep, last };

    const problems = [];
    for (const [key, check] of Object.entries(expectations)) {
        const ok = check.test(actual);
        if (!ok) problems.push(key + ': ' + check.describe(actual));
    }

    console.log((problems.length ? '✗ ' : '✓ ') + name);
    console.log('    yeniden çıpalama=' + reanchors + ', işaretsiz ışınlanma=' + teleports +
        ', maks görüntü adımı=' + maxStep.toFixed(1) + 'm' +
        (last ? ', son konum=' + last.lat.toFixed(6) + ',' + last.lng.toFixed(6) : ''));
    for (const p of problems) console.log('    ! ' + p);
    return problems.length === 0;
}

function nearPoint(point, tolerance) {
    return {
        test: (a) => a.last && haversine(a.last.lat, a.last.lng, point.lat, point.lng) <= tolerance,
        describe: (a) => a.last
            ? 'beklenen noktadan ' +
              haversine(a.last.lat, a.last.lng, point.lat, point.lng).toFixed(1) + 'm uzakta'
            : 'hiç konum gösterilmedi'
    };
}
const eq = (field, value) => ({
    test: (a) => a[field] === value,
    describe: (a) => field + '=' + a[field] + ' (beklenen ' + value + ')'
});
const atMost = (field, value) => ({
    test: (a) => a[field] <= value,
    describe: (a) => field + '=' + (typeof a[field] === 'number' ? a[field].toFixed(1) : a[field]) +
        ' (en fazla ' + value + ' olmalı)'
});

let pass = true;

// 1) Tek başına gelen multipath sıçraması: çıpayı devirmemeli, ekran A'da kalmalı
{
    const B = offset(100, 90);
    const fixes = warmup(BASE, 10);
    fixes.push(fix(10, B, 12, 6));               // tek aykırı fix
    for (let i = 0; i < 5; i++) fixes.push(fix(11 + i, BASE, 10, 7 + i));
    pass = run('tek aykırı fix çıpayı devirmiyor', fixes, {
        'yeniden çıpalama olmamalı': eq('reanchors', 0),
        'ekran A\'da kalmalı': nearPoint(BASE, 15)
    }) && pass;
}

// 2) A↔B salınımı: her geçişte ışınlanmamalı (soğuma + histerezis)
{
    const B = offset(80, 90);
    const fixes = warmup(BASE, 12);
    let seq = 10;
    let t = 6;
    for (let cycle = 0; cycle < 4; cycle++) {
        for (let i = 0; i < 3; i++) fixes.push(fix(seq++, B, 14, t++));
        for (let i = 0; i < 3; i++) fixes.push(fix(seq++, BASE, 14, t++));
    }
    pass = run('A↔B salınımı ping-pong ışınlanma üretmiyor', fixes, {
        'yeniden çıpalama sayısı sınırlı': atMost('reanchors', 3),
        'işaretsiz ışınlanma olmamalı': eq('teleports', 0)
    }) && pass;
}

// 3) Normal yürüyüş (1 m/s, 40 sn): hiç red/ışınlanma olmamalı, hedefe varmalı
{
    const fixes = warmup(BASE, 10);
    let seq = 10;
    for (let i = 1; i <= 40; i++) {
        fixes.push(fix(seq++, offset(i * 1.0, 90), 10, 5 + i));
    }
    pass = run('1 m/s yürüyüş kesintisiz izleniyor', fixes, {
        'yeniden çıpalama olmamalı': eq('reanchors', 0),
        'işaretsiz ışınlanma olmamalı': eq('teleports', 0),
        'hedefe ulaşmalı': nearPoint(offset(40, 90), 12)
    }) && pass;
}

// 4) Gerçek hızlı yer değişimi (asansör/araç): tutarlı yeni küme kısa sürede kabul edilmeli
{
    const B = offset(120, 90);
    const fixes = warmup(BASE, 10);
    let seq = 10;
    for (let i = 0; i < 6; i++) fixes.push(fix(seq++, B, 12, 6 + i));
    pass = run('gerçek yer değişimi ~3 fix içinde yakalanıyor', fixes, {
        'yeniden çıpalama olmalı': eq('reanchors', 1),
        'yeni konuma oturmalı': nearPoint(B, 20)
    }) && pass;
}

// 5) Kötü doğruluklu çıpa + iyi fix: 30 saniye donmamalı (asıl hata senaryosu)
{
    const B = offset(200, 90);
    const fixes = [fix(1, BASE, 82, 0)];         // çöp ilk fix (±82m)
    let seq = 2;
    for (let i = 0; i < 8; i++) fixes.push(fix(seq++, B, 14, 1 + i));
    const events = replay(fixes, { polygon: POLYGON, userAgent: IOS_UA });
    const firstReal = events.find((e) => e.lat != null && !e.isFallback && !e.isRejected &&
        e.updateKind !== 'hold' && haversine(e.lat, e.lng, B.lat, B.lng) < 25);
    const sec = firstReal ? (firstReal.t - T0) / 1000 : null;
    const ok = sec != null && sec <= 6;
    console.log((ok ? '✓ ' : '✗ ') + 'kötü çıpa (±82m) konumu kilitlemiyor');
    console.log('    doğru konum ' + (sec != null ? sec.toFixed(1) + 's' : 'hiç') + ' içinde gösterildi (≤6s olmalı)');
    pass = ok && pass;
}

// 6) Ping-pong bastırma kilitlenmiyor: A→B düzeltmesinden sonra kullanıcı GERÇEKTEN A'ya
//    dönüyor. Bastırma yalnızca kısa salınımları kesmeli; ısrarlı dönüş kabul edilmeli
//    (yoksa kullanıcı dakikalar boyunca yanlış yerde kalır).
{
    const B = offset(120, 90);
    const fixes = warmup(BASE, 12);
    let seq = 10;
    let t = 6;
    // B'de ısrarlı küme → yeniden çıpalama
    for (let i = 0; i < 7; i++) fixes.push(fix(seq++, B, 13, t++));
    // Kullanıcı A'ya geri yürüyor ve orada ısrarla kalıyor
    for (let i = 0; i < 12; i++) fixes.push(fix(seq++, BASE, 13, t++));
    pass = run('gerçek geri dönüş ping-pong kilidine takılmıyor', fixes, {
        'A\'ya geri oturmalı': nearPoint(BASE, 25),
        'işaretsiz ışınlanma olmamalı': eq('teleports', 0)
    }) && pass;
}

// 7) Kısa süreli A↔B salınımı: her tur ışınlanma üretmemeli. Kümeler kısa ömürlü olduğu
//    için hiçbiri "ısrarlı" sayılmaz; ekran ilk çıpada kalmalı.
{
    const B = offset(130, 90);
    const fixes = warmup(BASE, 12);
    let seq = 10;
    let t = 6;
    for (let cycle = 0; cycle < 5; cycle++) {
        for (let i = 0; i < 3; i++) fixes.push(fix(seq++, B, 20, t++));
        for (let i = 0; i < 3; i++) fixes.push(fix(seq++, BASE, 20, t++));
    }
    pass = run('uzak A↔B salınımı ekranı savurmuyor', fixes, {
        'en fazla 1 yeniden çıpalama': atMost('reanchors', 1),
        'görüntü adımı sınırlı': atMost('maxStep', 30)
    }) && pass;
}

console.log('\n' + (pass ? 'TÜM SENARYOLAR GEÇTİ' : 'BAZI SENARYOLAR BAŞARISIZ'));
process.exit(pass ? 0 : 1);
