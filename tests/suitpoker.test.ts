import { describe, expect, it } from 'vitest';
import { seededRng } from '../src/core/rng';
import { analyze, countsToCards, heldCounts, holdReturn, simulate } from '../src/games/suitpoker/analysis';
import {
  BEST_STRATEGY,
  BLACK_JOKER,
  CAT,
  CLUB,
  compareHands,
  DECK_SIZE,
  DIAMOND,
  evalHand,
  freshSymbolDeck,
  HEART,
  holdAdvice,
  houseHold,
  PAYS10,
  playRoundSP,
  raiseAdvice,
  RED_JOKER,
  settleSP,
  SIMPLE_STRATEGY,
  SP,
  SPADE,
  SymbolDeck,
  symbolCounts,
  type Sym,
} from '../src/games/suitpoker/rules';

const R = RED_JOKER;
const B = BLACK_JOKER;
const S = SPADE;
const H = HEART;
const D = DIAMOND;
const C = CLUB;

const cmp = (a: Sym[], b: Sym[]) => compareHands(evalHand(a), evalHand(b));

describe('Suit Poker – deck', () => {
  it('has 48 cards, 8 of each of the six symbols', () => {
    const d = freshSymbolDeck();
    expect(d.length).toBe(DECK_SIZE);
    expect(symbolCounts(d)).toEqual([8, 8, 8, 8, 8, 8]);
  });

  it('shuffles fresh and deals the whole deck', () => {
    const deck = new SymbolDeck(seededRng(7));
    const out: Sym[] = [];
    for (let i = 0; i < DECK_SIZE; i++) out.push(deck.draw());
    expect(symbolCounts(out)).toEqual([8, 8, 8, 8, 8, 8]);
    expect(() => deck.draw()).toThrow();
    deck.shuffle();
    expect(deck.remaining).toBe(DECK_SIZE);
  });
});

describe('Suit Poker – hands', () => {
  it('names every category', () => {
    expect(evalHand([S, S, S, S, S]).cat).toBe(CAT.five);
    expect(evalHand([S, S, S, S, H]).cat).toBe(CAT.four);
    expect(evalHand([S, S, S, H, H]).cat).toBe(CAT.fullHouse);
    expect(evalHand([S, S, S, H, D]).cat).toBe(CAT.three);
    expect(evalHand([S, S, H, H, D]).cat).toBe(CAT.twoPair);
    expect(evalHand([S, S, H, D, C]).cat).toBe(CAT.pair);
    expect(evalHand([R, B, S, H, D]).cat).toBe(CAT.nothing);
  });

  it('orders categories', () => {
    const ladder: Sym[][] = [
      [C, C, C, C, C],
      [R, R, R, R, B],
      [R, R, R, B, B],
      [R, R, R, B, S],
      [R, R, B, B, S],
      [R, R, B, S, H],
      [R, B, S, H, D],
    ];
    for (let i = 0; i + 1 < ladder.length; i++) expect(cmp(ladder[i], ladder[i + 1])).toBe(1);
    // the lowest five of a kind beats the highest four
    expect(cmp([C, C, C, C, C], [R, R, R, R, B])).toBe(1);
  });

  it('compares the groups: bigger group first, then the higher symbol', () => {
    expect(cmp([R, R, S, S, C], [S, S, H, H, R])).toBe(1); // ★★♠♠ beats ♠♠♥♥
    expect(cmp([S, S, H, H, R], [S, S, D, D, R])).toBe(1); // same top pair: the second decides
    expect(cmp([D, D, D, R, R], [C, C, C, R, R])).toBe(1); // full house: the three first
    expect(cmp([D, D, D, C, C], [C, C, C, R, R])).toBe(1); // ♦♦♦♣♣ beats ♣♣♣★★
    expect(cmp([H, H, H, H, C], [D, D, D, D, R])).toBe(1); // four: the single never counts
    expect(cmp([B, B, S, H, D], [S, S, R, B, H])).toBe(1); // ☆☆ beats ♠♠
    expect(cmp([R, R, R, R, R], [B, B, B, B, B])).toBe(1);
  });

  it('pushes on the same groups whatever the singles, and nothing against nothing', () => {
    expect(cmp([S, S, R, B, H], [S, S, D, C, H])).toBe(0);
    expect(cmp([S, S, H, H, R], [H, H, S, S, C])).toBe(0);
    expect(cmp([H, H, H, H, R], [H, H, H, H, C])).toBe(0);
    expect(cmp([R, B, S, H, D], [B, S, H, D, C])).toBe(0);
  });

  it('marks the cards that make the hand', () => {
    expect(evalHand([S, R, S, H, R]).mask).toEqual([true, true, true, false, true]);
    expect(evalHand([S, R, B, H, D]).mask).toEqual([false, false, false, false, false]);
    expect(evalHand([H, H, R, H, H]).groups).toEqual([H]);
    expect(evalHand([C, C, R, R, C]).groups).toEqual([C, R]);
  });
});

describe('Suit Poker – house way and advice', () => {
  it('the dealer keeps every group and replaces the singles', () => {
    expect(houseHold([S, H, S, D, C])).toEqual([true, false, true, false, false]);
    expect(houseHold([S, H, S, H, C])).toEqual([true, true, true, true, false]);
    expect(houseHold([D, D, D, D, R])).toEqual([true, true, true, true, false]);
    expect(houseHold([D, D, C, C, C])).toEqual([true, true, true, true, true]);
  });

  it('with no pair the dealer keeps the highest symbol only', () => {
    expect(houseHold([H, S, C, B, D])).toEqual([false, false, false, true, false]);
    expect(houseHold([C, D, H, S, R])).toEqual([false, false, false, false, true]);
  });

  it('raises 4× with three of a kind ♠ or higher, any full house, four or five of a kind', () => {
    expect(raiseAdvice([S, S, S, H, D])).toBe(4);
    expect(raiseAdvice([R, R, R, H, D])).toBe(4);
    expect(raiseAdvice([H, H, H, S, D])).toBe(0);
    expect(raiseAdvice([C, C, C, D, D])).toBe(4);
    expect(raiseAdvice([D, D, D, D, R])).toBe(4);
    expect(raiseAdvice([R, R, B, B, S])).toBe(0);
    expect(raiseAdvice([R, B, S, H, D])).toBe(0);
    expect(holdAdvice([R, R, S, C, C])).toEqual([true, true, false, true, true]);
  });
});

describe('Suit Poker – settlement', () => {
  const stakes = { ante: 25, raise: 100 };

  it('a win returns the stake × the multiplier of the winning hand', () => {
    // player full house, dealer three of a kind (it calls the raise)
    const r = settleSP([H, H, H, C, C], [S, S, S, R, B], stakes);
    expect(r.outcome).toBe('win');
    expect(r.qualifies).toBe(true);
    expect(r.ret).toEqual({ ante: 50, raise: 200 });
    // five of a kind
    const f = settleSP([C, C, C, C, C], [R, R, R, R, B], stakes);
    expect(f.ret).toEqual({ ante: 250, raise: 1000 });
  });

  it('pays whole chips on every multiplier', () => {
    for (let cat = 1; cat <= 6; cat++)
      for (let ante = 5; ante <= SP.maxAnte; ante += 5) for (let k = 1; k <= 5; k++) expect(Number.isInteger((ante * k * PAYS10[cat]) / 10)).toBe(true);
    // one pair beats nothing: ×1.2
    expect(settleSP([S, S, R, H, D], [R, B, S, H, D], { ante: 25, raise: 0 }).ret).toEqual({ ante: 30, raise: 0 });
  });

  it('returns the raises when the dealer is below three of a kind (push rule)', () => {
    const win = settleSP([H, H, H, C, C], [S, S, H, D, R], stakes);
    expect(win.qualifies).toBe(false);
    expect(win.ret).toEqual({ ante: 50, raise: 100 });
    const lose = settleSP([S, S, R, H, D], [B, B, C, C, R], stakes);
    expect(lose.outcome).toBe('lose');
    expect(lose.ret).toEqual({ ante: 0, raise: 100 });
  });

  it('a loss returns 0 and a push returns the stake', () => {
    expect(settleSP([S, S, S, H, D], [R, R, R, H, D], stakes).ret).toEqual({ ante: 0, raise: 0 });
    expect(settleSP([S, S, S, H, D], [S, S, S, R, B], stakes).ret).toEqual(stakes);
    expect(settleSP([R, B, S, H, D], [B, S, H, D, C], { ante: 25, raise: 0 }).ret).toEqual({ ante: 25, raise: 0 });
  });

  it('plays a scripted round in table order', () => {
    const deck = new SymbolDeck(seededRng(1));
    // player / dealer alternate: P ♠ ♠ ♠ ♥ ♦ — D ♣ ♣ ★ ☆ ♥; then the player's two, the dealer's three
    deck.stack = [S, C, S, C, S, R, H, B, D, H, S, S, C, D, D];
    const r = playRoundSP(deck, 10, BEST_STRATEGY);
    expect(r.raises).toBe(4);
    expect(r.player).toEqual([S, S, S, S, S]);
    expect(r.dealer).toEqual([C, C, C, D, D]);
    expect(r.res.outcome).toBe('win');
    expect(r.res.ret).toEqual({ ante: 100, raise: 400 });
  });
});

describe('Suit Poker – exact RTP', () => {
  const a = analyze();

  it('covers every deal', () => {
    expect(a.hands.length).toBe(252);
    expect(a.hands.reduce((s, h) => s + h.p, 0)).toBeCloseTo(1, 12);
  });

  it('best strategy lands at 95–97% and no strategy beats 100%', () => {
    // optimal = every hold and every raise level (1..5 units) of every starting hand
    expect(a.optimal.rtp).toBeGreaterThan(0.95);
    expect(a.optimal.rtp).toBeLessThan(0.97);
    // the best net over every deterministic choice is negative, so every strategy (mixed ones are
    // averages of these) loses money: return / wager stays under 100% whatever the player does
    expect(a.optimal.netPerAnte).toBeLessThan(0);
    console.info(
      `[suitpoker] best ${(a.optimal.rtp * 100).toFixed(3)}% (net ${a.optimal.netPerAnte.toFixed(4)} ante, stake ${a.optimal.stakePerAnte.toFixed(3)}, raised ${(a.optimal.raiseRate * 100).toFixed(1)}%) · advice ${(a.advice.rtp * 100).toFixed(3)}% · simple ${(a.simple.rtp * 100).toFixed(3)}% · best holds no raise ${(a.noRaise.rtp * 100).toFixed(3)}% · win ${(a.winRate * 100).toFixed(2)}% push ${(a.pushRate * 100).toFixed(2)}%`,
    );
  });

  it('the advice is the best strategy', () => {
    expect(a.advice.rtp).toBeCloseTo(a.optimal.rtp, 10);
    expect(a.advice.netPerAnte).toBeCloseTo(a.optimal.netPerAnte, 10);
    for (const hs of a.hands) {
      const cards = countsToCards(hs.counts);
      const k = 1 + raiseAdvice(cards);
      const advised = heldCounts(cards, holdAdvice(cards));
      const av = hs.holds.find((h) => h.hold.every((x, i) => x === advised[i]))!;
      // the advised raise level is the best one for the best hold
      const best = Math.max(...hs.holds.flatMap((h) => [1, 2, 3, 4, 5].map((n) => holdReturn(h, n) - n)));
      expect(holdReturn(av, k) - k).toBeCloseTo(best, 10);
      // at any raise level the advised hold is within 1% of the stake of the best hold
      for (let n = 1; n <= 5; n++) {
        const top = Math.max(...hs.holds.map((h) => holdReturn(h, n)));
        expect(top - holdReturn(av, n)).toBeLessThan(0.01 * n);
      }
    }
  });

  it('reports the simple strategy (keep the groups, never raise)', () => {
    expect(a.simple.rtp).toBeGreaterThan(0.85);
    expect(a.simple.rtp).toBeLessThan(0.9);
    expect(a.noRaise.rtp).toBeGreaterThanOrEqual(a.simple.rtp);
  });

  it('without the push rule the raise would beat the house (why the table was tuned)', () => {
    // the starting table 16/8/6/4/3/2, the dealer always calling
    const start = analyze([0, 20, 30, 40, 60, 80, 160], 0);
    expect(start.optimal.rtp).toBeGreaterThan(2);
    // even money on every win: fair without raising, far over 100% raising 4× on the strong hands
    const even = analyze([0, 20, 20, 20, 20, 20, 20], 0);
    expect(even.noRaise.rtp).toBeGreaterThan(0.99);
    expect(even.optimal.rtp).toBeGreaterThan(1.15);
    // this paytable without the push rule
    const ours = analyze(PAYS10, 0);
    expect(ours.optimal.rtp).toBeGreaterThan(1);
    console.info(`[suitpoker] no push rule: 16/8/6/4/3/2 ${(start.optimal.rtp * 100).toFixed(1)}% · even money ${(even.optimal.rtp * 100).toFixed(1)}% (no raise ${(even.noRaise.rtp * 100).toFixed(1)}%) · this table ${(ours.optimal.rtp * 100).toFixed(1)}%`);
  });

  it('a seeded simulation of whole rounds agrees with the exact figures', () => {
    const best = simulate(400_000, seededRng(20261126), BEST_STRATEGY);
    expect(Math.abs(best.rtp - a.advice.rtp)).toBeLessThan(0.008);
    const simple = simulate(200_000, seededRng(42), SIMPLE_STRATEGY);
    expect(Math.abs(simple.rtp - a.simple.rtp)).toBeLessThan(0.008);
    console.info(`[suitpoker] simulated best ${(best.rtp * 100).toFixed(2)}% · simple ${(simple.rtp * 100).toFixed(2)}% · five-of-a-kind wins ${best.fives}`);
  });
});
