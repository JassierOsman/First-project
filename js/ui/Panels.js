import * as THREE from 'three';

// VR içi metin panelleri (CanvasTexture). Doku yalnızca içerik değişince yeniden yüklenir.

class CanvasPanel {
  constructor(widthPx, heightPx, widthM) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = widthPx;
    this.canvas.height = heightPx;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    const h = widthM * (heightPx / widthPx);
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(widthM, h),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false, fog: false }),
    );
    this.mesh.renderOrder = 950;
    this._key = '';
  }

  roundRect(x, y, w, h, r) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
}

export class WristPanel extends CanvasPanel {
  constructor(scene) {
    super(512, 288, 0.13);
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /**
   * @param {object} s { scaleLabel, isModel, left, right, progress, progressLabel }
   */
  draw(s) {
    const key = JSON.stringify([s.scaleLabel, s.isModel, s.left, s.right, Math.round((s.progress || 0) * 20), s.progressLabel]);
    if (key === this._key) return;
    this._key = key;
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(12,18,26,0.82)';
    this.roundRect(4, 4, W - 8, H - 8, 28); c.fill();
    c.fillStyle = s.isModel ? '#ffd166' : '#3ad1ff';
    c.font = '700 84px system-ui, sans-serif';
    c.textBaseline = 'top';
    c.fillText(s.scaleLabel, 30, 22);
    c.font = '600 34px system-ui, sans-serif';
    c.fillStyle = '#e8eef5';
    c.fillText(s.isModel ? 'MAKET' : 'İNSAN ÖLÇEĞİ', 30, 116);
    c.font = '500 30px system-ui, sans-serif';
    c.fillStyle = '#9fb3c8';
    c.fillText(`Sol: ${s.left}`, 30, 172);
    c.fillText(`Sağ: ${s.right}`, 30, 214);
    if (s.progress > 0) {
      const cx = W - 80, cy = 82, r = 52;
      c.lineWidth = 14;
      c.strokeStyle = 'rgba(255,255,255,0.18)';
      c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = '#ffd166';
      c.beginPath(); c.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * s.progress); c.stroke();
      c.font = '600 24px system-ui, sans-serif';
      c.fillStyle = '#ffd166';
      c.textAlign = 'center';
      c.fillText(s.progressLabel || '', cx, cy + r + 18);
      c.textAlign = 'left';
    }
    this.texture.needsUpdate = true;
  }

  /** Sol bileğin biraz üstünde, başa dönük konumla */
  place(wrist, palmNormal, head) {
    this.mesh.position.copy(wrist).addScaledVector(palmNormal, -0.06);
    this.mesh.position.y += 0.05;
    this.mesh.lookAt(head);
  }
}

export const HELP_LINES = [
  ['İŞARET ET', 'İşaret parmağı uzat, diğerleri kapalı → o yöne ilerle'],
  ['TUT-ÇEK', 'Başparmak + işaret parmağı birleştir, çek → dünyayı sürükle'],
  ['İKİ EL', 'İki elle tut → döndür + ölçekle (1:70 ↔ 1:1)'],
  ['TABANCA', 'İşaret + başparmak yukarı → nişan al, başparmağı indir → ışınlan'],
  ['', 'Maket modunda ışınlanma = maketin içine 1:1 dalış'],
  ['SOL AVUÇ ↑', '1.2 sn tut → 1:70 maket ↔ 1:1 insan ölçeği'],
  ['SAĞ AVUÇ ↑', '1.2 sn tut → bu paneli aç / kapat'],
];

export class HelpPanel extends CanvasPanel {
  constructor(scene) {
    super(1024, 640, 0.9);
    scene.add(this.mesh);
    this.mesh.visible = false;
    this.timer = 0;
    this.draw();
  }

  draw() {
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(12,18,26,0.88)';
    this.roundRect(6, 6, W - 12, H - 12, 36); c.fill();
    c.fillStyle = '#ffd166';
    c.font = '700 52px system-ui, sans-serif';
    c.textBaseline = 'top';
    c.fillText('El hareketleri', 48, 40);
    let y = 128;
    for (const [k, v] of HELP_LINES) {
      c.font = '700 30px system-ui, sans-serif';
      c.fillStyle = '#3ad1ff';
      c.fillText(k, 48, y);
      c.font = '500 30px system-ui, sans-serif';
      c.fillStyle = '#e8eef5';
      c.fillText(v, 270, y);
      y += 66;
    }
    this.texture.needsUpdate = true;
  }

  /** Başın önünde göster; seconds sonra kendiliğinden kapanır (0 = kapanmaz) */
  show(head, forward, seconds = 20) {
    const f = forward.clone(); f.y = 0;
    if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
    f.normalize();
    this.mesh.position.copy(head).addScaledVector(f, 1.2);
    this.mesh.position.y = head.y - 0.1;
    this.mesh.lookAt(head.x, this.mesh.position.y, head.z);
    this.mesh.visible = true;
    this.timer = seconds;
  }

  hide() { this.mesh.visible = false; }
  toggle(head, forward) { if (this.mesh.visible) this.hide(); else this.show(head, forward, 0); }

  update(dt) {
    if (this.mesh.visible && this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) this.hide();
    }
  }
}
