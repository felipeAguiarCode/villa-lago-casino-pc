import type { KeyValueStore } from './storage';

/**
 * Trophies (PC edition): a PlayStation-style achievement list with bronze, silver, gold and one
 * platinum. Pure logic and persistence only; the screens live in src/ui/trophies.ts.
 *
 * Inputs come from the app: every finished hand (game, amount wagered, net result, balance and
 * level after it), special results the tables announce (`event`), balance changes and refills.
 */
export type Tier = 'bronze' | 'silver' | 'gold' | 'platinum';
export type TrophyCategory = 'career' | 'bankroll' | 'explorer' | 'games' | 'platinum';

export interface TrophyDef {
  id: string;
  tier: Tier;
  category: TrophyCategory;
  /** Game id for per-table trophies. */
  game?: string;
  /** i18n keys for the name and description; `vars` fill their placeholders. */
  name: string;
  desc: string;
  vars?: Record<string, string | number>;
  /** Target for trophies shown with a progress bar. */
  goal?: number;
  /** Icon: a game id (its pictogram) or an icon name from src/ui/icons.ts. */
  icon: string;
}

/** How each table's signature trophy is earned. */
export type Signature = { kind: 'event'; event: string } | { kind: 'wins'; n: number };

/** Every table: 'big' is sent when a table announces a special hand in gold (see kit.resultBanner). */
export const SIGNATURES: Record<string, Signature> = {
  blackjack: { kind: 'event', event: 'big' },
  videobj: { kind: 'wins', n: 25 },
  trump21: { kind: 'wins', n: 25 },
  threecard: { kind: 'wins', n: 25 },
  tcpfaceup: { kind: 'wins', n: 25 },
  slot3: { kind: 'event', event: 'big' },
  manilhadraw: { kind: 'event', event: 'sweep' },
  manilhaholdem: { kind: 'event', event: 'zap' },
  pifeexpress: { kind: 'event', event: 'perfect' },
  videopife: { kind: 'event', event: 'paid' },
  canastradraw: { kind: 'event', event: 'big' },
  dragontiger: { kind: 'event', event: 'big' },
  abyss: { kind: 'event', event: 'big' },
  showdown: { kind: 'event', event: 'big' },
  fourcard: { kind: 'event', event: 'big' },
  crazy4: { kind: 'event', event: 'big' },
  holdem3: { kind: 'event', event: 'big' },
  videopoker: { kind: 'event', event: 'big' },
  doubledraw: { kind: 'event', event: 'big' },
  hcf: { kind: 'event', event: 'big' },
  baccarat: { kind: 'wins', n: 25 },
  caribbean: { kind: 'event', event: 'big' },
  russian: { kind: 'event', event: 'big' },
  thb: { kind: 'event', event: 'big' },
  uth: { kind: 'wins', n: 25 },
  letitride: { kind: 'event', event: 'big' },
  paigow: { kind: 'wins', n: 25 },
  war: { kind: 'wins', n: 25 },
  reddog: { kind: 'wins', n: 25 },
  highlow: { kind: 'event', event: 'big' },
  redblack: { kind: 'event', event: 'big' },
  picknum: { kind: 'event', event: 'big' },
  roulette: { kind: 'event', event: 'big' },
  partybj: { kind: 'event', event: 'big' },
  coinflip: { kind: 'event', event: 'big' },
  horses: { kind: 'event', event: 'big' },
  partyuth: { kind: 'event', event: 'big' },
  vanunu: { kind: 'event', event: 'big' },
  craps: { kind: 'event', event: 'big' },
  partytrump: { kind: 'event', event: 'big' },
  partyhorses: { kind: 'event', event: 'big' },
  partystud: { kind: 'event', event: 'big' },
  stud7: { kind: 'event', event: 'big' },
  pokerdice: { kind: 'event', event: 'big' },
  suitpoker: { kind: 'event', event: 'big' },
  partytcp: { kind: 'event', event: 'big' },
};

export const BRAZIL_GAMES = ['manilhadraw', 'manilhaholdem', 'pifeexpress', 'videopife', 'canastradraw'];
export const MACHINE_GAMES = ['videopoker', 'videobj', 'videopife', 'slot3'];
const STREAK = 3;
const HAND_GOALS: [number, Tier][] = [
  [10, 'bronze'],
  [100, 'bronze'],
  [500, 'silver'],
  [2000, 'gold'],
];
const LEVEL_GOALS: [number, Tier][] = [
  [5, 'bronze'],
  [10, 'silver'],
  [25, 'gold'],
];
const BANK_GOALS: [number, Tier][] = [
  [10_000, 'bronze'],
  [25_000, 'silver'],
  [50_000, 'silver'],
  [100_000, 'gold'],
  [1_000_000, 'gold'],
];
const BET_GOALS: [number, Tier][] = [
  [1_000, 'bronze'],
  [5_000, 'silver'],
];
export const COMEBACK_LOW = 500;
export const COMEBACK_HIGH = 5_000;

/** Builds the full list for the given tables (ids in lobby order). */
export function trophyList(games: { id: string; title: string }[]): TrophyDef[] {
  const out: TrophyDef[] = [];
  for (const [n, tier] of HAND_GOALS) out.push({ id: `hands.${n}`, tier, category: 'career', name: `tr.hands.${n}`, desc: 'tr.hands.desc', vars: { n: n.toLocaleString('en-US') }, goal: n, icon: 'deal' });
  for (const [n, tier] of LEVEL_GOALS) out.push({ id: `level.${n}`, tier, category: 'career', name: `tr.level.${n}`, desc: 'tr.level.desc', vars: { n }, goal: n, icon: 'crown' });
  for (const [n, tier] of BANK_GOALS) out.push({ id: `bank.${n}`, tier, category: 'bankroll', name: `tr.bank.${n}`, desc: 'tr.bank.desc', vars: { n: n.toLocaleString('en-US') }, goal: n, icon: 'chips' });
  for (const [n, tier] of BET_GOALS) out.push({ id: `bet.${n}`, tier, category: 'bankroll', name: `tr.bet.${n}`, desc: 'tr.bet.desc', vars: { n: n.toLocaleString('en-US') }, icon: 'chip' });
  out.push({ id: 'comeback', tier: 'silver', category: 'bankroll', name: 'tr.comeback', desc: 'tr.comeback.desc', vars: { low: COMEBACK_LOW, high: COMEBACK_HIGH.toLocaleString('en-US') }, icon: 'redo' });
  out.push({ id: 'refill', tier: 'bronze', category: 'bankroll', name: 'tr.refill', desc: 'tr.refill.desc', icon: 'plus' });
  out.push({ id: 'explore.5', tier: 'bronze', category: 'explorer', name: 'tr.explore.5', desc: 'tr.explore.5.desc', goal: 5, icon: 'globe' });
  out.push({ id: 'explore.brazil', tier: 'silver', category: 'explorer', name: 'tr.explore.brazil', desc: 'tr.explore.brazil.desc', goal: BRAZIL_GAMES.length, icon: 'leaf' });
  out.push({ id: 'explore.machines', tier: 'bronze', category: 'explorer', name: 'tr.explore.machines', desc: 'tr.explore.machines.desc', goal: MACHINE_GAMES.length, icon: 'bolt' });
  out.push({ id: 'explore.all', tier: 'gold', category: 'explorer', name: 'tr.explore.all', desc: 'tr.explore.all.desc', goal: games.length, vars: { n: games.length }, icon: 'castle' });
  for (const g of games) {
    const sig = SIGNATURES[g.id] ?? { kind: 'wins', n: 25 };
    out.push({ id: `${g.id}.first`, tier: 'bronze', category: 'games', game: g.id, name: 'tr.first', desc: 'tr.first.desc', vars: { game: g.title }, icon: g.id });
    out.push({ id: `${g.id}.streak`, tier: 'bronze', category: 'games', game: g.id, name: 'tr.streak', desc: 'tr.streak.desc', vars: { game: g.title, n: STREAK }, goal: STREAK, icon: g.id });
    if (sig.kind === 'wins')
      out.push({ id: `${g.id}.sig`, tier: 'silver', category: 'games', game: g.id, name: 'tr.wins', desc: 'tr.wins.desc', vars: { game: g.title, n: sig.n }, goal: sig.n, icon: g.id });
    else out.push({ id: `${g.id}.sig`, tier: 'silver', category: 'games', game: g.id, name: `tr.sig.${g.id}`, desc: `tr.sig.${g.id}.desc`, vars: { game: g.title }, icon: g.id });
  }
  out.push({ id: 'platinum', tier: 'platinum', category: 'platinum', name: 'tr.platinum', desc: 'tr.platinum.desc', icon: 'trophy' });
  return out;
}

export interface TrophyState {
  /** Trophy id → time it was earned (ms). */
  unlocked: Record<string, number>;
  hands: Record<string, number>;
  wins: Record<string, number>;
  streak: Record<string, number>;
  bestStreak: Record<string, number>;
  totalHands: number;
  bestBalance: number;
  bestBet: number;
  /** The balance fell under COMEBACK_LOW (armed for the comeback trophy). */
  wentLow: boolean;
}

const KEY = 'vlc.pc.trophies.v1';
const empty = (): TrophyState => ({ unlocked: {}, hands: {}, wins: {}, streak: {}, bestStreak: {}, totalHands: 0, bestBalance: 0, bestBet: 0, wentLow: false });

export class Trophies {
  readonly list: TrophyDef[];
  private byId = new Map<string, TrophyDef>();
  s: TrophyState;
  private cbs = new Set<(earned: TrophyDef[]) => void>();

  constructor(
    games: { id: string; title: string }[],
    private kv: KeyValueStore,
    private now: () => number = () => Date.now(),
  ) {
    this.list = trophyList(games);
    for (const d of this.list) this.byId.set(d.id, d);
    this.s = this.load();
  }

  private load(): TrophyState {
    try {
      const raw = this.kv.getItem(KEY);
      if (raw) return { ...empty(), ...(JSON.parse(raw) as Partial<TrophyState>) };
    } catch {
      /* ignore */
    }
    return empty();
  }

  private save() {
    try {
      this.kv.setItem(KEY, JSON.stringify(this.s));
    } catch {
      /* storage full or blocked */
    }
  }

  /** Called with the trophies earned by each update (for the "trophy earned" notice). */
  onEarn(cb: (earned: TrophyDef[]) => void) {
    this.cbs.add(cb);
    return () => this.cbs.delete(cb);
  }

  get(id: string) {
    return this.byId.get(id);
  }

  has(id: string) {
    return id in this.s.unlocked;
  }

  /** Progress toward a trophy with a goal (0..goal), or null. */
  progress(d: TrophyDef): number | null {
    if (!d.goal) return null;
    const s = this.s;
    if (d.id.startsWith('hands.')) return Math.min(d.goal, s.totalHands);
    if (d.id.startsWith('bank.')) return Math.min(d.goal, s.bestBalance);
    if (d.id.startsWith('level.')) return null;
    if (d.id.startsWith('explore.')) {
      const played = Object.keys(s.hands);
      if (d.id === 'explore.brazil') return BRAZIL_GAMES.filter((g) => played.includes(g)).length;
      if (d.id === 'explore.machines') return MACHINE_GAMES.filter((g) => played.includes(g)).length;
      return Math.min(d.goal, played.filter((g) => this.list.some((t) => t.game === g)).length);
    }
    if (d.game && d.id.endsWith('.streak')) return Math.min(d.goal, s.bestStreak[d.game] ?? 0);
    if (d.game && d.id.endsWith('.sig')) return Math.min(d.goal, s.wins[d.game] ?? 0);
    return null;
  }

  counts() {
    const c = { bronze: 0, silver: 0, gold: 0, platinum: 0, earned: 0, total: this.list.length };
    for (const d of this.list)
      if (this.has(d.id)) {
        c[d.tier]++;
        c.earned++;
      }
    return c;
  }

  /** A finished hand at a table. */
  hand(game: string, wagered: number, net: number, balance: number, level: number): TrophyDef[] {
    const s = this.s;
    const got: string[] = [];
    s.totalHands++;
    s.hands[game] = (s.hands[game] ?? 0) + 1;
    if (net > 0) {
      s.wins[game] = (s.wins[game] ?? 0) + 1;
      s.streak[game] = (s.streak[game] ?? 0) + 1;
    } else if (net < 0) s.streak[game] = 0;
    s.bestStreak[game] = Math.max(s.bestStreak[game] ?? 0, s.streak[game] ?? 0);
    s.bestBet = Math.max(s.bestBet, wagered);

    got.push(`${game}.first`);
    if ((s.bestStreak[game] ?? 0) >= STREAK) got.push(`${game}.streak`);
    const sig = SIGNATURES[game];
    if (sig?.kind === 'wins' && (s.wins[game] ?? 0) >= sig.n) got.push(`${game}.sig`);
    for (const [n] of HAND_GOALS) if (s.totalHands >= n) got.push(`hands.${n}`);
    for (const [n] of LEVEL_GOALS) if (level >= n) got.push(`level.${n}`);
    for (const [n] of BET_GOALS) if (wagered >= n) got.push(`bet.${n}`);
    const played = Object.keys(s.hands);
    if (played.length >= 5) got.push('explore.5');
    if (BRAZIL_GAMES.every((g) => played.includes(g))) got.push('explore.brazil');
    if (MACHINE_GAMES.every((g) => played.includes(g))) got.push('explore.machines');
    const all = this.list.filter((d) => d.id.endsWith('.first')).map((d) => d.game!);
    if (all.every((g) => played.includes(g))) got.push('explore.all');
    // the comeback only counts chips won back at the tables, not refills
    if (balance < COMEBACK_LOW) s.wentLow = true;
    else if (s.wentLow && balance >= COMEBACK_HIGH) got.push('comeback');
    return this.finish(got, balance);
  }

  /** A special result announced by a table ('big', 'sweep', 'zap', 'perfect', 'paid'). */
  event(game: string, name: string): TrophyDef[] {
    const sig = SIGNATURES[game];
    const got = sig?.kind === 'event' && sig.event === name ? [`${game}.sig`] : [];
    return this.finish(got);
  }

  /** The bankroll changed (hands, bonuses, refills, resets). */
  balance(balance: number): TrophyDef[] {
    return this.finish([], balance);
  }

  /** The player took the free refill (it disarms the comeback: that one must be won back). */
  refill(balance: number): TrophyDef[] {
    this.s.wentLow = false;
    return this.finish(['refill'], balance);
  }

  private finish(ids: string[], balance?: number): TrophyDef[] {
    const s = this.s;
    if (balance !== undefined) {
      s.bestBalance = Math.max(s.bestBalance, balance);
      for (const [n] of BANK_GOALS) if (balance >= n) ids.push(`bank.${n}`);
      if (balance < COMEBACK_LOW) s.wentLow = true;
    }
    const earned: TrophyDef[] = [];
    for (const id of ids) {
      const d = this.byId.get(id);
      if (d && !this.has(id)) {
        s.unlocked[id] = this.now();
        earned.push(d);
      }
    }
    if (!this.has('platinum') && this.list.every((d) => d.tier === 'platinum' || this.has(d.id))) {
      s.unlocked.platinum = this.now();
      earned.push(this.byId.get('platinum')!);
    }
    this.save();
    if (earned.length) for (const cb of this.cbs) cb(earned);
    return earned;
  }

  /** Clears every trophy and counter (settings → reset). */
  reset() {
    this.s = empty();
    this.save();
  }
}
