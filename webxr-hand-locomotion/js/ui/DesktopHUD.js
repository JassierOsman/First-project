import { CONFIG } from '../config.js';

// Masaüstü HTML arayüzü: ölçek göstergesi, jest durumu, kamera önizlemesi.

const POSE_TR = { PINCH: 'Tut (pinch)', GUN: 'Tabanca — nişan', POINT: 'İşaret', OPEN_PALM: 'Açık avuç', NONE: '—' };
const $ = (id) => document.getElementById(id);

export class DesktopHUD {
  constructor(handInput) {
    this.handInput = handInput;
    this.el = {
      scale: $('hud-scale'), mode: $('hud-mode'), left: $('hud-left'), right: $('hud-right'),
      fps: $('hud-fps'), bar: $('hud-toggle-bar'), toggleWrap: $('hud-toggle'),
      preview: $('preview'), debug: $('hud-debug'), crosshair: $('crosshair'),
    };
    this.frames = 0; this.acc = 0; this._last = {};
    if (CONFIG.DEBUG) this.el.debug.hidden = false;
  }

  set(key, el, text) {
    if (this._last[key] !== text) { this._last[key] = text; el.textContent = text; }
  }

  update({ nav, L, R, toggleHold, handRunning }, dt = 1 / 60) {
    this.set('scale', this.el.scale, nav.scaleLabel);
    this.set('mode', this.el.mode, nav.isModel ? 'MAKET' : 'İNSAN ÖLÇEĞİ');
    this.el.scale.dataset.model = nav.isModel ? '1' : '0';
    const lbl = (s) => (!handRunning ? '—' : !s.tracked ? 'görünmüyor' : s.flying ? 'İşaret — hareket' : POSE_TR[s.pose] || s.pose);
    this.set('l', this.el.left, lbl(L));
    this.set('r', this.el.right, lbl(R));
    this.el.toggleWrap.hidden = !(toggleHold > 0);
    this.el.bar.style.width = `${Math.round(toggleHold * 100)}%`;
    this.el.crosshair.dataset.aim = L.aiming || R.aiming ? '1' : '0';

    if (handRunning) {
      this.el.preview.hidden = false;
      this.handInput.drawPreview(this.el.preview, { left: L, right: R });
    } else this.el.preview.hidden = true;

    if (CONFIG.DEBUG) {
      const m = (s) => `pinch ${s.metrics.pinch.toFixed(2)} thumb ${s.metrics.thumbOut.toFixed(2)} str ${s.metrics.straight.map((v) => v.toFixed(2)).join('/')}`;
      this.set('dbg', this.el.debug, `L ${m(L)}\nR ${m(R)}`);
    }
  }

  tickFps(dt) {
    this.frames++; this.acc += dt;
    if (this.acc >= 0.5) {
      this.set('fps', this.el.fps, `${Math.round(this.frames / this.acc)} fps`);
      this.frames = 0; this.acc = 0;
    }
  }
}
