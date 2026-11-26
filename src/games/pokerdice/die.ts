import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { drawSuit } from '../../table/suits';
import { CUBE_ROTATIONS, DIE, flatten, slotAfter, upSlot } from './physics';

/**
 * The poker die: ivory, rounded edges, card-style faces drawn here (no downloads).
 * 9 and 10 carry suit pips, J · Q · K small crowned court motifs of our own, the Ace one big spade;
 * red and black inks. Canonical layout (opposite faces 9–A, 10–K, J–Q): +x K, −x 10, +y A, −y 9,
 * +z Q, −z J (BoxGeometry material order).
 */

/** Face slot of each value (0 = 9 … 5 = A). */
export const FACE_SLOT = [3, 1, 5, 4, 0, 2];
/** Printed "up" of each slot's texture, in the die's local frame (measured on RoundedBoxGeometry). */
export const TEX_UP = [
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 1, 0),
];

const RED = '#b3142b';
const BLACK = '#17141a';
const GOLD_INK = '#b8892e';
/** Ink and suit (0♠ 1♥ 2♦ 3♣) of each face. */
const INK = [BLACK, RED, RED, BLACK, RED, BLACK];
const SUIT = [3, 2, 1, 3, 2, 0];
const LABEL = ['9', '10', 'J', 'Q', 'K', 'A'];

const SIZE = 256;

function ivory(g: CanvasRenderingContext2D) {
  const grd = g.createRadialGradient(SIZE * 0.42, SIZE * 0.38, SIZE * 0.05, SIZE / 2, SIZE / 2, SIZE * 0.75);
  grd.addColorStop(0, '#fffaf0');
  grd.addColorStop(0.7, '#f4ead4');
  grd.addColorStop(1, '#e6d7b8');
  g.fillStyle = grd;
  g.fillRect(0, 0, SIZE, SIZE);
}

function frame(g: CanvasRenderingContext2D, ink: string) {
  g.save();
  g.strokeStyle = ink;
  g.globalAlpha = 0.3;
  g.lineWidth = 3;
  g.beginPath();
  g.roundRect(30, 30, SIZE - 60, SIZE - 60, 16);
  g.stroke();
  g.restore();
}

/** Rank and small suit in two opposite corners, card style. */
function indices(g: CanvasRenderingContext2D, v: number) {
  const ink = INK[v];
  for (const rot of [0, Math.PI]) {
    g.save();
    g.translate(SIZE / 2, SIZE / 2);
    g.rotate(rot);
    g.translate(-SIZE / 2, -SIZE / 2);
    g.fillStyle = ink;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `700 ${LABEL[v].length > 1 ? 30 : 36}px "Cinzel", serif`;
    if (LABEL[v].length > 1) {
      g.save();
      g.translate(52, 56);
      g.scale(0.78, 1);
      g.fillText(LABEL[v], 0, 0);
      g.restore();
    } else g.fillText(LABEL[v], 52, 56);
    drawSuit(g, SUIT[v], 52, 86, 20);
    g.restore();
  }
}

/** Suit pips on a card-like grid; those in the lower half are turned, as on a card. */
function pips(g: CanvasRenderingContext2D, v: number, spots: [number, number][], size: number) {
  g.fillStyle = INK[v];
  for (const [x, y] of spots) drawSuit(g, SUIT[v], x, y, size, y > SIZE / 2 + 1);
}

/** A crown: `kind` 0 a jack's coronet, 1 a queen's pearled crown, 2 a king's arched crown with a cross. */
function crown(g: CanvasRenderingContext2D, cx: number, base: number, w: number, kind: number, ink: string) {
  const h = w * (kind === 2 ? 0.62 : kind === 1 ? 0.55 : 0.42);
  g.save();
  g.translate(cx, base);
  g.fillStyle = ink;
  g.strokeStyle = ink;
  g.lineJoin = 'round';
  // band
  g.beginPath();
  g.roundRect(-w / 2, -h * 0.26, w, h * 0.26, h * 0.05);
  g.fill();
  // points
  const n = kind === 0 ? 3 : 5;
  g.beginPath();
  g.moveTo(-w / 2, -h * 0.24);
  for (let i = 0; i < n; i++) {
    const x0 = -w / 2 + (w * i) / (n - 1);
    const tall = kind === 0 ? (i === 1 ? 1 : 0.78) : 1 - Math.abs(i - (n - 1) / 2) * 0.1;
    g.lineTo(x0, -h * tall);
    if (i < n - 1) g.lineTo(x0 + w / (n - 1) / 2, -h * (kind === 0 ? 0.5 : 0.56));
  }
  g.lineTo(w / 2, -h * 0.24);
  g.closePath();
  g.fill();
  // pearls on the points
  for (let i = 0; i < n; i++) {
    const x0 = -w / 2 + (w * i) / (n - 1);
    const tall = kind === 0 ? (i === 1 ? 1 : 0.78) : 1 - Math.abs(i - (n - 1) / 2) * 0.1;
    g.beginPath();
    g.arc(x0, -h * tall - w * 0.04, w * (kind === 1 ? 0.055 : 0.045), 0, Math.PI * 2);
    g.fill();
  }
  if (kind === 2) {
    // arches and the cross on the orb
    g.lineWidth = w * 0.035;
    g.beginPath();
    g.moveTo(-w * 0.36, -h * 0.3);
    g.quadraticCurveTo(-w * 0.12, -h * 1.25, 0, -h * 1.05);
    g.quadraticCurveTo(w * 0.12, -h * 1.25, w * 0.36, -h * 0.3);
    g.stroke();
    g.beginPath();
    g.arc(0, -h * 1.12, w * 0.06, 0, Math.PI * 2);
    g.fill();
    g.fillRect(-w * 0.018, -h * 1.5, w * 0.036, h * 0.32);
    g.fillRect(-w * 0.07, -h * 1.4, w * 0.14, w * 0.035);
  }
  // jewels on the band
  g.fillStyle = GOLD_INK;
  const jewels = kind === 0 ? [0] : [-0.3, 0, 0.3];
  for (const j of jewels) {
    g.beginPath();
    g.ellipse(j * w, -h * 0.13, w * 0.045, h * 0.07, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/** Court face: a crown over a tall serif letter, a flourish and the suit beneath. */
function court(g: CanvasRenderingContext2D, v: number) {
  const ink = INK[v];
  const kind = v - 2;
  crown(g, SIZE / 2, 104, kind === 0 ? 70 : kind === 1 ? 82 : 74, kind, ink);
  g.fillStyle = ink;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.font = '700 104px "Cinzel", serif';
  g.fillText(LABEL[v], SIZE / 2, 192);
  // a gold flourish either side of the suit under the letter
  g.strokeStyle = GOLD_INK;
  g.lineWidth = 3;
  g.lineCap = 'round';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(SIZE / 2 + s * 50, 211);
    g.quadraticCurveTo(SIZE / 2 + s * 32, 202, SIZE / 2 + s * 14, 213);
    g.stroke();
  }
  g.fillStyle = ink;
  drawSuit(g, SUIT[v], SIZE / 2, 214, 18);
}

function faceCanvas(v: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  const g = cv.getContext('2d')!;
  ivory(g);
  frame(g, INK[v]);
  const c = SIZE / 2;
  if (v === 0) {
    const xs = [96, 160];
    const ys = [70, 108, 148, 186];
    pips(g, v, [...xs.flatMap((x) => ys.map((y): [number, number] => [x, y])), [c, c]], 30);
  } else if (v === 1) {
    const xs = [92, 164];
    const ys = [66, 106, 150, 190];
    pips(g, v, [...xs.flatMap((x) => ys.map((y): [number, number] => [x, y])), [c, 88], [c, 168]], 30);
  } else if (v === 5) {
    g.fillStyle = INK[v];
    drawSuit(g, 0, c, c + 2, 124);
    // a small gold diamond on the spade's stem
    g.fillStyle = GOLD_INK;
    g.beginPath();
    g.moveTo(c, c + 30);
    g.lineTo(c + 7, c + 40);
    g.lineTo(c, c + 50);
    g.lineTo(c - 7, c + 40);
    g.closePath();
    g.fill();
  } else court(g, v);
  if (v !== 2 && v !== 3 && v !== 4) indices(g, v);
  else {
    // courts: the rank in two corners only (the motif carries the suit)
    g.fillStyle = INK[v];
    g.font = '700 30px "Cinzel", serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(LABEL[v], 50, 52);
    g.save();
    g.translate(SIZE - 50, SIZE - 52);
    g.rotate(Math.PI);
    g.fillText(LABEL[v], 0, 0);
    g.restore();
  }
  return cv;
}

let faceTex: THREE.CanvasTexture[] | null = null;
let geo: THREE.BufferGeometry | null = null;
let haloTex: THREE.CanvasTexture | null = null;
let shadowTex: THREE.CanvasTexture | null = null;

function radialTex(stops: [number, string][]): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [o, c] of stops) grd.addColorStop(o, c);
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function shared() {
  if (!faceTex) {
    faceTex = LABEL.map((_, v) => {
      const t = new THREE.CanvasTexture(faceCanvas(v));
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      return t;
    });
    geo = new RoundedBoxGeometry(DIE, DIE, DIE, 3, DIE * 0.12);
    haloTex = radialTex([
      [0, 'rgba(255,224,140,.95)'],
      [0.45, 'rgba(255,196,80,.45)'],
      [1, 'rgba(255,190,80,0)'],
    ]);
    shadowTex = radialTex([
      [0, 'rgba(0,0,0,.7)'],
      [0.5, 'rgba(0,0,0,.38)'],
      [1, 'rgba(0,0,0,0)'],
    ]);
  }
  return { faceTex: faceTex!, geo: geo!, haloTex: haloTex!, shadowTex: shadowTex! };
}

/** Releases the textures and geometry shared by every die (when leaving the table). */
export function disposeDiceAssets() {
  faceTex?.forEach((t) => t.dispose());
  geo?.dispose();
  haloTex?.dispose();
  shadowTex?.dispose();
  faceTex = null;
  geo = null;
  haloTex = null;
  shadowTex = null;
}

const Y = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();

/** The cube rotation that puts value v on top, reading upright for the player. */
function baseOrient(v: number): THREE.Quaternion {
  const slot = FACE_SLOT[v];
  for (const r of CUBE_ROTATIONS) {
    if (slotAfter(r, slot) !== 2) continue;
    const up = TEX_UP[slot].clone().applyQuaternion(r);
    if (up.z < -0.9) return r.clone();
  }
  return new THREE.Quaternion();
}
const BASE = LABEL.map((_, v) => baseOrient(v));

/** Orientation that shows value v on top, turned by `yaw` about the vertical. */
export function orientFor(v: number, yaw: number, out = new THREE.Quaternion()): THREE.Quaternion {
  return out.setFromAxisAngle(Y, yaw).multiply(BASE[v]);
}

/** The value showing on top of a die with render orientation q. */
export function valueOnTop(q: THREE.Quaternion): number {
  const s = upSlot(q).slot;
  return FACE_SLOT.indexOf(s);
}

/** Yaw (about the vertical) of a die lying flat with value v on top. */
export function yawOf(v: number, q: THREE.Quaternion): number {
  const up = _v.copy(TEX_UP[FACE_SLOT[v]]).applyQuaternion(q);
  return Math.atan2(-up.x, -up.z);
}

export class Die3D {
  readonly mesh: THREE.Mesh;
  readonly shadow: THREE.Mesh;
  readonly halo: THREE.Mesh;
  private mats: THREE.MeshPhysicalMaterial[];
  private glowK = 0;
  /** Height of the surface it rests on (tray floor or felt). */
  ground = 0;
  value = 0;
  /** Pre-rotation of the face mapping for the current throw (see physics.faceFix). */
  fix = new THREE.Quaternion();

  constructor(parent: THREE.Object3D) {
    const s = shared();
    this.mats = s.faceTex.map(
      (map) =>
        new THREE.MeshPhysicalMaterial({
          map,
          roughness: 0.34,
          clearcoat: 0.6,
          clearcoatRoughness: 0.22,
          emissive: new THREE.Color('#ffc65a'),
          emissiveIntensity: 0,
        }),
    );
    // material array in slot order: slot k shows the value printed there
    this.mesh = new THREE.Mesh(s.geo, FACE_SLOT.map((_, k) => this.mats[FACE_SLOT.indexOf(k)]));
    const shMat = new THREE.MeshBasicMaterial({ map: s.shadowTex, transparent: true, depthWrite: false, opacity: 0.55 });
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(DIE * 2, DIE * 2).rotateX(-Math.PI / 2), shMat);
    this.shadow.renderOrder = 2;
    const hMat = new THREE.MeshBasicMaterial({ map: s.haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(DIE * 3.2, DIE * 3.2).rotateX(-Math.PI / 2), hMat);
    this.halo.renderOrder = 3;
    parent.add(this.mesh, this.shadow, this.halo);
  }

  get pos() {
    return this.mesh.position;
  }

  /** Places the die (render orientation q) and keeps its shadow and halo under it. */
  place(p: THREE.Vector3, q?: THREE.Quaternion) {
    this.mesh.position.copy(p);
    if (q) this.mesh.quaternion.copy(q);
    this.syncShadow();
  }

  syncShadow() {
    const p = this.mesh.position;
    const hgt = Math.max(0, p.y - this.ground - DIE / 2);
    this.shadow.position.set(p.x + hgt * 0.12, this.ground + 0.002, p.z + hgt * 0.06);
    const s = 1 + hgt * 0.8;
    this.shadow.scale.set(s, 1, s);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = this.mesh.visible ? 0.55 * Math.max(0.1, 1 - hgt / 1.2) : 0;
    this.halo.position.set(p.x, this.ground + 0.003, p.z);
  }

  /** Lays the die flat with value v on top (yaw about the vertical). */
  show(v: number, yaw = 0) {
    this.value = v;
    orientFor(v, yaw, this.mesh.quaternion);
  }

  /** Render orientation for a simulated orientation: q_sim × fix. */
  renderQ(simQ: THREE.Quaternion, out = new THREE.Quaternion()) {
    return out.copy(simQ).multiply(this.fix);
  }

  /** Flattens the current orientation exactly (after a move) and reads the top value. */
  settle() {
    flatten(this.mesh.quaternion, this.mesh.quaternion);
    this.value = valueOnTop(this.mesh.quaternion);
  }

  /** Gold glow of a held / winning die (0..1). */
  glow(k: number) {
    this.glowK = k;
    for (const m of this.mats) m.emissiveIntensity = 0.22 * k;
    (this.halo.material as THREE.MeshBasicMaterial).opacity = this.mesh.visible ? 0.85 * k : 0;
  }

  get glowing() {
    return this.glowK;
  }

  set visible(v: boolean) {
    this.mesh.visible = v;
    this.syncShadow();
    this.glow(this.glowK);
  }

  get visible() {
    return this.mesh.visible;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.shadow.removeFromParent();
    this.halo.removeFromParent();
    for (const m of this.mats) m.dispose();
    (this.shadow.material as THREE.Material).dispose();
    (this.halo.material as THREE.Material).dispose();
    this.shadow.geometry.dispose();
    this.halo.geometry.dispose();
  }
}
