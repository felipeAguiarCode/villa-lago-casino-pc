import { t } from '../../../core/i18n';
import { cryptoRng } from '../../../core/rng';
import { wait } from '../../../table/anim';
import type { Card3D } from '../../../table/cardMesh';
import { FONT, GOLD, tablePrint } from '../../../table/prints';
import { Paytable } from '../../../ui/paytable';
import type { SpotDef } from '../../kit';
import type { GameCtx } from '../../types';
import { canastraDealerDiscards } from '../canastra/engine';
import { CANASTRA_DRAW_RULES, CanastraDrawRound, MODE_CANASTRA_DRAW } from '../canastra/draw';
import { MODE_PIFE_EXPRESS, PIFE_EXPRESS_RULES, PifeExpressRound, pifeExpressClass, pifeOptions } from '../pife/express';
import { pifeDiscardPlan } from '../pife/strategy';
import { MODE_VIDEO_PIFE, VIDEO_PIFE_RULES, videoPifeAdvice, VideoPifeRound, VP_CLASSES, vpReturnMultiplier } from '../pife/video';
import type { RoundEnv, Snapshot } from '../shared/round';
import { BrazilTable } from './base';
import './strings';

/** Pife Express, Video Pife and Canastra Draw share one flow: deal, draw, reveal, compare. */

// ------------------------------------------------------------------ Pife Express
export class PifeExpressView extends BrazilTable<PifeExpressRound> {
  readonly id = 'pifeexpress';
  readonly title = 'Pife Express';
  protected readonly felt = 'pifeexpress' as const;

  constructor(g: GameCtx) {
    super(g, MODE_PIFE_EXPRESS, PIFE_EXPRESS_RULES.ante, t('br.pickDiscard'));
  }

  rules() {
    return t('br.rules.pifeexpress');
  }

  protected decorate() {
    this.g.table.addDecal(tablePrint([{ text: 'PIFE EXPRESS', y: 60, R: 1300, font: FONT.title(56), spacing: 6 }, { text: 'TWO GROUPS OF THREE · LOWEST DEADWOOD', y: 112, R: 1300, font: FONT.title(22), color: GOLD, spacing: 3 }], 140), 0.5, 0.4, 2.9);
  }

  protected createRound(env: RoundEnv, snap?: Snapshot<string, object>) {
    const r = new PifeExpressRound(env, PIFE_EXPRESS_RULES, snap as never, snap ? undefined : (this.rig ?? undefined));
    this.rig = null;
    return r;
  }

  protected advice() {
    const r = this.round;
    if (!r || r.state !== 'DRAW_DECISION') return null;
    const plan = pifeDiscardPlan(r.playerCards, 2, 2, pifeOptions(PIFE_EXPRESS_RULES));
    this.picker.set(plan.discard);
    return plan.discard.length ? { id: 'draw', msg: t('br.h.draw') } : { id: 'stand', msg: t('br.h.keep') };
  }

  protected async runRound(r: PifeExpressRound, fresh: boolean) {
    if (fresh) r.placeAnte(this.spots.amounts().ANTE);
    const P = this.slots(0.5, 0.6, 6, 0.48);
    const D = this.slots(0.5, 0.18, 6, 0.42);
    const p3: Card3D[] = [];
    const d3: Card3D[] = [];
    for (let i = 0; i < 6; i++) {
      p3.push(await this.cardsT.deal(r.playerCards[i], P[i], true, { dur: 0.36 }));
      d3.push(await this.cardsT.deal(null, D[i], false, { dur: 0.36 }));
    }
    const { id, picked } = await this.pickCards(p3, 2, [
      { id: 'stand', label: t('br.stand'), color: 'blue', icon: 'knock' },
      { id: 'draw', label: t('br.drawBtn'), color: 'green', icon: 'redo', needs: true },
    ], t('br.drawHint', { n: 2 }));
    r.draw(id === 'draw' ? picked : []);
    for (const d of r.data.playerDiscards) await this.replace(p3, d.index, r.cardOf(d.replacement), P[d.index]);
    if (r.dealerDiscardCount) this.g.hud.toast(t('br.dealerDraws', { n: r.dealerDiscardCount }), 1400);
    for (const d of r.data.dealerDiscards) await this.replace(d3, d.index, null, D[d.index]);
    const dc = r.dealerCards!;
    for (let i = 0; i < 6; i++) {
      d3[i].setCard(dc[i]);
      this.cardsT.flip(d3[i], 0.4);
      await wait(0.07);
    }
    await wait(0.4);
    const pe = r.playerEval!;
    const de = r.dealerEval!;
    const label = (e: typeof pe) => `${t(`br.cls.${pifeExpressClass(e)}`)} · ${t('br.dead', { d: e.deadwood })}`;
    this.tag(label(pe), r.outcome === 'WIN' ? 'win' : '', 0, P[0].pos.z - 0.56);
    this.tag(label(de), 'dealer', 0, D[0].pos.z + 0.55);
    this.glow(pe.groups.flatMap((g) => g.cards.map((i) => p3[i])));
    this.glow(de.groups.flatMap((g) => g.cards.map((i) => d3[i])), '#9fd0ff');
    await wait(0.5);
    if (pe.groups.length >= 2 && r.outcome === 'WIN') this.g.trophy('perfect');
    await this.settleChips(r, pe.groups.length >= 2 && r.outcome === 'WIN' ? t('br.cls.PERFECT_PIFE').toUpperCase() : undefined);
  }
}

// ------------------------------------------------------------------ Video Pife
export class VideoPifeView extends BrazilTable<VideoPifeRound> {
  readonly id = 'videopife';
  readonly title = 'Video Pife';
  protected readonly felt = 'videopife' as const;

  constructor(g: GameCtx) {
    super(g, MODE_VIDEO_PIFE, VIDEO_PIFE_RULES.bet, t('br.pickDiscard'));
  }

  rules() {
    return t('br.rules.videopife');
  }

  protected spotDefs(): SpotDef[] {
    return [{ id: 'BET', label: t('br.bet'), u: 0.5, v: 0.77, size: 0.58, max: VIDEO_PIFE_RULES.bet.max }];
  }

  protected defaultBets() {
    return { BET: 25 };
  }

  protected decorate() {
    const rows = [...VP_CLASSES].reverse().map((c) => [t(`br.cls.${c}`), vpReturnMultiplier(c) ? `${vpReturnMultiplier(c)}×` : '—']);
    this.paytable = new Paytable(this.g.hud.root, 'VIDEO PIFE', rows);
  }

  protected createRound(env: RoundEnv, snap?: Snapshot<string, object>) {
    const r = new VideoPifeRound(env, VIDEO_PIFE_RULES, snap as never, snap ? undefined : (this.rig ?? undefined));
    this.rig = null;
    return r;
  }

  protected advice() {
    const r = this.round;
    if (!r || r.state !== 'HOLD_DECISION') return null;
    const a = videoPifeAdvice(r.cards, cryptoRng, 60);
    this.picker.set(a.discard);
    return a.discard.length ? { id: 'draw', msg: t('br.h.draw') } : { id: 'stand', msg: t('br.h.keep') };
  }

  protected async runRound(r: VideoPifeRound, fresh: boolean) {
    if (fresh) r.placeBet(this.spots.amounts().BET);
    this.paytable?.show(true);
    this.paytable?.highlight(null);
    const P = this.slots(0.5, 0.52, 9, 0.4);
    const p3: Card3D[] = [];
    for (let i = 0; i < 9; i++) p3.push(await this.cardsT.deal(r.cards[i], P[i], true, { dur: 0.32 }));
    const { id, picked } = await this.pickCards(p3, 3, [
      { id: 'stand', label: t('br.stand'), color: 'blue', icon: 'knock' },
      { id: 'draw', label: t('br.drawBtn'), color: 'green', icon: 'redo', needs: true },
    ], t('br.drawHint', { n: 3 }));
    r.draw(id === 'draw' ? picked : []);
    for (const d of r.data.discards) await this.replace(p3, d.index, r.cardOf(d.replacement), P[d.index]);
    const e = r.result!;
    this.paytable?.highlight(VP_CLASSES.length - 1 - VP_CLASSES.indexOf(r.cls!));
    this.tag(t(`br.cls.${r.cls}`), r.outcome === 'WIN' ? 'win' : '', 0, P[0].pos.z - 0.56);
    this.glow(e.groups.flatMap((g) => g.cards.map((i) => p3[i])));
    await wait(0.5);
    if (r.cls === 'DOUBLE_SET' || r.cls === 'PERFECT_PIFE') this.g.trophy('paid');
    await this.settleChips(r, r.cls === 'PERFECT_PIFE' ? t('br.cls.PERFECT_PIFE').toUpperCase() : undefined);
    this.paytable?.highlight(null);
  }
}

// ------------------------------------------------------------------ Canastra Draw
export class CanastraDrawView extends BrazilTable<CanastraDrawRound> {
  readonly id = 'canastradraw';
  readonly title = 'Canastra Draw';
  protected readonly felt = 'canastradraw' as const;

  constructor(g: GameCtx) {
    super(g, MODE_CANASTRA_DRAW, CANASTRA_DRAW_RULES.ante, t('br.pickDiscard'));
  }

  rules() {
    return t('br.rules.canastradraw');
  }

  protected decorate() {
    this.g.table.addDecal(tablePrint([{ text: 'CANASTRA DRAW', y: 60, R: 1300, font: FONT.title(54), spacing: 6 }, { text: 'CLEAN 3 TO 1 · DIRTY 2 TO 1 · RUNS 1 TO 1', y: 112, R: 1300, font: FONT.title(22), color: GOLD, spacing: 3 }], 140), 0.5, 0.4, 2.9);
  }

  protected createRound(env: RoundEnv, snap?: Snapshot<string, object>) {
    const r = new CanastraDrawRound(env, CANASTRA_DRAW_RULES, snap as never, snap ? undefined : (this.rig ?? undefined));
    this.rig = null;
    return r;
  }

  protected advice() {
    const r = this.round;
    if (!r || r.state !== 'DRAW_DECISION') return null;
    const d = canastraDealerDiscards(r.playerCards, 3);
    this.picker.set(d);
    return d.length ? { id: 'draw', msg: t('br.h.draw') } : { id: 'stand', msg: t('br.h.keep') };
  }

  protected async runRound(r: CanastraDrawRound, fresh: boolean) {
    if (fresh) r.placeAnte(this.spots.amounts().ANTE);
    const P = this.slots(0.5, 0.6, 9, 0.4);
    const D = this.slots(0.5, 0.17, 9, 0.27);
    const p3: Card3D[] = [];
    const d3: Card3D[] = [];
    for (let i = 0; i < 9; i++) {
      p3.push(await this.cardsT.deal(r.playerCards[i], P[i], true, { dur: 0.3 }));
      d3.push(await this.cardsT.deal(null, D[i], false, { dur: 0.3 }));
    }
    const { id, picked } = await this.pickCards(p3, 3, [
      { id: 'stand', label: t('br.stand'), color: 'blue', icon: 'knock' },
      { id: 'draw', label: t('br.drawBtn'), color: 'green', icon: 'redo', needs: true },
    ], t('br.drawHint', { n: 3 }));
    r.draw(id === 'draw' ? picked : []);
    for (const d of r.data.playerDiscards) await this.replace(p3, d.index, r.cardOf(d.replacement), P[d.index]);
    if (r.dealerDiscardCount) this.g.hud.toast(t('br.dealerDraws', { n: r.dealerDiscardCount }), 1400);
    for (const d of r.data.dealerDiscards) await this.replace(d3, d.index, null, D[d.index]);
    const dc = r.dealerCards!;
    for (let i = 0; i < 9; i++) {
      d3[i].setCard(dc[i]);
      this.cardsT.flip(d3[i], 0.36);
      await wait(0.05);
    }
    await wait(0.4);
    const pb = r.playerBest!;
    const db = r.dealerBest!;
    const label = (s: typeof pb) => (s.cls === 'NO_SEQUENCE' ? t('br.cls.NO_SEQUENCE') : t('br.seq', { cls: t(`br.cls.${s.cls}`), n: s.length }));
    this.tag(label(pb), r.outcome === 'WIN' ? 'win' : '', 0, P[0].pos.z - 0.56);
    this.tag(label(db), 'dealer', 0, D[0].pos.z + 0.55);
    this.glow(pb.cards.map((i) => p3[i]));
    this.glow(db.cards.map((i) => d3[i]), '#9fd0ff');
    await wait(0.5);
    const big = pb.cls === 'CLEAN_CANASTRA' || pb.cls === 'DIRTY_CANASTRA' ? t(`br.cls.${pb.cls}`).toUpperCase() : undefined;
    await this.settleChips(r, big);
  }
}
