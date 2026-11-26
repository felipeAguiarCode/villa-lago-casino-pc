/**
 * A small rigid-body simulation for a pair of casino dice (pure maths, no three.js).
 *
 * The result of a roll is drawn first (fairly, with the crypto rng); this module only makes the
 * throw look physical: each die is a cube with gravity, contact impulses at its corners against the
 * felt and the walls (restitution and Coulomb friction), rolling resistance on the felt, and a
 * sphere-proxy knock between the two dice. The back wall is lined with rubber diamond pyramids, so
 * a corner that hits it is thrown off along a randomly tilted normal: every throw is different.
 *
 * A throw is simulated before it is shown. Attempts are re-drawn until both dice hit the back wall,
 * first touch down in the landing band, come to rest flat inside it and apart from each other.
 * The view then reads which body face ended on top and turns the pips inside the die (one of the
 * cube's 24 rotations, `pipTurn`) so that face shows the drawn number.
 *
 * Units: table units (1 = 10 cm), seconds. Gravity is real (9.81 m/s² = 98.1 units/s²); the dice
 * are 19 mm.
 */

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export interface Q {
  x: number;
  y: number;
  z: number;
  w: number;
}

export const DIE = 0.19;
export const HALF = DIE / 2;
export const G = 98.1;
const DT = 1 / 600;
/** Recorded frames per second. */
export const HZ = 120;
const PER_FRAME = Math.round(1 / DT / HZ);
const INV_M = 1;
const INV_I = 6 / (DIE * DIE);
const T_MAX = 4.5;

const FELT = { e: 0.45, mu: 0.38 };
const RUBBER = { e: 0.62, mu: 0.32 };
const DIE_E = 0.5;
/** Contact distance of the two dice (sphere proxy between face and corner reach). */
const KNOCK = 0.2;

export interface Arena {
  /** Side walls (inner faces) and the back wall (pyramid tips). */
  xMin: number;
  xMax: number;
  zWall: number;
  /** Wall height: a die must not touch a wall above it. */
  wallH: number;
  /** Where the dice may come to rest. */
  landing: { x0: number; x1: number; z0: number; z1: number };
  /** Dice must stay left of this (the house's bank) all the way. */
  xBank: number;
}

export interface ThrowIn {
  /** Centre between the dice at the moment they leave the hand. */
  hand: V3;
  /** First-bounce target on the felt (random in the landing band when omitted). */
  aim?: { x: number; z: number } | null;
  /** 0 (soft, longer flight) .. 1 (hard). */
  power?: number;
  /** Starting orientations of the two bodies (random when omitted). */
  q0?: [Q, Q] | null;
  /** Starting positions of the two dice (side by side across the throw when omitted). */
  from?: [V3, V3] | null;
}

export type SimEventKind = 'felt' | 'wall' | 'die';

export interface SimEvent {
  t: number;
  die: number;
  kind: SimEventKind;
  /** Approach speed, units/s. */
  speed: number;
}

export interface SimOut {
  ok: boolean;
  tries: number;
  duration: number;
  /** Per die: frames of [px, py, pz, qx, qy, qz, qw] at HZ. */
  frames: [Float32Array, Float32Array];
  events: SimEvent[];
  /** Body-local axis (0 +X, 1 −X, 2 +Y, 3 −Y, 4 +Z, 5 −Z) that ends up on top, per die. */
  top: [number, number];
  wallHits: [number, number];
  rest: [V3, V3];
}

// ---------------------------------------------------------------------------------------- maths
const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
const add = (a: V3, b: V3, s = 1): V3 => ({ x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s });
const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const len = (a: V3) => Math.hypot(a.x, a.y, a.z);
const scale = (a: V3, s: number): V3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const norm = (a: V3): V3 => scale(a, 1 / (len(a) || 1));

export function qMul(a: Q, b: Q): Q {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

export function qNorm(q: Q): Q {
  const l = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
}

/** Rotates v by the unit quaternion q. */
export function qRot(q: Q, v: V3): V3 {
  // t = 2 q.xyz × v ; v' = v + w t + q.xyz × t
  const u = { x: q.x, y: q.y, z: q.z };
  const t = scale(cross(u, v), 2);
  return add(add(v, t, q.w), cross(u, t));
}

function qFromAxisAngle(axis: V3, a: number): Q {
  const n = norm(axis);
  const s = Math.sin(a / 2);
  return { x: n.x * s, y: n.y * s, z: n.z * s, w: Math.cos(a / 2) };
}

/** Shortest rotation taking unit vector a onto unit vector b. */
function qFromTo(a: V3, b: V3): Q {
  const d = dot(a, b);
  if (d > 0.999999) return { x: 0, y: 0, z: 0, w: 1 };
  if (d < -0.999999) {
    const ax = Math.abs(a.x) < 0.9 ? cross(a, v3(1, 0, 0)) : cross(a, v3(0, 1, 0));
    return qFromAxisAngle(ax, Math.PI);
  }
  const c = cross(a, b);
  return qNorm({ x: c.x, y: c.y, z: c.z, w: 1 + d });
}

export function qSlerp(a: Q, b: Q, t: number): Q {
  let d = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  let bb = b;
  if (d < 0) {
    d = -d;
    bb = { x: -b.x, y: -b.y, z: -b.z, w: -b.w };
  }
  if (d > 0.9995) return qNorm({ x: a.x + (bb.x - a.x) * t, y: a.y + (bb.y - a.y) * t, z: a.z + (bb.z - a.z) * t, w: a.w + (bb.w - a.w) * t });
  const th = Math.acos(d);
  const s = Math.sin(th);
  const ka = Math.sin((1 - t) * th) / s;
  const kb = Math.sin(t * th) / s;
  return { x: a.x * ka + bb.x * kb, y: a.y * ka + bb.y * kb, z: a.z * ka + bb.z * kb, w: a.w * ka + bb.w * kb };
}

export function randomQ(rand: () => number): Q {
  // uniform random rotation (Shoemake)
  const u1 = rand();
  const u2 = rand() * Math.PI * 2;
  const u3 = rand() * Math.PI * 2;
  const a = Math.sqrt(1 - u1);
  const b = Math.sqrt(u1);
  return { x: a * Math.sin(u2), y: a * Math.cos(u2), z: b * Math.sin(u3), w: b * Math.cos(u3) };
}

// ---------------------------------------------------------------------------------------- faces
/** Body-local axes: 0 +X, 1 −X, 2 +Y, 3 −Y, 4 +Z, 5 −Z. */
export const AXES: V3[] = [v3(1, 0, 0), v3(-1, 0, 0), v3(0, 1, 0), v3(0, -1, 0), v3(0, 0, 1), v3(0, 0, -1)];
/**
 * Canonical die (opposite faces add to 7; 1-2-3 run counter-clockwise round their corner, as on
 * Western dice): +Y 1, +Z 2, +X 3, −X 4, −Z 5, −Y 6. Value → axis index.
 */
export const FACE_AXIS: Record<number, number> = { 1: 2, 2: 4, 3: 0, 4: 1, 5: 5, 6: 3 };

/** The body axis pointing up for orientation q. */
export function topAxis(q: Q): number {
  let best = 0;
  let by = -Infinity;
  AXES.forEach((a, i) => {
    const y = qRot(q, a).y;
    if (y > by) {
      by = y;
      best = i;
    }
  });
  return best;
}

/** The 24 rotations of the cube as row-major 3×3 integer matrices. */
export const CUBE_TURNS: number[][] = (() => {
  const out: number[][] = [];
  const perms = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];
  for (const p of perms)
    for (let s = 0; s < 8; s++) {
      const m = new Array(9).fill(0);
      const sg = [s & 1 ? -1 : 1, s & 2 ? -1 : 1, s & 4 ? -1 : 1];
      for (let r = 0; r < 3; r++) m[r * 3 + p[r]] = sg[r];
      const det = m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
      if (det === 1) out.push(m);
    }
  return out;
})();

export const mulM = (m: number[], v: V3): V3 => ({
  x: m[0] * v.x + m[1] * v.y + m[2] * v.z,
  y: m[3] * v.x + m[4] * v.y + m[5] * v.z,
  z: m[6] * v.x + m[7] * v.y + m[8] * v.z,
});

/**
 * The turn of the pips inside the body (pip-local → body-local) that shows `value` on the body face
 * `axis`. There are four; `pick` (0..3) chooses one, so the sides vary too.
 */
export function pipTurn(axis: number, value: number, pick = 0): number[] {
  const from = AXES[FACE_AXIS[value]];
  const to = AXES[axis];
  const ok = CUBE_TURNS.filter((m) => {
    const r = mulM(m, from);
    return r.x === to.x && r.y === to.y && r.z === to.z;
  });
  return ok[((pick % ok.length) + ok.length) % ok.length];
}

// ---------------------------------------------------------------------------------------- bodies
interface Body {
  p: V3;
  v: V3;
  q: Q;
  w: V3;
  asleep: boolean;
  restT: number;
  sleepAt: number;
  qSleep: Q;
  qFinal: Q;
  ySleep: number;
  /** Corner index → still touching this plane (pyramid tilt is drawn once per contact). */
  wallTilt: V3 | null;
  wasOnWall: boolean;
  wasOnFloor: boolean;
  firstTouchZ: number | null;
  wallHits: number;
  wallTooHigh: boolean;
  maxX: number;
}

const CORNERS: V3[] = [];
for (const x of [-HALF, HALF]) for (const y of [-HALF, HALF]) for (const z of [-HALF, HALF]) CORNERS.push(v3(x, y, z));

interface Plane {
  n: V3;
  d: number;
  kind: 'felt' | 'wall';
}

function impulse(b: Body, r: V3, n: V3, e: number, mu: number) {
  const vp = add(b.v, cross(b.w, r));
  const vn = dot(vp, n);
  if (vn >= 0) return 0;
  const rn = cross(r, n);
  const kn = INV_M + INV_I * dot(rn, rn);
  const ee = -vn > 0.7 ? e : 0;
  const j = (-(1 + ee) * vn) / kn;
  b.v = add(b.v, n, j * INV_M);
  b.w = add(b.w, rn, j * INV_I);
  // Coulomb friction along the sliding direction
  const vp2 = add(b.v, cross(b.w, r));
  const vt = sub(vp2, scale(n, dot(vp2, n)));
  const st = len(vt);
  if (st > 1e-6) {
    const t = scale(vt, 1 / st);
    const rt = cross(r, t);
    const kt = INV_M + INV_I * dot(rt, rt);
    const jt = Math.max(-mu * j, -st / kt);
    b.v = add(b.v, t, jt * INV_M);
    b.w = add(b.w, rt, jt * INV_I);
  }
  return -vn;
}

/**
 * Simulates one throw from the given start states. `rand` gives the pyramid kicks. Returns the raw
 * run and its checks.
 */
function run(arena: Arena, starts: { p: V3; v: V3; q: Q; w: V3 }[], rand: () => number) {
  const bodies: Body[] = starts.map((s) => ({
    p: { ...s.p },
    v: { ...s.v },
    q: qNorm(s.q),
    w: { ...s.w },
    asleep: false,
    restT: 0,
    sleepAt: 0,
    qSleep: s.q,
    qFinal: s.q,
    ySleep: HALF,
    wallTilt: null,
    wasOnWall: false,
    wasOnFloor: false,
    firstTouchZ: null,
    wallHits: 0,
    wallTooHigh: false,
    maxX: -Infinity,
  }));
  const planes: Plane[] = [
    { n: v3(0, 1, 0), d: 0, kind: 'felt' },
    { n: v3(0, 0, 1), d: arena.zWall, kind: 'wall' },
    { n: v3(1, 0, 0), d: arena.xMin, kind: 'wall' },
    { n: v3(-1, 0, 0), d: -arena.xMax, kind: 'wall' },
  ];
  const frames: number[][] = [[], []];
  const events: SimEvent[] = [];
  let t = 0;
  let stepN = 0;
  let doneAt = -1;
  const record = () => {
    bodies.forEach((b, i) => {
      let q = b.q;
      let y = b.p.y;
      if (b.asleep) {
        const k = Math.min(1, (t - b.sleepAt) / 0.08);
        const s = k * k * (3 - 2 * k);
        q = qSlerp(b.qSleep, b.qFinal, s);
        y = b.ySleep + (HALF - b.ySleep) * s;
      }
      frames[i].push(b.p.x, y, b.p.z, q.x, q.y, q.z, q.w);
    });
  };
  record();
  while (t < T_MAX) {
    for (const b of bodies) {
      if (b.asleep) continue;
      b.v.y -= G * DT;
      b.p = add(b.p, b.v, DT);
      const wq: Q = { x: b.w.x, y: b.w.y, z: b.w.z, w: 0 };
      const dq = qMul(wq, b.q);
      b.q = qNorm({ x: b.q.x + 0.5 * dq.x * DT, y: b.q.y + 0.5 * dq.y * DT, z: b.q.z + 0.5 * dq.z * DT, w: b.q.w + 0.5 * dq.w * DT });
    }
    bodies.forEach((b, i) => {
      if (b.asleep) return;
      let onFloor = false;
      let onWall = false;
      const corners = CORNERS.map((c) => qRot(b.q, c));
      for (const pl of planes) {
        // the corners in contact with this plane, then a few rounds of impulses over them
        const touching: V3[] = [];
        let maxPen = 0;
        for (const r of corners) {
          const P = add(b.p, r);
          const pen = pl.d - dot(pl.n, P);
          if (pen <= 0) continue;
          touching.push(r);
          maxPen = Math.max(maxPen, pen);
          if (pl.kind === 'wall' && P.y > arena.wallH - 0.02) b.wallTooHigh = true;
        }
        if (!touching.length) continue;
        let n = pl.n;
        let mat = FELT;
        if (pl.kind === 'felt') onFloor = true;
        else {
          onWall = true;
          mat = RUBBER;
          // a diamond pyramid: the die glances off a tilted face (drawn once per contact)
          if (!b.wallTilt) b.wallTilt = norm(add(pl.n, { x: pl.n.x === 0 ? (rand() - 0.5) * 0.9 : 0, y: (rand() - 0.5) * 0.7, z: pl.n.z === 0 ? (rand() - 0.5) * 0.9 : 0 }));
          n = b.wallTilt;
        }
        let hitSpeed = 0;
        for (let it = 0; it < 4; it++) for (const r of touching) hitSpeed = Math.max(hitSpeed, impulse(b, r, n, it === 0 ? mat.e : 0, mat.mu));
        b.p = add(b.p, pl.n, maxPen);
        if (hitSpeed > 0.9) {
          const kind = pl.kind;
          const was = kind === 'felt' ? b.wasOnFloor : b.wasOnWall;
          if (!was) {
            events.push({ t, die: i, kind, speed: hitSpeed });
            if (kind === 'wall' && pl.n.z === 1) b.wallHits++;
            if (b.firstTouchZ === null) b.firstTouchZ = b.p.z;
          }
        }
      }
      if (!onWall) b.wallTilt = null;
      b.wasOnFloor = onFloor;
      b.wasOnWall = onWall;
      if (onFloor) {
        // felt: rolling resistance, and a firm grip once the die is nearly still
        const slow = len(b.v) < 0.35 && len(b.w) < 3.5;
        const k = Math.exp(-(slow ? 7 : 0.9) * DT);
        b.v.x *= k;
        b.v.z *= k;
        b.w = scale(b.w, Math.exp(-(slow ? 9 : 1.6) * DT));
      } else b.w = scale(b.w, Math.exp(-0.05 * DT));
      if (b.p.z < arena.landing.z1 + 0.25) b.maxX = Math.max(b.maxX, b.p.x);
      // rest: slow, on the felt, flat
      const up = qRot(b.q, AXES[topAxis(b.q)]).y;
      if (onFloor && Math.hypot(b.v.x, b.v.z) < 0.08 && Math.abs(b.v.y) < 0.4 && len(b.w) < 1 && up > 0.9985) b.restT += DT;
      else b.restT = 0;
      if (b.restT > 0.09) {
        b.asleep = true;
        b.sleepAt = t;
        b.qSleep = b.q;
        const a = qRot(b.q, AXES[topAxis(b.q)]);
        b.qFinal = qNorm(qMul(qFromTo(a, v3(0, 1, 0)), b.q));
        b.ySleep = b.p.y;
        b.v = v3();
        b.w = v3();
      }
    });
    // the two dice knock into each other
    const [a, c] = bodies;
    const d = sub(c.p, a.p);
    const dist = len(d);
    if (dist < KNOCK && dist > 1e-6 && !(a.asleep && c.asleep)) {
      const n = scale(d, 1 / dist);
      const vn = dot(sub(c.v, a.v), n);
      if (vn < 0) {
        const j = (-(1 + DIE_E) * vn) / (2 * INV_M);
        if (!a.asleep) a.v = add(a.v, n, -j * INV_M);
        if (!c.asleep) c.v = add(c.v, n, j * INV_M);
        const kick = () => v3((rand() - 0.5) * 6, (rand() - 0.5) * 6, (rand() - 0.5) * 6);
        if (!a.asleep) a.w = add(a.w, kick());
        if (!c.asleep) c.w = add(c.w, kick());
        if (-vn > 0.8) events.push({ t, die: 0, kind: 'die', speed: -vn });
      }
      const push = (KNOCK - dist) / (a.asleep || c.asleep ? 1 : 2);
      if (!a.asleep) a.p = add(a.p, n, -push);
      if (!c.asleep) c.p = add(c.p, n, push);
    }
    t += DT;
    stepN++;
    if (stepN % PER_FRAME === 0) record();
    if (doneAt < 0 && bodies.every((b) => b.asleep)) doneAt = t;
    if (doneAt >= 0 && t > doneAt + 0.12) break;
  }
  record();
  return { bodies, frames, events, t, settled: doneAt >= 0 };
}

/** How far a run is from a good throw (0 = good). */
function score(arena: Arena, r: ReturnType<typeof run>) {
  let s = 0;
  if (!r.settled) s += 100;
  const L = arena.landing;
  for (const b of r.bodies) {
    if (b.wallHits < 1) s += 12;
    if (b.wallTooHigh) s += 25;
    if (b.firstTouchZ === null || b.firstTouchZ > L.z1) s += 20;
    if (b.p.x < L.x0 || b.p.x > L.x1 || b.p.z < L.z0 || b.p.z > L.z1) s += 30;
    if (b.maxX > arena.xBank - HALF * 1.5) s += 30;
  }
  const [a, c] = r.bodies;
  if (Math.hypot(a.p.x - c.p.x, a.p.z - c.p.z) < 0.3) s += 15;
  if (r.t < 0.7) s += 5;
  return s;
}

/**
 * Plans a throw: draws start conditions (the dice leave the hand side by side, flying to a first
 * bounce in the landing band) and simulates until a run passes every check (or keeps the best of
 * `maxTries`). `rand` returns floats in [0, 1).
 */
export function simulateThrow(arena: Arena, input: ThrowIn, rand: () => number = Math.random, maxTries = 60): SimOut {
  const L = arena.landing;
  const power = Math.min(1, Math.max(0, input.power ?? 0.5));
  let best: { s: number; r: ReturnType<typeof run> } | null = null;
  let tries = 0;
  for (; tries < maxTries; tries++) {
    // the player's aim is honoured first; if it keeps failing the checks, the throw spreads out
    const aimed = input.aim && tries < maxTries / 2;
    const ax = aimed ? input.aim!.x + (rand() - 0.5) * (0.5 + tries * 0.05) : L.x0 + 0.8 + rand() * Math.max(0.1, L.x1 - L.x0 - 1.3);
    const az = arena.zWall + 0.32 + rand() * 0.5;
    const tx = Math.min(L.x1 - 0.3, Math.max(L.x0 + 0.4, ax));
    const h = input.hand;
    // a short throw is a lower, quicker toss
    const reach = Math.hypot(tx - h.x, az - h.z);
    const T = (0.5 - 0.16 * power) * Math.min(1, 0.45 + reach / 9) * (0.94 + rand() * 0.12);
    // the pair side by side, across the direction of the throw
    const dir = norm(v3(tx - h.x, 0, az - h.z));
    const side = v3(-dir.z, 0, dir.x);
    const starts = [-1, 1].map((sg, i) => {
      const p = input.from ? { ...input.from[i] } : add(add(h, side, sg * (0.11 + rand() * 0.02)), v3(0, (rand() - 0.5) * 0.04, (rand() - 0.5) * 0.04));
      const tgt = add(v3(tx, 0, az), side, sg * (0.16 + rand() * 0.1));
      const Ti = T * (0.97 + rand() * 0.06);
      const v = v3((tgt.x - p.x) / Ti, (HALF + 0.03 - p.y + 0.5 * G * Ti * Ti) / Ti, (tgt.z - p.z) / Ti);
      const spin = 14 + rand() * 18;
      const axis = norm(v3(rand() - 0.5 + side.x * 1.5, rand() - 0.5, rand() - 0.5 + side.z * 1.5));
      const q = input.q0 ? input.q0[i] : randomQ(rand);
      return { p, v, q, w: scale(axis, spin) };
    });
    const r = run(arena, starts, rand);
    const s = score(arena, r);
    if (!best || s < best.s) best = { s, r };
    if (s === 0) break;
  }
  const r = best!.r;
  const toF = (a: number[]) => Float32Array.from(a);
  const finalQ = (b: Body) => (b.asleep ? b.qFinal : b.q);
  return {
    ok: best!.s === 0,
    tries: tries + (best!.s === 0 ? 1 : 0),
    duration: r.frames[0].length / 7 / HZ,
    frames: [toF(r.frames[0]), toF(r.frames[1])],
    events: r.events.sort((a, b) => a.t - b.t),
    top: [topAxis(finalQ(r.bodies[0])), topAxis(finalQ(r.bodies[1]))],
    wallHits: [r.bodies[0].wallHits, r.bodies[1].wallHits],
    rest: [{ ...r.bodies[0].p, y: HALF }, { ...r.bodies[1].p, y: HALF }],
  };
}

/** Pose of die `i` at time t (seconds) of a simulated throw. */
export function sample(sim: SimOut, i: number, t: number, outP: V3, outQ: { q: Q }) {
  const f = sim.frames[i];
  const n = f.length / 7;
  const x = Math.min(n - 1, Math.max(0, t * HZ));
  const k = Math.min(n - 2, Math.floor(x));
  const u = n > 1 ? Math.min(1, x - k) : 0;
  const a = Math.max(0, k) * 7;
  const b = Math.min(n - 1, k + 1) * 7;
  outP.x = f[a] + (f[b] - f[a]) * u;
  outP.y = f[a + 1] + (f[b + 1] - f[a + 1]) * u;
  outP.z = f[a + 2] + (f[b + 2] - f[a + 2]) * u;
  outQ.q = qSlerp({ x: f[a + 3], y: f[a + 4], z: f[a + 5], w: f[a + 6] }, { x: f[b + 3], y: f[b + 4], z: f[b + 5], w: f[b + 6] }, u);
}
