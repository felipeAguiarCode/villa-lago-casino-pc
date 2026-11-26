import { t } from '../../../core/i18n';
import { cardLabel, rankLabel } from '../../../core/cards';
import { wait } from '../../../table/anim';
import type { Card3D } from '../../../table/cardMesh';
import { FONT, GOLD, tablePrint } from '../../../table/prints';
import type { SpotDef } from '../../kit';
import type { GameCtx } from '../../types';
import { strength } from '../manilha/engine';
import { MANILHA_HOLDEM_RULES, ManilhaHoldemRound, MODE_MANILHA_HOLDEM } from '../manilha/holdem';
import type { RoundEnv, Snapshot } from '../shared/round';
import { BrazilTable } from './base';
import './strings';

export class ManilhaHoldemView extends BrazilTable<ManilhaHoldemRound> {
  readonly id = 'manilhaholdem';
  readonly title = "Manilha Hold'em";
  protected readonly felt = 'manilhaholdem' as const;

  constructor(g: GameCtx) {
    super(g, MODE_MANILHA_HOLDEM, MANILHA_HOLDEM_RULES.ante, '');
  }

  rules() {
    return t('br.rules.manilhaholdem');
  }

  protected spotDefs(): SpotDef[] {
    return [
      { id: 'ANTE', label: t('br.ante'), u: 0.38, v: 0.77, size: 0.56, max: MANILHA_HOLDEM_RULES.ante.max },
      { id: 'PLAY', label: t('br.play'), u: 0.62, v: 0.77, size: 0.56, auto: true },
    ];
  }

  protected decorate() {
    this.g.table.addDecal(tablePrint([{ text: "MANILHA HOLD'EM", y: 60, R: 1300, font: FONT.title(50), spacing: 5 }, { text: 'BEST THREE · AT LEAST ONE HOLE CARD', y: 112, R: 1300, font: FONT.title(22), color: GOLD, spacing: 3 }], 140), 0.5, 0.53, 2.9);
  }

  protected createRound(env: RoundEnv, snap?: Snapshot<string, object>) {
    const r = new ManilhaHoldemRound(env, MANILHA_HOLDEM_RULES, snap as never, snap ? undefined : (this.rig ?? undefined));
    this.rig = null;
    return r;
  }

  protected advice() {
    const r = this.round;
    if (!r || r.state !== 'PLAY_DECISION') return null;
    return r.playerCards.some((c) => strength(c, r.manilha!) >= 7) ? { id: 'play', msg: t('br.h.play') } : { id: 'fold', msg: t('br.h.fold') };
  }

  protected async runRound(r: ManilhaHoldemRound, fresh: boolean) {
    if (fresh) r.placeAnte(this.spots.amounts().ANTE);
    const P = this.slots(0.5, 0.64, 2, 0.72);
    const D = this.slots(0.5, 0.18, 2, 0.72);
    const B = this.slots(0.4, 0.38, 3, 0.68);
    const viraAt = this.slots(0.87, 0.38, 1, 0)[0];
    await this.cardsT.deal(r.vira, viraAt, true, { dur: 0.45 });
    this.tag(t('br.vira'), '', viraAt.pos.x, viraAt.pos.z + 0.55);
    this.tag(t('br.manilha', { r: rankLabel(r.manilha!) }), 'win', viraAt.pos.x - 0.1, viraAt.pos.z + 0.85);
    const p3: Card3D[] = [];
    const d3: Card3D[] = [];
    for (let i = 0; i < 2; i++) {
      p3.push(await this.cardsT.deal(r.playerCards[i], P[i], true, { dur: 0.4 }));
      d3.push(await this.cardsT.deal(null, D[i], false, { dur: 0.4 }));
    }
    const b3: Card3D[] = [];
    for (const c of r.board) b3.push(await this.cardsT.deal(c, B[b3.length], true, { dur: 0.42 }));
    const go = await this.choose([
      { id: 'fold', label: t('btn.fold'), color: 'red', icon: 'fold' },
      { id: 'play', label: t('btn.play'), color: 'green', icon: 'play', enabled: this.g.wallet.canAfford(r.bets[0].amount) },
    ]);
    if (go === 'fold') {
      r.fold();
      this.g.sfx.play('shove', { vol: 0.6 });
      for (const c of p3) this.cardsT.flip(c, 0.4);
      await wait(0.4);
      return this.settleChips(r);
    }
    r.play();
    await this.spots.place('PLAY', r.bets[1].amount);
    for (const c of r.board.slice(b3.length)) {
      b3.push(await this.cardsT.deal(c, B[b3.length], true, { dur: 0.42 }));
      await wait(0.25);
    }
    const dc = r.dealerCards!;
    for (let i = 0; i < 2; i++) {
      d3[i].setCard(dc[i]);
      await this.cardsT.flip(d3[i], 0.45);
    }
    const pb = r.playerBest!;
    const db = r.dealerBest!;
    const m = r.manilha!;
    const show = (cards: number[]) => [...cards].sort((a, b) => strength(b, m) - strength(a, m)).map(cardLabel).join(' ');
    this.tag(show(pb.cards), r.outcome === 'WIN' ? 'win' : '', 0, P[0].pos.z - 0.56);
    this.tag(show(db.cards), 'dealer', 0, D[0].pos.z + 0.55);
    const win = r.outcome === 'WIN' ? [...p3, ...b3].filter((c) => pb.cards.includes(c.card!)) : r.outcome === 'LOSS' ? [...d3, ...b3].filter((c) => db.cards.includes(c.card!)) : [];
    this.glow(win, r.outcome === 'WIN' ? '#ffd27a' : '#9fd0ff');
    // the Zap (♣ manilha) is the strongest card: strength 14
    if (r.outcome === 'WIN' && pb.cards.some((c) => strength(c, m) === 14)) this.g.trophy('zap');
    await wait(0.5);
    await this.settleChips(r);
  }
}
