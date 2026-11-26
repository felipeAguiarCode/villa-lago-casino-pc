import * as THREE from 'three';
import { t } from '../core/i18n';
import { money } from '../core/wallet';
import type { Card } from '../core/cards';
import { arcTo, collectCards, dealCard, flipCard, wait, type Place, slideChips } from '../table/anim';
import { CARD_H, CARD_W, REST_Y, type Card3D } from '../table/cardMesh';
import { ChipPile, CHIP_R } from '../table/chips';
import { betRing } from '../table/prints';
import type { Pin } from '../ui/hud';
import type { GameCtx } from './types';

/** Shared building blocks for the poker-style tables (bet circles, dealing, payouts). */

export interface SpotDef {
  id: string;
  label: string;
  sub?: string;
  u: number;
  v: number;
  /** Ring diameter in table units. */
  size?: number;
  /** This spot always mirrors another spot's amount (UTH Blind = Ante). */
  mirror?: string;
  /** Only this exact amount can be bet (jackpot side bet). */
  fixed?: number;
  /** Spot is filled by game actions (Play/Call), not by the player in the betting phase. */
  auto?: boolean;
  max?: number;
}

export class Spot {
  pile: ChipPile;
  ring: THREE.Mesh;
  hit: HTMLButtonElement;
  label: Pin;
  pos: THREE.Vector3;
  payouts: ChipPile[] = [];
  constructor(
    readonly def: SpotDef,
    g: GameCtx,
  ) {
    this.pos = g.stage.screenToTable(def.u, def.v);
    const size = def.size ?? 0.62;
    this.ring = g.table.addDecalAt(betRing(def.label, def.sub ?? ''), this.pos.x, this.pos.z, size);
    this.pile = new ChipPile(g.chips, g.stage.table, this.pos.clone());
    this.label = g.hud.pin('betlabel');
    this.label.el.classList.add('small');
    this.hit = document.createElement('button');
    this.hit.className = 'spot-hit live';
    this.hit.setAttribute('aria-label', def.label);
    g.hud.labels.appendChild(this.hit);
  }
  get amount() {
    return this.pile.amount;
  }
}

export class BetSpots {
  readonly spots = new Map<string, Spot>();
  active: string;
  betting = false;
  private t0 = performance.now();
  private tmp = new THREE.Vector3();

  constructor(
    private g: GameCtx,
    defs: SpotDef[],
    private onSelect: (id: string) => void = () => {},
  ) {
    for (const d of defs) {
      const s = new Spot(d, g);
      s.hit.onclick = () => {
        if (!this.betting || d.auto || d.mirror) return;
        g.sfx.click();
        this.select(d.id);
      };
      this.spots.set(d.id, s);
    }
    this.active = defs.find((d) => !d.auto && !d.mirror)!.id;
  }

  get(id: string) {
    return this.spots.get(id)!;
  }

  select(id: string) {
    this.active = id;
    this.onSelect(id);
  }

  amounts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [id, s] of this.spots) out[id] = s.amount;
    return out;
  }

  get total() {
    let n = 0;
    for (const s of this.spots.values()) n += s.amount;
    return n;
  }

  /** Amount that a chip of value v would add (including mirrored spots). */
  private cost(id: string, v: number) {
    let n = v;
    for (const s of this.spots.values()) if (s.def.mirror === id) n += v;
    return n;
  }

  /** Adds a chip to the active spot (thrown from a HUD element). Returns an error message or ''. */
  addChip(v: number, from: THREE.Vector3): string {
    const s = this.get(this.active);
    const def = s.def;
    if (def.fixed) {
      if (s.amount >= def.fixed) return '';
      v = def.fixed;
    }
    const max = def.max ?? 5000;
    if (s.amount + v > max) return t('toast.maxBet', { n: money(max) });
    if (!this.g.wallet.canAfford(this.total + this.cost(this.active, v))) return t('toast.noFunds');
    this.g.sfx.play('handle', { vol: 0.5 });
    const chips = def.fixed ? this.g.chips.breakdown(v) : [v];
    chips.forEach((c, i) => s.pile.throwChip(c, from, undefined, i * 0.07));
    let k = 1;
    for (const m of this.spots.values()) if (m.def.mirror === this.active) chips.forEach((c, i) => m.pile.throwChip(c, from, undefined, (k++ + i) * 0.08));
    return '';
  }

  /** Puts `amount` on a spot during play (Play / Call / Raise), thrown from the player's side. */
  async place(id: string, amount: number) {
    const s = this.get(id);
    const from = this.g.stage.screenToTable(0.5, 0.97, 1.6);
    this.g.sfx.play('handle', { vol: 0.6 });
    await s.pile.dropIn(amount, from);
    await wait(0.15);
  }

  /**
   * Restores a bet layout (Rebet, 2x). Every chip that is added is thrown onto its spot with the
   * stacking sound. Skips what the wallet can't cover.
   */
  setAmounts(rec: Record<string, number>): Promise<void> {
    let budget = this.g.wallet.balance;
    const from = this.g.stage.screenToTable(0.5, 0.97, 1.6);
    const jobs: Promise<void>[] = [];
    let k = 0;
    for (const [id, s] of this.spots) {
      if (s.def.auto) {
        s.pile.clear();
        continue;
      }
      const a = rec[id] ?? 0;
      const target = a > 0 && a <= budget ? a : 0;
      budget -= target;
      const cur = s.amount;
      if (target === cur) continue;
      if (target < cur) s.pile.clear();
      const add = target - s.amount;
      if (add > 0) {
        const d = k++ * 0.12;
        jobs.push(new Promise<void>((res) => setTimeout(res, d * 1000)).then(() => s.pile.dropIn(add, from)));
      }
    }
    if (jobs.length) this.g.sfx.play('handle', { vol: 0.5 });
    return Promise.all(jobs).then(() => undefined);
  }

  clearAll() {
    for (const s of this.spots.values()) s.pile.clear();
  }

  /** Winnings slide in from the dealer's rack next to the spot. */
  payout(id: string, win: number): Promise<void> {
    const s = this.get(id);
    if (win <= 0) return Promise.resolve();
    const { stage, chips, sfx } = this.g;
    const top = stage.screenToTable(0.5, -0.08);
    const dx = s.pos.x > 0.9 ? -0.46 : 0.46;
    const p = new ChipPile(chips, stage.table, new THREE.Vector3(s.pos.x + dx, 0, top.z));
    p.set(win);
    s.payouts.push(p);
    return slideChips(p.group, new THREE.Vector3(s.pos.x + dx, 0, s.pos.z), 0.55, 0.15, 'power3.out').then(() => sfx.play('stack', { vol: 0.7 }));
  }

  /** The dealer takes the chips of a losing spot. */
  lose(id: string): Promise<void> {
    const s = this.get(id);
    if (!s.amount) return Promise.resolve();
    const top = this.g.stage.screenToTable(0.5, -0.1);
    this.g.sfx.play('handle', { vol: 0.5 });
    const home = s.pile.group.position.clone();
    return slideChips(s.pile.group, new THREE.Vector3(s.pos.x * 0.3, 0, top.z), 0.6, 0.12, 'power2.in').then(() => {
      s.pile.clear();
      s.pile.group.position.copy(home);
    });
  }

  /** The player takes a bet back (Let It Ride "pull back"); the chips return to the bankroll. */
  async retract(id: string): Promise<number> {
    const s = this.get(id);
    const amt = s.amount;
    if (!amt) return 0;
    const bottom = this.g.stage.screenToTable(0.5, 1.2);
    this.g.sfx.play('handle', { vol: 0.6 });
    const home = s.pile.group.position.clone();
    await slideChips(s.pile.group, new THREE.Vector3(s.pos.x, 0, bottom.z), 0.45, 0.1, 'power2.in');
    s.pile.clear();
    s.pile.group.position.copy(home);
    this.g.wallet.credit(amt);
    return amt;
  }

  /** Remaining stakes and winnings slide to the player. */
  async sweep() {
    const bottom = this.g.stage.screenToTable(0.5, 1.2);
    const piles: ChipPile[] = [];
    for (const s of this.spots.values()) {
      if (s.amount) piles.push(s.pile);
      piles.push(...s.payouts);
    }
    if (piles.length) this.g.sfx.play('handle', { vol: 0.6 });
    const homes = piles.map((p) => p.group.position.clone());
    await Promise.all(piles.map((p) => slideChips(p.group, new THREE.Vector3(p.group.position.x, 0, bottom.z), 0.5, 0.08, 'power2.in')));
    piles.forEach((p, i) => {
      p.clear();
      p.group.position.copy(homes[i]);
    });
    for (const s of this.spots.values()) {
      for (const p of s.payouts) p.dispose();
      s.payouts = [];
    }
  }

  sync() {
    const { stage } = this.g;
    const pulse = 0.18 + 0.14 * Math.sin((performance.now() - this.t0) / 260);
    for (const [id, s] of this.spots) {
      const mat = s.ring.material as THREE.MeshStandardMaterial;
      const on = this.betting && id === this.active;
      mat.emissive.setRGB(on ? pulse * 1.6 : 0, on ? pulse * 1.25 : 0, on ? pulse * 0.4 : 0);
      const p = stage.toScreen(this.tmp.set(s.pos.x, 0, s.pos.z));
      const r = stage.toScreen(this.tmp.set(s.pos.x + (s.def.size ?? 0.62) / 2, 0, s.pos.z));
      const d = Math.max(30, (r.x - p.x) * 2);
      s.hit.style.width = s.hit.style.height = `${d}px`;
      s.hit.style.transform = `translate(${p.x - d / 2}px, ${p.y - d / 2}px)`;
      s.hit.style.display = this.betting && !s.def.auto && !s.def.mirror ? 'block' : 'none';
      const amt = s.amount;
      if (amt > 0) {
        const lp = stage.toScreen(this.tmp.set(s.pos.x, 0, s.pos.z + CHIP_R + 0.12));
        s.label.set(money(amt));
        s.label.place(lp.x, lp.y);
        s.label.show(true);
      } else s.label.show(false);
    }
  }

  dispose() {
    for (const s of this.spots.values()) {
      s.pile.dispose();
      for (const p of s.payouts) p.dispose();
      s.hit.remove();
      s.label.remove();
    }
    this.spots.clear();
  }
}

/** Cards dealt by a game, so they can all be collected at the end of the round. */
export class CardTable {
  readonly all: Card3D[] = [];
  constructor(private g: GameCtx) {}

  /** Deals one card from the shoe (or from `from`) to a place. `null` deals a card whose face is not known yet. */
  async deal(card: Card | null, to: Place, faceUp: boolean, o: { from?: THREE.Vector3; fromYaw?: number; dur?: number } = {}): Promise<Card3D> {
    const { cards, table, sfx } = this.g;
    const c = cards.create(card);
    c.obj.visible = false;
    this.all.push(c);
    sfx.play('slide', { vol: 0.8 });
    await dealCard(c, o.from ?? table.shoeMouth(), o.fromYaw ?? table.shoeYaw, to, {
      faceUp,
      dur: o.dur,
      onLand: () => sfx.play('place', { vol: 0.5 }),
    });
    return c;
  }

  async flip(c: Card3D, dur?: number) {
    this.g.sfx.play('fan', { vol: 0.5 });
    await flipCard(c, { dur, onMid: () => this.g.sfx.play('place', { vol: 0.45 }) });
  }

  /** Every dealt card flies to the discard tray. */
  async collect(onEach?: () => void) {
    if (!this.all.length) return;
    const list = this.all.splice(0);
    this.g.sfx.play('shove', { vol: 0.7 });
    await collectCards(list, this.g.table.trayTop(), this.g.table.trayYaw, (c) => {
      this.g.cards.destroy(c);
      onEach?.();
    });
  }

  destroyAll() {
    for (const c of this.all.splice(0)) this.g.cards.destroy(c);
  }
}

/** Places for a row of n cards centred at (cx, cz). */
export function row(cx: number, cz: number, n: number, gap: number, overlapY = 0.0035): Place[] {
  return Array.from({ length: n }, (_, i) => ({
    pos: new THREE.Vector3(cx + (i - (n - 1) / 2) * gap, REST_Y + i * overlapY, cz),
    yaw: (((i * 37) % 7) - 3) * 0.004,
  }));
}

/** Lifts the winning cards a little and makes them glow. */
export function highlightCards(g: GameCtx, cards: Card3D[], color = '#ffd27a') {
  for (const c of cards) {
    g.fx.glow(new THREE.Vector3(c.obj.position.x, 0, c.obj.position.z), 0.9, 1.15, 1.6, color);
    arcTo(c.obj, c.obj.position.clone().setY(c.obj.position.y + 0.04), 0.4, 0, 'back.out(2.2)');
  }
}

/** Resolves a round's banner from net result. */
export async function resultBanner(g: GameCtx, net: number, wager: number, opts: { big?: string; folded?: boolean } = {}) {
  const { hud, sfx } = g;
  if (opts.big && net > 0) {
    sfx.win(true);
    return hud.banner(opts.big, `+${money(net)}`, 'win', 1700);
  }
  if (net > 0) {
    sfx.win(net >= wager * 2);
    return hud.banner(t('win.you'), `+${money(net)}`, 'win', 1500);
  }
  if (net === 0 && wager > 0) {
    sfx.push();
    return hud.banner(t('win.push'), t('win.pushSub'), 'small', 1200);
  }
  sfx.lose();
  return hud.banner(opts.folded ? t('win.fold') : t('win.dealer'), net < 0 ? `-${money(-net)}` : '', 'lose small', 1200);
}

/** XP + level-up banner shared by every table. */
export async function finishXP(g: GameCtx, wager: number, net: number, banner: Promise<void>) {
  const lv = g.wallet.addHand(wager, net);
  g.hud.setXP(g.wallet.s.level, g.wallet.xpFrac);
  if (lv.levelUp) {
    await banner;
    g.sfx.levelUp();
    await g.hud.banner(t('win.level', { n: lv.levelUp }), t('win.levelSub', { n: money(lv.bonus) }), 'win', 1600);
  }
}

/** Screen point (as a 3D start position) of a HUD element, for chips thrown from the HUD. */
export function fromElement(g: GameCtx, el: HTMLElement): THREE.Vector3 {
  const fr = g.stage.renderer.domElement.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return g.stage.viewToTable((r.left + r.width / 2 - fr.left) / fr.width, (r.top + r.height / 2 - fr.top) / fr.height, 1.6);
}

/**
 * Lets the player tap cards on the felt to select them (discard / exchange). Selected cards lift
 * and show a tag. Call `sync()` every frame while active.
 */
export class CardPicker {
  readonly sel = new Set<number>();
  private hits: HTMLButtonElement[] = [];
  private tags: Pin[] = [];
  private cards: Card3D[] = [];
  private tmp = new THREE.Vector3();
  active = false;

  constructor(
    private g: GameCtx,
    private max: number,
    private label: string,
    private onChange: () => void = () => {},
  ) {}

  attach(cards: Card3D[], max = this.max) {
    this.detach();
    this.max = max;
    this.cards = cards;
    this.sel.clear();
    cards.forEach((_, i) => {
      const b = document.createElement('button');
      b.className = 'card-hit live';
      b.setAttribute('aria-label', `Card ${i + 1}`);
      b.onclick = () => this.toggle(i);
      this.g.hud.labels.appendChild(b);
      this.hits.push(b);
      const tg = this.g.hud.pin('held-tag');
      tg.set(this.label);
      this.tags.push(tg);
    });
    this.active = true;
  }

  toggle(i: number) {
    if (!this.active) return;
    if (this.sel.has(i)) this.sel.delete(i);
    else {
      if (this.sel.size >= this.max) {
        if (this.max === 1) {
          const first = [...this.sel][0];
          this.sel.delete(first);
          this.lift(first, false);
        } else return;
      }
      this.sel.add(i);
    }
    this.lift(i, this.sel.has(i));
    this.g.sfx.play(this.sel.has(i) ? 'place' : 'slide', { vol: 0.55 });
    this.tags[i]?.pop();
    this.onChange();
  }

  /** Programmatic selection (hints). */
  set(indices: number[]) {
    for (const i of [...this.sel]) if (!indices.includes(i)) this.toggle(i);
    for (const i of indices) if (!this.sel.has(i)) this.toggle(i);
  }

  private lift(i: number, up: boolean) {
    const c = this.cards[i];
    if (!c) return;
    const z = c.obj.userData.baseZ ?? (c.obj.userData.baseZ = c.obj.position.z);
    arcTo(c.obj, new THREE.Vector3(c.obj.position.x, up ? REST_Y + 0.05 : REST_Y + 0.004 * i, up ? z - 0.24 : z), 0.26, 0.015, up ? 'back.out(2.4)' : 'back.out(1.6)');
  }

  detach() {
    this.hits.forEach((b) => b.remove());
    this.tags.forEach((t) => t.remove());
    this.hits = [];
    this.tags = [];
    this.cards.forEach((c) => delete c.obj.userData.baseZ);
    this.cards = [];
    this.active = false;
  }

  sync() {
    if (!this.active) return;
    const { stage } = this.g;
    this.cards.forEach((c, i) => {
      const p = c.obj.position;
      const next = this.cards[i + 1];
      const right = next ? Math.min(p.x + CARD_W / 2, next.obj.position.x - CARD_W / 2) : p.x + CARD_W / 2;
      const a = stage.toScreen(this.tmp.set(p.x - CARD_W / 2, 0, p.z - CARD_H / 2));
      const z = stage.toScreen(this.tmp.set(right, 0, p.z + CARD_H / 2));
      const b = this.hits[i];
      b.style.width = `${Math.max(14, z.x - a.x)}px`;
      b.style.height = `${z.y - a.y}px`;
      b.style.transform = `translate(${a.x}px, ${a.y}px)`;
      const top = stage.toScreen(this.tmp.set(p.x, 0, p.z - CARD_H / 2 - 0.13));
      this.tags[i].place(top.x, top.y);
      this.tags[i].show(this.sel.has(i));
    });
  }
}
