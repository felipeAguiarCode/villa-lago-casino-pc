import * as THREE from 'three';
import gsap from 'gsap';
import { addStrings, t } from '../../core/i18n';
import { cryptoRng } from '../../core/rng';
import { money } from '../../core/wallet';
import { collectCards, peekCard, shake, slideCard, slideChips, wait, type Place } from '../../table/anim';
import { CARD_H, REST_Y, type Card3D } from '../../table/cardMesh';
import { cardDataURL } from '../../table/cardFaces';
import { ChipPile } from '../../table/chips';
import type { Pin } from '../../ui/hud';
import type { SpotDef } from '../kit';
import { TableGame } from '../tableGame';
import type { GameCtx } from '../types';
// Trump 21's card art and its strings (the trump names, tr.*)
import { trumpFace } from '../trump21/view';
import { rarityOf, type TrumpId } from '../trump21/rules';
import { bindTrump, centreIn, flyBonusTrump, trumpInner, type TrumpCardInfo } from '../trump21/trumpUi';
import { drawMindset, newMemory, remember, thinkTime, type AiMemory, type Mindset } from '../partybj/mindset';
import { boxWidth, glowPlate, PARTY_COLORS as COLORS, partyPlate, partyPrint, seatBox, setPlateName, type Plate } from '../partybj/partyKit';
import type { AiProfile } from '../partybj/rules';
import { drawRegulars, replacementFor } from '../partybj/roster';
import { aiStake, aiTurn, closeCall, seatView } from './ai';
import { cardPlace, dealerX, LY, onTable, PLAYER_SEAT, RING, seatLayout, type SeatGeo } from './layout';
import { DEALER, DEALER_POOL, isAttack, PartyDuel, PX, SEAT_POOL, SHIFT, targetMove, WILD, wildTargets, type PxEvent, type SeatResult, type Who } from './rules';

addStrings(
  {
    'px.print1': 'PARTY TRUMP 21',
    'px.print2': 'TIES GO TO THE DEALER',
    'px.print3': 'DEALER STANDS 3 UNDER THE TARGET',
    'px.tagline': 'Five seats · Trump cards',
    'px.bet': 'BET',
    'px.raise': '×2',
    'px.needBet': 'Place your BET',
    'px.target': 'TARGET',
    'px.trumps': 'TRUMPS',
    'px.hole': 'Hole card',
    'px.next': 'Next card',
    'px.frozen': 'FROZEN',
    'px.blind': 'BLINDFOLDED',
    'px.hit': 'Hit',
    'px.stand': 'Stand',
    'px.over': 'Over!',
    'px.win': 'Win',
    'px.lose': 'Lose',
    'px.refund': 'Saved',
    'px.busted': 'Busted!',
    'px.newcomer': 'New player',
    'px.answer': 'Answers…',
    'px.answerYou': 'The dealer hit your hand: your move',
    'px.dealerPlays': 'Dealer plays {name}',
    'px.dealerOn': 'Dealer plays {name} on {seat}',
    'px.dealerStands': 'Stands',
    'px.gain': 'New trump: {name}',
    'px.lost': 'The dealer destroyed your {name}',
    'px.stole': 'You stole {name}',
    'px.shattered': "The dealer's {name} is destroyed",
    'px.targetIs': 'Target {n}',
    'px.peeks': 'Peeks',
    'px.foresees': 'Sees the top card',
    'px.shuffled': 'The shoe was reshuffled',
    'px.frozenToast': 'The dealer is frozen: one card at most',
    'px.blindToast': "The dealer can't play trumps this round",
    'px.hintHit': 'The odds favour another card: HIT',
    'px.hintStand': 'Standing is better: STAND',
    'px.hintTrump': 'Play {name} now',
    'px.noFunds': 'Not enough chips for Stakes Up',
    'px.dealerOnly': 'the dealer can use it too',
    'px.codex': 'All trump cards',
    'px.tr.precision.d': 'Draw the best of the next three cards for your hand',
    'px.tr.feather.d': 'Draw the lowest of the next three cards',
    'px.tr.recall.d': 'Return your last card to the shoe',
    'px.tr.redraw.d': 'Draw a new card, then return your previous last card to the shoe',
    'px.tr.glimpse.d': "Peek at the dealer's hole card (only you see it)",
    'px.tr.foresight.d': 'See the top card of the shoe',
    'px.tr.reshuffle.d': 'Shuffle the cards left in the shoe',
    'px.tr.burn.d': "Send the dealer's last card back to the shoe (the whole table feels it)",
    'px.tr.switch.d': "Swap your last card with the dealer's last card",
    'px.tr.force.d': 'The dealer must take the top card now',
    'px.tr.freeze.d': 'The dealer may draw only one card on its turn',
    'px.tr.shatter.d': "Destroy one of the dealer's trumps",
    'px.tr.pickpocket.d': "Steal one of the dealer's trumps",
    'px.tr.blindfold.d': "The dealer can't play trumps this round",
    'px.tr.lighten.d': 'Return your highest card to the shoe',
    'px.tr.heist.d': "Take the dealer's last card into your hand (the whole table feels it)",
    'px.tr.gift.d': 'Give your last card to the dealer (the whole table feels it)',
    'px.tr.overload.d': 'The dealer takes the top two cards of the shoe now',
    'px.tr.rewind.d': 'You and the dealer each return your last card to the shoe',
    'px.tr.barrier.d': 'Blocks the next dealer trump aimed at you this round',
    'px.tr.tiebreak.d': 'Ties with the dealer go to you this round',
    'px.tr.bullseye.d': 'Win right on your target this round and it pays 3 to 1',
    'px.bonusToast': '{name}: bonus trump! HIT again for your card',
    'px.blocked': 'Barrier! {name} was blocked',
    'px.blockedSay': 'Blocked!',
    'px.tr.reset21.d': "Your target becomes 21, and the dealer's target cards no longer move it",
    'px.tr.line.d': 'Your own target becomes {n} this round',
    'px.tr.wild.d': 'Your own target becomes a random number from {lo} to {hi}',
    'px.tr.shift.d': 'Your own target moves {d} ({lo} to {hi})',
    'px.tr.lineName': 'Line {n}',
    'px.tr.wildName': 'Wild Line',
    'px.tr.upName': 'Line +2',
    'px.tr.downName': 'Line −2',
    'px.rules': `
      <p>Trump 21 at a full table: you and four regulars each play your own hand against the same dealer, with your own trump cards. The cards are numbered <b>1 to 11</b>; the shoe holds <b>five decks</b> of them (55 cards), shuffled fresh every round.</p>
      <h4>The deal</h4>
      <p>From first base (the dealer's left, on your right) each seat gets a private card, then the dealer's hole card, a second card face up to every seat and the dealer's up card. The regulars' private cards stay face down; the dealer and the regulars play as if they can't see yours.</p>
      <h4>Turns</h4>
      <p>The seats play in order, first base to third base. On your turn play trumps at any time, <b>hit</b> as often as you like and <b>stand</b> to finish. Going over your target doesn't end your hand: a trump may still save it. Then the dealer turns its hole card over and plays. When one of the dealer's trumps hits your hand (Force Draw, Burn) you answer at once with a short turn.</p>
      <h4>Targets and winning</h4>
      <p>The table target is <b>21</b>; only the dealer's target cards move it. A target card you play (Line 15 to 30, Reset 21, Line +2 or −2, or Wild Line, which draws a number from 16 to 28) gives <b>you</b> a target of your own for the round, and the dealer's target cards no longer move it. Every seat is compared with the dealer on its own: the hand closer to its own target without going over wins <b>1:1</b>; over the target loses to a hand that isn't; if both are over, the smaller overshoot wins. <b>Ties go to the dealer</b> (the house's edge).</p>
      <h4>The dealer</h4>
      <p>The dealer draws while it is more than 3 under the table target (under 18 at 21) and stands from there; frozen, it draws one card at most. At each decision it plays the first trump that fits: over the target, Recall or the tightest higher target card (Wild Line when it saves it at least half the time); it shatters the trumps of a seat holding three or more; with a total that fits a lower target it plays it when most of the money on table-target seats shows more; it forces a card on the seat most likely to bust from it, and burns the last card (6 or more) of the biggest stake beating it; otherwise it improves its hand with Precision or a Call. It reads each seat as its face-up cards plus 6. It is dealt <b>two trumps every round</b> (it faces five hands); its hand holds five, and a new one replaces its oldest.</p>
      <h4>Trump cards</h4>
      <p>Each seat holds up to five trumps, kept between rounds: one every deal, and about one hit in five turns up a <b>bonus trump</b> instead of the card. The bonus joins your hand with its own sound, your turn goes on and your next hit is a sure card, so it never costs you your draw. Click a trump to play it; <b>point at it with the mouse to read what it does</b> (on a touch screen, hold it).</p>
      <p>Your own trumps change only your hand, your target and your stake. Trumps against the dealer (Burn, Switch, Force Draw, Freeze, Shatter, Pickpocket, Blindfold, Heist, Gift, Rewind) change the dealer's hand or trumps for <b>the whole table</b>, so the regulars can help or hurt everyone's chances. Overload (two cards for the dealer) is a single-table card: it isn't dealt here. At this table Precision and Feather choose from the next three cards, Glimpse is a private peek, and Freeze lets the dealer draw only one card. Stakes Up doubles your bet; Guard gives half back on a loss, Fortress all of it; Bounty pays a win 2 to 1, Bullseye 3 to 1 right on your target; Tiebreaker gives you the ties; a Barrier blocks the next dealer trump aimed at you.</p>
      <h4>The regulars</h4>
      <p>Regulars from the Villa Lago circuit sit in with you, a different crowd at every visit. Each has a temperament of their own, but nobody plays every hand the same way: one hand they read every card left in the shoe, the next they press, play it safe or follow a hunch. Watch their bets, their trumps and their moves; what they are thinking, they keep to themselves. When one goes broke they leave, and someone new pulls up a chair. They bet 10–200 of their own chips; only your bets touch your bankroll.</p>
      <h4>Hint</h4>
      <p>The light bulb shows the move with the best odds, trumps included.</p>`,
  },
  {
    'px.print2': 'EMPATE É DO DEALER',
    'px.print3': 'O DEALER PARA A 3 DO ALVO',
    'px.tagline': 'Cinco lugares · Trunfos',
    'px.bet': 'APOSTA',
    'px.needBet': 'Faça sua APOSTA',
    'px.target': 'ALVO',
    'px.trumps': 'TRUNFOS',
    'px.hole': 'Carta fechada',
    'px.next': 'Próxima carta',
    'px.frozen': 'CONGELADO',
    'px.blind': 'VENDADO',
    'px.hit': 'Pede',
    'px.stand': 'Para',
    'px.over': 'Passou!',
    'px.win': 'Ganhou',
    'px.lose': 'Perdeu',
    'px.refund': 'Salvo',
    'px.busted': 'Quebrou!',
    'px.newcomer': 'Chegou',
    'px.answer': 'Responde…',
    'px.answerYou': 'O dealer mexeu na sua mão: sua vez',
    'px.dealerPlays': 'Dealer usa {name}',
    'px.dealerOn': 'Dealer usa {name} em {seat}',
    'px.dealerStands': 'Para',
    'px.gain': 'Novo trunfo: {name}',
    'px.lost': 'O dealer destruiu seu {name}',
    'px.stole': 'Você roubou {name}',
    'px.shattered': '{name} do dealer destruído',
    'px.targetIs': 'Alvo {n}',
    'px.peeks': 'Espia',
    'px.foresees': 'Vê a carta do topo',
    'px.shuffled': 'O sapato foi reembaralhado',
    'px.frozenToast': 'O dealer está congelado: uma carta no máximo',
    'px.blindToast': 'O dealer não pode usar trunfos nesta rodada',
    'px.hintHit': 'As chances favorecem mais uma carta: PEDIR',
    'px.hintStand': 'Parar é melhor: PARAR',
    'px.hintTrump': 'Use {name} agora',
    'px.noFunds': 'Fichas insuficientes para o Dobro',
    'px.dealerOnly': 'o dealer também usa',
    'px.codex': 'Todos os trunfos',
    'px.tr.precision.d': 'Compra a melhor das próximas três cartas para a sua mão',
    'px.tr.feather.d': 'Compra a menor das próximas três cartas',
    'px.tr.recall.d': 'Devolve sua última carta ao sapato',
    'px.tr.redraw.d': 'Compra uma carta nova e devolve a sua última carta anterior ao sapato',
    'px.tr.glimpse.d': 'Espia a carta fechada do dealer (só você vê)',
    'px.tr.foresight.d': 'Mostra a carta do topo do sapato',
    'px.tr.reshuffle.d': 'Embaralha as cartas que restam no sapato',
    'px.tr.burn.d': 'Devolve a última carta do dealer ao sapato (a mesa inteira sente)',
    'px.tr.switch.d': 'Troca sua última carta com a última do dealer',
    'px.tr.force.d': 'O dealer é obrigado a pegar a carta do topo agora',
    'px.tr.freeze.d': 'O dealer só pode comprar uma carta no turno dele',
    'px.tr.shatter.d': 'Destrói um trunfo do dealer',
    'px.tr.pickpocket.d': 'Rouba um trunfo do dealer',
    'px.tr.blindfold.d': 'O dealer não pode usar trunfos nesta rodada',
    'px.tr.lighten.d': 'Devolve sua carta mais alta ao sapato',
    'px.tr.heist.d': 'Pega a última carta do dealer para a sua mão (a mesa inteira sente)',
    'px.tr.gift.d': 'Dá a sua última carta ao dealer (a mesa inteira sente)',
    'px.tr.overload.d': 'O dealer pega agora as duas cartas do topo do sapato',
    'px.tr.rewind.d': 'Você e o dealer devolvem a última carta ao sapato',
    'px.tr.barrier.d': 'Bloqueia o próximo trunfo do dealer contra você nesta rodada',
    'px.tr.tiebreak.d': 'Empates com o dealer são seus nesta rodada',
    'px.tr.bullseye.d': 'Vencer cravando o seu alvo nesta rodada paga 3 para 1',
    'px.bonusToast': '{name}: trunfo bônus! PEÇA de novo para receber sua carta',
    'px.blocked': 'Barreira! {name} foi bloqueado',
    'px.blockedSay': 'Bloqueado!',
    'px.tr.reset21.d': 'Seu alvo vira 21, e as cartas de alvo do dealer não o mudam mais',
    'px.tr.line.d': 'Seu próprio alvo vira {n} nesta rodada',
    'px.tr.wild.d': 'Seu próprio alvo vira um número sorteado de {lo} a {hi}',
    'px.tr.shift.d': 'Seu próprio alvo muda {d} ({lo} a {hi})',
    'px.tr.lineName': 'Linha {n}',
    'px.tr.wildName': 'Linha Louca',
    'px.tr.upName': 'Linha +2',
    'px.tr.downName': 'Linha −2',
    'px.rules': `
      <p>Trump 21 numa mesa cheia: você e quatro frequentadores jogam cada um a sua mão contra o mesmo dealer, cada um com os seus trunfos. As cartas são numeradas de <b>1 a 11</b>; o sapato tem <b>cinco baralhos</b> delas (55 cartas), embaralhados a cada rodada.</p>
      <h4>A distribuição</h4>
      <p>A partir da primeira base (à esquerda do dealer, à sua direita) cada lugar recebe uma carta privada, depois vem a carta fechada do dealer, uma segunda carta aberta para cada lugar e a carta aberta do dealer. As cartas privadas dos frequentadores ficam viradas; o dealer e os frequentadores jogam como se não vissem a sua.</p>
      <h4>Turnos</h4>
      <p>Os lugares jogam em ordem, da primeira à terceira base. No seu turno use trunfos quando quiser, <b>peça</b> quantas cartas quiser e <b>pare</b> para terminar. Passar do seu alvo não encerra a mão: um trunfo ainda pode salvá-la. Depois o dealer vira a carta fechada e joga. Quando um trunfo do dealer atinge a sua mão (Compra Forçada, Queimar), você responde na hora com um turno curto.</p>
      <h4>Alvos e vitória</h4>
      <p>O alvo da mesa é <b>21</b>; só as cartas de alvo do dealer o mudam. Uma carta de alvo que você usa (Linha 15 a 30, Volta 21, Linha +2 ou −2, ou a Linha Louca, que sorteia um número de 16 a 28) dá a <b>você</b> um alvo próprio nesta rodada, e as cartas de alvo do dealer não o mudam mais. Cada lugar é comparado com o dealer separadamente: a mão mais perto do próprio alvo sem passar ganha <b>1:1</b>; quem passou do alvo perde para quem não passou; se os dois passaram, vence quem passou menos. <b>Empate é do dealer</b> (a vantagem da casa).</p>
      <h4>O dealer</h4>
      <p>O dealer compra enquanto estiver a mais de 3 do alvo da mesa (abaixo de 18 com alvo 21) e para daí em diante; congelado, compra no máximo uma carta. Em cada decisão usa o primeiro trunfo que servir: acima do alvo, Recolher ou a carta de alvo maior mais justa (a Linha Louca quando ela o salva pelo menos metade das vezes); estilhaça os trunfos de quem tem três ou mais; com um total que cabe num alvo menor, usa essa carta quando a maior parte do dinheiro nos lugares do alvo da mesa mostra mais; força uma carta no lugar com mais chance de estourar e queima a última carta (6 ou mais) da maior aposta que o está vencendo; senão melhora a mão com Precisão ou Chamar. Ele lê cada lugar como as cartas abertas mais 6. Recebe <b>dois trunfos a cada rodada</b> (enfrenta cinco mãos); a mão dele guarda cinco, e um novo substitui o mais antigo.</p>
      <h4>Cartas trunfo</h4>
      <p>Cada lugar guarda até cinco trunfos entre as rodadas: um a cada distribuição, e mais ou menos um pedido em cada cinco tira um <b>trunfo bônus</b> no lugar da carta. O bônus entra na sua mão com um som próprio, o seu turno continua e o próximo pedido é carta garantida, então ele nunca custa o seu saque. Clique num trunfo para usá-lo; <b>passe o mouse sobre ele para ler o que ele faz</b> (numa tela de toque, segure-o).</p>
      <p>Os seus trunfos mudam só a sua mão, o seu alvo e a sua aposta. Trunfos contra o dealer (Queimar, Trocar, Compra Forçada, Congelar, Estilhaçar, Batedor, Venda, Furto, Presente, Rebobinar) mudam a mão ou os trunfos do dealer para <b>a mesa inteira</b>, então os frequentadores podem ajudar ou atrapalhar as chances de todos. A Sobrecarga (duas cartas para o dealer) é só da mesa individual: não sai aqui. Nesta mesa Precisão e Pluma escolhem entre as próximas três cartas, Espiar é uma espiada só sua e Congelar deixa o dealer comprar só uma carta. Dobro dobra a sua aposta; Escudo devolve metade numa derrota, Fortaleza tudo; Recompensa paga a vitória 2 para 1, Na Mosca 3 para 1 cravando o seu alvo; Desempate te dá os empates; a Barreira bloqueia o próximo trunfo do dealer contra você.</p>
      <h4>Os frequentadores</h4>
      <p>Frequentadores do circuito Villa Lago sentam com você, uma turma diferente a cada visita. Cada um tem o seu temperamento, mas ninguém joga todas as mãos do mesmo jeito: numa mão leem cada carta que resta no sapato, na outra partem para cima, jogam com cautela ou seguem um palpite. Repare nas apostas, nos trunfos e nas jogadas; o que estão pensando, eles guardam para si. Quem quebra se levanta, e logo outra pessoa puxa a cadeira. Eles apostam de 10 a 200 com as próprias fichas; só as suas apostas mexem no seu saldo.</p>
      <h4>Dica</h4>
      <p>A lâmpada mostra a jogada com as melhores chances, trunfos incluídos.</p>`,
  },
);

/** Vertical anchors in the portrait layout frame. */
const V = { dealer: 0.2, print: 0.352, centre: 0.29, seat: 0.72 };
const N = PX.seats;
/** Seat index of the rules (play order, 0 = first base on the player's right) ↔ position on screen. */
const posOf = (seat: number) => N - 1 - seat;
const seatOf = (pos: number) => N - 1 - pos;
const ME = seatOf(PLAYER_SEAT);

/** A trump's name: Trump 21's, or one made from the id for target cards it doesn't name yet. */
function trumpName(id: TrumpId): string {
  const key = `tr.${id}`;
  const s = t(key);
  if (s !== key) return s;
  const tm = targetMove(id);
  if (tm?.kind === 'fixed') return t('px.tr.lineName', { n: tm.n });
  if (tm?.kind === 'wild') return t('px.tr.wildName');
  if (tm?.kind === 'shift') return t(tm.d > 0 ? 'px.tr.upName' : 'px.tr.downName');
  return id;
}

/** What a trump does at this table. */
function trumpDesc(id: TrumpId): string {
  const own = `px.tr.${id}.d`;
  if (t(own) !== own) return t(own);
  const tm = targetMove(id);
  if (tm?.kind === 'fixed') return t('px.tr.line.d', { n: tm.n });
  if (tm?.kind === 'wild') return t('px.tr.wild.d', { lo: WILD.lo, hi: WILD.hi });
  if (tm?.kind === 'shift') return t('px.tr.shift.d', { d: `${tm.d > 0 ? '+' : '−'}${Math.abs(tm.d)}`, lo: SHIFT.lo, hi: SHIFT.hi });
  const base = `tr.${id}.d`;
  return t(base) !== base ? t(base) : '';
}

const css = (el: HTMLElement, s: Partial<CSSStyleDeclaration>) => Object.assign(el.style, s);

interface AiState {
  profile: AiProfile;
  /** Chips in front of the regular. */
  chips: number;
  /** This hand's bet, and everything on the felt (bet + Stakes Up). */
  bet: number;
  stake: number;
  /** What the dealer settled (stake + winnings) while it is still on the felt; null before the showdown. */
  owed: number | null;
  mem: AiMemory;
  /** This hand's hidden mindset, drawn when they bet. Never shown. */
  mind: Mindset | null;
  /** Their trump hand (kept between rounds). */
  trumps: TrumpId[];
}

/** A regular sitting down: their own bankroll, a fresh memory, no trumps yet. */
const seatRegular = (profile: AiProfile): AiState => ({ profile, chips: profile.bank, bet: 0, stake: 0, owed: null, mem: newMemory(), mind: null, trumps: [] });

interface SeatV {
  pos: number;
  geo: SeatGeo;
  color: string;
  ai: AiState | null;
  /** The hand's cards, in the engine's order (undefined while in flight). */
  cards: (Card3D | undefined)[];
  bubble: Pin;
  plate: Pin;
  plateText: Plate['plateText'];
  /** The regular's face-down trumps, under its name plate. */
  fan: HTMLElement | null;
  tag: Pin;
  tagOn: boolean;
  active: boolean;
  betPile: ChipPile | null;
  raisePile: ChipPile | null;
  payouts: ChipPile[];
}

type TurnPick = 'hit' | 'stand' | { trump: TrumpId };

export class PartyTrumpView extends TableGame {
  readonly id = 'partytrump';
  readonly title = 'Party Trump 21';
  // Trump 21's gothic felt (a 'partytrump' felt can take over once it exists)
  protected readonly felt = 'partytrump' as const;
  private rng = cryptoRng;
  /** The four regulars at the table (a new draw from the circuit at every visit). */
  private ai: AiState[] = drawRegulars(4, cryptoRng).map(seatRegular);
  /** The player's and the dealer's trump hands (kept between rounds). */
  private myTrumps: TrumpId[] = [];
  private dealerTrumps: TrumpId[] = [];
  private seats: SeatV[] = [];
  private round: PartyDuel | null = null;
  private dealer: (Card3D | undefined)[] = [];
  private dealerZ = 0;
  private centreZ = 0;
  private dealerBubble: Pin | null = null;
  private dealerTag: Pin | null = null;
  private dealerTagOn = false;
  private targetPin: Pin | null = null;
  private dTrumpPin: Pin | null = null;
  private statusPin: Pin | null = null;
  private holePin: Pin | null = null;
  private nextPin: Pin | null = null;
  private rowEl: HTMLElement | null = null;
  private flying = new Set<HTMLElement>();
  private resolveTurn: ((p: TurnPick) => void) | null = null;
  private myTurn = false;
  /** Bumped on exit: a round still running from before goes quiet. */
  private run = 0;
  private aiBetting: Promise<void> = Promise.resolve();
  private aiSweep: Promise<void> = Promise.resolve();
  private v3 = new THREE.Vector3();

  constructor(g: GameCtx) {
    super(g, 1);
  }

  /** A different crowd at every visit: four regulars of the circuit sit in. */
  async enter() {
    this.ai = drawRegulars(4, this.rng).map(seatRegular);
    await super.enter();
  }

  rules() {
    const rows = SEAT_POOL.map((id) => {
      const r = rarityOf(id);
      const dealer = DEALER_POOL.includes(id) ? ` · ${t('px.dealerOnly')}` : '';
      return (
        `<div class="codex-row" data-rarity="${r}"><span class="trump mini" data-rarity="${r}"><span class="tr-ic">${trumpFace(id)}</span></span>` +
        `<span><b>${trumpName(id)}</b> <i>${t(`rar.${r}`)}${dealer}</i><br>${trumpDesc(id)}</span></div>`
      );
    }).join('');
    return `${t('px.rules')}<h4>${t('px.codex')}</h4><p>${t('tu.hold')}</p><div class="codex">${rows}</div>`;
  }

  // ---------------------------------------------------------------- table
  protected spotDefs(): SpotDef[] {
    return [
      { id: 'bet', label: t('px.bet'), u: 0.5, v: V.seat, size: 0.62, ring: false, max: PX.maxBet },
      { id: 'stakes', label: t('px.raise'), u: 0.56, v: V.seat, size: 0.44, ring: false, auto: true },
    ];
  }

  protected defaultBets() {
    return { bet: 25 };
  }

  protected validate() {
    return (this.spots.amounts().bet ?? 0) < PX.minBet ? t('px.needBet') : '';
  }

  protected decorate() {
    const { stage, table, hud } = this.g;
    this.disposeSeats();
    const playerZ = stage.screenToTable(0.5, V.seat).z;
    this.dealerZ = stage.screenToTable(0.5, V.dealer).z;
    this.centreZ = stage.screenToTable(0.5, V.centre).z;
    const pr = stage.screenToTable(0.5, V.print);
    table.addDecalAt(partyPrint(t('px.print1'), t('px.print2'), t('px.print3')), 0, pr.z, 4.1);
    const geos = seatLayout(playerZ, stage.stretch);
    this.seats = geos.map((geo, pos) => {
      const mid = onTable(geo, 0, (geo.top + geo.bottom) / 2);
      const rings = [
        { lx: RING.bet.lx, ly: 0, r: RING.bet.r, label: t('px.bet') },
        { lx: RING.stakes.lx, ly: 0, r: RING.stakes.r, label: t('px.raise') },
      ];
      table.addDecalAt(seatBox(geo, COLORS[pos], rings), mid.x, mid.z, boxWidth(geo)).rotation.y = geo.yaw;
      const ai = pos === PLAYER_SEAT ? null : this.ai[pos < PLAYER_SEAT ? pos : pos - 1];
      const at = (lx: number) => {
        const p = onTable(geo, lx, 0);
        return new THREE.Vector3(p.x, 0, p.z);
      };
      const plate = partyPlate(hud, COLORS[pos], ai ? ai.profile : null);
      let fan: HTMLElement | null = null;
      if (ai) {
        fan = document.createElement('div');
        css(fan, { display: 'flex', gap: 'calc(0.5 * var(--u))', marginLeft: 'calc(0.6 * var(--u))', alignSelf: 'center' });
        plate.plate.el.appendChild(fan);
      }
      const sv: SeatV = {
        pos,
        geo,
        color: COLORS[pos],
        ai,
        cards: [],
        bubble: hud.pin('bubble'),
        ...plate,
        fan,
        tag: hud.pin('handtag'),
        tagOn: false,
        active: false,
        betPile: ai ? new ChipPile(this.g.chips, stage.table, at(RING.bet.lx)) : null,
        raisePile: ai ? new ChipPile(this.g.chips, stage.table, at(RING.stakes.lx)) : null,
        payouts: [],
      };
      this.renderFan(sv);
      return sv;
    });
    // the player's betting places sit on the rings of the middle box
    const me = this.seats[PLAYER_SEAT];
    for (const [id, lx] of [
      ['bet', RING.bet.lx],
      ['stakes', RING.stakes.lx],
    ] as const) {
      const s = this.spots.get(id);
      const p = onTable(me.geo, lx, 0);
      s.pos.set(p.x, 0, p.z);
      s.pile.group.position.set(p.x, 0, p.z);
    }
    this.dealerBubble = hud.pin('bubble');
    this.dealerTag = hud.pin('handtag dealer');
    this.targetPin = hud.pin('t21-target');
    this.targetPin.el.innerHTML = `<small>${t('px.target')}</small><b>21</b>`;
    this.dTrumpPin = hud.pin('t21-dtrumps');
    this.statusPin = hud.pin('handtag dealer');
    this.holePin = hud.pin('t21-next');
    this.nextPin = hud.pin('t21-next');
    this.rowEl = document.createElement('div');
    this.rowEl.className = 'trumprow';
    // keep the cards toward the screen edge, clear of the seats
    css(this.rowEl, { justifyContent: 'flex-end' });
    hud.root.appendChild(this.rowEl);
    this.renderTrumps();
    this.renderDealerTrumps();
  }

  private disposeSeats() {
    for (const sv of this.seats) {
      sv.bubble.remove();
      sv.betPile?.dispose();
      sv.raisePile?.dispose();
      for (const p of sv.payouts) p.dispose();
      sv.plate.remove();
      sv.tag.remove();
    }
    this.seats = [];
    for (const p of [this.dealerBubble, this.dealerTag, this.targetPin, this.dTrumpPin, this.statusPin, this.holePin, this.nextPin]) p?.remove();
    this.dealerBubble = this.dealerTag = this.targetPin = this.dTrumpPin = this.statusPin = this.holePin = this.nextPin = null;
    this.rowEl?.remove();
    this.rowEl = null;
  }

  protected cleanup() {
    this.run++;
    this.myTurn = false;
    this.resolveTurn = null;
    this.round = null;
    this.dealer = [];
    // the regulars take back what is theirs on the felt: the settled return, or an unplayed stake
    for (const a of this.ai) {
      a.chips += a.owed ?? a.stake;
      a.stake = 0;
      a.bet = 0;
      a.owed = null;
    }
    for (const el of this.flying) el.remove();
    this.flying.clear();
    this.disposeSeats();
  }

  /** Suspends a round that outlived its table (the player left mid-hand). */
  private async alive(run: number) {
    if (run !== this.run) await new Promise<never>(() => {});
  }

  // ---------------------------------------------------------------- HUD pins
  private screen(x: number, z: number) {
    return this.g.stage.toScreen(this.v3.set(x, 0, z));
  }

  protected onSync() {
    const { wallet } = this.g;
    const r = this.round;
    for (const sv of this.seats) {
      const b = onTable(sv.geo, 0, LY.bubble);
      const bp = this.screen(b.x, b.z);
      sv.bubble.place(bp.x, bp.y);
      sv.bubble.show(sv.cards.some((c) => c));
      const tg = onTable(sv.geo, 0, LY.tag);
      const tp = this.screen(tg.x, tg.z);
      sv.tag.place(tp.x, tp.y);
      sv.tag.show(sv.tagOn);
      const pl = onTable(sv.geo, 0, sv.ai ? LY.plateAi : LY.platePlayer);
      const pp = this.screen(pl.x, pl.z);
      sv.plate.place(pp.x, pp.y);
      sv.plate.show(this.phase !== 'idle');
      const chips = sv.ai ? sv.ai.chips : wallet.balance;
      const bet = sv.ai ? sv.ai.stake : this.spots.total;
      const ct = money(chips);
      if (sv.plateText.chips.textContent !== ct) sv.plateText.chips.textContent = ct;
      const bt = bet > 0 ? t('pb.betOf', { n: money(bet) }) : '';
      if (sv.plateText.bet.textContent !== bt) sv.plateText.bet.textContent = bt;
      glowPlate(sv.plate, sv.color, sv.active);
    }
    const n = this.dealer.length;
    const top = this.screen(0, this.dealerZ - CARD_H / 2 - 0.27);
    this.dealerBubble?.place(top.x, top.y);
    this.dealerBubble?.show(this.dealer.some((c) => c));
    const under = this.screen(0, this.dealerZ + CARD_H / 2 + 0.22);
    this.dealerTag?.place(under.x, under.y);
    this.dealerTag?.show(this.dealerTagOn);
    const side = Math.max(1.75, (dealerX(n, n - 1) || 0) + 1.05);
    const tp = this.screen(-side - 0.2, this.dealerZ + 0.05);
    this.targetPin?.place(tp.x, tp.y);
    this.targetPin?.show(this.phase === 'playing');
    const dp = this.screen(side + 0.15, this.dealerZ - 0.1);
    this.dTrumpPin?.place(dp.x, dp.y);
    const sp = this.screen(side + 0.15, this.dealerZ + 0.5);
    this.statusPin?.place(sp.x, sp.y);
    this.statusPin?.show(this.phase === 'playing' && !!r && (r.dealer.frozen || r.dealer.blinded));
    // the private views sit further out, within the band on narrower screens
    const far = Math.min(side + 1.2, 2.6 * this.g.stage.stretch);
    const hp = this.screen(-far, this.dealerZ + 0.05);
    this.holePin?.place(hp.x, hp.y);
    const np = this.screen(far, this.dealerZ + 0.05);
    this.nextPin?.place(np.x, np.y);
    this.rowEl?.classList.toggle('hidden', this.phase === 'idle' || this.phase === 'shuffling' || !this.myTrumps.length);
  }

  /** A seat's tag over its cards: an action, a trump, the result. */
  private say(sv: SeatV, text: string, cls = '') {
    sv.tag.set(text, `handtag ${cls}`.trim());
    sv.tag.pop();
    sv.tagOn = true;
  }

  private sayDealer(text: string, cls = 'dealer') {
    this.dealerTag?.set(text, `handtag ${cls}`);
    this.dealerTag?.pop();
    this.dealerTagOn = true;
  }

  private seatV(seat: number) {
    return this.seats[posOf(seat)];
  }

  private nameOf(seat: number) {
    const ai = this.seatV(seat).ai;
    return ai ? ai.profile.name : t('pb.you');
  }

  private updateBubble(seat: number, pop = false) {
    const r = this.round;
    const sv = this.seatV(seat);
    if (!r || !sv) return;
    const s = r.seats[seat];
    if (!s.cards.length) return;
    const T = r.targetOf(seat);
    const own = s.own !== null;
    const open = !sv.ai || !!sv.cards[0]?.faceUp;
    let text: string;
    let cls = 'bubble up';
    if (open) {
      const p = r.total(seat);
      text = `${p} / ${T}`;
      if (p > T) cls += ' bust';
      else if (p === T) cls += ' bj';
    } else text = `? + ${r.visibleTotal(seat)}${own ? ` / ${T}` : ''}`;
    if (sv.active) cls += ' active';
    sv.bubble.set(text, cls);
    if (pop) sv.bubble.pop();
  }

  private updateDealerBubble(pop = false) {
    const r = this.round;
    const b = this.dealerBubble;
    if (!r || !b || !r.dealer.cards.length) return;
    const hidden = !r.holeUp;
    const T = r.tableTarget;
    const vis = r.dealer.cards.slice(hidden ? 1 : 0).reduce((a, v) => a + v, 0);
    const tot = r.total(DEALER);
    b.set(hidden ? `? + ${vis}` : `${tot} / ${T}`, `bubble down${!hidden && tot > T ? ' bust' : ''}`);
    if (pop) b.pop();
  }

  private setTableTarget(n: number, pop = true) {
    const b = this.targetPin?.el.querySelector('b');
    if (!b) return;
    b.textContent = String(n);
    this.targetPin!.el.classList.toggle('changed', n !== 21);
    if (pop) this.targetPin!.pop();
  }

  private updateStatus() {
    const r = this.round;
    if (!r || !this.statusPin) return;
    const parts = [r.dealer.frozen ? t('px.frozen') : '', r.dealer.blinded ? t('px.blind') : ''].filter(Boolean);
    this.statusPin.set(parts.join(' · '), 'handtag dealer');
  }

  // ---------------------------------------------------------------- trump hands
  private trumpEl(id: TrumpId, tag: 'button' | 'div' = 'div') {
    const b = document.createElement(tag);
    b.className = 'trump';
    b.dataset.id = id;
    b.dataset.rarity = rarityOf(id);
    b.innerHTML = trumpInner({ face: trumpFace(id), name: trumpName(id) });
    return b;
  }

  /** A trump's card and what it does at this table (the held card, the bonus flight). */
  private trumpInfo(id: TrumpId): TrumpCardInfo {
    return { face: trumpFace(id), name: trumpName(id), desc: trumpDesc(id), rarity: rarityOf(id), tag: DEALER_POOL.includes(id) ? t('px.dealerOnly') : undefined };
  }

  /** The player's trumps (the right zone, as at Trump 21): a tap plays one on your turn, a press held shows what it does. */
  private renderTrumps() {
    const el = this.rowEl;
    if (!el) return;
    el.replaceChildren(
      ...this.myTrumps.map((id) => {
        const b = this.trumpEl(id, 'button') as HTMLButtonElement;
        b.classList.add('live');
        const usable = () => {
          const r = this.round;
          const bet = this.spots?.get('bet').amount ?? 0;
          return this.myTurn && !!this.resolveTurn && !!r && r.canUse(ME, id) && (id !== 'stakes' || this.g.wallet.canAfford(bet));
        };
        bindTrump(b, {
          host: this.g.hud.root,
          info: () => this.trumpInfo(id),
          canPlay: usable,
          onPeek: () => this.g.sfx.trumpLift(),
          play: () => {
            const res = this.resolveTurn;
            if (!res) return;
            this.g.sfx.click();
            this.resolveTurn = null;
            b.classList.add('used');
            setTimeout(() => res({ trump: id }), 220);
          },
        });
        return b;
      }),
    );
  }

  /**
   * A bonus trump out of the shoe with a hit: yours flies in, turns over with its sound and drops
   * into your hand; the dealer's and the regulars' go face down to their piles.
   */
  private async bonusFlight(who: Who, id: TrumpId) {
    const { sfx, hud } = this.g;
    const speed = Math.max(0.25, gsap.globalTimeline.timeScale());
    if (who === ME) {
      this.renderTrumps();
      const slot = (this.rowEl?.lastElementChild as HTMLElement | null) ?? null;
      if (slot) slot.style.visibility = 'hidden';
      sfx.trumpDraw(rarityOf(id), false, speed);
      await flyBonusTrump(this.g, { info: this.trumpInfo(id), to: centreIn(this.g, slot) ? slot : null });
      if (slot) {
        slot.style.visibility = '';
        slot.classList.add('fresh');
      }
      hud.toast(t('px.bonusToast', { name: trumpName(id) }), 2200);
      return;
    }
    sfx.trumpDraw(rarityOf(id), true, speed);
    if (who === DEALER) {
      await flyBonusTrump(this.g, { info: null, to: this.dTrumpPin?.el ?? null, endScale: 0.32 });
      this.renderDealerTrumps();
      this.dTrumpPin?.pop();
    } else {
      const sv = this.seatV(who);
      await flyBonusTrump(this.g, { info: null, to: sv.fan, endScale: 0.25 });
      this.renderFan(sv, true);
    }
  }

  /** A regular's trumps: small face-down cards beside its name. */
  private renderFan(sv: SeatV, fresh = false) {
    const fan = sv.fan;
    if (!fan || !sv.ai) return;
    fan.replaceChildren(
      ...sv.ai.trumps.map((_, i) => {
        const c = document.createElement('i');
        css(c, {
          display: 'block',
          width: 'calc(3 * var(--u))',
          height: 'calc(4.3 * var(--u))',
          borderRadius: 'calc(0.5 * var(--u))',
          background: 'linear-gradient(165deg, #3e2f55, #1a1226)',
          border: 'calc(0.3 * var(--u)) solid #d6b46a',
          boxShadow: '0 calc(0.3 * var(--u)) calc(0.6 * var(--u)) rgba(0, 0, 0, 0.5)',
          transform: `rotate(${(i - (sv.ai!.trumps.length - 1) / 2) * 5}deg)`,
        });
        return c;
      }),
    );
    if (fresh) (fan.lastElementChild as HTMLElement | null)?.animate?.([{ transform: 'translateY(-60%) scale(1.4)', opacity: 0 }, { opacity: 1 }], { duration: 380, easing: 'ease-out' });
  }

  private renderDealerTrumps() {
    const p = this.dTrumpPin;
    if (!p) return;
    const n = this.dealerTrumps.length;
    p.el.innerHTML = n ? `<small>${t('px.trumps')}</small><b>${'<i></i>'.repeat(n)}</b>` : '';
    p.show(n > 0 && this.phase !== 'idle');
  }

  /** Point (relative to the pins' layer) at the centre of an element. */
  private centreOf(el: Element | null | undefined): { x: number; y: number } | null {
    if (!el) return null;
    const base = this.g.hud.labels.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return { x: r.left + r.width / 2 - base.left, y: r.top + r.height / 2 - base.top };
  }

  /**
   * Trump 21's effect at a full table: the card flies from its owner to the middle of the felt,
   * turns face up if it was hidden, holds a moment, then lifts away and fades.
   */
  private async flyTrump(id: TrumpId, from: { x: number; y: number } | null, faceDown: boolean) {
    const { stage, sfx } = this.g;
    const to = stage.toScreen(this.v3.set(0, 0, this.centreZ));
    const start = from ?? to;
    const box = document.createElement('div');
    css(box, { position: 'absolute', left: '0', top: '0', width: 'calc(13 * var(--u))', height: 'calc(17 * var(--u))', zIndex: '30', pointerEvents: 'none' });
    const face = this.trumpEl(id);
    css(face, { position: 'absolute', inset: '0', width: '100%', height: '100%', boxSizing: 'border-box' });
    const back = document.createElement('div');
    css(back, {
      position: 'absolute',
      inset: '0',
      borderRadius: 'calc(1.6 * var(--u))',
      background: 'repeating-linear-gradient(45deg, rgba(214, 180, 106, 0.16) 0 calc(0.8 * var(--u)), transparent calc(0.8 * var(--u)) calc(1.6 * var(--u))), linear-gradient(165deg, #3e2f55, #1a1226)',
      border: 'calc(0.45 * var(--u)) solid #d6b46a',
      boxShadow: '0 calc(0.8 * var(--u)) calc(1.6 * var(--u)) rgba(0, 0, 0, 0.6)',
    });
    face.style.visibility = faceDown ? 'hidden' : 'visible';
    back.style.visibility = faceDown ? 'visible' : 'hidden';
    box.append(face, back);
    this.g.hud.labels.appendChild(box);
    this.flying.add(box);
    gsap.set(box, { x: start.x, y: start.y, xPercent: -50, yPercent: -50, scale: 0.35, rotation: -8 });
    sfx.whoosh(0.35);
    await new Promise<void>((res) => gsap.to(box, { x: to.x, y: to.y, scale: 1.15, rotation: 0, duration: 0.42, ease: 'power3.out', onComplete: res }));
    if (faceDown) {
      await new Promise<void>((res) => gsap.to(box, { scaleX: 0, duration: 0.11, ease: 'power2.in', onComplete: res }));
      face.style.visibility = 'visible';
      back.style.visibility = 'hidden';
      await new Promise<void>((res) => gsap.to(box, { scaleX: 1.15, duration: 0.13, ease: 'power2.out', onComplete: res }));
    }
    sfx.play('chips', { vol: 0.5 });
    await wait(0.42);
    gsap.to(box, {
      y: to.y - 70,
      scale: 1.45,
      rotation: -6,
      opacity: 0,
      duration: 0.32,
      ease: 'power2.in',
      onComplete: () => {
        box.remove();
        this.flying.delete(box);
      },
    });
    await wait(0.12);
  }

  /** A number spin for Wild Line, landing on the drawn target. */
  private async spin(set: (s: string) => void, final: number, cur: number) {
    const opts = wildTargets(cur);
    for (let i = 0; i < 9; i++) {
      set(String(opts[(i * 7 + final) % opts.length]));
      this.g.sfx.tick(0.18, 1 + i * 0.06);
      await wait(0.045 + i * 0.008);
    }
    set(String(final));
    this.g.sfx.play('chips', { vol: 0.5 });
  }

  // ---------------------------------------------------------------- the regulars' chips
  private home(sv: SeatV, y = 0.9) {
    const p = onTable(sv.geo, 0, LY.home);
    return new THREE.Vector3(p.x, y, p.z);
  }

  /** The table is open for bets: clear the last round's seats and let the regulars bet. */
  protected toBetting() {
    super.toBetting();
    this.resetSeats();
    this.aiBetting = this.placeAiBets(this.run);
  }

  private resetSeats() {
    for (const sv of this.seats) {
      sv.cards = [];
      sv.tagOn = false;
      sv.active = false;
      sv.bubble.show(false);
    }
    this.dealer = [];
    this.dealerTagOn = false;
    this.round = null;
    this.holePin?.show(false);
    this.nextPin?.show(false);
    this.setTableTarget(21, false);
    this.renderTrumps();
    this.renderDealerTrumps();
  }

  private async placeAiBets(run: number) {
    await this.aiSweep;
    await this.alive(run);
    const { sfx } = this.g;
    const order = [0, 1, 3, 4].map((p) => this.seats[p]).filter((sv) => sv?.ai && sv.betPile && !sv.betPile.amount);
    const jobs = order.map(async (sv, k) => {
      const ai = sv.ai!;
      await wait(0.15 + k * 0.26 + Math.random() * 0.12);
      await this.alive(run);
      if (ai.chips < PX.aiMin) await this.replaceRegular(sv, run);
      // the hand's hidden mindset, then the bet it calls for (a regular always plays)
      ai.mind = drawMindset(ai.profile, ai.mem, ai.chips, this.rng);
      const bet = aiStake(ai.mind, ai.chips, ai.mem, ai.trumps, this.rng);
      ai.chips -= bet;
      ai.bet = bet;
      ai.stake = bet;
      sfx.play('handle', { vol: 0.35 });
      await sv.betPile!.dropIn(bet, this.home(sv), 0.06);
    });
    await Promise.all(jobs);
  }

  /** A regular who can't cover the minimum leaves; a newcomer from the circuit takes the seat. */
  private async replaceRegular(sv: SeatV, run: number) {
    const { sfx } = this.g;
    this.say(sv, t('px.busted'), 'lose');
    sfx.play('shove', { vol: 0.4 });
    await wait(1.1);
    await this.alive(run);
    const next = replacementFor(
      this.ai.map((a) => a.profile.name),
      this.rng,
    );
    Object.assign(sv.ai!, seatRegular(next));
    setPlateName(sv, next);
    this.renderFan(sv);
    this.say(sv, t('px.newcomer'), 'win');
    sfx.coins(4);
    await wait(0.6);
    await this.alive(run);
  }

  /** The regulars' stakes and winnings slide back to their places, then join their chips. */
  private async sweepAi(delay: number) {
    await wait(delay);
    const { sfx } = this.g;
    const jobs: Promise<void>[] = [];
    for (const sv of this.seats) {
      const ai = sv.ai;
      if (!ai || !sv.betPile || !sv.raisePile) continue;
      const piles = [sv.betPile, sv.raisePile, ...sv.payouts].filter((p) => p.amount > 0);
      const to = this.home(sv, 0);
      jobs.push(
        Promise.all(piles.map((p) => slideChips(p.group, to, 0.5, 0.08, 'power2.in'))).then(() => {
          ai.chips += ai.owed ?? ai.stake;
          ai.owed = null;
          ai.stake = 0;
          ai.bet = 0;
          for (const p of sv.payouts) p.dispose();
          sv.payouts = [];
          for (const [p, lx] of [
            [sv.betPile!, RING.bet.lx],
            [sv.raisePile!, RING.stakes.lx],
          ] as const) {
            p.clear();
            const at = onTable(sv.geo, lx, 0);
            p.group.position.set(at.x, 0, at.z);
          }
        }),
      );
    }
    if (jobs.length) sfx.play('handle', { vol: 0.5 });
    await Promise.all(jobs);
  }

  // ---------------------------------------------------------------- cards
  private seatPlaces(sv: SeatV, n: number): Place[] {
    return Array.from({ length: n }, (_, i) => {
      const f = cardPlace(n, i);
      const p = onTable(sv.geo, f.lx, LY.cards + f.ly);
      const jit = (((i * 37 + sv.pos * 11) % 7) - 3) * 0.006;
      return { pos: new THREE.Vector3(p.x, REST_Y + f.lift, p.z), yaw: sv.geo.yaw + f.yaw + jit };
    });
  }

  private dealerPlaces(n: number): Place[] {
    return Array.from({ length: n }, (_, i) => ({ pos: new THREE.Vector3(dealerX(n, i), REST_Y + i * 0.0035, this.dealerZ), yaw: (((i * 37) % 7) - 3) * 0.004 }));
  }

  private handOf(who: Who) {
    return who === DEALER ? this.dealer : this.seatV(who).cards;
  }

  private relayoutHand(who: Who, dur = 0.26) {
    const hand = this.handOf(who);
    const pl = who === DEALER ? this.dealerPlaces(hand.length) : this.seatPlaces(this.seatV(who), hand.length);
    return Promise.all(hand.map((c, i) => (c ? slideCard(c, pl[i], dur) : Promise.resolve())));
  }

  private async dealTo(e: Extract<PxEvent, { t: 'card' }>) {
    const hand = this.handOf(e.who);
    const i = hand.length;
    hand.push(undefined);
    const n = hand.length;
    const pl = e.who === DEALER ? this.dealerPlaces(n) : this.seatPlaces(this.seatV(e.who), n);
    hand.forEach((c, k) => c && slideCard(c, pl[k], 0.22));
    // a regular's private card and the hole card are dealt face down; yours you can see
    const faceUp = !e.hidden || (e.who !== DEALER && !this.seatV(e.who).ai);
    hand[i] = await this.cardsT.deal(100 + e.value, pl[i], faceUp, { dur: 0.42 });
    if (e.who === DEALER) this.updateDealerBubble(true);
    else this.updateBubble(e.who, true);
  }

  private async toShoe(e: Extract<PxEvent, { t: 'back' }>) {
    const { table, cards, sfx } = this.g;
    const hand = this.handOf(e.who);
    const [c] = hand.splice(e.index, 1);
    if (c) {
      sfx.play('shove', { vol: 0.6 });
      const k = this.cardsT.all.indexOf(c);
      if (k >= 0) this.cardsT.all.splice(k, 1);
      await collectCards([c], table.shoeMouth(), table.shoeYaw, () => cards.destroy(c));
    }
    await this.relayoutHand(e.who);
    if (e.who === DEALER) this.updateDealerBubble();
    else this.updateBubble(e.who);
  }

  // ---------------------------------------------------------------- event playback
  private async play(evs: PxEvent[], run: number) {
    let pending: Promise<unknown>[] = [];
    for (const e of evs) {
      await this.alive(run);
      if (e.t === 'card') {
        pending.push(this.dealTo(e));
        await wait(0.2);
        continue;
      }
      await Promise.all(pending);
      pending = [];
      await this.apply(e);
    }
    await Promise.all(pending);
    await this.alive(run);
    this.updateNext();
  }

  private async apply(e: PxEvent) {
    const { sfx, hud, fx } = this.g;
    const r = this.round!;
    switch (e.t) {
      case 'back':
        await this.toShoe(e);
        break;
      case 'switch': {
        sfx.play('fan', { vol: 0.6 });
        const sv = this.seatV(e.seat);
        const a = sv.cards.pop();
        const b = this.dealer.pop();
        sv.cards.push(b);
        this.dealer.push(a);
        await Promise.all([this.relayoutHand(e.seat, 0.4), this.relayoutHand(DEALER, 0.4)]);
        this.updateBubble(e.seat, true);
        this.updateDealerBubble(true);
        break;
      }
      case 'target': {
        if (e.who === DEALER) {
          const b = this.targetPin?.el.querySelector('b');
          if (e.wild && b) await this.spin((s) => (b.textContent = s), e.n, Number(b.textContent) || 21);
          this.setTableTarget(e.n);
          sfx.play('chips', { vol: 0.5 });
          r.seats.forEach((_, s) => this.updateBubble(s));
          this.updateDealerBubble(true);
          hud.toast(t('px.targetIs', { n: e.n }), 1300);
        } else {
          const sv = this.seatV(e.who);
          if (e.wild) {
            sv.tagOn = true;
            await this.spin((s) => sv.tag.set(t('px.targetIs', { n: s }), 'handtag dealer'), e.n, r.tableTarget);
          }
          this.say(sv, t('px.targetIs', { n: e.n }), 'win');
          const c = onTable(sv.geo, 0, LY.cards);
          fx.glow(new THREE.Vector3(c.x, 0, c.z), 1.5, 1.4, 1.2, '#ffb36b');
          this.updateBubble(e.who, true);
        }
        break;
      }
      case 'trump':
        await this.showTrump(e);
        break;
      case 'gain': {
        if (e.bonus) {
          await this.bonusFlight(e.who, e.id);
          break;
        }
        if (e.who === DEALER) {
          this.renderDealerTrumps();
          this.dTrumpPin?.pop();
        } else if (e.who === ME) {
          this.renderTrumps();
          if (rarityOf(e.id) === 'rare') sfx.win(false);
          hud.toast(t('px.gain', { name: trumpName(e.id) }), 1300);
          (this.rowEl?.lastElementChild as HTMLElement | null)?.classList.add('fresh');
        } else this.renderFan(this.seatV(e.who), true);
        break;
      }
      case 'move': {
        // Heist / Gift: the card slides across to its new hand
        sfx.play('fan', { vol: 0.6 });
        const [c] = this.handOf(e.from).splice(this.handOf(e.from).length - 1, 1);
        this.handOf(e.to).push(c);
        await Promise.all([this.relayoutHand(e.from, 0.4), this.relayoutHand(e.to, 0.4)]);
        if (c && !c.faceUp) await this.cardsT.flip(c, 0.35);
        for (const w of [e.from, e.to]) {
          if (w === DEALER) this.updateDealerBubble(true);
          else this.updateBubble(w, true);
        }
        break;
      }
      case 'blocked': {
        // the seat's Barrier takes the dealer's trump
        sfx.barrier();
        const sv = this.seatV(e.seat);
        const c = onTable(sv.geo, 0, LY.cards);
        fx.glow(new THREE.Vector3(c.x, 0, c.z), 1.8, 1.6, 1.4, '#8fd0ff');
        fx.burst(new THREE.Vector3(c.x, 0.25, c.z), 40, '#cfefff');
        if (e.seat === ME) hud.toast(t('px.blocked', { name: trumpName(e.id) }), 1700);
        else this.say(sv, t('px.blockedSay'), 'win');
        break;
      }
      case 'lose': {
        if (e.who === DEALER) {
          this.renderDealerTrumps();
          if (e.by === 'shatter') hud.toast(t('px.shattered', { name: trumpName(e.id) }), 1300);
        } else if (e.who === ME) {
          this.renderTrumps();
          if (e.by === 'shatter') hud.toast(t('px.lost', { name: trumpName(e.id) }), 1700);
        } else this.renderFan(this.seatV(e.who));
        if (e.by !== 'discard') sfx.play('shove', { vol: 0.5 });
        if (e.by === 'pickpocket') {
          // the stolen card lands in the thief's hand ('gain' follows)
          this.renderDealerTrumps();
        }
        break;
      }
      case 'foresee':
        if (e.seat === ME) {
          sfx.play('fan', { vol: 0.5 });
          this.updateNext(true);
        } else this.say(this.seatV(e.seat), t('px.foresees'), 'dealer');
        break;
      case 'glimpse': {
        const hole = this.dealer[0];
        if (hole && !hole.faceUp) await peekCard(hole);
        if (e.seat === ME && this.holePin) {
          this.holePin.el.innerHTML = `<small>${t('px.hole')}</small><img alt="${e.value}" src="${cardDataURL(100 + e.value, 90)}">`;
          this.holePin.pop();
          this.holePin.show(true);
        } else if (e.seat !== ME) this.say(this.seatV(e.seat), t('px.peeks'), 'dealer');
        break;
      }
      case 'shuffle':
        sfx.play('shuffle', { vol: 0.6 });
        hud.toast(t('px.shuffled'), 1100);
        break;
      case 'freeze': {
        sfx.play('chips', { vol: 0.5 });
        hud.toast(t('px.frozenToast'), 1500);
        fx.glow(new THREE.Vector3(0, 0, this.dealerZ), 2.8, 1.5, 1.6, '#9fe3ff');
        fx.burst(new THREE.Vector3(0, 0.25, this.dealerZ), 60, '#cfefff');
        this.updateStatus();
        break;
      }
      case 'blind':
        hud.toast(t('px.blindToast'), 1500);
        fx.glow(new THREE.Vector3(0, 0, this.dealerZ), 2.8, 1.5, 1.4, '#b08bff');
        this.updateStatus();
        break;
      case 'stand':
        if (e.who === DEALER) {
          this.sayDealer(t('px.dealerStands'));
          this.updateDealerBubble();
          if (r.total(DEALER) > r.tableTarget) {
            sfx.play('shove', { vol: 0.6 });
            await shake(this.dealer.filter((c): c is Card3D => !!c).map((c) => c.obj), 0.04);
          }
        }
        break;
      case 'hole': {
        const hole = this.dealer[0];
        if (hole && !hole.faceUp) await this.cardsT.flip(hole, 0.5);
        this.holePin?.show(false);
        this.updateDealerBubble(true);
        await wait(0.2);
        break;
      }
      case 'reply': {
        const sv = this.seatV(e.seat);
        if (sv.ai) this.say(sv, t('px.answer'), 'dealer');
        else hud.toast(t('px.answerYou'), 1600);
        break;
      }
      default:
        break;
    }
  }

  /** A trump is played: its card flies to the middle, then its owner's display catches up. */
  private async showTrump(e: Extract<PxEvent, { t: 'trump' }>) {
    const { hud, sfx } = this.g;
    if (e.who === DEALER) {
      const from = this.centreOf(this.dTrumpPin?.el.querySelector('i:last-child'));
      this.renderDealerTrumps();
      const name = trumpName(e.id);
      const text = e.on !== undefined ? t('px.dealerOn', { name, seat: this.nameOf(e.on) }) : t('px.dealerPlays', { name });
      this.sayDealer(name, 'lose');
      void hud.banner(name.toUpperCase(), text, 'small lose', 1100);
      await this.flyTrump(e.id, from, true);
      if (e.on !== undefined) {
        const sv = this.seatV(e.on);
        const c = onTable(sv.geo, 0, LY.cards);
        this.g.fx.glow(new THREE.Vector3(c.x, 0, c.z), 1.6, 1.5, 1.2, '#ff8f8f');
      }
      return;
    }
    const sv = this.seatV(e.who);
    if (sv.ai) {
      const from = this.centreOf(sv.fan?.lastElementChild);
      this.renderFan(sv);
      this.say(sv, trumpName(e.id), isAttack(e.id) ? 'lose' : 'win');
      await this.flyTrump(e.id, from, true);
      if (e.id === 'stakes') {
        const ai = sv.ai;
        ai.chips -= ai.bet;
        ai.stake += ai.bet;
        sfx.play('handle', { vol: 0.5 });
        await sv.raisePile!.dropIn(ai.bet, this.home(sv), 0.06);
      }
    } else {
      const from = this.centreOf(this.rowEl?.querySelector(`.trump.used`));
      this.renderTrumps();
      hud.toast(trumpDesc(e.id), 1500);
      await this.flyTrump(e.id, from, false);
      if (e.id === 'stakes') await this.place('stakes', this.spots.get('bet').amount);
      if (e.id === 'guard' || e.id === 'fortress' || e.id === 'barrier') {
        const c = onTable(sv.geo, 0, 0.3);
        this.g.fx.glow(new THREE.Vector3(c.x, 0, c.z), 2.0, 1.6, 1.4, '#8fd0ff');
      }
      if (e.id === 'tiebreak' || e.id === 'bullseye') {
        const c = onTable(sv.geo, 0, 0.3);
        this.g.fx.glow(new THREE.Vector3(c.x, 0, c.z), 2.0, 1.6, 1.4, '#ffd76a');
      }
    }
    if (e.id === 'stakes' || e.id === 'bounty') this.updateBubble(e.who);
  }

  /** The top card of the shoe while the player knows it (Foresight). */
  private updateNext(pop = false) {
    const p = this.nextPin;
    const r = this.round;
    if (!p) return;
    const n = r ? r.nextFor(ME) : null;
    if (n === null) {
      p.show(false);
      return;
    }
    p.el.innerHTML = `<small>${t('px.next')}</small><img alt="${n}" src="${cardDataURL(100 + n, 90)}">`;
    if (pop) p.pop();
    p.show(true);
  }

  // ---------------------------------------------------------------- the round
  protected advice() {
    const r = this.round;
    if (!r || !this.myTurn || !r.live(ME)) return null;
    const v = seatView(r, ME, this.g.wallet.canAfford(this.spots.get('bet').amount));
    const pick = aiTurn('calculated', v.hand, v.target, v.trumps, v.dealer, v.table, { streak: 0, hands: 0, last: null, lastNet: 0 }, this.rng);
    if (pick === 'hit') return { id: 'hit', msg: t('px.hintHit') };
    if (pick === 'stand') return { id: 'stand', msg: t('px.hintStand') };
    const el = this.rowEl?.querySelector(`.trump[data-id="${pick.trump}"]`);
    el?.classList.remove('fresh');
    void (el as HTMLElement | undefined)?.offsetWidth;
    el?.classList.add('fresh');
    return { id: '', msg: t('px.hintTrump', { name: trumpName(pick.trump) }) };
  }

  private askPlayer(): Promise<TurnPick> {
    const r = this.round!;
    return new Promise<TurnPick>((res) => {
      this.myTurn = true;
      this.resolveTurn = res;
      this.renderTrumps();
      const done = (p: TurnPick) => {
        if (!this.resolveTurn) return;
        this.resolveTurn = null;
        this.g.sfx.click();
        res(p);
      };
      this.actions([
        { id: 'stand', label: t('btn.stand'), color: 'red', icon: 'stand', onClick: () => done('stand') },
        { id: 'hit', label: t('btn.hit'), color: 'green', icon: 'hit', enabled: r.shoe.length > 0, onClick: () => done('hit') },
      ]);
    }).then((p) => {
      this.myTurn = false;
      this.g.hud.highlight(null);
      this.actions(null);
      this.renderTrumps();
      return p;
    });
  }

  protected async playRound() {
    const run = this.run;
    await this.aiBetting;
    await this.alive(run);
    // the seats in play order (first base first) with this round's bets and trump hands
    const seatsIn = Array.from({ length: N }, (_, s) => {
      const sv = this.seatV(s);
      return sv.ai ? { bet: sv.ai.bet, trumps: sv.ai.trumps } : { bet: this.spots.get('bet').amount, trumps: this.myTrumps, player: true };
    });
    const r = new PartyDuel(seatsIn, this.dealerTrumps, this.rng);
    this.round = r;
    for (const sv of this.seats) {
      sv.cards = [];
      sv.tagOn = false;
    }
    this.dealer = [];
    this.setTableTarget(21, false);
    this.updateStatus();
    await this.play(r.deal(), run);
    for (let s = 0; s < N; s++) {
      if (this.seatV(s).ai) await this.aiTurn(s, run);
      else await this.playerTurn(s, run);
    }
    await this.dealerTurn(run);
    await wait(0.3);
    await this.alive(run);
    await this.showdown(r.settle(), run);
  }

  private async aiTurn(s: number, run: number) {
    const { sfx } = this.g;
    const r = this.round!;
    const sv = this.seatV(s);
    const ai = sv.ai!;
    const mind = ai.mind ?? 'calculated';
    sv.active = true;
    this.updateBubble(s);
    let guard = 0;
    while (r.live(s) && guard++ < 30) {
      const v = seatView(r, s, ai.chips >= ai.bet);
      const close = closeCall(v.hand, v.target, v.dealer, v.table);
      this.say(sv, t('pb.think'), 'dealer');
      // brisk: five seats and trumps add up
      await wait(thinkTime(mind, close, this.rng) * 0.7);
      await this.alive(run);
      const pick = aiTurn(mind, v.hand, v.target, v.trumps, v.dealer, v.table, ai.mem, this.rng);
      if (pick === 'hit') {
        this.say(sv, t('px.hit'));
        sfx.tick(0.16, 1.5);
        await this.play(r.hit(s), run);
      } else if (pick === 'stand') {
        this.say(sv, t('px.stand'));
        sfx.play('slide', { vol: 0.3, rate: 1.3 });
        await this.play(r.stand(s), run);
      } else {
        const evs = r.useTrump(s, pick.trump);
        await this.play(evs.length ? evs : r.stand(s), run);
      }
      if (r.total(s) > r.targetOf(s) && r.live(s)) this.updateBubble(s);
    }
    if (r.live(s)) await this.play(r.stand(s), run);
    await wait(0.2);
    sv.active = false;
    this.updateBubble(s);
  }

  private async playerTurn(s: number, run: number) {
    const r = this.round!;
    const sv = this.seatV(s);
    sv.active = true;
    this.updateBubble(s);
    while (r.live(s)) {
      const pick = await this.askPlayer();
      await this.alive(run);
      if (typeof pick === 'object') {
        if (pick.trump === 'stakes' && !this.g.wallet.canAfford(this.spots.get('bet').amount)) {
          this.g.hud.toast(t('px.noFunds'));
          continue;
        }
        await this.play(r.useTrump(s, pick.trump), run);
        continue; // trumps don't end the turn
      }
      const p = r.total(s);
      await this.play(pick === 'hit' ? r.hit(s) : r.stand(s), run);
      if (pick === 'hit' && r.total(s) > r.targetOf(s) && p <= r.targetOf(s)) {
        this.say(sv, t('px.over'), 'lose');
        this.g.sfx.play('shove', { vol: 0.5 });
      }
    }
    this.myTurn = false;
    this.renderTrumps();
    sv.active = false;
    this.updateBubble(s);
  }

  /** The dealer turns the hole card over (done by the last stand) and plays by the house rule. */
  private async dealerTurn(run: number) {
    const r = this.round!;
    let guard = 0;
    while (!r.done && guard++ < 40) {
      await wait(0.38);
      await this.alive(run);
      const evs = r.dealerStep();
      if (!evs.length && r.reply === null) break;
      await this.play(evs, run);
      if (r.reply !== null) {
        const s = r.reply;
        if (this.seatV(s).ai) await this.aiTurn(s, run);
        else await this.playerTurn(s, run);
      }
    }
  }

  /** The regulars' private cards turn over, then every seat against the dealer, from third base to first. */
  private async showdown(res: SeatResult[], run: number) {
    const r = this.round!;
    const flips: Promise<void>[] = [];
    this.seats.forEach((sv, k) => {
      const c = sv.cards[0];
      if (sv.ai && c && !c.faceUp) flips.push(wait(k * 0.08).then(() => this.cardsT.flip(c, 0.4)));
    });
    await Promise.all(flips);
    r.seats.forEach((_, s) => this.updateBubble(s));
    await wait(0.25);
    await this.alive(run);
    const jobs = res.map((sr) => {
      const sv = this.seatV(sr.seat);
      const delay = sv.pos * 0.2;
      return sv.ai ? this.settleAi(sv, sr, delay) : this.settlePlayer(sv, sr, delay);
    });
    await Promise.all(jobs);
    await this.alive(run);
    for (const sr of res) {
      const ai = this.seatV(sr.seat).ai;
      if (ai && ai.mind) remember(ai.mem, ai.mind, sr.ret - sr.wager);
    }
    this.aiSweep = this.sweepAi(0.9);
  }

  private markResult(sv: SeatV, sr: SeatResult) {
    const { fx } = this.g;
    const win = sr.outcome > 0;
    this.say(sv, t(win ? 'px.win' : sr.ret > 0 ? 'px.refund' : 'px.lose'), win ? 'win' : 'lose');
    const text = sv.bubble.el.textContent ?? '';
    if (win) {
      sv.bubble.set(text, sr.total === sr.target ? 'bubble up bj win' : 'bubble up win');
      const c = onTable(sv.geo, 0, LY.cards);
      fx.glow(new THREE.Vector3(c.x, 0, c.z), 1.3, 1.3);
    } else sv.bubble.set(text, sr.total > sr.target ? 'bubble up bust lose' : 'bubble up lose');
  }

  private async settlePlayer(sv: SeatV, sr: SeatResult, delay: number) {
    const r = this.round!;
    await wait(delay);
    this.markResult(sv, sr);
    if (sr.outcome > 0) {
      const c = onTable(sv.geo, 0, LY.cards);
      this.g.fx.burst(new THREE.Vector3(c.x, 0.3, c.z), sr.total === sr.target ? 150 : 80);
    }
    const ret = { bet: r.payout(ME, this.spots.get('bet').amount), stakes: r.payout(ME, this.spots.get('stakes').amount) };
    const big = sr.outcome > 0 && sr.total === sr.target ? `${sr.target}!` : undefined;
    await this.settle(ret, { big });
  }

  /** The dealer pays a regular's win from the rack, or takes the stake (handing back a Guard or Fortress refund). */
  private async settleAi(sv: SeatV, sr: SeatResult, delay: number) {
    const { stage, chips, sfx } = this.g;
    await wait(delay);
    this.markResult(sv, sr);
    const ai = sv.ai!;
    const top = stage.screenToTable(0.5, -0.08);
    const jobs: Promise<void>[] = [];
    const payPile = (amount: number) => {
      const at = onTable(sv.geo, RING.stakes.lx + 0.42, 0);
      const p = new ChipPile(chips, stage.table, new THREE.Vector3(at.x * 0.6, 0, top.z));
      p.set(amount);
      sv.payouts.push(p);
      jobs.push(slideChips(p.group, new THREE.Vector3(at.x, 0, at.z), 0.55, 0.15, 'power3.out').then(() => sfx.play('stack', { vol: 0.5 })));
    };
    if (sr.ret > sr.wager) payPile(sr.ret - sr.wager);
    else if (sr.ret < sr.wager) {
      for (const pile of [sv.betPile!, sv.raisePile!]) {
        if (!pile.amount) continue;
        const home = pile.group.position.clone();
        sfx.play('handle', { vol: 0.4 });
        jobs.push(
          slideChips(pile.group, new THREE.Vector3(pile.group.position.x * 0.3, 0, top.z), 0.6, 0.12, 'power2.in').then(() => {
            pile.clear();
            pile.group.position.copy(home);
          }),
        );
      }
      if (sr.ret > 0) payPile(sr.ret);
    }
    ai.owed = sr.ret;
    await Promise.all(jobs);
  }
}
