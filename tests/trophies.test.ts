import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/core/storage';
import { BRAZIL_GAMES, COMEBACK_HIGH, SIGNATURES, Trophies, trophyList } from '../src/core/trophies';
import { GAMES } from '../src/games/registry';

const games = GAMES.map((g) => ({ id: g.id, title: g.title }));
const make = (kv = new MemoryStore()) => new Trophies(games, kv, () => 1000);
const ids = (list: { id: string }[]) => list.map((d) => d.id);

describe('trophy list', () => {
  it('has unique ids, three per table and one platinum', () => {
    const list = trophyList(games);
    expect(new Set(ids(list)).size).toBe(list.length);
    for (const g of games) expect(list.filter((d) => d.game === g.id)).toHaveLength(3);
    expect(list.filter((d) => d.tier === 'platinum')).toHaveLength(1);
  });

  it('every table has a signature rule', () => {
    for (const g of games) expect(SIGNATURES[g.id], g.id).toBeDefined();
  });
});

describe('trophy engine', () => {
  it('first hand, streak and career hands', () => {
    const tr = make();
    expect(ids(tr.hand('blackjack', 25, -25, 4975, 1))).toEqual(['blackjack.first']);
    tr.hand('blackjack', 25, 25, 5000, 1);
    tr.hand('blackjack', 25, 0, 5000, 1); // a push keeps the streak
    tr.hand('blackjack', 25, 25, 5025, 1);
    expect(tr.has('blackjack.streak')).toBe(false);
    expect(ids(tr.hand('blackjack', 25, 37.5, 5062.5, 1))).toContain('blackjack.streak');
    for (let i = 0; i < 5; i++) tr.hand('war', 10, -10, 5000, 1);
    expect(tr.has('hands.10')).toBe(true);
    expect(tr.progress(tr.get('hands.100')!)).toBe(10);
  });

  it('signature by event only for the matching table and event', () => {
    const tr = make();
    expect(tr.event('blackjack', 'sweep')).toEqual([]);
    expect(ids(tr.event('blackjack', 'big'))).toEqual(['blackjack.sig']);
    expect(ids(tr.event('manilhadraw', 'sweep'))).toEqual(['manilhadraw.sig']);
    // tables whose signature is a number of wins ignore events
    expect(tr.event('baccarat', 'big')).toEqual([]);
  });

  it('signature by wins', () => {
    const tr = make();
    for (let i = 0; i < 24; i++) tr.hand('baccarat', 10, 10, 5000, 1);
    expect(tr.has('baccarat.sig')).toBe(false);
    expect(tr.progress(tr.get('baccarat.sig')!)).toBe(24);
    tr.hand('baccarat', 10, 10, 5000, 1);
    expect(tr.has('baccarat.sig')).toBe(true);
  });

  it('bankroll, bets and the comeback (refills do not count)', () => {
    const tr = make();
    tr.balance(12_000);
    expect(tr.has('bank.10000')).toBe(true);
    expect(tr.has('bank.25000')).toBe(false);
    tr.hand('uth', 1200, -1200, 300, 1);
    expect(tr.has('bet.1000')).toBe(true);
    expect(tr.refill(5000).map((d) => d.id)).toEqual(['refill']);
    tr.hand('uth', 10, 10, COMEBACK_HIGH, 1);
    expect(tr.has('comeback')).toBe(false);
    tr.hand('uth', 10, -10, 400, 1);
    tr.hand('uth', 4000, 4600, COMEBACK_HIGH, 1);
    expect(tr.has('comeback')).toBe(true);
  });

  it('explorer trophies and levels', () => {
    const tr = make();
    for (const g of BRAZIL_GAMES) tr.hand(g, 10, -10, 5000, 5);
    expect(tr.has('explore.5')).toBe(true);
    expect(tr.has('explore.brazil')).toBe(true);
    expect(tr.has('level.5')).toBe(true);
    expect(tr.has('level.10')).toBe(false);
  });

  it('platinum after every other trophy, and the state persists', () => {
    const kv = new MemoryStore();
    const tr = make(kv);
    for (const d of tr.list) if (d.tier !== 'platinum') tr.s.unlocked[d.id] = 1;
    delete tr.s.unlocked['refill'];
    const got = tr.refill(5000);
    expect(ids(got)).toEqual(['refill', 'platinum']);
    const again = make(kv);
    expect(again.has('platinum')).toBe(true);
    expect(again.counts().earned).toBe(again.list.length);
  });

  it('notifies listeners once per trophy', () => {
    const tr = make();
    const seen: string[] = [];
    tr.onEarn((e) => seen.push(...ids(e)));
    tr.hand('war', 10, 10, 5000, 1);
    tr.hand('war', 10, 10, 5000, 1);
    expect(seen.filter((x) => x === 'war.first')).toHaveLength(1);
  });
});
