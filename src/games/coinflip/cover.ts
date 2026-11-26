import * as THREE from 'three';
import { arcTo, slideChips, wait } from '../../table/anim';
import { ChipPile } from '../../table/chips';
import { finishXP, resultBanner, type BetSpots } from '../kit';
import type { GameCtx } from '../types';

export interface CoverOpts {
  /** > 0: the chips are carried on an arc this high instead of slid on the felt (over the race track's rails). */
  lift?: number;
  /** Where along the dealer's rack the chips come from: x × rackK. */
  rackK?: number;
  /** Pays a spot that has no cover (instead of the kit's slide from the rack). */
  pay?: (id: string, amount: number) => Promise<void>;
  /** Takes a losing spot that has no cover. */
  take?: (id: string) => Promise<void>;
}

/**
 * The dealer's covering chips: when betting closes the house lays its own stake next to each bet
 * (what it would pay). The winner takes both stacks. Shared by Coin Flip and Lucky Horses.
 */
export class DealerCovers {
  readonly piles = new Map<string, ChipPile>();
  private lift: number;

  constructor(
    private g: GameCtx,
    private o: CoverOpts = {},
  ) {
    this.lift = o.lift ?? 0;
  }

  /** A point of the dealer's rack (off the top of the table). */
  rack(x: number): THREE.Vector3 {
    return new THREE.Vector3(x * (this.o.rackK ?? 0.35), 0, this.g.stage.screenToTable(0.5, -0.1).z);
  }

  /** The dealer's chips come in from its rack and stop at `at` (next to the player's stack). */
  async add(id: string, amount: number, at: THREE.Vector3, delay = 0): Promise<void> {
    if (amount <= 0) return;
    const { stage, chips, sfx } = this.g;
    const p = new ChipPile(chips, stage.table, this.rack(at.x));
    p.set(amount);
    p.group.visible = false;
    this.piles.set(id, p);
    await wait(delay);
    p.group.visible = true;
    sfx.play('handle', { vol: 0.45 });
    if (this.lift > 0) await arcTo(p.group, at, 0.7, this.lift, 'power2.out');
    else await slideChips(p.group, at, 0.6, 0.15, 'power3.out');
    sfx.play('stack', { vol: 0.65 });
  }

  /** A stack goes to the dealer's rack (and is cleared there). */
  async toDealer(pile: ChipPile, dispose: boolean): Promise<void> {
    const home = pile.group.position.clone();
    const to = this.rack(home.x);
    if (this.lift > 0) await arcTo(pile.group, to, 0.62, this.lift, 'power2.in');
    else await slideChips(pile.group, to, 0.6, 0.12, 'power2.in');
    if (dispose) pile.dispose();
    else {
      pile.clear();
      pile.group.position.copy(home);
    }
  }

  /** The winner's cover is pushed against the player's stack. */
  private async push(pile: ChipPile, toward: THREE.Vector3): Promise<void> {
    const p = pile.group.position.clone();
    const d = new THREE.Vector3(toward.x - p.x, 0, toward.z - p.z);
    const len = d.length();
    if (len < 1e-3) return;
    d.multiplyScalar(Math.min(0.05, len * 0.15) / len);
    this.g.sfx.play('chips', { vol: 0.5 });
    await slideChips(pile.group, p.clone().add(d), 0.22, 0.04, 'power2.out');
  }

  clear() {
    for (const p of this.piles.values()) p.dispose();
    this.piles.clear();
  }

  /**
   * TableGame.settle() for tables with covers: a winning bet keeps its cover (it becomes the
   * payout, swept to the player with the stake); a losing bet and its cover go to the dealer.
   * Spots without a cover are paid from the rack as usual. Returns the net result.
   */
  async settle(spots: BetSpots, ret: Record<string, number>, opts: { big?: string } = {}): Promise<number> {
    const { g } = this;
    const jobs: Promise<void>[] = [];
    let wager = 0;
    let back = 0;
    for (const [id, s] of spots.spots) {
      const stake = s.amount;
      const cover = this.piles.get(id);
      this.piles.delete(id);
      if (!stake) {
        if (cover) jobs.push(this.toDealer(cover, true));
        continue;
      }
      wager += stake;
      const r = ret[id] ?? 0;
      back += r;
      if (cover) {
        if (r > stake) {
          s.payouts.push(cover);
          jobs.push(this.push(cover, s.pile.group.position));
          // what the chips can't show (half-chip odds) is still credited in full
        } else if (r < stake) jobs.push(this.toDealer(s.pile, false), wait(0.08).then(() => this.toDealer(cover, true)));
        else jobs.push(this.toDealer(cover, true));
      } else if (r > stake) jobs.push(this.o.pay ? this.o.pay(id, r - stake) : spots.payout(id, r - stake));
      else if (r < stake) jobs.push(this.o.take ? this.o.take(id) : this.lift > 0 ? this.toDealer(s.pile, false) : spots.lose(id));
    }
    if (jobs.length) g.sfx.play('handle', { vol: 0.5 });
    await Promise.all(jobs);
    g.wallet.credit(back);
    const net = back - wager;
    const banner = resultBanner(g, net, wager, opts);
    await finishXP(g, wager, net, banner);
    return net;
  }

  /**
   * The player's stacks (stakes and won covers) are carried over the track to the player, so the
   * table's own sweep has nothing left to slide through the rails.
   */
  async sweepOver(spots: BetSpots): Promise<void> {
    const bottom = this.g.stage.screenToTable(0.5, 1.2);
    const piles: ChipPile[] = [];
    for (const s of spots.spots.values()) {
      if (s.amount) piles.push(s.pile);
      piles.push(...s.payouts);
    }
    if (!piles.length) return;
    this.g.sfx.play('handle', { vol: 0.6 });
    const homes = piles.map((p) => p.group.position.clone());
    await Promise.all(piles.map((p, i) => arcTo(p.group, new THREE.Vector3(p.group.position.x, 0, bottom.z), 0.6, this.lift || 0.3, 'power2.in', i * 0.03)));
    piles.forEach((p, i) => {
      p.clear();
      p.group.position.copy(homes[i]);
    });
    for (const s of spots.spots.values()) {
      for (const p of s.payouts) p.dispose();
      s.payouts = [];
    }
  }
}
