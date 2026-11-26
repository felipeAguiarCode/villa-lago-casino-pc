import { describe, expect, it } from 'vitest';
import { seededRng } from '../src/core/rng';
import { planRace } from '../src/games/horses/race';
import { LAP, laneR, R_OUT, surfaceY, TR, trackAt } from '../src/games/horses/track';
import { bookRace, finishOrder, formChances, HORSES, HR, newRace, pickWinner, priceOf, raceCover, settleRace } from '../src/games/horses/rules';

describe('Lucky Horses book', () => {
  it('chances sum to 1, the favourite is capped and every price follows the formula', () => {
    const rng = seededRng(7);
    let minR = 1;
    let maxR = 0;
    for (let k = 0; k < 20000; k++) {
      const race = newRace(rng);
      const sum = race.p.reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1)).toBeLessThan(1e-12);
      expect(Math.max(...race.p)).toBeLessThanOrEqual(0.5);
      race.p.forEach((p, i) => {
        const m = race.mult[i];
        expect(m).toBe(Math.max(1.5, Math.floor((0.95 / p) * 2) / 2));
        expect(m).toBe(priceOf(p));
        expect(m * 2).toBe(Math.round(m * 2));
        expect(m).toBeGreaterThanOrEqual(HR.minMult);
        // every bet of every race returns at most 95%
        expect(p * m).toBeLessThanOrEqual(0.95 + 1e-12);
        minR = Math.min(minR, p * m);
        maxR = Math.max(maxR, p * m);
      });
      race.form.forEach((f) => {
        expect(f).toBeGreaterThanOrEqual(1);
        expect(f).toBeLessThanOrEqual(5);
      });
    }
    expect(maxR).toBeLessThanOrEqual(0.95);
    expect(minR).toBeGreaterThan(0.92);
  });

  it('better form means a shorter price', () => {
    const race = bookRace([5, 4, 3, 2, 1]);
    for (let i = 1; i < 5; i++) expect(race.mult[i]).toBeGreaterThan(race.mult[i - 1]);
    for (let i = 1; i < 5; i++) expect(race.p[i]).toBeLessThan(race.p[i - 1]);
    const est = formChances([5, 4, 3, 2, 1]);
    // the book stays close to the form's chances
    race.p.forEach((p, i) => expect(Math.abs(p - est[i])).toBeLessThan(0.05));
    const even = bookRace([3, 3, 3, 3, 3]);
    even.p.forEach((p) => expect(Math.abs(p - 0.2)).toBeLessThan(0.02));
  });

  it('winner frequencies match p', () => {
    const rng = seededRng(99);
    const race = bookRace([4.6, 2.1, 3.3, 1.4, 3.9]);
    const n = 400000;
    const hits = new Array(5).fill(0);
    for (let k = 0; k < n; k++) hits[pickWinner(race, rng)]++;
    hits.forEach((h, i) => expect(Math.abs(h / n - race.p[i])).toBeLessThan(0.004));
  });

  it('finish order: the winner first, then everyone once, weighted by p', () => {
    const rng = seededRng(3);
    const race = bookRace([5, 1, 1, 1, 1]);
    let favSecond = 0;
    for (let k = 0; k < 20000; k++) {
      const w = pickWinner(race, rng);
      const o = finishOrder(race, w, rng);
      expect(o[0]).toBe(w);
      expect([...o].sort()).toEqual([0, 1, 2, 3, 4]);
      if (w !== 0 && o[1] === 0) favSecond++;
    }
    // when the favourite doesn't win it is usually second
    expect(favSecond).toBeGreaterThan(20000 * 0.25);
  });

  it('settles: the winner returns floor(stake × m), the rest lose; the cover is the winnings', () => {
    const race = bookRace([3.2, 4.1, 2.2, 1.5, 3.8]);
    const bets = { h1: 25, h2: 10, h3: 0, h4: 5, h5: 100 };
    const ret = settleRace(bets, race, 1);
    expect(ret.h2).toBe(Math.floor(10 * race.mult[1]));
    expect(ret.h1).toBe(0);
    expect(ret.h3).toBe(0);
    expect(ret.h4).toBe(0);
    expect(ret.h5).toBe(0);
    expect(10 + raceCover(10, race.mult[1])).toBe(ret.h2);
    expect(HORSES.length).toBe(5);
  });

  it('simulated RTP is at most 95% and close to it', () => {
    const rng = seededRng(2024);
    const n = 300000;
    let wager = 0;
    let back = 0;
    let exact = 0;
    const perHorse = new Array(5).fill(0);
    const perHorseBack = new Array(5).fill(0);
    for (let k = 0; k < n; k++) {
      const race = newRace(rng);
      // a bettor who spreads 20 on every horse, and one who backs a random horse
      const bets: Record<string, number> = {};
      HORSES.forEach((h) => (bets[h.id] = 20));
      const w = pickWinner(race, rng);
      const ret = settleRace(bets, race, w);
      wager += 100;
      back += Object.values(ret).reduce((a, b) => a + b, 0);
      exact += race.p.reduce((a, p, i) => a + p * Math.floor(20 * race.mult[i]), 0);
      const pick = rng(5);
      perHorse[pick] += 20;
      if (pick === w) perHorseBack[pick] += Math.floor(20 * race.mult[pick]);
    }
    const sim = back / wager;
    const ex = exact / wager;
    expect(ex).toBeLessThanOrEqual(0.95);
    expect(ex).toBeGreaterThan(0.93);
    expect(Math.abs(sim - ex)).toBeLessThan(0.01);
    const single = perHorseBack.reduce((a, b) => a + b, 0) / perHorse.reduce((a, b) => a + b, 0);
    expect(single).toBeLessThan(0.96);
    expect(single).toBeGreaterThan(0.91);
  });

  it('the race plan crosses the line in the drawn order, in 12–15 s, with lead changes', () => {
    const rng = seededRng(11);
    const rnd = () => rng(1e9) / 1e9;
    const lap = 22.2;
    let changes = 0;
    let photo = 0;
    for (let k = 0; k < 60; k++) {
      const race = newRace(rng);
      const w = pickWinner(race, rng);
      const order = finishOrder(race, w, rng);
      const plan = planRace(order, lap, rnd);
      // the line is crossed in order
      for (let j = 1; j < 5; j++) expect(plan.T[order[j]]).toBeGreaterThan(plan.T[order[j - 1]]);
      order.forEach((i) => {
        expect(plan.s(i, plan.T[i])).toBeCloseTo(lap, 6);
        expect(plan.s(i, plan.T[i] - 0.05)).toBeLessThan(lap);
      });
      // nobody ever runs backwards
      for (let i = 0; i < 5; i++) for (let t = 0.05; t < plan.dur; t += 0.05) expect(plan.s(i, t)).toBeGreaterThanOrEqual(plan.s(i, t - 0.05) - 1e-9);
      expect(plan.T[order[0]]).toBeGreaterThan(11);
      expect(plan.dur).toBeLessThan(16.5);
      expect(Math.max(...plan.T)).toBeLessThan(15.2);
      expect(plan.margin).toBeGreaterThan(0);
      changes += plan.leadChanges;
      if (plan.margin < 0.25) photo++;
    }
    expect(changes / 60).toBeGreaterThan(1.5);
    expect(photo).toBeGreaterThan(5);
  });

  it('the track is one closed, smooth, anticlockwise loop with banked turns', () => {
    const f = trackAt(0, laneR(2));
    expect(f.x).toBeCloseTo(TR.lineX, 9);
    expect(f.z).toBeGreaterThan(0);
    let prevX = f.x;
    let prevZ = f.z;
    let area = 0;
    let maxBank = 0;
    const n = 4000;
    for (let k = 1; k <= n; k++) {
      const g = trackAt((k / n) * LAP, laneR(2));
      // steps are short everywhere (no jumps at the joins)
      expect(Math.hypot(g.x - prevX, g.z - prevZ)).toBeLessThan((LAP / n) * 1.6);
      area += prevX * g.z - g.x * prevZ;
      prevX = g.x;
      prevZ = g.z;
      maxBank = Math.max(maxBank, surfaceY(g, R_OUT) - TR.base);
    }
    const end = trackAt(LAP, laneR(2));
    expect(Math.hypot(end.x - f.x, end.z - f.z)).toBeLessThan(1e-9);
    // anticlockwise seen from above with +z toward the player: the shoelace area is negative in x/z
    expect(area).toBeLessThan(0);
    expect(maxBank).toBeGreaterThan(0.19);
    // straights are flat
    expect(surfaceY(trackAt(-0.4, laneR(0)), R_OUT)).toBeCloseTo(TR.base, 9);
  });
});
