/** Original inline SVG icons (24×24 viewBox). */

const svg = (body: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;

function gearPath(): string {
  const teeth = 8;
  const pts: string[] = [];
  for (let i = 0; i < teeth * 4; i++) {
    const a = (i / (teeth * 4)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 4 === 0 || i % 4 === 1 ? 10.5 : 8.2;
    pts.push(`${(12 + Math.cos(a) * r).toFixed(2)} ${(12 + Math.sin(a) * r).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z M12 8.4a3.6 3.6 0 1 0 0.001 0Z`;
}

export const ICONS = {
  plus: svg('<path d="M9.6 3h4.8v6.6H21v4.8h-6.6V21H9.6v-6.6H3V9.6h6.6z"/>'),
  gear: svg(`<path fill-rule="evenodd" d="${gearPath()}"/>`),
  expand: svg('<path d="M3 3h7v2.6H5.6V10H3zM21 3v7h-2.6V5.6H14V3zM3 21v-7h2.6v4.4H10V21zM21 21h-7v-2.6h4.4V14H21z"/>'),
  shrink: svg('<path d="M7.4 3H10v7H3V7.4h4.4zM14 3h2.6v4.4H21V10h-7zM3 14h7v7H7.4v-4.4H3zM14 14h7v2.6h-4.4V21H14z"/>'),
  stand: svg(
    '<rect x="6.2" y="4.6" width="2.6" height="9" rx="1.3"/><rect x="9.2" y="2.6" width="2.6" height="10" rx="1.3"/><rect x="12.2" y="3" width="2.6" height="10" rx="1.3"/><rect x="15.2" y="4.6" width="2.6" height="9" rx="1.3"/><path d="M6.2 11h11.6v4.2c0 3.6-2.6 6.3-6 6.3-2.3 0-3.7-1-4.9-2.7l-3.1-4.4c-.6-.9-.4-1.9.4-2.4.8-.5 1.7-.2 2.2.5l-.2-1.5z"/>',
  ),
  hit: svg('<path d="M4 6h16l-8 13z"/>'),
  double: svg(
    '<circle cx="12" cy="12" r="10" fill="none" stroke="#fff" stroke-width="2.4" stroke-dasharray="3.2 2.1"/><circle cx="12" cy="12" r="6.6"/><text x="12" y="15.4" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="700" font-size="9.5" fill="#1b4fae">x2</text>',
  ),
  split: svg(
    '<path d="M12 21v-7M12 14 6.8 8.8M12 14l5.2-5.2" stroke="#fff" stroke-width="2.8" fill="none" stroke-linecap="round"/><path d="M3.4 5.4h6.4L3.4 11.8z M20.6 5.4h-6.4l6.4 6.4z"/>',
  ),
  bulb: svg(
    '<path d="M12 2.2a7 7 0 0 0-4.2 12.6c.7.5 1.2 1.3 1.2 2.2V18h6v-1c0-.9.5-1.7 1.2-2.2A7 7 0 0 0 12 2.2z"/><rect x="9" y="19" width="6" height="1.6" rx=".8"/><rect x="10" y="21.2" width="4" height="1.4" rx=".7"/>',
  ),
  trash: svg('<path d="M8.5 3h7l.8 1.6H21v2.6H3V4.6h4.7zM5 8.6h14l-1.1 12.1c-.1 1-.9 1.8-1.9 1.8H8c-1 0-1.8-.8-1.9-1.8z"/>'),
  redo: svg('<path d="M12 4.2V1.4L17.6 6 12 10.6V7.6a5.2 5.2 0 1 0 5.2 5.4h3.3A8.5 8.5 0 1 1 12 4.2z"/>'),
  deal: svg(
    '<rect x="3" y="5.5" width="10" height="14" rx="1.6" transform="rotate(-12 8 12.5)"/><rect x="10" y="4" width="10.5" height="15" rx="1.6" fill="#fff" stroke="#2c7a14" stroke-width="1.4" transform="rotate(10 15 11.5)"/>',
  ),
  chevron: svg('<path d="M8.6 3.4 17.2 12l-8.6 8.6-2.4-2.4L12.4 12 6.2 5.8z"/>'),
  home: svg('<path d="M12 3 2.5 11h2.8v9.5h5.2v-6h3v6h5.2V11h2.8z"/>'),
  info: svg('<path fill-rule="evenodd" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-1.4 8.2h2.8V17h-2.8zm1.4-4.3a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4z"/>'),
  check: svg('<path d="M9.4 16.2 4.9 11.7 3 13.6l6.4 6.4L21 8.4l-1.9-1.9z"/>'),
  close: svg('<path d="M6.3 4.4 12 10.1l5.7-5.7 1.9 1.9-5.7 5.7 5.7 5.7-1.9 1.9-5.7-5.7-5.7 5.7-1.9-1.9 5.7-5.7-5.7-5.7z"/>'),
  shield: svg('<path d="M12 2 4 5v6.4c0 5 3.4 9.3 8 10.6 4.6-1.3 8-5.6 8-10.6V5z"/>'),
  speaker: svg(
    '<path d="M3 9h4l5-4v14l-5-4H3z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.2 5.8a8.8 8.8 0 0 1 0 12.4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
  ),
  mute: svg('<path d="M3 9h4l5-4v14l-5-4H3z"/><path d="M15 9l6 6M21 9l-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
  speed1: svg('<path d="M8 5l9 7-9 7z"/>'),
  speed2: svg('<path d="M3 5l8.5 7L3 19zM12.5 5l8.5 7-8.5 7z"/>'),
  speed3: svg('<path d="M.5 6l7 6-7 6zM8.5 6l7 6-7 6zM16.5 6l7 6-7 6z"/>'),
  sparkle: svg('<path d="M11 2l2.3 6.4L19.5 10l-6.2 2L11 18.5 8.7 12 2.5 10l6.2-1.6z"/><path d="M19 14.5l1 2.3 2.2.9-2.2.9-1 2.3-.9-2.3-2.3-.9 2.3-.9z"/>'),
  leaf: svg('<path d="M20.5 3.5C11 3.5 4.8 7.6 4.8 14.6c0 1.3.3 2.5.8 3.5L3.5 20.2l1.4 1.4 2-2c1 .6 2.2.9 3.5.9 7.3 0 10.9-6.2 10.1-17zM8.4 17.6c2.1-3.9 5-6.8 8.7-8.9-3.1 2.7-5.5 5.6-7.2 9.2z"/>'),
  bulbOff: svg(
    '<path d="M12 2.2a7 7 0 0 0-4.2 12.6c.7.5 1.2 1.3 1.2 2.2V18h6v-1c0-.9.5-1.7 1.2-2.2A7 7 0 0 0 12 2.2z" opacity=".45"/><rect x="9" y="19" width="6" height="1.6" rx=".8" opacity=".45"/><path d="M3.5 3.5l17 17" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  ),
  raise: svg('<path d="M12 2.5l8.5 9h-5.2V21H8.7v-9.5H3.5z"/>'),
  play: svg('<path d="M7 4l13 8-13 8z"/>'),
  fold: svg(
    '<rect x="3.5" y="6" width="9" height="13" rx="1.6" transform="rotate(-14 8 12.5)" opacity=".55"/><rect x="10.5" y="5" width="9" height="13" rx="1.6" transform="rotate(12 15 11.5)" opacity=".55"/><path d="M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
  ),
  knock: svg('<path d="M7 9.5V6.8a1.6 1.6 0 0 1 3.2 0v-1a1.6 1.6 0 0 1 3.2 0v1a1.6 1.6 0 0 1 3.2 0v1.4a1.6 1.6 0 0 1 3.2 0V14a7 7 0 0 1-7 7h-1.3A6.5 6.5 0 0 1 5 14.5v-2.8a1.6 1.6 0 0 1 2-1.6z"/><path d="M2 21h20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  chips: svg(
    '<ellipse cx="12" cy="17.5" rx="8.5" ry="3.2"/><ellipse cx="12" cy="13" rx="8.5" ry="3.2" stroke="#000" stroke-opacity=".25"/><ellipse cx="12" cy="8.5" rx="8.5" ry="3.2" stroke="#000" stroke-opacity=".25"/>',
  ),
  chip: svg('<path fill-rule="evenodd" d="M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19zm0 4.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"/><circle cx="12" cy="12" r="3"/>'),
  globe: svg(
    '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  ),
  eye: svg('<path fill-rule="evenodd" d="M12 5c5.2 0 9.2 4.2 10.5 7-1.3 2.8-5.3 7-10.5 7S2.8 14.8 1.5 12C2.8 9.2 6.8 5 12 5zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 2.2a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6z"/>'),
  target: svg('<path fill-rule="evenodd" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2.6a7.4 7.4 0 1 0 0 14.8 7.4 7.4 0 0 0 0-14.8zm0 3a4.4 4.4 0 1 1 0 8.8 4.4 4.4 0 0 1 0-8.8zm0 2.6a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6z"/>'),
  swap: svg('<path d="M7 3 2.5 7.5 7 12V9h9V6H7zM17 12v3H8v3h9v3l4.5-4.5z"/>'),
  flame: svg('<path d="M12.5 2c.6 3.4-1.4 5.3-3 7-1.4 1.6-2.5 3-2.5 5.4A5 5 0 0 0 12 19.5a5 5 0 0 0 5-5c0-2.2-1-3.7-2-5 0 1.6-.6 2.7-1.6 3.2.4-3.4-.2-7.6-.9-10.7zM12 22a7.5 7.5 0 0 1-7.5-7.5c0-3.4 1.7-5.5 3.2-7.2C9.5 5.4 11 3.8 10.5.5 17 2.6 19.5 9 19.5 14.5A7.5 7.5 0 0 1 12 22z"/>'),
  feather: svg('<path d="M20.7 3.3C14 3.6 8.6 7.4 6.4 13.6l-1.3 3.7-2.5 2.5 1.4 1.4 2.4-2.4 3.8-1.2c6.1-2.2 9.9-7.6 10.5-14.3zM9.2 15.5l7.4-7.4-1.1-1.1-7.4 7.4.4-1.2z"/>'),
  twin: svg('<rect x="3" y="4" width="10" height="14" rx="1.6" opacity=".7"/><rect x="11" y="6" width="10" height="14" rx="1.6"/><path d="M16 10v6M13 13h6" stroke="#1a1226" stroke-width="2" stroke-linecap="round"/>'),
  cycle: svg('<path d="M12 4.2V1.5L16.4 5 12 8.5V6a6 6 0 0 0-5.6 8.2l-1.8 1A8 8 0 0 1 12 4.2zm0 15.6v2.7L7.6 19 12 15.5V18a6 6 0 0 0 5.6-8.2l1.8-1A8 8 0 0 1 12 19.8z"/>'),
  crystal: svg('<path fill-rule="evenodd" d="M12 2.5a7.5 7.5 0 0 1 5.3 12.8l1.2 2.7H5.5l1.2-2.7A7.5 7.5 0 0 1 12 2.5zm-2 4a3.5 3.5 0 0 0-2.6 2.2l1.5.6A1.9 1.9 0 0 1 10.3 8z"/><rect x="4.5" y="19" width="15" height="2.6" rx="1.3"/>'),
  shuffle: svg('<path d="M17 3.5 21 7l-4 3.5V8.2h-1.4c-1.3 0-2 .6-3 2l-.7 1-1.3-1.8.5-.7c1.3-1.8 2.4-2.7 4.5-2.7H17zM3 7h3.2c2.1 0 3.2.9 4.5 2.7l2.8 3.9c1 1.4 1.7 2 3 2H17v-2.3l4 3.5-4 3.5v-2.3h-1.4c-2.1 0-3.2-.9-4.5-2.7l-2.8-3.9c-1-1.4-1.7-2-3-2H3zm0 9.8h3.1c1.3 0 2-.6 3-2l.7-1 1.3 1.8-.5.7c-1.3 1.8-2.4 2.7-4.5 2.7H3z"/>'),
  bolt: svg('<path d="M13.5 1.5 4 13.5h6.2L8.8 22.5 20 9.5h-6.4z"/>'),
  snow: svg('<path d="M11 1.5h2v4.1l2.3-2.3 1.4 1.4-3.7 3.7v2.1l1.8-1 1.4-5 1.9.5-.9 3.2 3.6-2 1 1.7-3.6 2 3.2.9-.5 1.9-5-1.4-1.8 1 1.8 1 5-1.4.5 1.9-3.2.9 3.6 2-1 1.7-3.6-2 .9 3.2-1.9.5-1.4-5-1.8-1v2.1l3.7 3.7-1.4 1.4-2.3-2.3v4.1h-2v-4.1l-2.3 2.3-1.4-1.4 3.7-3.7v-2.1l-1.8 1-1.4 5-1.9-.5.9-3.2-3.6 2-1-1.7 3.6-2-3.2-.9.5-1.9 5 1.4 1.8-1-1.8-1-5 1.4-.5-1.9 3.2-.9-3.6-2 1-1.7 3.6 2-.9-3.2 1.9-.5 1.4 5 1.8 1V8.4L6.6 4.7 8 3.3l2.3 2.3V1.5z"/>'),
  crack: svg('<path d="M4 3h7.2l-1.6 4.4 3.3 1.6-2.2 4.4 3.4-1.1L13 21H4zM20 3v18h-5.2l1.4-6.6-3.5 1.1 2.4-4.8-3.2-1.6L13.6 3z"/>'),
  grab: svg('<path d="M7.5 10.5V5.8a1.5 1.5 0 0 1 3 0V10V3.8a1.5 1.5 0 0 1 3 0V10V5a1.5 1.5 0 0 1 3 0v6.6V8.2a1.5 1.5 0 0 1 3 0v6.2A7.6 7.6 0 0 1 12 22a7 7 0 0 1-6.4-4.2l-2.2-5a1.5 1.5 0 0 1 2.7-1.3z"/>'),
  mask: svg('<path d="M2 8.5c3.3-1.3 6.6-1.9 10-1.9s6.7.6 10 1.9v2.4c0 3.4-2.4 6.1-5.4 6.1-1.8 0-3-1-4.6-2.9-1.6 1.9-2.8 2.9-4.6 2.9-3 0-5.4-2.7-5.4-6.1zm5 2.2c-1.2 0-2.2.6-2.6 1.4 1.4.9 3.8.9 5.2 0-.4-.8-1.4-1.4-2.6-1.4zm10 0c-1.2 0-2.2.6-2.6 1.4 1.4.9 3.8.9 5.2 0-.4-.8-1.4-1.4-2.6-1.4z"/>'),
  castle: svg('<path d="M3 21V9h3V5h2v2h2V5h4v2h2V5h2v4h3v12h-7v-5a2 2 0 0 0-4 0v5z"/>'),
  crown: svg('<path d="M2.5 7.5 7 11l5-7 5 7 4.5-3.5L19.5 18h-15zM4.5 19.5h15V22h-15z"/>'),
  palette: svg('<path d="M12 2.5C6.5 2.5 2.5 6.6 2.5 11.6c0 5 4 9 9 9 1.4 0 2.2-.8 2.2-1.9 0-.6-.3-1-.6-1.4-.3-.4-.5-.7-.5-1.2 0-1 .8-1.7 1.8-1.7h2.1c3.3 0 5.9-2.5 5.9-5.6 0-4.7-4.4-7.3-10.4-7.3zM6.8 12.8a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2zm2.6-4.4a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2zm5.2 0a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2zm3 4.2a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2z"/>'),
  lock: svg('<path fill-rule="evenodd" d="M7 10V7.5a5 5 0 0 1 10 0V10h1.5v11h-13V10zm2.6 0h4.8V7.5a2.4 2.4 0 0 0-4.8 0z"/>'),
};

export type IconName = keyof typeof ICONS;
