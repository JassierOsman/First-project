import { HandFrame } from './HandFrame.js';
import { CONFIG } from '../config.js';

// Masaüstü: webcam + MediaPipe Hand Landmarker → HandFrame.
// Kütüphane yalnızca kullanıcı kamerayı açtığında CDN'den dinamik olarak yüklenir.

const MP_VERSION = '1.2.3';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

// ---- One Euro filtresi (titreşimi azaltır, hızlı harekette gecikmeyi düşük tutar)
class LowPass {
  constructor() { this.y = null; }
  filter(x, a) { this.y = this.y === null ? x : a * x + (1 - a) * this.y; return this.y; }
}
class OneEuro {
  constructor(minCutoff, beta, dCutoff = 1) {
    Object.assign(this, { minCutoff, beta, dCutoff });
    this.x = new LowPass(); this.dx = new LowPass(); this.t = null;
  }
  static alpha(cutoff, dt) { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); }
  filter(v, t) {
    const dt = this.t === null ? 1 / 30 : Math.max(1e-3, t - this.t);
    const prev = this.x.y;
    this.t = t;
    const dv = prev === null ? 0 : (v - prev) / dt;
    const edv = this.dx.filter(dv, OneEuro.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edv);
    return this.x.filter(v, OneEuro.alpha(cutoff, dt));
  }
}
const makeFilters = (n) => Array.from({ length: n }, () => new OneEuro(CONFIG.ONE_EURO_MIN_CUTOFF, CONFIG.ONE_EURO_BETA));

export class MediaPipeHandInput {
  constructor() {
    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.muted = true;
    this.landmarker = null;
    this.stream = null;
    this.running = false;
    this.lastVideoTime = -1;
    this.frames = { left: new HandFrame('left', 'mediapipe'), right: new HandFrame('right', 'mediapipe') };
    this.filters = {
      left: { w: makeFilters(63), s: makeFilters(42) },
      right: { w: makeFilters(63), s: makeFilters(42) },
    };
    this.lastResult = null;
    this.status = 'kapalı';
  }

  async start(onStatus = () => {}) {
    if (this.running) return;
    const set = (s) => { this.status = s; onStatus(s); };
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Bu tarayıcı kamera erişimini desteklemiyor (HTTPS gerekli).');
    set('kamera açılıyor…');
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
    this.video.srcObject = this.stream;
    await this.video.play();

    if (!this.landmarker) {
      set('MediaPipe yükleniyor…');
      const vision = await import(/* @vite-ignore */ `${MP_BASE}/vision_bundle.mjs`);
      const fileset = await vision.FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
      const opts = (delegate) => ({
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'VIDEO',
        numHands: CONFIG.MP_NUM_HANDS,
        minHandDetectionConfidence: CONFIG.MP_MIN_CONFIDENCE,
        minHandPresenceConfidence: CONFIG.MP_MIN_CONFIDENCE,
        minTrackingConfidence: 0.5,
      });
      try {
        this.landmarker = await vision.HandLandmarker.createFromOptions(fileset, opts('GPU'));
      } catch (e) {
        console.warn('GPU delegate başarısız, CPU deneniyor', e);
        this.landmarker = await vision.HandLandmarker.createFromOptions(fileset, opts('CPU'));
      }
    }
    this.running = true;
    set('el takibi açık');
  }

  stop() {
    this.running = false;
    if (this.stream) for (const t of this.stream.getTracks()) t.stop();
    this.stream = null;
    this.video.srcObject = null;
    this.frames.left.tracked = this.frames.right.tracked = false;
    this.lastResult = null;
    this.status = 'kapalı';
  }

  /** Her animasyon karesinde çağır; yeni video karesi varsa algılama yapar */
  update(nowMs) {
    if (!this.running || !this.landmarker || this.video.readyState < 2) return this.frames;
    if (this.video.currentTime === this.lastVideoTime) return this.frames;
    this.lastVideoTime = this.video.currentTime;

    const res = this.landmarker.detectForVideo(this.video, nowMs);
    this.lastResult = res;
    const t = nowMs / 1000;
    const seen = { left: false, right: false };

    const n = res.landmarks ? res.landmarks.length : 0;
    const assigned = [];
    for (let i = 0; i < n; i++) {
      const cat = res.handedness?.[i]?.[0]?.categoryName || 'Right';
      let side = cat.toLowerCase() === 'left' ? 'left' : 'right';
      if (CONFIG.MP_SWAP_HANDEDNESS) side = side === 'left' ? 'right' : 'left';
      assigned.push(side);
    }
    // İki el aynı etiketi aldıysa ekran konumuna göre ayır (kullanıcının sağı = aynalı görüntüde sağ)
    if (n === 2 && assigned[0] === assigned[1]) {
      const x0 = 1 - res.landmarks[0][0].x, x1 = 1 - res.landmarks[1][0].x;
      assigned[0] = x0 < x1 ? 'left' : 'right';
      assigned[1] = x0 < x1 ? 'right' : 'left';
    }

    for (let i = 0; i < n; i++) {
      const side = assigned[i];
      if (seen[side]) continue;
      seen[side] = true;
      const f = this.frames[side];
      const fl = this.filters[side];
      const lm = res.landmarks[i];
      const wl = res.worldLandmarks?.[i] || lm;
      for (let k = 0; k < 21; k++) {
        f.joints[k].set(
          fl.w[k * 3].filter(wl[k].x, t),
          fl.w[k * 3 + 1].filter(wl[k].y, t),
          fl.w[k * 3 + 2].filter(wl[k].z, t),
        );
        // aynalanmış ekran koordinatı: kullanıcı elini sağa götürünce x artar
        f.screen[k].set(fl.s[k * 2].filter(1 - lm[k].x, t), fl.s[k * 2 + 1].filter(lm[k].y, t));
      }
      f.handedness = side;
      f.tracked = true;
      f.time = t;
    }
    for (const side of ['left', 'right']) {
      if (!seen[side]) {
        this.frames[side].tracked = false;
        // filtreleri sıfırla ki el geri geldiğinde eski konumdan kaymasın
        for (const arr of [this.filters[side].w, this.filters[side].s]) for (const fl of arr) { fl.x.y = null; fl.dx.y = null; fl.t = null; }
      }
    }
    return this.frames;
  }

  /** Önizleme: aynalı video + iskelet */
  drawPreview(canvas, states) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    if (this.running && this.video.readyState >= 2) {
      ctx.translate(W, 0); ctx.scale(-1, 1);
      ctx.drawImage(this.video, 0, 0, W, H);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    ctx.restore();
    const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
    for (const side of ['left', 'right']) {
      const f = this.frames[side];
      if (!f.tracked) continue;
      const st = states?.[side];
      ctx.strokeStyle = st?.pinch ? '#ffd166' : side === 'left' ? '#3ad1ff' : '#7ae582';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const [a, b] of BONES) {
        ctx.moveTo(f.screen[a].x * W, f.screen[a].y * H);
        ctx.lineTo(f.screen[b].x * W, f.screen[b].y * H);
      }
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.font = '600 12px system-ui';
      ctx.fillText(`${side === 'left' ? 'SOL' : 'SAĞ'} ${st?.pose ?? ''}`, f.screen[0].x * W - 20, f.screen[0].y * H + 16);
    }
  }
}
