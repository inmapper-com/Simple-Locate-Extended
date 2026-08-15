/**
 * SVG kat planı inceleme aracı — `floorPlans` yapılandırmasını doldurmak için.
 *
 * Kat planı özelliğinin en çok vakit alan kısmı hangi çizim katmanının adreslenebilir
 * birim taşıdığını bulmaktır: bina kütlesi ve koridor da id'li şekillerdir, dahil
 * edilirlerse "en yakın birim" mağaza yerine koridoru döndürür. Bu araç dosyaları
 * açmadan katman dağılımını, id desenlerini ve etiket katmanlarını listeler.
 *
 * Kullanım:
 *   node tools/inspect-plan.js demo/plans              # dizindeki tüm SVG'ler
 *   node tools/inspect-plan.js demo/plans/D.svg        # tek dosya
 *   node tools/inspect-plan.js demo/plans --id "^ID"   # id desenini daralt
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SHAPE_TAGS = ['path', 'rect', 'polygon', 'polyline', 'circle', 'ellipse', 'line'];
const PLACEHOLDER = /_\d+_$/;
const NO_LAYER = '(katman yok)';

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--')) || 'demo/plans';
const idIdx = args.indexOf('--id');
const idPattern = idIdx > -1 && args[idIdx + 1] ? new RegExp(args[idIdx + 1]) : null;

function attr(tagBody, name) {
    const m = tagBody.match(new RegExp('\\s' + name + '="([^"]*)"'));
    return m ? m[1] : null;
}

/**
 * Dosyayı tarayıp şekilleri ve metinleri içinde bulundukları katmana bağlar.
 *
 * Açık etiket yığını tutulur; "en yakın önceki katman başlığı" gibi bir yaklaşım
 * iç içe grupları yanlış bağlar. `<defs>` içeriği atlanır: clipPath/gradient
 * şekilleri çizilmez, sayıları şişirmemeli.
 */
function scan(svg) {
    const layers = new Map();   // katman adı → { sekil, metin, idler[], yerTutucu }
    const dupIds = new Map();
    const stack = [];
    let defsDepth = 0;

    const tagRe = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g;
    let m;
    while ((m = tagRe.exec(svg)) !== null) {
        const closing = m[1] === '/';
        const tag = m[2].toLowerCase();
        const body = m[3] || '';
        const selfClosing = m[4] === '/';

        if (tag === 'defs' || tag === 'clippath' || tag === 'mask' || tag === 'symbol') {
            if (closing) defsDepth = Math.max(0, defsDepth - 1);
            else if (!selfClosing) defsDepth++;
            continue;
        }

        // Yığına yalnızca g/svg girdiği için çıkarma da yalnızca onlarda yapılır;
        // </text> gibi bir kapanışta çıkarmak katman bağlamını bozar
        if (closing) {
            if ((tag === 'g' || tag === 'svg') && stack.length) stack.pop();
            continue;
        }

        if (tag === 'g' || tag === 'svg') {
            const isLayer = (attr(body, 'inkscape:groupmode') || attr(body, 'groupmode')) === 'layer';
            const name = attr(body, 'id') || attr(body, 'inkscape:label') || attr(body, 'label');
            if (!selfClosing) stack.push(isLayer ? name || '(adsız katman)' : null);
            continue;
        }

        if (defsDepth > 0) continue;

        const isShape = SHAPE_TAGS.indexOf(tag) !== -1;
        const isText = tag === 'text';
        if (!isShape && !isText) continue;

        // En içteki katman kazanır
        let layer = NO_LAYER;
        for (let i = stack.length - 1; i >= 0; i--) {
            if (stack[i]) { layer = stack[i]; break; }
        }

        if (!layers.has(layer)) {
            layers.set(layer, { sekil: 0, metin: 0, idler: [], yerTutucu: 0 });
        }
        const rec = layers.get(layer);

        if (isText) {
            rec.metin++;
            // Metin içeriği bu tarayıcıda elde yok; id yer tutucu olup olmadığını gösterir
            const tid = attr(body, 'id');
            if (tid && PLACEHOLDER.test(tid)) rec.yerTutucu++;
            continue;
        }

        const id = attr(body, 'id') || attr(body, 'data-id');
        if (!id) continue;
        if (idPattern && !idPattern.test(id)) continue;
        rec.sekil++;
        rec.idler.push(id);
        dupIds.set(id, (dupIds.get(id) || 0) + 1);
    }

    return { layers, dupIds };
}

function prefixesOf(ids) {
    const out = {};
    for (const id of ids) {
        const p = (id.match(/^[A-Za-z]+/) || ['?'])[0];
        out[p] = (out[p] || 0) + 1;
    }
    return Object.entries(out).sort((a, b) => b[1] - a[1]);
}

function report(file) {
    const svg = fs.readFileSync(file, 'utf8');
    const vb = (svg.match(/viewBox="([^"]+)"/) || [])[1];
    const { layers, dupIds } = scan(svg);

    console.log('\n=== ' + path.basename(file) + ' ===');
    console.log('viewBox: ' + (vb || '(yok)'));

    const rows = [...layers.entries()].sort((a, b) => b[1].sekil - a[1].sekil);
    const shapeLayers = [];
    const labelLayers = [];

    console.log('\n  katman                sekil  metin  id ornekleri');
    for (const [name, r] of rows) {
        if (!r.sekil && !r.metin) continue;
        const pad = (name + '                      ').slice(0, 22);
        const ex = r.idler.slice(0, 3).join(', ');
        console.log('  ' + pad + String(r.sekil).padStart(5) +
            String(r.metin).padStart(7) + '  ' + ex);
        if (r.sekil >= 3) shapeLayers.push(name);
        if (r.metin > r.sekil && r.metin >= 3) labelLayers.push(name);
    }

    const dups = [...dupIds.entries()].filter(([, n]) => n > 1);
    if (dups.length) {
        console.log('\n  cok parcali id (unitIdNormalize gerekebilir): ' + dups.length +
            ' — ornek: ' + dups.slice(0, 5).map(([k, n]) => k + '×' + n).join(', '));
    }

    const allIds = rows.flatMap(([, r]) => r.idler);
    if (allIds.length) {
        console.log('  id onekleri: ' + prefixesOf(allIds).slice(0, 8)
            .map(([k, v]) => k + '=' + v).join(', '));
    }

    // Hangi katmanın adreslenebilir birim olduğuna yalnızca plana bakan kişi karar
    // verebilir; araç aday listeyi verir, ayıklamayı bırakır. Otomatik "öneri" burada
    // yanıltıcı olur: en kalabalık katman genelde kapılardır ve tam da dışlanmalıdır.
    const named = shapeLayers.filter((n) => n !== NO_LAYER);
    console.log('\n  yapilandirmaya baslangic (istemediklerinizi silin):');
    if (!named.length) {
        // Katmansız planda katman süzgeci kurulamaz; ayrım yalnızca id deseniyle yapılır
        console.log('    (bu planda cizim katmani yok — includeLayers vermeyin,');
        console.log('     ayrimi unitIdPattern / unitFilter ile yapin)');
    } else {
        console.log('    includeLayers: ' + JSON.stringify(named));
    }
    const namedLabels = labelLayers.filter((n) => n !== NO_LAYER);
    if (namedLabels.length) console.log('    labelLayers:   ' + JSON.stringify(namedLabels));
    console.log('    Kapi / bina kutlesi / koridor / ikon katmanlarini CIKARIN: bunlar birim');
    console.log('    ALANI tanimlamaz, dahil edilirse en yakin birim magaza yerine kapiyi');
    console.log('    ya da koridoru dondurur. Karar vermek icin app.html panelinde');
    console.log('    "Kat planini haritada goster" ile uydu uzerinde sinirlara bakin.');
}

const stat = fs.statSync(target);
const files = stat.isDirectory()
    ? fs.readdirSync(target).filter((f) => /\.svg$/i.test(f)).sort()
        .map((f) => path.join(target, f))
    : [target];

if (!files.length) {
    console.error('SVG bulunamadi: ' + target);
    process.exit(1);
}
for (const f of files) report(f);
