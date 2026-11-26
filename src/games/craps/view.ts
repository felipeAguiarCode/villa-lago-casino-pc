import * as THREE from 'three';
import gsap from 'gsap';
import { addStrings, t } from '../../core/i18n';
import { cryptoRng } from '../../core/rng';
import { money } from '../../core/wallet';
import { wait } from '../../table/anim';
import { CHIP_H, ChipPile } from '../../table/chips';
import { ICONS } from '../../ui/icons';
import type { Pin } from '../../ui/hud';
import { finishXP, resultBanner, type SpotDef } from '../kit';
import { CHIP_ROW, TableGame } from '../tableGame';
import type { GameCtx } from '../types';
import { Dice3D } from './dice3d';
import { HALF, pipTurn, qMul, qSlerp, randomQ, sample, simulateThrow, type Arena, type Q, type SimEvent, type SimOut, type V3 } from './diceSim';
import { areaOf, crapsLayout, DIM, type CrapsLayout, type Pt } from './layout';
import { crapsPrint, type PrintText } from './print';
import {
  advise,
  betInfo,
  canAdd,
  canTake,
  cloneState,
  contractBets,
  exactStep,
  fullOdds,
  isOdds,
  LIMITS,
  maxFor,
  newState,
  oddsOf,
  POINTS,
  removable,
  resolveRoll,
  rollDice,
  totalOn,
  validateRoll,
  type BetError,
  type CrapsState,
  type RollEvent,
  type RollResult,
  type Rules,
} from './rules';
import { CrapsTable3D } from './table3d';

addStrings(
  {
    'cr.title': 'CRAPS',
    'cr.house': 'VILLA LAGO',
    'cr.wall': 'Dice must hit the back wall',
    'cr.shooter': 'SHOOTER',
    'cr.pass': 'PASS LINE',
    'cr.dontPass': "DON'T PASS BAR",
    'cr.dontCome1': "DON'T",
    'cr.dontCome2': 'COME',
    'cr.dontCome3': 'BAR',
    'cr.come': 'COME',
    'cr.field': 'FIELD',
    'cr.big': 'BIG',
    'cr.place': 'PLACE',
    'cr.dcLay': "DON'T COME · LAY",
    'cr.pays': '{a} TO {b}',
    'cr.payDouble': 'PAYS DOUBLE',
    'cr.payTriple': 'PAYS TRIPLE',
    'cr.seven': 'SEVEN',
    'cr.anyCraps': 'ANY CRAPS',
    'cr.horn': 'HORN',
    'cr.hornSub': '2 · 3 · 11 · 12',
    'cr.ce': 'CRAPS 3:1 · ELEVEN 7:1',
    'cr.box4': '4',
    'cr.box5': '5',
    'cr.box6': 'SIX',
    'cr.box8': '8',
    'cr.box9': 'NINE',
    'cr.box10': '10',
    'cr.on': 'ON',
    'cr.off': 'OFF',
    'cr.w2': 'TWO',
    'cr.w3': 'THREE',
    'cr.w4': 'FOUR',
    'cr.w5': 'FIVE',
    'cr.w6': 'SIX',
    'cr.w7': 'SEVEN',
    'cr.w8': 'EIGHT',
    'cr.w9': 'NINE',
    'cr.w10': 'TEN',
    'cr.w11': 'ELEVEN',
    'cr.w12': 'TWELVE',
    'cr.b.pass': 'Pass Line',
    'cr.b.dpass': "Don't Pass",
    'cr.b.passOdds': 'Pass Line odds',
    'cr.b.dpassOdds': "Don't Pass lay odds",
    'cr.b.come': 'Come',
    'cr.b.dcome': "Don't Come",
    'cr.b.comePt': 'Come {n}',
    'cr.b.comeOdds': 'Odds on come {n}',
    'cr.b.dcPt': "Don't Come {n}",
    'cr.b.dcOdds': 'Lay odds on {n}',
    'cr.b.place': 'Place {n}',
    'cr.b.field': 'Field',
    'cr.b.big': 'Big {n}',
    'cr.b.hard': 'Hard {n}',
    'cr.b.any7': 'Any 7',
    'cr.b.anyCraps': 'Any Craps',
    'cr.b.prop': '{n}',
    'cr.b.horn': 'Horn',
    'cr.b.ce': 'C & E',
    'cr.roll': 'Roll',
    'cr.odds': 'Odds',
    'cr.down': 'Take Down',
    'cr.err.shooter': "The shooter must bet the Pass Line or Don't Pass",
    'cr.err.horn': 'The Horn is split four ways: bet a multiple of 4 (20, 40, 100…)',
    'cr.err.ce': 'C & E is split two ways: bet an even amount (10, 20…)',
    'cr.err.lineComeOut': 'Line bets are made on the come-out roll',
    'cr.err.comeNeedsPoint': 'Come bets are made once a point is set',
    'cr.err.comeMoves': 'Come bets travel here when their number rolls',
    'cr.err.noFlat': 'Odds go behind a line or come bet with a point',
    'cr.err.maxOdds': 'Maximum odds here: {n}',
    'cr.err.contract': 'A contract bet: it stays until it wins or loses',
    'cr.warn.exact': '{bet} pays {r}: bet multiples of {n} to be paid in full (fractions round down)',
    'cr.noOdds': 'No odds to take right now',
    'cr.noRebet': 'Nothing to rebet',
    'cr.drag': 'DRAG THE DICE TO THROW · R',
    'cr.restored': 'Your bets are still working · the point is {p}',
    'cr.restoredOff': 'Your bets are back on the layout',
    'cr.pending': 'Your last roll was settled: {n}',
    'cr.call.winner7': 'WINNER 7!',
    'cr.call.frontLine': 'FRONT LINE WINNER',
    'cr.call.yo': 'YO-LEVEN!',
    'cr.call.craps': 'CRAPS!',
    'cr.call.aces': 'ACES · TWO',
    'cr.call.aceDeuce': 'ACE-DEUCE · THREE',
    'cr.call.boxcars': 'BOXCARS · TWELVE',
    'cr.call.lineAway': 'LINE AWAY',
    'cr.call.pointIs': 'POINT IS {n}',
    'cr.call.markIt': 'MARK IT',
    'cr.call.sevenOut': 'SEVEN OUT!',
    'cr.call.newShooter': 'HAND OVER · {r} ROLLS · {m} POINTS',
    'cr.call.winner': 'WINNER {n}!',
    'cr.call.pointMade': 'POINT MADE',
    'cr.call.hardWay': 'THE HARD WAY',
    'cr.call.hard': 'HARD {n}!',
    'cr.call.easy': 'EASY {n}',
    'cr.call.nine': 'NINE · CENTER FIELD',
    'cr.call.five': 'FIVE · NO FIELD FIVE',
    'cr.call.acesP': 'ACES!',
    'cr.call.aceDeuceP': 'ACE-DEUCE!',
    'cr.call.boxcarsP': 'BOXCARS!',
    'cr.call.plain': '{n}',
    'cr.call.hot': 'HOT ROLL!',
    'cr.big.hot': 'HOT ROLL · {n} POINTS',
    'cr.big.30': '{n} · 30 TO 1',
    'cr.last': 'LAST ROLLS',
    'cr.none': 'No rolls yet',
    'cr.boardPoint': 'POINT {n}',
    'cr.boardOff': 'COME-OUT ROLL',
    'cr.boardHand': 'Shooter: {r} rolls · {m} points made',
    'cr.working': 'Place & hardways on the come-out',
    'cr.workOn': 'WORKING',
    'cr.workOff': 'OFF',
    'cr.hint.pass': 'Best bet: the Pass Line (house edge 1.41%). Put a chip on it, then back it with full odds once a point is set.',
    'cr.hint.odds': 'Take full odds behind the Pass Line: {n} more. Odds pay true odds, with no house edge.',
    'cr.hint.roll': 'Pass Line with full 3-4-5× odds: just 0.37% on everything bet, the best game in the house. Roll!',
    'cr.hint.rollPlain': 'Roll the dice! The lowest-edge plays are the Pass Line, Come and full odds.',
    'cr.rules': `
      <p>Craps against the house, and <b>you are the shooter</b>. Choose a chip and click a betting place on the layout (right-click takes a chip back where the rules allow), then press <b>Roll</b> (or the R key) — or grab the dice under the centre box and throw them with a flick toward the back wall.</p>
      <h4>Come-out and point</h4>
      <p>The first roll of a hand is the <b>come-out</b>: 7 or 11 win the Pass Line, 2, 3 or 12 (craps) lose it. Any other number (4, 5, 6, 8, 9, 10) becomes the <b>point</b> and the puck turns ON over its box. The shooter then rolls until the point comes again (the Pass Line wins and a new come-out follows) or a 7 shows: <b>seven out</b>, and the hand is over. Three or more points made in one hand is a <b>hot roll</b>.</p>
      <h4>Line bets</h4>
      <p><b>Pass Line</b> and <b>Don't Pass</b> pay 1:1 and are made on the come-out roll; Don't Pass is the opposite bet, except that a come-out 12 is a push (<b>bar 12</b>). The shooter must have one of them to roll the come-out. <b>Come</b> and <b>Don't Come</b> work the same way while a point is on: the next roll is their own come-out, and their chips travel to the number that rolls. Pass and come bets on a number are contract bets and stay until decided; don't bets can be taken down.</p>
      <h4>Free odds, 3-4-5×</h4>
      <p>Once a line or come bet has a number, back it with odds paid at <b>true odds, with no house edge</b>: 4 or 10 pays 2:1, 5 or 9 pays 3:2, 6 or 8 pays 6:5 — up to 3× the bet on 4/10, 4× on 5/9 and 5× on 6/8. Don't bettors <b>lay</b> the odds (1:2, 2:3, 5:6) up to 6×. Click a line bet or a come point to add odds, or press <b>Odds</b> for the full amount. Come odds are off on the come-out roll.</p>
      <h4>Place, Field, Big 6/8 and Hardways</h4>
      <p><b>Place</b> 4 or 10 pays 9:5, 5 or 9 7:5, 6 or 8 7:6; a 7 loses them; they are off on the come-out roll unless you switch them to <b>working</b> on the board (hardways too), and can be taken down any time. The <b>Field</b> is a one-roll bet on 2, 3, 4, 9, 10, 11 and 12: 1:1, with 2 paying 2:1 and 12 paying 3:1. <b>Big 6 / Big 8</b> pay 1:1 if the number comes before a 7. <b>Hardways</b> (a pair: 2-2, 3-3, 4-4, 5-5) pay 7:1 on hard 4 and 10 and 9:1 on hard 6 and 8; they lose to a 7 or to their number rolled the easy way, and are off on the come-out roll.</p>
      <h4>Proposition bets, one roll</h4>
      <p>Any 7 4:1 · Any Craps 7:1 · 2 or 12 30:1 · 3 or 11 15:1 · <b>Horn</b>: a quarter on each of 2, 3, 11 and 12 (bet a multiple of 4) · <b>C &amp; E</b>: half on any craps and half on 11, paying 3:1 on craps and 7:1 on 11 (bet an even amount).</p>
      <h4>Payouts and rounding</h4>
      <p>Chips are whole, so a payout with a fraction is <b>rounded down</b>, as casinos do. Bet 6/8 place bets in 30s and 5/9 odds in 10s, and lay 4/10 in 10s, 5/9 in 15s and 6/8 in 30s, to be paid in full; full odds from the <b>Odds</b> key always pay exactly. Winning line, place, field and centre bets stay up for the next roll and the winnings come to you. Limits: 5 to 2,000 on line, place and field bets; up to 500 in the centre box.</p>
      <h4>House edge</h4>
      <p>Pass / Come 1.41% · Don't Pass / Don't Come 1.36% · Odds 0% · Place 6/8 1.52% · Place 5/9 4% · Place 4/10 6.67% · Field 2.78% · Big 6/8 9.09% · Hard 6/8 9.09% · Hard 4/10 11.1% · Any Craps, 3, 11, C&amp;E 11.1% · Horn 12.5% · 2 or 12 13.9% · Any 7 16.7%.</p>
      <h4>Strategy</h4>
      <p>The best play is the <b>Pass Line with full odds</b>: only 0.37% on everything bet. The bulb shows it. Steer clear of the centre box.</p>`,
  },
  {
    'cr.wall': 'Os dados devem bater na parede do fundo',
    'cr.shooter': 'ATIRADOR',
    'cr.payDouble': 'PAGA DOBRO',
    'cr.payTriple': 'PAGA TRIPLO',
    'cr.pays': '{a} PARA {b}',
    'cr.place': 'PLACE',
    'cr.seven': 'SETE',
    'cr.anyCraps': 'QUALQUER CRAPS',
    'cr.ce': 'CRAPS 3:1 · ONZE 7:1',
    'cr.box6': 'SEIS',
    'cr.box9': 'NOVE',
    'cr.w2': 'DOIS',
    'cr.w3': 'TRÊS',
    'cr.w4': 'QUATRO',
    'cr.w5': 'CINCO',
    'cr.w6': 'SEIS',
    'cr.w7': 'SETE',
    'cr.w8': 'OITO',
    'cr.w9': 'NOVE',
    'cr.w10': 'DEZ',
    'cr.w11': 'ONZE',
    'cr.w12': 'DOZE',
    'cr.b.pass': 'Pass Line (linha)',
    'cr.b.dpass': "Don't Pass (contra)",
    'cr.b.passOdds': 'Odds da Pass Line',
    'cr.b.dpassOdds': "Odds da Don't Pass",
    'cr.b.come': 'Come',
    'cr.b.dcome': "Don't Come",
    'cr.b.comePt': 'Come no {n}',
    'cr.b.comeOdds': 'Odds do come no {n}',
    'cr.b.dcPt': "Don't Come no {n}",
    'cr.b.dcOdds': 'Odds contra no {n}',
    'cr.b.place': 'Place {n}',
    'cr.b.field': 'Field',
    'cr.b.big': 'Big {n}',
    'cr.b.hard': '{n} na dupla',
    'cr.b.any7': 'Qualquer 7',
    'cr.b.anyCraps': 'Qualquer craps',
    'cr.b.horn': 'Horn',
    'cr.b.ce': 'C & E',
    'cr.roll': 'Lançar',
    'cr.odds': 'Odds',
    'cr.down': 'Retirar',
    'cr.err.shooter': "O atirador precisa apostar na Pass Line ou na Don't Pass",
    'cr.err.horn': 'A Horn é dividida em quatro: aposte um múltiplo de 4 (20, 40, 100…)',
    'cr.err.ce': 'C & E é dividida em duas: aposte um valor par (10, 20…)',
    'cr.err.lineComeOut': 'As apostas de linha são feitas no lançamento de saída',
    'cr.err.comeNeedsPoint': 'As apostas Come são feitas depois que há um ponto',
    'cr.err.comeMoves': 'As apostas Come vêm para cá quando o número delas sai',
    'cr.err.noFlat': 'As odds ficam atrás de uma aposta de linha ou come com ponto',
    'cr.err.maxOdds': 'Odds máximas aqui: {n}',
    'cr.err.contract': 'Aposta de contrato: fica até ganhar ou perder',
    'cr.warn.exact': '{bet} paga {r}: aposte múltiplos de {n} para receber tudo (frações são arredondadas para baixo)',
    'cr.noOdds': 'Não há odds para pegar agora',
    'cr.noRebet': 'Nada para repetir',
    'cr.drag': 'ARRASTE OS DADOS PARA LANÇAR · R',
    'cr.restored': 'Suas apostas continuam valendo · o ponto é {p}',
    'cr.restoredOff': 'Suas apostas voltaram ao pano',
    'cr.pending': 'Seu último lançamento foi pago: {n}',
    'cr.call.winner7': 'SETE, GANHA!',
    'cr.call.frontLine': 'A LINHA GANHA',
    'cr.call.yo': 'YO, ONZE!',
    'cr.call.craps': 'CRAPS!',
    'cr.call.aces': 'DOIS ASES',
    'cr.call.aceDeuce': 'ÁS E DOIS · TRÊS',
    'cr.call.boxcars': 'DOIS SEIS · DOZE',
    'cr.call.lineAway': 'A LINHA PERDE',
    'cr.call.pointIs': 'O PONTO É {n}',
    'cr.call.markIt': 'MARQUE O PONTO',
    'cr.call.sevenOut': 'SAIU O SETE!',
    'cr.call.newShooter': 'FIM DA MÃO · {r} LANÇAMENTOS · {m} PONTOS',
    'cr.call.winner': 'GANHA O {n}!',
    'cr.call.pointMade': 'PONTO FEITO',
    'cr.call.hardWay': 'NA DUPLA',
    'cr.call.hard': '{n} NA DUPLA!',
    'cr.call.easy': '{n} SIMPLES',
    'cr.call.nine': 'NOVE · NO MEIO DO FIELD',
    'cr.call.five': 'CINCO · FORA DO FIELD',
    'cr.call.acesP': 'DOIS ASES!',
    'cr.call.aceDeuceP': 'ÁS E DOIS!',
    'cr.call.boxcarsP': 'DOIS SEIS!',
    'cr.call.hot': 'MÃO QUENTE!',
    'cr.big.hot': 'MÃO QUENTE · {n} PONTOS',
    'cr.big.30': '{n} · 30 PARA 1',
    'cr.last': 'ÚLTIMOS LANÇAMENTOS',
    'cr.none': 'Nenhum lançamento ainda',
    'cr.boardPoint': 'PONTO {n}',
    'cr.boardOff': 'LANÇAMENTO DE SAÍDA',
    'cr.boardHand': 'Atirador: {r} lançamentos · {m} pontos feitos',
    'cr.working': 'Place e hardways na saída',
    'cr.workOn': 'VALENDO',
    'cr.workOff': 'DESLIGADAS',
    'cr.hint.pass': 'Melhor aposta: a Pass Line (vantagem da casa 1,41%). Ponha uma ficha nela e, quando houver ponto, complete com as odds máximas.',
    'cr.hint.odds': 'Pegue as odds máximas atrás da Pass Line: mais {n}. As odds pagam o valor justo, sem vantagem da casa.',
    'cr.hint.roll': 'Pass Line com odds 3-4-5× completas: só 0,37% sobre tudo o que é apostado, o melhor jogo da casa. Lance!',
    'cr.hint.rollPlain': 'Lance os dados! As apostas de menor vantagem são Pass Line, Come e as odds completas.',
    'cr.rules': `
      <p>Craps contra a casa, e <b>você é o atirador</b>. Escolha uma ficha e clique num lugar do pano (o botão direito tira uma ficha onde as regras deixam), depois aperte <b>Lançar</b> (ou a tecla R) — ou pegue os dados sob o quadro central e jogue-os com um movimento rápido em direção à parede do fundo.</p>
      <h4>Saída e ponto</h4>
      <p>O primeiro lançamento de uma mão é a <b>saída</b> (come-out): 7 ou 11 ganham a Pass Line; 2, 3 ou 12 (craps) perdem. Qualquer outro número (4, 5, 6, 8, 9, 10) vira o <b>ponto</b> e o marcador vira para ON sobre a casa dele. O atirador então lança até o ponto sair de novo (a Pass Line ganha e vem nova saída) ou até sair um 7: <b>seven out</b>, e a mão acaba. Três ou mais pontos feitos na mesma mão é uma <b>mão quente</b>.</p>
      <h4>Apostas de linha</h4>
      <p><b>Pass Line</b> e <b>Don't Pass</b> pagam 1:1 e são feitas na saída; a Don't Pass é a aposta contrária, só que o 12 na saída empata (<b>bar 12</b>). O atirador precisa ter uma delas para lançar a saída. <b>Come</b> e <b>Don't Come</b> funcionam igual enquanto há ponto: o próximo lançamento é a saída delas, e as fichas vão para o número que sair. Pass e come num número são apostas de contrato e ficam até serem decididas; as apostas contra podem ser retiradas.</p>
      <h4>Odds livres, 3-4-5×</h4>
      <p>Quando uma aposta de linha ou come tem um número, reforce-a com odds pagas pelo <b>valor justo, sem vantagem da casa</b>: 4 ou 10 paga 2:1, 5 ou 9 paga 3:2, 6 ou 8 paga 6:5 — até 3× a aposta no 4/10, 4× no 5/9 e 5× no 6/8. Quem joga contra <b>dá</b> as odds (1:2, 2:3, 5:6) até 6×. Clique numa aposta de linha ou num ponto de come para pôr odds, ou aperte <b>Odds</b> para o valor máximo. As odds do come não valem na saída.</p>
      <h4>Place, Field, Big 6/8 e Hardways</h4>
      <p><b>Place</b> 4 ou 10 paga 9:5, 5 ou 9 7:5, 6 ou 8 7:6; o 7 as derruba; não valem na saída, a não ser que você as ligue (<b>valendo</b>) no quadro (as hardways também), e podem ser retiradas a qualquer momento. O <b>Field</b> é uma aposta de um lançamento em 2, 3, 4, 9, 10, 11 e 12: 1:1, com o 2 pagando 2:1 e o 12 pagando 3:1. <b>Big 6 / Big 8</b> pagam 1:1 se o número sair antes do 7. As <b>hardways</b> (um par: 2-2, 3-3, 4-4, 5-5) pagam 7:1 no 4 e no 10 e 9:1 no 6 e no 8; perdem para o 7 ou para o número saindo sem par, e não valem na saída.</p>
      <h4>Apostas de proposição, um lançamento</h4>
      <p>Qualquer 7 4:1 · Qualquer craps 7:1 · 2 ou 12 30:1 · 3 ou 11 15:1 · <b>Horn</b>: um quarto em cada um de 2, 3, 11 e 12 (aposte múltiplos de 4) · <b>C &amp; E</b>: metade em qualquer craps e metade no 11, pagando 3:1 no craps e 7:1 no 11 (aposte valor par).</p>
      <h4>Pagamentos e arredondamento</h4>
      <p>As fichas são inteiras, então um pagamento com fração é <b>arredondado para baixo</b>, como nos cassinos. Aposte o place 6/8 de 30 em 30 e as odds 5/9 de 10 em 10, e dê odds no 4/10 de 10 em 10, no 5/9 de 15 em 15 e no 6/8 de 30 em 30, para receber tudo; as odds completas da tecla <b>Odds</b> sempre pagam exato. Apostas de linha, place, field e do centro que ganham continuam no pano para o próximo lançamento, e o prêmio vem para você. Limites: 5 a 2.000 em linha, place e field; até 500 no quadro central.</p>
      <h4>Vantagem da casa</h4>
      <p>Pass / Come 1,41% · Don't Pass / Don't Come 1,36% · Odds 0% · Place 6/8 1,52% · Place 5/9 4% · Place 4/10 6,67% · Field 2,78% · Big 6/8 9,09% · 6/8 na dupla 9,09% · 4/10 na dupla 11,1% · Qualquer craps, 3, 11, C&amp;E 11,1% · Horn 12,5% · 2 ou 12 13,9% · Qualquer 7 16,7%.</p>
      <h4>Estratégia</h4>
      <p>A melhor jogada é a <b>Pass Line com odds completas</b>: só 0,37% sobre tudo o que é apostado. A lâmpada mostra. Fuja do quadro central.</p>`,
  },
);

/** The craps felt once it is in FELTS; the roulette green until then. */
const FELT = 'craps' as const;
/** Chips on the layout are a little smaller, so they sit inside the boxes. */
const CHIP_SCALE = 0.8;
const STORE_KEY = 'vlc.craps.table.v1';
/** Throws play a little slower than real time, so the eye can follow the dice. */
const TIME_SCALE = 0.82;
const CLICK_IDS = [
  'pass',
  'dpass',
  'come',
  'dcome',
  'field',
  'big6',
  'big8',
  ...POINTS.flatMap((n) => [`place${n}`, `c${n}`, `dc${n}`]),
  'hard4',
  'hard6',
  'hard8',
  'hard10',
  'any7',
  'anyCraps',
  'p2',
  'p3',
  'p11',
  'p12',
  'horn',
  'ce',
];
const AUTO_IDS = ['passOdds', 'dpassOdds', ...POINTS.flatMap((n) => [`co${n}`, `dco${n}`])];
const ALIAS: Record<string, string> = { passV: 'pass', dpassV: 'dpass' };

interface Saved {
  v: 1;
  st: CrapsState;
  hist: [number, number, RollEvent][];
  faces: [number, number];
  hands: number;
  pending: [number, number] | null;
  /** Place bets and hardways work on the come-out roll. */
  working?: boolean;
}

interface DragThrow {
  hand: V3;
  from: [V3, V3];
  aim: { x: number; z: number };
  power: number;
}

export class CrapsView extends TableGame {
  readonly id = 'craps';
  readonly title = 'Craps';
  protected readonly felt = FELT;
  protected usesCards = false;
  protected placeOnSpotClick = true;
  private L!: CrapsLayout;
  private st: CrapsState = newState();
  private hist: [number, number, RollEvent][] = [];
  private faces: [number, number] = [6, 1];
  private visited = false;
  private pendingNote = '';
  private t3: CrapsTable3D | null = null;
  private dice: Dice3D | null = null;
  private offFrame: (() => void) | null = null;
  private board: HTMLElement | null = null;
  private hl: THREE.Group | null = null;
  private hlMeshes = new Map<string, THREE.Mesh[]>();
  private hover: string | null = null;
  private winKeys = new Set<string>();
  private flashKeys = new Set<string>();
  private flashUntil = 0;
  private clock = 0;
  private tmpV = new THREE.Vector3();
  /** Winnings piles paid out by the house this roll. */
  private paid: ChipPile[] = [];
  /** Bets lost on the last roll (for Rebet). */
  private lastLost: Record<string, number> = {};
  private warned = new Set<string>();
  /** Where the stickman's last call is pinned. */
  private callAt: Pt = { x: 0, z: 0 };
  private throwSpec: DragThrow | null = null;
  private simRun: { sim: SimOut; t: number; fired: number; done: () => void } | null = null;
  private lastClack = [0, 0];
  private dragEl: HTMLElement | null = null;
  private dragPin: Pin | null = null;
  private drag: { id: number; hand: V3; trail: { t: number; x: number; z: number }[]; spin: THREE.Quaternion[]; lastShake: number } | null = null;
  private keyFn: ((e: KeyboardEvent) => void) | null = null;
  /** The player's "working" call for place bets and hardways on the come-out roll. */
  private working = false;

  constructor(g: GameCtx) {
    super(g, 1);
  }

  rules() {
    return t('cr.rules');
  }

  get inRound() {
    return this.phase === 'playing' || this.phase === 'shuffling' || !!this.drag;
  }

  /** Chips the player has on the layout: they were taken from the rack when they were bet. */
  get onFelt() {
    return totalOn(this.st);
  }

  /** Game over and the free refill count the chips already on the layout. */
  stakeOnTable() {
    return this.onFelt;
  }

  protected defaultBets() {
    return {};
  }

  // ---------------------------------------------------------------- saved table
  private load() {
    this.pendingNote = '';
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as Saved;
      if (s.v !== 1 || !s.st || typeof s.st.point !== 'number') return;
      this.visited = true;
      // a bankroll reset (the hand counter starts again) wipes the table too
      if (this.g.wallet.s.hands < (s.hands ?? 0)) {
        this.st = newState();
        this.save();
        return;
      }
      const bets: Record<string, number> = {};
      for (const [id, a] of Object.entries(s.st.bets ?? {})) {
        try {
          betInfo(id);
          if (Number.isInteger(a) && a > 0) bets[id] = a;
        } catch {
          /* unknown place: ignore */
        }
      }
      this.st = { point: [0, ...POINTS].includes(s.st.point as 0) ? s.st.point : 0, bets, rolls: s.st.rolls | 0, made: s.st.made | 0 };
      this.hist = Array.isArray(s.hist) ? s.hist.slice(0, 14) : [];
      if (Array.isArray(s.faces)) this.faces = [s.faces[0] || 6, s.faces[1] || 1];
      this.working = !!s.working;
      if (s.pending) {
        // the page closed while the dice were rolling: the roll was drawn, so settle it now
        const [d1, d2] = s.pending;
        const res = resolveRoll(this.st, d1, d2, this.rulesNow());
        this.g.wallet.credit(res.credit);
        this.st = res.next;
        this.faces = [d1, d2];
        this.hist.unshift([d1, d2, res.event]);
        this.pendingNote = t('cr.pending', { n: d1 + d2 });
        this.save();
      }
    } catch {
      /* storage blocked or corrupt: a fresh table */
    }
  }

  private rulesNow(): Rules {
    return { placeOnComeOut: this.working, hardOnComeOut: this.working };
  }

  private save(pending: [number, number] | null = null) {
    try {
      const s: Saved = { v: 1, st: this.st, hist: this.hist.slice(0, 14), faces: this.faces, hands: this.g.wallet.s.hands, pending, working: this.working };
      localStorage.setItem(STORE_KEY, JSON.stringify(s));
    } catch {
      /* ignore */
    }
  }

  async enter() {
    this.load();
    await super.enter();
    if (this.phase !== 'betting') return;
    // bets still on the layout from before
    for (const [id, a] of Object.entries(this.st.bets)) if (this.spots.spots.has(id)) this.pile(id).set(a);
    this.syncPiles();
    if (this.pendingNote) this.g.hud.toast(this.pendingNote, 2600);
    else if (contractBets(this.st).length) this.g.hud.toast(t('cr.restored', { p: t(`cr.w${this.st.point}`) }), 2600);
    else if (totalOn(this.st) > 0) this.g.hud.toast(t('cr.restoredOff'), 2000);
    if (!this.visited && totalOn(this.st) === 0 && this.st.point === 0 && this.g.wallet.canAfford(25)) {
      // first visit: a chip on the Pass Line, the best bet on the table
      this.g.wallet.debit(25);
      this.st.bets.pass = 25;
      await this.pile('pass').dropIn(25, this.fromPlayer());
    }
    this.visited = true;
    this.save();
    this.refreshBetUi();
  }

  // ---------------------------------------------------------------- layout
  /** Frame position (u, v) of a table point: the inverse of stage.screenToTable. */
  private toUV(x: number, z: number) {
    const st = this.g.stage;
    let lo = -2;
    let hi = 3;
    for (let i = 0; i < 48; i++) {
      const m = (lo + hi) / 2;
      if (st.screenToTable(0.5, m, 0, this.tmpV).z < z) lo = m;
      else hi = m;
    }
    const v = (lo + hi) / 2;
    const half = st.screenToTable(1, v, 0, this.tmpV).x;
    return { u: 0.5 + (0.5 * x) / half, v };
  }

  private betName(id: string) {
    const b = betInfo(id);
    if (b.kind === 'prop') return id === 'any7' || id === 'anyCraps' ? t(`cr.b.${id}`) : t('cr.b.prop', { n: b.n });
    return t(`cr.b.${b.kind}`, { n: b.n });
  }

  protected spotDefs(): SpotDef[] {
    const a = this.g.stage.screenToTable(0.5, 0.5);
    this.L = crapsLayout(a.x, a.z);
    const L = this.L;
    const defs: SpotDef[] = [];
    const area = (spotId: string, betId: string, i: number) => {
      const r = L.areas.get(betId)![i];
      const { u, v } = this.toUV(r.x, r.z);
      defs.push({ id: spotId, label: this.betName(betId), u, v, ring: false, size: Math.min(r.w, r.h), hitW: r.w, hitH: r.h, max: maxFor(newState(), betId) || LIMITS.line });
    };
    for (const id of CLICK_IDS) area(id, id, 0);
    area('passV', 'pass', 1);
    area('dpassV', 'dpass', 1);
    for (const id of AUTO_IDS) {
      const p = L.piles.get(id)!;
      const { u, v } = this.toUV(p.x, p.z);
      defs.push({ id, label: this.betName(id), u, v, ring: false, auto: true, size: 0.4 });
    }
    return defs;
  }

  private printText(): PrintText {
    return {
      pass: t('cr.pass'),
      dontPass: t('cr.dontPass'),
      dontCome: [t('cr.dontCome1'), t('cr.dontCome2'), t('cr.dontCome3')],
      come: t('cr.come'),
      field: t('cr.field'),
      big: t('cr.big'),
      place: t('cr.place'),
      dcLay: t('cr.dcLay'),
      pays: (a, b) => t('cr.pays', { a, b }),
      payDouble: t('cr.payDouble'),
      payTriple: t('cr.payTriple'),
      seven: t('cr.seven'),
      anyCraps: t('cr.anyCraps'),
      horn: t('cr.horn'),
      hornSub: t('cr.hornSub'),
      ce: t('cr.ce'),
      house: t('cr.house'),
      title: t('cr.title'),
      wall: t('cr.wall').toUpperCase(),
      shooter: t('cr.shooter'),
      numberNames: Object.fromEntries(POINTS.map((n) => [n, t(`cr.box${n}`)])),
    };
  }

  protected decorate() {
    const { table, stage } = this.g;
    const L = this.L;
    const P = L.print;
    table.addDecalAt(crapsPrint(L, this.printText()), (P.x0 + P.x1) / 2, (P.z0 + P.z1) / 2, P.x1 - P.x0);
    if (!this.t3) {
      this.t3 = new CrapsTable3D(L, stage.scene.environment, this.g.chips, { on: t('cr.on'), off: t('cr.off') });
      stage.table.add(this.t3.group);
      this.dice = new Dice3D(stage.scene.environment, this.t3.shadowTex);
      stage.table.add(this.dice.group);
      this.offFrame = stage.onFrame((dt) => this.frame(dt));
      this.bindInput();
    }
    const puck = this.t3.puck;
    puck.setOn(this.st.point !== 0);
    puck.place(this.st.point ? L.puckOn.get(this.st.point)! : L.puckOff);
    this.restDiceHome();
    this.buildHighlights();
    for (const s of this.spots.spots.values()) {
      const p = L.piles.get(s.def.id);
      if (p) s.pile.group.position.set(p.x, 0, p.z);
      s.pile.group.scale.setScalar(CHIP_SCALE);
      s.label.el.style.fontSize = 'calc(3.5 * var(--u))';
      const target = ALIAS[s.def.id] ?? s.def.id;
      s.hit.addEventListener('pointerenter', () => (this.hover = areaOf(target)));
      s.hit.addEventListener('pointerleave', () => {
        if (this.hover === areaOf(target)) this.hover = null;
      });
    }
    this.buildBoard();
  }

  /** The dice wait for the shooter under the centre box, showing the last roll. */
  private restDiceHome() {
    const d = this.dice!;
    const h = this.L.home;
    for (const i of [0, 1]) {
      const yaw = (i ? 0.35 : -0.25) + (Math.random() - 0.5) * 0.4;
      d.setPose(i, { x: h.x + (i ? 0.14 : -0.14), y: HALF, z: h.z + (i ? 0.03 : -0.03) }, { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
      d.setPipTurn(i, pipTurn(2, this.faces[i], i * 2 + 1));
    }
  }

  // ---------------------------------------------------------------- highlights
  private buildHighlights() {
    this.disposeHighlights();
    const grp = new THREE.Group();
    for (const [id, rects] of this.L.areas) {
      const list: THREE.Mesh[] = [];
      for (const r of rects) {
        const mat = new THREE.MeshBasicMaterial({ color: '#ffe3a0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(r.w - 0.05, r.h - 0.05).rotateX(-Math.PI / 2), mat);
        m.position.set(r.x, 0.004, r.z);
        m.renderOrder = 2;
        m.visible = false;
        grp.add(m);
        list.push(m);
      }
      this.hlMeshes.set(id, list);
    }
    this.g.stage.table.add(grp);
    this.hl = grp;
  }

  private disposeHighlights() {
    if (!this.hl) return;
    for (const m of this.hl.children as THREE.Mesh[]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.hl.removeFromParent();
    this.hl = null;
    this.hlMeshes.clear();
  }

  /** Makes betting areas pulse for a moment (hints). */
  private flash(ids: string[]) {
    this.flashKeys = new Set(ids);
    this.flashUntil = this.clock + 2.6;
  }

  // ---------------------------------------------------------------- per frame
  private frame(dt: number) {
    this.clock += dt;
    const speed = gsap.globalTimeline.timeScale() || 1;
    const run = this.simRun;
    if (run && this.dice) {
      run.t += dt * TIME_SCALE * speed;
      const p = { x: 0, y: 0, z: 0 };
      const q = { q: { x: 0, y: 0, z: 0, w: 1 } };
      for (const i of [0, 1]) {
        sample(run.sim, i, run.t, p, q);
        this.dice.setPose(i, p, q.q);
      }
      const ev = run.sim.events;
      while (run.fired < ev.length && ev[run.fired].t <= run.t) this.diceEvent(ev[run.fired++]);
      if (run.t >= run.sim.duration) {
        this.simRun = null;
        run.done();
      }
    }
    if (this.drag && this.dice) this.holdDice(dt);
    if (this.flashKeys.size && this.clock > this.flashUntil) this.flashKeys.clear();
    if (!this.hl) return;
    const pulse = 0.3 + 0.16 * Math.sin(this.clock * 5.2);
    const k = Math.min(1, dt * 14);
    const hov = this.spots?.betting ? this.hover : null;
    for (const [id, list] of this.hlMeshes) {
      const target = this.winKeys.has(id) ? pulse : this.flashKeys.has(id) ? pulse * 0.8 : hov === id ? 0.17 : 0;
      for (const m of list) {
        const mat = m.material as THREE.MeshBasicMaterial;
        mat.opacity += (target - mat.opacity) * k;
        m.visible = mat.opacity > 0.004;
      }
    }
  }

  protected onSync() {
    const st = this.g.stage;
    for (const s of this.spots.spots.values()) {
      for (const p of s.payouts) p.group.scale.setScalar(CHIP_SCALE);
      if (s.amount <= 0) continue;
      // the amount sits on top of its stack, so neighbouring bets don't hide each other's
      const gp = s.pile.group.position;
      const h = Math.min(14, s.pile.values.length) * CHIP_H * CHIP_SCALE;
      const p = st.toScreen(this.tmpV.set(gp.x, h + 0.01, gp.z));
      s.label.place(p.x, p.y);
    }
    // the shooter's dice: a grab handle while bets are open
    if (this.dragEl && this.dice) {
      const show = this.phase === 'betting' && !this.busy;
      const h = this.L.home;
      const a = st.toScreen(this.tmpV.set(h.x - 0.5, 0, h.z - 0.32));
      const b = st.toScreen(this.tmpV.set(h.x + 0.5, 0, h.z + 0.32));
      const el = this.dragEl;
      el.style.display = show || this.drag ? 'block' : 'none';
      el.style.width = `${Math.max(40, b.x - a.x)}px`;
      el.style.height = `${Math.max(30, b.y - a.y)}px`;
      el.style.transform = `translate(${a.x}px, ${a.y}px)`;
      if (this.dragPin) {
        const lp = st.toScreen(this.tmpV.set(h.x, 0, h.z + 0.5));
        this.dragPin.place(lp.x, lp.y);
        this.dragPin.show(show && !this.drag && !this.validate());
      }
    }
  }

  // ---------------------------------------------------------------- history board
  private buildBoard() {
    this.board?.remove();
    const el = document.createElement('div');
    el.className = 'craps-board';
    el.style.cssText = [
      'position:absolute',
      'left:calc(3*var(--u))',
      'top:calc(18.5*var(--u))',
      'z-index:4',
      'pointer-events:none',
      'padding:calc(1.1*var(--u-panel)) calc(1.5*var(--u-panel)) calc(1.3*var(--u-panel))',
      'border-radius:calc(2*var(--u-panel))',
      'background:linear-gradient(180deg,rgba(20,15,10,.9),rgba(6,5,4,.9))',
      'border:calc(.45*var(--u-panel)) solid #c9a35a',
      'box-shadow:0 calc(1*var(--u)) calc(2.4*var(--u)) rgba(0,0,0,.55)',
      'max-width:calc(62*var(--u-panel))',
    ].join(';');
    const title = document.createElement('div');
    title.style.cssText = "font:700 calc(2.5*var(--u-panel))/1 'Cinzel',serif;letter-spacing:.14em;color:#e6c27a;margin-bottom:calc(.9*var(--u-panel));text-align:left";
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:calc(.6*var(--u-panel));min-height:calc(5.4*var(--u-panel))';
    const foot = document.createElement('div');
    foot.style.cssText = "display:flex;align-items:center;gap:calc(.8*var(--u-panel));margin-top:calc(1*var(--u-panel));font:600 calc(2.3*var(--u-panel))/1.15 'Barlow Condensed',sans-serif;color:rgba(246,240,220,.8);letter-spacing:.04em";
    el.append(title, row, foot);
    this.g.hud.root.appendChild(el);
    this.board = el;
    this.renderBoard();
  }

  private renderBoard() {
    const el = this.board;
    if (!el) return;
    const [title, row, foot] = Array.from(el.children).slice(0, 3) as HTMLElement[];
    title.textContent = t('cr.last');
    if (!this.hist.length) {
      const e = document.createElement('span');
      e.textContent = t('cr.none');
      e.style.cssText = "font:italic 500 calc(2.6*var(--u-panel))/1 'Barlow Condensed',sans-serif;color:rgba(246,240,220,.55);letter-spacing:.04em";
      row.replaceChildren(e);
    } else
      row.replaceChildren(
        ...this.hist.slice(0, 12).map(([a, b, ev], i) => {
          const n = a + b;
          const e = document.createElement('i');
          const s = i === 0 ? 5.4 : 4.4;
          const bg =
            ev === 'sevenOut'
              ? 'linear-gradient(#d5202f,#8e0c17)'
              : ev === 'pointMade' || ev === 'natural'
                ? 'linear-gradient(#ffe8a0,#c9952a)'
                : ev === 'craps'
                  ? 'linear-gradient(#2c2c30,#060607)'
                  : ev === 'pointSet'
                    ? 'linear-gradient(#f4f0e4,#bdb5a0)'
                    : 'linear-gradient(#1f6b45,#0b3a23)';
          const dark = ev === 'pointMade' || ev === 'natural' || ev === 'pointSet';
          e.textContent = String(n);
          e.title = `${a}-${b}`;
          e.style.cssText = [
            'display:grid',
            'place-items:center',
            'font-style:normal',
            `width:calc(${s}*var(--u-panel))`,
            `height:calc(${s}*var(--u-panel))`,
            `border-radius:calc(${s * 0.22}*var(--u-panel))`,
            `font:700 calc(${i === 0 ? 2.9 : 2.4}*var(--u-panel))/1 'Barlow Condensed',sans-serif`,
            `color:${dark ? '#1c1200' : '#fff'}`,
            `background:${bg}`,
            `box-shadow:inset 0 calc(.3*var(--u-panel)) 0 rgba(255,255,255,.18), 0 0 0 calc(${i === 0 ? 0.35 : 0.18}*var(--u-panel)) ${i === 0 ? '#f0cf7a' : 'rgba(201,163,90,.7)'}`,
            `opacity:${1 - i * 0.04}`,
          ].join(';');
          return e;
        }),
      );
    const pt = this.st.point;
    const hot = this.st.made >= 2;
    foot.innerHTML = '';
    const badge = document.createElement('b');
    badge.textContent = pt ? t('cr.boardPoint', { n: t(`cr.box${pt}`) }) : t('cr.boardOff');
    badge.style.cssText = `padding:calc(.4*var(--u-panel)) calc(1*var(--u-panel));border-radius:calc(1*var(--u-panel));font:700 calc(2.2*var(--u-panel))/1 'Cinzel',serif;letter-spacing:.08em;${pt ? 'background:linear-gradient(#fff,#d9d3c2);color:#111' : 'background:#0c0c0e;color:#e9e2cc;border:1px solid rgba(233,226,204,.4)'}`;
    const hand = document.createElement('span');
    hand.textContent = t('cr.boardHand', { r: this.st.rolls, m: this.st.made });
    foot.append(badge, hand);
    if (hot) {
      const f = document.createElement('span');
      f.innerHTML = ICONS.flame;
      f.style.cssText = 'display:inline-flex;width:calc(2.8*var(--u-panel));height:calc(2.8*var(--u-panel));color:#ff8a3a;filter:drop-shadow(0 0 calc(.6*var(--u-panel)) #ff6a00)';
      foot.append(f);
    }
    // the "working" call: place bets and hardways on (or off) for the come-out roll
    let work = el.querySelector<HTMLButtonElement>('button.craps-work');
    if (!work) {
      work = document.createElement('button');
      work.className = 'craps-work live';
      work.onclick = () => {
        if (this.phase !== 'betting' || this.busy) return;
        this.working = !this.working;
        this.g.sfx.click();
        this.save();
        this.renderBoard();
      };
      el.appendChild(work);
    }
    work.innerHTML = `<span>${t('cr.working')}</span><b>${this.working ? t('cr.workOn') : t('cr.workOff')}</b>`;
    work.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:calc(1*var(--u-panel))',
      'margin-top:calc(1*var(--u-panel))',
      'padding:calc(.5*var(--u-panel)) calc(1*var(--u-panel))',
      'border-radius:calc(1*var(--u-panel))',
      'border:1px solid rgba(201,163,90,.55)',
      'background:rgba(255,255,255,.04)',
      'cursor:pointer',
      'pointer-events:auto',
      "font:600 calc(2.1*var(--u-panel))/1 'Barlow Condensed',sans-serif",
      'letter-spacing:.04em',
      'color:rgba(246,240,220,.8)',
    ].join(';');
    const b = work.querySelector('b')!;
    b.style.cssText = `padding:calc(.3*var(--u-panel)) calc(.8*var(--u-panel));border-radius:calc(.7*var(--u-panel));font:700 calc(1.9*var(--u-panel))/1 'Cinzel',serif;letter-spacing:.06em;${this.working ? 'background:linear-gradient(#ffe8a0,#c9952a);color:#1c1200' : 'background:#0c0c0e;color:#e9e2cc;border:1px solid rgba(233,226,204,.35)'}`;
  }

  // ---------------------------------------------------------------- betting
  private pile(id: string) {
    return this.spots.get(id).pile;
  }

  private fromPlayer() {
    return this.g.stage.screenToTable(0.5, 0.97, 1.6);
  }

  protected toBetting() {
    const { hud } = this.g;
    this.phase = 'betting';
    this.busy = false;
    this.spots.betting = true;
    hud.setActions(null);
    hud.highlight(null);
    hud.showHint(this.g.settings.hints);
    hud.setBetBar({
      chips: CHIP_ROW,
      onChip: (v) => this.pickChip(v),
      buttons: [
        { id: 'clear', label: t('cr.down'), color: 'red', icon: 'trash', onClick: () => void this.takeDownAll() },
        { id: 'rebet', label: t('btn.rebet'), color: 'blue', icon: 'redo', onClick: () => void this.rebet() },
        { id: 'odds', label: t('cr.odds'), color: 'gold', icon: 'raise', onClick: () => void this.maxOdds() },
        { id: 'deal', label: t('cr.roll'), color: 'green', icon: 'play', onClick: () => void this.roll(null) },
      ],
    });
    this.pickChip(this.chipValue);
    this.refreshBetUi();
  }

  protected refreshBetUi() {
    if (!this.spots) return;
    const { hud, wallet } = this.g;
    const open = this.phase === 'betting' && !this.busy;
    hud.setStripBet(totalOn(this.st));
    hud.setChipLimit(wallet.balance);
    hud.setBetButton('deal', open && !this.validate());
    hud.setBetButton('clear', open && removable(this.st).length > 0);
    hud.setBetButton('rebet', open && this.rebetPlan().length > 0);
    hud.setBetButton('odds', open && Object.keys(fullOdds(this.st, wallet.balance)).length > 0);
    this.renderBoard();
  }

  protected validate() {
    const e = validateRoll(this.st);
    return e ? t(`cr.err.${e}`) : '';
  }

  /** The bet a click on a betting place adds to (a line bet with a point takes odds behind it). */
  private routeAdd(spotId: string): string | BetError | 'lineComeOut' {
    const id = ALIAS[spotId] ?? spotId;
    const b = betInfo(id);
    if (b.kind === 'pass' || b.kind === 'dpass') return this.st.point === 0 ? id : (this.st.bets[id] ?? 0) > 0 ? oddsOf(id)! : 'lineComeOut';
    if (b.kind === 'comePt' || b.kind === 'dcPt') return (this.st.bets[id] ?? 0) > 0 ? oddsOf(id)! : 'comeMoves';
    return id;
  }

  private errText(err: BetError, id: string) {
    if (err === 'max') {
      const m = maxFor(this.st, id);
      if (isOdds(id)) return t('cr.err.maxOdds', { n: money(m) });
      return m > 0 ? t('toast.maxBet', { n: money(m) }) : t('cr.err.noFlat');
    }
    return t(`cr.err.${err}`);
  }

  protected onSpotClick(spotId: string) {
    if (this.phase !== 'betting' || this.busy || this.drag) return;
    const { wallet, hud, sfx } = this.g;
    const v = this.chipValue;
    const id = this.routeAdd(spotId);
    if (!this.spots.spots.has(id)) return hud.toast(t(`cr.err.${id}`));
    const err = canAdd(this.st, id, v);
    if (err) return hud.toast(this.errText(err, id));
    if (!wallet.canAfford(v)) return hud.toast(t('toast.noFunds'));
    wallet.debit(v);
    this.st.bets[id] = (this.st.bets[id] ?? 0) + v;
    sfx.play('handle', { vol: 0.5 });
    void this.pile(id).throwChip(v, this.fromPlayer());
    this.noteExact(id);
    this.save();
    this.refreshBetUi();
  }

  /** A gentle word when a bet will be paid with a fraction rounded down. */
  private noteExact(id: string) {
    const b = betInfo(id);
    if (!['passOdds', 'dpassOdds', 'comeOdds', 'dcOdds', 'place'].includes(b.kind)) return;
    const step = exactStep(id, this.st.point);
    const amt = this.st.bets[id] ?? 0;
    const key = `${b.kind}:${step}`;
    if (step <= LIMITS.min || amt % step === 0 || this.warned.has(key)) return;
    this.warned.add(key);
    const n = b.kind === 'passOdds' || b.kind === 'dpassOdds' ? this.st.point : b.n;
    const r = b.kind === 'place' ? { 4: '9:5', 5: '7:5', 6: '7:6', 8: '7:6', 9: '7:5', 10: '9:5' }[n] : b.kind === 'passOdds' || b.kind === 'comeOdds' ? { 4: '2:1', 5: '3:2', 6: '6:5', 8: '6:5', 9: '3:2', 10: '2:1' }[n] : { 4: '1:2', 5: '2:3', 6: '5:6', 8: '5:6', 9: '2:3', 10: '1:2' }[n];
    this.g.hud.toast(t('cr.warn.exact', { bet: this.betName(id), r: r ?? '', n: step }), 3200);
  }

  protected takeChip(spotId: string) {
    if (this.phase !== 'betting' || this.busy || this.drag) return;
    const base = ALIAS[spotId] ?? spotId;
    const o = ['pass', 'dpass'].includes(base) || /^d?c\d/.test(base) ? oddsOf(base) : null;
    const id = o && (this.st.bets[o] ?? 0) > 0 ? o : base;
    if (!((this.st.bets[id] ?? 0) > 0)) return;
    if (!canTake(this.st, id)) return this.g.hud.toast(t('cr.err.contract'));
    const v = Math.min(this.pile(id).popChip(), this.st.bets[id]);
    if (!v) return;
    this.st.bets[id] -= v;
    if (this.st.bets[id] <= 0) delete this.st.bets[id];
    this.g.wallet.credit(v);
    this.syncPile(id);
    this.g.sfx.play('handle', { vol: 0.4 });
    this.save();
    this.refreshBetUi();
  }

  /** Takes every bet that may come down back to the rack. */
  private async takeDownAll() {
    if (this.phase !== 'betting' || this.busy || this.drag) return;
    const ids = removable(this.st);
    if (!ids.length) return;
    this.busy = true;
    this.refreshBetUi();
    this.g.sfx.play('handle', { vol: 0.6 });
    let back = 0;
    for (const id of ids) {
      back += this.st.bets[id] ?? 0;
      delete this.st.bets[id];
    }
    await Promise.all(ids.map((id, i) => this.slideToPlayer(this.pile(id), i * 0.025)));
    this.g.wallet.credit(back);
    this.save();
    this.busy = false;
    this.refreshBetUi();
  }

  /** The bets lost on the last roll that can be made again now (id, amount to add). */
  private rebetPlan(): [string, number][] {
    const out: [string, number][] = [];
    let budget = this.g.wallet.balance;
    for (const [id, a] of Object.entries(this.lastLost)) {
      const add = a - (this.st.bets[id] ?? 0);
      if (add <= 0 || add > budget || canAdd(this.st, id, add) !== '') continue;
      out.push([id, add]);
      budget -= add;
    }
    return out;
  }

  private async rebet() {
    if (this.phase !== 'betting' || this.busy || this.drag) return;
    const plan = this.rebetPlan();
    if (!plan.length) return this.g.hud.toast(t('cr.noRebet'));
    await this.addBets(plan);
  }

  private async maxOdds() {
    if (this.phase !== 'betting' || this.busy || this.drag) return;
    const add = Object.entries(fullOdds(this.st, this.g.wallet.balance));
    if (!add.length) return this.g.hud.toast(t('cr.noOdds'));
    await this.addBets(add);
  }

  /** Puts several bets on the layout at once, chips thrown from the player's rack. */
  private async addBets(list: [string, number][]) {
    const { wallet, sfx } = this.g;
    this.busy = true;
    this.refreshBetUi();
    sfx.play('handle', { vol: 0.6 });
    const from = this.fromPlayer();
    const jobs: Promise<void>[] = [];
    list.forEach(([id, a], i) => {
      if (!wallet.canAfford(a)) return;
      wallet.debit(a);
      this.st.bets[id] = (this.st.bets[id] ?? 0) + a;
      jobs.push(wait(i * 0.1).then(() => this.pile(id).dropIn(a, from)));
    });
    this.save();
    await Promise.all(jobs);
    this.syncPiles();
    this.busy = false;
    this.refreshBetUi();
  }

  /** Keeps a pile showing exactly the chips of its bet. */
  private syncPile(id: string) {
    if (!this.spots.spots.has(id)) return;
    const p = this.pile(id);
    const want = this.st.bets[id] ?? 0;
    if (Math.abs(p.amount - want) > 1e-9) {
      if (want > 0) p.set(want);
      else p.clear();
    }
  }

  private syncPiles() {
    for (const id of this.spots.spots.keys()) this.syncPile(id);
  }

  // ---------------------------------------------------------------- hints
  protected advice() {
    if (this.phase !== 'betting') return null;
    const a = advise(this.st, this.g.wallet.balance);
    if (a.kind === 'pass') {
      this.flash(['pass']);
      return { id: 'pass', msg: t('cr.hint.pass') };
    }
    if (a.kind === 'odds') {
      this.flash(['pass']);
      return { id: 'odds', msg: t('cr.hint.odds', { n: money(a.amount) }) };
    }
    return { id: 'deal', msg: (this.st.bets.passOdds ?? 0) > 0 ? t('cr.hint.roll') : t('cr.hint.rollPlain') };
  }

  // ---------------------------------------------------------------- input: keys and the dice throw
  private bindInput() {
    this.keyFn = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== 'r' && e.key !== 'R' && e.key !== ' ') return;
      const tgt = e.target as HTMLElement | null;
      if (tgt && /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName)) return;
      if (this.g.hud.root.querySelector('.modal')) return;
      if (this.phase !== 'betting' || this.busy || this.drag) return;
      e.preventDefault();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      void this.roll(null);
    };
    window.addEventListener('keydown', this.keyFn);
    const el = document.createElement('div');
    el.className = 'craps-dice-hit live';
    el.style.cssText = 'position:absolute;left:0;top:0;border-radius:50%;cursor:grab;touch-action:none;display:none';
    el.setAttribute('aria-label', t('cr.roll'));
    el.addEventListener('pointerdown', (e) => this.dragStart(e));
    el.addEventListener('pointermove', (e) => this.dragMove(e));
    el.addEventListener('pointerup', (e) => this.dragEnd(e, false));
    el.addEventListener('pointercancel', (e) => this.dragEnd(e, true));
    this.g.hud.labels.appendChild(el);
    this.dragEl = el;
    const pin = this.g.hud.pin('betlabel');
    pin.el.classList.add('small');
    pin.el.style.fontSize = 'calc(2.6 * var(--u))';
    pin.el.style.letterSpacing = '.06em';
    pin.el.style.opacity = '0';
    pin.set(t('cr.drag'));
    this.dragPin = pin;
  }

  /** Pointer position on a plane `y` above the felt. */
  private pointerOnTable(e: PointerEvent, y: number) {
    const r = this.g.stage.renderer.domElement.getBoundingClientRect();
    return this.g.stage.viewToTable((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, y);
  }

  private dragStart(e: PointerEvent) {
    if (this.phase !== 'betting' || this.busy || this.drag || !this.dice) return;
    const err = this.validate();
    if (err) return this.g.hud.toast(err);
    e.preventDefault();
    this.dragEl!.setPointerCapture(e.pointerId);
    this.dragEl!.style.cursor = 'grabbing';
    const p = this.pointerOnTable(e, 0.5);
    const hand = this.clampHand({ x: p.x, y: 0.5, z: p.z });
    const spin = [0, 1].map(() => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), 0.24));
    this.drag = { id: e.pointerId, hand, trail: [{ t: performance.now(), x: hand.x, z: hand.z }], spin, lastShake: 0 };
    this.hover = null;
    this.clearTags();
    this.winKeys.clear();
    this.g.sfx.play('diceGrab', { vol: 0.85 });
    this.refreshBetUi();
  }

  private clampHand(p: V3): V3 {
    const L = this.L;
    return { x: Math.min(L.walls.xR - 0.4, Math.max(L.main.x0 + 0.3, p.x)), y: 0.5, z: Math.min(L.main.z1 + 0.4, Math.max(L.main.z0 + 0.35, p.z)) };
  }

  private dragMove(e: PointerEvent) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const p = this.pointerOnTable(e, 0.5);
    d.hand = this.clampHand({ x: p.x, y: 0.5, z: p.z });
    const now = performance.now();
    d.trail.push({ t: now, x: d.hand.x, z: d.hand.z });
    while (d.trail.length > 2 && now - d.trail[0].t > 140) d.trail.shift();
    const a = d.trail[0];
    const sp = Math.hypot(d.hand.x - a.x, d.hand.z - a.z) / Math.max(0.016, (now - a.t) / 1000);
    if (sp > 3 && now - d.lastShake > 320) {
      d.lastShake = now;
      this.g.sfx.play('diceShake', { vol: 0.55 });
    }
  }

  /** The dice ride in the shooter's hand, rattling. */
  private holdDice(dt: number) {
    const d = this.drag!;
    const dice = this.dice!;
    for (const i of [0, 1]) {
      const body = dice.dice[i].body;
      const target = new THREE.Vector3(d.hand.x + (i ? 0.11 : -0.11), d.hand.y + Math.sin(this.clock * 31 + i * 2) * 0.012, d.hand.z + Math.cos(this.clock * 27 + i) * 0.01);
      body.position.lerp(target, Math.min(1, dt * 18));
      body.quaternion.multiply(d.spin[i]);
      dice.syncShadow(i);
    }
  }

  private dragEnd(e: PointerEvent, cancel: boolean) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.dragEl!.style.cursor = 'grab';
    try {
      this.dragEl!.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    const now = performance.now();
    const a = d.trail.find((s) => now - s.t < 110) ?? d.trail[0];
    const dt = Math.max(0.016, (now - a.t) / 1000);
    const vx = (d.hand.x - a.x) / dt;
    const vz = (d.hand.z - a.z) / dt;
    const dice = this.dice!;
    const from: [V3, V3] = [dice.bodyP(0), dice.bodyP(1)];
    this.drag = null;
    if (cancel || vz > -2.2 || Math.hypot(vx, vz) < 2.6) {
      // not a throw: the dice go back on the felt
      this.settleDice();
      return;
    }
    const L = this.L;
    const zAim = L.walls.zW + 0.6;
    const aimX = d.hand.x + (vx / vz) * (zAim - d.hand.z);
    const power = Math.min(1, Math.max(0, (Math.hypot(vx, vz) - 2.6) / 14));
    this.throwSpec = { hand: { ...d.hand }, from, aim: { x: Math.min(L.landing.x1 - 0.4, Math.max(L.landing.x0 + 0.5, aimX)), z: zAim }, power };
    void this.roll(this.throwSpec);
  }

  // ---------------------------------------------------------------- the roll
  private async roll(spec: DragThrow | null) {
    const { hud } = this.g;
    if (this.phase !== 'betting' || this.busy) return;
    const err = this.validate();
    if (err) {
      hud.toast(err);
      if (spec) this.settleDice();
      return;
    }
    this.throwSpec = spec;
    this.busy = true;
    this.phase = 'playing';
    this.spots.betting = false;
    this.hover = null;
    hud.setBetBar(null);
    hud.showHint(false);
    hud.highlight(null);
    try {
      await this.playRound();
    } finally {
      this.throwSpec = null;
      for (const p of this.paid) p.dispose();
      this.paid = [];
      this.syncPiles();
      this.toBetting();
      if (this.g.wallet.balance < 5 && totalOn(this.st) === 0) hud.toast(t('toast.outOfChips'), 2600);
    }
  }

  private arena(): Arena {
    const L = this.L;
    return {
      xMin: L.walls.xL + DIM.PYR,
      xMax: L.walls.xR - DIM.PYR,
      zWall: L.walls.zW + DIM.PYR,
      wallH: DIM.WALL_H,
      landing: L.landing,
      xBank: L.bank.x - L.bank.w / 2,
    };
  }

  protected async playRound() {
    const { sfx, wallet } = this.g;
    // the result is drawn first, fairly; the throw is then made to land on it
    const [d1, d2] = rollDice(cryptoRng);
    const before = cloneState(this.st);
    const res = resolveRoll(before, d1, d2, this.rulesNow());
    this.save([d1, d2]);
    this.clearTags();
    this.winKeys.clear();
    await this.throwDice([d1, d2], this.throwSpec);
    this.faces = [d1, d2];
    this.hist.unshift([d1, d2, res.event]);
    this.hist.length = Math.min(this.hist.length, 14);
    const dm = this.diceMid();
    this.call(res, dm);

    // the puck
    const puckJob = res.pointAfter !== res.pointBefore ? this.movePuck(res.pointAfter) : Promise.resolve();
    await wait(0.45);

    // the house takes the losers
    const out = res.outcomes;
    const ids = Object.keys(out);
    const losers = ids.filter((id) => out[id].kind === 'lose');
    // Rebet remembers the last bets that lost
    if (losers.some((id) => !isOdds(id))) this.lastLost = {};
    for (const id of losers) {
      const b = betInfo(id);
      if (isOdds(id)) continue;
      const key = b.kind === 'comePt' ? 'come' : b.kind === 'dcPt' ? 'dcome' : id;
      this.lastLost[key] = (this.lastLost[key] ?? 0) + out[id].stake;
    }
    if (losers.length) {
      sfx.play('chips', { vol: 0.6 });
      await Promise.all(losers.map((id, i) => this.toBank(id, i * 0.04)));
    }

    // and pays the winners from its bank
    const winners = ids.filter((id) => out[id].kind === 'win');
    const pays = new Map<string, ChipPile>();
    if (winners.length) {
      for (const id of winners) this.winKeys.add(areaOf(id));
      await Promise.all(
        winners.map(async (id, i) => {
          const o = out[id] as { win: number };
          const pile = await this.fromBank(id, o.win, i * 0.07);
          if (pile) pays.set(id, pile);
        }),
      );
      this.celebrate(res);
      await wait(0.55);
    }

    // winnings, and the stakes that come down, go to the player's rack
    const home: Promise<void>[] = [this.diceHome(false)];
    const toPlayer: Promise<void>[] = [];
    let k = 0;
    for (const id of ids) {
      const o = out[id];
      const pay = pays.get(id);
      if (pay) toPlayer.push(this.slideToPlayer(pay, k++ * 0.03, true));
      if ((o.kind === 'win' || o.kind === 'push') && !o.stays) toPlayer.push(this.slideToPlayer(this.pile(id), k++ * 0.03));
    }
    if (toPlayer.length) {
      sfx.play('handle', { vol: 0.6 });
      await Promise.all(toPlayer);
    }
    // the money and the table move on together (a reload from here on can't pay twice)
    if (res.credit > 0) wallet.credit(res.credit);
    this.st = res.next;
    this.save();
    if (res.wager > 0) {
      const net = res.won - res.lost;
      const banner = resultBanner(this.g, net, res.wager, { big: this.bigLabel(res) });
      await finishXP(this.g, res.wager, net, banner);
    }

    // come bets travel to their numbers
    const moves = ids.filter((id) => out[id].kind === 'move');
    if (moves.length) await Promise.all(moves.map((id, i) => this.travel(id, (out[id] as { to: string }).to, i * 0.08)));

    await puckJob;
    this.syncPiles();
    this.renderBoard();
    if (res.handOver) {
      const pin = this.tag(t('cr.call.newShooter', { r: res.handOver.rolls, m: res.handOver.made }), 'dealer', this.callAt.x, this.callAt.z + 0.88);
      pin.el.style.fontSize = 'calc(3.2 * var(--u))';
      fadeLater(pin, 3.6);
    }
    await Promise.all(home);
  }

  // ---------------------------------------------------------------- dice
  /** Grab, shake and throw (Roll key), or release from the hand (drag), then the simulated tumble. */
  private async throwDice(vals: [number, number], spec: DragThrow | null) {
    const { sfx } = this.g;
    const dice = this.dice!;
    const arena = this.arena();
    let sim: SimOut;
    if (spec) {
      sim = simulateThrow(arena, { hand: spec.hand, from: spec.from, aim: spec.aim, power: spec.power, q0: [dice.bodyQ(0), dice.bodyQ(1)] });
      for (const i of [0, 1]) dice.setPipTurn(i, pipTurn(sim.top[i], vals[i], Math.floor(Math.random() * 4)));
    } else {
      const h = this.L.home;
      const hand = { x: h.x - 0.3, y: 0.55, z: h.z - 0.35 };
      const q0: [Q, Q] = [randomQ(Math.random), randomQ(Math.random)];
      sim = simulateThrow(arena, { hand, power: 0.3 + Math.random() * 0.6, q0 });
      sfx.play('diceGrab', { vol: 0.85 });
      await this.shake(sim, vals);
    }
    sfx.play('diceThrow', { vol: 0.95 });
    await new Promise<void>((done) => (this.simRun = { sim, t: 0, fired: 0, done }));
  }

  /**
   * The shooter picks the pair up and shakes it: the dice rise from their place and rattle in the
   * hand, spinning, and end exactly in the pose the simulated throw starts from.
   */
  private shake(sim: SimOut, vals: [number, number]): Promise<void> {
    const dice = this.dice!;
    const dur = 0.95;
    const start = [0, 1].map((i) => dice.bodyP(i));
    const qStart = [0, 1].map((i) => dice.bodyQ(i));
    const f = sim.frames;
    const p0 = [0, 1].map((i) => ({ x: f[i][0], y: f[i][1], z: f[i][2] }));
    const q0 = [0, 1].map((i) => ({ x: f[i][3], y: f[i][4], z: f[i][5], w: f[i][6] }));
    const axes = [0, 1].map(() => new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize());
    const spin = 15;
    let swapped = false;
    let shook = 0;
    const o = { t: 0 };
    const tmpQ = new THREE.Quaternion();
    return new Promise((res) => {
      gsap.to(o, {
        t: dur,
        duration: dur,
        ease: 'none',
        onUpdate: () => {
          const tt = o.t;
          const k = Math.min(1, tt / 0.3);
          const ks = k * k * (3 - 2 * k);
          const fade = Math.pow(1 - tt / dur, 2);
          for (const i of [0, 1]) {
            const pos = {
              x: start[i].x + (p0[i].x - start[i].x) * ks + Math.sin(tt * 41 + i * 2) * 0.03 * fade,
              y: start[i].y + (p0[i].y - start[i].y) * ks + Math.sin(Math.PI * k) * 0.12 + Math.sin(tt * 37 + i) * 0.025 * fade,
              z: start[i].z + (p0[i].z - start[i].z) * ks + Math.cos(tt * 33 + i) * 0.03 * fade,
            };
            tmpQ.setFromAxisAngle(axes[i], -spin * (dur - tt));
            const path = qMul(q0[i], { x: tmpQ.x, y: tmpQ.y, z: tmpQ.z, w: tmpQ.w });
            dice.setPose(i, pos, qSlerp(qStart[i], path, ks));
          }
          if (!swapped && tt > 0.32) {
            // while they spin in the hand, the pips are turned so the drawn numbers land on top
            swapped = true;
            for (const i of [0, 1]) dice.setPipTurn(i, pipTurn(sim.top[i], vals[i], Math.floor(Math.random() * 4)));
          }
          if (shook === 0 && tt > 0.18) {
            shook++;
            this.g.sfx.play('diceShake', { vol: 0.7 });
          }
        },
        onComplete: () => res(),
      });
    });
  }

  private diceEvent(e: SimEvent) {
    const { sfx, fx } = this.g;
    const now = performance.now();
    if (now - this.lastClack[e.die] < 40) return;
    this.lastClack[e.die] = now;
    const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
    if (e.kind === 'felt') sfx.play('dieThrow', { vol: clamp(e.speed / 22, 0.12, 0.85), rate: 0.95 + Math.random() * 0.15 });
    else if (e.kind === 'wall') {
      sfx.play('dieThrow', { vol: clamp(e.speed / 15, 0.2, 1), rate: 0.74 + Math.random() * 0.06 });
      const p = this.dice!.dice[e.die].body.position;
      if (e.speed > 4) fx.burst(new THREE.Vector3(p.x, p.y, p.z + 0.05), 6, '#fff1cf', 0.12, 0.7);
    } else sfx.play('dieThrow', { vol: clamp(e.speed / 12, 0.15, 0.6), rate: 1.4 });
  }

  /** Dice let go without a throw drop back to their place (bets wait until they have). */
  private settleDice() {
    this.busy = true;
    this.refreshBetUi();
    void this.diceHome(true).then(() => {
      this.busy = false;
      this.refreshBetUi();
    });
  }

  /** Centre of the pair where it came to rest. */
  private diceMid(): Pt {
    const d = this.dice!;
    const a = d.bodyP(0);
    const b = d.bodyP(1);
    return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  }

  /** The stickman sends the dice back to the shooter's place. */
  private diceHome(fromHand: boolean): Promise<void> {
    const dice = this.dice!;
    const h = this.L.home;
    if (!fromHand) this.g.sfx.whoosh(0.35);
    return Promise.all(
      [0, 1].map((i) => {
        const from = dice.bodyP(i);
        const q0 = dice.bodyQ(i);
        const to = { x: h.x + (i ? 0.14 : -0.14) + (Math.random() - 0.5) * 0.04, z: h.z + (i ? 0.03 : -0.03) + (Math.random() - 0.5) * 0.04 };
        const dist = Math.hypot(to.x - from.x, to.z - from.z);
        const lift = fromHand ? 0.05 : 0.3 + Math.min(0.5, dist * 0.06);
        const yaw = (Math.random() - 0.5) * 2.4;
        const yq = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
        // settle flat on the face that is up now (the hand may hold them tilted)
        const qEnd = fromHand ? flatten(q0) : qMul(yq, q0);
        const o = { t: 0 };
        return new Promise<void>((res) => {
          gsap.to(o, {
            t: 1,
            duration: (fromHand ? 0.3 : 0.62) + i * 0.05,
            delay: fromHand ? 0 : 0.05 * i,
            ease: 'none',
            onUpdate: () => {
              const u = o.t;
              const s = u * u * (3 - 2 * u);
              dice.setPose(i, { x: from.x + (to.x - from.x) * s, y: from.y + (HALF - from.y) * s + lift * Math.sin(Math.PI * u), z: from.z + (to.z - from.z) * s }, qSlerp(q0, qEnd, s));
            },
            onComplete: () => {
              this.g.sfx.play('dieThrow', { vol: 0.25, rate: 1.1 });
              res();
            },
          });
        });
      }),
    ).then(() => undefined);
  }

  // ---------------------------------------------------------------- chips on the move
  private bankPoint() {
    return CrapsTable3D.bankPoint(this.L);
  }

  /** Chips fly in a low arc (the dealer's hand) and land with weight. */
  private fly(obj: THREE.Object3D, to: THREE.Vector3, dur: number, lift: number, delay = 0, ease: 'in' | 'out' | 'inOut' = 'inOut'): Promise<void> {
    const from = obj.position.clone();
    const o = { t: 0 };
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dz) || 1;
    const axis = new THREE.Vector3(dz / len, 0, -dx / len);
    return new Promise((res) => {
      gsap.to(o, {
        t: 1,
        duration: dur,
        delay,
        ease: 'none',
        onUpdate: () => {
          const u = o.t;
          const s = ease === 'in' ? u * u : ease === 'out' ? 1 - (1 - u) * (1 - u) : u * u * (3 - 2 * u);
          obj.position.lerpVectors(from, to, s);
          obj.position.y = from.y + (to.y - from.y) * s + lift * Math.sin(Math.PI * u);
          obj.setRotationFromAxisAngle(axis, 0.12 * Math.sin(Math.PI * u) * (ease === 'in' ? -1 : 1));
        },
        onComplete: () => {
          obj.position.copy(to);
          obj.rotation.set(0, 0, 0);
          res();
        },
      });
    });
  }

  /** A losing bet: the dealer sweeps the chips to the house's bank. */
  private async toBank(id: string, delay: number) {
    const p = this.pile(id);
    if (!p.amount) return;
    const home = p.group.position.clone();
    const b = this.bankPoint();
    const to = new THREE.Vector3(b.x + (Math.random() - 0.5) * 0.8, 0.07, b.z + (Math.random() - 0.5) * 0.25);
    const dist = home.distanceTo(to);
    await this.fly(p.group, to, 0.42 + dist * 0.03, 0.25 + Math.min(0.4, dist * 0.04), delay, 'in');
    this.g.sfx.play('chips', { vol: 0.35, rate: 1.1 });
    p.clear();
    p.group.position.copy(home);
  }

  /** A winning bet: the house's payout comes out of the bank and lands beside it. */
  private async fromBank(id: string, win: number, delay: number): Promise<ChipPile | null> {
    if (win <= 0) return null;
    const s = this.spots.get(id);
    const at = s.pile.group.position;
    const b = this.bankPoint();
    const pile = new ChipPile(this.g.chips, this.g.stage.table, new THREE.Vector3(b.x, 0.07, b.z));
    pile.group.scale.setScalar(CHIP_SCALE);
    pile.set(win);
    pile.group.visible = false;
    this.paid.push(pile);
    const left = ['pass', 'dpass'].includes(id) || /^d?c\d/.test(id);
    const to = new THREE.Vector3(at.x + (left ? -0.36 : 0.36), 0, at.z + 0.04);
    const dist = pile.group.position.distanceTo(to);
    await wait(delay);
    pile.group.visible = true;
    this.g.fx.glow(new THREE.Vector3(at.x, 0, at.z), 0.75, 0.75, 1.8);
    await this.fly(pile.group, to, 0.5 + dist * 0.035, 0.3 + Math.min(0.45, dist * 0.05), 0, 'out');
    this.g.sfx.play('stack', { vol: 0.7 });
    return pile;
  }

  /** Chips slide off the layout to the player's rack. */
  private async slideToPlayer(p: ChipPile, delay: number, dispose = false) {
    if (!p.amount) return;
    const home = p.group.position.clone();
    const bottom = this.g.stage.screenToTable(0.5, 1.2);
    await this.fly(p.group, new THREE.Vector3(home.x * 0.6, 0, bottom.z), 0.5, 0.18, delay, 'in');
    if (dispose) {
      p.dispose();
      this.paid = this.paid.filter((x) => x !== p);
    } else {
      p.clear();
      p.group.position.copy(home);
    }
  }

  /** A come bet travels to its number box. */
  private async travel(from: string, to: string, delay: number) {
    const src = this.pile(from);
    const amt = src.amount;
    if (!amt || !this.spots.spots.has(to)) return;
    const home = src.group.position.clone();
    const dst = this.pile(to).group.position.clone();
    await this.fly(src.group, dst, 0.55, 0.32, delay);
    this.g.sfx.play('chip', { vol: 0.6 });
    src.clear();
    src.group.position.copy(home);
    const dp = this.pile(to);
    dp.set((dp.amount || 0) + amt);
  }

  private movePuck(point: number) {
    const L = this.L;
    const to = point ? L.puckOn.get(point)! : L.puckOff;
    return this.t3!.puck.moveTo(
      to,
      point !== 0,
      () => this.g.sfx.play('chip', { vol: 0.8, rate: 0.62 }),
      () => this.g.sfx.whoosh(0.3),
    );
  }

  // ---------------------------------------------------------------- calls and effects
  /** The stickman's call, as big tags over the dice. */
  private call(res: RollResult, at: Pt) {
    const { sum, hard, comeOut, event } = res;
    const w = (n: number) => t(`cr.w${n}`);
    let main = '';
    let sub = '';
    let cls = '';
    let bg = '';
    if (event === 'natural') {
      main = sum === 7 ? t('cr.call.winner7') : t('cr.call.yo');
      sub = t('cr.call.frontLine');
      cls = 'win';
    } else if (event === 'craps') {
      main = t('cr.call.craps');
      sub = `${sum === 2 ? t('cr.call.aces') : sum === 3 ? t('cr.call.aceDeuce') : t('cr.call.boxcars')} · ${t('cr.call.lineAway')}`;
      cls = 'lose';
    } else if (event === 'pointSet') {
      main = t('cr.call.pointIs', { n: w(sum) });
      sub = hard ? t('cr.call.hard', { n: w(sum) }) : t('cr.call.markIt');
    } else if (event === 'sevenOut') {
      main = t('cr.call.sevenOut');
      sub = t('cr.call.lineAway');
      bg = 'linear-gradient(#d5202f,#8e0c17)';
    } else if (event === 'pointMade') {
      main = t('cr.call.winner', { n: sum });
      sub = res.next.made >= 3 ? `${t('cr.call.hot')} · ${res.next.made}` : hard ? t('cr.call.hardWay') : t('cr.call.pointMade');
      cls = 'win';
    } else {
      // a roll during the point
      if (sum === 11) main = t('cr.call.yo');
      else if (sum === 2) main = t('cr.call.acesP');
      else if (sum === 3) main = t('cr.call.aceDeuceP');
      else if (sum === 12) main = t('cr.call.boxcarsP');
      else if (hard) main = t('cr.call.hard', { n: w(sum) });
      else if (sum === 9) main = t('cr.call.nine');
      else if (sum === 5) main = t('cr.call.five');
      else if (sum === 4 || sum === 6 || sum === 8 || sum === 10) main = t('cr.call.easy', { n: w(sum) });
      else main = t('cr.call.plain', { n: w(sum) });
      if (hard) cls = 'win';
    }
    void comeOut;
    // beside the dice, on the side with more room, so the numbers stay in view
    const ld = this.L.landing;
    const side = at.x - ld.x0 > ld.x1 - at.x ? -1 : 1;
    const x = Math.min(ld.x1 - 0.6, Math.max(ld.x0 + 1.1, at.x + side * 1.55));
    const z = Math.min(ld.z1 - 0.55, Math.max(ld.z0 + 0.12, at.z - 0.18));
    this.callAt = { x, z };
    const pin = this.tag(main, cls, x, z);
    pin.el.style.fontSize = 'calc(7.4 * var(--u))';
    pin.el.style.letterSpacing = '.06em';
    pin.el.style.padding = 'calc(1.2*var(--u)) calc(3.4*var(--u)) calc(1.5*var(--u))';
    if (bg) {
      pin.el.style.background = bg;
      pin.el.style.color = '#fff';
      pin.el.style.borderColor = '#ffd0c0';
    }
    pin.el.animate(
      [
        { scale: '0.3', opacity: 0 },
        { scale: '1.14', opacity: 1, offset: 0.55 },
        { scale: '0.97', offset: 0.8 },
        { scale: '1' },
      ],
      { duration: 560, easing: 'cubic-bezier(.2,.9,.3,1)' },
    );
    fadeLater(pin, 3.4);
    if (sub) {
      const sp = this.tag(sub, '', x, z + 0.5);
      sp.el.style.fontSize = 'calc(3.4 * var(--u))';
      sp.el.animate([{ opacity: 0, translate: '0 calc(2*var(--u))' }, { opacity: 1, translate: '0 0' }], { duration: 420, delay: 180, easing: 'ease-out', fill: 'backwards' });
      fadeLater(sp, 3.4);
    }
    const { sfx } = this.g;
    if (event === 'pointSet') sfx.tick(0.22, 1.5);
    if (event === 'pointMade') sfx.bell(0.1);
  }

  /** Bursts of sparkle for the big moments. */
  private celebrate(res: RollResult) {
    const { fx } = this.g;
    const at = (id: string, n: number, color?: string) => {
      const p = this.pile(id).group.position;
      fx.burst(new THREE.Vector3(p.x, 0.3, p.z), n, color);
    };
    const out = res.outcomes;
    if (res.event === 'pointMade') {
      const p = this.L.puckOn.get(res.pointBefore)!;
      fx.burst(new THREE.Vector3(p.x, 0.3, p.z), 90);
      if (res.next.made >= 3) {
        fx.burst(new THREE.Vector3(p.x, 0.4, p.z), 160, '#ff8a3a', 1.2, 2.2);
        const h = this.L.home;
        fx.burst(new THREE.Vector3(h.x, 0.3, h.z - 1), 120, '#ffd36b', 1.4, 2);
      }
    }
    for (const id of ['p2', 'p12']) if (out[id]?.kind === 'win') at(id, 160);
    for (const id of ['hard4', 'hard6', 'hard8', 'hard10', 'p3', 'p11', 'horn', 'ce', 'anyCraps', 'any7']) if (out[id]?.kind === 'win') at(id, 60);
  }

  /** The table's special results: a hot roll, or a 30-to-1 hit. */
  private bigLabel(res: RollResult): string | undefined {
    const out = res.outcomes;
    if (out.p12?.kind === 'win') return t('cr.big.30', { n: t('cr.call.boxcarsP').replace('!', '') });
    if (out.p2?.kind === 'win') return t('cr.big.30', { n: t('cr.call.acesP').replace('!', '') });
    if (res.event === 'pointMade' && res.next.made >= 3) return t('cr.big.hot', { n: res.next.made });
    return undefined;
  }

  // ---------------------------------------------------------------- leaving
  protected cleanup() {
    // removable bets go back to the rack; contract bets stay on the table for the next visit
    const ids = removable(this.st);
    let back = 0;
    for (const id of ids) {
      back += this.st.bets[id] ?? 0;
      delete this.st.bets[id];
    }
    if (back > 0) this.g.wallet.credit(back);
    if (!contractBets(this.st).length) this.st = { ...newState() };
    this.save();
    this.simRun = null;
    this.drag = null;
    this.offFrame?.();
    this.offFrame = null;
    if (this.keyFn) window.removeEventListener('keydown', this.keyFn);
    this.keyFn = null;
    this.dragEl?.remove();
    this.dragEl = null;
    this.dragPin?.remove();
    this.dragPin = null;
    for (const p of this.paid) p.dispose();
    this.paid = [];
    this.t3?.dispose();
    this.t3 = null;
    this.dice?.dispose();
    this.dice = null;
    this.disposeHighlights();
    this.board?.remove();
    this.board = null;
    this.hover = null;
    this.winKeys.clear();
    this.flashKeys.clear();
  }
}

/** A call tag fades out after a while (the base pins keep showing until the next roll). */
function fadeLater(pin: Pin, after: number) {
  pin.el.animate([{ opacity: 1 }, { opacity: 0 }], { delay: after * 1000, duration: 700, easing: 'ease-in', fill: 'forwards' });
}

/** The orientation with the face that is most nearly up turned exactly up (yaw kept). */
function flatten(q: Q): Q {
  const tq = new THREE.Quaternion(q.x, q.y, q.z, q.w);
  let best = new THREE.Vector3(0, 1, 0);
  let by = -Infinity;
  for (const a of [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ]) {
    const v = new THREE.Vector3(a[0], a[1], a[2]).applyQuaternion(tq);
    if (v.y > by) {
      by = v.y;
      best = v;
    }
  }
  const fix = new THREE.Quaternion().setFromUnitVectors(best.normalize(), new THREE.Vector3(0, 1, 0));
  const r = fix.multiply(tq);
  return { x: r.x, y: r.y, z: r.z, w: r.w };
}
