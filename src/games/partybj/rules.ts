import type { Card, Shoe } from '../../core/cards';
import type { Rng } from '../../core/rng';
import { BlackjackRound, bjValue, handValue, isNatural, RULES, type Actions, type BJEvent, type BJHand, type Outcome } from '../blackjack/rules';
import { basicStrategy, type Move } from '../blackjack/strategy';

/**
 * Party Blackjack: five seats against one dealer (four of them AI players with fictional chips).
 *
 * The rules are the Blackjack table's, and so is the engine: every seat's hands are played by a
 * `BlackjackRound` of their own (hit, stand, double, split, split aces, 21s, the order of split
 * hands) and the dealer's hand is drawn by one as well. This module only adds what a full table
 * needs: the deal in seat order, the turn order and settling every seat against the same dealer.
 * There is no insurance (a fast table); the dealer still peeks with an Ace or a ten up.
 *
 * Payouts (total return per hand, stake included): blackjack 2.5×, win 2×, push 1×, lose/bust 0.
 * RTP for the player with basic strategy ≈ 99.6% (6 decks, S17, DAS, 3:2, resplit to 4 hands,
 * one card to split Aces, no surrender, peek; house edge ≈ 0.4%): a 2,000,000-round seeded
 * simulation gave 99.65% ± 0.07%. The other seats don't change it (the cards are exchangeable).
 * The regulars, same simulation: bookish 99.7%, daring 95.2%, cautious 92.0%, wildcard 91.2%.
 * A shorter seeded run is in tests/partybj.test.ts.
 */
export const PB = {
  decks: RULES.decks,
  minBet: RULES.minBet,
  maxBet: RULES.maxBet,
  /** AI players bet 10–200 per hand. */
  aiMin: 10,
  aiMax: 200,
};

export type Style = 'bookish' | 'cautious' | 'daring' | 'wildcard';

export interface AiProfile {
  name: string;
  style: Style;
  /** Chips the player sits down (and buys in again) with. */
  bank: number;
}

/**
 * The four regulars, by their place at the table from the player's left to right: third base and
 * the seat next to it, then the two seats nearer first base (the dealer's left, who acts first).
 */
export const REGULARS: AiProfile[] = [
  { name: 'Ines', style: 'bookish', bank: 2400 },
  { name: 'Walter', style: 'cautious', bank: 1500 },
  { name: 'Milo', style: 'wildcard', bank: 1800 },
  { name: 'Roxie', style: 'daring', bank: 3000 },
];

// --------------------------------------------------------------------------- AI players

/** How much an AI player bets this hand: 10–200 in steps of 5, by style, never more than it has. */
export function aiBet(style: Style, chips: number, rng: Rng): number {
  const pick = (lo: number, hi: number, step: number) => lo + step * rng(Math.floor((hi - lo) / step) + 1);
  let bet: number;
  switch (style) {
    case 'bookish':
      bet = pick(25, 100, 25);
      break;
    case 'cautious':
      bet = pick(10, 50, 5);
      break;
    case 'daring':
      bet = pick(50, 200, 25);
      break;
    default:
      bet = pick(10, 200, 5);
  }
  bet = Math.min(bet, PB.aiMax, Math.floor(chips / 5) * 5);
  return bet >= PB.aiMin ? bet : 0;
}

/** Pair of the same blackjack value (a 10 and a King split like the Blackjack table allows). */
const isPair = (cards: Card[]) => cards.length === 2 && bjValue(cards[0]) === bjValue(cards[1]);

/**
 * One decision of an AI player. Always a legal move for `can` (the seat round's actions).
 * - bookish: perfect basic strategy;
 * - cautious: stands on 12 or more, never doubles or splits;
 * - daring: hits to 17, doubles every 8–11 and soft 13–19, splits every pair but 5s and tens;
 * - wildcard: basic strategy, but one decision in four is a random other move (never hitting a hard 19+).
 */
export function aiMove(style: Style, cards: Card[], dealerUp: Card, can: Actions, rng: Rng): Move {
  const v = handValue(cards);
  switch (style) {
    case 'bookish':
      return basicStrategy(cards, dealerUp, can.double, can.split);
    case 'cautious':
      return v.total >= 12 || !can.hit ? 'stand' : 'hit';
    case 'daring': {
      if (can.split && isPair(cards) && bjValue(cards[0]) !== 10 && bjValue(cards[0]) !== 5) return 'split';
      if (can.double && cards.length === 2 && (v.soft ? v.total >= 13 && v.total <= 19 : v.total >= 8 && v.total <= 11)) return 'double';
      return v.total < 17 && can.hit ? 'hit' : 'stand';
    }
    case 'wildcard': {
      const book = basicStrategy(cards, dealerUp, can.double, can.split);
      if (rng(4) !== 0) return book;
      const others = (['hit', 'stand', 'double', 'split'] as Move[]).filter(
        (m) => m !== book && can[m] && !(!v.soft && v.total >= 19 && (m === 'hit' || m === 'double')),
      );
      return others.length ? others[rng(others.length)] : book;
    }
  }
}

// --------------------------------------------------------------------------- the round

export interface SeatIn {
  bet: number;
  /** null: the player's own seat. */
  style: Style | null;
}

type SeatEv = Extract<BJEvent, { t: 'split' | 'double' | 'active' | 'handDone' }>;

/** Everything that happens at the table, in order, for the view to animate. */
export type PEvent =
  | { t: 'card'; seat: number; hand: number; card: Card }
  | { t: 'dealer'; card: Card; faceUp: boolean }
  | { t: 'peek'; dealerBJ: boolean }
  | { t: 'flipHole' }
  | { t: 'dealerDone'; total: number; bust: boolean }
  | ({ seat: number } & SeatEv);

export interface HandResult {
  outcome: Outcome;
  bet: number;
  ret: number;
}

export interface SeatResult {
  seat: number;
  hands: HandResult[];
  wager: number;
  ret: number;
}

// A seat's own BlackjackRound never sees the real dealer: it is given two Kings (a standing 20),
// so when its last hand is finished the engine's dealer step draws nothing. The seat's results
// against that stand-in are discarded; settle() compares every seat with the real dealer.
const STANDING: Card[] = [11, 24]; // K♠ K♥
// The dealer's own BlackjackRound gets a busted hand when nobody at the table is still live
// (everyone busted or has a blackjack), so it just turns the hole card over.
const BUSTED: Card[] = [8, 9, 10]; // T♠ J♠ Q♠

/** Same comparison as the Blackjack table's settle(): one hand against the dealer's final cards. */
export function settleHand(h: BJHand, dealer: Card[]): { outcome: Outcome; ret: number } {
  const pv = handValue(h.cards).total;
  const dv = handValue(dealer).total;
  const natural = !h.fromSplit && isNatural(h.cards);
  if (pv > 21) return { outcome: 'bust', ret: 0 };
  if (isNatural(dealer)) return natural ? { outcome: 'push', ret: h.bet } : { outcome: 'lose', ret: 0 };
  if (natural) return { outcome: 'blackjack', ret: h.bet * (1 + RULES.blackjackPays) };
  if (dv > 21 || pv > dv) return { outcome: 'win', ret: h.bet * 2 };
  if (pv === dv) return { outcome: 'push', ret: h.bet };
  return { outcome: 'lose', ret: 0 };
}

export class PartyRound {
  /** One blackjack engine per seat, in play order (seat 0 = first base, the dealer's left). */
  readonly seats: { round: BlackjackRound; style: Style | null }[];
  dealer: Card[] = [];
  dealerBJ = false;
  phase: 'deal' | 'play' | 'done' = 'deal';

  constructor(
    private shoe: Shoe,
    seats: SeatIn[],
  ) {
    this.seats = seats.map((s) => {
      const round = new BlackjackRound(shoe, s.bet);
      round.dealer = [...STANDING];
      return { round, style: s.style };
    });
  }

  get dealerUp(): Card {
    return this.dealer[0];
  }

  hands(seat: number): BJHand[] {
    return this.seats[seat].round.hands;
  }

  /** The seat's first two cards are a blackjack (only before any split, so only hand 0). */
  natural(seat: number): boolean {
    const h = this.hands(seat)[0];
    return !h.fromSplit && isNatural(h.cards);
  }

  /**
   * The deal in the real order: one card to each seat from first base, the dealer's up card, a
   * second round, the hole card. With an Ace or a ten up the dealer peeks; a dealer blackjack ends
   * the round at once (only a player blackjack pushes).
   */
  deal(): PEvent[] {
    const out: PEvent[] = [];
    for (let pass = 0; pass < 2; pass++) {
      this.seats.forEach((s, seat) => {
        const card = this.shoe.draw();
        s.round.hands[0].cards.push(card);
        out.push({ t: 'card', seat, hand: 0, card });
      });
      const card = this.shoe.draw();
      this.dealer.push(card);
      out.push({ t: 'dealer', card, faceUp: pass === 0 });
    }
    if (bjValue(this.dealerUp) >= 10) {
      this.dealerBJ = isNatural(this.dealer);
      out.push({ t: 'peek', dealerBJ: this.dealerBJ });
    }
    this.seats.forEach((s, seat) => {
      const done = this.dealerBJ || this.natural(seat);
      s.round.hands[0].done = done;
      s.round.phase = done ? 'done' : 'player';
    });
    if (this.dealerBJ) {
      out.push({ t: 'flipHole' }, { t: 'dealerDone', total: 21, bust: false });
      this.phase = 'done';
    } else this.phase = 'play';
    return out;
  }

  /** The seat still has a decision to make. */
  live(seat: number): boolean {
    return this.phase === 'play' && this.seats[seat].round.phase === 'player';
  }

  /** Index of the hand the seat is playing. */
  activeHand(seat: number): number {
    return this.seats[seat].round.active;
  }

  actions(seat: number, chips: number): Actions {
    return this.seats[seat].round.actions(chips);
  }

  /** Plays one move for a seat with the blackjack engine and passes its events on. */
  act(seat: number, move: Move): PEvent[] {
    const r = this.seats[seat].round;
    if (!this.live(seat)) return [];
    const evs = move === 'hit' ? r.hit() : move === 'stand' ? r.stand() : move === 'double' ? r.double() : r.split();
    const out: PEvent[] = [];
    for (const e of evs) {
      if (e.t === 'deal' && e.to === 'player') out.push({ t: 'card', seat, hand: e.hand, card: e.card });
      else if (e.t === 'split' || e.t === 'double' || e.t === 'active' || e.t === 'handDone') out.push({ ...e, seat });
      // the stand-in dealer's flipHole / dealerDone / settle are not the table's
    }
    return out;
  }

  /** Any hand left that the dealer must beat (not busted, not a blackjack already paid). */
  private anyLive(): boolean {
    return this.seats.some((s) => s.round.hands.some((h) => handValue(h.cards).total <= 21 && !(!h.fromSplit && isNatural(h.cards))));
  }

  /**
   * The dealer turns the hole card over and draws to 17 (standing on soft 17), using the blackjack
   * engine's own dealer step: a one-hand BlackjackRound that shares this shoe and these dealer cards.
   */
  playDealer(): PEvent[] {
    if (this.phase !== 'play') return [];
    const dr = new BlackjackRound(this.shoe, 0);
    dr.dealer = this.dealer;
    dr.hands[0].cards = this.anyLive() ? [] : [...BUSTED];
    const out: PEvent[] = [];
    for (const e of dr.stand()) {
      if (e.t === 'flipHole' || e.t === 'dealerDone') out.push(e);
      else if (e.t === 'deal' && e.to === 'dealer') out.push({ t: 'dealer', card: e.card, faceUp: true });
    }
    this.phase = 'done';
    return out;
  }

  /** Every seat against the dealer's final hand. */
  settle(): SeatResult[] {
    return this.seats.map((s, seat) => {
      const hands = s.round.hands.map((h) => {
        const r = settleHand(h, this.dealer);
        h.outcome = r.outcome;
        h.ret = r.ret;
        return { outcome: r.outcome, bet: h.bet, ret: r.ret };
      });
      return { seat, hands, wager: hands.reduce((a, h) => a + h.bet, 0), ret: hands.reduce((a, h) => a + h.ret, 0) };
    });
  }
}

/**
 * Plays a whole round without a view (tests and simulations): AI seats by their style with
 * `chips[seat]` to double and split with, the player's seat (style null) by basic strategy.
 */
export function playOut(r: PartyRound, chips: number[], rng: Rng): SeatResult[] {
  r.deal();
  r.seats.forEach((s, seat) => {
    while (r.live(seat)) {
      const h = r.hands(seat)[r.activeHand(seat)];
      const can = r.actions(seat, chips[seat]);
      const m = s.style ? aiMove(s.style, h.cards, r.dealerUp, can, rng) : basicStrategy(h.cards, r.dealerUp, can.double, can.split);
      if (m === 'double' || m === 'split') chips[seat] -= h.bet;
      r.act(seat, m);
    }
  });
  r.playDealer();
  return r.settle();
}
