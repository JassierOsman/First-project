import * as THREE from 'three';
import { J } from './HandFrame.js';
import { CONFIG } from '../config.js';

// Platformdan bağımsız el jesti tanıyıcı.
// Girdi: HandFrame (21 eklem, metre). Çıktı: histerezisli durumlar + tek seferlik olaylar.
//
// Tanınan pozlar (öncelik sırasıyla):
//   PINCH      başparmak ucu + işaret ucu birleşik                  → tut-sürükle
//   GUN        işaret uzun, diğerleri kapalı, başparmak dışarıda     → teleport nişanı
//   POINT      işaret uzun, diğerleri kapalı, başparmak içeride      → uçuş / yürüyüş
//   OPEN_PALM  dört parmak açık                                      → (masaüstü) ölçek değiştirme
//   PALM_UP    açık avuç yukarı bakıyor (yalnızca XR)                → (VR) ölçek değiştirme
// Olaylar: pinchStart, pinchEnd, teleportFire (GUN → başparmak indir), gunCancel

const FINGERS = [
  [J.INDEX_MCP, J.INDEX_PIP, J.INDEX_DIP, J.INDEX_TIP],
  [J.MIDDLE_MCP, J.MIDDLE_PIP, J.MIDDLE_DIP, J.MIDDLE_TIP],
  [J.RING_MCP, J.RING_PIP, J.RING_DIP, J.RING_TIP],
  [J.PINKY_MCP, J.PINKY_PIP, J.PINKY_DIP, J.PINKY_TIP],
];

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export function fingerStraightness(joints, f) {
  const [m, p, d, t] = FINGERS[f].map((i) => joints[i]);
  const path = m.distanceTo(p) + p.distanceTo(d) + d.distanceTo(t);
  return path > 1e-6 ? m.distanceTo(t) / path : 0;
}

export class HandGestureState {
  constructor(handedness) {
    this.handedness = handedness;
    this.reset();
  }

  reset() {
    this.tracked = false;
    this.pinch = false;
    this.fingerExt = [false, false, false, false];
    this.fingerCurled = [false, false, false, false];
    this.thumbOut = false;
    this.pose = 'NONE';
    this.poseTime = 0;
    this.pointLocked = false; // teleport sonrası, el POINT'ten çıkana kadar uçuş başlamasın
    this.gunTime = 0;
    this.toggleHold = 0;      // ölçek değiştirme ilerlemesi (0..1)
    this.toggleLatched = false;
    this.cooldown = 0;

    this.pinchPoint = new THREE.Vector3();
    this.pinchScreen = new THREE.Vector2();
    this.indexTip = new THREE.Vector3();
    this.indexDir = new THREE.Vector3(0, 0, -1);
    this.indexScreenDir = new THREE.Vector2(0, -1);
    this.palmNormal = new THREE.Vector3();
    this.palmCenter = new THREE.Vector3();
    this.palmUp = false;
    this.metrics = { pinch: 1, thumbOut: 0, straight: [0, 0, 0, 0], palmUpDot: 0 };

    // tek karelik olaylar
    this.events = { pinchStart: false, pinchEnd: false, teleportFire: false, gunCancel: false, toggle: false };
  }

  /** Uçuş için işaret jesti etkin mi (bekleme süresi dolmuş, kilitli değil) */
  get flying() {
    return this.pose === 'POINT' && !this.pointLocked && this.poseTime >= CONFIG.FLY_DWELL;
  }

  /** Teleport nişanı görünür mü */
  get aiming() {
    return this.pose === 'GUN' && this.gunTime >= Math.min(0.12, CONFIG.TELEPORT_AIM_MIN);
  }
}

export class GestureRecognizer {
  /**
   * @param {object} opts
   * @param {boolean} opts.palmUpEnabled  XR'da true (y yukarı), MediaPipe'ta false
   * @param {'palmUp'|'openPalm'} opts.toggleGesture
   */
  constructor({ palmUpEnabled = true, toggleGesture = 'palmUp' } = {}) {
    this.palmUpEnabled = palmUpEnabled;
    this.toggleGesture = toggleGesture;
    this.hands = { left: new HandGestureState('left'), right: new HandGestureState('right') };
  }

  /**
   * @param {HandFrame|null} frame
   * @param {'left'|'right'} side
   * @param {number} dt saniye
   */
  update(frame, side, dt) {
    const s = this.hands[side];
    const ev = s.events;
    ev.pinchStart = ev.pinchEnd = ev.teleportFire = ev.gunCancel = ev.toggle = false;
    s.cooldown = Math.max(0, s.cooldown - dt);

    if (!frame || !frame.tracked) {
      if (s.pinch) ev.pinchEnd = true;
      if (s.pose === 'GUN') ev.gunCancel = true;
      s.tracked = false;
      s.pinch = false;
      s.pose = 'NONE';
      s.poseTime = 0;
      s.gunTime = 0;
      s.toggleHold = 0;
      s.toggleLatched = false;
      s.pointLocked = false;
      return s;
    }
    s.tracked = true;

    const j = frame.joints;
    const hs = frame.size();

    // --- Parmak durumları (histerezis) ---
    for (let f = 0; f < 4; f++) {
      const st = fingerStraightness(j, f);
      s.metrics.straight[f] = st;
      const tipToWrist = j[FINGERS[f][3]].distanceTo(j[J.WRIST]);
      const pipToWrist = j[FINGERS[f][1]].distanceTo(j[J.WRIST]);
      if (s.fingerExt[f]) s.fingerExt[f] = st > CONFIG.FINGER_EXT_OFF && tipToWrist > pipToWrist;
      else s.fingerExt[f] = st > CONFIG.FINGER_EXT_ON && tipToWrist > pipToWrist * 1.05;
      s.fingerCurled[f] = !s.fingerExt[f] && (st < CONFIG.FINGER_CURL_ON || tipToWrist < pipToWrist * 1.05);
    }

    // --- Başparmak dışarıda mı ("tabanca" horozu) ---
    const thumbOut = j[J.THUMB_TIP].distanceTo(j[J.INDEX_MCP]) / hs;
    s.metrics.thumbOut = thumbOut;
    s.thumbOut = s.thumbOut ? thumbOut > CONFIG.THUMB_OUT_OFF : thumbOut > CONFIG.THUMB_OUT_ON;

    // --- Pinch (histerezis) ---
    const pinchD = j[J.THUMB_TIP].distanceTo(j[J.INDEX_TIP]) / hs;
    s.metrics.pinch = pinchD;
    const wasPinch = s.pinch;
    s.pinch = wasPinch ? pinchD < CONFIG.PINCH_OFF : pinchD < CONFIG.PINCH_ON;
    s.pinchPoint.copy(j[J.THUMB_TIP]).add(j[J.INDEX_TIP]).multiplyScalar(0.5);
    s.pinchScreen.copy(frame.screen[J.THUMB_TIP]).add(frame.screen[J.INDEX_TIP]).multiplyScalar(0.5);

    // --- İşaret parmağı yönü ---
    s.indexTip.copy(j[J.INDEX_TIP]);
    s.indexDir.subVectors(j[J.INDEX_TIP], j[J.INDEX_MCP]).normalize();
    s.indexScreenDir.subVectors(frame.screen[J.INDEX_TIP], frame.screen[J.INDEX_MCP]);
    if (s.indexScreenDir.lengthSq() > 1e-10) s.indexScreenDir.normalize();

    // --- Avuç normali (sağ elde cross(işaretMCP-bilek, serçeMCP-bilek) avuç yönünü verir) ---
    _a.subVectors(j[J.INDEX_MCP], j[J.WRIST]);
    _b.subVectors(j[J.PINKY_MCP], j[J.WRIST]);
    s.palmNormal.crossVectors(_a, _b).normalize();
    if (frame.handedness === 'left') s.palmNormal.negate();
    s.palmCenter.copy(j[J.WRIST]).add(j[J.MIDDLE_MCP]).multiplyScalar(0.5);

    const [iE, mE, rE, pE] = s.fingerExt;
    const [, mC, rC, pC] = s.fingerCurled;
    const openPalm = iE && mE && rE && pE;
    const indexOnly = iE && !mE && !rE && !pE && mC && (rC || pC);
    s.metrics.palmUpDot = s.palmNormal.y;
    s.palmUp = this.palmUpEnabled && openPalm && s.palmNormal.y > CONFIG.PALM_UP_DOT;

    // --- Poz seçimi ---
    let pose = 'NONE';
    if (s.pinch) pose = 'PINCH';
    else if (indexOnly && s.thumbOut) pose = 'GUN';
    else if (indexOnly) pose = 'POINT';
    else if (openPalm) pose = 'OPEN_PALM';

    // --- Olaylar ---
    if (s.pinch && !wasPinch) ev.pinchStart = true;
    if (!s.pinch && wasPinch) ev.pinchEnd = true;

    const prevPose = s.pose;
    if (prevPose === 'GUN' && pose !== 'GUN') {
      // Tabanca → başparmak indi (POINT) = ateş
      if (pose === 'POINT' && s.gunTime >= CONFIG.TELEPORT_AIM_MIN && s.cooldown === 0) {
        ev.teleportFire = true;
        s.pointLocked = true;
        s.cooldown = CONFIG.GESTURE_COOLDOWN;
      } else {
        ev.gunCancel = true;
      }
    }
    if (pose !== 'POINT' && pose !== 'GUN') s.pointLocked = false;

    if (pose === prevPose) s.poseTime += dt;
    else s.poseTime = 0;
    s.gunTime = pose === 'GUN' ? s.gunTime + dt : 0;
    s.pose = pose;

    // --- Ölçek değiştirme jesti (tutma) ---
    const toggleActive = this.toggleGesture === 'palmUp' ? s.palmUp
      : this.toggleGesture === 'openPalm' ? pose === 'OPEN_PALM' : false;
    if (toggleActive && !s.toggleLatched) {
      s.toggleHold += dt / CONFIG.TOGGLE_HOLD;
      if (s.toggleHold >= 1) {
        ev.toggle = true;
        s.toggleHold = 0;
        s.toggleLatched = true; // tekrar tetiklemek için el önce pozdan çıkmalı
      }
    } else if (!toggleActive) {
      s.toggleHold = 0;
      s.toggleLatched = false;
    }

    return s;
  }
}
