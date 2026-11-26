import { locale, t } from '../core/i18n';
import type { Trophies } from '../core/trophies';
import { money } from '../core/wallet';
import type { GameInfo } from '../games/types';
import { gameIcon } from './gameIcons';
import { ICONS } from './icons';
import { trophyBadge } from './trophies';

export interface GameSelectDeps {
  games: GameInfo[];
  /** Preview picture of a table (a screenshot captured from the game). */
  previewUrl: (id: string) => string;
  trophies: Trophies;
  balance: () => number;
  level: () => number;
  xpFrac: () => number;
  onPlay: (id: string) => void;
  onTrophies: (game?: string) => void;
  /** The Deck screen (card back pattern and colour). */
  onDeck: () => void;
  /** Start over with the starting bankroll (asks first). */
  onReset: () => void;
  onSettings: () => void;
  onRefill: () => void;
  onFullscreen: () => void;
  click: () => void;
  tick: () => void;
}

const COLS = 8;
const RANDOM = 'random';

/**
 * Game Select (PC edition, replaces the phone lobby list): a preview of the highlighted table on
 * the left (picture, name, description, trophies) and a grid of table tiles on the right, with the
 * shared bankroll shown large. Mouse or keyboard (arrows + Enter).
 */
export class GameSelect {
  readonly el: HTMLElement;
  private sel: string;
  private tiles = new Map<string, HTMLButtonElement>();
  private order: string[];
  private visible = false;
  private refs: Record<string, HTMLElement> = {};

  constructor(
    frame: HTMLElement,
    private d: GameSelectDeps,
  ) {
    this.order = [...d.games.map((g) => g.id), RANDOM];
    this.sel = d.games[0].id;
    const el = document.createElement('section');
    el.id = 'gamesel';
    el.className = 'hidden';
    el.innerHTML = `
      <header class="gs-head">
        <div class="gs-ribbon"><span class="gold-text">${t('gs.title')}</span></div>
        <div class="gs-pill">${t('gs.choose')}</div>
        <div class="gs-tools">
          <button class="gs-tool trophies live">${ICONS.trophy}<span>${t('gs.trophies')}</span><b data-r="tcount"></b></button>
          <button class="gs-tool deck live">${ICONS.deal}<span>${t('gs.deck')}</span></button>
          <button class="gs-tool reset live">${ICONS.redo}<span>${t('gs.reset')}</span></button>
          <button class="gs-tool round full live" aria-label="${t('aria.fullscreen')}">${ICONS.expand}</button>
          <button class="gs-tool round gear live" aria-label="${t('aria.settings')}">${ICONS.gear}</button>
        </div>
      </header>
      <div class="gs-main">
        <div class="gs-preview">
          <div class="gs-shot"><img data-r="img" alt=""><div class="gs-noshot" data-r="noshot"></div><div class="gs-name" data-r="name"></div></div>
          <div class="gs-info">
            <p data-r="desc"></p>
            <div class="gs-stats"><span data-r="hands"></span><span class="gs-tb" data-r="tb"></span></div>
          </div>
          <button class="vbtn green gs-play live" data-id="play"><span class="face">${ICONS.play}</span><span class="lbl">${t('gs.play')}</span></button>
        </div>
        <div class="gs-side">
          <div class="gs-grid" data-r="grid"></div>
          <div class="gs-bank">
            <div class="gs-bank-l"><small>${t('gs.bankroll')}</small><b data-r="bal"></b><em>${t('gs.shared')}</em></div>
            <button class="gs-plus live" aria-label="${t('aria.free')}">${ICONS.plus}</button>
            <div class="gs-lv"><span data-r="lv"></span><span class="gs-xp"><i data-r="xp"></i></span></div>
          </div>
        </div>
      </div>
      <footer class="gs-foot"><span>♠</span>${t('gs.banner')}<span>♠</span><small>${t('gs.keys')}</small></footer>`;
    el.querySelectorAll<HTMLElement>('[data-r]').forEach((n) => (this.refs[n.dataset.r!] = n));
    const grid = this.refs.grid;
    for (const id of this.order) {
      const g = d.games.find((x) => x.id === id);
      const b = document.createElement('button');
      b.className = 'gs-tile live';
      b.dataset.game = id;
      if (g) b.style.setProperty('--f1', g.felt[0]), b.style.setProperty('--f2', g.felt[1]);
      b.innerHTML = `<span class="gs-ic">${gameIcon(id)}</span><small>${g ? g.title : t('gs.random')}</small>`;
      b.onmouseenter = () => this.select(id, true);
      b.onclick = () => {
        if (this.sel === id) this.play();
        else {
          this.select(id, false);
          d.click();
        }
      };
      b.ondblclick = () => this.play();
      grid.appendChild(b);
      this.tiles.set(id, b);
    }
    el.querySelector<HTMLButtonElement>('.gs-play')!.onclick = () => this.play();
    el.querySelector<HTMLButtonElement>('.trophies')!.onclick = () => {
      d.click();
      d.onTrophies();
    };
    el.querySelector<HTMLButtonElement>('.deck')!.onclick = () => d.onDeck();
    el.querySelector<HTMLButtonElement>('.reset')!.onclick = () => {
      d.click();
      d.onReset();
    };
    el.querySelector<HTMLButtonElement>('.gear')!.onclick = () => {
      d.click();
      d.onSettings();
    };
    el.querySelector<HTMLButtonElement>('.full')!.onclick = () => {
      d.click();
      d.onFullscreen();
    };
    el.querySelector<HTMLButtonElement>('.gs-plus')!.onclick = () => {
      d.click();
      d.onRefill();
    };
    this.refs.tb.onclick = () => {
      if (this.sel !== RANDOM) {
        d.click();
        d.onTrophies(this.sel);
      }
    };
    const img = this.refs.img as HTMLImageElement;
    img.onerror = () => this.el.classList.add('noshot');
    img.onload = () => this.el.classList.remove('noshot');
    window.addEventListener('keydown', (e) => this.key(e));
    frame.appendChild(el);
    this.el = el;
    this.select(this.sel, false);
  }

  show(v: boolean) {
    this.visible = v;
    this.el.classList.toggle('hidden', !v);
    if (v) this.refresh();
  }

  /** Updates the bankroll, level, trophy counts and the preview. */
  refresh() {
    const d = this.d;
    this.refs.bal.textContent = money(d.balance());
    this.refs.lv.textContent = t('gs.level', { n: d.level() });
    this.refs.xp.style.width = `${Math.round(Math.min(1, d.xpFrac()) * 100)}%`;
    const c = d.trophies.counts();
    this.refs.tcount.textContent = `${c.earned}/${c.total}`;
    this.select(this.sel, false);
  }

  private select(id: string, hover: boolean) {
    if (hover && id === this.sel) return;
    if (hover) this.d.tick();
    this.tiles.get(this.sel)?.classList.remove('on');
    this.sel = id;
    this.tiles.get(id)?.classList.add('on');
    const g = this.d.games.find((x) => x.id === id);
    const img = this.refs.img as HTMLImageElement;
    if (g) {
      this.el.classList.remove('noshot');
      img.src = this.d.previewUrl(id);
      this.refs.name.textContent = g.title.toUpperCase();
      this.refs.desc.textContent = t(`gd.${id}`);
      const n = this.d.trophies.s.hands[id] ?? 0;
      this.refs.hands.textContent = n ? t('gs.played', { n: n.toLocaleString(locale()) }) : t('gs.new');
      const tr = this.d.trophies;
      this.refs.tb.innerHTML = tr.list
        .filter((x) => x.game === id)
        .map((x) => trophyBadge(x, tr.has(x.id)))
        .join('');
    } else {
      this.el.classList.add('noshot');
      img.removeAttribute('src');
      this.refs.name.textContent = t('gs.random').toUpperCase();
      this.refs.desc.textContent = t('gs.randomDesc');
      this.refs.hands.textContent = '';
      this.refs.tb.innerHTML = '';
    }
    this.refs.noshot.innerHTML = gameIcon(id);
    this.refs.noshot.style.setProperty('--f1', g?.felt[0] ?? '#1d3b2c');
    this.refs.noshot.style.setProperty('--f2', g?.felt[1] ?? '#08140e');
  }

  private play() {
    let id = this.sel;
    if (id === RANDOM) {
      const ready = this.d.games.filter((g) => g.ready);
      id = ready[Math.floor(Math.random() * ready.length)].id;
    }
    this.d.onPlay(id);
  }

  private key(e: KeyboardEvent) {
    if (!this.visible || document.querySelector('.modal, .tscreen')) return;
    const i = this.order.indexOf(this.sel);
    const n = this.order.length;
    const move = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLS, ArrowDown: COLS }[e.key];
    if (move !== undefined) {
      e.preventDefault();
      const j = i + move;
      if (j >= 0 && j < n) this.select(this.order[j], true);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.play();
    }
  }
}
