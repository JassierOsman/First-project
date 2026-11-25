import * as THREE from 'three';
import { CONFIG } from '../config.js';

// Prosedürel mimari maket sahnesi. Tüm ölçüler GERÇEK METRE (1:1) cinsindendir;
// 1:70 görünüm, dünya kökünün ölçeği ile elde edilir.
//
// Alan: 72 m × 52 m maket tabanı (1:70'te ≈ 1.03 m × 0.74 m — bir masaya sığar)
//  • İki katlı pavyon + çatı terası (dış merdivenlerle çıkılabilir)
//  • 6 katlı kule (çatısına ışınlanılabilir)
//  • Üç beşik çatılı ev, meydan, havuz, ağaçlar, ölçek insanları
//  • Ölçek çubuğu ve kuzey oku

export const SITE = { width: 72, depth: 52, baseThickness: 0.6 };

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildWorld(root) {
  const walkables = [];
  const M = {
    base: new THREE.MeshStandardMaterial({ color: 0xece8df, roughness: 0.95 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf6f4ef, roughness: 0.85 }),
    grey: new THREE.MeshStandardMaterial({ color: 0xb9b6ae, roughness: 0.9 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x4b4f55, roughness: 0.8 }),
    paving: new THREE.MeshStandardMaterial({ color: 0xd3cdc0, roughness: 1 }),
    wood: new THREE.MeshStandardMaterial({ color: 0xc49a6c, roughness: 0.8 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x8f8a82, roughness: 0.9 }),
    green: new THREE.MeshStandardMaterial({ color: 0xa9b98f, roughness: 1 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9cc7dc, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.32, depthWrite: false }),
    water: new THREE.MeshStandardMaterial({ color: 0x5fa8c8, roughness: 0.15, metalness: 0.1 }),
    crown: new THREE.MeshStandardMaterial({ color: 0x8fae7a, roughness: 1, flatShading: true }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x8a7056, roughness: 1 }),
    person: new THREE.MeshStandardMaterial({ color: 0x9d9a93, roughness: 0.9 }),
    landscape: new THREE.MeshStandardMaterial({ color: 0xa3ad92, roughness: 1 }),
    red: new THREE.MeshStandardMaterial({ color: 0xe63946, roughness: 0.6, emissive: 0x5a0a10 }),
  };

  const box = (w, h, d, x, y0, z, mat, { walk = false, shadow = true, parent = root } = {}) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y0 + h / 2, z);
    m.castShadow = shadow && mat !== M.glass;
    m.receiveShadow = true;
    if (walk) { m.userData.walkable = true; walkables.push(m); }
    parent.add(m);
    return m;
  };

  // ------------------------------------------------------------ zemin
  const landscape = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200).rotateX(-Math.PI / 2), M.landscape);
  landscape.position.y = -0.03;
  landscape.receiveShadow = true;
  landscape.name = 'landscape'; // yalnızca insan modunda görünür
  root.add(landscape);
  walkables.push(landscape);

  box(SITE.width, SITE.baseThickness, SITE.depth, 0, -SITE.baseThickness, 0, M.base, { walk: true, shadow: false });

  // meydan ve yollar
  box(34, 0.02, 16, 13, 0, 2, M.paving, { shadow: false });
  box(4, 0.02, 18, 4, 0, 17, M.paving, { shadow: false });
  box(26, 0.02, 3, -15, 0, 21.5, M.paving, { shadow: false });

  // ------------------------------------------------------------ pavyon (2 kat + çatı terası)
  const pav = new THREE.Group();
  root.add(pav);
  const PX0 = -26, PX1 = -4, PZ0 = -4, PZ1 = 12;
  const pw = PX1 - PX0, pd = PZ1 - PZ0, pcx = (PX0 + PX1) / 2, pcz = (PZ0 + PZ1) / 2;
  box(pw, 0.15, pd, pcx, 0, pcz, M.white, { walk: true, parent: pav });            // zemin kat döşemesi
  box(pw - 2, 3.1, pd - 2, pcx, 0.15, pcz, M.glass, { parent: pav });              // zemin kat cam kabuk
  box(pw, 0.35, pd, pcx, 3.25, pcz, M.white, { walk: true, parent: pav });          // 1. kat döşemesi (üst = 3.6)
  box(pw - 6, 3.25, pd - 6, pcx - 1, 3.6, pcz - 1, M.glass, { parent: pav });      // 1. kat cam kabuk (çevresi teras)
  box(pw, 0.35, pd, pcx, 6.85, pcz, M.white, { walk: true, parent: pav });          // çatı döşemesi (üst = 7.2)
  // kolonlar
  const colGeo = new THREE.CylinderGeometry(0.2, 0.2, 1, 12);
  const cols = [];
  for (let x = PX0 + 1; x <= PX1 - 1 + 1e-6; x += (pw - 2) / 4) for (let z = PZ0 + 1; z <= PZ1 - 1 + 1e-6; z += (pd - 2) / 3) cols.push([x, z]);
  const colMesh = new THREE.InstancedMesh(colGeo, M.white, cols.length * 2);
  const mtx = new THREE.Matrix4();
  cols.forEach(([x, z], i) => {
    mtx.compose(new THREE.Vector3(x, 0.15 + 1.55, z), new THREE.Quaternion(), new THREE.Vector3(1, 3.1, 1));
    colMesh.setMatrixAt(i * 2, mtx);
    mtx.compose(new THREE.Vector3(x, 3.6 + 1.625, z), new THREE.Quaternion(), new THREE.Vector3(1, 3.25, 1));
    colMesh.setMatrixAt(i * 2 + 1, mtx);
  });
  colMesh.castShadow = true;
  pav.add(colMesh);
  // çatı parapeti (merdiven çıkışında boşluk)
  box(pw, 1.1, 0.25, pcx, 7.2, PZ0 + 0.125, M.white, { parent: pav });
  box(pw, 1.1, 0.25, pcx, 7.2, PZ1 - 0.125, M.white, { parent: pav });
  box(0.25, 1.1, pd, PX1 - 0.125, 7.2, pcz, M.white, { parent: pav });
  box(0.25, 1.1, 10.5, PX0 + 0.125, 7.2, PZ0 + 5.25, M.white, { parent: pav });
  // 1. kat cam korkuluk
  box(pw, 1.0, 0.05, pcx, 3.6, PZ1 - 0.1, M.glass, { parent: pav });
  box(0.05, 1.0, pd, PX1 - 0.1, 3.6, pcz, M.glass, { parent: pav });
  // yeşil çatılı tek katlı kanat (üst = 3.6, 1. kata bağlanır)
  box(10, 3.45, 8, -21, 0.15, 16, M.white, { parent: pav });
  box(10, 0.15, 8, -21, 3.45, 16, M.green, { walk: true, parent: pav });
  // çatıda ahşap pergola
  for (let i = 0; i < 7; i++) box(0.12, 0.12, 8, -14 - i * 1.6, 9.6, 4, M.wood, { parent: pav });
  for (const [x, z] of [[-14, 0.2], [-14, 7.8], [-23.6, 0.2], [-23.6, 7.8]]) box(0.15, 2.4, 0.15, x, 7.2, z, M.wood, { parent: pav });

  // Merdiven yardımcı: yüzen basamaklar + yan kiriş; basamak üstleri yürünebilir
  const stair = (x0, x1, zStart, zEnd, y0, y1, steps) => {
    const run = (zEnd - zStart) / steps;
    const rise = (y1 - y0) / steps;
    const w = Math.abs(x1 - x0), cx = (x0 + x1) / 2;
    for (let i = 0; i < steps; i++) {
      const top = y0 + (i + 1) * rise;
      box(w, 0.08, Math.abs(run) + 0.02, cx, top - 0.08, zStart + (i + 0.5) * run, M.wood, { walk: true, parent: pav });
    }
    // yan kiriş (eğik)
    const len = Math.hypot(zEnd - zStart, y1 - y0);
    const stringer = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, len), M.dark);
    stringer.position.set(x1 + Math.sign(x1 - x0) * 0.06, (y0 + y1) / 2 - 0.1, (zStart + zEnd) / 2);
    stringer.rotation.x = -Math.atan2(y1 - y0, zEnd - zStart);
    stringer.castShadow = true;
    pav.add(stringer);
  };
  // Merdiven A: zemin (z=13) → 1. kat sahanlığı (z=5.5), pavyonun doğusunda
  stair(-4, -2, 13, 5.5, 0, 3.6, 20);
  box(2, 0.35, 3.5, -3, 3.25, 3.75, M.white, { walk: true, parent: pav });
  // Merdiven B: 1. kat (batı sahanlık) → çatı terası
  box(2, 0.35, 3, -27, 3.25, -2.5, M.white, { walk: true, parent: pav });
  stair(-28, -26, -1, 6.5, 3.6, 7.2, 20);
  box(2, 0.35, 3.5, -27, 6.85, 8.25, M.white, { walk: true, parent: pav });

  // ------------------------------------------------------------ kule (6 kat, 21 m)
  const tower = new THREE.Group();
  root.add(tower);
  const TX = 16, TZ = -16;
  for (let i = 0; i < 6; i++) {
    box(12.4, 0.4, 12.4, TX, i * 3.5, TZ, M.white, { parent: tower, walk: i === 0 });
    box(11.6, 3.1, 11.6, TX, i * 3.5 + 0.4, TZ, M.glass, { parent: tower });
    // dikey güneş kırıcılar
    for (let k = -2; k <= 2; k++) {
      box(0.15, 3.1, 0.6, TX + k * 2.6, i * 3.5 + 0.4, TZ + 6.1, M.wood, { parent: tower });
    }
  }
  for (let i = 0; i < 6; i++) box(4, 3.1, 4, TX, i * 3.5 + 0.4, TZ, M.grey, { parent: tower });
  box(12.8, 0.5, 12.8, TX, 21, TZ, M.white, { walk: true, parent: tower });     // çatı (üst = 21.5)
  box(3, 2.6, 3, TX - 3, 21.5, TZ - 3, M.grey, { parent: tower });

  // ------------------------------------------------------------ evler (beşik çatı)
  const house = (cx, cz, w, d, h, rot = 0) => {
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    g.rotation.y = rot;
    root.add(g);
    box(w, h, d, 0, 0, 0, M.white, { parent: g });
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2 - 0.3, 0); shape.lineTo(w / 2 + 0.3, 0); shape.lineTo(0, 2.6); shape.closePath();
    const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: d + 0.6, bevelEnabled: false });
    roofGeo.translate(0, 0, -(d + 0.6) / 2);
    const roof = new THREE.Mesh(roofGeo, M.roof);
    roof.position.y = h;
    roof.castShadow = roof.receiveShadow = true;
    g.add(roof);
    // kapı + pencereler
    box(1.1, 2.2, 0.06, 0, 0, d / 2 + 0.02, M.dark, { parent: g, shadow: false });
    box(1.4, 1.2, 0.06, -w / 4 - 0.4, 1.0, d / 2 + 0.02, M.glass, { parent: g });
    box(1.4, 1.2, 0.06, w / 4 + 0.4, 1.0, d / 2 + 0.02, M.glass, { parent: g });
  };
  house(18, 17, 7, 9, 3.2);
  house(28, 17, 7, 9, 3.2);
  house(30, 3, 6, 8, 3.0, -Math.PI / 2);

  // ------------------------------------------------------------ havuz
  box(11, 0.25, 6, 3, 0, -17, M.white, { shadow: false });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(10, 5).rotateX(-Math.PI / 2), M.water);
  water.position.set(3, 0.27, -17);
  root.add(water);

  // ------------------------------------------------------------ ağaçlar & insanlar (instanced)
  const rand = rng(7);
  const blocked = [
    [PX0 - 3, PX1 + 3, PZ0 - 2, PZ1 + 10], [TX - 8, TX + 8, TZ - 8, TZ + 8],
    [13, 33, 11, 23], [25, 35, -2, 8], [-3, 9, -21, -13], [-2, 30, -6, 10],
  ];
  const free = (x, z) => !blocked.some(([a, b, c, d]) => x > a && x < b && z > c && z < d);
  const trees = [];
  while (trees.length < 34) {
    const x = (rand() - 0.5) * (SITE.width - 4), z = (rand() - 0.5) * (SITE.depth - 4);
    if (free(x, z)) trees.push([x, z, 0.75 + rand() * 0.5]);
  }
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.18, 1, 6), M.trunk, trees.length);
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), M.crown, trees.length);
  trees.forEach(([x, z, s], i) => {
    mtx.compose(new THREE.Vector3(x, 1.4 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, 2.8 * s, s));
    trunks.setMatrixAt(i, mtx);
    mtx.compose(new THREE.Vector3(x, 4.2 * s, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand() * 6, 0)), new THREE.Vector3(2.2 * s, 2.5 * s, 2.2 * s));
    crowns.setMatrixAt(i, mtx);
  });
  trunks.castShadow = crowns.castShadow = true;
  root.add(trunks, crowns);

  // 1.75 m ölçek insanları — maket modunda ~2.5 cm
  const people = [];
  for (let i = 0; i < 26; i++) {
    const zone = i % 3;
    const x = zone === 0 ? 0 + rand() * 26 : zone === 1 ? -24 + rand() * 18 : 2.5 + rand() * 3;
    const z = zone === 0 ? -4 + rand() * 12 : zone === 1 ? 20.5 + rand() * 2 : 9 + rand() * 15;
    people.push([x, z, 0.9 + rand() * 0.2]);
  }
  const bodyGeo = new THREE.CapsuleGeometry(0.21, 0.95, 4, 8);
  const headGeo = new THREE.SphereGeometry(0.12, 10, 8);
  const bodies = new THREE.InstancedMesh(bodyGeo, M.person, people.length);
  const heads = new THREE.InstancedMesh(headGeo, M.person, people.length);
  people.forEach(([x, z, s], i) => {
    mtx.compose(new THREE.Vector3(x, 0.69 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
    bodies.setMatrixAt(i, mtx);
    mtx.compose(new THREE.Vector3(x, 1.62 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
    heads.setMatrixAt(i, mtx);
  });
  bodies.castShadow = heads.castShadow = true;
  root.add(bodies, heads);

  // ------------------------------------------------------------ ölçek çubuğu, kuzey oku, etiket
  for (let i = 0; i < 5; i++) box(2, 0.04, 0.6, 21 + i * 2, 0, 24.2, i % 2 ? M.white : M.dark, { shadow: false });
  const label = makeLabel(`ÖLÇEK 1:${CONFIG.MODEL_SCALE_DENOMINATOR}   0 ——— 10 m`, 1024, 128);
  label.scale.set(16, 2, 1);
  label.rotation.x = -Math.PI / 2;
  label.position.set(26, 0.05, 25.3);
  root.add(label);
  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(0, 1.6); arrowShape.lineTo(1, -1.2); arrowShape.lineTo(0, -0.5); arrowShape.lineTo(-1, -1.2); arrowShape.closePath();
  const arrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape).rotateX(-Math.PI / 2), M.dark);
  arrow.position.set(-32, 0.05, 21);
  root.add(arrow);
  const north = makeLabel('K', 128, 128);
  north.scale.set(1.8, 1.8, 1);
  north.rotation.x = -Math.PI / 2;
  north.position.set(-32, 0.05, 18.4);
  root.add(north);

  // ------------------------------------------------------------ "buradasınız" işareti (maket modunda)
  const you = new THREE.Group();
  const youBody = new THREE.Mesh(bodyGeo, M.red);
  youBody.position.y = 0.69;
  const youHead = new THREE.Mesh(headGeo, M.red);
  youHead.position.y = 1.62;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 14, 8), new THREE.MeshBasicMaterial({ color: 0xe63946, transparent: true, opacity: 0.45 }));
  beam.position.y = 9;
  you.add(youBody, youHead, beam);
  you.visible = false;
  root.add(you);

  return { walkables, landscape, youAreHere: you, siteCenter: new THREE.Vector3(0, 0, 0) };
}

function makeLabel(text, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3d4248';
  ctx.font = `700 ${Math.round(h * 0.62)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
}
