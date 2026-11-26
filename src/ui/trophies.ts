import { locale, t } from '../core/i18n';
import type { Tier, TrophyCategory, TrophyDef, Trophies } from '../core/trophies';
import type { GameInfo } from '../games/types';
import { gameIcon } from './gameIcons';
import { ICONS, type IconName } from './icons';

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

/** A trophy's badge: a tier-coloured medal with the table's pictogram or a career icon. */
export function trophyBadge(d: { tier: Tier; icon: string }, earned: boolean): string {
  const icon = d.icon in ICONS ? ICONS[d.icon as IconName] : gameIcon(d.icon);
  return `<span class="tbadge ${d.tier}${earned ? '' : ' locked'}"><span class="tb-ring"></span><span class="tb-ic">${icon}</span>${earned ? '' : `<span class="tb-lock">${ICONS.lock}</span>`}</span>`;
}

export const trophyName = (d: TrophyDef) => t(d.name, d.vars);
export const trophyDesc = (d: TrophyDef) => t(d.desc, d.vars);

/** "Trophy earned" notice, top-right, one at a time. */
export class TrophyToast {
  private q: Promise<void> = Promise.resolve();
  constructor(
    private root: HTMLElement,
    private sound: (tier: Tier) => void,
  ) {}

  show(list: TrophyDef[]) {
    for (const d of list)
      this.q = this.q.then(async () => {
        const el = h(
          'div',
          `ttoast ${d.tier}`,
          `${trophyBadge(d, true)}<div class="tt-txt"><small>${t('tr.toast')} · ${t(`tr.tier.${d.tier}`)}</small><b>${trophyName(d)}</b></div>`,
        );
        this.root.appendChild(el);
        this.sound(d.tier);
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        el.classList.add('show');
        await new Promise((r) => setTimeout(r, 3200));
        el.classList.remove('show');
        await new Promise((r) => setTimeout(r, 400));
        el.remove();
      });
  }
}

const CATS: ('all' | TrophyCategory)[] = ['all', 'career', 'bankroll', 'explorer', 'games', 'platinum'];

/** The trophy list: progress summary, filters by category and by table, and every trophy. */
export class TrophyScreen {
  private el: HTMLElement;
  private cat: 'all' | TrophyCategory = 'all';
  private game = '';
  private keyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopImmediatePropagation();
      this.close();
    }
  };

  constructor(
    private root: HTMLElement,
    private tr: Trophies,
    private games: GameInfo[],
    private click: () => void,
    private onClose: () => void = () => {},
  ) {
    this.el = h('section', 'tscreen live');
    this.el.addEventListener('click', (e) => e.stopPropagation());
  }

  open(game = '') {
    this.game = game;
    this.cat = game ? 'games' : 'all';
    this.render();
    this.root.appendChild(this.el);
    requestAnimationFrame(() => this.el.classList.add('show'));
    window.addEventListener('keydown', this.keyHandler, true);
  }

  close() {
    window.removeEventListener('keydown', this.keyHandler, true);
    this.el.classList.remove('show');
    setTimeout(() => this.el.remove(), 260);
    this.onClose();
  }

  private render() {
    const tr = this.tr;
    const c = tr.counts();
    const pct = Math.round((c.earned / c.total) * 100);
    const tiers: Tier[] = ['platinum', 'gold', 'silver', 'bronze'];
    const head = h(
      'header',
      'ts-head',
      `<button class="ts-back live" aria-label="Back">${ICONS.chevron}</button>
       <div class="ts-title"><span class="ts-cup">${ICONS.trophy}</span><h2 class="gold-text">${t('tr.title')}</h2></div>
       <div class="ts-sum">
         <div class="ts-prog"><b>${pct}%</b><span class="ts-bar"><i style="width:${pct}%"></i></span><small>${t('tr.earned', { n: c.earned, t: c.total })}</small></div>
         <div class="ts-tiers">${tiers.map((k) => `<span class="ts-tier ${k}">${trophyBadge({ tier: k, icon: 'trophy' }, true)}<b>${c[k]}</b></span>`).join('')}</div>
       </div>`,
    );
    head.querySelector<HTMLButtonElement>('.ts-back')!.onclick = () => {
      this.click();
      this.close();
    };

    const bar = h('div', 'ts-filters');
    for (const k of CATS) {
      const b = h('button', `ts-chip live${this.cat === k ? ' on' : ''}`, k === 'all' ? t('tr.all') : t(`tr.cat.${k}`));
      b.onclick = () => {
        this.click();
        this.cat = k;
        if (k !== 'games' && k !== 'all') this.game = '';
        this.render();
      };
      bar.appendChild(b);
    }
    const sel = h('select', 'ts-game live');
    sel.innerHTML = `<option value="">${t('tr.allGames')}</option>${this.games.map((g) => `<option value="${g.id}"${g.id === this.game ? ' selected' : ''}>${g.title}</option>`).join('')}`;
    sel.onchange = () => {
      this.game = sel.value;
      if (this.game) this.cat = 'games';
      this.render();
    };
    bar.appendChild(sel);

    const list = h('div', 'ts-list');
    const items = tr.list.filter((d) => (this.cat === 'all' || d.category === this.cat) && (!this.game || d.game === this.game));
    if (!items.length) list.appendChild(h('p', 'ts-none', t('tr.none')));
    for (const d of items) {
      const got = tr.s.unlocked[d.id];
      const p = tr.progress(d);
      const foot = got
        ? `<small class="ts-on">${t('tr.on', { d: new Date(got).toLocaleDateString(locale()) })}</small>`
        : p !== null && d.goal
          ? `<span class="ts-pbar"><i style="width:${Math.round((p / d.goal) * 100)}%"></i></span><small>${p.toLocaleString(locale())} / ${d.goal.toLocaleString(locale())}</small>`
          : `<small class="ts-lockd">${t('tr.locked')}</small>`;
      const game = d.game ? this.games.find((g) => g.id === d.game) : undefined;
      list.appendChild(
        h(
          'div',
          `ts-item ${d.tier}${got ? ' got' : ''}`,
          `${trophyBadge(d, !!got)}
           <div class="ts-txt"><b>${trophyName(d)}</b><p>${trophyDesc(d)}</p><div class="ts-foot">${foot}</div></div>
           <div class="ts-meta"><span class="ts-tiername ${d.tier}">${t(`tr.tier.${d.tier}`)}</span>${game ? `<small>${game.title}</small>` : `<small>${t(`tr.cat.${d.category}`)}</small>`}</div>`,
        ),
      );
    }
    this.el.replaceChildren(head, bar, list);
  }
}
