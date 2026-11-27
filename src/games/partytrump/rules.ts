import { cryptoRng, shuffle, type Rng } from '../../core/rng';
import {
  BULLSEYE_EXTRA,
  dealWeight,
  isTargetTrump,
  lineValue,
  shiftValue,
  TARGET_MAX,
  TARGET_MIN,
  TRUMPS,
  TRUMP_ON_HIT,
  wildTarget,
  wildTargets,
  WILD_MAX,
  WILD_MIN,
  type TrumpId,
} from '../trump21/rules';

/**
 * Party Trump 21: Trump 21 at a full table. The player and four regulars each play their own hand
 * against one dealer, from one shared shoe of numbered cards, with their own trump cards.
 *
 * TABLE
 * - Shoe: five decks of the eleven cards 1–11 (55 cards), shuffled fresh every round (Trump 21
 *   uses a fresh deck every round too). Each seat gets two cards, the first one private (the
 *   regulars' stay face down; the dealer and the regulars play as if they can't see yours), and
 *   the dealer gets a hole card and an up card.
 * - Turns: the seats play in order, first base (the dealer's left, seat 0) to third base, each one
 *   its whole turn (trumps any time, hit as often as it likes, stand ends the turn), then the
 *   dealer turns its hole card over and plays. When a dealer trump hits a seat's hand (Force
 *   Draw, Burn) that seat answers at once with a short turn of its own (as in Trump 21, where a
 *   card that lands on your hand gives you the move again), then the dealer goes on. When another
 *   seat's card changes the hand of a seat that already finished its turn, that seat answers as
 *   soon as the current turn is over (`reply`, one seat at a time).
 * - Targets: the table target is 21 and only the dealer's target cards move it. A seat that plays
 *   a target card gets a target of its own for the rest of the round, which the dealer's target
 *   cards no longer touch (so Reset 21 "locks" 21).
 * - Winning: every hand is measured against its own target; each seat is compared with the
 *   dealer like blackjack. Closer to your target (without going over) than the dealer is to the
 *   table target wins 1:1; over your target loses to a dealer who isn't over; if both are over,
 *   the smaller overshoot wins. Ties (the same distance) go to the dealer, as at Trump 21. With
 *   one shared target this is exactly Trump 21's rule (`duelOutcome`). Measuring each hand against its own target is what makes a
 *   personal target fair: judged against the seat's target, the dealer's 18–21 would all be busts
 *   for a seat on Line 17, and a seat on Line 27 would beat every standing dealer.
 *
 * TRUMPS AT A FULL TABLE (each seat holds up to five, kept between rounds, dealt with Trump 21's
 * weights (`dealWeight`; this table's own cards at half of it, PX.partyScale): one at every deal,
 * and a seat's hit turns up a bonus trump instead of the card three times in ten (PX.trumpOnHit)
 * while its hand has room: the seat keeps its turn and its next hit is a sure card. The dealer's
 * hits keep a 30% trump along with the card.)
 * - Personal, only the seat that plays them: draw control (Precision, Feather, Call 2–7, Twin
 *   Draw, Redraw, Recall), information (Glimpse is a private peek at the hole card; Foresight
 *   shows the seat the top card of the shoe; Reshuffle shuffles the shoe), the target family
 *   (Line 15…30, Reset 21, Shift Up / Down, Wild Line: the seat's own target; Wild Line draws it
 *   from 16–28) and stakes (Guard, Fortress, Stakes Up, Bounty).
 * - Attacks on the dealer change its hand or trumps for the whole table: Burn (its last card back
 *   to the shoe), Switch (your last card for its last card), Force Draw (it takes the top card
 *   now), Freeze, Shatter, Pickpocket, Blindfold, Heist (its last card to your hand), Gift (your
 *   last card to it) and Rewind (your last card and its last card back to the shoe).
 * - Personal too: Lighten (your highest card back), Barrier (blocks the next trump aimed at the
 *   seat, the dealer's or another seat's: no reply), Tiebreaker (the seat wins its ties), Bullseye
 *   (3:1 right on its target), Reinforce (two new trumps).
 * - This table's own cards (never dealt at Trump 21's single table, never to the dealer): the wild
 *   cards draw a rival at random among the other seats and the dealer (WILD_RIVAL: Wild Switch,
 *   Wild Force, Wild Low / High Swap, Wild Hand Swap, Wild Redeal), and the table cards play on the
 *   full table (TABLE_CARDS: Pass Around, Table Pick, Rampart, Table Crown).
 * - Adapted: Precision and Feather pick from the next three cards of the shoe (with five decks
 *   the whole shoe nearly always holds the perfect card, which would make Precision a sure 21);
 *   Freeze lets the dealer draw at most one card on its turn (it plays last, so "stand on your
 *   next turn" would leave it on two cards and hand the whole table the round).
 * - Dropped: the dealer's Freeze (it plays last; no seat has a turn left to freeze), Heist and
 *   Barrier, so its pool is Trump 21's dealer pool minus those three (it gains Lighten). For the
 *   seats only Overload is left out (PARTY_LEFT_OUT); any new non-target trump Trump 21 adds later
 *   stays out of the pools until this table knows it (Low / High Swap, Hand Swap and Redeal do;
 *   Line 29 came in with the target family).
 * - The dealer is dealt two trumps every round (it faces five hands; a seat gets one) and its
 *   hand holds five, a new one replacing its oldest, so it never clogs (Trump 21 does the same
 *   with seven).
 *
 * DEALER (house rule, documented in px.rules)
 * - Draws while its total is more than 3 under the table target (under 18 at 21) and stands from
 *   there; when frozen it draws one card at most.
 * - At each decision it plays the first trump that fits, in this order: over the target: Recall,
 *   then the tightest target card that covers its total, else Wild Line when it covers it at
 *   least half the time (a table-target change: every seat without its own target is judged
 *   against it too); Shatter on the seat holding the most trumps (3 or more; ties: the bigger
 *   stake); a lower target that its total still fits (within 3), when most of the money on
 *   table-target seats shows more than that; Force Draw on the seat most likely to bust from
 *   one more card (stake × bust odds, at least even odds); Burn on the seat with the biggest
 *   stake whose last card is a 6 or more and whose hand beats the dealer's; Precision, Call 5 /
 *   Call 4 to improve its hand. It reads a seat as its face-up cards plus 6 for the private one.
 *
 * PAYOUTS (total return per stake): win 2× (3× with Bounty; Bullseye right on the target adds 2),
 * loss 0 (½ back with Guard, rounded down; the whole stake with Fortress). Stakes Up adds a second
 * stake equal to the bet.
 *
 * RTP: see PX_RTP below and tests/partytrump.test.ts.
 */

/**
 * A seat's bonus trump chance on a hit: three in ten (it was one in five before this table got its
 * own wild and table cards; see HOUSE BALANCE). Trump 21's single table has its own (BONUS_ON_HIT,
 * one in six, seven trumps a hand).
 */
export const PARTY_BONUS_ON_HIT = 0.3;

export const DEALER = -1;
/** A seat index (0 = first base, play order) or DEALER. */
export type Who = number;

export const PX = {
  seats: 5,
  decks: 5,
  minBet: 5,
  maxBet: 2500,
  /** The regulars bet 10–200 of their own chips. */
  aiMin: 10,
  aiMax: 200,
  /** Trumps a hand holds (Trump 21's single table holds seven; five here, with five seats drawing them). */
  maxTrumps: 5,
  /** Bonus trump chance of a seat's hit (instead of the card) / trump chance with each card the dealer hits. */
  trumpOnHit: PARTY_BONUS_ON_HIT,
  dealerOnHit: TRUMP_ON_HIT,
  /** Trumps the dealer is dealt every round (a seat: one): it faces five hands. */
  dealerDeal: 2,
  /** Who wins a tie (the same distance from the targets): the dealer, the house's edge. */
  tiesToSeat: false,
  /** The dealer draws while under the table target − standGap (stands on 18 at 21). */
  standGap: 3,
  /** Chance that the dealer plays a trump at a decision where one fits (always, at this table). */
  aggression: 1,
  /** Precision and Feather choose from this many cards at the top of the shoe. */
  peek: 3,
  /** This table's own cards (the wild rivals, the table cards) are dealt at this share of their rarity weight. */
  partyScale: 0.5,
};

/**
 * HOUSE BALANCE. Long-run returns (src/games/partytrump/sim.ts, seeded, flat bets, trump hands
 * kept from round to round; Stakes Up raises count as wagered; tests/partytrump.test.ts checks
 * shorter runs):
 * - party: the player's seat with the strongest strategy found (ai.ts `calculated`, which is
 *   also the light bulb), next to four regulars who draw a new mindset every hand: 97.7%
 *   (40,000 / 30,000 rounds: 97.4 / 98.1 / 98.1 / 97.2 / 97.9). Simpler play: hit at even odds
 *   without trumps 50.8%, always hit to 17 52.3%, every trump at once then hit to 17 57.3%.
 * - single: the single Trump 21 table with the same strategy: 98.4% (see trump21/rules.ts).
 * - mindsets: five players with one fixed mindset each at one table (seats rotating, 3 × 20,000
 *   rounds): calculated 97.3%, aggressive 96.3%, hybrid 94.0%, conservative 90.6%, hunch 70.3%.
 *   The regulars as they play (a new mindset every hand) return 93.8%.
 * The wild cards and the table cards turned the other seats into rivals: dealt at full weight with
 * the old one-in-five bonus they cost the strong seat ~6 points (92.0%), mostly through the
 * regulars' cards landing on its hand (93.6% when only the regulars held them) and the slots they
 * take from stronger trumps (95.8% when only the player held them); a bigger hand barely helped
 * (seven trumps: 91.8%). Dealt at half weight (PX.partyScale) with a bonus three hits in ten,
 * the table is back to 97.7% and the regulars to 93.8%.
 * With the bonus trumps and the newer trumps, Overload dealt to the seats pushed the strong seat
 * to ~99.5–100% (five seats throwing two cards at the dealer for everyone); without it, 97.8%.
 * How it got there (it paid 122.4% to the strong strategy, like Trump 21's 124.4%):
 *   - ties go to the dealer (they went to the seat);
 *   - the dealer is dealt two trumps every round instead of one.
 *   It keeps its rule otherwise: stands 3 under the target, always plays a fitting trump. Tried:
 *   more seat trumps (40% a hit) with ties to the dealer gave ~102%; the dealer standing 4 under
 *   ~102%; ties alone ~100%.
 */
export const PX_RTP = {
  single: 0.984,
  party: 0.977,
  mindsets: { calculated: 0.973, aggressive: 0.963, hybrid: 0.94, conservative: 0.906, hunch: 0.703 },
  regulars: 0.938,
};

const CALLS: Partial<Record<TrumpId, number>> = { call1: 1, call2: 2, call3: 3, call4: 4, call5: 5, call6: 6, call7: 7, call8: 8 };
export const callValue = (id: TrumpId): number | undefined => CALLS[id];

/** Wild Line draws a target in this range (never the current one); shifts stay within SHIFT. */
export const WILD = { lo: WILD_MIN, hi: WILD_MAX };
export const SHIFT = { lo: TARGET_MIN, hi: TARGET_MAX };

/**
 * The target family (Trump 21's: Line 15…30, Reset 21, Shift Up / Down, Wild Line): a fixed
 * target, a shift of the current one, or a random draw. Any target trump Trump 21 adds later that
 * is none of these is played as a Wild Line (a target of the seat's own, drawn at random).
 */
export type TargetMove = { kind: 'fixed'; n: number } | { kind: 'wild' } | { kind: 'shift'; d: number };
export function targetMove(id: TrumpId): TargetMove | null {
  if (!isTargetTrump(id)) return null;
  const n = lineValue(id);
  if (n !== undefined) return { kind: 'fixed', n };
  const d = shiftValue(id);
  if (d !== undefined) return { kind: 'shift', d };
  return { kind: 'wild' };
}
export { isTargetTrump, wildTargets };
/** Where a fixed line or a shift takes a target `cur` (Wild Line: null, it is drawn). */
export function movedTarget(m: TargetMove, cur: number): number | null {
  if (m.kind === 'fixed') return m.n;
  if (m.kind === 'shift') return Math.max(TARGET_MIN, Math.min(TARGET_MAX, cur + m.d));
  return null;
}

/** Attack trumps: they act on the dealer's hand or trumps (the whole table feels them). */
export const ATTACKS: TrumpId[] = ['burn', 'switch', 'force', 'freeze', 'shatter', 'pickpocket', 'blindfold', 'heist', 'gift', 'overload', 'rewind'];
export const isAttack = (id: TrumpId) => ATTACKS.includes(id);
/** Stake trumps (only change what the seat's own bet pays). */
export const STAKE_TRUMPS: TrumpId[] = ['guard', 'fortress', 'stakes', 'bounty', 'tiebreak', 'bullseye'];

/**
 * This table's own cards that draw a rival at random: one of the other seats or the dealer (only
 * those the card would do something to). Wild Switch (last card for last card), Wild Force (the
 * rival takes the top card), Wild Low / High Swap (lowest for lowest, highest for highest), Wild
 * Hand Swap (the whole hands) and Wild Redeal (both hands back into the shoe and dealt again, one
 * card each in turn, the player of the card first).
 */
export const WILD_RIVAL: TrumpId[] = ['wildSwitch', 'wildForce', 'wildLow', 'wildHigh', 'wildHands', 'wildRedeal'];
export const isWildRival = (id: TrumpId) => WILD_RIVAL.includes(id);
/**
 * This table's cards for a full table: Pass Around (every seat with two cards or more passes its
 * last card to the next seat, the last one to the first), Table Pick (your last card for the other
 * seat's last card that brings you closest to your target), Rampart (the dealer's next trump aimed
 * at any seat is blocked) and Table Crown (a win with the hand closest to its target at the whole
 * table pays CROWN_EXTRA more).
 */
export const TABLE_CARDS: TrumpId[] = ['passAround', 'tablePick', 'rampart', 'crown'];
/** Table Crown: a win with the closest hand of the table pays this much more (2 to 1). */
export const CROWN_EXTRA = 1;

/** Trumps this table knows how to play (anything Trump 21 adds that isn't a target trump is left out). */
const KNOWN = new Set<string>([
  'precision', 'feather', 'twin', 'redraw', 'recall', 'lighten', 'glimpse', 'foresight', 'reshuffle', 'barrier', 'reinforce',
  ...Object.keys(CALLS), ...ATTACKS, ...STAKE_TRUMPS, ...WILD_RIVAL, ...TABLE_CARDS,
]);
export const knownTrump = (id: TrumpId) => KNOWN.has(id) || isTargetTrump(id);
/**
 * Left out at this table: Overload (the dealer takes two cards). With five seats throwing it at the
 * dealer for everyone's benefit it paid the strongest seat ~99.5–100% (97.9% without it).
 */
export const PARTY_LEFT_OUT = new Set<TrumpId>(['overload']);
export const SEAT_POOL: TrumpId[] = TRUMPS.map((t) => t.id).filter((id) => knownTrump(id) && !PARTY_LEFT_OUT.has(id));
/** The dealer's own trumps at this table (no Freeze, Heist or Barrier: it plays last and faces five hands). */
const NOT_DEALER = new Set<TrumpId>(['freeze', 'heist', 'barrier']);
export const DEALER_POOL: TrumpId[] = TRUMPS.filter((t) => t.dealer && !NOT_DEALER.has(t.id) && knownTrump(t.id)).map((t) => t.id);

/** Dealing weight at this table: Trump 21's, this table's own cards scaled by PX.partyScale. */
export const partyWeight = (id: TrumpId) => (isWildRival(id) || TABLE_CARDS.includes(id) ? Math.max(1, Math.round(dealWeight(id) * PX.partyScale)) : dealWeight(id));

/** One trump drawn from a pool with Trump 21's dealing weights (rarity; the target family scaled down). */
export function pickTrump(pool: TrumpId[], rng: Rng): TrumpId {
  const w = partyWeight;
  const total = pool.reduce((a, id) => a + w(id), 0);
  let r = rng(total);
  for (const id of pool) {
    r -= w(id);
    if (r < 0) return id;
  }
  return pool[0];
}

export type PxEvent =
  /** A card to a hand. `hidden`: a seat's private first card or the dealer's hole card. */
  | { t: 'card'; who: Who; value: number; hidden: boolean }
  /** Card `index` of a hand goes back into the shoe (the shoe is reshuffled). */
  | { t: 'back'; who: Who; index: number; value: number }
  /** A seat's last card `a` and the dealer's last card `b` swap places. */
  | { t: 'switch'; seat: number; a: number; b: number }
  /** A seat's own target, or the table target (who = DEALER); `wild`: drawn by Wild Line. */
  | { t: 'target'; who: Who; n: number; wild?: boolean }
  /** A trump is played; `on` is the seat a dealer trump is aimed at. */
  | { t: 'trump'; who: Who; id: TrumpId; on?: number }
  /** A new trump; `bonus`: it came out of the shoe with a hit (a seat's card is still to come). */
  | { t: 'gain'; who: Who; id: TrumpId; bonus?: boolean }
  /** Heist / Gift: a card goes from one hand to another. */
  | { t: 'move'; from: Who; to: Who; value: number }
  /**
   * A trump aimed at a seat was stopped: by its Barrier (`by`: the seat that played it, none for
   * the dealer) or, for a dealer trump, by the table's Rampart.
   */
  | { t: 'blocked'; seat: number; id: TrumpId; by?: number; rampart?: boolean }
  /** A seat's wild trump drew its rival (`pool`: everyone it could have drawn). */
  | { t: 'rival'; who: number; id: TrumpId; on: Who; pool: Who[] }
  /** Card `ai` of hand `a` and card `bi` of hand `b` change places. */
  | { t: 'swapCards'; a: Who; ai: number; b: Who; bi: number }
  /** Two whole hands change places. */
  | { t: 'swapHands'; a: Who; b: Who }
  /** Every card of hands `a` and `b` goes back into the shoe (the cards that follow deal them again). */
  | { t: 'redeal'; a: Who; b: Who }
  /** Pass Around: each of these seats' last card goes to the next one in the list (the last one's to the first). */
  | { t: 'rotate'; seats: number[] }
  | { t: 'lose'; who: Who; id: TrumpId; by: 'shatter' | 'pickpocket' | 'discard' }
  | { t: 'foresee'; seat: number; value: number }
  | { t: 'glimpse'; seat: number; value: number }
  | { t: 'shuffle' }
  | { t: 'freeze' }
  | { t: 'blind' }
  | { t: 'stand'; who: Who }
  /** The dealer's turn begins: its hole card is turned over. */
  | { t: 'hole'; value: number }
  /** A trump hit this seat's hand after its turn: it answers now (`by`: the seat that played it; none: the dealer). */
  | { t: 'reply'; seat: number; by?: number };

export interface PxSeatIn {
  bet: number;
  /** The seat's trump hand (kept between rounds: this array is used and changed in place). */
  trumps: TrumpId[];
  player?: boolean;
}

export class PxSeat {
  cards: number[] = [];
  /** Own target from a Line card; null: the table's. */
  own: number | null = null;
  guard = false;
  fortress = false;
  stakes: 1 | 2 = 1;
  winMult: 1 | 2 = 1;
  /** Saw the dealer's hole card (Glimpse). */
  sawHole = false;
  /** Knows the top card of the shoe (Foresight). */
  knowsTop = false;
  /** Barrier: the next trump aimed at this seat (the dealer's or another seat's) is blocked. */
  barrier = false;
  /** Table Crown: a win with the closest hand of the table pays CROWN_EXTRA more. */
  crown = false;
  /** Tiebreaker: ties go to this seat. */
  tieWin = false;
  /** Bullseye: a win exactly on the target pays BULLSEYE_EXTRA more. */
  bullseye = false;
  /** A bonus trump came out with the last hit: the next hit is a sure card. */
  sure = false;
  stood = false;
  constructor(
    readonly bet: number,
    readonly trumps: TrumpId[],
    readonly player: boolean,
  ) {}
}

export class PxDealer {
  cards: number[] = [];
  /** Freeze: one card at most on its turn. */
  frozen = false;
  /** Blindfold: no trumps this round. */
  blinded = false;
  /** Cards it drew itself on its turn. */
  drawn = 0;
  stood = false;
  constructor(readonly trumps: TrumpId[]) {}
}

export interface SeatResult {
  seat: number;
  outcome: 1 | -1;
  total: number;
  target: number;
  /** Bet × (2 with Stakes Up). */
  wager: number;
  ret: number;
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

/**
 * 1: the hand measured against `t` beats the dealer's `d` against `dt`; -1: the dealer wins.
 * Closer to the own target wins; over loses to under; both over: the smaller overshoot wins; ties to the seat.
 */
export function compare(p: number, t: number, d: number, dt: number, tiesToSeat = PX.tiesToSeat): 1 | -1 {
  const sg = t - p;
  const dg = dt - d;
  if (sg === dg) return tiesToSeat ? 1 : -1;
  if (sg >= 0) return dg < 0 || sg < dg ? 1 : -1;
  return dg < 0 && -sg < -dg ? 1 : -1;
}

export class PartyDuel {
  shoe: number[] = [];
  readonly seats: PxSeat[];
  readonly dealer: PxDealer;
  tableTarget = 21;
  /** A seat that must answer a dealer trump before the dealer goes on. */
  reply: number | null = null;
  /** The hole card is face up (from the dealer's turn on). */
  holeUp = false;
  phase: 'deal' | 'seats' | 'dealer' | 'done' = 'deal';
  aggression = PX.aggression;
  /** Rampart: the dealer's next trump aimed at a seat is blocked. */
  rampart = false;
  /** Seats whose hand another seat's trump changed after their turn: each answers in turn. */
  private pending: { seat: number; by: number }[] = [];
  private evs: PxEvent[] = [];

  constructor(
    seats: PxSeatIn[],
    dealerTrumps: TrumpId[],
    private rng: Rng = cryptoRng,
  ) {
    this.seats = seats.map((s) => new PxSeat(s.bet, s.trumps, !!s.player));
    this.dealer = new PxDealer(dealerTrumps);
  }

  private emit(e: PxEvent) {
    this.evs.push(e);
  }

  private flush() {
    const out = this.evs;
    this.evs = [];
    return out;
  }

  hand(who: Who): number[] {
    return who === DEALER ? this.dealer.cards : this.seats[who].cards;
  }

  total(who: Who) {
    return sum(this.hand(who));
  }

  /** The seat's target: its own (Line card) or the table's. */
  targetOf(seat: number) {
    return this.seats[seat].own ?? this.tableTarget;
  }

  /** What the dealer and the other seats see of a seat: every card but the private first one. */
  visibleTotal(seat: number) {
    return sum(this.seats[seat].cards.slice(1));
  }

  /** Card values this seat has not seen: the shoe, the other seats' private cards, the hole card. */
  unseenFor(seat: number): number[] {
    const out = [...this.shoe];
    this.seats.forEach((s, i) => {
      if (i !== seat && s.cards.length) out.push(s.cards[0]);
    });
    if (this.dealer.cards.length && !this.seesHole(seat)) out.push(this.dealer.cards[0]);
    return out;
  }

  /** The seat knows the hole card (its Glimpse, or the dealer's turn has begun). */
  seesHole(seat: number) {
    return this.holeUp || this.seats[seat].sawHole;
  }

  /** Top card of the shoe when the seat knows it (Foresight). */
  nextFor(seat: number): number | null {
    return this.seats[seat].knowsTop && this.shoe.length ? this.shoe[0] : null;
  }

  /** How many more cards the dealer may draw on its turn (Freeze: one). */
  get dealerDraws() {
    return this.dealer.frozen ? Math.max(0, 1 - this.dealer.drawn) : Infinity;
  }

  private topChanged() {
    for (const s of this.seats) s.knowsTop = false;
  }

  private give(who: Who, index = 0, hidden = false): number | null {
    if (index >= this.shoe.length) return null;
    const [v] = this.shoe.splice(index, 1);
    if (index === 0) this.topChanged();
    this.hand(who).push(v);
    this.emit({ t: 'card', who, value: v, hidden });
    return v;
  }

  /** Card `index` of a hand back into the shoe, which is reshuffled. */
  private toShoe(who: Who, index: number) {
    const h = this.hand(who);
    const [v] = h.splice(index, 1);
    this.shoe.push(v);
    shuffle(this.shoe, this.rng);
    this.topChanged();
    this.emit({ t: 'back', who, index, value: v });
  }

  /**
   * A trump for a seat (none when its hand is full) or for the dealer: when the dealer's hand is
   * full its oldest trump makes room, so the house never sits on five cards it can't play.
   */
  private grant(who: Who, chance: number, bonus = false): boolean {
    const list = who === DEALER ? this.dealer.trumps : this.seats[who].trumps;
    if (list.length >= PX.maxTrumps && who !== DEALER) return false;
    if (this.rng(1000) >= chance * 1000) return false;
    const id = pickTrump(who === DEALER ? DEALER_POOL : SEAT_POOL, this.rng);
    if (list.length >= PX.maxTrumps) {
      const [old] = list.splice(0, 1);
      this.emit({ t: 'lose', who, id: old, by: 'discard' });
    }
    list.push(id);
    this.emit(bonus ? { t: 'gain', who, id, bonus } : { t: 'gain', who, id });
    return true;
  }

  /**
   * New round: a fresh shoe; one card to each seat from first base (private), the hole card, a
   * second round face up, the dealer's up card; then one trump to each seat and the dealer.
   */
  deal(): PxEvent[] {
    this.shoe = shuffle(
      Array.from({ length: PX.decks * 11 }, (_, i) => (i % 11) + 1),
      this.rng,
    );
    for (let pass = 0; pass < 2; pass++) {
      this.seats.forEach((_, i) => this.give(i, 0, pass === 0));
      this.give(DEALER, 0, pass === 0);
    }
    this.seats.forEach((_, i) => this.grant(i, 1));
    for (let k = 0; k < PX.dealerDeal; k++) this.grant(DEALER, 1);
    this.phase = 'seats';
    return this.flush();
  }

  /** The seat has a decision to make (its turn, or its answer to a dealer trump). */
  live(seat: number) {
    if (this.phase === 'seats') return !this.seats[seat].stood;
    return this.phase === 'dealer' && this.reply === seat;
  }

  /**
   * A hit. It may turn up a bonus trump instead of the card (PX.trumpOnHit, while the seat's trump
   * hand has room): the seat keeps its turn and its next hit is a sure card.
   */
  hit(seat: number): PxEvent[] {
    if (!this.live(seat)) return [];
    const s = this.seats[seat];
    if (this.shoe.length) {
      if (s.sure) s.sure = false;
      else if (this.grant(seat, PX.trumpOnHit, true)) {
        s.sure = true;
        return this.flush();
      }
    }
    if (this.give(seat) === null) return this.stand(seat);
    return this.flush();
  }

  stand(seat: number): PxEvent[] {
    if (!this.live(seat)) return [];
    this.seats[seat].stood = true;
    if (this.reply === seat) this.reply = null;
    this.emit({ t: 'stand', who: seat });
    // a seat whose hand another seat's trump changed after its turn answers now
    if (this.reply === null && this.pending.length) {
      const { seat: next, by } = this.pending.shift()!;
      this.reply = next;
      this.seats[next].stood = false;
      this.emit({ t: 'reply', seat: next, by });
    }
    if (this.phase === 'seats' && this.reply === null && this.seats.every((s) => s.stood)) {
      // the dealer's turn begins: the hole card is turned over for everyone
      this.phase = 'dealer';
      this.holeUp = true;
      this.emit({ t: 'hole', value: this.dealer.cards[0] });
    }
    return this.flush();
  }

  /** Who a seat's wild trump may draw as its rival: the other seats and the dealer it would do something to. */
  rivals(seat: number, id: TrumpId): Who[] {
    const me = this.seats[seat].cards.length;
    const all: Who[] = [...this.seats.map((_, i) => i).filter((i) => i !== seat), DEALER];
    return all.filter((w) => {
      const n = this.hand(w).length;
      if (id === 'wildSwitch') return me >= 2 && n >= 2;
      if (id === 'wildForce') return this.shoe.length > 0;
      if (id === 'wildRedeal') return n > 0;
      return me > 0 && n > 0;
    });
  }

  /** The seats that take part in Pass Around: every one holding two cards or more, in play order. */
  passRing(): number[] {
    return this.seats.map((_, i) => i).filter((i) => this.seats[i].cards.length >= 2);
  }

  /**
   * Table Pick: the other seat whose last card brings `seat` closest to its target (a total under
   * the target before any over it; the first in play order on a tie), or null.
   */
  pickFor(seat: number): number | null {
    const s = this.seats[seat];
    if (s.cards.length < 2) return null;
    const T = this.targetOf(seat);
    const base = this.total(seat) - s.cards[s.cards.length - 1];
    let best = -1;
    let bestScore = Infinity;
    this.seats.forEach((o, i) => {
      if (i === seat || o.cards.length < 2) return;
      const n = base + o.cards[o.cards.length - 1];
      const score = n <= T ? T - n : 100 + n - T;
      if (score < bestScore) {
        best = i;
        bestScore = score;
      }
    });
    return best < 0 ? null : best;
  }

  /** Whether a seat's trump would do anything right now. */
  canUse(seat: number, id: TrumpId): boolean {
    const s = this.seats[seat];
    const me = s.cards;
    const d = this.dealer;
    if (!this.live(seat)) return false;
    if (isWildRival(id)) return this.rivals(seat, id).length > 0;
    switch (id) {
      case 'passAround':
        return me.length >= 2 && this.passRing().length >= 2;
      case 'tablePick':
        return this.pickFor(seat) !== null;
      case 'rampart':
        return !this.rampart;
      case 'crown':
        return !s.crown;
    }
    if (CALLS[id] !== undefined) return this.shoe.includes(CALLS[id]!);
    const tm = targetMove(id);
    if (tm) {
      // Reset 21 locks 21 for the seat; the others must change its target
      if ((id as string) === 'reset21') return s.own !== 21;
      const to = movedTarget(tm, this.targetOf(seat));
      return to === null || to !== this.targetOf(seat);
    }
    switch (id) {
      case 'precision':
      case 'feather':
      case 'force':
        return this.shoe.length > 0;
      case 'lighten':
      case 'gift':
        return me.length >= 2;
      case 'heist':
        return d.cards.length >= 2;
      case 'overload':
        return this.shoe.length >= 2;
      case 'rewind':
        return me.length >= 2 && d.cards.length >= 2;
      case 'barrier':
        return !s.barrier;
      case 'tiebreak':
        return !s.tieWin;
      case 'bullseye':
        return !s.bullseye;
      case 'reinforce':
        return true;
      case 'twin':
        return this.shoe.length >= 2;
      case 'redraw':
        return me.length >= 2 && this.shoe.length > 0;
      case 'recall':
        return me.length >= 2;
      case 'glimpse':
        return !this.seesHole(seat) && d.cards.length > 0;
      case 'foresight':
        return !s.knowsTop && this.shoe.length > 0;
      case 'reshuffle':
        return this.shoe.length > 1;
      case 'burn':
        return d.cards.length >= 2;
      case 'switch':
        return me.length >= 2 && d.cards.length >= 2;
      case 'freeze':
        return !d.frozen;
      case 'shatter':
        return d.trumps.length > 0;
      case 'pickpocket':
        // the Pickpocket card itself leaves the hand, so the stolen one always has room
        return d.trumps.length > 0;
      case 'blindfold':
        return !d.blinded;
      case 'guard':
        return !s.guard && !s.fortress;
      case 'fortress':
        return !s.fortress;
      case 'stakes':
        return s.stakes === 1;
      case 'bounty':
        return s.winMult === 1;
      default:
        return false;
    }
  }

  /** The target a target trump sets from `cur` (Wild Line draws one that isn't `cur`). */
  private resolveTarget(tm: TargetMove, cur: number): number {
    return movedTarget(tm, cur) ?? wildTarget(cur, this.rng);
  }

  /** Index of the card Precision (best fit) or Feather (lowest) takes from the top of the shoe. */
  private pickNear(room: number, best: boolean): number {
    const top = this.shoe.slice(0, PX.peek);
    let k = 0;
    if (best) {
      let fit = -1;
      top.forEach((v, i) => {
        if (v <= room && (fit < 0 || v > top[fit])) fit = i;
      });
      if (fit >= 0) k = fit;
      else top.forEach((v, i) => v < top[k] && (k = i));
    } else top.forEach((v, i) => v < top[k] && (k = i));
    return k;
  }

  /** Another seat's trump changed `w`'s hand: a seat that already finished answers once the current turn is over. */
  private touched(w: Who, by: number) {
    if (w === DEALER || w === by || !this.seats[w].stood || this.pending.some((p) => p.seat === w)) return;
    this.pending.push({ seat: w, by });
  }

  /** The hole card changed before the dealer's turn: only `seat`, which put it there, knows the new one. */
  private newHole(seat: number | null) {
    if (this.holeUp) return;
    for (const s of this.seats) s.sawHole = false;
    if (seat !== null) this.seats[seat].sawHole = true;
  }

  /** Card `ai` of hand `a` and card `bi` of hand `b` change places. */
  private swapAt(a: number, ai: number, b: Who, bi: number) {
    const ha = this.hand(a);
    const hb = this.hand(b);
    [ha[ai], hb[bi]] = [hb[bi], ha[ai]];
    this.emit({ t: 'swapCards', a, ai, b, bi });
    if (b === DEALER && bi === 0) this.newHole(a);
  }

  /** Two whole hands change places. */
  private swapHands(a: number, b: Who) {
    const ha = this.hand(a);
    const hb = this.hand(b);
    const mine = ha.slice();
    ha.splice(0, ha.length, ...hb);
    hb.splice(0, hb.length, ...mine);
    this.emit({ t: 'swapHands', a, b });
    if (b === DEALER) this.newHole(a);
  }

  /** Both hands back into the shoe, then as many cards each again, one at a time, `a` first. */
  private redeal(a: number, b: Who) {
    const ha = this.hand(a);
    const hb = this.hand(b);
    const left = new Map<Who, number>([
      [a, ha.length],
      [b, hb.length],
    ]);
    this.shoe.push(...ha, ...hb);
    ha.length = 0;
    hb.length = 0;
    shuffle(this.shoe, this.rng);
    this.topChanged();
    this.emit({ t: 'redeal', a, b });
    if (b === DEALER) this.newHole(null);
    let turn: Who = a;
    while (left.get(a)! + left.get(b)! > 0) {
      if (left.get(turn)! > 0) {
        // the first card is a seat's private card again, or the dealer's hole card
        const first = this.hand(turn).length === 0 && (turn !== DEALER || !this.holeUp);
        this.give(turn, 0, first);
        left.set(turn, left.get(turn)! - 1);
      }
      turn = turn === a ? b : a;
    }
  }

  /** A seat's Barrier stops another seat's trump aimed at it. */
  private barred(seat: number, on: Who, id: TrumpId): boolean {
    if (on === DEALER || !this.seats[on].barrier) return false;
    this.seats[on].barrier = false;
    this.emit({ t: 'blocked', seat: on, id, by: seat });
    return true;
  }

  /** A wild trump: its rival is drawn at random, then it acts on that hand. */
  private playWild(seat: number, id: TrumpId) {
    const pool = this.rivals(seat, id);
    const on = pool[this.rng(pool.length)];
    this.emit({ t: 'rival', who: seat, id, on, pool });
    if (this.barred(seat, on, id)) return;
    const mine = this.seats[seat].cards;
    const theirs = this.hand(on);
    const pick = (h: number[], high: boolean) => h.indexOf(high ? Math.max(...h) : Math.min(...h));
    switch (id) {
      case 'wildSwitch':
        this.swapAt(seat, mine.length - 1, on, theirs.length - 1);
        break;
      case 'wildLow':
      case 'wildHigh':
        this.swapAt(seat, pick(mine, id === 'wildHigh'), on, pick(theirs, id === 'wildHigh'));
        break;
      case 'wildHands':
        this.swapHands(seat, on);
        break;
      case 'wildForce':
        this.give(on);
        break;
      case 'wildRedeal':
        this.redeal(seat, on);
        break;
    }
    this.touched(on, seat);
  }

  useTrump(seat: number, id: TrumpId): PxEvent[] {
    const s = this.seats[seat];
    const i = s.trumps.indexOf(id);
    if (i < 0 || !this.canUse(seat, id)) return [];
    s.trumps.splice(i, 1);
    this.emit({ t: 'trump', who: seat, id });
    const D = this.dealer;
    if (isWildRival(id)) {
      this.playWild(seat, id);
      return this.flush();
    }
    if (CALLS[id] !== undefined) {
      this.give(seat, this.shoe.indexOf(CALLS[id]!));
      return this.flush();
    }
    const tm = targetMove(id);
    if (tm) {
      s.own = this.resolveTarget(tm, this.targetOf(seat));
      this.emit({ t: 'target', who: seat, n: s.own, wild: tm.kind === 'wild' || undefined });
      return this.flush();
    }
    switch (id) {
      case 'precision':
        this.give(seat, this.pickNear(this.targetOf(seat) - this.total(seat), true));
        break;
      case 'feather':
        this.give(seat, this.pickNear(0, false));
        break;
      case 'twin':
        this.give(seat);
        this.give(seat);
        break;
      case 'redraw': {
        const old = s.cards.length - 1;
        this.give(seat);
        this.toShoe(seat, old);
        break;
      }
      case 'recall':
        this.toShoe(seat, s.cards.length - 1);
        break;
      case 'glimpse':
        s.sawHole = true;
        this.emit({ t: 'glimpse', seat, value: D.cards[0] });
        break;
      case 'foresight':
        s.knowsTop = true;
        this.emit({ t: 'foresee', seat, value: this.shoe[0] });
        break;
      case 'reshuffle':
        shuffle(this.shoe, this.rng);
        this.topChanged();
        this.emit({ t: 'shuffle' });
        break;
      case 'burn':
        this.toShoe(DEALER, D.cards.length - 1);
        break;
      case 'switch': {
        const a = s.cards.pop()!;
        const b = D.cards.pop()!;
        s.cards.push(b);
        D.cards.push(a);
        this.emit({ t: 'switch', seat, a, b });
        break;
      }
      case 'force':
        this.give(DEALER);
        break;
      case 'freeze':
        D.frozen = true;
        this.emit({ t: 'freeze' });
        break;
      case 'shatter': {
        const [lost] = D.trumps.splice(this.rng(D.trumps.length), 1);
        this.emit({ t: 'lose', who: DEALER, id: lost, by: 'shatter' });
        break;
      }
      case 'pickpocket': {
        const [got] = D.trumps.splice(this.rng(D.trumps.length), 1);
        this.emit({ t: 'lose', who: DEALER, id: got, by: 'pickpocket' });
        s.trumps.push(got);
        this.emit({ t: 'gain', who: seat, id: got });
        break;
      }
      case 'blindfold':
        D.blinded = true;
        this.emit({ t: 'blind' });
        break;
      case 'guard':
        s.guard = true;
        break;
      case 'fortress':
        s.fortress = true;
        break;
      case 'stakes':
        s.stakes = 2;
        break;
      case 'bounty':
        s.winMult = 2;
        break;
      case 'lighten':
        this.toShoe(seat, s.cards.indexOf(Math.max(...s.cards)));
        break;
      case 'heist': {
        const v = D.cards.pop()!;
        s.cards.push(v);
        this.emit({ t: 'move', from: DEALER, to: seat, value: v });
        break;
      }
      case 'gift': {
        const v = s.cards.pop()!;
        D.cards.push(v);
        this.emit({ t: 'move', from: seat, to: DEALER, value: v });
        break;
      }
      case 'overload':
        this.give(DEALER);
        this.give(DEALER);
        break;
      case 'rewind':
        this.toShoe(seat, s.cards.length - 1);
        this.toShoe(DEALER, D.cards.length - 1);
        break;
      case 'barrier':
        s.barrier = true;
        break;
      case 'tiebreak':
        s.tieWin = true;
        break;
      case 'bullseye':
        s.bullseye = true;
        break;
      case 'reinforce':
        this.grant(seat, 1);
        this.grant(seat, 1);
        break;
      case 'passAround': {
        const ring = this.passRing();
        const lasts = ring.map((k) => this.seats[k].cards.pop()!);
        ring.forEach((_, k) => this.seats[ring[(k + 1) % ring.length]].cards.push(lasts[k]));
        this.emit({ t: 'rotate', seats: ring });
        for (const k of ring) this.touched(k, seat);
        break;
      }
      case 'tablePick': {
        const o = this.pickFor(seat)!;
        if (this.barred(seat, o, id)) break;
        this.swapAt(seat, s.cards.length - 1, o, this.seats[o].cards.length - 1);
        this.touched(o, seat);
        break;
      }
      case 'rampart':
        this.rampart = true;
        break;
      case 'crown':
        s.crown = true;
        break;
    }
    return this.flush();
  }

  // ---------------------------------------------------------------- the dealer

  /** Fraction of the cards unknown to the dealer that would bust a total `est` against `t`. */
  private bustOdds(est: number, t: number): number {
    const pool = [...this.shoe, ...this.seats.map((s) => s.cards[0]).filter((v) => v !== undefined)];
    if (!pool.length) return 0;
    return pool.filter((v) => est + v > t).length / pool.length;
  }

  private dealerCanUse(id: TrumpId): boolean {
    const D = this.dealer;
    if (!D.trumps.includes(id)) return false;
    const draw = this.shoe.length > 0 && this.dealerDraws > 0;
    if (CALLS[id] !== undefined) return draw && this.shoe.includes(CALLS[id]!);
    const tm = targetMove(id);
    if (tm) {
      const to = movedTarget(tm, this.tableTarget);
      return to === null || to !== this.tableTarget;
    }
    switch (id) {
      case 'precision':
        return draw;
      case 'recall':
      case 'lighten':
        return D.cards.length >= 2;
      default:
        return true; // aimed trumps check their seat in dealerTrump()
    }
  }

  /** The house rule: the trump the dealer would play at this decision, and the seat it aims at. */
  dealerTrump(): { id: TrumpId; on?: number } | null {
    const D = this.dealer;
    if (D.blinded || !D.trumps.length) return null;
    const has = (id: TrumpId) => this.dealerCanUse(id);
    const d = this.total(DEALER);
    const T = this.tableTarget;
    // a seat as the dealer reads it: face-up cards + 6 for the private one
    const est = (i: number) => this.visibleTotal(i) + 6;
    const seats = this.seats.map((s, i) => ({ s, i }));
    if (d > T) {
      // Recall (the last card) or Lighten (the highest), the one that brings it back under
      const last = D.cards[D.cards.length - 1];
      if (has('recall') && d - last <= T) return { id: 'recall' };
      if (has('lighten') && d - Math.max(...D.cards) <= T) return { id: 'lighten' };
      if (has('recall')) return { id: 'recall' };
    }
    // its target trumps, with where each would put the table target (null: Wild Line)
    const lines = [...new Set(D.trumps)].filter((id) => isTargetTrump(id) && has(id)).map((id) => ({ id, to: movedTarget(targetMove(id)!, T) }));
    if (d > T) {
      // rescue: the tightest target that covers its total; Wild Line when it covers it at least half the time
      const fit = lines.filter((l) => l.to !== null && l.to >= d).sort((a, b) => a.to! - b.to!)[0];
      if (fit) return { id: fit.id };
      const wild = lines.find((l) => l.to === null);
      const draws = wildTargets(T);
      if (wild && draws.filter((n) => n >= d).length * 2 >= draws.length) return { id: wild.id };
    }
    if (has('shatter')) {
      const rich = seats.filter(({ s }) => s.trumps.length >= 3).sort((a, b) => b.s.trumps.length - a.s.trumps.length || b.s.bet - a.s.bet)[0];
      if (rich) return { id: 'shatter', on: rich.i };
    }
    if (d <= T) {
      // squeeze: a lower target its own total still fits (within 3), when most of the money on the
      // table-target seats shows more than that
      let best: { id: TrumpId; high: number; to: number } | null = null;
      for (const l of lines) {
        if (l.to === null || l.to >= T || d > l.to || d < l.to - 3) continue;
        let high = 0;
        let all = 0;
        for (const { s, i } of seats) {
          if (s.own !== null) continue;
          all += s.bet * s.stakes;
          if (est(i) > l.to && est(i) <= T) high += s.bet * s.stakes;
        }
        if (all > 0 && high * 2 > all && (!best || high > best.high || (high === best.high && l.to > best.to))) best = { id: l.id, high, to: l.to };
      }
      if (best) return { id: best.id };
    }
    if (has('force') && this.shoe.length) {
      let best: { i: number; v: number } | null = null;
      for (const { s, i } of seats) {
        const t = this.targetOf(i);
        if (est(i) > t || s.cards.length < 1) continue;
        const odds = this.bustOdds(est(i), t);
        const v = s.bet * s.stakes * odds;
        if (odds >= 0.5 && (!best || v > best.v)) best = { i, v };
      }
      if (best) return { id: 'force', on: best.i };
    }
    if (has('burn')) {
      const dg = T - d;
      const hit = seats
        .filter(({ s, i }) => {
          const t = this.targetOf(i);
          const g = t - est(i);
          return s.cards.length >= 2 && s.cards[s.cards.length - 1] >= 6 && g >= 0 && (dg < 0 || g < dg);
        })
        .sort((a, b) => b.s.bet * b.s.stakes - a.s.bet * a.s.stakes)[0];
      if (hit) return { id: 'burn', on: hit.i };
    }
    if (d <= T - 5 && has('precision')) return { id: 'precision' };
    for (const c of ['call5', 'call4'] as const) {
      const n = CALLS[c]!;
      if (d + n <= T && d + n >= T - PX.standGap && has(c)) return { id: c };
    }
    return null;
  }

  /** Plays a dealer trump; false when a seat's Barrier stopped it. */
  private dealerUse(id: TrumpId, on?: number): boolean {
    const D = this.dealer;
    D.trumps.splice(D.trumps.indexOf(id), 1);
    this.emit({ t: 'trump', who: DEALER, id, on });
    if (on !== undefined && this.seats[on].barrier) {
      this.seats[on].barrier = false;
      this.emit({ t: 'blocked', seat: on, id });
      return false;
    }
    if (on !== undefined && this.rampart) {
      this.rampart = false;
      this.emit({ t: 'blocked', seat: on, id, rampart: true });
      return false;
    }
    if (CALLS[id] !== undefined) {
      this.give(DEALER, this.shoe.indexOf(CALLS[id]!));
      D.drawn++;
      return true;
    }
    const tm = targetMove(id);
    if (tm) {
      this.tableTarget = this.resolveTarget(tm, this.tableTarget);
      this.emit({ t: 'target', who: DEALER, n: this.tableTarget, wild: tm.kind === 'wild' || undefined });
      return true;
    }
    switch (id) {
      case 'precision':
        this.give(DEALER, this.pickNear(this.tableTarget - this.total(DEALER), true));
        D.drawn++;
        break;
      case 'recall':
        this.toShoe(DEALER, D.cards.length - 1);
        break;
      case 'lighten':
        this.toShoe(DEALER, D.cards.indexOf(Math.max(...D.cards)));
        break;
      case 'shatter': {
        const list = this.seats[on!].trumps;
        const [lost] = list.splice(this.rng(list.length), 1);
        this.emit({ t: 'lose', who: on!, id: lost, by: 'shatter' });
        break;
      }
      case 'force':
        this.give(on!);
        break;
      case 'burn':
        this.toShoe(on!, this.seats[on!].cards.length - 1);
        break;
    }
    return true;
  }

  /**
   * One decision of the dealer: maybe one trump, then hit or stand. A trump that hits a seat's
   * hand (Force Draw, Burn) hands that seat a reply turn first (`reply`); call again after it.
   */
  dealerStep(): PxEvent[] {
    const D = this.dealer;
    if (this.phase !== 'dealer' || D.stood || this.reply !== null) return [];
    const pick = this.dealerTrump();
    if (pick && this.rng(1000) < this.aggression * 1000) {
      const hit = this.dealerUse(pick.id, pick.on);
      if (hit && pick.on !== undefined && (pick.id === 'force' || pick.id === 'burn')) {
        this.reply = pick.on;
        this.seats[pick.on].stood = false;
        this.emit({ t: 'reply', seat: pick.on });
        return this.flush();
      }
    }
    const d = this.total(DEALER);
    if (d < this.tableTarget - PX.standGap && this.shoe.length && this.dealerDraws > 0) {
      this.give(DEALER);
      D.drawn++;
      this.grant(DEALER, PX.dealerOnHit, true);
    } else {
      D.stood = true;
      this.phase = 'done';
      this.emit({ t: 'stand', who: DEALER });
    }
    return this.flush();
  }

  get done() {
    return this.phase === 'done';
  }

  outcome(seat: number): 1 | -1 {
    return compare(this.total(seat), this.targetOf(seat), this.total(DEALER), this.tableTarget, PX.tiesToSeat || this.seats[seat].tieWin);
  }

  /**
   * What a seat's win pays (to 1): 1, 2 with Bounty, plus BULLSEYE_EXTRA when Bullseye lands
   * exactly on its target and CROWN_EXTRA when Table Crown has the closest hand of the table.
   */
  winPays(seat: number) {
    const s = this.seats[seat];
    return s.winMult + (s.bullseye && this.total(seat) === this.targetOf(seat) ? BULLSEYE_EXTRA : 0) + (s.crown && this.closest(seat) ? CROWN_EXTRA : 0);
  }

  /** No other seat's hand is closer to its own target (a hand over its target is never the closest; ties share it). */
  closest(seat: number) {
    const gap = (i: number) => this.targetOf(i) - this.total(i);
    const g = gap(seat);
    if (g < 0) return false;
    return this.seats.every((_, i) => i === seat || gap(i) < 0 || gap(i) >= g);
  }

  /** Amount returned on one stake of a seat (its bet, or the Stakes Up raise). */
  payout(seat: number, stake: number): number {
    const s = this.seats[seat];
    if (this.outcome(seat) > 0) return stake * (1 + this.winPays(seat));
    if (s.fortress) return stake;
    return s.guard ? Math.floor(stake / 2) : 0;
  }

  settle(): SeatResult[] {
    return this.seats.map((s, seat) => {
      const per = this.payout(seat, s.bet);
      return {
        seat,
        outcome: this.outcome(seat),
        total: this.total(seat),
        target: this.targetOf(seat),
        wager: s.bet * s.stakes,
        ret: per * s.stakes,
      };
    });
  }
}
