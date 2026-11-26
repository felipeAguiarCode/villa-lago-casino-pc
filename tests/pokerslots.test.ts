import { describe, expect, it } from 'vitest';
import { parseCards } from '../src/core/cards';
import { seededRng } from '../src/core/rng';
import { cardAt, PS, PS_ROWS, psPays, psRow, psRow4, spinStops, STRIPS } from '../src/games/pokerslots/rules';
import { DOT_FONT } from '../src/games/pokerslots/marquee';
import { exactRtp } from '../src/games/pokerslots/sim';
import { heldEV, holdAdvice } from '../src/games/pokerslots/strategy';

const row = (codes: string) => psRow(parseCards(codes));
const key = (codes: string) => {
  const r = row(codes);
  return r < 0 ? null : PS_ROWS[r].key;
};

describe('Poker Slots: hands', () => {
  it('ranks four-card hands', () => {
    expect(key('Jh Qh Kh Ah')).toBe('royal');
    expect(key('Ah Kh Jh Qh')).toBe('royal');
    expect(key('Ac 2c 3c 4c')).toBe('straightFlush');
    expect(key('6s 7s 8s 9s')).toBe('straightFlush');
    expect(key('9h 9s 9d 9c')).toBe('quads');
    expect(key('9h 9h 9h 9h')).toBe('quads');
    expect(key('7d 8s 9h Tc')).toBe('straight');
    expect(key('Ad 2s 3h 4c')).toBe('straight');
    expect(key('Jd Qs Kh Ac')).toBe('straight');
    expect(key('Kd As 2h 3c')).toBe(null); // no wrap-around
    expect(key('2c 6c 9c Kc')).toBe('flush');
    expect(key('7h 7h 7h Kh')).toBe('flush'); // repeats are possible on independent reels
    expect(key('Qs Qh Qd 3c')).toBe('trips');
    expect(key('8c 8d 5h 5s')).toBe('twoPair');
    expect(key('Jc Jh 4d 9s')).toBe('jacks');
    expect(key('Ac 7h Ad 2s')).toBe('jacks');
    expect(key('Tc Th 4d 9s')).toBe(null);
    expect(key('2c 5h 9d Ks')).toBe(null);
  });

  it('counts every line of 52^4 exactly', () => {
    const counts = new Array(PS_ROWS.length).fill(0);
    for (let a = 0; a < 52; a++)
      for (let b = 0; b < 52; b++)
        for (let c = 0; c < 52; c++)
          for (let d = 0; d < 52; d++) {
            const r = psRow4(a, b, c, d);
            if (r >= 0) counts[r]++;
          }
    expect(counts).toEqual([96, 960, 3328, 66528, 113136, 157248, 117936, 798336]);
  });

  it('pays per coin, stake included', () => {
    expect(psPays(parseCards('Jh Qh Kh Ah'), 5)).toBe(5000);
    expect(psPays(parseCards('Jc Jh 4d 9s'), 3)).toBe(6);
    expect(psPays(parseCards('2c 5h 9d Ks'), 5)).toBe(0);
  });
});

describe('Poker Slots: dot-matrix font', () => {
  it('every glyph is 5 × 7 dots', () => {
    for (const [ch, bits] of Object.entries(DOT_FONT)) expect(bits, ch).toMatch(/^[01]{35}$/);
    // the machine's messages only use glyphs it has (accents are dropped)
    for (const ch of 'POKER SLOTS ♥♦♠♣ 0123456789 .,:!?-+×') expect(DOT_FONT[ch], ch).toBeDefined();
  });
});

describe('Poker Slots: reels', () => {
  it('every reel is a strip of the 52 cards', () => {
    expect(STRIPS).toHaveLength(PS.reels);
    for (const s of STRIPS) expect([...s].sort((x, y) => x - y)).toEqual(Array.from({ length: 52 }, (_, i) => i));
    // four different orders
    expect(new Set(STRIPS.map((s) => s.join(','))).size).toBe(4);
    expect(cardAt(0, 52)).toBe(cardAt(0, 0));
    expect(cardAt(2, -1)).toBe(STRIPS[2][51]);
  });

  it('held reels keep their stop', () => {
    const rng = seededRng(7);
    for (let k = 0; k < 50; k++) {
      const next = spinStops([3, 9, 27, 40], [true, false, true, false], rng);
      expect(next[0]).toBe(3);
      expect(next[2]).toBe(27);
      expect(next[1]).toBeGreaterThanOrEqual(0);
      expect(next[3]).toBeLessThan(52);
    }
  });
});

describe('Poker Slots: holds and return', () => {
  it('values held cards exactly', () => {
    // three to a royal, the fourth reel uniform: the ace of hearts makes the royal, the ten of
    // hearts the straight flush, the 11 other hearts a flush (a repeated J/Q/K included), the six
    // off-suit tens and aces a straight, the nine off-suit J, Q, K a pair of Jacks or better
    const ev = heldEV(parseCards('Jh Qh Kh'));
    expect(ev).toBeCloseTo((1000 + 150 + 11 * 10 + 6 * 12 + 9 * 2) / 52, 5);
    // order does not matter
    expect(heldEV(parseCards('Kh Jh Qh'))).toBe(ev);
  });

  it('the hint holds what pays best', () => {
    const adv = holdAdvice(parseCards('Jh Qh Kh 2c'));
    expect(adv.held).toEqual([true, true, true, false]);
    const pair = holdAdvice(parseCards('9s 4d 9h 2c'));
    expect(pair.held).toEqual([true, false, true, false]);
    expect(pair.ev).toBeGreaterThan(PS.rtp);
    // never more than three reels
    for (const l of ['As Ad Ac 2h', '5c 6c 7c 9c', 'Ts Js Qs 2d']) expect(holdAdvice(parseCards(l)).held.filter(Boolean).length).toBeLessThanOrEqual(3);
  });

  it('returns 97.4 % with the best holds and 79.5 % without', () => {
    const r = exactRtp();
    expect(r.base).toBeCloseTo(PS.baseRtp, 4);
    expect(r.rtp).toBeCloseTo(PS.rtp, 4);
    expect(r.rtp).toBeGreaterThan(0.95);
    expect(r.rtp).toBeLessThan(0.99);
    expect(exactRtp(0).rtp).toBeCloseTo(r.base, 6);
  }, 60000);
});
