import gsap from 'gsap';
import { addStrings, locale, t } from '../../core/i18n';
import { cardLabel, type Card } from '../../core/cards';
import { money } from '../../core/wallet';
import { cardDataURL } from '../../table/cardFaces';
import type { GameCtx } from '../types';
import { DotMatrix } from './marquee';
import './pokerslots.css';

/**
 * The casino slot cabinet shared by Poker Slots and Hold'em Slots: chasing bulbs, the title with
 * its "?" key (the hand combinations), three dot-matrix displays (messages, won, credits), the reel
 * window with its payline and glass, a row for the machine's own keys, the side lever, and the
 * pictorial paytable in the left zone.
 */
addStrings(
  {
    'slotcab.msg': 'Instructions',
    'slotcab.won': 'Won',
    'slotcab.credits': 'Credits',
    'slotcab.help': 'Hand combinations',
    'slotcab.any': 'Any card',
    'slotcab.odds': '1 in {n}',
    'slotcab.pays': 'Pays',
    'slotcab.chance': 'Chance',
  },
  {
    'slotcab.msg': 'Mensagens',
    'slotcab.won': 'Ganho',
    'slotcab.credits': 'Créditos',
    'slotcab.help': 'Combinações de mãos',
    'slotcab.any': 'Qualquer carta',
    'slotcab.odds': '1 em {n}',
    'slotcab.pays': 'Paga',
    'slotcab.chance': 'Chance',
  },
);

export interface CabinetOpts {
  title: string;
  /** Extra class on the cabinet (e.g. 'wide' for seven reels). */
  cls?: string;
  /** The "?" key. */
  onHelp: () => void;
  /** The lever was pulled (or clicked). */
  onPull: () => void;
  /** The lever only works while this is true. */
  canPull: () => boolean;
}

export interface PayRowSpec {
  name: string;
  cards: (Card | null)[];
}

const tile = (c: Card | null, w: number) => (c === null ? `<span class="ps-any" title="${t('slotcab.any')}">?</span>` : `<img alt="${cardLabel(c)}" src="${cardDataURL(c, w)}">`);

export class SlotCabinet {
  readonly el: HTMLElement;
  readonly reelCanvas: HTMLCanvasElement;
  readonly window: HTMLElement;
  /** The row under the reels for the machine's own keys (HOLD keys…). */
  readonly keys: HTMLElement;
  readonly lever: HTMLElement;
  private msg: DotMatrix;
  private won: DotMatrix;
  private cred: DotMatrix;
  private pay: HTMLElement | null = null;
  private payRows: HTMLElement[] = [];
  private shownWon = 0;
  private wonTween: gsap.core.Tween | null = null;

  constructor(
    private g: GameCtx,
    private o: CabinetOpts,
  ) {
    const cab = document.createElement('div');
    cab.className = `pslot ${o.cls ?? ''}`;
    const bulbs = Array.from({ length: 22 }, (_, i) => `<i style="--k:${i}"></i>`).join('');
    cab.innerHTML = `
      <div class="ps-bulbs">${bulbs}</div>
      <div class="ps-bulbs bottom">${bulbs}</div>
      <div class="ps-head"><button class="ps-help" aria-label="${t('slotcab.help')}" title="${t('slotcab.help')}">?</button><span class="ps-title gold-text">${o.title}</span></div>
      <div class="ps-leds">
        <div class="ps-msg"><small>${t('slotcab.msg')}</small><canvas></canvas></div>
        <div class="ps-won"><small>${t('slotcab.won')}</small><canvas></canvas></div>
        <div class="ps-cred"><small>${t('slotcab.credits')}</small><canvas></canvas></div>
      </div>
      <div class="ps-window"><canvas class="ps-reels"></canvas><div class="ps-line"></div><div class="ps-glass"></div></div>
      <div class="ps-holds"></div>
      <div class="ps-lever"><div class="ps-arm"><div class="ps-knob"></div></div><div class="ps-hub"></div></div>`;
    cab.querySelector<HTMLButtonElement>('.ps-help')!.addEventListener('click', () => {
      this.g.sfx.click();
      o.onHelp();
    });
    this.lever = cab.querySelector('.ps-lever')!;
    this.lever.addEventListener('pointerdown', (e) => this.pull(e));
    this.reelCanvas = cab.querySelector('.ps-reels')!;
    this.window = cab.querySelector('.ps-window')!;
    this.keys = cab.querySelector('.ps-holds')!;
    g.hud.root.appendChild(cab);
    this.el = cab;
    this.msg = new DotMatrix(cab.querySelector('.ps-msg canvas')!);
    this.won = new DotMatrix(cab.querySelector('.ps-won canvas')!, '#ff3b2f');
    this.cred = new DotMatrix(cab.querySelector('.ps-cred canvas')!, '#43ff7a');
    this.setWon(0, false);
    this.credits();
  }

  frame(dt: number, clock: number) {
    this.msg.frame(dt, clock);
    this.won.frame(dt, clock);
    this.cred.frame(dt, clock);
  }

  dispose() {
    this.wonTween?.kill();
    this.msg.dispose();
    this.won.dispose();
    this.cred.dispose();
    this.el.remove();
    this.pay?.remove();
    this.pay = null;
  }

  /**
   * The machine comes in after the opening show. The hands paytable outside it stays on screen
   * the whole time (from the moment the table opens until it is left): it only gives a short
   * glow when the machine lights up.
   */
  reveal() {
    this.el.classList.add('on');
    gsap.fromTo(this.el, { opacity: 0, y: 24, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'back.out(1.5)' });
    if (this.pay) gsap.fromTo(this.pay, { filter: 'brightness(1.6)' }, { filter: 'brightness(1)', duration: 0.7, delay: 0.2, ease: 'power2.out', clearProps: 'filter' });
  }

  message(text: string, flash = 0) {
    this.msg.show(text, flash);
  }

  credits() {
    this.cred.show(money(this.g.wallet.balance));
  }

  /** The WON display; a win counts up, ticking like a coin meter (`step`: chips per tick). */
  setWon(n: number, animate: boolean, step = 1) {
    this.wonTween?.kill();
    if (!animate) {
      this.shownWon = n;
      this.won.show(money(n));
      return;
    }
    let last = -1;
    const o = { v: this.shownWon };
    this.wonTween = gsap.to(o, {
      v: n,
      duration: Math.min(2.4, 0.5 + n / Math.max(1, step * 40)),
      ease: 'power1.out',
      onUpdate: () => {
        const v = Math.round(o.v);
        this.shownWon = v;
        this.won.show(money(v));
        const k = Math.floor(v / Math.max(1, step));
        if (k !== last) {
          last = k;
          this.g.sfx.tick(0.03, 1.8);
        }
      },
    });
  }

  setWinState(state: 'win' | 'bigwin' | null) {
    this.el.classList.remove('win', 'bigwin');
    if (state) this.el.classList.add(state);
  }

  setLeverReady(ready: boolean) {
    this.lever.classList.toggle('ready', ready);
  }

  // ---------------------------------------------------------------- pictorial paytable
  showPaytable(rows: PayRowSpec[], cls = '') {
    const el = document.createElement('div');
    el.className = `paytable ps-pay ${cls}`;
    this.payRows = rows.map((row) => {
      const r = document.createElement('div');
      r.className = 'ps-row';
      r.innerHTML = `<div class="ps-cards">${row.cards.map((c) => tile(c, 72)).join('')}</div><div class="ps-val"><small>${row.name}</small><b></b></div>`;
      el.appendChild(r);
      return r;
    });
    this.g.hud.root.appendChild(el);
    this.pay = el;
  }

  payValues(values: string[]) {
    this.payRows.forEach((r, i) => (r.querySelector('b')!.textContent = values[i] ?? ''));
  }

  highlight(row: number | null) {
    this.payRows.forEach((r, i) => r.classList.toggle('hit', i === row));
  }

  // ---------------------------------------------------------------- lever
  private pull(e: PointerEvent) {
    if (!this.o.canPull()) return;
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
      if (k < 0.15 || k > 0.55) this.o.onPull();
      else gsap.to(arm, { rotateX: 0, duration: 0.5, ease: 'elastic.out(1, 0.4)' });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /** The lever swings down and springs back (every spin). */
  leverAnim() {
    const arm = this.lever.querySelector<HTMLElement>('.ps-arm');
    if (!arm) return;
    this.g.sfx.lever();
    gsap
      .timeline()
      .to(arm, { rotateX: -150, duration: 0.16, ease: 'power2.in', overwrite: true })
      .to(arm, { rotateX: 0, duration: 0.9, ease: 'elastic.out(1, 0.35)' });
  }
}

// ---------------------------------------------------------------- the "?" panel
export interface ComboSpec {
  name: string;
  cards: (Card | null)[];
  desc: string;
  pays: string;
  /** Chance per spin (or per played hand), 0..1. */
  p: number;
}

/** Opens the hand combinations: each hand with an example, what it takes, its pay and its odds. */
export function openCombos(g: GameCtx, title: string, intro: string, combos: ComboSpec[], note = '') {
  const body = document.createElement('div');
  body.className = 'ps-combos';
  const fmt = (p: number) => {
    const n = 1 / p;
    const digits = n >= 100 ? 0 : 1;
    return t('slotcab.odds', { n: n.toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits }) });
  };
  body.innerHTML =
    `<p class="pc-intro">${intro}</p>` +
    `<div class="pc-head"><span></span><span></span><span>${t('slotcab.pays')}</span><span>${t('slotcab.chance')}</span></div>` +
    combos
      .map(
        (c) => `<div class="pc-row">
          <div class="pc-cards">${c.cards.map((k) => tile(k, 96)).join('')}</div>
          <div class="pc-text"><b>${c.name}</b><small>${c.desc}</small></div>
          <div class="pc-pays">${c.pays}</div>
          <div class="pc-odds">${fmt(c.p)}</div>
        </div>`,
      )
      .join('') +
    (note ? `<p class="pc-note">${note}</p>` : '');
  g.hud.modal(title, body);
}
