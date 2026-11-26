import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { seededRng } from '../src/core/rng';
import { COIN_R, COIN_T, planFlip } from '../src/games/coinflip/coin';
import { COIN, COIN_P, coinCover, flip, settleCoin, type CoinFace } from '../src/games/coinflip/rules';

describe('Coin Flip', () => {
  it('has 1/40 edge and 39/80 heads and tails, exactly', () => {
    const count: Record<CoinFace, number> = { heads: 0, tails: 0, edge: 0 };
    for (let k = 0; k < COIN.slots; k++) count[flip(() => k)]++;
    expect(count.edge).toBe(2);
    expect(count.heads).toBe(39);
    expect(count.tails).toBe(39);
    expect(COIN_P.edge).toBe(1 / 40);
    expect(COIN_P.heads).toBe(0.4875);
  });

  it('settles heads, tails and edge', () => {
    expect(settleCoin({ heads: 25, tails: 10, edge: 5 }, 'heads')).toEqual({ heads: 50, tails: 0, edge: 0 });
    expect(settleCoin({ heads: 25, tails: 10, edge: 5 }, 'tails')).toEqual({ heads: 0, tails: 20, edge: 0 });
    // on the edge every heads and tails bet loses; the edge bet pays 35:1
    expect(settleCoin({ heads: 25, tails: 10, edge: 5 }, 'edge')).toEqual({ heads: 0, tails: 0, edge: 180 });
    expect(settleCoin({}, 'edge')).toEqual({ heads: 0, tails: 0, edge: 0 });
    expect(coinCover(25)).toBe(25);
  });

  it('RTP is exactly 97.5% on heads/tails and 90% on the edge', () => {
    let heads = 0;
    let tails = 0;
    let edge = 0;
    for (let k = 0; k < COIN.slots; k++) {
      const r = settleCoin({ heads: 1, tails: 1, edge: 1 }, flip(() => k));
      heads += r.heads;
      tails += r.tails;
      edge += r.edge;
    }
    expect(heads / COIN.slots).toBeCloseTo(0.975, 12);
    expect(tails / COIN.slots).toBeCloseTo(0.975, 12);
    expect(edge / COIN.slots).toBeCloseTo(0.9, 12);
  });

  it('simulated with a seeded rng', () => {
    const rng = seededRng(42);
    const n = 400000;
    let wager = 0;
    let back = 0;
    let edges = 0;
    let edgeBack = 0;
    for (let k = 0; k < n; k++) {
      const res = flip(rng);
      if (res === 'edge') edges++;
      const r = settleCoin({ heads: 10, edge: 1 }, res);
      wager += 10;
      back += r.heads;
      edgeBack += r.edge;
    }
    expect(Math.abs(edges / n - 1 / 40)).toBeLessThan(0.0015);
    expect(Math.abs(back / wager - 0.975)).toBeLessThan(0.006);
    expect(Math.abs(edgeBack / n - 0.9)).toBeLessThan(0.06);
  });

  it('the flip lands the drawn face, spins 6–10 turns and never sinks into the felt', () => {
    for (const res of ['heads', 'tails', 'edge'] as const)
      for (let k = 0; k < 25; k++) {
        const rng = seededRng(k * 31 + res.length);
        const rnd = () => rng(1e9) / 1e9;
        const from = new THREE.Vector3(0, 0.087, -2.6);
        const to = new THREE.Vector3(0.06, 0, -0.2);
        const plan = planFlip(from, to, res, rnd);
        const p = new THREE.Vector3();
        const q = new THREE.Quaternion();
        const pq = new THREE.Quaternion();
        const pp = new THREE.Vector3();
        let turns = 0;
        let top = 0;
        for (let t = 0; t <= plan.dur; t += 1 / 240) {
          plan.pose(t, p, q);
          if (t > 0) {
            // smooth: no jumps between frames
            expect(p.distanceTo(pp)).toBeLessThan(0.06);
            if (t < plan.hits[0]) turns += pq.angleTo(q);
          }
          const n = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
          const lowest = p.y - COIN_R * Math.sqrt(Math.max(0, 1 - n.y * n.y)) - (COIN_T / 2) * Math.abs(n.y);
          if (t > 0.15) expect(lowest).toBeGreaterThan(-0.002);
          top = Math.max(top, p.y);
          pp.copy(p);
          pq.copy(q);
        }
        expect(turns / (2 * Math.PI)).toBeGreaterThan(6);
        expect(turns / (2 * Math.PI)).toBeLessThan(10);
        expect(top).toBeGreaterThan(1.8);
        plan.pose(plan.dur, p, q);
        const n = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
        if (res === 'heads') expect(n.y).toBeGreaterThan(0.999);
        if (res === 'tails') expect(n.y).toBeLessThan(-0.999);
        // on its edge: standing, the crowned face toward the player
        if (res === 'edge') expect(n.z).toBeGreaterThan(0.999);
        expect(Math.hypot(p.x - to.x, p.z - to.z)).toBeLessThan(1e-3);
      }
  });
});
