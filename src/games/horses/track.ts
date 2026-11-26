import * as THREE from 'three';
import { HORSES } from './rules';

/**
 * The race track board (modelled here, no downloads): an oval of five banked lanes on a raised
 * board with white lane lines, an outer and an inner white rail, a checkered start/finish line
 * with the winning post, a starting gate, low-poly trees and bushes, a small grandstand and flags
 * in the stable colours. Everything is in table units around the centre of the oval; the horses
 * run anticlockwise as seen from above (left to right along the front straight).
 */

export const TR = {
  /** Length of the straights. */
  L: 5.8,
  /** Inner rail radius of the turns (and half the width of the infield). */
  rIn: 1.1,
  laneW: 0.21,
  lanes: 5,
  /** Height of the board under the track. */
  base: 0.035,
  /** Extra height of the outer edge at the middle of the turns (banking). */
  bank: 0.2,
  /** Start/finish line: x on the front straight. */
  lineX: 2.2,
};

export const R_OUT = TR.rIn + TR.lanes * TR.laneW;
/** The middle lane: progress along the lap is measured on it (all lanes line up across the track). */
export const R_REF = TR.rIn + (TR.lanes / 2) * TR.laneW;
export const LAP = 2 * TR.L + 2 * Math.PI * R_REF;
export const laneR = (i: number) => TR.rIn + (i + 0.5) * TR.laneW;
/** Where the horses stand in the starting gate (distance before the line). */
export const GATE_S = -0.4;

export interface TrackFrame {
  x: number;
  z: number;
  /** Direction of travel. */
  dx: number;
  dz: number;
  /** Outward (away from the infield). */
  ox: number;
  oz: number;
  /** Banking 0..1. */
  bank: number;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const bankOf = (th: number) => smooth(0, 0.65, th) * smooth(Math.PI, Math.PI - 0.65, th);

const SEG_A = TR.L / 2 - TR.lineX;
const TURN = Math.PI * R_REF;

/** Point of the lap at distance `s` (from the line) on the circle of radius `r` (lane). */
export function trackAt(s: number, r: number, f: TrackFrame = { x: 0, z: 0, dx: 1, dz: 0, ox: 0, oz: 1, bank: 0 }): TrackFrame {
  s = ((s % LAP) + LAP) % LAP;
  const h = TR.L / 2;
  if (s < SEG_A) return set(f, TR.lineX + s, r, 1, 0, 0, 1, 0);
  s -= SEG_A;
  if (s < TURN) {
    const th = s / R_REF;
    const sn = Math.sin(th);
    const cs = Math.cos(th);
    return set(f, h + r * sn, r * cs, cs, -sn, sn, cs, bankOf(th));
  }
  s -= TURN;
  if (s < TR.L) return set(f, h - s, -r, -1, 0, 0, -1, 0);
  s -= TR.L;
  if (s < TURN) {
    const th = s / R_REF;
    const sn = Math.sin(th);
    const cs = Math.cos(th);
    return set(f, -h - r * sn, -r * cs, -cs, sn, -sn, -cs, bankOf(th));
  }
  s -= TURN;
  return set(f, -h + s, r, 1, 0, 0, 1, 0);
}

function set(f: TrackFrame, x: number, z: number, dx: number, dz: number, ox: number, oz: number, bank: number) {
  f.x = x;
  f.z = z;
  f.dx = dx;
  f.dz = dz;
  f.ox = ox;
  f.oz = oz;
  f.bank = bank;
  return f;
}

/** Height of the track surface at radius r of a frame. */
export const surfaceY = (f: TrackFrame, r: number) => TR.base + TR.bank * f.bank * Math.min(1, Math.max(0, (r - TR.rIn) / (R_OUT - TR.rIn)));

/** Surface normal of the banked track at a frame (leans toward the infield on the turns). */
export function surfaceNormal(f: TrackFrame, out = new THREE.Vector3()) {
  const k = (TR.bank * f.bank) / (R_OUT - TR.rIn);
  return out.set(-k * f.ox, 1, -k * f.oz).normalize();
}

// ---------------------------------------------------------------- textures
function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function dirtTexture() {
  const t = canvas(256, 256, (g) => {
    g.fillStyle = '#b5875a';
    g.fillRect(0, 0, 256, 256);
    // raked dirt: fine speckles and faint grooves along the lanes
    for (let i = 0; i < 2600; i++) {
      const v = Math.random();
      g.fillStyle = v < 0.5 ? `rgba(90,58,32,${0.12 + Math.random() * 0.2})` : `rgba(235,205,160,${0.1 + Math.random() * 0.2})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    for (let x = 0; x < 256; x += 6) {
      g.fillStyle = 'rgba(80,50,25,.06)';
      g.fillRect(x + Math.random() * 2, 0, 1, 256);
    }
    // lane lines (5 lanes across the texture's width), heavier at the rails
    g.fillStyle = 'rgba(255,255,255,.92)';
    for (let k = 1; k < 5; k++) g.fillRect((k / 5) * 256 - 1.5, 0, 3, 256);
    g.fillRect(0, 0, 4, 256);
    g.fillRect(252, 0, 4, 256);
  });
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

function checkerTexture() {
  const t = canvas(32, 160, (g) => {
    for (let y = 0; y < 10; y++)
      for (let x = 0; x < 2; x++) {
        g.fillStyle = (x + y) % 2 ? '#111' : '#f5f5f0';
        g.fillRect(x * 16, y * 16, 16, 16);
      }
  });
  t.magFilter = THREE.NearestFilter;
  return t;
}

export function blobTexture() {
  return canvas(128, 64, (g) => {
    const grd = g.createRadialGradient(64, 32, 0, 64, 32, 32);
    grd.addColorStop(0, 'rgba(0,0,0,.55)');
    grd.addColorStop(0.6, 'rgba(0,0,0,.25)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.setTransform(2, 0, 0, 1, -64, 0);
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 64);
  });
}

// ---------------------------------------------------------------- the board
export class Track {
  readonly group = new THREE.Group();
  readonly gate = new THREE.Group();
  private doors: THREE.Group[] = [];
  private flags: { mesh: THREE.Mesh; base: Float32Array; phase: number }[] = [];
  private disposables: { dispose(): void }[] = [];
  private gateMats: THREE.MeshStandardMaterial[] = [];

  constructor() {
    this.buildSurface();
    this.buildRails();
    this.buildFinish();
    this.buildGate();
    this.buildScenery();
    this.group.add(this.gate);
  }

  private keep<T extends { dispose(): void }>(x: T): T {
    this.disposables.push(x);
    return x;
  }

  private mat(color: string, o: THREE.MeshStandardMaterialParameters = {}) {
    return this.keep(new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o }));
  }

  private buildSurface() {
    const NS = 520;
    const NR = 10;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const f: TrackFrame = trackAt(0, 0);
    for (let i = 0; i <= NS; i++) {
      const s = (i / NS) * LAP;
      for (let j = 0; j <= NR; j++) {
        const r = TR.rIn + (j / NR) * (R_OUT - TR.rIn);
        trackAt(s, r, f);
        pos.push(f.x, surfaceY(f, r), f.z);
        uv.push(j / NR, s / 0.9);
      }
    }
    const row = NR + 1;
    for (let i = 0; i < NS; i++)
      for (let j = 0; j < NR; j++) {
        const a = i * row + j;
        const b = a + 1;
        const c = a + row;
        const d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    const geo = this.keep(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const tex = this.keep(dirtTexture());
    const surf = new THREE.Mesh(geo, this.mat('#ffffff', { map: tex, roughness: 0.95 }));
    this.group.add(surf);
    // the board's edges: wooden skirts down to the felt
    const wood = this.mat('#5b3920', { roughness: 0.7 });
    for (const [r, off] of [
      [R_OUT, 0.035],
      [TR.rIn, -0.035],
    ] as const) {
      const p: number[] = [];
      const ix: number[] = [];
      for (let i = 0; i <= NS; i++) {
        trackAt((i / NS) * LAP, r, f);
        const y = surfaceY(f, r);
        const x2 = f.x + f.ox * off;
        const z2 = f.z + f.oz * off;
        // top edge, outer lip, and down to the felt
        p.push(f.x, y, f.z, x2, y, z2, x2, 0, z2);
      }
      for (let i = 0; i < NS; i++) {
        const a = i * 3;
        const b = a + 3;
        ix.push(a, a + 1, b, a + 1, b + 1, b, a + 1, a + 2, b + 1, a + 2, b + 2, b + 1);
      }
      const g = this.keep(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      g.setIndex(ix);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, wood);
      (m.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      this.group.add(m);
    }
  }

  private railCurve(r: number, h: number) {
    const pts: THREE.Vector3[] = [];
    const f = trackAt(0, r);
    const n = 260;
    for (let i = 0; i < n; i++) {
      trackAt((i / n) * LAP, r, f);
      pts.push(new THREE.Vector3(f.x, surfaceY(f, r) + h, f.z));
    }
    return new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  }

  private buildRails() {
    const white = this.mat('#f7f4ec', { roughness: 0.35, emissive: new THREE.Color('#2a2a26') });
    for (const [r, h, step] of [
      [R_OUT + 0.012, 0.095, 0.3],
      [TR.rIn - 0.012, 0.075, 0.3],
    ] as const) {
      const curve = this.railCurve(r, h);
      const tube = new THREE.Mesh(this.keep(new THREE.TubeGeometry(curve, 720, 0.012, 6, true)), white);
      this.group.add(tube);
      const count = Math.floor(LAP / step);
      const postGeo = this.keep(new THREE.CylinderGeometry(0.009, 0.009, h, 6));
      postGeo.translate(0, h / 2, 0);
      const posts = this.keep(new THREE.InstancedMesh(postGeo, white, count));
      const m = new THREE.Matrix4();
      const f = trackAt(0, r);
      for (let i = 0; i < count; i++) {
        trackAt((i / count) * LAP, r, f);
        m.makeTranslation(f.x, surfaceY(f, r), f.z);
        posts.setMatrixAt(i, m);
      }
      this.group.add(posts);
    }
  }

  private buildFinish() {
    const tex = this.keep(checkerTexture());
    const w = R_OUT - TR.rIn;
    const line = new THREE.Mesh(this.keep(new THREE.PlaneGeometry(0.1, w).rotateX(-Math.PI / 2)), this.mat('#ffffff', { map: tex, roughness: 0.8 }));
    line.position.set(TR.lineX, TR.base + 0.003, TR.rIn + w / 2);
    this.group.add(line);
    // the winning post on the inside rail and its twin on the outside
    const white = this.mat('#f7f4ec', { roughness: 0.4 });
    const red = this.mat('#c8202a', { roughness: 0.45 });
    const poleGeo = this.keep(new THREE.CylinderGeometry(0.012, 0.014, 0.52, 8));
    poleGeo.translate(0, 0.26, 0);
    const discGeo = this.keep(new THREE.CylinderGeometry(0.075, 0.075, 0.014, 28));
    discGeo.rotateZ(Math.PI / 2);
    const ringGeo = this.keep(new THREE.CylinderGeometry(0.05, 0.05, 0.018, 28));
    ringGeo.rotateZ(Math.PI / 2);
    for (const z of [TR.rIn - 0.07, R_OUT + 0.07]) {
      const pole = new THREE.Mesh(poleGeo, white);
      pole.position.set(TR.lineX, TR.base, z);
      const disc = new THREE.Mesh(discGeo, red);
      disc.position.set(TR.lineX, TR.base + 0.52, z);
      const ring = new THREE.Mesh(ringGeo, white);
      ring.position.copy(disc.position);
      this.group.add(pole, disc, ring);
    }
  }

  private buildGate() {
    const green = this.mat('#1f6e46', { roughness: 0.5, transparent: true });
    const white = this.mat('#f4f2ea', { roughness: 0.4, transparent: true });
    const gold = this.mat('#d9b45c', { roughness: 0.3, metalness: 1, transparent: true });
    this.gateMats.push(green, white, gold);
    const x0 = TR.lineX + GATE_S;
    const half = 0.33;
    // an open frame (no roof): the horses stay in view while the bets go down
    const H = 0.46;
    const span = R_OUT - TR.rIn;
    const wall = this.keep(new THREE.BoxGeometry(half * 2, 0.22, 0.014));
    const post = this.keep(new THREE.BoxGeometry(0.03, H, 0.03));
    const beam = this.keep(new THREE.BoxGeometry(0.035, 0.035, span + 0.06));
    for (let k = 0; k <= TR.lanes; k++) {
      const z = TR.rIn + k * TR.laneW;
      const w = new THREE.Mesh(wall, green);
      w.position.set(x0, TR.base + 0.13, z);
      this.gate.add(w);
      for (const dx of [-half, half]) {
        const p = new THREE.Mesh(post, white);
        p.position.set(x0 + dx, TR.base + H / 2, z);
        this.gate.add(p);
      }
    }
    for (const dx of [-half, half]) {
      const b = new THREE.Mesh(beam, white);
      b.position.set(x0 + dx, TR.base + H, TR.rIn + span / 2);
      this.gate.add(b);
    }
    // a green sign board along the front beam, trimmed in gold
    const sign = new THREE.Mesh(this.keep(new THREE.BoxGeometry(0.014, 0.07, span + 0.06)), green);
    sign.position.set(x0 + half + 0.012, TR.base + H - 0.02, TR.rIn + span / 2);
    const trim = new THREE.Mesh(this.keep(new THREE.BoxGeometry(0.016, 0.012, span + 0.08)), gold);
    trim.position.set(x0 + half + 0.014, TR.base + H + 0.02, TR.rIn + span / 2);
    this.gate.add(sign, trim);
    // the front doors, hinged on the stall walls
    const door = this.keep(new THREE.BoxGeometry(0.012, 0.17, TR.laneW - 0.024));
    door.translate(0, 0.085 + 0.03, (TR.laneW - 0.024) / 2);
    const bar = this.keep(new THREE.BoxGeometry(0.016, 0.022, TR.laneW - 0.024));
    bar.translate(0, 0.16, (TR.laneW - 0.024) / 2);
    for (let k = 0; k < TR.lanes; k++) {
      const pivot = new THREE.Group();
      pivot.position.set(x0 + half, TR.base, TR.rIn + k * TR.laneW + 0.012);
      pivot.add(new THREE.Mesh(door, white), new THREE.Mesh(bar, green));
      this.doors.push(pivot);
      this.gate.add(pivot);
    }
  }

  /** Swings the gate's doors (0 closed .. 1 open). */
  setDoors(open: number) {
    for (const d of this.doors) d.rotation.y = 1.45 * open;
  }

  /** Lifts the gate off the track (0 down .. 1 gone). */
  setGateAway(k: number) {
    this.gate.position.y = 1.2 * k * k;
    this.gate.visible = k < 0.999;
    for (const m of this.gateMats) m.opacity = 1 - k;
  }

  private buildScenery() {
    const leaf = [this.mat('#2f7a35', { flatShading: true, roughness: 0.8 }), this.mat('#3f8f3a', { flatShading: true, roughness: 0.8 }), this.mat('#25632c', { flatShading: true, roughness: 0.8 })];
    const trunk = this.mat('#6b4428', { roughness: 0.9 });
    const cone = this.keep(new THREE.ConeGeometry(0.2, 0.5, 7));
    const cone2 = this.keep(new THREE.ConeGeometry(0.15, 0.36, 7));
    const ball = this.keep(new THREE.IcosahedronGeometry(0.2, 0));
    const stem = this.keep(new THREE.CylinderGeometry(0.03, 0.04, 0.18, 6));
    const bush = this.keep(new THREE.IcosahedronGeometry(0.11, 0));
    const h = TR.L / 2;
    const pine = (x: number, z: number, s: number, k: number) => {
      const g = new THREE.Group();
      const t = new THREE.Mesh(stem, trunk);
      t.position.y = 0.09;
      const a = new THREE.Mesh(cone, leaf[k % 3]);
      a.position.y = 0.38;
      const b = new THREE.Mesh(cone2, leaf[(k + 1) % 3]);
      b.position.y = 0.6;
      g.add(t, a, b);
      g.position.set(x, 0, z);
      g.scale.setScalar(s);
      g.rotation.y = k * 1.3;
      this.group.add(g);
    };
    const round = (x: number, z: number, s: number, k: number) => {
      const g = new THREE.Group();
      const t = new THREE.Mesh(stem, trunk);
      t.position.y = 0.09;
      const a = new THREE.Mesh(ball, leaf[k % 3]);
      a.position.y = 0.33;
      a.scale.set(1, 0.9, 1);
      const b = new THREE.Mesh(ball, leaf[(k + 2) % 3]);
      b.position.set(0.09, 0.27, 0.06);
      b.scale.setScalar(0.6);
      g.add(t, a, b);
      g.position.set(x, 0, z);
      g.scale.setScalar(s);
      g.rotation.y = k * 0.9;
      this.group.add(g);
    };
    const shrub = (x: number, z: number, k: number) => {
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(bush, leaf[(k + i) % 3]);
        m.position.set(x + (i - 1) * 0.12, 0.08, z + (i % 2) * 0.06);
        m.scale.setScalar(0.8 + 0.25 * ((k + i) % 3));
        m.rotation.y = k + i;
        this.group.add(m);
      }
    };
    const ex = h + R_OUT;
    // trees around the turns, bushes along the back
    pine(ex + 0.42, -0.9, 1.05, 0);
    round(ex + 0.5, 0.2, 1.0, 1);
    pine(ex + 0.3, 1.25, 0.85, 2);
    round(-ex - 0.48, -0.75, 1.05, 3);
    pine(-ex - 0.4, 0.45, 1.0, 4);
    round(-ex - 0.28, 1.4, 0.85, 5);
    pine(h + 1.7, -R_OUT - 0.25, 0.9, 6);
    round(-h - 1.5, -R_OUT - 0.15, 0.95, 7);
    shrub(-0.95, -R_OUT - 0.34, 1);
    shrub(0.9, -R_OUT - 0.4, 2);
    shrub(ex + 0.25, 2.0, 0);
    shrub(-ex - 0.2, 2.05, 2);
    // the dealer's chips fly in over the middle of the back straight: the stand and the flags
    // keep to the sides
    this.buildStand(-2.65, -R_OUT - 0.62);
    this.buildFlags(2.35, -R_OUT - 0.3);
  }

  /** A small covered grandstand with a crowd, facing the back straight. */
  private buildStand(cx: number, cz: number) {
    const W = 2.4;
    const D = 0.62;
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    const concrete = this.mat('#d8d0c0', { roughness: 0.85 });
    const seat = this.mat('#7b1f2b', { roughness: 0.6 });
    const white = this.mat('#f4f1e8', { roughness: 0.5 });
    const stripeTex = this.keep(
      canvas(256, 32, (c) => {
        for (let i = 0; i < 16; i++) {
          c.fillStyle = i % 2 ? '#f4efe2' : '#1f6e46';
          c.fillRect(i * 16, 0, 16, 32);
        }
        c.fillStyle = '#d8b660';
        c.fillRect(0, 26, 256, 6);
      }),
    );
    const tier = this.keep(new THREE.BoxGeometry(W, 0.08, D / 3));
    for (let k = 0; k < 3; k++) {
      // tiers rise toward the back (the stand faces the track, +z)
      const t = new THREE.Mesh(tier, concrete);
      t.scale.y = 1 + k;
      t.position.set(0, (0.08 * (1 + k)) / 2, D / 2 - D / 6 - k * (D / 3));
      g.add(t);
      const bench = new THREE.Mesh(this.keep(new THREE.BoxGeometry(W - 0.1, 0.025, 0.05)), seat);
      bench.position.set(0, 0.08 * (1 + k) + 0.012, t.position.z - 0.03);
      g.add(bench);
    }
    // the crowd: little figures in bright clothes
    const crowd = 3 * 14;
    const bodyGeo = this.keep(new THREE.CapsuleGeometry(0.025, 0.035, 3, 6));
    const headGeo = this.keep(new THREE.SphereGeometry(0.022, 8, 6));
    const bodies = this.keep(new THREE.InstancedMesh(bodyGeo, this.mat('#ffffff', { roughness: 0.6 }), crowd));
    const heads = this.keep(new THREE.InstancedMesh(headGeo, this.mat('#e0b48a', { roughness: 0.6 }), crowd));
    const palette = ['#c8202a', '#1f63d0', '#f3c21a', '#24a04a', '#8a3fc4', '#f4f1e8', '#20242c', '#e87a1c'];
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    let n = 0;
    for (let k = 0; k < 3; k++)
      for (let i = 0; i < 14; i++) {
        const x = -W / 2 + 0.12 + (i + (k % 2) * 0.5) * ((W - 0.3) / 14) + (Math.random() - 0.5) * 0.03;
        const z = D / 2 - D / 6 - k * (D / 3) + 0.01;
        const y = 0.08 * (1 + k) + 0.05;
        m.makeTranslation(x, y, z);
        bodies.setMatrixAt(n, m);
        bodies.setColorAt(n, col.set(palette[(i * 3 + k * 5) % palette.length]));
        m.makeTranslation(x, y + 0.058, z);
        heads.setMatrixAt(n, m);
        n++;
      }
    g.add(bodies, heads);
    // roof on four posts
    const postGeo = this.keep(new THREE.CylinderGeometry(0.018, 0.018, 0.62, 8));
    for (const x of [-W / 2 + 0.05, -W / 6, W / 6, W / 2 - 0.05]) {
      const p = new THREE.Mesh(postGeo, white);
      p.position.set(x, 0.31, -D / 2 + 0.03);
      g.add(p);
      const p2 = new THREE.Mesh(postGeo, white);
      p2.position.set(x, 0.31, D / 2 - 0.02);
      p2.scale.y = 0.9;
      p2.position.y = 0.28;
      g.add(p2);
    }
    const roof = new THREE.Mesh(this.keep(new THREE.BoxGeometry(W + 0.12, 0.03, D + 0.16)), this.mat('#ffffff', { map: stripeTex, roughness: 0.6 }));
    roof.position.set(0, 0.6, 0.02);
    roof.rotation.x = 0.12;
    g.add(roof);
    this.group.add(g);
  }

  /** Flag poles with the five stable colours. */
  private buildFlags(x0: number, z: number) {
    const white = this.mat('#f4f1e8', { roughness: 0.4 });
    const gold = this.mat('#d9b45c', { roughness: 0.3, metalness: 1 });
    const poleGeo = this.keep(new THREE.CylinderGeometry(0.01, 0.012, 0.7, 8));
    poleGeo.translate(0, 0.35, 0);
    const knob = this.keep(new THREE.SphereGeometry(0.018, 10, 8));
    HORSES.forEach((hd, i) => {
      const x = x0 + i * 0.42;
      const pole = new THREE.Mesh(poleGeo, white);
      pole.position.set(x, 0, z);
      const k = new THREE.Mesh(knob, gold);
      k.position.set(x, 0.71, z);
      const geo = this.keep(new THREE.PlaneGeometry(0.24, 0.15, 10, 2));
      geo.translate(0.12, 0, 0);
      const flag = new THREE.Mesh(geo, this.mat(hd.color, { side: THREE.DoubleSide, roughness: 0.7 }));
      flag.position.set(x + 0.01, 0.6, z);
      this.flags.push({ mesh: flag, base: Float32Array.from(geo.attributes.position.array as Float32Array), phase: i * 1.1 });
      this.group.add(pole, k, flag);
    });
  }

  /** Waving flags. */
  tick(time: number) {
    for (const f of this.flags) {
      const pos = f.mesh.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < pos.count; i++) {
        const x = f.base[i * 3];
        arr[i * 3 + 2] = f.base[i * 3 + 2] + Math.sin(time * 4.2 + f.phase - x * 22) * 0.022 * (x / 0.24);
        arr[i * 3 + 1] = f.base[i * 3 + 1] - x * x * 0.4;
      }
      pos.needsUpdate = true;
    }
  }

  dispose() {
    this.group.removeFromParent();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
