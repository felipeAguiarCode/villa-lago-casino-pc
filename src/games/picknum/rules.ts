import { makeCard, rankOf, type Card } from '../../core/cards';
import { cryptoRng, type Rng } from '../../core/rng';

/**
 * Pick a Number, against the house. The dealer turns a TARGET card (Ace to 10, Ace = 1) face up and
 * lays five cards face down in a row. Exactly one of them has the target's number, in a random
 * place, and the other four are four other, different numbers — unless the house slipped in its
 * Joker (probability 1/20): then the Joker takes the matching card's place and nothing matches.
 *
 * Chips go under any of the five cards. A card with the target's number pays 4:1 (×5 total).
 * P(a given card matches) = 19/20 × 1/5 = 0.19, so the return to player is 0.19 × 5 = 95%
 * on every card, whatever the player picks.
 */
export const PN = { minBet: 5, maxBet: 500, slots: 5, pays: 4, jokerOneIn: 20 };

/** The house Joker (the red one of the card art). */
export const PN_JOKER: Card = 52;

export interface PnLayout {
  target: Card;
  row: Card[];
  /** Place of the matching card in the row, -1 when the Joker is in. */
  match: number;
  joker: boolean;
}

/** The number of a card for this game: Ace = 1, 2..10 as printed (0 for the Joker). */
export function numberOf(c: Card): number {
  if (c >= 52) return 0;
  const r = rankOf(c);
  return r === 14 ? 1 : r;
}

/** Card of number n (1..10) and suit s. */
export const numberCard = (n: number, s: number): Card => makeCard(n === 1 ? 14 : n, s);

/**
 * Deals one round. The draws, in order: Joker or not (1 in 20), the place of the match (or Joker),
 * the target's number and suit, the matching card's suit (not the target's), then the four other
 * numbers (a partial Fisher–Yates over the nine numbers left) and their suits.
 */
export function dealPn(rng: Rng = cryptoRng): PnLayout {
  const joker = rng(PN.jokerOneIn) === 0;
  const pos = rng(PN.slots);
  const tn = rng(10) + 1;
  const ts = rng(4);
  const ms = (ts + 1 + rng(3)) % 4;
  const others = Array.from({ length: 10 }, (_, i) => i + 1).filter((n) => n !== tn);
  for (let i = 0; i < PN.slots - 1; i++) {
    const j = i + rng(others.length - i);
    const t = others[i];
    others[i] = others[j];
    others[j] = t;
  }
  const row: Card[] = [];
  let k = 0;
  for (let i = 0; i < PN.slots; i++) {
    if (i === pos) row.push(joker ? PN_JOKER : numberCard(tn, ms));
    else row.push(numberCard(others[k++], rng(4)));
  }
  return { target: numberCard(tn, ts), row, match: joker ? -1 : pos, joker };
}

/** Total returned per place (stake + winnings, 0 for a loss). */
export function settlePn(layout: PnLayout, bets: number[]): number[] {
  const n = numberOf(layout.target);
  return layout.row.map((c, i) => (numberOf(c) === n && (bets[i] ?? 0) > 0 ? bets[i] * (1 + PN.pays) : 0));
}

/** Exact return to player per unit staked on one card. */
export const pnRtp = () => ((PN.jokerOneIn - 1) / PN.jokerOneIn / PN.slots) * (1 + PN.pays);
