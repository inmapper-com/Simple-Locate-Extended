# Leaflet SimpleLocate Extended

Leaflet tabanlı iç/dış mekan konum takip eklentisi. GPS filtreleme, geofence, pedestrian dead reckoning (PDR), yükseklik/kat tespiti ve yön algılama içerir.

## Dosya Yapısı

```
src/
├── low-pass-filter.js            # UMD low-pass filtre modülü
├── leaflet-simple-locate.js      # Ana Leaflet control (filtreleme, PDR, altitude)
├── simple-locate-extended.js     # Extended API katmanı (runtime kontrol, geofence çizim)
├── simple-locate-floorplan.js    # SVG kat planı → en yakın birim (opsiyonel)
├── simple-locate-panel.js        # Birleşik kontrol paneli (Ayarlar + Loglar drawer)
└── simple-locate-replay.js       # Tarayıcıda log replay (log-viewer simülasyonu)
dist/                             # Minified çıktılar (npm run build ile üretilir)
images/                           # SVG ikonlar (geolocation, orientation, spinner)
demo/plans/                       # IST kat planı SVG'leri + hazır yapılandırma
tools/
├── replay-log.js                 # Kaydedilmiş log'u eklentiyle çevrimdışı yeniden oynatır
├── filter-scenarios.js           # Filtre/yeniden çıpalama senaryoları (npm run test:filter)
├── floor-scenarios.js            # Kat tespiti senaryoları (npm run test:floors)
├── inspect-plan.js               # SVG planın katman/id dağılımı (npm run inspect:plan)
└── reanchor-sweep.js             # Yeniden çıpalama parametre taraması (npm run sweep)
app.html                          # Ana uygulama — İstanbul Havalimanı iç mekan konumlama
index.html                        # Site kökü — app.html'e yönlendirir + demo bağlantıları
log-viewer.html                   # Kayıtlı loglar: pin no, gösterge önizleme, A/B simülasyon
demo-colors.html                  # Renk / görünüm denemesi
build.js                          # Minify build script'i (terser)
```

## Bağımlılıklar

| Kütüphane | Versiyon | Kaynak |
|-----------|----------|--------|
| Leaflet   | 1.9.4    | CDN    |

Çalışma zamanında paket yöneticisi gerekmez. Script'ler sırayla yüklenir:

```html
<script src="src/low-pass-filter.js"></script>
<script src="src/leaflet-simple-locate.js"></script>
<script src="src/simple-locate-extended.js"></script>
<script src="src/simple-locate-panel.js"></script>
```

## Build / Minify

Üretim için minified sürümler `terser` ile oluşturulur:

```bash
npm install
npm run build
```

Çıktılar `dist/` altına yazılır:

- `dist/<dosya>.min.js` — her kaynak için ayrı minified sürüm
- `dist/simple-locate.bundle.min.js` — doğru yükleme sırasıyla birleşik tek dosya (~54% daha küçük)

Tek dosya ile kullanım:

```html
<script src="dist/simple-locate.bundle.min.js"></script>
```

## Temel Kullanım

```js
const locateControl = L.simplelocate({
    position: 'topright',
    geofence: {
        polygon: [
            { lat: 37.426083, lng: 31.850728 },
            { lat: 37.426890, lng: 31.853375 },
            { lat: 37.425097, lng: 31.854491 },
            { lat: 37.424592, lng: 31.851272 }
        ]
    },
    advancedFiltering: true,
    indoorMode: true,
    enableDeadReckoning: true,
    enableAltitude: true,
    geoidUndulation: 39.0,
    enableFloorDetection: true,
    floors: [
        { floor: 0, name: "Zemin", minAlt: 1000, maxAlt: 1500 },
        { floor: 1, name: "1. Kat", minAlt: 1500, maxAlt: 2000 }
    ],
    afterDeviceMove: function (location) {
        // location.lat, location.lng, location.accuracy
        // location.floor, location.floorName, location.altitude
        // location.isPDR, location.pdrStepCount
        // location.confidence, location.isRejected
    }
}).addTo(map);
```

### Kat planı ile en yakın birim

Özellik `src/simple-locate-floorplan.js` sayfaya eklendiğinde ve `floorPlans` seçeneği verildiğinde çalışır. Modül core prototipine metot eklediği için **panelden önce** yüklenmelidir:

```html
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

<script src="src/low-pass-filter.js"></script>
<script src="src/leaflet-simple-locate.js"></script>
<script src="src/simple-locate-extended.js"></script>
<script src="src/simple-locate-floorplan.js"></script>   <!-- panelden ÖNCE -->
<script src="src/simple-locate-panel.js"></script>
```

Tek dosya isterseniz bunların yerine `dist/simple-locate.bundle.min.js` yeterlidir; bundle beşini doğru sırayla içerir. Modül yüklenmezse eklenti aynen çalışır, yalnızca `floorPlans` yok sayılır.

SVG dosyaları çalışma zamanında `fetch` ile okunur, yani **aynı origin'den servis edilmeleri** gerekir (`file://` ile açmak çalışmaz); yol `svg` alanında sayfaya göre verilir.

```js
const locateControl = L.simplelocate({
    enableAltitude: true,
    enableFloorDetection: true,
    floors: [ /* minAlt / maxAlt bantları — otomatik kat için */ ],

    floorPlans: {
        bounds: { north: 41.268704, south: 41.256677, east: 28.750896, west: 28.734111 },
        unitSelector: 'path,rect,polygon,polyline',
        unitIdPattern: /^ID/,
        includeLayers: ['Shop', 'Food', 'Other', 'Control'],
        nameFromLabels: true,
        maxDistance: 60,
        floors: [
            { floor: 0, name: 'D', svg: 'demo/plans/D.svg' },
            { floor: 3, name: 'FT', svg: 'demo/plans/FT.svg' }
        ],
        onNearestUnit: function (result) {
            if (result) console.log(result.name, result.inside ? 'içinde' : result.distance + ' m');
        }
    }
}).addTo(map);
```

İstanbul Havalimanı için hazır yapılandırma `demo/plans/ist-floorplans.js` dosyasındadır (`IST_FLOOR_PLANS.build()`); coğrafi referansın nasıl türetildiği ve doğrulandığı dosyanın başındaki açıklamada yazılıdır. Çalışan örnek ana uygulamadır: `app.html` — altı katın planını da yükler, etkin katı harita altlığı olarak gösterir, en yakın birimi kartta ve panelde verir. Kat panelin Ayarlar sekmesinden elle de seçilebilir.

## Mimari

### GPS Filtreleme Pipeline

Gelen her `locationfound` event'i şu sırayla işlenir:

1. **Accuracy kontrolü** — `maxAcceptableAccuracy` (varsayılan 100m) üstü reddedilir
2. **Geofence kontrolü** — Polygon/bounds/radius bazlı alan sınırı. Dışındaki konumlar reddedilir veya PDR'a geçilir
3. **Hız kontrolü** — `maxHumanSpeed` (5 m/s) ve `maxIndoorSpeed` (6 m/s) üstü reddedilir
4. **Sıçrama tespiti** — Ardışık konumlar arası mesafe `jumpThreshold`'u aşarsa filtrelenir
5. **Median filtre** — Son N konumun medyanı alınır (iç mekan: 7, dış mekan: 3 pencere)
6. **Kalman filtresi** — Tahmin-düzeltme döngüsü ile konum yumuşatma
7. **Low-pass filtre** — Yüksek frekanslı gürültüyü bastırır (`lowPassFilterTau`)

Reddedilen konumlarda `enableLastGoodLocation` aktifse son geçerli iç mekan konumu kullanılır.

### Yeniden Çıpalama (Consensus Reanchor)

Hız kontrolü, çıpanın (son kabul edilen konumun) doğru olduğunu varsayar. Çıpa hatalıysa doğru
sinyaller de reddedilir ve ekran yanlış yerde donar. Reddedilen fix'ler **birbirini doğruluyorsa**
(sıkı küme + makul accuracy + yeterli süre) hatalı olan çıpadır: konum kümenin merkezine taşınır ve
filtre iç durumu sıfırlanır (`enableConsensusReanchor`).

Bu düzeltme kolay tetiklenirse ters etki doğar: birbirinden uzak iki multipath kümesi arasında
(A↔B) ekran tekrar tekrar ışınlanır. Saha loglarında hatalı salınımlar ile meşru düzeltmeler fix
sayısı, süre ve accuracy bakımından **birbirinden ayrılamıyordu**; ayrıldıkları tek nokta salınımın
az önce terk edilen yere geri dönmesiydi. Kanıt eşiği bu yüzden üç kademelidir:

| Kademe | Koşul | Amaç |
|--------|-------|------|
| Yakın | `reanchorMinFixes` fix, `reanchorMinSpanMs` süre | Gürültüyü değil gerçek sapmayı düzelt |
| Uzak (`> reanchorMaxDistance`) | `reanchorFarMinFixes` fix, `reanchorFarMinSpanMs` süre, ayrı soğuma | Büyük ışınlanma için daha çok kanıt |
| Ping-pong | Terk edilen yere `reanchorPingPongRadius` içinde dönüş, `reanchorPingPongMs` boyunca reddedilir | A↔B salınımını kes |

Kapıların kilitlenmemesi için **ısrar kaçışı** vardır: küme `reanchorOverrideFixes` fix ve
`reanchorOverrideSpanMs` süre boyunca aynı yeri gösteriyorsa soğuma/ping-pong/hız kapıları aşılır.
Israr, tek seferlik bir multipath sıçramasının üretemeyeceği bir kanıttır — bu kaçış olmadan
gerçekten yer değiştirmiş bir kullanıcı dakikalar boyunca yanlış konumda kalır. Ayrıca ilk gerçek
konum gösterilene kadar hiçbir kapı uygulanmaz: açılışta korunacak güvenilir bir çıpa yoktur.

Değişiklikler sahaya çıkmadan `tools/replay-log.js` (gerçek log tekrar oynatma),
`tools/reanchor-sweep.js` (parametre taraması / ablasyon) ve `tools/filter-scenarios.js`
(sentetik regresyon senaryoları) ile ölçülür.

### Geofence Dışı Davranış

Filtrelenmiş konum geofence dışında kaldığında:

- Son geçerli iç mekan konumu korunur
- Dead reckoning (PDR) aktifse ivmeölçer ile konum tahminine devam edilir
- Konum indikatörü ve accuracy circle normal şekilde gösterilmeye devam eder

### Pedestrian Dead Reckoning (PDR)

GPS sinyali kaybedildiğinde veya geofence dışına çıkıldığında ivmeölçer (`devicemotion`) ve pusula (`deviceorientation`) ile konum tahmini yapar.

**Adım tespit algoritması:**

İvme vektörünün normu (telefon yönünden bağımsız) alınır, yerçekimi yavaş bir EMA ile ayrılır (high-pass) ve histerezisli zirve algılama uygulanır. Tek eşik geçişi yerine sinyalin tam döngüsü gözlenir:

```
Faz 1: Sinyal üst eşiği (thHigh) aşar → "armed", zirve ve vadi takibi başlar
Faz 2: Sinyal alt eşiğin (thHigh × 0.5) altına düşer → tam dalga = 1 adım
```

Ek korumalar:
- **Cooldown** (`pdrStepCooldown: 300ms`) — iki adım arası minimum süre
- **Minimum zirve büyüklüğü** (`pdrMinPeakValue: 0.7`) — küçük titreşimleri reddet
- **Adaptive threshold** — son 6 zirvenin ortalamasına göre eşiği dinamik ayarla (`[base×0.6, base×1.4]` aralığında sınırlı), farklı yürüyüş hızlarına adapte ol
- **Yumuşatma buffer'ı** (3 sample) — tek örnek gürültüsünü kes, zirveyi koru
- **Güvenlik zamanlayıcı** — 1.5 saniyeden uzun süren sahte zirve fazını sıfırla
- **Geofence sınır kontrolü** — PDR konumu bina dışına çıkamaz

**Dinamik adım uzunluğu (Weinberg modeli):** `pdrDynamicStepLength` aktifken her adımın uzunluğu ivme genliğinden kestirilir: `stepLength = K · ⁴√(a_max − a_min)`, `[pdrStepLengthMin, pdrStepLengthMax]` aralığında sınırlanır. Kapalıyken sabit `pdrStepLength` (0.65m) kullanılır. Her adımda accuracy `pdrAccuracyDecay` (0.5m) kadar artar.

**PDR→GPS yumuşak yeniden giriş:** `pdrReentrySmoothing` aktifken, iç mekan sinyali geri geldiğinde konum sürüklenmiş PDR tahmininden gerçek GPS'e tek sıçramada değil, birkaç güncellemede (`pdrReentryBlend` oranıyla) yaklaşır; `pdrReentrySnapDistance` altına inince doğrudan oturur.

**ZUPT — duruş tespiti (B1):** `pdrZupt` aktifken, son `pdrZuptWindow` örneğinin varyansı `pdrZuptVariance` altına düşerse cihaz hareketsiz kabul edilir ve adım algılama bastırılır. Ayakta beklerken el titremesinden doğan "hayalet adım/sürüklenme"yi önler.

**Otomatik adım uzunluğu kalibrasyonu (A2):** `pdrAutoCalibrate` aktifken, her PDR oturumu sinyal geri gelerek bittiğinde baş↔son GPS düz mesafesi PDR yol uzunluğuyla kıyaslanır. Düz yürüyüşte (`pdrCalibrateMaxHeadingVar` altında dönüş, en az `pdrCalibrateMinSteps` adım) `pdrStepLengthFactor` (Weinberg K) kişiye/cihaza göre öğrenilir; `[pdrStepLengthFactorMin, pdrStepLengthFactorMax]` arasında sınırlı ve `pdrCalibrateBlend` oranıyla yumuşak güncellenir.

### Deneysel: Güven Ağırlıklı Füzyon (varsayılan kapalı)

`experimentalFusion` tek anahtarı **sabit-hız (constant-velocity) Kalman modelini** açar: konum + hızı birlikte takip eder, tahmini `x += v·dt` ile yürütür ve yürürken sabit-konum modelinin gecikmesini azaltır. Hız insan yürüyüşüne sınırlanır (fırlama önlenir) ve filtre ölçümden çok uzaklaşırsa ölçüme çekilir. Test amaçlı olduğundan varsayılan kapalıdır; çalışma zamanında `enableFeature('experimentalFusion', true/false)` ile açılıp kapatılabilir. Kapalıyken mevcut sabit-konum davranışı birebir korunur.

### Altitude ve Kat Tespiti

- Ham GPS altitude değeri geoid ondülasyonu (`geoidUndulation`) ile MSL'ye normalize edilir
- Median + low-pass filtre ile gürültü azaltılır
- Kat, `floors` dizisindeki `minAlt`/`maxAlt` aralıklarından ya da `groundFloorAltitude` + `floorHeight` hesabından belirlenir
- `calibrateGroundFloor()` ile runtime'da zemin kat kalibrasyonu yapılabilir

**Kat değişimi üç kapıdan birlikte geçmek zorundadır.** GPS düşey hatası (±10–30 m) kat yüksekliğinden (~3–6 m) büyük olabildiği için ham eşleme tek başına güvenilmez: sınırda duran bir okuma katı sürekli değiştirir ve gösterilen plan ile "en yakın birim" sonucu titrer.

| Kapı | Ayar | Ne yapar |
|------|------|----------|
| Derinlik | `floorHysteresis` (1.5 m) | Yeni katın sınırından bu kadar içeride olunmalı. Eşik aralığın çeyreğiyle sınırlanır, yoksa dar bantlarda hiçbir geçiş mümkün olmaz. |
| Mutabakat | `floorChangeMinFixes` (3) | Aynı aday kat üst üste bu kadar ölçümde görülmeli; tek örneklik sapma kat değiştirmez. |
| Bekleme | `floorChangeCooldownMs` (4000) | İki kat değişimi arasında en az bu süre geçmeli. |

Yükseklik hiçbir banda düşmezse son kararlı kat korunur. Bant adları (`floors[].name`) geçiş beklerken de korunur. `npm run test:floors` bu davranışı sentetik senaryolarla sınar: sabit katta ±4 m gürültü ve bant sınırında salınım kat değiştirmemeli, gerçek geçiş ve asansörle çok katlı hareket ise yakalanmalıdır.

### Kat Planı ve En Yakın Birim

`src/simple-locate-floorplan.js` opsiyonel bir modüldür: yüklenmezse eklenti aynen çalışır. Yüklendiğinde kat başına bir SVG plan okur, planı coğrafi sınırlara oturtur ve konum geldiğinde **o konuma en yakın birimi** verir.

Mesafe birimin merkezine değil **kenarına** göre ölçülür (nokta–doğru parçası mesafesi). Büyük bir mağazanın kapısının dibinde "50 m uzakta" sonucunu almamak için gereklidir; nokta birimin içindeyse mesafe 0 ve `inside: true` döner.

Sonuç, konum başlangıcındaki ilk fix'te ve sonraki her güncellemede (`updateInterval` ile kısılarak) hesaplanır. Kat değiştiğinde kısıtlama beklenmeden yeniden hesaplanır.

**Kat seçimi** iki moddan biriyle yapılır: `auto` yükseklikten tespit edilen katı kullanır (`enableFloorDetection` + `floors`), `manual` panelden seçilen katı kullanır. Panelin Ayarlar sekmesindeki "Kat Planı / En Yakın Birim" bölümü modu ve katı değiştirir, yüklü birim sayısını ve o anki en yakın birimi gösterir.

Açılır liste `floors` içindeki **tüm** katları sırayla listeler. Listeden kat seçmek modu kendiliğinden `manual`'a alır (aksi halde seçim bir sonraki yükseklik okumasında geri alınırdı) ve "Katı Manuel Seç" anahtarı bunu yansıtır. Anahtar kapatıldığında mod `auto`'ya döner; yükseklik henüz okunmadıysa `defaultFloor` (verilmezse listenin ilk katı) etkin olur. Yükseklik kalibre edilmeden saha testi yapılacaksa kat bu bölümden elle sabitlenebilir.

**Coğrafi referans.** Her kat için `bounds` (`north`/`south`/`east`/`west`) planın viewBox'ının tamamını kapsar; `rotation` derece cinsinden döndürmedir. Planlar aynı çizimden farklı kırpmalarla üretilmişse aynı fiziksel nokta her dosyada aynı pikselde olmaz — bu durumda kat başına `bounds` verilerek fark telafi edilir (bkz. `demo/plans/ist-floorplans.js`).

**Birim seçimi.** Bir şeklin birim sayılması için üç süzgeçten geçmesi gerekir: `unitSelector` (CSS seçici — hangi etiketler), `unitIdPattern` (id deseni) ve katman süzgeci — `includeLayers` verilirse yalnızca o katmanlar alınır, `excludeLayers` verilirse o katmanlar atlanır. Gerekirse `unitFilter(el, layer)` ile kendi kuralınızı eklersiniz. Katman adı, şekli içeren en yakın çizim katmanı grubundan (`inkscape:groupmode="layer"`) okunur; ad olarak grubun `id`'si, yoksa `inkscape:label` değeri kullanılır.

Katman ayrımı bu özelliğin doğruluğunu belirleyen karardır: kapı bir çizgi, ikon bir simgedir; bina kütlesi ve koridor ise adreslenebilir birim değildir. Bunlar dahil edilirse kenar mesafesi birimin sınırı yerine kapısına ya da koridora göre ölçülür ve "en yakın birim" mağaza yerine koridoru döndürür. IST planlarında `Doors` tek başına en kalabalık katmandır (D katında 200 şekil) ve tam bu yüzden dışarıda bırakılır.

Kendi planınızdaki katmanları görmek için `npm run inspect:plan -- demo/plans --id "^ID"`. Araç her dosya için katman başına şekil/metin sayısını, id örneklerini ve çok parçalı id'leri listeler, `includeLayers` / `labelLayers` için başlangıç listesi üretir.

**Haritada hizalama kontrolü.** Canlı kullanımda `app.html` panelinin Ayarlar sekmesinde **Kat planını haritada göster** anahtarı planı uydu görüntüsü üzerine yarı saydam bindirir; yürürken konumunuzun planla örtüşüp örtüşmediğini görebilirsiniz. Kayıtlı oturumlar için aynı özellik `log-viewer.html` harita araç çubuğunda **IST kat planı** kutusu ve kat seçici ile kullanılır.

Aynı birimin parçaları (`IDD110A` + `IDD110B`) `unitIdNormalize` ile tek birime birleştirilir; birleştirilmezse "en yakın birim" aynı mağazanın iki yarısı arasında salınır. Katman taraması yerine birimleri tek tek saymak isterseniz `units` dizisi verilir; o zaman seçici ve desen yok sayılıp id'ler birebir eşleştirilir.

**Adlandırma** sırayla şu kaynaklardan gelir: `names` eşlemesi → `data-name` → `<title>` → `nameFromLabels` ile eşleşen metin etiketi → `layerNames` ile katmandan türetilen tür adı → şeklin kendi id'si.

`nameFromLabels` açıkken `labelLayers` katmanındaki metinler konumsal olarak birimlere bağlanır. Etiket kural olarak adlandırdığı şeklin üzerine konur, bu yüzden **etiketi içine alan birim her zaman kazanır**; etiket hiçbir şeklin içinde değilse adlandırma ancak `labelMaxDistance` içinde **tek aday** varsa yapılır. Bu kısıt önemlidir: yoğun bir planda serbest duran bir etiket (check-in sırası numarası, kat yönlendirmesi) en yakın mağazayı adlandırırsa ortaya "1" adlı bir dükkân çıkar — yanlış ad adsızlıktan kötüdür, çünkü kullanıcı onu birimin gerçek adı sanar. Çalışma zamanında doldurulmak üzere bırakılmış yer tutucu metinler (`IDEP01_1_` gibi) ad kaynağı sayılmaz.

Planların çoğunda birimlerin büyük kısmı adsız kalır. `layerNames` (katman → okunabilir tür adı, örn. `{ Shop: 'Mağaza', Food: 'Yeme-içme' }`) bunlara en azından türünü söyleyen bir ad verir; sonuçta `generic: true` döner, böylece arayüz gerçek ad ile tür adını ayırt edip kimliği yanına yazabilir. IST planlarında 535 birimin 37'si kendi adını taşır, kalanı tür adıyla görünür — `IDFT163` göstermekten iyidir.

### Yön Algılama

`deviceorientation` / `deviceorientationabsolute` event'leri ile pusula yönü takip edilir.

- Dairesel ortalama ile jitter azaltma (0°/360° sınırında doğru)
- Gimbal lock koruması (beta > 70°) — telefon dik tutulduğunda yön titreşimini engeller
- Minimum açı değişimi eşiği (`minAngleChange: 3°`)

**Jiroskop/tamamlayıcı filtre:** `headingGyroFusion` aktifken, PDR sırasında (devicemotion açıkken) jiroskop (`rotationRate.alpha`) kısa vadeli dönüşü entegre eder, pusula uzun vadeli referans olarak `headingCompassCorrection` oranıyla yavaşça düzeltir. Manyetik bozulmaya karşı heading'i stabilize eder. **Güvenlik:** füzyon sonucu pusuladan `headingGyroMaxDivergence` (25°) fazla ayrılırsa otomatik pusulaya kilitlenir; jiroskop verisi yoksa/bayatsa saf pusula davranışına döner. Eksen/işaret farklı cihazlarda ters olabilir → `headingGyroSign` (+1/−1) ile ayarlanır.

**Otomatik jiroskop işaret tespiti (A1):** `headingGyroAutoSign` aktifken, pusula belirgin döndüğünde jiroskop entegralinin işareti pusulayla uyuşuyor mu diye oy toplar; tutarlı uyumsuzlukta `headingGyroSign`'ı otomatik ters çevirir. Cihazlar arası "ok ters dönüyor" sorununu elle ayar gerektirmeden çözer. GPS gerekmez.

**GPS gidiş yönü (course) düzeltmesi (A3):** `headingUseGpsCourse` aktifken, dış mekanda yeterli hızda (`gpsCourseMinSpeed`) ve iyi doğrulukta (`gpsCourseMaxAccuracy`) hareket halindeyken heading, GPS gidiş yönüne `gpsCourseCorrection` oranıyla çekilir. Manyetik bozulmadan kaynaklı pusula hatasını düzeltir; pusula hiç yoksa hareket halinde oku doğru yöne çevirir.

## Konfigürasyon Referansı

### Filtreleme

| Parametre | Varsayılan | Açıklama |
|-----------|-----------|----------|
| `enableFiltering` | `true` | Tüm filtreleme pipeline'ını aç/kapat |
| `medianWindowSize` | `3` | Median filtre pencere boyutu |
| `kalmanProcessNoise` | `0.05` | Kalman filtre Q değeri |
| `kalmanMeasurementNoise` | `0.2` | Kalman filtre R değeri |
| `lowPassFilterTau` | `0.5` | Low-pass filtre zaman sabiti |
| `jumpThreshold` | `0.0005` | Sıçrama tespit eşiği (derece) |
| `maxAcceptableAccuracy` | `100` | Kabul edilebilir maksimum accuracy (m) |

### İç Mekan

| Parametre | Varsayılan | Açıklama |
|-----------|-----------|----------|
| `indoorMode` | `true` | İç mekan modu |
| `indoorMedianWindowSize` | `3` | İç mekan median tabanı (yürürken ≤3) |
| `indoorKalmanR` | `0.25` | İç mekan Kalman R tabanı |
| `indoorLowPassTau` | `0.4` | İç mekan low-pass tau |
| `maxIndoorSpeed` | `6` | İç mekan maks hız (m/s) |
| `enableLastGoodLocation` | `true` | Son iyi konum fallback |
| `lastGoodLocationTimeout` | `30000` | Son iyi konum timeout (ms) |
| `coldStartGate` | `true` | Açılışta tutarlı fix bekle |
| `coldStartMaxAccuracy` | `35` | Açılışta maks accuracy (m) |
| `coldStartMinFixes` | `3` | Açılış için min tutarlı fix |
| `coldStartConsistentDistance` | `45` | Adaylar arası maks mesafe (m) |
| `coldStartLastGoodDelayMs` | `8000` | Last-good yazmayı ertele (ms) |
| `coldStartTimeoutMs` | `20000` | Açılış kapısı zaman aşımı (ms) |

### Yeniden Çıpalama

| Parametre | Varsayılan | Açıklama |
|-----------|-----------|----------|
| `enableConsensusReanchor` | `true` | Konsensüs tabanlı yeniden çıpalama |
| `reanchorMinFixes` | `3` | Yakın düzeltme için min fix |
| `reanchorMinSpanMs` | `1800` | Yakın düzeltme için min gözlem süresi |
| `reanchorClusterRadius` | `15` | Küme yarıçapı tabanı (m, accuracy ile ölçeklenir) |
| `reanchorMaxAccuracy` | `35` | Kümedeki fix'ler için maks accuracy (m) |
| `reanchorMinDistance` | `20` | Bundan yakın sapmalarda çıpa değiştirilmez (m) |
| `reanchorCooldownMs` | `12000` | İki düzeltme arası min süre |
| `reanchorMaxDistance` | `50` | Bunun üstü "uzak düzeltme" sayılır (m) |
| `reanchorFarMinFixes` | `5` | Uzak düzeltme için min fix |
| `reanchorFarMinSpanMs` | `4000` | Uzak düzeltme için min gözlem süresi |
| `reanchorFarMaxAccuracy` | `35` | Uzak düzeltmede maks accuracy (m) |
| `reanchorFarCooldownMs` | `30000` | İki uzak düzeltme arası min süre |
| `reanchorPingPongMs` | `180000` | Terk edilen yere dönüşün bastırıldığı süre |
| `reanchorPingPongRadius` | `40` | "Aynı yere dönüş" sayılan yarıçap (m) |
| `reanchorOverrideFixes` | `7` | Israr kaçışı: yumuşak kapıları aşan fix sayısı |
| `reanchorOverrideSpanMs` | `7000` | Israr kaçışı: gereken gözlem süresi |
| `reanchorMaxSpeed` | `0` | Opsiyonel hız kapısı (m/s, 0 = kapalı) |
| `reanchorUncertaintyFactor` | `1.2` | Hız kapısındaki ±accuracy payı katsayısı |

### Geofence

| Parametre | Varsayılan | Açıklama |
|-----------|-----------|----------|
| `enableGeofence` | `true` | Geofence aktif |
| `geofencePolygon` | `null` | `[{lat, lng}, ...]` köşe noktaları |
| `geofenceBounds` | `null` | `[[minLat, minLng], [maxLat, maxLng]]` |
| `geofenceCenter` / `geofenceRadius` | `null` | Merkez + yarıçap (m) |

### PDR (Dead Reckoning)

| Parametre | Varsayılan | Açıklama |
|-----------|-----------|----------|
| `enableDeadReckoning` | `false` | PDR aktif |
| `pdrStepLength` | `0.65` | Sabit adım uzunluğu (m) — dinamik kapalıyken kullanılır |
| `pdrStepThreshold` | `0.8` | High-pass ivme zirve eşiği (adaptive baz değer) |
| `pdrStepCooldown` | `300` | Adımlar arası min süre (ms) |
| `pdrMinPeakValue` | `0.7` | Minimum zirve büyüklüğü |
| `pdrAdaptiveThreshold` | `true` | Dinamik eşik |
| `pdrMaxDuration` | `300000` | Maks PDR süresi (ms) |
| `pdrMaxSteps` | `100` | Maks adım sayısı |
| `pdrAccuracyDecay` | `0.5` | Adım başına accuracy artışı (m) |
| `pdrInitialAccuracy` | `5` | Başlangıç accuracy (m) |
| `pdrDynamicStepLength` | `true` | Dinamik adım uzunluğu (Weinberg) |
| `pdrStepLengthFactor` | `0.5` | Weinberg K katsayısı |
| `pdrStepLengthMin` | `0.4` | Dinamik adım uzunluğu alt sınırı (m) |
| `pdrStepLengthMax` | `0.9` | Dinamik adım uzunluğu üst sınırı (m) |
| `pdrReentrySmoothing` | `true` | PDR→GPS yumuşak yeniden giriş |
| `pdrReentryBlend` | `0.5` | Yeniden girişte hedefe yaklaşma oranı (0-1) |
| `pdrReentrySnapDistance` | `2` | Bu mesafe altına inince doğrudan otur (m) |
| `pdrZupt` | `true` | ZUPT — duruşta adım bastırma |
| `pdrZuptVariance` | `0.04` | Duruş varyans eşiği ((m/s²)²) |
| `pdrZuptWindow` | `16` | Duruş varyans penceresi (örnek) |
| `pdrAutoCalibrate` | `true` | Otomatik adım uzunluğu (K) kalibrasyonu |
| `pdrCalibrateMinSteps` | `8` | Kalibrasyon için min adım |
| `pdrCalibrateMaxHeadingVar` | `25` | Düz yürüyüş şartı — maks yön varyansı (derece) |
| `pdrCalibrateBlend` | `0.3` | Yeni K'ya yaklaşma oranı (0-1) |
| `pdrStepLengthFactorMin` | `0.3` | K alt sınırı |
| `pdrStepLengthFactorMax` | `0.8` | K üst sınırı |

### Yön / Heading

| Parametre | Varsayılan | Açıklama |
|-----------|-----------|----------|
| `minAngleChange` | `3` | Minimum açı değişimi eşiği (derece) |
| `orientationSmoothing` | `5` | Yön yumuşatma örnek sayısı |
| `orientationUpdateInterval` | `100` | Yön kaynaklı marker güncelleme aralığı (ms) |
| `gimbalLockThreshold` | `70` | Gimbal lock koruması beta eşiği (derece) |
| `headingGyroFusion` | `true` | Jiroskop/tamamlayıcı filtre füzyonu |
| `headingGyroSign` | `-1` | `rotationRate.alpha` → heading işaret düzeltmesi (+1/−1) |
| `headingCompassCorrection` | `0.1` | Pusulaya çekme oranı (0-1) |
| `headingGyroMaxDivergence` | `25` | Pusuladan bu açıyı aşınca kilitlen (derece, güvenlik) |
| `headingGyroAutoSign` | `true` | Jiroskop işaretini otomatik tespit (A1) |
| `headingUseGpsCourse` | `true` | GPS gidiş yönüyle heading düzeltme (A3) |
| `gpsCourseMinSpeed` | `1.2` | GPS yönü için min hız (m/s) |
| `gpsCourseMaxAccuracy` | `25` | GPS yönü için maks accuracy (m) |
| `gpsCourseCorrection` | `0.2` | Heading'i GPS yönüne çekme oranı (0-1) |

### Deneysel / Performans

| Parametre | Varsayılan | Açıklama |
|-----------|-----------|----------|
| `experimentalFusion` | `false` | Sabit-hız Kalman + güven ağırlıklı füzyon (test toggle) |
| `motionUpdateHz` | `0` | devicemotion işleme üst sınırı (Hz, 0=sınırsız; düşük güçte 30-40) |

### Altitude ve Kat

| Parametre | Varsayılan | Açıklama |
|-----------|-----------|----------|
| `enableAltitude` | `false` | Altitude işleme |
| `geoidUndulation` | `37.0` | Geoid ondülasyonu (m) |
| `altitudeMedianWindow` | `5` | Altitude median penceresi |
| `altitudeLowPassTau` | `2.0` | Altitude low-pass tau |
| `enableFloorDetection` | `false` | Kat tespiti |
| `floorHeight` | `3.0` | Kat yüksekliği (m) |
| `floorHysteresis` | `1.5` | Yeni katın sınırından içeride olunması gereken pay (m) |
| `floorChangeMinFixes` | `3` | Kat değişimi için gereken ardışık mutabık ölçüm |
| `floorChangeCooldownMs` | `4000` | Kat değişimleri arasında en az bekleme (ms) |
| `floors` | `null` | Manuel kat tanımları dizisi |

### Kat Planı / En Yakın Birim

Tümü `floorPlans` nesnesi içinde verilir. `floorPlans` verilmezse özellik kapalıdır.

| Parametre | Varsayılan | Açıklama |
|-----------|-----------|----------|
| `floors` | `[]` | Kat tanımları: `{ floor, name, svg, bounds?, rotation? }` |
| `bounds` | — | Tüm katlar için ortak sınır: `{ north, south, east, west }` |
| `rotation` | `0` | Planın kuzeye göre dönüklüğü (derece) |
| `unitSelector` | `'[id]'` | Birim adayı şekilleri seçen CSS seçici |
| `unitIdPattern` | `null` | Birim id'si için desen (RegExp / önek / fonksiyon) |
| `includeLayers` | `null` | Yalnızca bu çizim katmanlarındaki şekiller alınır |
| `excludeLayers` | `null` | Bu katmanlardaki şekiller atlanır (kapı, ikon, etiket…) |
| `unitFilter` | `null` | `(el, layer) => boolean` ek eleme |
| `unitIdNormalize` | `null` | Parça id'lerini tek birime indirger (`IDD110A` → `IDD110`) |
| `units` | `null` | Birim listesi verilirse tarama yerine id ile birebir eşleşir |
| `names` | `null` | `{ id: ad }` eşlemesi veya `(id, floor) => ad` |
| `nameFromLabels` | `false` | Metin etiketlerini konumsal olarak birimlere ad yap |
| `labelLayers` | `['Writing']` | Etiket metinlerinin bulunduğu katman(lar) |
| `labelSelector` | `'text'` | Etiket öğelerini seçen CSS seçici |
| `labelMaxDistance` | `12` | Şeklin dışındaki etiketin adlandırabileceği azami uzaklık (m); bu uzaklıkta birden fazla aday varsa adlandırma yapılmaz |
| `labelFilter` | `null` | `(text, el) => boolean` etiket elemesi |
| `layerNames` | `null` | Katman → okunabilir tür adı; adsız birimler için yedek (`generic: true` döner) |
| `maxDistance` | `100` | Bundan uzaktaki birim "en yakın" sayılmaz (m) |
| `maxCandidates` | `5` | Sonuçta döndürülen aday sayısı |
| `sampleSpacing` | `1.0` | Eğrisel kenarların örnekleme sıklığı (m) |
| `maxPointsPerRing` | `400` | Tek şekilden çıkarılacak azami nokta |
| `updateInterval` | `1000` | Konum akışında yeniden hesap aralığı (ms) |
| `floorMode` | `'auto'` | `'auto'` (yükseklikten) veya `'manual'` (panelden) |
| `defaultFloor` | ilk kat | Kat tespit edilemediğinde kullanılacak kat |
| `activeFloor` | `defaultFloor` | Başlangıçta yüklenecek kat |
| `onNearestUnit` | `null` | `(result, location)` — en yakın birim değiştiğinde |
| `onFloorLoad` | `null` | `(floor, unitCount)` — kat planı yüklendiğinde |
| `enabled` | `true` | `false` ise modül kurulmaz |

## Runtime API

```js
// Özellik aç/kapat
locateControl.enableFeature('advancedFiltering', true);
locateControl.enableFeature('deadReckoning', true);

// Filtre parametrelerini değiştir
locateControl.setFilterParams({ medianWindowSize: 5, kalmanProcessNoise: 0.1 });

// Geofence güncelle
locateControl.setGeofence({ polygon: newPolygon });

// Kat tanımlarını güncelle
locateControl.setFloors(newFloors);
locateControl.setGeoidUndulation(39.0);
locateControl.calibrateGroundFloor();

// PDR durumu
locateControl.isDeadReckoningActive();
locateControl.getDeadReckoningInfo();

// Son iyi konum
locateControl.getLastGoodLocation();
locateControl.clearLastGoodLocation();

// Konum ve accuracy
locateControl.getLatLng();   // { lat, lng } veya null
locateControl.getAccuracy(); // metre veya null
locateControl.getAngle();    // derece veya null

// Kat planı / en yakın birim (simple-locate-floorplan.js yüklüyse)
locateControl.getNearestUnit();                    // son hesaplanan sonuç
locateControl.findNearestUnit(lat, lng, floor);     // akıştan bağımsız tek sorgu
locateControl.getFloorPlanFloor();                 // etkin kat
locateControl.setFloorPlanMode('manual');          // 'auto' | 'manual'
locateControl.setFloorPlanFloor(3);                // manuel kat seçimi
locateControl.getFloorPlanFloors();                // [{ floor, name, state, units }]
locateControl.getFloorPlanShapes(floor);           // birim halkaları (lat/lng) — çizim
```

`findNearestUnit` / `getNearestUnit` sonucu:

```js
{
  id: 'IDFT083', name: 'Güvenlik Kontrol', layer: 'Control',
  generic: false,        // true ise ad birimin kendi adı değil, katmandan türetilen tür adı
  floor: 3, floorName: 'FT',
  distance: 12.8,        // kenara uzaklık (m); içerideyse 0
  edgeDistance: 12.8,    // içerideyken de en yakın kenarın uzaklığı
  inside: false,
  edge: { lat, lng },    // ölçümün alındığı kenar noktası
  candidates: [ { id, name, generic, layer, distance, inside }, ... ]
}
```

## Callback Verileri

`afterDeviceMove` callback'i her konum güncellemesinde şu alanları içerir:

```js
{
    lat, lng, accuracy, angle,
    isFiltered,               // Filtreleme uygulandı mı
    isRejected,               // Konum reddedildi mi
    isJump,                   // Sıçrama tespit edildi mi
    confidence,               // Konum güven skoru (0-1)
    isFallback,               // Son iyi konum mu kullanılıyor
    isIndoorMode,             // İç mekan modu aktif mi
    consecutiveBadLocations,  // Ardışık kötü konum sayısı
    isPDR,                    // PDR aktif mi
    pdrStepCount,             // PDR adım sayısı
    pdrAccuracy,              // PDR tahmini accuracy
    altitude,                 // Filtrelenmiş altitude (m, MSL)
    altitudeRaw,              // Ham altitude
    floor,                    // Kat numarası
    floorName,                // Kat adı
    filterStats,              // Filtreleme istatistikleri
    locationStats             // Konum istatistikleri (toplam, reddedilen, vb.)
}
```

## Test ve Doğrulama

Konum davranışı gerçek sahada tekrarlanamadığı için doğrulama çevrimdışı yapılır.

```bash
npm run test:filter          # Filtre + yeniden çıpalama senaryoları
npm run test:floors          # Yükseklikten kat tespiti senaryoları
npm run replay <log.json>    # Kaydedilmiş oturumu eklentiyle yeniden oynat
npm run sweep <log.json>     # Yeniden çıpalama parametre taraması / ablasyon
```

**Replay** bir düzeltmenin çalıştığını gösterir (gerçek log üzerinde önce/sonra), **senaryolar** ise bozmadığını gösterir. Aynı replay `log-viewer.html` **Simülasyon** sekmesinde de çalışır: ham GPS güncel eklentiden geçirilir, orijinal kayıt yolu (cyan) ile simülasyon yolu (turuncu) yan yana durur. Pin numaraları haritada görünür; pin seçilince o andaki konum göstergesi + accuracy çemberi çizilir (kaba eşik app.html ile aynı, sekmeden değiştirilebilir).

Yeni oturum logları cihaz bilgisi, filtre snapshot’ı ve GPS Hz taşır (`session.device`, `stats.gpsHz`, ham GPS `dtMs`/`hz`). Eski loglar bunlarsız da simüle edilir.

**Kat planı hizalaması** canlı kullanımda `app.html` panelinde **Kat planını haritada göster** ile, kayıtlı oturumlarda `log-viewer.html` **IST kat planı** kutusu ile uydu görüntüsü üzerinde doğrulanır. Plan bindirme `demo/plans/ist-floorplans.js` içindeki coğrafi referansa dayanır; katman yapısı için `npm run inspect:plan -- demo/plans --id "^ID"` kullanılır.

## Google Cloud deploy (Supabase / Netlify yok)

Tüm sistem tek GCP projesinde:

| Parça | Servis |
|-------|--------|
| Statik site | Cloud Storage (website) |
| Log yazma / listeleme API | Cloud Functions Gen2 (`logs-api`) |
| Veritabanı | Cloud SQL PostgreSQL (`test_logs`) |
| Sırlar | Secret Manager (`locate-database-url`, `locate-api-key`) |

### Cloud SDK Shell

```bash
git clone <repo> && cd inmapper-simpe-locate-extended
npm run build

export PROJECT_ID="tubitak-1507-2025"
export REGION="europe-west1"
bash gcp/deploy.sh
```

Deploy çıktısındaki `FUNCTION_URL` ve `API_KEY` değerlerini `app.html` içindeki `panelOptions.autoUpload` alanına yazıp bucket’a tekrar yükleyin:

```bash
gcloud storage cp index.html app.html log-viewer.html "gs://tubitak-1507-2025-simple-locate/"
gcloud storage rsync dist "gs://tubitak-1507-2025-simple-locate/dist" --recursive
gcloud storage rsync demo "gs://tubitak-1507-2025-simple-locate/demo" --recursive
```

Şema: [`gcp/schema.sql`](gcp/schema.sql) — ilk kurulumda:

```bash
gcloud sql connect simple-locate-db --user=postgres --database=simple_locate
# sonra schema.sql içeriğini yapıştır
```

Log viewer → **Cloud Logs** sekmesi: Function URL + `x-api-key`.

Client asla DB şifresi tutmaz; sadece Functions URL + API key kullanır.

## Otomatik deploy (GitHub → Cloud Build)

`main` branch’e her push’ta:

1. `npm run build`
2. `logs-api` Function güncellenir
3. Static dosyalar `gs://tubitak-1507-2025-simple-locate` bucket’ına yazılır

**Cloud SQL / secrets yeniden oluşturulmaz** — bir kez `bash gcp/deploy.sh` gerekir.

### Kurulum (Cloud Shell)

1. Console → [Cloud Build → Repositories](https://console.cloud.google.com/cloud-build/repositories?project=tubitak-1507-2025) → GitHub bağla → `inmapper-com/Simple-Locate-Extended`
2. Sonra:

```bash
export PROJECT_ID="tubitak-1507-2025"
export REGION="europe-west1"
# varsayılan: REPO_OWNER=inmapper-com REPO_NAME=Simple-Locate-Extended
bash gcp/setup-cloudbuild-trigger.sh
```

3. Manuel test (push olmadan):

```bash
gcloud builds submit --config=cloudbuild.yaml --project=tubitak-1507-2025
```

Trigger: [Cloud Build → Triggers](https://console.cloud.google.com/cloud-build/triggers?project=tubitak-1507-2025)

## Lisans

[leaflet-simple-locate](https://github.com/mfhsieh/leaflet-simple-locate) v1.0.5 baz alınarak genişletilmiştir.
