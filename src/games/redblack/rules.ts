import { suitOf, type Card } from '../../core/cards';
import { cryptoRng, type Rng } from '../../core/rng';

/**
 * Red or Black, against the house. A 54-card deck: the 52 cards (0..51, suit = floor(c / 13):
 * 0 ♠, 1 ♥, 2 ♦, 3 ♣) plus two Jokers (52, 53). One card is drawn; the deck is reshuffled every
 * round.
 *
 * RED / BLACK pay 1:1 (×2 total), each suit pays 3:1 (×4 total). A Joker beats every bet.
 * Return to player: colour 26/54 × 2 = 96.30%, suit 13/54 × 4 = 96.30% (house edge 1/27 = 3.70%).
 */
export const RB = { minBet: 5, maxBet: 1000, suitMax: 500, colorPays: 1, suitPays: 3 };

export type RbSpot = 'red' | 'black' | 'spades' | 'hearts' | 'diamonds' | 'clubs';
export const RB_SPOTS: RbSpot[] = ['red', 'black', 'hearts', 'diamonds', 'clubs', 'spades'];
/** Suit bet of each suit index (0 ♠, 1 ♥, 2 ♦, 3 ♣). */
export const SUIT_SPOT: RbSpot[] = ['spades', 'hearts', 'diamonds', 'clubs'];

export const RB_JOKERS: Card[] = [52, 53];
export const isRbJoker = (c: Card) => c === 52 || c === 53;

/** The 54 cards in order. */
export const rbDeck = (): Card[] => Array.from({ length: 54 }, (_, i) => i);

/** Fisher–Yates shuffle of a fresh 54-card deck. */
export function shuffleRb(rng: Rng = cryptoRng): Card[] {
  const d = rbDeck();
  for (let i = d.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    const t = d[i];
    d[i] = d[j];
    d[j] = t;
  }
  return d;
}

/** One round: the deck is shuffled and its top card drawn. */
export const drawRb = (rng: Rng = cryptoRng): Card => shuffleRb(rng)[0];

/** The bets a card wins (none for a Joker). */
export function rbWinners(card: Card): RbSpot[] {
  if (isRbJoker(card)) return [];
  const s = suitOf(card);
  return [s === 1 || s === 2 ? 'red' : 'black', SUIT_SPOT[s]];
}

/** Total-return multiplier of a winning bet on a spot. */
export const rbMult = (spot: RbSpot) => 1 + (spot === 'red' || spot === 'black' ? RB.colorPays : RB.suitPays);

/** Total returned per spot (stake + winnings, 0 for a loss). */
export function settleRb(card: Card, bets: Partial<Record<RbSpot, number>>): Record<RbSpot, number> {
  const ret = { red: 0, black: 0, spades: 0, hearts: 0, diamonds: 0, clubs: 0 } as Record<RbSpot, number>;
  for (const s of rbWinners(card)) ret[s] = (bets[s] ?? 0) * rbMult(s);
  return ret;
}

/** Exact return per unit staked on a spot, over the 54 equally likely cards. */
export function rbRtp(spot: RbSpot): number {
  let back = 0;
  for (const c of rbDeck()) back += settleRb(c, { [spot]: 1 })[spot];
  return back / 54;
}
