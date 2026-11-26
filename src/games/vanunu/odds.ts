import type { Card } from '../../core/cards';
import type { Rng } from '../../core/rng';
import { highScore, lowScore } from './hands';

/**
 * Chances of the two sides for a Vanunu position: the player and the dealer each hold seven cards,
 * some face up (known) and the rest unknown to everyone. The unknown cards are uniformly drawn from
 * the cards nobody has seen (`dead` lists cards seen elsewhere, e.g. a swapped-out up card).
 *
 * Outcomes per side: W (player strictly better), T (tie), L (dealer strictly better).
 */
export interface Odds {
  /** HIGH: player wins / ties. */
  hw: number;
  ht: number;
  /** LOW: player wins / ties. */
  lw: number;
  lt: number;
  /** Player strictly wins both sides (a scoop). */
  both: number;
}

const POOL = new Int32Array(52);
const PH = new Int32Array(7);
const DH = new Int32Array(7);

function unseen(pUp: readonly Card[], dUp: readonly Card[], dead: readonly Card[]): number {
  const seen = new Uint8Array(52);
  for (const c of pUp) seen[c] = 1;
  for (const c of dUp) seen[c] = 1;
  for (const c of dead) seen[c] = 1;
  let n = 0;
  for (let c = 0; c < 52; c++) if (!seen[c]) POOL[n++] = c;
  return n;
}

/** Monte Carlo odds: `n` random completions of both hands. */
export function sampleOdds(pUp: readonly Card[], dUp: readonly Card[], dead: readonly Card[], rng: Rng, n: number): Odds {
  const u = unseen(pUp, dUp, dead);
  const kp = pUp.length;
  const kd = dUp.length;
  const need = 14 - kp - kd;
  for (let i = 0; i < kp; i++) PH[i] = pUp[i];
  for (let i = 0; i < kd; i++) DH[i] = dUp[i];
  let hw = 0, ht = 0, lw = 0, lt = 0, both = 0;
  for (let s = 0; s < n; s++) {
    for (let i = 0; i < need; i++) {
      const j = i + rng(u - i);
      const t = POOL[i];
      POOL[i] = POOL[j];
      POOL[j] = t;
    }
    for (let i = kp; i < 7; i++) PH[i] = POOL[i - kp];
    for (let i = kd; i < 7; i++) DH[i] = POOL[7 - kp + i - kd];
    const a = highScore(PH, 7);
    const b = highScore(DH, 7);
    const c = lowScore(PH, 7);
    const d = lowScore(DH, 7);
    const H = a > b;
    const L = c < d;
    if (H) hw++;
    else if (a === b) ht++;
    if (L) lw++;
    else if (c === d) lt++;
    if (H && L) both++;
  }
  return { hw: hw / n, ht: ht / n, lw: lw / n, lt: lt / n, both: both / n };
}

/**
 * Exact odds when both sides show five cards: every pair of hidden cards for the player against
 * every disjoint pair for the dealer (about 670 000 match-ups for 42 unseen cards; a few ms).
 */
export function exactOdds(pUp: readonly Card[], dUp: readonly Card[], dead: readonly Card[] = []): Odds {
  if (pUp.length !== 5 || dUp.length !== 5) throw new Error('exactOdds needs five up cards a side');
  const u = unseen(pUp, dUp, dead);
  const m = (u * (u - 1)) / 2;
  const A = new Int32Array(m);
  const Bq = new Int32Array(m);
  const ph = new Float64Array(m);
  const pl = new Float64Array(m);
  const dh = new Float64Array(m);
  const dl = new Float64Array(m);
  for (let i = 0; i < 5; i++) {
    PH[i] = pUp[i];
    DH[i] = dUp[i];
  }
  let k = 0;
  for (let a = 0; a < u; a++)
    for (let b = a + 1; b < u; b++) {
      PH[5] = DH[5] = POOL[a];
      PH[6] = DH[6] = POOL[b];
      A[k] = a;
      Bq[k] = b;
      ph[k] = highScore(PH, 7);
      pl[k] = lowScore(PH, 7);
      dh[k] = highScore(DH, 7);
      dl[k] = lowScore(DH, 7);
      k++;
    }
  let tot = 0, hw = 0, ht = 0, lw = 0, lt = 0, both = 0;
  for (let i = 0; i < m; i++) {
    const a = A[i], b = Bq[i], x = ph[i], y = pl[i];
    for (let j = 0; j < m; j++) {
      const c = A[j], e = Bq[j];
      if (c === a || c === b || e === a || e === b) continue;
      tot++;
      const H = x > dh[j];
      const L = y < dl[j];
      if (H) hw++;
      else if (x === dh[j]) ht++;
      if (L) lw++;
      else if (y === dl[j]) lt++;
      if (H && L) both++;
    }
  }
  return { hw: hw / tot, ht: ht / tot, lw: lw / tot, lt: lt / tot, both: both / tot };
}
