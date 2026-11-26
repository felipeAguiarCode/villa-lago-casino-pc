import { freshDeck, type Card } from '../../core/cards';
import { shuffle, type Rng } from '../../core/rng';
import { sampleOdds } from './odds';
import { settleVanunu, VN, type Decl, type VnConfig } from './rules';
import { declareFromOdds, declEv, raiseAdvice, swapAdvice, type Position } from './strategy';

/**
 * Whole-hand simulator for the balance tests. The reveal order is the deal order: which card the
 * player clicks never matters (all seven are unknown), so the first k cards of each hand are the
 * ones face up after reveal k.
 */

export type SwapPick = { kind: 'none' } | { kind: 'up' | 'down'; index: number };

export interface Policy {
  /** Raise now (`first`: after reveal 2, otherwise after reveal 4)? */
  raise(pos: Position, first: boolean, rng: Rng): boolean;
  /** Swap after the fifth reveal. `play` is the raise made, in Antes (0 = none yet). */
  swap(pos: Position, play: number, rng: Rng): SwapPick;
  declare(pos: Position, play: number, rng: Rng): Decl | 'fold';
}

export interface SimResult {
  hands: number;
  /** Chips staked: Ante, raises and swap fees. */
  wagered: number;
  returned: number;
  /** returned / wagered. */
  rtp: number;
  /**
   * The same, with each declared hand's result replaced by its expectation over the hidden cards
   * (estimated with `evalN` fresh samples): unbiased, and much less noisy than the dealt outcome.
   */
  rtpExpected: number;
  expReturned: number;
  /** Net result per hand in Antes. */
  perAnte: number;
  raisedFirst: number;
  raisedSecond: number;
  swaps: number;
  folds: number;
  decl: Record<Decl, number>;
  bothWins: number;
  scoops: number;
  splits: number;
}

export function simulate(hands: number, policy: Policy, rng: Rng, cfg: VnConfig = VN, evalN = 0, evalRng: Rng = rng): SimResult {
  const r: SimResult = {
    hands,
    wagered: 0,
    returned: 0,
    rtp: 0,
    rtpExpected: 0,
    expReturned: 0,
    perAnte: 0,
    raisedFirst: 0,
    raisedSecond: 0,
    swaps: 0,
    folds: 0,
    decl: { high: 0, low: 0, both: 0 },
    bothWins: 0,
    scoops: 0,
    splits: 0,
  };
  const deck = freshDeck(1);
  for (let h = 0; h < hands; h++) {
    shuffle(deck, rng);
    let next = 14;
    const p: Card[] = deck.slice(0, 7);
    const d: Card[] = deck.slice(7, 14);
    const dead: Card[] = [];
    const pos = (k: number): Position => ({ pUp: p.slice(0, k), dUp: d.slice(0, k), dead: dead.slice() });
    let play = 0;
    if (policy.raise(pos(2), true, rng)) {
      play = cfg.raiseFirst;
      r.raisedFirst++;
    } else if (policy.raise(pos(4), false, rng)) {
      play = cfg.raiseSecond;
      r.raisedSecond++;
    }
    let fee = 0;
    const sw = policy.swap(pos(5), play, rng);
    if (sw.kind !== 'none') {
      r.swaps++;
      if (sw.kind === 'up') {
        fee = cfg.swapUp;
        dead.push(p[sw.index]);
        p[sw.index] = deck[next++];
      } else {
        fee = cfg.swapDown;
        p[5 + (sw.index % 2)] = deck[next++];
      }
    }
    const decl = policy.declare(pos(5), play, rng);
    if (decl === 'fold') {
      r.folds++;
      r.wagered += 1 + fee;
      continue;
    }
    if (!play) play = cfg.play1;
    r.decl[decl]++;
    const res = settleVanunu(p, d, decl, { ante: 1, play, swap: fee }, cfg);
    r.wagered += 1 + play + fee;
    r.returned += res.ret.ante + res.ret.play;
    if (evalN) {
      const o = sampleOdds(p.slice(0, 5), d.slice(0, 5), dead, evalRng, evalN);
      r.expReturned += 1 + play + declEv(o, 1, play, cfg)[decl];
    }
    if (res.outcome === 'bothWin') r.bothWins++;
    else if (res.outcome === 'scoop') r.scoops++;
    else if (res.outcome === 'split') r.splits++;
  }
  r.rtp = r.returned / r.wagered;
  r.rtpExpected = r.expReturned / r.wagered;
  r.perAnte = (r.returned - r.wagered) / hands;
  return r;
}

// ------------------------------------------------------------------ policies

export interface BestOptions {
  /** Samples for the raise estimates. */
  raiseN?: number;
  /** Samples per position at the declaration (0 = exact enumeration). */
  declN?: number;
  /** Samples per replacement card when pricing a swap (0 = no swaps). */
  swapN?: number;
}

/** The strategy behind the hints (sample counts lowered for speed in long simulations). */
export function bestPolicy(o: BestOptions = {}, cfg: VnConfig = VN): Policy {
  const raiseN = o.raiseN ?? 400;
  const declN = o.declN ?? 600;
  const swapN = o.swapN ?? 0;
  return {
    raise: (pos, first, rng) => raiseAdvice(pos, first, rng, raiseN, cfg).raise,
    swap: (pos, play, rng) => {
      if (!swapN) return { kind: 'none' };
      const a = swapAdvice(pos, play, rng, swapN, cfg);
      return a.index < 0 ? { kind: 'none' } : { kind: 'up', index: a.index };
    },
    declare: (pos, play, rng) => declareFromOdds(sampleOdds(pos.pUp, pos.dUp, pos.dead, rng, declN), play, cfg).decl,
  };
}

/** Naive aggressive play for the balance checks. */
export function naivePolicy(o: { raiseEarly?: boolean; both?: boolean; swap?: 'up' | 'down' }, base: Policy): Policy {
  return {
    raise: (pos, first, rng) => (o.raiseEarly ? first : base.raise(pos, first, rng)),
    swap: (pos, play, rng) => (o.swap === 'down' ? { kind: 'down', index: 0 } : o.swap === 'up' ? { kind: 'up', index: worstUp(pos) } : base.swap(pos, play, rng)),
    declare: (pos, play, rng) => (o.both ? 'both' : base.declare(pos, play, rng)),
  };
}

/** The face-up card a naive player throws away: the highest one. */
function worstUp(pos: Position): number {
  let k = 0;
  for (let i = 1; i < pos.pUp.length; i++) if (pos.pUp[i] % 13 > pos.pUp[k] % 13) k = i;
  return k;
}
