// Node ile çalışır:  node --test tests/
// Sentetik el pozları üretip jest tanıyıcıyı ve navigasyon matematiğini doğrular.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { J } from '../js/input/HandFrame.js';
import { GestureRecognizer } from '../js/input/GestureRecognizer.js';
import { Navigator } from '../js/nav/Navigator.js';
import { CONFIG } from '../js/config.js';

import { makeHand } from './helpers.mjs';

const CURLED = 1.25;
const run = (rec, frame, side, seconds, dt = 1 / 72) => {
  let s; const events = { teleportFire: 0, toggle: 0, pinchStart: 0 };
  for (let t = 0; t < seconds; t += dt) {
    s = rec.update(frame, side, dt);
    for (const k in events) if (s.events[k]) events[k]++;
  }
  return { s, events };
};

test('açık el → OPEN_PALM, avuç aşağıyken palmUp=false', () => {
  const r = new GestureRecognizer();
  const { s } = run(r, makeHand(), 'right', 0.1);
  assert.equal(s.pose, 'OPEN_PALM');
  assert.equal(s.palmUp, false);
});

test('avuç yukarı (sağ ve sol el) → palmUp=true', () => {
  for (const side of ['right', 'left']) {
    const r = new GestureRecognizer();
    const { s } = run(r, makeHand({ handedness: side, palmUp: true }), side, 0.1);
    assert.equal(s.palmUp, true, side);
    const { s: s2 } = run(new GestureRecognizer(), makeHand({ handedness: side }), side, 0.1);
    assert.equal(s2.palmUp, false, side + ' palm down');
  }
});

test('işaret pozu → POINT, bekleme sonrası uçuş', () => {
  const r = new GestureRecognizer();
  const hand = makeHand({ curls: [0.05, CURLED, CURLED, CURLED], thumb: 'tucked' });
  let { s } = run(r, hand, 'right', 0.1);
  assert.equal(s.pose, 'POINT');
  assert.equal(s.flying, false);
  ({ s } = run(r, hand, 'right', 0.3));
  assert.equal(s.flying, true);
  // yön -Z'ye yakın olmalı
  assert.ok(s.indexDir.z < -0.95, `indexDir ${s.indexDir.toArray()}`);
});

test('parmak tabanca → başparmak indir = teleport, sonrasında uçuş kilitli', () => {
  const r = new GestureRecognizer();
  const gun = makeHand({ curls: [0.05, CURLED, CURLED, CURLED], thumb: 'out' });
  const point = makeHand({ curls: [0.05, CURLED, CURLED, CURLED], thumb: 'tucked' });
  let { s } = run(r, gun, 'right', 0.5);
  assert.equal(s.pose, 'GUN');
  assert.equal(s.aiming, true);
  const res = run(r, point, 'right', 1.0);
  assert.equal(res.events.teleportFire, 1);
  assert.equal(res.s.flying, false, 'teleport sonrası uçmamalı');
  // el açılıp tekrar işaret yapılınca uçuş serbest
  run(r, makeHand(), 'right', 0.1);
  ({ s } = run(r, point, 'right', 0.4));
  assert.equal(s.flying, true);
});

test('kısa tabanca geçişi teleport tetiklemez', () => {
  const r = new GestureRecognizer();
  const gun = makeHand({ curls: [0.05, CURLED, CURLED, CURLED], thumb: 'out' });
  const point = makeHand({ curls: [0.05, CURLED, CURLED, CURLED], thumb: 'tucked' });
  run(r, gun, 'right', 0.1);
  const res = run(r, point, 'right', 0.5);
  assert.equal(res.events.teleportFire, 0);
});

test('pinch → PINCH ve tek pinchStart olayı', () => {
  const r = new GestureRecognizer();
  const hand = makeHand({ curls: [0.35, 0.6, 0.7, 0.8], pinchTo: true });
  const { s, events } = run(r, hand, 'right', 0.3);
  assert.equal(s.pose, 'PINCH');
  assert.equal(events.pinchStart, 1);
  const { events: e2 } = run(r, makeHand(), 'right', 0.1);
  assert.equal(r.hands.right.pinch, false);
  assert.equal(e2.pinchStart, 0);
});

test('avuç yukarı tutma → tek ölçek değiştirme olayı', () => {
  const r = new GestureRecognizer();
  const up = makeHand({ handedness: 'left', palmUp: true });
  let { events } = run(r, up, 'left', 0.8);
  assert.equal(events.toggle, 0);
  ({ events } = run(r, up, 'left', 3.0));
  assert.equal(events.toggle, 1, 'tutmaya devam edince tekrar tetiklenmemeli');
});

test('el kaybolunca durum sıfırlanır', () => {
  const r = new GestureRecognizer();
  run(r, makeHand({ curls: [0.35, 0.6, 0.7, 0.8], pinchTo: true }), 'right', 0.1);
  const s = r.update(null, 'right', 0.016);
  assert.equal(s.pinch, false);
  assert.equal(s.events.pinchEnd, true);
});

// ---- Navigator ----
const near = (a, b, eps = 1e-6) => a.distanceTo(b) < eps;

test('scaleAround pivotu sabit tutar ve 1:70–1:1 arasında sınırlar', () => {
  const root = new THREE.Group();
  const nav = new Navigator(root);
  const pivot = new THREE.Vector3(1, 1.2, -2);
  const P = nav.worldToModel(pivot);
  nav.scaleAround(pivot, 0.1);
  assert.ok(near(nav.modelToWorld(P), pivot));
  nav.scaleAround(pivot, 0.0001);
  assert.ok(Math.abs(nav.scale - 1 / 70) < 1e-9);
  assert.equal(nav.scaleLabel, '1:70');
  assert.equal(nav.isModel, true);
  nav.scaleAround(pivot, 1e6);
  assert.equal(nav.scale, 1);
  assert.ok(near(nav.modelToWorld(P), pivot));
});

test('rotateAround pivotu sabit tutar', () => {
  const root = new THREE.Group();
  const nav = new Navigator(root);
  nav.translate(new THREE.Vector3(3, 0, 1));
  const pivot = new THREE.Vector3(0.5, 1, -1);
  const P = nav.worldToModel(pivot);
  nav.rotateAround(pivot, 0.7);
  assert.ok(near(nav.modelToWorld(P), pivot));
  assert.ok(Math.abs(nav.yaw - 0.7) < 1e-9);
});

test('placeModelPoint ve teleport hedefi ayak altına getirir', () => {
  const root = new THREE.Group();
  const nav = new Navigator(root);
  nav.set(new THREE.Vector3(0.3, 0.82, -0.7), 0.4, 1 / 70);
  const hit = nav.modelToWorld(new THREE.Vector3(10, 3.5, -4));
  const head = new THREE.Vector3(0.1, 1.65, 0.2);
  nav.teleport(hit, head); // fader yok → anında
  assert.equal(nav.scale, 1);
  const after = nav.modelToWorld(new THREE.Vector3(10, 3.5, -4));
  assert.ok(near(after, new THREE.Vector3(0.1, 0, 0.2), 1e-9), after.toArray());
});

test('animateTo hedefe ulaşır, mod değişim olayı yayınlanır', () => {
  const root = new THREE.Group();
  const nav = new Navigator(root);
  const modes = [];
  nav.onChange((e) => modes.push(e.isModel));
  const P = new THREE.Vector3(0, 0, 0);
  const T = new THREE.Vector3(0, CONFIG.TABLE_HEIGHT, -0.7);
  nav.animateTo({ P, T, scale: CONFIG.MODEL_SCALE, duration: 0.5 });
  for (let i = 0; i < 40; i++) nav.update(1 / 60);
  assert.equal(nav.anim, null);
  assert.ok(near(nav.modelToWorld(P), T, 1e-9));
  assert.deepEqual(modes, [true]);
});
