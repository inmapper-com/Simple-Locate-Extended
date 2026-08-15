/**
 * Yükseklikten kat tespiti senaryoları.
 *
 * GPS düşey hatası kat yüksekliğinden büyük olabildiği için asıl risk gürültünün
 * katı sürekli değiştirmesidir (gösterilen plan ve "en yakın birim" titrer). Buradaki
 * senaryolar iki şeyi birlikte sınar: gürültü kat DEĞİŞTİRMEMELİ, gerçek kat geçişi
 * ise makul sürede YAKALANMALI.
 *
 * Kullanım: node tools/floor-scenarios.js [--src <dizin>]
 */
'use strict';

const { loadPlugin, IOS_UA, setSrcDir } = require('./replay-log.js');

const srcIdx = process.argv.indexOf('--src');
if (srcIdx > -1 && process.argv[srcIdx + 1]) setSrcDir(process.argv[srcIdx + 1]);

// IST yapılandırmasıyla aynı düzen: apron kotu ~99 m, kat yüksekliği 6 m
const GROUND_ALT = 99;
const FLOOR_H = 6;
const FLOORS = [-1, 0, 1, 2, 3, 4].map((n) => ({
    floor: n,
    name: 'Kat ' + n,
    minAlt: GROUND_ALT + n * FLOOR_H - FLOOR_H / 2,
    maxAlt: GROUND_ALT + n * FLOOR_H + FLOOR_H / 2
}));

const altOf = (floor) => GROUND_ALT + floor * FLOOR_H;

/**
 * Kat tespitini yükseklik dizisiyle çalıştırır.
 *
 * Yükseklik filtresi (median + low-pass) atlanır ve _detectFloor doğrudan beslenir:
 * amaç kat KARARININ kapılarını sınamak, filtrenin yumuşatmasını değil. Filtre zaten
 * gerçek gürültüyü azaltır, yani burada ölçülen davranış kötü senaryodur.
 */
function runFloors(altitudes, options) {
    const SimpleLocate = loadPlugin(IOS_UA);
    const ctrl = new SimpleLocate(Object.assign({
        enableAltitude: true,
        enableFloorDetection: true,
        floors: FLOORS
    }, options || {}));

    // Fix'ler 1 Hz gelir; cooldown gerçek zamana baktığı için saat ilerletilir
    const realNow = Date.now;
    let clock = realNow.call(Date);
    Date.now = () => clock;

    const seen = [];
    try {
        for (const alt of altitudes) {
            ctrl._detectFloor(alt);
            seen.push(ctrl._altitude.floor);
            clock += 1000;
        }
    } finally {
        Date.now = realNow;
    }

    let changes = 0;
    for (let i = 1; i < seen.length; i++) if (seen[i] !== seen[i - 1]) changes++;

    return { seen, changes, last: seen[seen.length - 1], name: ctrl._altitude.floorName };
}

// Deterministik gürültü — her koşuda aynı diziyi üretir
function noise(seq, amplitude) {
    return Math.sin(seq * 12.9898) * amplitude;
}

const CASES = [];

// 1) Sabit katta ±4 m gürültü: bant yarı genişliği 3 m, yani gürültü sınırı aşıyor.
//    Kat DEĞİŞMEMELİ — bu düzeltmenin asıl amacı.
CASES.push({
    name: 'Sabit kat, ±4 m gürültü',
    alts: Array.from({ length: 60 }, (_, i) => altOf(3) + noise(i, 4)),
    expect: { last: 3, maxChanges: 0 }
});

// 2) Tam bant sınırında duran kullanıcı: iki kat arasında salınım olmamalı
CASES.push({
    name: 'Bant sınırında salınım',
    alts: Array.from({ length: 60 }, (_, i) => altOf(0) + FLOOR_H / 2 + noise(i, 1)),
    expect: { maxChanges: 1 }
});

// 3) Gerçek kat geçişi (3 → 4) gürültüyle birlikte: YAKALANMALI
CASES.push({
    name: 'Gerçek geçiş 3 → 4',
    alts: [
        ...Array.from({ length: 15 }, (_, i) => altOf(3) + noise(i, 1.5)),
        ...Array.from({ length: 25 }, (_, i) => altOf(4) + noise(i + 100, 1.5))
    ],
    expect: { last: 4, maxChanges: 1 }
});

// 4) Asansörle çok katlı geçiş (0 → 4): ara katlarda takılıp kalmamalı
CASES.push({
    name: 'Asansör 0 → 4',
    alts: [
        ...Array.from({ length: 10 }, () => altOf(0)),
        ...[1, 2, 3].flatMap((f) => Array.from({ length: 3 }, () => altOf(f))),
        ...Array.from({ length: 25 }, (_, i) => altOf(4) + noise(i + 200, 1))
    ],
    expect: { last: 4 }
});

// 5) Tek örneklik ani sapma (GPS düşey hatası): kat değiştirmemeli
CASES.push({
    name: 'Tek örneklik 12 m sapma',
    alts: [
        ...Array.from({ length: 12 }, () => altOf(1)),
        altOf(1) + 12,
        ...Array.from({ length: 12 }, () => altOf(1))
    ],
    expect: { last: 1, maxChanges: 0 }
});

// 6) Bantların tamamen dışında bir yükseklik: son kararlı kat korunmalı
CASES.push({
    name: 'Bant dışı yükseklik',
    alts: [
        ...Array.from({ length: 10 }, () => altOf(2)),
        ...Array.from({ length: 10 }, () => altOf(2) + 60)
    ],
    expect: { last: 2, maxChanges: 0 }
});

/**
 * Yükseklik hattının tamamını (accuracy → normalizasyon → sıçrama kapısı → filtre →
 * kat) ham değerlerle sürer. _detectFloor'u doğrudan besleyen senaryolar sıçrama
 * kapısını atlar, oysa oradaki kilitlenme kat tespitini tümüyle susturur.
 */
function runAltitudePipeline(rawAltitudes, options) {
    const SimpleLocate = loadPlugin(IOS_UA);
    const ctrl = new SimpleLocate(Object.assign({
        enableAltitude: true,
        enableFloorDetection: true,
        floors: FLOORS
    }, options || {}));
    // iOS kabul edilir: ham değer MSL sayılır, geoid çıkarılmaz
    ctrl._isIOS = true;

    const realNow = Date.now;
    let clock = realNow.call(Date);
    Date.now = () => clock;

    const out = [];
    try {
        for (const raw of rawAltitudes) {
            ctrl._processAltitude({ altitude: raw, altitudeAccuracy: 8 });
            out.push({ filtered: ctrl._altitude.filtered, floor: ctrl._altitude.floor });
            clock += 1000;
        }
    } finally {
        Date.now = realNow;
    }
    return out;
}

let failed = 0;

// Referans yanlış bir yüksekliğe oturursa (hatalı ilk okuma, elipsoid/MSL karışması)
// sonraki doğru okumalar "sıçrama" diye reddedilir. Kaçış yolu yoksa yükseklik ve kat
// oturum boyunca donar — bu senaryo kurtarmanın çalıştığını doğrular.
{
    const bad = altOf(3) + 60;      // Hatalı ilk okuma
    const seq = [bad, ...Array.from({ length: 20 }, () => altOf(3))];
    const trace = runAltitudePipeline(seq);
    const last = trace[trace.length - 1];
    const recovered = Math.abs(last.filtered - altOf(3)) < 2 && last.floor === 3;
    if (!recovered) failed++;
    console.log('Yükseklik hattı\n');
    console.log((recovered ? '  geçti      ' : '  BAŞARISIZ  ') +
        'Hatalı ilk okuma sonrası kurtarma');
    console.log('              son yükseklik=' + last.filtered.toFixed(1) +
        ' kat=' + last.floor + ' (beklenen ' + altOf(3) + ' / 3)');
}

console.log('\nKat tespiti senaryoları\n');

for (const c of CASES) {
    const r = runFloors(c.alts);
    const problems = [];
    if (c.expect.last !== undefined && r.last !== c.expect.last) {
        problems.push('son kat ' + r.last + ' (beklenen ' + c.expect.last + ')');
    }
    if (c.expect.maxChanges !== undefined && r.changes > c.expect.maxChanges) {
        problems.push(r.changes + ' kat değişimi (azami ' + c.expect.maxChanges + ')');
    }
    if (problems.length) failed++;
    console.log((problems.length ? '  BAŞARISIZ  ' : '  geçti      ') + c.name);
    console.log('              kat=' + r.last + ' değişim=' + r.changes +
        (problems.length ? '\n              → ' + problems.join('; ') : ''));
}

console.log('\n' + (failed ? failed + ' senaryo BAŞARISIZ'
    : (CASES.length + 1) + ' senaryonun tamamı geçti'));
process.exit(failed ? 1 : 0);
