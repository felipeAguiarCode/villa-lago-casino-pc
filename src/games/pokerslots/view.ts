import gsap from 'gsap';
import { addStrings, t } from '../../core/i18n';
import { cardLabel, rankOf, type Card } from '../../core/cards';
import { cryptoRng } from '../../core/rng';
import { money } from '../../core/wallet';
import { cardDataURL } from '../../table/cardFaces';
import { shuffleShow } from '../../table/shuffle';
import type { BtnSpec } from '../../ui/hud';
import { finishXP } from '../kit';
import type { GameCtx, GameView } from '../types';
import { DotMatrix } from './marquee';
import { Reels } from './reels';
import { artCards, cardAt, PS, PS_ROWS, psPays, psRow, psRow4, spinStops, STRIPS, type PsKey } from './rules';
import { holdAdvice } from './strategy';
import './pokerslots.css';

addStrings(
  {
    'pks.title': 'POKER SLOTS',
    'pks.msgLabel': 'Instructions',
    'pks.won': 'Won',
    'pks.credits': 'Credits',
    'pks.hold': 'HOLD',
    'pks.held': 'HELD',
    'pks.spin': 'Spin',
    'pks.coin': 'COIN',
    'pks.bet': 'BET',
    'pks.coinBtn': 'Coin {n}',
    'pks.any': 'ANY',
    'pks.welcome': '♠ POKER SLOTS ♥ ROYAL FLUSH PAYS {n} ♦ PRESS SPIN ♣',
    'pks.luck': 'GOOD LUCK!',
    'pks.holdsOn': 'HOLDS ON! HOLD ANY REELS AND SPIN',
    'pks.tryAgain': 'NO WIN - PRESS SPIN',
    'pks.winMsg': '{hand} PAYS {n}',
    'pks.holdHint': 'Hold {cards}',
    'pks.holdNone': 'No hold: just spin',
    'pks.holdsLost': 'Holds cancelled: the bet changed',
    'pks.rules': `
      <p>A four-reel poker slot machine. Each reel is a strip of the 52 cards; the four cards on the red payline are paid as a four-card poker hand. Choose the coin and bet 1 to 5 coins, then <b>Spin</b> (Space) or pull the lever.</p>
      <h4>Holds</h4><p>Now and then, after a losing spin, the <b>HOLD</b> keys light up (keys 1–4). Hold the reels you like and spin again at the same bet: held reels stay still. A held spin never lights the holds again.</p>
      <h4>Paytable (per coin, bet included)</h4>
      <p>Royal flush (J-Q-K-A suited) 1000 · Straight flush 150 · Four of a kind 60 · Straight 12 · Flush 10 · Three of a kind 8 · Two pair 5 · Pair of Jacks or better 2. The reels are independent, so the same card can show twice.</p>
      <h4>Return</h4><p>97.4 % holding as the hint does (the light bulb), 79.5 % without ever holding.</p>`,
  },
  {
    'pks.msgLabel': 'Mensagens',
    'pks.won': 'Ganho',
    'pks.credits': 'Créditos',
    'pks.hold': 'TRAVAR',
    'pks.held': 'TRAVADO',
    'pks.spin': 'Girar',
    'pks.coin': 'FICHA',
    'pks.bet': 'APOSTA',
    'pks.coinBtn': 'Ficha {n}',
    'pks.any': 'QUALQUER',
    'pks.welcome': '♠ POKER SLOTS ♥ ROYAL FLUSH PAGA {n} ♦ APERTE GIRAR ♣',
    'pks.luck': 'BOA SORTE!',
    'pks.holdsOn': 'TRAVAS LIBERADAS! TRAVE OS ROLOS E GIRE',
    'pks.tryAgain': 'SEM PREMIO - APERTE GIRAR',
    'pks.winMsg': '{hand} PAGA {n}',
    'pks.holdHint': 'Trave {cards}',
    'pks.holdNone': 'Não trave: só gire',
    'pks.holdsLost': 'Travas canceladas: a aposta mudou',
    'pks.rules': `
      <p>Um caça-níquel de pôquer com quatro rolos. Cada rolo é uma fita com as 52 cartas; as quatro cartas na linha vermelha são pagas como uma mão de pôquer de quatro cartas. Escolha a ficha e aposte de 1 a 5 fichas, depois <b>Gire</b> (Espaço) ou puxe a alavanca.</p>
      <h4>Travas</h4><p>De vez em quando, depois de um giro sem prêmio, as teclas <b>TRAVAR</b> acendem (teclas 1–4). Trave os rolos que quiser e gire de novo com a mesma aposta: os rolos travados ficam parados. Um giro com travas nunca acende as travas de novo.</p>
      <h4>Tabela (por ficha, aposta incluída)</h4>
      <p>Royal flush (J-Q-K-A do mesmo naipe) 1000 · Straight flush 150 · Quadra 60 · Sequência 12 · Flush 10 · Trinca 8 · Dois pares 5 · Par de Valetes ou maior 2. Os rolos são independentes, então a mesma carta pode aparecer duas vezes.</p>
      <h4>Retorno</h4><p>97,4 % travando como a dica (a lâmpada), 79,5 % sem nunca travar.</p>`,
  },
);

const ROW_NAME: Record<PsKey, string> = {
  royal: 'hand.royal',
  straightFlush: 'hand.straightFlush',
  quads: 'hand.quads',
  straight: 'hand.straight',
  flush: 'hand.flush',
  trips: 'hand.trips',
  twoPair: 'hand.twoPair',
  jacks: 'hand.jacks',
};

const wait = (s: number) => new Promise<void>((r) => gsap.delayedCall(s, r));
const digits = (n: number) => money(n);

/** Which reels make the paid hand (the pair of a Jacks win, the trips…), for the win glow. */
function winningReels(line: Card[], row: number): boolean[] {
  const ranks = line.map(rankOf);
  const count = (r: number) => ranks.filter((x) => x === r).length;
  if (row === 5) return ranks.map((r) => count(r) >= 3);
  if (row === 7) return ranks.map((r) => count(r) === 2 && r >= 11);
  return [true, true, true, true];
}

export class PokerSlotsView implements GameView {
  readonly id = 'pokerslots';
  readonly title = 'Poker Slots';
  private state: 'idle' | 'shuffling' | 'spinning' = 'idle';
  private coinIdx = 1;
  private coins = 5;
  private stops = [0, 0, 0, 0].map(() => cryptoRng(52));
  private held = [false, false, false, false];
  /** A HOLD offer is lit for the next spin. */
  private holdsOn = false;
  private cab: HTMLElement | null = null;
  private pay: HTMLElement | null = null;
  private payRows: HTMLElement[] = [];
  private holdBtns: HTMLButtonElement[] = [];
  private lever: HTMLElement | null = null;
  private reels: Reels | null = null;
  private dots: DotMatrix | null = null;
  private won: DotMatrix | null = null;
  private cred: DotMatrix | null = null;
  private motor: (() => void) | null = null;
  private off: (() => void)[] = [];
  private shownWon = 0;
  private clock = 0;
  /** Dev and tests: the cards the next spin lands on (reel order). */
  rig: Card[] | null = null;

  constructor(private g: GameCtx) {}

  get inRound() {
    return this.state === 'spinning';
  }

  rules() {
    return t('pks.rules');
  }

  private get coin() {
    return PS.coins[this.coinIdx];
  }

  async enter() {
    const { stage, table, hud } = this.g;
    stage.setZoom(1);
    table.setFelt('pokerslots');
    this.buildPaytable();
    // the cabinet is laid out at once (hidden) so the reels can draw their cards during the show
    this.buildCabinet();
    this.off.push(
      stage.onFrame((dt) => {
        this.clock += dt;
        this.reels?.frame(dt);
        this.dots?.frame(dt, this.clock);
        this.won?.frame(dt, this.clock);
        this.cred?.frame(dt, this.clock);
      }),
    );
    const key = (e: KeyboardEvent) => this.key(e);
    window.addEventListener('keydown', key);
    this.off.push(() => window.removeEventListener('keydown', key));
    hud.onHint = () => this.hint();
    this.state = 'shuffling';
    table.setShoeFill(0);
    table.setTrayFill(0);
    await shuffleShow(this.g, { at: [0.5, 0.5] });
    if (this.state !== 'shuffling') return;
    this.state = 'idle';
    // the machine stands in front: the deck box and the discard tray would peek out behind it
    table.setProps(false);
    this.reveal();
    this.message(t('pks.welcome', { n: money(PS_ROWS[0].pays * this.coins) }));
    this.idleBar();
  }

  async exit() {
    const { hud, table, stage } = this.g;
    this.state = 'idle';
    this.motor?.();
    this.motor = null;
    hud.setBetBar(null);
    hud.setActions(null);
    hud.showHint(false);
    hud.onHint = () => {};
    this.off.forEach((f) => f());
    this.off = [];
    this.reels?.dispose();
    this.reels = null;
    for (const d of [this.dots, this.won, this.cred]) d?.dispose();
    this.dots = this.won = this.cred = null;
    gsap.killTweensOf(this);
    this.cab?.remove();
    this.cab = null;
    this.pay?.remove();
    this.pay = null;
    this.payRows = [];
    this.holdBtns = [];
    this.lever = null;
    this.holdsOn = false;
    this.held = [false, false, false, false];
    table.clearDecals();
    table.setProps(true);
    stage.setZoom(1);
  }

  onWalletChange() {
    this.credits();
    if (this.state === 'idle') this.idleBar();
  }

  // ---------------------------------------------------------------- the machine
  private buildPaytable() {
    const el = document.createElement('div');
    el.className = 'paytable ps-pay';
    this.payRows = PS_ROWS.map((row) => {
      const r = document.createElement('div');
      r.className = 'ps-row';
      const cards = artCards(row)
        .map((c) => (c === null ? `<span class="ps-any" title="${t('pks.any')}">?</span>` : `<img alt="${cardLabel(c)}" src="${cardDataURL(c, 72)}">`))
        .join('');
      r.innerHTML = `<div class="ps-cards">${cards}</div><div class="ps-val"><small>${t(ROW_NAME[row.key])}</small><b></b></div>`;
      el.appendChild(r);
      return r;
    });
    this.g.hud.root.appendChild(el);
    this.pay = el;
    this.payValues();
  }

  private payValues() {
    this.payRows.forEach((r, i) => (r.querySelector('b')!.textContent = money(PS_ROWS[i].pays * this.coins)));
  }

  private highlight(row: number | null) {
    this.payRows.forEach((r, i) => r.classList.toggle('hit', i === row));
  }

  private buildCabinet() {
    const cab = document.createElement('div');
    cab.className = 'pslot';
    const bulbs = Array.from({ length: 22 }, (_, i) => `<i style="--k:${i}"></i>`).join('');
    cab.innerHTML = `
      <div class="ps-bulbs">${bulbs}</div>
      <div class="ps-bulbs bottom">${bulbs}</div>
      <div class="ps-head"><span class="ps-title gold-text">${t('pks.title')}</span></div>
      <div class="ps-leds">
        <div class="ps-msg"><small>${t('pks.msgLabel')}</small><canvas></canvas></div>
        <div class="ps-won"><small>${t('pks.won')}</small><canvas></canvas></div>
        <div class="ps-cred"><small>${t('pks.credits')}</small><canvas></canvas></div>
      </div>
      <div class="ps-window"><canvas class="ps-reels"></canvas><div class="ps-line"></div><div class="ps-glass"></div></div>
      <div class="ps-holds"></div>
      <div class="ps-lever"><div class="ps-arm"><div class="ps-knob"></div></div><div class="ps-hub"></div></div>`;
    const holds = cab.querySelector('.ps-holds')!;
    this.holdBtns = [0, 1, 2, 3].map((i) => {
      const b = document.createElement('button');
      b.className = 'ps-hold';
      b.innerHTML = `<span>${t('pks.hold')}</span><kbd>${i + 1}</kbd>`;
      b.disabled = true;
      b.addEventListener('click', () => this.toggle(i));
      holds.appendChild(b);
      return b;
    });
    this.lever = cab.querySelector('.ps-lever');
    this.lever!.addEventListener('pointerdown', (e) => this.pull(e));
    this.g.hud.root.appendChild(cab);
    this.cab = cab;
    this.won = new DotMatrix(cab.querySelector('.ps-won canvas')!, '#ff3b2f');
    this.cred = new DotMatrix(cab.querySelector('.ps-cred canvas')!, '#43ff7a');
    this.setWon(0, false);
    this.credits();
    this.reels = new Reels(cab.querySelector('.ps-reels')!, STRIPS, this.stops, {
      tick: (i) => {
        if (i === this.lastSpinning) this.g.sfx.tick(0.05, 1.35);
      },
      stopped: (i) => this.g.sfx.reelStop(i),
    });
    this.dots = new DotMatrix(cab.querySelector('.ps-msg canvas')!);
  }

  private lastSpinning = 3;

  private reveal() {
    const cab = this.cab;
    if (!cab) return;
    cab.classList.add('on');
    gsap.fromTo(cab, { opacity: 0, y: 24, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'back.out(1.5)' });
    if (this.pay) gsap.fromTo(this.pay, { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.5, delay: 0.1, ease: 'power2.out' });
  }

  private message(text: string, flash = 0) {
    this.dots?.show(text, flash);
  }

  private credits() {
    this.cred?.show(digits(this.g.wallet.balance));
  }

  /** The WON display; a win counts up, ticking like a coin meter. */
  private setWon(n: number, animate: boolean) {
    gsap.killTweensOf(this);
    if (!animate) {
      this.shownWon = n;
      this.won?.show(digits(n));
      return;
    }
    let last = -1;
    gsap.to(this, {
      shownWon: n,
      duration: Math.min(2.4, 0.5 + n / Math.max(1, this.coin * 40)),
      ease: 'power1.out',
      onUpdate: () => {
        const v = Math.round(this.shownWon);
        this.won?.show(digits(v));
        const step = Math.floor(v / Math.max(1, this.coin));
        if (step !== last) {
          last = step;
          this.g.sfx.tick(0.03, 1.8);
        }
      },
    });
  }

  // ---------------------------------------------------------------- bet bar
  private bar(betting: boolean) {
    const { hud, wallet } = this.g;
    const free = betting && !this.holdsOn;
    const buttons: BtnSpec[] = [
      { id: 'coin', label: t('pks.coinBtn', { n: this.coin }), color: 'purple', icon: 'chip', enabled: free, onClick: () => this.cycleCoin() },
      { id: 'betone', label: t('btn.betOne'), color: 'blue', icon: 'chip', enabled: free, onClick: () => this.betOne() },
      { id: 'betmax', label: t('btn.betMax'), color: 'gold', icon: 'chips', enabled: free && wallet.canAfford(this.coin * 5), onClick: () => this.betMax() },
      { id: 'spin', label: t('pks.spin'), color: 'green', icon: 'cycle', enabled: betting && wallet.canAfford(this.coin * this.coins), onClick: () => this.spin() },
    ];
    hud.setBetBar({
      chips: [],
      onChip: () => {},
      leds: [
        { id: 'coin', label: t('pks.coin'), value: money(this.coin) },
        { id: 'bet', label: t('pks.bet'), value: String(this.coins) },
      ],
      buttons,
    });
  }

  private idleBar() {
    this.bar(true);
    this.lever?.classList.toggle('ready', this.g.wallet.canAfford(this.coin * this.coins));
  }

  private cycleCoin() {
    if (this.holdsOn) return;
    this.g.sfx.click();
    this.coinIdx = (this.coinIdx + 1) % PS.coins.length;
    this.idleBar();
  }

  private betOne() {
    if (this.holdsOn) return;
    this.g.sfx.play('chip', { vol: 0.7 });
    this.coins = (this.coins % PS.maxCoins) + 1;
    this.payValues();
    this.idleBar();
  }

  private betMax() {
    if (this.holdsOn) return;
    this.g.sfx.play('stack', { vol: 0.7 });
    this.coins = PS.maxCoins;
    this.payValues();
    this.idleBar();
    this.spin();
  }

  // ---------------------------------------------------------------- holds
  private toggle(i: number) {
    if (this.state !== 'idle' || !this.holdsOn) return;
    // at least one reel must spin
    if (!this.held[i] && this.held.filter(Boolean).length >= 3) return;
    this.held[i] = !this.held[i];
    this.g.sfx.holdKey(this.held[i]);
    this.reels?.setHeld(i, this.held[i]);
    this.syncHolds();
  }

  private syncHolds() {
    this.holdBtns.forEach((b, i) => {
      b.disabled = !this.holdsOn || this.state !== 'idle';
      b.classList.toggle('lit', this.holdsOn && this.state === 'idle');
      b.classList.toggle('on', this.held[i]);
      b.classList.remove('advice');
      b.querySelector('span')!.textContent = this.held[i] ? t('pks.held') : t('pks.hold');
    });
  }

  private hint() {
    if (this.state !== 'idle' || !this.holdsOn || !this.reels) return;
    const line = this.reels.line();
    const adv = holdAdvice(line);
    this.holdBtns.forEach((b, i) => b.classList.toggle('advice', adv.held[i]));
    const cards = line.filter((_, i) => adv.held[i]).map(cardLabel);
    this.g.hud.toast(cards.length ? t('pks.holdHint', { cards: cards.join(' ') }) : t('pks.holdNone'), 2400);
  }

  private key(e: KeyboardEvent) {
    if (!this.cab || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.g.hud.root.querySelector('.modal:not(.hidden) .panel')) return;
    if (/^[1-4]$/.test(e.key)) {
      this.toggle(Number(e.key) - 1);
      e.preventDefault();
    } else if (e.key === ' ' || e.key === 'Enter') {
      if (this.state === 'idle') {
        e.preventDefault();
        this.spin();
      }
    }
  }

  /** The lever: pull it down (or click it) to spin. */
  private pull(e: PointerEvent) {
    if (this.state !== 'idle' || !this.lever) return;
    e.preventDefault();
    const arm = this.lever.querySelector<HTMLElement>('.ps-arm')!;
    const y0 = e.clientY;
    const h = this.lever.getBoundingClientRect().height;
    let k = 0;
    const move = (ev: PointerEvent) => {
      k = Math.max(0, Math.min(1, (ev.clientY - y0) / (h * 0.45)));
      gsap.set(arm, { rotateX: -k * 150 });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      // a click pulls it all the way; a short drag snaps back without spinning
      if (k < 0.15 || k > 0.55) this.spin();
      else gsap.to(arm, { rotateX: 0, duration: 0.5, ease: 'elastic.out(1, 0.4)' });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  private leverAnim() {
    const arm = this.lever?.querySelector<HTMLElement>('.ps-arm');
    if (!arm) return;
    this.g.sfx.lever();
    gsap
      .timeline()
      .to(arm, { rotateX: -150, duration: 0.16, ease: 'power2.in', overwrite: true })
      .to(arm, { rotateX: 0, duration: 0.9, ease: 'elastic.out(1, 0.35)' });
  }

  // ---------------------------------------------------------------- the spin
  private async spin() {
    const { wallet, hud, sfx, fx, stage } = this.g;
    if (this.state !== 'idle' || !this.reels) return;
    const cost = this.coin * this.coins;
    if (!wallet.canAfford(cost)) return hud.toast(t('toast.noFunds'));
    this.state = 'spinning';
    const heldSpin = this.holdsOn && this.held.some(Boolean);
    const held = heldSpin ? [...this.held] : [false, false, false, false];
    if (!heldSpin) this.held.forEach((h, i) => h && this.reels?.setHeld(i, false));
    this.holdsOn = false;
    this.held = held;
    this.syncHolds();
    hud.showHint(false);
    wallet.debit(cost);
    this.credits();
    this.setWon(0, false);
    this.highlight(null);
    this.reels.showWin(null);
    this.cab?.classList.remove('win', 'bigwin');
    this.bar(false);
    this.lever?.classList.remove('ready');
    this.leverAnim();
    this.message(t('pks.luck'));
    const rig = this.rig;
    this.rig = null;
    const next = rig ? rig.map((c, i) => (held[i] ? this.stops[i] : STRIPS[i].indexOf(c))) : spinStops(this.stops, held, cryptoRng);
    const order = [0, 1, 2, 3].filter((i) => !held[i]);
    this.lastSpinning = order[order.length - 1];
    await wait(0.12);
    this.motor = sfx.reelMotor();
    order.forEach((i, k) => this.reels!.spin(i, k * 0.06));
    // the reels stop left to right; the last one keeps spinning when a big hand is one card away
    const stopping: Promise<void>[] = [];
    let at = 0.95 + (held.some(Boolean) ? 0.15 : 0);
    let elapsed = 0;
    for (let k = 0; k < order.length; k++) {
      const i = order[k];
      if (k === order.length - 1 && this.anticipate(next, held, i)) {
        await wait(Math.max(0, at - elapsed));
        elapsed = at;
        this.reels.setGlow(i, true);
        sfx.anticipation(1.5);
        at += 1.55;
      }
      await wait(Math.max(0, at - elapsed));
      elapsed = at;
      stopping.push(this.reels.stop(i, next[i]));
      at += 0.34;
    }
    await Promise.all(stopping);
    this.reels.setGlow(this.lastSpinning, false);
    this.motor?.();
    this.motor = null;
    this.stops = next;
    this.held.forEach((h, i) => h && this.reels?.setHeld(i, false));
    this.held = [false, false, false, false];

    const line = this.stops.map((s, i) => cardAt(i, s));
    const row = psRow(line);
    const won = psPays(line, this.coins) * this.coin;
    let banner: Promise<void>;
    if (won > 0) {
      const big = row <= 2;
      wallet.credit(won);
      this.highlight(row);
      this.reels.showWin(winningReels(line, row));
      this.cab?.classList.add(big ? 'bigwin' : 'win');
      this.setWon(won, true);
      this.credits();
      this.message(t('pks.winMsg', { hand: t(ROW_NAME[PS_ROWS[row].key]), n: money(won) }), big ? 3 : 0);
      fx.burst(stage.screenToTable(0.5, 0.5, 0.3), big ? 200 : row <= 4 ? 90 : 40);
      if (big) {
        sfx.jackpot();
        this.g.trophy('big');
      } else {
        sfx.win(row <= 4);
        sfx.coins(Math.min(30, 4 + PS_ROWS[row].pays), 0.2);
      }
      banner = hud.banner(t(ROW_NAME[PS_ROWS[row].key]).toUpperCase(), `+${money(won)}`, row <= 4 ? 'win' : 'win small', big ? 2000 : 1200);
    } else {
      // a losing plain spin may light the holds for the next one
      if (!heldSpin && cryptoRng(1000) < PS.holdChance * 1000) {
        this.holdsOn = true;
        sfx.holdsOn();
        this.message(t('pks.holdsOn'), 0);
        hud.showHint(this.g.settings.hints);
      } else this.message(t('pks.tryAgain'));
      banner = Promise.resolve();
    }
    await finishXP(this.g, cost, won - cost, banner);
    if (!this.cab) return;
    this.state = 'idle';
    this.syncHolds();
    this.idleBar();
  }

  /** True when the last spinning reel could still make a straight flush, a royal or four of a kind. */
  private anticipate(next: number[], held: boolean[], last: number) {
    const known = next.map((s, i) => (i === last ? -1 : cardAt(i, s)));
    void held;
    for (let c = 0; c < 52; c++) {
      const l = known.map((k) => (k < 0 ? c : k));
      const r = psRow4(l[0], l[1], l[2], l[3]);
      if (r >= 0 && r <= 2) return true;
    }
    return false;
  }
}
