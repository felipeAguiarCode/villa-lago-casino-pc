import type { Rng } from '../../core/rng';
import { formChances, HORSES, settleRace, type Race } from '../horses/rules';
import { mindsetStake, type AiMemory, type Mindset } from '../partybj/mindset';

/**
 * Party Lucky Horses: the Lucky Horses race with a crowd at the betting board. The player and four
 * regulars from the Villa Lago circuit bet on the same race, each against the house's book.
 *
 * The book, the race and the payouts are Lucky Horses' own (../horses/rules): every race re-rolls
 * the form and the prices (5% margin), the winner is drawn with the book's chances and a winning
 * bet returns floor(stake × m), stake included. Nothing a regular does touches the player's bets
 * or the draw, so the player's return is exactly Lucky Horses': every horse of a race returns the
 * same r = 1 / Σ 1/m ∈ [≈0.93, 0.95]. A seeded simulation (tests/partyhorses.test.ts, 300,000
 * races) gives 94.9% for a bettor who spreads 20 on every horse and 94.9% for one random horse.
 *
 * The regulars bet with their own chips (10–250 a race). Each race every regular draws a hidden
 * mindset (../partybj/mindset) and bets it here (aiPlan):
 *   calculated   — the best value: the horse whose price is closest to fair. The book prices every
 *                  horse at the same return, so it reads "fair" from the form (the stars): the
 *                  highest form-chance × price; it splits between the two best when they are
 *                  close. Steady stakes.
 *   aggressive   — a long shot (×6 or more) with a big stake; sometimes two long shots.
 *   conservative — the favourite, small stake.
 *   hybrid       — the favourite after a loss, a mid-priced horse after a win (positive
 *                  progression stakes).
 *   hunch        — its lucky number: the horse number of its last win (or a random one), now and
 *                  then a spread over three horses.
 * Since every horse of the book returns about the same, no mindset beats the house. Long-run
 * return (exact expectation over 300,000 seeded races each): calculated 94.8%, aggressive 94.8%,
 * conservative 94.7%, hybrid 94.8%, hunch 94.8%; a regular drawing a mindset every race 94.8%.
 */
export const PH = {
  aiMin: 10,
  aiMax: 250,
  step: 5,
  /** A long shot: priced ×6 or more. */
  longShot: 6,
  /** The calculated read: two horses this close in value share the stake. */
  closeValue: 0.02,
  /** Lone winner: the player alone on a winner priced ×6 or more. */
  loneMult: 6,
} as const;

export interface AiBet {
  /** Index into HORSES. */
  horse: number;
  stake: number;
}

/** What the regular calls out as the chips go down (the view turns it into a tag). */
export type Call = 'value' | 'pair' | 'longshot' | 'longshots' | 'fav' | 'on' | 'lucky' | 'spread';

export interface AiPlan {
  bets: AiBet[];
  call: Call;
  /** A close call (thinks a little longer). */
  close: boolean;
}

/** A regular who can't cover the minimum leaves the table. */
export const isBroke = (chips: number) => chips < PH.aiMin;

/** The favourite: the best chance (ties: the lower number). */
export function favourite(race: Race): number {
  let best = 0;
  for (let i = 1; i < race.p.length; i++) if (race.p[i] > race.p[best] + 1e-12) best = i;
  return best;
}

/**
 * A punter's read of each price: its own chance from the form (the stars) × the price. Above 1 the
 * price looks generous, below 1 short. The book's true return is the same on every horse.
 */
export const valueRead = (race: Race): number[] => {
  const est = formChances(race.form);
  return race.mult.map((m, i) => est[i] * m);
};

/** Horses from the best value to the worst: the book's return first, then the form read, then the shorter price. */
export function byValue(race: Race): number[] {
  const v = valueRead(race);
  return race.mult
    .map((_, i) => i)
    .sort((a, b) => race.rtp[b] - race.rtp[a] > 1e-9 ? 1 : race.rtp[a] - race.rtp[b] > 1e-9 ? -1 : v[b] - v[a] || race.p[b] - race.p[a] || a - b);
}

/** Horses priced ×6 or more, longest price first. */
export function longShots(race: Race): number[] {
  return race.mult
    .map((_, i) => i)
    .filter((i) => race.mult[i] >= PH.longShot)
    .sort((a, b) => race.mult[b] - race.mult[a] || a - b);
}

/** A mid-priced horse: not the favourite, the price closest to ×4.5. */
export function midPriced(race: Race): number {
  const fav = favourite(race);
  let best = -1;
  for (let i = 0; i < race.mult.length; i++) {
    if (i === fav) continue;
    if (best < 0 || Math.abs(race.mult[i] - 4.5) < Math.abs(race.mult[best] - 4.5)) best = i;
  }
  return best;
}

/** `k` different horses at random, none of them in `not`. */
function others(k: number, not: readonly number[], rng: Rng): number[] {
  const pool = HORSES.map((_, i) => i).filter((i) => !not.includes(i));
  const out: number[] = [];
  while (out.length < k && pool.length) out.push(pool.splice(rng(pool.length), 1)[0]);
  return out;
}

/** The stake on each of `k` horses out of a total, in steps, at least the minimum and within the chips (0 when it can't be done). */
function share(total: number, k: number, chips: number): number {
  const per = Math.max(PH.aiMin, Math.round(total / k / PH.step) * PH.step);
  const cap = Math.floor(chips / k / PH.step) * PH.step;
  const out = Math.min(per, cap, PH.aiMax);
  return out >= PH.aiMin ? out : 0;
}

/**
 * How a regular bets this race in mindset `m`. `chips` is what they hold, `lucky` the horse of
 * their last win (null if none yet). Every stake is a multiple of PH.step within
 * [PH.aiMin, PH.aiMax] and the bets never add up to more than `chips` (which must be ≥ PH.aiMin).
 */
export function aiPlan(m: Mindset, race: Race, o: { chips: number; mem: AiMemory; lucky: number | null }, rng: Rng): AiPlan {
  const stake = mindsetStake(m, { chips: o.chips, min: PH.aiMin, max: PH.aiMax, step: PH.step, mem: o.mem }, rng);
  const one = (horse: number, call: Call, close = false): AiPlan => ({ bets: [{ horse, stake }], call, close });
  const many = (horses: number[], per: number, call: Call, close: boolean, fallback: Call): AiPlan =>
    per > 0 ? { bets: horses.map((horse) => ({ horse, stake: per })), call, close } : one(horses[0], fallback, close);
  switch (m) {
    case 'calculated': {
      const order = byValue(race);
      const v = valueRead(race);
      const close = v[order[0]] - v[order[1]] < PH.closeValue;
      return close ? many(order.slice(0, 2), share(stake, 2, o.chips), 'pair', true, 'value') : one(order[0], 'value');
    }
    case 'aggressive': {
      const ls = longShots(race);
      // no price of ×6 or more on the board: the longest one
      const pool = ls.length ? ls : [race.mult.indexOf(Math.max(...race.mult))];
      const first = pool[rng(pool.length)];
      if (pool.length >= 2 && rng(10) < 3) {
        const second = pool.filter((i) => i !== first)[rng(pool.length - 1)];
        return many([first, second], share(stake * 1.2, 2, o.chips), 'longshots', false, 'longshot');
      }
      return one(first, 'longshot');
    }
    case 'conservative':
      return one(favourite(race), 'fav');
    case 'hybrid':
      // presses on a livelier price after a win, back to the favourite after a loss
      return o.mem.lastNet > 0 ? one(midPriced(race), 'on') : one(favourite(race), 'fav');
    case 'hunch': {
      const lucky = o.lucky ?? rng(HORSES.length);
      if (rng(4) === 0) return many([lucky, ...others(2, [lucky], rng)], share(stake, 3, o.chips), 'spread', false, 'lucky');
      return one(lucky, 'lucky');
    }
  }
}

/** A regular's bets as Lucky Horses' bet map (spot id → stake). */
export function betMap(bets: readonly AiBet[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of bets) {
    const id = HORSES[b.horse].id;
    out[id] = (out[id] ?? 0) + b.stake;
  }
  return out;
}

/** Settles a regular's bets with Lucky Horses' book: total wagered and total returned. */
export function settleAi(bets: readonly AiBet[], race: Race, winner: number): { wager: number; ret: number } {
  const ret = settleRace(betMap(bets), race, winner);
  return {
    wager: bets.reduce((a, b) => a + b.stake, 0),
    ret: Object.values(ret).reduce((a, b) => a + b, 0),
  };
}

/** The player won on a horse priced ×6 or more and none of the regulars had backed it. */
export function isLoneWinner(player: Record<string, number>, regulars: readonly (readonly AiBet[])[], race: Race, winner: number): boolean {
  if ((player[HORSES[winner].id] ?? 0) <= 0 || race.mult[winner] < PH.loneMult) return false;
  return regulars.every((bets) => bets.length > 0 && bets.every((b) => b.horse !== winner));
}
