import { rankOf, type Card } from '../../core/cards';
import { Cat5 } from '../../core/eval5';
import type { Rng } from '../../core/rng';
import { mindsetSideBet, mindsetStake, type AiMemory, type Mindset } from '../partybj/mindset';
import {
  bookDecision,
  DEAL_STREETS,
  DECISION_AFTER,
  fitLegal,
  flushDraw,
  handScore,
  legalMoves,
  MULT,
  pairRank,
  riverRead,
  S7,
  scoreCat,
  settleStud,
  straightDraw,
  StudDeal,
  upCards,
  type DealCard,
  type DealStreet,
  type Move,
  type Street,
  type StudResult,
} from '../stud7/rules';

/**
 * Party Seven-Card Stud: five seats against one dealer (four of them regulars of the Villa Lago
 * circuit, with fictional chips). Every seat plays the single table's Seven-Card Stud (stud7/rules)
 * against the same dealer hand, all from one deck: 5 × 7 + 7 = 42 cards.
 *
 * - Every seat posts an Ante and a Blind equal to it, plus an optional STUD BONUS.
 * - The deal is real stud: one card at a time from first base (the dealer's left, the player's
 *   right), the dealer last in every pass. 3rd street is two down and one up; 4th, 5th and 6th one up;
 *   7th one down. Every up card on the table is seen by everyone: for a seat's decisions the other
 *   seats' up cards are dead cards (they can't come to its hand or to the dealer's).
 * - Decisions go round in turn order from first base after 3rd, 4th and 5th streets (CHECK or RAISE
 *   4× / 2× / 2×) and after 7th street (BET 1× or FOLD), exactly as at the single table.
 * - The regulars' down cards stay face down until the showdown; a folded seat's cards are mucked.
 * - Every seat is settled by `settleStud` against the dealer (a pair to qualify).
 *
 * RTP. The cards are exchangeable, so with the same play the player's seat returns what the single
 * table does (97.46% of the Ante). The hint here also reads the dead cards, and that information is
 * worth about 1.5 points: at the river the dealer's three hidden cards come from 25 unseen cards
 * instead of 41. A seeded simulation of 1,320,000 full tables (the player by the hint with the dead
 * cards, as `playOut` plays it) gave 99.00% of the Ante ± 0.69% (99.74% of the total wagered;
 * realised results 99.07% ± 0.81%), still a house edge of about 1% of the Ante.
 * The regulars, same tables and hands, exact expectation over the dealer's hidden cards, per Ante:
 * calculated 99.0% (the hint), hybrid 98.1%, conservative 87.3%, aggressive 82.8%, hunch 66.5%.
 * A shorter run is in tests/partystud.test.ts.
 */
export const PS = {
  minBet: S7.minBet,
  maxBet: S7.maxBet,
  /** The regulars ante 10–100 in steps of 5. */
  aiMin: 10,
  aiMax: 100,
  aiStep: 5,
};

/** Worst case a seat puts on the felt per Ante: Ante + Blind + a 4× raise (+ half an Ante of Bonus). */
export const COVER = 6;
export const COVER_BONUS = 6.5;

// --------------------------------------------------------------------------- the regulars' play

export interface AiChoice {
  move: Move;
  /** A borderline spot (the regular takes longer to decide). */
  close: boolean;
}

const RAISE_OF: Record<Exclude<Street, 'river'>, Move> = { third: 'raise4', fourth: 'raise2', fifth: 'raise2' };

/** The hand's made category with the cards it holds (fewer than five: pairs, trips and quads only). */
const madeCat = (own: readonly Card[]) => scoreCat(handScore(own));

/**
 * What an aggressive regular calls a hand worth pressing before the river: any pair or better, a
 * three- (3rd street) or four-card flush or straight draw whose cards are still live, or on 3rd street
 * two high cards (ten or better) both above the dealer's door card.
 */
export function aggressiveRaise(street: Exclude<Street, 'river'>, own: readonly Card[], up: readonly Card[], dead: readonly Card[]): boolean {
  if (madeCat(own) >= Cat5.Pair) return true;
  const view = [...up, ...dead];
  const fl = flushDraw(own, view);
  const st = straightDraw(own, view);
  if (street === 'third') {
    // three to a flush with at least 8 of the 10 others live; three to a straight with 6 of 8 live
    if (fl.have >= 3 && fl.live >= 8) return true;
    if (st.have >= 3 && st.live >= 6) return true;
    const door = rankOf(up[0]);
    return own.filter((c) => rankOf(c) >= 10 && rankOf(c) > door).length >= 2;
  }
  // four to a flush with 6 of the 9 others live, four to a straight with 3 of its 4 (or 8) fillers live
  return (fl.have >= 4 && fl.live >= 6) || (st.have >= 4 && st.live >= 3);
}

/**
 * What a conservative regular raises: rolled-up trips or a pair of jacks or better above the door
 * card on 3rd street; later two pair or better, or a pair of jacks or better above every dealer up
 * card while the dealer's board shows no pair.
 */
export function conservativeRaise(street: Exclude<Street, 'river'>, own: readonly Card[], up: readonly Card[]): boolean {
  const cat = madeCat(own);
  const pr = pairRank(own);
  const upRanks = up.map(rankOf);
  if (street === 'third') return cat >= Cat5.Trips || (pr >= 11 && pr > upRanks[0]);
  if (cat >= Cat5.TwoPair) return true;
  return pr >= 11 && upRanks.every((r) => r < pr) && pairRank(up) === 0;
}

/** Extra edge (in Antes) a conservative regular wants before betting the river. */
export const CONSERVATIVE_RIVER_MARGIN = 0.4;
/** Borderline band of the hybrid regular: equity points before the river, Antes at the river. */
export const HYBRID_BAND = { street: 0.08, river: 0.3 };

/**
 * One decision of a regular, by the hand's hidden mindset. `own` are the regular's cards (3, 4, 5
 * or 7), `up` the dealer's up cards, `dead` every other up card on the table (the other seats').
 * Always returns one of `legal`. Pure for a given rng.
 * - calculated: the table's best strategy (bookDecision), which reads the dead cards: a draw
 *   whose cards are showing elsewhere is weaker and the dealer's hidden cards can't be among them;
 * - aggressive: raises early with any pair, a live three-flush / three-straight or two high cards
 *   above the dealer's door card; later with a pair or a live four-card draw; bets the river unless
 *   drawing dead;
 * - conservative: raises only with trips, two pair or a high pair beating the dealer's board;
 *   bets the river only with a clear edge;
 * - hybrid: the best strategy on clear spots; on borderline ones presses after two wins in a row and
 *   tightens after two losses (`mem.streak`);
 * - hunch: the best strategy, but about one decision in four is another legal move — never folding
 *   a made straight or better.
 */
export function aiDecision(
  m: Mindset,
  own: readonly Card[],
  up: readonly Card[],
  dead: readonly Card[],
  street: Street,
  mem: AiMemory,
  rng: Rng,
  legal: Move[] = legalMoves(street),
): AiChoice {
  const pick = (mv: Move, close: boolean): AiChoice => ({ move: fitLegal(mv, legal), close });
  switch (m) {
    case 'calculated': {
      const d = bookDecision(street, own, up, dead);
      return pick(d.move, isClose(street, d.margin));
    }
    case 'aggressive': {
      if (street === 'river') {
        const r = riverRead(own, up, dead);
        // drawing dead: no three hidden cards leave the dealer below this hand
        return pick(r.win + (1 - r.win - r.lose) > 0.01 ? 'bet1' : 'fold', r.win < 0.25);
      }
      const go = aggressiveRaise(street, own, up, dead);
      return pick(go ? RAISE_OF[street] : 'check', false);
    }
    case 'conservative': {
      if (street === 'river') {
        const r = riverRead(own, up, dead);
        const margin = r.betEV - r.foldEV;
        return pick(margin >= CONSERVATIVE_RIVER_MARGIN ? 'bet1' : 'fold', Math.abs(margin - CONSERVATIVE_RIVER_MARGIN) < 0.3);
      }
      return pick(conservativeRaise(street, own, up) ? RAISE_OF[street] : 'check', false);
    }
    case 'hybrid': {
      const d = bookDecision(street, own, up, dead);
      const band = street === 'river' ? HYBRID_BAND.river : HYBRID_BAND.street;
      if (Math.abs(d.margin) > band) return pick(d.move, false);
      const press: Move = street === 'river' ? 'bet1' : RAISE_OF[street];
      const tight: Move = street === 'river' ? 'fold' : 'check';
      if (mem.streak >= 2) return pick(press, true);
      if (mem.streak <= -2) return pick(tight, true);
      return pick(d.move, true);
    }
    case 'hunch': {
      const d = bookDecision(street, own, up, dead);
      const book = fitLegal(d.move, legal);
      if (rng(4) !== 0) return { move: book, close: isClose(street, d.margin) };
      const madeStraight = street === 'river' && madeCat(own) >= Cat5.Straight;
      const others = legal.filter((x) => x !== book && !(madeStraight && x === 'fold'));
      return { move: others.length ? others[rng(others.length)] : book, close: true };
    }
  }
}

const isClose = (street: Street, margin: number) => Math.abs(margin) < (street === 'river' ? 0.25 : 0.06);

/**
 * A regular's bets for the hand: the Ante by the mindset (mindsetStake, 10–100 in steps of 5,
 * covering Ante + Blind + 4× and the Bonus), and a Bonus of half the Ante (at least 5) when the
 * mindset fancies the side bet. An Ante of 0: the regular can't cover the minimum (busted).
 */
export function aiBets(m: Mindset, chips: number, mem: AiMemory, rng: Rng): { ante: number; bonus: number } {
  let side = mindsetSideBet(m, rng);
  const stake = (cover: number) => mindsetStake(m, { chips, min: PS.aiMin, max: PS.aiMax, step: PS.aiStep, cover, mem }, rng);
  let ante = stake(side ? COVER_BONUS : COVER);
  if (ante < PS.aiMin && side) {
    // short of chips: the side bet goes first
    side = false;
    ante = stake(COVER);
  }
  if (ante < PS.aiMin) return { ante: 0, bonus: 0 };
  return { ante, bonus: side ? Math.max(5, Math.floor(ante / 10) * 5) : 0 };
}

/** A regular is out of chips when not even the minimum Ante with its Blind and a 4× raise is covered. */
export const busted = (chips: number) => chips < PS.aiMin * COVER;

// --------------------------------------------------------------------------- the round

export interface SeatIn {
  ante: number;
  bonus: number;
  /** null: the player's own seat. */
  mindset: Mindset | null;
}

export interface SeatState {
  mindset: Mindset | null;
  ante: number;
  blind: number;
  bonus: number;
  /** The raise on the felt (0 until the seat raises or bets). */
  raise: number;
  folded: boolean;
  /** The seat's decisions, one per street it acted on. */
  moves: Move[];
}

export interface SeatResult {
  seat: number;
  folded: boolean;
  res: StudResult;
  /** Everything the seat staked, and its total return. */
  wager: number;
  ret: number;
}

/**
 * A full stud table: the deal street by street, every seat's decisions and the settlement. Seats
 * are in play order (seat 0 = first base, on the player's right).
 */
export class PartyStudRound {
  readonly seats: SeatState[];
  readonly deal: StudDeal;
  /** The last street dealt. */
  dealt: DealStreet | null = null;

  constructor(draw: () => Card, seats: SeatIn[]) {
    this.seats = seats.map((s) => ({ mindset: s.mindset, ante: s.ante, blind: s.ante, bonus: s.bonus, raise: 0, folded: false, moves: [] }));
    this.deal = new StudDeal(draw, seats.length);
  }

  /** Deals the next street and returns its cards in order. */
  next(): DealCard[] {
    const i = this.dealt ? DEAL_STREETS.indexOf(this.dealt) + 1 : 0;
    const s = DEAL_STREETS[i];
    this.dealt = s;
    return this.deal.street(s);
  }

  /** The decision due after the street just dealt (null after 6th street and before the deal). */
  get decision(): Street | null {
    return this.dealt ? DECISION_AFTER[this.dealt] : null;
  }

  cards(seat: number): Card[] {
    return this.deal.hands[seat];
  }

  get dealer(): Card[] {
    return this.deal.dealer;
  }

  get dealerUp(): Card[] {
    return this.deal.dealerUp;
  }

  /** Other seats' up cards: dead for this seat. */
  dead(seat: number): Card[] {
    return this.deal.deadFor(seat);
  }

  /** The seat still has a decision to make on this street. */
  live(seat: number): boolean {
    const s = this.seats[seat];
    return this.decision !== null && !s.raise && !s.folded;
  }

  /** The moves the seat can make now, with `chips` left to cover a raise. */
  legal(seat: number, chips: number): Move[] {
    const s = this.seats[seat];
    return legalMoves(this.decision!, (k) => chips >= k * s.ante);
  }

  /** Records a decision; returns the chips the seat adds to the felt. */
  act(seat: number, move: Move): number {
    const s = this.seats[seat];
    if (!this.live(seat)) return 0;
    s.moves.push(move);
    if (move === 'fold') {
      s.folded = true;
      return 0;
    }
    s.raise = MULT[move] * s.ante;
    return s.raise;
  }

  settle(): SeatResult[] {
    return this.seats.map((s, seat) => {
      const res = settleStud(this.cards(seat), this.dealer, { ante: s.ante, blind: s.blind, bonus: s.bonus }, s.raise, s.folded);
      const r = res.ret;
      return { seat, folded: s.folded, res, wager: s.ante + s.blind + s.raise + s.bonus, ret: r.ante + r.blind + r.raise + r.bonus };
    });
  }
}

/** The player's up cards and everyone's: what a seat sees of the table. */
export const tableUp = (r: PartyStudRound) => r.deal.hands.map((h) => upCards(h));

/**
 * Plays a whole table without a view (tests, simulations): the regulars by their mindset with
 * `mems[seat]`, the player's seat (mindset null) by the hint strategy with the dead cards.
 */
export function playOut(r: PartyStudRound, mems: (AiMemory | null)[], rng: Rng): SeatResult[] {
  while (r.dealt !== 'seventh') {
    r.next();
    const st = r.decision;
    if (!st) continue;
    r.seats.forEach((s, seat) => {
      if (!r.live(seat)) return;
      const own = r.cards(seat);
      const mv = s.mindset ? aiDecision(s.mindset, own, r.dealerUp, r.dead(seat), st, mems[seat]!, rng).move : bookDecision(st, own, r.dealerUp, r.dead(seat)).move;
      r.act(seat, mv);
    });
  }
  return r.settle();
}
