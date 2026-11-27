import gsap from 'gsap';
import { addStrings, t } from '../../core/i18n';
import type { GameCtx } from '../types';
import type { Rarity } from './rules';

/**
 * Trump cards in the hand, shared by Trump 21 and Party Trump 21:
 * - with a mouse, pointing at a trump shows what it does (an enlarged card with its name, rarity,
 *   effect and whether it can be played now) and a click plays it;
 * - on a touch screen a tap plays it, and pressing and holding shows what it does instead
 *   (letting go puts it back without playing it);
 * - a bonus trump that turns up with a hit flies out of the shoe, turns over above the table with
 *   its own sound, and drops into the hand (the dealer's and the regulars' stay face down).
 */

addStrings(
  {
    'tu.bonus': 'BONUS TRUMP!',
    'tu.bonusSub': 'Hit again: your card is still yours',
    'tu.canPlay': 'Let go, then tap to play it',
    'tu.clickPlay': 'Click to play it',
    'tu.notNow': "Can't be played right now",
    'tu.hold': 'Point at a trump card (or hold it) to see what it does',
    'tu.full': 'HAND FULL',
    'tu.fullSub': 'Seven trumps at most: this one is discarded',
  },
  {
    'tu.bonus': 'TRUNFO BÔNUS!',
    'tu.bonusSub': 'Peça de novo: sua carta continua garantida',
    'tu.canPlay': 'Solte e toque para usar',
    'tu.clickPlay': 'Clique para usar',
    'tu.notNow': 'Não pode ser usado agora',
    'tu.hold': 'Passe o mouse sobre um trunfo (ou segure-o) para ver o que ele faz',
    'tu.full': 'MÃO CHEIA',
    'tu.fullSub': 'No máximo sete trunfos: este é descartado',
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

/** How long a press must last to read the card instead of playing it (touch). */
const HOLD_MS = 360;
/** A short pause before a pointed card opens, so sweeping across the hand doesn't flicker. */
const HOVER_MS = 90;
/** …and a short grace before it closes, so crossing the gap between two cards doesn't either. */
const LEAVE_MS = 140;

let peek: HTMLElement | null = null;
let peekAnchor: HTMLElement | null = null;

/** Hides the enlarged card (if one is shown). */
export function hideTrumpPeek() {
  if (!peek) return;
  const el = peek;
  peek = null;
  peekAnchor?.classList.remove('peeking');
  peekAnchor = null;
  gsap.to(el, { opacity: 0, y: 8, duration: 0.12, ease: 'power1.in', onComplete: () => el.remove() });
}

/**
 * Shows the enlarged card and what it does, above `anchor` (inside `host`). `untilRelease`: a held
 * card, closed by letting go anywhere; a pointed one closes when the mouse leaves it. Either closes
 * when its card leaves the hand (played, or the hand redrawn under it).
 */
export function showTrumpPeek(host: HTMLElement, anchor: HTMLElement, info: TrumpCardInfo, note = '', untilRelease = true) {
  const switching = !!peek;
  peek?.remove();
  peekAnchor?.classList.remove('peeking');
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
  // moving from card to card the panel just changes; a fresh one rises in
  if (switching) gsap.from(el, { opacity: 0.6, duration: 0.1 });
  else gsap.from(el, { opacity: 0, y: 14, scale: 0.94, duration: 0.18, ease: 'power2.out' });
  peek = el;
  peekAnchor = anchor;
  anchor.classList.add('peeking');
  // the card left the hand (played, or the hand redrawn): close
  const watch = () => {
    if (peek !== el) return;
    if (!anchor.isConnected) hideTrumpPeek();
    else requestAnimationFrame(watch);
  };
  requestAnimationFrame(watch);
  const close = () => {
    window.removeEventListener('pointerup', close);
    window.removeEventListener('pointercancel', close);
    window.removeEventListener('blur', close);
    if (peek === el) hideTrumpPeek();
  };
  // a held card: a release anywhere (the card may have been re-rendered under the finger) closes it
  if (untilRelease) {
    window.addEventListener('pointerup', close);
    window.addEventListener('pointercancel', close);
  }
  window.addEventListener('blur', close);
}

export interface TrumpBinding {
  host: HTMLElement;
  info: () => TrumpCardInfo;
  /** Can it be played now? (the open card says so in its note) */
  canPlay: () => boolean;
  play: () => void;
  /** A sound as the card lifts to be read. */
  onPeek?: () => void;
}

/**
 * A trump card in the player's hand. With a mouse, pointing at it shows what it does and a click
 * plays it; on a touch screen a tap plays it and a press held for a moment shows what it does
 * instead. The button stays focusable and a key press plays it too.
 */
export function bindTrump(btn: HTMLElement, o: TrumpBinding) {
  let timer = 0;
  let hoverTimer = 0;
  let held = false;
  let hovering = false;
  btn.setAttribute('aria-disabled', String(!o.canPlay()));
  btn.classList.toggle('off', !o.canPlay());
  const i = o.info();
  btn.setAttribute('aria-label', `${i.name}: ${i.desc}`);
  const stopHold = () => {
    if (timer) window.clearTimeout(timer);
    timer = 0;
  };
  const open = (note: string, untilRelease: boolean) => {
    // the lift sounds when a card opens, not on every card the mouse sweeps across
    if (!peek) o.onPeek?.();
    showTrumpPeek(o.host, btn, o.info(), t(note), untilRelease);
  };
  // the mouse: pointing reads the card
  btn.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    hovering = true;
    window.clearTimeout(hoverTimer);
    hoverTimer = window.setTimeout(
      () => {
        if (hovering && btn.isConnected) open(o.canPlay() ? 'tu.clickPlay' : 'tu.notNow', false);
      },
      peek ? 0 : HOVER_MS,
    );
  });
  btn.addEventListener('pointerleave', (e) => {
    stopHold();
    if (e.pointerType !== 'mouse') return;
    hovering = false;
    window.clearTimeout(hoverTimer);
    // a moment's grace: crossing the gap to the next card switches the panel without a flicker
    window.setTimeout(() => {
      if (peekAnchor === btn && !hovering) hideTrumpPeek();
    }, LEAVE_MS);
  });
  // touch (and pen): a held press reads the card
  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    held = false;
    stopHold();
    if (e.pointerType === 'mouse') return; // already read by pointing at it
    timer = window.setTimeout(() => {
      timer = 0;
      held = true;
      open(o.canPlay() ? 'tu.canPlay' : 'tu.notNow', true);
    }, HOLD_MS);
  });
  btn.addEventListener('pointerup', stopHold);
  btn.addEventListener('pointercancel', stopHold);
  // a long press must not open the browser's menu or select text
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  btn.addEventListener('click', (e) => {
    if (held) {
      // the press was a read, not a play
      held = false;
      e.preventDefault();
      return;
    }
    if (!o.canPlay()) return;
    if (peekAnchor === btn) hideTrumpPeek();
    o.play();
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
  /** The hand is full: the card shows "hand full", then drops away to the discard instead of landing. */
  discard?: boolean;
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
      call.innerHTML = o.discard ? `<b>${t('tu.full')}</b><small>${t('tu.fullSub')}</small>` : `<b>${t('tu.bonus')}</b><small>${t('tu.bonusSub')}</small>`;
      if (o.discard) call.classList.add('full');
      box.appendChild(call);
      await tween({ scaleX: 1.7, duration: 0.14, ease: 'back.out(2.4)' });
      await new Promise<void>((res) => gsap.delayedCall(o.discard ? 0.9 : 0.75, res));
      gsap.to(call, { opacity: 0, duration: 0.15 });
      if (o.discard) {
        // greyed out, it tips over and falls away
        box.classList.remove('shine');
        face.style.filter = 'grayscale(1) brightness(0.55)';
        await tween({ y: mid.y + H * 0.16, rotation: 28, scale: 1.2, opacity: 0, duration: 0.5, ease: 'power2.in' });
        return;
      }
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
