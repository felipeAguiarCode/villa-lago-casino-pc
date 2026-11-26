import type { Card } from '../../core/cards';
import type { Rng } from '../../core/rng';
import { exactOdds, sampleOdds, type Odds } from './odds';
import { VN, type Decl, type VnConfig } from './rules';

/**
 * The player's strategy for Vanunu (used by the hints and by the balance simulation).
 *
 * - Raise points (after reveals 2 and 4): the hand's value is estimated by playing the position out
 *   at random many times and scoring the best declaration over those futures; RAISE when that value
 *   per chip staked beats a threshold. The thresholds are below zero because the side is only
 *   chosen at the declaration, with five cards of each hand in view (worth a lot more than what the
 *   estimate sees now); they were tuned by simulation.
 * - Swap: every face-up card is tried against every card that could replace it; the swap pays when
 *   the expected result after it (declaring the best side for the new card, folding when the
 *   player still may) beats keeping the hand by more than the fee. A face-down card is never worth
 *   swapping: the new card is as unknown as the old one, so the odds don't move.
 * - Declaration: exact odds over every pair of hidden cards for each hand; the declaration with the
 *   best expected result, or FOLD (when no raise was made) if even that loses more than the Ante.
 */

export interface Position {
  /** The player's face-up cards. */
  pUp: Card[];
  /** The dealer's face-up cards. */
  dUp: Card[];
  /** Other cards seen (a face-up card swapped away). */
  dead: Card[];
}

export interface DeclEv {
  high: number;
  low: number;
  both: number;
}

/** Expected net result (chips) of each declaration with these stakes. */
export function declEv(o: Odds, ante: number, play: number, cfg: VnConfig = VN): DeclEv {
  const st = ante + play;
  const scoop = st * cfg.scoopPays * o.both;
  return {
    high: scoop - st * (1 - o.hw - o.ht),
    low: scoop - st * (1 - o.lw - o.lt),
    both: st * cfg.bothPays * o.both - st * (1 - o.both),
  };
}

export function bestOfEv(ev: DeclEv): { decl: Decl; ev: number } {
  let decl: Decl = 'high';
  if (ev.low > ev[decl]) decl = 'low';
  if (ev.both > ev[decl]) decl = 'both';
  return { decl, ev: ev[decl] };
}

/**
 * Raise thresholds: estimated net per chip staked (Ante + raise) above which the raise is made,
 * after reveal 2 and after reveal 4. Tuned on 132 000 exact positions (6 600 with every swap
 * priced exactly): 97.4% RTP. A nested look-ahead (every future reveal and swap sampled, ~100× the
 * work) agrees on 79% of hands and reaches 97.8%.
 */
export const RAISE_AT = { first: -0.125, second: -0.1 };

export interface RaiseAdvice {
  raise: boolean;
  /** Estimated net per chip staked if the raise is made. */
  perChip: number;
  odds: Odds;
  /** The side that looks best right now. */
  lean: Decl;
}

/** Raise decision after reveal 2 (`first`) or after reveal 4. */
export function raiseAdvice(pos: Position, first: boolean, rng: Rng, n = 1200, cfg: VnConfig = VN): RaiseAdvice {
  const size = first ? cfg.raiseFirst : cfg.raiseSecond;
  const odds = sampleOdds(pos.pUp, pos.dUp, pos.dead, rng, n);
  const b = bestOfEv(declEv(odds, 1, size, cfg));
  const perChip = b.ev / (1 + size);
  const at = first ? RAISE_AT.first : RAISE_AT.second;
  return { raise: perChip > at, perChip, odds, lean: b.decl };
}

export interface DeclAdvice {
  decl: Decl | 'fold';
  /** Expected net in units of the Ante. */
  ev: number;
  evs: DeclEv;
  odds: Odds;
}

/**
 * Declaration with odds already known. `play` is the raise made (0 = none: the declaration adds the
 * 1× bet, or folds).
 */
export function declareFromOdds(odds: Odds, play: number, cfg: VnConfig = VN): DeclAdvice {
  const stakePlay = play || cfg.play1;
  const evs = declEv(odds, 1, stakePlay, cfg);
  const b = bestOfEv(evs);
  if (!play && b.ev < -1) return { decl: 'fold', ev: -1, evs, odds };
  return { decl: b.decl, ev: b.ev, evs, odds };
}

/** Declaration advice with exact odds (five cards up a side). */
export function declareAdvice(pos: Position, play: number, cfg: VnConfig = VN): DeclAdvice {
  return declareFromOdds(exactOdds(pos.pUp, pos.dUp, pos.dead), play, cfg);
}

export interface SwapAdvice {
  /** Index into pUp of the card to swap, or -1 to keep the hand. */
  index: number;
  /** Expected net (Ante units) of keeping the hand and of swapping each face-up card (fee included). */
  keep: number;
  options: number[];
}

/**
 * Value of a position just before the declaration (Ante units): the best declaration, or a fold
 * when no raise was made and the declaration loses more than the Ante.
 */
function endValue(o: Odds, play: number, cfg: VnConfig) {
  return declareFromOdds(o, play, cfg).ev;
}

/**
 * Swap advice. Each face-up card is replaced in turn by every unseen card; each resulting position
 * is scored with `inner` random completions. The fee is in Ante units.
 */
export function swapAdvice(pos: Position, play: number, rng: Rng, inner = 90, cfg: VnConfig = VN): SwapAdvice {
  const seen = new Set<Card>([...pos.pUp, ...pos.dUp, ...pos.dead]);
  const pool: Card[] = [];
  for (let c = 0; c < 52; c++) if (!seen.has(c)) pool.push(c);
  // keeping the hand is scored the same way (as many small samples), so the noise of the small
  // samples lifts both sides of the comparison alike
  let keep = 0;
  for (let k = 0; k < pool.length; k++) keep += endValue(sampleOdds(pos.pUp, pos.dUp, pos.dead, rng, inner), play, cfg);
  keep /= pool.length;
  const options: number[] = [];
  let index = -1;
  let best = keep;
  for (let j = 0; j < pos.pUp.length; j++) {
    const np = pos.pUp.slice();
    const dead = [...pos.dead, pos.pUp[j]];
    let v = 0;
    for (const c of pool) {
      np[j] = c;
      v += endValue(sampleOdds(np, pos.dUp, dead, rng, inner), play, cfg);
    }
    v = v / pool.length - cfg.swapUp;
    options.push(v);
    if (v > best) {
      best = v;
      index = j;
    }
  }
  return { index, keep, options };
}
