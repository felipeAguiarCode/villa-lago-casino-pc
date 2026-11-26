import type { Card } from '../../core/cards';
import { bestOf, type Hand5 } from '../../core/eval5';
import { bestLow, type LowHand } from './hands';

/**
 * Vanunu against the house: a house-banked version of the hi-lo home game.
 *
 * Seven cards face down each, nobody looks. Five reveal rounds (the player turns one of their own
 * cards, then the dealer turns one of its own), one optional paid swap for the player, then the
 * player declares HIGH, LOW or BOTH and everything turns over.
 *
 * Betting (one PLAY bet per hand, like Ultimate Texas Hold'em):
 * - ANTE, required;
 * - after reveal 2: RAISE 4× or check; after reveal 4: RAISE 3× or check;
 * - at the declaration: PLAY 1× or FOLD (losing the Ante) when no raise was made.
 *
 * Settlement (the pot is split between the best HIGH and the best LOW, as in the home game, with
 * the dealer always playing both ends):
 * - HIGH or LOW: lose your side → Ante and Play lose. Win it while the dealer wins the other side →
 *   split pot, both push. Win both sides (a scoop) → Ante and Play pay 1:1. A tie on the declared
 *   side pushes.
 * - BOTH: win both sides strictly → Ante and Play pay 2:1. Anything less (a tie included) loses.
 * - Swap fees go to the house: 1× the Ante for a face-up card (the new card comes face up), 2× for
 *   a face-down one (the new card stays face down, so the odds can't move: never worth it).
 *
 * Why not "win your side, get paid 1:1" (the first proposal): with both rows of five up cards in
 * view, the side the player leads on wins 70% of the time (E[max(P(high), P(low))] = 0.699 over
 * 132 000 exact positions), so every chip on it would be worth +40% and a blind 3× raise +120% a
 * hand; ties are 1 in 2000 and no commission short of ~65% fixes that. Splitting the pot like the
 * home game keeps the declaration decisive (pick the side you can't lose) and leaves the profit in
 * scoops: P(scoop) = 0.16 on average.
 *
 * RTP (returned / wagered, swap fees counted as wagered), measured on 132 000 exact positions
 * (6 600 of them with every possible swap priced exactly):
 * - best strategy found (strategy.ts, the hints): 97.4%; a nested look-ahead for the raises (every
 *   future reveal and swap sampled) reaches 97.8% ± 0.15%, an estimate of the optimum;
 * - never swapping 95.0%, never raising 88.1%;
 * - naive play: always raise 4× 92.3%, always declare BOTH 66.3%; swapping every hand and swapping
 *   face-down cards only lose more (tests/vanunu.test.ts).
 * Ties are 1 in 2 000 a side, so whether they push or go to the house moves the RTP by < 0.05%.
 */
export const VN = {
  decks: 1,
  minAnte: 5,
  maxAnte: 500,
  reveals: 5,
  /** Raise (× Ante) after reveal 2 and after reveal 4; the declaration bet when no raise was made. */
  raiseFirst: 4,
  raiseSecond: 3,
  play1: 1,
  /** A scoop on HIGH or LOW pays this on Ante and Play. */
  scoopPays: 1,
  /** BOTH won pays this on Ante and Play. */
  bothPays: 2,
  /** Swap fees (× Ante): a face-up card (the new one comes face up) or a face-down one. */
  swapUp: 1,
  swapDown: 2,
};

export type VnConfig = typeof VN;
export type Decl = 'high' | 'low' | 'both';
/** Result of one side for the player: 1 won, 0 tie, -1 lost. */
export type SideRes = -1 | 0 | 1;

export interface ShowdownHands {
  ph: Hand5;
  dh: Hand5;
  pl: LowHand;
  dl: LowHand;
  high: SideRes;
  low: SideRes;
}

/** Both evaluations of both hands (seven cards each). */
export function showdown(player: Card[], dealer: Card[]): ShowdownHands {
  const ph = bestOf(player);
  const dh = bestOf(dealer);
  const pl = bestLow(player);
  const dl = bestLow(dealer);
  return { ph, dh, pl, dl, high: Math.sign(ph.score - dh.score) as SideRes, low: Math.sign(dl.score - pl.score) as SideRes };
}

export type Outcome = 'scoop' | 'split' | 'push' | 'lose' | 'bothWin' | 'bothLose' | 'fold';

export interface VnBets {
  ante: number;
  play: number;
  swap: number;
}

export interface VnResult {
  /** Total returned per bet (stake + winnings; 0 = lost). Swap fees never come back. */
  ret: { ante: number; play: number; swap: number };
  outcome: Outcome;
}

/** Settles a declared hand from both sides' results. */
export function settleSides(high: SideRes, low: SideRes, decl: Decl | 'fold', bets: VnBets, cfg: VnConfig = VN): VnResult {
  const ret = { ante: 0, play: 0, swap: 0 };
  if (decl === 'fold') return { ret, outcome: 'fold' };
  const { ante, play } = bets;
  if (decl === 'both') {
    if (high > 0 && low > 0) {
      ret.ante = ante * (1 + cfg.bothPays);
      ret.play = play * (1 + cfg.bothPays);
      return { ret, outcome: 'bothWin' };
    }
    return { ret, outcome: 'bothLose' };
  }
  const mine = decl === 'high' ? high : low;
  const other = decl === 'high' ? low : high;
  if (mine < 0) return { ret, outcome: 'lose' };
  if (mine > 0 && other > 0) {
    ret.ante = ante * (1 + cfg.scoopPays);
    ret.play = play * (1 + cfg.scoopPays);
    return { ret, outcome: 'scoop' };
  }
  ret.ante = ante;
  ret.play = play;
  return { ret, outcome: mine > 0 ? 'split' : 'push' };
}

/** Settles a hand from the cards. */
export function settleVanunu(player: Card[], dealer: Card[], decl: Decl | 'fold', bets: VnBets, cfg: VnConfig = VN): VnResult & { sd: ShowdownHands } {
  const sd = showdown(player, dealer);
  return { ...settleSides(sd.high, sd.low, decl, bets, cfg), sd };
}

/** Swap fee for a card (× Ante, in chips). */
export const swapFee = (ante: number, faceUp: boolean, cfg: VnConfig = VN) => ante * (faceUp ? cfg.swapUp : cfg.swapDown);
