import * as THREE from 'three';
import { CONFIG } from '../config.js';

// 1:70 maket ↔ 1:1 insan ölçeği geçişleri (VR ve masaüstü ortak).

const _f = new THREE.Vector3();

function flatForward(forward) {
  _f.copy(forward); _f.y = 0;
  if (_f.lengthSq() < 1e-6) _f.set(0, 0, -1);
  return _f.normalize();
}

/** İnsan → maket: dünya küçülerek başın önündeki masaya oturur. "Buradasınız" işareti bırakılır. */
export function enterModelMode(nav, world, head, forward, { distance = CONFIG.TABLE_DISTANCE, duration = 1.1 } = {}) {
  if (nav.busy) return false;
  const here = nav.worldToModel(new THREE.Vector3(head.x, 0, head.z));
  world.youAreHere.position.copy(here);
  const f = flatForward(forward);
  const T = new THREE.Vector3(head.x + f.x * distance, CONFIG.TABLE_HEIGHT, head.z + f.z * distance);
  nav.animateTo({ P: world.siteCenter, T, scale: CONFIG.MODEL_SCALE, duration });
  return true;
}

/** Maket → insan: bakılan noktaya (yoksa "buradasınız" noktasına) 1:1 dalış (kararma ile). */
export function enterHumanMode(nav, world, head, forward, gazeDir = forward) {
  if (nav.busy) return false;
  let target = null;
  const hit = nav.raycast(head, gazeDir.clone().normalize(), 5);
  if (hit && hit.face) {
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    if (n.y > 0.6 && hit.object.name !== 'landscape') target = hit.point.clone();
  }
  if (!target) target = nav.modelToWorld(world.youAreHere.position);
  return nav.teleport(target, head, { scale: CONFIG.HUMAN_SCALE });
}

export function toggleScale(nav, world, head, forward, opts = {}) {
  return nav.isModel
    ? enterHumanMode(nav, world, head, forward, opts.gazeDir)
    : enterModelMode(nav, world, head, forward, opts);
}

/** Uygulama açılışında maketi kullanıcının önüne anında yerleştir */
export function placeModelInFront(nav, world, head, forward, distance = CONFIG.TABLE_DISTANCE) {
  const f = flatForward(forward);
  const T = new THREE.Vector3(head.x + f.x * distance, CONFIG.TABLE_HEIGHT, head.z + f.z * distance);
  // maketin güney cephesi (giriş) kullanıcıya baksın: yaw = kullanıcının bakış yönü
  const yaw = Math.atan2(-f.x, -f.z);
  world.youAreHere.position.set(0, 0, 20);
  nav.placeModelPoint(world.siteCenter, T, CONFIG.MODEL_SCALE, yaw);
}
