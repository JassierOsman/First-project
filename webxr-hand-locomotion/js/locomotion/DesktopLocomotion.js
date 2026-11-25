import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { GestureRecognizer } from '../input/GestureRecognizer.js';
import { toggleScale, placeModelInFront } from '../nav/ScaleModes.js';

// Masaüstü navigasyonu: webcam el hareketleri (MediaPipe) + klavye/fare yedeği.
//
//  Webcam                                   Klavye / fare
//  İŞARET yukarı → ileri, eğ → dön         W A S D  yürü · Q/E alçal/yüksel (maket)
//  İŞARET aşağı → geri                      ← → dön · fare sürükle = bak
//  PINCH sürükle → dünyayı kaydır           tekerlek = ölçek (1:70…1:1)
//  İKİ EL PINCH → ölçekle + döndür          çift tık = ışınlan
//  TABANCA → başparmak indir = ışınlan      M = 1:70 ↔ 1:1 · H = yardım
//  İKİ AVUÇ AÇIK 1.2 sn → 1:70 ↔ 1:1

const UP = new THREE.Vector3(0, 1, 0);
const _fwd = new THREE.Vector3();
const _flat = new THREE.Vector3();
const _right = new THREE.Vector3();
const _d = new THREE.Vector3();
const _pivot = new THREE.Vector3();
const _ray = new THREE.Raycaster();
const MODEL_VIEW_DISTANCE = 1.05;

export class DesktopLocomotion {
  constructor({ dom, camera, nav, world, arc, handInput, hud }) {
    Object.assign(this, { dom, camera, nav, world, arc, handInput, hud });
    this.rec = new GestureRecognizer({ palmUpEnabled: false, toggleGesture: 'none' });
    this.keys = new Set();
    this.yaw = 0;
    this.pitch = 0;
    this.pitchTarget = null;
    this.drag = null;
    this.prevPinch = { left: null, right: null };
    this.twoPrev = null;
    this.toggleHold = 0;
    this.toggleLatched = false;
    this.flyTime = 0;
    this.enabled = true;
    camera.rotation.order = 'YXZ';
    this.bindEvents();
  }

  /** Açılış: maket masada, kamera masaya bakıyor */
  init() {
    this.resetCamera();
    const head = this.camera.position;
    placeModelInFront(this.nav, this.world, head, this.forward(), MODEL_VIEW_DISTANCE);
    this.lookAtTable(true);
  }

  resetCamera() {
    this.camera.position.set(0, CONFIG.DESKTOP_EYE_HEIGHT, 0);
    this.camera.quaternion.identity();
    this.camera.scale.set(1, 1, 1);
    this.applyRotation();
  }

  lookAtTable(instant = false) {
    const p = -Math.atan2(CONFIG.DESKTOP_EYE_HEIGHT - CONFIG.TABLE_HEIGHT, MODEL_VIEW_DISTANCE) * 0.85;
    if (instant) { this.pitch = p; this.applyRotation(); } else this.pitchTarget = p;
  }

  forward(target = _fwd) { return this.camera.getWorldDirection(target); }

  applyRotation() {
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.45, 1.45);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.updateMatrixWorld();
  }

  toggle() {
    const wasModel = this.nav.isModel;
    const ok = toggleScale(this.nav, this.world, this.camera.position, this.forward().clone(), { distance: MODEL_VIEW_DISTANCE, gazeDir: this.forward().clone() });
    if (!ok) return;
    if (wasModel) this.pitchTarget = -0.05; else this.lookAtTable();
  }

  // ------------------------------------------------------------ olaylar
  bindEvents() {
    const el = this.dom;
    window.addEventListener('keydown', (e) => {
      if (!this.enabled || e.target instanceof HTMLInputElement) return;
      this.keys.add(e.code);
      if (e.code === 'KeyM') this.toggle();
      if (e.code === 'KeyR') this.init();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.drag = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.drag || !this.enabled) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.drag = { x: e.clientX, y: e.clientY };
      this.yaw -= dx * 0.004;
      this.pitch -= dy * 0.004;
      this.pitchTarget = null;
      this.applyRotation();
    });
    el.addEventListener('pointerup', () => { this.drag = null; });
    el.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const k = Math.exp(-e.deltaY * 0.0015);
      this.nav.scaleAround(this.pivot(), k);
      this.afterScale();
    }, { passive: false });
    el.addEventListener('dblclick', (e) => {
      if (!this.enabled) return;
      const r = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      _ray.setFromCamera(ndc, this.camera);
      const hit = this.nav.raycast(_ray.ray.origin, _ray.ray.direction, 500);
      if (hit) this.teleportTo(hit.point);
    });
  }

  teleportTo(point) {
    const wasModel = this.nav.isModel;
    if (this.nav.teleport(point, this.camera.position, { scale: CONFIG.HUMAN_SCALE }) && wasModel) this.pitchTarget = -0.05;
  }

  /** Ölçek/dönüş pivotu: ekran merkezindeki yüzey, yoksa önde bir nokta */
  pivot() {
    const f = this.forward();
    const hit = this.nav.raycast(this.camera.position, f, 500);
    if (hit) return _pivot.copy(hit.point);
    return _pivot.copy(this.camera.position).addScaledVector(f, this.nav.isModel ? 1 : 5);
  }

  afterScale() {
    if (!this.nav.isModel && CONFIG.GROUND_FOLLOW) this.nav.followGround(this.camera.position);
  }

  // ------------------------------------------------------------ kare güncellemesi
  update(dt, nowMs) {
    const { nav } = this;
    const head = this.camera.position;
    const f = this.forward();
    _flat.copy(f); _flat.y = 0;
    if (_flat.lengthSq() < 1e-6) _flat.set(0, 0, -1);
    _flat.normalize();
    _right.crossVectors(_flat, UP).normalize();
    const base = nav.isModel ? CONFIG.FLY_SPEED_MODEL : CONFIG.FLY_SPEED_HUMAN;
    let moved = false;

    if (this.pitchTarget !== null) {
      this.pitch += (this.pitchTarget - this.pitch) * (1 - Math.exp(-dt * 5));
      if (Math.abs(this.pitch - this.pitchTarget) < 0.002) this.pitchTarget = null;
      this.applyRotation();
    }

    // ---- klavye
    if (this.enabled && !nav.busy) {
      const k = this.keys;
      const fast = k.has('ShiftLeft') || k.has('ShiftRight') ? 2.5 : 1;
      _d.set(0, 0, 0);
      if (k.has('KeyW')) _d.add(_flat);
      if (k.has('KeyS')) _d.sub(_flat);
      if (k.has('KeyD')) _d.add(_right);
      if (k.has('KeyA')) _d.sub(_right);
      if (nav.isModel || !CONFIG.GROUND_FOLLOW) {
        if (k.has('KeyE')) _d.y += 1;
        if (k.has('KeyQ')) _d.y -= 1;
      }
      if (_d.lengthSq() > 0) {
        nav.translate(_d.normalize().multiplyScalar(-base * fast * dt));
        moved = true;
      }
      if (k.has('ArrowLeft')) { this.yaw += 1.6 * dt; this.applyRotation(); }
      if (k.has('ArrowRight')) { this.yaw -= 1.6 * dt; this.applyRotation(); }
      if (k.has('ArrowUp')) { this.pitch += 1.2 * dt; this.applyRotation(); }
      if (k.has('ArrowDown')) { this.pitch -= 1.2 * dt; this.applyRotation(); }
    }

    // ---- webcam el hareketleri
    const frames = this.handInput.update(nowMs);
    const L = this.rec.update(frames.left, 'left', dt);
    const R = this.rec.update(frames.right, 'right', dt);
    if (this.enabled && !nav.busy && this.handInput.running) moved = this.updateGestures(dt, L, R, base) || moved;
    else this.arc.hide();

    if (moved && !nav.isModel && CONFIG.GROUND_FOLLOW) nav.followGround(head, 1 - Math.exp(-dt * 8));

    this.hud.update({ nav, L, R, toggleHold: this.toggleHold, handRunning: this.handInput.running });
  }

  updateGestures(dt, L, R, base) {
    const { nav } = this;
    const aspect = 4 / 3;
    let moved = false;

    // -- iki el pinch: ölçek + dönüş + kaydırma
    if (L.pinch && R.pinch) {
      const v = new THREE.Vector2((R.pinchScreen.x - L.pinchScreen.x) * aspect, R.pinchScreen.y - L.pinchScreen.y);
      const mid = new THREE.Vector2().addVectors(L.pinchScreen, R.pinchScreen).multiplyScalar(0.5);
      if (this.twoPrev) {
        const k = v.length() / Math.max(0.02, this.twoPrev.v.length());
        let dA = Math.atan2(v.y, v.x) - Math.atan2(this.twoPrev.v.y, this.twoPrev.v.x);
        dA = Math.atan2(Math.sin(dA), Math.cos(dA));
        const p = this.pivot().clone();
        nav.scaleAround(p, k);
        nav.rotateAround(p, -dA);
        this.pan(mid.x - this.twoPrev.mid.x, mid.y - this.twoPrev.mid.y);
        moved = true;
      }
      this.twoPrev = { v, mid };
      this.prevPinch.left = this.prevPinch.right = null;
    } else {
      if (this.twoPrev) { this.twoPrev = null; this.afterScale(); }
      // -- tek el pinch: kaydır
      for (const [side, s] of [['right', R], ['left', L]]) {
        if (s.pinch) {
          const prev = this.prevPinch[side];
          if (prev) { this.pan(s.pinchScreen.x - prev.x, s.pinchScreen.y - prev.y); moved = true; }
          this.prevPinch[side] = s.pinchScreen.clone();
          break;
        } else this.prevPinch[side] = null;
      }
    }

    // -- teleport: tabanca ile ekran merkezine nişan
    for (const s of [R, L]) {
      if (s.events.teleportFire) {
        const t = this.arc.consumeTarget();
        if (t) this.teleportTo(t);
        this.arc.hide();
      }
    }
    const aiming = R.aiming || L.aiming;
    if (aiming) {
      const origin = this.camera.position.clone().addScaledVector(this.forward(), 0.3);
      origin.y -= 0.05;
      this.arc.update(origin, this.forward(), dt, { straight: true });
    } else this.arc.hide();

    // -- işaret: ileri/geri + dönüş
    const flyer = !L.pinch && !R.pinch ? (R.flying ? R : L.flying ? L : null) : null;
    if (flyer) {
      const dir = flyer.indexScreenDir; // aynalı ekran, y aşağı
      const a = Math.atan2(dir.x, -dir.y); // 0 = yukarı, + = sağa eğik
      this.flyTime += dt;
      const ramp = Math.min(1, this.flyTime / CONFIG.FLY_RAMP_TIME);
      const absA = Math.abs(a);
      let fwd = 0, turnA = a;
      if (absA < 0.9) fwd = 1;
      else if (absA > Math.PI - 0.9) { fwd = -1; turnA = a > 0 ? a - Math.PI : a + Math.PI; turnA = -turnA; }
      const turn = THREE.MathUtils.clamp(turnA / (Math.PI / 4), -1.5, 1.5);
      if (Math.abs(turn) > 0.12) { this.yaw -= turn * CONFIG.DESKTOP_TURN_RATE * dt; this.applyRotation(); }
      if (fwd !== 0) {
        _d.copy(nav.isModel ? this.forward() : _flat).normalize();
        nav.translate(_d.multiplyScalar(-fwd * base * ramp * dt));
        moved = true;
      }
    } else this.flyTime = 0;

    // -- iki avuç açık: ölçek değiştir
    const bothOpen = L.pose === 'OPEN_PALM' && R.pose === 'OPEN_PALM';
    if (bothOpen && !this.toggleLatched) {
      this.toggleHold += dt / CONFIG.TOGGLE_HOLD;
      if (this.toggleHold >= 1) { this.toggleHold = 0; this.toggleLatched = true; this.toggle(); }
    } else if (!bothOpen) { this.toggleHold = 0; this.toggleLatched = false; }

    return moved;
  }

  /** Ekran-uzayı sürükleme (aynalı, normalize) → dünyayı kaydır ("tut ve çek") */
  pan(dux, duy) {
    const gain = this.nav.isModel ? CONFIG.DESKTOP_DRAG_GAIN_MODEL : CONFIG.DESKTOP_DRAG_GAIN_HUMAN;
    _d.copy(_right).multiplyScalar(dux * gain).addScaledVector(_flat, -duy * gain);
    this.nav.translate(_d);
  }
}
