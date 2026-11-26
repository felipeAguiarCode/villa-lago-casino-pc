import type { Sfx } from '../audio/sfx';
import type { Settings } from '../core/settings';
import type { Wallet } from '../core/wallet';
import type { CardFactory } from '../table/cardMesh';
import type { ChipSet } from '../table/chips';
import type { Fx } from '../table/fx';
import type { Stage } from '../table/stage';
import type { Table } from '../table/table';
import type { Hud } from '../ui/hud';

export interface GameCtx {
  stage: Stage;
  table: Table;
  cards: CardFactory;
  chips: ChipSet;
  fx: Fx;
  hud: Hud;
  sfx: Sfx;
  wallet: Wallet;
  settings: Settings;
  /** PC: reports a special result to the trophies ('big', 'sweep', 'zap', 'perfect', 'paid'). */
  trophy: (event: string) => void;
}

export interface GameView {
  readonly id: string;
  readonly title: string;
  enter(): Promise<void>;
  exit(): Promise<void>;
  /** True while a hand is in progress (leaving would forfeit it). */
  readonly inRound: boolean;
  /** HTML for the REGRAS panel. */
  rules(): string;
  /** Lobby shortcut into a table variant (called before enter). */
  preset?(variant: string): void;
  /** Called when the bankroll changed from outside (bonus, refill, reset). */
  onWalletChange?(): void;
  /** Chips the player has on the felt that are already taken from the bankroll (0 when none). */
  stakeOnTable?(): number;
}

export interface GameInfo {
  id: string;
  title: string;
  tagline: string;
  felt: [string, string];
  art: string[];
  ready: boolean;
}
