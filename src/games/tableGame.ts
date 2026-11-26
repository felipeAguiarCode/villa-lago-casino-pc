import * as THREE from 'three';
import { t } from '../core/i18n';
import { Shoe } from '../core/cards';
import { money } from '../core/wallet';
import { wait } from '../table/anim';
import { shuffleShow } from '../table/shuffle';
import type { FeltKey } from '../table/table';
import type { BtnSpec, Pin } from '../ui/hud';
import type { Paytable } from '../ui/paytable';
import { BetSpots, CardTable, finishXP, fromElement, resultBanner, type SpotDef } from './kit';
import type { GameCtx, GameView } from './types';

export const CHIP_ROW = [5, 25, 100, 500, 1000];

interface Tag {
  pin: Pin;
  pos: THREE.Vector3;
}

/**
 * Base for the dealer table games (Three Card, Caribbean, Ultimate, Baccarat):
 * opening shuffle show, betting bar, bet circles, round lifecycle and clean-up.
 */
export abstract class TableGame implements GameView {
  abstract readonly id: string;
  abstract readonly title: string;
  protected abstract readonly felt: FeltKey;
  protected spots!: BetSpots;
  protected cardsT: CardTable;
  protected phase: 'idle' | 'shuffling' | 'betting' | 'playing' = 'idle';
  protected busy = false;
  protected last: Record<string, number> = {};
  protected paytable: Paytable | null = null;
  protected shoe: Shoe;
  private tags: Tag[] = [];
  private off: (() => void)[] = [];
  private tmp = new THREE.Vector3();
  private discards = 0;
  /** False when the game's own rules engine takes the opening bet from the wallet. */
  protected debitsOnDeal = true;
  /** False for tables without cards (coin, race, wheel): no shuffle show, no deck box or tray. */
  protected usesCards = true;
  /**
   * True for tables with many betting places (roulette): the chip buttons choose a denomination and
   * a click on a betting place puts that chip there (right-click takes one off).
   */
  protected placeOnSpotClick = false;
  /** Denomination chosen in placeOnSpotClick mode. */
  protected chipValue = 25;

  constructor(
    protected g: GameCtx,
    decks: number,
  ) {
    this.cardsT = new CardTable(g);
    this.shoe = new Shoe(decks, decks > 1 ? 0.8 : 1.01);
  }

  get inRound() {
    return this.phase === 'playing' || this.phase === 'shuffling';
  }

  /** Bet circles of the table. */
  protected abstract spotDefs(): SpotDef[];
  /** Felt prints, paytables, meters. */
  protected abstract decorate(): void;
  /** Returns an error message when the current bets can't be dealt. */
  protected abstract validate(): string;
  /** Plays the round after the bets were taken. Must settle every spot. */
  protected abstract playRound(): Promise<void>;
  abstract rules(): string;

  protected defaultBets(): Record<string, number> {
    return {};
  }

  /** Extra per-frame HUD work. */
  protected onSync() {}

  async enter() {
    const { stage, table, hud } = this.g;
    stage.setZoom(1);
    table.setFelt(this.felt);
    table.setProps(this.usesCards);
    this.spots = new BetSpots(this.g, this.spotDefs(), (id) => this.onSpotClick(id), (id) => this.takeChip(id));
    this.decorate();
    this.off.push(stage.onFrame(() => this.sync()));
    hud.onHint = () => this.hint();
    this.phase = 'shuffling';
    table.setShoeFill(0);
    table.setTrayFill(0);
    this.paytable?.show(false);
    if (this.usesCards) await shuffleShow(this.g);
    else await wait(0.35);
    if (this.phase !== 'shuffling') return;
    this.shoe.shuffle();
    this.discards = 0;
    if (!Object.keys(this.last).length) this.last = this.defaultBets();
    this.toBetting();
    this.busy = true;
    await this.spots.setAmounts(this.last);
    this.busy = false;
    this.refreshBetUi();
  }

  async exit() {
    const { hud, table, stage } = this.g;
    this.phase = 'idle';
    hud.setActions(null);
    hud.setBetBar(null);
    hud.setStripBet(null);
    hud.showHint(false);
    hud.onHint = () => {};
    this.cardsT.destroyAll();
    this.clearTags();
    this.spots.dispose();
    this.paytable?.remove();
    this.paytable = null;
    this.off.forEach((f) => f());
    this.off = [];
    table.clearDecals();
    table.setProps(true);
    stage.setZoom(1);
    this.cleanup();
  }

  /** Game-specific DOM clean-up. */
  protected cleanup() {}

  /** Rebuilds bet circles, felt prints and paytable (table variants). Keeps the chips already bet. */
  protected async relayout() {
    if (this.phase !== 'betting' || this.busy) return;
    const cur = this.spots.amounts();
    this.busy = true;
    this.spots.dispose();
    this.paytable?.remove();
    this.paytable = null;
    this.g.table.clearDecals();
    this.spots = new BetSpots(this.g, this.spotDefs(), (id) => this.onSpotClick(id), (id) => this.takeChip(id));
    this.decorate();
    this.toBetting();
    this.busy = true;
    await this.spots.setAmounts(Object.values(cur).some((v) => v > 0) ? cur : this.last);
    this.busy = false;
    this.refreshBetUi();
  }

  onWalletChange() {
    if (this.phase === 'betting') this.refreshBetUi();
  }

  // ---------------------------------------------------------------- betting
  protected toBetting() {
    const { hud } = this.g;
    this.phase = 'betting';
    this.busy = false;
    this.spots.betting = true;
    this.paytable?.show(true);
    hud.setActions(null);
    hud.showHint(false);
    hud.highlight(null);
    hud.setBetBar({
      chips: CHIP_ROW,
      onChip: (v, el) => (this.placeOnSpotClick ? this.pickChip(v) : this.addChip(v, el)),
      buttons: [
        { id: 'clear', label: t('btn.clear'), color: 'red', icon: 'trash', onClick: () => this.clearBets() },
        { id: 'deal', label: t('btn.deal'), color: 'green', icon: 'deal', onClick: () => this.deal() },
        { id: 'x2', label: t('btn.double2x'), color: 'blue', icon: 'double', onClick: () => this.doubleBets() },
      ],
    });
    if (this.placeOnSpotClick) this.pickChip(this.chipValue);
    this.refreshBetUi();
  }

  /** placeOnSpotClick mode: the chosen denomination lights up in the chip tray. */
  protected pickChip(v: number) {
    this.chipValue = v;
    this.g.hud.markChip(v);
  }

  /** A click on a betting place (BetSpots calls it after selecting the place). */
  protected onSpotClick(id: string) {
    if (!this.placeOnSpotClick || this.phase !== 'betting' || this.busy) return;
    const s = this.spots.get(id);
    const err = this.spots.addChip(this.chipValue, this.g.stage.screenToTable(0.5, 0.97, 1.6));
    if (err) this.g.hud.toast(err);
    void s;
    this.refreshBetUi();
  }

  /** placeOnSpotClick mode: right-click takes the last chip off a betting place. */
  protected takeChip(id: string) {
    if (!this.placeOnSpotClick || this.phase !== 'betting' || this.busy) return;
    this.spots.get(id).pile.popChip();
    this.g.sfx.play('handle', { vol: 0.4 });
    this.refreshBetUi();
  }

  protected refreshBetUi() {
    const { hud, wallet } = this.g;
    const total = this.spots.total;
    hud.setStripBet(total);
    hud.setChipLimit(wallet.balance - total);
    hud.setBetButton('deal', !this.validate());
    hud.setBetButton('clear', total > 0);
    hud.setBetButton('x2', total > 0 && wallet.canAfford(total * 2));
  }

  private addChip(v: number, el: HTMLElement) {
    if (this.phase !== 'betting' || this.busy) return;
    const err = this.spots.addChip(v, fromElement(this.g, el));
    if (err) this.g.hud.toast(err);
    this.refreshBetUi();
  }

  private clearBets() {
    if (this.phase !== 'betting' || this.busy) return;
    this.g.sfx.play('handle');
    this.spots.clearAll();
    this.refreshBetUi();
  }

  private doubleBets() {
    if (this.phase !== 'betting' || this.busy) return;
    const a = this.spots.amounts();
    const doubled: Record<string, number> = {};
    for (const [id, n] of Object.entries(a)) {
      const def = this.spots.get(id).def;
      doubled[id] = def.fixed ? n : Math.min(n * 2, def.max ?? 5000);
    }
    const sum = Object.values(doubled).reduce((x, y) => x + y, 0);
    if (!this.g.wallet.canAfford(sum)) return this.g.hud.toast(t('toast.noFunds'));
    this.busy = true;
    this.spots.setAmounts(doubled).then(() => {
      this.busy = false;
      this.refreshBetUi();
    });
    this.refreshBetUi();
  }

  private async deal() {
    const { hud, wallet } = this.g;
    if (this.phase !== 'betting' || this.busy) return;
    const err = this.validate();
    if (err) return hud.toast(err);
    const total = this.spots.total;
    if (!wallet.canAfford(total)) return hud.toast(t('toast.noFunds'));
    this.busy = true;
    this.phase = 'playing';
    this.spots.betting = false;
    this.paytable?.show(false);
    hud.setBetBar(null);
    this.last = this.spots.amounts();
    for (const s of this.spots.spots.values()) if (s.def.auto) delete this.last[s.def.id];
    if (this.debitsOnDeal) wallet.debit(total);
    if (!this.usesCards) this.shoe.shuffle();
    else if (this.shoe.needsShuffle) await this.reshuffle();
    else if (this.shoe.decks === 1) this.shoe.shuffle();
    await this.playRound();
    await this.finishRound();
  }

  /**
   * Continues a round restored from storage (crash recovery): its bets were already taken from the
   * wallet, so the chips are just put back on their circles before the round goes on.
   */
  protected async resumeRound(stakes: Record<string, number>, play: () => Promise<void>) {
    if (this.phase !== 'betting' || this.busy) return;
    this.busy = true;
    this.phase = 'playing';
    this.spots.betting = false;
    this.paytable?.show(false);
    this.g.hud.setBetBar(null);
    this.spots.clearAll();
    for (const [id, n] of Object.entries(stakes)) if (n > 0 && this.spots.spots.has(id)) this.spots.get(id).pile.set(n);
    await play();
    await this.finishRound();
  }

  private async reshuffle() {
    await shuffleShow(this.g, { quick: true });
    this.shoe.shuffle();
    this.discards = 0;
  }

  private async finishRound() {
    const { table } = this.g;
    await wait(0.9);
    await this.spots.sweep();
    await this.cardsT.collect(() => {
      this.discards++;
      table.setTrayFill(Math.min(1, this.discards / (this.shoe.decks * 52 * 0.8)));
    });
    this.clearTags();
    this.toBetting();
    this.busy = true;
    await this.spots.setAmounts(this.last);
    this.busy = false;
    this.refreshBetUi();
    if (this.g.wallet.balance < 5) this.g.hud.toast(t('toast.outOfChips'), 2600);
  }

  // ---------------------------------------------------------------- helpers for subclasses
  protected actions(specs: BtnSpec[] | null) {
    this.g.hud.setActions(specs);
    this.g.hud.showHint(!!specs && this.g.settings.hints);
  }

  /** Waits for one of the action buttons. */
  protected choose(specs: Omit<BtnSpec, 'onClick'>[]): Promise<string> {
    return new Promise((res) => {
      this.actions(
        specs.map((s) => ({
          ...s,
          onClick: () => {
            this.g.sfx.click();
            this.g.hud.highlight(null);
            this.actions(null);
            res(s.id);
          },
        })),
      );
    });
  }

  /** Hint for the current decision (override). Returns the button id to highlight and a message. */
  protected advice(): { id: string; msg: string } | null {
    return null;
  }

  private hint() {
    const a = this.advice();
    if (!a) return;
    this.g.hud.highlight(a.id);
    this.g.hud.toast(a.msg);
  }

  /** A hand-name tag pinned to a table point. */
  protected tag(text: string, cls: string, x: number, z: number): Pin {
    const pin = this.g.hud.pin(`handtag ${cls}`);
    pin.set(text);
    pin.pop();
    this.tags.push({ pin, pos: new THREE.Vector3(x, 0, z) });
    return pin;
  }

  protected clearTags() {
    for (const tg of this.tags) tg.pin.remove();
    this.tags = [];
  }

  protected sync() {
    this.spots.sync();
    for (const tg of this.tags) {
      const p = this.g.stage.toScreen(this.tmp.copy(tg.pos));
      tg.pin.place(p.x, p.y);
      tg.pin.show(true);
    }
    this.onSync();
  }

  protected place(id: string, amount: number) {
    this.g.wallet.debit(amount);
    return this.spots.place(id, amount);
  }

  /**
   * Pays/collects every spot from a `ret` map (stake + winnings) and shows the banner.
   * `credited`: the game's rules engine already paid the wallet; only animate.
   */
  protected async settle(ret: Record<string, number>, opts: { big?: string; folded?: boolean; credited?: boolean } = {}) {
    const { wallet } = this.g;
    const jobs: Promise<void>[] = [];
    let wager = 0;
    let back = 0;
    for (const [id, s] of this.spots.spots) {
      const stake = s.amount;
      if (!stake) continue;
      wager += stake;
      const r = ret[id] ?? 0;
      back += r;
      if (r > stake) jobs.push(this.spots.payout(id, r - stake));
      else if (r < stake) jobs.push(this.spots.lose(id));
    }
    await Promise.all(jobs);
    if (!opts.credited) wallet.credit(back);
    const net = back - wager;
    const banner = resultBanner(this.g, net, wager, opts);
    await finishXP(this.g, wager, net, banner);
    return net;
  }

  protected moneyStr(n: number) {
    return money(n);
  }
}
