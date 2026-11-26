import { describe, expect, it } from 'vitest';
import { parseCard } from '../src/core/cards';
import { seededRng } from '../src/core/rng';
import { drawRb, rbRtp, rbWinners, RB_SPOTS, settleRb, shuffleRb } from '../src/games/redblack/rules';

describe('Red or Black rules', () => {
  it('a 54-card deck: 52 cards and two Jokers, shuffled with Fisher–Yates', () => {
    const d = shuffleRb(seededRng(3));
    expect(d).toHaveLength(54);
    expect(new Set(d).size).toBe(54);
    expect(Math.min(...d)).toBe(0);
    expect(Math.max(...d)).toBe(53);
  });

  it('colour and suit winners', () => {
    expect(rbWinners(parseCard('Qh'))).toEqual(['red', 'hearts']);
    expect(rbWinners(parseCard('2d'))).toEqual(['red', 'diamonds']);
    expect(rbWinners(parseCard('As'))).toEqual(['black', 'spades']);
    expect(rbWinners(parseCard('9c'))).toEqual(['black', 'clubs']);
    expect(rbWinners(52)).toEqual([]);
    expect(rbWinners(53)).toEqual([]);
  });

  it('pays 1:1 on colour, 3:1 on suit; a Joker beats every bet', () => {
    const bets = { red: 10, black: 10, hearts: 5, diamonds: 5, clubs: 5, spades: 5 };
    expect(settleRb(parseCard('Qh'), bets)).toEqual({ red: 20, black: 0, hearts: 20, diamonds: 0, clubs: 0, spades: 0 });
    expect(settleRb(parseCard('9c'), bets)).toEqual({ red: 0, black: 20, hearts: 0, diamonds: 0, clubs: 20, spades: 0 });
    expect(settleRb(53, bets)).toEqual({ red: 0, black: 0, hearts: 0, diamonds: 0, clubs: 0, spades: 0 });
  });

  it('exact RTP: 26/54 × 2 and 13/54 × 4 = 96.30%', () => {
    expect(rbRtp('red')).toBe((26 / 54) * 2);
    expect(rbRtp('black')).toBe((26 / 54) * 2);
    for (const s of ['hearts', 'diamonds', 'clubs', 'spades'] as const) expect(rbRtp(s)).toBe((13 / 54) * 4);
    expect(rbRtp('red')).toBeCloseTo(0.962963, 6);
    expect(rbRtp('hearts')).toBeCloseTo(0.962963, 6);
  });

  it('simulated RTP with a seeded rng (reshuffle every round)', () => {
    const rng = seededRng(11);
    const back: Record<string, number> = {};
    const N = 300_000;
    for (let i = 0; i < N; i++) {
      const c = drawRb(rng);
      const r = settleRb(c, { red: 1, black: 1, hearts: 1, diamonds: 1, clubs: 1, spades: 1 });
      for (const s of RB_SPOTS) back[s] = (back[s] ?? 0) + r[s];
    }
    for (const s of RB_SPOTS) expect(back[s] / N).toBeCloseTo(0.963, 1);
    const col = (back.red + back.black) / (2 * N);
    const suit = (back.hearts + back.diamonds + back.clubs + back.spades) / (4 * N);
    expect(Math.abs(col - 0.963)).toBeLessThan(0.006);
    expect(Math.abs(suit - 0.963)).toBeLessThan(0.008);
  });

  it('every card is equally likely to come out', () => {
    const rng = seededRng(99);
    const n = new Array(54).fill(0);
    for (let i = 0; i < 108_000; i++) n[drawRb(rng)]++;
    for (const k of n) expect(Math.abs(k - 2000)).toBeLessThan(220);
  });
});
