import { describe, expect, it } from 'vitest';
import { parseCards, type Card } from '../src/core/cards';
import { bestOf, Cat5 } from '../src/core/eval5';
import { seededRng, shuffle, type Rng } from '../src/core/rng';
import {
  bookDecision,
  bookMove,
  DEAL_STREETS,
  DECISION_AFTER,
  flushDraw,
  handScore,
  isDown,
  legalMoves,
  MULT,
  netAntes,
  playHand,
  QUALIFY_SCORE,
  riverRead,
  scoreCat,
  settleStud,
  straightDraw,
  streetOdds,
  StudDeal,
  upCards,
  type Move,
  type Street,
} from '../src/games/stud7/rules';

const c = (s: string) => parseCards(s);
const deckOf = (rng: Rng) => shuffle(Array.from({ length: 52 }, (_, i) => i), rng);
/** A draw function over a freshly shuffled deck. */
function drawer(rng: Rng) {
  const d = deckOf(rng);
  let k = 0;
  return () => d[k++];
}
const BETS = { ante: 10, blind: 10, bonus: 5 };

describe('evaluation', () => {
  it('handScore gives the same score as bestOf on 5, 6 and 7 cards', () => {
    const rng = seededRng(17);
    for (let i = 0; i < 20000; i++) {
      const d = deckOf(rng);
      const n = 5 + (i % 3);
      const h = d.slice(0, n);
      expect(handScore(h)).toBe(bestOf(h).score);
    }
  });

  it('scores the tricky seven-card hands like bestOf', () => {
    const hands = [
      'As 2d 3c 4h 5s 9d Kc', // wheel
      'As 2s 3s 4s 5s 9d Kc', // steel wheel
      'Ah Kh Qh Jh Th 9h 2c', // royal with a ninth-high straight flush inside
      'Kc Kd Ks 7h 7d 7s 2c', // two trips: kings full of sevens
      'Kc Kd 7h 7d 4s 4c 2h', // three pairs: kicker is the third pair
      '9c 9d 9h 9s 5c 5d 5h', // quads + trips
      '2h 5h 8h 9h Kh 6c 7d', // flush over a straight
      'Tc Jd Qh Ks Ac 9d 8c', // ace-high straight
    ];
    for (const h of hands) expect(handScore(c(h))).toBe(bestOf(c(h)).score);
    expect(scoreCat(handScore(c(hands[0])))).toBe(Cat5.Straight);
    expect(scoreCat(handScore(c(hands[1])))).toBe(Cat5.StraightFlush);
    expect(scoreCat(handScore(c(hands[2])))).toBe(Cat5.Royal);
    expect(scoreCat(handScore(c(hands[3])))).toBe(Cat5.FullHouse);
    expect(scoreCat(handScore(c(hands[6])))).toBe(Cat5.Flush);
  });

  it('scores partial hands (fewer than five cards) by their pairs only', () => {
    expect(scoreCat(handScore(c('Ks Kd 4h')))).toBe(Cat5.Pair);
    expect(scoreCat(handScore(c('Ks Kd 4h 4c')))).toBe(Cat5.TwoPair);
    expect(scoreCat(handScore(c('2s 3s 4s 5s')))).toBe(Cat5.High);
    expect(handScore(c('As Ad Ah Ac'))).toBeGreaterThan(handScore(c('Ks Kd Kh 2c 3c 4d 5h')));
  });
});

describe('settlement', () => {
  it('a winning hand against a qualifying dealer: Ante and Raise 1:1, Blind by its table', () => {
    // player flush, dealer two pair
    const r = settleStud(c('2h 5h 8h 9h Kh 3c 4d'), c('Qs Qd 7c 7d 2s 3s 9c'), BETS, 40, false);
    expect(r.qualifies).toBe(true);
    expect(r.cmp).toBe(1);
    expect(r.ret).toEqual({ ante: 20, blind: 25, raise: 80, bonus: 40 }); // flush: Blind 3:2, Bonus 7:1
  });

  it('a dealer without a pair pushes the Ante; a winner below a straight pushes the Blind', () => {
    const r = settleStud(c('9s 9d 2c 3h 5d 7s Jc'), c('Ah Kd Qc 8h 6d 4s 2s'), BETS, 20, false);
    expect(r.qualifies).toBe(false);
    expect(r.cmp).toBe(1);
    expect(r.ret).toEqual({ ante: 10, blind: 10, raise: 40, bonus: 0 });
  });

  it('a losing hand loses Raise and Blind, and the Ante only against a qualifying dealer', () => {
    const q = settleStud(c('9s 9d 2c 3h 5d 7s Jc'), c('Ah Ad Qc 8h 6d 4s 2s'), BETS, 20, false);
    expect(q.ret).toEqual({ ante: 0, blind: 0, raise: 0, bonus: 0 });
    const nq = settleStud(c('Ks Qd 2c 3h 5d 7s 9c'), c('Ah Kd Qc 8h 6d 4s 2s'), BETS, 20, false);
    expect(nq.qualifies).toBe(false);
    expect(nq.cmp).toBe(-1);
    expect(nq.ret).toEqual({ ante: 10, blind: 0, raise: 0, bonus: 0 });
  });

  it('a tie pushes everything', () => {
    const r = settleStud(c('As Kd Qc Jh 9d 3s 2c'), c('Ad Ks Qh Jc 9s 4d 3c'), BETS, 10, false);
    expect(r.cmp).toBe(0);
    expect(r.ret).toEqual({ ante: 10, blind: 10, raise: 10, bonus: 0 });
  });

  it('a folded hand loses Ante and Blind but its Bonus still pays', () => {
    const r = settleStud(c('Ks Kd Kh 7h 7d 2c 3c'), c('Ac Ad Ah As 2d 3d 4d'), BETS, 0, true);
    expect(r.ret).toEqual({ ante: 0, blind: 0, raise: 0, bonus: 45 }); // full house 8:1
  });

  it('netAntes agrees with settleStud in Antes', () => {
    const rng = seededRng(5);
    for (let i = 0; i < 3000; i++) {
      const d = deckOf(rng);
      const p = d.slice(0, 7);
      const dl = d.slice(7, 14);
      const mult = [0, 1, 2, 4][i % 4];
      const folded = mult === 0;
      const r = settleStud(p, dl, { ante: 1, blind: 1, bonus: 0 }, mult, folded);
      const net = r.ret.ante + r.ret.blind + r.ret.raise - 2 - mult;
      expect(netAntes(handScore(p), handScore(dl), mult)).toBeCloseTo(net, 9);
    }
    expect(QUALIFY_SCORE).toBeLessThanOrEqual(handScore(c('2s 2d 3c 4h 6d 8s 9c')));
    expect(QUALIFY_SCORE).toBeGreaterThan(handScore(c('As Kd Qc Jh 9d 3s 2c')));
  });

  it('STUD BONUS returns 96.50% (exact seven-card frequencies)', () => {
    const total = 133784560;
    const counts: [Cat5, number][] = [
      [Cat5.Royal, 4324],
      [Cat5.StraightFlush, 37260],
      [Cat5.Quads, 224848],
      [Cat5.FullHouse, 3473184],
      [Cat5.Flush, 4047644],
      [Cat5.Straight, 6180020],
      [Cat5.Trips, 6461620],
    ];
    const sample: Record<number, string> = {
      [Cat5.Royal]: 'Ah Kh Qh Jh Th 2c 3d',
      [Cat5.StraightFlush]: '9h 8h 7h 6h 5h 2c 3d',
      [Cat5.Quads]: '9h 9c 9d 9s 5h 2c 3d',
      [Cat5.FullHouse]: '9h 9c 9d 5s 5h 2c 3d',
      [Cat5.Flush]: '9h 7h 4h 3h Kh 2c 3d',
      [Cat5.Straight]: '9h 8c 7d 6s 5h 2c Kd',
      [Cat5.Trips]: '9h 9c 9d 6s 5h 2c Kd',
    };
    let back = 0;
    for (const [cat, n] of counts) {
      // any final hand of the category (folded): the Bonus only depends on it
      const r = settleStud(c(sample[cat]), c('2s 3s 4c 6d 7c Jh Qd'), { ante: 1, blind: 1, bonus: 1 }, 0, true);
      back += (n / total) * r.ret.bonus;
    }
    expect(back).toBeCloseTo(0.965, 3);
  });
});

describe('the deal', () => {
  it('deals stud: two down, four up, one down; first seat first, dealer last in each pass', () => {
    const d = new StudDeal(drawer(seededRng(1)), 2);
    const third = d.street('third');
    expect(third.map((x) => x.seat)).toEqual([0, 1, -1, 0, 1, -1, 0, 1, -1]);
    expect(third.map((x) => x.up)).toEqual([false, false, false, false, false, false, true, true, true]);
    for (const s of DEAL_STREETS.slice(1)) d.street(s);
    expect(d.hands[0].length).toBe(7);
    expect(d.dealer.length).toBe(7);
    expect([0, 1, 2, 3, 4, 5, 6].map(isDown)).toEqual([true, true, false, false, false, false, true]);
    expect(d.dealerUp).toEqual(d.dealer.slice(2, 6));
    expect(d.deadFor(0)).toEqual(upCards(d.hands[1]));
    expect(new Set([...d.hands.flat(), ...d.dealer]).size).toBe(21);
    expect(DECISION_AFTER.sixth).toBeNull();
  });

  it('offers 4× on 3rd street, 2× on 4th and 5th, 1× or fold at the river, and only what can be covered', () => {
    expect(legalMoves('third')).toEqual(['check', 'raise4']);
    expect(legalMoves('fourth')).toEqual(['check', 'raise2']);
    expect(legalMoves('fifth')).toEqual(['check', 'raise2']);
    expect(legalMoves('river')).toEqual(['fold', 'bet1']);
    expect(legalMoves('third', (k) => k <= 2)).toEqual(['check']);
    expect(MULT.raise4).toBe(4);
  });
});

describe('strategy', () => {
  it('raises strong starts and checks weak ones on 3rd street', () => {
    expect(bookMove('third', c('As Ad Ac'), c('5h'))).toBe('raise4');
    expect(bookMove('third', c('Kc Kd 4h'), c('7s'))).toBe('raise4');
    expect(bookMove('third', c('9c 9d 4h'), c('Ks'))).toBe('raise4');
    expect(bookMove('third', c('2c 7d 9h'), c('Ah'))).toBe('check');
    expect(bookMove('third', c('2c 2d 7h'), c('As'))).toBe('check');
    expect(bookMove('third', c('Qh Jh 6c'), c('5s'))).toBe('check');
  });

  it('raises two pair on 5th street and reads the river exactly', () => {
    expect(bookMove('fifth', c('Kc Kd 4h 4s 9d'), c('2s 7h Jc'))).toBe('raise2');
    // a flush against a ragged board: bet; deuces against four aces showing, or high card against kings: fold
    expect(bookMove('river', c('2h 5h 8h 9h Kh 3c 4d'), c('2s 7d 9c Js'))).toBe('bet1');
    expect(bookMove('river', c('2c 2d 5h 8s 9c Jd Kh'), c('As Ad Ah Ac'))).toBe('fold');
    expect(bookMove('river', c('2c 4d 6h 8s Tc Qd 3h'), c('Ks Kd 5c 7d'))).toBe('fold');
    // a marginal river bet: betting still loses less than folding
    const r = bookDecision('river', c('9d 2s Qd Td 8s As 5s'), c('3s 8h 9c 2h'));
    expect(r.move).toBe('bet1');
    expect(r.margin).toBeGreaterThan(0);
    expect(r.odds.win).toBeLessThan(0.4);
  });

  it('the river read counts every three hidden cards', () => {
    const r = riverRead(c('2h 5h 8h 9h Kh 3c 4d'), c('2s 7d 9c Js'));
    expect(r.win + r.lose).toBeLessThanOrEqual(1);
    expect(r.winQ).toBeLessThanOrEqual(r.win);
    expect(r.loseQ).toBeLessThanOrEqual(r.lose);
    // exact: same answer twice, independent of any rng
    expect(riverRead(c('2h 5h 8h 9h Kh 3c 4d'), c('2s 7d 9c Js'))).toEqual(r);
  });

  it('is a pure function of the cards in view, whatever the order of the dead cards', () => {
    const own = c('7h 9h Ah Th 8d');
    const up = c('6s 3s 4s');
    const dead = c('6c Jc 6d Kd 4c 5c 7s 9c');
    const a = bookDecision('fifth', own, up, dead);
    const b = bookDecision('fifth', own, up, [...dead].reverse());
    expect(b).toEqual(a);
    expect(streetOdds(own, up, dead, 300)).toEqual(streetOdds(own, up, [...dead].reverse(), 300));
  });

  it('dead cards weaken a draw: four hearts on 5th street stop being a raise when the hearts are out', () => {
    const own = c('7h 9h Ah Th 8d');
    const up = c('6s 3s 4s');
    const other = c('6c Jc 6d Kd 4c 5c 7s 9c');
    const hearts = c('8h 2h Kh Qh');
    const live = bookDecision('fifth', own, up, other);
    const dead = bookDecision('fifth', own, up, [...other, ...hearts]);
    expect(live.move).toBe('raise2');
    expect(dead.move).toBe('check');
    expect(dead.odds.win).toBeLessThan(live.odds.win);
    expect(flushDraw(own, [...up, ...other])).toEqual({ have: 4, live: 9 });
    expect(flushDraw(own, [...up, ...other, ...hearts])).toEqual({ have: 4, live: 5 });
    expect(straightDraw(c('7h 8d 9c Ts'), []).have).toBe(4);
  });
});

/** Plays `n` single-table hands with a chooser; RTP per Ante and per chip wagered. */
function simulate(n: number, seed: number, choose: (st: Street, own: Card[], up: Card[]) => Move) {
  const rng = seededRng(seed);
  let net = 0;
  let wager = 0;
  for (let i = 0; i < n; i++) {
    const r = playHand(drawer(rng), choose);
    net += r.net;
    wager += 2 + r.mult;
  }
  return { perAnte: 1 + net / n, perWager: 1 + net / wager };
}

const pairPlus = (cards: Card[]) => scoreCat(handScore(cards)) >= Cat5.Pair;

describe('RTP', () => {
  it('the hint strategy returns about 97.5% of the Ante (seeded run; 4.4M hands offline: 97.46% ± 0.43%)', () => {
    const r = simulate(9000, 2024, (st, own, up) => bookMove(st, own, up));
    // a short run: Blind jackpots make the result noisy (± 9% at 95% for 9,000 hands)
    expect(r.perAnte).toBeGreaterThan(0.88);
    expect(r.perAnte).toBeLessThan(1.07);
    console.log(`stud7 hint strategy, 9,000 hands: ${(r.perAnte * 100).toFixed(2)}% of the Ante, ${(r.perWager * 100).toFixed(2)}% of the wager`);
  }, 240000);

  it('the hint beats passive and reckless play on the same hands', () => {
    const n = 2500;
    const book = simulate(n, 77, (st, own, up) => bookMove(st, own, up));
    const passive = simulate(n, 77, (st, own, up) => (st === 'river' ? bookMove(st, own, up) : 'check'));
    expect(book.perAnte).toBeGreaterThan(passive.perAnte + 0.1);
  }, 240000);

  it('simpler aggressive strategies lose clearly', () => {
    const n = 120000;
    const alwaysBet = simulate(n, 9, (st) => (st === 'river' ? 'bet1' : 'check'));
    const always4 = simulate(n, 9, (st) => (st === 'third' ? 'raise4' : 'bet1'));
    const pair4 = simulate(n, 9, (st, own) => (st === 'third' ? (pairPlus(own) ? 'raise4' : 'check') : st === 'river' ? 'bet1' : 'check'));
    console.log(`always bet to the end ${(alwaysBet.perAnte * 100).toFixed(1)}%, always 4× ${(always4.perAnte * 100).toFixed(1)}%, 4× with a pair else bet to the end ${(pair4.perAnte * 100).toFixed(1)}%`);
    // 56.8%, 56.9% and 72.4% in the 880,000-hand study
    expect(alwaysBet.perAnte).toBeLessThan(0.65);
    expect(always4.perAnte).toBeLessThan(0.68);
    expect(pair4.perAnte).toBeLessThan(0.8);
  }, 240000);

  it('even with the best river play, raising every pair stays below 100%', () => {
    const r = simulate(12000, 31, (st, own, up) => (st === 'river' ? bookMove(st, own, up) : pairPlus(own) ? (st === 'third' ? 'raise4' : 'raise2') : 'check'));
    console.log(`4× with a pair, 2× with any later pair, best river: ${(r.perAnte * 100).toFixed(1)}%`);
    // 93.2% in the 880,000-hand study
    expect(r.perAnte).toBeLessThan(1);
  }, 240000);
});
