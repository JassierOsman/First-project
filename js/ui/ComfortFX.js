import * as THREE from 'three';
import { CONFIG } from '../config.js';

// Konfor efektleri: teleport kararması ve hareket sırasında tünel (vinyet).
// İkisi de kameraya bağlıdır; XR'da kamera pozu her karede render'dan önce güncellenir.

export class Fader {
  constructor(camera) {
    this.material = new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide,
      depthTest: false, depthWrite: false, fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), this.material);
    this.mesh.renderOrder = 10000;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    camera.add(this.mesh);
    this.phase = null; // 'out' | 'in'
    this.callback = null;
  }

  get busy() { return this.phase !== null; }

  /** Karart → callback → aç */
  blink(callback, time = CONFIG.FADE_TIME) {
    if (this.busy) return false;
    this.phase = 'out';
    this.time = time;
    this.callback = callback;
    this.mesh.visible = true;
    return true;
  }

  update(dt) {
    if (!this.phase) return;
    const step = dt / this.time;
    if (this.phase === 'out') {
      this.material.opacity = Math.min(1, this.material.opacity + step);
      if (this.material.opacity >= 1) {
        this.callback && this.callback();
        this.callback = null;
        this.phase = 'in';
      }
    } else {
      this.material.opacity = Math.max(0, this.material.opacity - step);
      if (this.material.opacity <= 0) {
        this.phase = null;
        this.mesh.visible = false;
      }
    }
  }
}

export class Vignette {
  constructor(camera) {
    this.uniforms = { uIntensity: { value: 0 } };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true, depthTest: false, depthWrite: false,
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform float uIntensity;
        varying vec2 vUv;
        void main() {
          float r = length(vUv - 0.5) * 2.0;          // 0 merkez, 1 kenar
          float inner = mix(0.95, 0.32, uIntensity);   // yoğunluk arttıkça tünel daralır
          float a = smoothstep(inner, inner + 0.28, r) * min(1.0, uIntensity * 1.4);
          gl_FragColor = vec4(0.0, 0.0, 0.0, a);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.mesh.position.z = -0.15;
    this.mesh.renderOrder = 9999;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    camera.add(this.mesh);
    this.target = 0;
    this.value = 0;
  }

  /** 0..1 hedef yoğunluk; her kare çağır */
  set(v) { this.target = THREE.MathUtils.clamp(v, 0, 1) * CONFIG.VIGNETTE_MAX; }

  update(dt) {
    if (!CONFIG.VIGNETTE) { this.mesh.visible = false; return; }
    const k = 1 - Math.exp(-dt * (this.target > this.value ? 8 : 4));
    this.value += (this.target - this.value) * k;
    this.uniforms.uIntensity.value = this.value;
    this.mesh.visible = this.value > 0.01;
  }
}
