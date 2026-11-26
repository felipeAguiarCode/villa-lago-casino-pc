import type { Rng } from '../../core/rng';
import { CAT, HAND_SIZE, PAYS10, PER_SYMBOL, SP, SYMBOLS, catOfCounts, holdAdvice, playRoundSP, raiseAdvice, scoreOfCounts, SymbolDeck, type SpStrategy, type Sym } from './rules';

/**
 * Exact analysis of Suit Poker: every starting hand, every hold and every raise level, against
 * the exact distribution of the dealer's final hand. Pure computation (no DOM), used by the tests
 * and to derive the strategy written in rules.ts.
 *
 * Method. The player decides (raise, hold) from his five cards H only. By exchangeability of the
 * shuffled deck, the player's replacement cards R can be taken from the deck before the dealer's
 * five, so the dealer's final hand depends only on the cards removed, T = H + R: F(T) is the
 * dealer's final-score distribution given T (five cards from the 48 − |T|, the house way, the
 * draw from what is left). Hands are symbol-count vectors (252 five-card hands), so F is needed
 * for ~7,800 vectors T and everything else is a lookup:
 *   ante(H, h) = Σ_R P(R | H) · [ M(h+R) · P(dealer < h+R) + P(dealer = h+R) ]
 *   raise(H, h) = Σ_R P(R | H) · [ M · P(3K ≤ dealer < h+R) + P(dealer = h+R ≥ 3K) + P(dealer < 3K) ]
 * per unit staked, and a round with k units staked (ante + k−1 raises) returns ante + (k−1)·raise.
 */

const NSC = 7 * 36;

const BIN: number[][] = [];
for (let n = 0; n <= 48; n++) {
  BIN[n] = [];
  for (let k = 0; k <= n; k++) BIN[n][k] = k === 0 || k === n ? 1 : BIN[n - 1][k - 1] + BIN[n - 1][k];
}
const bin = (n: number, k: number) => (k < 0 || n < 0 || k > n ? 0 : BIN[n][k]);

/** All symbol-count vectors of size k. */
function multisets(k: number): number[][] {
  const out: number[][] = [];
  const cur = new Array(SYMBOLS).fill(0);
  const rec = (i: number, left: number) => {
    if (i === SYMBOLS - 1) {
      cur[i] = left;
      out.push(cur.slice());
      return;
    }
    for (let x = left; x >= 0; x--) {
      cur[i] = x;
      rec(i + 1, left - x);
    }
  };
  rec(0, k);
  return out;
}

const MS = [0, 1, 2, 3, 4, 5].map(multisets);
const key6 = (c: readonly number[]) => c[0] + 6 * (c[1] + 6 * (c[2] + 6 * (c[3] + 6 * (c[4] + 6 * c[5]))));
const key9 = (c: readonly number[]) => c[0] + 9 * (c[1] + 9 * (c[2] + 9 * (c[3] + 9 * (c[4] + 9 * c[5]))));

/** Score of every 5-card count vector. */
const SCORE5 = new Int16Array(6 ** 6).fill(-1);
for (const m of MS[5]) SCORE5[key6(m)] = scoreOfCounts(m);

/** The house way on a dealt count vector: what is kept. */
function houseKeepCounts(d: readonly number[]): number[] {
  const k = d.map((x) => (x >= 2 ? x : 0));
  if (k.some((x) => x > 0)) return k;
  const best = d.findIndex((x) => x > 0);
  k[best] = 1;
  return k;
}
const DEALT = MS[5].map((d) => {
  const keep = houseKeepCounts(d);
  return { d, keep, m: HAND_SIZE - keep.reduce((a, b) => a + b, 0) };
});

/** F(T) as cumulative "dealer below": below[s] = P(dealer score < s), s = 0..NSC. */
const fSlot = new Int32Array(9 ** 6).fill(-1);
const fPool: Float64Array[] = [];

function dealerBelow(T: readonly number[]): Float64Array {
  const k = key9(T);
  const slot = fSlot[k];
  if (slot >= 0) return fPool[slot];
  const pmf = new Float64Array(NSC);
  const comp = T.map((x) => PER_SYMBOL - x);
  let N = 0;
  for (const x of comp) N += x;
  const tot = bin(N, HAND_SIZE);
  const comp2 = [0, 0, 0, 0, 0, 0];
  const q = [0, 0, 0, 0, 0, 0];
  for (const { d, keep, m } of DEALT) {
    let p = 1;
    for (let i = 0; i < SYMBOLS && p; i++) p *= bin(comp[i], d[i]);
    if (!p) continue;
    p /= tot;
    for (let i = 0; i < SYMBOLS; i++) comp2[i] = comp[i] - d[i];
    const tot2 = bin(N - HAND_SIZE, m);
    for (const s of MS[m]) {
      let w = 1;
      for (let i = 0; i < SYMBOLS && w; i++) w *= bin(comp2[i], s[i]);
      if (!w) continue;
      for (let i = 0; i < SYMBOLS; i++) q[i] = keep[i] + s[i];
      pmf[SCORE5[key6(q)]] += (p * w) / tot2;
    }
  }
  const below = new Float64Array(NSC + 1);
  for (let s = 0; s < NSC; s++) below[s + 1] = below[s] + pmf[s];
  fSlot[k] = fPool.length;
  fPool.push(below);
  return below;
}

export interface HoldValue {
  /** Symbol counts held. */
  hold: number[];
  /** Expected return per unit on the ante. */
  ante: number;
  /** Expected return per unit on each raise. */
  raise: number;
}

export interface HandStat {
  /** Symbol counts of the dealt hand. */
  counts: number[];
  /** Probability of being dealt it. */
  p: number;
  holds: HoldValue[];
}

export interface Summary {
  /** Total returned / total wagered. */
  rtp: number;
  /** Expected net per round, in antes. */
  netPerAnte: number;
  /** Expected wager per round, in antes. */
  stakePerAnte: number;
  /** Share of rounds raised. */
  raiseRate: number;
}

export interface Analysis {
  hands: HandStat[];
  /** Best hold and best raise level for every starting hand (the best possible strategy). */
  optimal: Summary;
  /** The advice in rules.ts (holdAdvice / raiseAdvice). */
  advice: Summary;
  /** Keep the groups, never raise. */
  simple: Summary;
  /** Best holds, never raise. */
  noRaise: Summary;
  /** Win / push / lose of the player under the advice. */
  winRate: number;
  pushRate: number;
}

/** Value of a hold at k units staked (ante + k−1 raises), in antes returned. */
export const holdReturn = (h: HoldValue, k: number) => h.ante + (k - 1) * h.raise;

/** Cards (symbols) of a count vector. */
export const countsToCards = (c: readonly number[]): Sym[] => c.flatMap((n, s) => Array<Sym>(n).fill(s));

/** Count vector held by a boolean mask over cards. */
export function heldCounts(cards: readonly Sym[], held: readonly boolean[]): number[] {
  const c = [0, 0, 0, 0, 0, 0];
  cards.forEach((s, i) => {
    if (held[i]) c[s]++;
  });
  return c;
}

const sameCounts = (a: readonly number[], b: readonly number[]) => a.every((x, i) => x === b[i]);

/** Evaluates one hold of a dealt hand exactly. */
function holdValue(H: readonly number[], h: readonly number[], pays10: readonly number[], qualScore: number): HoldValue {
  const n = HAND_SIZE - h.reduce((a, b) => a + b, 0);
  const comp = H.map((x) => PER_SYMBOL - x);
  const tot = bin(48 - HAND_SIZE, n);
  const T = [0, 0, 0, 0, 0, 0];
  const P = [0, 0, 0, 0, 0, 0];
  let ante = 0;
  let raise = 0;
  for (const R of MS[n]) {
    let p = 1;
    for (let i = 0; i < SYMBOLS && p; i++) p *= bin(comp[i], R[i]);
    if (!p) continue;
    p /= tot;
    for (let i = 0; i < SYMBOLS; i++) {
      T[i] = H[i] + R[i];
      P[i] = h[i] + R[i];
    }
    const sc = SCORE5[key6(P)];
    const m = pays10[catOfCounts(P)] / 10;
    const f = dealerBelow(T);
    const below = f[sc];
    const eq = f[sc + 1] - below;
    const nq = f[qualScore];
    ante += p * (m * below + eq);
    raise += p * (m * Math.max(0, below - nq) + (sc >= qualScore ? eq : 0) + nq);
  }
  return { hold: h.slice(), ante, raise };
}

function subHolds(H: readonly number[]): number[][] {
  const out: number[][] = [];
  const cur = [0, 0, 0, 0, 0, 0];
  const rec = (i: number) => {
    if (i === SYMBOLS) {
      out.push(cur.slice());
      return;
    }
    for (let x = 0; x <= H[i]; x++) {
      cur[i] = x;
      rec(i + 1);
    }
  };
  rec(0);
  return out;
}

const cache = new Map<string, Analysis>();

/**
 * Runs the exact analysis (a few seconds; memoised). `qualify`: the dealer's category that calls
 * the raises (the push rule); 0 = the dealer always calls (no push rule).
 */
export function analyze(pays10: readonly number[] = PAYS10, qualify: number = SP.qualify): Analysis {
  const ck = `${pays10.join(',')}|${qualify}`;
  const qualScore = qualify * 36;
  const hit = cache.get(ck);
  if (hit) return hit;
  const hands: HandStat[] = [];
  const acc = {
    optimal: { ret: 0, stake: 0, raised: 0 },
    advice: { ret: 0, stake: 0, raised: 0 },
    simple: { ret: 0, stake: 0, raised: 0 },
    noRaise: { ret: 0, stake: 0, raised: 0 },
  };
  let win = 0;
  let push = 0;
  const totH = bin(48, HAND_SIZE);
  for (const H of MS[5]) {
    let p = 1;
    for (let i = 0; i < SYMBOLS; i++) p *= bin(PER_SYMBOL, H[i]);
    p /= totH;
    const holds = subHolds(H).map((h) => holdValue(H, h, pays10, qualScore));
    hands.push({ counts: H.slice(), p, holds });
    // best strategy: every hold at every raise level
    let best = -Infinity;
    let bestK = 1;
    for (const hv of holds)
      for (let k = 1; k <= SP.maxRaises + 1; k++) {
        const v = holdReturn(hv, k) - k;
        if (v > best + 1e-12) {
          best = v;
          bestK = k;
        }
      }
    acc.optimal.ret += p * (best + bestK);
    acc.optimal.stake += p * bestK;
    if (bestK > 1) acc.optimal.raised += p;
    // best holds without raising
    const nr = Math.max(...holds.map((hv) => hv.ante));
    acc.noRaise.ret += p * nr;
    acc.noRaise.stake += p;
    // keep the groups, never raise
    const groups = H.map((x) => (x >= 2 ? x : 0));
    const sv = holds.find((hv) => sameCounts(hv.hold, groups))!;
    acc.simple.ret += p * sv.ante;
    acc.simple.stake += p;
    // the advice
    const cards = countsToCards(H);
    const k = 1 + raiseAdvice(cards);
    const av = holds.find((hv) => sameCounts(hv.hold, heldCounts(cards, holdAdvice(cards))))!;
    acc.advice.ret += p * holdReturn(av, k);
    acc.advice.stake += p * k;
    if (k > 1) acc.advice.raised += p;
    const sh = shares(H, av.hold);
    win += p * sh.w;
    push += p * sh.e;
  }
  const sum = (a: { ret: number; stake: number; raised: number }): Summary => ({
    rtp: a.ret / a.stake,
    netPerAnte: a.ret - a.stake,
    stakePerAnte: a.stake,
    raiseRate: a.raised,
  });
  const out: Analysis = {
    hands,
    optimal: sum(acc.optimal),
    advice: sum(acc.advice),
    simple: sum(acc.simple),
    noRaise: sum(acc.noRaise),
    winRate: win,
    pushRate: push,
  };
  cache.set(ck, out);
  return out;
}

/** P(player wins) and P(push) for a hold, from the same tables. */
function shares(H: readonly number[], h: readonly number[]) {
  const n = HAND_SIZE - h.reduce((a, b) => a + b, 0);
  const comp = H.map((x) => PER_SYMBOL - x);
  const tot = bin(48 - HAND_SIZE, n);
  let w = 0;
  let e = 0;
  for (const R of MS[n]) {
    let p = 1;
    for (let i = 0; i < SYMBOLS && p; i++) p *= bin(comp[i], R[i]);
    if (!p) continue;
    p /= tot;
    const T = H.map((x, i) => x + R[i]);
    const sc = SCORE5[key6(h.map((x, i) => x + R[i]))];
    const f = dealerBelow(T);
    w += p * f[sc];
    e += p * (f[sc + 1] - f[sc]);
  }
  return { w, e };
}

/** Seeded simulation of whole rounds in table order (checks the exact figures). */
export function simulate(rounds: number, rng: Rng, strat: SpStrategy, pays10: readonly number[] = PAYS10) {
  const deck = new SymbolDeck(rng);
  let wagered = 0;
  let returned = 0;
  let fives = 0;
  for (let r = 0; r < rounds; r++) {
    deck.shuffle();
    const { stakes, res } = playRoundSP(deck, 1, strat, pays10);
    wagered += stakes.ante + stakes.raise;
    // per-unit returns (exact multipliers, no rounding: the stake unit is 1)
    const unit = (stake: number, live: boolean) => {
      if (!live) return stake;
      return res.outcome === 'win' ? (stake * pays10[res.player.cat]) / 10 : res.outcome === 'push' ? stake : 0;
    };
    returned += unit(stakes.ante, true) + unit(stakes.raise, res.qualifies);
    if (res.outcome === 'win' && res.player.cat === CAT.five) fives++;
  }
  return { rtp: returned / wagered, wagered, returned, fives };
}
