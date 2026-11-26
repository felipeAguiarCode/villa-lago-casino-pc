import * as THREE from 'three';
import type { HorseDef } from './rules';
import { blobTexture } from './track';

/**
 * Toy jockey pieces, modelled here from simple shapes: a painted horse (body, neck, head with
 * ears, mane, tail and four legs with hooves) carrying a little rider in the stable's silks
 * (helmet, jacket, white breeches, black boots) with a number bib on the back and the number on
 * the saddle cloth. About 0.55 units from nose to tail; it faces +x.
 */

const SKIN = '#e2b48a';

function numberTexture(n: number, bg: string, fg: string, round = 18) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d')!;
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(4, 4, 120, 120, round);
  g.fill();
  g.fillStyle = fg;
  g.font = '700 96px "Barlow Condensed", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), 64, 70);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Geometries shared by the five horses. */
export class HorseKit {
  readonly g = {
    body: new THREE.CapsuleGeometry(0.062, 0.17, 6, 14).rotateZ(Math.PI / 2),
    rump: new THREE.SphereGeometry(0.068, 14, 10),
    chest: new THREE.SphereGeometry(0.066, 14, 10),
    neck: new THREE.CylinderGeometry(0.028, 0.046, 0.17, 10).translate(0, 0.085, 0),
    head: new THREE.CapsuleGeometry(0.028, 0.07, 4, 10).rotateZ(Math.PI / 2).translate(0.05, 0, 0),
    muzzle: new THREE.SphereGeometry(0.026, 10, 8),
    ear: new THREE.ConeGeometry(0.011, 0.035, 6).translate(0, 0.0175, 0),
    mane: new THREE.BoxGeometry(0.016, 0.15, 0.02).translate(0, 0.08, 0),
    tail: new THREE.CylinderGeometry(0.01, 0.026, 0.16, 8).translate(0, -0.08, 0),
    upper: new THREE.CylinderGeometry(0.02, 0.015, 0.11, 8).translate(0, -0.055, 0),
    lower: new THREE.CylinderGeometry(0.013, 0.012, 0.075, 8).translate(0, -0.0375, 0),
    hoof: new THREE.CylinderGeometry(0.014, 0.017, 0.018, 8).translate(0, -0.009, 0),
    cloth: new THREE.BoxGeometry(0.12, 0.006, 0.142),
    flap: new THREE.PlaneGeometry(0.085, 0.062),
    saddle: new THREE.BoxGeometry(0.07, 0.014, 0.08),
    torso: new THREE.CapsuleGeometry(0.034, 0.06, 4, 10),
    bib: new THREE.PlaneGeometry(0.05, 0.05),
    rhead: new THREE.SphereGeometry(0.024, 12, 10),
    helmet: new THREE.SphereGeometry(0.029, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    peak: new THREE.BoxGeometry(0.02, 0.005, 0.03),
    arm: new THREE.CapsuleGeometry(0.011, 0.06, 3, 6),
    thigh: new THREE.CapsuleGeometry(0.014, 0.05, 3, 6),
    boot: new THREE.CapsuleGeometry(0.012, 0.04, 3, 6),
    shadow: new THREE.PlaneGeometry(0.62, 0.26).rotateX(-Math.PI / 2),
  };
  readonly m = {
    white: new THREE.MeshStandardMaterial({ color: '#f3f0e8', roughness: 0.5 }),
    black: new THREE.MeshStandardMaterial({ color: '#1a1614', roughness: 0.45 }),
    skin: new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.6 }),
    hoof: new THREE.MeshStandardMaterial({ color: '#2b2320', roughness: 0.6 }),
    leather: new THREE.MeshStandardMaterial({ color: '#3a2416', roughness: 0.55 }),
    shadow: new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }),
  };

  dispose() {
    for (const x of Object.values(this.g)) x.dispose();
    for (const x of Object.values(this.m)) {
      (x as THREE.MeshBasicMaterial).map?.dispose();
      x.dispose();
    }
  }
}

interface Leg {
  hip: THREE.Group;
  knee: THREE.Group;
  front: boolean;
  phase: number;
}

export class ToyHorse {
  /** Placed on the track: position on the surface, banked and turned to its heading. */
  readonly root = new THREE.Group();
  /** The gallop's bob and rocking. */
  private rock = new THREE.Group();
  private neck = new THREE.Group();
  private tail = new THREE.Group();
  private rider = new THREE.Group();
  private legs: Leg[] = [];
  private own: { dispose(): void }[] = [];
  /** Current speed in table units per second (sets the gait). */
  speed = 0;
  private phase = Math.random() * Math.PI * 2;
  private idle = Math.random() * 10;
  private gallop = 0;

  constructor(
    readonly def: HorseDef,
    kit: HorseKit,
  ) {
    const { g, m } = kit;
    const coat = this.mat(def.coat, 0.5);
    const mane = this.mat(def.mane, 0.6);
    const silk = this.mat(def.color, 0.38);
    const silkDark = this.mat(def.dark, 0.4);
    const muzzleMat = this.mat(new THREE.Color(def.coat).multiplyScalar(0.55).getStyle(), 0.55);
    const yellow = def.n === 3;
    const bibTex = numberTexture(def.n, '#f7f4ec', '#141414');
    const clothTex = numberTexture(def.n, def.color, yellow ? '#141414' : '#ffffff', 6);
    const bibMat = new THREE.MeshStandardMaterial({ map: bibTex, roughness: 0.6 });
    const clothMat = new THREE.MeshStandardMaterial({ map: clothTex, roughness: 0.6, side: THREE.DoubleSide });
    this.own.push(bibTex, clothTex, bibMat, clothMat);
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };

    const shadow = add(this.root, g.shadow, m.shadow, 0.0, 0.004, 0);
    shadow.renderOrder = 2;
    this.root.add(this.rock);
    // body
    const body = add(this.rock, g.body, coat, 0, 0.215, 0);
    body.scale.set(1, 1, 0.82);
    add(this.rock, g.rump, coat, -0.085, 0.222, 0).scale.set(1, 1, 0.84);
    add(this.rock, g.chest, coat, 0.085, 0.218, 0).scale.set(1, 1.02, 0.8);
    // neck and head
    this.neck.position.set(0.115, 0.245, 0);
    this.neck.rotation.z = -0.62;
    this.rock.add(this.neck);
    add(this.neck, g.neck, coat).scale.set(1, 1, 0.75);
    const mn = add(this.neck, g.mane, mane, -0.03, 0.0, 0);
    mn.rotation.z = 0.06;
    const head = new THREE.Group();
    head.position.set(0, 0.16, 0);
    head.rotation.z = 0.62 - 0.78;
    this.neck.add(head);
    add(head, g.head, coat).scale.set(1, 1, 0.82);
    add(head, g.muzzle, muzzleMat, 0.105, -0.004, 0).scale.set(1, 0.9, 0.85);
    for (const z of [-0.016, 0.016]) {
      const ear = add(head, g.ear, coat, -0.002, 0.026, z);
      ear.rotation.z = 0.3;
    }
    // tail
    this.tail.position.set(-0.145, 0.252, 0);
    this.tail.rotation.z = -0.85;
    this.rock.add(this.tail);
    add(this.tail, g.tail, mane);
    // legs: hip/shoulder pivot, then knee
    for (const [x, z, front, ph] of [
      [0.092, 0.036, true, 0],
      [0.092, -0.036, true, 0.45],
      [-0.09, 0.036, false, Math.PI + 0.1],
      [-0.09, -0.036, false, Math.PI + 0.55],
    ] as const) {
      const hip = new THREE.Group();
      hip.position.set(x, 0.2, z);
      this.rock.add(hip);
      add(hip, g.upper, coat);
      const knee = new THREE.Group();
      knee.position.y = -0.11;
      hip.add(knee);
      add(knee, g.lower, coat);
      add(knee, g.hoof, m.hoof, 0, -0.075, 0);
      this.legs.push({ hip, knee, front, phase: ph });
    }
    // saddle cloth with the number on both flanks, the saddle on top
    add(this.rock, g.cloth, silk, -0.005, 0.279, 0);
    for (const z of [0.05, -0.05]) {
      const flap = add(this.rock, g.flap, clothMat, -0.005, 0.245, z);
      flap.rotation.y = z > 0 ? 0 : Math.PI;
    }
    add(this.rock, g.saddle, m.leather, 0.005, 0.284, 0);
    // the rider, crouched forward over the withers
    this.rider.position.set(0.0, 0.29, 0);
    this.rock.add(this.rider);
    for (const z of [0.05, -0.05]) {
      const th = add(this.rider, g.thigh, m.white, 0.03, 0.005, z);
      th.rotation.z = -1.25;
      const bt = add(this.rider, g.boot, m.black, 0.012, -0.035, z * 1.08);
      bt.rotation.z = 0.35;
    }
    const torso = add(this.rider, g.torso, silk, 0.03, 0.055, 0);
    torso.rotation.z = -1.12;
    torso.scale.set(1, 1, 1.15);
    // the bib lies on the jockey's back, facing up and a little back
    // (laid flat, the number's top turned to the front, then tilted back with the torso)
    const bib = add(this.rider, g.bib, bibMat, 0.024, 0.093, 0);
    bib.rotation.order = 'ZYX';
    bib.rotation.set(-Math.PI / 2, -Math.PI / 2, 0.45);
    // arms reach down to the reins at the withers
    for (const z of [0.036, -0.036]) {
      const arm = add(this.rider, g.arm, silkDark, 0.1, 0.035, z);
      arm.rotation.z = 0.71;
      arm.rotation.x = z > 0 ? 0.2 : -0.2;
    }
    add(this.rider, g.rhead, m.skin, 0.088, 0.098, 0);
    const helmet = add(this.rider, g.helmet, silk, 0.088, 0.101, 0);
    helmet.rotation.z = -0.35;
    const peak = add(this.rider, g.peak, silkDark, 0.112, 0.104, 0);
    peak.rotation.z = -0.3;
  }

  private mat(color: string, roughness: number) {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
    this.own.push(m);
    return m;
  }

  /** Animates the gait from the current speed: standing, walking or galloping. */
  animate(dt: number) {
    const v = this.speed;
    const gal = Math.min(1, Math.max(0, (v - 0.45) / 0.6));
    this.gallop += (gal - this.gallop) * Math.min(1, dt * 6);
    const g = this.gallop;
    const walk = Math.min(1, v / 0.25) * (1 - g);
    const freq = g > 0.01 ? 1.7 + 0.42 * v : 1.4 + 2.2 * v;
    this.phase += Math.PI * 2 * freq * dt * (v > 0.01 ? 1 : 0);
    this.idle += dt;
    const p = this.phase;
    // rocking-horse gallop: the body pitches and bobs, the rider floats above it
    const pitch = g * 0.15 * Math.sin(p);
    const bob = g * 0.03 * Math.max(0, Math.sin(p + 0.6)) + walk * 0.006 * Math.abs(Math.sin(p * 2));
    this.rock.rotation.z = pitch;
    this.rock.position.y = bob;
    this.rider.position.y = 0.29 - bob * 0.55;
    this.rider.rotation.z = -pitch * 0.65;
    this.neck.rotation.z = -0.62 - g * 0.12 + g * 0.12 * Math.sin(p + 1.3) + (1 - g) * 0.04 * Math.sin(this.idle * 0.9);
    // the tail streams out behind at the gallop and swishes at rest
    this.tail.rotation.z = -0.85 - g * (0.45 + 0.18 * Math.sin(p + 2.2)) - (1 - g) * 0.08 * Math.sin(this.idle * 1.7);
    this.tail.rotation.x = (1 - g) * 0.15 * Math.sin(this.idle * 1.3);
    for (const l of this.legs) {
      // gallop: front legs reach forward while the hind legs push back, then gather under
      const gs = Math.sin(p + (l.front ? 0 : Math.PI) + l.phase * 0.35);
      const gallopHip = l.front ? 0.62 * gs : 0.55 * gs;
      const gallopKnee = l.front ? -Math.max(0, -Math.sin(p + l.phase * 0.35 + 0.8)) * 1.1 : Math.max(0, Math.sin(p + Math.PI + l.phase * 0.35 + 0.6)) * 0.9;
      const ws = Math.sin(p + l.phase);
      const walkHip = 0.32 * ws;
      const walkKnee = l.front ? -Math.max(0, Math.cos(p + l.phase)) * 0.5 : Math.max(0, Math.cos(p + l.phase)) * 0.4;
      l.hip.rotation.z = g * gallopHip + walk * walkHip;
      l.knee.rotation.z = g * gallopKnee + walk * walkKnee;
    }
  }

  dispose() {
    this.root.removeFromParent();
    for (const d of this.own) d.dispose();
    this.own = [];
  }
}
