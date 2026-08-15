/**
 * Yeniden çıpalama (reanchor) parametre taraması.
 *
 * Aynı log(lar)ı farklı parametre setleriyle replay eder ve kararı etkileyen üç ölçütü
 * yan yana koyar:
 *   - ekran sıçraması   : kullanıcının gördüğü ışınlanmalar (az olmalı)
 *   - hatalı donma      : güvenilir fix varken ekranın uzakta kalması (az olmalı)
 *   - ilk gerçek konum  : açılış gecikmesi (az olmalı)
 * Bu üçü birbiriyle çelişir; tarama dengeyi görmek içindir.
 *
 * "baseline" varyantı, değişiklikten önceki kaynağın tools/.baseline-src altına kopyalanmış
 * olmasını gerektirir (yoksa atlanır):
 *   git show HEAD:src/leaflet-simple-locate.js > tools/.baseline-src/leaflet-simple-locate.js
 *   git show HEAD:src/low-pass-filter.js      > tools/.baseline-src/low-pass-filter.js
 *
 * Kullanım:
 *   node tools/reanchor-sweep.js <log1.json> [log2.json ...]
 */
'use strict';

const path = require('path');
const fs = require('fs');
const replayer = require('./replay-log.js');

// Kapıları tek tek kapatarak hangisinin işi yaptığını izole eder.
const OFF = {
    speed: { reanchorMaxSpeed: 0 },
    far: { reanchorMaxDistance: 0 },
    pingpong: { reanchorPingPongMs: 0 },
    cooldown: { reanchorCooldownMs: 5000, reanchorFarCooldownMs: 0 }
};

const VARIANTS = [
    { name: 'baseline (kapı yok)', src: path.join(__dirname, '.baseline-src'), opts: {} },
    { name: 'reanchor tamamen off', opts: { enableConsensusReanchor: false } },
    { name: 'YENİ (varsayılan)', opts: {} },
    { name: '— uzak kademe yok', opts: OFF.far },
    { name: '— ping-pong yok', opts: OFF.pingpong },
    { name: '— override yok', opts: { reanchorOverrideFixes: 999 } },
    { name: '— soğuma yok', opts: OFF.cooldown },
    { name: '+ hız kapısı 3m/s', opts: { reanchorMaxSpeed: 3 } },
    { name: 'pingpong 60s', opts: { reanchorPingPongMs: 60000 } },
    { name: 'pingpong 300s', opts: { reanchorPingPongMs: 300000 } },
    { name: 'override 5s/5fix', opts: { reanchorOverrideSpanMs: 5000, reanchorOverrideFixes: 5 } },
    { name: 'override 10s/9fix', opts: { reanchorOverrideSpanMs: 10000, reanchorOverrideFixes: 9 } }
];

const CURRENT_SRC = path.join(__dirname, '..', 'src');

function run(logPath, variant) {
    replayer.setSrcDir(variant.src || CURRENT_SRC);
    const log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    const fixes = replayer.extractRawFixes(log);
    const polygon = replayer.derivePolygonFromLog(fixes) || replayer.DEFAULT_POLYGON;
    const events = replayer.replay(fixes, {
        polygon: polygon,
        userAgent: replayer.IOS_UA,
        geoFromLog: true,
        controlOptions: variant.opts
    });
    return replayer.analyze(fixes, events);
}

function main() {
    const logs = process.argv.slice(2);
    if (!logs.length) {
        console.error('Kullanım: node tools/reanchor-sweep.js <log1.json> [log2.json ...]');
        process.exit(1);
    }

    for (const logPath of logs) {
        console.log('\n=== ' + path.basename(logPath) + ' ===');
        const header = ['varyant'.padEnd(24), 'çıpa', '>40m', 'maks', 'donma(fix/s/m)'.padEnd(18),
            'konumsuz(s)', 'ilk(s)'].join(' | ');
        console.log(header);
        console.log('-'.repeat(header.length));

        for (const v of VARIANTS) {
            if (v.src && !fs.existsSync(v.src)) {
                console.log(v.name.padEnd(24) + ' | atlandı (' + path.relative(process.cwd(), v.src) + ' yok)');
                continue;
            }
            let s;
            try {
                s = run(logPath, v);
            } catch (e) {
                console.log(v.name.padEnd(24) + ' | HATA: ' + e.message);
                continue;
            }
            const stale = s.worstStale.fixes + '/' + s.worstStale.sec.toFixed(0) + 's/' +
                s.worstStale.maxDist.toFixed(0) + 'm';
            console.log([
                v.name.padEnd(24),
                String(s.reanchors.length).padStart(4),
                String(s.bigJumps.over40).padStart(4),
                (s.bigJumps.maxDist.toFixed(0) + 'm').padStart(5),
                stale.padEnd(18),
                s.longestStarve.sec.toFixed(0).padStart(11),
                (s.firstRealAfterSec != null ? s.firstRealAfterSec.toFixed(1) : '—').padStart(6)
            ].join(' | '));

            if (s.reanchors.length) {
                const detail = s.reanchors.map((r) => 't+' + r.sec.toFixed(0) + 's:' +
                    (r.displayShift != null ? r.displayShift.toFixed(0) + 'm' : '—')).join('  ');
                console.log(' '.repeat(26) + detail);
            }
        }
    }
}

main();
