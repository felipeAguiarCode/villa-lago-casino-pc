import * as THREE from 'three';
import gsap from 'gsap';
import { addStrings, t } from '../../core/i18n';
import { collectCards, dealCard, flipCard, slideCard, wait } from '../../table/anim';
import { CARD_H, REST_Y, type Card3D } from '../../table/cardMesh';
import { FONT, GOLD, INK_SOFT, tablePrint } from '../../table/prints';
import type { Pin } from '../../ui/hud';
import { ICONS, type IconName } from '../../ui/icons';
import { highlightCards, type SpotDef } from '../kit';
import { TableGame } from '../tableGame';
import type { GameCtx } from '../types';
import { cryptoRng } from '../../core/rng';
import { newMemory } from '../partybj/mindset';
import { duelPick } from '../partytrump/ai';
import { Duel, isTargetTrump, rarityOf, SINGLE_TRUMPS, TRUMPS, WILD_MAX, WILD_MIN, type DuelEvent, type Side, type TrumpId } from './rules';
import { cardDataURL } from '../../table/cardFaces';
import { bindTrump, centreIn, flyBonusTrump, trumpInner, type TrumpCardInfo } from './trumpUi';

addStrings(
  {
    't21.bet': 'BET',
    't21.stakes': 'STAKES UP',
    't21.print1': 'TRUMP 21',
    't21.print2': 'Eleven cards · closest to the target wins',
    't21.target': 'TARGET',
    't21.needBet': 'Place a BET',
    't21.dealerTrump': 'Dealer plays {name}',
    't21.gain': 'New trump: {name}',
    't21.dealerStands': 'Dealer stands',
    't21.dealerHits': 'Dealer draws',
    't21.hintHit': 'Odds favour another card: HIT',
    't21.hintStand': 'Too risky: STAND',
    't21.noFunds': 'Not enough chips for Stakes Up',
    't21.bothBust': 'BOTH BUST',
    't21.dealerCards': 'TRUMPS',
    'tr.glimpse': 'Glimpse',
    'tr.glimpse.d': "Reveal the dealer's hidden card",
    'tr.precision': 'Precision',
    'tr.precision.d': 'Draw the best card left in the deck',
    'tr.call3': 'Call 3',
    'tr.call3.d': 'Draw the 3, if it is still in the deck',
    'tr.call5': 'Call 5',
    'tr.call5.d': 'Draw the 5, if it is still in the deck',
    'tr.call7': 'Call 7',
    'tr.call7.d': 'Draw the 7, if it is still in the deck',
    'tr.line17': 'Line 17',
    'tr.line17.d': 'The target becomes 17 this round',
    'tr.line24': 'Line 24',
    'tr.line24.d': 'The target becomes 24 this round',
    'tr.recall': 'Recall',
    'tr.recall.d': 'Return your last card to the deck',
    'tr.switch': 'Switch',
    'tr.switch.d': "Swap your last card with the dealer's last card",
    'tr.burn': 'Burn',
    'tr.burn.d': "Send the dealer's last card back to the deck",
    'tr.guard': 'Guard',
    'tr.guard.d': 'If you lose this round, half your bet comes back',
    'tr.stakes': 'Stakes Up',
    'tr.stakes.d': 'Double your bet for this round',
    'tr.feather': 'Feather',
    'tr.feather.d': 'Draw the lowest card left in the deck',
    'tr.call2': 'Call 2',
    'tr.call2.d': 'Draw the 2, if it is still in the deck',
    'tr.call4': 'Call 4',
    'tr.call4.d': 'Draw the 4, if it is still in the deck',
    'tr.call6': 'Call 6',
    'tr.call6.d': 'Draw the 6, if it is still in the deck',
    'tr.twin': 'Twin Draw',
    'tr.twin.d': 'Draw two cards at once',
    'tr.redraw': 'Redraw',
    'tr.redraw.d': 'Draw a new card, then return your previous last card',
    'tr.foresight': 'Foresight',
    'tr.foresight.d': 'See the next card of the deck',
    'tr.reshuffle': 'Reshuffle',
    'tr.reshuffle.d': 'Shuffle the cards left in the deck',
    'tr.line27': 'Line 27',
    'tr.line27.d': 'The target becomes 27 this round',
    'tr.reset21': 'Reset 21',
    'tr.reset21.d': 'The target goes back to 21',
    'tr.line15': 'Line 15',
    'tr.line15.d': 'The target becomes 15 this round',
    'tr.line18': 'Line 18',
    'tr.line18.d': 'The target becomes 18 this round',
    'tr.line19': 'Line 19',
    'tr.line19.d': 'The target becomes 19 this round',
    'tr.line20': 'Line 20',
    'tr.line20.d': 'The target becomes 20 this round',
    'tr.line22': 'Line 22',
    'tr.line22.d': 'The target becomes 22 this round',
    'tr.line23': 'Line 23',
    'tr.line23.d': 'The target becomes 23 this round',
    'tr.line25': 'Line 25',
    'tr.line25.d': 'The target becomes 25 this round',
    'tr.line26': 'Line 26',
    'tr.line26.d': 'The target becomes 26 this round',
    'tr.line29': 'Line 29',
    'tr.line29.d': 'The target becomes 29 this round',
    'tr.line30': 'Line 30',
    'tr.line30.d': 'The target becomes 30 this round',
    'tr.shiftUp': 'Line +2',
    'tr.shiftUp.d': 'Raise the target by 2 (30 at most)',
    'tr.shiftDown': 'Line −2',
    'tr.shiftDown.d': 'Lower the target by 2 (15 at least)',
    'tr.lineWild': 'Wild Line',
    'tr.lineWild.d': 'The target becomes a random number from 16 to 28, never the current one',
    't21.hintTrump': 'Play {name}: it moves the target your way',
    't21.hintPlay': 'Play {name} now',
    'tr.force': 'Force Draw',
    'tr.force.d': 'Your opponent must take the top card',
    'tr.freeze': 'Freeze',
    'tr.freeze.d': 'Your opponent must stand on the next turn',
    'tr.shatter': 'Shatter',
    'tr.shatter.d': "Destroy one of your opponent's trumps",
    'tr.pickpocket': 'Pickpocket',
    'tr.pickpocket.d': "Steal one of the dealer's trumps",
    'tr.blindfold': 'Blindfold',
    'tr.blindfold.d': "The dealer can't play trumps this round",
    'tr.fortress': 'Fortress',
    'tr.fortress.d': 'If you lose this round, your whole bet comes back',
    'tr.bounty': 'Bounty',
    'tr.bounty.d': 'A win this round pays 2 to 1',
    'tr.call1': 'Call 1',
    'tr.call1.d': 'Draw the 1, if it is still in the deck',
    'tr.call8': 'Call 8',
    'tr.call8.d': 'Draw the 8, if it is still in the deck',
    'tr.lighten': 'Lighten',
    'tr.lighten.d': 'Return your highest card to the deck',
    'tr.heist': 'Heist',
    'tr.heist.d': "Take your opponent's last card into your hand",
    'tr.gift': 'Gift',
    'tr.gift.d': 'Give your last card to the dealer',
    'tr.overload': 'Overload',
    'tr.overload.d': 'The dealer takes the top two cards of the deck',
    'tr.rewind': 'Rewind',
    'tr.rewind.d': 'You and the dealer each return your last card to the deck',
    'tr.barrier': 'Barrier',
    'tr.barrier.d': "Blocks your opponent's next attack trump this round",
    'tr.tiebreak': 'Tiebreaker',
    'tr.tiebreak.d': 'Ties go to you this round',
    'tr.bullseye': 'Bullseye',
    'tr.bullseye.d': 'Win right on the target this round and it pays 3 to 1',
    'tr.reinforce': 'Reinforce',
    'tr.reinforce.d': 'Draw two new trump cards',
    'tr.swapLow': 'Low Swap',
    'tr.swapLow.d': "Swap your lowest card for the dealer's lowest card",
    'tr.swapHigh': 'High Swap',
    'tr.swapHigh.d': "Swap your highest card for the dealer's highest card",
    'tr.swapHands': 'Hand Swap',
    'tr.swapHands.d': "Swap your whole hand for the dealer's hand",
    'tr.redeal': 'Redeal',
    'tr.redeal.d': 'Both hands go back into the deck and each of you is dealt as many cards again, one at a time, taking turns (you first)',
    't21.overflow': 'Hand full: {name} was discarded',
    't21.redealt': 'Both hands dealt again',
    't21.bonusToast': '{name}: bonus trump! HIT again for your card',
    't21.dealerBonus': 'A trump came out with the dealer\'s card',
    't21.blocked': 'Barrier! {name} was blocked',
    'rar.common': 'Common',
    'rar.uncommon': 'Uncommon',
    'rar.rare': 'Rare',
    't21.codex': 'All trump cards',
    't21.dealerOnly': 'dealer can use it too',
    't21.next': 'Next card: {n}',
    't21.shuffled': 'The deck was reshuffled',
    't21.frozenYou': 'Frozen! You must stand this turn',
    't21.frozenDealer': 'The dealer is frozen',
    't21.lostTrump': 'The dealer destroyed your {name}',
    't21.stole': 'You stole {name}',
    't21.shattered': "Destroyed the dealer's {name}",
    't21.rules': `
      <p>An original duel version of blackjack. The deck has only <b>eleven cards, numbered 1 to 11</b> — one of each. You and the dealer each get two cards; the dealer's first card stays face down, and he can't see your first card either.</p>
      <h4>Turns</h4>
      <p>Take turns to <b>hit</b> or <b>stand</b>. The round ends when you stand and the dealer stands right after. Going over the target is a bust, but the round goes on — a trump may still save you.</p>
      <h4>Winning</h4>
      <p>Closest to the <b>target</b> (21 unless a trump changes it) without going over wins 1:1. If both bust, the lower total wins. <b>Ties go to the dealer</b> (the house's edge).</p>
      <h4>Trump cards</h4>
      <p>Each round you and the dealer get a trump card (up to <b>seven</b>, kept between rounds; one that comes with your hand full is discarded at once). Click a trump to play it any time on your turn; <b>point at it with the mouse to read what it does</b> (on a touch screen, hold it). There are {n} of them, common, uncommon and rare (gold border).</p>
      <p><b>Bonus trumps:</b> about one hit in six turns up a trump card instead of your card. It joins your hand with its own sound, the turn stays yours, and your next hit is a sure card, so the bonus never costs you your draw. The dealer's cards can bring a trump along with them too.</p>
      <p>The dealer plays trumps too, three turns in four when one fits; his hand also holds seven, and a new one replaces his oldest. A <b>Barrier</b> blocks the next attack trump played against its owner.</p>
      <p>Target trumps move the line anywhere from 15 to 30, and Wild Line draws it at random.</p>
      <h4>Hint</h4>
      <p>The light bulb shows the strongest move it finds, trumps included.</p>`,
  },
  {
    't21.stakes': 'DOBRO',
    't21.print2': 'Onze cartas · vence quem chegar mais perto do alvo',
    't21.target': 'ALVO',
    't21.needBet': 'Faça uma APOSTA',
    't21.dealerTrump': 'Dealer usa {name}',
    't21.gain': 'Novo trunfo: {name}',
    't21.dealerStands': 'Dealer para',
    't21.dealerHits': 'Dealer compra',
    't21.hintHit': 'As chances favorecem mais uma carta: PEDIR',
    't21.hintStand': 'Arriscado demais: PARAR',
    't21.noFunds': 'Fichas insuficientes para o Dobro',
    't21.bothBust': 'OS DOIS ESTOURARAM',
    't21.dealerCards': 'TRUNFOS',
    'tr.glimpse': 'Espiar',
    'tr.glimpse.d': 'Revela a carta escondida do dealer',
    'tr.precision': 'Precisão',
    'tr.precision.d': 'Compra a melhor carta que restou no baralho',
    'tr.call3': 'Chamar 3',
    'tr.call3.d': 'Compra o 3, se ainda estiver no baralho',
    'tr.call5': 'Chamar 5',
    'tr.call5.d': 'Compra o 5, se ainda estiver no baralho',
    'tr.call7': 'Chamar 7',
    'tr.call7.d': 'Compra o 7, se ainda estiver no baralho',
    'tr.line17': 'Linha 17',
    'tr.line17.d': 'O alvo vira 17 nesta rodada',
    'tr.line24': 'Linha 24',
    'tr.line24.d': 'O alvo vira 24 nesta rodada',
    'tr.recall': 'Recolher',
    'tr.recall.d': 'Devolve sua última carta ao baralho',
    'tr.switch': 'Trocar',
    'tr.switch.d': 'Troca sua última carta com a última do dealer',
    'tr.burn': 'Queimar',
    'tr.burn.d': 'Devolve a última carta do dealer ao baralho',
    'tr.guard': 'Escudo',
    'tr.guard.d': 'Se perder a rodada, metade da aposta volta',
    'tr.stakes': 'Dobro',
    'tr.stakes.d': 'Dobra sua aposta nesta rodada',
    'tr.feather': 'Pluma',
    'tr.feather.d': 'Compra a menor carta que restou no baralho',
    'tr.call2': 'Chamar 2',
    'tr.call2.d': 'Compra o 2, se ainda estiver no baralho',
    'tr.call4': 'Chamar 4',
    'tr.call4.d': 'Compra o 4, se ainda estiver no baralho',
    'tr.call6': 'Chamar 6',
    'tr.call6.d': 'Compra o 6, se ainda estiver no baralho',
    'tr.twin': 'Compra Dupla',
    'tr.twin.d': 'Compra duas cartas de uma vez',
    'tr.redraw': 'Refazer',
    'tr.redraw.d': 'Compra uma carta nova e devolve a sua última carta anterior',
    'tr.foresight': 'Vidência',
    'tr.foresight.d': 'Mostra a próxima carta do baralho',
    'tr.reshuffle': 'Reembaralhar',
    'tr.reshuffle.d': 'Embaralha as cartas que restam no baralho',
    'tr.line27': 'Linha 27',
    'tr.line27.d': 'O alvo vira 27 nesta rodada',
    'tr.reset21': 'Volta 21',
    'tr.reset21.d': 'O alvo volta para 21',
    'tr.line15': 'Linha 15',
    'tr.line15.d': 'O alvo vira 15 nesta rodada',
    'tr.line18': 'Linha 18',
    'tr.line18.d': 'O alvo vira 18 nesta rodada',
    'tr.line19': 'Linha 19',
    'tr.line19.d': 'O alvo vira 19 nesta rodada',
    'tr.line20': 'Linha 20',
    'tr.line20.d': 'O alvo vira 20 nesta rodada',
    'tr.line22': 'Linha 22',
    'tr.line22.d': 'O alvo vira 22 nesta rodada',
    'tr.line23': 'Linha 23',
    'tr.line23.d': 'O alvo vira 23 nesta rodada',
    'tr.line25': 'Linha 25',
    'tr.line25.d': 'O alvo vira 25 nesta rodada',
    'tr.line26': 'Linha 26',
    'tr.line26.d': 'O alvo vira 26 nesta rodada',
    'tr.line29': 'Linha 29',
    'tr.line29.d': 'O alvo vira 29 nesta rodada',
    'tr.line30': 'Linha 30',
    'tr.line30.d': 'O alvo vira 30 nesta rodada',
    'tr.shiftUp': 'Linha +2',
    'tr.shiftUp.d': 'Sobe o alvo em 2 (no máximo 30)',
    'tr.shiftDown': 'Linha −2',
    'tr.shiftDown.d': 'Desce o alvo em 2 (no mínimo 15)',
    'tr.lineWild': 'Linha Louca',
    'tr.lineWild.d': 'O alvo vira um número aleatório de 16 a 28, nunca o atual',
    't21.hintTrump': 'Use {name}: o alvo muda a seu favor',
    't21.hintPlay': 'Use {name} agora',
    'tr.force': 'Compra Forçada',
    'tr.force.d': 'O oponente é obrigado a pegar a carta do topo',
    'tr.freeze': 'Congelar',
    'tr.freeze.d': 'O oponente é obrigado a parar no próximo turno',
    'tr.shatter': 'Estilhaçar',
    'tr.shatter.d': 'Destrói um trunfo do oponente',
    'tr.pickpocket': 'Batedor',
    'tr.pickpocket.d': 'Rouba um trunfo do dealer',
    'tr.blindfold': 'Venda',
    'tr.blindfold.d': 'O dealer não pode usar trunfos nesta rodada',
    'tr.fortress': 'Fortaleza',
    'tr.fortress.d': 'Se perder a rodada, a aposta inteira volta',
    'tr.bounty': 'Recompensa',
    'tr.bounty.d': 'Uma vitória nesta rodada paga 2 para 1',
    'tr.call1': 'Chamar 1',
    'tr.call1.d': 'Compra o 1, se ainda estiver no baralho',
    'tr.call8': 'Chamar 8',
    'tr.call8.d': 'Compra o 8, se ainda estiver no baralho',
    'tr.lighten': 'Aliviar',
    'tr.lighten.d': 'Devolve sua carta mais alta ao baralho',
    'tr.heist': 'Furto',
    'tr.heist.d': 'Pega a última carta do oponente para a sua mão',
    'tr.gift': 'Presente',
    'tr.gift.d': 'Dá a sua última carta ao dealer',
    'tr.overload': 'Sobrecarga',
    'tr.overload.d': 'O dealer pega as duas cartas do topo do baralho',
    'tr.rewind': 'Rebobinar',
    'tr.rewind.d': 'Você e o dealer devolvem a última carta ao baralho',
    'tr.barrier': 'Barreira',
    'tr.barrier.d': 'Bloqueia o próximo trunfo de ataque do oponente nesta rodada',
    'tr.tiebreak': 'Desempate',
    'tr.tiebreak.d': 'Empates são seus nesta rodada',
    'tr.bullseye': 'Na Mosca',
    'tr.bullseye.d': 'Vencer cravando o alvo nesta rodada paga 3 para 1',
    'tr.reinforce': 'Reforço',
    'tr.reinforce.d': 'Ganha dois trunfos novos',
    'tr.swapLow': 'Troca Baixa',
    'tr.swapLow.d': 'Troca a sua carta mais baixa pela carta mais baixa do dealer',
    'tr.swapHigh': 'Troca Alta',
    'tr.swapHigh.d': 'Troca a sua carta mais alta pela carta mais alta do dealer',
    'tr.swapHands': 'Troca de Mãos',
    'tr.swapHands.d': 'Troca a sua mão inteira pela mão do dealer',
    'tr.redeal': 'Redistribuir',
    'tr.redeal.d': 'As cartas das duas mãos voltam ao baralho e cada um recebe de novo a mesma quantidade, uma de cada vez, alternando (você primeiro)',
    't21.overflow': 'Mão cheia: {name} foi descartado',
    't21.redealt': 'As duas mãos foram distribuídas de novo',
    't21.bonusToast': '{name}: trunfo bônus! PEÇA de novo para receber sua carta',
    't21.dealerBonus': 'Saiu um trunfo com a carta do dealer',
    't21.blocked': 'Barreira! {name} foi bloqueado',
    'rar.common': 'Comum',
    'rar.uncommon': 'Incomum',
    'rar.rare': 'Raro',
    't21.codex': 'Todos os trunfos',
    't21.dealerOnly': 'o dealer também usa',
    't21.next': 'Próxima carta: {n}',
    't21.shuffled': 'O baralho foi reembaralhado',
    't21.frozenYou': 'Congelado! Você precisa parar neste turno',
    't21.frozenDealer': 'O dealer está congelado',
    't21.lostTrump': 'O dealer destruiu seu {name}',
    't21.stole': 'Você roubou {name}',
    't21.shattered': 'Destruiu o {name} do dealer',
    't21.rules': `
      <p>Uma versão original de blackjack em duelo. O baralho tem só <b>onze cartas, numeradas de 1 a 11</b> — uma de cada. Você e o dealer recebem duas cartas; a primeira do dealer fica virada, e ele também não vê a sua primeira.</p>
      <h4>Turnos</h4>
      <p>Revezem entre <b>pedir</b> e <b>parar</b>. A rodada acaba quando você para e o dealer para logo depois. Passar do alvo é estourar, mas a rodada continua — um trunfo ainda pode te salvar.</p>
      <h4>Vitória</h4>
      <p>Quem chegar mais perto do <b>alvo</b> (21, a não ser que um trunfo mude) sem passar ganha 1:1. Se os dois estourarem, vence o total menor. <b>Empate é do dealer</b> (a vantagem da casa).</p>
      <h4>Cartas trunfo</h4>
      <p>A cada rodada você e o dealer ganham um trunfo (até <b>sete</b>, guardados entre rodadas; um que chega com a sua mão cheia é descartado na hora). Clique num trunfo para usá-lo no seu turno; <b>passe o mouse sobre ele para ler o que ele faz</b> (numa tela de toque, segure-o). São {n}, entre comuns, incomuns e raros (borda dourada).</p>
      <p><b>Trunfos bônus:</b> mais ou menos um pedido em cada seis tira um trunfo no lugar da sua carta. Ele entra na sua mão com um som próprio, o turno continua seu e o próximo pedido é carta garantida, então o bônus nunca custa o seu saque. As cartas do dealer também podem trazer um trunfo junto.</p>
      <p>O dealer também usa trunfos, em três de cada quatro turnos em que um serve; a mão dele também guarda sete, e um novo substitui o mais antigo. A <b>Barreira</b> bloqueia o próximo trunfo de ataque usado contra quem a jogou.</p>
      <p>Os trunfos de alvo levam a linha para qualquer ponto entre 15 e 30, e a Linha Louca a sorteia.</p>
      <h4>Dica</h4>
      <p>A lâmpada mostra a jogada mais forte que encontra, trunfos incluídos.</p>`,
  },
);

const V = { dealer: 0.245, target: 0.372, player: 0.5 };

/** Wild Line's art: a tilted die (five pips cut out), drawn like the shared 24×24 icons. */
const pip = (x: number, y: number) => `M${x - 1.7} ${y}a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0 -3.4 0z`;
const DIE_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" transform="rotate(-12 12 12)" d="' +
  'M6.6 3h10.8A3.6 3.6 0 0 1 21 6.6v10.8a3.6 3.6 0 0 1-3.6 3.6H6.6A3.6 3.6 0 0 1 3 17.4V6.6A3.6 3.6 0 0 1 6.6 3z' +
  [pip(7.8, 7.8), pip(16.2, 7.8), pip(12, 12), pip(7.8, 16.2), pip(16.2, 16.2)].join('') +
  '"/></svg>';

/** Low Swap / High Swap: two cards under a two-way arrow, an arrow cut out of each (down: low, up: high). */
function swapArt(high: boolean) {
  const mark = (x: number) => (high ? `M${x - 2.2} 17.6h4.4L${x} 13.6z` : `M${x - 2.2} 13.6h4.4L${x} 17.6z`);
  return (
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1.5 5 5.5 1.5v2.4h13V1.5l4 3.5-4 3.5V6.1h-13v2.4z"/>' +
    `<path fill-rule="evenodd" d="M2 10h8.2v12H2z${mark(6.1)}M13.8 10H22v12h-8.2z${mark(17.9)}"/></svg>`
  );
}

/** Art of the newer trumps, drawn like the shared 24×24 icons. */
const art = (d: string, evenodd = false) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path${evenodd ? ' fill-rule="evenodd"' : ''} d="${d}"/></svg>`;
const NEW_ART = {
  // an arrow lifting a card off the hand
  lighten: art('M12 1.8l6.4 6.9H14v6.6h-4V8.7H5.6zM4 17h16v2.6H4zM6.6 20.9h10.8v1.6H6.6z'),
  // a magnet pulling the card over
  heist: art('M4 8.2h5v3.1a3 3 0 0 0 6 0V8.2h5v3.1a8 8 0 0 1-16 0zM4 3h5v4H4zM15 3h5v4h-5z'),
  // a gift box with its bow
  gift: art('M3 8.4h8v3.8H3zM13 8.4h8v3.8h-8zM4 13.4h7v7.8H4zM13 13.4h7v7.8h-7zM12 8.2c-1.6-4-6.2-4.6-5.6-1.6C6.9 8.2 12 8.2 12 8.2zM12 8.2c1.6-4 6.2-4.6 5.6-1.6C17.1 8.2 12 8.2 12 8.2z'),
  // two bolts: two cards forced on the dealer
  overload: art('M9 1.5 2.5 12.8h4.3l-1.7 9.7 7.5-12.4H8.3zM18.5 1.5 12 12.8h4.3l-1.7 9.7 7.5-12.4h-4.3z'),
  // rewind
  rewind: art('M11.6 5v14L2 12zM21.6 5v14L12 12z'),
  // a brick wall
  barrier: art('M2 3.6h9.2V8H2zM12.8 3.6H22V8h-9.2zM2 9.8h4.4v4.4H2zM8 9.8h8v4.4H8zM17.6 9.8H22v4.4h-4.4zM2 16h9.2v4.4H2zM12.8 16H22v4.4h-9.2z'),
  // the scales
  tiebreak: art('M11 3h2v15.4h-2zM7 19h10v2.4H7zM3.4 5.8h17.2v1.8H3.4zM1.6 13.6 5 7.4l3.4 6.2a3.4 3.4 0 0 1-6.8 0zM15.6 13.6 19 7.4l3.4 6.2a3.4 3.4 0 0 1-6.8 0z'),
  // a target with an arrow struck dead centre (Precision's target has no arrow)
  bullseye:
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path fill-rule="evenodd" d="M10 5.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17zM10 8a6 6 0 1 0 0 12a6 6 0 1 0 0-12zM10 10.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7z"/>' +
    '<path d="M9.3 13.3 18.9 3.7l1.4 1.4-9.6 9.6z M17.6 1.6l.9 2.6 2.6.9 2.1-2.1-2.3-.7-.7-2.3z"/></svg>',
  // a card with a plus: new trumps
  reinforce: art('M5 2h14v20H5zM7.2 4.2v15.6h9.6V4.2zM11 8h2v3h3v2h-3v3h-2v-3H8v-2h3z', true),
  // two cards under a two-way arrow, each marked low (down) or high (up)
  swapLow: swapArt(false),
  swapHigh: swapArt(true),
  // two fanned hands under a two-way arrow
  swapHands:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1.5 5 5.5 1.5v2.4h13V1.5l4 3.5-4 3.5V6.1h-13v2.4z"/>' +
    '<rect x="1.3" y="11" width="7" height="11" rx="1.2" opacity=".55" transform="rotate(-12 4.8 16.5)"/><rect x="4.2" y="10.4" width="7" height="11" rx="1.2"/>' +
    '<rect x="15.7" y="11" width="7" height="11" rx="1.2" opacity=".55" transform="rotate(12 19.2 16.5)"/><rect x="12.8" y="10.4" width="7" height="11" rx="1.2"/></svg>',
  // the deck, dealing out to both sides again
  redeal:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="1.5" width="7" height="10" rx="1.2" opacity=".5"/><rect x="8.5" y="3.8" width="7" height="10" rx="1.2" opacity=".75"/>' +
    '<rect x="8.5" y="6.1" width="7" height="10" rx="1.2"/><path d="M7.2 18.4H4.6v2.3L1 17.6l3.6-3.1v2.3h2.6zM16.8 18.4h2.6v2.3l3.6-3.1-3.6-3.1v2.3h-2.6z"/></svg>',
};

/** The inside of a 24×24 art (its <svg> wrapper taken off), to draw it again inside another. */
const inner = (svg: string) => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
const spip = (x: number, y: number) => `M${x - 0.8} ${y}a0.8 0.8 0 1 0 1.6 0a0.8 0.8 0 1 0 -1.6 0z`;
/**
 * Party Trump 21's wild cards: the art of the card they follow, a little smaller, with a die in the
 * corner (the rival is drawn at random).
 */
const wildArt = (base: string) =>
  '<svg viewBox="0 0 24 24" aria-hidden="true">' +
  `<svg x="0" y="0" width="19" height="19" viewBox="0 0 24 24">${inner(base)}</svg>` +
  '<rect x="12.6" y="12.6" width="11" height="11" rx="2.6" fill="#1a1226"/>' +
  `<path fill-rule="evenodd" d="M15.8 14.3h5.2a1.7 1.7 0 0 1 1.7 1.7v5.2a1.7 1.7 0 0 1-1.7 1.7h-5.2a1.7 1.7 0 0 1-1.7-1.7V16a1.7 1.7 0 0 1 1.7-1.7z${spip(16.3, 16.5)}${spip(18.4, 18.6)}${spip(20.5, 20.7)}"/></svg>`;
/** Party Trump 21's table cards. */
const TABLE_ART = {
  // three cards going round the table
  passAround:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2.6 2.2"/>' +
    [0, 120, 240]
      .map((a) => `<g transform="rotate(${a} 12 12)"><rect x="9.4" y="0.6" width="5.2" height="7.2" rx="1"/><path d="M19.73 9.39 19.56 6.48 17.3 7.78z"/></g>`)
      .join('') +
    '</svg>',
  // the best card of the row lifted out
  tablePick:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="1.4" y="11" width="6.4" height="9" rx="1" opacity=".55"/><rect x="16.2" y="11" width="6.4" height="9" rx="1" opacity=".55"/>' +
    '<rect x="8.8" y="7.6" width="6.4" height="9" rx="1"/><path d="M12 .8l3.4 3.8h-2.2v2h-2.4v-2H8.6z"/><path d="M2 21.2h20V23H2z" opacity=".75"/></svg>',
  // a long wall with battlements: the whole table
  rampart: art('M1 8.5h3V5h3.2v3.5h3.2V5h3.2v3.5h3.2V5H20v3.5h3V21H1zM2.4 12.6v1.1h19.2v-1.1zM2.4 16.8v1.1h19.2v-1.1zM7.6 8.5v4.1h1.1V8.5zM15.3 8.5v4.1h1.1V8.5zM11.4 13.7v3.1h1.1v-3.1zM5 17.9v3.1h1.1v-3.1zM17.9 17.9v3.1H19v-3.1z', true),
  // a crown over the round table
  crown:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.6 3.6 7.3 6.5l4.7-5 4.7 5 3.7-2.9-1.5 8.4H5.1z"/>' +
    '<path d="M12 13.8c5.5 0 10 1.9 10 4.2s-4.5 4.2-10 4.2S2 20.3 2 18s4.5-4.2 10-4.2z" opacity=".7"/></svg>',
};

const TRUMP_ICON: Record<TrumpId, { icon?: IconName; text?: string; svg?: string }> = {
  glimpse: { icon: 'eye' },
  precision: { icon: 'target' },
  feather: { icon: 'feather' },
  call1: { text: '1' },
  call2: { text: '2' },
  call3: { text: '3' },
  call4: { text: '4' },
  call5: { text: '5' },
  call6: { text: '6' },
  call7: { text: '7' },
  call8: { text: '8' },
  lighten: { svg: NEW_ART.lighten },
  twin: { icon: 'twin' },
  redraw: { icon: 'cycle' },
  recall: { icon: 'redo' },
  foresight: { icon: 'crystal' },
  reshuffle: { icon: 'shuffle' },
  line15: { text: '15' },
  line17: { text: '17' },
  line18: { text: '18' },
  line19: { text: '19' },
  line20: { text: '20' },
  reset21: { text: '21' },
  line22: { text: '22' },
  line23: { text: '23' },
  line24: { text: '24' },
  line25: { text: '25' },
  line26: { text: '26' },
  line27: { text: '27' },
  line29: { text: '29' },
  line30: { text: '30' },
  shiftUp: { text: '+2' },
  shiftDown: { text: '−2' },
  lineWild: { svg: DIE_SVG },
  burn: { icon: 'flame' },
  switch: { icon: 'swap' },
  force: { icon: 'bolt' },
  freeze: { icon: 'snow' },
  shatter: { icon: 'crack' },
  pickpocket: { icon: 'grab' },
  blindfold: { icon: 'mask' },
  guard: { icon: 'shield' },
  fortress: { icon: 'castle' },
  stakes: { icon: 'chips' },
  bounty: { icon: 'crown' },
  heist: { svg: NEW_ART.heist },
  gift: { svg: NEW_ART.gift },
  overload: { svg: NEW_ART.overload },
  rewind: { svg: NEW_ART.rewind },
  barrier: { svg: NEW_ART.barrier },
  tiebreak: { svg: NEW_ART.tiebreak },
  bullseye: { svg: NEW_ART.bullseye },
  reinforce: { svg: NEW_ART.reinforce },
  swapLow: { svg: NEW_ART.swapLow },
  swapHigh: { svg: NEW_ART.swapHigh },
  swapHands: { svg: NEW_ART.swapHands },
  redeal: { svg: NEW_ART.redeal },
  wildSwitch: { svg: wildArt(ICONS.swap) },
  wildForce: { svg: wildArt(ICONS.bolt) },
  wildLow: { svg: wildArt(NEW_ART.swapLow) },
  wildHigh: { svg: wildArt(NEW_ART.swapHigh) },
  wildHands: { svg: wildArt(NEW_ART.swapHands) },
  wildRedeal: { svg: wildArt(NEW_ART.redeal) },
  passAround: { svg: TABLE_ART.passAround },
  tablePick: { svg: TABLE_ART.tablePick },
  rampart: { svg: TABLE_ART.rampart },
  crown: { svg: TABLE_ART.crown },
};

/** A trump card's face art (an icon, a number, or its own SVG). */
export const trumpFace = (id: TrumpId) => {
  const ic = TRUMP_ICON[id];
  return ic.svg ?? (ic.icon ? ICONS[ic.icon] : `<em>${ic.text}</em>`);
};

type TurnPick = 'hit' | 'stand' | { trump: TrumpId };

export class Trump21View extends TableGame {
  readonly id = 'trump21';
  readonly title = 'Trump 21';
  protected readonly felt = 'trump21' as const;
  private duel = new Duel();
  private c3 = new Map<number, Card3D>();
  private targetPin: Pin | null = null;
  private dealerPin: Pin | null = null;
  private nextPin: Pin | null = null;
  private bubbles: Record<Side, Pin | null> = { player: null, dealer: null };
  private rowEl: HTMLElement | null = null;
  private resolveTurn: ((p: TurnPick) => void) | null = null;
  private myTurn = false;
  private shown = new Set<number>();

  constructor(g: GameCtx) {
    super(g, 1);
  }

  rules() {
    const rows = SINGLE_TRUMPS.map(
      (tr) =>
        `<div class="codex-row" data-rarity="${tr.rarity}"><span class="trump mini" data-rarity="${tr.rarity}"><span class="tr-ic">${trumpFace(tr.id)}</span></span>` +
        `<span><b>${this.trumpName(tr.id)}</b> <i>${t(`rar.${tr.rarity}`)}${tr.dealer ? ` · ${t('t21.dealerOnly')}` : ''}</i><br>${t(`tr.${tr.id}.d`)}</span></div>`,
    ).join('');
    return `${t('t21.rules', { n: SINGLE_TRUMPS.length })}<h4>${t('t21.codex')}</h4><p>${t('tu.hold')}</p><div class="codex">${rows}</div>`;
  }

  protected spotDefs(): SpotDef[] {
    return [
      { id: 'bet', label: t('t21.bet'), u: 0.33, v: 0.668, size: 0.6, max: 2500 },
      { id: 'stakes', label: t('t21.stakes'), u: 0.67, v: 0.668, size: 0.6, auto: true },
    ];
  }

  protected defaultBets() {
    return { bet: 25 };
  }

  protected decorate() {
    const { table, hud } = this.g;
    table.addDecal(
      tablePrint(
        [
          { text: t('t21.print1'), y: 76, R: 1400, font: FONT.title(62), spacing: 10, color: GOLD },
          { text: t('t21.print2'), y: 130, R: 1400, font: FONT.italic(34), color: INK_SOFT },
        ],
        160,
      ),
      0.56,
      0.372,
      3.25,
    );
    this.targetPin = hud.pin('t21-target');
    this.targetPin.el.innerHTML = `<small>${t('t21.target')}</small><b>21</b>`;
    this.dealerPin = hud.pin('t21-dtrumps');
    this.nextPin = hud.pin('t21-next');
    this.bubbles.player = hud.pin('bubble');
    this.bubbles.dealer = hud.pin('bubble');
    this.rowEl = document.createElement('div');
    this.rowEl.className = 'trumprow';
    hud.root.appendChild(this.rowEl);
    this.renderTrumps();
  }

  protected cleanup() {
    this.targetPin?.remove();
    this.dealerPin?.remove();
    this.nextPin?.remove();
    this.nextPin = null;
    this.bubbles.player?.remove();
    this.bubbles.dealer?.remove();
    this.rowEl?.remove();
    this.targetPin = this.dealerPin = this.rowEl = null;
    this.bubbles = { player: null, dealer: null };
    this.c3.clear();
  }

  protected validate() {
    if ((this.spots.amounts().bet ?? 0) < 5) return t('t21.needBet');
    return '';
  }

  /**
   * The light bulb: the strongest move found (partytrump/ai.ts, the same reasoning as the Party
   * table's bulb and its best regulars): hit, stand, or a trump to play now.
   */
  protected advice() {
    if (!this.myTurn) return null;
    const pick = duelPick(this.duel, 'calculated', newMemory(), cryptoRng);
    if (typeof pick === 'object') {
      const tr = pick.trump;
      // a trump turns this hand around: flash that card (no button to highlight)
      const b = this.rowEl?.querySelector<HTMLElement>(`.trump[data-id="${tr}"]`);
      if (b) {
        b.classList.remove('fresh');
        void b.offsetWidth;
        b.classList.add('fresh');
      }
      const key = isTargetTrump(tr) ? 't21.hintTrump' : 't21.hintPlay';
      return { id: 'trump', msg: t(key, { name: this.trumpName(tr) }) };
    }
    return { id: pick, msg: pick === 'hit' ? t('t21.hintHit') : t('t21.hintStand') };
  }

  // ---------------------------------------------------------------- HUD
  private trumpName(id: TrumpId) {
    return t(`tr.${id}`);
  }

  /** A trump's card and what it does (for the held card and the bonus flight). */
  private trumpInfo(id: TrumpId): TrumpCardInfo {
    const dealer = TRUMPS.find((x) => x.id === id)?.dealer;
    return { face: trumpFace(id), name: this.trumpName(id), desc: t(`tr.${id}.d`), rarity: rarityOf(id), tag: dealer ? t('t21.dealerOnly') : undefined };
  }

  /** The player's trumps: a tap plays one on your turn, a press held shows what it does. */
  private renderTrumps() {
    const el = this.rowEl;
    if (!el) return;
    const ids = this.duel.trumps.player;
    // six or seven cards overlap a little, like a hand of cards, to fit the row
    el.classList.toggle('crowd', ids.length > 5);
    el.style.setProperty('--n', String(Math.max(1, ids.length)));
    el.replaceChildren(
      ...ids.map((id, i) => {
        const b = document.createElement('button');
        b.className = 'trump live';
        b.dataset.id = id;
        b.dataset.rarity = rarityOf(id);
        b.dataset.i = String(i);
        b.innerHTML = trumpInner({ face: trumpFace(id), name: this.trumpName(id) });
        const usable = () => this.myTurn && !!this.resolveTurn && this.duel.canUse('player', id) && (id !== 'stakes' || this.g.wallet.canAfford(this.spots.get('bet').amount));
        bindTrump(b, {
          host: this.g.hud.root,
          info: () => this.trumpInfo(id),
          canPlay: usable,
          onPeek: () => this.g.sfx.trumpLift(),
          play: () => {
            const r = this.resolveTurn;
            if (!r) return;
            this.g.sfx.click();
            this.resolveTurn = null;
            // the card lifts off the hand before its effect plays
            b.classList.add('used');
            setTimeout(() => r({ trump: id }), 260);
          },
        });
        return b;
      }),
    );
    if (this.dealerPin) {
      const n = this.duel.trumps.dealer.length;
      // the dealer's Barrier, while it stands
      const shield = this.duel.barrier.dealer ? `<em class="t21-shield">${trumpFace('barrier')}</em>` : '';
      this.dealerPin.el.innerHTML = n || shield ? `<small>${t('t21.dealerCards')}</small><b>${'<i></i>'.repeat(n)}${shield}</b>` : '';
      this.dealerPin.show(n > 0 || !!shield);
    }
  }

  /** Animation speed (the sounds that run on their own clock follow it). */
  private get speed() {
    return Math.max(0.25, gsap.globalTimeline.timeScale());
  }

  /** Shows the top card of the deck while the player knows it (Foresight). */
  private updateNext() {
    const p = this.nextPin;
    if (!p) return;
    const n = this.duel.nextCard;
    if (n === null) {
      p.show(false);
      return;
    }
    p.el.innerHTML = `<small>${t('t21.next', { n: '' }).replace(/[:\s]+$/, '')}</small><img alt="${n}" src="${cardDataURL(100 + n, 90)}">`;
    p.pop();
    p.show(true);
  }

  private setTarget(n: number, pop = true) {
    const b = this.targetPin?.el.querySelector('b');
    if (!b) return;
    b.textContent = String(n);
    this.targetPin!.el.classList.toggle('changed', n !== 21);
    if (pop) this.targetPin!.pop();
  }

  /** Wild Line: the target display rolls through numbers like a slot reel (a tick per step), then lands with the bell. */
  private async spinTarget(n: number) {
    const { sfx } = this.g;
    const b = this.targetPin?.el.querySelector('b');
    if (b) {
      const steps = 14;
      let shown = Number(b.textContent);
      for (let i = 0; i < steps; i++) {
        let v = shown;
        // a different number each step, and never the result just before it lands
        while (v === shown || (i === steps - 1 && v === n)) v = WILD_MIN + Math.floor(Math.random() * (WILD_MAX - WILD_MIN + 1));
        shown = v;
        b.textContent = String(v);
        gsap.fromTo(b, { yPercent: -40, opacity: 0.4 }, { yPercent: 0, opacity: 1, duration: 0.07, overwrite: true });
        sfx.tick(0.14, 0.85 + (0.4 * i) / steps);
        await wait(0.045 + 0.17 * (i / steps) ** 2); // the reel slows down
      }
    }
    this.setTarget(n);
    if (b) gsap.fromTo(b, { yPercent: -40, opacity: 0.4 }, { yPercent: 0, opacity: 1, duration: 0.22, ease: 'back.out(3)', overwrite: true });
    sfx.bell();
  }

  /** The totals of the cards on the table (while a hand is being dealt, only the cards already down). */
  private updateBubbles() {
    const d = this.duel;
    const down = (side: Side) => d[side].filter((v) => this.c3.has(v));
    const sum = (vs: number[]) => vs.reduce((a, b) => a + b, 0);
    const mine = down('player');
    const p = sum(mine);
    const pb = this.bubbles.player;
    if (pb) {
      pb.set(`${p} / ${d.target}`, `bubble up${p > d.target ? ' bust' : p === d.target ? ' bj' : ''}`);
      pb.show(mine.length > 0);
    }
    const db = this.bubbles.dealer;
    if (db) {
      const his = down('dealer');
      const hidden = his.length > 0 && his[0] === d.dealer[0] && !this.shown.has(d.dealer[0]);
      const vis = sum(his.slice(hidden ? 1 : 0));
      const tot = sum(his);
      db.set(hidden ? `? + ${vis}` : `${tot} / ${d.target}`, `bubble down${!hidden && tot > d.target ? ' bust' : ''}`);
      db.show(his.length > 0);
    }
  }

  protected onSync() {
    const { stage } = this.g;
    const tmp = new THREE.Vector3();
    const tp = stage.toScreen(stage.screenToTable(0.13, V.target));
    this.targetPin?.place(tp.x, tp.y);
    this.targetPin?.show(this.phase === 'playing');
    const dp = stage.toScreen(stage.screenToTable(0.86, V.dealer - 0.085));
    this.dealerPin?.place(dp.x, dp.y);
    const np = stage.toScreen(stage.screenToTable(0.87, V.target));
    this.nextPin?.place(np.x, np.y);
    const pz = stage.screenToTable(0.5, V.player).z;
    const dz = stage.screenToTable(0.5, V.dealer).z;
    const a = stage.toScreen(tmp.set(0, 0, pz + CARD_H / 2 + 0.2));
    this.bubbles.player?.place(a.x, a.y);
    const b = stage.toScreen(tmp.set(0, 0, dz - CARD_H / 2 - 0.27));
    this.bubbles.dealer?.place(b.x, b.y);
    this.rowEl?.classList.toggle('hidden', this.phase !== 'playing');
  }

  // ---------------------------------------------------------------- 3D cards
  private rowPlaces(side: Side) {
    const vals = this.duel[side];
    const z = this.g.stage.screenToTable(0.5, side === 'player' ? V.player : V.dealer).z;
    const n = vals.length;
    const gap = Math.min(0.62, 3.0 / Math.max(1, n));
    return vals.map((v, i) => ({ v, pos: new THREE.Vector3((i - (n - 1) / 2) * gap, REST_Y + i * 0.004, z), yaw: (((v * 37) % 7) - 3) * 0.004 }));
  }

  /** Slides a hand's cards to their places (`across`: some cross the table, slower and lifted higher). */
  private relayoutRow(side: Side, except?: number, across = false) {
    return Promise.all(
      this.rowPlaces(side)
        .filter((p) => p.v !== except)
        .map((p) => {
          const c = this.c3.get(p.v);
          return c ? (across ? slideCard(c, { pos: p.pos, yaw: p.yaw }, 0.55, 0.35) : slideCard(c, { pos: p.pos, yaw: p.yaw }, 0.3)) : Promise.resolve();
        }),
    );
  }

  private async applyEvents(evs: DuelEvent[]) {
    const { sfx, hud, cards, table, fx } = this.g;
    for (const e of evs) {
      switch (e.t) {
        case 'draw': {
          const c = cards.create(100 + e.value);
          c.obj.visible = false;
          this.c3.set(e.value, c);
          this.cardsT.all.push(c);
          const faceUp = e.side === 'player' || this.duel.dealer[0] !== e.value || this.duel.glimpsed;
          if (faceUp) this.shown.add(e.value);
          this.relayoutRow(e.side, e.value);
          const pl = this.rowPlaces(e.side).find((p) => p.v === e.value)!;
          sfx.play('slide', { vol: 0.8 });
          await dealCard(c, table.shoeMouth(), table.shoeYaw, { pos: pl.pos, yaw: pl.yaw }, { faceUp, dur: 0.48, onLand: () => sfx.play('place', { vol: 0.5 }) });
          this.updateBubbles();
          break;
        }
        case 'back': {
          const c = this.c3.get(e.value);
          if (c) {
            sfx.play('shove', { vol: 0.6 });
            this.c3.delete(e.value);
            this.cardsT.all.splice(this.cardsT.all.indexOf(c), 1);
            await collectCards([c], table.shoeMouth(), table.shoeYaw, () => cards.destroy(c));
            this.shown.delete(e.value);
          }
          await this.relayoutRow(e.side);
          this.updateBubbles();
          break;
        }
        case 'switch': {
          sfx.play('fan', { vol: 0.6 });
          await Promise.all([this.relayoutRow('player'), this.relayoutRow('dealer')]);
          const a = this.c3.get(e.a);
          const b = this.c3.get(e.b);
          if (b && !b.faceUp) await flipCard(b, { dur: 0.4 });
          if (a && !a.faceUp) await flipCard(a, { dur: 0.4 });
          this.shown.add(e.a);
          this.shown.add(e.b);
          this.updateBubbles();
          break;
        }
        case 'target': {
          if (e.wild) await this.spinTarget(e.n);
          else {
            this.setTarget(e.n);
            sfx.play('chips', { vol: 0.5 });
          }
          this.updateBubbles();
          break;
        }
        case 'reveal': {
          const c = this.c3.get(this.duel.dealer[0]);
          if (c && !c.faceUp) {
            sfx.play('fan', { vol: 0.5 });
            await flipCard(c, { dur: 0.55 });
          }
          this.shown.add(this.duel.dealer[0]);
          this.updateBubbles();
          break;
        }
        case 'trump': {
          if (e.side === 'dealer') {
            sfx.play('chips', { vol: 0.6 });
            await hud.banner(this.trumpName(e.id).toUpperCase(), t('t21.dealerTrump', { name: this.trumpName(e.id) }), 'small lose', 1100);
          } else {
            hud.toast(t(`tr.${e.id}.d`), 1600);
            const pz = this.g.stage.screenToTable(0.5, V.player).z;
            if (e.id === 'guard' || e.id === 'barrier') fx.glow(new THREE.Vector3(0, 0, pz), 2.4, 1.6, 1.4, '#8fd0ff');
            if (e.id === 'tiebreak' || e.id === 'bullseye') fx.glow(new THREE.Vector3(0, 0, pz), 2.4, 1.6, 1.4, '#ffd76a');
          }
          this.renderTrumps();
          break;
        }
        case 'gain': {
          if (e.bonus) {
            // a trump card out of the deck with a hit: it flies in before it joins the hand
            await this.bonusFlight(e.side, e.id);
            break;
          }
          this.renderTrumps();
          if (e.side === 'player') {
            if (rarityOf(e.id) === 'rare') this.g.sfx.win(false);
            hud.toast(t('t21.gain', { name: this.trumpName(e.id) }), 1400);
            const last = this.rowEl?.lastElementChild as HTMLElement | null;
            last?.classList.add('fresh');
          }
          break;
        }
        case 'move': {
          // Heist / Gift: the card slides across to its new hand, face up
          sfx.play('fan', { vol: 0.6 });
          const c = this.c3.get(e.value);
          await Promise.all([this.relayoutRow('player'), this.relayoutRow('dealer')]);
          if (c && !c.faceUp) await flipCard(c, { dur: 0.35 });
          this.shown.add(e.value);
          this.updateBubbles();
          break;
        }
        case 'swap': {
          // Low / High Swap, Hand Swap: the cards cross the table to their new places
          sfx.play('fan', { vol: 0.7 });
          await Promise.all([this.relayoutRow('player', undefined, true), this.relayoutRow('dealer', undefined, true)]);
          // what came over to your hand turns face up (the dealer's face-down card included)
          const down = this.duel.player.map((v) => this.c3.get(v)).filter((c): c is Card3D => !!c && !c.faceUp);
          if (down.length) await Promise.all(down.map((c) => flipCard(c, { dur: 0.4 })));
          for (const v of this.duel.player) this.shown.add(v);
          if (this.duel.glimpsed && this.duel.dealer.length) this.shown.add(this.duel.dealer[0]);
          this.updateBubbles();
          break;
        }
        case 'redeal': {
          // every card back into the shoe; the draws that follow deal the hands again
          const all = [...this.c3.values()];
          this.c3.clear();
          this.shown.clear();
          for (const c of all) this.cardsT.all.splice(this.cardsT.all.indexOf(c), 1);
          this.updateBubbles();
          sfx.play('shove', { vol: 0.7 });
          await collectCards(all, table.shoeMouth(), table.shoeYaw, (c) => cards.destroy(c));
          sfx.play('shuffle', { vol: 0.6 });
          hud.toast(t('t21.redealt'), 1400);
          await wait(0.3);
          break;
        }
        case 'overflow': {
          // a new trump with the hand full: it shows, then goes to the discard
          if (e.side !== 'player') break;
          sfx.trumpDraw(rarityOf(e.id), false, this.speed);
          await flyBonusTrump(this.g, { info: this.trumpInfo(e.id), to: null, discard: true });
          sfx.play('shove', { vol: 0.5 });
          hud.toast(t('t21.overflow', { name: this.trumpName(e.id) }), 1800);
          break;
        }
        case 'blocked': {
          // a Barrier takes the hit
          sfx.barrier();
          const z = this.g.stage.screenToTable(0.5, e.side === 'player' ? V.player : V.dealer).z;
          fx.glow(new THREE.Vector3(0, 0, z), 2.8, 1.6, 1.5, '#8fd0ff');
          fx.burst(new THREE.Vector3(0, 0.25, z), 50, '#cfefff');
          hud.toast(t('t21.blocked', { name: this.trumpName(e.id) }), 1700);
          this.renderTrumps();
          break;
        }
        case 'stand':
          if (e.side === 'dealer') hud.toast(t('t21.dealerStands'), 900);
          break;
        case 'foresee':
          sfx.play('fan', { vol: 0.5 });
          hud.toast(t('t21.next', { n: e.value }), 2200);
          this.updateNext();
          break;
        case 'shuffle':
          sfx.play('shuffle', { vol: 0.6 });
          hud.toast(t('t21.shuffled'), 1300);
          this.updateNext();
          break;
        case 'freeze': {
          sfx.play('chips', { vol: 0.5 });
          hud.toast(e.side === 'player' ? t('t21.frozenYou') : t('t21.frozenDealer'), 1700);
          const z = this.g.stage.screenToTable(0.5, e.side === 'player' ? V.player : V.dealer).z;
          fx.glow(new THREE.Vector3(0, 0, z), 2.6, 1.5, 1.6, '#9fe3ff');
          fx.burst(new THREE.Vector3(0, 0.25, z), 60, '#cfefff');
          break;
        }
        case 'lose': {
          this.renderTrumps();
          // the dealer's oldest trump making room for a new one: nothing to announce
          if (e.by === 'discard') break;
          if (e.side === 'player') hud.toast(t('t21.lostTrump', { name: this.trumpName(e.id) }), 1800);
          else if (e.by === 'shatter') hud.toast(t('t21.shattered', { name: this.trumpName(e.id) }), 1600);
          else hud.toast(t('t21.stole', { name: this.trumpName(e.id) }), 1600);
          sfx.play('shove', { vol: 0.5 });
          break;
        }
      }
    }
    this.updateNext();
  }

  /**
   * A bonus trump from the deck. The player's flies out of the shoe, turns over with its sound and
   * drops into its slot (the hand shows it once it lands); the dealer's goes face down to his pile.
   */
  private async bonusFlight(side: Side, id: TrumpId) {
    const { sfx, hud } = this.g;
    if (side === 'dealer') {
      sfx.trumpDraw(rarityOf(id), true, this.speed);
      await flyBonusTrump(this.g, { info: null, to: this.dealerPin?.el.querySelector('i:last-child') ?? this.dealerPin?.el ?? null, endScale: 0.32 });
      this.renderTrumps();
      this.dealerPin?.pop();
      hud.toast(t('t21.dealerBonus'), 1300);
      return;
    }
    this.renderTrumps();
    const slot = (this.rowEl?.lastElementChild as HTMLElement | null) ?? null;
    if (slot) slot.style.visibility = 'hidden';
    sfx.trumpDraw(rarityOf(id), false, this.speed);
    await flyBonusTrump(this.g, { info: this.trumpInfo(id), to: centreIn(this.g, slot) ? slot : null });
    if (slot) {
      slot.style.visibility = '';
      slot.classList.add('fresh');
    }
    hud.toast(t('t21.bonusToast', { name: this.trumpName(id) }), 2200);
  }

  // ---------------------------------------------------------------- round
  private playerTurn(): Promise<TurnPick> {
    return new Promise((res) => {
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
        { id: 'hit', label: t('btn.hit'), color: 'green', icon: 'hit', enabled: this.duel.deck.length > 0 && !this.duel.frozen.player, onClick: () => done('hit') },
      ]);
    }).then((p) => {
      this.myTurn = false;
      this.g.hud.highlight(null);
      this.actions(null);
      this.renderTrumps();
      return p as TurnPick;
    });
  }

  protected async playRound() {
    const { fx, sfx, hud } = this.g;
    const d = this.duel;
    this.c3.clear();
    this.shown.clear();
    this.setTarget(21, false);
    await this.applyEvents(d.start());
    this.updateBubbles();
    let guard = 0;
    while (!d.over && guard++ < 60) {
      const pick = await this.playerTurn();
      if (typeof pick === 'object') {
        if (pick.trump === 'stakes') {
          const bet = this.spots.get('bet').amount;
          if (!this.g.wallet.canAfford(bet)) {
            hud.toast(t('t21.noFunds'));
            continue;
          }
          await this.applyEvents(d.useTrump('player', 'stakes'));
          await this.place('stakes', bet);
        } else await this.applyEvents(d.useTrump('player', pick.trump));
        continue; // trumps don't end the turn
      }
      await this.applyEvents(pick === 'hit' ? d.hit('player') : d.stand('player'));
      // a bonus trump came out instead of the card: still your turn, and your card is still to come
      if (pick === 'hit' && d.lastHitBonus) continue;
      if (d.over) break;
      await wait(0.45);
      await this.applyEvents(d.dealerTurn());
      this.updateBubbles();
    }
    // reveal and score
    if (!this.shown.has(d.dealer[0])) await this.applyEvents([{ t: 'reveal' }]);
    await wait(0.3);
    const o = d.outcome();
    const pz = this.g.stage.screenToTable(0.5, V.player).z;
    if (o > 0) {
      highlightCards(this.g, d.player.map((v) => this.c3.get(v)!).filter(Boolean));
      fx.burst(new THREE.Vector3(0, 0.3, pz), d.total('player') === d.target ? 150 : 80);
      if (d.total('player') === d.target) sfx.win(true);
    } else if (o < 0) highlightCards(this.g, d.dealer.map((v) => this.c3.get(v)!).filter(Boolean), '#ff8f8f');
    if (d.total('player') > d.target && d.total('dealer') > d.target) hud.toast(t('t21.bothBust'), 1400);
    const big = o > 0 && d.total('player') === d.target ? `${d.target}!` : undefined;
    const ret = { bet: d.payout(this.spots.get('bet').amount), stakes: d.payout(this.spots.get('stakes').amount) };
    await this.settle(ret, { big });
    // the duel deck is collected with the other cards by the table; the bubbles reset
    this.bubbles.player?.show(false);
    this.bubbles.dealer?.show(false);
    gsap.delayedCall(0.01, () => this.renderTrumps());
  }
}
