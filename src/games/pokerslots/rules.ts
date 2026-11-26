import { parseCard, type Card } from '../../core/cards';
import { seededRng, shuffle, type Rng } from '../../core/rng';

/**
 * Poker Slots: a four-reel card slot machine. Every reel is a strip of the 52 cards, each stop
 * equally likely, the reels independent, so the payline shows four cards dealt with replacement (a
 * pair can be the same card twice). The four-card poker hand on the line is paid by the table.
 *
 * HOLD: after a losing spin that was not itself held, the machine lights its HOLD keys one time in
 * four (PS.holdChance). The next spin, at the same bet, keeps the held reels still. A held spin never
 * offers holds again.
 *
 * Return (exact, src/games/pokerslots/sim.ts): 79.5 % for a player who never holds, 97.38 % for a
 * player who holds as the hint does: the held subset with the best expected pay, when that beats
 * the machine's own return.
 */
export type PsKey = 'royal' | 'straightFlush' | 'quads' | 'straight' | 'flush' | 'trips' | 'twoPair' | 'jacks';

export interface PsRow {
  key: PsKey;
  /** Pays "for" one coin (stake included). */
  pays: number;
  /** Example cards for the pictorial paytable; null is an ANY tile. */
  art: (string | null)[];
}

export const PS_ROWS: PsRow[] = [
  { key: 'royal', pays: 1000, art: ['Jh', 'Qh', 'Kh', 'Ah'] },
  { key: 'straightFlush', pays: 150, art: ['6s', '7s', '8s', '9s'] },
  { key: 'quads', pays: 60, art: ['9h', '9s', '9d', '9c'] },
  { key: 'straight', pays: 12, art: ['7d', '8s', '9h', 'Tc'] },
  { key: 'flush', pays: 10, art: ['2c', '6c', '9c', 'Kc'] },
  { key: 'trips', pays: 8, art: ['Qs', 'Qh', 'Qd', null] },
  { key: 'twoPair', pays: 5, art: ['8c', '8d', '5h', '5s'] },
  { key: 'jacks', pays: 2, art: ['Jc', 'Jh', null, null] },
];

export const PS = {
  coins: [5, 25, 100] as const,
  maxCoins: 5,
  reels: 4,
  /** Chance that a losing, un-held spin lights the HOLD keys. */
  holdChance: 0.25,
  /** Long-run return with the best holds: a held spin is worth taking when it beats this. */
  rtp: 0.97383,
  /** Return of a player who never holds. */
  baseRtp: 0.79509,
};

export const artCards = (row: PsRow) => row.art.map((a) => (a ? parseCard(a) : null));

/**
 * Row of PS_ROWS paid by four cards (indexes 0-51), -1 for none. Allocation-free: the hint runs it
 * a few hundred thousand times.
 */
export function psRow4(a: number, b: number, c: number, d: number): number {
  // ranks 0 (deuce) .. 12 (ace), sorted with a 4-element network
  let r0 = a % 13;
  let r1 = b % 13;
  let r2 = c % 13;
  let r3 = d % 13;
  let t: number;
  if (r0 > r1) (t = r0), (r0 = r1), (r1 = t);
  if (r2 > r3) (t = r2), (r2 = r3), (r3 = t);
  if (r0 > r2) (t = r0), (r0 = r2), (r2 = t);
  if (r1 > r3) (t = r1), (r1 = r3), (r3 = t);
  if (r1 > r2) (t = r1), (r1 = r2), (r2 = t);
  const s = (a / 13) | 0;
  const flush = s === ((b / 13) | 0) && s === ((c / 13) | 0) && s === ((d / 13) | 0);
  if (r0 === r3) return 2;
  if (r0 < r1 && r1 < r2 && r2 < r3 && (r3 - r0 === 3 || (r3 === 12 && r0 === 0 && r1 === 1 && r2 === 2))) {
    if (flush) return r0 === 9 ? 0 : 1;
    return 3;
  }
  if (flush) return 4;
  if (r0 === r2 || r1 === r3) return 5;
  if (r0 === r1 && r2 === r3) return 6;
  if ((r0 === r1 && r0 >= 9) || (r1 === r2 && r1 >= 9) || (r2 === r3 && r2 >= 9)) return 7;
  return -1;
}

export const psRow = (cards: readonly Card[]) => psRow4(cards[0], cards[1], cards[2], cards[3]);

/** Coins returned for a line at `coins` coins bet. */
export function psPays(cards: readonly Card[], coins: number): number {
  const r = psRow(cards);
  return r < 0 ? 0 : PS_ROWS[r].pays * coins;
}

/** The four reel strips: fixed orders of the 52 cards (the same machine every visit). */
export const STRIPS: Card[][] = [0x5eed1, 0x5eed2, 0x5eed3, 0x5eed4].map((seed) => shuffle(Array.from({ length: 52 }, (_, i) => i), seededRng(seed)));

/** Card shown on the payline by reel `reel` at stop `stop`. */
export const cardAt = (reel: number, stop: number) => STRIPS[reel][((stop % 52) + 52) % 52];

/** A spin: new stops for the reels that are not held. */
export function spinStops(stops: number[], held: boolean[], rng: Rng): number[] {
  return stops.map((s, i) => (held[i] ? s : rng(52)));
}
