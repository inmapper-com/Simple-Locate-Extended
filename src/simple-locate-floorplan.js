/**
 * SimpleLocate Floor Plan — SVG kat planlarından "en yakın birim" tespiti
 *
 * Kullanıcı, kat başına bir SVG plan dosyası ve planın oturduğu coğrafi
 * sınırları (kuzey/güney/doğu/batı) verir. Modül SVG'deki birim şekillerini
 * okuyup kenar geometrisini metrik bir yerel çerçeveye çevirir; konum
 * geldiğinde o konuma EN YAKIN KENARI olan birimi bulur.
 *
 * Mesafe birimin merkezine değil KENARINA göre ölçülür: büyük bir mağazanın
 * kapısının dibinde durup "50 m uzakta" sonucunu almamak için nokta-doğru
 * parçası mesafesi kullanılır. Nokta birimin içindeyse mesafe 0'dır.
 *
 * Kat seçimi otomatik (yükseklik tabanlı kat tespiti) veya manuel olabilir.
 *
 * Bu dosya opsiyoneldir; yüklenmezse eklenti aynen çalışır.
 *
 * @requires leaflet-simple-locate.js
 * @version 1.0.0
 */
(function () {
    'use strict';

    if (typeof window === 'undefined') return;

    var DEFAULTS = {
        sampleSpacing: 1.0,     // m — eğrisel kenarların örnekleme sıklığı
        maxDistance: 100,       // m — bundan uzaktaki birimler sonuç sayılmaz
        maxCandidates: 5,       // Sonuçta döndürülen en yakın birim sayısı
        updateInterval: 1000,   // ms — konum akışında yeniden hesap aralığı
        maxPointsPerRing: 400,  // Tek bir şekilden çıkarılacak azami nokta
        labelLayers: ['Writing'],   // Metin etiketlerinin bulunduğu katman(lar)
        labelMaxDistance: 12,   // m — etiketin adlandırabileceği azami birim uzaklığı
        layerNames: null        // Katman → okunabilir tür adı; adsız birimler için yedek
    };

    // Çizim araçlarından çıkan planlarda birim adı genellikle şeklin üzerinde ayrı bir
    // metin öğesidir. Bir kısmı ise çalışma zamanında doldurulmak üzere yer tutucudur
    // ("IDEP01_1_" gibi) ve okunabilir bir ad taşımaz — bunlar ad kaynağı sayılmaz.
    var PLACEHOLDER_LABEL = /_\d+_$/;

    // ════════════════════════════════════════════════════════════════
    // GEOMETRİ YARDIMCILARI
    // ════════════════════════════════════════════════════════════════

    function mPerDegLat(lat) {
        var r = lat * Math.PI / 180;
        return 111132.92 - 559.82 * Math.cos(2 * r) + 1.175 * Math.cos(4 * r);
    }

    function mPerDegLng(lat) {
        var r = lat * Math.PI / 180;
        var v = 111412.84 * Math.cos(r) - 93.5 * Math.cos(3 * r);
        return (isFinite(v) && Math.abs(v) > 1) ? v : 1;
    }

    // Noktanın [ax,ay]-[bx,by] doğru parçasına en kısa uzaklığının KARESİ.
    // out verilirse en yakın nokta oraya yazılır (fazladan nesne üretmemek için).
    function pointSegmentDistSq(px, py, ax, ay, bx, by, out) {
        var vx = bx - ax, vy = by - ay;
        var len2 = vx * vx + vy * vy;
        var t = len2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / len2 : 0;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        var cx = ax + t * vx, cy = ay + t * vy;
        if (out) { out.x = cx; out.y = cy; }
        var dx = px - cx, dy = py - cy;
        return dx * dx + dy * dy;
    }

    // Ray casting — ring düz dizidir: [x0,y0, x1,y1, ...]
    function pointInRing(px, py, ring) {
        var inside = false;
        var n = ring.length / 2;
        for (var i = 0, j = n - 1; i < n; j = i++) {
            var xi = ring[i * 2], yi = ring[i * 2 + 1];
            var xj = ring[j * 2], yj = ring[j * 2 + 1];
            if (((yi > py) !== (yj > py)) &&
                (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    function rotate(dx, dy, cos, sin) {
        return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
    }

    // ════════════════════════════════════════════════════════════════
    // ÖLÇÜM KABI — SVG'nin CTM/uzunluk hesapları için DOM'da olması gerekir
    // ════════════════════════════════════════════════════════════════

    var measureHost = null;

    function getMeasureHost() {
        if (measureHost && measureHost.parentNode) return measureHost;
        measureHost = document.createElement('div');
        // display:none KULLANILMAZ — getBBox/getCTM yalnızca yerleşimi olan
        // öğelerde çalışır. Görünmez ama yerleşimi olan bir kutu gerekir.
        measureHost.setAttribute('aria-hidden', 'true');
        measureHost.style.cssText = 'position:absolute;left:-100000px;top:0;' +
            'width:1px;height:1px;overflow:hidden;visibility:hidden;' +
            'pointer-events:none;contain:strict;';
        document.body.appendChild(measureHost);
        return measureHost;
    }

    // ════════════════════════════════════════════════════════════════
    // SVG ŞEKİL → NOKTA DİZİSİ (SVG kök koordinatlarında)
    // ════════════════════════════════════════════════════════════════

    var SHAPE_TAGS = ['path', 'polygon', 'polyline', 'rect', 'circle', 'ellipse', 'line'];

    function shapeElements(el) {
        var tag = (el.tagName || '').toLowerCase();
        if (SHAPE_TAGS.indexOf(tag) !== -1) return [el];
        // Grup/konteyner → içindeki tüm şekiller
        var found = el.querySelectorAll ? el.querySelectorAll(SHAPE_TAGS.join(',')) : [];
        return Array.prototype.slice.call(found);
    }

    // Öğeyi içeren en yakın çizim katmanı (Inkscape "layer" grubu) adı.
    // Katman adları çizim araçlarında anlamsal ayrımı taşır (Shop, Food, Doors, Icons…),
    // bu yüzden birim seçiminde kullanılabilecek en güvenilir işarettir.
    function layerNameOf(el, root) {
        var node = el.parentNode;
        while (node && node !== root && node.nodeType === 1) {
            var mode = node.getAttribute ? (node.getAttribute('inkscape:groupmode') ||
                node.getAttribute('groupmode')) : null;
            if (mode === 'layer') {
                return node.getAttribute('id') ||
                    node.getAttribute('inkscape:label') || node.getAttribute('label') || null;
            }
            node = node.parentNode;
        }
        return null;
    }

    function toList(v) {
        if (v == null) return null;
        return Array.isArray(v) ? v.slice() : [v];
    }

    function matchesPattern(value, pattern) {
        if (!pattern) return true;
        if (typeof pattern === 'function') return !!pattern(value);
        if (typeof pattern === 'string') return value.indexOf(pattern) === 0;
        return pattern.test(value);
    }

    // Bir şeklin kendi kullanıcı uzayındaki kenar noktaları.
    // Düz kenarlı şekillerde köşeler yeterlidir (mesafe doğru parçasına göre
    // hesaplandığından ara nokta eklemek doğruluk kazandırmaz); yalnızca
    // eğrisel şekiller örneklenir.
    function localPoints(el, spacingPx, maxPoints) {
        var tag = (el.tagName || '').toLowerCase();
        var pts = [];
        var i, n, a;

        if (tag === 'polygon' || tag === 'polyline') {
            var list = el.points;
            if (list) {
                for (i = 0; i < list.numberOfItems; i++) {
                    var p = list.getItem(i);
                    pts.push(p.x, p.y);
                }
            }
            return [{ pts: pts, closed: tag === 'polygon' }];
        }

        if (tag === 'rect') {
            var x = parseFloat(el.getAttribute('x')) || 0;
            var y = parseFloat(el.getAttribute('y')) || 0;
            var w = parseFloat(el.getAttribute('width')) || 0;
            var h = parseFloat(el.getAttribute('height')) || 0;
            if (w <= 0 || h <= 0) return [];
            return [{ pts: [x, y, x + w, y, x + w, y + h, x, y + h], closed: true }];
        }

        if (tag === 'line') {
            return [{
                pts: [parseFloat(el.getAttribute('x1')) || 0, parseFloat(el.getAttribute('y1')) || 0,
                      parseFloat(el.getAttribute('x2')) || 0, parseFloat(el.getAttribute('y2')) || 0],
                closed: false
            }];
        }

        if (tag === 'circle' || tag === 'ellipse') {
            var cx = parseFloat(el.getAttribute('cx')) || 0;
            var cy = parseFloat(el.getAttribute('cy')) || 0;
            var rx = tag === 'circle'
                ? (parseFloat(el.getAttribute('r')) || 0)
                : (parseFloat(el.getAttribute('rx')) || 0);
            var ry = tag === 'circle' ? rx : (parseFloat(el.getAttribute('ry')) || 0);
            if (rx <= 0 || ry <= 0) return [];
            var circumference = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
            n = Math.max(12, Math.min(maxPoints, Math.ceil(circumference / spacingPx)));
            for (i = 0; i < n; i++) {
                a = (i / n) * Math.PI * 2;
                pts.push(cx + rx * Math.cos(a), cy + ry * Math.sin(a));
            }
            return [{ pts: pts, closed: true }];
        }

        if (tag === 'path') {
            var total = 0;
            try { total = el.getTotalLength(); } catch (e) { return []; }
            if (!(total > 0)) return [];
            n = Math.max(8, Math.min(maxPoints, Math.ceil(total / spacingPx)));
            var step = total / n;
            // Alt yollar (M ... M ...) arasındaki sıçramalar sahte kenar üretir;
            // beklenenden çok uzun adımlar ring kırılması sayılır.
            var breakDist = Math.max(step * 4, spacingPx * 4);
            var rings = [];
            var cur = [];
            var prevX = null, prevY = null;
            for (i = 0; i <= n; i++) {
                var pt;
                try { pt = el.getPointAtLength(Math.min(total, i * step)); } catch (e) { break; }
                if (prevX !== null) {
                    var d = Math.sqrt((pt.x - prevX) * (pt.x - prevX) + (pt.y - prevY) * (pt.y - prevY));
                    if (d > breakDist) {
                        if (cur.length >= 4) rings.push({ pts: cur, closed: true });
                        cur = [];
                    }
                }
                cur.push(pt.x, pt.y);
                prevX = pt.x; prevY = pt.y;
            }
            if (cur.length >= 4) rings.push({ pts: cur, closed: true });
            return rings;
        }

        return [];
    }

    // Öğenin kök SVG viewport'una dönüşüm matrisi
    function matrixToRoot(root, el) {
        try {
            var rootCTM = root.getScreenCTM();
            var elCTM = el.getScreenCTM();
            if (rootCTM && elCTM) return rootCTM.inverse().multiply(elCTM);
        } catch (e) { /* aşağıdaki yedeğe düş */ }
        try { return el.getCTM(); } catch (e2) { return null; }
    }

    // ════════════════════════════════════════════════════════════════
    // KAT PLANI DİZİNİ
    // ════════════════════════════════════════════════════════════════

    function FloorPlanIndex(cfg) {
        cfg = cfg || {};
        this.cfg = cfg;
        this.sampleSpacing = cfg.sampleSpacing || DEFAULTS.sampleSpacing;
        this.maxDistance = cfg.maxDistance != null ? cfg.maxDistance : DEFAULTS.maxDistance;
        this.maxCandidates = cfg.maxCandidates || DEFAULTS.maxCandidates;
        this.maxPointsPerRing = cfg.maxPointsPerRing || DEFAULTS.maxPointsPerRing;

        this.floors = {};
        this.order = [];

        var list = cfg.floors || [];
        for (var i = 0; i < list.length; i++) {
            var def = list[i];
            var key = String(def.floor != null ? def.floor : i);
            var bounds = def.bounds || cfg.bounds;
            if (!bounds) {
                console.warn('[SimpleLocate] Kat planı için sınır (bounds) verilmedi:', key);
                continue;
            }
            this.floors[key] = {
                floor: def.floor != null ? def.floor : i,
                name: def.name || ('Kat ' + key),
                svg: def.svg || def.path || null,
                svgText: def.svgText || null,
                bounds: bounds,
                rotation: def.rotation != null ? def.rotation : (cfg.rotation || 0),
                units: null,
                transform: null,
                state: 'idle',
                error: null,
                promise: null
            };
            this.order.push(key);
        }

        this.defaultFloor = cfg.defaultFloor != null ? cfg.defaultFloor
            : (this.order.length ? this.floors[this.order[0]].floor : null);
        this.floorMode = cfg.floorMode === 'manual' ? 'manual' : 'auto';
        this.activeFloor = cfg.activeFloor != null ? cfg.activeFloor : this.defaultFloor;
    }

    FloorPlanIndex.prototype.getFloorList = function () {
        var out = [];
        for (var i = 0; i < this.order.length; i++) {
            var f = this.floors[this.order[i]];
            out.push({ floor: f.floor, name: f.name, state: f.state, units: f.units ? f.units.length : 0 });
        }
        return out;
    };

    FloorPlanIndex.prototype._entry = function (floor) {
        if (floor == null) return null;
        return this.floors[String(floor)] || null;
    };

    // ---- Yükleme ----
    FloorPlanIndex.prototype.ensureLoaded = function (floor) {
        var entry = this._entry(floor);
        if (!entry) return Promise.reject(new Error('Tanımsız kat: ' + floor));
        if (entry.promise) return entry.promise;

        var self = this;
        entry.state = 'loading';

        var source = entry.svgText
            ? Promise.resolve(entry.svgText)
            : fetch(entry.svg, { credentials: 'same-origin' }).then(function (r) {
                if (!r.ok) throw new Error('SVG alınamadı (' + r.status + '): ' + entry.svg);
                return r.text();
            });

        entry.promise = source.then(function (text) {
            self._build(entry, text);
            entry.state = 'ready';
            return entry;
        }).catch(function (err) {
            entry.state = 'error';
            entry.error = err && err.message ? err.message : String(err);
            // Yeniden denenebilsin diye söz sıfırlanır
            entry.promise = null;
            throw err;
        });

        return entry.promise;
    };

    FloorPlanIndex.prototype._build = function (entry, svgText) {
        var doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
        if (doc.querySelector('parsererror')) throw new Error('SVG ayrıştırılamadı: ' + entry.svg);
        var svg = doc.documentElement;
        if (!svg || svg.tagName.toLowerCase() !== 'svg') throw new Error('Kök <svg> bulunamadı: ' + entry.svg);

        var host = getMeasureHost();
        var imported = document.importNode(svg, true);

        // viewBox yoksa width/height'tan türet
        var vb = { x: 0, y: 0, w: 0, h: 0 };
        var vbAttr = imported.getAttribute('viewBox');
        if (vbAttr) {
            var parts = vbAttr.trim().split(/[\s,]+/).map(parseFloat);
            if (parts.length === 4 && parts.every(isFinite)) {
                vb = { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
            }
        }
        if (!(vb.w > 0 && vb.h > 0)) {
            vb.w = parseFloat(imported.getAttribute('width')) || 0;
            vb.h = parseFloat(imported.getAttribute('height')) || 0;
            if (vb.w > 0 && vb.h > 0) imported.setAttribute('viewBox', '0 0 ' + vb.w + ' ' + vb.h);
        }
        if (!(vb.w > 0 && vb.h > 0)) throw new Error('SVG boyutu (viewBox) okunamadı: ' + entry.svg);

        // Viewport = viewBox olsun ki getScreenCTM sonuçları viewBox birimi versin
        imported.setAttribute('width', vb.w);
        imported.setAttribute('height', vb.h);
        imported.style.position = 'absolute';
        host.appendChild(imported);

        try {
            entry.transform = this._makeTransform(entry, vb);
            entry.units = this._extractUnits(entry, imported);
            if (this.cfg.nameFromLabels) {
                this._applyLabelNames(entry, this._extractLabels(entry, imported));
            }
            this._applyGenericNames(entry);
        } finally {
            // Ölçüm bitti; büyük DOM ağacını bellekte tutma
            host.removeChild(imported);
        }

        if (!entry.units.length) {
            console.warn('[SimpleLocate] Kat planında birim bulunamadı (' + entry.name +
                '). unitSelector / units eşleşmiyor olabilir.');
        }
    };

    // SVG birimleri ↔ yerel metre çerçevesi ve lat/lng dönüşümleri
    FloorPlanIndex.prototype._makeTransform = function (entry, vb) {
        var b = entry.bounds;
        var north = b.north, south = b.south, east = b.east, west = b.west;
        var centerLat = (north + south) / 2;
        var mLat = mPerDegLat(centerLat);
        var mLng = mPerDegLng(centerLat);

        // SVG birimi başına metre (x doğuya, y güneye)
        var sx = ((east - west) * mLng) / vb.w;
        var sy = ((north - south) * mLat) / vb.h;

        var widthM = vb.w * sx;
        var heightM = vb.h * sy;
        var cxM = widthM / 2;
        var cyM = heightM / 2;

        var rot = (entry.rotation || 0) * Math.PI / 180;
        var cosF = Math.cos(rot), sinF = Math.sin(rot);
        var cosB = Math.cos(-rot), sinB = Math.sin(-rot);
        var rotated = Math.abs(entry.rotation || 0) > 1e-9;

        return {
            vb: vb,
            widthM: widthM,
            heightM: heightM,
            // SVG noktası → yerel metre (plan çerçevesi)
            svgToMeters: function (x, y) {
                return { x: (x - vb.x) * sx, y: (y - vb.y) * sy };
            },
            // Coğrafi konum → yerel metre (plan çerçevesi)
            latLngToMeters: function (lat, lng) {
                var mx = (lng - west) * mLng;
                var my = (north - lat) * mLat;
                if (!rotated) return { x: mx, y: my };
                var r = rotate(mx - cxM, my - cyM, cosB, sinB);
                return { x: r.x + cxM, y: r.y + cyM };
            },
            // Yerel metre → coğrafi konum
            metersToLatLng: function (mx, my) {
                if (rotated) {
                    var r = rotate(mx - cxM, my - cyM, cosF, sinF);
                    mx = r.x + cxM; my = r.y + cyM;
                }
                return { lat: north - my / mLat, lng: west + mx / mLng };
            }
        };
    };

    FloorPlanIndex.prototype._extractUnits = function (entry, svgRoot) {
        var cfg = this.cfg;
        var tf = entry.transform;
        var spacingPx = Math.max(0.5, this.sampleSpacing / Math.max(1e-6,
            (tf.widthM / tf.vb.w + tf.heightM / tf.vb.h) / 2));

        var targets = [];
        var i;

        // Birim listesi verildiyse id ile birebir eşle; yoksa seçici + filtrelerle tara
        if (cfg.units && cfg.units.length) {
            for (i = 0; i < cfg.units.length; i++) {
                var u = cfg.units[i];
                var id = typeof u === 'string' ? u : (u.id || u.svgId);
                if (!id) continue;
                var el = svgRoot.getElementById ? svgRoot.getElementById(id) : null;
                if (!el) el = svgRoot.querySelector('[id="' + String(id).replace(/"/g, '\\"') + '"]');
                if (!el) continue;
                targets.push({ el: el, id: id, meta: typeof u === 'string' ? null : u });
            }
        } else {
            var include = toList(cfg.includeLayers);
            var exclude = toList(cfg.excludeLayers);
            var found = svgRoot.querySelectorAll(cfg.unitSelector || '[id]');
            for (i = 0; i < found.length; i++) {
                var e2 = found[i];
                var eid = e2.getAttribute('id') || e2.getAttribute('data-id');
                if (!eid) continue;
                if (!matchesPattern(eid, cfg.unitIdPattern)) continue;

                var layer = layerNameOf(e2, svgRoot);
                // Kapı/ikon/etiket katmanları birim ALANI tanımlamaz: kapı bir çizgi,
                // ikon bir simgedir. Birim geometrisine karışırlarsa kenar mesafesi
                // birimin sınırı yerine kapısına/simgesine göre ölçülür.
                if (exclude && layer && exclude.indexOf(layer) !== -1) continue;
                if (include && include.indexOf(layer) === -1) continue;
                if (cfg.unitFilter && !cfg.unitFilter(e2, layer)) continue;

                targets.push({ el: e2, id: eid, layer: layer, meta: null });
            }
        }

        // Aynı birimin parçaları (IDD110A + IDD110B gibi) tek birim olarak birleşir;
        // aksi hâlde "en yakın birim" aynı mağazanın iki yarısı arasında salınır.
        var groups = [];
        var byKey = {};
        for (i = 0; i < targets.length; i++) {
            var t = targets[i];
            var key = cfg.unitIdNormalize ? cfg.unitIdNormalize(t.id, t.el) : t.id;
            if (key == null) continue;
            if (!byKey[key]) {
                byKey[key] = { id: key, layer: t.layer, meta: t.meta, els: [] };
                groups.push(byKey[key]);
            }
            byKey[key].els.push(t.el);
        }

        var units = [];
        for (i = 0; i < groups.length; i++) {
            var unit = this._buildUnit(entry, svgRoot, groups[i], spacingPx);
            if (unit) units.push(unit);
        }
        return units;
    };

    FloorPlanIndex.prototype._buildUnit = function (entry, svgRoot, target, spacingPx) {
        var tf = entry.transform;
        var shapes = [];
        var els = target.els || [target.el];
        for (var e = 0; e < els.length; e++) {
            shapes = shapes.concat(shapeElements(els[e]));
        }
        if (!shapes.length) return null;

        var rings = [];
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        for (var s = 0; s < shapes.length; s++) {
            var shape = shapes[s];
            var m = matrixToRoot(svgRoot, shape);
            var local = localPoints(shape, spacingPx, this.maxPointsPerRing);
            for (var r = 0; r < local.length; r++) {
                var src = local[r].pts;
                if (src.length < 4) continue;
                var ring = new Float64Array(src.length);
                for (var p = 0; p < src.length; p += 2) {
                    var x = src[p], y = src[p + 1];
                    if (m) {
                        var tx = m.a * x + m.c * y + m.e;
                        var ty = m.b * x + m.d * y + m.f;
                        x = tx; y = ty;
                    }
                    var mm = tf.svgToMeters(x, y);
                    ring[p] = mm.x;
                    ring[p + 1] = mm.y;
                    if (mm.x < minX) minX = mm.x;
                    if (mm.x > maxX) maxX = mm.x;
                    if (mm.y < minY) minY = mm.y;
                    if (mm.y > maxY) maxY = mm.y;
                }
                rings.push({ pts: ring, closed: local[r].closed !== false });
            }
        }

        if (!rings.length || !isFinite(minX)) return null;

        var meta = target.meta || {};
        var first = els[0];
        var titleEl = first.querySelector ? first.querySelector('title') : null;
        var names = this.cfg.names;
        var mapped = typeof names === 'function' ? names(target.id, entry.floor)
            : (names ? names[target.id] : null);
        var explicit = mapped || meta.name || meta.title ||
            (first.getAttribute && first.getAttribute('data-name')) ||
            (titleEl && titleEl.textContent) || null;

        return {
            id: target.id,
            name: explicit || target.id,
            // Ad kaynağı bulunan birimler etiket eşlemesinden ve tür adından korunur
            hasName: !!explicit,
            layer: target.layer || null,
            meta: meta,
            floor: entry.floor,
            rings: rings,
            bbox: { minX: minX, minY: minY, maxX: maxX, maxY: maxY },
            center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
        };
    };

    // ---- Etiketten ad türetme ----

    /**
     * Etiket katmanındaki metin öğelerini okur; her birini yerel metre çerçevesinde
     * bir çapa noktasıyla döndürür. Yer tutucu metinler atlanır.
     *
     * İki dilli etiketlerde her satır ayrı <tspan>'dir; yalnızca ilk satır ad sayılır,
     * yoksa "Yemek AlanıFood Court" gibi birleşik metinler ad olarak görünür.
     */
    FloorPlanIndex.prototype._extractLabels = function (entry, svgRoot) {
        var cfg = this.cfg;
        var tf = entry.transform;
        var layers = toList(cfg.labelLayers) || DEFAULTS.labelLayers;
        var selector = cfg.labelSelector || 'text';
        var found = svgRoot.querySelectorAll(selector);
        var out = [];

        for (var i = 0; i < found.length; i++) {
            var el = found[i];
            var layer = layerNameOf(el, svgRoot);
            if (layers.length && (!layer || layers.indexOf(layer) === -1)) continue;

            var span = el.querySelector ? el.querySelector('tspan') : null;
            var text = ((span ? span.textContent : el.textContent) || '')
                .replace(/\s+/g, ' ').trim();
            if (!text || PLACEHOLDER_LABEL.test(text)) continue;
            if (cfg.labelFilter && !cfg.labelFilter(text, el)) continue;

            var ax = parseFloat((span && span.getAttribute('x')) || el.getAttribute('x'));
            var ay = parseFloat((span && span.getAttribute('y')) || el.getAttribute('y'));
            if (!isFinite(ax) || !isFinite(ay)) continue;

            var m = matrixToRoot(svgRoot, el);
            var rx = m ? (m.a * ax + m.c * ay + m.e) : ax;
            var ry = m ? (m.b * ax + m.d * ay + m.f) : ay;
            var mm = tf.svgToMeters(rx, ry);
            out.push({ name: text, x: mm.x, y: mm.y });
        }
        return out;
    };

    /**
     * Etiketleri birimlere konumsal olarak bağlar.
     *
     * Etiket kural olarak adlandırdığı şeklin ÜZERİNE konur, bu yüzden etiketi içine
     * alan birim her zaman kazanır. Etiket hiçbir şeklin içinde değilse adlandırma
     * ancak eşik içinde TEK aday varsa yapılır: yoğun bir planda serbest duran etiket
     * (check-in sırası numarası, kapı kodu, kat yönlendirmesi) kendisine en yakın
     * mağazayı adlandırırsa ortaya "1" adlı bir dükkân çıkar — yanlış ad, adsızlıktan
     * kötüdür, çünkü kullanıcı onu birimin gerçek adı sanar.
     *
     * Yalnızca başka bir ad kaynağı bulunamamış birimler adlandırılır; yapılandırmadan
     * gelen açık adlar korunur.
     */
    FloorPlanIndex.prototype._applyLabelNames = function (entry, labels) {
        var units = entry.units;
        if (!units || !units.length || !labels.length) return;

        var maxD = this.cfg.labelMaxDistance != null
            ? this.cfg.labelMaxDistance : DEFAULTS.labelMaxDistance;
        var maxSq = maxD * maxD;

        for (var li = 0; li < labels.length; li++) {
            var lab = labels[li];
            var inside = null;                      // Etiketi içine alan birim
            var nearest = null, nearestSq = Infinity;
            var nearCount = 0;                      // Eşik içindeki aday sayısı

            for (var ui = 0; ui < units.length; ui++) {
                var unit = units[ui];
                var lower = bboxDistSq(lab.x, lab.y, unit.bbox);
                if (lower > maxSq) continue;

                // Belirsizlik ölçüsü adlandırma durumundan bağımsız sayılır; yoksa
                // sonuç birimlerin işlenme sırasına göre değişir
                nearCount++;
                if (lower < nearestSq) { nearestSq = lower; nearest = unit; }

                if (lower === 0 && !inside) {
                    for (var r = 0; r < unit.rings.length; r++) {
                        if (unit.rings[r].closed &&
                            pointInRing(lab.x, lab.y, unit.rings[r].pts)) { inside = unit; break; }
                    }
                }
            }

            var target = inside || (nearCount === 1 ? nearest : null);
            if (target && !target.hasName) { target.name = lab.name; target.hasName = true; }
        }
    };

    /**
     * Hâlâ adsız kalan birimlere katmanından okunabilir bir tür adı verir.
     * Kullanıcıya "IDFT163" göstermek bilgi taşımaz; "Mağaza" en azından birimin
     * ne olduğunu söyler. Kimlik `id` alanında olduğu gibi durmaya devam eder ve
     * sonuçta `generic: true` ile bu adın birimi tanımlamadığı bildirilir.
     */
    FloorPlanIndex.prototype._applyGenericNames = function (entry) {
        var map = this.cfg.layerNames;
        if (!map || !entry.units) return;

        for (var i = 0; i < entry.units.length; i++) {
            var unit = entry.units[i];
            if (unit.hasName) continue;
            var generic = typeof map === 'function'
                ? map(unit.layer, unit.id) : map[unit.layer];
            if (!generic) continue;
            unit.name = generic;
            unit.generic = true;
        }
    };

    // ---- Sorgu ----

    // Noktanın bbox'a en kısa uzaklığının karesi (ön eleme için alt sınır)
    function bboxDistSq(px, py, b) {
        var dx = px < b.minX ? b.minX - px : (px > b.maxX ? px - b.maxX : 0);
        var dy = py < b.minY ? b.minY - py : (py > b.maxY ? py - b.maxY : 0);
        return dx * dx + dy * dy;
    }

    /**
     * Verilen konuma en yakın birimi bulur (kenar mesafesine göre).
     * Kat henüz yüklenmemişse null döner; yükleme ensureLoaded ile yapılır.
     */
    FloorPlanIndex.prototype.findNearest = function (lat, lng, floor) {
        var entry = this._entry(floor);
        if (!entry || entry.state !== 'ready' || !entry.units) return null;

        var q = entry.transform.latLngToMeters(lat, lng);
        var scored = [];
        var hit = { x: 0, y: 0 };
        var cutoffSq = this.maxDistance != null ? this.maxDistance * this.maxDistance : Infinity;

        for (var i = 0; i < entry.units.length; i++) {
            var unit = entry.units[i];
            // bbox uzaklığı gerçek kenar uzaklığının alt sınırıdır; eşiğin
            // ötesindeki birimler hiç taranmaz
            var lower = bboxDistSq(q.x, q.y, unit.bbox);
            if (lower > cutoffSq) continue;

            var inside = false;
            var bestSq = Infinity;
            var bx = 0, by = 0;

            for (var r = 0; r < unit.rings.length; r++) {
                var ring = unit.rings[r];
                var pts = ring.pts;
                var n = pts.length / 2;
                if (!inside && ring.closed && lower === 0 && pointInRing(q.x, q.y, pts)) inside = true;
                // Kenar mesafesi: nokta içerideyken de en yakın kenarı biliriz.
                // Açık halkalarda son→ilk kapanış kenarı yoktur.
                var j = ring.closed ? 0 : 1;
                var k = ring.closed ? n - 1 : 0;
                for (; j < n; k = j++) {
                    var d2 = pointSegmentDistSq(q.x, q.y,
                        pts[k * 2], pts[k * 2 + 1], pts[j * 2], pts[j * 2 + 1], hit);
                    if (d2 < bestSq) { bestSq = d2; bx = hit.x; by = hit.y; }
                }
            }

            if (!isFinite(bestSq)) continue;
            var edgeDist = Math.sqrt(bestSq);
            scored.push({
                unit: unit,
                inside: inside,
                distance: inside ? 0 : edgeDist,
                edgeDistance: edgeDist,
                ex: bx, ey: by
            });
        }

        if (!scored.length) return null;

        scored.sort(function (a, b) {
            // İçindeysek o birim her zaman önce gelir
            if (a.inside !== b.inside) return a.inside ? -1 : 1;
            return a.distance - b.distance;
        });

        var top = scored[0];
        if (!top.inside && this.maxDistance != null && top.distance > this.maxDistance) return null;

        var edgeLL = entry.transform.metersToLatLng(top.ex, top.ey);
        var candidates = [];
        for (var c = 0; c < Math.min(this.maxCandidates, scored.length); c++) {
            candidates.push({
                id: scored[c].unit.id,
                name: scored[c].unit.name,
                generic: !!scored[c].unit.generic,
                layer: scored[c].unit.layer || null,
                distance: Math.round(scored[c].distance * 10) / 10,
                inside: scored[c].inside
            });
        }

        return {
            id: top.unit.id,
            name: top.unit.name,
            // Ad birimin kendi adı değil, katmanından türetilmiş tür adı ise true
            generic: !!top.unit.generic,
            layer: top.unit.layer || null,
            meta: top.unit.meta,
            floor: entry.floor,
            floorName: entry.name,
            distance: Math.round(top.distance * 10) / 10,
            edgeDistance: Math.round(top.edgeDistance * 10) / 10,
            inside: top.inside,
            edge: edgeLL,
            candidates: candidates
        };
    };

    /** Bir katın birimlerini lat/lng halkaları olarak döndürür (doğrulama/çizim). */
    FloorPlanIndex.prototype.getUnitShapes = function (floor) {
        var entry = this._entry(floor);
        if (!entry || !entry.units) return [];
        var out = [];
        for (var i = 0; i < entry.units.length; i++) {
            var u = entry.units[i];
            var rings = [];
            for (var r = 0; r < u.rings.length; r++) {
                var pts = u.rings[r].pts;
                var ll = [];
                for (var p = 0; p < pts.length; p += 2) {
                    var c = entry.transform.metersToLatLng(pts[p], pts[p + 1]);
                    ll.push([c.lat, c.lng]);
                }
                rings.push(ll);
            }
            out.push({
                id: u.id, name: u.name, generic: !!u.generic,
                layer: u.layer || null, rings: rings
            });
        }
        return out;
    };

    // ════════════════════════════════════════════════════════════════
    // EKLENTİ ENTEGRASYONU
    // ════════════════════════════════════════════════════════════════

    window.SimpleLocateFloorPlan = FloorPlanIndex;

    var L = window.L;
    if (!L || !L.Control || !L.Control.SimpleLocate) {
        console.warn('[SimpleLocate] Kat planı modülü: SimpleLocate bulunamadı, yalnızca ' +
            'window.SimpleLocateFloorPlan olarak kullanılabilir.');
        return;
    }

    var Proto = L.Control.SimpleLocate.prototype;

    L.Control.SimpleLocate.include({

        /** Kat planı dizinini kur ve konum akışına bağlan (addTo sırasında çağrılır). */
        _initFloorPlans: function () {
            if (this._floorPlan) return this._floorPlan;
            var cfg = this.options.floorPlans;
            if (!cfg || cfg.enabled === false || !cfg.floors || !cfg.floors.length) return null;

            var self = this;
            this._floorPlan = new FloorPlanIndex(cfg);
            this._nearestUnit = null;
            this._nearestUnitAt = 0;
            this._nearestUnitKey = null;

            var handler = function (loc) { self._onFloorPlanLocation(loc); };
            if (typeof this.onDeviceMove === 'function') {
                this.onDeviceMove(handler);
            } else {
                var prev = this.options.afterDeviceMove;
                this.options.afterDeviceMove = function (loc) {
                    if (typeof prev === 'function') prev(loc);
                    handler(loc);
                };
            }

            // Başlangıç katını önden yükle: ilk konum geldiğinde sonuç hazır olsun
            var initial = this._floorPlan.activeFloor;
            if (initial != null) {
                this._loadFloorPlan(initial);
            }
            return this._floorPlan;
        },

        _loadFloorPlan: function (floor) {
            var self = this;
            var fp = this._floorPlan;
            if (!fp) return Promise.resolve(null);
            return fp.ensureLoaded(floor).then(function (entry) {
                self._floorPlanLog('info', 'Kat planı yüklendi: ' + entry.name +
                    ' (' + entry.units.length + ' birim)', { floor: entry.floor, units: entry.units.length });
                if (typeof self.options.floorPlans.onFloorLoad === 'function') {
                    try { self.options.floorPlans.onFloorLoad(entry.floor, entry.units.length); } catch (e) {}
                }
                // Plan yüklenene kadar gelen konumlar hesaplanamamıştı; sonucu
                // bir sonraki GPS fix'ini beklemeden üret.
                if (self._lastFloorPlanLoc) {
                    self._nearestUnitAt = 0;
                    self._onFloorPlanLocation(self._lastFloorPlanLoc);
                }
                return entry;
            }).catch(function (err) {
                self._floorPlanLog('error', 'Kat planı yüklenemedi: ' + (err && err.message ? err.message : err),
                    { floor: floor });
                return null;
            });
        },

        _floorPlanLog: function (level, message, data) {
            var panel = this._controlPanel;
            if (panel && panel.logger && typeof panel.logger.log === 'function') {
                panel.logger.log('location', level, message, data);
            } else if (level === 'error') {
                console.warn('[SimpleLocate]', message);
            }
        },

        /** Konum akışında kat seçimi + en yakın birim hesabı. */
        _onFloorPlanLocation: function (loc) {
            var fp = this._floorPlan;
            if (!fp || !loc) return;
            if (loc.isRejected || loc.lat == null || loc.lng == null) return;
            this._lastFloorPlanLoc = loc;

            var floor = this.getFloorPlanFloor(loc);
            if (floor == null) return;

            var entry = fp._entry(floor);
            if (!entry) return;
            if (entry.state === 'idle') { this._loadFloorPlan(floor); return; }
            if (entry.state !== 'ready') return;

            var floorChanged = fp.lastFloor !== floor;
            fp.lastFloor = floor;

            var now = Date.now();
            var interval = this.options.floorPlans.updateInterval != null
                ? this.options.floorPlans.updateInterval : DEFAULTS.updateInterval;
            // İlk sonuç ve kat değişimi beklemeden üretilir; arası throttle'lanır
            if (this._nearestUnit !== null && !floorChanged &&
                (now - this._nearestUnitAt) < interval) return;
            this._nearestUnitAt = now;

            var result = fp.findNearest(loc.lat, loc.lng, floor);
            this._nearestUnit = result || { id: null, name: null, floor: floor, distance: null };

            // İlk 5 adayın sırası/kimliği değişince logla (yalnızca en yakına bakmak
            // sıralama kaymalarını kaçırırdı)
            var cands = (result && result.candidates) ? result.candidates : [];
            var key = result
                ? (result.floor + '/' + cands.map(function (c) {
                    return c.id + (c.inside ? 'in' : '');
                }).join(','))
                : 'none';
            if (key !== this._nearestUnitKey) {
                this._nearestUnitKey = key;
                if (result && cands.length) {
                    var names = cands.map(function (c) { return c.name; });
                    this._floorPlanLog('info',
                        'En yakın birimler: ' + names.join(', '),
                        {
                            floor: result.floor,
                            floorName: result.floorName,
                            nearestUnits: cands.map(function (c) {
                                return {
                                    id: c.id,
                                    name: c.name,
                                    distance: c.distance,
                                    inside: c.inside,
                                    generic: !!c.generic,
                                    layer: c.layer || null
                                };
                            }),
                            unitId: result.id,
                            unitName: result.name,
                            distance: result.distance,
                            inside: result.inside
                        });
                } else {
                    this._floorPlanLog('info', 'Yakında birim yok (' +
                        fp.maxDistance + ' m içinde)', { floor: floor });
                }
                if (typeof this.options.floorPlans.onNearestUnit === 'function') {
                    try { this.options.floorPlans.onNearestUnit(result, loc); } catch (e) {
                        console.error('onNearestUnit error:', e);
                    }
                }
            }
        },

        /** Etkin kat: manuel modda seçilen, otomatik modda yükseklikten tespit edilen. */
        getFloorPlanFloor: function (loc) {
            var fp = this._floorPlan;
            if (!fp) return null;
            if (fp.floorMode === 'manual') return fp.activeFloor;
            var f = (loc && loc.floor != null) ? loc.floor
                : (this._altitude && this._altitude.floor != null ? this._altitude.floor : null);
            // Kat anlık olarak tespit edilemiyorsa zemine düşmek yerine son
            // bilinen katta kalmak daha doğru bir tahmindir
            if (f == null || !fp._entry(f)) f = fp.lastFloor;
            if (f == null || !fp._entry(f)) f = fp.defaultFloor;
            return f;
        },

        /** Son hesaplanan en yakın birim. */
        getNearestUnit: function () {
            return this._nearestUnit || null;
        },

        /** Serbest sorgu — akıştan bağımsız tek seferlik hesap. */
        findNearestUnit: function (lat, lng, floor) {
            if (!this._floorPlan) return null;
            if (floor == null) floor = this.getFloorPlanFloor(null);
            return this._floorPlan.findNearest(lat, lng, floor);
        },

        /** Kat seçim modu: 'auto' (yükseklik) veya 'manual'. */
        setFloorPlanMode: function (mode) {
            if (!this._floorPlan) return this;
            this._floorPlan.floorMode = mode === 'manual' ? 'manual' : 'auto';
            this._nearestUnitAt = 0;
            this._floorPlanLog('info', 'Kat seçim modu: ' +
                (this._floorPlan.floorMode === 'manual' ? 'manuel' : 'otomatik'), null);
            return this;
        },

        /** Manuel kat seçimi (mod otomatikse manuele alınır). */
        setFloorPlanFloor: function (floor) {
            var fp = this._floorPlan;
            if (!fp) return this;
            if (!fp._entry(floor)) return this;
            fp.activeFloor = floor;
            fp.floorMode = 'manual';
            this._nearestUnit = null;
            this._nearestUnitAt = 0;
            this._nearestUnitKey = null;
            this._loadFloorPlan(floor);
            return this;
        },

        getFloorPlanFloors: function () {
            return this._floorPlan ? this._floorPlan.getFloorList() : [];
        },

        getFloorPlanIndex: function () {
            return this._floorPlan || null;
        },

        /** Birim geometrilerini lat/lng olarak al (hizalama doğrulaması / çizim). */
        getFloorPlanShapes: function (floor) {
            if (!this._floorPlan) return [];
            if (floor == null) floor = this.getFloorPlanFloor(null);
            return this._floorPlan.getUnitShapes(floor);
        }
    });

    // addTo sarmalanır: Extended de Base.prototype.addTo'yu çağırdığı için
    // her iki kullanımda da kat planı kurulumu tetiklenir.
    var origAddTo = Proto.addTo;
    Proto.addTo = function (map) {
        var result = origAddTo.call(this, map);
        try {
            this._initFloorPlans();
        } catch (e) {
            console.warn('[SimpleLocate] Kat planı kurulumu başarısız:', e);
        }
        return result;
    };
})();
