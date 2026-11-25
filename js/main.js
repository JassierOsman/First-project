import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { CONFIG } from './config.js';
import { buildWorld } from './scene/World.js';
import { Environment } from './scene/Environment.js';
import { Navigator } from './nav/Navigator.js';
import { Fader, Vignette } from './ui/ComfortFX.js';
import { TeleportArc } from './ui/TeleportArc.js';
import { WristPanel, HelpPanel } from './ui/Panels.js';
import { DesktopHUD } from './ui/DesktopHUD.js';
import { XRHandInput } from './input/XRHandInput.js';
import { MediaPipeHandInput } from './input/MediaPipeHandInput.js';
import { XRLocomotion } from './locomotion/XRLocomotion.js';
import { DesktopLocomotion } from './locomotion/DesktopLocomotion.js';

// ------------------------------------------------------------------ renderer & sahne
const container = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(0.6);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.02, 3000);
scene.add(camera); // kameraya bağlı konfor efektleri için

const env = new Environment(scene, renderer);
const worldRoot = new THREE.Group();
worldRoot.name = 'worldRoot';
scene.add(worldRoot);
const world = buildWorld(worldRoot);

const fader = new Fader(camera);
const vignette = new Vignette(camera);
const nav = new Navigator(worldRoot, { walkables: world.walkables, fader });
const arc = new TeleportArc(scene, nav);
const wristPanel = new WristPanel(scene);
const helpPanel = new HelpPanel(scene);

const applyMode = (isModel) => {
  env.setMode(isModel);
  world.landscape.visible = !isModel;
  world.youAreHere.visible = isModel;
};
nav.onChange((e) => e.type === 'mode' && applyMode(e.isModel));

// ------------------------------------------------------------------ girişler
const xrHands = new XRHandInput(renderer, scene);
const mpHands = new MediaPipeHandInput();
const hud = new DesktopHUD(mpHands);

const xrLoco = new XRLocomotion({ renderer, camera, nav, world, arc, vignette, wristPanel, helpPanel, handInput: xrHands });
const deskLoco = new DesktopLocomotion({ dom: renderer.domElement, camera, nav, world, arc, handInput: mpHands, hud });
deskLoco.init();
applyMode(nav.isModel);

// ------------------------------------------------------------------ VR düğmesi
const vrSlot = document.getElementById('vr-slot');
const vrButton = VRButton.createButton(renderer, { optionalFeatures: ['hand-tracking'] });
vrButton.id = 'vr-button';
vrSlot.appendChild(vrButton);

renderer.xr.addEventListener('sessionstart', () => {
  document.body.classList.add('in-xr');
  deskLoco.enabled = false;
  if (mpHands.running) mpHands.stop();
  updateCamButton();
  xrLoco.onSessionStart();
});
renderer.xr.addEventListener('sessionend', () => {
  document.body.classList.remove('in-xr');
  deskLoco.enabled = true;
  arc.hide();
  wristPanel.mesh.visible = false;
  helpPanel.hide();
  vignette.set(0);
  camera.fov = 70;
  onResize();
  deskLoco.init();
});

// ------------------------------------------------------------------ masaüstü kamera düğmesi
const camBtn = document.getElementById('cam-btn');
const camStatus = document.getElementById('cam-status');
function updateCamButton() {
  camBtn.textContent = mpHands.running ? 'Kamerayı kapat' : 'Kamera ile el takibi';
  camBtn.classList.toggle('active', mpHands.running);
  camStatus.textContent = mpHands.status;
}
camBtn.addEventListener('click', async () => {
  if (mpHands.running) { mpHands.stop(); updateCamButton(); return; }
  camBtn.disabled = true;
  try {
    await mpHands.start((s) => { camStatus.textContent = s; });
  } catch (err) {
    console.error(err);
    mpHands.stop();
    mpHands.status = `hata: ${err.message || err}`;
  }
  camBtn.disabled = false;
  updateCamButton();
});

// yardım paneli (masaüstü)
const help = document.getElementById('help');
document.getElementById('help-btn').addEventListener('click', () => { help.hidden = !help.hidden; });
document.getElementById('help-close').addEventListener('click', () => { help.hidden = true; });
window.addEventListener('keydown', (e) => { if (e.code === 'KeyH') help.hidden = !help.hidden; });

// ------------------------------------------------------------------ döngü
function onResize() {
  if (renderer.xr.isPresenting) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

const timer = new THREE.Timer();
timer.connect(document);
const _head = new THREE.Vector3();

renderer.setAnimationLoop((time, frame) => {
  timer.update(time);
  const dt = Math.min(timer.getDelta(), 0.1);
  if (renderer.xr.isPresenting) {
    // Baş pozunu render'dan ÖNCE güncelle: el/baş mantığı ve kameraya bağlı efektler aynı kareyi kullanır
    renderer.xr.updateCamera(camera);
    xrLoco.update(dt, time);
  } else {
    deskLoco.update(dt, performance.now());
    hud.tickFps(dt);
  }
  nav.update(dt);
  fader.update(dt);
  vignette.update(dt);
  env.update(nav, camera.getWorldPosition(_head));
  renderer.render(scene, camera);
});

// Konsoldan erişim (hata ayıklama)
window.app = { THREE, scene, camera, renderer, nav, world, CONFIG, xrLoco, deskLoco, mpHands, arc, wristPanel, helpPanel };
