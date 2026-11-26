import { t } from '../../../core/i18n';
import { rankLabel } from '../../../core/cards';
import { slideCard, wait, type Place } from '../../../table/anim';
import type { Card3D } from '../../../table/cardMesh';
import { FONT, GOLD, tablePrint } from '../../../table/prints';
import type { SpotDef } from '../../kit';
import type { GameCtx } from '../../types';
import { strength } from '../manilha/engine';
import { dealerDiscardIndex, MANILHA_DRAW_RULES, ManilhaDrawRound, MODE_MANILHA_DRAW } from '../manilha/draw';
import type { RoundEnv, Snapshot } from '../shared/round';
import { BrazilTable } from './base';
import './strings';

const COLS = [0.25, 0.45, 0.65];

export class ManilhaDrawView extends BrazilTable<ManilhaDrawRound> {
  readonly id = 'manilhadraw';
  readonly title = 'Manilha Draw';
  protected readonly felt = 'manilhadraw' as const;
  private p3: Card3D[] = [];

  constructor(g: GameCtx) {
    super(g, MODE_MANILHA_DRAW, MANILHA_DRAW_RULES.ante, t('br.pickDiscard'));
  }

  rules() {
    return t('br.rules.manilhadraw');
  }

  protected spotDefs(): SpotDef[] {
    return [
      { id: 'ANTE', label: t('br.ante'), u: 0.38, v: 0.77, size: 0.56, max: MANILHA_DRAW_RULES.ante.max },
      { id: 'PLAY', label: t('br.play'), u: 0.62, v: 0.77, size: 0.56, auto: true },
    ];
  }

  protected decorate() {
    this.g.table.addDecal(tablePrint([{ text: 'MANILHA DRAW', y: 60, R: 1300, font: FONT.title(54), spacing: 6 }, { text: '4 5 6 7 Q J K A 2 3', y: 112, R: 1300, font: FONT.title(24), color: GOLD, spacing: 6 }], 140), 0.5, 0.39, 2.9);
  }

  protected createRound(env: RoundEnv, snap?: Snapshot<string, object>) {
    const r = new ManilhaDrawRound(env, MANILHA_DRAW_RULES, snap as never, snap ? undefined : (this.rig ?? undefined));
    this.rig = null;
    return r;
  }

  protected advice() {
    const r = this.round;
    if (!r || r.manilha === null) return null;
    const m = r.manilha;
    if (r.state === 'PLAY_DECISION') return r.playerCards.some((c) => strength(c, m) >= 9) ? { id: 'play', msg: t('br.h.play') } : { id: 'fold', msg: t('br.h.fold') };
    if (r.state === 'DRAW_DECISION') {
      const i = dealerDiscardIndex(r.playerCards, m, MANILHA_DRAW_RULES.dealerDiscardThreshold);
      if (i === null) return { id: 'keep', msg: t('br.h.keep') };
      this.picker.set([i]);
      return { id: 'draw', msg: t('br.h.draw') };
    }
    if (r.state === 'SELECTING_CARD') {
      const left = [0, 1, 2].filter((i) => !r.playedIndices.includes(i));
      const best = left.reduce((a, b) => (strength(r.playerCards[b], m) > strength(r.playerCards[a], m) ? b : a));
      this.picker.set([left.indexOf(best)]);
      return { id: 'duel', msg: t('br.h.duel') };
    }
    return null;
  }

  protected async runRound(r: ManilhaDrawRound, fresh: boolean) {
    const { sfx } = this.g;
    if (fresh) r.placeAnte(this.spots.amounts().ANTE);
    const P = this.slots(0.5, 0.62, 3, 0.72);
    const D = this.slots(0.5, 0.17, 3, 0.72);
    const duelP = COLS.map((u) => this.slots(u, 0.47, 1, 0)[0]);
    const duelD = COLS.map((u) => this.slots(u, 0.31, 1, 0)[0]);
    const viraAt = this.slots(0.87, 0.39, 1, 0)[0];
    const at = (p: Place) => p.pos;
    // what is already on the table (a resumed round starts from where it stopped)
    await this.cardsT.deal(r.vira, viraAt, true, { dur: 0.45 });
    this.tag(t('br.vira'), '', at(viraAt).x, at(viraAt).z + 0.55);
    this.tag(t('br.manilha', { r: rankLabel(r.manilha!) }), 'win', at(viraAt).x - 0.1, at(viraAt).z + 0.85);
    const dealer = new Map<number, Card3D>();
    this.p3 = [];
    for (let i = 0; i < 3; i++) {
      const played = r.data.duels.findIndex((d) => d.player === i);
      this.p3[i] = await this.cardsT.deal(r.playerCards[i], played >= 0 ? duelP[played] : P[i], true, { dur: 0.4 });
      const uid = r.data.dealer[i];
      const k = r.data.duels.findIndex((d) => d.dealer === uid);
      const d3 = await this.cardsT.deal(k >= 0 ? r.cardOf(uid) : null, k >= 0 ? duelD[k] : D[i], k >= 0, { dur: 0.4 });
      dealer.set(uid, d3);
    }
    if (fresh && r.state === 'PLAY_DECISION') {
      const go = await this.choose([
        { id: 'fold', label: t('btn.fold'), color: 'red', icon: 'fold' },
        { id: 'play', label: t('btn.play'), color: 'green', icon: 'play', enabled: this.g.wallet.canAfford(r.bets[0].amount) },
      ]);
      if (go === 'fold') {
        r.fold();
        sfx.play('shove', { vol: 0.6 });
        for (const c of this.p3) this.cardsT.flip(c, 0.4);
        await wait(0.4);
        return this.settleChips(r);
      }
      r.play();
      await this.spots.place('PLAY', r.bets[1].amount);
    } else if (r.state === 'PLAY_DECISION') {
      // resumed before the decision: same choice
      const go = await this.choose([
        { id: 'fold', label: t('btn.fold'), color: 'red', icon: 'fold' },
        { id: 'play', label: t('btn.play'), color: 'green', icon: 'play', enabled: this.g.wallet.canAfford(r.bets[0].amount) },
      ]);
      if (go === 'fold') {
        r.fold();
        return this.settleChips(r);
      }
      r.play();
      await this.spots.place('PLAY', r.bets[1].amount);
    }
    if (r.state === 'DRAW_DECISION') {
      const { id, picked } = await this.pickCards(this.p3, 1, [
        { id: 'keep', label: t('br.keep'), color: 'blue', icon: 'knock' },
        { id: 'draw', label: t('br.drawBtn'), color: 'green', icon: 'redo', needs: true },
      ]);
      const oldDealer = [...r.data.dealer];
      r.draw(id === 'draw' ? picked[0] : null);
      const pd = r.data.playerDiscard;
      if (pd) await this.replace(this.p3, pd.index, r.cardOf(pd.replacement), P[pd.index]);
      const dd = r.data.dealerDiscard;
      if (dd) {
        this.g.hud.toast(t('br.dealerDraws', { n: 1 }), 1400);
        const arr = oldDealer.map((u) => dealer.get(u)!);
        await this.replace(arr, dd.index, null, D[dd.index]);
        dealer.delete(dd.uid);
        dealer.set(dd.replacement, arr[dd.index]);
      }
      // the dealer's cards line up in their fixed playing order
      await Promise.all(r.data.dealerOrder.map((u, k) => slideCard(dealer.get(u)!, D[k], 0.3, 0.05)));
    }
    while (r.state === 'SELECTING_CARD') {
      const k = r.data.duels.length;
      const left = [0, 1, 2].filter((i) => !r.playedIndices.includes(i));
      const { picked } = await this.pickCards(left.map((i) => this.p3[i]), 1, [{ id: 'duel', label: t('br.confirm'), color: 'green', icon: 'check', needs: true }], t('br.duelHint', { n: k + 1 }));
      const idx = left[picked[0]];
      const out = r.duel(idx);
      const d3 = dealer.get(r.data.duels[k].dealer)!;
      sfx.play('slide', { vol: 0.6 });
      await Promise.all([slideCard(this.p3[idx], duelP[k], 0.35, 0.12), slideCard(d3, duelD[k], 0.35, 0.12)]);
      d3.setCard(out.dealer);
      await this.cardsT.flip(d3, 0.45);
      const word = out.result === 'PLAYER_WIN' ? 'br.duelWin' : out.result === 'DEALER_WIN' ? 'br.duelLoss' : 'br.duelDraw';
      this.tag(t(word), out.result === 'PLAYER_WIN' ? 'win' : out.result === 'DEALER_WIN' ? 'dealer' : '', duelP[k].pos.x, duelP[k].pos.z + 0.55);
      if (out.result === 'PLAYER_WIN') this.glow([this.p3[idx]]);
      await wait(0.35);
    }
    if (r.data.duels.length === 3 && r.data.duels.every((d) => d.result === 'PLAYER_WIN')) this.g.trophy('sweep');
    await this.settleChips(r);
  }
}
