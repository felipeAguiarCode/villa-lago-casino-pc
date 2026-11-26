import { rankOf, suitOf, type Card } from '../../core/cards';
import { bestOf, Cat5, type Hand5 } from '../../core/eval5';
import { seededRng, type Rng } from '../../core/rng';
import { BLIND_PAYS, TRIPS_PAYS } from '../uth/rules';

/**
 * Seven-Card Stud against the dealer (house-banked; our own design, no casino standard exists).
 *
 * Bets: ANTE, a BLIND equal to the Ante (placed with it), and an optional STUD BONUS.
 *
 * Streets. Every hand is dealt like stud: cards 1–2 down, 3–6 up, 7 down. The dealer's hand is
 * dealt the same way, and the player sees the dealer's up cards (one on 3rd street, four at the end).
 * - 3rd street (2 down + 1 up each): RAISE 4× the Ante or CHECK;
 * - 4th and 5th streets (one up card each): if the player checked, RAISE 2× or CHECK;
 * - 6th (up) and 7th (down) streets: if the player still checked, BET 1× or FOLD (the Ante and the
 *   Blind are lost; the Bonus still settles on the seven cards).
 * One raise per hand: once raised, the rest of the cards are dealt without decisions.
 *
 * Showdown: best five of seven against the dealer's best five of seven. The dealer needs a pair
 * or better to qualify; otherwise the Ante pushes.
 * - player wins: RAISE 1:1, ANTE 1:1 (push if the dealer does not qualify), BLIND by the UTH table
 *   (Royal 500 · straight flush 50 · quads 10 · full house 3 · flush 3:2 · straight 1:1, lower
 *   hands push the Blind);
 * - tie: everything pushes;
 * - dealer wins: RAISE and BLIND lose, the ANTE loses (pushes if the dealer does not qualify).
 * - STUD BONUS pays on the player's own seven cards, win, lose or fold, by the UTH Trips table
 *   (Royal 50 · straight flush 40 · quads 30 · full house 8 · flush 7 · straight 4 · trips 3).
 * Returns are totals (stake + winnings, 0 for a loss).
 *
 * Why these numbers (near-optimal play, 880,000-hand seeded studies; RTP = return per Ante):
 * the player sees four of the dealer's cards and has four decisions, so the proposal without a
 * Blind (raises 3/2/2/1) is far in the player's favour whatever the qualifier: no qualifier 136.9%,
 * a pair 123.3%, pair of jacks 106.2%, two pair 104.7% (the best for the house), trips 110.1%.
 * Smaller raises without a Blind do not fix it cleanly (two pair, 3/2/1/1: 100.0%). UTH's Blind
 * with a pair to qualify and 3× on 3rd street overshoots to 92.3%; making the 3rd-street raise 4×
 * (as UTH's pre-flop 4×) lands at 97.6%. Other variants for reference: Blind + pair 3/3/2/1 96.8%
 * (but the 3rd-street raise is then never right), Blind + pair 4/3/2/1 101.3%.
 *
 * RTP with the hint strategy (`bookMove`), STUD_RTP below: a 4,400,000-hand seeded simulation of
 * this module gave 97.46% of the Ante ± 0.43% (99.29% of the total wagered on Ante + Blind + Raise;
 * house edge ≈ 2.5% of the Ante). The player raises 4× on 17.8% of hands, 2× on 4th street 2.6%,
 * 2× on 5th street 22.7%, bets the river 34.4% and folds 22.5%. Simpler aggressive strategies lose much more, e.g. always 4× with
 * a pair or better on 3rd street, otherwise bet to the end: 72.4%; always bet to the end: 56.8%;
 * always 4×: 56.9%; 4× with a pair, 2× with any later pair, best river play: 93.2%.
 * STUD BONUS: 96.50% exactly (the 7-card hand frequencies; card removal does not change it).
 * tests/stud7.test.ts holds a shorter seeded run.
 */
export const S7 = { minBet: 5, maxBet: 1000 };

/** Measured RTP of the table with the hint strategy (see above), per Ante and per chip wagered. */
export const STUD_RTP = { perAnte: 0.9746, perWager: 0.9929, bonus: 0.965 };

/** The dealer qualifies with a pair or better. */
export const dealerQualifies = (h: { cat: Cat5 }) => h.cat >= Cat5.Pair;

/** The decisions of a hand: after 3rd, 4th and 5th streets, and after 7th street (the river). */
export type Street = 'third' | 'fourth' | 'fifth' | 'river';
export const STREETS: Street[] = ['third', 'fourth', 'fifth', 'river'];
export type Move = 'check' | 'raise4' | 'raise2' | 'bet1' | 'fold';
/** Raise of a move, in Antes. */
export const MULT: Record<Move, number> = { check: 0, fold: 0, raise4: 4, raise2: 2, bet1: 1 };

/** The moves of a street, in button order. */
export function streetMoves(s: Street): Move[] {
  if (s === 'third') return ['check', 'raise4'];
  if (s === 'river') return ['fold', 'bet1'];
  return ['check', 'raise2'];
}

/** The moves a seat can make: a raise needs the chips to cover it. */
export function legalMoves(s: Street, canRaise: (mult: number) => boolean = () => true): Move[] {
  return streetMoves(s).filter((m) => MULT[m] === 0 || canRaise(MULT[m]));
}

/** Cards a hand holds, and dealer up cards showing, at each decision. */
export const OWN_AT: Record<Street, number> = { third: 3, fourth: 4, fifth: 5, river: 7 };
export const UP_AT: Record<Street, number> = { third: 1, fourth: 2, fifth: 3, river: 4 };

/** Card i of a stud hand (0..6, in deal order) is dealt face down: 1st, 2nd and 7th. */
export const isDown = (i: number) => i < 2 || i === 6;
/** The up cards of a stud hand (any length up to 7). */
export const upCards = (cards: readonly Card[]) => cards.filter((_, i) => !isDown(i));

/** The streets of the deal: 3rd deals three cards to every hand, the others one. */
export type DealStreet = 'third' | 'fourth' | 'fifth' | 'sixth' | 'seventh';
export const DEAL_STREETS: DealStreet[] = ['third', 'fourth', 'fifth', 'sixth', 'seventh'];
/** The decision that follows a deal street (none after 6th: 6th and 7th are dealt together). */
export const DECISION_AFTER: Record<DealStreet, Street | null> = { third: 'third', fourth: 'fourth', fifth: 'fifth', sixth: null, seventh: 'river' };

// --------------------------------------------------------------------------- fast evaluation

const P5 = 15 ** 5;
const pk = (c: number, a = 0, b = 0, d = 0, e = 0, f = 0) => ((((c * 15 + a) * 15 + b) * 15 + d) * 15 + e) * 15 + f;
const cnt = new Int8Array(15);
const sMask = new Int32Array(4);
const sCnt = new Int8Array(4);
const top = [0, 0, 0, 0, 0];

function straightHigh(m: number): number {
  for (let h = 14; h >= 6; h--) if (((m >> (h - 4)) & 31) === 31) return h;
  return (m & 0x403c) === 0x403c ? 5 : 0;
}
function topRanks(m: number, k: number) {
  let n = 0;
  for (let r = 14; r >= 2 && n < k; r--) if (m & (1 << r)) top[n++] = r;
  for (; n < 5; n++) top[n] = 0;
}

/**
 * Score of the best five-card hand in 1..7 cards, the same number as `bestOf(cards).score` of
 * core/eval5 for 5..7 cards (tested), about fifty times faster. Fewer than five cards score the
 * pairs, trips and quads they hold (no straights or flushes): a partial hand, e.g. a board.
 */
export function handScore(cards: readonly Card[], n = cards.length): number {
  cnt.fill(0);
  sMask.fill(0);
  sCnt.fill(0);
  let rm = 0;
  for (let i = 0; i < n; i++) {
    const c = cards[i];
    const r = (c % 13) + 2;
    const s = (c / 13) | 0;
    cnt[r]++;
    rm |= 1 << r;
    sMask[s] |= 1 << r;
    sCnt[s]++;
  }
  let fs = -1;
  for (let s = 0; s < 4; s++) if (sCnt[s] >= 5) fs = s;
  if (fs >= 0) {
    const h = straightHigh(sMask[fs]);
    if (h) return h === 14 ? pk(Cat5.Royal, 14) : pk(Cat5.StraightFlush, h);
  }
  let q = 0;
  let t1 = 0;
  let t2 = 0;
  let p1 = 0;
  let p2 = 0;
  for (let r = 14; r >= 2; r--) {
    const c = cnt[r];
    if (c === 4) q = r;
    else if (c === 3) {
      if (!t1) t1 = r;
      else if (!t2) t2 = r;
    } else if (c === 2) {
      if (!p1) p1 = r;
      else if (!p2) p2 = r;
    }
  }
  if (q) {
    topRanks(rm & ~(1 << q), 1);
    return pk(Cat5.Quads, q, top[0]);
  }
  if (t1 && (t2 || p1)) return pk(Cat5.FullHouse, t1, Math.max(t2, p1));
  if (fs >= 0) {
    topRanks(sMask[fs], 5);
    return pk(Cat5.Flush, top[0], top[1], top[2], top[3], top[4]);
  }
  const h = n >= 5 ? straightHigh(rm) : 0;
  if (h) return pk(Cat5.Straight, h);
  if (t1) {
    topRanks(rm & ~(1 << t1), 2);
    return pk(Cat5.Trips, t1, top[0], top[1]);
  }
  if (p2) {
    topRanks(rm & ~(1 << p1) & ~(1 << p2), 1);
    return pk(Cat5.TwoPair, p1, p2, top[0]);
  }
  if (p1) {
    topRanks(rm & ~(1 << p1), 3);
    return pk(Cat5.Pair, p1, top[0], top[1], top[2]);
  }
  topRanks(rm, 5);
  return pk(Cat5.High, top[0], top[1], top[2], top[3], top[4]);
}

/** Category of a score. */
export const scoreCat = (score: number): Cat5 => Math.floor(score / P5) as Cat5;
/** Lowest score that qualifies the dealer (any pair). */
export const QUALIFY_SCORE = pk(Cat5.Pair);

// --------------------------------------------------------------------------- settlement

export interface StudBets {
  ante: number;
  blind: number;
  bonus: number;
}

export interface StudResult {
  player: Hand5;
  dealer: Hand5;
  qualifies: boolean;
  /** >0 the player's hand wins, 0 tie, <0 the dealer's. */
  cmp: number;
  /** Total returns (stake + winnings, 0 for a loss). */
  ret: { ante: number; blind: number; raise: number; bonus: number };
}

/** Bonus multiple (to 1) of a final hand, 0 when it does not pay. */
export const bonusPays = (cat: Cat5) => TRIPS_PAYS[cat] ?? 0;
/** Blind multiple (to 1) of a winning hand; lower hands push. */
export const blindPays = (cat: Cat5) => BLIND_PAYS[cat] ?? 0;

/** Settles one hand. `raise` is the amount raised (0 when the player folded or never raised). */
export function settleStud(player: Card[], dealer: Card[], bets: StudBets, raise: number, folded: boolean): StudResult {
  const ph = bestOf(player);
  const dh = bestOf(dealer);
  const qualifies = dealerQualifies(dh);
  const cmp = Math.sign(ph.score - dh.score);
  const ret = { ante: 0, blind: 0, raise: 0, bonus: 0 };
  if (!folded) {
    if (cmp > 0) {
      ret.ante = qualifies ? bets.ante * 2 : bets.ante;
      ret.raise = raise * 2;
      ret.blind = bets.blind * (1 + blindPays(ph.cat));
    } else if (cmp === 0) {
      ret.ante = bets.ante;
      ret.raise = raise;
      ret.blind = bets.blind;
    } else ret.ante = qualifies ? 0 : bets.ante;
  }
  const bp = bonusPays(ph.cat);
  if (bets.bonus > 0 && bp) ret.bonus = bets.bonus * (1 + bp);
  return { player: ph, dealer: dh, qualifies, cmp, ret };
}

/** Net result in Antes of Ante + Blind (= Ante) + a raise of `mult` Antes (0 = folded), from the two scores. */
export function netAntes(ps: number, ds: number, mult: number): number {
  if (mult === 0) return -2;
  const q = ds >= QUALIFY_SCORE;
  if (ps > ds) return (q ? 1 : 0) + mult + blindPays(scoreCat(ps));
  if (ps === ds) return 0;
  return -(q ? 1 : 0) - mult - 1;
}

// --------------------------------------------------------------------------- reading the hand

/** Win and loss chances of a hand against the dealer (ties are the rest). */
export interface Odds {
  win: number;
  lose: number;
}

function unseen(known: readonly Card[]): Card[] {
  const seen = new Uint8Array(52);
  for (const c of known) seen[c] = 1;
  const out: Card[] = [];
  for (let c = 0; c < 52; c++) if (!seen[c]) out.push(c);
  return out;
}

/** A deterministic seed from the cards in view, so a read (and the hint) is a pure function. */
function seedOf(own: readonly Card[], up: readonly Card[], dead: readonly Card[]): number {
  let h = 2166136261;
  const mix = (x: number) => (h = Math.imul(h ^ x, 16777619));
  own.forEach(mix);
  mix(97);
  up.forEach(mix);
  mix(89);
  [...dead].sort((a, b) => a - b).forEach(mix);
  return h >>> 0;
}

const pBuf: Card[] = [0, 0, 0, 0, 0, 0, 0];
const dBuf: Card[] = [0, 0, 0, 0, 0, 0, 0];

/**
 * Chances of a hand before the river: the rest of both hands drawn from the cards not in view
 * (`dead` are other up cards on the table). Deterministic sampling seeded by the cards in view.
 */
export function streetOdds(own: readonly Card[], up: readonly Card[], dead: readonly Card[] = [], samples = 600): Odds {
  const un = unseen([...own, ...up, ...dead]);
  const rng: Rng = seededRng(seedOf(own, up, dead));
  const np = 7 - own.length;
  const nd = 7 - up.length;
  const L = un.length;
  for (let i = 0; i < own.length; i++) pBuf[i] = own[i];
  for (let i = 0; i < up.length; i++) dBuf[i] = up[i];
  let win = 0;
  let lose = 0;
  for (let s = 0; s < samples; s++) {
    for (let i = 0; i < np + nd; i++) {
      const j = i + rng(L - i);
      const x = un[i];
      un[i] = un[j];
      un[j] = x;
    }
    for (let i = 0; i < np; i++) pBuf[own.length + i] = un[i];
    for (let i = 0; i < nd; i++) dBuf[up.length + i] = un[np + i];
    const a = handScore(pBuf, 7);
    const b = handScore(dBuf, 7);
    if (a > b) win++;
    else if (a < b) lose++;
  }
  return { win: win / samples, lose: lose / samples };
}

/** The river read: exact chances over every three hidden dealer cards, and the value of each move. */
export interface RiverRead extends Odds {
  /** Win / loss with a qualifying dealer. */
  winQ: number;
  loseQ: number;
  /** Expected net in Antes of betting 1× and of folding (Ante + Blind). */
  betEV: number;
  foldEV: number;
}

export function riverRead(own: readonly Card[], up: readonly Card[], dead: readonly Card[] = []): RiverRead {
  const ps = handScore(own, 7);
  const un = unseen([...own, ...up, ...dead]);
  for (let i = 0; i < 4; i++) dBuf[i] = up[i];
  const L = un.length;
  let n = 0;
  let w = 0;
  let l = 0;
  let wq = 0;
  let lq = 0;
  for (let i = 0; i < L; i++) {
    dBuf[4] = un[i];
    for (let j = i + 1; j < L; j++) {
      dBuf[5] = un[j];
      for (let k = j + 1; k < L; k++) {
        dBuf[6] = un[k];
        const ds = handScore(dBuf, 7);
        n++;
        if (ps > ds) {
          w++;
          if (ds >= QUALIFY_SCORE) wq++;
        } else if (ps < ds) {
          l++;
          if (ds >= QUALIFY_SCORE) lq++;
        }
      }
    }
  }
  const win = w / n;
  const lose = l / n;
  const winQ = wq / n;
  const loseQ = lq / n;
  // Ante (qualifier) + 1× bet + Blind (pays on a winning straight or better, lost on a loss)
  const betEV = winQ - loseQ + (win - lose) + win * blindPays(scoreCat(ps)) - lose;
  return { win, lose, winQ, loseQ, betEV, foldEV: -2 };
}

/**
 * The hint strategy: raise when the hand wins this much more often than it loses (win − lose),
 * found by a grid search over 880,000 hands: 4× on 3rd street at +0.13, 2× on 4th street at
 * +0.45 (rarely right: 5th street pays the same with one more card), 2× on 5th street at +0.10.
 * At the river: bet whenever betting loses less than folding (exact).
 */
export const RAISE_AT: Record<Exclude<Street, 'river'>, number> = { third: 0.13, fourth: 0.45, fifth: 0.1 };

export interface Decision {
  move: Move;
  /** How far the spot is from the line: (win − lose) − threshold, or betEV − foldEV at the river. */
  margin: number;
  odds: Odds;
}

/**
 * The best play found for a spot. `own` are the hand's cards so far (3, 4, 5 or 7), `up` the dealer's
 * up cards showing, `dead` any other card in view (other seats' up cards). Pure.
 */
export function bookDecision(street: Street, own: readonly Card[], up: readonly Card[], dead: readonly Card[] = []): Decision {
  const key = `${street}|${own.join(',')}|${up.join(',')}|${[...dead].sort((a, b) => a - b).join(',')}`;
  const hit = memo.get(key);
  if (hit) return hit;
  let d: Decision;
  if (street === 'river') {
    const r = riverRead(own, up, dead);
    const margin = r.betEV - r.foldEV;
    d = { move: margin >= 0 ? 'bet1' : 'fold', margin, odds: r };
  } else {
    const o = streetOdds(own, up, dead);
    const margin = o.win - o.lose - RAISE_AT[street];
    d = { move: margin >= 0 ? (street === 'third' ? 'raise4' : 'raise2') : 'check', margin, odds: o };
  }
  if (memo.size >= 256) memo.delete(memo.keys().next().value!);
  memo.set(key, d);
  return d;
}

/** Recent reads (the hint, the regulars and the simulations ask about the same spot more than once). */
const memo = new Map<string, Decision>();

export const bookMove = (street: Street, own: readonly Card[], up: readonly Card[], dead: readonly Card[] = []): Move => bookDecision(street, own, up, dead).move;

/** The closest legal move: a raise that can't be covered becomes a check (a fold at the river). */
export function fitLegal(m: Move, legal: Move[]): Move {
  if (legal.includes(m)) return m;
  return legal.includes('check') ? 'check' : legal.includes('fold') ? 'fold' : legal[0];
}

// --------------------------------------------------------------------------- hand features

/** Highest rank held more than once (0 when none). */
export function pairRank(cards: readonly Card[]): number {
  const seen = new Set<number>();
  let best = 0;
  for (const c of cards) {
    const r = rankOf(c);
    if (seen.has(r)) best = Math.max(best, r);
    seen.add(r);
  }
  return best;
}

/** Live cards of a suit: the suit's 13 minus those in view. */
export function liveOfSuit(suit: number, seen: readonly Card[]): number {
  return 13 - seen.filter((c) => suitOf(c) === suit).length;
}

/** Live cards of a rank: 4 minus those in view. */
export function liveOfRank(rank: number, seen: readonly Card[]): number {
  return 4 - seen.filter((c) => rankOf(c) === rank).length;
}

/**
 * The best flush draw: the suit with most cards in `own` and how many of that suit are still live
 * (not in `own`, not among the cards in view).
 */
export function flushDraw(own: readonly Card[], view: readonly Card[]): { have: number; live: number } {
  let best = { have: 0, live: 0 };
  for (let s = 0; s < 4; s++) {
    const have = own.filter((c) => suitOf(c) === s).length;
    const live = liveOfSuit(s, [...own, ...view]);
    if (have > best.have || (have === best.have && live > best.live)) best = { have, live };
  }
  return best;
}

/**
 * The best straight draw: the most distinct ranks of `own` inside one five-rank window, and how
 * many live cards would fill that window's missing ranks.
 */
export function straightDraw(own: readonly Card[], view: readonly Card[]): { have: number; live: number } {
  const ranks = new Set(own.map(rankOf));
  if (ranks.has(14)) ranks.add(1);
  const all = [...own, ...view];
  let best = { have: 0, live: 0 };
  for (let lo = 1; lo <= 10; lo++) {
    let have = 0;
    let live = 0;
    for (let r = lo; r < lo + 5; r++) {
      if (ranks.has(r)) have++;
      else live += liveOfRank(r === 1 ? 14 : r, all);
    }
    if (have > best.have || (have === best.have && live > best.live)) best = { have, live };
  }
  return best;
}

/** Short label of a move for the logs and tags. */
export const moveMult = (m: Move) => MULT[m];

// --------------------------------------------------------------------------- the deal

/** One card of the deal, in order: `seat` −1 is the dealer, `i` the card's place in the hand (0..6). */
export interface DealCard {
  seat: number;
  i: number;
  card: Card;
  /** Dealt face up for everyone to see (the hand's own down cards are seen by their owner only). */
  up: boolean;
}

/**
 * Deals the streets of a stud table: `seats` hands and the dealer's, one card at a time from the
 * first seat, the dealer last in every pass.
 */
export class StudDeal {
  readonly hands: Card[][];
  readonly dealer: Card[] = [];

  constructor(
    private draw: () => Card,
    seats: number,
  ) {
    this.hands = Array.from({ length: seats }, () => []);
  }

  street(s: DealStreet): DealCard[] {
    const out: DealCard[] = [];
    const passes = s === 'third' ? 3 : 1;
    for (let p = 0; p < passes; p++) {
      const give = (seat: number, hand: Card[]) => {
        const card = this.draw();
        const i = hand.length;
        hand.push(card);
        out.push({ seat, i, card, up: !isDown(i) });
      };
      this.hands.forEach((h, seat) => give(seat, h));
      give(-1, this.dealer);
    }
    return out;
  }

  /** The dealer's up cards showing now. */
  get dealerUp(): Card[] {
    return upCards(this.dealer);
  }

  /** Every up card of the other seats (dead cards for `seat`'s decisions). */
  deadFor(seat: number): Card[] {
    return this.hands.flatMap((h, k) => (k === seat ? [] : upCards(h)));
  }
}

/** Plays a whole single-table hand with a move chooser (simulations). Returns the net in Antes. */
export function playHand(draw: () => Card, choose: (street: Street, own: Card[], up: Card[]) => Move): { net: number; mult: number; folded: boolean; own: Card[]; dealer: Card[] } {
  const d = new StudDeal(draw, 1);
  let mult = 0;
  let folded = false;
  for (const s of DEAL_STREETS) {
    d.street(s);
    const st = DECISION_AFTER[s];
    if (!st || mult) continue;
    const m = choose(st, d.hands[0], d.dealerUp);
    if (m === 'fold') folded = true;
    else mult = MULT[m];
  }
  const ps = handScore(d.hands[0], 7);
  const ds = handScore(d.dealer, 7);
  return { net: folded ? -2 : netAntes(ps, ds, mult), mult, folded, own: d.hands[0], dealer: d.dealer };
}
