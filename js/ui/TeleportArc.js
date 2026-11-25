import * as THREE from 'three';
import { CONFIG } from '../config.js';

// Teleport nişangâhı.
//  İnsan modu: parabolik yay (yer çekimli)  — uzak hedefler için
//  Maket modu: düz ışın                     — masadaki maketi işaretlemek için
// Yalnızca yürünebilir yüzeyler geçerli hedeftir.

const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _d = new THREE.Vector3();

export class TeleportArc {
  constructor(scene, navigator) {
    this.nav = navigator;
    const n = CONFIG.TELEPORT_ARC_STEPS + 1;
    this.positions = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.lineMat = new THREE.LineBasicMaterial({ color: 0x3ad1ff, transparent: true, opacity: 0.9, depthTest: false, fog: false });
    this.line = new THREE.Line(geo, this.lineMat);
    this.line.frustumCulled = false;
    this.line.renderOrder = 900;

    this.marker = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.4, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x3ad1ff, transparent: true, opacity: 0.9, depthTest: false, fog: false }),
    );
    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.08, 20).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false, fog: false }),
    );
    ring.renderOrder = dot.renderOrder = 901;
    this.marker.add(ring, dot);

    this.group = new THREE.Group();
    this.group.add(this.line, this.marker);
    this.group.visible = false;
    scene.add(this.group);

    this.hit = null;        // geçerli hedef (oda koordinatı)
    this.lastValid = null;  // ateşleme anında kullanılacak son geçerli hedef
    this.lastValidAge = Infinity;
  }

  hide() {
    this.group.visible = false;
    this.hit = null;
  }

  /**
   * @param {THREE.Vector3} origin oda koordinatı
   * @param {THREE.Vector3} dir birim yön
   */
  update(origin, dir, dt = 0, { straight = false } = {}) {
    this.group.visible = true;
    const pos = this.positions;
    let count = 0;
    let hit = null;
    const push = (v) => { pos[count * 3] = v.x; pos[count * 3 + 1] = v.y; pos[count * 3 + 2] = v.z; count++; };

    push(origin);
    if (this.nav.isModel || straight) {
      // Düz ışın (maket modunda en fazla 4 m; masaüstü nişangâhında 300 m)
      const far = straight ? 300 : 4;
      const h = this.nav.raycast(origin, dir, far);
      _p.copy(origin).addScaledVector(dir, h ? h.distance : far);
      push(_p);
      if (h) hit = h;
    } else {
      const v = _d.copy(dir).multiplyScalar(CONFIG.TELEPORT_ARC_SPEED);
      const g = CONFIG.TELEPORT_ARC_GRAVITY;
      const dt0 = CONFIG.TELEPORT_ARC_DT;
      _p.copy(origin);
      for (let i = 1; i <= CONFIG.TELEPORT_ARC_STEPS; i++) {
        const t = i * dt0;
        _q.set(origin.x + v.x * t, origin.y + v.y * t - 0.5 * g * t * t, origin.z + v.z * t);
        const seg = _q.clone().sub(_p);
        const len = seg.length();
        const h = this.nav.raycast(_p, seg.normalize(), len);
        if (h) { push(h.point); hit = h; break; }
        push(_q);
        _p.copy(_q);
        if (_q.y < -60) break;
      }
    }

    // Yalnızca yukarı bakan yüzeyler geçerli (duvar/tavan değil)
    if (hit && hit.face) {
      const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      if (n.y < 0.6) hit = null;
    }

    this.line.geometry.setDrawRange(0, count);
    this.line.geometry.attributes.position.needsUpdate = true;
    this.lineMat.color.set(hit ? 0x3ad1ff : 0xff5a5a);

    this.hit = hit ? hit.point.clone() : null;
    if (this.hit) { this.lastValid = this.hit.clone(); this.lastValidAge = 0; }
    else this.lastValidAge += dt;

    this.marker.visible = !!hit;
    if (hit) {
      this.marker.position.copy(hit.point);
      this.marker.position.y += 0.002;
      // Maket modunda halka bir insan izdüşümü kadar küçük (0.8 m çap → 1:70'te ~1 cm, okunur olması için 3×)
      const s = this.nav.isModel ? Math.max(0.025, this.nav.scale * 3) : 1;
      this.marker.scale.setScalar(s);
    }
  }

  /** Ateşleme anında: güncel hedef yoksa çok yakın zamandaki son hedefi kullan (başparmak indirirken titreme) */
  consumeTarget() {
    const t = this.hit || (this.lastValidAge < 0.25 ? this.lastValid : null);
    this.lastValid = null;
    this.lastValidAge = Infinity;
    return t;
  }
}
