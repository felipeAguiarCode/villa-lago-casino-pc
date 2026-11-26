import gsap from 'gsap';
import * as THREE from 'three';
import { rankLabel, rankOf, type Card } from '../../core/cards';
import { addStrings, t } from '../../core/i18n';
import { cryptoRng } from '../../core/rng';
import { collectCards, slideCard, wait } from '../../table/anim';
import { type Card3D } from '../../table/cardMesh';
import { FONT, GOLD, INK_SOFT } from '../../table/prints';
import type { Pin } from '../../ui/hud';
import { highlightCards, type SpotDef } from '../kit';
import { TableGame } from '../tableGame';
import type { GameCtx } from '../types';
import { HL, HL_SIDES, HlDeck, hlBoard, settleHl, type HlBoard, type HlSide } from './rules';
import { DeckStack, feltKey, fitPrint, fitText, goldFrame, liftTurnLand, PPU, unitCanvas, uvAt } from './tableKit';

addStrings(
  {
    'hl.high': 'HIGH',
    'hl.low': 'LOW',
    'hl.same': 'SAME',
    'hl.print1': 'HIGH & LOW',
    'hl.print2': 'Higher or lower than the card showing? · Aces are high',
    'hl.thisCard': 'THIS CARD',
    'hl.nextCard': 'NEXT CARD',
    'hl.foot1': 'TIES LOSE HIGH AND LOW',
    'hl.foot2': 'Same rank pays 11 to 1 · Payouts follow the cards left',
    'hl.needBet': 'Bet HIGH, LOW or SAME',
    'hl.closed': '{side} is closed on this card',
    'hl.wait': 'The dealer is turning the card…',
    'hl.big': 'SAME!',
    'hl.rules': `
      <p>One card lies face up. Bet on the <b>next card</b> from the deck: <b>High</b> (a higher rank), <b>Low</b> (a lower rank) and/or the <b>Same</b> rank. Aces are high and 2 is the lowest; suits don't matter.</p>
      <h4>Payouts</h4>
      <p>High and Low pay what their box shows: a <b>total return</b> (your stake included), worked out from the cards still in the deck, so the less likely side pays more. A tie loses both. <b>Same</b> pays 11:1.</p>
      <p>A side that can't win — High on an Ace, Low on a 2 — is closed (—).</p>
      <h4>The deck</h4>
      <p>One deck of 52 cards. The card that comes out becomes the card for the next round. The deck is reshuffled when fewer than 12 cards are left.</p>`,
  },
  {
    'hl.high': 'MAIOR',
    'hl.low': 'MENOR',
    'hl.same': 'IGUAL',
    'hl.print2': 'Maior ou menor que a carta aberta? · Ás é a maior',
    'hl.thisCard': 'ESTA CARTA',
    'hl.nextCard': 'PRÓXIMA',
    'hl.foot1': 'EMPATE PERDE MAIOR E MENOR',
    'hl.foot2': 'Igual paga 11 para 1 · O pagamento segue as cartas restantes',
    'hl.needBet': 'Aposte em MAIOR, MENOR ou IGUAL',
    'hl.closed': '{side} está fechada nesta carta',
    'hl.wait': 'O dealer está virando a carta…',
    'hl.big': 'IGUAL!',
    'hl.rules': `
      <p>Uma carta fica aberta. Aposte na <b>próxima carta</b> do baralho: <b>Maior</b> (valor mais alto), <b>Menor</b> (valor mais baixo) e/ou <b>Igual</b> (mesmo valor). Ás é a maior e 2 a menor; naipes não contam.</p>
      <h4>Pagamentos</h4>
      <p>Maior e Menor pagam o que a caixa mostra: o <b>retorno total</b> (aposta incluída), calculado com as cartas que ainda estão no baralho, então o lado menos provável paga mais. Empate perde os dois. <b>Igual</b> paga 11:1.</p>
      <p>O lado que não pode ganhar — Maior num Ás, Menor num 2 — fica fechado (—).</p>
      <h4>O baralho</h4>
      <p>Um baralho de 52 cartas. A carta que sai vira a carta da próxima rodada. O baralho é embaralhado quando restam menos de 12 cartas.</p>`,
  },
);

/** Frame row (v) of the cards; everything else is laid out from it in table units. */
const V_CARDS = 0.45;

interface Lay {
  /** z of the cards row. */
  cz: number;
  cur: THREE.Vector3;
  deck: THREE.Vector3;
  /** |x| of the box centres, box width and height. */
  bx: number;
  bw: number;
  bh: number;
  /** Chips sit this far below the box centre. */
  pileDz: number;
  same: THREE.Vector3;
}

const CARD_DX = 0.45;

/** HIGH / LOW betting box: label, a big arrow and the chip place. */
function boxPrint(L: Lay, label: string, up: boolean): HTMLCanvasElement {
  const { cv, g, W, H } = unitCanvas(L.bw, L.bh);
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, 'rgba(0,0,0,0.08)');
  grd.addColorStop(1, 'rgba(0,0,0,0.28)');
  goldFrame(g, 6, 6, W - 12, H - 12, 0.12 * PPU, grd);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = GOLD;
  fitText(g, label, W / 2, 0.36 * PPU, W - 0.22 * PPU, FONT.title, 0.3 * PPU, 6);
  // the arrow
  const cx = W / 2;
  const cy = 0.82 * PPU;
  const aw = Math.min(W * 0.62, 0.78 * PPU);
  const ah = 0.56 * PPU;
  const s = up ? 1 : -1;
  const tip = cy - (s * ah) / 2;
  const base = cy + (s * ah) / 2;
  const neck = tip + s * ah * 0.52;
  const shaft = aw * 0.42;
  g.beginPath();
  g.moveTo(cx, tip);
  g.lineTo(cx + aw / 2, neck);
  g.lineTo(cx + shaft / 2, neck);
  g.lineTo(cx + shaft / 2, base);
  g.lineTo(cx - shaft / 2, base);
  g.lineTo(cx - shaft / 2, neck);
  g.lineTo(cx - aw / 2, neck);
  g.closePath();
  const ag = g.createLinearGradient(0, cy - ah / 2, 0, cy + ah / 2);
  ag.addColorStop(0, up ? '#f6e08e' : '#a07a2c');
  ag.addColorStop(1, up ? '#a07a2c' : '#f6e08e');
  g.globalAlpha = 0.88;
  g.fillStyle = ag;
  g.fill();
  g.globalAlpha = 1;
  g.lineWidth = 4;
  g.strokeStyle = 'rgba(255,240,190,.8)';
  g.stroke();
  // the chip place
  const py = (L.bh / 2 + L.pileDz) * PPU;
  g.globalAlpha = 0.5;
  g.strokeStyle = GOLD;
  g.lineWidth = 3;
  g.setLineDash([12, 9]);
  g.beginPath();
  g.arc(cx, py, 0.29 * PPU, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  return cv;
}

/** Outlines of the two card places with their names. */
function slotsPrint(labels: [string, string]): HTMLCanvasElement {
  const w = 2.0;
  const { cv, g } = unitCanvas(w, 1.42);
  const cy = 0.55 * PPU;
  [-CARD_DX, CARD_DX].forEach((x, i) => {
    const cx = (w / 2 + x) * PPU;
    g.save();
    g.strokeStyle = GOLD;
    g.globalAlpha = 0.6;
    g.lineWidth = 4;
    if (i) g.setLineDash([14, 10]);
    g.beginPath();
    g.roundRect(cx - 0.365 * PPU, cy - 0.485 * PPU, 0.73 * PPU, 0.97 * PPU, 0.07 * PPU);
    g.stroke();
    g.restore();
    g.fillStyle = GOLD;
    g.globalAlpha = 0.9;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    fitText(g, labels[i], cx, (0.55 + 0.485 + 0.16) * PPU, 0.74 * PPU, FONT.title, 0.1 * PPU, 2);
  });
  return cv;
}

export class HighLowView extends TableGame {
  readonly id = 'highlow';
  readonly title = 'High & Low';
  protected readonly felt = feltKey('highlow', 'russian');
  private deck = new HlDeck(cryptoRng);
  /** The card face up on the table (the one bet against). */
  private cur: Card | null = null;
  /** Multipliers of the round being bet (0 = closed). */
  private board: HlBoard = { high: 0, low: 0, same: 0 };
  private L!: Lay;
  private stack: DeckStack | null = null;
  private cur3: Card3D | null = null;
  /** The card turned over this round, lying on the deck until it is carried over. */
  private next3: Card3D | null = null;
  private pins: Partial<Record<HlSide, Pin>> = {};
  private boxes: Partial<Record<HlSide, THREE.Mesh>> = {};
  private ready = false;
  private prep: Promise<void> | null = null;
  /** Bumped on exit: a table preparation still running from before stops. */
  private gen = 0;
  private reshufflePending = false;
  private discarded = 0;
  private pinAt = new THREE.Vector3();

  constructor(g: GameCtx) {
    super(g, 1);
  }

  rules() {
    return t('hl.rules');
  }

  private layout(): Lay {
    const { stage } = this.g;
    const A = stage.screenToTable(0.5, V_CARDS);
    const edge = stage.screenToTable(0.955, V_CARDS).x;
    const inner = CARD_DX + 0.33;
    const avail = edge - inner;
    const bw = Math.min(1.4, Math.max(0.85, avail - 0.3));
    const gap = Math.min(0.5, Math.max(0.12, (avail - bw) * 0.6));
    const bh = 1.9;
    this.L = {
      cz: A.z,
      cur: new THREE.Vector3(-CARD_DX, 0.006, A.z),
      deck: new THREE.Vector3(CARD_DX, 0, A.z),
      bx: inner + gap + bw / 2,
      bw,
      bh,
      pileDz: 0.5,
      same: new THREE.Vector3(0, 0, A.z + 1.25),
    };
    return this.L;
  }

  protected spotDefs(): SpotDef[] {
    const L = this.layout();
    const pz = L.cz + L.pileDz;
    const hi = uvAt(this.g, -L.bx, pz);
    const lo = uvAt(this.g, L.bx, pz);
    const sm = uvAt(this.g, L.same.x, L.same.z);
    const hitH = 2 * (L.bh / 2 - L.pileDz);
    return [
      { id: 'high', label: t('hl.high'), u: hi.u, v: hi.v, ring: false, hitW: L.bw, hitH, max: HL.maxBet },
      { id: 'low', label: t('hl.low'), u: lo.u, v: lo.v, ring: false, hitW: L.bw, hitH, max: HL.maxBet },
      { id: 'same', label: t('hl.same'), sub: '11:1', u: sm.u, v: sm.v, size: 0.6, max: HL.sameMax },
    ];
  }

  protected defaultBets() {
    const b = this.board;
    const side: HlSide = b.high && (!b.low || b.high <= b.low) ? 'high' : 'low';
    return { [side]: 25 };
  }

  protected decorate() {
    const { table, stage, hud, cards } = this.g;
    const L = this.L;
    table.addDecalAt(
      fitPrint(
        [
          { text: t('hl.print1'), y: 104, R: 2400, px: 92, font: FONT.title, color: GOLD, spacing: 10 },
          { text: t('hl.print2'), y: 168, R: 2400, px: 40, font: FONT.italic, color: INK_SOFT },
        ],
        196,
      ),
      0,
      L.cz - 1.64,
      3.7,
    );
    this.boxes.high = table.addDecalAt(boxPrint(L, t('hl.high'), true), -L.bx, L.cz, L.bw);
    this.boxes.low = table.addDecalAt(boxPrint(L, t('hl.low'), false), L.bx, L.cz, L.bw);
    table.addDecalAt(slotsPrint([t('hl.thisCard'), t('hl.nextCard')]), 0, L.cz + 0.16, 2.0);
    table.addDecalAt(
      fitPrint(
        [
          { text: t('hl.foot1'), y: 62, R: 3000, px: 40, font: FONT.title, color: GOLD, spacing: 6 },
          { text: t('hl.foot2'), y: 124, R: 3000, px: 36, font: FONT.italic, color: INK_SOFT },
        ],
        142,
        [{ y: 82, R: 3000, half: 0.1 }],
      ),
      0,
      L.cz + 2.02,
      3.7,
    );
    for (const p of Object.values(this.pins)) p?.remove();
    for (const s of HL_SIDES) {
      const p = hud.pin('handtag');
      p.show(false);
      this.pins[s] = p;
    }
    // a fresh deck and the first card for this visit
    if (this.cur === null) {
      this.deck.reshuffle();
      this.cur = this.deck.draw();
      this.board = hlBoard(this.cur, this.deck.left);
    }
    this.stack?.dispose();
    this.stack = new DeckStack(stage.table, cards.backTexture, L.deck);
    this.stack.setCount(this.deck.remaining + (this.cur3 ? 0 : 1));
    this.stack.group.visible = false;
  }

  protected cleanup() {
    this.gen++;
    this.prep = null;
    this.ready = false;
    for (const c of [this.cur3, this.next3]) if (c) this.g.cards.destroy(c);
    this.cur3 = null;
    this.next3 = null;
    this.stack?.dispose();
    this.stack = null;
    for (const p of Object.values(this.pins)) p?.remove();
    this.pins = {};
    this.boxes = {};
    this.cur = null;
    this.reshufflePending = false;
    this.discarded = 0;
  }

  private sideName(s: HlSide) {
    return t(`hl.${s}`);
  }

  protected validate() {
    if (!this.ready) return t('hl.wait');
    const a = this.spots.amounts();
    for (const s of HL_SIDES) if ((a[s] ?? 0) > 0 && !this.board[s]) return t('hl.closed', { side: this.sideName(s) });
    if (this.spots.total < HL.minBet) return t('hl.needBet');
    return '';
  }

  protected onSpotClick(id: string) {
    const s = id as HlSide;
    if (this.phase === 'betting' && this.board[s] === 0) {
      this.g.hud.toast(t('hl.closed', { side: this.sideName(s) }));
      const open = HL_SIDES.find((x) => this.board[x]);
      if (open) this.spots.active = open;
    }
    super.onSpotClick(id);
  }

  protected toBetting() {
    // bets can't be restored on a side that is closed for the new card
    for (const s of HL_SIDES) if (!this.board[s]) delete this.last[s];
    this.ready = false;
    super.toBetting();
    if (this.spots && !this.board[this.spots.active as HlSide]) this.spots.active = HL_SIDES.find((x) => this.board[x]) ?? this.spots.active;
    const gen = this.gen;
    this.prep = this.prepare(gen)
      .catch((e) => console.error(e))
      .finally(() => {
        if (gen !== this.gen) return;
        this.prep = null;
        this.ready = true;
        if (this.phase === 'betting') this.refreshBetUi();
      });
  }

  /**
   * Gets the table ready for the next bet: the deck comes out (first round), the card turned last
   * round takes the place of the old one (which goes to the tray), the deck is reshuffled when it
   * ran low, and the boxes show the new payouts.
   */
  private async prepare(gen: number) {
    const { cards, table, sfx, hud } = this.g;
    const L = this.L;
    const live = () => gen === this.gen && !!this.stack;
    for (const p of Object.values(this.pins)) p?.show(false);
    if (!this.stack) return;
    if (!this.stack.group.visible) {
      sfx.play('shove', { vol: 0.6 });
      await this.stack.arrive(table.shoeMouth(), L.deck);
      if (!live()) return;
    }
    if (this.next3) {
      const old = this.cur3;
      this.cur3 = this.next3;
      this.next3 = null;
      if (old) {
        sfx.play('shove', { vol: 0.5 });
        void collectCards([old], table.trayTop(), table.trayYaw, (c) => {
          cards.destroy(c);
          if (gen !== this.gen) return;
          this.discarded++;
          table.setTrayFill(Math.min(1, this.discarded / 40));
        });
        await wait(0.2);
        if (!live()) return;
      }
      sfx.play('slide', { vol: 0.6 });
      await slideCard(this.cur3, { pos: L.cur.clone(), yaw: 0 }, 0.42, 0.08);
      if (!live()) return;
    }
    if (this.reshufflePending) {
      this.reshufflePending = false;
      hud.toast(t('toast.shuffling'), 1500);
      await wait(0.35);
      if (!live()) return;
      this.discarded = 0;
      table.setTrayFill(0);
      sfx.play('shove', { vol: 0.6 });
      const n = { v: this.stack.count };
      await gsap.to(n, { v: this.deck.remaining, duration: 0.45, ease: 'power2.out', onUpdate: () => this.stack?.setCount(Math.round(n.v)) });
      if (!live()) return;
      await this.stack.riffle(() => sfx.play('shuffle', { vol: 0.8 }));
      if (!live()) return;
      await this.stack.riffle(() => sfx.play('shuffle', { vol: 0.65 }), 0.7);
      if (!live()) return;
    }
    if (!this.cur3 && this.cur !== null) {
      const c = cards.create(this.cur);
      this.cur3 = c;
      const from = this.stack.top();
      this.stack.setCount(this.deck.remaining);
      sfx.play('slide', { vol: 0.6 });
      await liftTurnLand(c, from, L.cur.clone(), {
        dur: 0.9,
        lift: 0.45,
        onTurn: () => sfx.play('fan', { vol: 0.5 }),
        onLand: () => sfx.play('place', { vol: 0.6 }),
      });
      if (!live()) return;
    }
    this.stack.setCount(this.deck.remaining);
    this.showBoard();
  }

  /** Payout pins on the boxes; closed sides show "—" and their box dims. */
  private showBoard() {
    for (const s of HL_SIDES) {
      const m = this.board[s];
      const pin = this.pins[s];
      pin?.set(m ? `×${m.toFixed(2)}` : '—', m ? 'handtag' : 'handtag lose');
      pin?.pop();
      pin?.show(true);
      const box = this.boxes[s];
      if (box) {
        const mat = box.material as THREE.MeshStandardMaterial;
        gsap.to(mat, { opacity: m ? 1 : 0.35, duration: 0.4, ease: 'power2.out' });
      }
    }
    const ring = this.spots.spots.get('same')?.ring;
    if (ring) gsap.to(ring.material as THREE.MeshStandardMaterial, { opacity: this.board.same ? 1 : 0.35, duration: 0.4 });
  }

  protected onSync() {
    const L = this.L;
    if (!L) return;
    for (const s of HL_SIDES) {
      const pin = this.pins[s];
      if (!pin) continue;
      if (s === 'same') this.pinAt.set(L.same.x + 0.68, 0, L.same.z);
      else this.pinAt.set(s === 'high' ? -L.bx : L.bx, 0, L.cz - L.bh / 2);
      const p = this.g.stage.toScreen(this.pinAt);
      pin.place(p.x, p.y);
    }
  }

  protected async playRound() {
    if (this.prep) await this.prep;
    const { cards, sfx, fx } = this.g;
    const L = this.L;
    const stack = this.stack!;
    const bets = this.spots.amounts() as Partial<Record<HlSide, number>>;
    const cur = this.cur!;
    const board = { ...this.board };
    const next = this.deck.draw();
    // the top card is lifted off the deck, turned over in the air and laid back on it face up
    const c = cards.create(next);
    const from = stack.top();
    stack.setCount(this.deck.remaining);
    sfx.play('slide', { vol: 0.6 });
    await liftTurnLand(c, from, stack.top(0.004), {
      dur: 1.05,
      lift: 0.6,
      sway: 0.16,
      onTurn: () => sfx.play('fan', { vol: 0.55 }),
      onLand: () => sfx.play('place', { vol: 0.7 }),
    });
    this.next3 = c;
    const res = settleHl(cur, next, bets, board);
    const won = res.ret[res.result] > 0;
    this.tag(`${rankLabel(rankOf(cur))} → ${rankLabel(rankOf(next))} · ${this.sideName(res.result)}`, won ? 'win' : '', 0, L.cz - 0.62);
    const at = res.result === 'same' ? L.same.clone() : new THREE.Vector3(res.result === 'high' ? -L.bx : L.bx, 0, L.cz);
    if (res.result === 'same') fx.glow(at, 1.0, 1.0, 1.8);
    else fx.glow(at, L.bw * 1.08, L.bh * 1.04, 1.8);
    const pin = this.pins[res.result];
    if (pin && board[res.result]) {
      pin.set(pin.el.textContent ?? '', 'handtag win');
      pin.pop();
    }
    if (won) {
      highlightCards(this.g, [c]);
      fx.burst(at.clone().setY(0.3), res.result === 'same' ? 150 : 80);
    }
    // the new card stays for the next round; the deck is reshuffled when it runs low
    this.cur = next;
    if (this.deck.needsShuffle(next)) {
      this.deck.reshuffle([next]);
      this.reshufflePending = true;
    }
    this.board = hlBoard(next, this.deck.left);
    await this.settle(res.ret, { big: res.ret.same > 0 ? t('hl.big') : undefined });
  }
}
