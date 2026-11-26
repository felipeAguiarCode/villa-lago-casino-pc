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
  /** Width of each side panel (paytables on the left, chips and actions on the right). */
  side: number;
  /** HUD unit inside the side panels: they have room, so their pieces are drawn larger. */
  panelU: number;
  /** Where the table's play area is framed by the camera. */
  play: Rect;
}

/**
 * Widescreen layout. The HUD unit follows the screen height, so the interface keeps its proportions
 * from a laptop to a large monitor. The table sits in the middle, between two side panels.
 */
export function pcLayout(w: number, h: number): PcLayout {
  const u = Math.max(3.2, Math.min(h * 0.005, w * 0.0031));
  const side = Math.min(115 * u, w * 0.3);
  const panelU = Math.min(u * 1.2, side / 96);
  const top = 16 * u;
  const gap = 3 * u;
  const play = { x: side + gap, y: top, w: Math.max(1, w - 2 * (side + gap)), h: Math.max(1, h - top - 6 * u) };
  return { u, side, panelU, play };
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
