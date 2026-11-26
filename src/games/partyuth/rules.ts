import { rankOf, suitOf, type Card, type Shoe } from '../../core/cards';
import { bestOf, Cat5 } from '../../core/eval5';
import type { Rng } from '../../core/rng';
import { mindsetSideBet, mindsetStake, newMemory, type AiMemory, type Mindset } from '../partybj/mindset';
import type { AiProfile } from '../partybj/rules';
import { dealerOuts, flopRaise, hiddenMade, preflopRaise, settleUth, UTH, type UthResult } from '../uth/rules';

/**
 * Party Ultimate Texas Hold'em: five seats against one dealer (four of them the Party regulars,
 * with fictional chips). Every seat plays its own Ultimate Texas Hold'em hand with its own two
 * cards against the same dealer hand and the same five-card board.
 *
 * The rules and the payouts are the single table's, settled by `settleUth` of uth/rules:
 * - every seat posts Ante = Blind (plus an optional Trips);
 * - pre-flop: check or bet 3× / 4× the Ante on Play; on the flop those who checked may bet 2×;
 *   on the river those who still checked bet 1× or fold. One Play bet per hand;
 * - the dealer opens with a pair or better (otherwise the Ante pushes); a winning hand is paid
 *   Play 1:1, Ante 1:1 and the Blind by its table (Royal 500 · straight flush 50 · quads 10 ·
 *   full house 3 · flush 3:2 · straight 1:1, smaller hands push the Blind); a tie pushes;
 * - Trips pays on the seat's final hand alone (Royal 50 · straight flush 40 · quads 30 ·
 *   full house 8 · flush 7 · straight 4 · trips 3).
 * Total returns (stake + winnings) per bet, 0 for a loss, as `settleUth` gives them.
 *
 * The deal is the full table's: two cards to each seat from first base (the player's right),
 * then the dealer, twice, then the five board cards face down; the flop and then the turn and
 * river are turned over between the betting rounds. Seats act in turn from first base.
 *
 * RTP. The cards are exchangeable (every seat's two cards are as random as at the single table,
 * and the others' decisions never change which cards the board and the dealer get), so the
 * player's return is exactly the single Ultimate Texas Hold'em table's with the same play.
 * With the hint strategy (preflopRaise / flopRaise / riverBet, a slightly simplified optimal
 * strategy) seeded simulations of the full table, 2 × 1,000,000 rounds, gave as return per chip
 * bet on Ante + Blind + Play: player 99.37% ± 0.08% (a loss of 2.6% ± 0.35% of the Ante per
 * hand; the published edge for perfect play is 2.19%); the single table with the same strategy,
 * 2,000,000 hands: 99.41%. Trips returns exactly 96.50% (house edge 3.50%, from the 7-card hand
 * counts).
 * The regulars' mindsets (see aiDecision), every mindset playing the same 500,000 seat-hands
 * (Ante + Blind + Play, return per chip bet and result per hand in Antes): calculated 99.23%
 * (−3.2%), hybrid 99.00% (−4.1%; 0.90% ± 0.07% of the Ante behind calculated on the same cards),
 * aggressive 96.97% (−13.6%), conservative 92.34% (−22.5%), hunch 93.85% (−27.3%).
 * Shorter seeded runs are in tests/partyuth.test.ts.
 */
export const PU = {
  minBet: UTH.minBet,
  maxBet: UTH.maxBet,
  /** The regulars ante 10–100. */
  aiMin: 10,
  aiMax: 100,
};

/** A regular who can't cover Ante + Blind + a 4× Play at the minimum Ante is broke and leaves the table. */
export const canStay = (chips: number) => chips >= PU.aiMin * 6;

export type { AiProfile, AiMemory, Mindset };

export type Street = 'pre' | 'flop' | 'river';
export type Move = 'check' | 'bet4' | 'bet3' | 'bet2' | 'bet1' | 'fold';

/** Play bet of a move, in Antes. */
export const MULT: Record<Move, number> = { check: 0, fold: 0, bet1: 1, bet2: 2, bet3: 3, bet4: 4 };

/** The moves of a street, in button order. */
export function streetMoves(street: Street): Move[] {
  if (street === 'pre') return ['check', 'bet3', 'bet4'];
  if (street === 'flop') return ['check', 'bet2'];
  return ['fold', 'bet1'];
}

/** The street of a decision from the board cards that are face up (none, the flop, all five). */
export const streetOf = (board: Card[]): Street => (board.length >= 5 ? 'river' : board.length >= 3 ? 'flop' : 'pre');

/** The moves a seat can make: a bet needs the chips to cover it (`canBet(mult)`). */
export function legalMoves(street: Street, canBet: (mult: number) => boolean = () => true): Move[] {
  return streetMoves(street).filter((m) => MULT[m] === 0 || canBet(MULT[m]));
}

/** The closest legal move to `m`: a 4× that can't be covered becomes 3×, then a check (a fold on the river). */
export function fitLegal(m: Move, legal: Move[]): Move {
  if (legal.includes(m)) return m;
  if (m === 'bet4' && legal.includes('bet3')) return 'bet3';
  if (legal.includes('check')) return 'check';
  return legal.includes('fold') ? 'fold' : legal[0];
}

/**
 * The hint strategy of the single table (the player's hint, and the regulars' "calculated" play).
 * `board` is what is face up: nothing pre-flop, the flop, or all five cards on the river.
 * The river is riverBet's rule (a hidden pair or better, or fewer than 21 dealer outs) with the
 * outs read through outsOf, so every regular at the table counts them once per spot; the tests
 * check it against riverBet itself.
 */
export function bookMove(street: Street, hole: Card[], board: Card[]): Move {
  if (street === 'pre') return preflopRaise(hole) ? 'bet4' : 'check';
  if (street === 'flop') return flopRaise(hole, board.slice(0, 3)) ? 'bet2' : 'check';
  return hiddenMade(hole, board) || outsOf(hole, board) < 21 ? 'bet1' : 'fold';
}

// --------------------------------------------------------------------------- reading a hand

const sorted = (hole: Card[]) => hole.map(rankOf).sort((a, b) => b - a);
const suited = (hole: Card[]) => suitOf(hole[0]) === suitOf(hole[1]);

/**
 * How far two cards are from preflopRaise's 4× threshold, in kicker steps: ≥ 0 raises, 0 is the
 * weakest raising hand of its kind, −1 the best checking one. ±Infinity: nowhere near (any Ace;
 * ten-high and lower).
 */
export function preflopMargin(hole: Card[]): number {
  const [a, b] = sorted(hole);
  const s = suited(hole);
  if (a === b) return a - 3;
  if (a === 14) return Infinity;
  if (a === 13) return s ? b - 2 : b - 5;
  if (a === 12) return s ? b - 6 : b - 8;
  if (a === 11) return s ? b - 8 : b - 10;
  return -Infinity;
}

/** Four cards to a flush, one of them in the hole (not a flush yet). */
export function flushDraw(hole: Card[], board: Card[]): boolean {
  for (let s = 0; s < 4; s++) {
    const n = [...hole, ...board].filter((c) => suitOf(c) === s).length;
    if (n === 4 && hole.some((c) => suitOf(c) === s)) return true;
  }
  return false;
}

/** Four ranks in a row that two different cards complete (2-3-4-5 up to T-J-Q-K), one of them in the hole. */
export function openEnded(hole: Card[], board: Card[]): boolean {
  if (bestOf([...hole, ...board]).cat >= Cat5.Straight) return false;
  const have = new Set([...hole, ...board].map(rankOf));
  const mine = hole.map(rankOf);
  for (let r = 2; r <= 10; r++) {
    const run = [r, r + 1, r + 2, r + 3];
    if (run.every((x) => have.has(x)) && mine.some((x) => run.includes(x))) return true;
  }
  return false;
}

const outsMemo = new Map<string, number>();
/**
 * dealerOuts of uth/rules, remembered for the last few spots: every regular's mindset and its
 * thinking time read the same river, and dealerOuts evaluates 45 hands.
 */
export function outsOf(hole: Card[], board: Card[]): number {
  const key = `${hole.join(',')}|${board.join(',')}`;
  let v = outsMemo.get(key);
  if (v === undefined) {
    if (outsMemo.size >= 64) outsMemo.clear();
    v = dealerOuts(hole, board);
    outsMemo.set(key, v);
  }
  return v;
}

/** The board alone makes the seat's best hand (its own cards don't play). */
export const boardPlays = (hole: Card[], board: Card[]) => bestOf([...hole, ...board]).score === bestOf(board).score;

/**
 * A spot one step either side of the hint strategy's thresholds: what the book does there is the
 * closest call (the hybrid mindset leans on these; every regular thinks a little longer on them).
 * Pre-flop: the weakest raising hands and the best checking ones. Flop: pocket deuces, a hidden
 * pair no higher than the flop's lowest card, four to a flush with a hidden 9 or 10. River: no
 * hidden pair and 17–24 dealer outs: one rank (four cards) either side of the book's 21 (outs come in
 * steps of a rank, so this is 19 or 20 against 23 or 24 in practice).
 */
export function closeSpot(hole: Card[], board: Card[]): boolean {
  const street = streetOf(board);
  if (street === 'pre') {
    const m = preflopMargin(hole);
    return m === 0 || m === -1;
  }
  if (street === 'flop') {
    const flop = board.slice(0, 3);
    const h = bestOf([...hole, ...flop]);
    if (h.cat >= Cat5.TwoPair && hiddenMade(hole, flop)) return false;
    const [a, b] = sorted(hole);
    const hiddenPair = h.cat === Cat5.Pair && hole.some((c) => rankOf(c) === h.ranks[0]);
    if (hiddenPair) return (a === 2 && b === 2) || h.ranks[0] <= Math.min(...flop.map(rankOf));
    for (let s = 0; s < 4; s++) {
      if ([...hole, ...flop].filter((c) => suitOf(c) === s).length < 4) continue;
      const top = Math.max(0, ...hole.filter((c) => suitOf(c) === s).map(rankOf));
      if (top === 9 || top === 10) return true;
    }
    return false;
  }
  if (hiddenMade(hole, board)) return false;
  const outs = outsOf(hole, board);
  return outs >= 17 && outs <= 24;
}

// --------------------------------------------------------------------------- the regulars

/** What a mindset wants to do, before checking it can cover the bet (hunch's surprises aside). */
function mindsetMove(m: Mindset, street: Street, hole: Card[], board: Card[], mem: AiMemory): Move {
  const book = bookMove(street, hole, board);
  const [a, b] = sorted(hole);
  const pair = a === b;
  switch (m) {
    case 'calculated':
    case 'hunch':
      return book;
    case 'aggressive': {
      if (street === 'pre') {
        const s = suited(hole);
        const more = pair || a === 14 || (a === 13 && (s || b >= 10)) || (a === 12 && b === 11) || (s && a - b === 1 && b >= 8);
        return preflopRaise(hole) || more ? 'bet4' : 'check';
      }
      if (street === 'flop') {
        const flop = board.slice(0, 3);
        const more = bestOf([...hole, ...flop]).cat >= Cat5.Pair || flushDraw(hole, flop) || openEnded(hole, flop);
        return flopRaise(hole, flop) || more ? 'bet2' : 'check';
      }
      return boardPlays(hole, board) && outsOf(hole, board) > 25 ? 'fold' : 'bet1';
    }
    case 'conservative': {
      if (street === 'pre') return (pair && a >= 9) || (a === 14 && b >= 12) ? 'bet4' : 'check';
      if (street === 'flop') {
        const flop = board.slice(0, 3);
        return bestOf([...hole, ...flop]).cat >= Cat5.TwoPair && hiddenMade(hole, flop) ? 'bet2' : 'check';
      }
      return hiddenMade(hole, board) || outsOf(hole, board) < 16 ? 'bet1' : 'fold';
    }
    case 'hybrid': {
      // the book on clear spots; on the close ones it presses after two wins in a row and tightens after two losses
      const press = mem.streak >= 2;
      const tighten = mem.streak <= -2;
      if (street === 'pre') {
        const margin = preflopMargin(hole);
        if (margin === 0) return tighten ? 'check' : press ? 'bet4' : 'bet3';
        if (margin === -1) return press ? 'bet3' : 'check';
        return book;
      }
      if (!closeSpot(hole, board)) return book;
      const raise = street === 'flop' ? 'bet2' : 'bet1';
      const pass = street === 'flop' ? 'check' : 'fold';
      if (book === raise) return tighten ? pass : raise;
      return press ? raise : pass;
    }
  }
}

/**
 * One decision of a regular, always one of `legal`. The street follows from `board` (the cards
 * face up). Every mindset has real Ultimate Texas Hold'em skill:
 * - calculated: the hint strategy (preflopRaise / flopRaise / riverBet with the dealer's outs);
 * - aggressive: 4× also with any pair, any Ace, K-x suited, K-T+, Q-J and suited connectors 9-8
 *   and up; 2× on the flop with any pair or a four-flush / open-ended draw; bets every river
 *   unless the board plays and more than 25 cards beat it;
 * - conservative: 4× only with nines or better, A-K and A-Q; 2× on the flop only with two pair or
 *   better using a hole card; on the river bets a hidden pair or better or fewer than 16 outs,
 *   otherwise folds;
 * - hybrid: calculated on clear spots; on the close ones (closeSpot) it presses after a winning
 *   streak and tightens after a losing one (`mem.streak`), and raises 3× instead of 4× with the
 *   weakest raising hands;
 * - hunch: calculated, but about one decision in four is another legal move — never a fold of a
 *   made straight or better.
 */
export function aiDecision(m: Mindset, hole: Card[], board: Card[], legal: Move[], mem: AiMemory, rng: Rng): Move {
  const street = streetOf(board);
  const move = fitLegal(mindsetMove(m, street, hole, board, mem), legal);
  if (m !== 'hunch' || rng(4) !== 0) return move;
  const made = street === 'river' && bestOf([...hole, ...board]).cat >= Cat5.Straight;
  const others = legal.filter((x) => x !== move && !(made && x === 'fold'));
  return others.length ? others[rng(others.length)] : move;
}

/**
 * A regular's bets for the hand in its mindset: an Ante of 10–100 in steps of 5 (mindsetStake,
 * covering Ante + Blind + a 4× Play), and when the mindset takes the side bet a Trips of half the
 * Ante (at least 5), if the chips still cover it. An Ante of 0: broke (see canStay), the regular leaves.
 */
export function aiStakes(m: Mindset, chips: number, mem: AiMemory, rng: Rng): { ante: number; trips: number } {
  if (!canStay(chips)) return { ante: 0, trips: 0 };
  const ante = mindsetStake(m, { chips, min: PU.aiMin, max: PU.aiMax, step: 5, cover: 6, mem }, rng);
  if (ante < PU.aiMin) return { ante: 0, trips: 0 };
  let trips = mindsetSideBet(m, rng) ? Math.max(5, Math.floor(ante / 10) * 5) : 0;
  if (6 * ante + trips > chips) trips = 0;
  return { ante, trips };
}

// --------------------------------------------------------------------------- the round

export interface SeatIn {
  ante: number;
  trips: number;
  /** The regular's mindset this hand; null: the player's own seat (the hint strategy in playOut). */
  mind: Mindset | null;
}

export interface SeatState {
  mind: Mindset | null;
  ante: number;
  blind: number;
  trips: number;
  hole: Card[];
  /** The Play bet (0 until the seat bets). */
  play: number;
  folded: boolean;
  /** The seat's decisions, one per street it acted on. */
  moves: Move[];
}

/** The deal, in order, for the view to animate. */
export type DealEvent = { t: 'hole'; seat: number; card: Card } | { t: 'dealer'; card: Card } | { t: 'board'; i: number; card: Card };

export interface SeatResult {
  seat: number;
  folded: boolean;
  res: UthResult;
  /** Ante + Blind + Play + Trips, and their total return. */
  wager: number;
  ret: number;
  /** The same without the Trips side bet. */
  mainWager: number;
  mainRet: number;
}

export class PartyUthRound {
  /** The seats in play order (seat 0 = first base, the player's right). */
  readonly seats: SeatState[];
  dealer: Card[] = [];
  board: Card[] = [];
  street: Street | 'deal' | 'show' = 'deal';

  constructor(
    private shoe: Shoe,
    seats: SeatIn[],
  ) {
    this.seats = seats.map((s) => ({ mind: s.mind, ante: s.ante, blind: s.ante, trips: s.trips, hole: [], play: 0, folded: false, moves: [] }));
  }

  /** Two cards to each seat from first base and to the dealer, one at a time, then the board face down. */
  deal(): DealEvent[] {
    const out: DealEvent[] = [];
    for (let pass = 0; pass < 2; pass++) {
      this.seats.forEach((s, seat) => {
        const card = this.shoe.draw();
        s.hole.push(card);
        out.push({ t: 'hole', seat, card });
      });
      const card = this.shoe.draw();
      this.dealer.push(card);
      out.push({ t: 'dealer', card });
    }
    for (let i = 0; i < 5; i++) {
      const card = this.shoe.draw();
      this.board.push(card);
      out.push({ t: 'board', i, card });
    }
    this.street = 'pre';
    return out;
  }

  /** The board cards that are face up now. */
  get shown(): Card[] {
    if (this.street === 'flop') return this.board.slice(0, 3);
    if (this.street === 'river' || this.street === 'show') return this.board.slice();
    return [];
  }

  /** The seat still has a decision to make on this street. */
  live(seat: number): boolean {
    const s = this.seats[seat];
    return (this.street === 'pre' || this.street === 'flop' || this.street === 'river') && !s.folded && s.play === 0;
  }

  /** The seat's legal moves now; `canBet(mult)` says whether it can cover a Play of mult × Ante. */
  legal(seat: number, canBet?: (mult: number) => boolean): Move[] {
    return this.live(seat) ? legalMoves(this.street as Street, canBet) : [];
  }

  /** Plays one decision; returns the chips it puts on Play (0 for a check or a fold). */
  act(seat: number, move: Move): number {
    if (!this.live(seat) || !streetMoves(this.street as Street).includes(move)) return 0;
    const s = this.seats[seat];
    s.moves.push(move);
    if (move === 'fold') s.folded = true;
    s.play = s.ante * MULT[move];
    return s.play;
  }

  /** Turns the next board cards over: pre-flop → flop → river → showdown. */
  next(): Street | 'show' {
    this.street = this.street === 'pre' ? 'flop' : this.street === 'flop' ? 'river' : 'show';
    return this.street;
  }

  /** Every seat against the dealer and the board. */
  settle(): SeatResult[] {
    return this.seats.map((s, seat) => {
      const res = settleUth(s.hole, this.dealer, this.board, { ante: s.ante, blind: s.blind, trips: s.trips }, s.play, s.folded);
      const mainWager = s.ante + s.blind + s.play;
      const mainRet = res.ret.ante + res.ret.blind + res.ret.play;
      return { seat, folded: s.folded, res, wager: mainWager + s.trips, ret: mainRet + res.ret.trips, mainWager, mainRet };
    });
  }
}

/**
 * Plays a whole round without a view (tests and simulations): the regulars by their mindset
 * (with `mems[seat]`, a fresh memory when missing), the player's seat (mind null) by the hint
 * strategy. `chips[seat]` is what each seat has left behind its bets (undefined: unlimited).
 */
export function playOut(r: PartyUthRound, rng: Rng, chips: number[] = [], mems: AiMemory[] = []): SeatResult[] {
  r.deal();
  for (;;) {
    const street = r.street as Street;
    r.seats.forEach((s, seat) => {
      if (!r.live(seat)) return;
      const legal = r.legal(seat, (k) => chips[seat] === undefined || chips[seat] >= s.ante * k);
      const m = s.mind ? aiDecision(s.mind, s.hole, r.shown, legal, mems[seat] ?? newMemory(), rng) : fitLegal(bookMove(street, s.hole, r.shown), legal);
      const add = r.act(seat, m);
      if (chips[seat] !== undefined) chips[seat] -= add;
    });
    if (r.next() === 'show') break;
  }
  return r.settle();
}
