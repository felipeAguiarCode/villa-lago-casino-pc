import { describe, expect, it } from 'vitest';
import { parseCard, rankOf, type Card } from '../src/core/cards';
import { seededRng } from '../src/core/rng';
import { HL, HlDeck, hlBoard, hlResult, hlRtp, multiplier, settleHl, sideCounts } from '../src/games/highlow/rules';

const allBut = (...out: Card[]) => Array.from({ length: 52 }, (_, i) => i).filter((c) => !out.includes(c));

describe('High & Low rules', () => {
  it('aces are high and ties are SAME', () => {
    expect(hlResult(parseCard('7h'), parseCard('Ks'))).toBe('high');
    expect(hlResult(parseCard('7h'), parseCard('2s'))).toBe('low');
    expect(hlResult(parseCard('7h'), parseCard('7c'))).toBe('same');
    expect(hlResult(parseCard('Kh'), parseCard('As'))).toBe('high');
    expect(hlResult(parseCard('2h'), parseCard('As'))).toBe('high');
  });

  it('multiplier = floor(0.95 / P × 20) / 20, computed exactly', () => {
    // 7 on a fresh deck: 28 higher, 20 lower, 3 sevens among 51
    const left = allBut(parseCard('7h'));
    expect(sideCounts(parseCard('7h'), left)).toEqual({ high: 28, low: 20, same: 3, n: 51 });
    expect(multiplier(28, 51)).toBe(Math.floor((0.95 / (28 / 51)) * 20 + 1e-9) / 20); // 1.70
    expect(multiplier(28, 51)).toBe(1.7);
    expect(multiplier(20, 51)).toBe(2.4);
    // P = 1/2 must give exactly 1.90 (no floating-point loss)
    expect(multiplier(1, 2)).toBe(1.9);
    expect(multiplier(0, 51)).toBe(0);
  });

  it('closes the side that cannot win and the one that cannot pay the stake back', () => {
    const ace = parseCard('Ah');
    const b = hlBoard(ace, allBut(ace));
    expect(b.high).toBe(0);
    expect(b.low).toBe(1);
    expect(b.same).toBe(12);
    const two = parseCard('2c');
    expect(hlBoard(two, allBut(two)).low).toBe(0);
    // a 2 with no other 2 left: HIGH is certain, m would be 0.95 → closed; SAME closed too
    const left = allBut(0, 13, 26, 39).slice(0, 30);
    const late = hlBoard(two, left);
    expect(late).toEqual({ high: 0, low: 0, same: 0 });
  });

  it('a bet on a closed side returns nothing and winners are paid stake × multiplier', () => {
    const cur = parseCard('7h');
    const board = hlBoard(cur, allBut(cur));
    expect(settleHl(cur, parseCard('Ks'), { high: 25, low: 10 }, board).ret).toEqual({ high: 42.5, low: 0, same: 0 });
    expect(settleHl(cur, parseCard('3s'), { high: 25, low: 10 }, board).ret).toEqual({ high: 0, low: 24, same: 0 });
    // a tie loses HIGH and LOW, SAME pays 11:1
    expect(settleHl(cur, parseCard('7c'), { high: 25, low: 10, same: 5 }, board).ret).toEqual({ high: 0, low: 0, same: 60 });
    expect(settleHl(cur, parseCard('Ks'), { high: 25 }, { high: 0, low: 1, same: 12 }).ret.high).toBe(0);
  });

  it('every HIGHER / LOWER bet returns at most 95% on a fresh deck, for every card', () => {
    for (let r = 2; r <= 14; r++) {
      const cur = (r - 2) as Card;
      const rtp = hlRtp(cur, allBut(cur));
      expect(rtp.high).toBeLessThanOrEqual(0.95 + 1e-12);
      expect(rtp.low).toBeLessThanOrEqual(0.95 + 1e-12);
      // the open sides stay close to 95% (the 0.05 rounding costs a little)
      if (rtp.high > 0 && r > 2) expect(rtp.high).toBeGreaterThan(0.9);
      if (rtp.low > 0 && r < 14) expect(rtp.low).toBeGreaterThan(0.9);
      expect(rtp.same).toBeCloseTo((12 * 3) / 51, 12);
    }
  });

  it('RTP ≤ 95% in every deck state of a long seeded session (exact per round)', () => {
    const rng = seededRng(2024);
    const deck = new HlDeck(rng);
    let cur = deck.draw();
    let hiLo = 0;
    let hiLoN = 0;
    let same = 0;
    let sameN = 0;
    let sameOver = 0;
    let rounds = 0;
    for (let i = 0; i < 60_000; i++) {
      if (deck.needsShuffle(cur)) deck.reshuffle([cur]);
      expect(deck.remaining).toBeGreaterThanOrEqual(HL.reshuffleBelow);
      const rtp = hlRtp(cur, deck.left);
      expect(rtp.high).toBeLessThanOrEqual(0.95 + 1e-12);
      expect(rtp.low).toBeLessThanOrEqual(0.95 + 1e-12);
      // a player betting the more likely open side every round
      const k = sideCounts(cur, deck.left);
      const side = hlBoard(cur, deck.left).high && (k.high >= k.low || !hlBoard(cur, deck.left).low) ? 'high' : 'low';
      if (rtp[side] > 0) {
        hiLo += rtp[side];
        hiLoN++;
      }
      if (rtp.same > 0) {
        same += rtp.same;
        sameN++;
        if (rtp.same > 1) sameOver++;
      }
      rounds++;
      cur = deck.draw();
    }
    const hl = hiLo / hiLoN;
    const sm = same / sameN;
    expect(hl).toBeLessThanOrEqual(0.95);
    expect(hl).toBeGreaterThan(0.9);
    expect(sm).toBeLessThan(0.8);
    console.log(`High & Low: HIGH/LOW avg RTP ${(hl * 100).toFixed(2)}%, SAME avg RTP ${(sm * 100).toFixed(2)}% (above 100% in ${((sameOver / rounds) * 100).toFixed(2)}% of rounds)`);
  });

  it('simulated money: betting the likely side and SAME, with real draws', () => {
    const rng = seededRng(77);
    const deck = new HlDeck(rng);
    let cur = deck.draw();
    let wager = 0;
    let back = 0;
    let sWager = 0;
    let sBack = 0;
    for (let i = 0; i < 200_000; i++) {
      if (deck.needsShuffle(cur)) deck.reshuffle([cur]);
      const board = hlBoard(cur, deck.left);
      const k = sideCounts(cur, deck.left);
      const side = board.high && (k.high >= k.low || !board.low) ? 'high' : 'low';
      const next = deck.draw();
      if (board[side]) {
        wager += 10;
        back += settleHl(cur, next, { [side]: 10 }, board).ret[side];
      }
      if (board.same) {
        sWager += 10;
        sBack += settleHl(cur, next, { same: 10 }, board).ret.same;
      }
      cur = next;
    }
    expect(back / wager).toBeLessThan(0.955);
    expect(back / wager).toBeGreaterThan(0.9);
    expect(sBack / sWager).toBeLessThan(0.85);
  });

  it('the deck keeps the table card out and reshuffles under 12 cards', () => {
    const deck = new HlDeck(seededRng(5));
    const cur = deck.draw();
    deck.reshuffle([cur]);
    expect(deck.remaining).toBe(51);
    expect(deck.left).not.toContain(cur);
    const seen = new Set<Card>();
    while (deck.remaining >= 12) seen.add(deck.draw());
    expect(seen.size).toBe(40);
    expect(seen.has(cur)).toBe(false);
    expect(deck.remaining).toBe(11);
    expect(deck.needsShuffle(cur)).toBe(true);
    expect(deck.left.every((c) => rankOf(c) >= 2 && rankOf(c) <= 14)).toBe(true);
  });
});
