/**
 * A dot-matrix LED display (the machine's message window): a 5×7 font lit on a grid of round
 * LEDs, scrolling right to left when the text is longer than the window, centered otherwise.
 * The unlit grid is drawn once; each frame only the lit dots are stamped over it.
 */
export const DOT_FONT: Record<string, string> = {
  A: '01110100011000111111100011000110001',
  B: '11110100011000111110100011000111110',
  C: '01110100011000010000100001000101110',
  D: '11100100101000110001100011001011100',
  E: '11111100001000011110100001000011111',
  F: '11111100001000011110100001000010000',
  G: '01110100011000010111100011000101111',
  H: '10001100011000111111100011000110001',
  I: '01110001000010000100001000010001110',
  J: '00111000100001000010000101001001100',
  K: '10001100101010011000101001001010001',
  L: '10000100001000010000100001000011111',
  M: '10001110111010110101100011000110001',
  N: '10001100011100110101100111000110001',
  O: '01110100011000110001100011000101110',
  P: '11110100011000111110100001000010000',
  Q: '01110100011000110001101011001001101',
  R: '11110100011000111110101001001010001',
  S: '01111100001000001110000010000111110',
  T: '11111001000010000100001000010000100',
  U: '10001100011000110001100011000101110',
  V: '10001100011000110001100010101000100',
  W: '10001100011000110101101011010101010',
  X: '10001100010101000100010101000110001',
  Y: '10001100011000101010001000010000100',
  Z: '11111000010001000100010001000011111',
  '0': '01110100011001110101110011000101110',
  '1': '00100011000010000100001000010001110',
  '2': '01110100010000100010001000100011111',
  '3': '11111000100010000010000011000101110',
  '4': '00010001100101010010111110001000010',
  '5': '11111100001111000001000011000101110',
  '6': '00110010001000011110100011000101110',
  '7': '11111000010001000100010000100001000',
  '8': '01110100011000101110100011000101110',
  '9': '01110100011000101111000010001001100',
  ' ': '00000000000000000000000000000000000',
  '.': '00000000000000000000000000110001100',
  ',': '00000000000000000000011000010001000',
  ':': '00000011000110000000011000110000000',
  '!': '00100001000010000100001000000000100',
  '?': '01110100010000100010001000000000100',
  '-': '00000000000000011111000000000000000',
  '+': '00000001000010011111001000010000000',
  "'": '00100001000100000000000000000000000',
  '/': '00000000010001000100010001000000000',
  '×': '00000100010101000100010101000100000',
  '*': '00000001001010101110101010010000000',
  '♥': '00000010101111111111011100010000000',
  '♦': '00100011101111111111011100010000000',
  '♠': '00100011101111111111111110010001110',
  '♣': '01110011100010111111111110010001110',
};

const COLS_PER_CHAR = 6;

export class DotMatrix {
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement | null = null;
  private dot: HTMLCanvasElement | null = null;
  private cols = 0;
  private rows = 9;
  private pitch = 1;
  private bits: Uint8Array = new Uint8Array(0);
  private width = 0;
  private offset = 0;
  private scroll = false;
  private text = '';
  private blink = 0;
  private ro: ResizeObserver;
  /** Scroll speed in columns per second. */
  speed = 26;

  constructor(
    private canvas: HTMLCanvasElement,
    private color = '#ff5a2a',
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
  }

  dispose() {
    this.ro.disconnect();
  }

  /** Shows a message; `flash` blinks it (a win). */
  show(text: string, flash = 0) {
    const t = normalize(text);
    this.blink = flash;
    if (t === this.text) return;
    this.text = t;
    this.compose();
  }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    if (r.width < 4) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.pitch = this.canvas.height / this.rows;
    this.cols = Math.floor(this.canvas.width / this.pitch);
    // unlit grid
    const bg = document.createElement('canvas');
    bg.width = this.canvas.width;
    bg.height = this.canvas.height;
    const g = bg.getContext('2d')!;
    g.fillStyle = '#0b0303';
    g.fillRect(0, 0, bg.width, bg.height);
    const x0 = (bg.width - this.cols * this.pitch) / 2;
    g.fillStyle = 'rgba(120, 40, 20, 0.28)';
    for (let y = 0; y < this.rows; y++)
      for (let x = 0; x < this.cols; x++) {
        g.beginPath();
        g.arc(x0 + (x + 0.5) * this.pitch, (y + 0.5) * this.pitch, this.pitch * 0.36, 0, Math.PI * 2);
        g.fill();
      }
    this.bg = bg;
    // one lit LED with its glow
    const s = Math.ceil(this.pitch * 2);
    const d = document.createElement('canvas');
    d.width = d.height = s;
    const gd = d.getContext('2d')!;
    const rg = gd.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    rg.addColorStop(0, '#fff2d0');
    rg.addColorStop(0.18, this.color);
    rg.addColorStop(0.36, this.color);
    rg.addColorStop(0.42, hexA(this.color, 0.35));
    rg.addColorStop(1, hexA(this.color, 0));
    gd.fillStyle = rg;
    gd.fillRect(0, 0, s, s);
    this.dot = d;
    this.compose();
  }

  /** Text to a column bitmap (7 font rows centered in the 9-row window). */
  private compose() {
    const chars = [...this.text];
    this.width = chars.length * COLS_PER_CHAR;
    this.bits = new Uint8Array(this.width * this.rows);
    chars.forEach((ch, i) => {
      const f = DOT_FONT[ch] ?? DOT_FONT['?'];
      for (let y = 0; y < 7; y++)
        for (let x = 0; x < 5; x++) if (f[y * 5 + x] === '1') this.bits[(i * COLS_PER_CHAR + x) * this.rows + y + 1] = 1;
    });
    this.scroll = this.width > this.cols;
    this.offset = this.scroll ? -this.cols * 0.5 : 0;
  }

  frame(dt: number, now: number) {
    if (!this.bg || !this.dot) return;
    const g = this.ctx;
    g.drawImage(this.bg, 0, 0);
    if (this.blink && Math.floor(now * this.blink * 2) % 2 === 1) return;
    let start: number;
    if (this.scroll) {
      // the text runs in from the right edge and out past the left one, then comes round again
      this.offset += dt * this.speed;
      if (this.offset > this.width) this.offset = -this.cols;
      start = Math.floor(this.offset);
    } else start = -Math.floor((this.cols - this.width) / 2);
    const x0 = (this.canvas.width - this.cols * this.pitch) / 2;
    const s = this.dot.width;
    for (let cx = 0; cx < this.cols; cx++) {
      const col = cx + start;
      if (col < 0 || col >= this.width) continue;
      for (let y = 0; y < this.rows; y++)
        if (this.bits[col * this.rows + y]) g.drawImage(this.dot, x0 + (cx + 0.5) * this.pitch - s / 2, (y + 0.5) * this.pitch - s / 2);
    }
  }
}

/** Upper case, accents dropped (the 5×7 font has no diacritics). */
function normalize(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();
}

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
