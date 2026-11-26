import type { Card } from '../../core/cards';
import { PS, PS_ROWS, psRow4 } from './rules';

const PAY = PS_ROWS.map((r) => r.pays);
const pay4 = (a: number, b: number, c: number, d: number) => {
  const r = psRow4(a, b, c, d);
  return r < 0 ? 0 : PAY[r];
};

/**
 * Expected coins (per coin bet) of a spin that keeps the cards of `held` and draws the others
 * uniformly from 52. Order does not matter (the paytable is symmetric), so it is cached by the
 * held cards, sorted.
 */
const cache = new Map<string, number>();

export function heldEV(held: readonly Card[]): number {
  const key = [...held].sort((x, y) => x - y).join(',');
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const h = [...held];
  let sum = 0;
  let n = 0;
  if (h.length === 3) {
    for (let d = 0; d < 52; d++) sum += pay4(h[0], h[1], h[2], d);
    n = 52;
  } else if (h.length === 2) {
    for (let c = 0; c < 52; c++) for (let d = 0; d < 52; d++) sum += pay4(h[0], h[1], c, d);
    n = 52 * 52;
  } else if (h.length === 1) {
    for (let b = 0; b < 52; b++) for (let c = 0; c < 52; c++) for (let d = 0; d < 52; d++) sum += pay4(h[0], b, c, d);
    n = 52 * 52 * 52;
  } else if (h.length === 4) {
    sum = pay4(h[0], h[1], h[2], h[3]);
    n = 1;
  }
  const ev = n ? sum / n : PS.baseRtp;
  if (cache.size > 4000) cache.clear();
  cache.set(key, ev);
  return ev;
}

export interface HoldAdvice {
  /** Reels to hold (all false: just spin). */
  held: boolean[];
  /** Expected coins per coin of the advised spin. */
  ev: number;
}

/**
 * The best use of a HOLD offer: the subset of reels (one to three) whose held spin pays the most
 * on average, taken only when it beats the machine's long-run return. Otherwise a plain spin is
 * better: a held spin never lights a new offer, a plain losing spin can.
 */
export function holdAdvice(line: readonly Card[]): HoldAdvice {
  let best = { mask: 0, ev: PS.rtp };
  for (let mask = 1; mask < 15; mask++) {
    const cards = line.filter((_, i) => mask & (1 << i));
    const ev = heldEV(cards);
    // ties: fewer reels held
    if (ev > best.ev + 1e-9 || (Math.abs(ev - best.ev) <= 1e-9 && best.mask && cards.length < bits(best.mask))) best = { mask, ev };
  }
  return { held: line.map((_, i) => !!(best.mask & (1 << i))), ev: best.ev };
}

const bits = (m: number) => ((m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1));
