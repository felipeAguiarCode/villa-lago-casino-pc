import type { Lang } from './i18n';

const KEY = 'vlc.settings.v1';

export type Speed = 'normal' | 'fast' | 'instant';
export type Quality = 'high' | 'low';
export type BackColor = 'bordo' | 'marinho' | 'esmeralda';

export interface Settings {
  volume: number;
  muted: boolean;
  speed: Speed;
  quality: Quality;
  back: BackColor;
  /** PC: card back pattern id (src/table/backPatterns.ts). */
  backPattern: string;
  /** PC: card back colourway id, or 'table' for each table's own deck colour. */
  backTint: string;
  hints: boolean;
  lang: Lang;
}

const DEFAULTS: Settings = { volume: 0.8, muted: false, speed: 'normal', quality: 'high', back: 'bordo', backPattern: 'lattice', backTint: 'table', hints: true, lang: 'en' };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS };
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export const SPEED_SCALE: Record<Speed, number> = { normal: 1, fast: 1.8, instant: 5 };
