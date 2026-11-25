import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { GestureRecognizer } from '../input/GestureRecognizer.js';
import { toggleScale, placeModelInFront } from '../nav/ScaleModes.js';

// Quest 3 el takibi ile hareket.
//
//  İŞARET (sağ veya sol)     → işaret parmağı yönünde uç (insan modunda yatay)
//  PINCH tek el              → dünyayı tut-çek (insan modunda yalnız XZ)
//  PINCH iki el              → döndür (Y) + ölçekle (1:70…1:1) + taşı
//  TABANCA → başparmak indir → ışınlan (maket modunda 1:1 dalış)
//  SOL AVUÇ YUKARI 1.2 sn    → 1:70 ↔ 1:1
//  SAĞ AVUÇ YUKARI 1.2 sn    → yardım paneli
//  Kontrolcü yedeği          → sol çubuk yürü, sağ çubuk 30° dön, A/X ölçek

const _head = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _d = new THREE.Vector3();
const _m0 = new THREE.Vector3();
const _m1 = new THREE.Vector3();
const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _toHead = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const POSE_TR = { PINCH: 'Tut', GUN: 'Nişan', POINT: 'İşaret', OPEN_PALM: 'Açık', NONE: '—' };
const yawAngle = (v) => Math.atan2(-v.z, v.x);

export class XRLocomotion {
  constructor({ renderer, camera, nav, world, arc, vignette, wristPanel, helpPanel, handInput }) {
    Object.assign(this, { renderer, camera, nav, world, arc, vignette, wristPanel, helpPanel, handInput });
    this.rec = new GestureRecognizer({ palmUpEnabled: true, toggleGesture: 'palmUp' });
    this.grab = null;
    this.two = null;
    this.flyTime = 0;
    this.pendingPlacement = 0;
    this.pad = { snapLatch: false, buttons: {} };
  }

  onSessionStart() {
    this.pendingPlacement = 3; // ilk birkaç karede baş pozu oturur
    this.grab = this.two = null;
  }

  usablePinch(s, head) {
    if (!s.tracked || !s.pinch) return false;
    // Avuç başa dönükken yapılan pinch, Quest sistem menüsü jestidir → yok say
    _toHead.subVectors(head, s.palmCenter).normalize();
    return s.palmNormal.dot(_toHead) < 0.55;
  }

  update(dt, time) {
    const { nav, camera } = this;
    const head = camera.getWorldPosition(_head);
    const forward = camera.getWorldDirection(_fwd);

    if (this.pendingPlacement > 0 && --this.pendingPlacement === 0) {
      placeModelInFront(nav, this.world, head, forward);
      this.helpPanel.show(head, forward, 25);
    }

    const frames = this.handInput.update(time);
    const L = this.rec.update(frames.left, 'left', dt);
    const R = this.rec.update(frames.right, 'right', dt);
    const busy = nav.busy;
    let motion = 0;

    // ---------------------------------------------------- 1) iki el: döndür + ölçekle
    const lp = this.usablePinch(L, head);
    const rp = this.usablePinch(R, head);
    if (lp && rp && !busy) {
      this.grab = null;
      if (!this.two) {
        this.two = {
          pL: L.pinchPoint.clone(), pR: R.pinchPoint.clone(),
          pos: nav.position.clone(), yaw: nav.yaw, s: nav.scale, lastMid: new THREE.Vector3(),
          prevScale: nav.scale, prevYaw: nav.yaw,
        };
      } else {
        const t = this.two;
        _m0.addVectors(t.pL, t.pR).multiplyScalar(0.5);
        _m1.addVectors(L.pinchPoint, R.pinchPoint).multiplyScalar(0.5);
        _v0.subVectors(t.pR, t.pL);
        _v1.subVectors(R.pinchPoint, L.pinchPoint);
        let k = _v1.length() / Math.max(0.02, _v0.length());
        const s1 = nav.clampScale(t.s * k);
        k = s1 / t.s;
        const flat0 = Math.hypot(_v0.x, _v0.z), flat1 = Math.hypot(_v1.x, _v1.z);
        let dYaw = flat0 > 0.05 && flat1 > 0.05 ? yawAngle(_v1) - yawAngle(_v0) : 0;
        dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
        if (t.s >= CONFIG.MODE_THRESHOLD) _m1.y = _m0.y; // insan modunda dikey kaydırma yok
        _d.subVectors(t.pos, _m0).multiplyScalar(k).applyAxisAngle(UP, dYaw).add(_m1);
        nav.set(_d, t.yaw + dYaw, s1);
        t.lastMid.copy(_m1);
        motion = Math.max(Math.abs(Math.log(nav.scale / t.prevScale)) * 25, Math.abs(nav.yaw - t.prevYaw) * 20);
        t.prevScale = nav.scale; t.prevYaw = nav.yaw;
      }
    } else {
      if (this.two) this.endTwoHand(head, lp ? L : rp ? R : null, lp ? 'left' : 'right');

      // ------------------------------------------------ 2) tek el: tut-çek
      const side = this.grab && ((this.grab.side === 'left' && lp) || (this.grab.side === 'right' && rp))
        ? this.grab.side : (rp ? 'right' : lp ? 'left' : null);
      if (side && !busy) {
        const s = this.rec.hands[side];
        if (!this.grab || this.grab.side !== side) {
          this.grab = { side, prev: s.pinchPoint.clone() };
        } else {
          _d.subVectors(s.pinchPoint, this.grab.prev);
          if (!nav.isModel) _d.y = 0;
          nav.translate(_d);
          this.grab.prev.copy(s.pinchPoint);
          motion = (_d.length() / Math.max(dt, 1e-3)) / (nav.isModel ? 1 : 1.5);
        }
      } else if (this.grab) {
        this.grab = null;
        if (!nav.isModel && CONFIG.GROUND_FOLLOW) nav.followGround(head);
      }
    }

    // ---------------------------------------------------- 3) teleport
    for (const s of [R, L]) {
      if (s.events.teleportFire && !busy) {
        const target = this.arc.consumeTarget();
        if (target) nav.teleport(target, head, { scale: CONFIG.HUMAN_SCALE });
        this.arc.hide();
      }
    }
    const aimer = !this.grab && !this.two ? (R.aiming ? R : L.aiming ? L : null) : null;
    if (aimer && !busy) this.arc.update(aimer.indexTip, aimer.indexDir, dt);
    else this.arc.hide();

    // ---------------------------------------------------- 4) uçuş
    const flyer = !this.grab && !this.two && !busy ? (R.flying ? R : L.flying ? L : null) : null;
    if (flyer) {
      _d.copy(flyer.indexDir);
      if (!nav.isModel) _d.y = 0;
      if (_d.lengthSq() > 0.04) {
        _d.normalize();
        this.flyTime += dt;
        const base = nav.isModel ? CONFIG.FLY_SPEED_MODEL : CONFIG.FLY_SPEED_HUMAN;
        const speed = base * Math.min(1, this.flyTime / CONFIG.FLY_RAMP_TIME);
        nav.translate(_d.multiplyScalar(-speed * dt));
        if (!nav.isModel && CONFIG.GROUND_FOLLOW) nav.followGround(head, 1 - Math.exp(-dt * 8));
        motion = Math.max(motion, speed / base);
      }
    } else {
      this.flyTime = 0;
    }

    // ---------------------------------------------------- 5) ölçek / yardım
    if (L.events.toggle) toggleScale(nav, this.world, head, forward);
    if (R.events.toggle) this.helpPanel.toggle(head, forward);
    if (nav.anim) motion = 1;

    // ---------------------------------------------------- 6) kontrolcü yedeği
    motion = Math.max(motion, this.updateGamepads(dt, head, forward));

    this.vignette.set(motion);
    this.helpPanel.update(dt);
    this.updateWristPanel(L, R, head);
  }

  endTwoHand(head, remaining, side) {
    const { nav } = this;
    const t = this.two;
    this.two = null;
    const s = nav.scale;
    const tol = CONFIG.SCALE_SNAP_TOLERANCE;
    if (Math.abs(s - CONFIG.HUMAN_SCALE) / CONFIG.HUMAN_SCALE < tol) nav.scaleAround(t.lastMid, CONFIG.HUMAN_SCALE / s);
    else if (Math.abs(s - CONFIG.MODEL_SCALE) / CONFIG.MODEL_SCALE < tol) nav.scaleAround(t.lastMid, CONFIG.MODEL_SCALE / s);
    if (!nav.isModel && CONFIG.GROUND_FOLLOW) nav.followGround(head);
    // Bir el hâlâ tutuyorsa sıçrama olmadan tek elle devam et
    this.grab = remaining ? { side, prev: remaining.pinchPoint.clone() } : null;
  }

  updateGamepads(dt, head, forward) {
    const session = this.renderer.xr.getSession();
    if (!session) return 0;
    let motion = 0;
    for (const src of session.inputSources) {
      const gp = src.gamepad;
      if (!gp || src.hand || gp.axes.length < 4) continue;
      const x = gp.axes[2], y = gp.axes[3];
      const pressed = !!(gp.buttons[4] && gp.buttons[4].pressed);
      const key = src.handedness;
      const was = this.pad.buttons[key];
      this.pad.buttons[key] = pressed;
      if (src.handedness === 'left') {
        if (Math.hypot(x, y) > 0.15) {
          const f = _v0.copy(forward); f.y = 0; f.normalize();
          const r = _v1.crossVectors(f, UP).normalize();
          const base = this.nav.isModel ? CONFIG.FLY_SPEED_MODEL : CONFIG.FLY_SPEED_HUMAN;
          _d.copy(f).multiplyScalar(-y).addScaledVector(r, x).multiplyScalar(-base * dt);
          this.nav.translate(_d);
          if (!this.nav.isModel && CONFIG.GROUND_FOLLOW) this.nav.followGround(head, 1 - Math.exp(-dt * 8));
          motion = Math.min(1, Math.hypot(x, y));
        }
        if (pressed && !was) this.helpPanel.toggle(head, forward);
      } else if (src.handedness === 'right') {
        if (Math.abs(x) > 0.7 && !this.pad.snapLatch) {
          this.pad.snapLatch = true;
          this.nav.rotateAround(_m0.set(head.x, 0, head.z), Math.sign(x) * THREE.MathUtils.degToRad(CONFIG.SNAP_TURN_DEG));
        } else if (Math.abs(x) < 0.3) this.pad.snapLatch = false;
        if (pressed && !was) toggleScale(this.nav, this.world, head, forward);
      }
    }
    return motion;
  }

  updateWristPanel(L, R, head) {
    const wp = this.wristPanel;
    if (!L.tracked) { wp.mesh.visible = false; return; }
    wp.mesh.visible = true;
    const frame = this.handInput.frames.left;
    wp.place(frame.joints[0], L.palmNormal, head);
    const lbl = (s) => (!s.tracked ? 'yok' : s.flying ? 'Uçuş' : POSE_TR[s.pose] || s.pose);
    wp.draw({
      scaleLabel: this.nav.scaleLabel,
      isModel: this.nav.isModel,
      left: lbl(L), right: lbl(R),
      progress: Math.max(L.toggleHold, R.toggleHold),
      progressLabel: L.toggleHold >= R.toggleHold ? (this.nav.isModel ? '→ 1:1' : `→ 1:${CONFIG.MODEL_SCALE_DENOMINATOR}`) : 'Yardım',
    });
  }
}
