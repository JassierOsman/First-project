import * as THREE from 'three';
import { CONFIG } from '../config.js';

// Navigasyon = "dünya kökü"nün (worldRoot) oda uzayına göre dönüşümü.
// Kullanıcı (başlık + eller) her zaman oda uzayında kalır; hareket, döndürme ve
// ölçek değişimi dünyayı tersine hareket ettirerek yapılır. Böylece:
//   • XR el eklemleri doğrudan oda koordinatında okunur (kayma yok)
//   • 1:70 maket ↔ 1:1 insan ölçeği tek bir uniform ölçek değeridir
//   • Dünya yalnızca Y ekseni etrafında döner (ufuk her zaman düz → konfor)
//
// Dönüşüm: dünyaNoktası = position + R_y(yaw) · (scale · modelNoktası)

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

function isVisible(o) {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
}

export class Navigator {
  constructor(worldRoot, { walkables = [], fader = null } = {}) {
    this.root = worldRoot;
    this.walkables = walkables;
    this.fader = fader;
    this.yaw = 0;
    this.anim = null;
    this.raycaster = new THREE.Raycaster();
    this.listeners = new Set();
    this._lastModel = this.isModel;
    this.apply();
  }

  // ---------------------------------------------------------------- durum
  get scale() { return this.root.scale.x; }
  get position() { return this.root.position; }
  get isModel() { return this.scale < CONFIG.MODE_THRESHOLD; }
  get busy() { return this.anim !== null || (this.fader && this.fader.busy); }
  /** "1:70" gibi okunabilir ölçek etiketi */
  get scaleLabel() { return `1:${Math.max(1, Math.round(1 / this.scale))}`; }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  apply() {
    this.root.quaternion.setFromAxisAngle(UP, this.yaw);
    this.root.updateMatrixWorld(true);
    const m = this.isModel;
    if (m !== this._lastModel) {
      this._lastModel = m;
      for (const fn of this.listeners) fn({ type: 'mode', isModel: m });
    }
  }

  clampScale(s) {
    return THREE.MathUtils.clamp(s, CONFIG.MODEL_SCALE, CONFIG.HUMAN_SCALE);
  }

  // ---------------------------------------------------------------- temel işlemler
  /** Dünyayı oda uzayında kaydır */
  translate(delta) {
    this.root.position.add(delta);
    this.apply();
  }

  /** Dünyayı oda uzayındaki bir pivot etrafında Y ekseninde döndür */
  rotateAround(pivot, angle) {
    _q.setFromAxisAngle(UP, angle);
    this.root.position.sub(pivot).applyQuaternion(_q).add(pivot);
    this.yaw += angle;
    this.apply();
  }

  /** Dünyayı pivot etrafında k katı ölçekle (sınırlar içinde). Uygulanan katsayıyı döndürür. */
  scaleAround(pivot, k) {
    const s0 = this.scale;
    const s1 = this.clampScale(s0 * k);
    const f = s1 / s0;
    this.root.position.sub(pivot).multiplyScalar(f).add(pivot);
    this.root.scale.setScalar(s1);
    this.apply();
    return f;
  }

  /** Mutlak dönüşüm ata */
  set(position, yaw, scale) {
    this.root.position.copy(position);
    this.yaw = yaw;
    this.root.scale.setScalar(this.clampScale(scale));
    this.apply();
  }

  /** Bir model noktasını (P, dünya kökü yerel koordinatı) oda noktasına (T) yerleştir */
  placeModelPoint(P, T, scale = this.scale, yaw = this.yaw) {
    const s = this.clampScale(scale);
    _q.setFromAxisAngle(UP, yaw);
    _v.copy(P).multiplyScalar(s).applyQuaternion(_q);
    this.set(_v2.copy(T).sub(_v), yaw, s);
  }

  modelToWorld(P, target = new THREE.Vector3()) { return this.root.localToWorld(target.copy(P)); }
  worldToModel(W, target = new THREE.Vector3()) { return this.root.worldToLocal(target.copy(W)); }

  // ---------------------------------------------------------------- animasyon
  /**
   * P model noktası T oda noktasına giderken ölçek logaritmik, yaw doğrusal enterpole edilir.
   * Pivot tutarlı kaldığı için ölçek değişirken hedef nokta kaymaz.
   */
  animateTo({ P, T, scale, yaw = this.yaw, duration = 0.9, onDone = null }) {
    const from = this.modelToWorld(P);
    this.anim = {
      P: P.clone(), T0: from, T1: T.clone(),
      s0: this.scale, s1: this.clampScale(scale),
      y0: this.yaw, y1: yaw, t: 0, duration, onDone,
    };
  }

  update(dt) {
    if (!this.anim) return;
    const a = this.anim;
    a.t = Math.min(1, a.t + dt / a.duration);
    const e = a.t < 0.5 ? 4 * a.t ** 3 : 1 - (-2 * a.t + 2) ** 3 / 2; // easeInOutCubic
    const s = Math.exp(THREE.MathUtils.lerp(Math.log(a.s0), Math.log(a.s1), e));
    const yaw = THREE.MathUtils.lerp(a.y0, a.y1, e);
    _v2.lerpVectors(a.T0, a.T1, e);
    this.placeModelPoint(a.P, _v2, s, yaw);
    if (a.t >= 1) {
      this.anim = null;
      a.onDone && a.onDone();
    }
  }

  // ---------------------------------------------------------------- sorgular
  raycast(origin, dir, far = Infinity) {
    this.raycaster.set(origin, dir);
    this.raycaster.far = far;
    const hits = this.raycaster.intersectObjects(this.walkables, false);
    // Raycaster görünürlüğe bakmaz; gizli nesneleri (ör. maket modunda çevre arazisi) ele
    for (const h of hits) if (isVisible(h.object)) return h;
    return null;
  }

  /** Oda uzayında verilen noktanın altındaki en yüksek yürünebilir yüzeyin Y'si (yoksa null) */
  groundBelow(pointWorld, maxStepUp = CONFIG.STEP_HEIGHT) {
    _v.copy(pointWorld);
    const startY = _v.y;
    _v.y = startY + maxStepUp; // bir basamak yukarıdan başla
    const hit = this.raycast(_v, DOWN, maxStepUp + 50);
    return hit ? hit.point.y : null;
  }

  /**
   * İnsan modunda ayak altındaki zemini oda zeminine (y=0) hizala.
   * @param {THREE.Vector3} head başın oda konumu
   * @param {number} smoothing 0..1 (1 = anında)
   */
  followGround(head, smoothing = 1) {
    if (this.isModel) return;
    _v.set(head.x, 0, head.z);
    const y = this.groundBelow(_v);
    if (y === null) return;
    this.root.position.y -= y * smoothing;
    this.apply();
  }

  // ---------------------------------------------------------------- teleport
  /**
   * Dünyadaki bir noktaya ışınlan: o nokta kullanıcının ayaklarının altına gelir.
   * Maket modunda hedef ölçek 1:1 → maketin içine "dalış".
   */
  teleport(hitWorld, head, { scale = CONFIG.HUMAN_SCALE, yaw = this.yaw } = {}) {
    if (this.busy) return false;
    const P = this.worldToModel(hitWorld);
    const T = new THREE.Vector3(head.x, 0, head.z);
    const doIt = () => this.placeModelPoint(P, T, scale, yaw);
    if (this.fader) this.fader.blink(doIt);
    else doIt();
    return true;
  }
}
