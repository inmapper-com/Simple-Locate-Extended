/*
 * Leaflet.SimpleLocate Extended v1.4.0 - 2026-06-16
 *
 * Based on original work by mfhsieh (v1.0.5)
 * Extended with Wei Ye filtering, Geofence, Indoor optimizations,
 * PDR (dead reckoning), altitude/floor detection, control panel.
 *
 * Licensed under the MIT license.
 *
 * Original: https://github.com/mfhsieh/leaflet-simple-locate
 *
 */

// =====================================================
// CSS AUTO-INJECT - Plugin yüklendiğinde CSS otomatik eklenir
// =====================================================
(function() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('leaflet-simple-locate-styles')) return;

    var css = `
/* Leaflet.SimpleLocate Styles - Auto-injected */
:root {
    --primary-rgb: 51, 51, 51;
    --leaflet-simple-locate-orientation: 0deg;
    --leaflet-simple-locate-circle-display: inline;
}

/* Firefox fix */
@-moz-document url-prefix() {
    .leaflet-simple-locate .fa,
    .leaflet-simple-locate .fab,
    .leaflet-simple-locate .far,
    .leaflet-simple-locate .fas {
        margin-top: .05rem;
        margin-bottom: -.05rem;
    }
}

/* Ana buton stili - Circular */
.leaflet-simple-locate {
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: 2.5rem;
    height: 2.5rem;
    padding: 0;
    margin: 0;
    font-size: 1.375rem;
    color: rgba(var(--primary-rgb), 1);
    background-color: rgba(255, 255, 255, 1) !important;
    border: none !important;
    border-radius: 2.5rem;
    box-shadow: rgba(0, 0, 0, .2) 0 1px 4px;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    text-size-adjust: none;
    -webkit-text-size-adjust: none;
}

.leaflet-simple-locate:active {
    background-color: #f0f0f0 !important;
}

.leaflet-simple-locate:active svg {
    fill: rgba(var(--primary-rgb), 1);
}

.leaflet-simple-locate:focus {
    outline: none;
}

.leaflet-simple-locate:focus-visible {
    outline: none;
}

.leaflet-simple-locate svg {
    fill: rgba(var(--primary-rgb), 1);
    width: 1.375rem;
    height: 1.375rem;
}

/* Konum ikonu stili */
.leaflet-simple-locate-icon {
    fill: rgba(var(--primary-rgb), 1);
    pointer-events: none !important;
    cursor: grab;
    background: transparent !important;
    border: none !important;
}

.leaflet-simple-locate-icon stop {
    stop-color: rgba(var(--primary-rgb), 1);
}

.leaflet-simple-locate-icon .orientation {
    transform: rotate(calc(-1 * var(--leaflet-simple-locate-orientation, 0deg)));
}

/* Doğruluk dairesi stili */
.leaflet-simple-locate-circle {
    display: var(--leaflet-simple-locate-circle-display);
    fill: rgba(var(--primary-rgb), 1);
    fill-opacity: .1;
    stroke: rgba(var(--primary-rgb), 1);
    stroke-width: 1;
    stroke-opacity: .3;
    pointer-events: none !important;
    cursor: grab;
}

/* Yön göstergesi */
.leaflet-simple-locate-orientation {
    transform: rotate(var(--leaflet-simple-locate-orientation, 0deg));
}

#leaflet-simple-locate-icon-spot {
    pointer-events: auto;
    cursor: pointer;
}

/* Spinner animasyonu */
.leaflet-simple-locate svg g {
    transform-origin: center;
}

/* Extended plugin kontrolleri */
.leaflet-control-simplelocate-settings,
.leaflet-control-weiYe-info {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.leaflet-control-simplelocate-settings button:hover {
    background: #e0e0e0 !important;
}

/* Responsive ayarlar */
@media (max-width: 480px) {
    .leaflet-simple-locate {
        width: 2.75rem;
        height: 2.75rem;
    }
    
    .leaflet-simple-locate svg {
        width: 1.5rem;
        height: 1.5rem;
    }
}
`;

    var style = document.createElement('style');
    style.id = 'leaflet-simple-locate-styles';
    style.type = 'text/css';
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
})();

// =====================================================
// PLUGIN CORE
// =====================================================
(function (factory) {

    if (typeof define === 'function' && define.amd) {  // eslint-disable-line no-undef
        // define an AMD module that relies on 'leaflet'
        define(['leaflet'], factory);  // eslint-disable-line no-undef

    } else if (typeof exports === 'object') {
        // define a Common JS module that relies on 'leaflet'
        module.exports = factory(require('leaflet'));  // eslint-disable-line no-undef

    } else if (typeof window !== 'undefined') {
        // attach your plugin to the global 'L' variable
        if (typeof window.L === "undefined") throw "Leaflet must be loaded first.";
        window.L.Control.SimpleLocate = factory(window.L);
    }
})(function (L) {
    "use strict";

    const SimpleLocate = L.Control.extend({
        options: {
            className: "",
            title: "Locate Geolocation and Orientation",
            ariaLabel: "",

            minAngleChange: 3,
            orientationSmoothing: 5,        // Yön yumuşatma için örnek sayısı (jitter azaltma)
            orientationUpdateInterval: 100, // Yön kaynaklı marker/callback güncellemesi min aralığı (ms, ~10Hz)
            gimbalLockThreshold: 70,        // Beta açısı bu değeri aşınca gimbal lock koruması aktif (derece)
            // ── Jiroskop / tamamlayıcı filtre (heading füzyonu) ──
            // Pusula (uzun vadeli, manyetik bozulmaya açık) + jiroskop (kısa vadeli, sürüklenir)
            // birleştirilir: jiroskop dönüşü kısa vadede takip eder, pusula yavaşça düzeltir.
            // Yalnızca devicemotion aktifken (PDR sırasında) ve jiroskop verisi tazeyken çalışır;
            // aksi halde saf pusulaya döner. GÜVENLİK: füzyon pusuladan
            // headingGyroMaxDivergence'tan fazla ayrılırsa otomatik pusulaya kilitlenir.
            headingGyroFusion: true,        // Jiroskop füzyonu aktif
            headingGyroSign: -1,            // rotationRate.alpha → heading işaret düzeltmesi (+1/-1)
            headingCompassCorrection: 0.1,  // Her pusula örneğinde pusulaya çekme oranı (0-1)
            headingGyroMaxDivergence: 25,   // Bu açıyı (derece) aşınca pusulaya kilitlen (güvenlik)
            // ── A1: Otomatik jiroskop işaret tespiti ──
            // Pusula belirgin döndüğünde jiroskop entegralinin işareti pusulayla uyuşuyor mu
            // diye oy toplar; tutarlı uyumsuzlukta headingGyroSign'ı otomatik ters çevirir.
            // Cihazlar arası "ok ters dönüyor" riskini ortadan kaldırır. GPS gerekmez.
            headingGyroAutoSign: true,
            // ── A3: GPS gidiş yönü (course) ile heading düzeltme ──
            // Dış mekanda hareket halinde GPS yönü pusuladan güvenilirdir; manyetik
            // bozulma kaynaklı heading hatasını düzeltir ve oku seyahat yönüne çeker.
            headingUseGpsCourse: true,
            gpsCourseMinSpeed: 1.2,         // m/s — altında GPS yönü güvenilmez (duruş/gürültü)
            gpsCourseMaxAccuracy: 25,       // m — bundan kötü konumda GPS yönü kullanılmaz
            gpsCourseCorrection: 0.2,       // Heading'i GPS yönüne çekme oranı (0-1)
            clickTimeoutDelay: 500,

            setViewAfterClick: true,
            zoomLevel: undefined,
            drawCircle: true,

            // Wei Ye algoritması için optimal default parametreler
            medianWindowSize: 3,          // Median filtre pencere boyutu (hızlı tepki)
            kalmanProcessNoise: 0.05,     // Kalman Q değeri (dengeli)
            kalmanMeasurementNoise: 0.2,  // Kalman R değeri (orta güven)
            jumpThreshold: 0.0005,        // Ani sıçrama tespit eşiği
            enableFiltering: true,        // Filtreleme aktif
            lowPassFilterTau: 0.5,        // Low Pass tau (hızlı tepki)
            enableLowPassFilter: true,    // Low Pass aktif

            // ========== İÇ MEKAN KONUM İYİLEŞTİRMELERİ ==========
            
            // Geofence (Coğrafi Sınırlama) - Bina sınırları
            enableGeofence: true,         // Geofence aktif
            geofenceBounds: null,         // [[minLat, minLng], [maxLat, maxLng]] formatında
            geofenceCenter: null,         // [lat, lng] - Bina merkezi
            geofenceRadius: null,         // metre cinsinden maksimum mesafe
            geofencePolygon: null,        // [{lat, lng}, ...] - Gerçek polygon köşeleri (ÖNCELİKLİ)
            
            // Konum Güvenilirlik Sistemi
            maxAcceptableAccuracy: 100,   // Bu değerin üstündeki accuracy'ler reddedilir (metre)
            minAcceptableAccuracy: 5,     // Bu değerin altındaki accuracy'ler çok güvenilir kabul edilir
            
            // Hız Bazlı Sıçrama Tespiti
            maxHumanSpeed: 5,             // Maksimum insan yürüyüş hızı (m/s) - ~18 km/h
            maxIndoorSpeed: 6,            // İç mekanda maks hız (m/s) — multipath teleportda
                                          // last-good'a düşmeyi azaltmak için 3'ten yükseltildi
            
            // Son İyi Konum Fallback
            enableLastGoodLocation: true, // Kötü konum geldiğinde son iyi konumu kullan
            lastGoodLocationTimeout: 30000, // Son iyi konum ne kadar süre geçerli (ms)
            maxConsecutiveBadLocations: 5, // Kaç kötü konum sonrası zorla güncelle
            fallbackHysteresisMs: 2500,   // Gerçek ↔ fallback görünümü arası geçiş için kararlılık süresi (ms)
                                          // (geofence sınırında salınan filtrelenmiş konumun mod titretmesini engeller)
            
            // İç Mekan Optimizasyonları (yürürken lag azaltmak için daha hafif varsayılanlar)
            indoorMode: true,             // İç mekan modu aktif
            indoorMedianWindowSize: 3,    // İç mekan median tabanı (yürürken ≤3 tutulur)
            indoorKalmanR: 0.25,          // İç mekan Kalman R tabanı (ölçüme daha hızlı güvenir)
            indoorLowPassTau: 0.4,        // İç mekan low-pass tau (daha hızlı tepki)
            
            // ── Açılış (cold-start) kapısı ──
            // İlk geofence-içi fix kapıya yapışıp last-good/Kalman'ı zehirlemesin diye:
            // birkaç tutarlı, yeterince iyi accuracy'li fix gelene kadar GERÇEK KONUM gösterme;
            // last-good yazmayı da kısa süre ertele.
            coldStartGate: true,
            coldStartMaxAccuracy: 35,     // Açılışta kabul için maks accuracy (m)
            coldStartMinFixes: 3,         // Kaç tutarlı içeride fix gerekir
            coldStartConsistentDistance: 45, // Adaylar birbirinden en fazla bu kadar uzak olabilir (m)
            coldStartLastGoodDelayMs: 8000,  // Oturum başından bu süre last-good yazma
            coldStartTimeoutMs: 20000,    // Bu süre dolunca kapıyı zorla aç (sonsuz bekleme olmasın)
            
            // Konum Geçerleme
            enablePositionValidation: true, // Konum doğrulama aktif
            
            // ========== RENK ÖZELLEŞTİRME ==========
            markerColor: '#000000',         // Marker iç nokta rengi
            markerRingColor: '#ffffff',     // Marker dış halka rengi
            markerShadowColor: '#000000',   // Marker gölge rengi
            orientationColor: '#c00000',    // Yön oku üst kısım rengi
            circleColor: '#000000',         // Accuracy circle rengi
            circleFillOpacity: 0.2,         // Circle dolgu opaklığı
            circleStrokeOpacity: 0.5,       // Circle çizgi opaklığı
            
            // ========== FALLBACK MARKER FADE ==========
            fadeMarkerOnFallback: true,     // Geofence dışı / PDR / son iyi konum durumunda marker'ı değiştir
            fallbackMarkerOpacity: 0.45,    // Silikleştirilmiş marker opacity değeri (0-1)
            fallbackMarkerColor: '#9E9E9E', // Fallback durumunda marker iç nokta rengi
            fallbackOrientationColor: '#9E9E9E', // Fallback durumunda yön oku rengi
            
            // ========== PEDESTRIAN DEAD RECKONING (PDR) ==========
            enableDeadReckoning: false,     // PDR varsayılan kapalı (kullanıcı açabilir)
            pdrStepLength: 0.65,            // Ortalama adım uzunluğu (metre)
            pdrStepThreshold: 0.8,          // High-pass ivme zirvesi için eşik (m/s²) - adaptif baz değeri
                                            // (iOS saha logları: yürüyüş zirveleri 0.73-0.99 aralığında
                                            //  başlıyor; 1.0 başlangıç eşiği ilk ~6 sn adımları kaçırıyordu)
            pdrStepCooldown: 300,           // İki adım arası minimum süre (ms)
            pdrMinPeakValue: 0.7,           // Zirvenin minimum büyüklüğü (çok küçük zirveleri reddet)
            pdrAdaptiveThreshold: true,     // Dinamik eşik kullan
            pdrMaxDuration: 300000,         // PDR maksimum aktif süresi (ms) - 5 dakika (yürüyüş ortası kesilmesin)
            pdrMaxSteps: 100,               // PDR ile maksimum adım sayısı
            pdrAccuracyDecay: 0.5,          // Her adımda accuracy ne kadar artar (metre)
            pdrInitialAccuracy: 5,          // PDR başlangıç accuracy (metre)
            // ── Dinamik adım uzunluğu (Weinberg modeli) ──
            // Sabit adım uzunluğu yerine her adımın ivme genliğinden uzunluk kestirir:
            //   stepLength = K · ⁴√(a_max − a_min)
            // Hızlı/yavaş yürüyüşte mesafe doğruluğunu belirgin artırır. Kapalıyken
            // pdrStepLength sabit değeri kullanılır (eski davranış).
            pdrDynamicStepLength: true,     // Dinamik adım uzunluğu aktif
            pdrStepLengthFactor: 0.5,       // Weinberg K katsayısı (cihaza göre kalibre edilebilir)
            pdrStepLengthMin: 0.4,          // Alt sınır (m) - saçma küçük değerleri engeller
            pdrStepLengthMax: 0.9,          // Üst sınır (m) - saçma büyük değerleri engeller
            // ── PDR→GPS yumuşak yeniden giriş ──
            // İç mekan sinyali geri gelince konum, sürüklenmiş PDR tahmininden gerçek GPS'e
            // tek seferde sıçramak yerine birkaç güncellemede yumuşakça yaklaşır.
            pdrReentrySmoothing: true,      // Yumuşak yeniden giriş aktif
            pdrReentryBlend: 0.5,           // Her GPS güncellemesinde hedefe yaklaşma oranı (0-1)
            pdrReentrySnapDistance: 2,      // Bu mesafenin altına inince doğrudan otur (m)
            // ── B1: ZUPT (duruş tespiti) ──
            // Cihaz hareketsizken (sinyal varyansı düşük) adım algılamayı bastırır;
            // ayakta beklerken titreşimden doğan "hayalet adım/sürüklenme"yi keser.
            pdrZupt: true,
            pdrZuptVariance: 0.04,          // (m/s²)² — bu varyansın altı = duruş
            pdrZuptWindow: 16,              // Varyans penceresi (örnek sayısı)
            // ── A2: Otomatik adım uzunluğu (K) kalibrasyonu ──
            // Her PDR oturumu bitince (sinyal geri gelince) baş↔son GPS düz mesafesini
            // PDR yol uzunluğuyla kıyaslar; düz yürüyüşte K katsayısını kişiye/cihaza
            // göre öğrenir. Sınırlı ve yumuşak güncellenir (ani sapma yapmaz).
            pdrAutoCalibrate: true,
            pdrCalibrateMinSteps: 8,        // Kalibrasyon için min adım sayısı
            pdrCalibrateMaxHeadingVar: 25,  // derece — fazla dönüş varsa örnek reddedilir (düz şart)
            pdrCalibrateBlend: 0.3,         // Yeni K'ya yaklaşma oranı (0-1)
            pdrStepLengthFactorMin: 0.3,    // K alt sınırı
            pdrStepLengthFactorMax: 0.8,    // K üst sınırı
            // ── C2: Deneysel füzyon (test için TEK toggle, varsayılan KAPALI) ──
            // Açıkken: (a) sabit-hız Kalman modeli (yürürken gecikmeyi azaltır),
            //          (b) GPS/PDR sınırında güven ağırlıklı yumuşak harman.
            // Riskli olduğundan opt-in; kapalıyken mevcut davranış birebir korunur.
            experimentalFusion: false,
            // ── Performans ──
            // devicemotion işleme üst sınırı (Hz). 0 = sınırsız (mevcut davranış).
            // Düşük güçlü cihazlarda 30-40 önerilir; adım sinyali ~2 Hz olduğundan
            // 30+ Hz tespiti etkilemez ama CPU/pil yükünü düşürür.
            motionUpdateHz: 0,
            
            // ========== ALTITUDE NORMALİZASYON & KAT TESPİTİ ==========
            enableAltitude: false,          // Altitude işleme aktif (varsayılan kapalı)
            
            // Geoid ondülasyonu: Elipsoid (WGS84) ile MSL arasındaki fark
            // Android ham GPS altitude = elipsoid yüksekliği → MSL'e çevirmek için N çıkarılır
            // iOS zaten MSL döndürür → düzeltme gerekmez
            // Türkiye ortalaması ~36-40m, bölgeye göre ayarlanmalı
            // https://geographiclib.sourceforge.io/cgi-bin/GeoidEval adresinden bulunabilir
            geoidUndulation: 37.0,          // metre - Bina konumu için geoid ondülasyonu (N)
            
            // Altitude filtreleme
            altitudeFilterEnabled: true,    // Altitude değerini filtrele (gürültü azaltma)
            altitudeMedianWindow: 5,        // Altitude median filtre pencere boyutu
            altitudeLowPassTau: 2.0,        // Altitude low-pass filtre tau (yavaş değişim)
            altitudeMaxDelta: 10,           // Tek adımda max kabul edilebilir altitude değişimi (m)
            altitudeMinAccuracy: 20,        // Bu değerin üstündeki altitudeAccuracy reddedilir (m)
            
            // Kat tespiti
            enableFloorDetection: false,    // Kat tespiti aktif
            floorHeight: 3.0,              // Kat yüksekliği (metre) - standart bina
            groundFloorAltitude: null,      // Zemin kat rakımı (MSL metre) - KALİBRASYON GEREKLİ
            groundFloorNumber: 0,           // Zemin kat numarası (0 veya 1)
            floorHysteresis: 0.8,           // Kat değişimi için histerezis (metre) - titreşimi engeller
            floors: null,                   // Manuel kat tanımları: [{floor: 0, name: "Zemin", minAlt: 1050, maxAlt: 1053}, ...]

            afterClick: null,
            afterMarkerAdd: null,
            afterDeviceMove: null,

            htmlInit: `
<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
	<path d="M 8,1.5 A 6.5,6.5 0 0 0 1.5,8 6.5,6.5 0 0 0 8,14.5 6.5,6.5 0 0 0 14.5,8 6.5,6.5 0 0 0 8,1.5 Z m 0,2 A 4.5,4.5 0 0 1 12.5,8 4.5,4.5 0 0 1 8,12.5 4.5,4.5 0 0 1 3.5,8 4.5,4.5 0 0 1 8,3.5 Z" />
	<rect width="1.5" height="4" x="7.25" y="0.5" rx="0.5" ry="0.5" />
	<rect width="1.5" height="4" x="7.25" y="11.5" rx="0.5" ry="0.5" />
	<rect width="4" height="1.5" x="0.5" y="7.25" rx="0.5" ry="0.5" />
	<rect width="4" height="1.5" x="11.5" y="7.25" ry="0.5" rx="0.5" />
	<circle cx="8" cy="8" r="1" />
</svg>`,
            htmlSpinner: `
<svg width="16" height="16" viewBox="-8 -8 16 16" xmlns="http://www.w3.org/2000/svg">
	<g>
		<circle opacity=".7" cx="0" cy="-6" r=".9" transform="rotate(90)" />
		<circle opacity=".9" cx="0" cy="-6" r="1.3" transform="rotate(45)" />
		<circle opacity="1" cx="0" cy="-6" r="1.5" />
		<circle opacity=".95" cx="0" cy="-6" r="1.42" transform="rotate(-45)" />
		<circle opacity=".85" cx="0" cy="-6" r="1.26" transform="rotate(-90)" />
		<circle opacity=".7" cx="0" cy="-6" r="1.02" transform="rotate(-135)" />
		<circle opacity=".5" cx="0" cy="-6" r=".7" transform="rotate(-180)" />
		<circle opacity=".25" cx="0" cy="-6" r=".3" transform="rotate(-225)" />
		<animateTransform attributeName="transform" type="rotate" values="0;0;45;45;90;90;135;135;180;180;225;225;270;270;315;315;360" keyTimes="0;.125;.125;.25;.25;.375;.375;.5;.5;.675;.675;.75;.75;.875;.875;1;1" dur="1.3s" repeatCount="indefinite" />
	</g>
</svg>`,
            htmlGeolocation: `
<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
	<path d="M 13.329384,2.6706085 C 13.133096,2.4743297 12.77601,2.4382611 12.303066,2.6103882 L 6.6307133,4.6742285 1.1816923,6.6577732 C 1.0668479,6.6995703 0.95157337,6.752486 0.83540381,6.8133451 0.27343954,7.1201064 0.41842508,7.4470449 1.2644998,7.5962244 l 6.0688263,1.0701854 1.0714872,6.0698222 c 0.1491847,0.84604 0.4751513,0.990031 0.7816575,0.427825 0.060857,-0.116165 0.1137803,-0.231436 0.1555779,-0.346273 L 11.324426,9.3702482 13.389608,3.6968841 C 13.56174,3.2239596 13.52567,2.8668883 13.329392,2.6706094 Z" />
</svg>`,
            htmlOrientation: `
<svg class="leaflet-simple-locate-orientation" width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
	<path fill="#c00000" d="M 8,0 C 7.7058986,0 7.4109021,0.30139625 7.1855469,0.90234375 L 5.3378906,5.8300781 C 5.2559225,6.0486598 5.1908259,6.292468 5.1386719,6.5507812 6.0506884,6.193573 7.0205489,6.0068832 8,6 8.9768002,6.0005071 9.945249,6.1798985 10.857422,6.5292969 10.805917,6.2790667 10.741782,6.0425374 10.662109,5.8300781 L 8.8144531,0.90234375 C 8.5890978,0.30139615 8.2941007,0 8,0 Z" />
	<path d="M 8,5.9999998 C 7.0205501,6.006884 6.0506874,6.1935733 5.138672,6.5507817 4.9040515,7.7126196 4.9691485,9.1866095 5.3378906,10.169922 l 1.8476563,4.927734 c 0.4507105,1.201895 1.1781958,1.201894 1.628906,0 L 10.662109,10.169922 C 11.033147,9.1804875 11.097283,7.6944254 10.857422,6.5292967 9.9452497,6.1798989 8.9767993,6.0005076 8,5.9999998 Z m -1e-7,0.7499999 A 1.25,1.258 90 0 1 9.2578124,7.9999996 1.25,1.258 90 0 1 8,9.2500001 a 1.25,1.258 90 0 1 -1.2578124,-1.25 1.25,1.258 90 0 1 1.2578123,-1.2500004 z" />
</svg>`,
            iconGeolocation: L.divIcon({
                html: `
<svg width="24" height="24" viewBox="-12 -12 24 24" xmlns="http://www.w3.org/2000/svg">
	<defs>
		<filter id="gaussian">
			<feGaussianBlur stdDeviation="0.5" />
		</filter>
	</defs>
	<g id="leaflet-simple-locate-icon-spot">
		<circle fill="#000000" style="opacity:0.3;filter:url(#gaussian)" cx="1" cy="1" r="10" />
		<circle fill="#ffffff" r="10" />
		<circle r="6">
			<animate attributeName="r" values="6;8;6" dur="2s" repeatCount="indefinite" />
		</circle>
	</g>
</svg>`,
                className: "leaflet-simple-locate-icon",
                iconSize: [24, 24],
                iconAnchor: [12, 12],
            }),
            iconOrientation: L.divIcon({
                html: `
<svg width="96" height="96" viewBox="-48 -48 96 96" xmlns="http://www.w3.org/2000/svg">
	<defs>
		<linearGradient id="gradient" x2="0" y2="-48" gradientUnits="userSpaceOnUse">
			<stop style="stop-opacity:1" offset="0" />
			<stop style="stop-opacity:0" offset="1" />
		</linearGradient>
		<filter id="gaussian">
			<feGaussianBlur stdDeviation="0.5" />
		</filter>
	</defs>
	<path class="orientation" opacity="1" style="fill:url(#gradient)" d="M -24,-48 H 24 L 10,0 H -10 z">
		<animate attributeName="opacity" values=".75;.33;.75" dur="2s" repeatCount="indefinite" />
	</path>
	<g id="leaflet-simple-locate-icon-spot">
		<circle fill="#000000" style="opacity:0.3;filter:url(#gaussian)" cx="1" cy="1" r="10" />
		<circle fill="#ffffff" r="10" />
		<circle r="6">
			<animate attributeName="r" values="6;9;6" dur="2s" repeatCount="indefinite" />
		</circle>
	</g>
</svg>`,
                className: "leaflet-simple-locate-icon",
                iconSize: [96, 96],
                iconAnchor: [48, 48],
            }),
        },

        initialize: function (options) {
            L.Util.setOptions(this, options);

            // Kat tanımları verildiyse tutarlılığını doğrula (çakışma/boşluk uyarısı)
            if (this.options.floors) {
                this._validateFloors(this.options.floors);
            }

            // map related
            this._map = undefined;
            this._button = undefined;
            this._marker = undefined;
            this._circle = undefined;
            this._circleStyleInterval = undefined;
            this._isZooming = false;

            // button state
            this._clicked = undefined;
            this._geolocation = undefined;
            this._orientation = undefined;
            this._clickTimeout = undefined;

            // geolocation and orientation
            this._latitude = undefined;
            this._longitude = undefined;
            this._accuracy = undefined;
            this._angle = undefined;
            this._orientationSamples = [];    // Yön yumuşatma için son N örnek
            this._lastOrientationTime = 0;    // Son yön güncellemesi zamanı
            this._orientationCalibrated = false; // Kalibrasyon durumu
            this._lastReliableHeading = undefined; // Gimbal lock öncesi son güvenilir yön
            this._inGimbalLockZone = false;   // Gimbal lock bölgesinde mi
            // Jiroskop/tamamlayıcı filtre durumu
            this._fusedHeading = null;        // Füzyonlanmış heading (jiroskop + pusula)
            this._lastGyroTime = 0;           // Son jiroskop örneği zamanı (tazelik kontrolü)
            // A1: jiroskop işaret oylaması (pusula↔jiro dönüş uyumu)
            this._gyroAccumSinceCompass = 0;  // son pusula örneğinden beri ham jiro entegrali (°)
            this._lastCompassForSign = null;  // işaret oylaması için son pusula açısı
            this._gyroSignDisagree = 0;       // ardışık uyumsuz oy sayacı
            // A3: GPS gidiş yönü (course) durumu
            this._gpsHeading = null;          // güvenilir son GPS yönü (°)
            this._gpsHeadingTime = 0;         // GPS yönü zaman damgası
            this._gpsSpeed = null;            // son GPS hızı (m/s)
            // Perf: devicemotion throttle son işlem zamanı
            this._lastMotionProcess = 0;

            this._lowPassFilterLat = null;
            this._lowPassFilterLng = null;
            this._lowPassFilterInitialized = false;
            
            // iOS tespiti
            this._isIOS = this._detectIOS();

            // Median Filtre için özellikleri ekle
            this._medianFilter = {
                windowSize: this.options.medianWindowSize,
                latHistory: [],
                lngHistory: [],
                accuracyHistory: [],
                timestampHistory: []
            };

            // Kalman Filtresi için özellikleri ekle
            this._kalmanFilter = {
                Q_lat: this.options.kalmanProcessNoise,
                Q_lng: this.options.kalmanProcessNoise,
                R_lat: this.options.kalmanMeasurementNoise,
                R_lng: this.options.kalmanMeasurementNoise,
                x_lat: null, // Durum tahmini (enlem)
                x_lng: null, // Durum tahmini (boylam)
                P_lat: null, // Tahmin hatası kovaryansı (enlem)
                P_lng: null, // Tahmin hatası kovaryansı (boylam)
                // C2 (deneysel) sabit-hız modeli durumu
                v_lat: 0, v_lng: 0,    // hız (derece/sn)
                cvTime: null           // son ölçüm zamanı (dt için)
            };

            // Wei Ye algoritması durumunu takip etmek için özellikler
            this._weiYeState = {
                lastFilteredPosition: null,
                lastRawPosition: null,
                isJumpDetected: false,
                filteringStats: {
                    totalUpdates: 0,
                    jumpsDetected: 0,
                    maxJumpDistance: 0
                }
            };

            // Hareket tespiti için ayrı geçmiş (HAM GPS — LPF çıktısından değil;
            // aksi halde lag'li konum "hareketsiz" sanılıp yumuşatma kısır döngüsü oluşur)
            this._movementHistory = {
                positions: [],
                timestamps: [],
                maxSize: 5 // Son 5 konumu tut
            };

            // ========== İÇ MEKAN İYİLEŞTİRMELERİ - YENİ STATE ==========
            
            // Son bilinen iyi konum
            this._lastGoodLocation = {
                latitude: null,
                longitude: null,
                accuracy: null,
                timestamp: null,
                confidence: 0 // 0-100 arası güvenilirlik skoru
            };
            
            // Kötü konum sayacı
            this._consecutiveBadLocations = 0;

            // Konum oturumu / açılış kapısı
            this._locateSessionStart = null;
            this._coldStart = {
                ready: false,
                candidates: []
            };
            
            // Konum geçmişi (hız hesaplaması için)
            this._locationHistory = {
                positions: [],
                timestamps: [],
                accuracies: [],
                maxSize: 10
            };
            
            // Konum istatistikleri
            this._locationStats = {
                totalLocations: 0,
                rejectedLocations: 0,
                geofenceRejections: 0,
                speedRejections: 0,
                accuracyRejections: 0,
                fallbackUsed: 0
            };
            
            // Geofence cache (hesaplama optimizasyonu)
            this._geofenceCache = {
                isInside: null,
                lastCheck: null,
                checkInterval: 1000 // 1 saniye
            };
            
            // ========== ALTITUDE & KAT TESPİTİ STATE ==========
            this._altitude = {
                raw: null,                  // Ham altitude (platformdan gelen)
                normalized: null,           // Normalize edilmiş altitude (MSL)
                filtered: null,             // Filtrelenmiş altitude
                accuracy: null,             // Altitude accuracy
                floor: null,                // Tespit edilen kat numarası
                floorName: null,            // Kat adı
                medianBuffer: [],           // Median filtre buffer'ı
                lowPassFilter: null,        // LowPass filtre instance'ı
                lastStableFloor: null,      // Son kararlı kat (histerezis için)
                floorChangeTime: 0,         // Son kat değişim zamanı
                sampleCount: 0,             // Toplam altitude örneği sayısı
                platform: null              // Tespit edilen platform ('ios' | 'android' | 'unknown')
            };
            
            // ========== FALLBACK LOCATION STATE ==========
            this._isFallbackLocation = false;
            // Histerezis durumu: state = onaylanmış görünüm, candidate = bekleyen aday geçiş
            this._fallbackHysteresis = { state: false, candidate: null, since: 0 };
            // PDR→GPS yumuşak yeniden giriş durumu
            this._reentry = { active: false, lat: null, lng: null };
            
            // ========== PEDESTRIAN DEAD RECKONING (PDR) STATE ==========
            this._pdr = {
                active: false,
                startTime: null,
                stepCount: 0,
                lastStepTime: 0,
                baseLatitude: null,
                baseLongitude: null,
                currentLatitude: null,
                currentLongitude: null,
                currentAccuracy: null,
                motionHandler: null,
                // ── Sinyal işleme ──
                accelSource: null,      // 'gravity' | 'linear' (oturum başına sabitlenir)
                gravityMag: null,       // yavaş EMA ile yerçekimi kestirimi
                linearBuf: [],          // küçük yumuşatma buffer'ı (3 örnek)
                // ── Zirve algılama (histerezis + refrakter) ──
                armed: false,
                peakValue: 0,
                valleyValue: 0,         // adım döngüsündeki en düşük sinyal (genlik için)
                armTime: 0,
                recentPeaks: [],
                dynamicThreshold: 0,
                // ── B1: ZUPT (duruş) ──
                zuptBuf: [],            // varyans penceresi
                stationary: false,      // şu an duruş halinde mi
                // ── A2: kalibrasyon ──
                pathLength: 0,          // bu oturumda kat edilen tahmini yol (m)
                headingSamples: [],     // adım yönleri (düz yürüyüş varyansı için)
                // ── Teşhis ──
                dbgSamples: 0,
                dbgMaxLinear: 0,
                dbgLastEmit: 0,
                dbgStepsAtEmit: 0
            };
        },
        
        // iOS tespit fonksiyonu
        _detectIOS: function() {
            if (typeof navigator === 'undefined') return false;
            
            const userAgent = navigator.userAgent || navigator.vendor || window.opera;
            
            // iOS cihazlarını tespit et
            return /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
        },

        // Median Filtreyi uygula
        _applyMedianFilter: function (position) {
            const m = this._medianFilter;
            const now = position.timestamp || Date.now();

            // iOS için özel düzeltme: Eğer timestamp çok eskiyse veya çok büyük bir sıçrama varsa,
            // geçmişi temizle ve yeni konumu kabul et
            if (m.timestampHistory.length > 0) {
                const lastTimestamp = m.timestampHistory[m.timestampHistory.length - 1];
                const timeDiff = Math.abs(now - lastTimestamp) / 1000; // saniye cinsinden

                // iOS'ta bazen timestamp'ler düzgün gelmeyebilir veya çok büyük gecikmeler olabilir
                // Eğer 30 saniyeden fazla geçtiyse ve büyük bir mesafe varsa, geçmişi temizle
                if (timeDiff > 30 && m.latHistory.length > 0) {
                    const lastLat = m.latHistory[m.latHistory.length - 1];
                    const lastLng = m.lngHistory[m.lngHistory.length - 1];
                    const distance = L.latLng(lastLat, lastLng).distanceTo(L.latLng(position.latitude, position.longitude));

                    if (distance > 50) {
                        // iOS'ta büyük bir sıçrama ve uzun gecikme varsa, geçmişi temizle
                        m.latHistory = [];
                        m.lngHistory = [];
                        m.accuracyHistory = [];
                        m.timestampHistory = [];

                    }
                }
            }

            // Görsel aykırı değerleri tespit etmek için uzaklığı ölç
            if (m.latHistory.length > 0) {
                const lastLat = m.latHistory[m.latHistory.length - 1];
                const lastLng = m.lngHistory[m.lngHistory.length - 1];
                const distance = L.latLng(lastLat, lastLng).distanceTo(L.latLng(position.latitude, position.longitude));

            }

            // Yeni değerleri geçmişe ekle
            m.latHistory.push(position.latitude);
            m.lngHistory.push(position.longitude);
            m.accuracyHistory.push(position.accuracy);
            m.timestampHistory.push(now);

            // Pencere boyutunu aşarsa en eskisini kaldır
            while (m.latHistory.length > m.windowSize) {
                m.latHistory.shift();
                m.lngHistory.shift();
                m.accuracyHistory.shift();
                m.timestampHistory.shift();
            }

            // Eğer yeteri kadar veri yoksa filtreleme yapma
            if (m.latHistory.length < 3) {
                return {
                    latitude: position.latitude,
                    longitude: position.longitude,
                    accuracy: position.accuracy,
                    timestamp: now
                };
            }

            // Değerleri sırala ve ortancayı bul
            const sortedLat = [...m.latHistory].sort((a, b) => a - b);
            const sortedLng = [...m.lngHistory].sort((a, b) => a - b);
            const sortedAcc = [...m.accuracyHistory].sort((a, b) => a - b);

            const midIndex = Math.floor(sortedLat.length / 2);

            const medianLat = sortedLat[midIndex];
            const medianLng = sortedLng[midIndex];


            const medianDistance = L.latLng(position.latitude, position.longitude)
                .distanceTo(L.latLng(medianLat, medianLng));

            const maxAllowedDistance = Math.max(position.accuracy * 1.5, 15);

            if (medianDistance > maxAllowedDistance) {

                const normalizedDistance = Math.min(1.0, medianDistance / (maxAllowedDistance * 2));
                const blendFactor = Math.min(0.7, Math.max(0.3, 0.3 + normalizedDistance * 0.4));

                return {
                    latitude: blendFactor * position.latitude + (1 - blendFactor) * medianLat,
                    longitude: blendFactor * position.longitude + (1 - blendFactor) * medianLng,
                    accuracy: sortedAcc[midIndex],
                    timestamp: now
                };
            }

            return {
                latitude: medianLat,
                longitude: medianLng,
                accuracy: sortedAcc[midIndex],
                timestamp: now
            };
        },

        // ========== İÇ MEKAN İYİLEŞTİRMELERİ - YENİ FONKSİYONLAR ==========
        
        // Geofence kontrolü - konum bina sınırları içinde mi?
        _isInsideGeofence: function (lat, lng) {
            // Geofence devre dışıysa her zaman true döndür
            if (!this.options.enableGeofence) return { inside: true, reason: null };
            
            // ========== 1. POLYGON KONTROLÜ (ÖNCELİKLİ) ==========
            // Eğer geofencePolygon varsa, gerçek polygon kontrolü yap
            if (this.options.geofencePolygon && this.options.geofencePolygon.length >= 3) {
                const isInPolygon = this._pointInPolygon(lat, lng, this.options.geofencePolygon);
                
                if (!isInPolygon) {
                    return { 
                        inside: false, 
                        reason: 'polygon',
                        message: `Konum belirlenen alan dışında: [${lat.toFixed(6)}, ${lng.toFixed(6)}]`
                    };
                }
                // Polygon içindeyse, diğer kontrolleri atla
                return { inside: true, reason: null };
            }
            
            // ========== 2. BOUNDS KONTROLÜ (dikdörtgen sınır - fallback) ==========
            if (this.options.geofenceBounds) {
                const bounds = this.options.geofenceBounds;
                const minLat = bounds[0][0];
                const minLng = bounds[0][1];
                const maxLat = bounds[1][0];
                const maxLng = bounds[1][1];
                
                if (lat < minLat || lat > maxLat || lng < minLng || lng > maxLng) {
                    return { 
                        inside: false, 
                        reason: 'bounds',
                        message: `Konum bina sınırları dışında: [${lat.toFixed(6)}, ${lng.toFixed(6)}]`
                    };
                }
            }
            
            // ========== 3. RADIUS KONTROLÜ (dairesel sınır) ==========
            if (this.options.geofenceCenter && this.options.geofenceRadius) {
                const center = this.options.geofenceCenter;
                const maxRadius = this.options.geofenceRadius;
                
                const distance = L.latLng(lat, lng).distanceTo(L.latLng(center[0], center[1]));
                
                if (distance > maxRadius) {
                    return { 
                        inside: false, 
                        reason: 'radius',
                        distance: distance,
                        message: `Konum merkezden ${Math.round(distance)}m uzakta (max: ${maxRadius}m)`
                    };
                }
            }
            
            return { inside: true, reason: null };
        },
        
        // Point-in-Polygon algoritması (Ray Casting)
        _pointInPolygon: function (lat, lng, polygon) {
            // polygon = [{lat, lng}, {lat, lng}, ...] veya [[lat, lng], [lat, lng], ...]
            let inside = false;
            const n = polygon.length;
            
            for (let i = 0, j = n - 1; i < n; j = i++) {
                // Polygon noktalarını al
                let xi, yi, xj, yj;
                
                if (polygon[i].lat !== undefined) {
                    // {lat, lng} formatı
                    xi = polygon[i].lat;
                    yi = polygon[i].lng;
                    xj = polygon[j].lat;
                    yj = polygon[j].lng;
                } else {
                    // [lat, lng] formatı
                    xi = polygon[i][0];
                    yi = polygon[i][1];
                    xj = polygon[j][0];
                    yj = polygon[j][1];
                }
                
                // Ray casting algoritması
                const intersect = ((yi > lng) !== (yj > lng)) &&
                    (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
                
                if (intersect) inside = !inside;
            }
            
            return inside;
        },
        
        // Hız kontrolü - imkansız sıçramaları tespit et
        _checkSpeedValidity: function (newLat, newLng, timestamp) {
            const history = this._locationHistory;
            
            // Geçmiş yoksa geçerli kabul et
            if (history.positions.length === 0) {
                return { valid: true, speed: 0 };
            }
            
            // Son konumu al
            const lastPos = history.positions[history.positions.length - 1];
            const lastTime = history.timestamps[history.timestamps.length - 1];
            
            // Zaman farkını hesapla (saniye)
            const timeDiff = Math.abs(timestamp - lastTime) / 1000;
            
            // Çok kısa sürede gelen konumları atla (GPS noise)
            if (timeDiff < 0.5) {
                return { valid: true, speed: 0, reason: 'too_fast_update' };
            }
            
            // Mesafeyi hesapla
            const distance = L.latLng(lastPos.latitude, lastPos.longitude)
                .distanceTo(L.latLng(newLat, newLng));
            
            // Hızı hesapla (m/s)
            const speed = distance / timeDiff;
            
            // İç mekan modunda daha düşük hız limiti
            const maxSpeed = this.options.indoorMode 
                ? this.options.maxIndoorSpeed 
                : this.options.maxHumanSpeed;
            
            if (speed > maxSpeed) {
                return { 
                    valid: false, 
                    speed: speed,
                    distance: distance,
                    timeDiff: timeDiff,
                    reason: 'impossible_speed',
                    message: `İmkansız hız: ${speed.toFixed(1)} m/s (${(speed * 3.6).toFixed(1)} km/h), max: ${maxSpeed} m/s`
                };
            }
            
            return { valid: true, speed: speed };
        },
        
        // Konum güvenilirlik skorunu hesapla (0-100)
        _calculateLocationConfidence: function (position, geofenceResult, speedResult) {
            let confidence = 100;
            
            // Accuracy bazlı skor düşürme
            if (position.accuracy > this.options.maxAcceptableAccuracy) {
                confidence -= 50;
            } else if (position.accuracy > 50) {
                confidence -= 30;
            } else if (position.accuracy > 30) {
                confidence -= 20;
            } else if (position.accuracy > 15) {
                confidence -= 10;
            } else if (position.accuracy <= this.options.minAcceptableAccuracy) {
                confidence += 10; // Çok iyi accuracy bonus
            }
            
            // Geofence ihlali
            if (!geofenceResult.inside) {
                confidence -= 40;
            }
            
            // Hız ihlali
            if (!speedResult.valid) {
                confidence -= 30;
            }
            
            // iOS cihazlarda iç mekanda genellikle daha düşük güvenilirlik
            if (this._isIOS && this.options.indoorMode) {
                confidence -= 5;
            }
            
            // Sınırla 0-100 arası
            return Math.max(0, Math.min(100, confidence));
        },
        
        // Son iyi konumu güncelle
        _updateLastGoodLocation: function (position, confidence) {
            // Açılışta last-good yazma — kapıya yakın ilk fix'in kilitlenmesini önler
            if (this._locateSessionStart &&
                (Date.now() - this._locateSessionStart) < (this.options.coldStartLastGoodDelayMs || 0)) {
                return;
            }
            if (this.options.coldStartGate && this._coldStart && !this._coldStart.ready) {
                return;
            }

            // Geofence kontrolü - sadece alan İÇİNDE olan konumları kaydet
            const geofenceCheck = this._isInsideGeofence(position.latitude, position.longitude);
            
            // Sadece yeterli güvenilirlikte VE alan içinde olan konumları kaydet
            if (confidence >= 50 && geofenceCheck.inside) {
                this._lastGoodLocation = {
                    latitude: position.latitude,
                    longitude: position.longitude,
                    accuracy: position.accuracy,
                    timestamp: position.timestamp || Date.now(),
                    confidence: confidence
                };
                this._consecutiveBadLocations = 0;
            } else {
                this._consecutiveBadLocations++;
                // Alan dışındaki konumu son iyi konum olarak kaydetme!
                if (!geofenceCheck.inside) {
                    // Alan dışı konum son iyi konum olarak kaydedilmedi
                }
            }
        },

        // Açılış kapısı: ilk GERÇEK KONUM için birkaç tutarlı, yeterince iyi fix bekle.
        // Dönüş: true → gösterime izin ver; false → henüz gösterme (bekle).
        _passColdStartGate: function (filteredPosition) {
            if (!this.options.coldStartGate) return true;
            if (!this._coldStart) this._coldStart = { ready: false, candidates: [] };
            if (this._coldStart.ready) return true;

            // Fallback / PDR / red yolları kapıyı etkilemez (ayrı gösterim)
            if (!filteredPosition || filteredPosition.isFallback || filteredPosition.isPDR) {
                return true;
            }

            var now = Date.now();
            var started = this._locateSessionStart || now;
            if ((now - started) >= (this.options.coldStartTimeoutMs || 20000)) {
                this._coldStart.ready = true;
                this._coldStart.candidates = [];
                return true;
            }

            var acc = filteredPosition.accuracy;
            if (acc == null || acc > (this.options.coldStartMaxAccuracy || 35)) {
                return false;
            }

            var lat = filteredPosition.latitude;
            var lng = filteredPosition.longitude;
            if (lat == null || lng == null) return false;

            var candidates = this._coldStart.candidates;
            candidates.push({ lat: lat, lng: lng, accuracy: acc, t: now });
            // Sadece son N adayı tut
            var need = this.options.coldStartMinFixes || 3;
            while (candidates.length > need) candidates.shift();

            if (candidates.length < need) return false;

            // Adaylar birbirine yakın mı?
            var maxDist = this.options.coldStartConsistentDistance || 45;
            var i, j;
            for (i = 0; i < candidates.length; i++) {
                for (j = i + 1; j < candidates.length; j++) {
                    var d = L.latLng(candidates[i].lat, candidates[i].lng)
                        .distanceTo(L.latLng(candidates[j].lat, candidates[j].lng));
                    if (d > maxDist) {
                        // Tutarsız küme — en eskiyi at, yeniden biriktir
                        candidates.shift();
                        return false;
                    }
                }
            }

            this._coldStart.ready = true;
            this._coldStart.candidates = [];
            return true;
        },
        
        // Konum geçmişini güncelle
        _updateLocationHistory: function (position) {
            const history = this._locationHistory;
            
            history.positions.push({
                latitude: position.latitude,
                longitude: position.longitude
            });
            history.timestamps.push(position.timestamp || Date.now());
            history.accuracies.push(position.accuracy);
            
            // Maksimum boyutu aşarsa en eskisini kaldır
            while (history.positions.length > history.maxSize) {
                history.positions.shift();
                history.timestamps.shift();
                history.accuracies.shift();
            }
        },
        
        // Son iyi konumu kullan (fallback)
        _getLastGoodLocationFallback: function (currentPosition) {
            const lastGood = this._lastGoodLocation;
            
            // Son iyi konum yoksa veya çok eskiyse, mevcut konumu döndür
            if (!lastGood.latitude || !lastGood.longitude) {
                return null;
            }
            
            const now = Date.now();
            const age = now - lastGood.timestamp;
            
            // Timeout kontrolü
            if (age > this.options.lastGoodLocationTimeout) {
                return null;
            }
            
            // Çok fazla kötü konum geldiyse zorla güncelle
            if (this._consecutiveBadLocations >= this.options.maxConsecutiveBadLocations) {
                // Ardışık kötü konum limiti, zorla güncelleniyor
                this._consecutiveBadLocations = 0;
                return null;
            }
            
            this._locationStats.fallbackUsed++;
            
            return {
                latitude: lastGood.latitude,
                longitude: lastGood.longitude,
                accuracy: Math.max(lastGood.accuracy, currentPosition.accuracy), // Daha kötü accuracy kullan
                timestamp: currentPosition.timestamp,
                isFallback: true,
                originalPosition: currentPosition
            };
        },
        
        // Fallback görünümüne giriş/çıkış histerezisi.
        // İstenen durum (wantFallback) ancak fallbackHysteresisMs boyunca kararlı kalırsa
        // onaylanır; böylece geofence sınırında salınan filtrelenmiş konum modu titretemez.
        // Dönüş: true → istenen durum geçerli, çağıran devam edebilir; false → geçiş henüz
        // kararlı değil, mevcut görünüm korunmalı.
        _updateFallbackHysteresis: function (wantFallback) {
            const h = this._fallbackHysteresis;
            if (wantFallback === h.state) {
                h.candidate = null;
                return true;
            }
            const now = Date.now();
            if (h.candidate !== wantFallback) {
                h.candidate = wantFallback;
                h.since = now;
            }
            if (now - h.since >= this.options.fallbackHysteresisMs) {
                h.state = wantFallback;
                h.candidate = null;
                return true;
            }
            return false;
        },

        // Histerezisi atlayarak fallback durumunu anında uygula (kesin red durumları için)
        _commitFallbackState: function (value) {
            this._isFallbackLocation = value;
            this._fallbackHysteresis.state = value;
            this._fallbackHysteresis.candidate = null;
        },

        // Konum istatistiklerini al
        getLocationStats: function () {
            return { ...this._locationStats };
        },
        
        // Geofence'i dinamik olarak ayarla
        setGeofence: function (options) {
            if (options.bounds) {
                this.options.geofenceBounds = options.bounds;
            }
            if (options.center) {
                this.options.geofenceCenter = options.center;
            }
            if (options.radius) {
                this.options.geofenceRadius = options.radius;
            }
            // ========== POLYGON DESTEĞİ ==========
            if (options.polygon) {
                this.options.geofencePolygon = options.polygon;
                // Geofence polygon ayarlandı
            }
            // Cache'i temizle
            this._geofenceCache.isInside = null;
        },

        // Kalman Filtreyi uygula
        _applyWeiYeFilter: function (position) {
            // Filtreleme devre dışıysa, orijinal konumu döndür
            if (!this.options.enableFiltering) {
                return position;
            }
            
            this._locationStats.totalLocations++;
            const timestamp = position.timestamp || Date.now();
            
            const isIOSDevice = this._isIOS;
            const isIndoorMode = this.options.indoorMode;
            
            // ========== ADIM 1: ACCURACY KONTROLÜ ==========
            if (this.options.enablePositionValidation && 
                position.accuracy > this.options.maxAcceptableAccuracy) {
                
                this._locationStats.accuracyRejections++;
                // Accuracy çok yüksek - reddediliyor
                
                // Fallback kullan
                if (this.options.enableLastGoodLocation) {
                    const fallback = this._getLastGoodLocationFallback(position);
                    if (fallback) {
                        // Son iyi konum kullanılıyor (accuracy rejection)
                        return fallback;
                    }
                }
                
                // Fallback yoksa - null döndür (marker güncellenmeyecek)
                // Ama ham veriyi kaydet (WeiYe panel teşhis için gösterebilsin)
                return null;
            }
            
            // ========== ADIM 2: GEOFENCE KONTROLÜ ==========
            const geofenceResult = this._isInsideGeofence(position.latitude, position.longitude);
            
            if (!geofenceResult.inside) {
                this._locationStats.geofenceRejections++;
                // Geofence dışı konum
                
                // ═══ PDR AKTİVASYONU ═══
                if (this.options.enableDeadReckoning && !this._pdr.active) {
                    // Geofence dışı sinyal → PDR başlatılıyor
                    this._startDeadReckoning();
                }
                
                // PDR aktifse, PDR konumunu döndür
                if (this._pdr.active) {
                    return {
                        latitude: this._pdr.currentLatitude,
                        longitude: this._pdr.currentLongitude,
                        accuracy: this._pdr.currentAccuracy,
                        timestamp: position.timestamp,
                        isPDR: true
                    };
                }
                
                // PDR kapalıysa normal fallback mantığı
                if (this.options.enableLastGoodLocation) {
                    const fallback = this._getLastGoodLocationFallback(position);
                    if (fallback) {
                        // Son iyi konum kullanılıyor (geofence rejection)
                        return fallback;
                    }
                }
                
                // Fallback yoksa - null döndür
                return null;
            }
            
            // ═══ İÇ MEKAN SİNYALİ GERİ GELDİ → PDR DURDUR ═══
            if (this._pdr.active) {
                // A2: durmadan önce adım uzunluğu katsayısını kalibre et (yeni GPS hedefiyle)
                this._calibrateStepLength(position.latitude, position.longitude, position.accuracy);
                // İç mekan sinyali geri geldi → PDR durduruluyor
                // Yumuşak yeniden giriş: gösterilen PDR konumunu çıpa olarak sakla;
                // gerçek GPS'e birkaç güncellemede yaklaşılacak (tek sıçrama yerine).
                if (this.options.pdrReentrySmoothing && this._latitude && this._longitude) {
                    this._reentry.active = true;
                    this._reentry.lat = this._latitude;
                    this._reentry.lng = this._longitude;
                }
                this._stopDeadReckoning("iç mekan sinyali geri geldi");
            }
            
            // ========== ADIM 3: HIZ KONTROLÜ ==========
            const speedResult = this._checkSpeedValidity(
                position.latitude, 
                position.longitude, 
                timestamp
            );
            
            if (!speedResult.valid) {
                this._locationStats.speedRejections++;
                // Hız ihlali
                
                // Fallback kullan
                if (this.options.enableLastGoodLocation) {
                    const fallback = this._getLastGoodLocationFallback(position);
                    if (fallback) {
                        // Son iyi konum kullanılıyor (speed rejection)
                        return fallback;
                    }
                }
                
                // Fallback yoksa - null döndür (marker güncellenmeyecek)
                // Konum reddedildi (speed)
                return null;
            }
            
            // ========== ADIM 4: GÜVENİLİRLİK SKORU ==========
            const confidence = this._calculateLocationConfidence(position, geofenceResult, speedResult);
            
            // Konum geçmişini güncelle (hız hesaplaması için)
            this._updateLocationHistory(position);
            
            // ========== ADIM 5: İÇ MEKAN OPTİMİZASYONLARI ==========
            // Taban değerler; yürüyüş/accuracy adaptasyonu aşağıda üzerine yazar
            if (isIndoorMode) {
                this._medianFilter.windowSize = this.options.indoorMedianWindowSize;
                this._kalmanFilter.R_lat = this.options.indoorKalmanR;
                this._kalmanFilter.R_lng = this.options.indoorKalmanR;
            }
            
            // NOT: Eskiden iOS'ta accuracy > 45m olan fix'ler tamamen yutulup önceki konum
            // döndürülüyordu. Bina içinde iOS accuracy neredeyse hep > 45m olduğundan bu kural
            // konumu kalıcı olarak donduruyordu (kaçış mekanizması yoktu). Kaldırıldı; düşük
            // doğruluklu fix'ler artık aşağıdaki median + Kalman zincirinden geçiyor — Kalman R
            // değeri accuracy ile orantılı yükseldiği için ağır yumuşatma zaten korunuyor.

            // İstatistikleri güncelle
            this._weiYeState.filteringStats.totalUpdates++;

            // Ham konumu kaydet
            this._weiYeState.lastRawPosition = {
                latitude: position.latitude,
                longitude: position.longitude,
                accuracy: position.accuracy
            };

            // Hareket geçmişini HAM GPS ile güncelle (LPF'den önce).
            // LPF çıktısından bakmak lag'li konumu "hareketsiz" gösterir → yumuşatma kısır döngüsü.
            this._updateMovementHistory(position);
            const isUserMovingEarly = this._detectUserMoving();

            // Low Pass Filter'ı uygula
            let lowPassFiltered = position;

            if (this.options.enableLowPassFilter !== false && typeof LowPassFilter !== 'undefined') {
                // Low Pass Filter'ları ilk kullanım için başlat
                if (!this._lowPassFilterInitialized) {
                    const sampleFrequency = 1.0;
                    // İç mekanda indoorLowPassTau; dışarıda lowPassFilterTau
                    const tau = (isIndoorMode
                        ? (this.options.indoorLowPassTau || this.options.lowPassFilterTau)
                        : this.options.lowPassFilterTau) || 0.5;

                    this._lowPassFilterLat = new LowPassFilter(sampleFrequency, tau);
                    this._lowPassFilterLng = new LowPassFilter(sampleFrequency, tau);

                    this._lowPassFilterLat.addSample(position.latitude);
                    this._lowPassFilterLng.addSample(position.longitude);

                    this._lowPassFilterInitialized = true;
                    this._lastLowPassTimestamp = position.timestamp || Date.now();

                    lowPassFiltered = position;
                } else {
                    const currentTimestamp = position.timestamp || Date.now();
                    const timeDiff = Math.abs(currentTimestamp - (this._lastLowPassTimestamp || currentTimestamp)) / 1000;

                    let actualSampleFrequency = 1.0;
                    if (timeDiff > 0.1 && timeDiff < 60) {
                        actualSampleFrequency = 1.0 / timeDiff;
                    }

                    if (this._lowPassFilterLat.setSampleFrequency) {
                        this._lowPassFilterLat.setSampleFrequency(actualSampleFrequency);
                        this._lowPassFilterLng.setSampleFrequency(actualSampleFrequency);
                    }

                    this._lastLowPassTimestamp = currentTimestamp;

                    // Taban tau: iç mekanda indoorLowPassTau
                    let dynamicTau = (isIndoorMode
                        ? (this.options.indoorLowPassTau || this.options.lowPassFilterTau)
                        : this.options.lowPassFilterTau) || 0.5;

                    if (isUserMovingEarly) {
                        // Yürürken hızlı tepki — lag'in ana düşmanı
                        dynamicTau = Math.max(0.2, dynamicTau * 0.5);
                    } else {
                        dynamicTau = Math.min(1.5, dynamicTau * 1.25);
                    }

                    // Düşük doğrulukta yumuşatmayı artır — AMA yürürken sınırlı tut
                    if (position.accuracy > 20) {
                        if (isUserMovingEarly) {
                            dynamicTau = Math.min(0.6, dynamicTau * 1.15);
                        } else {
                            dynamicTau = Math.min(2.5, dynamicTau * 1.4);
                        }
                    }

                    if (timeDiff > 10) {
                        dynamicTau = Math.max(0.2, dynamicTau / 2);
                    }

                    this._lowPassFilterLat.setTau(dynamicTau);
                    this._lowPassFilterLng.setTau(dynamicTau);

                    this._lowPassFilterLat.addSample(position.latitude);
                    this._lowPassFilterLng.addSample(position.longitude);

                    const filteredLat = this._lowPassFilterLat.lastOutput();
                    const filteredLng = this._lowPassFilterLng.lastOutput();

                    const filteredDistance = L.latLng(position.latitude, position.longitude)
                        .distanceTo(L.latLng(filteredLat, filteredLng));

                    const maxAllowedDistance = Math.max(position.accuracy * 1.5, 15);

                    if (filteredDistance > maxAllowedDistance) {
                        const normalizedDistance = Math.min(1.0, filteredDistance / (maxAllowedDistance * 2));
                        // Yürürken ham değere daha çok güven
                        const blendMin = isUserMovingEarly ? 0.45 : 0.3;
                        const blendFactor = Math.min(0.85, Math.max(blendMin, blendMin + normalizedDistance * 0.5));

                        lowPassFiltered = {
                            latitude: blendFactor * position.latitude + (1 - blendFactor) * filteredLat,
                            longitude: blendFactor * position.longitude + (1 - blendFactor) * filteredLng,
                            accuracy: position.accuracy,
                            timestamp: position.timestamp,
                            lpfApplied: true
                        };
                    } else {
                        lowPassFiltered = {
                            latitude: filteredLat,
                            longitude: filteredLng,
                            accuracy: position.accuracy,
                            timestamp: position.timestamp,
                            lpfApplied: true
                        };
                    }
                }
            } else if (this.options.enableLowPassFilter !== false && typeof LowPassFilter === 'undefined') {
                lowPassFiltered = position;
            }

            // Performans / lag: accuracy ve hareket durumuna göre median penceresi
            const isLowAccuracyNow = lowPassFiltered.accuracy > 20;
            const baseMedian = isIndoorMode
                ? (this.options.indoorMedianWindowSize || 3)
                : (this.options.medianWindowSize || 3);

            let medianWindowSize;
            if (isUserMovingEarly) {
                // Yürürken kısa pencere — kapı örneklerini tutma
                medianWindowSize = Math.min(3, baseMedian);
            } else if (isIOSDevice && isLowAccuracyNow) {
                medianWindowSize = Math.min(7, Math.max(baseMedian, baseMedian + 2));
            } else if (isIOSDevice) {
                medianWindowSize = Math.min(5, baseMedian + 1);
            } else if (isLowAccuracyNow) {
                medianWindowSize = baseMedian;
            } else {
                medianWindowSize = Math.max(3, Math.floor(baseMedian * 0.8));
            }
            
            const originalWindowSize = this._medianFilter.windowSize;
            this._medianFilter.windowSize = medianWindowSize;

            let medianFiltered = this._applyMedianFilter(lowPassFiltered);

            // Pencere boyutunu geri yükle
            this._medianFilter.windowSize = originalWindowSize;

            // 3. Sıçrama tespiti: Low Pass filtrelenmiş konum ile median filtrelenmiş konum arasında
            // Bu daha tutarlı bir karşılaştırma sağlar
            // GPS'in doğruluğunu dikkate alarak sıçramayı hesapla - düşük doğrulukta daha toleranslı ol
            // iOS için özel: Log analizine göre iOS'ta daha yüksek eşik gerekli
            let jumpDistanceThreshold;
            if (isIOSDevice) {
                // iOS'ta accuracy genellikle daha kötü, daha toleranslı ol
                jumpDistanceThreshold = Math.max(8, lowPassFiltered.accuracy / 2.5); // En az 8m
            } else {
                jumpDistanceThreshold = Math.max(5, lowPassFiltered.accuracy / 3); // En az 5m
            } 

            // Sapma mesafesini hesapla (Low Pass çıktısı ile median çıktısı arasında)
            const jumpDistance = L.latLng(lowPassFiltered.latitude, lowPassFiltered.longitude)
                .distanceTo(L.latLng(medianFiltered.latitude, medianFiltered.longitude));

            // İstatistikler için en büyük sıçramayı kaydet
            if (jumpDistance > this._weiYeState.filteringStats.maxJumpDistance) {
                this._weiYeState.filteringStats.maxJumpDistance = jumpDistance;
            }

            // Sıçrama tespiti - mesafe ve koordinat farkını kontrol et
            // Low Pass filtrelenmiş konum ile median filtrelenmiş konum arasında karşılaştırma
            const latDiff = Math.abs(lowPassFiltered.latitude - medianFiltered.latitude);
            const lngDiff = Math.abs(lowPassFiltered.longitude - medianFiltered.longitude);
            const isJump = (jumpDistance > jumpDistanceThreshold) ||
                (latDiff > this.options.jumpThreshold || lngDiff > this.options.jumpThreshold);

            if (isJump) {
                this._weiYeState.filteringStats.jumpsDetected++;
                this._weiYeState.isJumpDetected = true;
            } else {
                this._weiYeState.isJumpDetected = false;
            }

            // 3. Kalman filtresi uygula, duruma göre parametre ayarla
            // Hareket tespiti ham GPS geçmişinden (yukarıda güncellendi)
            const isUserMoving = isUserMovingEarly;

            // Hareket durumuna göre Kalman filtre parametreleri
            if (isUserMoving) {
                // Yürürken process noise yükselt — sabit-konum modelinin lag'ini kır
                this._kalmanFilter.Q_lat = this._kalmanFilter.Q_lng = this.options.kalmanProcessNoise * 4;
            } else {
                this._kalmanFilter.Q_lat = this._kalmanFilter.Q_lng = this.options.kalmanProcessNoise / 2;
            }

            // Kalman parametrelerini ayarla
            let kalmanInput;
            if (isJump) {
                this._kalmanFilter.R_lat = this._kalmanFilter.R_lng = isIOSDevice ? 1.2 : 0.9;
                kalmanInput = medianFiltered;
            } else {
                let adaptiveR;
                const indoorR = this.options.indoorKalmanR || 0.25;
                if (isIOSDevice) {
                    adaptiveR = Math.max(isIndoorMode ? indoorR * 0.6 : 0.08,
                        Math.min(isUserMoving ? 0.45 : 0.7, lowPassFiltered.accuracy / (isUserMoving ? 22 : 15)));
                } else {
                    adaptiveR = Math.max(isIndoorMode ? indoorR * 0.5 : 0.05,
                        Math.min(isUserMoving ? 0.3 : 0.5, lowPassFiltered.accuracy / (isUserMoving ? 28 : 20)));
                }
                // İç mekan tabanı ile harmanla
                if (isIndoorMode) {
                    adaptiveR = Math.min(adaptiveR, Math.max(indoorR, adaptiveR * 0.85));
                }
                this._kalmanFilter.R_lat = this._kalmanFilter.R_lng = adaptiveR;
                kalmanInput = lowPassFiltered;
            }

            // 4. Kalman filtresini uygula
            const kalmanFiltered = this._applyKalmanFilter(kalmanInput);
            
            // iOS: Durağan halindeki küçük gürültüyü tut — ama yürüyüş / kötü acc / PDR'de uygulama
            if (isIOSDevice && this._weiYeState.lastFilteredPosition && !isUserMoving &&
                !(this._pdr && this._pdr.active) &&
                (position.accuracy == null || position.accuracy <= 25)) {
                const distanceFromLast = L.latLng(
                    this._weiYeState.lastFilteredPosition.latitude,
                    this._weiYeState.lastFilteredPosition.longitude
                ).distanceTo(L.latLng(kalmanFiltered.latitude, kalmanFiltered.longitude));
                
                // Eşiği 2m → 1.2m düşür (yavaş yürüyüşü daha az dondurur)
                if (distanceFromLast < 1.2) {
                    return {
                        latitude: this._weiYeState.lastFilteredPosition.latitude,
                        longitude: this._weiYeState.lastFilteredPosition.longitude,
                        accuracy: kalmanFiltered.accuracy,
                        timestamp: position.timestamp
                    };
                }
            }

            // 5. Filtrelenmiş konumun bilgilerini kaydet
            this._weiYeState.lastFilteredPosition = {
                latitude: kalmanFiltered.latitude,
                longitude: kalmanFiltered.longitude,
                accuracy: kalmanFiltered.accuracy,
                rawLatitude: position.latitude,
                rawLongitude: position.longitude,
                isFiltered: true,
                isJump: isJump,
                timestamp: position.timestamp
            };
            
            // 6. SON İYİ KONUMU GÜNCELLE
            // Filtrelenmiş konum için yeniden güvenilirlik hesapla
            const filteredGeofence = this._isInsideGeofence(kalmanFiltered.latitude, kalmanFiltered.longitude);
            const finalConfidence = this._calculateLocationConfidence(
                kalmanFiltered, 
                filteredGeofence, 
                { valid: true, speed: 0 }
            );
            this._updateLastGoodLocation(kalmanFiltered, finalConfidence);
            
            // Güvenilirlik bilgisini ekle
            kalmanFiltered.confidence = finalConfidence;
            kalmanFiltered.isIndoorMode = this.options.indoorMode;

            return kalmanFiltered;
        },

        onAdd: function (map) {
            this._map = map;

            this._button = L.DomUtil.create("button", "leaflet-simple-locate");
            if (this.options.className) L.DomUtil.addClass(this._button, this.options.className);
            L.DomEvent.disableClickPropagation(this._button);

            this._button.innerHTML = this.options.htmlInit;
            this._button.title = this.options.title;
            this._button.setAttribute("aria-label", this.options.ariaLabel ? this.options.ariaLabel : this.options.title);

            L.DomEvent
                .on(this._button, "click", L.DomEvent.stopPropagation)
                .on(this._button, "click", L.DomEvent.preventDefault)
                .on(this._button, "click", this._onClick, this);

            return this._button;
        },

        getLatLng: function () {
            if (!this._latitude || !this._longitude) return null;
            return {
                lat: this._latitude,
                lng: this._longitude,
            };
        },

        getAccuracy: function () {
            if (!this._accuracy) return null;
            return this._accuracy;
        },

        getAngle: function () {
            if (!this._angle) return null;
            return this._angle;
        },

        setZoomLevel: function (level) {
            this.options.zoomLevel = level;
        },

        _onClick: async function () {
            if (this._clickTimeout) {
                clearTimeout(this._clickTimeout);
                this._clickTimeout = undefined;

                if (this._clicked) {
                    if (this._geolocation) this._unwatchGeolocation();
                    if (this._orientation) this._unwatchOrientation();
                    this._clicked = undefined;
                    this._geolocation = undefined;
                    this._orientation = undefined;
                    this._updateButton();
                    this._map.off("layeradd", this._onLayerAdd, this);

                    // Filtreleme verilerini sıfırla
                    this._resetFilters();
                }
            } else {
                this._clickTimeout = setTimeout(() => {
                    clearTimeout(this._clickTimeout);
                    this._clickTimeout = undefined;

                    if (!this._map) return;

                    // iOS 13+ devicemotion izni — PDR için, AYRI buton yok: konum butonuna
                    // her dokunuşta (kullanıcı jesti içinde) izin verilene kadar yeniden denenir.
                    if (this.options.enableDeadReckoning && this._motionGranted !== true) {
                        this._checkMotion();
                    }

                    if (this._clicked && this.options.setViewAfterClick) {
                        this._setView();
                        return;
                    }

                    this._clicked = true;
                    this._updateButton();
                    this._map.on("layeradd", this._onLayerAdd, this);

                    // Yeni konum oturumu — açılış kapısı / last-good gecikmesi
                    this._locateSessionStart = Date.now();
                    this._coldStart = { ready: false, candidates: [] };

                    this._checkGeolocation().then((event) => {
                        this._geolocation = true;
                        this._onLocationFound(event.coords);
                        if (this.options.setViewAfterClick) this._setView();
                        this._watchGeolocation();
                        this._checkClickResult();
                    }).catch(() => {
                        this._geolocation = false;
                        this._checkClickResult();
                    });

                    this._checkOrientation().then(() => {
                        this._orientation = true;
                        this._watchOrientation();
                        this._checkClickResult();
                    }).catch(() => {
                        this._orientation = false;
                        this._checkClickResult();
                    });
                }, this.options.clickTimeoutDelay);
            }
        },

        // Filtreleme verilerini sıfırla
        _resetFilters: function () {
            // Median filtre verilerini sıfırla
            this._medianFilter.latHistory = [];
            this._medianFilter.lngHistory = [];
            this._medianFilter.accuracyHistory = [];
            this._medianFilter.timestampHistory = [];

            // Kalman filtre verilerini sıfırla
            this._kalmanFilter.x_lat = null;
            this._kalmanFilter.x_lng = null;
            this._kalmanFilter.P_lat = null;
            this._kalmanFilter.P_lng = null;
            this._kalmanFilter.v_lat = 0;
            this._kalmanFilter.v_lng = 0;
            this._kalmanFilter.cvTime = null;

            // Wei Ye durumunu sıfırla
            this._weiYeState.lastFilteredPosition = null;
            this._weiYeState.lastRawPosition = null;
            this._weiYeState.isJumpDetected = false;
            this._weiYeState.filteringStats = {
                totalUpdates: 0,
                jumpsDetected: 0,
                maxJumpDistance: 0
            };
            this._lowPassFilterLat = null;
            this._lowPassFilterLng = null;
            this._lowPassFilterInitialized = false;
            this._lastLowPassTimestamp = null;

            // Hareket geçmişini sıfırla
            this._movementHistory.positions = [];
            this._movementHistory.timestamps = [];
            
            // ========== İÇ MEKAN İYİLEŞTİRMELERİ - SIFIRLAMA ==========
            
            // Son iyi konum sıfırla
            this._lastGoodLocation = {
                latitude: null,
                longitude: null,
                accuracy: null,
                timestamp: null,
                confidence: 0
            };
            
            // Kötü konum sayacı sıfırla
            this._consecutiveBadLocations = 0;

            // Açılış kapısını sıfırla — yeni oturum
            this._locateSessionStart = Date.now();
            this._coldStart = { ready: false, candidates: [] };

            // Fallback histerezisini sıfırla
            this._isFallbackLocation = false;
            this._fallbackHysteresis.state = false;
            this._fallbackHysteresis.candidate = null;

            // Yeniden giriş yumuşatmasını sıfırla
            this._reentry.active = false;
            
            // Konum geçmişi sıfırla
            this._locationHistory = {
                positions: [],
                timestamps: [],
                accuracies: [],
                maxSize: 10
            };
            
            // İstatistikleri sıfırla
            this._locationStats = {
                totalLocations: 0,
                rejectedLocations: 0,
                geofenceRejections: 0,
                speedRejections: 0,
                accuracyRejections: 0,
                fallbackUsed: 0
            };
            
            // Geofence cache sıfırla
            this._geofenceCache = {
                isInside: null,
                lastCheck: null,
                checkInterval: 1000
            };
            
            // Altitude sıfırla
            this._resetAltitude();
            
            // PDR durdur ve sıfırla
            this._stopDeadReckoning("filtreler sıfırlandı");
        },

        _checkClickResult: function () {
            this._updateButton();

            if (this.options.afterClick && typeof this._geolocation !== "undefined" && typeof this._orientation !== "undefined") {
                this.options.afterClick({
                    geolocation: this._geolocation,
                    orientation: this._orientation,
                });
            }

            if (this._geolocation === false && this._orientation === false) {
                this._clicked = undefined;
                this._geolocation = undefined;
                this._orientation = undefined;
            }
        },

        _checkGeolocation: function () {
            if (typeof navigator !== "object" || !("geolocation" in navigator) ||
                typeof navigator.geolocation.getCurrentPosition !== "function" || typeof navigator.geolocation.watchPosition !== "function") {
                return Promise.reject();
            }

            return new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        resolve(position);
                    },
                    (error) => {
                        reject(error);
                    },
                    { maximumAge: 0, enableHighAccuracy: true }
                );
            });
        },

        _checkOrientation: function () {
            if (!("ondeviceorientationabsolute" in window || "ondeviceorientation" in window) || !DeviceOrientationEvent)
                return Promise.reject();

            if (typeof DeviceOrientationEvent.requestPermission !== "function")
                return Promise.resolve();

            return DeviceOrientationEvent.requestPermission().then((permission) => {
                if (permission === "granted") return true;
                else return Promise.reject();
            });
        },

        // iOS 13+ için devicemotion (ivmeölçer) izni — PDR adım sayımı buna bağlı.
        // DeviceOrientation izninden AYRIDIR ve kullanıcı hareketi (tıklama) içinde istenmelidir.
        _checkMotion: function () {
            if (typeof DeviceMotionEvent === "undefined") return Promise.resolve(false);

            // iOS dışı / eski tarayıcılar: izin gerekmez, doğrudan kullanılabilir
            if (typeof DeviceMotionEvent.requestPermission !== "function") {
                this._motionGranted = true;
                this._fireMotionPermissionChange();
                return Promise.resolve(true);
            }

            return DeviceMotionEvent.requestPermission().then((permission) => {
                this._motionGranted = (permission === "granted");
                if (this._motionGranted) this._motionWarned = false;
                this._fireMotionPermissionChange();
                return this._motionGranted;
            }).catch(() => {
                this._motionGranted = false;
                this._fireMotionPermissionChange();
                return false;
            });
        },

        _fireMotionPermissionChange: function () {
            if (typeof this.options.onMotionPermissionChange === 'function') {
                try { this.options.onMotionPermissionChange(this.getMotionPermissionState()); } catch (e) {}
            }
        },

        // Motion izninin durumu: 'granted' | 'denied' | 'unknown' | 'not-required'
        getMotionPermissionState: function () {
            if (typeof DeviceMotionEvent === "undefined") return 'denied';
            if (typeof DeviceMotionEvent.requestPermission !== "function") {
                return this._motionGranted === false ? 'denied' : 'not-required';
            }
            if (this._motionGranted === true) return 'granted';
            if (this._motionGranted === false) return 'denied';
            return 'unknown';
        },

        // Dışarıdan motion iznini iste (kullanıcı jesti içinden çağrılmalı).
        // Ayrı bir buton GEREKMEZ — konum butonu da bunu tetikler; bu yalnızca
        // programatik kullanım/entegrasyon içindir.
        requestMotionPermission: function () {
            return this._checkMotion();
        },

        _watchGeolocation: function () {
            this._map.locate({ watch: true, enableHighAccuracy: true });
            this._map.on("locationfound", this._onLocationFound, this);
            this._map.on("locationerror", this._onLocationError, this);
            this._map.on("zoomstart", this._onZoomStart, this);
            this._map.on("zoomend", this._onZoomEnd, this);
        },
        
        _onLocationError: function (error) {
            // Hata sessizce işlenir, callback ile bildirilir
            if (this.options.afterDeviceMove) {
                this.options.afterDeviceMove({
                    lat: this._latitude,
                    lng: this._longitude,
                    accuracy: this._accuracy,
                    angle: this._angle,
                    isFiltered: false,
                    isRejected: true,
                    isJump: false,
                    filterStats: this._weiYeState ? this._weiYeState.filteringStats : {},
                    confidence: 0,
                    locationStats: this._locationStats,
                    isFallback: false,
                    isIndoorMode: this.options.indoorMode,
                    locationError: {
                        code: error && error.code ? error.code : 0,
                        message: error && error.message ? error.message : 'Bilinmeyen hata'
                    }
                });
            }
        },

        _unwatchGeolocation: function () {
            
            this._map.stopLocate();
            this._map.off("locationfound", this._onLocationFound, this);
            this._map.off("locationerror", this._onLocationError, this);
            this._map.off("zoomstart", this._onZoomStart, this);
            this._map.off("zoomend", this._onZoomEnd, this);

            if (this._circle) {
                this._map.removeLayer(this._circle);
                this._circle = undefined;
            }
            if (this._marker) {
                this._map.removeLayer(this._marker);
                this._marker = undefined;
            }
            this._latitude = undefined;
            this._longitude = undefined;
            this._accuracy = undefined;
        },

        _watchOrientation: function () {
            L.DomEvent.on(window, "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation", this._onOrientation, this);
        },

        _unwatchOrientation: function () {
            L.DomEvent.off(window, "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation", this._onOrientation, this);
            document.documentElement.style.setProperty("--leaflet-simple-locate-orientation", "0deg");
            this._angle = undefined;
            this._orientationSamples = [];
            this._lastOrientationTime = 0;
            this._orientationCalibrated = false;
            this._compassUncalibratedWarned = false;
            this._lastReliableHeading = undefined;
            this._inGimbalLockZone = false;
            this._fusedHeading = null;
            this._lastGyroTime = 0;
            this._gyroAccumSinceCompass = 0;
            this._lastCompassForSign = null;
            this._gyroSignDisagree = 0;
        },

        _onLocationFound: function (event) {
            // GPS gidiş yönü (course) ve hızını yakala (A1/A3 için).
            // Leaflet locationfound olayı tüm sayısal coords alanlarını taşır:
            // event.heading (°, kuzeyden saat yönü) ve event.speed (m/s). Yön yalnızca
            // yeterli hızda ve iyi doğrulukta güvenilirdir (duruşta NaN/eski değer gelir).
            this._captureGpsCourse(event);

            // ========== ALTITUDE İŞLEME (konum/geofence durumundan BAĞIMSIZ) ==========
            // Dikey yükseklik, yatay geofence konumundan bağımsızdır. Bu yüzden altitude'u
            // filtreleme/geofence/red kontrollerinden ÖNCE işle: konum dışarıda, reddedilmiş
            // ya da fallback olsa bile yükseklik/kat güncel kalsın.
            if (this.options.enableAltitude && event.altitude !== undefined) {
                try {
                    this._processAltitude(event);
                } catch (e) {
                    // Altitude işleme hatası — konumu etkilemesin
                }
            }

            // Wei Ye algoritması ile konumu filtrele
            const filteredPosition = this._applyWeiYeFilter(event);
            
            // Konum reddedildiyse (null döndü) — PDR veya son iyi konum varsa göster
            if (!filteredPosition) {
                if (this._pdr.active) {
                    this._commitFallbackState(true);
                    this._latitude = this._pdr.currentLatitude;
                    this._longitude = this._pdr.currentLongitude;
                    this._accuracy = this._pdr.currentAccuracy;
                    this._updateMarker();
                    return;
                }
                if (this._lastGoodLocation.latitude && this._lastGoodLocation.longitude) {
                    this._commitFallbackState(true);
                    this._latitude = this._lastGoodLocation.latitude;
                    this._longitude = this._lastGoodLocation.longitude;
                    this._accuracy = this._lastGoodLocation.accuracy || this._accuracy;
                    this._updateMarker();
                    return;
                }

                if (this._marker) {
                    this._map.removeLayer(this._marker);
                    this._marker = undefined;
                }
                if (this._circle) {
                    this._map.removeLayer(this._circle);
                    this._circle = undefined;
                }

                if (this.options.afterDeviceMove) {
                    this.options.afterDeviceMove({
                        lat: event.latitude,
                        lng: event.longitude,
                        accuracy: event.accuracy,
                        angle: this._angle,
                        isFiltered: true,
                        isRejected: true,
                        isJump: false,
                        filterStats: this._weiYeState.filteringStats,
                        confidence: 0,
                        locationStats: this._locationStats,
                        isFallback: false,
                        isIndoorMode: this.options.indoorMode,
                        consecutiveBadLocations: this._consecutiveBadLocations,
                        altitude: this._altitude.filtered,
                        altitudeRaw: this._altitude.raw,
                        altitudeAccuracy: this._altitude.accuracy,
                        altitudePlatform: this._altitude.platform,
                        floor: this._altitude.floor,
                        floorName: this._altitude.floorName,
                        updateKind: 'reject'
                    });
                }
                return;
            }
            
            if (!filteredPosition.latitude || !filteredPosition.longitude) {
                return;
            }
            
            // ========== EK GÜVENLİK: FİLTRELENMİŞ KONUM İÇİN DE GEOFENCE KONTROLÜ ==========
            const finalGeofenceCheck = this._isInsideGeofence(filteredPosition.latitude, filteredPosition.longitude);
            if (!finalGeofenceCheck.inside) {
                this._locationStats.geofenceRejections++;

                // Histerezis: sınırdan tek tük dışarı sapan fix'lerde hemen fallback'e geçme;
                // sapma kararlı hale gelene kadar son görüntülenen konum korunur
                if (!this._updateFallbackHysteresis(true)) {
                    return;
                }
                this._isFallbackLocation = true;

                // Dead reckoning başlat (aktif değilse)
                if (this.options.enableDeadReckoning && !this._pdr.active) {
                    this._startDeadReckoning();
                }
                
                // PDR aktifse PDR konumunu kullan
                if (this._pdr.active) {
                    this._latitude = this._pdr.currentLatitude;
                    this._longitude = this._pdr.currentLongitude;
                    this._accuracy = this._pdr.currentAccuracy;
                } else if (this._lastGoodLocation.latitude && this._lastGoodLocation.longitude) {
                    this._latitude = this._lastGoodLocation.latitude;
                    this._longitude = this._lastGoodLocation.longitude;
                    this._accuracy = this._lastGoodLocation.accuracy || this._accuracy;
                } else {
                    return;
                }
                
                this._updateMarker();
                return;
            }
            
            // Geofence içinde — gerçek GPS konumu
            // Histerezis: fallback'ten gerçek konuma dönüş de kararlılık ister;
            // onaylanana kadar fallback görünümü korunur
            if (!this._updateFallbackHysteresis(false)) {
                return;
            }
            this._isFallbackLocation = false;

            // Açılış kapısı: ilk GERÇEK KONUM için tutarlı/iyi accuracy'li fix'ler bekle
            // (kapıya yakın cold-start fix'inin hemen kilitlenmesini önler)
            if (!this._passColdStartGate(filteredPosition)) {
                return;
            }

            // A3: dış mekanda hareket halinde GPS yönüyle heading'i düzelt
            this._applyGpsCourseToHeading();

            // PDR→GPS yumuşak yeniden giriş: hedef GPS konumuna kademeli yaklaş
            var targetLat = filteredPosition.latitude;
            var targetLng = filteredPosition.longitude;
            if (this._reentry.active) {
                var gap = L.latLng(this._reentry.lat, this._reentry.lng)
                    .distanceTo(L.latLng(targetLat, targetLng));
                if (gap <= this.options.pdrReentrySnapDistance) {
                    // Yeterince yaklaşıldı → doğrudan otur, yeniden girişi bitir
                    this._reentry.active = false;
                } else {
                    var b = this.options.pdrReentryBlend;
                    this._reentry.lat = this._reentry.lat + (targetLat - this._reentry.lat) * b;
                    this._reentry.lng = this._reentry.lng + (targetLng - this._reentry.lng) * b;
                    targetLat = this._reentry.lat;
                    targetLng = this._reentry.lng;
                }
            }

            // Önceki filtrelenmiş konumla aynıysa güncelleme yapma (micro değişiklikleri engelle)
            if (this._latitude && targetLat &&
                Math.round(this._latitude * 1000000) === Math.round(targetLat * 1000000) &&
                this._longitude && targetLng &&
                Math.round(this._longitude * 1000000) === Math.round(targetLng * 1000000) &&
                this._accuracy && filteredPosition.accuracy &&
                Math.round(this._accuracy * 100) === Math.round(filteredPosition.accuracy * 100)) {
                return;
            }

            // Filtrelenmiş değerleri kaydet
            this._latitude = targetLat;
            this._longitude = targetLng;
            this._accuracy = filteredPosition.accuracy;

            // Marker'ı güncelle (altitude konumdan bağımsız olarak yukarıda işlendi)
            this._updateMarker();
        },

        _onOrientation: function (event) {
            if (event.alpha === null || event.alpha === undefined) return;
            
            let angle;
            
            // ===== ADIM 1: Ham açı hesaplama =====
            if (event.webkitCompassHeading !== undefined && event.webkitCompassHeading !== null) {
                // iOS: webkitCompassHeading direkt manyetik kuzey açısı verir (tilt-immune)
                if (event.webkitCompassAccuracy !== undefined && event.webkitCompassAccuracy < 0) {
                    if (!this._compassUncalibratedWarned) {
                        // Pusula kalibre edilmemiş
                        this._compassUncalibratedWarned = true;
                    }
                    return;
                }
                this._compassUncalibratedWarned = false;
                angle = event.webkitCompassHeading;
            } else {
                // Android/Diğer: Gimbal-lock korumalı heading hesaplama
                angle = this._computeHeadingWithGimbalLockProtection(
                    event.alpha, event.beta, event.gamma
                );
            }
            
            if (angle === null || isNaN(angle)) return;
            
            // ===== ADIM 2: Ekran yönü düzeltmesi =====
            if ("orientation" in screen) {
                angle = (angle + screen.orientation.angle) % 360;
            }
            
            // ===== ADIM 3: Kalibrasyon tespiti =====
            if (this._angle !== undefined) {
                let absDelta = Math.abs(this._angleDelta(angle, this._angle));
                if (absDelta > 30) {
                    // Büyük değişim = muhtemel kalibrasyon düzeltmesi
                    this._orientationSamples = [];
                    this._orientationCalibrated = true;
                }
            }
            
            // ===== ADIM 4: Yön yumuşatma (jitter azaltma) =====
            const smoothingSize = this.options.orientationSmoothing || 5;
            this._orientationSamples.push(angle);
            if (this._orientationSamples.length > smoothingSize) {
                this._orientationSamples.shift();
            }
            
            // Dairesel ortalama (0°/360° geçişini doğru hesaplar)
            let smoothedAngle = this._circularMean(this._orientationSamples);
            
            // ===== ADIM 5: Minimum değişim filtresi =====
            if (this._angle !== undefined && 
                !this._orientationCalibrated &&
                Math.abs(this._angleDelta(smoothedAngle, this._angle)) < this.options.minAngleChange) {
                return;
            }
            this._orientationCalibrated = false;

            // Jiroskop füzyonu: pusula değerini referans alıp füzyonlanmış heading'i üret
            // (jiroskop tazeyse), aksi halde saf pusula döner.
            this._angle = (this._fuseHeading((smoothedAngle + 360) % 360) + 360) % 360;
            this._lastOrientationTime = Date.now();

            // Görsel dönüş her olayda CSS değişkeniyle yapılır (pürüzsüz kalır).
            document.documentElement.style.setProperty("--leaflet-simple-locate-orientation", -this._angle + "deg");

            // _updateMarker (callback + geofence + marker reposition) ~10Hz throttle edilir.
            // Konum değişmediği için sık çağrı gereksiz CPU/pil tüketir.
            var nowMs = Date.now();
            var minInterval = this.options.orientationUpdateInterval || 100;
            if (!this._marker ||
                this._lastOrientationMarkerUpdate === undefined ||
                nowMs - this._lastOrientationMarkerUpdate >= minInterval) {
                this._lastOrientationMarkerUpdate = nowMs;
                this._updateMarker({ orientationOnly: true });
            }
        },
        
        // Gimbal Lock korumalı pusula hesaplama
        // ─────────────────────────────────────
        // Euler açılarında beta≈90° olduğunda alpha 180° sıçrar (gimbal lock).
        // Bu fonksiyon her frame'de heading ve heading+180 arasından
        // son güvenilir yöne EN YAKIN olanı seçer.
        //
        // Neden çalışır:
        // - Gerçek dönüş: kademeli (frame başına 2-5°), lastReliable sürekli takip eder
        //   → heading her zaman flipped'den yakın → düzeltme gerekmez
        // - Gimbal lock: ani 180° sıçrama, lastReliable aynı kalır
        //   → flipped (= doğru yön) lastReliable'a daha yakın → otomatik düzeltilir
        _computeHeadingWithGimbalLockProtection: function (alpha, beta, gamma) {
            var heading = (360 - alpha) % 360;
            var absBeta = Math.abs(beta);
            var threshold = this.options.gimbalLockThreshold || 70;
            
            // ── Normal bölge (|beta| < threshold) ──
            // +Y ekseni (telefonun üst kenarı) yatay düzleme güçlü projeksiyon yapıyor
            // Heading güvenilir, referans olarak kaydet
            if (absBeta < threshold) {
                this._lastReliableHeading = heading;
                this._inGimbalLockZone = false;
                return heading;
            }
            
            // ── Gimbal lock bölgesi (|beta| >= threshold) ──
            // alpha 180° sıçramış olabilir. İki olası yorumu karşılaştır:
            //   1) heading (olduğu gibi)
            //   2) heading + 180° (gimbal lock düzeltmesi)
            // Son güvenilir yöne hangisi daha yakınsa onu seç.
            this._inGimbalLockZone = true;
            
            if (this._lastReliableHeading === undefined) {
                // İlk açılış - henüz referans yok, olduğu gibi kabul et
                this._lastReliableHeading = heading;
                return heading;
            }
            
            var delta1 = Math.abs(this._angleDelta(heading, this._lastReliableHeading));
            var flipped = (heading + 180) % 360;
            var delta2 = Math.abs(this._angleDelta(flipped, this._lastReliableHeading));
            
            if (delta2 < delta1) {
                // Gimbal lock tespit edildi - 180° düzeltme uygula
                heading = flipped;
            }
            
            // Gimbal lock bölgesinde de referansı güncelle (dönüşleri takip et)
            this._lastReliableHeading = heading;
            return heading;
        },
        
        // Dairesel (circular) ortalama - 0°/360° sınırında doğru çalışır
        _circularMean: function (angles) {
            if (!angles || angles.length === 0) return 0;
            
            var sinSum = 0;
            var cosSum = 0;
            var degToRad = Math.PI / 180;
            
            for (var i = 0; i < angles.length; i++) {
                sinSum += Math.sin(angles[i] * degToRad);
                cosSum += Math.cos(angles[i] * degToRad);
            }
            
            var mean = Math.atan2(sinSum / angles.length, cosSum / angles.length);
            mean = mean * (180 / Math.PI);
            if (mean < 0) mean += 360;
            
            return mean;
        },
        
        // İki açı arasındaki en kısa fark (-180 ile +180 arası)
        _angleDelta: function (a, b) {
            var delta = a - b;
            while (delta > 180) delta -= 360;
            while (delta < -180) delta += 360;
            return delta;
        },

        // Tamamlayıcı filtre: pusula heading'ini referans alır.
        // - Jiroskop verisi yoksa/bayatsa veya füzyon kapalıysa: saf pusula (eski davranış)
        // - Jiroskop tazeyse: _fusedHeading'i (jiroskopla entegre edilmiş) pusulaya doğru
        //   nazikçe çeker. GÜVENLİK: pusuladan headingGyroMaxDivergence'tan fazla ayrılırsa
        //   (yanlış eksen/işaret veya jiroskop sürüklenmesi) doğrudan pusulaya kilitlenir.
        _fuseHeading: function (compassHeading) {
            var now = Date.now();
            var gyroFresh = this.options.headingGyroFusion &&
                this._lastGyroTime && (now - this._lastGyroTime) < 500;

            // A1: jiroskop işaret oylaması — pusula belirgin döndüyse, son pusula
            // örneğinden beri biriken HAM jiro entegralinin işareti pusula yönüyle
            // uyuşuyor mu? Tutarlı uyumsuzlukta headingGyroSign otomatik ters çevrilir.
            if (gyroFresh && this.options.headingGyroAutoSign && this._lastCompassForSign !== null) {
                var cDelta = this._angleDelta(compassHeading, this._lastCompassForSign);
                if (Math.abs(cDelta) > 8 && Math.abs(this._gyroAccumSinceCompass) > 4) {
                    var sign = this.options.headingGyroSign || -1;
                    var agree = (sign * this._gyroAccumSinceCompass) * cDelta > 0;
                    if (agree) {
                        this._gyroSignDisagree = 0;
                    } else if (++this._gyroSignDisagree >= 4) {
                        this.options.headingGyroSign = -sign; // işareti düzelt
                        this._gyroSignDisagree = 0;
                    }
                    this._lastCompassForSign = compassHeading;
                    this._gyroAccumSinceCompass = 0;
                }
            } else if (gyroFresh && this.options.headingGyroAutoSign) {
                this._lastCompassForSign = compassHeading;
                this._gyroAccumSinceCompass = 0;
            }

            if (!gyroFresh || this._fusedHeading === null) {
                this._fusedHeading = compassHeading;
                return compassHeading;
            }

            var div = this._angleDelta(this._fusedHeading, compassHeading); // fused - compass
            if (Math.abs(div) > (this.options.headingGyroMaxDivergence || 25)) {
                // Güvenlik kilidi: çok ayrıştı → pusulaya geri otur
                this._fusedHeading = compassHeading;
                return compassHeading;
            }

            // Pusulaya doğru nazik düzeltme (uzun vadeli referans)
            var gain = this.options.headingCompassCorrection || 0.1;
            this._fusedHeading = (this._fusedHeading - gain * div + 360) % 360;
            return this._fusedHeading;
        },

        // GPS gidiş yönü (course) ve hızını yakala. Yalnızca yeterli hız + iyi doğrulukta
        // güvenilir kabul edilir; aksi halde eski değer korunur (bayatlama _gpsHeadingTime ile).
        _captureGpsCourse: function (event) {
            if (!event) return;
            if (event.speed !== null && event.speed !== undefined && isFinite(event.speed)) {
                this._gpsSpeed = event.speed;
            }
            var h = event.heading;
            if (h === null || h === undefined || !isFinite(h)) return;
            var acc = event.accuracy;
            if (this._gpsSpeed !== null && this._gpsSpeed >= this.options.gpsCourseMinSpeed &&
                (acc === undefined || acc === null || acc <= this.options.gpsCourseMaxAccuracy)) {
                this._gpsHeading = (h + 360) % 360;
                this._gpsHeadingTime = Date.now();
            }
        },

        // A3: dış mekanda güvenilir GPS yönü varsa heading'i ona doğru çek.
        // Pusula yoksa doğrudan GPS yönünü kullanır (hareket halinde ok yine doğru gösterir).
        _applyGpsCourseToHeading: function () {
            if (!this.options.headingUseGpsCourse) return;
            if (this._gpsHeading === null) return;
            if (Date.now() - this._gpsHeadingTime > 3000) return; // bayat

            if (this._angle === undefined || this._angle === null) {
                this._angle = this._gpsHeading;
                this._fusedHeading = this._gpsHeading;
            } else {
                var d = this._angleDelta(this._gpsHeading, this._angle); // gps - current
                var gain = this.options.gpsCourseCorrection || 0.2;
                this._angle = (this._angle + gain * d + 360) % 360;
                // Füzyon referansını da kaydır ki jiroskop GPS'e karşı çekişmesin
                if (this._fusedHeading !== null) {
                    this._fusedHeading = (this._fusedHeading + gain * d + 360) % 360;
                }
            }
            document.documentElement.style.setProperty(
                "--leaflet-simple-locate-orientation", -this._angle + "deg");
        },

        // ════════════════════════════════════════════════════════
        // ALTITUDE NORMALİZASYON & KAT TESPİTİ
        // iOS ve Android arasındaki altitude farkını normalize eder
        // ve iç mekanda kat tespiti yapar
        // ════════════════════════════════════════════════════════
        
        // Altitude verisini işle (her locationfound'da çağrılır)
        _processAltitude: function (position) {
            if (!this.options.enableAltitude) return;
            
            // Leaflet locationfound event'inde altitude bilgisi
            var rawAltitude = position.altitude;
            var altitudeAccuracy = position.altitudeAccuracy;
            
            // Altitude yoksa çık
            if (rawAltitude === null || rawAltitude === undefined) return;
            
            this._altitude.raw = rawAltitude;
            this._altitude.accuracy = altitudeAccuracy;
            this._altitude.sampleCount++;
            
            // Platform tespiti (ilk seferde)
            if (!this._altitude.platform) {
                this._altitude.platform = this._isIOS ? 'ios' : 'android';
            }
            
            // ═══ ADIM 1: ACCURACY KONTROLÜ ═══
            if (altitudeAccuracy !== null && altitudeAccuracy !== undefined &&
                altitudeAccuracy > this.options.altitudeMinAccuracy) {
                // Accuracy çok kötü, bu değeri kullanma
                return;
            }
            
            // ═══ ADIM 2: PLATFORM NORMALİZASYONU (MSL'e çevir) ═══
            var mslAltitude = this._normalizeAltitudeToMSL(rawAltitude);
            this._altitude.normalized = mslAltitude;
            
            // ═══ ADIM 3: ANİ SIÇRAMA KONTROLÜ ═══
            if (this._altitude.filtered !== null) {
                var altDelta = Math.abs(mslAltitude - this._altitude.filtered);
                if (altDelta > this.options.altitudeMaxDelta) {
                    // Ani sıçrama - muhtemelen GPS hatası, yoksay
                    // Altitude sıçraması tespit edildi → yoksayıldı
                    return;
                }
            }
            
            // ═══ ADIM 4: FİLTRELEME ═══
            var filteredAltitude;
            if (this.options.altitudeFilterEnabled) {
                filteredAltitude = this._filterAltitude(mslAltitude);
            } else {
                filteredAltitude = mslAltitude;
            }
            
            this._altitude.filtered = filteredAltitude;
            
            // ═══ ADIM 5: KAT TESPİTİ ═══
            if (this.options.enableFloorDetection) {
                this._detectFloor(filteredAltitude);
            }
        },
        
        // Android altitude'unu MSL'e normalize et
        // iOS zaten MSL döndürür, Android WGS84 elipsoid döndürür
        _normalizeAltitudeToMSL: function (rawAltitude) {
            if (this._altitude.platform === 'ios') {
                // iOS: Core Location zaten MSL (Mean Sea Level) döndürür
                return rawAltitude;
            }
            
            // Android: Elipsoid yüksekliği → MSL'e çevir
            // MSL = Elipsoid Yüksekliği - Geoid Ondülasyonu (N)
            var N = this.options.geoidUndulation;
            return rawAltitude - N;
        },
        
        // Altitude filtreleme (Median + LowPass)
        _filterAltitude: function (altitude) {
            // ─── Median Filtre ───
            var buffer = this._altitude.medianBuffer;
            var windowSize = this.options.altitudeMedianWindow;
            
            buffer.push(altitude);
            if (buffer.length > windowSize) {
                buffer.shift();
            }
            
            // Median hesapla
            var sorted = buffer.slice().sort(function (a, b) { return a - b; });
            var medianAltitude;
            var mid = Math.floor(sorted.length / 2);
            if (sorted.length % 2 === 0) {
                medianAltitude = (sorted[mid - 1] + sorted[mid]) / 2;
            } else {
                medianAltitude = sorted[mid];
            }
            
            // ─── Low Pass Filtre ───
            if (!this._altitude.lowPassFilter && typeof LowPassFilter !== 'undefined') {
                this._altitude.lowPassFilter = new LowPassFilter(1.0, this.options.altitudeLowPassTau);
            }
            
            if (this._altitude.lowPassFilter) {
                this._altitude.lowPassFilter.addSample(medianAltitude);
                return this._altitude.lowPassFilter.lastOutput();
            }
            
            return medianAltitude;
        },
        
        // Kat tanımlarını doğrula — geçersiz aralık, çakışma ve boşlukları uyar.
        // (Sessiz yanlış kat tespitini önler.)
        _validateFloors: function (floors) {
            if (!Array.isArray(floors) || floors.length === 0) {
                console.warn('[SimpleLocate] floors boş veya dizi değil — kat tespiti devre dışı kalabilir.');
                return false;
            }

            var ok = true;
            var ranges = [];
            for (var i = 0; i < floors.length; i++) {
                var f = floors[i];
                if (f == null || typeof f.minAlt !== 'number' || typeof f.maxAlt !== 'number') {
                    console.warn('[SimpleLocate] floors[' + i + '] geçersiz: minAlt/maxAlt sayı olmalı.', f);
                    ok = false;
                    continue;
                }
                if (f.minAlt >= f.maxAlt) {
                    console.warn('[SimpleLocate] floors[' + i + '] ("' + (f.name || f.floor) +
                        '"): minAlt (' + f.minAlt + ') >= maxAlt (' + f.maxAlt + ').');
                    ok = false;
                }
                ranges.push({ min: f.minAlt, max: f.maxAlt, label: (f.name || ('Kat ' + f.floor)) });
            }

            // Aralıkları sırala ve çakışma/boşluk kontrolü yap
            ranges.sort(function (a, b) { return a.min - b.min; });
            for (var j = 1; j < ranges.length; j++) {
                var prev = ranges[j - 1];
                var cur = ranges[j];
                if (cur.min < prev.max) {
                    console.warn('[SimpleLocate] Kat aralıkları çakışıyor: "' + prev.label +
                        '" [' + prev.min + ',' + prev.max + ') ile "' + cur.label +
                        '" [' + cur.min + ',' + cur.max + ').');
                    ok = false;
                } else if (cur.min > prev.max) {
                    console.warn('[SimpleLocate] Kat aralıklarında boşluk var: "' + prev.label +
                        '" bitişi (' + prev.max + ') ile "' + cur.label +
                        '" başlangıcı (' + cur.min + ') arası tanımsız.');
                }
            }
            return ok;
        },

        // Kat tespiti
        _detectFloor: function (altitude) {
            var floor = null;
            var floorName = null;
            
            // ─── Yöntem 1: Manuel kat tanımları (öncelikli) ───
            if (this.options.floors && this.options.floors.length > 0) {
                for (var i = 0; i < this.options.floors.length; i++) {
                    var f = this.options.floors[i];
                    if (altitude >= f.minAlt && altitude < f.maxAlt) {
                        floor = f.floor;
                        floorName = f.name || ('Kat ' + f.floor);
                        break;
                    }
                }
            }
            // ─── Yöntem 2: Otomatik hesaplama (groundFloorAltitude + floorHeight) ───
            else if (this.options.groundFloorAltitude !== null) {
                var relativeHeight = altitude - this.options.groundFloorAltitude;
                var rawFloor = relativeHeight / this.options.floorHeight;
                floor = Math.round(rawFloor) + this.options.groundFloorNumber;
                floorName = 'Kat ' + floor;
            }
            
            if (floor === null) return;
            
            // ─── Histerezis: Küçük dalgalanmalarda kat değişimini engelle ───
            if (this._altitude.lastStableFloor !== null && floor !== this._altitude.lastStableFloor) {
                // Yeni katla eski kat arasındaki altitude farkı yeterli mi?
                var expectedAltForNewFloor;
                if (this.options.groundFloorAltitude !== null) {
                    expectedAltForNewFloor = this.options.groundFloorAltitude + 
                        (floor - this.options.groundFloorNumber) * this.options.floorHeight;
                    var distFromBoundary = Math.abs(altitude - expectedAltForNewFloor);
                    
                    // Kat sınırına yeterince yaklaşmadıysa kat değiştirme
                    if (distFromBoundary > (this.options.floorHeight / 2 - this.options.floorHysteresis)) {
                        // Histerezis eşiğini aştı → kat değiştir
                    } else {
                        // Sınırda salınım - önceki katı koru
                        floor = this._altitude.lastStableFloor;
                        floorName = 'Kat ' + floor;
                    }
                }
                
                // Minimum süre kontrolü (çok hızlı kat değişimini engelle)
                var now = Date.now();
                if (now - this._altitude.floorChangeTime < 3000) {
                    // Son 3 saniyede zaten kat değişimi oldu, bekle
                    floor = this._altitude.lastStableFloor;
                    floorName = 'Kat ' + floor;
                }
            }
            
            // Kat değiştiyse bildir
            if (this._altitude.floor !== floor) {
                var prevFloor = this._altitude.floor;
                this._altitude.floor = floor;
                this._altitude.floorName = floorName;
                this._altitude.lastStableFloor = floor;
                this._altitude.floorChangeTime = Date.now();
                
                // Kat değişimi bildirimi - callback'ten izlenebilir
            }
        },
        
        // Altitude verilerini sıfırla
        _resetAltitude: function () {
            this._altitude.raw = null;
            this._altitude.normalized = null;
            this._altitude.filtered = null;
            this._altitude.accuracy = null;
            this._altitude.floor = null;
            this._altitude.floorName = null;
            this._altitude.medianBuffer = [];
            this._altitude.lastStableFloor = null;
            this._altitude.sampleCount = 0;
            if (this._altitude.lowPassFilter && this._altitude.lowPassFilter.reset) {
                this._altitude.lowPassFilter.reset();
            }
        },
        
        // Dışarıdan altitude verilerini sorgula
        getAltitude: function () {
            return {
                raw: this._altitude.raw,
                normalized: this._altitude.normalized,
                filtered: this._altitude.filtered,
                accuracy: this._altitude.accuracy,
                floor: this._altitude.floor,
                floorName: this._altitude.floorName,
                platform: this._altitude.platform,
                sampleCount: this._altitude.sampleCount
            };
        },
        
        // Zemin kat kalibrasyonu (cihaz zemin kattayken çağrılır)
        calibrateGroundFloor: function () {
            if (this._altitude.filtered === null) {
                // Kalibrasyon yapılamadı: altitude verisi yok
                return null;
            }
            
            var groundAlt = this._altitude.filtered;
            this.options.groundFloorAltitude = groundAlt;
            this._altitude.floor = this.options.groundFloorNumber;
            this._altitude.floorName = 'Kat ' + this.options.groundFloorNumber;
            this._altitude.lastStableFloor = this.options.groundFloorNumber;
            
            // Zemin kat kalibre edildi
            return groundAlt;
        },

        // ════════════════════════════════════════════════════════
        // PEDESTRIAN DEAD RECKONING (PDR)
        // İç mekan sinyali kesildiğinde sensörlerle konum tahmini
        // ════════════════════════════════════════════════════════
        
        // PDR'ı başlat - son bilinen iç mekan konumunu baz alarak
        _startDeadReckoning: function () {
            if (!this.options.enableDeadReckoning) return;
            if (this._pdr.active) return; // Zaten aktif

            // iOS'ta devicemotion izni verilmemişse adım sayımı çalışmaz → uyar ve çık
            if (this._motionGranted === false) {
                if (!this._motionWarned) {
                    this._motionWarned = true;
                    console.warn('[SimpleLocate] PDR başlatılamadı: devicemotion izni yok (iOS). ' +
                        'Konum butonuna tekrar dokunup hareket sensörü iznini onaylayın.');
                }
                return;
            }

            // Baz konum: son bilinen geçerli iç mekan konumu
            var baseLat = this._latitude;
            var baseLng = this._longitude;
            
            if (!baseLat || !baseLng) {
                // PDR başlatılamadı: geçerli konum yok
                return;
            }
            
            // Yeniden giriş yumuşatması varsa iptal et (yeniden dışarı çıkıldı)
            this._reentry.active = false;

            this._pdr.active = true;
            this._pdr.startTime = Date.now();
            this._pdr.stepCount = 0;
            this._pdr.lastStepTime = 0;
            this._pdr.baseLatitude = baseLat;
            this._pdr.baseLongitude = baseLng;
            this._pdr.currentLatitude = baseLat;
            this._pdr.currentLongitude = baseLng;
            this._pdr.currentAccuracy = this.options.pdrInitialAccuracy;
            this._pdr.accelSource = null;
            this._pdr.gravityMag = null;
            this._pdr.linearBuf = [];
            this._pdr.armed = false;
            this._pdr.peakValue = 0;
            this._pdr.valleyValue = 0;
            this._pdr.armTime = 0;
            this._pdr.recentPeaks = [];
            this._pdr.dynamicThreshold = this.options.pdrStepThreshold;
            this._pdr.zuptBuf = [];
            this._pdr.stationary = false;
            this._pdr.pathLength = 0;
            this._pdr.headingSamples = [];
            this._pdr.dbgSamples = 0;
            this._pdr.dbgMaxLinear = 0;
            this._pdr.dbgLastEmit = Date.now();
            this._pdr.dbgStepsAtEmit = 0;
            
            // DeviceMotion dinlemeye başla
            var self = this;
            this._pdr.motionHandler = function (e) {
                self._onDeviceMotion(e);
            };
            
            window.addEventListener("devicemotion", this._pdr.motionHandler, false);
            
            // PDR başlatıldı
            
            // Callback bildir
            if (this.options.afterDeviceMove) {
                this.options.afterDeviceMove({
                    lat: baseLat,
                    lng: baseLng,
                    accuracy: this._pdr.currentAccuracy,
                    angle: this._angle,
                    isPDR: true,
                    pdrStepCount: 0,
                    pdrActive: true,
                    updateKind: 'pdr'
                });
            }
        },
        
        // PDR'ı durdur
        _stopDeadReckoning: function (reason) {
            if (!this._pdr.active) return;
            
            // DeviceMotion listener'ı kaldır
            if (this._pdr.motionHandler) {
                window.removeEventListener("devicemotion", this._pdr.motionHandler, false);
                this._pdr.motionHandler = null;
            }
            
            // PDR durduruldu

            // Jiroskop füzyonunu sıfırla → heading saf pusulaya döner
            this._lastGyroTime = 0;
            this._fusedHeading = null;
            this._gyroAccumSinceCompass = 0;
            this._lastCompassForSign = null;
            this._gyroSignDisagree = 0;

            this._pdr.active = false;
        },
        
        // PDR sinyal kaynağını oturum başına SABİTLE (kare kare değişmesin)
        // 'gravity' = accelerationIncludingGravity (her cihazda var, |mag| dönüşten bağımsız)
        // 'linear'  = acceleration (yerçekimsiz, varsa daha temiz)
        _resolvePdrAccel: function (event) {
            if (this._pdr.accelSource === 'gravity') return event.accelerationIncludingGravity;
            if (this._pdr.accelSource === 'linear') return event.acceleration;

            var g = event.accelerationIncludingGravity;
            if (g && g.x !== null && g.x !== undefined) {
                this._pdr.accelSource = 'gravity';
                return g;
            }
            var lin = event.acceleration;
            if (lin && lin.x !== null && lin.x !== undefined) {
                this._pdr.accelSource = 'linear';
                return lin;
            }
            return null;
        },

        // DeviceMotion event handler - adım tespiti (high-pass + histerezisli zirve)
        _onDeviceMotion: function (event) {
            if (!this._pdr.active) return;

            var now = Date.now();
            if (this.options.pdrMaxDuration > 0 && this.options.pdrMaxDuration !== Infinity &&
                now - this._pdr.startTime > this.options.pdrMaxDuration) {
                this._stopDeadReckoning("süre limiti aşıldı");
                return;
            }
            if (this.options.pdrMaxSteps > 0 && this.options.pdrMaxSteps !== Infinity &&
                this._pdr.stepCount >= this.options.pdrMaxSteps) {
                this._stopDeadReckoning("adım limiti aşıldı");
                return;
            }

            // ── Perf: devicemotion throttle ──
            // motionUpdateHz > 0 ise örnekleri hedef Hz'e seyrelt. dt tabanlı entegrasyon
            // korunduğundan adım/heading doğruluğu etkilenmez (adım sinyali ~2 Hz).
            if (this.options.motionUpdateHz > 0) {
                var minGap = 1000 / this.options.motionUpdateHz;
                if (this._lastMotionProcess && (now - this._lastMotionProcess) < minGap) return;
                this._lastMotionProcess = now;
            }

            // ── Jiroskop entegrasyonu (tamamlayıcı filtre) ──
            // rotationRate.alpha (z ekseni, deg/s) ile heading'i kısa vadede entegre et.
            // Pusula düzeltmesi _fuseHeading içinde (her pusula örneğinde) uygulanır.
            if (this.options.headingGyroFusion && event.rotationRate &&
                event.rotationRate.alpha !== null && event.rotationRate.alpha !== undefined) {
                var dtG = this._lastGyroTime ? (now - this._lastGyroTime) / 1000 : 0;
                if (dtG > 0 && dtG < 0.5) {
                    // A1: ham entegrali işaret oylaması için biriktir (işaretten bağımsız)
                    this._gyroAccumSinceCompass += event.rotationRate.alpha * dtG;
                    if (this._fusedHeading !== null) {
                        var gsign = this.options.headingGyroSign || -1;
                        this._fusedHeading = (this._fusedHeading + gsign * event.rotationRate.alpha * dtG + 360) % 360;
                        this._angle = this._fusedHeading;
                        document.documentElement.style.setProperty(
                            "--leaflet-simple-locate-orientation", -this._angle + "deg");
                    }
                }
                this._lastGyroTime = now;
            }

            var a = this._resolvePdrAccel(event);
            if (!a || a.x === null || a.x === undefined) return;

            // Büyüklük (vektör normu) — telefon yönünden bağımsız
            var mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);

            // High-pass: yerçekimini yavaş EMA ile ayır (~0.5Hz cutoff → 2Hz adım sinyali korunur)
            var sig;
            if (this._pdr.accelSource === 'linear') {
                sig = mag; // zaten yerçekimsiz
            } else {
                if (this._pdr.gravityMag == null) this._pdr.gravityMag = mag;
                this._pdr.gravityMag = this._pdr.gravityMag * 0.9 + mag * 0.1;
                sig = mag - this._pdr.gravityMag; // 0 etrafında salınım (adımda + zirve)
            }

            // Hafif yumuşatma (3 örnek) — tek örnek gürültüsünü kes, zirveyi koru
            this._pdr.linearBuf.push(sig);
            if (this._pdr.linearBuf.length > 3) this._pdr.linearBuf.shift();
            var s = 0;
            for (var i = 0; i < this._pdr.linearBuf.length; i++) s += this._pdr.linearBuf[i];
            s /= this._pdr.linearBuf.length;

            // Teşhis: saniyede bir sinyal özeti yayınla
            this._pdr.dbgSamples++;
            if (s > this._pdr.dbgMaxLinear) this._pdr.dbgMaxLinear = s;

            var thHigh = this._pdr.dynamicThreshold || this.options.pdrStepThreshold;
            var thLow = thHigh * 0.5;

            // ── B1: ZUPT (duruş tespiti) ──
            // Son N örneğin varyansı düşükse cihaz hareketsizdir; el titremesi/gürültü
            // adıma dönüşmesin diye zirve algılamayı bastır ve mevcut zirveyi iptal et.
            if (this.options.pdrZupt) {
                this._pdr.zuptBuf.push(sig);
                if (this._pdr.zuptBuf.length > this.options.pdrZuptWindow) this._pdr.zuptBuf.shift();
                if (this._pdr.zuptBuf.length >= this.options.pdrZuptWindow) {
                    var zMean = 0, zb = this._pdr.zuptBuf, zn = zb.length;
                    for (var zi = 0; zi < zn; zi++) zMean += zb[zi];
                    zMean /= zn;
                    var zVar = 0;
                    for (var zj = 0; zj < zn; zj++) { var zd = zb[zj] - zMean; zVar += zd * zd; }
                    zVar /= zn;
                    this._pdr.stationary = zVar < this.options.pdrZuptVariance;
                } else {
                    this._pdr.stationary = false;
                }
                if (this._pdr.stationary) {
                    this._pdr.armed = false;
                    this._pdr.peakValue = 0;
                    this._pdr.valleyValue = 0;
                }
            }

            // ── Histerezisli zirve algılama ──
            // sig eşiği yukarı geçince "armed"; tekrar alt banda düşünce 1 adım tamamlanır.
            if (this._pdr.stationary) {
                // duruşta adım sayma — sadece teşhis akışı aşağıda devam eder
            } else if (!this._pdr.armed) {
                if (s > thHigh) {
                    this._pdr.armed = true;
                    this._pdr.peakValue = s;
                    this._pdr.valleyValue = s;
                    this._pdr.armTime = now;
                }
            } else {
                if (s > this._pdr.peakValue) this._pdr.peakValue = s;
                if (s < this._pdr.valleyValue) this._pdr.valleyValue = s;

                if (s < thLow) {
                    // Tam bir zirve tamamlandı
                    if (this._pdr.peakValue >= this.options.pdrMinPeakValue &&
                        now - this._pdr.lastStepTime > this.options.pdrStepCooldown) {
                        this._pdr.lastStepTime = now;
                        this._registerPdrPeak(this._pdr.peakValue);
                        // Genlik (zirve − vadi) dinamik adım uzunluğu için kullanılır
                        var amplitude = this._pdr.peakValue - this._pdr.valleyValue;
                        this._onStepDetected(amplitude);
                    }
                    this._pdr.armed = false;
                    this._pdr.peakValue = 0;
                    this._pdr.valleyValue = 0;
                } else if (now - this._pdr.armTime > 1500) {
                    // Güvenlik: çok uzun süre yüksekte kalındıysa (sürekli sarsıntı) sıfırla
                    this._pdr.armed = false;
                    this._pdr.peakValue = 0;
                    this._pdr.valleyValue = 0;
                }
            }

            // Teşhis yayını (saniyede bir, panel loglayabilir)
            if (now - this._pdr.dbgLastEmit >= 1000) {
                if (typeof this._pdrSampleTick === 'function') {
                    var dt = (now - this._pdr.dbgLastEmit) / 1000;
                    this._pdrSampleTick({
                        hz: Math.round(this._pdr.dbgSamples / Math.max(dt, 0.001)),
                        maxLinear: this._pdr.dbgMaxLinear,
                        threshold: thHigh,
                        source: this._pdr.accelSource,
                        stepsDelta: this._pdr.stepCount - this._pdr.dbgStepsAtEmit
                    });
                }
                this._pdr.dbgSamples = 0;
                this._pdr.dbgMaxLinear = 0;
                this._pdr.dbgLastEmit = now;
                this._pdr.dbgStepsAtEmit = this._pdr.stepCount;
            }
        },

        // Adaptif eşik — nazik ve tavanlı (tırmanmayı önler)
        _registerPdrPeak: function (peak) {
            if (!this.options.pdrAdaptiveThreshold) return;
            this._pdr.recentPeaks.push(peak);
            if (this._pdr.recentPeaks.length > 6) this._pdr.recentPeaks.shift();
            if (this._pdr.recentPeaks.length < 3) return;
            var sum = 0;
            for (var p = 0; p < this._pdr.recentPeaks.length; p++) sum += this._pdr.recentPeaks[p];
            var avg = sum / this._pdr.recentPeaks.length;
            var base = this.options.pdrStepThreshold;
            // Eşik ≈ tipik zirvenin %45'i; [base×0.6, base×1.4] arasında tutulur
            this._pdr.dynamicThreshold = Math.min(base * 1.4, Math.max(base * 0.6, avg * 0.45));
        },

        // Teşhis kancası (panel sarar; çekirdekte no-op)
        _pdrSampleTick: function (info) {},

        // Adım uzunluğu kestirimi (Weinberg modeli)
        // stepLength = K · ⁴√(a_max − a_min), [min, max] aralığında sınırlanır.
        // Dinamik mod kapalıysa veya genlik geçersizse sabit pdrStepLength döner.
        _computeStepLength: function (amplitude) {
            if (!this.options.pdrDynamicStepLength ||
                !amplitude || amplitude <= 0 || !isFinite(amplitude)) {
                return this.options.pdrStepLength;
            }
            var len = this.options.pdrStepLengthFactor * Math.pow(amplitude, 0.25);
            return Math.min(this.options.pdrStepLengthMax,
                Math.max(this.options.pdrStepLengthMin, len));
        },

        // Bir adım algılandı - konum güncelle
        // amplitude: bu adımın ivme genliği (zirve − vadi); dinamik adım uzunluğu için
        _onStepDetected: function (amplitude) {
            var heading = this._angle;
            if (heading === undefined || heading === null) {
                return 'no_heading';
            }

            var stepLength = this._computeStepLength(amplitude);
            var headingRad = heading * (Math.PI / 180);
            var latOffset = (stepLength * Math.cos(headingRad)) / 111320;
            var lngOffset = (stepLength * Math.sin(headingRad)) / (111320 * Math.cos(this._pdr.currentLatitude * Math.PI / 180));

            var newLat = this._pdr.currentLatitude + latOffset;
            var newLng = this._pdr.currentLongitude + lngOffset;

            var geofenceCheck = this._isInsideGeofence(newLat, newLng);
            if (!geofenceCheck.inside) {
                return 'geofence';
            }

            this._pdr.stepCount++;
            this._pdr.currentLatitude = newLat;
            this._pdr.currentLongitude = newLng;
            this._pdr.currentAccuracy += this.options.pdrAccuracyDecay;
            // A2: kalibrasyon için yol uzunluğu ve adım yönlerini biriktir
            this._pdr.pathLength += stepLength;
            this._pdr.headingSamples.push(heading);
            this._latitude = newLat;
            this._longitude = newLng;
            this._accuracy = this._pdr.currentAccuracy;
            this._updateMarker();
            return 'ok';
        },

        // A2: PDR oturumu sinyal geri gelerek bittiğinde adım uzunluğu katsayısını (K)
        // öğren. Düz yürüyüşte (heading varyansı düşük) baş↔son GPS düz mesafesi ≈ kat
        // edilen yol olmalı; oran K'yı bu cihaz/kişi için kalibre eder. Sınırlı + yumuşak.
        _calibrateStepLength: function (endLat, endLng, endAccuracy) {
            if (!this.options.pdrAutoCalibrate || !this.options.pdrDynamicStepLength) return;
            var steps = this._pdr.stepCount;
            var pathLen = this._pdr.pathLength;
            if (steps < this.options.pdrCalibrateMinSteps || pathLen <= 0) return;
            if (endAccuracy !== undefined && endAccuracy !== null &&
                endAccuracy > this.options.gpsCourseMaxAccuracy) return;
            if (this._pdr.baseLatitude == null || this._pdr.baseLongitude == null) return;

            // Düz yürüyüş şartı: adım yönlerinin dairesel yayılımı düşük olmalı
            var hs = this._pdr.headingSamples;
            if (hs.length >= 3) {
                var sinS = 0, cosS = 0, d2r = Math.PI / 180;
                for (var i = 0; i < hs.length; i++) { sinS += Math.sin(hs[i] * d2r); cosS += Math.cos(hs[i] * d2r); }
                var R = Math.sqrt(sinS * sinS + cosS * cosS) / hs.length; // 1=düz, 0=dağınık
                var circStdDeg = Math.sqrt(-2 * Math.log(Math.max(R, 1e-6))) * (180 / Math.PI);
                if (circStdDeg > this.options.pdrCalibrateMaxHeadingVar) return;
            }

            var straight = L.latLng(this._pdr.baseLatitude, this._pdr.baseLongitude)
                .distanceTo(L.latLng(endLat, endLng));
            if (straight < 1) return; // anlamsız küçük

            var ratio = straight / pathLen;
            if (ratio < 0.5 || ratio > 1.6) return; // aşırı sapma = güvenilmez örnek

            var newK = this.options.pdrStepLengthFactor * ratio;
            newK = Math.min(this.options.pdrStepLengthFactorMax,
                Math.max(this.options.pdrStepLengthFactorMin, newK));
            var blend = this.options.pdrCalibrateBlend;
            this.options.pdrStepLengthFactor =
                this.options.pdrStepLengthFactor * (1 - blend) + newK * blend;
        },
        
        // PDR aktif mi? (dışarıdan sorgulanabilir)
        isDeadReckoningActive: function () {
            return this._pdr.active;
        },
        
        // PDR durumunu al
        getDeadReckoningState: function () {
            return {
                active: this._pdr.active,
                stepCount: this._pdr.stepCount,
                accuracy: this._pdr.currentAccuracy,
                duration: this._pdr.active ? Date.now() - this._pdr.startTime : 0,
                basePosition: this._pdr.baseLatitude ? {
                    lat: this._pdr.baseLatitude,
                    lng: this._pdr.baseLongitude
                } : null
            };
        },

        _onZoomStart: function () {
            // Zoom animasyonu boyunca circle/marker'a setLatLng/setRadius ÇAĞIRMA.
            // Leaflet bu katmanları animasyonla zaten doğru taşır; animasyon ortasında
            // yeniden projelendirme yaparsak "kayma" oluşur (zoomend'de düzelir).
            this._isZooming = true;
        },

        _onZoomEnd: function () {
            this._isZooming = false;
            // Animasyon bitti; konum/circle'ı nihai harita durumuna göre senkronla.
            if (this._latitude && this._longitude) {
                this._updateMarker();
            }
        },

        _onLayerAdd: function (event) {
            if (this.options.afterMarkerAdd && event.layer == this._marker) {
                this.options.afterMarkerAdd();
            }
        },

        _setView: function () {
            if (!this._map || !this._latitude || !this._longitude) return;

            if (this.options.zoomLevel)
                this._map.setView([this._latitude, this._longitude], this.options.zoomLevel);
            else
                this._map.setView([this._latitude, this._longitude]);
        },

        _updateButton: function () {
            if (!this._clicked) {
                if (this._button.html_name !== "init") {
                    this._button.innerHTML = this.options.htmlInit;
                    this._button.html_name = "init";
                }
                return;
            }

            if (typeof this._geolocation === "undefined" || typeof this._orientation === "undefined") {
                if (this._button.html_name !== "spinner") {
                    this._button.innerHTML = this.options.htmlSpinner;
                    this._button.html_name = "spinner";
                }
                return;
            }

            if (this._orientation && this._button.html_name !== "orientation") {
                this._button.innerHTML = this.options.htmlOrientation;
                this._button.html_name = "orientation";
                return;
            }

            if (this._geolocation && this._button.html_name !== "geolocation") {
                this._button.innerHTML = this.options.htmlGeolocation;
                this._button.html_name = "geolocation";
            }
        },

        _updateMarker: function (opts) {
            opts = opts || {};

            // Geofence düzeltmesi callback'ten ÖNCE (loglama doğru fallback/PDR modunu görsün)
            if (this._latitude && this._longitude && typeof this._isInsideGeofence === 'function') {
                const markerGeofenceCheck = this._isInsideGeofence(this._latitude, this._longitude);
                if (!markerGeofenceCheck.inside) {
                    // Koordinat düzeltmesi her durumda yapılır; fallback bayrağı ise
                    // histerezis onaylarsa değişir (mod titremesini engellemek için)
                    if (this._updateFallbackHysteresis(true)) {
                        this._isFallbackLocation = true;
                    }
                    if (this._pdr.active) {
                        this._latitude = this._pdr.currentLatitude;
                        this._longitude = this._pdr.currentLongitude;
                        this._accuracy = this._pdr.currentAccuracy;
                    } else if (this._lastGoodLocation.latitude && this._lastGoodLocation.longitude) {
                        this._latitude = this._lastGoodLocation.latitude;
                        this._longitude = this._lastGoodLocation.longitude;
                        this._accuracy = this._lastGoodLocation.accuracy || this._accuracy;
                    }
                }
            }

            if (this.options.afterDeviceMove) {
                var updateKind = opts.orientationOnly ? 'orientation'
                    : (this._pdr.active ? 'pdr' : 'position');
                this.options.afterDeviceMove({
                    lat: this._latitude,
                    lng: this._longitude,
                    accuracy: this._accuracy,
                    angle: this._angle,
                    isFiltered: true,
                    isJump: this._weiYeState.isJumpDetected,
                    filterStats: this._weiYeState.filteringStats,
                    confidence: this._lastGoodLocation.confidence,
                    locationStats: this._locationStats,
                    isFallback: !!this._isFallbackLocation,
                    isIndoorMode: this.options.indoorMode,
                    consecutiveBadLocations: this._consecutiveBadLocations,
                    isPDR: this._pdr.active,
                    pdrStepCount: this._pdr.stepCount,
                    pdrAccuracy: this._pdr.currentAccuracy,
                    altitude: this._altitude.filtered,
                    altitudeRaw: this._altitude.raw,
                    altitudeAccuracy: this._altitude.accuracy,
                    altitudePlatform: this._altitude.platform,
                    floor: this._altitude.floor,
                    floorName: this._altitude.floorName,
                    updateKind: updateKind
                });
            }

            if (!this._latitude || !this._longitude || (this.options.drawCircle && !this._accuracy)) {
                return;
            }

            // Zoom animasyonu sırasında circle/marker'ı yeniden konumlandırma (kayma önlenir).
            // Leaflet mevcut katmanları animasyonla taşır; _onZoomEnd nihai senkronu yapar.
            if (this._isZooming) {
                return;
            }

            let icon_type;
            if (this._geolocation && this._orientation && this._angle) icon_type = "orientation";
            else if (this._geolocation) icon_type = "geolocation";
            else {
                return;
            }

            // Accuracy circle güncelle
            var circleColor = this._getAccuracyColor(this._accuracy);
            var cFill = this.options.circleFillOpacity;
            var cStroke = this.options.circleStrokeOpacity;

            if (this._circle) {
                this._circle.setLatLng([this._latitude, this._longitude]);
                this._circle.setRadius(this._accuracy);
                this._circle.setStyle({
                    fillColor: circleColor,
                    color: circleColor,
                    fillOpacity: cFill,
                    opacity: cStroke,
                    weight: 1,
                    dashArray: ''
                });
            } else if (this.options.drawCircle) {
                this._circle = L.circle([this._latitude, this._longitude], {
                    radius: this._accuracy,
                    fillColor: circleColor,
                    color: circleColor,
                    fillOpacity: cFill,
                    opacity: cStroke,
                    weight: 1,
                    dashArray: ''
                }).addTo(this._map);
            }

            // Fallback durumuna göre ikon renklerini belirle
            var isFb = this.options.fadeMarkerOnFallback && this._isFallbackLocation;
            var dotColor = isFb ? this.options.fallbackMarkerColor : this.options.markerColor;
            var arrowColor = isFb ? this.options.fallbackOrientationColor : this.options.orientationColor;
            var ringColor = this.options.markerRingColor;
            var shadowColor = this.options.markerShadowColor;

            // Renk veya tip değişti mi? (yeniden oluştur)
            var needsRebuild = !this._marker ||
                this._marker._iconType !== icon_type ||
                this._marker._iconDotColor !== dotColor ||
                this._marker._iconArrowColor !== arrowColor;

            if (!needsRebuild) {
                this._marker.setLatLng([this._latitude, this._longitude]);
            } else {
                if (this._marker) this._map.removeLayer(this._marker);
                var icon = (icon_type === 'orientation')
                    ? this._buildOrientationIcon(dotColor, ringColor, shadowColor, arrowColor)
                    : this._buildGeolocationIcon(dotColor, ringColor, shadowColor);
                this._marker = L.marker([this._latitude, this._longitude], { icon: icon });
                this._marker._iconType = icon_type;
                this._marker._iconDotColor = dotColor;
                this._marker._iconArrowColor = arrowColor;
                this._marker.addTo(this._map);
            }
            
            // Fallback opacity
            this._applyMarkerFallbackStyle();

            this._lastAccuracy = this._accuracy;
        },

        _applyMarkerFallbackStyle: function () {
            if (!this._marker || !this._marker._icon) return;
            
            var icon = this._marker._icon;
            
            if (this.options.fadeMarkerOnFallback && this._isFallbackLocation) {
                icon.style.opacity = this.options.fallbackMarkerOpacity;
                icon.style.transition = 'opacity 0.3s ease';
            } else {
                icon.style.opacity = '1';
                icon.style.transition = 'opacity 0.3s ease';
            }
        },

        _buildGeolocationIcon: function (dotColor, ringColor, shadowColor) {
            var c = dotColor || this.options.markerColor;
            var r = ringColor || this.options.markerRingColor;
            var s = shadowColor || this.options.markerShadowColor;
            return L.divIcon({
                html: '<svg width="24" height="24" viewBox="-12 -12 24 24" xmlns="http://www.w3.org/2000/svg">' +
                    '<defs><filter id="sl-shadow"><feGaussianBlur stdDeviation="0.5"/></filter></defs>' +
                    '<circle fill="' + s + '" style="opacity:0.3;filter:url(#sl-shadow)" cx="1" cy="1" r="10"/>' +
                    '<circle fill="' + r + '" r="10"/>' +
                    '<circle fill="' + c + '" r="6">' +
                    '<animate attributeName="r" values="6;8;6" dur="2s" repeatCount="indefinite"/>' +
                    '</circle></svg>',
                className: 'leaflet-simple-locate-icon',
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });
        },

        _buildOrientationIcon: function (dotColor, ringColor, shadowColor, arrowColor) {
            var c = dotColor || this.options.markerColor;
            var r = ringColor || this.options.markerRingColor;
            var s = shadowColor || this.options.markerShadowColor;
            var a = arrowColor || this.options.orientationColor;
            return L.divIcon({
                html: '<svg width="96" height="96" viewBox="-48 -48 96 96" xmlns="http://www.w3.org/2000/svg">' +
                    '<defs>' +
                    '<linearGradient id="sl-grad" x2="0" y2="-48" gradientUnits="userSpaceOnUse">' +
                    '<stop style="stop-color:' + a + ';stop-opacity:1" offset="0"/>' +
                    '<stop style="stop-color:' + a + ';stop-opacity:0" offset="1"/>' +
                    '</linearGradient>' +
                    '<filter id="sl-shadow"><feGaussianBlur stdDeviation="0.5"/></filter>' +
                    '</defs>' +
                    '<path class="orientation" opacity="1" style="fill:url(#sl-grad)" d="M -24,-48 H 24 L 10,0 H -10 z">' +
                    '<animate attributeName="opacity" values=".75;.33;.75" dur="2s" repeatCount="indefinite"/>' +
                    '</path>' +
                    '<circle fill="' + s + '" style="opacity:0.3;filter:url(#sl-shadow)" cx="1" cy="1" r="10"/>' +
                    '<circle fill="' + r + '" r="10"/>' +
                    '<circle fill="' + c + '" r="6">' +
                    '<animate attributeName="r" values="6;9;6" dur="2s" repeatCount="indefinite"/>' +
                    '</circle></svg>',
                className: 'leaflet-simple-locate-icon',
                iconSize: [96, 96],
                iconAnchor: [48, 48]
            });
        },

        _getAccuracyColor: function (accuracy) {
            return this.options.circleColor || '#000000';
        },

        // Kalman filtresini uygula
        _applyKalmanFilter: function (position) {
            const kf = this._kalmanFilter;

            // İlk ölçümde Kalman filtresini başlat
            if (kf.x_lat === null || kf.x_lng === null) {
                kf.x_lat = position.latitude;
                kf.x_lng = position.longitude;
                // Başlangıç kovaryansını yüksek tut (belirsizlik yüksek)
                kf.P_lat = 1.0;
                kf.P_lng = 1.0;

                return {
                    latitude: position.latitude,
                    longitude: position.longitude,
                    accuracy: position.accuracy,
                    timestamp: position.timestamp
                };
            }

            // iOS için özel düzeltme: Eğer timestamp çok eskiyse veya çok büyük bir sıçrama varsa,
            // filtreyi sıfırla ve yeni konumu kabul et
            const lastPosition = this._weiYeState.lastFilteredPosition;
            if (lastPosition && position.timestamp) {
                const timeDiff = Math.abs(position.timestamp - (lastPosition.timestamp || Date.now())) / 1000; // saniye cinsinden

                // iOS'ta bazen timestamp'ler düzgün gelmeyebilir veya çok büyük gecikmeler olabilir
                // Eğer 30 saniyeden fazla geçtiyse ve büyük bir mesafe varsa, filtreyi sıfırla
                if (timeDiff > 30) {
                    const distance = L.latLng(lastPosition.latitude, lastPosition.longitude)
                        .distanceTo(L.latLng(position.latitude, position.longitude));

                    if (distance > 50) {
                        // iOS'ta büyük bir sıçrama ve uzun gecikme varsa, filtreyi sıfırla
                        kf.x_lat = position.latitude;
                        kf.x_lng = position.longitude;
                        kf.P_lat = 1.0;
                        kf.P_lng = 1.0;

                        return {
                            latitude: position.latitude,
                            longitude: position.longitude,
                            accuracy: position.accuracy,
                            timestamp: position.timestamp
                        };
                    }
                }
            }

            // ── C2 (deneysel): sabit-hız (constant-velocity) Kalman ──
            // Konum + hız takip eder; tahmini x += v·dt ile yürütür. Yürürken sabit-konum
            // modelinin gecikmesini belirgin azaltır. Yalnızca experimentalFusion açıkken.
            if (this.options.experimentalFusion) {
                return this._applyKalmanCV(position);
            }

            // Kalman filtresi adımları
            // 1. Tahmin (Prediction)
            // Durum tahmini aynı kalır (durağan model varsayımı)
            const x_pred_lat = kf.x_lat;
            const x_pred_lng = kf.x_lng;

            // Tahmin hatası kovaryansı artar (Q eklenir)
            const P_pred_lat = kf.P_lat + kf.Q_lat;
            const P_pred_lng = kf.P_lng + kf.Q_lng;

            // 2. Güncelleme (Update)
            // Kalman kazancı
            const K_lat = P_pred_lat / (P_pred_lat + kf.R_lat);
            const K_lng = P_pred_lng / (P_pred_lng + kf.R_lng);

            // Güncellenmiş durum tahmini
            kf.x_lat = x_pred_lat + K_lat * (position.latitude - x_pred_lat);
            kf.x_lng = x_pred_lng + K_lng * (position.longitude - x_pred_lng);

            // Güncellenmiş tahmin hatası kovaryansı
            kf.P_lat = (1 - K_lat) * P_pred_lat;
            kf.P_lng = (1 - K_lng) * P_pred_lng;

            // iOS için özel düzeltme: Eğer filtrelenmiş konum çok uzaklaşırsa, 
            // iOS'ta genellikle kuzeye kayma sorunu olabilir
            // Bu durumda filtrelenmiş değeri sınırla
            const filteredDistance = L.latLng(position.latitude, position.longitude)
                .distanceTo(L.latLng(kf.x_lat, kf.x_lng));

            // Eğer filtrelenmiş konum ham konumdan çok uzaksa (accuracy'nin 2 katından fazla),
            // iOS'ta bu genellikle bir hata işaretidir
            const maxAllowedDistance = Math.max(position.accuracy * 2, 20); // En az 20m

            if (filteredDistance > maxAllowedDistance) {
                // Dinamik blend faktörü: Mesafe ve accuracy'ye göre hesapla
                // Mesafe arttıkça blend faktörü artar (daha fazla ham değer kullan)
                const normalizedDistance = Math.min(1.0, filteredDistance / (maxAllowedDistance * 2));
                const blendFactor = Math.min(0.85, Math.max(0.5, 0.5 + normalizedDistance * 0.35));

                kf.x_lat = blendFactor * position.latitude + (1 - blendFactor) * kf.x_lat;
                kf.x_lng = blendFactor * position.longitude + (1 - blendFactor) * kf.x_lng;
            }

            return {
                latitude: kf.x_lat,
                longitude: kf.x_lng,
                accuracy: position.accuracy,
                timestamp: position.timestamp
            };
        },

        // C2 (deneysel): sabit-hız (alpha-beta) Kalman.
        // Konum ve hızı birlikte takip eder; tahmin x += v·dt ile yürür, ölçüm artığıyla
        // hem konum hem hız düzeltilir. Yürürken gecikmeyi azaltır. Güven (accuracy) düştükçe
        // ölçüme daha az güvenir. Hız insan yürüyüşüne sınırlanır (overshoot/fırlamayı önler).
        _applyKalmanCV: function (position) {
            const kf = this._kalmanFilter;
            const now = position.timestamp || Date.now();
            const dt = kf.cvTime ? (now - kf.cvTime) / 1000 : 0;

            // İlk örnek veya geçersiz dt → yeniden başlat
            if (kf.x_lat === null || kf.x_lng === null || dt <= 0.05 || dt > 5) {
                kf.x_lat = position.latitude;
                kf.x_lng = position.longitude;
                kf.v_lat = 0;
                kf.v_lng = 0;
                kf.cvTime = now;
                return {
                    latitude: position.latitude,
                    longitude: position.longitude,
                    accuracy: position.accuracy,
                    timestamp: position.timestamp
                };
            }

            // Ölçüm güvenine göre konum kazancı (accuracy iyi → büyük alpha)
            var acc = position.accuracy || 20;
            var alpha = Math.min(0.8, Math.max(0.2, 0.8 - acc / 80));
            var beta = (alpha * alpha) / (2 - alpha); // alpha-beta kararlı ilişki

            // Tahmin
            var predLat = kf.x_lat + kf.v_lat * dt;
            var predLng = kf.x_lng + kf.v_lng * dt;

            // Artık (residual)
            var rLat = position.latitude - predLat;
            var rLng = position.longitude - predLng;

            // Güncelleme
            kf.x_lat = predLat + alpha * rLat;
            kf.x_lng = predLng + alpha * rLng;
            kf.v_lat = kf.v_lat + (beta / dt) * rLat;
            kf.v_lng = kf.v_lng + (beta / dt) * rLng;

            // Hızı insan yürüyüşüne sınırla (derece/sn) → fırlamayı önle
            var maxSpeed = (this.options.indoorMode ? this.options.maxIndoorSpeed : this.options.maxHumanSpeed) || 3;
            var maxVLat = maxSpeed / 111320;
            var cosL = Math.cos(kf.x_lat * Math.PI / 180) || 1;
            var maxVLng = maxSpeed / (111320 * Math.abs(cosL || 1));
            if (kf.v_lat > maxVLat) kf.v_lat = maxVLat; else if (kf.v_lat < -maxVLat) kf.v_lat = -maxVLat;
            if (kf.v_lng > maxVLng) kf.v_lng = maxVLng; else if (kf.v_lng < -maxVLng) kf.v_lng = -maxVLng;

            // Güvenlik: filtre ölçümden çok uzaklaştıysa ölçüme çek (sabit-konumdaki ile aynı mantık)
            var filteredDistance = L.latLng(position.latitude, position.longitude)
                .distanceTo(L.latLng(kf.x_lat, kf.x_lng));
            var maxAllowed = Math.max(position.accuracy * 2, 20);
            if (filteredDistance > maxAllowed) {
                kf.x_lat = 0.6 * position.latitude + 0.4 * kf.x_lat;
                kf.x_lng = 0.6 * position.longitude + 0.4 * kf.x_lng;
            }

            kf.cvTime = now;
            return {
                latitude: kf.x_lat,
                longitude: kf.x_lng,
                accuracy: position.accuracy,
                timestamp: position.timestamp
            };
        },

        // Kullanıcı hareketini tespit et (HAM GPS geçmişinden)
        _detectUserMoving: function () {
            const mh = this._movementHistory;

            // Geçmiş penceresinde yeterli veri yoksa, hareket halinde kabul et
            if (mh.positions.length < 3) {
                return true; // Varsayılan olarak hareket halinde kabul et
            }

            // Son birkaç ölçüm arasındaki mesafeyi hesapla
            let totalDistance = 0;
            let timeSpan = 0;

            for (let i = 1; i < mh.positions.length; i++) {
                const prevPos = mh.positions[i - 1];
                const currPos = mh.positions[i];

                const distance = L.latLng(prevPos.latitude, prevPos.longitude)
                    .distanceTo(L.latLng(currPos.latitude, currPos.longitude));
                totalDistance += distance;

                if (mh.timestamps[i] && mh.timestamps[i - 1]) {
                    timeSpan += Math.abs(mh.timestamps[i] - mh.timestamps[i - 1]);
                }
            }

            if (timeSpan < 100 || timeSpan > 60000) {
                return true;
            }

            const avgSpeed = (totalDistance / (timeSpan / 1000));
            // Ham GPS ile eşik biraz daha düşük olabilir (LPF kadar şişmez)
            const speedThreshold = this._isIOS ? 0.55 : 0.35;

            return avgSpeed > speedThreshold;
        },

        // Hareket geçmişini güncelle (ham GPS konumlarıyla çağrılmalı)
        _updateMovementHistory: function (position) {
            const mh = this._movementHistory;
            const timestamp = position.timestamp || Date.now();

            // Yeni konumu ekle
            mh.positions.push({
                latitude: position.latitude,
                longitude: position.longitude
            });
            mh.timestamps.push(timestamp);

            // Maksimum boyutu aşarsa en eskisini kaldır
            while (mh.positions.length > mh.maxSize) {
                mh.positions.shift();
                mh.timestamps.shift();
            }
        },

        // Uzun süreli hareketsizlik tespiti (opsiyonel)
        _detectStationaryState: function () {
            const m = this._medianFilter;

            // Geçmiş penceresinde yeterli veri yoksa, durağan değil
            if (m.latHistory.length < m.windowSize) {
                return false;
            }

            // Penceredeki ilk ve son konum arasındaki farkı hesapla
            const firstLat = m.latHistory[0];
            const firstLng = m.lngHistory[0];
            const lastLat = m.latHistory[m.latHistory.length - 1];
            const lastLng = m.lngHistory[m.lngHistory.length - 1];

            const distance = L.latLng(firstLat, firstLng).distanceTo(L.latLng(lastLat, lastLng));

            // 5 metreden az hareket olduysa, durağan kabul et
            return distance < 5;
        }
    });

    L.control.simpleLocate = function (options) {
        return new SimpleLocate(options);
    };

    return SimpleLocate;
});