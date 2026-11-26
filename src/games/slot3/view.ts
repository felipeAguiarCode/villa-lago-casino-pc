import * as THREE from 'three';
import gsap from 'gsap';
import { addStrings, t } from '../../core/i18n';
import { Shoe, type Card } from '../../core/cards';
import { money } from '../../core/wallet';
import { slideChips } from '../../table/anim';
import { cardDataURL } from '../../table/cardFaces';
import { ChipPile } from '../../table/chips';
import { betRing } from '../../table/prints';
import { shuffleShow } from '../../table/shuffle';
import type { BtnSpec } from '../../ui/hud';
import { Paytable } from '../../ui/paytable';
import { finishXP } from '../kit';
import type { GameCtx, GameView } from '../types';
import { MINI_ROYAL_MAX, SLOT, SLOT_ROWS, slotKey, slotPays, type SlotKey } from './rules';

addStrings(
  {
    'slot.spin': 'Spin',
    'slot.coin': 'COIN',
    'slot.bet': 'BET',
    'slot.win': 'WIN',
    'slot.coinBtn': 'Coin {n}',
    'slot.miniRoyal': 'Mini Royal',
    'slot.tryAgain': 'TRY AGAIN',
    'slot.title': 'THREE CARD SLOTS',
    'slot.rules': `
      <p>A slot machine with poker reels. Choose the coin value and bet 1 to 5 coins, then <b>Spin</b>. The three reels stop on three cards from one deck — the three-card poker hand they make is paid by the table.</p>
      <h4>Paytable (per coin)</h4>
      <p>Mini Royal (A-K-Q suited) 101 — <b>${MINI_ROYAL_MAX} with 5 coins</b> · Straight flush 41 · Three of a kind 31 · Straight 7 · Flush 5 · Pair 2. Payouts include the bet ("for"), so a pair doubles it.</p>
      <h4>Return</h4><p>98.8 % per coin, 99.7 % at maximum bet.</p>`,
  },
  {
    'slot.spin': 'Girar',
    'slot.coin': 'FICHA',
    'slot.bet': 'APOSTA',
    'slot.win': 'GANHO',
    'slot.coinBtn': 'Ficha {n}',
    'slot.tryAgain': 'TENTE DE NOVO',
    'slot.rules': `
      <p>Um caça-níquel com rolos de pôquer. Escolha o valor da ficha e aposte de 1 a 5 fichas, depois <b>Gire</b>. Os três rolos param em três cartas de um baralho — a mão de três cartas que elas formam é paga pela tabela.</p>
      <h4>Tabela (por ficha)</h4>
      <p>Mini Royal (A-K-Q do mesmo naipe) 101 — <b>${MINI_ROYAL_MAX} com 5 fichas</b> · Straight flush 41 · Trinca 31 · Sequência 7 · Flush 5 · Par 2. O pagamento inclui a aposta, então um par dobra.</p>
      <h4>Retorno</h4><p>98,8 % por ficha, 99,7 % na aposta máxima.</p>`,
  },
);

const ROW_NAME: Record<SlotKey, string> = {
  miniRoyal: 'slot.miniRoyal',
  straightFlush: 'hand.straightFlush',
  trips: 'hand.trips',
  straight: 'hand.straight',
  flush: 'hand.flush',
  pair: 'hand.pair',
};
const STRIP = 22;

export class Slot3View implements GameView {
  readonly id = 'slot3';
  readonly title = 'Three Card Slots';
  private state: 'idle' | 'shuffling' | 'spinning' = 'idle';
  private coinIdx = 1;
  private coins = 5;
  private lastWin = 0;
  private cab: HTMLElement | null = null;
  private reels: HTMLElement[] = [];
  private paytable: Paytable | null = null;
  private pile: ChipPile | null = null;
  private pileHome = new THREE.Vector3();
  private urls = new Map<Card, string>();
  private shoe = new Shoe(1, 1.01);
  private shown: Card[] = [];

  constructor(private g: GameCtx) {}

  get inRound() {
    return this.state !== 'idle';
  }

  rules() {
    return t('slot.rules');
  }

  private get coin() {
    return SLOT.coins[this.coinIdx];
  }

  private url(c: Card) {
    let u = this.urls.get(c);
    if (!u) {
      u = cardDataURL(c, 110);
      this.urls.set(c, u);
    }
    return u;
  }

  async enter() {
    const { stage, table, hud } = this.g;
    stage.setZoom(1);
    table.setFelt('slot3');
    this.pileHome = stage.screenToTable(0.5, 0.715);
    table.addDecalAt(betRing(t('slot.bet')), this.pileHome.x, this.pileHome.z, 0.6);
    this.pile = new ChipPile(this.g.chips, stage.table, this.pileHome.clone());
    this.paytable = new Paytable(
      hud.root,
      '',
      SLOT_ROWS.map((r) => [t(ROW_NAME[r.key]), ...[1, 2, 3, 4, 5].map((c) => (r.key === 'miniRoyal' && c === 5 ? MINI_ROYAL_MAX * 5 : r.pays * c))]),
      { head: ['', '1', '2', '3', '4', '5'], cls: 'vp' },
    );
    this.paytable.column(this.coins);
    this.state = 'shuffling';
    table.setShoeFill(0);
    table.setTrayFill(0);
    await shuffleShow(this.g, { at: [0.5, 0.5] });
    if (this.state !== 'shuffling') return;
    this.state = 'idle';
    this.buildCabinet();
    this.idleBar();
  }

  async exit() {
    const { hud, table, stage } = this.g;
    this.state = 'idle';
    hud.setBetBar(null);
    hud.setActions(null);
    this.cab?.remove();
    this.cab = null;
    this.reels = [];
    this.paytable?.remove();
    this.paytable = null;
    this.pile?.dispose();
    this.pile = null;
    table.clearDecals();
    stage.setZoom(1);
  }

  onWalletChange() {
    if (this.state === 'idle') this.idleBar();
  }

  private buildCabinet() {
    const cab = document.createElement('div');
    cab.className = 'slotcab';
    cab.innerHTML = `<div class="slot-title gold-text">${t('slot.title')}</div><div class="slot-window"></div><div class="slot-line"></div>`;
    const win = cab.querySelector('.slot-window')!;
    this.reels = [];
    const start = this.shown.length === 3 ? this.shown : [12, 24, 36];
    for (let i = 0; i < 3; i++) {
      const reel = document.createElement('div');
      reel.className = 'slot-reel';
      const strip = document.createElement('div');
      strip.className = 'slot-strip';
      strip.innerHTML = `<img alt="" src="${this.url(start[i])}">`;
      reel.appendChild(strip);
      win.appendChild(reel);
      this.reels.push(reel);
    }
    this.g.hud.root.appendChild(cab);
    this.cab = cab;
    gsap.from(cab, { opacity: 0, scale: 0.85, duration: 0.5, ease: 'back.out(1.6)' });
  }

  private bar(betting: boolean) {
    const { hud, wallet } = this.g;
    const buttons: BtnSpec[] = [
      { id: 'coin', label: t('slot.coinBtn', { n: this.coin }), color: 'purple', icon: 'chip', enabled: betting, onClick: () => this.cycleCoin() },
      { id: 'betone', label: t('btn.betOne'), color: 'blue', icon: 'chip', enabled: betting, onClick: () => this.betOne() },
      { id: 'betmax', label: t('btn.betMax'), color: 'gold', icon: 'chips', enabled: betting && wallet.canAfford(this.coin * 5), onClick: () => this.betMax() },
      { id: 'spin', label: t('slot.spin'), color: 'green', icon: 'cycle', enabled: betting && wallet.canAfford(this.coin * this.coins), onClick: () => this.spin() },
    ];
    hud.setBetBar({
      chips: [],
      onChip: () => {},
      leds: [
        { id: 'coin', label: t('slot.coin'), value: money(this.coin) },
        { id: 'bet', label: t('slot.bet'), value: String(this.coins) },
        { id: 'win', label: t('slot.win'), value: money(this.lastWin), cls: 'red' },
      ],
      buttons,
    });
  }

  private idleBar() {
    this.bar(true);
  }

  private cycleCoin() {
    this.g.sfx.click();
    this.coinIdx = (this.coinIdx + 1) % SLOT.coins.length;
    this.idleBar();
  }

  private betOne() {
    this.g.sfx.play('chip', { vol: 0.7 });
    this.coins = (this.coins % 5) + 1;
    this.paytable?.column(this.coins);
    this.idleBar();
  }

  private betMax() {
    this.g.sfx.play('stack', { vol: 0.7 });
    this.coins = 5;
    this.paytable?.column(this.coins);
    this.idleBar();
    this.spin();
  }

  /** One reel: a long strip of random cards scrolls down and lands on the result with a bounce. */
  private spinReel(reel: HTMLElement, result: Card, i: number): Promise<void> {
    const strip = reel.querySelector<HTMLElement>('.slot-strip')!;
    const cur = strip.querySelector('img:last-child')?.getAttribute('src') ?? '';
    const imgs: string[] = [`<img alt="" src="${this.url(result)}">`];
    for (let k = 0; k < STRIP; k++) imgs.push(`<img alt="" src="${this.url(Math.floor(Math.random() * 52))}">`);
    imgs.push(`<img alt="" src="${cur}">`);
    strip.innerHTML = imgs.join('');
    const h = reel.clientHeight;
    const total = (imgs.length - 1) * h;
    gsap.set(strip, { y: -total });
    reel.classList.add('spinning');
    return new Promise((res) => {
      gsap
        .timeline({ onComplete: () => res() })
        .to(strip, { y: -h * 3, duration: 1.1 + i * 0.45, ease: 'power1.in' })
        .add(() => reel.classList.remove('spinning'))
        .to(strip, { y: 0, duration: 0.55, ease: 'back.out(2.2)' })
        .add(() => {
          strip.innerHTML = `<img alt="" src="${this.url(result)}">`;
          gsap.set(strip, { y: 0 });
          this.g.sfx.play('place', { vol: 0.8, rate: 0.9 + i * 0.08 });
        });
    });
  }

  private async spin() {
    const { wallet, hud, sfx, fx, stage } = this.g;
    if (this.state !== 'idle') return;
    const cost = this.coin * this.coins;
    if (!wallet.canAfford(cost)) return hud.toast(t('toast.noFunds'));
    this.state = 'spinning';
    this.lastWin = 0;
    this.paytable?.highlight(null);
    this.cab?.classList.remove('win');
    wallet.debit(cost);
    this.bar(false);
    sfx.play('handle', { vol: 0.5 });
    const coinsIn = this.pile!.dropIn(cost, stage.screenToTable(0.5, 0.97, 1.6), 0.06);
    this.shoe.shuffle();
    const hand = [this.shoe.draw(), this.shoe.draw(), this.shoe.draw()];
    this.shown = hand;
    sfx.play('shuffle', { vol: 0.6, rate: 1.3 });
    await Promise.all(this.reels.map((r, i) => this.spinReel(r, hand[i], i)));
    await coinsIn;
    const key = slotKey(hand);
    const won = slotPays(hand, this.coins) * this.coin;
    let banner: Promise<void>;
    if (won > 0 && key) {
      const row = SLOT_ROWS.findIndex((r) => r.key === key);
      this.paytable?.highlight(row);
      this.cab?.classList.add('win');
      wallet.credit(won);
      this.lastWin = won;
      fx.burst(stage.screenToTable(0.5, 0.42, 0.3), row <= 2 ? 180 : 80);
      sfx.win(row <= 2);
      if (row <= 2) this.g.trophy('big');
      banner = hud.banner(t(ROW_NAME[key]).toUpperCase(), `+${money(won)}`, row <= 3 ? 'win' : 'win small', row <= 2 ? 1900 : 1300);
    } else {
      sfx.lose();
      banner = hud.banner(t('slot.tryAgain'), '', 'lose small', 800);
    }
    // the coins go back to the player (win) or to the house (loss)
    const pile = this.pile!;
    const to = won > 0 ? stage.screenToTable(0.5, 1.2) : stage.screenToTable(0.5, -0.1);
    sfx.play('handle', { vol: 0.5 });
    await slideChips(pile.group, new THREE.Vector3(this.pileHome.x, 0, to.z), 0.5, 0.1, 'power2.in');
    pile.clear();
    pile.group.position.copy(this.pileHome);
    await finishXP(this.g, cost, won - cost, banner);
    this.state = 'idle';
    this.idleBar();
  }
}
