/**
 * What the Party tables share (Party Blackjack, Party Ultimate Texas Hold'em, Party Three Card):
 * the seat colours, the curved felt print, the neon seat boxes and the name plates of the regulars.
 * Each table keeps its own rules and seat geometry; this keeps them looking like one family.
 */
import { addStrings, t } from '../../core/i18n';
import { FONT, GOLD, INK, makeCanvas, smileArc, smileText } from '../../table/prints';
import type { Hud, Pin } from '../../ui/hud';
import type { AiProfile } from './rules';

addStrings(
  {
    'pb.you': 'You',
    'pb.betOf': 'Bet {n}',
    'pb.style.bookish': 'Bookish',
    'pb.style.cautious': 'Cautious',
    'pb.style.daring': 'Daring',
    'pb.style.wildcard': 'Wildcard',
    'pb.think': '…',
    'pb.rebuy': 'Rebuy',
  },
  {
    'pb.you': 'Você',
    'pb.betOf': 'Aposta {n}',
    'pb.style.bookish': 'Estudiosa',
    'pb.style.cautious': 'Cauteloso',
    'pb.style.daring': 'Ousada',
    'pb.style.wildcard': 'Imprevisível',
    'pb.rebuy': 'Recompra',
  },
);

/** Seat colours from the player's left to right: green, red, blue (the player's, in the middle), gold, purple. */
export const PARTY_COLORS = ['#5fd08a', '#ff6b5e', '#7cc4ff', '#f2cb62', '#c08bff'];

/** Felt print: title, payout and a rule between two gold arcs, curved like the seats. */
export function partyPrint(title: string, pays: string, rule: string): HTMLCanvasElement {
  const { cv, g } = makeCanvas(1024, 360);
  smileText(g, title, 512, 100, 900, FONT.title(54), GOLD, 6);
  smileText(g, pays, 512, 166, 900, FONT.title(36), INK, 3);
  smileArc(g, 512, 226, 900, 0.5, GOLD, 4);
  smileArc(g, 512, 300, 900, 0.5, GOLD, 4);
  smileText(g, rule, 512, 275, 900, FONT.title(28), GOLD, 4);
  return cv;
}

/** Canvas pixels per table unit of a seat box, and the margin around the box (table units). */
export const BOX_PPU = 220;
export const BOX_PAD = 0.07;

/** The box of a seat in its own frame: `lx` to the seat's right, `ly` toward the dealer. */
export interface BoxGeo {
  halfW: number;
  /** ly of the box's near (rail) edge and far (dealer) edge. */
  bottom: number;
  top: number;
  /** The player's own seat: thicker lines. */
  big: boolean;
}

/** A chip circle printed in a seat box, at (lx, ly) of the seat's frame. */
export interface BoxRing {
  lx: number;
  ly: number;
  /** Radius in table units (0.3 by default). */
  r?: number;
  /** Small label printed inside the ring, e.g. "ANTE". */
  label?: string;
}

/**
 * A seat's neon betting box with its chip circles, drawn in the seat's frame.
 * Place it with `table.addDecalAt(cv, mid.x, mid.z, boxWidth(geo))` where `mid` is the seat point
 * (0, (top + bottom) / 2), and turn it with `.rotation.y = yaw`.
 */
export function seatBox(geo: BoxGeo, color: string, rings: BoxRing[] = [{ lx: 0, ly: 0 }]): HTMLCanvasElement {
  const w = (geo.halfW + BOX_PAD) * 2 * BOX_PPU;
  const h = (geo.top - geo.bottom + BOX_PAD * 2) * BOX_PPU;
  const { cv, g } = makeCanvas(Math.round(w), Math.round(h));
  const p = BOX_PAD * BOX_PPU;
  const r = 0.16 * BOX_PPU;
  const box = (inset: number) => {
    g.beginPath();
    g.roundRect(p + inset, p + inset, w - 2 * (p + inset), h - 2 * (p + inset), Math.max(4, r - inset));
  };
  g.fillStyle = color;
  g.globalAlpha = 0.07;
  box(0);
  g.fill();
  g.globalAlpha = 1;
  g.strokeStyle = color;
  g.shadowColor = color;
  g.shadowBlur = 16;
  g.lineWidth = geo.big ? 9 : 7;
  box(0);
  g.stroke();
  g.shadowBlur = 0;
  g.globalAlpha = 0.55;
  g.lineWidth = 2.5;
  box(geo.big ? 14 : 11);
  g.stroke();
  for (const ring of rings) {
    const cx = w / 2 + ring.lx * BOX_PPU;
    const cy = (geo.top + BOX_PAD - ring.ly) * BOX_PPU;
    const rr = (ring.r ?? 0.3) * BOX_PPU;
    g.globalAlpha = 0.9;
    g.lineWidth = 6;
    g.beginPath();
    g.arc(cx, cy, rr, 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 0.45;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(cx, cy, rr - 0.05 * BOX_PPU, 0, Math.PI * 2);
    g.stroke();
    if (ring.label) {
      g.globalAlpha = 0.85;
      g.fillStyle = color;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      let size = Math.round(rr * 0.42);
      g.font = FONT.title(size);
      while (size > 10 && g.measureText(ring.label).width > rr * 1.6) g.font = FONT.title(--size);
      g.fillText(ring.label, cx, cy);
    }
  }
  g.globalAlpha = 1;
  return cv;
}

/** Width of a seat box decal in table units. */
export const boxWidth = (geo: BoxGeo) => (geo.halfW + BOX_PAD) * 2;

const css = (el: HTMLElement, s: Partial<CSSStyleDeclaration>) => Object.assign(el.style, s);

export interface Plate {
  plate: Pin;
  plateText: { name: HTMLElement; chips: HTMLElement; bet: HTMLElement; avatar: HTMLElement };
}

/** Name plate under a seat: avatar, name, chips and bet. `ai` null is the player's own seat. */
export function partyPlate(hud: Hud, color: string, ai: AiProfile | null): Plate {
  const plate = hud.pin('pb-plate');
  const el = plate.el;
  css(el, {
    position: 'absolute',
    left: '0',
    top: '0',
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(1.6 * var(--u))',
    padding: 'calc(0.9 * var(--u)) calc(2.6 * var(--u)) calc(0.9 * var(--u)) calc(0.9 * var(--u))',
    borderRadius: 'calc(6 * var(--u))',
    background: 'linear-gradient(rgba(20, 28, 46, 0.92), rgba(7, 11, 20, 0.92))',
    border: 'calc(0.45 * var(--u)) solid rgba(216, 182, 96, 0.75)',
    boxShadow: '0 calc(0.6 * var(--u)) calc(1.4 * var(--u)) rgba(0, 0, 0, 0.6)',
    color: '#f3ead2',
    whiteSpace: 'nowrap',
    transition: 'opacity 0.25s, box-shadow 0.25s, border-color 0.25s',
    willChange: 'transform',
  });
  const avatar = document.createElement('div');
  css(avatar, {
    width: 'calc(7.4 * var(--u))',
    height: 'calc(7.4 * var(--u))',
    borderRadius: '50%',
    display: 'grid',
    placeItems: 'center',
    font: `700 calc(4.2 * var(--u))/1 "Cinzel", serif`,
    color: '#fff',
    textShadow: '0 calc(0.3 * var(--u)) 0 rgba(0, 0, 0, 0.55)',
    background: `radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.55), ${color} 45%, rgba(0, 0, 0, 0.55) 120%)`,
    border: 'calc(0.4 * var(--u)) solid rgba(255, 255, 255, 0.8)',
    flex: '0 0 auto',
  });
  const text = document.createElement('div');
  css(text, { display: 'flex', flexDirection: 'column', gap: 'calc(0.5 * var(--u))' });
  const top = document.createElement('div');
  css(top, { font: `700 calc(4 * var(--u))/1 "Barlow Condensed", sans-serif`, letterSpacing: '0.06em', textTransform: 'uppercase' });
  const name = document.createElement('span');
  // the regulars' mindset changes every hand and stays hidden: the plate shows only the name
  top.appendChild(name);
  const bottom = document.createElement('div');
  css(bottom, { display: 'flex', gap: 'calc(1.8 * var(--u))', font: `600 calc(3.6 * var(--u))/1 "Barlow Condensed", sans-serif`, fontVariantNumeric: 'tabular-nums' });
  const chips = document.createElement('span');
  css(chips, { color: '#ffe9a6' });
  const bet = document.createElement('span');
  css(bet, { color: '#cfe3ff' });
  bottom.append(chips, bet);
  text.append(top, bottom);
  el.append(avatar, text);
  const out: Plate = { plate, plateText: { name, chips, bet, avatar } };
  setPlateName(out, ai);
  return out;
}

/**
 * Shows who sits at a plate (a new regular takes a broke one's seat): avatar initial and name,
 * set smaller when the name is long so neighbouring plates never touch.
 */
export function setPlateName(p: Plate, ai: AiProfile | null) {
  const label = ai ? ai.name : t('pb.you');
  p.plateText.avatar.textContent = ai ? ai.name[0] : '★';
  p.plateText.name.textContent = label;
  const size = label.length > 15 ? 3.1 : label.length > 12 ? 3.5 : 4;
  p.plateText.name.style.fontSize = `calc(${size} * var(--u))`;
}

/** Lights a plate in its seat colour while that seat is acting. */
export function glowPlate(plate: Pin, color: string, on: boolean) {
  const glow = on
    ? `0 0 calc(3 * var(--u)) ${color}, 0 calc(0.6 * var(--u)) calc(1.4 * var(--u)) rgba(0, 0, 0, 0.6)`
    : '0 calc(0.6 * var(--u)) calc(1.4 * var(--u)) rgba(0, 0, 0, 0.6)';
  if (plate.el.style.boxShadow !== glow) {
    plate.el.style.boxShadow = glow;
    plate.el.style.borderColor = on ? color : 'rgba(216, 182, 96, 0.75)';
  }
}
