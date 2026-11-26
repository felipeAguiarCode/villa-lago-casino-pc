import { pocketIndex } from './rules';

/**
 * The choreography of one spin, as pure functions of time (no three.js), so the wheel can play it
 * frame by frame and the tests can check it. The result is drawn before the spin; the plan then
 * makes the ball meet the rotor a little before the winning pocket and rattle into it.
 *
 * Angles ψ run from +x towards +z (clockwise seen from above, the way the numbers run on a real
 * wheel); pocket i of `wheelOrder` sits at rotor angle i·POCKET. The rotor turns clockwise
 * (its angle grows), the ball runs the other way round the track (its angle falls).
 */

export const TAU = Math.PI * 2;
export const POCKET = TAU / 37;
export const BALL_R = 0.04;

/** Wheel dimensions (outer radius 1.36 table units). */
export const WHEEL = {
  wall: 1.224,
  diamond: 0.975,
  edge: 0.866,
  pocket: 0.66,
  ringOut: 0.872,
  ringIn: 0.745,
  cone: 0.575,
  floor: 0.07,
  fretTop: 0.119,
};
export const R_TRACK = WHEEL.wall - BALL_R - 0.003;
export const Y_REST = WHEEL.floor + BALL_R;
/** Rotor speed while nobody plays (rad/s). */
export const IDLE_SPEED = 0.32;
/** World angles of the eight deflectors. */
export const DIAMONDS = Array.from({ length: 8 }, (_, j) => Math.PI / 8 + (j * Math.PI) / 4);

/** Ball track and stator surface, (r, y) from the back wall inwards. */
export const TRACK: [number, number][] = [
  [WHEEL.wall, 0.262],
  [1.218, 0.246],
  [1.2, 0.236],
  [1.12, 0.222],
  [1.05, 0.21],
  [0.98, 0.183],
  [0.92, 0.16],
  [0.892, 0.151],
  [0.884, 0.147],
];

/** Height of the bowl's track / stator surface at radius r (the lip height inside it). */
export function surfaceY(r: number): number {
  if (r >= TRACK[0][0]) return TRACK[0][1];
  for (let i = 1; i < TRACK.length; i++) {
    const [r1, y1] = TRACK[i];
    if (r >= r1) {
      const [r0, y0] = TRACK[i - 1];
      return y1 + ((y0 - y1) * (r - r1)) / (r0 - r1);
    }
  }
  return TRACK[TRACK.length - 1][1];
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export interface BallPos {
  r: number;
  y: number;
  /** World angle. */
  th: number;
}

export interface Hop {
  t0: number;
  d: number;
  q0: number;
  q1: number;
  H: number;
  jit: number;
}

export type SpinEvent = { t: number; kind: 'launch' | 'diamond' | 'rotor' | 'settle' } | { t: number; kind: 'land'; j: number };

export interface SpinPlan {
  /** Launch of the ball, end of the ball track, deflector, first touch on the rotor, at rest. */
  tLaunch: number;
  tTrack: number;
  tDiamond: number;
  tRotor: number;
  tSettle: number;
  tEnd: number;
  /** Scale applied to the ball's launch speed so it lands where the drawn number is. */
  k: number;
  hops: Hop[];
  events: SpinEvent[];
  rotorAt(t: number): number;
  rotorSpeed(t: number): number;
  ballAt(t: number, out?: BallPos): BallPos;
}

/**
 * Plans a spin from the rotor's current angle and speed and the pocket holding the ball, ending
 * with the ball in the pocket of `n`.
 */
export function planSpin(o: { phi: number; omega: number; ballIdx: number; n: number; rnd?: () => number }): SpinPlan {
  const rnd = o.rnd ?? Math.random;
  const TL = 0.55;
  const FLICK = 0.16;
  const wb0 = 12.5 + rnd() * 2;
  const t1 = TL + 4.55 + rnd() * 0.5;
  const t3 = t1 + 1.05 + rnd() * 0.25;
  const lam = Math.log(wb0 / 6) / (t1 - TL - FLICK);
  const w0 = o.omega;
  const WR = 2.0;
  const KR = 0.085;
  const omegaR = (t: number) => (t < 0.6 ? lerp(w0, WR, smooth(t / 0.6)) : WR * Math.exp(-KR * (t - 0.6)));
  const omegaB = (t: number) => {
    const s = t - TL;
    return s < FLICK ? wb0 * (1 - (1 - s / FLICK) ** 2) : wb0 * Math.exp(-lam * (s - FLICK));
  };
  // the ball leaves its pocket riding with the rotor and is held still for the launch
  const nuPre = (t: number) => omegaR(t) * (1 - smooth(t / 0.42));

  // rattle on the rotor: q counts the pockets still to go (frets at half-integers)
  const J = rnd() < 0.5 ? 2 : 3;
  const durs = [0.34, 0.22, 0.17];
  const heights = [0.085, 0.062, 0.058];
  const hops: Hop[] = [];
  let acc = 0;
  let q = J - 1 + 0.65 + rnd() * 0.8;
  const q0 = q;
  for (let j = 0; j < J; j++) {
    const q1 = J - 1 - j;
    hops.push({ t0: acc, d: durs[j], q0: q, q1, H: heights[j], jit: (rnd() - 0.5) * 0.026 });
    acc += durs[j];
    q = q1;
  }
  const ROCK = 0.55;
  const tSettle = t3 + acc;
  const tEnd = tSettle + ROCK;

  // rotor angle and ball travel, integrated on a fine grid (midpoint rule)
  const h = 1 / 600;
  const N = Math.ceil(tEnd / h) + 2;
  const phiA = new Float64Array(N);
  const preA = new Float64Array(N);
  const postA = new Float64Array(N);
  phiA[0] = o.phi;
  for (let i = 1; i < N; i++) {
    const tm = (i - 0.5) * h;
    phiA[i] = phiA[i - 1] + omegaR(tm) * h;
    preA[i] = preA[i - 1] + (tm < TL ? nuPre(tm) : 0) * h;
    postA[i] = postA[i - 1] + (tm >= TL ? omegaB(tm) : 0) * h;
  }
  const at = (arr: Float64Array, t: number) => {
    const x = Math.min(N - 1, Math.max(0, t / h));
    const i = Math.min(N - 2, Math.floor(x));
    const f = x - i;
    return arr[i] * (1 - f) + arr[i + 1] * f;
  };
  const phiAt = (t: number) => at(phiA, t);
  const theta0 = o.phi + o.ballIdx * POCKET;
  const target = pocketIndex(o.n) * POCKET;
  // scale the launch so the ball meets the rotor q0 pockets before its pocket
  const Bp = at(postA, t3);
  const Y = theta0 + at(preA, t3) - phiAt(t3) - target - q0 * POCKET;
  const m = Math.round((Y - Bp) / TAU);
  const k = (Y - m * TAU) / Bp;
  const thetaAt = (t: number) => theta0 + at(preA, t) - k * at(postA, t);

  // the deflector: the ball reaches a diamond's radius just as it passes one
  const D0 = Math.PI / 8;
  const DS = Math.PI / 4;
  const lo = t1 + 0.3;
  const hi = t3 - 0.42;
  let tc = (lo + hi) / 2;
  let prev = Math.floor((thetaAt(lo) - D0) / DS);
  for (let t = lo + h; t <= hi; t += h) {
    const cur = Math.floor((thetaAt(t) - D0) / DS);
    if (cur !== prev) {
      // refine the crossing
      let a = t - h;
      let b = t;
      for (let i = 0; i < 30; i++) {
        const mid = (a + b) / 2;
        if (Math.floor((thetaAt(mid) - D0) / DS) === prev) a = mid;
        else b = mid;
      }
      tc = (a + b) / 2;
      break;
    }
    prev = cur;
  }
  const yTrack = surfaceY(R_TRACK) + BALL_R;
  const yDrop = surfaceY(WHEEL.edge) + BALL_R;

  const ballAt = (t: number, out: BallPos = { r: 0, y: 0, th: 0 }): BallPos => {
    if (t < TL) {
      // lifted out of the pocket and set on the track
      const e = smooth((t / TL - 0.08) / 0.72);
      out.r = lerp(WHEEL.pocket, R_TRACK, e);
      out.y = lerp(Y_REST, yTrack, e) + 0.14 * Math.sin(Math.PI * e);
      out.th = thetaAt(t);
    } else if (t < t1) {
      // round the ball track, against the back wall
      out.r = R_TRACK;
      out.y = yTrack;
      out.th = thetaAt(t);
    } else if (t < t3) {
      // off the wall, spiralling down the stator; the deflector kicks it up and back a little
      if (t < tc) {
        const u = (t - t1) / (tc - t1);
        out.r = R_TRACK - (R_TRACK - WHEEL.diamond) * u * u;
      } else {
        const u = (t - tc) / (t3 - tc);
        out.r = WHEEL.diamond - (WHEEL.diamond - WHEEL.edge) * u + 0.035 * Math.sin(Math.PI * Math.min(1, u * 2.4)) * (1 - u);
      }
      const dt = t - tc;
      let hop = 0;
      if (dt >= 0 && dt < 0.26) hop = 0.06 * Math.sin((Math.PI * dt) / 0.26);
      else if (dt >= 0.26 && dt < 0.38) hop = 0.016 * Math.sin((Math.PI * (dt - 0.26)) / 0.12);
      out.y = surfaceY(out.r) + BALL_R + hop;
      out.th = thetaAt(t);
    } else {
      // on the rotor: bounces over the frets, then rocks to rest in the pocket
      const s = t - t3;
      let qq: number;
      const hp = hops.find((x) => s < x.t0 + x.d);
      if (hp) {
        const u = clamp01((s - hp.t0) / hp.d);
        qq = lerp(hp.q0, hp.q1, u);
        const first = hp === hops[0];
        out.y = lerp(first ? yDrop : Y_REST, Y_REST, u) + hp.H * 4 * u * (1 - u);
        out.r = first ? lerp(WHEEL.edge, WHEEL.pocket, 1 - (1 - u) ** 3) : WHEEL.pocket + hp.jit * Math.sin(Math.PI * u);
      } else {
        const u = clamp01((s - acc) / ROCK);
        qq = -0.17 * Math.exp(-5 * u) * Math.sin(TAU * 1.3 * u);
        out.y = Y_REST;
        out.r = WHEEL.pocket;
      }
      out.th = phiAt(t) + target + qq * POCKET;
    }
    return out;
  };

  const events: SpinEvent[] = [
    { t: TL, kind: 'launch' as const },
    { t: tc, kind: 'diamond' as const },
    { t: t3, kind: 'rotor' as const },
    ...hops.map((x, j) => ({ t: t3 + x.t0 + x.d, kind: 'land' as const, j })),
    { t: tSettle + 0.2, kind: 'settle' as const },
  ].sort((a, b) => a.t - b.t);

  return { tLaunch: TL, tTrack: t1, tDiamond: tc, tRotor: t3, tSettle, tEnd, k, hops, events, rotorAt: phiAt, rotorSpeed: omegaR, ballAt };
}
