import * as THREE from 'three';
import { HandFrame, J } from '../js/input/HandFrame.js';

// ---- Sentetik el: sağ el, avuç aşağı (-Y), parmaklar -Z yönünde, başparmak -X tarafında ----
const MCPS = [[-0.025, 0, -0.09], [-0.005, 0, -0.095], [0.015, 0, -0.09], [0.033, 0, -0.08]];
const SEGS = [[0.045, 0.026, 0.022], [0.05, 0.03, 0.024], [0.046, 0.028, 0.023], [0.036, 0.021, 0.02]];

export function makeHand({ curls = [0.05, 0.05, 0.05, 0.05], thumb = 'relaxed', handedness = 'right', palmUp = false, pinchTo = null, offset = null } = {}) {
  const f = new HandFrame(handedness, 'xr');
  const j = f.joints;
  j[J.WRIST].set(0, 0, 0);
  for (let k = 0; k < 4; k++) {
    let p = new THREE.Vector3(...MCPS[k]);
    j[5 + k * 4].copy(p);
    let theta = 0;
    for (let s = 0; s < 3; s++) {
      theta += curls[k];
      const dir = new THREE.Vector3(0, -Math.sin(theta), -Math.cos(theta));
      p = p.clone().addScaledVector(dir, SEGS[k][s]);
      j[5 + k * 4 + s + 1].copy(p);
    }
  }
  const cmc = new THREE.Vector3(-0.02, -0.01, -0.03);
  let tip;
  if (pinchTo !== null) tip = j[J.INDEX_TIP].clone().add(new THREE.Vector3(-0.004, 0, 0.003));
  else if (thumb === 'out') tip = new THREE.Vector3(-0.105, 0.0, -0.08);
  else if (thumb === 'tucked') tip = new THREE.Vector3(-0.01, -0.04, -0.07);
  else tip = new THREE.Vector3(-0.07, -0.02, -0.085);
  j[J.THUMB_CMC].copy(cmc);
  j[J.THUMB_MCP].lerpVectors(cmc, tip, 0.4);
  j[J.THUMB_IP].lerpVectors(cmc, tip, 0.72);
  j[J.THUMB_TIP].copy(tip);

  if (handedness === 'left') for (const v of j) v.x = -v.x;
  if (palmUp) for (const v of j) v.applyAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
  const off = offset || new THREE.Vector3(0.2, 1.1, -0.3);
  for (const v of j) v.add(off); // odada bir yere taşı
  f.tracked = true;
  return f;
}

