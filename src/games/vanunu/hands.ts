import { rankLabel, rankOf, type Card } from '../../core/cards';

/**
 * Hand values for Vanunu: the HIGH hand is ordinary poker (best five of seven, the same number as
 * `bestOf(cards).score` from core/eval5), the LOW hand is A-5 lowball (aces low, straights and
 * flushes don't count, the lowest hand wins, no qualifier).
 *
 * The `*Score` functions allocate nothing: the balance simulation calls them millions of times.
 */

const B = 15;
const pack = (cat: number, a = 0, b = 0, c = 0, d = 0, e = 0) => ((((cat * B + a) * B + b) * B + c) * B + d) * B + e;

const CNT = new Int32Array(15);
const SUIT_N = new Int32Array(4);
const SUIT_M = new Int32Array(4);
const KICK = [0, 0, 0, 0, 0];

/** Highest straight in a rank bit mask (bit r set for rank r, 2..14); 0 for none. A-2-3-4-5 counts. */
function straightHigh(m: number): number {
  if (m & (1 << 14)) m |= 2;
  for (let h = 14; h >= 5; h--) {
    const need = 0b11111 << (h - 4);
    if ((m & need) === need) return h;
  }
  return 0;
}

/** Best HIGH poker hand of 5..7 cards. Same number as core/eval5 `bestOf(cards).score`. */
export function highScore(cards: ArrayLike<number>, n = cards.length): number {
  CNT.fill(0);
  SUIT_N.fill(0);
  SUIT_M.fill(0);
  let mask = 0;
  for (let i = 0; i < n; i++) {
    const c = cards[i];
    const r = (c % 13) + 2;
    const s = (c / 13) | 0;
    CNT[r]++;
    SUIT_N[s]++;
    SUIT_M[s] |= 1 << r;
    mask |= 1 << r;
  }
  let fs = -1;
  for (let s = 0; s < 4; s++) if (SUIT_N[s] >= 5) fs = s;
  if (fs >= 0) {
    const sh = straightHigh(SUIT_M[fs]);
    if (sh) return pack(sh === 14 ? 9 : 8, sh);
  }
  // groups: the highest quad, trips, pairs
  let quad = 0;
  let t1 = 0;
  let t2 = 0;
  let p1 = 0;
  let p2 = 0;
  for (let r = 14; r >= 2; r--) {
    const k = CNT[r];
    if (k === 4) quad = r;
    else if (k === 3) {
      if (!t1) t1 = r;
      else if (!t2) t2 = r;
    } else if (k === 2) {
      if (!p1) p1 = r;
      else if (!p2) p2 = r;
    }
  }
  /** Highest ranks present, skipping up to two excluded ranks. */
  const top = (k: number, x1: number, x2: number, out: number[]) => {
    let j = 0;
    for (let r = 14; r >= 2 && j < k; r--) if (CNT[r] && r !== x1 && r !== x2) out[j++] = r;
    return out;
  };
  const K = KICK;
  if (quad) {
    top(1, quad, 0, K);
    return pack(7, quad, K[0]);
  }
  if (t1 && (t2 || p1)) return pack(6, t1, t2 > p1 ? t2 : p1);
  if (fs >= 0) {
    const m = SUIT_M[fs];
    let j = 0;
    for (let r = 14; r >= 2 && j < 5; r--) if (m & (1 << r)) K[j++] = r;
    return pack(5, K[0], K[1], K[2], K[3], K[4]);
  }
  const sh = straightHigh(mask);
  if (sh) return pack(4, sh);
  if (t1) {
    top(2, t1, 0, K);
    return pack(3, t1, K[0], K[1]);
  }
  if (p1 && p2) {
    top(1, p1, p2, K);
    return pack(2, p1, p2, K[0]);
  }
  if (p1) {
    top(3, p1, 0, K);
    return pack(1, p1, K[0], K[1], K[2]);
  }
  top(5, 0, 0, K);
  return pack(0, K[0], K[1], K[2], K[3], K[4]);
}

// ------------------------------------------------------------------ LOW (A-5 lowball)

/** Low rank of a card: ace = 1, otherwise 2..13. */
export const lowRank = (c: Card) => {
  const r = rankOf(c);
  return r === 14 ? 1 : r;
};

/** Categories of a low hand, best (lowest) first. Straights and flushes don't exist here. */
export const LOW_CAT = ['noPair', 'pair', 'twoPair', 'trips', 'fullHouse', 'quads'] as const;

const LC = new Int32Array(14);

/**
 * Best A-5 LOW hand of 5..7 cards: a lower number is a better low. Five different ranks always beat
 * a pair; between hands of the same kind the highest card decides first, then the next (8-4-3-2-A
 * beats 8-5-3-2-A). Paired hands compare the pair first.
 */
export function lowScore(cards: ArrayLike<number>, n = cards.length): number {
  LC.fill(0);
  let distinct = 0;
  for (let i = 0; i < n; i++) {
    const r = cards[i] % 13;
    const lr = r === 12 ? 1 : r + 2;
    if (!LC[lr]++) distinct++;
  }
  if (distinct >= 5) {
    // the five lowest different ranks, compared from the highest
    let a = 0, b = 0, c = 0, d = 0, e = 0;
    let j = 0;
    for (let r = 1; r <= 13 && j < 5; r++) {
      if (!LC[r]) continue;
      if (j === 0) e = r;
      else if (j === 1) d = r;
      else if (j === 2) c = r;
      else if (j === 3) b = r;
      else a = r;
      j++;
    }
    return pack(0, a, b, c, d, e);
  }
  if (distinct === 4) {
    // one pair: the lowest rank that can pair, with the other three as kickers
    let pr = 0;
    for (let r = 1; r <= 13; r++) if (LC[r] >= 2) {
      pr = r;
      break;
    }
    const k: number[] = [];
    for (let r = 13; r >= 1; r--) if (LC[r] && r !== pr) k.push(r);
    return pack(1, pr, k[0], k[1], k[2]);
  }
  if (distinct === 3) {
    const pairs: number[] = [];
    for (let r = 1; r <= 13; r++) if (LC[r] >= 2) pairs.push(r);
    if (pairs.length >= 2) {
      const lo = pairs[0];
      const hi = pairs[1];
      let kick = 0;
      for (let r = 13; r >= 1; r--) if (LC[r] && r !== lo && r !== hi) {
        kick = r;
        break;
      }
      return pack(2, hi, lo, kick);
    }
    const tr = pairs[0];
    const k: number[] = [];
    for (let r = 13; r >= 1; r--) if (LC[r] && r !== tr) k.push(r);
    return pack(3, tr, k[0], k[1]);
  }
  // two ranks: a full house when possible, otherwise four of a kind
  let lo = 0;
  let hi = 0;
  for (let r = 1; r <= 13; r++) if (LC[r]) {
    if (!lo) lo = r;
    else hi = r;
  }
  if (LC[lo] >= 3 && LC[hi] >= 2) return pack(4, lo, hi);
  if (LC[hi] >= 3 && LC[lo] >= 2) return pack(4, hi, lo);
  const q = LC[lo] >= 4 ? lo : hi;
  return pack(5, q, q === lo ? hi : lo);
}

/** Low value of exactly five cards (the reference the 7-card version is tested against). */
export function lowKey5(five: Card[]): number {
  const cnt = new Map<number, number>();
  for (const c of five) cnt.set(lowRank(c), (cnt.get(lowRank(c)) ?? 0) + 1);
  const g = [...cnt.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const shape = g.map((x) => x[1]).join('');
  const cat = shape === '11111' ? 0 : shape === '2111' ? 1 : shape === '221' ? 2 : shape === '311' ? 3 : shape === '32' ? 4 : 5;
  const r = g.map((x) => x[0]);
  return pack(cat, r[0], r[1], r[2], r[3], r[4]);
}

export interface LowHand {
  /** Lower is better. */
  score: number;
  /** Index into LOW_CAT. */
  cat: number;
  /** The five low ranks, highest first (ace = 1). */
  ranks: number[];
  /** The five cards that make it. */
  cards: Card[];
}

/** Best LOW hand with its five cards (for the table: tags and highlights). */
export function bestLow(cards: Card[]): LowHand {
  let best: Card[] = [];
  let bs = Infinity;
  const n = cards.length;
  const pick: Card[] = [];
  const rec = (start: number) => {
    if (pick.length === 5) {
      const s = lowKey5(pick);
      if (s < bs) {
        bs = s;
        best = pick.slice();
      }
      return;
    }
    for (let i = start; i <= n - (5 - pick.length); i++) {
      pick.push(cards[i]);
      rec(i + 1);
      pick.pop();
    }
  };
  rec(0);
  const cat = Math.floor(bs / B ** 5);
  const ranks = best.map(lowRank).sort((a, b) => b - a);
  return { score: bs, cat, ranks, cards: best };
}

/** "7-5-4-2-A" (highest first; aces print as A). */
export const lowName = (h: LowHand) => h.ranks.map((r) => (r === 1 ? 'A' : rankLabel(r))).join('-');
