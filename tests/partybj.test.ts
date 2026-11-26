import { describe, expect, it } from 'vitest';
import { parseCard, parseCards, Shoe, type Card } from '../src/core/cards';
import { seededRng, type Rng } from '../src/core/rng';
import { BlackjackRound, bjValue, handValue, type Actions } from '../src/games/blackjack/rules';
import { basicStrategy } from '../src/games/blackjack/strategy';
import { aiBet, aiMove, PartyRound, playOut, settleHand, type SeatIn, type Style } from '../src/games/partybj/rules';

const ALL: Actions = { hit: true, stand: true, double: true, split: true };
const NO_DBL: Actions = { hit: true, stand: true, double: false, split: false };
const c = (s: string) => parseCards(s);
const up = (s: string) => parseCard(s);
/** An rng that always returns the same draw (clamped to the range). */
const fixed = (k: number): Rng => (n) => Math.min(k, n - 1);

function rigged(codes: string, seed = 1) {
  const shoe = new Shoe(6, 0.75, seededRng(seed));
  shoe.stack = parseCards(codes);
  return shoe;
}

describe('AI styles', () => {
  it('bookish plays perfect basic strategy', () => {
    const ups = ['2s', '6h', '7d', 'Tc', 'As'].map(up);
    const hands = ['Ts 6d', '5c 6h', 'As 7d', '8s 8d', '4h 8c', 'Ac 2d', '9s 9h', 'Kd Qs'].map(c);
    for (const h of hands)
      for (const u of ups) for (const can of [ALL, NO_DBL]) expect(aiMove('bookish', h, u, can, fixed(0))).toBe(basicStrategy(h, u, can.double, can.split));
    expect(aiMove('bookish', c('5c 6h'), up('6h'), ALL, fixed(0))).toBe('double');
    expect(aiMove('bookish', c('8s 8d'), up('Tc'), ALL, fixed(0))).toBe('split');
  });

  it('cautious stands on 12 or more and never doubles or splits', () => {
    expect(aiMove('cautious', c('Ts 2d'), up('Ah'), ALL, fixed(0))).toBe('stand');
    expect(aiMove('cautious', c('As 2d'), up('Ah'), ALL, fixed(0))).toBe('stand'); // soft 13
    expect(aiMove('cautious', c('8s 8d'), up('6h'), ALL, fixed(0))).toBe('stand');
    expect(aiMove('cautious', c('As Ad'), up('6h'), ALL, fixed(0))).toBe('stand'); // soft 12
    expect(aiMove('cautious', c('5c 6h'), up('6h'), ALL, fixed(0))).toBe('hit');
    expect(aiMove('cautious', c('2c 3h 4d'), up('Ts'), ALL, fixed(0))).toBe('hit');
  });

  it('daring hits to 17, doubles a lot and splits most pairs', () => {
    expect(aiMove('daring', c('Ts 6d'), up('6h'), ALL, fixed(0))).toBe('hit'); // basic strategy stands
    expect(aiMove('daring', c('Ts 7d'), up('Ah'), ALL, fixed(0))).toBe('stand');
    expect(aiMove('daring', c('4s 4d'), up('Ah'), ALL, fixed(0))).toBe('split');
    expect(aiMove('daring', c('5s 5d'), up('Ah'), ALL, fixed(0))).toBe('double');
    expect(aiMove('daring', c('Ks Qd'), up('6h'), ALL, fixed(0))).toBe('stand');
    expect(aiMove('daring', c('3s 5d'), up('Th'), ALL, fixed(0))).toBe('double'); // hard 8
    expect(aiMove('daring', c('As 7d'), up('Th'), ALL, fixed(0))).toBe('double'); // soft 18
    expect(aiMove('daring', c('3s 5d'), up('Th'), NO_DBL, fixed(0))).toBe('hit');
    expect(aiMove('daring', c('As 7d'), up('Th'), NO_DBL, fixed(0))).toBe('stand'); // soft 18: already 17 or more
    expect(aiMove('daring', c('As 5d'), up('Th'), NO_DBL, fixed(0))).toBe('hit'); // soft 16
  });

  it('wildcard follows the book three times in four and deviates legally otherwise', () => {
    // rng(4) !== 0: the book move
    expect(aiMove('wildcard', c('Ts 6d'), up('Th'), ALL, fixed(1))).toBe('hit');
    // rng(4) === 0: some other legal move
    const dev = aiMove('wildcard', c('Ts 6d'), up('Th'), NO_DBL, fixed(0));
    expect(dev).toBe('stand');
    // never hits or doubles a hard 19+
    for (let k = 0; k < 4; k++) expect(['stand']).toContain(aiMove('wildcard', c('Ts 9d'), up('6h'), NO_DBL, fixed(0)));
    const rng = seededRng(7);
    let off = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) if (aiMove('wildcard', c('Ts 6d'), up('Th'), ALL, rng) !== 'hit') off++;
    expect(off / n).toBeGreaterThan(0.2);
    expect(off / n).toBeLessThan(0.3);
  });

  it('every style always picks a legal move', () => {
    const rng = seededRng(11);
    const shoe = new Shoe(6, 0.75, seededRng(3));
    for (let i = 0; i < 3000; i++) {
      const n = 2 + rng(3);
      const cards: Card[] = Array.from({ length: n }, () => shoe.draw());
      if (handValue(cards).total >= 21) continue;
      const pair = n === 2 && bjValue(cards[0]) === bjValue(cards[1]);
      const can: Actions = { hit: true, stand: true, double: n === 2 && rng(2) === 0, split: pair && rng(2) === 0 };
      for (const s of ['bookish', 'cautious', 'daring', 'wildcard'] as Style[]) {
        const m = aiMove(s, cards, shoe.draw(), can, rng);
        expect(can[m]).toBe(true);
      }
    }
  });

  it('bets 10 to 200 in steps of 5, by style, within the chips it has', () => {
    const rng = seededRng(5);
    const ranges: Record<Style, [number, number]> = { bookish: [25, 100], cautious: [10, 50], daring: [50, 200], wildcard: [10, 200] };
    for (const [s, [lo, hi]] of Object.entries(ranges) as [Style, [number, number]][]) {
      for (let i = 0; i < 300; i++) {
        const b = aiBet(s, 10000, rng);
        expect(b % 5).toBe(0);
        expect(b).toBeGreaterThanOrEqual(lo);
        expect(b).toBeLessThanOrEqual(hi);
      }
    }
    expect(aiBet('daring', 60, fixed(6))).toBe(60);
    expect(aiBet('daring', 7, fixed(0))).toBe(0);
  });
});

describe('PartyRound', () => {
  const seats = (bets: number[]): SeatIn[] => bets.map((bet, i) => ({ bet, style: i === 2 ? null : 'bookish' }));

  it('deals in seat order from first base, up card, second round, hole card', () => {
    const r = new PartyRound(rigged('2s 3s 4s 5s 6s 9h 2d 3d 4d 5d 6d 7h'), seats([10, 10, 10, 10, 10]));
    const ev = r.deal();
    const order = ev.map((e) => (e.t === 'card' ? `s${e.seat}` : e.t === 'dealer' ? (e.faceUp ? 'up' : 'hole') : e.t));
    expect(order).toEqual(['s0', 's1', 's2', 's3', 's4', 'up', 's0', 's1', 's2', 's3', 's4', 'hole']);
    expect(r.hands(0)[0].cards).toEqual(c('2s 2d'));
    expect(r.dealer).toEqual(c('9h 7h'));
    expect(r.phase).toBe('play');
  });

  it('settles every seat against the same dealer', () => {
    // pass 1: s0 Ts, s1 9h, s2 As, s3 8c, s4 5d, up 6h | pass 2: s0 6c, s1 9d, s2 Kd, s3 8s, s4 6s, hole Th
    // then: s0 hit 5c (21) · s1 hit Qs (bust) · s3 split: 3h, double 9c (20), second hand 2d, hit Kc (20)
    // s4 double 8h (19) · dealer 16 draws 3d = 19
    const shoe = rigged('Ts 9h As 8c 5d 6h 6c 9d Kd 8s 6s Th 5c Qs 3h 9c 2d Kc 8h 3d');
    const r = new PartyRound(shoe, seats([100, 50, 25, 40, 20]));
    r.deal();
    expect(r.natural(2)).toBe(true);
    expect(r.live(2)).toBe(false);
    r.act(0, 'hit');
    expect(r.live(0)).toBe(false); // 21 ends the hand
    r.act(1, 'hit');
    expect(r.live(1)).toBe(false);
    const sp = r.act(3, 'split');
    expect(sp.some((e) => e.t === 'split' && e.seat === 3)).toBe(true);
    r.act(3, 'double');
    expect(r.activeHand(3)).toBe(1);
    expect(r.hands(3)[1].cards.length).toBe(2);
    r.act(3, 'hit');
    r.act(3, 'stand');
    expect(r.live(3)).toBe(false);
    r.act(4, 'double');
    const dv = r.playDealer();
    expect(dv[0]).toEqual({ t: 'flipHole' });
    expect(r.dealer).toEqual(c('6h Th 3d'));
    expect(dv.at(-1)).toEqual({ t: 'dealerDone', total: 19, bust: false });
    const res = r.settle();
    expect(res.map((s) => s.hands)).toEqual([
      [{ outcome: 'win', bet: 100, ret: 200 }],
      [{ outcome: 'bust', bet: 50, ret: 0 }],
      [{ outcome: 'blackjack', bet: 25, ret: 62.5 }],
      [
        { outcome: 'win', bet: 80, ret: 160 },
        { outcome: 'win', bet: 40, ret: 80 },
      ],
      [{ outcome: 'push', bet: 40, ret: 40 }],
    ]);
    expect(res[3]).toMatchObject({ wager: 120, ret: 240 });
  });

  it('a dealer blackjack ends the round at once; only a blackjack pushes', () => {
    const r = new PartyRound(rigged('As Ts 9s 8s 7s Ah Kd 9d 2s 3s 4s Kh'), seats([10, 10, 10, 10, 10]));
    const ev = r.deal();
    expect(ev.find((e) => e.t === 'peek')).toEqual({ t: 'peek', dealerBJ: true });
    expect([0, 1, 2, 3, 4].some((s) => r.live(s))).toBe(false);
    expect(r.playDealer()).toEqual([]);
    const res = r.settle();
    expect(res.map((s) => s.hands[0].outcome)).toEqual(['push', 'lose', 'lose', 'lose', 'lose']);
  });

  it('the dealer draws nothing when every hand busted or has a blackjack', () => {
    // s0 natural, everyone else busts; dealer 6+5 = 11 would have to draw otherwise
    const r = new PartyRound(rigged('As Ts Ts Ts Ts 6h Kd 6s 6s 6s 6s 5h Ks Ks Ks Ks'), seats([10, 10, 10, 10, 10]));
    r.deal();
    for (let s = 1; s < 5; s++) r.act(s, 'hit');
    const dv = r.playDealer();
    expect(dv).toEqual([{ t: 'flipHole' }, { t: 'dealerDone', total: 11, bust: false }]);
    expect(r.settle().map((s) => s.hands[0].outcome)).toEqual(['blackjack', 'bust', 'bust', 'bust', 'bust']);
  });

  it('a full table played by the AI styles settles each seat against the dealer', () => {
    const rng = seededRng(21);
    const styles: (Style | null)[] = ['daring', 'wildcard', null, 'cautious', 'bookish'];
    for (let i = 0; i < 400; i++) {
      const r = new PartyRound(new Shoe(6, 0.75, seededRng(100 + i)), styles.map((style) => ({ bet: 20, style })));
      const res = playOut(r, [500, 500, 500, 500, 500], rng);
      const d = handValue(r.dealer).total;
      const dealerBJ = r.dealer.length === 2 && d === 21;
      res.forEach((s, seat) => {
        r.hands(seat).forEach((h, k) => {
          const p = handValue(h.cards).total;
          const nat = !h.fromSplit && h.cards.length === 2 && p === 21;
          const want = p > 21 ? 0 : dealerBJ ? (nat ? h.bet : 0) : nat ? h.bet * 2.5 : d > 21 || p > d ? h.bet * 2 : p === d ? h.bet : 0;
          expect(s.hands[k].ret).toBe(want);
        });
        expect(s.ret).toBe(s.hands.reduce((a, h) => a + h.ret, 0));
      });
      // the dealer only stops short of 17 when nobody was left to beat
      if (d < 17 && !dealerBJ) expect(res.every((s) => s.hands.every((h) => h.outcome === 'bust' || h.outcome === 'blackjack'))).toBe(true);
    }
  });

  it('a lone seat plays exactly like the Blackjack table (same engine, same cards)', () => {
    for (let i = 0; i < 3000; i++) {
      const bj = new BlackjackRound(new Shoe(6, 0.75, seededRng(500 + i)), 10);
      bj.start();
      if (bj.phase === 'insurance') bj.insurance(false);
      while (bj.phase === 'player') {
        const a = bj.actions(1e9);
        const m = basicStrategy(bj.current.cards, bj.dealerUp, a.double, a.split);
        if (m === 'hit') bj.hit();
        else if (m === 'stand') bj.stand();
        else if (m === 'double') bj.double();
        else bj.split();
      }
      const pr = new PartyRound(new Shoe(6, 0.75, seededRng(500 + i)), [{ bet: 10, style: null }]);
      const [seat] = playOut(pr, [1e9], seededRng(1));
      expect(seat.hands).toEqual(bj.hands.map((h) => ({ outcome: h.outcome, bet: h.bet, ret: h.ret })));
      expect(pr.dealer).toEqual(bj.dealer);
    }
  });

  it('settleHand pays 3:2 for a natural, not for 21 after a split', () => {
    const h = (cards: string, fromSplit = false) => ({ cards: c(cards), bet: 10, doubled: false, done: true, fromSplit, splitAces: false });
    expect(settleHand(h('As Kd'), c('Ts 7d'))).toEqual({ outcome: 'blackjack', ret: 25 });
    expect(settleHand(h('As Kd', true), c('Ts 7d'))).toEqual({ outcome: 'win', ret: 20 });
    expect(settleHand(h('As Kd', true), c('Ts Ad'))).toEqual({ outcome: 'lose', ret: 0 });
    expect(settleHand(h('Ts 5d 6c'), c('Ts 5d 6c'))).toEqual({ outcome: 'push', ret: 10 });
  });
});

describe('RTP (seeded simulation)', () => {
  it('basic strategy returns about 99.5%; the other styles give more to the house', () => {
    const rng = seededRng(2024);
    const shoe = new Shoe(6, 0.8, seededRng(99));
    const styles: (Style | null)[] = ['daring', 'wildcard', null, 'cautious', 'bookish'];
    const wager = [0, 0, 0, 0, 0];
    const back = [0, 0, 0, 0, 0];
    const N = 120000;
    for (let i = 0; i < N; i++) {
      if (shoe.needsShuffle) shoe.shuffle();
      const r = new PartyRound(shoe, styles.map((style) => ({ bet: 10, style })));
      const res = playOut(r, [1e9, 1e9, 1e9, 1e9, 1e9], rng);
      res.forEach((s, k) => {
        wager[k] += s.wager;
        back[k] += s.ret;
      });
    }
    const rtp = back.map((b, k) => b / wager[k]);
    // the player's seat and the bookish regular both play the book
    expect(rtp[2]).toBeGreaterThan(0.985);
    expect(rtp[2]).toBeLessThan(1.01);
    expect(rtp[4]).toBeGreaterThan(0.985);
    expect(rtp[4]).toBeLessThan(1.01);
    // cautious and daring leave a lot more to the house
    expect(rtp[3]).toBeLessThan(rtp[4] - 0.02);
    expect(rtp[0]).toBeLessThan(rtp[4] - 0.02);
    console.log('RTP by seat (daring, wildcard, player, cautious, bookish):', rtp.map((x) => (x * 100).toFixed(2)).join(' / '));
  });
});
