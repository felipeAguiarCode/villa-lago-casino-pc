import { describe, expect, it } from 'vitest';
import { parseCards, type Card } from '../src/core/cards';
import { bestOf } from '../src/core/eval5';
import { seededRng, shuffle } from '../src/core/rng';
import { bestLow, highScore, lowKey5, lowName, lowScore } from '../src/games/vanunu/hands';
import { exactOdds, sampleOdds } from '../src/games/vanunu/odds';
import { settleSides, settleVanunu, showdown, swapFee, VN } from '../src/games/vanunu/rules';
import { bestPolicy, naivePolicy, simulate } from '../src/games/vanunu/sim';
import { bestOfEv, declareFromOdds, declEv, raiseAdvice, swapAdvice } from '../src/games/vanunu/strategy';

const P = parseCards;
const low = (s: string) => bestLow(P(s));

function randomHands(n: number, seed: number, size: () => number): Card[][] {
  const rng = seededRng(seed);
  const deck = Array.from({ length: 52 }, (_, i) => i);
  const out: Card[][] = [];
  for (let i = 0; i < n; i++) {
    shuffle(deck, rng);
    out.push(deck.slice(0, size()));
  }
  return out;
}

describe('vanunu hands', () => {
  it('fast HIGH score equals bestOf on 5, 6 and 7 cards', () => {
    let k = 0;
    for (const h of randomHands(6000, 11, () => 5 + (k++ % 3))) expect(highScore(h)).toBe(bestOf(h).score);
  });

  it('fast LOW score equals the best of every five-card choice', () => {
    let k = 0;
    for (const h of randomHands(6000, 12, () => 5 + (k++ % 3))) expect(lowScore(h)).toBe(bestLow(h).score);
  });

  it('A-5 lowball ranks lows from the top card down, aces low, no straights or flushes', () => {
    // the wheel is the best low even though it is a straight (and here a flush)
    expect(lowName(low('As 2s 3s 4s 5s Kd Kh'))).toBe('5-4-3-2-A');
    expect(low('As 2s 3s 4s 5s').score).toBeLessThan(low('As 2d 3c 4h 6s').score);
    // highest card first: 7-5-4-2-A beats 7-6-3-2-A
    expect(low('7c 5d 4h 2s Ac').score).toBeLessThan(low('7d 6c 3h 2d Ad').score);
    expect(low('8c 4d 3h 2s Ac').score).toBeLessThan(low('8d 5c 3c 2d Ad').score);
    // any no-pair low beats any pair; a lower pair beats a higher pair
    expect(low('Kc Qd Jh 9s 8c').score).toBeLessThan(low('2c 2d 3h 4s 5c').score);
    expect(low('2c 2d 7h 8s 9c').score).toBeLessThan(low('3c 3d 4h 5s 6c').score);
    // two pair is worse than one pair, trips worse than two pair
    expect(low('9c 9d 8h 7s 6c').score).toBeLessThan(low('2c 2d 3h 3s 4c').score);
    expect(low('Kc Kd Qh Qs Jc').score).toBeLessThan(low('2c 2d 2h 3s 4c').score);
    // the best five of seven: the pair is dodged
    const h = low('9c 9d 8h 6s 4c 3d 2h');
    expect(lowName(h)).toBe('8-6-4-3-2');
    expect(h.cards).toHaveLength(5);
    // aces print as A and count as one
    expect(lowName(low('Ah Kd 6c 4s 3h 2c Qd'))).toBe('6-4-3-2-A');
    // the 5-card key agrees with the 7-card search on exactly five cards
    const five = P('Ah 7d 6c 4s 3h');
    expect(lowKey5(five)).toBe(lowScore(five));
  });
});

describe('vanunu odds', () => {
  it('exact odds match a large sample', () => {
    const pUp = P('As 3d 5h 9c Kd');
    const dUp = P('Qs Qh 7c 8d 2s');
    const ex = exactOdds(pUp, dUp);
    const mc = sampleOdds(pUp, dUp, [], seededRng(5), 60000);
    for (const k of ['hw', 'lw', 'both'] as const) expect(Math.abs(ex[k] - mc[k])).toBeLessThan(0.012);
    // the dealer's queens lead HIGH, the player's wheel cards lead LOW
    expect(ex.lw).toBeGreaterThan(0.7);
    expect(ex.hw).toBeLessThan(0.35);
  });

  it('a symmetric start is a coin flip on each side', () => {
    const o = sampleOdds([], [], [], seededRng(9), 40000);
    expect(Math.abs(o.hw - 0.5)).toBeLessThan(0.01);
    expect(Math.abs(o.lw - 0.5)).toBeLessThan(0.01);
  });
});

describe('vanunu settlement', () => {
  const bets = { ante: 10, play: 30, swap: 10 };

  it('HIGH or LOW: scoop pays 1:1, a split pushes, losing the side loses', () => {
    expect(settleSides(1, 1, 'high', bets)).toEqual({ ret: { ante: 20, play: 60, swap: 0 }, outcome: 'scoop' });
    expect(settleSides(1, -1, 'high', bets)).toEqual({ ret: { ante: 10, play: 30, swap: 0 }, outcome: 'split' });
    expect(settleSides(-1, 1, 'high', bets)).toEqual({ ret: { ante: 0, play: 0, swap: 0 }, outcome: 'lose' });
    expect(settleSides(1, -1, 'low', bets).outcome).toBe('lose');
    expect(settleSides(-1, 1, 'low', bets).outcome).toBe('split');
    // a tie on the declared side pushes; winning it but tying the other side is a split
    expect(settleSides(0, 1, 'high', bets).outcome).toBe('push');
    expect(settleSides(1, 0, 'high', bets).outcome).toBe('split');
  });

  it('BOTH pays 2:1 on Ante and Play, anything less loses everything', () => {
    expect(settleSides(1, 1, 'both', bets)).toEqual({ ret: { ante: 30, play: 90, swap: 0 }, outcome: 'bothWin' });
    expect(settleSides(1, 0, 'both', bets).outcome).toBe('bothLose');
    expect(settleSides(1, -1, 'both', bets).ret).toEqual({ ante: 0, play: 0, swap: 0 });
    expect(settleSides(-1, -1, 'both', bets).outcome).toBe('bothLose');
  });

  it('fold loses the Ante; swap fees never come back', () => {
    expect(settleSides(1, 1, 'fold', bets)).toEqual({ ret: { ante: 0, play: 0, swap: 0 }, outcome: 'fold' });
    expect(swapFee(25, true)).toBe(25 * VN.swapUp);
    expect(swapFee(25, false)).toBe(25 * VN.swapDown);
  });

  it('settles real hands on both evaluations', () => {
    // player: wheel straight (HIGH) and the 5-4-3-2-A low; dealer: two pair
    const p = P('As 2d 3c 4h 5s Kd Qc');
    const d = P('Ks Kh 9c 9d 7h 6s 8c');
    const sd = showdown(p, d);
    expect(sd.high).toBe(1);
    expect(sd.low).toBe(1);
    expect(lowName(sd.pl)).toBe('5-4-3-2-A');
    const r = settleVanunu(p, d, 'both', { ante: 10, play: 10, swap: 0 });
    expect(r.outcome).toBe('bothWin');
    expect(r.ret.ante + r.ret.play).toBe(30 + 30);
    // the dealer's low dodges its pairs: K-9-8-7-6, far behind the wheel
    expect(lowName(sd.dl)).toBe('K-9-8-7-6');
  });
});

describe('vanunu strategy', () => {
  it('values each declaration from the odds', () => {
    const o = { hw: 0.9, ht: 0, lw: 0.2, lt: 0, both: 0.15 };
    const ev = declEv(o, 1, 1);
    expect(ev.high).toBeCloseTo(2 * 0.15 - 2 * 0.1);
    expect(ev.low).toBeCloseTo(2 * 0.15 - 2 * 0.8);
    expect(ev.both).toBeCloseTo(2 * 2 * 0.15 - 2 * 0.85);
    expect(bestOfEv(ev).decl).toBe('high');
    // BOTH once a won side carries the other more often than not
    expect(declareFromOdds({ hw: 0.9, ht: 0, lw: 0.6, lt: 0, both: 0.55 }, 3).decl).toBe('both');
    expect(declareFromOdds({ hw: 0.9, ht: 0, lw: 0.5, lt: 0, both: 0.4 }, 3).decl).toBe('high');
    // fold when even the best declaration loses more than the Ante
    expect(declareFromOdds({ hw: 0.1, ht: 0, lw: 0.1, lt: 0, both: 0.01 }, 0).decl).toBe('fold');
    // after a raise there is no folding
    expect(declareFromOdds({ hw: 0.1, ht: 0, lw: 0.1, lt: 0, both: 0.01 }, 3).decl).not.toBe('fold');
  });

  it('raises a scooping start and checks a split one', () => {
    const rng = seededRng(3);
    const good = raiseAdvice({ pUp: P('As 2d'), dUp: P('Kh Kc'), dead: [] }, true, rng, 3000);
    expect(good.raise).toBe(true);
    const bad = raiseAdvice({ pUp: P('Ks Kd'), dUp: P('Ah 2c'), dead: [] }, true, rng, 3000);
    expect(bad.raise).toBe(false);
  });

  it('swap advice only ever swaps a face-up card, and pays its fee', () => {
    const rng = seededRng(4);
    const pos = { pUp: P('As 2d 3c 4h Kd'), dUp: P('Qs Qh 9c 9d 7h'), dead: [] };
    const a = swapAdvice(pos, 3, rng, 60);
    expect(a.options).toHaveLength(5);
    if (a.index >= 0) expect(a.options[a.index] - a.keep).toBeGreaterThan(0);
  });
});

describe('vanunu balance (seeded simulation)', () => {
  // Whole hands with the hint's strategy: raises from the reveal-2 / reveal-4 estimates, every
  // face-up swap priced card by card, the best declaration or a fold. Each declared hand also adds
  // its expectation over the hidden cards (fresh samples) — the same RTP with far less noise.
  const best = bestPolicy({ raiseN: 260, declN: 300, swapN: 10 });
  // the naive players don't price swaps (cheaper to simulate)
  const plain = bestPolicy({ raiseN: 200, declN: 240, swapN: 0 });

  it('best strategy returns 96–98%', () => {
    const r = simulate(9000, best, seededRng(2026), VN, 200, seededRng(77));
    // eslint-disable-next-line no-console
    console.log(
      `Vanunu best play: RTP ${(r.rtpExpected * 100).toFixed(2)}% (dealt ${(r.rtp * 100).toFixed(2)}%), ` +
        `raise ${VN.raiseFirst}× ${((r.raisedFirst / r.hands) * 100).toFixed(1)}% · ${VN.raiseSecond}× ${((r.raisedSecond / r.hands) * 100).toFixed(1)}%, ` +
        `swap ${((r.swaps / r.hands) * 100).toFixed(1)}%, fold ${((r.folds / r.hands) * 100).toFixed(1)}%, ` +
        `HIGH/LOW/BOTH ${r.decl.high}/${r.decl.low}/${r.decl.both}, BOTH won ${r.bothWins}, scoops ${r.scoops}, splits ${r.splits}`,
    );
    expect(r.rtpExpected).toBeGreaterThan(0.96);
    expect(r.rtpExpected).toBeLessThan(0.98);
    // the dealt results agree with the expectation (they are ~4× noisier)
    expect(Math.abs(r.rtp - r.rtpExpected)).toBeLessThan(0.025);
    // every decision matters: some raises at each point, some swaps, some folds, every declaration
    expect(r.raisedFirst).toBeGreaterThan(0);
    expect(r.raisedSecond).toBeGreaterThan(0);
    expect(r.swaps).toBeGreaterThan(0);
    expect(r.folds).toBeGreaterThan(0);
    expect(Math.min(r.decl.high, r.decl.low, r.decl.both)).toBeGreaterThan(0);
  }, 400_000);

  it('naive aggressive play stays under 100%', () => {
    const cases = {
      alwaysBoth: naivePolicy({ both: true }, plain),
      alwaysRaiseEarly: naivePolicy({ raiseEarly: true }, plain),
      alwaysSwapUp: naivePolicy({ swap: 'up' }, plain),
      alwaysSwapDown: naivePolicy({ swap: 'down' }, plain),
      everythingAtOnce: naivePolicy({ raiseEarly: true, both: true, swap: 'up' }, plain),
    };
    const rtps: Record<string, number> = {};
    for (const [name, pol] of Object.entries(cases)) {
      const r = simulate(3000, pol, seededRng(31), VN, 100, seededRng(32));
      rtps[name] = Math.round(r.rtpExpected * 1000) / 10;
      expect(r.rtpExpected).toBeLessThan(1);
    }
    // eslint-disable-next-line no-console
    console.log('Vanunu naive RTP %:', JSON.stringify(rtps));
  }, 400_000);

  it('a face-down swap changes nothing but the fee', () => {
    // the new card is as unknown as the old one: same decisions, same expected results
    const a = simulate(1500, plain, seededRng(5), VN, 100, seededRng(6));
    const b = simulate(1500, naivePolicy({ swap: 'down' }, plain), seededRng(5), VN, 100, seededRng(6));
    expect(b.expReturned).toBeCloseTo(a.expReturned, 6);
    expect(b.wagered - a.wagered).toBe(1500 * VN.swapDown);
    expect(b.rtpExpected).toBeLessThan(a.rtpExpected);
  }, 200_000);
});
