import * as THREE from 'three';

// Ortak el temsili: MediaPipe'ın 21 nokta sırası.
//  0 bilek | 1-4 başparmak (CMC, MCP, IP, uç) | 5-8 işaret (MCP, PIP, DIP, uç)
//  9-12 orta | 13-16 yüzük | 17-20 serçe
// Hem WebXR (25 eklem) hem MediaPipe bu yapıya dönüştürülür; jest tanıyıcı
// yalnızca HandFrame ile çalışır, böylece iki platform aynı mantığı paylaşır.

export const J = {
  WRIST: 0,
  THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4,
  INDEX_MCP: 5, INDEX_PIP: 6, INDEX_DIP: 7, INDEX_TIP: 8,
  MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
  RING_MCP: 13, RING_PIP: 14, RING_DIP: 15, RING_TIP: 16,
  PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20,
};

// WebXR eklem adı → MediaPipe indeksi
export const XR_TO_MP = [
  'wrist',
  'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip',
  'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip',
  'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip',
  'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip',
];

export class HandFrame {
  constructor(handedness = 'right', source = 'xr') {
    this.handedness = handedness; // 'left' | 'right'
    this.source = source;         // 'xr' | 'mediapipe'
    this.tracked = false;
    // 3B eklemler (metre). XR'da dünya/oda uzayında; MediaPipe'da el merkezli "world landmarks"
    // (x sağ, y aşağı, z kameraya doğru negatif) — yalnızca şekil analizi için kullanılır.
    this.joints = Array.from({ length: 21 }, () => new THREE.Vector3());
    // Yalnızca MediaPipe: aynalanmış normalize görüntü koordinatları (0..1, kullanıcının bakışıyla)
    this.screen = Array.from({ length: 21 }, () => new THREE.Vector2());
    this.time = 0;
  }

  /** XRHand grubu (three.js renderer.xr.getHand) → HandFrame */
  fromXRHand(hand) {
    const joints = hand.joints;
    if (!joints || !joints['wrist'] || !joints['wrist'].visible || !joints['index-finger-tip']) {
      this.tracked = false;
      return this;
    }
    for (let i = 0; i < 21; i++) {
      const j = joints[XR_TO_MP[i]];
      if (!j) { this.tracked = false; return this; }
      // El grubu sahne kökünde (kimlik dönüşümü) olduğundan yerel konum = oda/dünya konumu
      this.joints[i].copy(j.position);
    }
    this.tracked = true;
    return this;
  }

  /** Bir HandFrame'i diğerine kopyala */
  copy(other) {
    this.handedness = other.handedness;
    this.source = other.source;
    this.tracked = other.tracked;
    this.time = other.time;
    for (let i = 0; i < 21; i++) {
      this.joints[i].copy(other.joints[i]);
      this.screen[i].copy(other.screen[i]);
    }
    return this;
  }

  /** El boyu: bilek → orta parmak MCP (tipik ~0.085–0.095 m). Normalizasyon için. */
  size() {
    return Math.max(1e-4, this.joints[J.WRIST].distanceTo(this.joints[J.MIDDLE_MCP]));
  }
}
