import { describe, expect, it } from 'vitest';
import { isJoker, suitOf, type Card } from '../src/core/cards';
import { seededRng, type Rng } from '../src/core/rng';
import { dealPn, numberCard, numberOf, PN, PN_JOKER, pnRtp, settlePn } from '../src/games/picknum/rules';

/** An rng whose first answers are scripted; the rest come from a seeded generator. */
function scripted(first: number[], seed: number): Rng {
  const rest = seededRng(seed);
  let i = 0;
  return (n: number) => (i < first.length ? first[i++] % n : rest(n));
}

describe('Pick a Number rules', () => {
  it('Ace counts as 1, 2..10 as printed', () => {
    expect(numberOf(numberCard(1, 0))).toBe(1);
    expect(numberOf(numberCard(10, 3))).toBe(10);
    expect(numberOf(PN_JOKER)).toBe(0);
  });

  it('builds a valid row: one match in a random place, four other different numbers', () => {
    const rng = seededRng(42);
    const places = new Array(5).fill(0);
    let jokers = 0;
    for (let i = 0; i < 20_000; i++) {
      const L = dealPn(rng);
      const tn = numberOf(L.target);
      expect(tn).toBeGreaterThanOrEqual(1);
      expect(tn).toBeLessThanOrEqual(10);
      expect(L.row).toHaveLength(5);
      const all: Card[] = [L.target, ...L.row];
      expect(new Set(all).size).toBe(6);
      const matches = L.row.map((c, k) => (numberOf(c) === tn ? k : -1)).filter((k) => k >= 0);
      const nums = L.row.filter((c) => !isJoker(c)).map(numberOf);
      expect(new Set(nums).size).toBe(nums.length);
      for (const n of nums) expect(n >= 1 && n <= 10).toBe(true);
      if (L.joker) {
        jokers++;
        expect(matches).toEqual([]);
        expect(L.match).toBe(-1);
        expect(L.row.filter(isJoker)).toHaveLength(1);
      } else {
        expect(matches).toEqual([L.match]);
        expect(suitOf(L.row[L.match])).not.toBe(suitOf(L.target));
        expect(L.row.some(isJoker)).toBe(false);
        places[L.match]++;
      }
    }
    expect(Math.abs(jokers / 20_000 - 0.05)).toBeLessThan(0.008);
    for (const p of places) expect(Math.abs(p / 20_000 - 0.19)).toBeLessThan(0.012);
  });

  it('pays 4:1 under the matching card only', () => {
    const L = dealPn(scripted([1, 2], 7));
    expect(L.joker).toBe(false);
    expect(L.match).toBe(2);
    expect(settlePn(L, [10, 10, 10, 10, 10])).toEqual([0, 0, 50, 0, 0]);
    expect(settlePn(L, [0, 0, 0, 25, 0])).toEqual([0, 0, 0, 0, 0]);
    const J = dealPn(scripted([0, 4], 7));
    expect(J.joker).toBe(true);
    expect(J.row[4]).toBe(PN_JOKER);
    expect(settlePn(J, [10, 10, 10, 10, 10])).toEqual([0, 0, 0, 0, 0]);
  });

  it('exact RTP = 95%: every (Joker, place) draw enumerated', () => {
    expect(pnRtp()).toBeCloseTo(0.95, 12);
    for (let bet = 0; bet < PN.slots; bet++) {
      let back = 0;
      let n = 0;
      for (let j = 0; j < PN.jokerOneIn; j++)
        for (let p = 0; p < PN.slots; p++) {
          const L = dealPn(scripted([j, p], j * 10 + p));
          const bets = [0, 0, 0, 0, 0];
          bets[bet] = 1;
          back += settlePn(L, bets)[bet];
          n++;
        }
      // 19 winning layouts out of 100, each paying ×5
      expect(back / n).toBeCloseTo(0.95, 12);
    }
  });

  it('simulated RTP ≈ 95% with a seeded rng', () => {
    const rng = seededRng(123);
    let wager = 0;
    let back = 0;
    for (let i = 0; i < 400_000; i++) {
      const L = dealPn(rng);
      const bets = [0, 0, 0, 0, 0];
      bets[i % 5] = 5;
      if (i % 7 === 0) bets[(i + 2) % 5] = 5;
      wager += bets.reduce((a, b) => a + b, 0);
      back += settlePn(L, bets).reduce((a, b) => a + b, 0);
    }
    expect(Math.abs(back / wager - 0.95)).toBeLessThan(0.008);
  });
});
