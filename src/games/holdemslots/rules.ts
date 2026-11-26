import { parseCard, rankOf, suitOf, type Card } from '../../core/cards';
import { bestOf, Cat5, type Hand5 } from '../../core/eval5';
import { seededRng, shuffle } from '../../core/rng';
import { BOARDS, START_COUNTS } from './startingHands';

/**
 * Hold'em Slots: a seven-reel Texas Hold'em machine. One deck per spin, no repeats:
 *
 * - SPIN pays the ANTE and turns the two HAND reels (your hole cards).
 * - Then PLAY (4× the ante) to spin the board, the flop, turn and river reels, or FOLD (the ante is
 *   lost; the board still runs, to show what would have come).
 * - The best five-card hand of the seven pays the table on the whole bet (ante + play), stake
 *   included: two pair gives the bet back.
 *
 * Return (exact, from the starting-hand table): 97.66 % per chip bet playing as the hint does (it
 * folds 29 % of the hands), 97.40 % playing every hand, which costs more chips per spin.
 */
export type HsKey = 'royal' | 'straightFlush' | 'quads' | 'fullHouse' | 'flush' | 'straight' | 'trips' | 'twoPair';

export interface HsRow {
  key: HsKey;
  cat: Cat5;
  /** Multiple of the whole bet (ante + play) returned. */
  pays: number;
  /** Example for the pictorial paytable; null is an ANY tile. */
  art: (string | null)[];
}

export const HS_ROWS: HsRow[] = [
  { key: 'royal', cat: Cat5.Royal, pays: 500, art: ['As', 'Ks', 'Qs', 'Js', 'Ts'] },
  { key: 'straightFlush', cat: Cat5.StraightFlush, pays: 100, art: ['9h', '8h', '7h', '6h', '5h'] },
  { key: 'quads', cat: Cat5.Quads, pays: 30, art: ['Qs', 'Qh', 'Qd', 'Qc', null] },
  { key: 'fullHouse', cat: Cat5.FullHouse, pays: 7, art: ['Ks', 'Kh', 'Kd', '4c', '4h'] },
  { key: 'flush', cat: Cat5.Flush, pays: 6, art: ['Ad', 'Jd', '8d', '6d', '2d'] },
  { key: 'straight', cat: Cat5.Straight, pays: 4, art: ['Tc', '9d', '8s', '7h', '6c'] },
  { key: 'trips', cat: Cat5.Trips, pays: 2, art: ['7s', '7h', '7d', null, null] },
  { key: 'twoPair', cat: Cat5.TwoPair, pays: 1, art: ['Js', 'Jh', '5d', '5c', null] },
];

/** Seven-card frequencies of each row (out of C(52,7) = 133,784,560), for the odds. */
export const HS_SEVEN = [4324, 37260, 224848, 3473184, 4047644, 6180020, 6461620, 31433400];
export const SEVEN_CARD_HANDS = 133784560;

export const HS = {
  coins: [5, 25, 100] as const,
  maxCoins: 5,
  /** The PLAY bet, in antes. */
  play: 4,
  reels: 7,
  rtp: 0.97658,
  alwaysRtp: 0.97401,
};

export const artCards = (row: HsRow) => row.art.map((a) => (a ? parseCard(a) : null));

const RANK = '23456789TJQKA';

/** The starting-hand class of two hole cards: 'AA', 'AKs', 'T9o'… */
export function startClass(a: Card, b: Card): string {
  const ra = rankOf(a);
  const rb = rankOf(b);
  const hi = Math.max(ra, rb);
  const lo = Math.min(ra, rb);
  const name = RANK[hi - 2] + RANK[lo - 2];
  if (hi === lo) return name;
  return name + (suitOf(a) === suitOf(b) ? 's' : 'o');
}

/** Expected return, per chip of the whole bet, of playing a starting hand to the river. */
export function playEV(a: Card, b: Card): number {
  const counts = START_COUNTS[startClass(a, b)];
  let s = 0;
  for (const r of HS_ROWS) s += counts[r.cat] * r.pays;
  return s / BOARDS;
}

/**
 * PLAY when the hand is worth more played than folded: playing returns (1 + PLAY)·EV antes for
 * the 1 + PLAY bet, folding gives up the one ante already bet.
 */
export function shouldPlay(a: Card, b: Card): boolean {
  return (1 + HS.play) * playEV(a, b) > HS.play;
}

/** Row of HS_ROWS paid by the best hand of the seven cards, -1 for none. */
export function hsRow(h: Hand5): number {
  return HS_ROWS.findIndex((r) => r.cat === h.cat);
}

export function bestHand(seven: readonly Card[]): Hand5 {
  return bestOf([...seven]);
}

/** Chips returned for a played hand: the whole bet (ante + play) times the row's pay. */
export function hsPays(seven: readonly Card[], ante: number): number {
  const r = hsRow(bestHand(seven));
  return r < 0 ? 0 : HS_ROWS[r].pays * ante * (1 + HS.play);
}

/** Exact long-run returns from the table (per chip bet). */
export function exactReturn(): { optimal: number; always: number; playRate: number } {
  let wag = 0;
  let ret = 0;
  let wAll = 0;
  let rAll = 0;
  let played = 0;
  let total = 0;
  const k = 1 + HS.play;
  for (const [name, counts] of Object.entries(START_COUNTS)) {
    const w = name.length === 2 ? 6 : name.endsWith('s') ? 4 : 12;
    let ev = 0;
    for (const r of HS_ROWS) ev += counts[r.cat] * r.pays;
    ev /= BOARDS;
    total += w;
    wAll += k * w;
    rAll += k * ev * w;
    if (k * ev > HS.play) {
      wag += k * w;
      ret += k * ev * w;
      played += w;
    } else wag += w;
  }
  return { optimal: ret / wag, always: rAll / wAll, playRate: played / total };
}

/** The seven reel strips: fixed orders of the 52 cards. */
export const HS_STRIPS: Card[][] = [11, 12, 13, 14, 15, 16, 17].map((k) => shuffle(Array.from({ length: 52 }, (_, i) => i), seededRng(0x4e1d0 + k)));

/** The stops that put a dealt card on each reel's payline. */
export const stopsFor = (cards: readonly Card[]) => cards.map((c, i) => HS_STRIPS[i].indexOf(c));
