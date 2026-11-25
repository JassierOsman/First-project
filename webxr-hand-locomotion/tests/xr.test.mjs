// VR lokomosyonunun uçtan uca mantık testi (sahte el verisiyle, tarayıcısız).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeHand } from './helpers.mjs';
import { Navigator } from '../js/nav/Navigator.js';
import { XRLocomotion } from '../js/locomotion/XRLocomotion.js';
import { CONFIG } from '../js/config.js';

const CURLED = 1.25;
const DT = 1 / 72;

function setup({ scale = 1 } = {}) {
  const root = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500).rotateX(-Math.PI / 2));
  root.add(ground);
  const nav = new Navigator(root, { walkables: [ground] });
  if (scale !== 1) nav.set(new THREE.Vector3(0, 0.8, -0.7), 0, scale);
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1.6, 0);
  camera.updateMatrixWorld();
  const frames = { left: null, right: null };
  const handInput = { frames: { left: { joints: [new THREE.Vector3()] }, right: {} }, update: () => frames };
  const arc = { target: null, update() {}, hide() {}, consumeTarget() { return this.target; } };
  const noop = () => {};
  const helpPanel = { toggled: 0, show: noop, update: noop, hide: noop, toggle() { this.toggled++; } };
  const world = { siteCenter: new THREE.Vector3(), youAreHere: { position: new THREE.Vector3() } };
  const loco = new XRLocomotion({
    renderer: { xr: { getSession: () => null } }, camera, nav, world, arc,
    vignette: { set: noop }, wristPanel: { mesh: { visible: false }, place: noop, draw: noop }, helpPanel, handInput,
  });
  const step = (seconds, f = () => {}) => {
    for (let t = 0; t < seconds; t += DT) { f(t); loco.update(DT, t * 1000); nav.update(DT); }
  };
  return { nav, loco, frames, arc, step, helpPanel };
}

const pointHand = (opts = {}) => makeHand({ curls: [0.05, CURLED, CURLED, CURLED], thumb: 'tucked', ...opts });
const pinchHand = (offset, handedness = 'right') => makeHand({ curls: [0.35, 0.6, 0.7, 0.8], pinchTo: true, offset, handedness });

test('işaret → işaret yönünde yatay ilerleme (dünya ters yönde kayar)', () => {
  const { nav, frames, step } = setup();
  frames.right = pointHand();
  step(1.5);
  assert.ok(nav.position.z > 1.0, `z=${nav.position.z}`); // kullanıcı -Z'ye gitti → dünya +Z
  assert.ok(Math.abs(nav.position.x) < 0.05);
  assert.ok(Math.abs(nav.position.y) < 1e-6, 'zemin takibi y=0 tutmalı');
  const z = nav.position.z;
  frames.right = makeHand(); // el açıldı → dur
  step(0.3);
  assert.ok(Math.abs(nav.position.z - z) < 1e-9);
});

test('tek el pinch-sürükle → dünya el ile birlikte kayar (insan modunda Y kilitli)', () => {
  const { nav, frames, step } = setup();
  const a = new THREE.Vector3(0.2, 1.1, -0.3);
  const delta = new THREE.Vector3(0.3, 0.2, -0.1);
  step(0.2, () => { frames.right = pinchHand(a); });
  const p0 = nav.position.clone();
  step(0.5, (t) => { frames.right = pinchHand(a.clone().addScaledVector(delta, Math.min(1, t / 0.4))); });
  const moved = nav.position.clone().sub(p0);
  assert.ok(moved.distanceTo(new THREE.Vector3(0.3, 0, -0.1)) < 1e-6, moved.toArray());
});

test('iki el pinch → ölçek (pivot sabit) ve Y dönüşü', () => {
  const { nav, frames, step } = setup({ scale: CONFIG.MODEL_SCALE });
  const L0 = new THREE.Vector3(-0.2, 1.1, -0.4), R0 = new THREE.Vector3(0.2, 1.1, -0.4);
  step(0.2, () => { frames.left = pinchHand(L0, 'left'); frames.right = pinchHand(R0); });
  const s0 = nav.scale;
  // eller 2 kat açılır
  step(0.5, (t) => {
    const k = 1 + Math.min(1, t / 0.4);
    frames.left = pinchHand(new THREE.Vector3(-0.2 * k, 1.1, -0.4), 'left');
    frames.right = pinchHand(new THREE.Vector3(0.2 * k, 1.1, -0.4));
  });
  const ratio = nav.scale / s0;
  assert.ok(ratio > 1.8 && ratio < 2.2, `ölçek oranı ${ratio}`);
  assert.equal(nav.isModel, true);
  // eller 90° döner (sol öne-arkaya): yaw ≈ +90°
  const yaw0 = nav.yaw;
  step(0.5, () => {
    frames.left = pinchHand(new THREE.Vector3(0, 1.1, -0.0), 'left');
    frames.right = pinchHand(new THREE.Vector3(0, 1.1, -0.8));
  });
  const dYaw = THREE.MathUtils.radToDeg(nav.yaw - yaw0);
  assert.ok(Math.abs(dYaw - 90) < 6, `dYaw=${dYaw}`);
});

test('tabanca → başparmak indir = ışınlan (hedef ayak altına)', () => {
  const { nav, frames, step, arc } = setup();
  const target = new THREE.Vector3(4, 0, -9);
  const P = nav.worldToModel(target);
  arc.target = target;
  step(0.5, () => { frames.right = makeHand({ curls: [0.05, CURLED, CURLED, CURLED], thumb: 'out' }); });
  step(0.1, () => { frames.right = pointHand(); });
  const after = nav.modelToWorld(P);
  assert.ok(after.distanceTo(new THREE.Vector3(0, 0, 0)) < 1e-6, after.toArray());
});

test('maket modunda ışınlanma = 1:1 dalış', () => {
  const { nav, frames, step, arc } = setup({ scale: CONFIG.MODEL_SCALE });
  const P = new THREE.Vector3(5, 3.6, 2);
  arc.target = nav.modelToWorld(P);
  step(0.5, () => { frames.right = makeHand({ curls: [0.05, CURLED, CURLED, CURLED], thumb: 'out' }); });
  step(0.1, () => { frames.right = pointHand(); });
  assert.equal(nav.scale, 1);
  assert.ok(nav.modelToWorld(P).distanceTo(new THREE.Vector3(0, 0, 0)) < 1e-6);
});

test('sol avuç yukarı → 1:70 maket (animasyonlu); sağ avuç yukarı → yardım', () => {
  const { nav, frames, step, helpPanel } = setup();
  frames.left = makeHand({ handedness: 'left', palmUp: true });
  step(1.3);
  frames.left = makeHand({ handedness: 'left' });
  step(1.5);
  assert.equal(nav.scaleLabel, `1:${CONFIG.MODEL_SCALE_DENOMINATOR}`);
  frames.right = makeHand({ palmUp: true });
  step(1.3);
  assert.equal(helpPanel.toggled, 1);
});

test('avuç başa dönükken pinch (Quest sistem jesti) yok sayılır', () => {
  const { nav, frames, step } = setup();
  // avucu başa çevir: X ekseninde -90° → avuç normali -Y yerine +Z (başa doğru)
  const facing = (off) => {
    const h = makeHand({ curls: [0.35, 0.6, 0.7, 0.8], pinchTo: true, offset: new THREE.Vector3() });
    for (const v of h.joints) v.applyAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2).add(off);
    return h;
  };
  const a = new THREE.Vector3(0.1, 1.3, -0.35);
  step(0.2, () => { frames.right = facing(a); });
  const p0 = nav.position.clone();
  step(0.4, (t) => { frames.right = facing(a.clone().add(new THREE.Vector3(0.3 * t, 0, 0))); });
  assert.ok(nav.position.distanceTo(p0) < 1e-9);
});
