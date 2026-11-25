// Tüm ayarlanabilir sabitler tek yerde.
// URL parametreleriyle de bazıları değiştirilebilir: ?shadows=0&debug=1&scale=70

const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const num = (k, d) => (params.has(k) && !Number.isNaN(parseFloat(params.get(k))) ? parseFloat(params.get(k)) : d);
const bool = (k, d) => (params.has(k) ? params.get(k) !== '0' && params.get(k) !== 'false' : d);

export const CONFIG = {
  // --- Ölçek -------------------------------------------------------------
  MODEL_SCALE_DENOMINATOR: num('scale', 70), // 1:70 maket
  get MODEL_SCALE() { return 1 / this.MODEL_SCALE_DENOMINATOR; },
  HUMAN_SCALE: 1,
  MODE_THRESHOLD: 0.5,          // ölçek < 0.5 → "maket modu", >= 0.5 → "insan modu"
  SCALE_SNAP_TOLERANCE: 0.08,   // iki el bırakıldığında 1:1 / 1:70'e %8 yakınsa yapış
  TABLE_HEIGHT: 0.82,           // maket masası yüksekliği (m, oda ölçeğinde)
  TABLE_DISTANCE: 0.7,          // masa merkezi başın ne kadar önünde (m)
  TABLE_MAX_SCALE: 1 / 30,      // bu ölçeğin üstünde masa gizlenir

  // --- Hareket -----------------------------------------------------------
  FLY_SPEED_HUMAN: 2.2,         // m/s (gerçek ölçek)
  FLY_SPEED_MODEL: 0.35,        // m/s (oda ölçeğinde, maket modunda)
  FLY_RAMP_TIME: 0.6,           // tam hıza çıkma süresi (s)
  FLY_DWELL: 0.25,              // işaret jesti bu kadar tutulunca uçuş başlar (s)
  GROUND_FOLLOW: bool('ground', true), // insan modunda zemini takip et
  STEP_HEIGHT: 0.6,             // zemin takibinde çıkılabilecek basamak (m)
  SNAP_TURN_DEG: 30,            // kontrolcü yedeği için

  // --- Teleport ----------------------------------------------------------
  TELEPORT_AIM_MIN: 0.3,        // "parmak tabanca" en az bu kadar tutulmalı (s)
  TELEPORT_ARC_SPEED: 7.5,      // m/s
  TELEPORT_ARC_GRAVITY: 9.8,
  TELEPORT_ARC_STEPS: 40,
  TELEPORT_ARC_DT: 0.04,
  FADE_TIME: 0.14,              // teleport kararma süresi (s)

  // --- Jest eşikleri (el boyutuna göre normalize; el boyu = bilek→orta parmak MCP) ---
  PINCH_ON: 0.26,               // başparmak ucu ↔ işaret ucu / el boyu
  PINCH_OFF: 0.42,
  FINGER_EXT_ON: 0.88,          // parmak düzlüğü (uç-MCP / segment toplamı)
  FINGER_EXT_OFF: 0.80,
  FINGER_CURL_ON: 0.70,
  THUMB_OUT_ON: 0.70,           // başparmak ucu ↔ işaret MCP / el boyu ("tabanca" başparmağı yukarı)
  THUMB_OUT_OFF: 0.55,
  PALM_UP_DOT: 0.70,            // avuç normali · yukarı
  TOGGLE_HOLD: 1.2,             // ölçek değiştirme jesti tutma süresi (s)
  GESTURE_COOLDOWN: 0.4,

  // --- Masaüstü (MediaPipe) ---------------------------------------------
  MP_SWAP_HANDEDNESS: true,     // aynalanmamış webcam görüntüsünde sol/sağ etiketleri ters gelir
  MP_NUM_HANDS: 2,
  MP_MIN_CONFIDENCE: 0.6,
  DESKTOP_DRAG_GAIN_HUMAN: 8,   // görüntü genişliği kadar sürükleme = 8 m
  DESKTOP_DRAG_GAIN_MODEL: 1.2, // maket modunda (oda metresi)
  DESKTOP_TURN_RATE: 1.6,       // rad/s, parmak eğimi 45°'de
  DESKTOP_EYE_HEIGHT: 1.6,
  ONE_EURO_MIN_CUTOFF: 1.2,
  ONE_EURO_BETA: 0.02,

  // --- Konfor / görsel --------------------------------------------------
  VIGNETTE: bool('vignette', true),
  VIGNETTE_MAX: 0.75,
  SHADOWS: bool('shadows', true),
  HAND_MODEL: params.get('hands') || 'mesh', // 'mesh' | 'spheres' | 'boxes'
  DEBUG: bool('debug', false),
};
