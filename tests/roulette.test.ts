import { describe, expect, it } from 'vitest';
import { seededRng } from '../src/core/rng';
import { BET_BY_ID, BETS, colorOf, LIMITS, paysFor, pocketIndex, RED_NUMBERS, settleRoulette, wheelOrder, type BetKind } from '../src/games/roulette/rules';
import { DIM, rouletteLayout } from '../src/games/roulette/layout';
import { BALL_R, DIAMONDS, planSpin, POCKET, surfaceY, TAU, WHEEL, Y_REST } from '../src/games/roulette/spinPlan';

const ALL = Array.from({ length: 37 }, (_, i) => i);

describe('Roulette wheel', () => {
  it('has the 37 European pockets in the classic order', () => {
    expect(wheelOrder.length).toBe(37);
    expect([...wheelOrder].sort((a, b) => a - b)).toEqual(ALL);
    expect(wheelOrder.slice(0, 6)).toEqual([0, 32, 15, 19, 4, 21]);
    expect(wheelOrder[36]).toBe(26);
    expect(pocketIndex(0)).toBe(0);
    expect(pocketIndex(26)).toBe(36);
  });

  it('colours the numbers: 18 red, 18 black, a green zero, alternating round the wheel', () => {
    expect(colorOf(0)).toBe('green');
    expect(ALL.filter((n) => colorOf(n) === 'red')).toEqual([...RED_NUMBERS]);
    expect(ALL.filter((n) => colorOf(n) === 'black').length).toBe(18);
    for (const n of [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]) expect(colorOf(n)).toBe('red');
    for (const n of [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35]) expect(colorOf(n)).toBe('black');
    for (let i = 1; i < 36; i++) expect(colorOf(wheelOrder[i])).not.toBe(colorOf(wheelOrder[i + 1]));
  });
});

describe('Roulette bets', () => {
  const count = (k: BetKind) => BETS.filter((b) => b.kind === k).length;

  it('lists every classic betting place once', () => {
    expect(new Set(BETS.map((b) => b.id)).size).toBe(BETS.length);
    expect(count('straight')).toBe(37);
    expect(count('split')).toBe(60);
    expect(count('street')).toBe(14);
    expect(count('corner')).toBe(23);
    expect(count('line')).toBe(11);
    expect(count('column') + count('dozen') + count('even')).toBe(12);
    expect(BETS.length).toBe(157);
    for (const id of ['n0', 'n17', 's17-20', 's17-18', 's0-1', 's0-2', 's0-3', 'st13', 'tr0-1-2', 'tr0-2-3', 'c13-17', 'c0-3', 'l13-18', 'col1', 'doz2', 'red', 'black', 'odd', 'even', 'low', 'high'])
      expect(BET_BY_ID.has(id), id).toBe(true);
    expect(BET_BY_ID.get('c13-17')!.numbers).toEqual([13, 14, 16, 17]);
    expect(BET_BY_ID.get('l13-18')!.numbers).toEqual([13, 14, 15, 16, 17, 18]);
    expect(BET_BY_ID.get('st13')!.numbers).toEqual([13, 14, 15]);
    expect(BET_BY_ID.get('col1')!.numbers).toEqual([1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34]);
    expect(BET_BY_ID.get('col3')!.numbers.at(-1)).toBe(36);
    expect(BET_BY_ID.get('doz2')!.numbers).toEqual([13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]);
    expect(BET_BY_ID.get('c0-3')!.numbers).toEqual([0, 1, 2, 3]);
  });

  it('pays the classic odds and splits inside / outside limits', () => {
    const pays: Record<BetKind, number> = { straight: 35, split: 17, street: 11, corner: 8, line: 5, column: 2, dozen: 2, even: 1 };
    for (const b of BETS) {
      expect(b.pays, b.id).toBe(pays[b.kind]);
      expect(b.pays).toBe(paysFor(b.numbers.length));
      expect(b.inside).toBe(!['column', 'dozen', 'even'].includes(b.kind));
    }
    expect(LIMITS.inside).toBe(200);
    expect(LIMITS.outside).toBe(2000);
  });

  it('only joins neighbours on the grid', () => {
    const col = (n: number) => Math.floor((n - 1) / 3);
    for (const b of BETS) {
      const ns = b.numbers.filter((n) => n > 0);
      if (b.kind === 'split' && !b.numbers.includes(0)) {
        const [a, c] = ns;
        expect(c === a + 3 || (c === a + 1 && col(a) === col(c)), b.id).toBe(true);
      }
      if (b.kind === 'corner' && !b.numbers.includes(0)) {
        const a = ns[0];
        expect(ns).toEqual([a, a + 1, a + 3, a + 4]);
        expect(col(a)).toBe(col(a + 1));
      }
      if (b.kind === 'street' && !b.numbers.includes(0)) expect(ns[0] % 3).toBe(1);
      if (b.kind === 'line') expect(ns[0] % 3).toBe(1);
    }
  });

  it('settles a mixed layout', () => {
    const bets = { n17: 10, 's17-20': 5, st16: 5, 'c13-17': 5, 'l13-18': 5, red: 25, odd: 20, doz2: 10, col2: 10, low: 10, n0: 5 };
    const r = settleRoulette(bets, 17);
    expect(r.n17).toBe(360);
    expect(r['s17-20']).toBe(90);
    expect(r.st16).toBe(60);
    expect(r['c13-17']).toBe(45);
    expect(r['l13-18']).toBe(30);
    expect(r.red).toBe(0); // 17 is black
    expect(r.odd).toBe(40);
    expect(r.doz2).toBe(30);
    expect(r.col2).toBe(30);
    expect(r.low).toBe(20);
    expect(r.n0).toBe(0);
  });

  it('zero beats every even-money bet and pays the zero bets', () => {
    const outside = { red: 10, black: 10, odd: 10, even: 10, low: 10, high: 10, col1: 10, col2: 10, col3: 10, doz1: 10, doz2: 10, doz3: 10 };
    const r = settleRoulette({ ...outside, n0: 10, 's0-2': 10, 'tr0-1-2': 10, 'tr0-2-3': 10, 'c0-3': 10, 's1-2': 10 }, 0);
    for (const id of Object.keys(outside)) expect(r[id], id).toBe(0);
    expect(r.n0).toBe(360);
    expect(r['s0-2']).toBe(180);
    expect(r['tr0-1-2']).toBe(120);
    expect(r['tr0-2-3']).toBe(120);
    expect(r['c0-3']).toBe(90);
    expect(r['s1-2']).toBe(0);
  });

  it('returns exactly 36/37 on every bet (exact enumeration of the 37 numbers)', () => {
    for (const b of BETS) {
      let back = 0;
      for (const n of ALL) back += settleRoulette({ [b.id]: 1 }, n)[b.id];
      // 36 units back for 37 units staked: RTP 97.297%, house edge 1/37
      expect(back, b.id).toBe(36);
    }
    // and so does any combination of bets
    const mix = { n7: 5, 's8-11': 10, st31: 25, 'c0-3': 5, 'l25-30': 15, red: 100, col3: 40, doz1: 20, high: 35 };
    const staked = Object.values(mix).reduce((a, b) => a + b, 0);
    let back = 0;
    for (const n of ALL) back += Object.values(settleRoulette(mix, n)).reduce((a, b) => a + b, 0);
    expect(back / (37 * staked)).toBeCloseTo(36 / 37, 12);
  });

  it('simulated spins with a seeded rng land near 97.30%', () => {
    const rng = seededRng(2024);
    const ids = BETS.map((b) => b.id);
    let staked = 0;
    let back = 0;
    for (let i = 0; i < 400_000; i++) {
      const id = ids[rng(ids.length)];
      const stake = 5 * (1 + rng(4));
      staked += stake;
      back += settleRoulette({ [id]: stake }, rng(37))[id];
    }
    expect(back / staked).toBeGreaterThan(0.955);
    expect(back / staked).toBeLessThan(0.991);
  });
});

describe('Roulette layout', () => {
  const L = rouletteLayout(0, 0);
  const cell = (n: number) => L.cells.get(n)!;

  it('prints 3 rows × 12 columns with 3,6,9… on top and the zero on the left', () => {
    expect(cell(3).z).toBeLessThan(cell(2).z);
    expect(cell(2).z).toBeLessThan(cell(1).z);
    expect(cell(4).x).toBeGreaterThan(cell(1).x);
    expect(cell(36).x).toBeCloseTo(L.gx + 11.5 * DIM.CW);
    expect(cell(0).x).toBeLessThan(L.gx);
    expect(L.boxes.get('col3')!.z).toBeCloseTo(cell(36).z);
    expect(L.boxes.get('col1')!.z).toBeCloseTo(cell(34).z);
    expect(L.boxes.get('doz1')!.z).toBeGreaterThan(cell(1).z);
    expect(L.boxes.get('red')!.z).toBeGreaterThan(L.boxes.get('doz1')!.z);
    expect(L.wheel.x + L.wheel.r).toBeLessThan(L.gx - DIM.ZW);
  });

  it('puts splits and corners on the lines between their numbers, streets and lines on the bottom edge', () => {
    const bottom = L.gz + 3 * DIM.CH;
    for (const s of L.spots) {
      const ns = s.bet.numbers;
      if (!s.bet.inside || ns.includes(0)) continue;
      const cx = ns.reduce((a, n) => a + cell(n).x, 0) / ns.length;
      const cz = ns.reduce((a, n) => a + cell(n).z, 0) / ns.length;
      expect(s.x, s.bet.id).toBeCloseTo(cx);
      if (s.bet.kind === 'street' || s.bet.kind === 'line') expect(s.z, s.bet.id).toBeCloseTo(bottom);
      else expect(s.z, s.bet.id).toBeCloseTo(cz);
    }
    for (const id of ['s0-1', 's0-2', 's0-3', 'tr0-1-2', 'tr0-2-3', 'c0-3']) expect(L.spots.find((s) => s.bet.id === id)!.x).toBeCloseTo(L.gx);
  });

  it('keeps the composition centred on its anchor, about 2.5 : 1', () => {
    const e = L.extent;
    expect((e.x0 + e.x1) / 2).toBeCloseTo(0, 1);
    const ratio = (e.x1 - e.x0) / (e.z1 - e.z0);
    expect(ratio).toBeGreaterThan(2.2);
    expect(ratio).toBeLessThan(3);
    // small places are listed after the cells, so their hit areas sit on top
    const order = L.spots.map((s) => s.bet.kind);
    expect(order.indexOf('straight')).toBeLessThan(order.indexOf('split'));
    expect(order.lastIndexOf('split')).toBeLessThan(order.indexOf('corner'));
  });
});

describe('Roulette spin plan', () => {
  /** Angle difference folded into (-π, π]. */
  const wrap = (a: number) => {
    const x = (((a + Math.PI) % TAU) + TAU) % TAU;
    return x - Math.PI;
  };
  const xyz = (b: { r: number; y: number; th: number }) => [Math.cos(b.th) * b.r, b.y, Math.sin(b.th) * b.r];

  it('always brings the ball to rest in the pocket of the drawn number', () => {
    const rng = seededRng(99);
    const rnd = () => rng(1_000_000) / 1_000_000;
    for (let i = 0; i < 300; i++) {
      const n = rng(37);
      const p = planSpin({ phi: rnd() * 40 - 20, omega: 0.2 + rnd() * 1.4, ballIdx: rng(37), n, rnd });
      expect(p.tEnd).toBeGreaterThan(6.8);
      expect(p.tEnd).toBeLessThan(9);
      expect(p.k).toBeGreaterThan(0.88);
      expect(p.k).toBeLessThan(1.12);
      const end = p.ballAt(p.tEnd);
      expect(end.r).toBeCloseTo(WHEEL.pocket, 6);
      expect(end.y).toBeCloseTo(Y_REST, 6);
      const rel = wrap(end.th - p.rotorAt(p.tEnd) - pocketIndex(n) * POCKET);
      expect(Math.abs(rel) / POCKET).toBeLessThan(0.01);
      // the rotor turns one way, the ball the other (on the track)
      expect(p.rotorAt(3) - p.rotorAt(2)).toBeGreaterThan(0);
      expect(wrap(p.ballAt(2.01).th - p.ballAt(2).th)).toBeLessThan(0);
    }
  });

  it('moves the ball smoothly, over the surfaces, and through a deflector', () => {
    const rng = seededRng(5);
    const rnd = () => rng(1_000_000) / 1_000_000;
    for (let i = 0; i < 60; i++) {
      const p = planSpin({ phi: rnd() * 6, omega: 0.32, ballIdx: rng(37), n: rng(37), rnd });
      let prev = xyz(p.ballAt(0));
      const dt = 1 / 240;
      for (let t = dt; t <= p.tEnd; t += dt) {
        const b = p.ballAt(t);
        const cur = xyz(b);
        // under 20 table units per second (about 2.7 turns a second), even when flicked
        expect(Math.hypot(cur[0] - prev[0], cur[1] - prev[1], cur[2] - prev[2]), `t=${t}`).toBeLessThan(20 * dt);
        prev = cur;
        if (t > p.tLaunch && t < p.tRotor) expect(b.y).toBeGreaterThanOrEqual(surfaceY(b.r) + BALL_R - 1e-9);
        if (t >= p.tRotor) {
          // clears the frets whenever it crosses one
          const s = t - p.tRotor;
          const hp = p.hops.find((h) => s >= h.t0 && s < h.t0 + h.d);
          if (hp) {
            const q = hp.q0 + (hp.q1 - hp.q0) * ((s - hp.t0) / hp.d);
            if (Math.abs(q - Math.round(q - 0.5) - 0.5) < 0.02) expect(b.y).toBeGreaterThan(WHEEL.fretTop + BALL_R);
          }
        }
      }
      // the deflector is hit where one stands
      const d = p.ballAt(p.tDiamond);
      expect(d.r).toBeCloseTo(WHEEL.diamond, 3);
      expect(Math.min(...DIAMONDS.map((a) => Math.abs(wrap(d.th - a))))).toBeLessThan(0.01);
      expect(p.tDiamond).toBeGreaterThan(p.tTrack);
      expect(p.tDiamond).toBeLessThan(p.tRotor);
      // two or three frets on the way into the pocket
      const frets = Math.floor(p.hops[0].q0 - 0.5) + 1;
      expect(frets).toBeGreaterThanOrEqual(2);
      expect(frets).toBeLessThanOrEqual(3);
    }
  });
});
