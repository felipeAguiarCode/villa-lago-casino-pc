/**
 * Pictograms of the tables (PC edition): drawn for the Game Select tiles and the trophy badges.
 * 64×64 SVG. The main shapes use currentColor, accents use var(--acc) and marks inside cards
 * use var(--ink), so one icon works on any tile.
 */

const SUITS = {
  s: 'M50 0C62 20 100 38 100 62C100 78 88 88 74 88C64 88 57 83 53 76C54 87 58 95 67 100L33 100C42 95 46 87 47 76C43 83 36 88 26 88C12 88 0 78 0 62C0 38 38 20 50 0Z',
  h: 'M50 96C30 78 0 58 0 32C0 14 13 2 28 2C39 2 47 9 50 18C53 9 61 2 72 2C87 2 100 14 100 32C100 58 70 78 50 96Z',
  d: 'M50 0C58 16 72 34 86 50C72 66 58 84 50 100C42 84 28 66 14 50C28 34 42 16 50 0Z',
  c: 'M50 2a23 23 0 1 0 .01 0ZM25 37a23 23 0 1 0 .01 0ZM75 37a23 23 0 1 0 .01 0ZM38 36h24v30H38ZM47 62C46 80 42 92 32 100H68C58 92 54 80 53 62Z',
};
type SuitKey = keyof typeof SUITS;

const INK = 'fill="var(--ink, #10141c)"';
const ACC = 'fill="var(--acc, #e6c27a)"';
const ME = 'fill="currentColor"';

const suit = (k: SuitKey, cx: number, cy: number, size: number, fill = INK) =>
  `<path ${fill} transform="translate(${cx - size / 2} ${cy - size / 2}) scale(${size / 100})" d="${SUITS[k]}"/>`;

const text = (x: number, y: number, s: string, size: number, fill = INK, font = 'Cinzel, serif') =>
  `<text x="${x}" y="${y}" text-anchor="middle" font-family="${font}" font-weight="700" font-size="${size}" ${fill}>${s}</text>`;

/** A card w×h centred at (cx, cy), turned by `rot` degrees, with optional content (in card space). */
function card(cx: number, cy: number, w: number, h: number, rot = 0, inner = '', fill = ME) {
  return `<g transform="rotate(${rot} ${cx} ${cy})"><rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${w * 0.14}" ${fill} stroke="var(--ink, #10141c)" stroke-width="1.4"/>${inner}</g>`;
}

/** A fan of n cards. */
function fan(n: number, cx: number, cy: number, w: number, h: number, spread: number) {
  let out = '';
  for (let i = 0; i < n; i++) {
    const k = i - (n - 1) / 2;
    out += card(cx + k * w * 0.42, cy + Math.abs(k) * 1.2, w, h, k * spread);
  }
  return out;
}

const monitor = (inner: string) =>
  `<rect x="6" y="9" width="52" height="38" rx="5" ${ME}/><rect x="10" y="13" width="44" height="30" rx="2.5" ${INK}/>${inner}<rect x="27" y="47" width="10" height="5" ${ME}/><rect x="18" y="52" width="28" height="4" rx="2" ${ME}/>`;

const crown = (cx: number, cy: number, w: number) => {
  const h = w * 0.6;
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  return `<path ${ACC} d="M${x0} ${y0 + h}L${x0} ${y0 + h * 0.25}L${x0 + w * 0.27} ${y0 + h * 0.6}L${cx} ${y0}L${x0 + w * 0.73} ${y0 + h * 0.6}L${x0 + w} ${y0 + h * 0.25}L${x0 + w} ${y0 + h}Z"/>`;
};

const star = (cx: number, cy: number, r: number, fill = ACC) => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return `<path ${fill} d="M${pts.join('L')}Z"/>`;
};

const bolt = (x: number, y: number, s: number) =>
  `<path ${ACC} transform="translate(${x} ${y}) scale(${s})" d="M7 0L0 13h6l-3 11L13 9H7l3-9Z"/>`;

const chip = (cx: number, cy: number, r: number, fill = ME) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" ${fill}/><circle cx="${cx}" cy="${cy}" r="${r * 0.62}" fill="none" stroke="var(--ink, #10141c)" stroke-width="${r * 0.16}" stroke-dasharray="${r * 0.5} ${r * 0.36}"/>`;

const svg = (body: string) => `<svg viewBox="0 0 64 64" aria-hidden="true">${body}</svg>`;

export const GAME_ICONS: Record<string, string> = {
  blackjack: svg(card(32, 32, 30, 42, 0, text(32, 33, '21', 15) + suit('s', 32, 45, 9))),
  videobj: svg(monitor(text(32, 35, '21', 15, ACC))),
  trump21: svg(card(32, 37, 28, 36, 0, text(32, 41, '21', 13)) + crown(32, 12, 22)),
  threecard: svg(fan(3, 32, 34, 22, 32, 16) + suit('s', 32, 34, 12) + suit('h', 18, 37, 8) + suit('d', 46, 37, 8)),
  tcpfaceup: svg(
    fan(3, 32, 36, 22, 32, 16) +
      `<path ${ACC} d="M14 14Q32 0 50 14Q32 28 14 14Z"/><circle cx="32" cy="14" r="5" ${INK}/>`,
  ),
  slot3: svg(
    `<rect x="7" y="10" width="44" height="46" rx="6" ${ME}/><rect x="11" y="20" width="36" height="20" rx="2" ${INK}/>` +
      text(17, 36, '7', 14, ACC) +
      text(29, 36, '7', 14, ACC) +
      text(41, 36, '7', 14, ACC) +
      `<rect x="14" y="45" width="30" height="5" rx="2.5" ${INK}/><rect x="53" y="18" width="4" height="22" rx="2" ${ME}/><circle cx="55" cy="15" r="5" ${ACC}/>`,
  ),
  manilhadraw: svg(suit('c', 32, 38, 40, ME) + crown(32, 11, 20)),
  manilhaholdem: svg(card(18, 40, 20, 28, -10) + card(46, 40, 20, 28, 10) + suit('c', 32, 22, 22, ACC)),
  pifeexpress: svg(card(15, 36, 18, 26, -6) + card(32, 34, 18, 26, 0) + card(49, 36, 18, 26, 6) + bolt(26, 4, 1.05)),
  videopife: svg(
    monitor(
      [16, 25, 36, 45].map((x) => `<rect x="${x - 3}" y="21" width="7" height="10" rx="1" ${ACC}/>`).join('') +
        [20, 29, 38].map((x) => `<rect x="${x - 3}" y="32" width="7" height="8" rx="1" fill="var(--acc, #e6c27a)" opacity=".55"/>`).join(''),
    ),
  ),
  canastradraw: svg(
    card(14, 44, 16, 24, 0) + card(26, 38, 16, 24, 0) + card(38, 32, 16, 24, 0) + card(50, 26, 16, 24, 0, text(50, 31, '2', 12)) + star(52, 9, 7),
  ),
  dragontiger: svg(card(19, 34, 22, 32, -10, text(19, 40, 'D', 16)) + card(45, 34, 22, 32, 10, text(45, 40, 'T', 16)) + text(32, 60, 'VS', 11, ACC, 'Barlow Condensed, sans-serif')),
  abyss: svg(`<path ${ME} d="M4 32Q32 6 60 32Q32 58 4 32Z"/><circle cx="32" cy="32" r="12" ${INK}/><circle cx="32" cy="32" r="6" ${ACC}/><circle cx="29" cy="29" r="2" ${ME}/>`),
  showdown: svg(fan(5, 32, 38, 16, 24, 9) + `<circle cx="32" cy="14" r="9" fill="none" stroke="var(--acc, #e6c27a)" stroke-width="3"/><circle cx="32" cy="14" r="3" ${ACC}/>`),
  fourcard: svg(fan(4, 32, 34, 19, 30, 12)),
  crazy4: svg(fan(4, 32, 38, 18, 26, 12) + star(32, 12, 10)),
  holdem3: svg(card(22, 44, 18, 26, -8) + card(40, 44, 18, 26, 8) + [18, 32, 46].map((x) => `<rect x="${x - 6}" y="6" width="12" height="17" rx="2" ${ACC}/>`).join('')),
  videopoker: svg(monitor([15, 23.5, 32, 40.5, 49].map((x) => `<rect x="${x - 3.5}" y="22" width="7" height="12" rx="1" ${ACC}/>`).join(''))),
  doubledraw: svg(
    `<path ${ME} d="M10 46Q14 24 4 12Q20 18 26 30Q30 12 32 6Q34 12 38 30Q44 18 60 12Q50 24 54 46Z"/><rect x="10" y="46" width="44" height="8" rx="3" ${ACC}/>` +
      `<circle cx="4" cy="12" r="4" ${ACC}/><circle cx="32" cy="6" r="4" ${ACC}/><circle cx="60" cy="12" r="4" ${ACC}/>`,
  ),
  hcf: svg(suit('h', 16, 40, 16, ME) + suit('h', 32, 34, 22, ME) + suit('h', 49, 26, 28, ACC)),
  baccarat: svg(text(32, 54, '9', 46, ME) + crown(32, 9, 22)),
  caribbean: svg(
    `<path ${ME} d="M30 58L33 30L36 30L36 58Z"/><path ${ME} d="M34 30Q20 16 6 22Q20 20 34 30Q24 8 10 6Q26 8 34 30Q38 8 54 6Q42 12 34 30Q48 18 60 24Q46 20 34 30Z"/>` +
      chip(48, 48, 9, ACC),
  ),
  russian: svg(`<path ${ME} d="M32 8Q40 18 46 26Q52 34 46 42H18Q12 34 18 26Q24 18 32 8Z"/><rect x="16" y="42" width="32" height="16" rx="1" ${ME}/><rect x="28" y="47" width="8" height="11" rx="4" ${INK}/><path ${ACC} d="M31 0h2v9h-2zM28 3h8v2h-8z"/>`),
  thb: svg(card(22, 40, 20, 28, -12) + card(42, 40, 20, 28, 12) + star(32, 16, 14)),
  uth: svg(card(22, 32, 22, 32, -10, text(22, 38, 'A', 16)) + card(42, 32, 22, 32, 10, text(42, 38, 'A', 16)) + text(32, 62, '4×', 14, ACC, 'Barlow Condensed, sans-serif')),
  letitride: svg(chip(16, 42, 9) + chip(32, 42, 9) + chip(48, 42, 9) + `<path fill="none" stroke="var(--acc, #e6c27a)" stroke-width="4" stroke-linecap="round" d="M48 22Q32 6 16 20"/><path ${ACC} d="M10 14L20 26L22 14Z"/>`),
  paigow: svg(
    [10, 17, 24, 31, 38].map((x) => `<rect x="${x - 4}" y="22" width="9" height="14" rx="1.5" ${ME} stroke="var(--ink, #10141c)" stroke-width="1"/>`).join('') +
      `<rect x="45" y="20" width="2.5" height="26" ${ACC}/>` +
      [53, 59].map((x) => `<rect x="${x - 4}" y="22" width="9" height="14" rx="1.5" ${ACC} stroke="var(--ink, #10141c)" stroke-width="1"/>`).join('') +
      text(22, 54, '5', 12, ME, 'Barlow Condensed, sans-serif') +
      text(56, 54, '2', 12, ACC, 'Barlow Condensed, sans-serif'),
  ),
  war: svg(
    `<g transform="rotate(45 32 32)"><rect x="29.5" y="4" width="5" height="40" rx="2" ${ME}/><rect x="22" y="42" width="20" height="4" rx="2" ${ACC}/><rect x="30" y="46" width="4" height="10" ${ACC}/></g>` +
      `<g transform="rotate(-45 32 32)"><rect x="29.5" y="4" width="5" height="40" rx="2" ${ME}/><rect x="22" y="42" width="20" height="4" rx="2" ${ACC}/><rect x="30" y="46" width="4" height="10" ${ACC}/></g>`,
  ),
  reddog: svg(card(12, 38, 18, 26, -8) + card(52, 38, 18, 26, 8) + card(32, 30, 18, 26, 0, '', ACC) + `<path ${ME} d="M28 58h8l-4 5z"/>`),
  coinflip: svg(
    `<ellipse cx="32" cy="36" rx="24" ry="24" ${ACC}/><ellipse cx="32" cy="36" rx="19" ry="19" fill="none" stroke="var(--ink, #10141c)" stroke-width="1.6" stroke-dasharray="2 2.4"/>` +
      crown(32, 30, 18) +
      text(32, 48, 'VL', 9, INK) +
      `<path fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" d="M8 14q6-8 14-6M56 14q-6-8-14-6"/>`,
  ),
  horses: svg(
    `<path ${ME} d="M14 56h36l-4-8H18zM20 48l2-14q-6-6-2-14l8-10 4 4 10 2q6 4 4 10l-6-2-2 4q8 6 6 20z"/><circle cx="35" cy="17" r="1.8" ${INK}/>` +
      `<path ${ACC} d="M22 8l4-6 4 6z"/><rect x="21" y="4" width="10" height="3" rx="1.5" ${ACC}/>`,
  ),
  highlow: svg(
    `<path ${ACC} d="M10 28l10-14 10 14h-6v12h-8V28z"/><path ${ME} d="M34 36l10 14 10-14h-6V24h-8v12z"/>` + card(32, 44, 14, 20, 0, text(32, 48, '?', 10)),
  ),
  redblack: svg(
    card(20, 34, 22, 32, -10, suit('h', 20, 34, 13, 'fill="#c8142c"')) + card(44, 34, 22, 32, 10, suit('s', 44, 34, 13)),
  ),
  picknum: svg(
    [12, 22, 32, 42, 52].map((x, i) => `<rect x="${x - 4.5}" y="22" width="9" height="13" rx="1.5" ${i === 2 ? ACC : ME} stroke="var(--ink, #10141c)" stroke-width="1"/>`).join('') +
      `<path ${ME} d="M30 58v-14q0-3 3-3t3 3v6l6 1q4 1 3 5l-1 6H32z"/>` +
      text(32, 16, '7', 12, ACC),
  ),
  partybj: svg(
    card(14, 40, 16, 22, -18) + card(32, 36, 16, 22, 0, text(32, 39, '21', 8)) + card(50, 40, 16, 22, 18) +
      [14, 32, 50].map((x) => `<circle cx="${x}" cy="${x === 32 ? 16 : 22}" r="4" ${ACC}/>`).join(''),
  ),
  roulette: svg(
    `<circle cx="32" cy="32" r="27" ${ME}/><circle cx="32" cy="32" r="22" ${INK}/>` +
      Array.from({ length: 18 }, (_, i) => {
        const a0 = (i / 18) * Math.PI * 2;
        const a1 = ((i + 1) / 18) * Math.PI * 2;
        const p = (r: number, a: number) => `${(32 + Math.cos(a) * r).toFixed(1)} ${(32 + Math.sin(a) * r).toFixed(1)}`;
        return `<path fill="${i === 0 ? '#1f8a4c' : i % 2 ? '#c8142c' : '#141414'}" d="M${p(21, a0)}A21 21 0 0 1 ${p(21, a1)}L${p(13, a1)}A13 13 0 0 0 ${p(13, a0)}Z"/>`;
      }).join('') +
      `<circle cx="32" cy="32" r="9" ${ACC}/><path ${INK} d="M31 22h2v20h-2zM22 31h20v2H22z"/><circle cx="46" cy="18" r="3" fill="#fff"/>`,
  ),
  random: svg(text(32, 50, '?', 46, ACC)),
};

/** A table's pictogram (falls back to a question mark). */
export const gameIcon = (id: string) => GAME_ICONS[id] ?? GAME_ICONS.random;
