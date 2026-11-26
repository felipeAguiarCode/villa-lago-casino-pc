import { describe, expect, it } from 'vitest';
import { parseCard, parseCards } from '../src/core/cards';
import { bestOf } from '../src/core/eval5';
import { seededRng } from '../src/core/rng';
import { exactReturn, HS, HS_ROWS, HS_SEVEN, HS_STRIPS, hsPays, playEV, SEVEN_CARD_HANDS, shouldPlay, startClass, stopsFor } from '../src/games/holdemslots/rules';
import { BOARDS, START_COUNTS } from '../src/games/holdemslots/startingHands';

/** Seven-card category totals (Cat5 order): the textbook numbers out of C(52,7). */
const SEVEN = [23294460, 58627800, 31433400, 6461620, 6180020, 4047644, 3473184, 224848, 37260, 4324];

const weight = (name: string) => (name.length === 2 ? 6 : name.endsWith('s') ? 4 : 12);

describe("Hold'em Slots: the starting-hand table", () => {
  it('has the 169 starting hands, each over every board', () => {
    const names = Object.keys(START_COUNTS);
    expect(names).toHaveLength(169);
    expect(names.reduce((s, n) => s + weight(n), 0)).toBe(1326);
    for (const n of names) expect(START_COUNTS[n].reduce((a, b) => a + b, 0), n).toBe(BOARDS);
  });

  it('adds up to every seven-card hand, 21 times each', () => {
    const tot = new Array(10).fill(0);
    for (const [n, c] of Object.entries(START_COUNTS)) c.forEach((v, i) => (tot[i] += v * weight(n)));
    expect(tot.map((v) => v / 21)).toEqual(SEVEN);
    expect(SEVEN.reduce((a, b) => a + b, 0)).toBe(SEVEN_CARD_HANDS);
    expect(HS_SEVEN).toEqual(HS_ROWS.map((r) => SEVEN[r.cat]));
  });

  it('agrees with the game evaluator on sampled boards', () => {
    const rng = seededRng(42);
    for (const hole of ['As Ks', '7h 2c', '9d 9s']) {
      const h = parseCards(hole);
      const rest = Array.from({ length: 52 }, (_, i) => i).filter((c) => !h.includes(c));
      const n = 12000;
      const seen = new Array(10).fill(0);
      for (let k = 0; k < n; k++) {
        const deck = [...rest];
        const board: number[] = [];
        for (let j = 0; j < 5; j++) board.push(deck.splice(rng(deck.length), 1)[0]);
        seen[bestOf([...h, ...board]).cat]++;
      }
      const exact = START_COUNTS[startClass(h[0], h[1])];
      for (let cat = 0; cat < 10; cat++) {
        const p = exact[cat] / BOARDS;
        const sd = Math.sqrt((p * (1 - p)) / n);
        expect(Math.abs(seen[cat] / n - p), `${hole} cat ${cat}`).toBeLessThan(5 * sd + 1e-3);
      }
    }
  });
});

describe("Hold'em Slots: rules", () => {
  it('names starting hands', () => {
    expect(startClass(parseCard('As'), parseCard('Ks'))).toBe('AKs');
    expect(startClass(parseCard('Kd'), parseCard('Ah'))).toBe('AKo');
    expect(startClass(parseCard('Td'), parseCard('Th'))).toBe('TT');
    expect(startClass(parseCard('9c'), parseCard('Tc'))).toBe('T9s');
    expect(startClass(parseCard('2c'), parseCard('7d'))).toBe('72o');
  });

  it('pays the whole bet on the best five of seven', () => {
    // ante 10: the bet is 10 + 40
    expect(hsPays(parseCards('As Ks Qs Js Ts 2d 3c'), 10)).toBe(500 * 50);
    expect(hsPays(parseCards('Ah Kd 9c 9h 5s 5d 2c'), 10)).toBe(50); // two pair: the bet back
    expect(hsPays(parseCards('Ah Kd 9c 9h 5s 3d 2c'), 10)).toBe(0); // a pair does not pay
    expect(hsPays(parseCards('7h 7d 7c 2s 2h Kd 4c'), 10)).toBe(7 * 50); // full house
  });

  it('plays the strong hands and folds the weak ones', () => {
    expect(shouldPlay(parseCard('Ah'), parseCard('Ad'))).toBe(true);
    expect(shouldPlay(parseCard('As'), parseCard('Ks'))).toBe(true);
    expect(shouldPlay(parseCard('7h'), parseCard('2c'))).toBe(false);
    expect(shouldPlay(parseCard('Kh'), parseCard('2c'))).toBe(false);
    expect(playEV(parseCard('Th'), parseCard('Td'))).toBeGreaterThan(playEV(parseCard('Ah'), parseCard('Kd')));
  });

  it('returns 97.7 % folding as the hint does', () => {
    const r = exactReturn();
    expect(r.optimal).toBeCloseTo(HS.rtp, 4);
    expect(r.always).toBeCloseTo(HS.alwaysRtp, 4);
    expect(r.optimal).toBeGreaterThan(0.95);
    expect(r.optimal).toBeLessThan(0.99);
    expect(r.playRate).toBeGreaterThan(0.65);
    expect(r.playRate).toBeLessThan(0.78);
  });

  it('has seven reel strips of the 52 cards', () => {
    expect(HS_STRIPS).toHaveLength(HS.reels);
    for (const s of HS_STRIPS) expect([...s].sort((a, b) => a - b)).toEqual(Array.from({ length: 52 }, (_, i) => i));
    const deal = parseCards('As Kd 2c 3h 9s Td Jc');
    stopsFor(deal).forEach((stop, i) => expect(HS_STRIPS[i][stop]).toBe(deal[i]));
  });
});
