import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { HandFrame } from './HandFrame.js';
import { CONFIG } from '../config.js';

// Quest 3 native WebXR Hand Input → HandFrame (oda koordinatları).
// three.js el grupları sahne kökündedir; dünya hareket ettiğinde eller etkilenmez.

export class XRHandInput {
  constructor(renderer, scene) {
    this.frames = { left: new HandFrame('left', 'xr'), right: new HandFrame('right', 'xr') };
    this.groups = { left: null, right: null };
    this.anyHand = false;
    const factory = new XRHandModelFactory();

    for (let i = 0; i < 2; i++) {
      const hand = renderer.xr.getHand(i);
      hand.add(factory.createHandModel(hand, CONFIG.HAND_MODEL));
      scene.add(hand);
      hand.addEventListener('connected', (e) => {
        const src = e.data;
        if (!src || !src.hand) return;
        hand.userData.handedness = src.handedness;
        this.groups[src.handedness] = hand;
      });
      hand.addEventListener('disconnected', () => {
        const side = hand.userData.handedness;
        if (side && this.groups[side] === hand) this.groups[side] = null;
        hand.userData.handedness = null;
      });
    }
  }

  /** Her XR karesinde çağır. İzlenmeyen el için frame.tracked = false. */
  update(time) {
    this.anyHand = false;
    for (const side of ['left', 'right']) {
      const f = this.frames[side];
      const g = this.groups[side];
      if (g) f.fromXRHand(g);
      else f.tracked = false;
      f.time = time;
      if (f.tracked) this.anyHand = true;
    }
    return this.frames;
  }
}
