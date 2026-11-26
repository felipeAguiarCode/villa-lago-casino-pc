/**
 * The regulars' hidden mindsets (every Party table).
 *
 * Each time a regular gets a new hand, the engine draws how they will play it. The player never
 * sees the mindset; they only see the bets and the decisions it produces. The draw is weighted by
 * the regular's temperament and by how their night is going:
 *   - a losing streak tempts them to chase (aggressive) or to tighten up (conservative);
 *   - a stack well above the buy-in makes them loose ("house money": aggressive, hunch);
 *   - a stack close to empty makes them careful.
 * A regular never plays two hands in a row with the same mindset.
 *
 * Each table turns the mindset into play with its own strategy functions; the shared meaning is:
 *   calculated   — the table's best strategy (where the table allows it, card counting / dead
 *                  cards), steady stakes sized by the edge it sees;
 *   aggressive   — presses: bigger stakes, raises / doubles / plays the borderline spots, side bets;
 *   conservative — protects the stack: small stakes, folds or stands on the marginal spots;
 *   hybrid       — best strategy on clear spots, leans with its momentum on the borderline ones
 *                  (pressing after wins, tightening after losses), positive progression stakes;
 *   hunch        — follows a gut feeling: mostly sound, with the odd surprise, random stakes.
 */
import type { Rng } from '../../core/rng';
import type { AiProfile, Style } from './rules';

export type Mindset = 'calculated' | 'aggressive' | 'conservative' | 'hybrid' | 'hunch';
export const MINDSETS: Mindset[] = ['calculated', 'aggressive', 'conservative', 'hybrid', 'hunch'];

/** What a regular remembers between hands (kept by the table view, one per seat). */
export interface AiMemory {
  /** +n after n wins in a row, −n after n losses in a row, 0 after a push. */
  streak: number;
  /** Hands played since sitting down. */
  hands: number;
  /** The last hand's mindset (never drawn twice in a row). */
  last: Mindset | null;
  /** The last hand's net result in chips (for progressions). */
  lastNet: number;
}

export const newMemory = (): AiMemory => ({ streak: 0, hands: 0, last: null, lastNet: 0 });

/** Hidden temperament: base weights of each mindset by the regular's nature. */
const TEMPERAMENT: Record<Style, Record<Mindset, number>> = {
  bookish: { calculated: 5, aggressive: 1.5, conservative: 2, hybrid: 3, hunch: 0.6 },
  cautious: { calculated: 2.5, aggressive: 0.8, conservative: 5, hybrid: 2, hunch: 0.8 },
  daring: { calculated: 2, aggressive: 5, conservative: 0.8, hybrid: 2.5, hunch: 2 },
  wildcard: { calculated: 1.5, aggressive: 2.5, conservative: 1.2, hybrid: 2, hunch: 4 },
};

/**
 * Draws the mindset for a regular's next hand. `chips` is what they hold now, `profile.bank`
 * their buy-in.
 */
export function drawMindset(profile: AiProfile, mem: AiMemory, chips: number, rng: Rng): Mindset {
  const w = { ...TEMPERAMENT[profile.style] };
  const ratio = chips / profile.bank;
  if (mem.streak <= -3) {
    // chasing or tightening, depending on nature
    w.aggressive *= profile.style === 'cautious' ? 1.1 : 1.8;
    w.conservative *= profile.style === 'cautious' ? 1.8 : 1.3;
    w.calculated *= 0.8;
  } else if (mem.streak >= 3) {
    w.hybrid *= 1.6;
    w.aggressive *= 1.4;
  }
  if (ratio >= 1.5) {
    w.aggressive *= 1.5;
    w.hunch *= 1.5;
  } else if (ratio <= 0.35) {
    w.conservative *= 2;
    w.aggressive *= 0.6;
  }
  if (mem.last) w[mem.last] = 0;
  const total = MINDSETS.reduce((s, m) => s + w[m], 0);
  // draw on a fine grid with the table's rng (integer-only Rng)
  let x = (rng(1_000_000) / 1_000_000) * total;
  for (const m of MINDSETS) {
    x -= w[m];
    if (x < 0) return m;
  }
  return MINDSETS.find((m) => w[m] > 0)!;
}

/** Updates the memory after a hand settles; `net` is the hand's result in chips (0 = push). */
export function remember(mem: AiMemory, mindset: Mindset, net: number): void {
  mem.hands++;
  mem.last = mindset;
  mem.lastNet = net;
  if (net > 0) mem.streak = mem.streak > 0 ? mem.streak + 1 : 1;
  else if (net < 0) mem.streak = mem.streak < 0 ? mem.streak - 1 : -1;
  else mem.streak = 0;
}

/**
 * The stake for the next hand, in `step`s, within [min, max] and what the regular can afford
 * (`cover` = how many times the stake they must be able to put on the felt in the worst case,
 * e.g. 6 for Ultimate Texas Hold'em's ante + blind + 4× play). `edge` (−1..1) is an optional read
 * of how favourable the next hand is (a blackjack true count); only `calculated` uses it.
 */
export function mindsetStake(
  m: Mindset,
  o: { chips: number; min: number; max: number; step: number; cover?: number; mem: AiMemory; edge?: number },
  rng: Rng,
): number {
  const { min, max, step } = o;
  const unit = Math.max(min, Math.round((min * 3) / step) * step);
  const pick = (lo: number, hi: number) => {
    const a = Math.ceil(lo / step);
    const b = Math.max(a, Math.floor(hi / step));
    return (a + rng(b - a + 1)) * step;
  };
  let bet: number;
  switch (m) {
    case 'calculated': {
      const e = o.edge ?? 0;
      // flat unit; spread up with a favourable read, down to the minimum with a bad one
      bet = e >= 0.5 ? unit * 4 : e >= 0.25 ? unit * 2 : e <= -0.25 ? min : unit;
      break;
    }
    case 'aggressive':
      bet = pick(unit * 2, Math.min(max, unit * 5));
      break;
    case 'conservative':
      bet = pick(min, Math.max(min, unit));
      break;
    case 'hybrid': {
      // positive progression: press half the win after a win, back to one unit after a loss
      const prev = o.mem.lastNet;
      bet = prev > 0 ? Math.round((unit + prev / 2) / step) * step : unit;
      break;
    }
    case 'hunch':
      bet = pick(min, Math.min(max, unit * 4));
      break;
  }
  const afford = Math.floor(o.chips / (o.cover ?? 1) / step) * step;
  return Math.max(0, Math.min(bet, max, afford));
}

/** Whether a regular in this mindset adds an optional side bet this hand. */
export function mindsetSideBet(m: Mindset, rng: Rng): boolean {
  switch (m) {
    case 'aggressive':
      return rng(10) < 8;
    case 'hunch':
      return rng(2) === 0;
    case 'hybrid':
      return rng(4) === 0;
    case 'calculated':
      return false;
    case 'conservative':
      return rng(10) === 0;
  }
}

/** Thinking time before a decision (seconds): quick on clear spots, longer on close ones. */
export function thinkTime(m: Mindset, close: boolean, rng: Rng): number {
  const base = m === 'calculated' ? 0.45 : m === 'conservative' ? 0.55 : m === 'hunch' ? 0.3 : 0.4;
  return base + (close ? 0.35 : 0) + rng(25) / 100;
}
