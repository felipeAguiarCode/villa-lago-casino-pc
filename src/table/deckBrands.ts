import { drawEmblem } from '../ui/emblem';
import { FACE_H, FACE_W } from './cardFaces';

/**
 * Playing-card brands of the PC edition. Every table deals from its own deck: the box on the felt,
 * the cards spilling out of it and the backs of the cards in play share one design.
 *
 * The brands are original: they echo the classic styles of famous decks (a red club back with a
 * winged emblem, a black-and-gold tournament deck, a western deck, a Victorian salon deck and a
 * Brazilian professional deck) without using any real brand's name, logo or artwork.
 */
export type Brand = 'house' | 'veloce' | 'series' | 'stallion' | 'salon' | 'canarinho';

export interface BrandDef {
  title: string;
  sub: string;
  small: string;
  /** Colour of the title bands on the box. */
  band: string;
  /** Colour of the box's sides and ends. */
  side: string;
}

export const BRANDS: Record<Brand, BrandDef> = {
  house: { title: 'VILLA LAGO', sub: 'PLAYING CARDS', small: 'FINE QUALITY · 52 CARDS', band: 'rgba(10,6,4,.78)', side: '#140d0a' },
  veloce: { title: 'VELOCE', sub: 'No. 21 · CLUB BACK', small: 'STANDARD INDEX · 52 CARDS', band: 'rgba(118,8,16,.92)', side: '#5e070d' },
  series: { title: 'VL POKER SERIES', sub: 'TOURNAMENT DECK', small: 'JUMBO INDEX · 100% PLASTIC', band: 'rgba(4,4,6,.92)', side: '#0b0b0e' },
  stallion: { title: 'STALLION', sub: 'PLAYING CARDS', small: 'WESTERN EDITION · 52 CARDS', band: 'rgba(14,30,82,.92)', side: '#0f1f52' },
  salon: { title: 'ROYAL SALON', sub: 'BACCARAT EDITION', small: 'FINE LINEN · 52 CARDS', band: 'rgba(6,46,30,.92)', side: '#06301f' },
  canarinho: { title: 'CANARINHO', sub: 'BARALHO PROFISSIONAL', small: 'TRUCO · PIFE · CANASTRA', band: 'rgba(8,92,46,.94)', side: '#0b5a30' },
};

/** Which deck each table plays with (tables not listed use the house deck). */
export const TABLE_DECK: Record<string, { brand: Brand; open?: boolean }> = {
  blackjack: { brand: 'veloce', open: true },
  partybj: { brand: 'veloce', open: true },
  war: { brand: 'stallion' },
  reddog: { brand: 'stallion', open: true },
  letitride: { brand: 'stallion' },
  highlow: { brand: 'veloce' },
  redblack: { brand: 'veloce' },
  picknum: { brand: 'stallion' },
  abyss: { brand: 'series', open: true },
  showdown: { brand: 'series' },
  thb: { brand: 'series', open: true },
  uth: { brand: 'series' },
  holdem3: { brand: 'series' },
  threecard: { brand: 'series', open: true },
  tcpfaceup: { brand: 'series' },
  fourcard: { brand: 'series' },
  crazy4: { brand: 'series', open: true },
  caribbean: { brand: 'series' },
  russian: { brand: 'series', open: true },
  doubledraw: { brand: 'series' },
  hcf: { brand: 'series' },
  baccarat: { brand: 'salon', open: true },
  dragontiger: { brand: 'salon' },
  paigow: { brand: 'salon', open: true },
  manilhadraw: { brand: 'canarinho', open: true },
  manilhaholdem: { brand: 'canarinho' },
  pifeexpress: { brand: 'canarinho', open: true },
  videopife: { brand: 'canarinho' },
  canastradraw: { brand: 'canarinho', open: true },
  lobby: { brand: 'house', open: true },
};

const W = FACE_W;
const H = FACE_H;
const M = 22;

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function paper(g: CanvasRenderingContext2D) {
  rr(g, 2, 2, W - 4, H - 4, 34);
  g.fillStyle = '#fbf8ef';
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(60,50,30,.28)';
  g.stroke();
}

/** A winged wheel (Veloce's medallion). */
function wingedWheel(g: CanvasRenderingContext2D, x: number, y: number, r: number, ink: string) {
  g.save();
  g.translate(x, y);
  g.strokeStyle = ink;
  g.fillStyle = ink;
  g.lineWidth = r * 0.09;
  g.beginPath();
  g.arc(0, 0, r * 0.42, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.beginPath();
    g.moveTo(Math.cos(a) * r * 0.08, Math.sin(a) * r * 0.08);
    g.lineTo(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42);
    g.lineWidth = r * 0.035;
    g.stroke();
  }
  g.beginPath();
  g.arc(0, 0, r * 0.09, 0, Math.PI * 2);
  g.fill();
  for (const d of [-1, 1]) {
    for (let k = 0; k < 5; k++) {
      g.beginPath();
      const y0 = -r * 0.18 + k * r * 0.11;
      g.moveTo(d * r * 0.46, y0);
      g.quadraticCurveTo(d * r * (0.8 + k * 0.05), y0 - r * 0.32 + k * 0.05 * r, d * r * (1.02 - k * 0.07), y0 - r * 0.12);
      g.quadraticCurveTo(d * r * (0.72 - k * 0.03), y0 - r * 0.02, d * r * 0.46, y0 + r * 0.07);
      g.fill();
    }
  }
  g.restore();
}

/** A shield with a star and laurels (the tournament crest). */
function crest(g: CanvasRenderingContext2D, x: number, y: number, r: number, gold: string, dark: string) {
  g.save();
  g.translate(x, y);
  g.fillStyle = gold;
  g.beginPath();
  g.moveTo(0, -r);
  g.lineTo(r * 0.78, -r * 0.7);
  g.quadraticCurveTo(r * 0.8, r * 0.45, 0, r);
  g.quadraticCurveTo(-r * 0.8, r * 0.45, -r * 0.78, -r * 0.7);
  g.closePath();
  g.fill();
  g.fillStyle = dark;
  g.beginPath();
  g.moveTo(0, -r * 0.84);
  g.lineTo(r * 0.64, -r * 0.58);
  g.quadraticCurveTo(r * 0.64, r * 0.36, 0, r * 0.84);
  g.quadraticCurveTo(-r * 0.64, r * 0.36, -r * 0.64, -r * 0.58);
  g.closePath();
  g.fill();
  g.fillStyle = gold;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr2 = i % 2 ? r * 0.16 : r * 0.38;
    g.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2 - r * 0.1);
  }
  g.closePath();
  g.fill();
  g.font = `700 ${Math.round(r * 0.3)}px Cinzel, serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('VLPS', 0, r * 0.5);
  for (const d of [-1, 1])
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 2 + d * (0.35 + k * 0.22);
      g.beginPath();
      g.ellipse(Math.cos(a) * r * 1.12, Math.sin(a) * r * 1.0, r * 0.13, r * 0.06, a + d * 0.9, 0, Math.PI * 2);
      g.fill();
    }
  g.restore();
}

/** A rearing horse (Stallion). */
function horse(g: CanvasRenderingContext2D, x: number, y: number, s: number, ink: string) {
  g.save();
  g.translate(x, y);
  g.scale(s / 100, s / 100);
  g.fillStyle = ink;
  g.beginPath();
  g.moveTo(-30, 60);
  g.lineTo(-22, 20);
  g.quadraticCurveTo(-40, 6, -38, -14);
  g.quadraticCurveTo(-30, -40, -6, -44);
  g.lineTo(4, -70);
  g.quadraticCurveTo(22, -86, 36, -74);
  g.lineTo(44, -58);
  g.lineTo(32, -54);
  g.quadraticCurveTo(24, -40, 30, -22);
  g.lineTo(48, -30);
  g.lineTo(56, -16);
  g.lineTo(34, -4);
  g.quadraticCurveTo(36, 18, 24, 26);
  g.lineTo(30, 62);
  g.lineTo(20, 62);
  g.lineTo(12, 30);
  g.lineTo(-10, 30);
  g.lineTo(-18, 62);
  g.closePath();
  g.fill();
  // mane and tail
  g.beginPath();
  g.moveTo(-36, -6);
  g.quadraticCurveTo(-64, 4, -60, 40);
  g.quadraticCurveTo(-52, 16, -34, 10);
  g.fill();
  g.restore();
}

function crown(g: CanvasRenderingContext2D, x: number, y: number, w: number, fill: string) {
  const h = w * 0.62;
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(x - w / 2, y + h / 2);
  g.lineTo(x - w / 2, y - h * 0.15);
  g.lineTo(x - w * 0.24, y + h * 0.1);
  g.lineTo(x, y - h / 2);
  g.lineTo(x + w * 0.24, y + h * 0.1);
  g.lineTo(x + w / 2, y - h * 0.15);
  g.lineTo(x + w / 2, y + h / 2);
  g.closePath();
  g.fill();
  for (const dx of [-0.5, 0, 0.5]) {
    g.beginPath();
    g.arc(x + dx * w, y - (dx === 0 ? h / 2 : h * 0.15) - w * 0.04, w * 0.06, 0, Math.PI * 2);
    g.fill();
  }
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  g.fillStyle = fill;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr2 = i % 2 ? r * 0.42 : r;
    g.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2);
  }
  g.closePath();
  g.fill();
}

/** Paints the brand's back on a card-sized canvas (house backs come from renderBack). */
export function renderBrandBack(brand: Exclude<Brand, 'house'>): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  paper(g);
  const inner = () => rr(g, M, M, W - 2 * M, H - 2 * M, 20);
  if (brand === 'veloce') {
    inner();
    g.fillStyle = '#b5121c';
    g.fill();
    g.save();
    g.clip();
    // fine two-way scrollwork
    g.strokeStyle = 'rgba(255,240,232,.55)';
    g.lineWidth = 1.6;
    for (let y = 0; y < H; y += 26)
      for (let x = 0; x < W; x += 26) {
        g.beginPath();
        g.arc(x, y, 9, 0, Math.PI);
        g.stroke();
        g.beginPath();
        g.arc(x + 13, y + 13, 9, Math.PI, Math.PI * 2);
        g.stroke();
      }
    g.restore();
    g.strokeStyle = '#fff4ec';
    g.lineWidth = 6;
    rr(g, M + 16, M + 16, W - 2 * M - 32, H - 2 * M - 32, 14);
    g.stroke();
    g.fillStyle = '#fff4ec';
    g.beginPath();
    g.ellipse(W / 2, H / 2, 128, 150, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#b5121c';
    g.lineWidth = 5;
    g.beginPath();
    g.ellipse(W / 2, H / 2, 114, 136, 0, 0, Math.PI * 2);
    g.stroke();
    wingedWheel(g, W / 2, H / 2, 112, '#b5121c');
  } else if (brand === 'series') {
    inner();
    g.fillStyle = '#0c0c0f';
    g.fill();
    g.save();
    g.clip();
    g.strokeStyle = 'rgba(214,180,106,.35)';
    g.lineWidth = 1.4;
    for (let i = -H; i < W + H; i += 34) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + H, H);
      g.moveTo(i, H);
      g.lineTo(i + H, 0);
      g.stroke();
    }
    g.restore();
    g.strokeStyle = '#d6b46a';
    g.lineWidth = 5;
    rr(g, M + 14, M + 14, W - 2 * M - 28, H - 2 * M - 28, 14);
    g.stroke();
    g.lineWidth = 1.5;
    rr(g, M + 24, M + 24, W - 2 * M - 48, H - 2 * M - 48, 10);
    g.stroke();
    crest(g, W / 2, H / 2, 112, '#e6c27a', '#0c0c0f');
  } else if (brand === 'stallion') {
    inner();
    g.fillStyle = '#172c6e';
    g.fill();
    g.save();
    g.clip();
    g.fillStyle = 'rgba(255,255,255,.12)';
    for (let y = 18; y < H; y += 36) for (let x = (y / 36) % 2 ? 18 : 0; x < W; x += 36) star(g, x, y, 6, 'rgba(255,255,255,.16)');
    g.restore();
    // rope border
    g.strokeStyle = '#f4efe1';
    g.lineWidth = 4;
    g.setLineDash([10, 6]);
    rr(g, M + 18, M + 18, W - 2 * M - 36, H - 2 * M - 36, 14);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#f4efe1';
    g.beginPath();
    g.arc(W / 2, H / 2, 128, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#172c6e';
    g.beginPath();
    g.arc(W / 2, H / 2, 116, 0, Math.PI * 2);
    g.fill();
    horse(g, W / 2 + 4, H / 2 + 6, 150, '#f4efe1');
    for (const [x, y] of [
      [M + 44, M + 44],
      [W - M - 44, M + 44],
      [M + 44, H - M - 44],
      [W - M - 44, H - M - 44],
    ])
      star(g, x, y, 14, '#d7383c');
  } else if (brand === 'salon') {
    inner();
    g.fillStyle = '#0d4a30';
    g.fill();
    g.save();
    g.clip();
    // damask quatrefoils
    g.fillStyle = 'rgba(226,196,122,.28)';
    for (let y = 0; y < H + 40; y += 56)
      for (let x = (y / 56) % 2 ? 28 : 0; x < W + 40; x += 56)
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2;
          g.beginPath();
          g.ellipse(x + Math.cos(a) * 9, y + Math.sin(a) * 9, 9, 5, a, 0, Math.PI * 2);
          g.fill();
        }
    g.restore();
    g.strokeStyle = '#e2c47a';
    g.lineWidth = 6;
    rr(g, M + 16, M + 16, W - 2 * M - 32, H - 2 * M - 32, 16);
    g.stroke();
    g.fillStyle = 'rgba(6,30,20,.85)';
    g.beginPath();
    g.ellipse(W / 2, H / 2, 120, 140, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#e2c47a';
    g.lineWidth = 4;
    g.stroke();
    crown(g, W / 2, H / 2 - 18, 150, '#e6c27a');
    g.fillStyle = '#e6c27a';
    g.font = '700 34px Cinzel, serif';
    g.textAlign = 'center';
    g.fillText('ROYAL SALON', W / 2, H / 2 + 86);
  } else {
    inner();
    g.fillStyle = '#f2c418';
    g.fill();
    g.save();
    g.clip();
    g.strokeStyle = 'rgba(11,90,48,.35)';
    g.lineWidth = 3;
    for (let y = 0; y < H; y += 30) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
    }
    g.restore();
    g.fillStyle = '#0f7a3c';
    g.beginPath();
    g.moveTo(W / 2, M + 60);
    g.lineTo(W - M - 34, H / 2);
    g.lineTo(W / 2, H - M - 60);
    g.lineTo(M + 34, H / 2);
    g.closePath();
    g.fill();
    g.fillStyle = '#16348f';
    g.beginPath();
    g.arc(W / 2, H / 2, 104, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 9; i++) star(g, W / 2 - 60 + (i % 3) * 60 + (i > 5 ? 10 : 0), H / 2 - 40 + Math.floor(i / 3) * 40, 9, '#ffffff');
    g.strokeStyle = '#ffffff';
    g.lineWidth = 10;
    g.beginPath();
    g.arc(W / 2, H / 2 + 150, 190, Math.PI * 1.32, Math.PI * 1.68);
    g.stroke();
  }
  return cv;
}

/** The seal emblem printed over the box flap. */
export function drawBrandSeal(g: CanvasRenderingContext2D, brand: Brand, x: number, y: number, r: number) {
  if (brand === 'house') return drawEmblem(g, x, y, r);
  g.save();
  g.fillStyle = brand === 'series' ? '#0c0c0f' : '#fbf6ea';
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = r * 0.1;
  g.strokeStyle = '#c9a35a';
  g.stroke();
  if (brand === 'veloce') wingedWheel(g, x, y, r * 0.8, '#b5121c');
  else if (brand === 'series') crest(g, x, y, r * 0.62, '#e6c27a', '#0c0c0f');
  else if (brand === 'stallion') horse(g, x, y + 2, r * 1.2, '#172c6e');
  else if (brand === 'salon') crown(g, x, y, r * 1.1, '#0d4a30');
  else star(g, x, y, r * 0.7, '#0f7a3c');
  g.restore();
}
