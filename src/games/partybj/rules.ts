import type { Card, Shoe } from '../../core/cards';
import type { Rng } from '../../core/rng';
import { BlackjackRound, bjValue, handValue, isNatural, RULES, type Actions, type BJEvent, type BJHand, type Outcome } from '../blackjack/rules';
import { basicStrategy, type Move } from '../blackjack/strategy';
import { mindsetStake, type AiMemory, type Mindset } from './mindset';

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
 *
 * The regulars play each hand in a hidden mindset (mindset.ts) drawn when the hand starts; see
 * aiMove and aiBet. Return per unit bet of each mindset, seeded simulations of 1,800,000 rounds at a
 * table with one seat per mindset (each staking by mindsetStake) and a flat basic-strategy seat,
 * the shoe cut at 80% ± 4%: calculated 101.0% (Hi-Lo with the index plays and a 10–120 spread),
 * hybrid 99.6%, aggressive 99.0%, conservative 98.7%, hunch 91.2%; flat basic strategy 99.5%
 * there. A 300,000-round run is in tests/partybj.test.ts.
 */
export const PB = {
  decks: RULES.decks,
  minBet: RULES.minBet,
  maxBet: RULES.maxBet,
  /** AI players bet 10–200 per hand. */
  aiMin: 10,
  aiMax: 200,
};

/** A regular's hidden temperament: it only weights the mindsets they draw (mindset.ts). */
export type Style = 'bookish' | 'cautious' | 'daring' | 'wildcard';

export interface AiProfile {
  name: string;
  style: Style;
  /** Chips the player sits down with. */
  bank: number;
}

/**
 * Four regulars of the old fixed line-up, kept for older callers and tests: the tables now seat
 * players from roster.ts at random.
 */
export const REGULARS: AiProfile[] = [
  { name: 'Ines', style: 'bookish', bank: 2400 },
  { name: 'Walter', style: 'cautious', bank: 1500 },
  { name: 'Milo', style: 'wildcard', bank: 1800 },
  { name: 'Roxie', style: 'daring', bank: 3000 },
];

// --------------------------------------------------------------------------- card counting

/** Hi-Lo tag of a card: 2–6 count +1, 7–9 count 0, tens and Aces count −1. */
export const hiLoTag = (c: Card) => {
  const v = bjValue(c);
  return v <= 6 ? 1 : v >= 10 ? -1 : 0;
};

/**
 * The Hi-Lo count of one shoe: every card seen face up at the table since the last shuffle (the
 * regulars all watch the same cards, so a table keeps one). The true count is the running count
 * per deck not yet seen.
 */
export class HiLo {
  running = 0;
  seen = 0;

  constructor(readonly decks: number = PB.decks) {}

  /** A fresh shoe. */
  reset() {
    this.running = 0;
    this.seen = 0;
  }

  see(cards: readonly Card[]) {
    for (const c of cards) {
      this.running += hiLoTag(c);
      this.seen++;
    }
  }

  /** Decks still unseen (the shoe and the dealer's hole card), never under half a deck. */
  get decksLeft() {
    return Math.max(0.5, (this.decks * 52 - this.seen) / 52);
  }

  get trueCount() {
    return this.running / this.decksLeft;
  }
}

/** The cards a batch of table events turns face up (the hole card when it is flipped over). */
export function shownCards(evs: readonly PEvent[], dealer: readonly Card[]): Card[] {
  const out: Card[] = [];
  for (const e of evs) {
    if (e.t === 'card') out.push(e.card);
    else if (e.t === 'dealer' && e.faceUp) out.push(e.card);
    else if (e.t === 'flipHole' && dealer[1] !== undefined) out.push(dealer[1]);
  }
  return out;
}

/** The counter's read of the next hand for its stake (−1..1): one unit at TC 1, spread from there. */
export const countEdge = (tc: number) => Math.max(-1, Math.min(1, (tc - 1) / 4));

// --------------------------------------------------------------------------- AI players

/** What a regular knows when deciding: the table's true count and their own streak. */
export interface AiRead {
  tc: number;
  /** +n after n wins in a row, −n after n losses (AiMemory.streak). */
  streak: number;
}

/**
 * How much a regular bets this hand in its mindset (mindsetStake): 10–200 in steps of 5, never
 * more than it has. Only the calculated mindset reads the true count `tc`.
 */
export function aiBet(m: Mindset, chips: number, mem: AiMemory, tc: number, rng: Rng): number {
  const bet = mindsetStake(m, { chips, min: PB.aiMin, max: PB.aiMax, step: 5, mem, edge: countEdge(tc) }, rng);
  return bet >= PB.aiMin ? bet : 0;
}

/** A regular who can't cover the minimum bet leaves the table. */
export const isBroke = (chips: number) => chips < PB.aiMin;

/** Pair of the same blackjack value (a 10 and a King split like the Blackjack table allows). */
const isPair = (cards: Card[]) => cards.length === 2 && bjValue(cards[0]) === bjValue(cards[1]);

/** An index play: with a hard `total` against `up` (2..11), `move` once the true count reaches `tc`. */
export interface IndexPlay {
  total: number;
  up: number;
  move: Move;
  tc: number;
  /** ge: at TC ≥ tc · le: at TC ≤ tc · lt: at TC < tc. */
  at: 'ge' | 'le' | 'lt';
}

/** The counter's main deviations from basic strategy (Illustrious 18 style, S17, no insurance). */
export const INDEX_PLAYS: IndexPlay[] = [
  { total: 16, up: 10, move: 'stand', tc: 0, at: 'ge' },
  { total: 15, up: 10, move: 'stand', tc: 4, at: 'ge' },
  { total: 12, up: 3, move: 'stand', tc: 2, at: 'ge' },
  { total: 12, up: 2, move: 'stand', tc: 3, at: 'ge' },
  { total: 16, up: 9, move: 'stand', tc: 5, at: 'ge' },
  { total: 11, up: 11, move: 'double', tc: 1, at: 'ge' },
  { total: 10, up: 10, move: 'double', tc: 4, at: 'ge' },
  { total: 10, up: 11, move: 'double', tc: 4, at: 'ge' },
  { total: 9, up: 2, move: 'double', tc: 1, at: 'ge' },
  { total: 9, up: 7, move: 'double', tc: 3, at: 'ge' },
  { total: 13, up: 2, move: 'hit', tc: -1, at: 'le' },
  { total: 12, up: 4, move: 'hit', tc: 0, at: 'lt' },
  { total: 12, up: 5, move: 'hit', tc: -2, at: 'le' },
  { total: 12, up: 6, move: 'hit', tc: -1, at: 'le' },
  { total: 13, up: 3, move: 'hit', tc: -2, at: 'le' },
];

/** Splitting tens, by dealer up card: against a 5 at TC ≥ 5, against a 6 at TC ≥ 4. */
const TEN_SPLITS: Partial<Record<number, number>> = { 5: 5, 6: 4 };

const reached = (ix: IndexPlay, tc: number) => (ix.at === 'ge' ? tc >= ix.tc : ix.at === 'le' ? tc <= ix.tc : tc < ix.tc);

/** The move if it is allowed, else the nearest one that is. */
function legal(m: Move, can: Actions, cards: Card[], up: Card): Move {
  if (can[m]) return m;
  if (m === 'split') return legal(basicStrategy(cards, up, can.double, false), can, cards, up);
  return m === 'double' && can.hit ? 'hit' : 'stand';
}

const book = (cards: Card[], up: Card, can: Actions) => legal(basicStrategy(cards, up, can.double, can.split), can, cards, up);

/** Basic strategy with the counter's index plays at true count `tc`. */
export function countedMove(cards: Card[], up: Card, can: Actions, tc: number): Move {
  const u = bjValue(up);
  const tens = TEN_SPLITS[u];
  if (can.split && isPair(cards) && bjValue(cards[0]) === 10 && tens !== undefined && tc >= tens) return 'split';
  const b = book(cards, up, can);
  if (b === 'split') return b;
  const v = handValue(cards);
  if (!v.soft) {
    const ix = INDEX_PLAYS.find((i) => i.total === v.total && i.up === u);
    if (ix && reached(ix, tc) && can[ix.move]) return ix.move;
  }
  return b;
}

/**
 * A close spot: an index play within one true count of its index (splitting tens included), or a
 * soft double. `press` is the bolder move and `tight` the safer one.
 */
export function closeSpot(cards: Card[], up: Card, can: Actions, tc: number): { press: Move; tight: Move } | null {
  const u = bjValue(up);
  const v = handValue(cards);
  if (can.split && isPair(cards)) {
    const tens = TEN_SPLITS[u];
    if (bjValue(cards[0]) === 10 && tens !== undefined) return Math.abs(tc - tens) <= 1 ? { press: 'split', tight: 'stand' } : null;
    if (basicStrategy(cards, up, can.double, true) === 'split') return null;
  }
  if (!v.soft) {
    const ix = INDEX_PLAYS.find((i) => i.total === v.total && i.up === u);
    if (!ix || Math.abs(tc - ix.tc) > 1 || !can.hit) return null;
    if (ix.move === 'double') return can.double ? { press: 'double', tight: 'hit' } : null;
    return { press: 'hit', tight: 'stand' };
  }
  if (can.double && basicStrategy(cards, up, true, false) === 'double') return { press: 'double', tight: legal(basicStrategy(cards, up, false, false), can, cards, up) };
  return null;
}

/**
 * One decision of a regular in this hand's mindset. Always a legal move for `can` (the seat
 * round's actions).
 * - calculated: counts cards — basic strategy with the index plays at the table's true count;
 * - aggressive: basic strategy that presses: doubles every soft 13–18 against 2–6 and every 9–11
 *   against anything, splits 2s, 3s, 6s and 7s against 2–7 and 9s always, hits 12 against 2–3;
 * - conservative: never doubles a soft hand, doubles only 10–11 against 2–9, splits only Aces and
 *   8s, stands on 12+ against 2–6 and on 15–16 against 7–10 (it costs, but it rarely busts);
 * - hybrid: the counter's move, except on close spots, where it presses after two wins or more in a
 *   row and plays safe after two losses or more;
 * - hunch: basic strategy, but one decision in four is a random other legal move (never hitting or
 *   doubling a hard 19+).
 */
export function aiMove(m: Mindset, cards: Card[], dealerUp: Card, can: Actions, read: AiRead, rng: Rng): Move {
  const v = handValue(cards);
  const u = bjValue(dealerUp);
  switch (m) {
    case 'calculated':
      return countedMove(cards, dealerUp, can, read.tc);
    case 'aggressive': {
      if (can.split && isPair(cards)) {
        const p = bjValue(cards[0]);
        if ([2, 3, 6, 7].includes(p) && u <= 7) return 'split';
        if (p === 9) return 'split';
      }
      if (can.double) {
        if (v.soft && v.total >= 13 && v.total <= 18 && u <= 6) return 'double';
        if (!v.soft && v.total >= 9 && v.total <= 11) return 'double';
      }
      if (!v.soft && v.total === 12 && u <= 3 && can.hit) return 'hit';
      return book(cards, dealerUp, can);
    }
    case 'conservative': {
      if (can.split && isPair(cards) && (bjValue(cards[0]) === 11 || bjValue(cards[0]) === 8)) return 'split';
      if (!v.soft) {
        if (can.double && (v.total === 10 || v.total === 11) && u <= 9) return 'double';
        if (v.total >= 12 && u <= 6) return 'stand';
        if ((v.total === 15 || v.total === 16) && u >= 7 && u <= 10) return 'stand';
      }
      return legal(basicStrategy(cards, dealerUp, false, false), can, cards, dealerUp);
    }
    case 'hybrid': {
      const spot = Math.abs(read.streak) >= 2 ? closeSpot(cards, dealerUp, can, read.tc) : null;
      if (spot) return read.streak > 0 ? spot.press : spot.tight;
      return countedMove(cards, dealerUp, can, read.tc);
    }
    case 'hunch': {
      const b = book(cards, dealerUp, can);
      if (rng(4) !== 0) return b;
      const others = (['hit', 'stand', 'double', 'split'] as Move[]).filter(
        (x) => x !== b && can[x] && !(!v.soft && v.total >= 19 && (x === 'hit' || x === 'double')),
      );
      return others.length ? others[rng(others.length)] : b;
    }
  }
}

// --------------------------------------------------------------------------- the round

export interface SeatIn {
  bet: number;
  /** The regular's mindset this hand; null: the player's own seat. */
  mind: Mindset | null;
  /** The regular's streak going into the hand (the hybrid mindset leans on it). */
  streak?: number;
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
  readonly seats: { round: BlackjackRound; mind: Mindset | null; streak: number }[];
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
      return { round, mind: s.mind, streak: s.streak ?? 0 };
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
 * Plays a whole round without a view (tests and simulations): the regulars by their mindset with
 * `chips[seat]` to double and split with, the player's seat (mind null) by basic strategy. With a
 * `count`, every card turned face up is counted as it shows, and the regulars read its true count.
 */
export function playOut(r: PartyRound, chips: number[], rng: Rng, count?: HiLo): SeatResult[] {
  const see = (evs: PEvent[]) => count?.see(shownCards(evs, r.dealer));
  see(r.deal());
  r.seats.forEach((s, seat) => {
    while (r.live(seat)) {
      const h = r.hands(seat)[r.activeHand(seat)];
      const can = r.actions(seat, chips[seat]);
      const m = s.mind
        ? aiMove(s.mind, h.cards, r.dealerUp, can, { tc: count?.trueCount ?? 0, streak: s.streak }, rng)
        : basicStrategy(h.cards, r.dealerUp, can.double, can.split);
      if (m === 'double' || m === 'split') chips[seat] -= h.bet;
      see(r.act(seat, m));
    }
  });
  see(r.playDealer());
  return r.settle();
}
