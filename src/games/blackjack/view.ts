import * as THREE from 'three';
import gsap from 'gsap';
import { Shoe } from '../../core/cards';
import { money } from '../../core/wallet';
import { t } from '../../core/i18n';
import { shuffleShow } from '../../table/shuffle';
import { collectCards, dealCard, flipCard, peekCard, shake, slideCard, wait, type Place, slideChips } from '../../table/anim';
import { CARD_H, REST_Y, type Card3D } from '../../table/cardMesh';
import { ChipPile, CHIP_R } from '../../table/chips';
import { betRing, blackjackPrint } from '../../table/prints';
import type { BtnSpec, Pin } from '../../ui/hud';
import type { GameCtx, GameView } from '../types';
import { BlackjackRound, handValue, isNatural, RULES, totalLabel, type BJEvent } from './rules';
import { basicStrategy, type Move } from './strategy';

/** Vertical layout (fractions of the frame height at the reference 9:19.5 aspect). */
const V = { dealer: 0.232, print: 0.4, player: 0.574, bet: 0.748 };
const DX = 0.215;
const HAND_GAP = 1.38;
const CHIPS = [5, 25, 100, 500, 1000];

interface HandView {
  cards: Card3D[];
  pile: ChipPile;
  bubble: Pin;
  label: Pin;
  cx: number;
  doubled: boolean;
}

type SettleEvent = Extract<BJEvent, { t: 'settle' }>;

export class BlackjackView implements GameView {
  readonly id = 'blackjack';
  readonly title = 'Blackjack';
  private shoe = new Shoe(RULES.decks, 0.75);
  private round: BlackjackRound | null = null;
  private bet = 25;
  private lastBet = 25;
  private dealer: Card3D[] = [];
  private hands: HandView[] = [];
  private dealerBubble: Pin | null = null;
  private a = { dealer: new THREE.Vector3(), player: new THREE.Vector3(), bet: new THREE.Vector3(), ins: new THREE.Vector3() };
  private busy = false;
  private phase: 'idle' | 'shuffling' | 'betting' | 'playing' = 'idle';
  private insPile: ChipPile | null = null;
  private insAmount = 0;
  private payoutPiles: ChipPile[] = [];
  private off: (() => void)[] = [];
  private discards = 0;
  private shoeFill = 1;
  private tmp = new THREE.Vector3();

  constructor(private g: GameCtx) {}

  get inRound() {
    return this.phase === 'playing' || this.phase === 'shuffling';
  }

  // ------------------------------------------------------------------ lifecycle
  async enter() {
    const { table, hud, stage } = this.g;
    stage.setZoom(1);
    table.setFelt('blackjack');
    this.anchors();
    table.addDecal(blackjackPrint(t('bj.print1'), t('bj.print2'), t('bj.print3')), 0.5, V.print, 3.25);
    table.addDecalAt(betRing(), this.a.bet.x, this.a.bet.z, 0.66);
    table.setShoeFill(this.shoeFill);
    table.setTrayFill(this.discards / (this.shoe.total * 0.8));
    this.dealerBubble = hud.pin('bubble');
    this.hands = [this.newHand(0)];
    this.bet = this.affordable(this.lastBet);
    this.off.push(stage.onFrame(() => this.sync()));
    this.off.push(
      stage.onResize(() => {
        if (this.phase === 'betting') this.anchors();
      }),
    );
    hud.onHint = () => this.hint();
    // every visit opens with the dealer shuffling a fresh shoe
    this.phase = 'shuffling';
    table.setShoeFill(0);
    table.setTrayFill(0);
    await shuffleShow(this.g);
    if (this.phase !== 'shuffling') return;
    this.shoe.shuffle();
    this.discards = 0;
    this.shoeFill = 1;
    this.toBetting();
    if (this.bet) {
      this.busy = true;
      await this.hands[0].pile.dropIn(this.bet, this.g.stage.screenToTable(0.5, 0.97, 1.6));
      this.busy = false;
      this.refreshBetUi();
    }
  }

  async exit() {
    const { hud, cards, stage, table } = this.g;
    this.phase = 'idle';
    hud.setActions(null);
    hud.setBetBar(null);
    hud.showHint(false);
    hud.onHint = () => {};
    for (const c of this.dealer) cards.destroy(c);
    for (const hv of this.hands) {
      for (const c of hv.cards) cards.destroy(c);
      hv.pile.dispose();
      hv.bubble.remove();
      hv.label.remove();
    }
    for (const p of this.payoutPiles) p.dispose();
    this.insPile?.dispose();
    this.insPile = null;
    this.payoutPiles = [];
    this.dealer = [];
    this.hands = [];
    this.dealerBubble?.remove();
    this.dealerBubble = null;
    this.off.forEach((f) => f());
    this.off = [];
    table.clearDecals();
    stage.setZoom(1);
  }

  onWalletChange() {
    if (this.phase === 'betting') this.refreshBetUi();
  }

  rules(): string {
    return t('bj.rules');
  }

  // ------------------------------------------------------------------ layout
  private anchors() {
    const s = this.g.stage;
    s.screenToTable(0.5, V.dealer, 0, this.a.dealer);
    s.screenToTable(0.5, V.player, 0, this.a.player);
    s.screenToTable(0.5, V.bet, 0, this.a.bet);
    const pr = s.screenToTable(0.5, V.print);
    this.a.ins.set(0, 0, pr.z + 0.43);
    this.a.dealer.x = this.a.player.x = this.a.bet.x = 0;
    for (const hv of this.hands) hv.pile.group.position.set(hv.cx, 0, this.a.bet.z);
  }

  private newHand(cx: number): HandView {
    const { hud, chips, stage } = this.g;
    return {
      cards: [],
      pile: new ChipPile(chips, stage.table, new THREE.Vector3(cx, 0, this.a.bet.z)),
      bubble: hud.pin('bubble'),
      label: hud.pin('betlabel'),
      cx,
      doubled: false,
    };
  }

  private places(cx: number, cz: number, cards: Card3D[], doubled: boolean): Place[] {
    const n = cards.length;
    return cards.map((c, i) => {
      const jit = (c.obj.userData.jit ??= (Math.random() - 0.5) * 0.05) as number;
      let x = cx + (i - (n - 1) / 2) * DX;
      let yaw = jit;
      if (doubled && i === n - 1 && n >= 3) {
        x += 0.1;
        yaw = Math.PI / 2 + jit;
      }
      return { pos: new THREE.Vector3(x, REST_Y + i * 0.0035, cz), yaw };
    });
  }

  private handCenters(n: number) {
    return Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * HAND_GAP);
  }

  private relayoutHand(hv: HandView, skipLast = false, dur = 0.26) {
    const pl = this.places(hv.cx, this.a.player.z, hv.cards, hv.doubled);
    return Promise.all(hv.cards.map((c, i) => (skipLast && i === hv.cards.length - 1 ? Promise.resolve() : slideCard(c, pl[i], dur))));
  }

  private relayoutDealer(skipLast = false) {
    const pl = this.places(0, this.a.dealer.z, this.dealer, false);
    return Promise.all(this.dealer.map((c, i) => (skipLast && i === this.dealer.length - 1 ? Promise.resolve() : slideCard(c, pl[i], 0.26))));
  }

  /** Keeps the HUD pins glued to the 3D hands. */
  private sync() {
    const { stage } = this.g;
    const t = this.tmp;
    if (this.dealerBubble) {
      if (this.dealer.length) {
        const p = stage.toScreen(t.set(0, 0, this.a.dealer.z - CARD_H / 2 - 0.27));
        this.dealerBubble.place(p.x, p.y);
        this.dealerBubble.show(true);
      } else this.dealerBubble.show(false);
    }
    for (const hv of this.hands) {
      if (hv.cards.length) {
        const p = stage.toScreen(t.set(hv.cx, 0, this.a.player.z + CARD_H / 2 + 0.2));
        hv.bubble.place(p.x, p.y);
        hv.bubble.show(true);
      } else hv.bubble.show(false);
      const amt = hv.pile.amount;
      if (amt > 0) {
        const gp = hv.pile.group.position;
        const p =
          this.phase === 'betting'
            ? stage.toScreen(t.set(gp.x + 0.64, 0, gp.z))
            : stage.toScreen(t.set(gp.x, 0, gp.z + CHIP_R + 0.17));
        hv.label.set(money(amt));
        hv.label.place(p.x, p.y);
        hv.label.show(true);
      } else hv.label.show(false);
    }
  }

  // ------------------------------------------------------------------ betting
  private affordable(n: number) {
    const b = this.g.wallet.balance;
    if (n <= b) return n;
    return CHIPS.filter((c) => c <= b).pop() ?? 0;
  }

  private toBetting() {
    const { hud } = this.g;
    this.phase = 'betting';
    this.busy = false;
    hud.setActions(null);
    hud.showHint(false);
    hud.highlight(null);
    hud.setBetBar({
      chips: CHIPS,
      onChip: (v, el) => this.addChip(v, el),
      buttons: [
        { id: 'clear', label: t('btn.clear'), color: 'red', icon: 'trash', onClick: () => this.clearBet() },
        { id: 'deal', label: t('btn.deal'), color: 'green', icon: 'deal', onClick: () => this.deal() },
        { id: 'x2', label: t('btn.double2x'), color: 'blue', icon: 'double', onClick: () => this.doubleBet() },
      ],
    });
    this.refreshBetUi();
  }

  private refreshBetUi() {
    const { hud, wallet } = this.g;
    hud.setChipLimit(Math.min(wallet.balance - this.bet, RULES.maxBet - this.bet));
    hud.setBetButton('deal', this.bet >= RULES.minBet && wallet.canAfford(this.bet));
    hud.setBetButton('clear', this.bet > 0);
    hud.setBetButton('x2', this.bet > 0 && wallet.canAfford(this.bet * 2) && this.bet * 2 <= RULES.maxBet);
  }

  private fromElement(el: HTMLElement): THREE.Vector3 {
    const fr = this.g.stage.renderer.domElement.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return this.g.stage.viewToTable((r.left + r.width / 2 - fr.left) / fr.width, (r.top + r.height / 2 - fr.top) / fr.height, 1.6);
  }

  private addChip(v: number, el: HTMLElement) {
    const { hud, wallet, sfx } = this.g;
    if (this.phase !== 'betting' || this.busy) return;
    const nb = this.bet + v;
    if (nb > RULES.maxBet) return hud.toast(t('toast.maxBet', { n: money(RULES.maxBet) }));
    if (!wallet.canAfford(nb)) return hud.toast(t('toast.noFunds'));
    this.bet = nb;
    sfx.play('handle', { vol: 0.5 });
    this.hands[0].pile.throwChip(v, this.fromElement(el));
    this.refreshBetUi();
  }

  private clearBet() {
    const { sfx, stage } = this.g;
    if (this.phase !== 'betting' || this.busy || !this.bet) return;
    sfx.play('handle');
    const pile = this.hands[0].pile;
    const bottom = stage.screenToTable(0.5, 1.15);
    const home = pile.group.position.clone();
    this.busy = true;
    slideChips(pile.group, new THREE.Vector3(home.x, 0, bottom.z), 0.3, 0.1, 'power2.in').then(() => {
      pile.clear();
      pile.group.position.copy(home);
      this.busy = false;
      this.refreshBetUi();
    });
    this.bet = 0;
    this.refreshBetUi();
  }

  private async doubleBet() {
    const { sfx, wallet, hud } = this.g;
    if (this.phase !== 'betting' || this.busy || !this.bet) return;
    const nb = this.bet * 2;
    if (nb > RULES.maxBet) return hud.toast(t('toast.maxBet', { n: money(RULES.maxBet) }));
    if (!wallet.canAfford(nb)) return hud.toast(t('toast.noFunds'));
    const add = this.g.chips.breakdown(this.bet);
    this.bet = nb;
    this.busy = true;
    const pile = this.hands[0].pile;
    const from = this.g.stage.screenToTable(0.5, 0.9, 1.6);
    sfx.play('handle', { vol: 0.6 });
    void add;
    await pile.dropIn(nb / 2, from);
    this.busy = false;
    this.refreshBetUi();
  }

  // ------------------------------------------------------------------ round flow
  private async deal() {
    const { hud, wallet } = this.g;
    if (this.phase !== 'betting' || this.busy) return;
    if (this.bet < RULES.minBet) return hud.toast(t('toast.minBet', { n: RULES.minBet }));
    if (!wallet.canAfford(this.bet)) return hud.toast(t('toast.noFunds'));
    this.busy = true;
    this.phase = 'playing';
    hud.setBetBar(null);
    if (this.shoe.needsShuffle) await this.shuffleShoe();
    wallet.debit(this.bet);
    this.lastBet = this.bet;
    this.insAmount = 0;
    this.round = new BlackjackRound(this.shoe, this.bet);
    await this.play(this.round.start());
    await this.next();
  }

  private async next(): Promise<void> {
    const { hud, wallet } = this.g;
    const r = this.round!;
    if (r.phase === 'insurance') {
      hud.setActions(null);
      hud.showHint(false);
      const even = isNatural(r.hands[0].cards);
      const cost = r.hands[0].bet / 2;
      let take = false;
      if (wallet.canAfford(cost)) {
        const choice = await hud.prompt(
          even ? t('bj.evenMoney') : t('bj.insurance'),
          even ? t('bj.evenMoneyText') : t('bj.insuranceText', { n: money(cost) }),
          [
            { id: 'no', label: t('btn.no'), color: 'red', icon: 'close' },
            { id: 'yes', label: t('btn.yes'), color: 'green', icon: 'check' },
          ],
        );
        take = choice === 'yes';
      }
      await this.play(r.insurance(take));
      return this.next();
    }
    if (r.phase === 'player') {
      this.busy = false;
      this.showActions();
      return;
    }
    await this.finishRound();
  }

  private showActions() {
    const { hud, wallet, settings } = this.g;
    const a = this.round!.actions(wallet.balance);
    const specs: BtnSpec[] = [{ id: 'stand', label: t('btn.stand'), color: 'red', icon: 'stand', onClick: () => this.act('stand') }];
    if (a.split) specs.push({ id: 'split', label: t('btn.split'), color: 'gold', icon: 'split', onClick: () => this.act('split') });
    specs.push({ id: 'double', label: t('btn.double'), color: 'blue', icon: 'double', enabled: a.double, onClick: () => this.act('double') });
    specs.push({ id: 'hit', label: t('btn.hit'), color: 'green', icon: 'hit', enabled: a.hit, onClick: () => this.act('hit') });
    hud.setActions(specs);
    hud.showHint(settings.hints);
  }

  private async act(kind: Move) {
    const { hud, sfx } = this.g;
    const r = this.round;
    if (!r || this.busy || r.phase !== 'player') return;
    this.busy = true;
    hud.highlight(null);
    hud.lockActions(true);
    sfx.click();
    const evs = kind === 'hit' ? r.hit() : kind === 'stand' ? r.stand() : kind === 'double' ? r.double() : r.split();
    if (r.phase !== 'player') {
      hud.setActions(null);
      hud.showHint(false);
    }
    await this.play(evs);
    await this.next();
  }

  private hint() {
    const { hud, wallet } = this.g;
    const r = this.round;
    if (!r || r.phase !== 'player' || this.busy) return;
    const a = r.actions(wallet.balance);
    const m = basicStrategy(r.current.cards, r.dealerUp, a.double, a.split);
    hud.highlight(m);
    hud.toast(t('bj.strategy', { move: t(`btn.${m}`).toUpperCase() }));
  }

  // ------------------------------------------------------------------ event playback
  private async play(evs: BJEvent[]) {
    let pending: Promise<unknown>[] = [];
    for (const e of evs) {
      if (e.t === 'deal') {
        pending.push(this.applyDeal(e));
        await wait(this.round?.holeRevealed && e.to === 'dealer' ? 0.62 : 0.3);
        continue;
      }
      await Promise.all(pending);
      pending = [];
      await this.apply(e);
    }
    await Promise.all(pending);
  }

  private async applyDeal(e: Extract<BJEvent, { t: 'deal' }>) {
    const { cards, table, sfx } = this.g;
    const c3 = cards.create(e.card);
    c3.obj.visible = false;
    let target: Place;
    let after: () => void;
    if (e.to === 'player') {
      const hv = this.hands[e.hand];
      hv.cards.push(c3);
      target = this.places(hv.cx, this.a.player.z, hv.cards, hv.doubled)[hv.cards.length - 1];
      this.relayoutHand(hv, true);
      after = () => {
        hv.bubble.set(totalLabel(hv.cards.map((c) => c.card!)), hv.bubble.el.className.replace(/\bpop\b/, '').trim() || 'bubble up');
        hv.bubble.pop();
      };
    } else {
      this.dealer.push(c3);
      target = this.places(0, this.a.dealer.z, this.dealer, false)[this.dealer.length - 1];
      this.relayoutDealer(true);
      after = () => this.updateDealerBubble(true);
    }
    this.shoeFill = this.shoe.remaining / this.shoe.total;
    table.setShoeFill(this.shoeFill);
    sfx.play('slide', { vol: 0.8 });
    await dealCard(c3, table.shoeMouth(), table.shoeYaw, target, {
      faceUp: e.to === 'player' || e.faceUp,
      onLand: () => {
        sfx.play('place', { vol: 0.55 });
        after();
      },
    });
  }

  private updateDealerBubble(pop = false) {
    const b = this.dealerBubble;
    if (!b) return;
    const visible = this.dealer.filter((c) => c.faceUp).map((c) => c.card!);
    const v = handValue(visible);
    const cls = v.total > 21 ? 'bubble down bust' : isNatural(visible) && visible.length === this.dealer.length ? 'bubble down bj' : 'bubble down';
    b.set(totalLabel(visible), cls);
    if (pop) b.pop();
  }

  private setHandBubble(hv: HandView, extra = '') {
    const cards = hv.cards.map((c) => c.card!);
    const v = handValue(cards);
    let cls = 'bubble up';
    if (v.total > 21) cls += ' bust';
    else if (v.total === 21) cls += ' bj';
    hv.bubble.set(v.total > 21 ? String(v.total) : totalLabel(cards), `${cls} ${extra}`.trim());
  }

  private async apply(e: BJEvent) {
    const { cards, fx, sfx, wallet, stage, hud } = this.g;
    switch (e.t) {
      case 'flipHole': {
        const c = this.dealer[1];
        sfx.play('fan', { vol: 0.6 });
        await flipCard(c, { onMid: () => sfx.play('place', { vol: 0.5 }) });
        this.updateDealerBubble(true);
        await wait(0.25);
        break;
      }
      case 'peek': {
        await peekCard(this.dealer[1]);
        if (!e.dealerBJ) hud.toast(t('bj.noBJ'), 1200);
        break;
      }
      case 'split': {
        const from = this.hands[e.from];
        const moved = from.cards.pop()!;
        const nh = this.newHand(from.cx);
        nh.cards.push(moved);
        this.hands.splice(e.to, 0, nh);
        wallet.debit(e.bet);
        const n = this.hands.length;
        const centers = this.handCenters(n);
        stage.setZoom(Math.max(1, (n * HAND_GAP + 0.7) / 3.3));
        sfx.play('shove');
        const jobs: Promise<unknown>[] = [];
        this.hands.forEach((hv, i) => {
          hv.cx = centers[i];
          jobs.push(this.relayoutHand(hv, false, 0.38));
          if (hv !== nh) jobs.push(slideChips(hv.pile.group, new THREE.Vector3(hv.cx, 0, this.a.bet.z), 0.38, 0.05));
        });
        nh.pile.group.position.set(nh.cx, 0, this.a.bet.z);
        const from3 = stage.screenToTable(0.5, 0.95, 1.6);
        for (const v of this.g.chips.breakdown(e.bet)) {
          jobs.push(nh.pile.throwChip(v, from3));
          await wait(0.05);
        }
        await Promise.all(jobs);
        this.hands.forEach((hv) => this.setHandBubble(hv));
        break;
      }
      case 'double': {
        const hv = this.hands[e.hand];
        hv.doubled = true;
        wallet.debit(e.added);
        const from3 = this.g.stage.screenToTable(0.5, 0.95, 1.6);
        sfx.play('handle', { vol: 0.6 });
        for (const v of this.g.chips.breakdown(e.added)) {
          hv.pile.throwChip(v, from3);
          await wait(0.05);
        }
        await wait(0.25);
        break;
      }
      case 'active': {
        this.hands.forEach((hv, i) => {
          if (!hv.cards.length) return;
          this.setHandBubble(hv, this.hands.length > 1 && i === e.hand ? 'active' : '');
        });
        break;
      }
      case 'handDone': {
        const hv = this.hands[e.hand];
        this.setHandBubble(hv);
        if (e.reason === 'bust') {
          sfx.play('shove', { vol: 0.6 });
          await shake(hv.cards.map((c) => c.obj));
          hv.bubble.pop();
        } else if (e.reason === 'blackjack') {
          hv.bubble.set('21', 'bubble up bj');
          hv.bubble.pop();
          fx.burst(new THREE.Vector3(hv.cx, 0.3, this.a.player.z), 90);
          sfx.win(true);
          await wait(0.4);
        }
        break;
      }
      case 'insurance': {
        if (e.taken) {
          this.insAmount = e.amount;
          wallet.debit(e.amount);
          this.insPile = new ChipPile(this.g.chips, stage.table, this.a.ins.clone());
          const from3 = stage.screenToTable(0.5, 0.95, 1.6);
          for (const v of this.g.chips.breakdown(e.amount)) {
            this.insPile.throwChip(v, from3);
            await wait(0.06);
          }
          await wait(0.3);
        }
        break;
      }
      case 'dealerDone': {
        this.updateDealerBubble();
        if (e.bust) {
          sfx.play('shove', { vol: 0.6 });
          await shake(this.dealer.map((c) => c.obj), 0.04);
        }
        break;
      }
      case 'settle':
        await this.settle(e);
        break;
      default:
        break;
    }
    void cards;
  }

  // ------------------------------------------------------------------ payouts
  /** Winnings slide in from the dealer's rack next to the bet. */
  private payout(hv: HandView, amount: number, z = this.a.bet.z) {
    const { chips, stage, sfx } = this.g;
    if (amount <= 0) return Promise.resolve();
    const top = stage.screenToTable(0.5, -0.08);
    const pile = new ChipPile(chips, stage.table, new THREE.Vector3(hv.cx + 0.48, 0, top.z));
    pile.set(amount);
    this.payoutPiles.push(pile);
    return slideChips(pile.group, new THREE.Vector3(hv.cx + 0.48, 0, z), 0.55, 0.15, 'power3.out').then(() => sfx.play('stack', { vol: 0.7 }));
  }

  private lose(pile: ChipPile) {
    const { stage, sfx } = this.g;
    const top = stage.screenToTable(0.5, -0.1);
    sfx.play('handle', { vol: 0.5 });
    return slideChips(pile.group, new THREE.Vector3(pile.group.position.x * 0.3, 0, top.z), 0.6, 0.12, 'power2.in').then(() => pile.clear());
  }

  private async settle(e: SettleEvent) {
    const { hud, fx, sfx, wallet } = this.g;
    let ret = e.insuranceRet;
    let wager = this.insAmount;
    let anyBJ = false;
    let anyWin = false;
    let anyPush = false;
    const jobs: Promise<unknown>[] = [];
    for (const r of e.hands) {
      const hv = this.hands[r.hand];
      wager += r.bet;
      ret += r.ret;
      const text = hv.bubble.el.textContent ?? '';
      const center = new THREE.Vector3(hv.cx, 0, this.a.player.z);
      if (r.outcome === 'blackjack' || r.outcome === 'win') {
        anyWin = true;
        anyBJ ||= r.outcome === 'blackjack';
        hv.bubble.set(text, r.outcome === 'blackjack' ? 'bubble up bj win' : 'bubble up win');
        fx.glow(center, 1.6, 1.5);
        fx.burst(new THREE.Vector3(hv.cx, 0.25, this.a.player.z), r.outcome === 'blackjack' ? 150 : 70);
        jobs.push(this.payout(hv, r.ret - r.bet));
      } else if (r.outcome === 'push') {
        anyPush = true;
        hv.bubble.set(text, 'bubble up');
      } else {
        hv.bubble.set(text, r.outcome === 'bust' ? 'bubble up bust lose' : 'bubble up lose');
        jobs.push(this.lose(hv.pile));
      }
    }
    if (this.insPile) {
      const ip = this.insPile;
      if (e.insuranceRet > 0) {
        const top = this.g.stage.screenToTable(0.5, -0.08);
        const p = new ChipPile(this.g.chips, this.g.stage.table, new THREE.Vector3(0.5, 0, top.z));
        p.set(e.insuranceRet - this.insAmount);
        this.payoutPiles.push(p, ip);
        jobs.push(slideChips(p.group, new THREE.Vector3(0.5, 0, this.a.ins.z), 0.55, 0.15, 'power3.out'));
      } else jobs.push(this.lose(ip).then(() => ip.dispose()));
      this.insPile = null;
    }
    await Promise.all(jobs);
    wallet.credit(ret);
    const net = ret - wager;
    let banner: Promise<void>;
    if (e.insuranceRet > 0 && net >= 0) {
      sfx.push();
      banner = hud.banner(t('bj.insPaid'), net > 0 ? `+${money(net)}` : t('bj.insPaidSub'), 'small', 1500);
    } else if (anyBJ && net > 0) {
      banner = hud.banner('BLACKJACK!', `+${money(net)}`, 'win', 1700);
    } else if (net > 0) {
      sfx.win(net >= wager * 1.5);
      banner = hud.banner(t('win.you'), `+${money(net)}`, 'win', 1500);
    } else if (net === 0 && (anyPush || anyWin)) {
      sfx.push();
      banner = hud.banner(t('win.push'), t('win.pushSub'), 'small', 1200);
    } else {
      sfx.lose();
      const allBust = e.hands.every((h) => h.outcome === 'bust');
      banner = hud.banner(allBust ? t('win.bust') : t('win.dealer'), net < 0 ? `-${money(-net)}` : '', 'lose small', 1200);
    }
    const lv = wallet.addHand(wager, net);
    this.g.hud.setXP(wallet.s.level, wallet.xpFrac);
    if (lv.levelUp) {
      await banner;
      sfx.levelUp();
      fx.burst(new THREE.Vector3(0, 0.3, this.a.player.z - 1), 160, '#9fd0ff');
      await hud.banner(t('win.level', { n: lv.levelUp }), t('win.levelSub', { n: money(lv.bonus) }), 'win', 1600);
    }
    await wait(anyWin || anyPush ? 1.1 : 0.6);
  }

  private async finishRound() {
    const { cards, table, sfx, stage } = this.g;
    // winnings and pushes slide to the player, then the dealer clears the cards
    const bottom = stage.screenToTable(0.5, 1.2);
    const toPlayer = [...this.hands.map((h) => h.pile).filter((p) => p.amount > 0), ...this.payoutPiles];
    if (toPlayer.length) sfx.play('handle', { vol: 0.6 });
    await Promise.all(toPlayer.map((p) => slideChips(p.group, new THREE.Vector3(p.group.position.x, 0, bottom.z), 0.5, 0.08, 'power2.in')));
    for (const p of this.payoutPiles) p.dispose();
    this.payoutPiles = [];
    const all = [...this.dealer, ...this.hands.flatMap((h) => h.cards)];
    sfx.play('shove', { vol: 0.7 });
    await collectCards(all, table.trayTop(), table.trayYaw, (c) => {
      cards.destroy(c);
      this.discards++;
      table.setTrayFill(this.discards / (this.shoe.total * 0.8));
    });
    for (const hv of this.hands) {
      hv.pile.dispose();
      hv.bubble.remove();
      hv.label.remove();
    }
    this.dealer = [];
    this.dealerBubble?.show(false);
    stage.setZoom(1);
    this.hands = [this.newHand(0)];
    this.round = null;
    this.bet = this.affordable(this.lastBet);
    this.toBetting();
    if (this.bet) {
      this.busy = true;
      sfx.play('handle', { vol: 0.5 });
      await this.hands[0].pile.dropIn(this.bet, stage.screenToTable(0.5, 0.97, 1.6));
      this.busy = false;
      this.refreshBetUi();
    }
    if (this.g.wallet.balance < RULES.minBet) this.g.hud.toast(t('toast.outOfChips'), 2600);
  }

  private async shuffleShoe() {
    const { table } = this.g;
    // the discards go back, then the dealer riffles and reloads the shoe
    const t0 = this.discards / (this.shoe.total * 0.8);
    const s0 = this.shoeFill;
    const p = { t: 0 };
    await gsap.to(p, {
      t: 1,
      duration: 0.6,
      ease: 'power1.inOut',
      onUpdate: () => {
        table.setTrayFill(t0 * (1 - p.t));
        table.setShoeFill(s0 * (1 - p.t));
      },
    });
    await shuffleShow(this.g, { quick: true });
    this.shoe.shuffle();
    this.discards = 0;
    this.shoeFill = 1;
  }
}
