# Leaflet SimpleLocate Extended

Leaflet tabanlı iç/dış mekan konum takip eklentisi. GPS filtreleme, geofence, pedestrian dead reckoning (PDR), yükseklik/kat tespiti ve yön algılama içerir.

## Dosya Yapısı

```
src/
├── low-pass-filter.js            # UMD low-pass filtre modülü
├── leaflet-simple-locate.js      # Ana Leaflet control (filtreleme, PDR, altitude)
├── simple-locate-extended.js     # Extended API katmanı (runtime kontrol, geofence çizim)
└── simple-locate-panel.js        # Birleşik kontrol paneli (Ayarlar + Loglar drawer)
dist/                             # Minified çıktılar (npm run build ile üretilir)
images/                           # SVG ikonlar (geolocation, orientation, spinner)
index.html                        # Demo sayfası
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

## Mimari

### GPS Filtreleme Pipeline

Gelen her `locationfound` event'i şu sırayla işlenir:

1. **Accuracy kontrolü** — `maxAcceptableAccuracy` (varsayılan 100m) üstü reddedilir
2. **Geofence kontrolü** — Polygon/bounds/radius bazlı alan sınırı. Dışındaki konumlar reddedilir veya PDR'a geçilir
3. **Hız kontrolü** — `maxHumanSpeed` (5 m/s) ve `maxIndoorSpeed` (3 m/s) üstü reddedilir
4. **Sıçrama tespiti** — Ardışık konumlar arası mesafe `jumpThreshold`'u aşarsa filtrelenir
5. **Median filtre** — Son N konumun medyanı alınır (iç mekan: 7, dış mekan: 3 pencere)
6. **Kalman filtresi** — Tahmin-düzeltme döngüsü ile konum yumuşatma
7. **Low-pass filtre** — Yüksek frekanslı gürültüyü bastırır (`lowPassFilterTau`)

Reddedilen konumlarda `enableLastGoodLocation` aktifse son geçerli iç mekan konumu kullanılır.

### Geofence Dışı Davranış

Filtrelenmiş konum geofence dışında kaldığında:

- Son geçerli iç mekan konumu korunur
- Dead reckoning (PDR) aktifse ivmeölçer ile konum tahminine devam edilir
- Konum indikatörü ve accuracy circle normal şekilde gösterilmeye devam eder

### Pedestrian Dead Reckoning (PDR)

GPS sinyali kaybedildiğinde veya geofence dışına çıkıldığında ivmeölçer (`devicemotion`) ve pusula (`deviceorientation`) ile konum tahmini yapar.

**Adım tespit algoritması:**

Tam dalga formu doğrulama kullanır. Tek eşik geçişi yerine, bir adımın sayılması için sinyalin tam döngüsü gözlenir:

```
Faz 1: İvme eşiği aşar → zirve fazına gir, peak değerini takip et
Faz 2: İvme eşiğin %40'ının altına düşer → vadi tespit edildi
Faz 3: İvme tekrar yükselmeye başlar → tam dalga = 1 adım
```

Bu yaklaşım, bir adımda oluşan çift zirveyi (ayak kalkma + yere basma) tek adım olarak sayar.

Ek korumalar:
- **Cooldown** (400ms) — iki adım arası minimum süre
- **Minimum zirve büyüklüğü** (`pdrMinPeakValue: 0.8`) — küçük titreşimleri reddet
- **Adaptive threshold** — son 8 zirvenin ortalamasına göre eşiği dinamik ayarla, farklı yürüyüş hızlarına adapte ol
- **Buffer** (12 sample) — ivme verisini yumuşatarak gürültüyü bastır
- **Güvenlik zamanlayıcı** — 2 saniyeden uzun süren sahte zirve fazını sıfırla
- **Geofence sınır kontrolü** — PDR konumu bina dışına çıkamaz

Her adımda konum, pusula yönünde `pdrStepLength` (0.65m) kadar ilerletilir ve accuracy `pdrAccuracyDecay` (0.5m) kadar artar.

### Altitude ve Kat Tespiti

- Ham GPS altitude değeri geoid ondülasyonu (`geoidUndulation`) ile MSL'ye normalize edilir
- Median + low-pass filtre ile gürültü azaltılır
- `floors` dizisindeki `minAlt`/`maxAlt` aralıklarına göre kat belirlenir
- `floorHysteresis` (0.8m) ile kat sınırındaki titreşim engellenir
- `calibrateGroundFloor()` ile runtime'da zemin kat kalibrasyonu yapılabilir

### Yön Algılama

`deviceorientation` / `deviceorientationabsolute` event'leri ile pusula yönü takip edilir.

- Median smoothing ile jitter azaltma
- Gimbal lock koruması (beta > 70°) — telefon dik tutulduğunda yön titreşimini engeller
- Minimum açı değişimi eşiği (`minAngleChange: 3°`)

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
| `indoorMedianWindowSize` | `7` | İç mekan median penceresi |
| `indoorKalmanR` | `0.5` | İç mekan Kalman R değeri |
| `indoorLowPassTau` | `1.0` | İç mekan low-pass tau |
| `maxIndoorSpeed` | `3` | İç mekan maks hız (m/s) |
| `enableLastGoodLocation` | `true` | Son iyi konum fallback |
| `lastGoodLocationTimeout` | `30000` | Son iyi konum timeout (ms) |

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
| `pdrStepLength` | `0.65` | Adım uzunluğu (m) |
| `pdrStepThreshold` | `1.0` | High-pass ivme zirve eşiği (adaptive baz değer) |
| `pdrStepCooldown` | `300` | Adımlar arası min süre (ms) |
| `pdrMinPeakValue` | `0.7` | Minimum zirve büyüklüğü |
| `pdrAdaptiveThreshold` | `true` | Dinamik eşik |
| `pdrMaxDuration` | `300000` | Maks PDR süresi (ms) |
| `pdrMaxSteps` | `100` | Maks adım sayısı |
| `pdrAccuracyDecay` | `0.5` | Adım başına accuracy artışı (m) |
| `pdrInitialAccuracy` | `5` | Başlangıç accuracy (m) |

### Altitude ve Kat

| Parametre | Varsayılan | Açıklama |
|-----------|-----------|----------|
| `enableAltitude` | `false` | Altitude işleme |
| `geoidUndulation` | `37.0` | Geoid ondülasyonu (m) |
| `altitudeMedianWindow` | `5` | Altitude median penceresi |
| `altitudeLowPassTau` | `2.0` | Altitude low-pass tau |
| `enableFloorDetection` | `false` | Kat tespiti |
| `floorHeight` | `3.0` | Kat yüksekliği (m) |
| `floorHysteresis` | `0.8` | Kat değişim histerezisi (m) |
| `floors` | `null` | Manuel kat tanımları dizisi |

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

## Lisans

[leaflet-simple-locate](https://github.com/mfhsieh/leaflet-simple-locate) v1.0.5 baz alınarak genişletilmiştir.
