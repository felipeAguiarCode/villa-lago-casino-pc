/**
 * The race itself, planned before the gates open (pure: no three.js). The finishing order is drawn
 * by the rules first; here every horse gets a finishing time in that order (a close call between
 * the first two) and a pace line with random bursts and slow-downs, so the field changes leaders
 * on the way round but crosses the line exactly in the drawn order.
 */

export interface RacePlan {
  /** Seconds at which each horse (by index) crosses the line. */
  T: number[];
  /** Seconds until the whole field has pulled up after the line. */
  dur: number;
  /** Distance along the lap (0 at the start line, `lap` at the finish) of horse i at time t. */
  s(i: number, t: number): number;
  /** Speed (units/s) of horse i at time t. */
  v(i: number, t: number): number;
  /** Distance between the winner and the second when the winner hits the line. */
  margin: number;
  leadChanges: number;
}

const K = 240;
/** Pulling up after the line: the speed decays with this time constant. */
const COAST = 0.5;

interface Pace {
  /** Normalised cumulative distance at K+1 points of the horse's own race time. */
  P: Float32Array;
  /** Speed factor (relative pace) at those points. */
  w: Float32Array;
  /** ∫w over the race (normalisation). */
  area: number;
}

function pace(T: number, rnd: () => number): Pace {
  const bumps = Array.from({ length: 4 + Math.floor(rnd() * 3) }, () => ({
    c: 0.08 + 0.9 * rnd(),
    s: 0.04 + 0.09 * rnd(),
    a: rnd() < 0.5 ? -(0.15 + 0.3 * rnd()) : 0.15 + 0.4 * rnd(),
  }));
  const w = new Float32Array(K + 1);
  for (let k = 0; k <= K; k++) {
    const u = k / K;
    let x = 1;
    for (const b of bumps) x += b.a * Math.exp(-(((u - b.c) / b.s) ** 2));
    // out of the gate: everyone needs half a second to reach full stride
    x = Math.max(0.35, x) * (1 - Math.exp(-(u * T) / 0.45));
    w[k] = x;
  }
  const P = new Float32Array(K + 1);
  for (let k = 1; k <= K; k++) P[k] = P[k - 1] + (w[k - 1] + w[k]) / 2 / K;
  const area = P[K];
  for (let k = 0; k <= K; k++) P[k] /= area;
  return { P, w, area };
}

const lerpArr = (a: Float32Array, u: number) => {
  const f = Math.min(1, Math.max(0, u)) * K;
  const i = Math.min(K - 1, Math.floor(f));
  const x = f - i;
  return a[i] * (1 - x) + a[i + 1] * x;
};

function build(order: number[], T: number[], paces: Pace[], lap: number) {
  const vEnd = paces.map((p, i) => (lap * p.w[K]) / p.area / T[i]);
  const s = (i: number, t: number) => {
    if (t <= 0) return 0;
    if (t < T[i]) return lap * lerpArr(paces[i].P, t / T[i]);
    return lap + vEnd[i] * COAST * (1 - Math.exp(-(t - T[i]) / COAST));
  };
  const v = (i: number, t: number) => {
    if (t <= 0) return 0;
    if (t < T[i]) return (lap * lerpArr(paces[i].w, t / T[i])) / paces[i].area / T[i];
    return vEnd[i] * Math.exp(-(t - T[i]) / COAST);
  };
  const dur = Math.max(...T) + COAST * 3.4;
  const margin = lap - s(order[1], T[order[0]]);
  return { s, v, dur, margin };
}

/**
 * Plans a race for a finishing `order` (horse indices, winner first) on a lap of `lap` units.
 * A few candidate races are drawn and the liveliest one is kept: more changes of leader, the
 * winner coming from behind now and then, and a field that stays together.
 */
export function planRace(order: number[], lap: number, rnd: () => number = Math.random): RacePlan {
  const n = order.length;
  const T = new Array<number>(n);
  const t1 = 11.6 + 1.1 * rnd();
  let tt = t1;
  T[order[0]] = t1;
  for (let k = 1; k < n; k++) {
    // the runner-up is always close; the rest string out behind
    tt += k === 1 ? 0.04 + 0.5 * Math.pow(rnd(), 1.5) : 0.12 + 0.42 * rnd();
    T[order[k]] = tt;
  }
  let best: { paces: Pace[]; score: number; changes: number } | null = null;
  for (let c = 0; c < 24; c++) {
    const paces = T.map((x) => pace(x, rnd));
    const { s } = build(order, T, paces, lap);
    let leader = -1;
    let changes = 0;
    let spreadBad = 0;
    let winnerLedLate = true;
    for (let k = 0; k <= 80; k++) {
      const t = 1.2 + ((t1 - 1.2) * k) / 80;
      let lead = 0;
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < n; i++) {
        const x = s(i, t);
        if (x > s(lead, t)) lead = i;
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
      }
      if (leader >= 0 && lead !== leader) changes++;
      leader = lead;
      if (hi - lo > 3.2) spreadBad++;
      if (k >= 50 && k <= 66 && lead !== order[0]) winnerLedLate = false;
    }
    const score = Math.min(changes, 6) + (winnerLedLate ? 0 : 1.5) - spreadBad * 0.15 + rnd() * 0.8;
    if (!best || score > best.score) best = { paces, score, changes };
  }
  const { s, v, dur, margin } = build(order, T, best!.paces, lap);
  return { T, dur, s, v, margin, leadChanges: best!.changes };
}
