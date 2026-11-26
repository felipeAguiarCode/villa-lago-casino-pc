import * as THREE from 'three';
import gsap from 'gsap';

export const CHIP_R = 0.21;
export const CHIP_H = 0.038;

export interface Denom {
  v: number;
  base: string;
  edge: string;
  ink: string;
  label: string;
}

export const DENOMS: Denom[] = [
  { v: 5, base: '#c3162f', edge: '#ffffff', ink: '#8e0e22', label: '5' },
  { v: 25, base: '#178543', edge: '#ffffff', ink: '#0f5a2c', label: '25' },
  { v: 100, base: '#17171d', edge: '#e6c36c', ink: '#17171d', label: '100' },
  { v: 500, base: '#5d2b92', edge: '#f1e4ff', ink: '#4a1f78', label: '500' },
  { v: 1000, base: '#d89c1b', edge: '#3a2405', ink: '#6b4708', label: '1K' },
];

const denomOf = (v: number) => DENOMS.find((d) => d.v === v) ?? DENOMS[0];

/** Top face of a chip (also used as the HUD chip image). */
export function chipFaceCanvas(d: Denom, size = 256): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  const c = size / 2;
  const R = size / 2 - 1;
  g.translate(c, c);
  // body
  const body = g.createRadialGradient(-R * 0.25, -R * 0.3, R * 0.1, 0, 0, R);
  body.addColorStop(0, shade(d.base, 1.25));
  body.addColorStop(1, d.base);
  g.fillStyle = body;
  g.beginPath();
  g.arc(0, 0, R, 0, Math.PI * 2);
  g.fill();
  // edge inserts
  g.fillStyle = d.edge;
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4 + Math.PI / 8;
    g.beginPath();
    g.arc(0, 0, R, a - 0.17, a + 0.17);
    g.arc(0, 0, R * 0.76, a + 0.17, a - 0.17, true);
    g.closePath();
    g.fill();
  }
  // dark ring
  g.strokeStyle = 'rgba(0,0,0,.35)';
  g.lineWidth = size * 0.012;
  g.beginPath();
  g.arc(0, 0, R * 0.74, 0, Math.PI * 2);
  g.stroke();
  // inlay
  const inlay = g.createRadialGradient(0, -R * 0.2, R * 0.05, 0, 0, R * 0.64);
  inlay.addColorStop(0, '#fffdf4');
  inlay.addColorStop(1, '#ebe2c9');
  g.fillStyle = inlay;
  g.beginPath();
  g.arc(0, 0, R * 0.64, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = d.base;
  g.lineWidth = size * 0.014;
  g.setLineDash([size * 0.03, size * 0.022]);
  g.beginPath();
  g.arc(0, 0, R * 0.57, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  // text
  g.fillStyle = d.ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 ${size * (d.label.length >= 3 ? 0.27 : 0.33)}px "Barlow Condensed", sans-serif`;
  g.fillText(d.label, 0, size * 0.02);
  g.font = `700 ${size * 0.07}px "Cinzel", serif`;
  arcText(g, 'VILLA LAGO', R * 0.45, -Math.PI / 2, 0.21);
  arcText(g, 'CASINO', R * 0.45, Math.PI / 2, -0.23);
  return cv;
}

function arcText(g: CanvasRenderingContext2D, text: string, r: number, center: number, step: number) {
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const a = center + (i - (n - 1) / 2) * step;
    g.save();
    g.rotate(a + (step > 0 ? Math.PI / 2 : -Math.PI / 2));
    g.translate(0, step > 0 ? -r : r);
    g.fillText(text[i], 0, 0);
    g.restore();
  }
}

function shade(hex: string, f: number) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return '#' + c.getHexString();
}

function sideCanvas(d: Denom): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 16;
  const g = cv.getContext('2d')!;
  g.fillStyle = d.base;
  g.fillRect(0, 0, 512, 16);
  g.fillStyle = d.edge;
  for (let k = 0; k < 8; k++) {
    const u = ((k + 0.5) / 8) * 512;
    g.fillRect(u - 17, 0, 34, 16);
  }
  g.fillStyle = 'rgba(0,0,0,.25)';
  g.fillRect(0, 0, 512, 1.5);
  g.fillRect(0, 14.5, 512, 1.5);
  return cv;
}

/** Shared geometry/materials per denomination. */
export class ChipSet {
  readonly geo = new THREE.CylinderGeometry(CHIP_R, CHIP_R, CHIP_H, 48, 1);
  private mats = new Map<number, THREE.Material[]>();
  private urls = new Map<number, string>();

  constructor() {
    for (const d of DENOMS) {
      const top = new THREE.CanvasTexture(chipFaceCanvas(d));
      top.colorSpace = THREE.SRGBColorSpace;
      top.anisotropy = 4;
      const side = new THREE.CanvasTexture(sideCanvas(d));
      side.colorSpace = THREE.SRGBColorSpace;
      const sideMat = new THREE.MeshStandardMaterial({ map: side, roughness: 0.42, metalness: 0.05 });
      const topMat = new THREE.MeshStandardMaterial({ map: top, roughness: 0.38, metalness: 0.05 });
      this.mats.set(d.v, [sideMat, topMat, topMat]);
    }
  }

  url(v: number): string {
    let u = this.urls.get(v);
    if (!u) {
      u = chipFaceCanvas(denomOf(v), 160).toDataURL('image/png');
      this.urls.set(v, u);
    }
    return u;
  }

  mesh(v: number): THREE.Mesh {
    const m = new THREE.Mesh(this.geo, this.mats.get(denomOf(v).v)!);
    m.rotation.y = Math.random() * Math.PI * 2;
    return m;
  }

  /** Greedy breakdown into chip values, largest first. */
  breakdown(amount: number): number[] {
    const out: number[] = [];
    let rest = Math.floor(amount + 1e-6);
    for (let i = DENOMS.length - 1; i >= 0; i--) {
      const v = DENOMS[i].v;
      while (rest >= v && out.length < 40) {
        out.push(v);
        rest -= v;
      }
    }
    return out;
  }
}

/** A stack (or a few stacks side by side) of chips on the felt. */
export class ChipPile {
  readonly group = new THREE.Group();
  values: number[] = [];
  private meshes: THREE.Mesh[] = [];

  constructor(
    private chipset: ChipSet,
    parent: THREE.Object3D,
    pos: THREE.Vector3,
  ) {
    this.group.position.copy(pos);
    parent.add(this.group);
  }

  get amount() {
    return this.values.reduce((a, b) => a + b, 0);
  }

  /** Local position of the n-th chip of the pile. */
  slot(n: number): THREE.Vector3 {
    const per = 14;
    const col = Math.floor(n / per);
    const row = n % per;
    const cols = Math.max(1, Math.ceil(this.values.length / per));
    const x = (col - (cols - 1) / 2) * CHIP_R * 2.15;
    return new THREE.Vector3(x + (Math.random() - 0.5) * 0.012, CHIP_H / 2 + 0.004 + row * CHIP_H, (Math.random() - 0.5) * 0.012);
  }

  private layout() {
    this.meshes.forEach((m, i) => m.position.copy(this.slot(i)));
  }

  /** A neat tower of n chips of value v (table decor). */
  tower(v: number, n: number) {
    this.clear();
    for (let i = 0; i < n; i++) this.push(v);
    this.layout();
  }

  /** Replaces the pile with the canonical breakdown of `amount`. */
  set(amount: number) {
    this.clear();
    for (const v of this.chipset.breakdown(amount)) this.push(v);
    this.layout();
  }

  push(v: number): THREE.Mesh {
    const m = this.chipset.mesh(v);
    this.values.push(v);
    this.meshes.push(m);
    this.group.add(m);
    return m;
  }

  /** Global hook: the sound of a chip landing on a stack (set by the app). `n` is the chip's height in the pile. */
  static landSound: ((n: number) => void) | null = null;

  /**
   * Places a chip from a world position onto the pile. It flies on a ballistic arc, tumbling end
   * over end while its spin decays, hits the stack (stacking sound), makes two shrinking hops
   * (restitution), skids into line with the stack and wobbles flat like a settling coin.
   */
  async throwChip(v: number, fromWorld: THREE.Vector3, onLand?: () => void, delay = 0) {
    const m = this.push(v);
    const idx = this.values.length - 1;
    const target = this.slot(idx);
    const from = this.group.worldToLocal(fromWorld.clone());
    m.position.copy(from);
    m.visible = delay === 0;
    const dist = Math.hypot(target.x - from.x, target.z - from.z);
    const apex = 0.16 + Math.min(0.3, dist * 0.07);
    const flight = Math.min(0.46, 0.28 + dist * 0.035);
    const side = Math.random() < 0.5 ? -1 : 1;
    const tumble = side * (0.8 + Math.random() * 0.5);
    const spin0 = m.rotation.y;
    const spin = (Math.random() < 0.5 ? -1 : 1) * (2.4 + Math.random() * 1.8);
    const skid = new THREE.Vector3((Math.random() - 0.5) * 0.05, 0, (Math.random() - 0.5) * 0.05);
    const landAt = target.clone().add(skid);
    const p = { t: 0 };
    await gsap.to(p, {
      t: 1,
      duration: flight,
      delay,
      ease: 'none',
      onStart: () => (m.visible = true),
      onUpdate: () => {
        const t = p.t;
        // air drag slows the chip a little on its way down
        const s = t * (1.3 - 0.3 * t);
        m.position.lerpVectors(from, landAt, s);
        m.position.y = from.y + (target.y - from.y) * t + 4 * apex * t * (1 - t);
        m.rotation.x = tumble * Math.pow(1 - t, 1.4);
        m.rotation.y = spin0 + spin * (1 - (1 - t) * (1 - t));
      },
    });
    ChipPile.landSound?.(idx);
    onLand?.();
    const q = { t: 0 };
    const A0 = 0.11 + Math.random() * 0.05;
    const phase = Math.random() * Math.PI * 2;
    await gsap.to(q, {
      t: 1,
      duration: 0.46,
      ease: 'none',
      onUpdate: () => {
        const u = q.t;
        // two hops that lose most of their energy
        const hop = u < 0.26 ? 0.024 * Math.sin((Math.PI * u) / 0.26) : u < 0.4 ? 0.006 * Math.sin((Math.PI * (u - 0.26)) / 0.14) : 0;
        m.position.set(target.x + skid.x * Math.exp(-7 * u), target.y + hop, target.z + skid.z * Math.exp(-7 * u));
        // coin-like wobble: the tilt precesses faster as it dies out
        const amp = A0 * Math.exp(-5.2 * u);
        const ang = phase + Math.PI * 2 * (2 * u + 2.2 * u * u);
        m.rotation.x = amp * Math.cos(ang);
        m.rotation.z = amp * Math.sin(ang);
        const squash = 0.1 * Math.exp(-16 * u) * Math.sin(Math.PI * Math.min(1, u * 6));
        m.scale.set(1 + squash * 0.4, 1 - squash, 1 + squash * 0.4);
      },
    });
    m.position.copy(target);
    m.rotation.x = 0;
    m.rotation.z = 0;
    m.scale.set(1, 1, 1);
    if (this.values.length > 12) this.set(this.amount);
  }

  /** Places a whole amount chip by chip (rebet, double): every chip is thrown and clacks on the stack. */
  async dropIn(amount: number, fromWorld: THREE.Vector3, gap = 0.07) {
    const vals = this.chipset.breakdown(amount);
    const thrown = vals.slice(0, 12);
    const jobs = thrown.map((v, i) => this.throwChip(v, fromWorld, undefined, i * gap));
    await Promise.all(jobs);
    if (vals.length > thrown.length) {
      for (const v of vals.slice(thrown.length)) this.push(v);
      this.set(this.amount);
      ChipPile.landSound?.(this.values.length);
    }
  }

  clear() {
    for (const m of this.meshes) this.group.remove(m);
    this.meshes = [];
    this.values = [];
  }

  dispose() {
    this.clear();
    this.group.removeFromParent();
  }
}
