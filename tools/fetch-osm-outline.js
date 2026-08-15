'use strict';
/**
 * Bir OSM yolunun (way) konturunu kalibrasyon sayfalarının çizebileceği bir JSON'a
 * indirir. Kat planı hizalaması yarı saydam bindirmeye bakılarak değil, bağımsız bir
 * yer doğrusuyla karşılaştırılarak doğrulanmalıdır; bina konturu bunun en pratik
 * kaynağıdır.
 *
 * Kullanım:
 *   node tools/fetch-osm-outline.js <wayId> [çıktı.json]
 *
 * Örnek (İstanbul Havalimanı terminali):
 *   node tools/fetch-osm-outline.js 687768729 demo/plans/ist-osm-terminal.json
 *
 * Overpass yerine ana OSM API'si kullanılır: tek nesne için hem daha hafif hem de
 * Overpass aynalarının sık verdiği 504'lere takılmıyor.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const wayId = process.argv[2];
const outPath = process.argv[3] || 'osm-outline.json';

if (!wayId || !/^\d+$/.test(wayId)) {
    console.error('Kullanım: node tools/fetch-osm-outline.js <wayId> [çıktı.json]');
    process.exit(1);
}

function get(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'simple-locate-georef/1.0' } }, (res) => {
            let d = '';
            res.on('data', (c) => d += c);
            res.on('end', () => res.statusCode === 200
                ? resolve(d)
                : reject(new Error('HTTP ' + res.statusCode + ' — way/' + wayId)));
        }).on('error', reject);
    });
}

(async () => {
    const raw = await get('https://api.openstreetmap.org/api/0.6/way/' + wayId + '/full.json');
    const json = JSON.parse(raw);

    const way = json.elements.find(e => e.type === 'way');
    if (!way) throw new Error('way/' + wayId + ' bulunamadı');

    const nodes = {};
    for (const e of json.elements) if (e.type === 'node') nodes[e.id] = e;

    const ring = way.nodes.map(id => nodes[id]).filter(Boolean)
        .map(n => [+n.lat.toFixed(7), +n.lon.toFixed(7)]);
    if (ring.length < 4) throw new Error('kontur çok kısa: ' + ring.length + ' nokta');

    const lats = ring.map(p => p[0]), lngs = ring.map(p => p[1]);
    const out = {
        source: 'OpenStreetMap way/' + wayId,
        name: (way.tags && (way.tags.name || way.tags.ref)) || null,
        tags: way.tags || null,
        points: ring.length,
        bounds: {
            north: Math.max(...lats), south: Math.min(...lats),
            east: Math.max(...lngs), west: Math.min(...lngs)
        },
        ring: ring
    };

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(out));
    console.log('kaydedildi: ' + outPath + ' — ' + ring.length + ' nokta' +
        (out.name ? ' (' + out.name + ')' : ''));
    console.log('sınırlar: K=' + out.bounds.north + ' G=' + out.bounds.south +
        ' B=' + out.bounds.west + ' D=' + out.bounds.east);
})().catch(e => { console.error('HATA:', e.message); process.exit(1); });
