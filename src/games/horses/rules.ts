import type { Rng } from '../../core/rng';

/**
 * Lucky Horses: five toy horses run one lap and you bet against the house's book.
 *
 * Every race each horse gets a random form (1.0–5.0, shown as stars). The form sets the chances:
 * p_i ∝ exp(K · form_i), with the favourite capped at 50%. The house then prices the book in
 * half steps (minimum ×2), the way a bookmaker does: the odds are rounded down so that no price is
 * better than 95% of fair, and then lengthened half a step at a time while the book still keeps
 * its 5% margin (Σ 1/m ≥ 1/0.95). The true win chances are the book's: p_i = r / m_i with
 * r = 1 / Σ 1/m_i, so every horse returns the same r ∈ [≈0.93, 0.95] and
 *
 *   m_i = max(1.5, floor((0.95 / p_i) · 2) / 2)      (checked; RTP p_i · m_i ≤ 95% always)
 *
 * A bet on the winner returns floor(stake × m) (stake included); every other bet loses.
 * The dealer covers each bet with floor(stake × m) − stake when betting closes.
 */

export interface HorseDef {
  id: string;
  n: number;
  color: string;
  /** Darker shade of the silks (trims). */
  dark: string;
  coat: string;
  mane: string;
}

export const HORSES: HorseDef[] = [
  { id: 'h1', n: 1, color: '#d6262e', dark: '#7d0d14', coat: '#7a4527', mane: '#24140c' },
  { id: 'h2', n: 2, color: '#1f63d0', dark: '#0b2c66', coat: '#d9d2c2', mane: '#f4ecd8' },
  { id: 'h3', n: 3, color: '#f3c21a', dark: '#8a6a05', coat: '#a65f33', mane: '#3a2014' },
  { id: 'h4', n: 4, color: '#24a04a', dark: '#0d4f21', coat: '#33241d', mane: '#120c08' },
  { id: 'h5', n: 5, color: '#8a3fc4', dark: '#3f1563', coat: '#c99a55', mane: '#f1e2c0' },
];

export const HR = {
  /** Steepness of the form → chance curve. */
  k: 0.6,
  /** The favourite's chance is capped here before pricing. */
  pMax: 0.5,
  /** House target return (the book's margin is 5%). */
  rtp: 0.95,
  minMult: 2,
  maxMult: 40,
  minBet: 5,
  maxBet: 1000,
} as const;

export interface Race {
  /** Form 1.0–5.0 per horse (shown as stars). */
  form: number[];
  /** True win probability per horse (sums to 1). */
  p: number[];
  /** Total-return multiplier per horse (stake included), in half steps. */
  mult: number[];
  /** Return of every bet of this race: p_i × m_i. */
  rtp: number[];
}

const uniform = (rng: Rng) => rng(1_000_000_000) / 1_000_000_000;

/** Chances from the form: softmax exp(K·form), favourite capped at HR.pMax. */
export function formChances(form: number[]): number[] {
  const w = form.map((f) => Math.exp(HR.k * f));
  const sum = w.reduce((a, b) => a + b, 0);
  const p = w.map((x) => x / sum);
  const top = p.indexOf(Math.max(...p));
  if (p[top] > HR.pMax) {
    const rest = 1 - p[top];
    for (let i = 0; i < p.length; i++) p[i] = i === top ? HR.pMax : (p[i] * (1 - HR.pMax)) / rest;
  }
  return p;
}

/** The literal price of a chance: max(1.5, floor((0.95/p)·2)/2), never above 95% RTP. */
export function priceOf(p: number): number {
  let m = Math.max(1.5, Math.floor((HR.rtp / p) * 2) / 2);
  while (m > 1.5 && p * m > HR.rtp + 1e-12) m -= 0.5;
  return m;
}

/** Books a race from a form line (exported for tests). */
export function bookRace(form: number[]): Race {
  const est = formChances(form);
  // the margin is kept by a hair more than 5%, so the prices never sit on a rounding edge
  const target = (1 / HR.rtp) * (1 + 1e-9);
  const m = est.map((p) => Math.min(HR.maxMult, Math.max(HR.minMult, Math.floor((HR.rtp / p) * 2) / 2)));
  const S = () => m.reduce((a, x) => a + 1 / x, 0);
  // never give the house a book under its margin (only reachable through the ×2 / ×40 clamps)
  while (S() < target) {
    let best = -1;
    for (let i = 0; i < m.length; i++) if (m[i] > HR.minMult && (best < 0 || m[i] * est[i] > m[best] * est[best])) best = i;
    if (best < 0) break;
    m[best] -= 0.5;
  }
  // lengthen the worst-value prices half a step at a time while the margin holds
  for (;;) {
    const order = m.map((_, i) => i).sort((a, b) => m[a] * est[a] - m[b] * est[b]);
    const s = S();
    const i = order.find((j) => m[j] + 0.5 <= HR.maxMult && s - 1 / m[j] + 1 / (m[j] + 0.5) >= target);
    if (i === undefined) break;
    m[i] += 0.5;
  }
  const r = 1 / S();
  const p = m.map((x) => r / x);
  const mult = p.map(priceOf);
  return { form: [...form], p, mult, rtp: p.map((x, i) => x * mult[i]) };
}

/** A new race: random form for every horse, then the book. */
export function newRace(rng: Rng): Race {
  const form = HORSES.map(() => (10 + rng(41)) / 10);
  return bookRace(form);
}

/** Draws the winner (index into HORSES) with the race's true chances. */
export function pickWinner(race: Race, rng: Rng): number {
  let u = uniform(rng);
  for (let i = 0; i < race.p.length; i++) {
    u -= race.p[i];
    if (u < 0) return i;
  }
  return race.p.length - 1;
}

/** Finishing order (indices): the winner first, the rest drawn one by one weighted by p. */
export function finishOrder(race: Race, winner: number, rng: Rng): number[] {
  const out = [winner];
  const left = race.p.map((_, i) => i).filter((i) => i !== winner);
  while (left.length) {
    const tot = left.reduce((a, i) => a + race.p[i], 0);
    let u = uniform(rng) * tot;
    let k = left.length - 1;
    for (let j = 0; j < left.length; j++) {
      u -= race.p[left[j]];
      if (u < 0) {
        k = j;
        break;
      }
    }
    out.push(left.splice(k, 1)[0]);
  }
  return out;
}

/** Total returned per horse spot: floor(stake × m) on the winner, 0 elsewhere. */
export function settleRace(bets: Record<string, number>, race: Race, winner: number): Record<string, number> {
  const ret: Record<string, number> = {};
  HORSES.forEach((h, i) => {
    const stake = bets[h.id] ?? 0;
    ret[h.id] = i === winner && stake > 0 ? Math.floor(stake * race.mult[i] + 1e-9) : 0;
  });
  return ret;
}

/** The dealer's covering stake for a bet: what it pays if that horse wins. */
export const raceCover = (stake: number, mult: number) => Math.max(0, Math.floor(stake * mult + 1e-9) - stake);

/** Odds as printed on the board: "×4.5". */
export const multLabel = (m: number) => `×${Number.isInteger(m) ? m : m.toFixed(1)}`;
