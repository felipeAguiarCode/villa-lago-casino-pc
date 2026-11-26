import { rankOf, type Card } from '../../core/cards';
import { cryptoRng, shuffle, type Rng } from '../../core/rng';

/**
 * High & Low, against the house, one 52-card deck. Aces are high (2 lowest, A highest).
 *
 * The current card is face up before the bets. The player bets that the next card from the deck is
 * HIGHER or LOWER (ties lose both) and/or the SAME rank.
 *
 * HIGHER / LOWER pay a total-return multiplier worked out from the cards still in the deck:
 *   m = floor((0.95 / P) × 20) / 20, with P = k / n (k winning cards among the n left),
 * computed in integers as floor(19·n / k) / 20. So m·P ≤ 0.95: the return of every HIGHER / LOWER
 * bet is at most 95% by construction, whatever the deck holds.
 * A side is closed when it can't win (P = 0: HIGHER on an Ace, LOWER on a 2) or when a win would
 * return less than the stake (m < 1, only when P > 0.95 late in the deck).
 *
 * SAME pays a fixed ×12 total (11:1): its return is 12·k/n, 70.6% on a fresh deck (3 of 51) and
 * lower or higher as the deck runs down (see tests/highlow.test.ts for the averages). SAME is
 * closed when no card of that rank is left, and also when 12·k/n would pass 95% (late in the deck),
 * so no bet on the table ever returns more than 95%.
 *
 * The card that comes out becomes the current card of the next round; the deck is reshuffled
 * (all 51 other cards) when fewer than 12 cards remain, or when no side could be bet.
 */
export const HL = { minBet: 5, maxBet: 1000, sameMax: 250, sameMult: 12, reshuffleBelow: 12 };

export type HlSide = 'high' | 'low' | 'same';
export const HL_SIDES: HlSide[] = ['high', 'low', 'same'];

/** Total-return multiplier per side; 0 = closed. */
export type HlBoard = Record<HlSide, number>;

/** Winning cards (k) for each side among the cards left, and the number left (n). */
export function sideCounts(cur: Card, left: readonly Card[]): { high: number; low: number; same: number; n: number } {
  const r = rankOf(cur);
  let high = 0;
  let low = 0;
  let same = 0;
  for (const c of left) {
    const x = rankOf(c);
    if (x > r) high++;
    else if (x < r) low++;
    else same++;
  }
  return { high, low, same, n: left.length };
}

/** floor((0.95 / (k/n)) × 20) / 20 in integers; 0 when the side can't pay at least the stake back. */
export function multiplier(k: number, n: number): number {
  if (k <= 0 || n <= 0) return 0;
  const steps = Math.floor((19 * n) / k);
  return steps >= 20 ? steps / 20 : 0;
}

/** Multipliers shown on the boxes for the current card and the cards left in the deck. */
export function hlBoard(cur: Card, left: readonly Card[]): HlBoard {
  const k = sideCounts(cur, left);
  return {
    high: multiplier(k.high, k.n),
    low: multiplier(k.low, k.n),
    // SAME closes in the rare late-deck states where its fixed ×12 would return more than 95%
    same: k.same > 0 && HL.sameMult * k.same <= 0.95 * k.n ? HL.sameMult : 0,
  };
}

/** Exact expected return per unit staked on each side (0 for a closed side). */
export function hlRtp(cur: Card, left: readonly Card[]): HlBoard {
  const k = sideCounts(cur, left);
  const b = hlBoard(cur, left);
  return { high: (b.high * k.high) / k.n, low: (b.low * k.low) / k.n, same: (b.same * k.same) / k.n };
}

/** Where the next card fell compared to the current one. */
export function hlResult(cur: Card, next: Card): HlSide {
  const a = rankOf(cur);
  const b = rankOf(next);
  return b > a ? 'high' : b < a ? 'low' : 'same';
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** Total returned per side (stake + winnings, 0 for a loss). Bets on a closed side return 0. */
export function settleHl(cur: Card, next: Card, bets: Partial<Record<HlSide, number>>, board: HlBoard) {
  const result = hlResult(cur, next);
  const ret: Record<HlSide, number> = { high: 0, low: 0, same: 0 };
  for (const s of HL_SIDES) {
    const b = bets[s] ?? 0;
    if (b > 0 && s === result) ret[s] = cents(b * board[s]);
  }
  return { result, ret };
}

/** The single deck on the table. The current card is kept out of it. */
export class HlDeck {
  private cards: Card[] = [];
  private pos = 0;

  constructor(private rng: Rng = cryptoRng) {
    this.reshuffle();
  }

  /** Shuffles every card except `keep` (the card face up on the table). */
  reshuffle(keep: Card[] = []) {
    const out = new Set(keep);
    this.cards = shuffle(
      Array.from({ length: 52 }, (_, i) => i).filter((c) => !out.has(c)),
      this.rng,
    );
    this.pos = 0;
  }

  get remaining() {
    return this.cards.length - this.pos;
  }

  /** The cards still to come (their order is not used by the odds). */
  get left(): readonly Card[] {
    return this.cards.slice(this.pos);
  }

  draw(): Card {
    if (this.pos >= this.cards.length) throw new Error('deck empty');
    return this.cards[this.pos++];
  }

  /** True when the deck must be reshuffled before the next bet. */
  needsShuffle(cur: Card) {
    if (this.remaining < HL.reshuffleBelow) return true;
    const b = hlBoard(cur, this.left);
    return !b.high && !b.low && !b.same;
  }
}
