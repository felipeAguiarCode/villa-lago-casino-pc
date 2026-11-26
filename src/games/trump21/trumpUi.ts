import gsap from 'gsap';
import { addStrings, t } from '../../core/i18n';
import type { GameCtx } from '../types';
import type { Rarity } from './rules';

/**
 * Trump cards in the hand, shared by Trump 21 and Party Trump 21:
 * - a tap plays a trump; pressing and holding it shows what it does instead (an enlarged card
 *   with its name, rarity and effect), and letting go puts it back without playing it;
 * - a bonus trump that turns up with a hit flies out of the shoe, turns over above the table with
 *   its own sound, and drops into the hand (the dealer's and the regulars' stay face down).
 */

addStrings(
  {
    'tu.bonus': 'BONUS TRUMP!',
    'tu.bonusSub': 'Hit again: your card is still yours',
    'tu.canPlay': 'Let go, then tap to play it',
    'tu.notNow': "Can't be played right now",
    'tu.hold': 'Hold a trump card to see what it does',
  },
  {
    'tu.bonus': 'TRUNFO BÔNUS!',
    'tu.bonusSub': 'Peça de novo: sua carta continua garantida',
    'tu.canPlay': 'Solte e toque para usar',
    'tu.notNow': 'Não pode ser usado agora',
    'tu.hold': 'Segure um trunfo para ver o que ele faz',
  },
);

export interface TrumpCardInfo {
  /** The card's art (an icon, a number or its own SVG). */
  face: string;
  name: string;
  desc: string;
  rarity: Rarity;
  /** A line under the rarity (e.g. "the dealer can use it too"). */
  tag?: string;
}

/** The inside of a trump card, as in the hand. */
export const trumpInner = (i: Pick<TrumpCardInfo, 'face' | 'name'>) => `<span class="tr-ic">${i.face}</span><span class="tr-name">${i.name}</span>`;

/** How long a press must last to read the card instead of playing it. */
const HOLD_MS = 360;

let peek: HTMLElement | null = null;

/** Hides the enlarged card (if one is shown). */
export function hideTrumpPeek() {
  if (!peek) return;
  const el = peek;
  peek = null;
  gsap.to(el, { opacity: 0, y: 8, duration: 0.12, ease: 'power1.in', onComplete: () => el.remove() });
}

/** Shows the enlarged card and what it does, above `anchor` (inside `host`). */
export function showTrumpPeek(host: HTMLElement, anchor: HTMLElement, info: TrumpCardInfo, note = '') {
  peek?.remove();
  const el = document.createElement('div');
  el.className = 'trump-peek';
  el.dataset.rarity = info.rarity;
  el.innerHTML =
    `<div class="trump big" data-rarity="${info.rarity}">${trumpInner(info)}</div>` +
    `<div class="tp-text"><b>${info.name}</b><i>${t(`rar.${info.rarity}`)}${info.tag ? ` · ${info.tag}` : ''}</i><p>${info.desc}</p>${note ? `<small>${note}</small>` : ''}</div>`;
  host.appendChild(el);
  const hr = host.getBoundingClientRect();
  const ar = anchor.getBoundingClientRect();
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const x = Math.max(8, Math.min(hr.width - w - 8, ar.left + ar.width / 2 - hr.left - w / 2));
  let y = ar.top - hr.top - h - 12;
  if (y < 8) y = Math.min(hr.height - h - 8, ar.bottom - hr.top + 12);
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  gsap.from(el, { opacity: 0, y: 14, scale: 0.94, duration: 0.18, ease: 'power2.out' });
  peek = el;
  // a release anywhere (the card may have been re-rendered under the finger) closes it
  const close = () => {
    window.removeEventListener('pointerup', close);
    window.removeEventListener('pointercancel', close);
    window.removeEventListener('blur', close);
    if (peek === el) hideTrumpPeek();
  };
  window.addEventListener('pointerup', close);
  window.addEventListener('pointercancel', close);
  window.addEventListener('blur', close);
}

export interface TrumpBinding {
  host: HTMLElement;
  info: () => TrumpCardInfo;
  /** Can it be played now? (a held card says so in its note) */
  canPlay: () => boolean;
  play: () => void;
  /** A sound as the card lifts to be read. */
  onPeek?: () => void;
}

/**
 * A trump card in the player's hand: a tap plays it (when it can be played), a press held for a
 * moment shows what it does instead. The button stays focusable and a key press plays it too.
 */
export function bindTrump(btn: HTMLElement, o: TrumpBinding) {
  let timer = 0;
  let held = false;
  btn.setAttribute('aria-disabled', String(!o.canPlay()));
  btn.classList.toggle('off', !o.canPlay());
  const i = o.info();
  btn.setAttribute('aria-label', `${i.name}: ${i.desc}`);
  const stop = () => {
    if (timer) window.clearTimeout(timer);
    timer = 0;
    btn.classList.remove('peeking');
  };
  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    held = false;
    stop();
    timer = window.setTimeout(() => {
      timer = 0;
      held = true;
      btn.classList.add('peeking');
      o.onPeek?.();
      showTrumpPeek(o.host, btn, o.info(), t(o.canPlay() ? 'tu.canPlay' : 'tu.notNow'));
    }, HOLD_MS);
  });
  btn.addEventListener('pointerup', stop);
  btn.addEventListener('pointercancel', stop);
  btn.addEventListener('pointerleave', stop);
  // a long press must not open the browser's menu or select text
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  btn.addEventListener('click', (e) => {
    if (held) {
      // the press was a read, not a play
      held = false;
      e.preventDefault();
      return;
    }
    if (o.canPlay()) o.play();
  });
}

const css = (el: HTMLElement, s: Partial<CSSStyleDeclaration>) => Object.assign(el.style, s);

/** Centre of an element, relative to the HUD (the layer the flying cards use). */
export function centreIn(g: GameCtx, el: Element | null | undefined): { x: number; y: number } | null {
  if (!el) return null;
  const base = g.hud.root.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  return { x: r.left + r.width / 2 - base.left, y: r.top + r.height / 2 - base.top };
}

export interface BonusFly {
  /** The card's face (the player's bonus turns over; null: it stays face down). */
  info: TrumpCardInfo | null;
  /** Where it lands (its slot in the hand, the dealer's trumps, a regular's fan). */
  to: HTMLElement | null;
  /** Size at landing, relative to a hand card (the face-down piles are smaller). */
  endScale?: number;
}

/**
 * A trump card coming out of the shoe. The player's turns over in the middle of the table with a
 * glow and the "bonus" call, then drops into its slot; a face-down one goes straight to its owner.
 * The sound is the caller's (sfx.trumpDraw), so it can follow the card's rarity.
 */
export async function flyBonusTrump(g: GameCtx, o: BonusFly) {
  const { stage, table, hud } = g;
  const from = stage.toScreen(table.shoeMouth());
  const box = document.createElement('div');
  box.className = 'trump-fly';
  const back = document.createElement('div');
  back.className = 'trump-back';
  box.appendChild(back);
  let face: HTMLElement | null = null;
  if (o.info) {
    face = document.createElement('div');
    face.className = 'trump';
    face.dataset.rarity = o.info.rarity;
    face.innerHTML = trumpInner(o.info);
    css(face, { position: 'absolute', inset: '0', width: '100%', height: '100%', boxSizing: 'border-box', visibility: 'hidden' });
    box.appendChild(face);
  }
  hud.labels.appendChild(box);
  const end = centreIn(g, o.to);
  const W = hud.root.clientWidth;
  const H = hud.root.clientHeight;
  gsap.set(box, { x: from.x, y: from.y, xPercent: -50, yPercent: -50, scale: 0.3, rotation: -24, opacity: 0 });
  const tween = (v: gsap.TweenVars) => new Promise<void>((res) => gsap.to(box, { ...v, onComplete: res }));
  try {
    if (face && o.info) {
      // out of the shoe to the middle of the table, turned over, a moment in the light, then home
      const mid = { x: W * 0.5, y: H * 0.46 };
      await tween({ x: mid.x, y: mid.y, scale: 1.7, rotation: 0, opacity: 1, duration: 0.42, ease: 'power3.out' });
      await tween({ scaleX: 0, duration: 0.1, ease: 'power2.in' });
      face.style.visibility = 'visible';
      back.style.visibility = 'hidden';
      box.classList.add('shine');
      const call = document.createElement('div');
      call.className = 'trump-call';
      call.innerHTML = `<b>${t('tu.bonus')}</b><small>${t('tu.bonusSub')}</small>`;
      box.appendChild(call);
      await tween({ scaleX: 1.7, duration: 0.14, ease: 'back.out(2.4)' });
      await new Promise<void>((res) => gsap.delayedCall(0.75, res));
      gsap.to(call, { opacity: 0, duration: 0.15 });
      const to = end ?? { x: W * 0.8, y: H * 0.8 };
      await tween({ x: to.x, y: to.y, scale: o.endScale ?? 1, rotation: 4, duration: 0.34, ease: 'power2.in' });
    } else {
      const to = end ?? { x: W * 0.5, y: H * 0.15 };
      await tween({ opacity: 1, duration: 0.08 });
      await tween({ x: to.x, y: to.y, scale: o.endScale ?? 0.35, rotation: 8, duration: 0.5, ease: 'power2.inOut' });
    }
  } finally {
    box.remove();
  }
}
