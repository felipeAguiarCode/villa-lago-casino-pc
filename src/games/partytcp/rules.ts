import { rankOf, type Card, type Shoe } from '../../core/cards';
import { Cat3, eval3, type Hand3 } from '../../core/eval3';
import type { Rng } from '../../core/rng';
import { mindsetSideBet, mindsetStake, type AiMemory, type Mindset } from '../partybj/mindset';
import { ANTE_BONUS, dealerQualifies, settleTcp, shouldPlay, TCP, type TcpResult } from '../threecard/rules';

/**
 * Party Three Card Poker: five seats against one dealer (four of them AI regulars with fictional
 * chips), Classic rules only.
 *
 * Every seat posts an Ante and may add Pair Plus. Each seat and the dealer get three cards from one
 * freshly shuffled deck. In play order (first base, the dealer's left, first) each seat either
 * plays, putting a Play bet equal to the Ante, or folds and gives up the Ante. The dealer then
 * shows down and needs Queen high to qualify. Every seat is settled by the Three Card table's own
 * `settleTcp` (no Lucky 6 here), so the payouts are the same:
 * - dealer does not qualify: Ante pays 1:1, Play pushes;
 * - dealer qualifies: the better hand wins Ante and Play 1:1, a tie pushes both;
 * - Ante bonus whenever the seat plays, win or lose: straight flush 5:1, trips 4:1, straight 1:1;
 * - Pair Plus on the seat's own hand, played or folded: straight flush 40:1, trips 30:1,
 *   straight 6:1, flush 3:1, pair 1:1.
 * Returns are totals (stake + winnings, 0 for a loss).
 *
 * RTP. The cards are exchangeable and the regulars' cards stay face down until the showdown, so the
 * player's seat returns exactly what single Three Card Poker does. Exact enumeration of all
 * 22,100 × 18,424 player/dealer hands (tests/partytcp.test.ts):
 * - Ante/Play with the optimal Q-6-4 strategy: 96.63% of the Ante (house edge 3.37% per Ante;
 *   97.99% of the total wagered, playing 67.4% of the hands);
 * - Pair Plus with the Three Card table (flush 3:1): 92.72%. The common 40-30-6-4-1 table (flush
 *   4:1) would return 97.68%.
 *
 * The regulars play each hand in a hidden mindset (mindset.ts) drawn when the hand starts; see
 * aiPlays and aiBets. The player turns their cards face up before anyone decides, so a calculated
 * regular counts them as dead cards (countedPlay). Ante/Play per Ante, exact with no card showing:
 * calculated (Q-6-4) 96.63%, aggressive 96.28%, conservative 95.01%, hybrid 96.63% at an even
 * streak (96.55% when hot, 96.57% when cold), hunch 86.69%; the player's face-up cards add about
 * 0.06% of the Ante for the calculated regular. Everything wagered, Pair Plus and the mindsets'
 * stakes included (seeded, 1,800,000 seat-hands, every mindset on the same hands): calculated
 * 97.9%, hybrid 97.5%, aggressive 96.7%, conservative 96.6%, hunch 91.9%.
 */
export const PT = {
  decks: 1,
  minBet: TCP.minBet,
  maxBet: TCP.maxBet,
  /** AI players ante 10–100 per hand. */
  aiMin: 10,
  aiMax: 100,
};

// --------------------------------------------------------------------------- AI players

/** K high or better (the conservative mindset's threshold). */
export const kingHighOrBetter = (h: Hand3) => h.cat > Cat3.High || h.ranks[0] >= 13;

/** A borderline hand: Queen high with a second card of 7 or less (Q-6-4 sits in the middle). */
export const borderline = (h: Hand3) => h.cat === Cat3.High && h.ranks[0] === 12 && h.ranks[1] <= 7;

/** Every three-card hand of one deck: its score, whether it qualifies, and its card mask. */
interface HandTable {
  n: number;
  score: Int32Array;
  qual: Uint8Array;
  lo: Int32Array;
  hi: Int32Array;
}
let TABLE: HandTable | null = null;

function handTable(): HandTable {
  if (TABLE) return TABLE;
  const n = 22100;
  const t: HandTable = { n, score: new Int32Array(n), qual: new Uint8Array(n), lo: new Int32Array(n), hi: new Int32Array(n) };
  let i = 0;
  for (let a = 0; a < 52; a++)
    for (let b = a + 1; b < 52; b++)
      for (let c = b + 1; c < 52; c++) {
        const e = eval3([a, b, c]);
        t.score[i] = e.score;
        t.qual[i] = dealerQualifies(e) ? 1 : 0;
        for (const x of [a, b, c]) {
          if (x < 26) t.lo[i] |= 1 << x;
          else t.hi[i] |= 1 << (x - 26);
        }
        i++;
      }
  return (TABLE = t);
}

/**
 * The exact expected result of playing, in Antes (Ante bonus included), against every dealer hand
 * the unseen cards can make: the seat's own cards and the `dead` ones (seen face up) are out of the
 * dealer's reach. Folding is −1, so playing pays when this is more than −1.
 */
export function playEv(cards: readonly Card[], dead: readonly Card[]): number {
  const t = handTable();
  let ml = 0;
  let mh = 0;
  for (const x of [...cards, ...dead]) {
    if (x < 26) ml |= 1 << x;
    else mh |= 1 << (x - 26);
  }
  const h = eval3([...cards]);
  const sp = h.score;
  let n = 0;
  let s = 0;
  for (let d = 0; d < t.n; d++) {
    if ((t.lo[d] & ml) | (t.hi[d] & mh)) continue;
    n++;
    if (!t.qual[d]) s += 1;
    else if (sp > t.score[d]) s += 2;
    else if (sp < t.score[d]) s -= 2;
  }
  return s / n + (ANTE_BONUS[h.cat] ?? 0);
}

/**
 * The card counter's decision: Q-6-4 adjusted for the dead cards it has seen (the player's face-up
 * hand), by the exact sum of playEv where it can matter. With three dead cards (the game's case):
 * - King high or better, and Q-9 or better, always play (no three dead cards bring them to −1);
 * - Q-8 and lower play when the exact sum says playing pays;
 * - a hand under Queen high plays only when all three dead cards are Queens or better, which
 *   leaves the dealer short of qualifying hands (otherwise playing never pays).
 * The tests check these shortcuts against the exact sum. No dead cards: exactly Q-6-4.
 */
export function countedPlay(cards: Card[], dead: readonly Card[]): boolean {
  const h = eval3(cards);
  if (kingHighOrBetter(h)) return true;
  if (!dead.length) return shouldPlay(h);
  if (h.ranks[0] === 12 && h.ranks[1] >= 9) return true;
  if (h.ranks[0] < 12 && dead.filter((c) => rankOf(c) >= 12).length < 3) return false;
  return playEv(cards, dead) > -1;
}

/** What a regular knows when deciding: the cards seen face up, and their own streak. */
export interface TcpRead {
  dead: readonly Card[];
  /** +n after n wins in a row, −n after n losses (AiMemory.streak). */
  streak: number;
}

/**
 * One decision of a regular in this hand's mindset: true plays (a Play bet equal to the Ante),
 * false folds.
 * - calculated: Q-6-4 adjusted for the dead cards (countedPlay);
 * - aggressive: Queen high or better, and any Jack high with a 10;
 * - conservative: King high or better;
 * - hybrid: Q-6-4, except on borderline Queen-high hands (Q-7 and lower), which it plays after two
 *   wins or more in a row and folds after two losses or more;
 * - hunch: Q-6-4, but with no pair one decision in four is flipped (it never folds a pair or better).
 */
export function aiPlays(m: Mindset, cards: Card[], read: TcpRead, rng: Rng): boolean {
  const h = eval3(cards);
  switch (m) {
    case 'calculated':
      return countedPlay(cards, read.dead);
    case 'aggressive':
      return h.cat > Cat3.High || h.ranks[0] >= 12 || (h.ranks[0] === 11 && h.ranks[1] === 10);
    case 'conservative':
      return kingHighOrBetter(h);
    case 'hybrid':
      if (borderline(h) && Math.abs(read.streak) >= 2) return read.streak > 0;
      return shouldPlay(h);
    case 'hunch': {
      if (h.cat > Cat3.High) return true;
      const book = shouldPlay(h);
      return rng(4) === 0 ? !book : book;
    }
  }
}

/** A regular needs chips for an Ante and the Play bet of the same size; below that they leave. */
export const isBroke = (chips: number) => chips < 2 * PT.aiMin;

/**
 * A regular's bets for the hand in its mindset: an Ante of 10–100 in steps of 5 (mindsetStake,
 * leaving room for the Play bet) and, when the mindset takes the side bet (mindsetSideBet), a Pair
 * Plus of half the Ante out of what is left. The calculated mindset never bets Pair Plus.
 */
export function aiBets(m: Mindset, chips: number, mem: AiMemory, rng: Rng): { ante: number; pairPlus: number } {
  const ante = mindsetStake(m, { chips, min: PT.aiMin, max: PT.aiMax, step: 5, cover: 2, mem }, rng);
  if (ante < PT.aiMin) return { ante: 0, pairPlus: 0 };
  let pairPlus = mindsetSideBet(m, rng) ? Math.max(PT.minBet, Math.floor(ante / 10) * 5) : 0;
  pairPlus = Math.min(pairPlus, Math.floor((chips - 2 * ante) / 5) * 5);
  return { ante, pairPlus: pairPlus >= PT.minBet ? pairPlus : 0 };
}

// --------------------------------------------------------------------------- the round

export interface SeatIn {
  ante: number;
  pairPlus: number;
  /** The regular's mindset this hand; null: the player's own seat (played face up). */
  mind: Mindset | null;
  /** The regular's streak going into the hand (the hybrid mindset leans on it). */
  streak?: number;
}

export interface SeatState extends SeatIn {
  cards: Card[];
  /** null until the seat has decided. */
  played: boolean | null;
}

/** The deal, card by card, for the view to animate. */
export type TEvent = { t: 'card'; seat: number; card: Card } | { t: 'dealer'; card: Card };

export interface Bets {
  ante: number;
  play: number;
  pairPlus: number;
}

export interface SeatResult {
  seat: number;
  played: boolean;
  /** settleTcp's verdict (hands, qualifying, comparison, bonuses). */
  tcp: TcpResult;
  bets: Bets;
  /** Total return of each betting place (stake + winnings, 0 for a loss). */
  ret: Bets;
  wager: number;
  total: number;
}

export class PartyTcpRound {
  /** The seats in play order (seat 0 = first base, the dealer's left). */
  readonly seats: SeatState[];
  dealer: Card[] = [];

  constructor(
    private shoe: Shoe,
    seats: SeatIn[],
  ) {
    this.seats = seats.map((s) => ({ ...s, cards: [], played: null }));
  }

  /** Three rounds of one card to each seat from first base, then one to the dealer. */
  deal(): TEvent[] {
    const out: TEvent[] = [];
    for (let pass = 0; pass < 3; pass++) {
      this.seats.forEach((s, seat) => {
        const card = this.shoe.draw();
        s.cards.push(card);
        out.push({ t: 'card', seat, card });
      });
      const card = this.shoe.draw();
      this.dealer.push(card);
      out.push({ t: 'dealer', card });
    }
    return out;
  }

  /** The cards everyone can see before deciding: the player's seat plays face up. */
  get faceUp(): Card[] {
    return this.seats.filter((s) => s.mind === null).flatMap((s) => s.cards);
  }

  /** The next seat to decide, in play order, or -1 when everyone has. */
  get next(): number {
    return this.seats.findIndex((s) => s.played === null);
  }

  /** A seat plays (a Play bet equal to its Ante) or folds. Seats decide in turn. */
  decide(seat: number, play: boolean) {
    if (seat !== this.next) throw new Error(`seat ${seat} is not to act`);
    this.seats[seat].played = play;
  }

  /** Every seat against the dealer's hand. */
  settle(): SeatResult[] {
    return this.seats.map((s, seat) => {
      const played = !!s.played;
      const tcp = settleTcp(s.cards, this.dealer, { ante: s.ante, pairPlus: s.pairPlus, lucky6: 0 }, played);
      const bets = { ante: s.ante, play: played ? s.ante : 0, pairPlus: s.pairPlus };
      const ret = { ante: tcp.ret.ante, play: tcp.ret.play, pairPlus: tcp.ret.pairPlus };
      return { seat, played, tcp, bets, ret, wager: bets.ante + bets.play + bets.pairPlus, total: ret.ante + ret.play + ret.pairPlus };
    });
  }
}

/**
 * Plays a whole round without a view (tests and simulations): the regulars by their mindset, seeing
 * the player's face-up cards, the player's seat (mind null) by Q-6-4.
 */
export function playOut(r: PartyTcpRound, rng: Rng): SeatResult[] {
  r.deal();
  const dead = r.faceUp;
  r.seats.forEach((s, seat) => r.decide(seat, s.mind ? aiPlays(s.mind, s.cards, { dead, streak: s.streak ?? 0 }, rng) : shouldPlay(eval3(s.cards))));
  return r.settle();
}
