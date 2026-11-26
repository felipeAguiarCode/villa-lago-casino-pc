/** Screen rectangle in CSS pixels, relative to the frame. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PcLayout {
  /** HUD unit in px (the phone version's 1% of the frame width). */
  u: number;
  /** Width of each side zone (paytables on the left; trump cards and table decor on the right). */
  side: number;
  /** HUD unit of the side panels and of the bottom button dock: they have room, so they are larger. */
  panelU: number;
  /** Height kept free at the bottom for the button dock. */
  dock: number;
  /** Where the table's play area is framed by the camera. */
  play: Rect;
}

/**
 * Widescreen layout. The HUD unit follows the screen height, so the interface keeps its proportions
 * from a laptop to a large monitor. The table fills the middle of the screen, from just under the
 * top edge (the top bar keeps to the corners) down to the button dock centered at the bottom.
 */
export function pcLayout(w: number, h: number): PcLayout {
  const u = Math.max(3.2, Math.min(h * 0.005, w * 0.0031));
  const side = Math.min(115 * u, w * 0.3);
  const panelU = Math.min(u * 1.2, side / 96);
  const dock = 18 * panelU;
  const top = 4 * u;
  const gap = 3 * u;
  const play = { x: side + gap, y: top, w: Math.max(1, w - 2 * (side + gap)), h: Math.max(1, h - top - dock) };
  return { u, side, panelU, dock, play };
}

/** Keeps the HUD's CSS variables in step with the frame size. */
export function bindLayoutVars(frame: HTMLElement) {
  const apply = () => {
    const r = frame.getBoundingClientRect();
    const l = pcLayout(r.width, r.height);
    frame.style.setProperty('--u', `${l.u.toFixed(3)}px`);
    frame.style.setProperty('--side', `${l.side.toFixed(1)}px`);
    frame.style.setProperty('--u-panel', `${l.panelU.toFixed(3)}px`);
    frame.style.setProperty('--play-x', `${l.play.x.toFixed(1)}px`);
    frame.style.setProperty('--play-w', `${l.play.w.toFixed(1)}px`);
  };
  new ResizeObserver(apply).observe(frame);
  apply();
}
