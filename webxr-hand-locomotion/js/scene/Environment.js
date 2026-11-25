import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { SITE } from './World.js';

// Oda uzayı: ışıklar, maket masası, stüdyo zemini, gökyüzü/sis.
// Bunlar dünya köküyle ölçeklenmez; ölçek moduna göre görünür/gizli olur.

const SKY = new THREE.Color(0xcfe0ec);
const STUDIO = new THREE.Color(0x2b3138);
const _c = new THREE.Vector3();
const _sunDir = new THREE.Vector3(-0.45, 0.8, 0.35).normalize();

export class Environment {
  constructor(scene, renderer) {
    this.scene = scene;
    scene.background = SKY.clone();
    this.fog = new THREE.Fog(SKY, 80, 520);
    scene.fog = this.fog;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x8f8a7c, 1.6);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
    this.sun.castShadow = CONFIG.SHADOWS;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0004;
    scene.add(this.sun, this.sun.target);
    renderer.shadowMap.enabled = CONFIG.SHADOWS;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this._shadowRadius = 0;

    // stüdyo zemini (maket modunda)
    this.studio = new THREE.Group();
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(8, 48).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x3a414a, roughness: 1 }),
    );
    floor.receiveShadow = true;
    const grid = new THREE.GridHelper(16, 32, 0x5d6772, 0x48505a);
    grid.position.y = 0.002;
    this.studio.add(floor, grid);
    this.studio.visible = false;
    scene.add(this.studio);

    // maket masası (boyutu her karede maket tabanına uydurulur)
    this.table = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4f3a, roughness: 0.7 });
    const legMat = new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.6, metalness: 0.3 });
    this.tableTop = new THREE.Mesh(new THREE.BoxGeometry(1, 0.035, 1), wood);
    this.tableTop.castShadow = this.tableTop.receiveShadow = true;
    this.legs = [];
    for (let i = 0; i < 4; i++) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1, 0.04), legMat);
      leg.castShadow = true;
      this.legs.push(leg);
      this.table.add(leg);
    }
    this.table.add(this.tableTop);
    this.table.visible = false;
    scene.add(this.table);
  }

  setMode(isModel) {
    this.studio.visible = isModel;
    this.scene.background.copy(isModel ? STUDIO : SKY);
    this.scene.fog = isModel ? null : this.fog;
  }

  /**
   * @param {import('../nav/Navigator.js').Navigator} nav
   * @param {THREE.Vector3} head başın oda konumu
   */
  update(nav, head) {
    const s = nav.scale;
    // ---- masa: maket tabanının altında
    const showTable = s <= CONFIG.TABLE_MAX_SCALE;
    if (showTable) {
      nav.modelToWorld(_c.set(0, -SITE.baseThickness, 0), _c);
      const top = _c.y;
      this.table.visible = top > 0.25;
      if (this.table.visible) {
        const w = SITE.width * s + 0.1, d = SITE.depth * s + 0.1;
        this.table.position.set(_c.x, 0, _c.z);
        this.table.rotation.y = nav.yaw;
        this.tableTop.scale.set(w, 1, d);
        this.tableTop.position.y = top - 0.0175;
        const lx = w / 2 - 0.05, lz = d / 2 - 0.05, lh = top - 0.035;
        [[lx, lz], [-lx, lz], [lx, -lz], [-lx, -lz]].forEach(([x, z], i) => {
          this.legs[i].position.set(x, lh / 2, z);
          this.legs[i].scale.y = Math.max(0.01, lh);
        });
      }
    } else {
      this.table.visible = false;
    }

    // ---- gölge kamerası: maket modunda masayı, insan modunda çevreyi kapsar
    let radius, center;
    if (nav.isModel) {
      radius = Math.max(0.8, SITE.width * s * 0.75);
      center = nav.modelToWorld(_c.set(0, 0, 0), _c);
    } else {
      radius = 45;
      center = _c.set(head.x, 0, head.z);
    }
    const dist = radius * 3;
    this.sun.position.copy(center).addScaledVector(_sunDir, dist);
    this.sun.target.position.copy(center);
    if (Math.abs(radius - this._shadowRadius) > 1e-3) {
      const cam = this.sun.shadow.camera;
      cam.left = cam.bottom = -radius;
      cam.right = cam.top = radius;
      cam.near = dist * 0.2;
      cam.far = dist * 2;
      cam.updateProjectionMatrix();
      this.sun.shadow.normalBias = radius * 0.0012;
      this._shadowRadius = radius;
    }
  }
}
