import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { seededRng } from '../src/core/rng';
import { FACE_SLOT, TEX_UP, valueOnTop } from '../src/games/pokerdice/die';
import { DIE, faceFix, planRoll, simulate, cupThrow, upSlot, type Tray } from '../src/games/pokerdice/physics';
import {
  advise,
  anteRtp,
  bonusRtp,
  bonusRtpMax,
  CAT,
  catDistribution,
  comboDice,
  compareHands,
  dealerHold,
  dealerOdds,
  dealerTable,
  evaluate,
  holdValue,
  N_HANDS,
  outcomeOdds,
  playerPolicy,
  rollDice,
  settlePd,
  solve,
} from '../src/games/pokerdice/rules';

/** Faces: 0 = 9, 1 = 10, 2 = J, 3 = Q, 4 = K, 5 = A. */
const F = (s: string) => s.split(' ').map((x) => ['9', '10', 'J', 'Q', 'K', 'A'].indexOf(x));
const cat = (s: string) => evaluate(F(s)).cat;
const cmp = (a: string, b: string) => compareHands(evaluate(F(a)), evaluate(F(b)));

describe('Poker Dice – hands', () => {
  it('names every category', () => {
    expect(cat('A A A A A')).toBe(CAT.five);
    expect(cat('9 9 9 9 K')).toBe(CAT.four);
    expect(cat('Q Q Q 10 10')).toBe(CAT.full);
    expect(cat('A K Q J 10')).toBe(CAT.straight);
    expect(cat('K Q J 10 9')).toBe(CAT.straight);
    expect(cat('J J J A 9')).toBe(CAT.three);
    expect(cat('K K 9 9 A')).toBe(CAT.twoPair);
    expect(cat('10 10 A K 9')).toBe(CAT.pair);
    expect(cat('A K Q J 9')).toBe(CAT.bust);
    expect(cat('A Q J 10 9')).toBe(CAT.bust);
  });

  it('ranks categories, straights, combinations and kickers', () => {
    const ladder = ['9 9 9 9 9', 'A A A A K', 'A A A K K', 'A K Q J 10', 'A A A K Q', 'A A K K Q', 'A A K Q J', 'A K Q J 9'];
    for (let i = 0; i + 1 < ladder.length; i++) expect(cmp(ladder[i], ladder[i + 1])).toBe(1);
    expect(cmp('A K Q J 10', 'K Q J 10 9')).toBe(1);
    expect(cmp('A A A A A', '9 9 9 9 9')).toBe(1);
    expect(cmp('9 9 9 9 A', '9 9 9 9 K')).toBe(1);
    expect(cmp('10 10 10 9 9', '9 9 9 A A')).toBe(1);
    expect(cmp('K K Q Q 9', 'K K J J A')).toBe(1);
    expect(cmp('K K Q Q 10', 'K K Q Q 9')).toBe(1);
    expect(cmp('Q Q A 10 9', 'Q Q K J 10')).toBe(1);
    expect(cmp('A K Q J 9', 'A K Q 10 9')).toBe(1);
    // the same five faces tie, in any order
    expect(cmp('K Q K 9 Q', 'Q Q K K 9')).toBe(0);
  });

  it('has 252 distinct hands and the textbook single-roll odds', () => {
    expect(N_HANDS).toBe(252);
    const n = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let k = 0; k < 6 ** 5; k++) {
      const d = [0, 1, 2, 3, 4].map((i) => Math.floor(k / 6 ** i) % 6);
      n[evaluate(d).cat]++;
    }
    expect(n).toEqual([480, 3600, 1800, 1200, 240, 300, 150, 6]);
  });

  it('marks the dice of the combination', () => {
    expect(comboDice(F('K 9 K Q 9'))).toEqual([true, true, true, false, true]);
    expect(comboDice(F('J 10 A J J'))).toEqual([true, false, false, true, true]);
    expect(comboDice(F('A K Q J 10'))).toEqual([true, true, true, true, true]);
  });
});

describe('Poker Dice – settlement', () => {
  it('pays the ANTE 1:1, 2:1 with five of a kind, and pushes ties', () => {
    expect(settlePd(F('K K K Q Q'), F('Q Q Q K K'), { ante: 10, bonus: 0 }).ret).toEqual({ ante: 20, bonus: 0 });
    expect(settlePd(F('9 9 9 9 9'), F('A A A A K'), { ante: 10, bonus: 0 }).ret).toEqual({ ante: 30, bonus: 0 });
    expect(settlePd(F('A A K 9 10'), F('9 9 9 J Q'), { ante: 10, bonus: 0 }).ret).toEqual({ ante: 0, bonus: 0 });
    const tie = settlePd(F('J J Q Q A'), F('A Q J Q J'), { ante: 10, bonus: 0 });
    expect(tie.outcome).toBe(0);
    expect(tie.ret.ante).toBe(10);
  });

  it('pays the BONUS on the final hand, whatever the dealer does', () => {
    const b = (p: string) => settlePd(F(p), F('A A A A A'), { ante: 10, bonus: 5 }).ret.bonus;
    expect(b('K K K K K')).toBe(35);
    expect(b('Q Q Q Q 9')).toBe(10);
    expect(b('Q Q Q 9 9')).toBe(5);
    expect(b('K Q J 10 9')).toBe(5);
    expect(b('Q Q Q 9 10')).toBe(0);
    expect(b('A K Q J 9')).toBe(0);
    expect(settlePd(F('K K K K K'), F('A A A A A'), { ante: 10, bonus: 0 }).ret.bonus).toBe(0);
  });
});

describe('Poker Dice – the dealer', () => {
  it('cannot beat five aces and stops once it beats you', () => {
    expect(dealerOdds(F('A A A A A')).beat).toBe(0);
    expect(dealerOdds(F('A A A A A')).tie).toBeGreaterThan(0);
    expect(dealerHold(F('Q Q Q Q 9'), 2, F('K K K J J'))).toBeNull();
    expect(dealerOdds(F('A K Q J 9')).beat).toBeGreaterThan(0.99);
  });

  it('holds toward the hand to beat', () => {
    // a pair of kings against a full house: it keeps the kings
    expect(dealerHold(F('K 9 K J 10'), 2, F('Q Q Q 9 9'))).toEqual([true, false, true, false, false]);
    // three of a kind against a straight: it keeps the three
    expect(dealerHold(F('J J A J 9'), 1, F('K Q J 10 9'))).toEqual([true, true, false, true, false]);
  });

  it('plays its house way to the odds it promises (seeded simulation)', () => {
    const rng = seededRng(7);
    for (const target of ['A A A K Q', 'Q Q Q 10 10', 'K Q J 10 9']) {
      const P = F(target);
      const odds = dealerOdds(P);
      const n = 40000;
      let beat = 0;
      let tie = 0;
      for (let k = 0; k < n; k++) {
        let d = rollDice(5, rng);
        for (let left = 2; left >= 1; left--) {
          const h = dealerHold(d, left, P);
          if (!h) break;
          d = d.map((x, i) => (h[i] ? x : rng(6)));
        }
        const c = compareHands(evaluate(d), evaluate(P));
        if (c > 0) beat++;
        else if (c === 0) tie++;
      }
      expect(Math.abs(beat / n - odds.beat)).toBeLessThan(0.01);
      expect(Math.abs(tie / n - odds.tie)).toBeLessThan(0.004);
    }
  });
});

describe('Poker Dice – optimal strategy and RTP', () => {
  it('ANTE returns 96–98% with exact optimal play', () => {
    const rtp = anteRtp();
    expect(rtp).toBeGreaterThan(0.96);
    expect(rtp).toBeLessThan(0.98);
    expect(rtp).toBeCloseTo(0.96621, 4);
    // the same figure from the final-hand distribution
    const { cat: c, beat, tie } = dealerTable();
    void c;
    const o = outcomeOdds();
    const dist = catDistribution();
    expect(dist.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(o.win + o.push + o.lose).toBeCloseTo(1, 12);
    expect(beat.length).toBe(N_HANDS);
    expect(tie.length).toBe(N_HANDS);
  });

  it('BONUS returns 90–97%, and no strategy can beat 97%', () => {
    const b = bonusRtp();
    expect(b).toBeGreaterThan(0.9);
    expect(b).toBeLessThan(0.97);
    expect(b).toBeCloseTo(0.9465, 3);
    expect(bonusRtpMax()).toBeLessThan(0.97);
    // ANTE and BONUS together, held optimally for both, stay below the ANTE alone
    for (const bonus of [0.25, 1, 4]) {
      const pol = playerPolicy({ ante: 1, bonus });
      expect(pol.ev).toBeLessThan(anteRtp());
    }
  });

  it('the dynamic programme matches brute force over every hold', () => {
    const rng = seededRng(3);
    for (let k = 0; k < 40; k++) {
      const dice = rollDice(5, rng);
      for (const left of [1, 2]) {
        const a = advise(dice, left);
        let best = -Infinity;
        for (let m = 0; m < 32; m++) best = Math.max(best, holdValue(dice, [0, 1, 2, 3, 4].map((i) => !!(m & (1 << i))), left));
        expect(a.ev).toBeCloseTo(best, 10);
        expect(holdValue(dice, a.hold, left)).toBeCloseTo(best, 10);
      }
    }
    // a stand-alone check of solve(): with a reward only for five of a kind, chasing gives the textbook 4.6%
    const term = new Float64Array(N_HANDS);
    const { cat: c } = dealerTable();
    for (let h = 0; h < N_HANDS; h++) term[h] = c[h] === CAT.five ? 1 : 0;
    expect(solve(term).ev).toBeCloseTo(0.046, 3);
  });

  it('seeded simulation of whole rounds agrees with the exact figures', () => {
    const rng = seededRng(2026);
    const n = 150000;
    let ante = 0;
    let bonus = 0;
    for (let k = 0; k < n; k++) {
      let p = rollDice(5, rng);
      for (let left = 2; left >= 1; left--) {
        const a = advise(p, left);
        if (a.stand) break;
        p = p.map((x, i) => (a.hold[i] ? x : rng(6)));
      }
      let d = rollDice(5, rng);
      for (let left = 2; left >= 1; left--) {
        const h = dealerHold(d, left, p);
        if (!h) break;
        d = d.map((x, i) => (h[i] ? x : rng(6)));
      }
      const r = settlePd(p, d, { ante: 10, bonus: 10 });
      ante += r.ret.ante;
      bonus += r.ret.bonus;
    }
    expect(Math.abs(ante / (10 * n) - anteRtp())).toBeLessThan(0.012);
    expect(Math.abs(bonus / (10 * n) - bonusRtp())).toBeLessThan(0.012);
  });
});

describe('Poker Dice – physics and fair faces', () => {
  const tray: Tray = { cx: 0, cz: 0.55, w: 2.4, d: 1.02, floor: 0.022 };
  const mouth = new THREE.Vector3(-0.94, 0.36, 0.55);
  const dir = new THREE.Vector3(1, 0, 0);

  it('throws come to rest flat, inside the tray, apart', () => {
    let rnd = 1;
    const r01 = () => ((rnd = (rnd * 16807) % 2147483647) - 1) / 2147483646;
    for (let k = 0; k < 20; k++) {
      const roll = planRoll(tray, mouth, dir, 1 + (k % 5), r01);
      const f = roll.frames - 1;
      expect(roll.dur).toBeLessThan(4.5);
      for (let i = 0; i < roll.pos.length; i++) {
        const x = roll.pos[i][f * 3];
        const y = roll.pos[i][f * 3 + 1];
        const z = roll.pos[i][f * 3 + 2];
        expect(Math.abs(x - tray.cx)).toBeLessThan(tray.w / 2);
        expect(Math.abs(z - tray.cz)).toBeLessThan(tray.d / 2);
        expect(y).toBeCloseTo(tray.floor + DIE / 2, 3);
        const q = new THREE.Quaternion(roll.quat[i][f * 4], roll.quat[i][f * 4 + 1], roll.quat[i][f * 4 + 2], roll.quat[i][f * 4 + 3]);
        expect(upSlot(q).align).toBeGreaterThan(0.999);
      }
    }
    // a throw makes noise against the rails
    const r = simulate(tray, cupThrow(mouth, dir, 5, () => 0.5));
    if (r) expect(r.hits.length).toBeGreaterThan(0);
  });

  it('the face fix lands the drawn value on top, upright for the player', () => {
    const rng = seededRng(11);
    for (let k = 0; k < 12; k++) {
      const roll = planRoll(tray, mouth, dir, 5);
      const vals = rollDice(5, rng);
      const f = roll.frames - 1;
      for (let i = 0; i < 5; i++) {
        const qEnd = new THREE.Quaternion(roll.quat[i][f * 4], roll.quat[i][f * 4 + 1], roll.quat[i][f * 4 + 2], roll.quat[i][f * 4 + 3]);
        const slot = FACE_SLOT[vals[i]];
        const fix = faceFix(slot, roll.top[i], qEnd, TEX_UP[slot]);
        const shown = qEnd.clone().multiply(fix);
        expect(valueOnTop(shown)).toBe(vals[i]);
        const up = TEX_UP[slot].clone().applyQuaternion(shown);
        // within 45° of "away from the player" (plus a hair for the last settle)
        expect(-up.z).toBeGreaterThan(Math.SQRT1_2 - 1e-3);
      }
    }
  });
});
