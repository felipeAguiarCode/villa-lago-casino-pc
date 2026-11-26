import gsap from 'gsap';
import { money } from '../core/wallet';
import { t } from '../core/i18n';
import type { Sfx } from '../audio/sfx';
import type { ChipSet } from '../table/chips';
import { ICONS, type IconName } from './icons';

export type BtnColor = 'red' | 'blue' | 'green' | 'gold' | 'purple' | 'dark';

export interface BtnSpec {
  id: string;
  label?: string;
  color: BtnColor;
  icon?: IconName;
  text?: string;
  enabled?: boolean;
  onClick: () => void;
}

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

/** A HUD element pinned to a projected 3D point. */
export class Pin {
  readonly el: HTMLElement;
  private shown = false;
  constructor(parent: HTMLElement, cls: string) {
    this.el = h('div', cls);
    this.el.style.opacity = '0';
    parent.appendChild(this.el);
  }
  set(text: string, cls?: string) {
    if (this.el.textContent !== text) this.el.textContent = text;
    if (cls !== undefined) this.el.className = cls;
  }
  pop() {
    this.el.classList.remove('pop');
    void this.el.offsetWidth;
    this.el.classList.add('pop');
  }
  place(x: number, y: number) {
    this.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
  }
  show(v: boolean) {
    if (v === this.shown) return;
    this.shown = v;
    this.el.style.opacity = v ? '1' : '0';
  }
  remove() {
    this.el.remove();
  }
}

export function makeButton(b: BtnSpec): HTMLButtonElement {
  const btn = h('button', `vbtn ${b.color} live`);
  btn.dataset.id = b.id;
  const face = h('span', 'face');
  if (b.icon) face.innerHTML = ICONS[b.icon];
  if (b.text) face.appendChild(h('span', 'txt', b.text));
  btn.appendChild(face);
  if (b.label) btn.appendChild(h('span', 'lbl', b.label));
  btn.disabled = b.enabled === false;
  btn.addEventListener('click', () => {
    if (!btn.disabled) b.onClick();
  });
  return btn;
}

export interface BetBarSpec {
  chips: number[];
  onChip: (v: number, el: HTMLElement) => void;
  buttons: BtnSpec[];
  /** Optional LED readouts shown above the chips. */
  leds?: { id: string; label: string; value: string; cls?: string }[];
}

export class Hud {
  readonly root: HTMLElement;
  private bankEl: HTMLElement;
  private bankVal: HTMLElement;
  private xpFill: HTMLElement;
  private lvA: HTMLElement;
  private lvB: HTMLElement;
  readonly bubbles: HTMLElement;
  readonly labels: HTMLElement;
  private bannerEl: HTMLElement;
  private toastEl: HTMLElement;
  private actionsEl: HTMLElement;
  private betbarEl: HTMLElement;
  readonly hintBtn: HTMLButtonElement;
  private drawer: HTMLElement;
  private scrim: HTMLElement;
  private shownBalance = 0;
  private balTween: gsap.core.Tween | null = null;
  private toastT = 0;
  private bannerQ: Promise<void> = Promise.resolve();

  onPlus = () => {};
  onGear = () => {};
  onHint = () => {};
  onMenu: (k: 'lobby' | 'rules' | 'settings' | 'credits') => void = () => {};

  constructor(
    frame: HTMLElement,
    private chips: ChipSet,
    private sfx: Sfx,
  ) {
    const root = h('div');
    root.id = 'hud';
    frame.appendChild(root);
    this.root = root;

    // top bar
    const top = h('div', 'topbar');
    this.bankEl = h('div', 'bank live');
    this.bankVal = h('span');
    const plus = h('button', 'bank-plus live', ICONS.plus);
    plus.setAttribute('aria-label', t('aria.free'));
    plus.onclick = () => {
      this.sfx.click();
      this.onPlus();
    };
    this.bankEl.append(this.bankVal, plus);
    const xp = h('div', 'xp');
    this.lvA = h('span', 'lv');
    this.lvB = h('span', 'lv next');
    const bar = h('div', 'bar');
    this.xpFill = h('i');
    bar.appendChild(this.xpFill);
    xp.append(this.lvA, bar, this.lvB);
    const gear = h('button', 'round-btn live', ICONS.gear);
    gear.setAttribute('aria-label', t('aria.settings'));
    gear.onclick = () => {
      this.sfx.click();
      this.onGear();
    };
    // PC: full-screen toggle next to the settings gear
    const full = h('button', 'round-btn fullbtn live', ICONS.expand);
    full.setAttribute('aria-label', t('aria.fullscreen'));
    full.onclick = () => {
      this.sfx.click();
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      else void document.documentElement.requestFullscreen?.().catch(() => {});
    };
    document.addEventListener('fullscreenchange', () => {
      full.innerHTML = document.fullscreenElement ? ICONS.shrink : ICONS.expand;
    });
    // PC: the menu opens from a button in the top-left corner
    const menu = h('button', 'round-btn menubtn live', ICONS.menu);
    menu.setAttribute('aria-label', t('aria.menu'));
    menu.onclick = () => {
      this.sfx.click();
      this.openDrawer();
    };
    top.append(menu, this.bankEl, xp, full, gear);

    this.bubbles = h('div');
    this.bubbles.id = 'bubbles';
    this.labels = h('div');
    this.labels.id = 'labels';

    this.bannerEl = h('div');
    this.bannerEl.id = 'banner';
    this.toastEl = h('div');
    this.toastEl.id = 'toast';

    this.actionsEl = h('div', 'actions hidden');
    this.betbarEl = h('div', 'betbar hidden');

    this.hintBtn = h('button', 'round-btn hintbtn hidden live', ICONS.bulb);
    this.hintBtn.setAttribute('aria-label', t('aria.hint'));
    this.hintBtn.onclick = () => {
      this.sfx.click();
      this.onHint();
    };

    const tab = h('button', 'sidetab live', ICONS.chevron);
    tab.setAttribute('aria-label', t('aria.menu'));
    this.scrim = h('div', 'scrim');
    this.drawer = h('nav', 'drawer live');
    this.drawer.appendChild(h('h3', 'gold-text', 'VILLA LAGO'));
    const items: [IconName, string, 'lobby' | 'rules' | 'settings' | 'credits'][] = [
      ['home', t('menu.lobby'), 'lobby'],
      ['info', t('menu.rules'), 'rules'],
      ['gear', t('menu.settings'), 'settings'],
      ['shield', t('menu.credits'), 'credits'],
    ];
    for (const [icon, label, key] of items) {
      const b = h('button', '', `${ICONS[icon]}<span>${label}</span>`);
      b.onclick = () => {
        this.sfx.click();
        this.closeDrawer();
        this.onMenu(key);
      };
      this.drawer.appendChild(b);
    }
    tab.onclick = () => {
      this.sfx.click();
      this.openDrawer();
    };
    this.scrim.onclick = () => this.closeDrawer();

    root.append(this.labels, this.bubbles, top, this.bannerEl, this.toastEl, this.actionsEl, this.betbarEl, this.hintBtn, tab, this.scrim, this.drawer);

    // PC: Esc closes the open panel, then the menu
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const close = [...this.root.querySelectorAll<HTMLButtonElement>('.modal .panel > .close')].pop();
      if (close) close.click();
      else if (this.drawer.classList.contains('open')) this.closeDrawer();
    });
  }

  openDrawer() {
    this.drawer.classList.add('open');
    this.scrim.classList.add('show');
  }

  closeDrawer() {
    this.drawer.classList.remove('open');
    this.scrim.classList.remove('show');
  }

  /** Animated bankroll counter. */
  setBalance(n: number, animate = true) {
    this.balTween?.kill();
    if (!animate) {
      this.shownBalance = n;
      this.bankVal.textContent = money(n);
      return;
    }
    const up = n > this.shownBalance;
    const o = { v: this.shownBalance };
    this.balTween = gsap.to(o, {
      v: n,
      duration: up ? 0.9 : 0.35,
      ease: 'power2.out',
      onUpdate: () => {
        this.shownBalance = o.v;
        this.bankVal.textContent = money(Math.abs(o.v - n) < 0.01 ? n : Math.round(o.v));
      },
    });
    if (up) {
      this.bankEl.classList.remove('flash');
      void this.bankEl.offsetWidth;
      this.bankEl.classList.add('flash');
    }
  }

  setXP(level: number, frac: number) {
    this.lvA.textContent = String(level);
    this.lvB.textContent = String(level + 1);
    this.xpFill.style.width = `${Math.round(Math.min(1, frac) * 100)}%`;
  }

  pin(cls: string): Pin {
    return new Pin(cls === 'bubble' ? this.bubbles : this.labels, cls);
  }

  /** Shows the action buttons (null hides them). */
  setActions(specs: BtnSpec[] | null) {
    if (!specs) {
      this.actionsEl.classList.add('hidden');
      return;
    }
    this.actionsEl.replaceChildren(...specs.map(makeButton));
    this.actionsEl.classList.toggle('n4', specs.length >= 4);
    this.actionsEl.classList.remove('hidden');
  }

  /** Enables/disables every action button (while animations play). */
  lockActions(lock: boolean) {
    this.actionsEl.querySelectorAll<HTMLButtonElement>('.vbtn').forEach((b) => {
      if (lock) {
        b.dataset.was = b.disabled ? '1' : '';
        b.disabled = true;
      } else if (b.dataset.was !== undefined) b.disabled = b.dataset.was === '1';
    });
  }

  highlight(id: string | null) {
    this.root.querySelectorAll('.vbtn.hinted').forEach((b) => b.classList.remove('hinted'));
    if (id) this.root.querySelector(`.vbtn[data-id="${id}"]`)?.classList.add('hinted');
  }

  setBetBar(spec: BetBarSpec | null) {
    if (!spec) {
      this.betbarEl.classList.add('hidden');
      return;
    }
    const parts: HTMLElement[] = [];
    if (spec.leds?.length) {
      const m = h('div', 'betmeter');
      for (const l of spec.leds) {
        const d = h('div', `led ${l.cls ?? ''}`, `<small>${l.label}</small><b data-led="${l.id}">${l.value}</b>`);
        m.appendChild(d);
      }
      parts.push(m);
    }
    const row = h('div', 'chiprow');
    if (!spec.chips.length) row.style.display = 'none';
    for (const v of spec.chips) {
      const b = h('button', 'chipbtn live');
      b.dataset.v = String(v);
      b.style.backgroundImage = `url(${this.chips.url(v)})`;
      b.setAttribute('aria-label', t('aria.chip', { v }));
      b.onclick = () => spec.onChip(v, b);
      row.appendChild(b);
    }
    parts.push(row);
    const btns = h('div', 'btnrow');
    btns.append(...spec.buttons.map(makeButton));
    parts.push(btns);
    this.betbarEl.replaceChildren(...parts);
    this.betbarEl.classList.remove('hidden');
  }

  setLed(id: string, value: string) {
    const el = this.betbarEl.querySelector<HTMLElement>(`[data-led="${id}"]`);
    if (el) el.textContent = value;
  }

  /** Greys out chips the player can't afford. */
  setChipLimit(max: number) {
    this.betbarEl.querySelectorAll<HTMLButtonElement>('.chipbtn').forEach((b) => (b.disabled = Number(b.dataset.v) > max));
  }

  setBetButton(id: string, enabled: boolean) {
    const b = this.betbarEl.querySelector<HTMLButtonElement>(`.vbtn[data-id="${id}"]`);
    if (b) b.disabled = !enabled;
  }

  showHint(v: boolean) {
    this.hintBtn.classList.toggle('hidden', !v);
  }

  /** Big cinematic banner. Resolves when it has faded out. */
  banner(main: string, sub = '', cls = '', ms = 1500): Promise<void> {
    const run = async () => {
      const el = this.bannerEl;
      el.className = '';
      el.innerHTML = `<div class="b-main gold-text">${main}</div>${sub ? `<div class="b-sub">${sub}</div>` : ''}`;
      // shrink long titles so they always fit the frame
      const m = el.querySelector<HTMLElement>('.b-main')!;
      const max = this.root.clientWidth * 0.9;
      if (m.scrollWidth > max) m.style.fontSize = `${(parseFloat(getComputedStyle(m).fontSize) * max) / m.scrollWidth}px`;
      void el.offsetWidth;
      el.className = `show ${cls}`;
      await new Promise((r) => setTimeout(r, ms));
      el.className = `hide ${cls}`;
      await new Promise((r) => setTimeout(r, 360));
      el.className = '';
    };
    this.bannerQ = this.bannerQ.then(run);
    return this.bannerQ;
  }

  toast(text: string, ms = 1700) {
    const el = this.toastEl;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this.toastT);
    this.toastT = window.setTimeout(() => el.classList.remove('show'), ms);
  }

  /** Inline question with big buttons (insurance, confirmations). */
  prompt(title: string, text: string, buttons: { id: string; label: string; color: BtnColor; icon?: IconName; text?: string }[]): Promise<string> {
    return new Promise((res) => {
      const box = h('div', 'prompt live', `<h3 class="gold-text">${title}</h3><p>${text}</p>`);
      const row = h('div', 'btnrow');
      for (const b of buttons)
        row.appendChild(
          makeButton({
            ...b,
            onClick: () => {
              this.sfx.click();
              box.remove();
              res(b.id);
            },
          }),
        );
      box.appendChild(row);
      this.root.appendChild(box);
    });
  }

  /** Full-screen modal panel. Returns a close function. */
  modal(title: string, body: string | HTMLElement, onClose?: () => void): () => void {
    const m = h('div', 'modal live');
    const p = h('div', 'panel');
    const close = h('button', 'close', ICONS.close);
    close.setAttribute('aria-label', t('aria.close'));
    p.appendChild(close);
    p.appendChild(h('h2', 'gold-text', title));
    if (typeof body === 'string') p.insertAdjacentHTML('beforeend', body);
    else p.appendChild(body);
    m.appendChild(p);
    const done = () => {
      m.remove();
      onClose?.();
    };
    close.onclick = () => {
      this.sfx.click();
      done();
    };
    m.addEventListener('click', (e) => {
      if (e.target === m) done();
    });
    this.root.appendChild(m);
    return done;
  }
}
