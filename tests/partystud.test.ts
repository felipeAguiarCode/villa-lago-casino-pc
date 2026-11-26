import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { parseCards, type Card } from '../src/core/cards';
import { seededRng, shuffle, type Rng } from '../src/core/rng';
import { drawMindset, MINDSETS, newMemory, remember, type AiMemory, type Mindset } from '../src/games/partybj/mindset';
import { drawRegulars, replacementFor, ROSTER } from '../src/games/partybj/roster';
import { cardSpot, CARD_H, CARD_W, dealerSpot, LY, onTable, PLAYER_SEAT, PRINT_TOP, printBottom, RING_R, RINGS, seatLayout, type SeatGeo } from '../src/games/partystud/layout';
import { aggressiveRaise, aiBets, aiDecision, busted, conservativeRaise, COVER, PartyStudRound, playOut, PS, type SeatIn } from '../src/games/partystud/rules';
import { blindPays, bookDecision, handScore, MULT, scoreCat, settleStud, upCards, type RiverRead, type Street } from '../src/games/stud7/rules';

const c = (s: string) => parseCards(s);
/** An rng that always returns the same draw (clamped to the range). */
const fixed = (k: number): Rng => (n) => Math.min(k, n - 1);
const mem = (streak = 0): AiMemory => ({ ...newMemory(), streak });
function drawer(rng: Rng) {
  const d = shuffle(Array.from({ length: 52 }, (_, i) => i), rng);
  let k = 0;
  return () => d[k++];
}
const table = (rng: Rng, seats: SeatIn[] = Array.from({ length: 5 }, () => ({ ante: 10, bonus: 0, mindset: null }))) => new PartyStudRound(drawer(rng), seats);

describe('PartyStudRound', () => {
  it('deals 3rd street in three passes from first base, the dealer last, and 42 cards in all', () => {
    const r = table(seededRng(1));
    const third = r.next();
    expect(third.map((e) => e.seat)).toEqual([0, 1, 2, 3, 4, -1, 0, 1, 2, 3, 4, -1, 0, 1, 2, 3, 4, -1]);
    expect(third.map((e) => e.up)).toEqual([...Array(12).fill(false), ...Array(6).fill(true)]);
    expect(r.decision).toBe('third');
    const streets = [r.next(), r.next(), r.next(), r.next()];
    expect(streets.map((s) => s.length)).toEqual([6, 6, 6, 6]);
    expect(streets[3].every((e) => !e.up)).toBe(true);
    expect(r.dealt).toBe('seventh');
    const all = [...r.deal.hands.flat(), ...r.dealer];
    expect(all.length).toBe(42);
    expect(new Set(all).size).toBe(42);
  });

  it('every other seat’s up cards are dead cards for a seat', () => {
    const r = table(seededRng(2));
    r.next();
    r.next();
    expect(r.dead(0).length).toBe(8);
    expect(r.dead(0)).toEqual([1, 2, 3, 4].flatMap((s) => upCards(r.cards(s))));
    expect(r.dead(0)).not.toContain(r.cards(0)[2]);
    expect(r.dealerUp).toEqual(upCards(r.dealer));
  });

  it('one raise per hand, a fold only at the river, raises only when covered', () => {
    const r = table(seededRng(3));
    r.next();
    expect(r.legal(0, 1000)).toEqual(['check', 'raise4']);
    expect(r.legal(0, 30)).toEqual(['check']);
    expect(r.act(0, 'raise4')).toBe(40);
    expect(r.live(0)).toBe(false);
    expect(r.act(0, 'check')).toBe(0);
    r.next();
    expect(r.live(0)).toBe(false);
    expect(r.live(1)).toBe(true);
    expect(r.legal(1, 1000)).toEqual(['check', 'raise2']);
    r.next();
    r.next();
    expect(r.decision).toBeNull();
    expect(r.live(1)).toBe(false);
    r.next();
    expect(r.legal(1, 1000)).toEqual(['fold', 'bet1']);
    r.act(1, 'fold');
    expect(r.seats[1].folded).toBe(true);
  });

  it('settles every seat with settleStud against the same dealer; a folded seat keeps its Bonus', () => {
    const r = table(seededRng(4), [
      { ante: 10, bonus: 5, mindset: null },
      { ante: 20, bonus: 0, mindset: 'calculated' },
      { ante: 15, bonus: 5, mindset: 'aggressive' },
      { ante: 10, bonus: 0, mindset: 'hunch' },
      { ante: 50, bonus: 25, mindset: 'conservative' },
    ]);
    for (let k = 0; k < 4; k++) r.next();
    r.next();
    r.act(0, 'bet1');
    r.act(4, 'fold');
    const res = r.settle();
    res.forEach((sr, s) => {
      const st = r.seats[s];
      const exp = settleStud(r.cards(s), r.dealer, { ante: st.ante, blind: st.ante, bonus: st.bonus }, st.raise, st.folded);
      expect(sr.res.ret).toEqual(exp.ret);
      expect(sr.wager).toBe(2 * st.ante + st.raise + st.bonus);
      expect(sr.ret).toBe(exp.ret.ante + exp.ret.blind + exp.ret.raise + exp.ret.bonus);
    });
    expect(res[4].folded).toBe(true);
    expect(res[4].res.ret.ante + res[4].res.ret.blind).toBe(0);
    expect(new Set(res.map((sr) => sr.res.dealer.score)).size).toBe(1);
  });

  it('playOut plays the player by the hint and the regulars by their mindset', () => {
    const rng = seededRng(5);
    for (let i = 0; i < 40; i++) {
      const seats: SeatIn[] = MINDSETS.map((m, k) => ({ ante: 10, bonus: 0, mindset: k === 2 ? null : m }));
      const r = table(rng, seats);
      const res = playOut(r, seats.map(() => newMemory()), rng);
      expect(res.length).toBe(5);
      for (const s of r.seats) {
        expect(s.moves.length).toBeGreaterThan(0);
        expect(s.moves.length).toBeLessThanOrEqual(4);
        if (s.folded) expect(s.moves[s.moves.length - 1]).toBe('fold');
      }
    }
  });
});

describe('the regulars’ mindsets', () => {
  it('calculated plays the hint strategy with the dead cards', () => {
    const spots: [Street, string, string, string][] = [
      ['third', 'As Ad Ac', '5h', ''],
      ['third', '2c 7d 9h', 'Ah', '3c 4d'],
      ['fifth', '7h 9h Ah Th 8d', '6s 3s 4s', '6c Jc 6d Kd 4c 5c 7s 9c 8h 2h Kh Qh'],
      ['river', '2h 5h 8h 9h Kh 3c 4d', '2s 7d 9c Js', ''],
    ];
    for (const [st, own, up, dead] of spots) expect(aiDecision('calculated', c(own), c(up), c(dead), st, mem(), fixed(0)).move).toBe(bookDecision(st, c(own), c(up), c(dead)).move);
  });

  it('aggressive raises early with any pair, live draws or two overcards, and bets unless drawing dead', () => {
    const a = (st: Street, own: string, up: string, dead = '') => aiDecision('aggressive', c(own), c(up), c(dead), st, mem(), fixed(0)).move;
    expect(bookDecision('third', c('2c 2d 7h'), c('As')).move).toBe('check');
    expect(a('third', '2c 2d 7h', 'As')).toBe('raise4');
    expect(a('third', 'Qh 8h 3h', '5s')).toBe('raise4'); // three hearts, all ten others live
    expect(a('third', '7c 8d 9h', '2s')).toBe('raise4'); // three to a straight
    expect(a('third', 'Kc Qd 4s', '9h')).toBe('raise4'); // two high cards above the door
    expect(a('third', 'Kc Qd 4s', 'As')).toBe('check');
    expect(a('fourth', '2c 7d 9h Kc', 'As 5d')).toBe('check');
    expect(a('fourth', '2h 7h 9h Kh', 'As 5d')).toBe('raise2');
    expect(a('river', '2c 4d 6h 8s Tc Qd 3h', '5s 7d 9c Js')).toBe('bet1'); // weak, but not dead
    expect(a('river', '2c 2d 5h 8s 9c Jd Kh', 'As Ad Ah Ac')).toBe('fold'); // drawing dead
  });

  it('conservative raises only trips, two pair or a high pair beating the board, and folds weak river spots', () => {
    const k = (st: Street, own: string, up: string) => aiDecision('conservative', c(own), c(up), [], st, mem(), fixed(0)).move;
    expect(bookDecision('third', c('9c 9d 4h'), c('Ks')).move).toBe('raise4');
    expect(k('third', '9c 9d 4h', 'Ks')).toBe('check');
    expect(k('third', 'Jc Jd 4h', '9s')).toBe('raise4');
    expect(k('third', 'Jc Jd 4h', 'Qs')).toBe('check');
    expect(k('third', '5c 5d 5h', 'As')).toBe('raise4');
    expect(k('fifth', 'Kc Kd 4h 4s 9d', '2s 7h Jc')).toBe('raise2');
    expect(k('fifth', 'Qc Qd 4h 8s 9d', '2s 7h Jc')).toBe('raise2');
    expect(k('fifth', 'Qc Qd 4h 8s 9d', '2s Kh Jc')).toBe('check');
    // a marginal river: the book bets, the conservative regular lets it go
    const river: [string, string] = ['9d 2s Qd Td 8s As 5s', '3s 8h 9c 2h'];
    expect(bookDecision('river', c(river[0]), c(river[1])).move).toBe('bet1');
    expect(k('river', ...river)).toBe('fold');
    expect(conservativeRaise('fourth', c('Ks Kd 4h 4c'), c('As 5d'))).toBe(true);
  });

  it('hybrid follows the book on clear spots and leans with its streak on borderline ones', () => {
    const h = (own: string, up: string, streak: number) => aiDecision('hybrid', c(own), c(up), [], 'third', mem(streak), fixed(0));
    // clear spot: the book, whatever the streak
    expect(h('As Ad Ac', '5h', -5).move).toBe('raise4');
    expect(h('2c 7d 9h', 'Ah', 5).move).toBe('check');
    // borderline (the book checks by a hair): presses after two wins, the book otherwise
    expect(Math.abs(bookDecision('third', c('Qs 9s As'), c('6c')).margin)).toBeLessThan(0.08);
    expect(h('Qs 9s As', '6c', 2).move).toBe('raise4');
    expect(h('Qs 9s As', '6c', 0).move).toBe(bookDecision('third', c('Qs 9s As'), c('6c')).move);
    expect(h('Qs 9s As', '6c', 2).close).toBe(true);
    // borderline (the book raises by a hair): tightens after two losses
    expect(bookDecision('third', c('4s 4d 6s'), c('Kc')).move).toBe('raise4');
    expect(h('4s 4d 6s', 'Kc', -2).move).toBe('check');
    expect(h('4s 4d 6s', 'Kc', 1).move).toBe('raise4');
  });

  it('hunch mostly follows the book, swaps one decision in four, and never folds a made straight', () => {
    expect(aiDecision('hunch', c('As Ad Ac'), c('5h'), [], 'third', mem(), fixed(1)).move).toBe('raise4');
    expect(aiDecision('hunch', c('As Ad Ac'), c('5h'), [], 'third', mem(), fixed(0)).move).toBe('check');
    const straight = c('9h 8c 7d 6s 5h 2c Kd');
    expect(scoreCat(handScore(straight))).toBeGreaterThanOrEqual(4);
    expect(aiDecision('hunch', straight, c('2s 3d Jc Qh'), [], 'river', mem(), fixed(0)).move).toBe('bet1');
    const rng = seededRng(9);
    let off = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) if (aiDecision('hunch', c('As Ad Ac'), c('5h'), [], 'third', mem(), rng).move !== 'raise4') off++;
    expect(off / n).toBeGreaterThan(0.2);
    expect(off / n).toBeLessThan(0.3);
  });

  it('every mindset always picks a legal move', () => {
    const rng = seededRng(13);
    for (let i = 0; i < 60; i++) {
      const r = table(rng);
      while (r.dealt !== 'seventh') {
        r.next();
        const st = r.decision;
        if (!st) continue;
        for (const m of MINDSETS) {
          for (const chips of [0, 25, 1000]) {
            const legal = r.legal(0, chips);
            const mv = aiDecision(m, r.cards(0), r.dealerUp, r.dead(0), st, mem(i % 5 - 2), rng, legal).move;
            expect(legal).toContain(mv);
          }
        }
      }
    }
  });
});

describe('dead cards', () => {
  it('make a calculated regular check a flush draw it would raise live', () => {
    const own = c('7h 9h Ah Th 8d');
    const up = c('6s 3s 4s');
    const other = c('6c Jc 6d Kd 4c 5c 7s 9c');
    const hearts = c('8h 2h Kh Qh');
    expect(aiDecision('calculated', own, up, other, 'fifth', mem(), fixed(0)).move).toBe('raise2');
    expect(aiDecision('calculated', own, up, [...other, ...hearts], 'fifth', mem(), fixed(0)).move).toBe('check');
  });

  it('make an aggressive regular drop a three-flush whose hearts are showing', () => {
    expect(aggressiveRaise('third', c('Qh 8h 3h'), c('5s'), [])).toBe(true);
    expect(aggressiveRaise('third', c('Qh 8h 3h'), c('5s'), c('2h 4h 6h'))).toBe(false);
    expect(aiDecision('aggressive', c('Qh 8h 3h'), c('5s'), c('2h 4h 6h'), 'third', mem(), fixed(0)).move).toBe('check');
  });
});

describe('the regulars at the table', () => {
  it('drawMindset never draws the same mindset twice in a row', () => {
    const rng = seededRng(21);
    for (const profile of ROSTER.slice(0, 8)) {
      const m = newMemory();
      let chips = profile.bank;
      const seen = new Set<Mindset>();
      for (let i = 0; i < 400; i++) {
        const prev = m.last;
        const ms = drawMindset(profile, m, chips, rng);
        expect(ms).not.toBe(prev);
        seen.add(ms);
        const net = (rng(3) - 1) * 40;
        chips = Math.max(0, chips + net);
        remember(m, ms, net);
      }
      expect(seen.size).toBeGreaterThanOrEqual(4);
    }
  });

  it('seats four different regulars from the circuit, and a newcomer is never someone already seated', () => {
    const rng = seededRng(22);
    for (let i = 0; i < 200; i++) {
      const four = drawRegulars(4, rng);
      const names = four.map((p) => p.name);
      expect(new Set(names).size).toBe(4);
      for (const p of four) expect(ROSTER).toContain(p);
      const nu = replacementFor(names, rng);
      expect(names).not.toContain(nu.name);
      expect(ROSTER).toContain(nu);
    }
  });

  it('bets an Ante of 10–100 in steps of 5 that covers Ante, Blind, a 4× raise and the Bonus', () => {
    const rng = seededRng(23);
    for (const m of MINDSETS)
      for (const chips of [0, 59, 60, 100, 333, 1500, 5000])
        for (let i = 0; i < 30; i++) {
          const b = aiBets(m, chips, { ...newMemory(), lastNet: rng(400) - 100 }, rng);
          if (!b.ante) {
            expect(b.bonus).toBe(0);
            continue;
          }
          expect(b.ante % 5).toBe(0);
          expect(b.ante).toBeGreaterThanOrEqual(PS.aiMin);
          expect(b.ante).toBeLessThanOrEqual(PS.aiMax);
          expect(b.ante * COVER + b.bonus).toBeLessThanOrEqual(chips);
        }
    expect(busted(59)).toBe(true);
    expect(busted(60)).toBe(false);
    expect(aiBets('calculated', 59, newMemory(), rng).ante).toBe(0);
  });
});

/** Exact expectation (in Antes) of a path, over the dealer's hidden cards, from the river read. */
function pathEV(r: RiverRead, own: Card[], mult: number, folded: boolean) {
  if (folded) return -2;
  return r.winQ - r.loseQ + mult * (r.win - r.lose) + r.win * blindPays(scoreCat(handScore(own))) - r.lose;
}

describe('RTP', () => {
  it('calculated is the best mindset over the long run (same hands, exact expectation)', () => {
    const rng = seededRng(31);
    const ai = seededRng(32);
    const n = 4500;
    const total: Record<Mindset, number> = { calculated: 0, aggressive: 0, conservative: 0, hybrid: 0, hunch: 0 };
    const mems = Object.fromEntries(MINDSETS.map((m) => [m, newMemory()])) as Record<Mindset, AiMemory>;
    for (let i = 0; i < n; i++) {
      const r = table(rng);
      const seat = 2;
      const path = Object.fromEntries(MINDSETS.map((m) => [m, { mult: 0, folded: false, done: false }])) as Record<Mindset, { mult: number; folded: boolean; done: boolean }>;
      while (r.dealt !== 'seventh') {
        r.next();
        const st = r.decision;
        if (!st) continue;
        for (const m of MINDSETS) {
          const p = path[m];
          if (p.done) continue;
          const mv = aiDecision(m, r.cards(seat), r.dealerUp, r.dead(seat), st, mems[m], ai).move;
          if (mv === 'fold') p.folded = p.done = true;
          else if (mv !== 'check') {
            p.mult = MULT[mv];
            p.done = true;
          }
        }
      }
      const own = r.cards(seat);
      const read = bookDecision('river', own, r.dealerUp, r.dead(seat)).odds as RiverRead;
      for (const m of MINDSETS) {
        const p = path[m];
        const ev = pathEV(read, own, p.mult, p.folded);
        total[m] += ev;
        remember(mems[m], m, ev > 0.5 ? 1 : ev < -0.5 ? -1 : 0);
      }
    }
    const rtp = Object.fromEntries(MINDSETS.map((m) => [m, 1 + total[m] / n]));
    console.log('Party stud mindsets, % of the Ante:', MINDSETS.map((m) => `${m} ${(rtp[m] * 100).toFixed(1)}`).join(' · '));
    for (const m of MINDSETS) if (m !== 'calculated') expect(rtp.calculated).toBeGreaterThan(rtp[m]);
    // the player's hint is the calculated play: 99.0% over 1,320,000 tables offline
    expect(rtp.calculated).toBeGreaterThan(0.9);
    expect(rtp.calculated).toBeLessThan(1.04);
  }, 240000);
});

// --------------------------------------------------------------------------- layout

/** The phone layout camera (stage.ts), to find where the view's anchors land on the table. */
function layoutZ(v: number): number {
  const aspect = 9 / 19.5;
  const cam = new THREE.PerspectiveCamera(30, aspect, 0.1, 80);
  const hf = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(15)) * aspect);
  const d = 3.3 / 2 / Math.tan(hf / 2);
  const tilt = THREE.MathUtils.degToRad(12);
  cam.position.set(0, d * Math.cos(tilt), d * Math.sin(tilt));
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(0, -(v * 2 - 1)), cam);
  const out = new THREE.Vector3();
  ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), out);
  return out.z;
}

interface Box {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  what: string;
}
const box = (x: number, z: number, w: number, h: number, what: string): Box => ({ x0: x - w / 2, x1: x + w / 2, z0: z - h / 2, z1: z + h / 2, what });
const hit = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;

/** Axis-aligned bounds of a card lying at (x, z) turned by yaw. */
function cardBox(x: number, z: number, yaw: number, what: string): Box {
  const w = Math.abs(CARD_W * Math.cos(yaw)) + Math.abs(CARD_H * Math.sin(yaw));
  const h = Math.abs(CARD_W * Math.sin(yaw)) + Math.abs(CARD_H * Math.cos(yaw));
  return box(x, z, w, h, what);
}

describe('layout', () => {
  // the view's anchors (partystud/view.ts V) and the HUD pins' size in table units (≈ 185 px per unit)
  const dealerZ = layoutZ(0.185);
  const printZ = layoutZ(0.36);
  const playerZ = layoutZ(0.79);
  const TAG = { w: 1.1, h: 0.22 };
  const PLATE = { w: 1.5, h: 0.28 };

  function seatBoxes(g: SeatGeo, k: number): Box[] {
    const out: Box[] = [];
    for (let i = 0; i < 7; i++) {
      const s = cardSpot(i);
      const p = onTable(g, s.lx, s.ly);
      out.push(cardBox(p.x, p.z, g.yaw, `seat ${k} card ${i}`));
    }
    for (const lx of Object.values(RINGS)) {
      const p = onTable(g, lx, 0);
      out.push(box(p.x, p.z, 2 * RING_R, 2 * RING_R, `seat ${k} ring`));
    }
    const tg = onTable(g, 0, LY.tag);
    out.push(box(tg.x, tg.z, TAG.w, TAG.h, `seat ${k} tag`));
    const pl = onTable(g, 0, k === PLAYER_SEAT ? LY.platePlayer : LY.plateAi);
    out.push(box(pl.x, pl.z, k === PLAYER_SEAT ? 1.0 : PLATE.w, PLATE.h, `seat ${k} plate`));
    return out;
  }

  it('keeps the seats, the dealer’s row, its tag and the print apart at every stretch', () => {
    for (const stretch of [1, 1.15, 1.3, 1.45]) {
      const seats = seatLayout(playerZ, stretch);
      const dealer: Box[] = Array.from({ length: 7 }, (_, i) => {
        const d = dealerSpot(i);
        return cardBox(d.x, dealerZ + d.dz, 0.02, `dealer card ${i}`);
      });
      dealer.push(box(0, dealerZ + CARD_H / 2 + 0.2, 2.2, TAG.h, 'dealer tag'));
      // the print's lettering: the band every column of it covers (title tops to the arcs' ends);
      // below that the smile-shaped arcs are checked point by point
      const low = printBottom(1.7)!;
      const print = box(0, printZ + (PRINT_TOP + low) / 2, 3.5, low - PRINT_TOP, 'print');
      expect(dealer.every((b) => !hit(b, print))).toBe(true);
      const all = seats.map((g, k) => seatBoxes(g, k));
      for (let a = 0; a < 5; a++) {
        for (const b of all[a]) {
          for (const d of [...dealer, print]) expect(hit(b, d), `${b.what} × ${d.what} at stretch ${stretch}`).toBe(false);
          // below the smile-shaped lettering wherever it runs
          for (const x of [b.x0, (b.x0 + b.x1) / 2, b.x1]) {
            const pb = printBottom(x);
            if (pb !== null) expect(b.z0, `${b.what} under the print at stretch ${stretch}`).toBeGreaterThan(printZ + pb);
          }
          for (let o = a + 1; o < 5; o++) for (const q of all[o]) expect(hit(b, q), `${b.what} × ${q.what} at stretch ${stretch}`).toBe(false);
        }
      }
      // a seat's own rows of cards don't cover its circles, its tag or its plate
      for (const boxes of all) {
        const cards = boxes.filter((b) => b.what.includes('card'));
        const rest = boxes.filter((b) => !b.what.includes('card'));
        for (const b of cards) for (const r of rest) expect(hit(b, r), `${b.what} × ${r.what}`).toBe(false);
      }
    }
  });

  it('fans each seat’s up cards by half a card and keeps the down cards on their own row', () => {
    const up = [2, 3, 4, 5].map(cardSpot);
    const down = [0, 1, 6].map(cardSpot);
    expect(up[1].lx - up[0].lx).toBeCloseTo(CARD_W / 2, 1);
    expect(new Set(up.map((s) => s.ly)).size).toBe(1);
    expect(new Set(down.map((s) => s.ly)).size).toBe(1);
    expect(up[0].ly - down[0].ly).toBeGreaterThanOrEqual(CARD_H);
  });
});
