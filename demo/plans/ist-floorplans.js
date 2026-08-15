/**
 * İstanbul Havalimanı (IST) kat planları — SimpleLocate kat planı yapılandırması
 *
 * Bu dosya tek doğru kaynaktır: app.html ve log-viewer.html bunu kullanır.
 *
 * ── Coğrafi referans nasıl bulundu ────────────────────────────────────────────
 * Altı SVG de 2202×2091 viewBox kullanıyor, ama içlerindeki çizim alanı ölçüldüğünde
 * tam 1999×1909 piksel çıkıyor ve viewBox'a ortalanmış. Bu, georef tablosundaki
 * "YENİ" sütununun 2001×1924 ölçüsüyle örtüşüyor — yani bu dosyalar, YENİ planın
 * kenarlarına ~100 piksel boşluk eklenmiş hâli. Referans, YENİ'nin coğrafi merkezi
 * (41.2626905, 28.7425035) ve yer çözünürlüğü (0.6387 m/piksel) viewBox kenarlarına
 * genişletilerek kuruldu; ölçek izotropiktir, plan en-boy oranını birebir korur.
 *
 * Bağımsız doğrulama: OSM'deki IST terminal binası (way/687768729) sınırları
 * K 41.268166 / G 41.257181 / B 28.734946 / D 28.750060. Türetilen çizim alanı kutusu
 * bununla ~8 m içinde örtüşüyor. Tablodaki "georef" bloğu ise ~26 m güneydoğuya
 * kayıktır (haritada plan yola/aprona sarkıyor), "ESKİ" sütunu %7 büyük ölçektedir.
 *
 * ── Kat başına piksel kayması (dx/dy) ────────────────────────────────────────
 * Dosyaların kök katman translate değerleri birbirinden farklı, bu yüzden aynı
 * fiziksel nokta her dosyada aynı pikselde değil. Ölçülen çizim alanı sol-üst köşesi
 * referans (ET/FT ≈ 101.5, 91) alınıp fark kadar sınır ötelenir.
 *
 * ── Birim seçimi ─────────────────────────────────────────────────────────────
 * ID* şekiller yalnızca Shop / Food / Other / Control / Building / Walking / Water /
 * layer1 katmanlarında bulunuyor. Building ve Walking bina kütlesi ve koridordur:
 * adreslenebilir birim değildirler, dahil edilirlerse "en yakın birim" mağaza yerine
 * koridoru döndürür. Bu yüzden yalnızca Shop / Food / Other / Control alınır.
 *
 * Birim adları SVG'de gömülü DEĞİL: etiketlerin çoğu "IDEP01_1_" gibi yer tutucudur
 * ve çalışma zamanında doldurulur. Statik etiketler (kapı kodları, "Pasaport Kontrol",
 * "Yemek Alanı"…) konumsal eşleme ile ada dönüştürülür; eşleşmeyen birimler kendi
 * kimliğiyle kalır.
 */
(function () {
    'use strict';

    var VB = { w: 2202, h: 2091 };

    // YENİ sütunundan: kırpılmış planın coğrafi merkezi ve yer çözünürlüğü
    var CENTER = { lat: 41.2626905, lng: 28.7425035 };
    var M_PER_PX = 0.63875;

    // Kat kodları ve çizim alanı sol-üst köşesinin referanstan piksel farkı
    var PLAN_FLOORS = [
        { code: 'ET', floor: -1, name: 'ET', dx: 0,     dy: 0 },
        { code: 'D',  floor: 0,  name: 'D',  dx: 0,     dy: 0 },
        { code: 'EP', floor: 1,  name: 'EP', dx: 7.5,   dy: -6 },
        { code: 'FP', floor: 2,  name: 'FP', dx: -11.5, dy: -3 },
        { code: 'FT', floor: 3,  name: 'FT', dx: 0.5,   dy: 0 },
        { code: 'H',  floor: 4,  name: 'H',  dx: 0,     dy: 0 }
    ];

    // Birimlerin çoğunun adı SVG'de yok (etiketler çalışma zamanında doldurulur).
    // Adsız kalanlar için katman en azından birimin türünü söyler; "IDFT163" yerine
    // "Mağaza" göstermek kullanıcıya bilgi verir.
    var LAYER_NAMES = {
        Shop: 'Mağaza',
        Food: 'Yeme-içme',
        Control: 'Kontrol noktası',
        Other: 'Birim'
    };

    function mPerDegLat(lat) {
        var r = lat * Math.PI / 180;
        return 111132.92 - 559.82 * Math.cos(2 * r) + 1.175 * Math.cos(4 * r);
    }
    function mPerDegLng(lat) {
        var r = lat * Math.PI / 180;
        return 111412.84 * Math.cos(r) - 93.5 * Math.cos(3 * r);
    }

    /** Merkez + m/piksel değerinden viewBox'ın tamamını kapsayan sınırlar. */
    function boundsFromScale(center, mPerPx) {
        var halfW = (VB.w * mPerPx) / 2 / mPerDegLng(center.lat);
        var halfH = (VB.h * mPerPx) / 2 / mPerDegLat(center.lat);
        return {
            north: center.lat + halfH, south: center.lat - halfH,
            east: center.lng + halfW, west: center.lng - halfW
        };
    }

    var REFERENCE_BOUNDS = boundsFromScale(CENTER, M_PER_PX);

    /** Katın kendi çizim kayması kadar ötelenmiş sınırları. */
    function shiftBounds(bounds, dx, dy) {
        var dLng = (dx || 0) * (bounds.east - bounds.west) / VB.w;
        var dLat = (dy || 0) * (bounds.north - bounds.south) / VB.h;
        return {
            north: bounds.north + dLat, south: bounds.south + dLat,
            east: bounds.east - dLng, west: bounds.west - dLng
        };
    }

    /**
     * Eklentiye verilecek floorPlans yapılandırmasını üretir.
     * @param {Object} [opts.bounds] Referans sınırları geçersiz kıl (kalibrasyon için)
     * @param {string} [opts.basePath] SVG dizini (varsayılan 'demo/plans/')
     */
    function buildFloorPlans(opts) {
        opts = opts || {};
        var base = opts.bounds || REFERENCE_BOUNDS;
        var path = opts.basePath != null ? opts.basePath : 'demo/plans/';

        return {
            bounds: base,
            unitSelector: 'path,rect,polygon,polyline',
            unitIdPattern: /^ID/,
            includeLayers: opts.includeLayers || ['Shop', 'Food', 'Other', 'Control'],
            nameFromLabels: true,
            layerNames: LAYER_NAMES,
            // Havalimanı içinde birimler yoğun; 60 m'den uzak bir birimi "en yakın"
            // diye sunmak yanıltıcı olur
            maxDistance: opts.maxDistance != null ? opts.maxDistance : 60,
            floors: PLAN_FLOORS.map(function (f) {
                return {
                    floor: f.floor,
                    name: f.name,
                    svg: path + f.code + '.svg',
                    bounds: shiftBounds(base, f.dx, f.dy)
                };
            })
        };
    }

    window.IST_FLOOR_PLANS = {
        viewBox: VB,
        center: CENTER,
        mPerPx: M_PER_PX,
        referenceBounds: REFERENCE_BOUNDS,
        planFloors: PLAN_FLOORS,
        layerNames: LAYER_NAMES,
        boundsFromScale: boundsFromScale,
        shiftBounds: shiftBounds,
        build: buildFloorPlans
    };
})();
