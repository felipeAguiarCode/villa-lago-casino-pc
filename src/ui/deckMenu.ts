/**
 * PC: the Deck screen. Pick the card backs' pattern (classic playing-card designs, pattern only)
 * and their colour, or keep each table's own deck colour. Changes apply at once and are saved.
 */
import { getLang, t } from '../core/i18n';
import type { Settings } from '../core/settings';
import { BACK_PATTERNS, BACK_TINTS, renderPatternBack, type BackTint } from '../table/backPatterns';
import { cardDataURL } from '../table/cardFaces';
import { ICONS } from './icons';

const h = (tag: string, cls = '', html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

const label = (x: { en: string; pt: string }) => (getLang() === 'pt' ? x.pt : x.en);

export class DeckScreen {
  private el: HTMLElement;
  private keyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopImmediatePropagation();
      this.close();
    }
  };

  /**
   * `tableTint` is the colour of the current table's own deck (what "Table colours" shows here);
   * `apply` saves the settings and re-dresses the cards on the table.
   */
  constructor(
    private root: HTMLElement,
    private s: Settings,
    private tableTint: string,
    private apply: (s: Settings) => void,
    private click: () => void,
  ) {
    this.el = h('section', 'tscreen dkscreen live');
    this.el.addEventListener('click', (e) => e.stopPropagation());
  }

  open() {
    this.render();
    this.root.appendChild(this.el);
    requestAnimationFrame(() => this.el.classList.add('show'));
    window.addEventListener('keydown', this.keyHandler, true);
  }

  close() {
    window.removeEventListener('keydown', this.keyHandler, true);
    this.el.classList.remove('show');
    setTimeout(() => this.el.remove(), 260);
  }

  private tint() {
    return this.s.backTint === 'table' ? this.tableTint : this.s.backTint;
  }

  private choose(patch: Partial<Pick<Settings, 'backPattern' | 'backTint'>>) {
    this.click();
    Object.assign(this.s, patch);
    this.apply(this.s);
    this.render();
  }

  private render() {
    const tint = this.tint();
    const pattern = BACK_PATTERNS.find((p) => p.id === this.s.backPattern) ?? BACK_PATTERNS[0];
    const tintInfo = BACK_TINTS.find((x) => x.id === tint) ?? BACK_TINTS[0];
    this.el.innerHTML = '';

    const head = h(
      'header',
      'ts-head',
      `<button class="ts-back live" aria-label="Back">${ICONS.chevron}</button>
       <div class="ts-title"><span class="ts-cup">${ICONS.deal}</span><h2 class="gold-text">${t('dk.title')}</h2></div>
       <p class="dk-sub">${t('dk.sub')}</p>`,
    );
    head.querySelector<HTMLButtonElement>('.ts-back')!.onclick = () => {
      this.click();
      this.close();
    };

    // the preview: the back large, with a face card tucked behind it
    const preview = h('div', 'dk-preview');
    const stack = h('div', 'dk-stack');
    const face = h('img', 'dk-face') as HTMLImageElement;
    face.src = cardDataURL(12, 260); // the Ace of spades
    face.alt = '';
    const big = renderPatternBack(pattern.id, tint);
    big.className = 'dk-big';
    stack.append(face, big);
    const names = h(
      'div',
      'dk-names',
      `<b>${label(pattern)}</b><span>${this.s.backTint === 'table' ? `${t('dk.table')} · ${label(tintInfo)}` : label(tintInfo)}</span>`,
    );
    preview.append(stack, names);

    // patterns
    const side = h('div', 'dk-side');
    side.appendChild(h('h3', 'dk-h', t('dk.pattern')));
    const grid = h('div', 'dk-grid');
    for (const p of BACK_PATTERNS) {
      const b = h('button', `dk-tile live${p.id === pattern.id ? ' on' : ''}`);
      b.title = label(p);
      const cv = renderPatternBack(p.id, tint, 108, 151);
      b.append(cv, h('small', '', label(p)));
      b.onclick = () => this.choose({ backPattern: p.id });
      grid.appendChild(b);
    }
    side.appendChild(grid);

    // colours: the tables' own colours, then every colourway
    side.appendChild(h('h3', 'dk-h', t('dk.color')));
    const sw = h('div', 'dk-swatches');
    const tableBtn = h('button', `dk-sw dk-sw-table live${this.s.backTint === 'table' ? ' on' : ''}`, `<i></i><small>${t('dk.table')}</small>`);
    tableBtn.title = t('dk.tableHint');
    tableBtn.onclick = () => this.choose({ backTint: 'table' });
    sw.appendChild(tableBtn);
    for (const x of BACK_TINTS) {
      const b = h('button', `dk-sw live${this.s.backTint === x.id ? ' on' : ''}`, `<i style="${swatch(x)}"></i><small>${label(x)}</small>`);
      b.title = label(x);
      b.onclick = () => this.choose({ backTint: x.id });
      sw.appendChild(b);
    }
    side.appendChild(sw);

    const main = h('div', 'dk-main');
    main.append(preview, side);
    this.el.append(head, main);
  }
}

const swatch = (x: BackTint) => `background: radial-gradient(circle at 50% 50%, ${x.ink} 0 22%, transparent 23%), linear-gradient(135deg, ${x.base}, ${x.dark})`;
