import gsap from 'gsap';
import * as THREE from 'three';
import { CARD_H, CARD_W, REST_Y, type Card3D } from '../../table/cardMesh';
import { smileArc, smileText } from '../../table/prints';
import { FELTS, type FeltKey } from '../../table/table';
import type { GameCtx } from '../types';

/**
 * Small pieces shared by the High & Low, Red or Black and Pick a Number tables: a deck lying on the
 * felt, the "lift, turn, land" reveal, the inverse of screenToTable and canvas helpers for prints.
 */

/** The table's own felt once it is registered in FELTS; until then a close existing colour. */
export function feltKey(id: string, fallback: FeltKey): FeltKey {
  return (id in FELTS ? id : fallback) as FeltKey;
}

/**
 * Layout-frame position (u, v) of a table point: the inverse of stage.screenToTable, so betting
 * places can be laid out in table units (z depends only on v; x is linear in u at a fixed v).
 */
export function uvAt(g: GameCtx, x: number, z: number): { u: number; v: number } {
  const st = g.stage;
  let lo = -0.5;
  let hi = 1.5;
  for (let i = 0; i < 44; i++) {
    const mid = (lo + hi) / 2;
    if (st.screenToTable(0.5, mid).z < z) lo = mid;
    else hi = mid;
  }
  const v = (lo + hi) / 2;
  const edge = st.screenToTable(1, v).x;
  return { u: 0.5 + x / (2 * edge), v };
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const smooth = (a: number, b: number, t: number) => {
  const x = clamp((t - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const inOut = gsap.parseEase('power2.inOut');

/** Thickness of one card in a stack. */
export const CARD_T = 0.0026;

let edgeCanvas: HTMLCanvasElement | null = null;
function edgeImage() {
  if (edgeCanvas) return edgeCanvas;
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 64;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#efe8d6';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(120,100,70,.35)';
  for (let y = 0; y < 64; y += 3) g.fillRect(0, y, 64, 1);
  edgeCanvas = cv;
  return cv;
}

let shadowCanvas: HTMLCanvasElement | null = null;
function shadowImage() {
  if (shadowCanvas) return shadowCanvas;
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 160;
  const g = cv.getContext('2d')!;
  g.shadowColor = 'rgba(0,0,0,1)';
  g.shadowBlur = 16;
  g.shadowOffsetX = 1000;
  g.fillStyle = '#000';
  g.beginPath();
  g.roundRect(-1000 + 128 * 0.12, 160 * 0.1, 128 * 0.76, 160 * 0.8, 8);
  g.fill();
  shadowCanvas = cv;
  return cv;
}

/**
 * A deck lying face down on the felt, drawn as two half-stacks (so it can be riffled). Its height
 * follows the number of cards left.
 */
export class DeckStack {
  readonly group = new THREE.Group();
  private lower: THREE.Mesh;
  private upper: THREE.Mesh;
  private shadow: THREE.Mesh;
  private geo = new THREE.BoxGeometry(CARD_W, 1, CARD_H);
  private mats: THREE.Material[];
  private texs: THREE.Texture[] = [];
  count = 0;

  constructor(parent: THREE.Object3D, back: THREE.Texture, pos: THREE.Vector3, yaw = 0) {
    const edge = new THREE.CanvasTexture(edgeImage());
    edge.colorSpace = THREE.SRGBColorSpace;
    const sh = new THREE.CanvasTexture(shadowImage());
    this.texs.push(edge, sh);
    const side = new THREE.MeshStandardMaterial({ map: edge, roughness: 0.8 });
    const top = new THREE.MeshStandardMaterial({ map: back, roughness: 0.4 });
    const shadowMat = new THREE.MeshBasicMaterial({ map: sh, transparent: true, depthWrite: false, opacity: 0.5, color: 0x000000 });
    this.mats = [side, top, shadowMat];
    const faces = [side, side, top, top, side, side];
    this.lower = new THREE.Mesh(this.geo, faces);
    this.upper = new THREE.Mesh(this.geo, faces);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W * 1.32, CARD_H * 1.26).rotateX(-Math.PI / 2), shadowMat);
    this.shadow.position.set(0.02, 0.0025, 0.03);
    this.shadow.renderOrder = 1;
    this.group.add(this.shadow, this.lower, this.upper);
    this.group.position.copy(pos);
    this.group.rotation.y = yaw;
    parent.add(this.group);
  }

  /** Swaps the back printed on the top card (house back or the table's own). */
  setBack(tex: THREE.Texture) {
    const m = this.mats[1] as THREE.MeshStandardMaterial;
    m.map = tex;
    m.needsUpdate = true;
  }

  setCount(n: number) {
    this.count = Math.max(0, n);
    const a = Math.ceil(this.count / 2);
    const b = this.count - a;
    this.lower.visible = a > 0;
    this.upper.visible = b > 0;
    this.shadow.visible = this.count > 0;
    this.lower.scale.y = Math.max(1e-4, a * CARD_T);
    this.upper.scale.y = Math.max(1e-4, b * CARD_T);
    this.lower.position.set(0, (a * CARD_T) / 2, 0);
    this.upper.position.set(0, a * CARD_T + (b * CARD_T) / 2, 0);
    this.lower.rotation.set(0, 0, 0);
    this.upper.rotation.set(0, 0, 0);
  }

  get height() {
    return this.count * CARD_T;
  }

  /** Where a card lying on top of the deck rests (world). */
  top(extra = 0): THREE.Vector3 {
    const p = this.group.position;
    return new THREE.Vector3(p.x, this.height + REST_Y + extra, p.z);
  }

  /** The deck comes out of the deck box and lands at `to`. */
  async arrive(from: THREE.Vector3, to: THREE.Vector3, dur = 0.6) {
    const g = this.group;
    g.visible = true;
    g.position.copy(from);
    g.scale.setScalar(0.4);
    const p = { t: 0 };
    const start = from.clone();
    await gsap.to(p, {
      t: 1,
      duration: dur,
      ease: 'power3.out',
      onUpdate: () => {
        g.position.lerpVectors(start, to, p.t);
        g.position.y = lerp(start.y, to.y, p.t) + Math.sin(Math.PI * p.t) * 0.25;
        g.scale.setScalar(lerp(0.4, 1, smooth(0, 0.6, p.t)));
      },
    });
    g.position.copy(to);
    g.scale.setScalar(1);
  }

  /** A quick riffle: the deck splits in two halves, they tilt and riffle back together. */
  async riffle(onRiffle?: () => void, dur = 0.8): Promise<void> {
    const L = this.lower;
    const U = this.upper;
    const a = L.scale.y;
    const b = U.scale.y;
    const s = { split: 0, tilt: 0 };
    const apply = () => {
      const off = 0.4 * s.split;
      const tilt = 0.2 * s.tilt;
      const lift = Math.sin(tilt) * (CARD_W / 2);
      L.position.set(-off, a / 2 + lift, 0);
      L.rotation.z = tilt;
      U.position.set(off, lerp(a + b / 2, b / 2, s.split) + lift, 0);
      U.rotation.z = -tilt;
    };
    const k = dur / 0.8;
    const tl = gsap.timeline();
    tl.to(s, { split: 1, duration: 0.24 * k, ease: 'power2.out', onUpdate: apply }, 0)
      .to(s, { tilt: 1, duration: 0.16 * k, ease: 'sine.out', onUpdate: apply }, 0.1 * k)
      .call(() => onRiffle?.(), [], 0.28 * k)
      .to(s, { split: 0, duration: 0.36 * k, ease: 'power2.inOut', onUpdate: apply }, 0.3 * k)
      .to(s, { tilt: 0, duration: 0.3 * k, ease: 'power2.in', onUpdate: apply }, 0.36 * k);
    await tl;
    this.setCount(this.count);
  }

  dispose() {
    this.group.removeFromParent();
    this.geo.dispose();
    (this.shadow.geometry as THREE.BufferGeometry).dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.texs) t.dispose();
  }
}

/**
 * The reveal: a card is lifted off the deck (face down), turned over in the air with a little
 * sway and laid face up at `to`, landing with a small bounce.
 */
export function liftTurnLand(
  c: Card3D,
  from: THREE.Vector3,
  to: THREE.Vector3,
  o: { dur?: number; lift?: number; sway?: number; onTurn?: () => void; onLand?: () => void } = {},
): Promise<void> {
  const obj = c.obj;
  obj.visible = true;
  obj.position.copy(from);
  obj.rotation.set(0, 0, Math.PI);
  const start = from.clone();
  const end = to.clone();
  const lift = o.lift ?? 0.5;
  const sway = o.sway ?? 0.22;
  const LAND = 0.8;
  let turned = false;
  let landed = false;
  const p = { t: 0 };
  return new Promise((res) => {
    gsap.to(p, {
      t: 1,
      duration: o.dur ?? 1,
      ease: 'none',
      onUpdate: () => {
        const t = p.t;
        if (t < LAND) {
          const u = t / LAND;
          const e = inOut(u);
          obj.position.lerpVectors(start, end, e);
          // up quickly, hangs a moment while it turns, down with weight
          obj.position.y = lerp(start.y, end.y, e) + lift * Math.pow(Math.sin(Math.PI * u), 0.7);
          const f = smooth(0.16, 0.74, u);
          obj.rotation.z = Math.PI * (1 - f);
          obj.rotation.y = sway * Math.sin(2 * Math.PI * u) * (1 - u);
          obj.rotation.x = -0.12 * Math.sin(Math.PI * u);
          c.bend.x = Math.sin(Math.PI * f) * 0.75;
          if (!turned && f > 0.5) {
            turned = true;
            o.onTurn?.();
          }
        } else {
          const u = (t - LAND) / (1 - LAND);
          if (!landed) {
            landed = true;
            o.onLand?.();
          }
          obj.position.copy(end);
          obj.position.y = end.y + (u < 0.5 ? 0.02 * Math.sin((Math.PI * u) / 0.5) : 0);
          obj.rotation.set(0, 0, 0);
          c.bend.x = -0.12 * Math.exp(-5 * u) * Math.cos(9 * u);
        }
      },
      onComplete: () => {
        obj.position.copy(end);
        obj.rotation.set(0, 0, 0);
        c.bend.set(0, 0);
        if (!landed) o.onLand?.();
        res();
      },
    });
  });
}

/** A card goes back onto a deck face down (it is then removed: the stack holds it again). */
export function backToDeck(c: Card3D, to: THREE.Vector3, dur = 0.55): Promise<void> {
  const obj = c.obj;
  const start = obj.position.clone();
  const z0 = obj.rotation.z;
  const yaw0 = obj.rotation.y;
  const p = { t: 0 };
  return new Promise((res) => {
    gsap.to(p, {
      t: 1,
      duration: dur,
      ease: 'power2.inOut',
      onUpdate: () => {
        const t = p.t;
        obj.position.lerpVectors(start, to, t);
        obj.position.y = lerp(start.y, to.y, t) + Math.sin(Math.PI * t) * 0.35;
        obj.rotation.z = lerp(z0, Math.PI, smooth(0.05, 0.75, t));
        obj.rotation.y = lerp(yaw0, 0, t);
        c.bend.x = Math.sin(Math.PI * smooth(0.05, 0.75, t)) * 0.6;
      },
      onComplete: () => {
        obj.position.copy(to);
        obj.rotation.set(0, 0, Math.PI);
        c.bend.set(0, 0);
        res();
      },
    });
  });
}

// ---------------------------------------------------------------- canvas helpers

/** Pixels per table unit of the printed decals. */
export const PPU = 300;

export function unitCanvas(wUnits: number, hUnits: number) {
  const cv = document.createElement('canvas');
  cv.width = Math.round(wUnits * PPU);
  cv.height = Math.round(hUnits * PPU);
  return { cv, g: cv.getContext('2d')!, W: cv.width, H: cv.height };
}

/** Text that shrinks to fit a width. */
export function fitText(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, font: (px: number) => string, px: number, spacing = 0) {
  let size = px;
  g.font = font(size);
  const w = () => g.measureText(text).width + spacing * Math.max(0, text.length - 1);
  if (w() > maxW) {
    size = Math.floor((size * maxW) / w());
    g.font = font(size);
  }
  if (!spacing) {
    g.fillText(text, x, y);
    return;
  }
  // letter-spaced, centred on x
  const total = w();
  let cx = x - total / 2;
  const align = g.textAlign;
  g.textAlign = 'left';
  for (const ch of text) {
    g.fillText(ch, cx, y);
    cx += g.measureText(ch).width + spacing;
  }
  g.textAlign = align;
}

/** Gold double frame (rounded), the printed border of a betting box. */
export function goldFrame(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill?: string | CanvasGradient) {
  g.save();
  if (fill) {
    g.fillStyle = fill;
    g.beginPath();
    g.roundRect(x, y, w, h, r);
    g.fill();
  }
  g.strokeStyle = '#d8b660';
  g.globalAlpha = 0.9;
  g.lineWidth = 7;
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.stroke();
  g.globalAlpha = 0.7;
  g.lineWidth = 2.5;
  g.beginPath();
  g.roundRect(x + 13, y + 13, w - 26, h - 26, Math.max(2, r - 10));
  g.stroke();
  g.restore();
}

export interface FitLine {
  text: string;
  y: number;
  px: number;
  font: (px: number) => string;
  color: string;
  spacing?: number;
  R?: number;
}

/**
 * Like prints.tablePrint (smile-curved lines on a 1024 px wide canvas, optional gold arcs), but
 * each line shrinks to fit the width, so longer translations stay on the felt.
 */
export function fitPrint(lines: FitLine[], h: number, arcs: { y: number; R: number; half: number }[] = [], maxW = 960): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = h;
  const g = cv.getContext('2d')!;
  for (const a of arcs) smileArc(g, 512, a.y, a.R, a.half, '#d8b660', 4);
  for (const l of lines) {
    const sp = l.spacing ?? 2;
    let px = l.px;
    const width = () => {
      g.font = l.font(px);
      return [...l.text].reduce((s, ch) => s + g.measureText(ch).width + sp, 0) - sp;
    };
    let w = width();
    if (w > maxW) {
      px = Math.floor((px * maxW) / w);
      w = width();
    }
    // the smile lifts the ends of the line: flatten it so the letters stay on the canvas
    const room = Math.max(4, l.y - px * 0.8 - 4);
    const R = Math.max(l.R ?? 2400, (w * w) / 8 / room);
    smileText(g, l.text, 512, l.y, R, l.font(px), l.color, sp);
  }
  return cv;
}
