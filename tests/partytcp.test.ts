import { describe, expect, it } from 'vitest';
import { parseCards, rankOf, Shoe, type Card } from '../src/core/cards';
import { Cat3, eval3 } from '../src/core/eval3';
import { seededRng, type Rng } from '../src/core/rng';
import { MINDSETS, newMemory, remember, type Mindset } from '../src/games/partybj/mindset';
import { cardPlace, onTable, PAY_DX, PLAYER_SEAT, RINGS, seatLayout, type TcpSeatGeo } from '../src/games/partytcp/layout';
import {
  aiBets,
  aiPlays,
  borderline,
  countedPlay,
  isBroke,
  kingHighOrBetter,
  PartyTcpRound,
  playEv,
  playOut,
  PT,
  type SeatIn,
  type TcpRead,
} from '../src/games/partytcp/rules';
import { ANTE_BONUS, dealerQualifies, PAIR_PLUS, settleTcp, shouldPlay } from '../src/games/threecard/rules';

const c = (s: string) => parseCards(s);
/** An rng that always returns the same draw (clamped to the range). */
const fixed = (k: number): Rng => (n) => Math.min(k, n - 1);
/** What a regular sees: the dead cards (the player's face-up hand) and its own streak. */
const read = (dead = '', streak = 0): TcpRead => ({ dead: c(dead), streak });

function rigged(codes: string, seed = 1) {
  const shoe = new Shoe(1, 1.01, seededRng(seed));
  shoe.stack = parseCards(codes);
  return shoe;
}

/** `n` different random cards. */
function draw(rng: Rng, n: number, from: Card[] = Array.from({ length: 52 }, (_, i) => i)): Card[] {
  const pool = [...from];
  return Array.from({ length: n }, () => pool.splice(rng(pool.length), 1)[0]);
}

describe('mindsets', () => {
  it('calculated plays exactly Q-6-4 when no card is showing', () => {
    for (let a = 0; a < 52; a++)
      for (let b = a + 1; b < 52; b++)
        for (let d = b + 1; d < 52; d++) {
          const h = [a, b, d];
          expect(countedPlay(h, [])).toBe(shouldPlay(eval3(h)));
        }
    expect(aiPlays('calculated', c('Qs 6d 4c'), read(), fixed(0))).toBe(true);
    expect(aiPlays('calculated', c('Qs 6d 3c'), read(), fixed(0))).toBe(false);
  });

  it("calculated counts the player's face-up cards as dead cards", () => {
    // [own hand, dead cards, plays]
    const cases: [string, string, boolean][] = [
      ['Qs 6d 4c', '2h 3h 5d', false], // low cards gone: the dealer qualifies more often
      ['Qs 7d 5c', '2h 3h 4d', false],
      ['Qs 6d 4c', 'Ah Kd Qh', true],
      ['Qs 6d 3c', 'Ah Kd Qh', true], // high cards gone: the dealer qualifies less often
      ['Qs 3d 2c', 'Ah Kd Kh', true],
      ['Qs 8d 3c', '2h 3h 4d', true],
      ['Js 9d 4c', 'Ah Kd Qh', true], // even Jack high, with three of them out
      ['Js 9d 4c', 'Ah Kd 2h', false],
      ['7s 5d 2c', 'Ah Ad Kh', true],
      ['7s 5d 2c', 'Ah Ad 9h', false],
      ['Ks 3d 2c', '4h 5h 6d', true],
      ['3s 3d 2c', '4h 5h 6d', true],
    ];
    for (const [own, dead, plays] of cases) {
      expect(aiPlays('calculated', c(own), read(dead), fixed(0)), `${own} | ${dead}`).toBe(plays);
      expect(playEv(c(own), c(dead)) > -1).toBe(plays);
    }
  });

  it("countedPlay's shortcuts agree with the exact sum", () => {
    const rng = seededRng(31);
    const QKA = Array.from({ length: 52 }, (_, i) => i).filter((x) => rankOf(x) >= 12);
    let n = 0;
    while (n < 2500) {
      // a high-card hand of King high or less, with any three dead cards or three Queens or better
      const own = draw(rng, 3);
      const h = eval3(own);
      if (h.cat !== Cat3.High || h.ranks[0] > 13) continue;
      const rest = Array.from({ length: 52 }, (_, i) => i).filter((x) => !own.includes(x));
      const dead = n % 3 === 0 ? draw(rng, 3, QKA.filter((x) => !own.includes(x))) : draw(rng, 3, rest);
      expect(countedPlay(own, dead), `${own} | ${dead}`).toBe(playEv(own, dead) > -1);
      n++;
    }
  });

  it('aggressive plays Queen high or better and Jack-Ten', () => {
    expect(aiPlays('aggressive', c('Qs 3d 2c'), read(), fixed(0))).toBe(true);
    expect(aiPlays('aggressive', c('Js Td 2c'), read(), fixed(0))).toBe(true);
    expect(aiPlays('aggressive', c('Js 9d 8c'), read(), fixed(0))).toBe(false);
    expect(aiPlays('aggressive', c('Ts 9d 7c'), read(), fixed(0))).toBe(false);
    expect(aiPlays('aggressive', c('2s 2d 7c'), read(), fixed(0))).toBe(true);
    expect(aiPlays('aggressive', c('Ks 3d 2c'), read('Ah Ad Ac'), fixed(0))).toBe(true);
  });

  it('conservative plays only K high or better', () => {
    expect(aiPlays('conservative', c('Ks 3d 2c'), read(), fixed(0))).toBe(true);
    expect(aiPlays('conservative', c('As 3d 2h'), read(), fixed(0))).toBe(true);
    expect(aiPlays('conservative', c('Qs Jd 9c'), read(), fixed(0))).toBe(false); // Q-6-4 would play it
    expect(aiPlays('conservative', c('3s 3d 7c'), read(), fixed(0))).toBe(true);
    expect(aiPlays('conservative', c('4s 6s 9s'), read(), fixed(0))).toBe(true); // a flush
    expect(kingHighOrBetter(eval3(c('Ks Qd Jc')))).toBe(true); // a straight
  });

  it('hybrid plays Q-6-4 and leans with its streak on borderline Queens', () => {
    expect(borderline(eval3(c('Qs 7d 6c')))).toBe(true);
    expect(borderline(eval3(c('Qs 3d 2c')))).toBe(true);
    expect(borderline(eval3(c('Qs 8d 2c')))).toBe(false);
    expect(borderline(eval3(c('Js Td 8c')))).toBe(false);
    for (const s of [-1, 0, 1]) {
      expect(aiPlays('hybrid', c('Qs 5d 3c'), read('', s), fixed(0))).toBe(false);
      expect(aiPlays('hybrid', c('Qs 6d 4c'), read('', s), fixed(0))).toBe(true);
    }
    expect(aiPlays('hybrid', c('Qs 5d 3c'), read('', 2), fixed(0))).toBe(true);
    expect(aiPlays('hybrid', c('Qs 3d 2c'), read('', 3), fixed(0))).toBe(true);
    expect(aiPlays('hybrid', c('Qs 6d 4c'), read('', -2), fixed(0))).toBe(false);
    expect(aiPlays('hybrid', c('Qs 7d 6c'), read('', -3), fixed(0))).toBe(false);
    // clear hands don't move
    expect(aiPlays('hybrid', c('Qs 8d 2c'), read('', -5), fixed(0))).toBe(true);
    expect(aiPlays('hybrid', c('Ks 3d 2c'), read('', -5), fixed(0))).toBe(true);
    expect(aiPlays('hybrid', c('Js Td 8c'), read('', 5), fixed(0))).toBe(false);
    expect(aiPlays('hybrid', c('5s 5d 2c'), read('', -5), fixed(0))).toBe(true);
  });

  it('hunch follows Q-6-4 three times in four, flips the fourth without a pair, never folds a pair', () => {
    for (const k of [0, 1, 2, 3]) expect(aiPlays('hunch', c('7s 7d 2c'), read(), fixed(k))).toBe(true);
    expect(aiPlays('hunch', c('Ks 3d 2c'), read(), fixed(1))).toBe(true);
    expect(aiPlays('hunch', c('Ks 3d 2c'), read(), fixed(0))).toBe(false);
    expect(aiPlays('hunch', c('Js 3d 2c'), read(), fixed(3))).toBe(false);
    expect(aiPlays('hunch', c('Js 3d 2c'), read(), fixed(0))).toBe(true);
    const rng = seededRng(7);
    const shoe = new Shoe(1, 1.01, seededRng(8));
    let flipped = 0;
    const n = 8000;
    for (let i = 0; i < n; i++) {
      shoe.shuffle();
      const h = [shoe.draw(), shoe.draw(), shoe.draw()];
      if (aiPlays('hunch', h, read(), rng) !== shouldPlay(eval3(h))) flipped++;
    }
    // high-card hands are 74.4% of all hands, a quarter of them flipped
    expect(flipped / n).toBeGreaterThan(0.16);
    expect(flipped / n).toBeLessThan(0.21);
  });

  it('bets an Ante of 10 to 100 by mindset; Pair Plus by mindset, never for the counter', () => {
    const rng = seededRng(5);
    const ranges: Record<Mindset, [number, number]> = { calculated: [30, 30], aggressive: [60, 100], conservative: [10, 30], hybrid: [30, 30], hunch: [10, 100] };
    const ppShare: Record<Mindset, number> = { calculated: 0, aggressive: 0, conservative: 0, hybrid: 0, hunch: 0 };
    const N = 3000;
    for (const m of MINDSETS) {
      const [lo, hi] = ranges[m];
      for (let i = 0; i < N; i++) {
        const b = aiBets(m, 10000, newMemory(), rng);
        expect(b.ante % 5).toBe(0);
        expect(b.ante).toBeGreaterThanOrEqual(lo);
        expect(b.ante).toBeLessThanOrEqual(hi);
        if (b.pairPlus) {
          ppShare[m]++;
          expect(b.pairPlus).toBe(Math.max(5, Math.floor(b.ante / 10) * 5)); // half the Ante
        }
      }
    }
    expect(ppShare.calculated).toBe(0);
    const share = (m: Mindset) => ppShare[m] / N;
    expect(share('aggressive')).toBeGreaterThan(0.75);
    expect(share('aggressive')).toBeLessThan(0.85);
    expect(share('conservative')).toBeGreaterThan(0.07);
    expect(share('conservative')).toBeLessThan(0.13);
    expect(share('hybrid')).toBeGreaterThan(0.21);
    expect(share('hybrid')).toBeLessThan(0.29);
    expect(share('hunch')).toBeGreaterThan(0.45);
    expect(share('hunch')).toBeLessThan(0.55);
    // hybrid presses half of a win
    const mem = newMemory();
    remember(mem, 'hybrid', 60);
    expect(aiBets('hybrid', 10000, mem, fixed(9)).ante).toBe(60);
  });

  it('never bets more than the Ante, Play and Pair Plus it can cover', () => {
    const rng = seededRng(9);
    for (const m of MINDSETS)
      for (let chips = 0; chips <= 400; chips += 5) {
        const b = aiBets(m, chips, newMemory(), rng);
        expect(2 * b.ante + b.pairPlus).toBeLessThanOrEqual(chips);
        if (b.ante) expect(b.ante).toBeGreaterThanOrEqual(PT.aiMin);
        if (!isBroke(chips)) expect(b.ante).toBeGreaterThanOrEqual(PT.aiMin);
      }
    expect(aiBets('aggressive', 120, newMemory(), fixed(2))).toEqual({ ante: 60, pairPlus: 0 }); // capped to half the chips
    expect(aiBets('aggressive', 15, newMemory(), fixed(0))).toEqual({ ante: 0, pairPlus: 0 });
    expect(isBroke(19)).toBe(true);
    expect(isBroke(20)).toBe(false);
  });
});

describe('PartyTcpRound', () => {
  const seats = (antes: number[], pp: number[] = [0, 0, 0, 0, 0]): SeatIn[] => antes.map((ante, i) => ({ ante, pairPlus: pp[i], mind: i === 2 ? null : 'calculated' }));

  it('deals three rounds from first base, the dealer last in each round', () => {
    const shoe = rigged('2s 3s 4s 5s 6s 7h 2d 3d 4d 5d 6d 8h 2c 3c 4c 5c 6c 9h');
    const r = new PartyTcpRound(shoe, seats([10, 10, 10, 10, 10]));
    const ev = r.deal();
    expect(ev.map((e) => (e.t === 'card' ? `s${e.seat}` : 'd')).join(' ')).toBe('s0 s1 s2 s3 s4 d s0 s1 s2 s3 s4 d s0 s1 s2 s3 s4 d');
    expect(r.seats[0].cards).toEqual(c('2s 2d 2c'));
    expect(r.seats[4].cards).toEqual(c('6s 6d 6c'));
    expect(r.dealer).toEqual(c('7h 8h 9h'));
    // only the player's seat plays face up
    expect(r.faceUp).toEqual(c('4s 4d 4c'));
  });

  it('seats decide in turn order', () => {
    const r = new PartyTcpRound(new Shoe(1, 1.01, seededRng(3)), seats([10, 10, 10, 10, 10]));
    r.deal();
    expect(r.next).toBe(0);
    expect(() => r.decide(1, true)).toThrow();
    r.decide(0, true);
    r.decide(1, false);
    expect(r.next).toBe(2);
    r.decide(2, true);
    r.decide(3, true);
    r.decide(4, false);
    expect(r.next).toBe(-1);
  });

  it('settles every seat against the same dealer with settleTcp', () => {
    // pass 1..3: s0 s1 s2 s3 s4 dealer
    // s0 Ks Kd 2c (pair)    s1 Js 9d 4c (J high)   s2 Ah Kh Qh (straight flush)
    // s3 5s 5d 5c (trips)   s4 7c 8d 3h (8 high)   dealer Qs Td 6c (Q high: qualifies)
    const shoe = rigged('Ks Js Ah 5s 7c Qs Kd 9d Kh 5d 8d Td 2c 4c Qh 5c 3h 6c');
    const r = new PartyTcpRound(shoe, seats([10, 20, 25, 40, 50], [5, 0, 10, 10, 0]));
    r.deal();
    r.decide(0, true);
    r.decide(1, false);
    r.decide(2, true);
    r.decide(3, true);
    r.decide(4, true);
    const res = r.settle();
    // pair beats Q high: Ante 1:1 + Play 1:1; Pair Plus 1:1
    expect(res[0].ret).toEqual({ ante: 20, play: 20, pairPlus: 10 });
    // fold: the Ante is lost, no Play
    expect(res[1]).toMatchObject({ played: false, bets: { ante: 20, play: 0, pairPlus: 0 }, ret: { ante: 0, play: 0, pairPlus: 0 } });
    // straight flush: Ante 1:1 + bonus 5:1, Play 1:1, Pair Plus 40:1
    expect(res[2].ret).toEqual({ ante: 50 + 125, play: 50, pairPlus: 410 });
    expect(res[2]).toMatchObject({ wager: 60, total: 635 });
    // trips: Ante + bonus 4:1, Play, Pair Plus 30:1
    expect(res[3].ret).toEqual({ ante: 80 + 160, play: 80, pairPlus: 310 });
    // 8 high loses Ante and Play
    expect(res[4].ret).toEqual({ ante: 0, play: 0, pairPlus: 0 });
    for (const s of res) expect(s.tcp).toEqual(settleTcp(r.seats[s.seat].cards, r.dealer, { ante: s.bets.ante, pairPlus: s.bets.pairPlus, lucky6: 0 }, s.played));
  });

  it('a dealer without Queen high pays the Ante and pushes the Play', () => {
    // dealer J 9 4 does not qualify; s0 plays 7 high and still gets the Ante paid
    const shoe = rigged('7s 2h 3h 4h 5h Js 5d 8d 9d Td Jd 9c 2c 3c 4c 6c Ac 4s');
    const r = new PartyTcpRound(shoe, seats([10, 10, 10, 10, 10]));
    r.deal();
    expect(dealerQualifies(eval3(r.dealer))).toBe(false);
    for (let s = 0; s < 5; s++) r.decide(s, s !== 1);
    const res = r.settle();
    expect(res[0].ret).toEqual({ ante: 20, play: 10, pairPlus: 0 });
    expect(res[1].ret).toEqual({ ante: 0, play: 0, pairPlus: 0 });
  });

  it('a folded hand still settles its Pair Plus', () => {
    const shoe = rigged('8s 2h 3h 4h 5h Qs 8d 7d 9d Td Jd Kc 2c 3c 4c 6c Ac 4s');
    const r = new PartyTcpRound(shoe, seats([10, 10, 10, 10, 10], [5, 0, 0, 0, 0]));
    r.deal();
    for (let s = 0; s < 5; s++) r.decide(s, s !== 0);
    const [s0] = r.settle();
    expect(s0.tcp.player.cat).toBe(Cat3.Pair);
    expect(s0).toMatchObject({ played: false, ret: { ante: 0, play: 0, pairPlus: 10 }, wager: 15, total: 10 });
  });

  it('playOut plays the player by Q-6-4 and the regulars by mindset, the counter reading your cards', () => {
    const rng = seededRng(21);
    const minds: (Mindset | null)[] = ['aggressive', 'hunch', null, 'conservative', 'calculated'];
    for (let i = 0; i < 500; i++) {
      const r = new PartyTcpRound(new Shoe(1, 1.01, seededRng(100 + i)), minds.map((mind) => ({ ante: 10, pairPlus: 5, mind })));
      const res = playOut(r, rng);
      const all = [...r.dealer, ...r.seats.flatMap((s) => s.cards)];
      expect(new Set(all).size).toBe(18);
      expect(res[0].played).toBe(aiPlays('aggressive', r.seats[0].cards, read(), fixed(0)));
      expect(res[2].played).toBe(shouldPlay(eval3(r.seats[2].cards)));
      expect(res[3].played).toBe(kingHighOrBetter(eval3(r.seats[3].cards)));
      expect(res[4].played).toBe(countedPlay(r.seats[4].cards, r.seats[2].cards));
      for (const s of res) expect(s.total).toBe(s.ret.ante + s.ret.play + s.ret.pairPlus);
    }
  });
});

describe('layout', () => {
  type P = { x: number; z: number };
  const corners = (g: TcpSeatGeo): P[] => [
    onTable(g, -g.halfW, g.bottom),
    onTable(g, g.halfW, g.bottom),
    onTable(g, g.halfW, g.top),
    onTable(g, -g.halfW, g.top),
  ];
  /** Separating-axis gap between two convex polygons (negative when they overlap). */
  function gap(a: P[], b: P[]) {
    let best = -Infinity;
    for (const poly of [a, b])
      poly.forEach((p, i) => {
        const q = poly[(i + 1) % poly.length];
        const n = { x: q.z - p.z, z: p.x - q.x };
        const len = Math.hypot(n.x, n.z);
        const pa = a.map((r) => (r.x * n.x + r.z * n.z) / len);
        const pb = b.map((r) => (r.x * n.x + r.z * n.z) / len);
        best = Math.max(best, Math.min(...pb) - Math.max(...pa), Math.min(...pa) - Math.max(...pb));
      });
    return best;
  }

  it('keeps the seat boxes clear of each other from no stretch to full stretch', () => {
    for (const stretch of [1, 1.1, 1.2, 1.3, 1.45]) {
      const geos = seatLayout(1.1, stretch);
      for (let i = 0; i < geos.length - 1; i++) expect(gap(corners(geos[i]), corners(geos[i + 1]))).toBeGreaterThan(0.08);
      expect(geos[PLAYER_SEAT]).toMatchObject({ x: 0, yaw: 0, big: true });
      // the curve: the seats rise toward the dealer away from the middle, symmetric
      expect(geos[0].z).toBeLessThan(geos[1].z);
      expect(geos[1].z).toBeLessThan(geos[2].z);
      expect(geos[0].x).toBeCloseTo(-geos[4].x, 9);
    }
  });

  it('fits the cards, the ring column and the payouts inside each box', () => {
    for (const g of seatLayout(1.1, 1)) {
      expect(g.colX - g.ringR).toBeGreaterThan(-g.halfW);
      expect(g.colX + PAY_DX + 0.21).toBeLessThan(g.halfW);
      expect(g.ring.play - g.ringR).toBeGreaterThan(g.bottom);
      // rings in a column, PAIR PLUS toward the dealer, clear of each other and of the cards
      expect(RINGS.map((id) => g.ring[id])).toEqual([...RINGS.map((id) => g.ring[id])].sort((a, b) => b - a));
      expect(g.ring.pairPlus - g.ring.ante).toBeGreaterThan(2 * g.ringR);
      for (let i = 0; i < 3; i++) {
        const f = cardPlace(g, i);
        for (const [dx, dy] of [[-0.315, -0.44], [0.315, -0.44], [0.315, 0.44], [-0.315, 0.44]]) {
          const lx = f.lx + dx * Math.cos(f.yaw) + dy * Math.sin(f.yaw);
          const ly = f.ly - dx * Math.sin(f.yaw) + dy * Math.cos(f.yaw);
          expect(Math.abs(lx)).toBeLessThan(g.halfW);
          expect(ly).toBeLessThan(g.top);
          expect(ly).toBeGreaterThan(g.ring.pairPlus + g.ringR);
        }
      }
      expect(g.tag).toBeGreaterThan(g.top);
      expect(g.plate).toBeLessThan(g.bottom);
    }
  });
});

// --------------------------------------------------------------------------- RTP

/** Every three-card hand of one deck with its score, its qualifying flag and its card mask. */
function allHands() {
  const cards: Card[][] = [];
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) for (let d = b + 1; d < 52; d++) cards.push([a, b, d]);
  const n = cards.length;
  const score = new Int32Array(n);
  const qual = new Uint8Array(n);
  const lo = new Int32Array(n);
  const hi = new Int32Array(n);
  cards.forEach((h, i) => {
    const e = eval3(h);
    score[i] = e.score;
    qual[i] = dealerQualifies(e) ? 1 : 0;
    for (const x of h) {
      if (x < 26) lo[i] |= 1 << x;
      else hi[i] |= 1 << (x - 26);
    }
  });
  return { cards, n, score, qual, lo, hi };
}

/**
 * Exact enumeration: for every player hand, how the 18,424 dealer hands from the other 49 cards
 * fall: not qualifying, qualifying and beaten, tied, or beating the player.
 */
function dealerCounts() {
  const H = allHands();
  const counts = new Int32Array(H.n * 4);
  for (let p = 0; p < H.n; p++) {
    const sp = H.score[p];
    const pl = H.lo[p];
    const ph = H.hi[p];
    let nq = 0;
    let win = 0;
    let tie = 0;
    let lose = 0;
    for (let d = 0; d < H.n; d++) {
      if ((H.lo[d] & pl) | (H.hi[d] & ph)) continue;
      if (!H.qual[d]) nq++;
      else if (sp > H.score[d]) win++;
      else if (sp === H.score[d]) tie++;
      else lose++;
    }
    counts.set([nq, win, tie, lose], p * 4);
  }
  return { H, counts };
}

describe('RTP', () => {
  const { H, counts } = dealerCounts();
  const DEALERS = 18424;

  it('every player hand meets 18,424 dealer hands', () => {
    for (let p = 0; p < H.n; p += 997) expect(counts[p * 4] + counts[p * 4 + 1] + counts[p * 4 + 2] + counts[p * 4 + 3]).toBe(DEALERS);
  });

  /** Average total return per unit of Ante when playing (Ante + Play + bonus), from the counts. */
  const playRet = (p: number) => {
    const [nq, win, tie] = [counts[p * 4], counts[p * 4 + 1], counts[p * 4 + 2]];
    const bonus = ANTE_BONUS[eval3(H.cards[p]).cat] ?? 0;
    return (3 * nq + 4 * win + 2 * tie) / DEALERS + bonus;
  };

  it("the counter's exact sum (playEv) matches the enumeration", () => {
    for (let p = 0; p < H.n; p += 97) expect(playEv(H.cards[p], [])).toBeCloseTo(playRet(p) - 2, 12);
  });

  /**
   * Exact Ante/Play figures for a decision rule (probability of playing each hand): the return of
   * the Ante (1 + net per Ante) and the return of everything wagered (Ante + Play).
   */
  function antePlay(pPlay: (cards: Card[]) => number) {
    let ret = 0;
    let play = 0;
    for (let p = 0; p < H.n; p++) {
      const q = pPlay(H.cards[p]);
      ret += q * playRet(p);
      play += q;
    }
    ret /= H.n;
    play /= H.n;
    return { perAnte: ret - play, perWager: ret / (1 + play), playRate: play };
  }

  const q64 = (h: Card[]) => (shouldPlay(eval3(h)) ? 1 : 0);
  const rule = (m: Mindset, streak = 0) => (h: Card[]) => (aiPlays(m, h, read('', streak), fixed(1)) ? 1 : 0);
  /** The mindsets with no card showing (calculated is then exactly Q-6-4); hybrid at a neutral, hot and cold streak. */
  const rules: Record<string, (h: Card[]) => number> = {
    player: q64,
    calculated: rule('calculated'),
    aggressive: rule('aggressive'),
    conservative: rule('conservative'),
    hybrid: rule('hybrid'),
    'hybrid (hot)': rule('hybrid', 3),
    'hybrid (cold)': rule('hybrid', -3),
    hunch: (h) => (eval3(h).cat > Cat3.High ? 1 : shouldPlay(eval3(h)) ? 0.75 : 0.25),
  };

  it('Ante/Play with Q-6-4 returns 96.63% of the Ante (exact)', () => {
    const r = antePlay(q64);
    expect(r.perAnte).toBeCloseTo(0.96626, 4);
    expect(r.perWager).toBeGreaterThan(0.979);
    expect(r.perWager).toBeLessThan(0.981);
    // no other threshold does better: Q-6-4 is the optimal strategy
    for (const p of Object.values(rules)) expect(antePlay(p).perAnte).toBeLessThanOrEqual(r.perAnte + 1e-12);
    // and it is exactly the best rule: play every hand whose Play bet gains (playing nets more than -1 Ante)
    let best = 0;
    for (let p = 0; p < H.n; p++) best += Math.max(playRet(p) - 1, 0);
    expect(best / H.n).toBeCloseTo(r.perAnte, 12);
  });

  /** Exact Pair Plus return for a pay table (to 1 by hand category). */
  function pairPlusRtp(pays: Partial<Record<Cat3, number>>) {
    let ret = 0;
    for (const h of H.cards) {
      const m = pays[eval3(h).cat] ?? 0;
      if (m) ret += 1 + m;
    }
    return ret / H.n;
  }

  it('Pair Plus with the Three Card table (exact)', () => {
    const cats = new Map<Cat3, number>();
    for (const h of H.cards) cats.set(eval3(h).cat, (cats.get(eval3(h).cat) ?? 0) + 1);
    expect([Cat3.StraightFlush, Cat3.Trips, Cat3.Straight, Cat3.Flush, Cat3.Pair].map((k) => cats.get(k))).toEqual([48, 52, 720, 1096, 3744]);
    const rtp = pairPlusRtp(PAIR_PLUS);
    const expected = (48 * 41 + 52 * 31 + 720 * 7 + 1096 * (1 + PAIR_PLUS[Cat3.Flush]!) + 3744 * 2) / 22100;
    expect(rtp).toBeCloseTo(expected, 12);
    // the shared table pays a flush 3:1 (92.72%); the common 40-30-6-4-1 table would return 97.68%
    expect(pairPlusRtp({ ...PAIR_PLUS, [Cat3.Flush]: 3 })).toBeCloseTo(0.92724, 5);
    expect(pairPlusRtp({ ...PAIR_PLUS, [Cat3.Flush]: 4 })).toBeCloseTo(0.97683, 5);
    console.log(`Pair Plus RTP (flush ${PAIR_PLUS[Cat3.Flush]}:1): ${(rtp * 100).toFixed(2)}%`);
  });

  it('the mindsets with no card showing (exact)', () => {
    const out: string[] = [];
    for (const [name, p] of Object.entries(rules)) {
      const r = antePlay(p);
      out.push(`${name} ${(r.perAnte * 100).toFixed(2)}% of the Ante (${(r.perWager * 100).toFixed(2)}% of the wager, plays ${(r.playRate * 100).toFixed(1)}%)`);
    }
    console.log(`Ante/Play RTP by rule:\n  ${out.join('\n  ')}`);
    const rtp = Object.fromEntries(Object.entries(rules).map(([k, p]) => [k, antePlay(p).perAnte]));
    expect(rtp.calculated).toBe(rtp.player);
    expect(rtp.hybrid).toBe(rtp.player);
    for (const k of ['aggressive', 'conservative', 'hybrid (hot)', 'hybrid (cold)', 'hunch']) expect(rtp[k]).toBeLessThan(rtp.calculated);
    expect(rtp.hunch).toBeLessThan(rtp.conservative);
  });

  it('a seeded simulation of full tables agrees with the enumeration (the seats are exchangeable)', () => {
    const rng = seededRng(2024);
    const shoe = new Shoe(1, 1.01, seededRng(99));
    const minds: (Mindset | null)[] = ['aggressive', 'hunch', null, 'conservative', 'calculated'];
    const ante = [0, 0, 0, 0, 0];
    const antePlayNet = [0, 0, 0, 0, 0];
    let pp = 0;
    let ppRet = 0;
    const N = 60000;
    for (let i = 0; i < N; i++) {
      shoe.shuffle();
      const r = new PartyTcpRound(shoe, minds.map((mind) => ({ ante: 10, pairPlus: 10, mind })));
      playOut(r, rng).forEach((s, k) => {
        ante[k] += s.bets.ante;
        antePlayNet[k] += s.ret.ante + s.ret.play - s.bets.ante - s.bets.play;
        pp += s.bets.pairPlus;
        ppRet += s.ret.pairPlus;
      });
    }
    const rtp = ante.map((a, k) => 1 + antePlayNet[k] / a);
    console.log('Simulated Ante/Play RTP (aggressive, hunch, player, conservative, calculated):', rtp.map((x) => (x * 100).toFixed(2)).join(' / '), `· Pair Plus ${((ppRet / pp) * 100).toFixed(2)}`);
    const exact = { aggressive: antePlay(rules.aggressive).perAnte, hunch: antePlay(rules.hunch).perAnte, player: antePlay(q64).perAnte, conservative: antePlay(rules.conservative).perAnte };
    expect(Math.abs(rtp[2] - exact.player)).toBeLessThan(0.012);
    expect(Math.abs(rtp[0] - exact.aggressive)).toBeLessThan(0.012);
    expect(Math.abs(rtp[1] - exact.hunch)).toBeLessThan(0.012);
    expect(Math.abs(rtp[3] - exact.conservative)).toBeLessThan(0.012);
    // the counter reads the player's cards: Q-6-4, nudged by the dead cards
    expect(Math.abs(rtp[4] - exact.player)).toBeLessThan(0.012);
    expect(Math.abs(ppRet / pp - pairPlusRtp(PAIR_PLUS))).toBeLessThan(0.012);
  });

  it('long run: calculated is the best mindset (every mindset playing the same seat-hands)', () => {
    const rng = seededRng(41);
    const shoe = new Shoe(1, 1.01, seededRng(42));
    // per mindset and regular's seat: a memory, as at the table
    const mems = MINDSETS.map(() => [0, 1, 2, 3].map(() => newMemory()));
    const wager = MINDSETS.map(() => 0);
    const back = MINDSETS.map(() => 0);
    // what the dead cards are worth to the counter: the exact value of each decision they change
    let gain = 0;
    let hands = 0;
    const N = 50000;
    for (let i = 0; i < N; i++) {
      shoe.shuffle();
      const r = new PartyTcpRound(shoe, [0, 1, 2, 3, 4].map((k) => ({ ante: 10, pairPlus: 0, mind: k === 2 ? null : 'calculated' })));
      r.deal();
      const dead = r.faceUp;
      const dh = eval3(r.dealer);
      const q = dealerQualifies(dh);
      [0, 1, 3, 4].forEach((seat, j) => {
        const cards = r.seats[seat].cards;
        const ph = eval3(cards);
        // total return of Ante + Play per Ante when playing; Pair Plus per unit
        const playBack = (!q ? 3 : ph.score > dh.score ? 4 : ph.score === dh.score ? 2 : 0) + (ANTE_BONUS[ph.cat] ?? 0);
        const ppBack = PAIR_PLUS[ph.cat] ? 1 + PAIR_PLUS[ph.cat]! : 0;
        MINDSETS.forEach((m, k) => {
          const mem = mems[k][j];
          const b = aiBets(m, 1e9, mem, rng);
          const play = aiPlays(m, cards, { dead, streak: mem.streak }, rng);
          const w = b.ante * (play ? 2 : 1) + b.pairPlus;
          const got = (play ? b.ante * playBack : 0) + b.pairPlus * ppBack;
          wager[k] += w;
          back[k] += got;
          remember(mem, m, got - w);
          if (m === 'calculated') {
            if (play !== shouldPlay(ph)) gain += Math.abs(playEv(cards, dead) + 1);
            hands++;
          }
        });
      });
    }
    const ret = back.map((b, k) => b / wager[k]);
    console.log(
      `Return per unit bet: ${MINDSETS.map((m, k) => `${m} ${(ret[k] * 100).toFixed(2)}%`).join(' · ')} · the dead cards add ${((gain / hands) * 100).toFixed(3)}% of the Ante`,
    );
    const [calculated, ...others] = ret;
    for (const o of others) expect(calculated).toBeGreaterThan(o);
    expect(gain).toBeGreaterThan(0);
  });
});
