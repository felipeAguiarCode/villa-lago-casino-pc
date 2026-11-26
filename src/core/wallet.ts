import { locale } from './i18n';
import { levelBonus, xpForHand, xpForLevel } from './progression';

/** Fictional chips only: no real money, no purchases. Persisted per browser. */

const KEY = 'vlc.wallet.v1';
export const START_BALANCE = 5000;
export const REFILL_BELOW = 1000;

export interface WalletState {
  balance: number;
  xp: number;
  level: number;
  hands: number;
  biggestWin: number;
}

type Listener = (w: Wallet, delta: number) => void;

export { xpForLevel };

export class Wallet {
  s: WalletState;
  private listeners: Listener[] = [];

  constructor() {
    this.s = { balance: START_BALANCE, xp: 0, level: 1, hands: 0, biggestWin: 0 };
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (typeof p.balance === 'number' && isFinite(p.balance)) this.s = { ...this.s, ...p };
      }
    } catch {
      /* private mode etc. */
    }
  }

  get balance() {
    return this.s.balance;
  }

  onChange(fn: Listener) {
    this.listeners.push(fn);
  }

  private save(delta: number) {
    this.s.balance = Math.round(this.s.balance * 100) / 100;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.s));
    } catch {
      /* ignore */
    }
    for (const fn of this.listeners) fn(this, delta);
  }

  canAfford(n: number) {
    return n <= this.s.balance + 1e-9;
  }

  debit(n: number) {
    if (n <= 0) return;
    if (!this.canAfford(n)) throw new Error('saldo insuficiente');
    this.s.balance -= n;
    this.save(-n);
  }

  credit(n: number) {
    if (n <= 0) return;
    this.s.balance += n;
    this.save(n);
  }

  private handCbs = new Set<(wagered: number, net: number) => void>();

  /** PC: called after every finished hand (trophies). */
  onHand(cb: (wagered: number, net: number) => void) {
    this.handCbs.add(cb);
    return () => this.handCbs.delete(cb);
  }

  /** Records a finished hand; returns the new level when the player levelled up. */
  addHand(wagered: number, net: number): { levelUp: number | null; bonus: number } {
    this.s.hands++;
    if (net > this.s.biggestWin) this.s.biggestWin = net;
    this.s.xp += xpForHand(wagered);
    let levelUp: number | null = null;
    let bonus = 0;
    while (this.s.xp >= xpForLevel(this.s.level)) {
      this.s.xp -= xpForLevel(this.s.level);
      this.s.level++;
      levelUp = this.s.level;
      bonus += levelBonus(this.s.level);
    }
    if (bonus) this.s.balance += bonus;
    this.save(bonus);
    for (const cb of this.handCbs) cb(wagered, net);
    return { levelUp, bonus };
  }

  get xpFrac() {
    return this.s.xp / xpForLevel(this.s.level);
  }

  /** Free refill when the bankroll runs low. Returns the amount granted (0 if not eligible). */
  refill(): number {
    if (this.s.balance >= REFILL_BELOW) return 0;
    const add = START_BALANCE - this.s.balance;
    this.s.balance = START_BALANCE;
    this.save(add);
    return add;
  }

  reset() {
    this.s = { balance: START_BALANCE, xp: 0, level: 1, hands: 0, biggestWin: 0 };
    this.save(0);
  }
}

const fmts = new Map<string, Intl.NumberFormat>();
export const money = (n: number) => {
  const loc = locale();
  let f = fmts.get(loc);
  if (!f) fmts.set(loc, (f = new Intl.NumberFormat(loc, { maximumFractionDigits: 2 })));
  return f.format(Math.round(n * 100) / 100);
};
