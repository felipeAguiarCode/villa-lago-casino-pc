import { cryptoRng, shuffle, type Rng } from '../../core/rng';

/**
 * Suit Poker ("Pôquer de Naipes"): a quick symbol-matching draw poker against the dealer.
 *
 * Deck: 48 picture cards with no ranks, 8 of each of six symbols, shuffled fresh every round.
 * Symbols from the highest: Red Joker ★, Black Joker ☆, ♠, ♥, ♦, ♣ (index 0..5: a lower index is a
 * higher symbol).
 *
 * Round: ANTE (5..200) → five cards each (the player's face up, the dealer's face down) → the
 * player may RAISE 1× ante per press, up to 4 times (5× in total), and holds cards → one draw →
 * the dealer draws by the house way → showdown.
 *
 * Hands, high to low: five of a kind, four of a kind, full house, three of a kind, two pair, one
 * pair, nothing. Equal categories compare the groups' symbols, the bigger group first, then the
 * higher symbol (★★♠♠ beats ♠♠♥♥; a full house compares its three first). Unmatched single cards
 * never count; the same category with the same group symbols is a push, and so is nothing against
 * nothing.
 *
 * House way (the dealer, fixed): keep every symbol that appears twice or more and replace the
 * singles; with no pair at all keep the single highest symbol and replace the other four. This is
 * also the player's best hold (see analysis.ts), so the hint uses the same rule.
 *
 * ---------------------------------------------------------------- payout and RTP
 * A win returns the stake × a total-return multiplier set by the player's winning hand (PAYS10, in
 * tenths so every return is whole chips: stakes are made of 5-chips, and every multiplier is a
 * multiple of 0.2). A loss returns 0, a push returns the stake.
 *
 * Push rule — THE DEALER CALLS RAISES WITH THREE OF A KIND: when the dealer's final hand is below
 * three of a kind, the raise chips are returned and only the ante plays.
 *
 * Why (worked out exactly in analysis.ts): the game is symmetric — both sides hold five cards and
 * draw once, so the player wins about as often as the dealer (49.2% / 49.2% / 1.6% push) and the
 * wins have to average about even money. And the raise comes after the player has seen five cards
 * that predict the result very well: a dealt three of a kind wins 75% of the time, a full house
 * 85%, four of a kind 96%. With the starting table 16/8/6/4/3/2 the best play returns 233%; even
 * with every win paying even money, raising 4× on the strong hands returns 120%. Without a push
 * rule the only tables that land at 95–97% pay ×1–×1.5 on almost everything and leave a player who
 * never raises at ~70%. The push rule takes the raise's edge away where it hides — a strong hand
 * against a weak dealer hand — so the paytable can rise with the hand and casual play stays near
 * 87%.
 *
 * Final table (× total stake): one pair 1.2 · two pair 1.4 · three 1.6 · full house 2 · four 2.2 ·
 * five of a kind 10. Exact results (analysis.ts, enumerating every deal and draw):
 *   - best strategy (holds below, raise 4× with three of a kind ♠ or higher, any full house, four
 *     or five of a kind; never otherwise): RTP 96.83% of the total wagered, 1.40 antes wagered per
 *     round, −4.4% of the ante per round. No strategy reaches 100%.
 *   - keep the groups, never raise: 87.1%.
 *   - best holds, never raise: 88.1%.
 */

export type Sym = number;
export const RED_JOKER = 0;
export const BLACK_JOKER = 1;
export const SPADE = 2;
export const HEART = 3;
export const DIAMOND = 4;
export const CLUB = 5;
export const SYMBOLS = 6;
export const PER_SYMBOL = 8;
export const DECK_SIZE = SYMBOLS * PER_SYMBOL;
export const HAND_SIZE = 5;
export const SYMBOL_CHAR = ['★', '☆', '♠', '♥', '♦', '♣'] as const;

/** Hand categories (higher is better). */
export const CAT = { nothing: 0, pair: 1, twoPair: 2, three: 3, fullHouse: 4, four: 5, five: 6 } as const;
export type Cat = (typeof CAT)[keyof typeof CAT];

export const SP = {
  minAnte: 5,
  /** 5× of it fits the table limit of 1,000. */
  maxAnte: 200,
  maxRaises: 4,
  /** The dealer calls raises with this category or better (push rule). */
  qualify: CAT.three as Cat,
};

/** Total return per unit staked when the player wins, by the player's category, in tenths. */
export const PAYS10: readonly number[] = [0, 12, 14, 16, 20, 22, 100];

/** Stake returned by a win with category `cat` (whole chips, rounded down). */
export const payWin = (stake: number, cat: Cat, pays10: readonly number[] = PAYS10) => Math.floor((stake * pays10[cat]) / 10);

export interface SpHand {
  cat: Cat;
  /** Symbols of the groups (pairs and better): the bigger group first, then the higher symbol. */
  groups: Sym[];
  /** Comparable strength: category, then the groups' symbols. Equal scores push. */
  score: number;
  /** Cards that belong to a group (they make the hand). */
  mask: boolean[];
}

export function symbolCounts(cards: readonly Sym[]): number[] {
  const c = [0, 0, 0, 0, 0, 0];
  for (const s of cards) c[s]++;
  return c;
}

/** Category of a 5-card hand from its symbol counts. */
export function catOfCounts(counts: readonly number[]): Cat {
  let top = 0;
  let groups = 0;
  for (const n of counts) {
    if (n >= 2) groups++;
    if (n > top) top = n;
  }
  if (top >= 5) return CAT.five;
  if (top === 4) return CAT.four;
  if (top === 3) return groups > 1 ? CAT.fullHouse : CAT.three;
  if (top === 2) return groups > 1 ? CAT.twoPair : CAT.pair;
  return CAT.nothing;
}

/** Score of a hand from its symbol counts: category × 36 + the groups' strengths (5 = ★ … 0 = ♣). */
export function scoreOfCounts(counts: readonly number[]): number {
  const cat = catOfCounts(counts);
  let g0 = -1;
  let g1 = -1;
  for (let s = 0; s < SYMBOLS; s++) {
    if (counts[s] < 2) continue;
    if (g0 < 0 || counts[s] > counts[g0]) {
      g1 = g0;
      g0 = s;
    } else if (g1 < 0) g1 = s;
  }
  const str = (s: number) => (s < 0 ? 0 : SYMBOLS - 1 - s);
  return cat * 36 + str(g0) * 6 + str(g1);
}

export function evalHand(cards: readonly Sym[]): SpHand {
  const counts = symbolCounts(cards);
  const groups: Sym[] = [];
  for (let s = 0; s < SYMBOLS; s++) if (counts[s] >= 2) groups.push(s);
  groups.sort((a, b) => counts[b] - counts[a] || a - b);
  return { cat: catOfCounts(counts), groups, score: scoreOfCounts(counts), mask: cards.map((s) => counts[s] >= 2) };
}

/** > 0 when `a` beats `b`, < 0 when it loses, 0 for a push. */
export const compareHands = (a: SpHand, b: SpHand) => Math.sign(a.score - b.score);

/**
 * The house way: keep every card whose symbol appears twice or more; with no pair keep the single
 * highest symbol. Returns the cards kept.
 */
export function houseHold(cards: readonly Sym[]): boolean[] {
  const counts = symbolCounts(cards);
  if (cards.some((s) => counts[s] >= 2)) return cards.map((s) => counts[s] >= 2);
  const best = Math.min(...cards);
  let kept = false;
  return cards.map((s) => {
    if (kept || s !== best) return false;
    kept = true;
    return true;
  });
}

/**
 * Best hold for the player (exact, see analysis.ts): the house way — every group, or the highest
 * single with no pair. It is the optimal hold at the advised raise level for every one of the 252
 * starting hands; after raises the advice would not make (3 or 4 on ★★/☆☆ + ♣♣) keeping only the
 * Joker pair is better by under 1% of the stake.
 */
export const holdAdvice = (cards: readonly Sym[]) => houseHold(cards);

/**
 * Best raise (exact): the return is linear in the stake, so the best raise is all (4) or nothing.
 * Raise 4× with three of a kind of ♠ or higher, any full house, four or five of a kind.
 */
export function raiseAdvice(cards: readonly Sym[]): number {
  const h = evalHand(cards);
  if (h.cat >= CAT.fullHouse) return SP.maxRaises;
  if (h.cat === CAT.three && h.groups[0] <= SPADE) return SP.maxRaises;
  return 0;
}

export type SpOutcome = 'win' | 'lose' | 'push';

export interface SpResult {
  /** Total returned per spot (stake + winnings; 0 for a loss). */
  ret: { ante: number; raise: number };
  outcome: SpOutcome;
  player: SpHand;
  dealer: SpHand;
  /** The dealer made three of a kind or better and called the raises. */
  qualifies: boolean;
}

/** Settles the final hands. */
export function settleSP(player: readonly Sym[], dealer: readonly Sym[], stakes: { ante: number; raise: number }, pays10: readonly number[] = PAYS10): SpResult {
  const ph = evalHand(player);
  const dh = evalHand(dealer);
  const c = compareHands(ph, dh);
  const qualifies = dh.cat >= SP.qualify;
  const back = (stake: number) => (c > 0 ? payWin(stake, ph.cat, pays10) : c === 0 ? stake : 0);
  return {
    ret: { ante: back(stakes.ante), raise: qualifies ? back(stakes.raise) : stakes.raise },
    outcome: c > 0 ? 'win' : c < 0 ? 'lose' : 'push',
    player: ph,
    dealer: dh,
    qualifies,
  };
}

/** Hand name key (strings `sp.h0`..`sp.h6`) and the group symbols, e.g. "★♠". */
export const handKey = (h: SpHand) => `sp.h${h.cat}`;
export const groupText = (h: SpHand) => h.groups.map((s) => SYMBOL_CHAR[s]).join('');

/** The 48 cards in order. */
export function freshSymbolDeck(): Sym[] {
  const out: Sym[] = [];
  for (let s = 0; s < SYMBOLS; s++) for (let i = 0; i < PER_SYMBOL; i++) out.push(s);
  return out;
}

/** The picture deck, shuffled fresh every round. */
export class SymbolDeck {
  private cards: Sym[] = [];
  private pos = 0;
  /** Cards dealt first (tests and scripted demos). */
  stack: Sym[] = [];

  constructor(private rng: Rng = cryptoRng) {
    this.shuffle();
  }

  shuffle() {
    this.cards = shuffle(freshSymbolDeck(), this.rng);
    this.pos = 0;
  }

  get remaining() {
    return this.cards.length - this.pos;
  }

  draw(): Sym {
    if (this.stack.length) return this.stack.shift()!;
    if (this.pos >= this.cards.length) throw new Error('Suit Poker: deck exhausted');
    return this.cards[this.pos++];
  }
}

/** A player strategy: how many raises (0..4) and which cards to hold. */
export interface SpStrategy {
  raises(cards: readonly Sym[]): number;
  hold(cards: readonly Sym[], raises: number): boolean[];
}

export const BEST_STRATEGY: SpStrategy = { raises: raiseAdvice, hold: (c) => holdAdvice(c) };
/** "Keep the groups, never raise". */
export const SIMPLE_STRATEGY: SpStrategy = {
  raises: () => 0,
  hold: (c) => {
    const n = symbolCounts(c);
    return c.map((s) => n[s] >= 2);
  },
};

/**
 * Plays one whole round from a shuffled deck in table order (five cards each, alternating, then
 * the player's draw, then the dealer's) and returns the stakes and the result. Used by the tests'
 * seeded simulation; the table plays the same steps with animation.
 */
export function playRoundSP(deck: SymbolDeck, ante: number, strat: SpStrategy, pays10: readonly number[] = PAYS10) {
  const player: Sym[] = [];
  const dealer: Sym[] = [];
  for (let i = 0; i < HAND_SIZE; i++) {
    player.push(deck.draw());
    dealer.push(deck.draw());
  }
  const raises = Math.max(0, Math.min(SP.maxRaises, strat.raises(player)));
  const held = strat.hold(player, raises);
  for (let i = 0; i < HAND_SIZE; i++) if (!held[i]) player[i] = deck.draw();
  const keep = houseHold(dealer);
  for (let i = 0; i < HAND_SIZE; i++) if (!keep[i]) dealer[i] = deck.draw();
  const stakes = { ante, raise: raises * ante };
  return { stakes, raises, player, dealer, res: settleSP(player, dealer, stakes, pays10) };
}
