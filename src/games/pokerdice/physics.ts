import * as THREE from 'three';

/**
 * A small rigid-body simulation for the poker dice (no DOM, no rendering).
 *
 * Each die is a rounded cube (a cube of half side `H - RC` swept by a sphere of radius `RC`) with
 * gravity, restitution and Coulomb friction against the tray floor and its four rails (impulses at
 * every penetrating corner), plus die-against-die bounces (bounding spheres). A throw is simulated
 * in full before anything moves on screen: the frames are recorded and played back, and the face
 * slot that ends on top tells the view how to pre-rotate the die's face mapping so the value drawn
 * beforehand with the crypto rng lands on top. The physics never decides the result.
 */

/** Edge of a die in table units (2.7 cm). */
export const DIE = 0.27;
const H = DIE / 2;
/** Radius of the rounded corners. */
const RC = DIE * 0.12;
const INNER = H - RC;
/** Die-against-die bounding sphere. */
const RS = DIE * 0.62;

const G = 48;
const DT = 1 / 600;
export const FPS = 60;
const SUB = Math.round(1 / (DT * FPS));
const MASS = 1;
const INV_I = 6 / (MASS * DIE * DIE);
const MU_FLOOR = 0.3;
const MU_RAIL = 0.25;
const E_FLOOR = 0.4;
const E_RAIL = 0.55;
const E_DIE = 0.5;

/** The inner box of a dice tray: centre, inner width (x) and depth (z), height of its floor. */
export interface Tray {
  cx: number;
  cz: number;
  w: number;
  d: number;
  floor: number;
}

export interface DieStart {
  p: THREE.Vector3;
  v: THREE.Vector3;
  q: THREE.Quaternion;
  w: THREE.Vector3;
  /** Seconds after the start of the throw when the die leaves the cup. */
  at: number;
}

export interface Hit {
  t: number;
  die: number;
  /** Normal speed of the impact (table units per second). */
  speed: number;
  kind: 'rail' | 'floor' | 'die';
}

export interface Roll {
  /** Number of recorded frames (at FPS) and the duration in seconds. */
  frames: number;
  dur: number;
  /** Per die: frames × (x, y, z). */
  pos: Float32Array[];
  /** Per die: frames × (x, y, z, w). */
  quat: Float32Array[];
  /** Release time of each die (it is still in the cup before that). */
  at: number[];
  hits: Hit[];
  /** Per die: the local face slot that ends up on top (BoxGeometry order: +x, −x, +y, −y, +z, −z). */
  top: number[];
}

/** Outward normals of the six face slots, in BoxGeometry's material order. */
export const SLOT_N = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
];

const CORNERS = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => new THREE.Vector3(x * INNER, y * INNER, z * INNER))));

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** The face slot pointing most nearly up for orientation q, and how well it is aligned (1 = flat). */
export function upSlot(q: THREE.Quaternion): { slot: number; align: number } {
  let best = 0;
  let align = -2;
  for (let k = 0; k < 6; k++) {
    const y = _v.copy(SLOT_N[k]).applyQuaternion(q).y;
    if (y > align) {
      align = y;
      best = k;
    }
  }
  return { slot: best, align };
}

/** Turns q by the smallest rotation that lays its up-most face exactly flat. */
export function flatten(q: THREE.Quaternion, out = new THREE.Quaternion()): THREE.Quaternion {
  const { slot } = upSlot(q);
  const n = _v.copy(SLOT_N[slot]).applyQuaternion(q);
  _q.setFromUnitVectors(n, _a.set(0, 1, 0)).multiply(q);
  return out.copy(_q);
}

interface Body {
  p: THREE.Vector3;
  v: THREE.Vector3;
  q: THREE.Quaternion;
  w: THREE.Vector3;
  live: boolean;
  asleep: boolean;
  slow: number;
  /** Last time a rail (by plane index) or the floor made a sound. */
  lastHit: number[];
}

interface Plane {
  n: THREE.Vector3;
  off: number;
  kind: 'rail' | 'floor';
  mu: number;
  e: number;
}

function planes(t: Tray): Plane[] {
  const r = (n: THREE.Vector3, off: number): Plane => ({ n, off, kind: 'rail', mu: MU_RAIL, e: E_RAIL });
  return [
    { n: new THREE.Vector3(0, 1, 0), off: t.floor, kind: 'floor', mu: MU_FLOOR, e: E_FLOOR },
    r(new THREE.Vector3(1, 0, 0), t.cx - t.w / 2),
    r(new THREE.Vector3(-1, 0, 0), -(t.cx + t.w / 2)),
    r(new THREE.Vector3(0, 0, 1), t.cz - t.d / 2),
    r(new THREE.Vector3(0, 0, -1), -(t.cz + t.d / 2)),
  ];
}

/** Impulse at one contact point (relative position ra) along normal n. Returns the normal impulse. */
function impulse(b: Body, ra: THREE.Vector3, n: THREE.Vector3, e: number, mu: number): number {
  const vRel = _a.copy(b.w).cross(ra).add(b.v);
  const vn = vRel.dot(n);
  if (vn >= 0) return 0;
  const rn = _b.copy(ra).cross(n);
  const k = 1 / MASS + rn.lengthSq() * INV_I;
  const rest = vn < -0.6 ? e : 0;
  const jn = (-(1 + rest) * vn) / k;
  b.v.addScaledVector(n, jn / MASS);
  b.w.addScaledVector(rn, jn * INV_I);
  // Coulomb friction against the sliding direction
  vRel.copy(b.w).cross(ra).add(b.v);
  const vt = _c.copy(vRel).addScaledVector(n, -vRel.dot(n));
  const sp = vt.length();
  if (sp > 1e-6) {
    vt.multiplyScalar(1 / sp);
    const rt = _b.copy(ra).cross(vt);
    const kt = 1 / MASS + rt.lengthSq() * INV_I;
    const jt = Math.min(sp / kt, mu * jn);
    b.v.addScaledVector(vt, -jt / MASS);
    b.w.addScaledVector(rt, -jt * INV_I);
  }
  return -vn;
}

/** True when two resting dice footprints (squares of side DIE, turned by their yaw) overlap. */
function footprintsOverlap(pa: THREE.Vector3, qa: THREE.Quaternion, pb: THREE.Vector3, qb: THREE.Quaternion, margin = -0.004): boolean {
  const axes = (q: THREE.Quaternion) => {
    const out: THREE.Vector3[] = [];
    for (const n of SLOT_N.slice(0, 6)) {
      const w = n.clone().applyQuaternion(q);
      if (Math.abs(w.y) < 0.5) out.push(new THREE.Vector3(w.x, 0, w.z).normalize());
    }
    return [out[0], out.find((a) => Math.abs(a.dot(out[0])) < 0.5)!];
  };
  const A = axes(qa);
  const B = axes(qb);
  const d = new THREE.Vector3(pb.x - pa.x, 0, pb.z - pa.z);
  for (const ax of [...A, ...B]) {
    const ra = H * (Math.abs(A[0].dot(ax)) + Math.abs(A[1].dot(ax)));
    const rb = H * (Math.abs(B[0].dot(ax)) + Math.abs(B[1].dot(ax)));
    if (Math.abs(d.dot(ax)) >= ra + rb + margin) return false;
  }
  return true;
}

/**
 * Simulates a throw. Returns null when it does not come to a clean rest within `maxT` seconds
 * (a die cocked against a rail or another die, or two dice touching): the caller throws again.
 */
export function simulate(tray: Tray, starts: DieStart[], maxT = 4.2, diag?: { why: string }): Roll | null {
  const pl = planes(tray);
  const n = starts.length;
  const bodies: Body[] = starts.map((s) => ({
    p: s.p.clone(),
    v: s.v.clone(),
    q: s.q.clone().normalize(),
    w: s.w.clone(),
    live: false,
    asleep: false,
    slow: 0,
    lastHit: [-1, -1, -1, -1, -1, -1],
  }));
  const pos: number[][] = bodies.map(() => []);
  const quat: number[][] = bodies.map(() => []);
  const hits: Hit[] = [];
  const ra = new THREE.Vector3();
  const wq = new THREE.Quaternion();
  let t = 0;
  let frames = 0;
  const record = () => {
    bodies.forEach((b, i) => {
      pos[i].push(b.p.x, b.p.y, b.p.z);
      quat[i].push(b.q.x, b.q.y, b.q.z, b.q.w);
    });
    frames++;
  };
  record();
  let calm = 0;
  while (t < maxT) {
    for (let s = 0; s < SUB; s++) {
      t += DT;
      for (let i = 0; i < n; i++) {
        const b = bodies[i];
        if (!b.live) {
          if (t >= starts[i].at) b.live = true;
          else continue;
        }
        if (b.asleep) continue;
        // integrate (semi-implicit Euler), with a little air drag
        b.v.y -= G * DT;
        b.v.multiplyScalar(1 - 0.15 * DT);
        b.w.multiplyScalar(1 - 0.35 * DT);
        b.p.addScaledVector(b.v, DT);
        wq.set(b.w.x, b.w.y, b.w.z, 0).multiply(b.q);
        b.q.set(b.q.x + 0.5 * DT * wq.x, b.q.y + 0.5 * DT * wq.y, b.q.z + 0.5 * DT * wq.z, b.q.w + 0.5 * DT * wq.w).normalize();
        // corners against the floor and the rails
        let onFloor = false;
        for (let k = 0; k < pl.length; k++) {
          const P = pl[k];
          let deepest = 0;
          for (let pass = 0; pass < 2; pass++)
            for (const c of CORNERS) {
              ra.copy(c).applyQuaternion(b.q);
              const dist = P.n.dot(_v.copy(b.p).add(ra)) - P.off - RC;
              if (dist >= 0) continue;
              if (pass === 0) deepest = Math.min(deepest, dist);
              ra.addScaledVector(P.n, -RC);
              const sp = impulse(b, ra, P.n, pass === 0 ? P.e : 0, P.mu);
              if (k === 0) onFloor = true;
              if (pass === 0 && sp > (P.kind === 'rail' ? 0.7 : 2.2) && t - b.lastHit[k] > 0.09) {
                b.lastHit[k] = t;
                hits.push({ t, die: i, speed: sp, kind: P.kind });
              }
            }
          if (deepest < 0) b.p.addScaledVector(P.n, -deepest * 0.9);
        }
        // rolling resistance of the felt
        if (onFloor) {
          b.w.multiplyScalar(1 - 1.4 * DT);
          const sp = b.v.length();
          const sw = b.w.length();
          if (sp < 0.07 && sw < 0.9) b.slow += DT;
          else b.slow = 0;
          if (b.slow > 0.12 && upSlot(b.q).align > 0.996) {
            b.asleep = true;
            b.v.set(0, 0, 0);
            b.w.set(0, 0, 0);
            flatten(b.q, b.q);
            b.p.y = tray.floor + H;
          }
        } else b.slow = 0;
      }
      // die against die
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
          const A = bodies[i];
          const B = bodies[j];
          if (!A.live || !B.live || (A.asleep && B.asleep)) continue;
          const d = _c.copy(B.p).sub(A.p);
          const dist = d.length();
          if (dist >= 2 * RS || dist < 1e-6) continue;
          d.multiplyScalar(1 / dist);
          const pen = 2 * RS - dist;
          const wa = A.asleep ? 0 : B.asleep ? 1 : 0.5;
          A.p.addScaledVector(d, -pen * wa);
          B.p.addScaledVector(d, pen * (1 - wa));
          const vn = _v.copy(B.v).sub(A.v).dot(d);
          if (vn < 0) {
            if (A.asleep && -vn > 0.25) A.asleep = false;
            if (B.asleep && -vn > 0.25) B.asleep = false;
            const ia = A.asleep ? 0 : 1;
            const ib = B.asleep ? 0 : 1;
            const j0 = (-(1 + (vn < -0.5 ? E_DIE : 0)) * vn) / (ia + ib || 1);
            A.v.addScaledVector(d, -j0 * ia);
            B.v.addScaledVector(d, j0 * ib);
            // a glancing knock sets the dice spinning a little
            _a.set(-d.z, 0, d.x).multiplyScalar(j0 * 0.9 * INV_I * DIE * 0.25);
            if (ia) A.w.add(_a);
            if (ib) B.w.sub(_a);
            if (-vn > 1.2) hits.push({ t, die: i, speed: -vn, kind: 'die' });
          }
        }
    }
    record();
    if (bodies.every((b) => b.live && b.asleep)) {
      if (++calm >= 6) break;
    } else calm = 0;
  }
  if (!bodies.every((b) => b.asleep)) {
    if (diag) diag.why = 'restless';
    return null;
  }
  // the dice must lie apart and clear of the rails
  for (let i = 0; i < n; i++) {
    const p = bodies[i].p;
    if (Math.abs(p.x - tray.cx) > tray.w / 2 - H * 0.9 || Math.abs(p.z - tray.cz) > tray.d / 2 - H * 0.9) {
      if (diag) diag.why = 'rail';
      return null;
    }
    for (let j = i + 1; j < n; j++)
      if (footprintsOverlap(p, bodies[i].q, bodies[j].p, bodies[j].q)) {
        if (diag) diag.why = 'touch';
        return null;
      }
  }
  return {
    frames,
    dur: (frames - 1) / FPS,
    pos: pos.map((a) => Float32Array.from(a)),
    quat: quat.map((a) => Float32Array.from(a)),
    at: starts.map((s) => s.at),
    hits: hits.sort((a, b) => a.t - b.t),
    top: bodies.map((b) => upSlot(b.q).slot),
  };
}

/**
 * Starting states for n dice tipped out of a cup whose mouth is at `mouth`, thrown along the
 * horizontal direction `dir`: they leave one after another, fanning out, spinning hard.
 */
export function cupThrow(mouth: THREE.Vector3, dir: THREE.Vector3, n: number, rnd: () => number = Math.random, power = 1): DieStart[] {
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const out: DieStart[] = [];
  for (let i = 0; i < n; i++) {
    const fan = (i - (n - 1) / 2) / Math.max(1, n - 1);
    const p = mouth
      .clone()
      .addScaledVector(side, (rnd() - 0.5) * 0.1)
      .add(new THREE.Vector3(0, (rnd() - 0.5) * 0.05, 0));
    const speed = (6.1 + rnd() * 2.9) * power;
    const v = dir
      .clone()
      .multiplyScalar(speed)
      .addScaledVector(side, (fan * 2.6 + (rnd() - 0.5) * 1.3) * power)
      .add(new THREE.Vector3(0, -0.6 + rnd() * 1.8, 0));
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * Math.PI * 2, rnd() * Math.PI * 2, rnd() * Math.PI * 2));
    const w = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(14 + rnd() * 18);
    // most of the spin rolls the die forward
    w.addScaledVector(new THREE.Vector3(dir.z, 0, -dir.x), -(8 + rnd() * 10));
    out.push({ p, v, q, w, at: i * 0.065 + rnd() * 0.02 });
  }
  return out;
}

/**
 * Throws until the dice come to a clean rest (a few tries at most). The last resort lays the
 * dice flat where the final attempt left them, so a round never stalls.
 */
export function planRoll(tray: Tray, mouth: THREE.Vector3, dir: THREE.Vector3, n: number, rnd: () => number = Math.random): Roll {
  for (let k = 0; k < 24; k++) {
    const r = simulate(tray, cupThrow(mouth, dir, n, rnd, 1 - k * 0.012));
    if (r) return r;
  }
  return restingRoll(tray, n, rnd);
}

/** A still layout (fallback): the dice lie flat in a loose row across the tray. */
export function restingRoll(tray: Tray, n: number, rnd: () => number = Math.random): Roll {
  const pos: Float32Array[] = [];
  const quat: Float32Array[] = [];
  const top: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = tray.cx + (i - (n - 1) / 2) * DIE * 1.55;
    const z = tray.cz + (rnd() - 0.5) * tray.d * 0.4;
    const q = flatten(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * 1.2 - 0.6, 0)));
    pos.push(Float32Array.of(x, tray.floor + H, z));
    quat.push(Float32Array.of(q.x, q.y, q.z, q.w));
    top.push(upSlot(q).slot);
  }
  return { frames: 1, dur: 0, pos, quat, at: pos.map(() => 0), hits: [], top };
}

// ---------------------------------------------------------------- face mapping

/** The 24 rotations of the cube. */
export const CUBE_ROTATIONS: THREE.Quaternion[] = (() => {
  const out: THREE.Quaternion[] = [];
  const h = Math.PI / 2;
  for (let a = 0; a < 4; a++)
    for (let b = 0; b < 4; b++)
      for (let c = 0; c < 4; c++) {
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(a * h, b * h, c * h));
        if (!out.some((o) => Math.abs(o.dot(q)) > 0.999)) out.push(q);
      }
  return out;
})();

/** Slot that a cube rotation sends slot `s` to. */
export function slotAfter(r: THREE.Quaternion, s: number): number {
  const v = _v.copy(SLOT_N[s]).applyQuaternion(r);
  return SLOT_N.findIndex((n) => n.dot(v) > 0.9);
}

/**
 * The pre-rotation R0 (render orientation = simulated orientation × R0) that brings the face
 * printed on slot `faceSlot` to the slot `upSlotIndex` that the simulation leaves on top. Of the
 * four such rotations it picks the one whose printed face reads most nearly upright for the
 * player once the die rests with orientation `finalQ` (`texUp` = the face's printed "up" in local
 * coordinates).
 */
export function faceFix(faceSlot: number, upSlotIndex: number, finalQ: THREE.Quaternion, texUp: THREE.Vector3): THREE.Quaternion {
  let best: THREE.Quaternion | null = null;
  let score = -Infinity;
  const far = new THREE.Vector3(0, 0, -1);
  for (const r of CUBE_ROTATIONS) {
    if (slotAfter(r, faceSlot) !== upSlotIndex) continue;
    const u = texUp.clone().applyQuaternion(r).applyQuaternion(finalQ);
    const s = u.dot(far);
    if (s > score) {
      score = s;
      best = r;
    }
  }
  return (best ?? new THREE.Quaternion()).clone();
}
