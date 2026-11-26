import type { Rng } from '../../core/rng';

/**
 * Poker Dice against the dealer: pure rules (no three.js, no DOM).
 *
 * Five poker dice, faces 9 · 10 · J · Q · K · A (stored as 0..5). The player rolls all five, may
 * hold any dice and re-roll the rest up to two more times (three rolls in all), then the dealer
 * plays its own three rolls knowing the player's final hand.
 *
 * Hands, high to low: Five of a kind, Four of a kind, Full house, Straight (A-K-Q-J-10 beats
 * K-Q-J-10-9), Three of a kind, Two pair, One pair, Bust. No flushes. Equal categories compare the
 * combination's ranks, then the kickers; equal hands are the same five faces (a push).
 *
 * The dealer's house way (fixed): after every roll it stops as soon as its hand beats the player's.
 * Otherwise it holds the dice that maximise P(beat) + ½·P(tie) over its remaining rolls (exact
 * dynamic programming over the 252 multisets of five dice); when two holds are worth the same it
 * keeps more dice, and it never stands on a losing hand while it still has rolls (re-rolling can
 * only help). With 1:1 wins and pushes, that is exactly the play that maximises the house's take.
 *
 * Payouts (total return = stake + winnings):
 * - ANTE: a win pays 1:1, a win with Five of a kind 2:1. A tie (the same five faces) pushes.
 * - BONUS (optional side bet, up to 250, paid on the player's final hand whatever the dealer
 *   does): Five of a kind 6:1, Four of a kind 1:1, Full house or Straight: the bet comes back
 *   (push); anything else loses.
 *
 * Return to player, exact (`anteRtp`, `bonusRtp`, `bonusRtpMax`; proven in tests/pokerdice.test.ts):
 * - ANTE with the optimal hold strategy against this dealer: 96.62%
 *   (the player wins 46.0% of rounds, 0.6% push, the dealer wins 53.5%).
 * - BONUS while playing the ANTE optimally: 94.65%. No strategy can push it past 95.67% (every
 *   hold chasing the bonus), so ANTE + BONUS together, held to suit both, never return more than
 *   the ANTE alone (95.92% with equal stakes).
 */

export const FACE_LABEL = ['9', '10', 'J', 'Q', 'K', 'A'] as const;
export const N_DICE = 5;
export const ROLLS = 3;

export const CAT = { bust: 0, pair: 1, twoPair: 2, three: 3, straight: 4, full: 5, four: 6, five: 7 } as const;
export const CAT_KEYS = ['bust', 'pair', 'twoPair', 'three', 'straight', 'full', 'four', 'five'] as const;
export type CatKey = (typeof CAT_KEYS)[number];

export const PD = {
  minBet: 5,
  maxAnte: 1000,
  maxBonus: 250,
  /** ANTE winnings (to 1) by the category of the player's winning hand. */
  antePays: [1, 1, 1, 1, 1, 1, 1, 2] as readonly number[],
  /** BONUS winnings (to 1) by the category of the player's final hand: 0 is a push, -1 loses. */
  bonusPays: [-1, -1, -1, -1, 0, 0, 1, 6] as readonly number[],
};

// ---------------------------------------------------------------- hands

export interface Hand {
  /** Category 0 (bust) .. 7 (five of a kind). */
  cat: number;
  /** Total order of hands: higher is better, equal means the same five faces. */
  score: number;
  counts: number[];
}

export function countsOf(dice: readonly number[]): number[] {
  const c = [0, 0, 0, 0, 0, 0];
  for (const d of dice) c[d]++;
  return c;
}

function scoreCounts(c: readonly number[]): { cat: number; score: number } {
  const groups: [number, number][] = [];
  for (let r = 5; r >= 0; r--) if (c[r]) groups.push([c[r], r]);
  groups.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const shape = groups.map((g) => g[0]).join('');
  let cat: number;
  if (shape === '5') cat = CAT.five;
  else if (shape === '41') cat = CAT.four;
  else if (shape === '32') cat = CAT.full;
  else if (shape === '311') cat = CAT.three;
  else if (shape === '221') cat = CAT.twoPair;
  else if (shape === '2111') cat = CAT.pair;
  else cat = c[0] === 0 || c[5] === 0 ? CAT.straight : CAT.bust;
  let score = cat;
  for (let i = 0; i < 5; i++) score = score * 6 + (groups[i]?.[1] ?? 0);
  return { cat, score };
}

export function evaluate(dice: readonly number[]): Hand {
  const counts = countsOf(dice);
  return { ...scoreCounts(counts), counts };
}

/** > 0 when a beats b, 0 for a tie. */
export const compareHands = (a: Hand, b: Hand) => Math.sign(a.score - b.score);

export const catKey = (h: Hand): CatKey => CAT_KEYS[h.cat];

/** The dice that make the combination (all five for straights, full houses, five of a kind and busts). */
export function comboDice(dice: readonly number[]): boolean[] {
  const h = evaluate(dice);
  if (h.cat === CAT.straight || h.cat === CAT.full || h.cat === CAT.five || h.cat === CAT.bust) return dice.map(() => true);
  return dice.map((d) => h.counts[d] >= 2);
}

/** Ranks of the combination's groups (pairs and up), biggest group first, then by rank. */
export function comboRanks(h: Hand): number[] {
  const out: number[] = [];
  for (let r = 5; r >= 0; r--) if (h.counts[r] >= 2) out.push(r);
  out.sort((a, b) => h.counts[b] - h.counts[a] || b - a);
  return out;
}

/** Rolls n fair dice. */
export function rollDice(n: number, rng: Rng): number[] {
  return Array.from({ length: n }, () => rng(6));
}

// ---------------------------------------------------------------- multisets of dice
// Every count vector (c0..c5) with c0+..+c5 <= 5: 462 of them, 252 with exactly five dice.

interface MS {
  c: number[];
  n: number;
}
const MS_LIST: MS[] = [];
const MS_INDEX = new Int16Array(6 ** 6).fill(-1);
const keyOf = (c: readonly number[]) => c[0] + 6 * (c[1] + 6 * (c[2] + 6 * (c[3] + 6 * (c[4] + 6 * c[5]))));
(function enumerate(c: number[], i: number, left: number) {
  if (i === 6) {
    MS_INDEX[keyOf(c)] = MS_LIST.length;
    MS_LIST.push({ c: c.slice(), n: c.reduce((a, b) => a + b, 0) });
    return;
  }
  for (let k = 0; k <= left; k++) {
    c[i] = k;
    enumerate(c, i + 1, left - k);
  }
  c[i] = 0;
})([0, 0, 0, 0, 0, 0], 0, 5);

/** Multiset index of each hand (exactly five dice) and the reverse map. */
const HAND_MS: number[] = [];
const MS_HAND = new Int16Array(MS_LIST.length).fill(-1);
MS_LIST.forEach((m, i) => {
  if (m.n === 5) {
    MS_HAND[i] = HAND_MS.length;
    HAND_MS.push(i);
  }
});
export const N_HANDS = HAND_MS.length;
const HAND_SCORE = new Float64Array(N_HANDS);
const HAND_CAT = new Int8Array(N_HANDS);
HAND_MS.forEach((m, h) => {
  const s = scoreCounts(MS_LIST[m].c);
  HAND_SCORE[h] = s.score;
  HAND_CAT[h] = s.cat;
});

const FACT = [1, 1, 2, 6, 24, 120];
/** Probability that k fair dice show exactly the multiset c. */
const multisetP = (c: readonly number[], k: number) => FACT[k] / c.reduce((a, x) => a * FACT[x], 1) / 6 ** k;

/** For each held multiset m: the hands reached by re-rolling the other dice, with probabilities. */
const OUT_OFF = new Int32Array(MS_LIST.length + 1);
const OUT_H: number[] = [];
const OUT_P: number[] = [];
MS_LIST.forEach((m, i) => {
  OUT_OFF[i] = OUT_H.length;
  const k = 5 - m.n;
  for (const o of MS_LIST) {
    if (o.n !== k) continue;
    const c = m.c.map((x, j) => x + o.c[j]);
    OUT_H.push(MS_HAND[MS_INDEX[keyOf(c)]]);
    OUT_P.push(multisetP(o.c, k));
  }
});
OUT_OFF[MS_LIST.length] = OUT_H.length;
const OUT_Ha = Int16Array.from(OUT_H);
const OUT_Pa = Float64Array.from(OUT_P);
const EMPTY = MS_INDEX[0];

/** Proper sub-multisets of every hand (what can be held while re-rolling at least one die), most dice first. */
const SUB_OFF = new Int32Array(N_HANDS + 1);
const SUBS: number[] = [];
HAND_MS.forEach((m, h) => {
  SUB_OFF[h] = SUBS.length;
  const c = MS_LIST[m].c;
  const list: number[] = [];
  (function rec(i: number, cur: number[]) {
    if (i === 6) {
      const idx = MS_INDEX[keyOf(cur)];
      if (MS_LIST[idx].n < 5) list.push(idx);
      return;
    }
    for (let k = c[i]; k >= 0; k--) {
      cur[i] = k;
      rec(i + 1, cur);
    }
    cur[i] = 0;
  })(0, [0, 0, 0, 0, 0, 0]);
  list.sort((a, b) => MS_LIST[b].n - MS_LIST[a].n);
  SUBS.push(...list);
});
SUB_OFF[N_HANDS] = SUBS.length;

const handIndex = (dice: readonly number[]) => MS_HAND[MS_INDEX[keyOf(countsOf(dice))]];

/** Distribution of the first roll over the 252 hands. */
export const FIRST_ROLL: Float64Array = (() => {
  const d = new Float64Array(N_HANDS);
  for (let j = OUT_OFF[EMPTY]; j < OUT_OFF[EMPTY + 1]; j++) d[OUT_Ha[j]] += OUT_Pa[j];
  return d;
})();

/** Expected value, for every held multiset, of an array of values over hands (one re-roll). */
function expectOver(v: Float64Array, out: Float64Array) {
  for (let m = 0; m < MS_LIST.length; m++) {
    let s = 0;
    for (let j = OUT_OFF[m]; j < OUT_OFF[m + 1]; j++) s += OUT_Pa[j] * v[OUT_Ha[j]];
    out[m] = s;
  }
}

/**
 * A hold policy over the decisions with r = 2 and r = 1 re-rolls left: `hold[r][h]` is the
 * multiset kept on hand h (its own multiset index means "stand"), `value[r][h]` the expected value.
 */
export interface Policy {
  hold: Int16Array[];
  value: Float64Array[];
  /** Expected value before the first roll. */
  ev: number;
}

/** Exact optimal holds for terminal values `term` (per hand). `stop[h]` forces a stand. */
export function solve(term: Float64Array, stop?: Uint8Array): Policy {
  const value = [term, new Float64Array(N_HANDS), new Float64Array(N_HANDS)];
  const hold = [new Int16Array(0), new Int16Array(N_HANDS), new Int16Array(N_HANDS)];
  const E = new Float64Array(MS_LIST.length);
  for (let r = 1; r <= 2; r++) {
    expectOver(value[r - 1], E);
    for (let h = 0; h < N_HANDS; h++) {
      let best = term[h];
      let pick = HAND_MS[h];
      if (!stop?.[h])
        for (let j = SUB_OFF[h]; j < SUB_OFF[h + 1]; j++) {
          const m = SUBS[j];
          if (E[m] > best + 1e-12) {
            best = E[m];
            pick = m;
          }
        }
      value[r][h] = best;
      hold[r][h] = pick;
    }
  }
  let ev = 0;
  for (let h = 0; h < N_HANDS; h++) ev += FIRST_ROLL[h] * value[2][h];
  return { hold, value, ev };
}

/** Distribution of the final hand when every decision follows `pol`. */
export function finalDistribution(pol: Policy): Float64Array {
  const fin = new Float64Array(N_HANDS);
  let cur = Float64Array.from(FIRST_ROLL);
  for (let r = 2; r >= 1; r--) {
    const next = new Float64Array(N_HANDS);
    for (let h = 0; h < N_HANDS; h++) {
      const mass = cur[h];
      if (!mass) continue;
      const m = pol.hold[r][h];
      if (m === HAND_MS[h]) fin[h] += mass;
      else for (let j = OUT_OFF[m]; j < OUT_OFF[m + 1]; j++) next[OUT_Ha[j]] += mass * OUT_Pa[j];
    }
    cur = next;
  }
  for (let h = 0; h < N_HANDS; h++) fin[h] += cur[h];
  return fin;
}

// ---------------------------------------------------------------- the dealer's house way

interface DealerBook {
  /** Per player hand: the dealer's hold policy (r = 2, 1). */
  hold: Int16Array[][];
  /** Per player hand: P(dealer beats it), P(dealer ties it). */
  beat: Float64Array;
  tie: Float64Array;
}

let book: DealerBook | null = null;

/** The dealer's exact house way against every possible player hand (computed once, ~30 ms). */
function dealerBook(): DealerBook {
  if (book) return book;
  const hold: Int16Array[][] = [];
  const beat = new Float64Array(N_HANDS);
  const tie = new Float64Array(N_HANDS);
  const term = new Float64Array(N_HANDS);
  const stop = new Uint8Array(N_HANDS);
  const W = [new Float64Array(N_HANDS), new Float64Array(N_HANDS), new Float64Array(N_HANDS)];
  const T = [new Float64Array(N_HANDS), new Float64Array(N_HANDS), new Float64Array(N_HANDS)];
  const EW = new Float64Array(MS_LIST.length);
  const ET = new Float64Array(MS_LIST.length);
  for (let t = 0; t < N_HANDS; t++) {
    const S = HAND_SCORE[t];
    for (let h = 0; h < N_HANDS; h++) {
      const w = HAND_SCORE[h] > S ? 1 : 0;
      const e = HAND_SCORE[h] === S ? 1 : 0;
      term[h] = w + 0.5 * e;
      stop[h] = w;
      W[0][h] = w;
      T[0][h] = e;
    }
    const pol = solve(term, stop);
    for (let r = 1; r <= 2; r++) {
      expectOver(W[r - 1], EW);
      expectOver(T[r - 1], ET);
      for (let h = 0; h < N_HANDS; h++) {
        const m = pol.hold[r][h];
        if (m === HAND_MS[h]) {
          W[r][h] = W[0][h];
          T[r][h] = T[0][h];
        } else {
          W[r][h] = EW[m];
          T[r][h] = ET[m];
        }
      }
    }
    let b = 0;
    let e = 0;
    for (let h = 0; h < N_HANDS; h++) {
      b += FIRST_ROLL[h] * W[2][h];
      e += FIRST_ROLL[h] * T[2][h];
    }
    beat[t] = b;
    tie[t] = e;
    hold.push(pol.hold);
  }
  book = { hold, beat, tie };
  return book;
}

/** Per hand index: its category and the dealer's chances to beat and to tie it. */
export function dealerTable(): { cat: Int8Array; beat: Float64Array; tie: Float64Array } {
  const b = dealerBook();
  return { cat: HAND_CAT, beat: b.beat, tie: b.tie };
}

/** Chance that the dealer beats / ties the player's final hand. */
export function dealerOdds(player: readonly number[]): { beat: number; tie: number; lose: number } {
  const b = dealerBook();
  const h = handIndex(player);
  return { beat: b.beat[h], tie: b.tie[h], lose: 1 - b.beat[h] - b.tie[h] };
}

/** Indices of the dice to keep so that the kept faces are the multiset m (first matches first). */
function keepMask(dice: readonly number[], m: number): boolean[] {
  const want = MS_LIST[m].c.slice();
  return dice.map((d) => {
    if (want[d] > 0) {
      want[d]--;
      return true;
    }
    return false;
  });
}

/**
 * The dealer's decision with `rollsLeft` (1 or 2) re-rolls left against the player's final dice:
 * null when it stands (it beats the player, or its hand is already worth the most), otherwise the
 * dice it holds (it re-rolls the others).
 */
export function dealerHold(dealer: readonly number[], rollsLeft: number, player: readonly number[]): boolean[] | null {
  const b = dealerBook();
  const t = handIndex(player);
  const h = handIndex(dealer);
  const m = b.hold[t][rollsLeft][h];
  if (m === HAND_MS[h]) return null;
  return keepMask(dealer, m);
}

// ---------------------------------------------------------------- settlement and returns

/** Total return per unit staked on the ANTE when the player's final hand meets the dealer's. */
export function anteReturn(playerCat: number, cmp: number): number {
  if (cmp > 0) return 1 + PD.antePays[playerCat];
  return cmp === 0 ? 1 : 0;
}

/** Total return per unit staked on the BONUS for the player's final hand. */
export const bonusReturn = (cat: number) => 1 + PD.bonusPays[cat];

export interface PdStakes {
  ante: number;
  bonus: number;
}

export interface PdResult {
  ret: { ante: number; bonus: number };
  player: Hand;
  dealer: Hand;
  /** 1 player wins, 0 push, -1 dealer wins. */
  outcome: number;
}

export function settlePd(player: readonly number[], dealer: readonly number[], bets: PdStakes): PdResult {
  const p = evaluate(player);
  const d = evaluate(dealer);
  const outcome = compareHands(p, d);
  return {
    ret: { ante: Math.round(bets.ante * anteReturn(p.cat, outcome)), bonus: bets.bonus > 0 ? Math.round(bets.bonus * bonusReturn(p.cat)) : 0 },
    player: p,
    dealer: d,
    outcome,
  };
}

/** Expected total return per hand (for stakes `ante` and `bonus`) of standing on each final hand. */
function terminal(ante: number, bonus: number): Float64Array {
  const b = dealerBook();
  const term = new Float64Array(N_HANDS);
  for (let h = 0; h < N_HANDS; h++) {
    const lose = 1 - b.beat[h] - b.tie[h];
    const a = lose * (1 + PD.antePays[HAND_CAT[h]]) + b.tie[h];
    term[h] = ante * a + bonus * bonusReturn(HAND_CAT[h]);
  }
  return term;
}

const policies = new Map<string, Policy>();

/** The exact optimal hold policy for the player's stakes (memoised by their ratio). */
export function playerPolicy(stakes: PdStakes = { ante: 1, bonus: 0 }): Policy {
  const a = Math.max(0, stakes.ante);
  const b = Math.max(0, stakes.bonus);
  const tot = a + b || 1;
  const key = (a / tot).toFixed(6);
  let p = policies.get(key);
  if (!p) {
    p = solve(terminal(a / tot, b / tot));
    if (policies.size > 64) policies.clear();
    policies.set(key, p);
  }
  return p;
}

/**
 * The optimal decision with `rollsLeft` (1 or 2) re-rolls left: `hold` marks the dice to keep, `stand`
 * is true when no re-roll beats keeping the hand. `ev` is the expected total return per chip staked.
 */
export function advise(dice: readonly number[], rollsLeft: number, stakes: PdStakes = { ante: 1, bonus: 0 }): { hold: boolean[]; stand: boolean; ev: number } {
  const pol = playerPolicy(stakes);
  const h = handIndex(dice);
  const r = Math.max(1, Math.min(2, rollsLeft));
  const m = pol.hold[r][h];
  const stand = m === HAND_MS[h];
  return { hold: stand ? dice.map(() => true) : keepMask(dice, m), stand, ev: pol.value[r][h] };
}

/** Expected total return of the hold `keep` (dice to keep) with `rollsLeft` re-rolls left. */
export function holdValue(dice: readonly number[], keep: readonly boolean[], rollsLeft: number, stakes: PdStakes = { ante: 1, bonus: 0 }): number {
  const pol = playerPolicy(stakes);
  const r = Math.max(1, Math.min(2, rollsLeft));
  const kept = dice.filter((_, i) => keep[i]);
  if (kept.length === 5) return pol.value[0][handIndex(dice)];
  const m = MS_INDEX[keyOf(countsOf(kept))];
  const v = pol.value[r - 1];
  let s = 0;
  for (let j = OUT_OFF[m]; j < OUT_OFF[m + 1]; j++) s += OUT_Pa[j] * v[OUT_Ha[j]];
  return s;
}

/** Exact ANTE return to player with optimal play (ANTE only). */
export function anteRtp(): number {
  return playerPolicy({ ante: 1, bonus: 0 }).ev;
}

/** Exact BONUS return to player while the player follows `pol` (ANTE-optimal by default). */
export function bonusRtp(pol: Policy = playerPolicy({ ante: 1, bonus: 0 })): number {
  const fin = finalDistribution(pol);
  let s = 0;
  for (let h = 0; h < N_HANDS; h++) s += fin[h] * bonusReturn(HAND_CAT[h]);
  return s;
}

/** Highest BONUS return any hold strategy can reach (every hold chasing the bonus). */
export function bonusRtpMax(): number {
  return solve(terminal(0, 1)).ev;
}

/** Probability of each final category for a policy (ANTE-optimal by default). */
export function catDistribution(pol: Policy = playerPolicy({ ante: 1, bonus: 0 })): number[] {
  const fin = finalDistribution(pol);
  const out = new Array(8).fill(0);
  for (let h = 0; h < N_HANDS; h++) out[HAND_CAT[h]] += fin[h];
  return out;
}

/** Overall P(player wins), P(push), P(dealer wins) with optimal ANTE play. */
export function outcomeOdds(pol: Policy = playerPolicy({ ante: 1, bonus: 0 })): { win: number; push: number; lose: number } {
  const b = dealerBook();
  const fin = finalDistribution(pol);
  let win = 0;
  let push = 0;
  for (let h = 0; h < N_HANDS; h++) {
    win += fin[h] * (1 - b.beat[h] - b.tie[h]);
    push += fin[h] * b.tie[h];
  }
  return { win, push, lose: 1 - win - push };
}
