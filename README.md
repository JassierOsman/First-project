# WebXR Quest 3 – El Takibiyle VR Navigasyon (1:70)

Meta Quest 3 tarayıcısında **native WebXR Hand Tracking** ile, masaüstünde ise **webcam + MediaPipe Hand Landmarker** ile kontrol edilen bir mimari maket gezinti sistemi.

* Sahne **1:70 maket** olarak bir masanın üstünde açılır; tek jestle **1:1 insan ölçeğine** geçilir veya maketin herhangi bir noktasına "dalınır".
* **Backend, sunucu ya da build yok.** Saf ES modülleri + import map. GitHub Pages'e yüklemek yeterli.
* Three.js r187 ve MediaPipe tasks-vision 1.2.3 CDN'den (jsDelivr) yüklenir.

---

## 1. GitHub Pages'e yayınlama

1. Bu klasörün içeriğini bir GitHub deposunun köküne koyun (`index.html` kökte olmalı).
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch**, dal: `main`, klasör: `/ (root)`.
3. Birkaç dakika sonra `https://<kullanıcı>.github.io/<depo>/` adresinde yayında olur.

`.nojekyll` dosyası, Pages'in Jekyll işlemesini kapatır (dosyalar olduğu gibi sunulur).

> WebXR ve kamera erişimi **HTTPS** ister. GitHub Pages HTTPS sağlar; yerelde `http://localhost` da güvenli sayılır.

## 2. Quest 3'te kullanım

1. Quest'te el takibini açın: **Ayarlar → Hareket takibi → El ve vücut takibi** (kontrolcüleri bırakınca eller otomatik devreye girer).
2. **Quest Browser** ile GitHub Pages adresini açın → sağ üstteki **ENTER VR**.
3. Maket önünüzdeki masada belirir; karşınızda bir yardım paneli açılır (25 sn sonra kapanır).

### El hareketleri (VR)

| Jest | Nasıl | Ne yapar |
|---|---|---|
| **İşaret et** | İşaret parmağı uzun, diğer parmaklar kapalı, başparmak içeride | Parmağın gösterdiği yöne ilerle (insan ölçeğinde yatay, 0.6 sn'de hızlanır) |
| **Tut-çek** | Başparmak + işaret ucu birleşik, eli hareket ettir | Dünyayı elinle sürükle. Kendine çekersen ilerlersin |
| **İki elle tut** | İki elde pinch | Döndür (dikey eksen) + ölçekle (1:70 … 1:1) + taşı. 1:1 / 1:70'e %8 yakın bırakılırsa oraya oturur |
| **Tabanca → ateş** | İşaret + başparmak yukarı (nişan yayı çıkar), sonra başparmağı indir | Hedefe ışınlan. **Maket modunda bu, o noktaya 1:1 dalış demektir** |
| **Sol avuç yukarı** | 1.2 sn tut (bilek panelinde halka dolar) | 1:70 maket ↔ 1:1 insan ölçeği |
| **Sağ avuç yukarı** | 1.2 sn tut | Yardım panelini aç/kapat |

Sol bileğinizin üstündeki küçük panel; güncel ölçeği (`1:70` / `1:1`) ve iki elin tanınan jestini gösterir.

**Konfor:** Sürekli harekette kenarlarda tünel efekti (vinyet) koyulaşır, ışınlanmada kısa kararma olur, dünya yalnızca dikey eksen etrafında döner (ufuk hep düz kalır). Avucunuz size dönükken yaptığınız pinch'ler yok sayılır, böylece Quest'in sistem menüsü jestiyle çakışmaz.

**Kontrolcü yedeği:** Sol çubuk ile yürünür, sağ çubuk 30° döndürür. **A** ölçek değiştirir, **X** yardım panelini açar.

## 3. Masaüstünde kullanım

Sayfayı açınca maket ekranda görünür. Sağ üstteki **Kamera ile el takibi** düğmesi webcam'i ve MediaPipe'ı başlatır (ilk açılışta model indirilir, birkaç saniye sürebilir). Sağ altta aynalı kamera önizlemesi ve el iskeleti çıkar.

| Webcam jesti | Ne yapar |
|---|---|
| **İşaret** (parmak yukarı) | İleri git. Parmağı sağa/sola eğince döner, aşağı gösterince geri gider |
| **Pinch + sürükle** | Dünyayı kaydır. Eli aşağı çekmek ileri götürür |
| **İki el pinch** | Ellerini açıp kapatarak ölçekle, çevirerek döndür |
| **Tabanca → başparmak indir** | Ekran ortasındaki nişangâha ışınlan |
| **İki avuç açık**, 1.2 sn | 1:70 ↔ 1:1 |

| Klavye / fare | Ne yapar |
|---|---|
| `W A S D` (+`Shift`) | Yürü |
| `Q` / `E` | Alçal / yüksel (maket modunda) |
| `← →` `↑ ↓` · fare sürükle | Bak |
| Tekerlek | Ekran ortası etrafında ölçekle |
| Çift tık | Tıklanan yüzeye ışınlan (maket modunda 1:1 dalış) |
| `M` · `R` · `H` | Ölçek değiştir · sıfırla · yardım |

## 4. Ölçek mantığı (1:70)

Bütün sahne **gerçek metre** ile modellenmiştir: 72 × 52 m'lik bir arsada 2 katlı bir pavyon (merdivenlerle çatı terasına çıkılabilir), 21 m'lik bir kule, evler, bir havuz, ağaçlar ve 1.75 m boyunda ölçek insanları var.

Ölçek, tek bir sayıyla, yani "dünya kökünün" ölçeğiyle ifade edilir:

* `scale = 1/70` iken arsa **1.03 × 0.74 m**'lik bir maket olur ve masaya sığar.
* `scale = 1` iken gerçek boyutta içinde yürürsünüz.

Kullanıcının kafası ve elleri hep oda koordinatında kalır. Hareketin tamamı dünyanın ters yönde kaydırılması, döndürülmesi ya da ölçeklenmesiyle yapılır:

```
dünyaNoktası = konum + R_y(yaw) · (ölçek · modelNoktası)
```

Bu sayede el eklemleri doğrudan, kaymadan okunur. Ölçek değişimi her zaman bir pivot noktası etrafında yapılır, yani tuttuğunuz nokta parmaklarınızın arasında kalır. Maket moduna geçince bulunduğunuz yere kırmızı bir **"buradasınız"** figürü konur.

Maket ölçeğini değiştirmek için `?scale=100` gibi bir URL parametresi ya da `js/config.js` kullanılabilir.

## 5. Mimari

```
index.html              import map (three@0.187.0), arayüz
css/style.css
js/
  main.js               renderer, sahne, VR düğmesi, ana döngü
  config.js             tüm eşikler/hızlar (URL ile değiştirilebilir)
  input/
    HandFrame.js        ortak 21 noktalı el yapısı (WebXR 25 eklem → MediaPipe sırası)
    GestureRecognizer.js  platformdan bağımsız jest tanıma (histerezis, bekleme, olaylar)
    XRHandInput.js      Quest native hand input → HandFrame
    MediaPipeHandInput.js webcam + HandLandmarker → HandFrame (One-Euro filtresi)
  nav/
    Navigator.js        dünya dönüşümü: kaydır/döndür/ölçekle, animasyon, zemin takibi, teleport
    ScaleModes.js       1:70 ↔ 1:1 geçişleri
  locomotion/
    XRLocomotion.js     VR: jest → navigasyon (+ kontrolcü yedeği)
    DesktopLocomotion.js masaüstü: webcam jestleri + klavye/fare
  scene/
    World.js            prosedürel maket (gerçek metre)
    Environment.js      ışık, gölge, masa, stüdyo zemini
  ui/
    TeleportArc.js      parabolik yay (insan) / düz ışın (maket)
    ComfortFX.js        kararma + vinyet
    Panels.js           VR bilek paneli + yardım paneli
    DesktopHUD.js       masaüstü göstergeleri
tests/                  Node birim testleri (yalnızca geliştirme)
```

**Veri akışı:** `XRHandInput` veya `MediaPipeHandInput` bir `HandFrame` üretir. `GestureRecognizer` buradan poz ve olayları çıkarır. `XRLocomotion` veya `DesktopLocomotion` bunları `Navigator` işlemlerine çevirir. İki platform aynı jest tanıyıcıyı paylaşır.

## 6. Ayarlar ve hata ayıklama

`js/config.js` içindeki her şey düzenlenebilir. Sık kullanılan URL parametreleri:

| Parametre | Örnek | Açıklama |
|---|---|---|
| `scale` | `?scale=50` | Maket ölçeği paydası (varsayılan 70) |
| `debug` | `?debug=1` | Masaüstünde jest metriklerini gösterir (eşik ayarı için) |
| `shadows` | `?shadows=0` | Gölgeleri kapatır (performans) |
| `vignette` | `?vignette=0` | Tünel efektini kapatır |
| `ground` | `?ground=0` | Zemin takibini kapatır (serbest uçuş) |
| `hands` | `?hands=spheres` | VR el görünümü: `mesh` / `spheres` / `boxes` |

Jestler kişiden kişiye farklı tanınıyorsa `PINCH_ON/OFF`, `FINGER_EXT_*`, `THUMB_OUT_*` eşiklerini ayarlayın. Hepsi el boyuna göre normalize edilmiş oranlardır.

## 7. Yerel geliştirme ve testler

```bash
npx http-server -c-1 -p 8080 .    # veya: python3 -m http.server 8080
# Quest'i USB ile bağlayıp:  adb reverse tcp:8080 tcp:8080
# Quest Browser'da http://localhost:8080 (localhost güvenli sayılır)

npm install       # yalnızca testler için three'yi indirir
npm test          # 19 test: jest tanıma, navigasyon matematiği, VR lokomosyon akışı
```

Testler sentetik el pozları üretir (açık el, işaret, tabanca, pinch, avuç yukarı, avucu başa dönük pinch) ve tanıyıcı ile VR lokomosyonunun uçtan uca davranışını doğrular.

## 8. Bilinen sınırlamalar

* **Çarpışma yok:** Duvarların içinden geçilebilir. Zemin takibi merdiven ve katları izler (0.6 m'ye kadar basamak).
* **Masaüstü derinliği:** Webcam tek kamera olduğu için masaüstü jestleri 2B ekran hareketine dayanır. VR'daki gibi 3B "çekme" yapılamaz.
* **MediaPipe sol/sağ etiketi** aynalanmamış görüntüde ters gelir; kod bunu düzeltir (`MP_SWAP_HANDEDNESS`).
* Sahne prosedüreldir. Kendi GLB modelinizi kullanmak için `World.js`'i bir `GLTFLoader` çağrısıyla değiştirin, yürünebilir yüzeyleri `walkables` dizisine ekleyin ve `SITE` ölçülerini modelin sınır kutusuna göre ayarlayın.
