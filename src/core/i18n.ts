/** Tiny i18n: English by default, Portuguese optional. */

export type Lang = 'en' | 'pt';

const EN = {
  'load.fonts': 'LOADING FONTS',
  'load.table': 'SETTING THE TABLE',
  'load.chips': 'POLISHING THE CHIPS',
  'load.sound': 'TUNING THE SOUND',
  'load.ready': 'GOOD LUCK',
  'load.error': 'Could not open the casino. Please reload the page.',

  'splash.made': 'MADE WITH',
  'splash.notice.title': 'PLAY CHIPS ONLY',
  'splash.notice.body':
    'Villa Lago Casino is a free social game played with <b>fictional chips</b>. There is no real money, no real-money gambling and nothing to buy. Chips have no cash value.',
  'splash.notice.small': 'For entertainment only · 18+ · Play responsibly',

  'lobby.foot': 'Play chips only · no real money<br>Play responsibly',
  'lobby.soon': 'COMING SOON',
  'lobby.soonToast': '{game} arrives in the next update',

  'menu.lobby': 'LOBBY',
  'menu.rules': 'RULES',
  'menu.settings': 'SETTINGS',
  'menu.credits': 'CREDITS',
  'aria.free': 'Free chips',
  'aria.settings': 'Settings',
  'aria.fullscreen': 'Full screen',
  'aria.hint': 'Hint',
  'aria.menu': 'Menu',
  'aria.close': 'Close',
  'aria.chip': '{v} chip',

  'toast.refill': '+{n} free chips!',
  'toast.refillNo': 'Free refill when your balance is below {n}',
  'toast.finishRound': 'Finish the round before leaving',
  'toast.resetDone': 'Balance reset: 5,000 chips',
  'toast.maxBet': 'Maximum bet: {n}',
  'toast.minBet': 'Minimum bet: {n}',
  'toast.noFunds': 'Insufficient balance',
  'toast.outOfChips': 'Out of chips? Tap + for a free refill',
  'toast.shuffling': 'Shuffling…',
  'toast.skip': 'Tap to speed up',
  'toast.placeBet': 'Place your bet',

  'btn.clear': 'Clear',
  'btn.deal': 'Deal',
  'btn.double2x': '2×',
  'btn.rebet': 'Rebet',
  'btn.yes': 'Yes',
  'btn.no': 'No',
  'btn.stand': 'Stand',
  'btn.hit': 'Hit',
  'btn.double': 'Double',
  'btn.split': 'Split',
  'btn.play': 'Play',
  'btn.fold': 'Fold',
  'btn.raise': 'Raise',
  'btn.check': 'Check',
  'btn.bet4': 'Bet 4×',
  'btn.bet3': 'Bet 3×',
  'btn.bet2': 'Bet 2×',
  'btn.bet1': 'Bet 1×',
  'btn.draw': 'Draw',
  'btn.betOne': 'Bet 1',
  'btn.betMax': 'Max',
  'btn.next': 'Next',

  'win.you': 'YOU WIN',
  'win.push': 'PUSH',
  'win.pushSub': 'Bet returned',
  'win.dealer': 'DEALER WINS',
  'win.bust': 'BUST',
  'win.level': 'LEVEL {n}',
  'win.levelSub': '+{n} bonus chips',
  'win.fold': 'FOLDED',

  'settings.title': 'SETTINGS',
  'settings.volume': 'Volume',
  'settings.sound': 'Sound',
  'settings.speed': 'Animations',
  'settings.quality': 'Graphics',
  'settings.back': 'Card back',
  'settings.hints': 'Hints',
  'settings.lang': 'Language',
  'settings.reset': 'Reset balance',
  'settings.resetConfirm': 'Tap again to confirm',

  'rules.title': 'RULES · {game}',
  'rules.general':
    '<p>Pick a table in the lobby. Tap the chips to bet and use the big buttons to play. The gear opens the settings and <b>+</b> gives free chips when your balance runs low.</p><p>All chips are fictional.</p>',
  'credits.title': 'CREDITS',

  // blackjack
  'bj.print1': 'BLACKJACK PAYS 3 TO 2',
  'bj.print2': 'Dealer must stand on all 17s',
  'bj.print3': 'INSURANCE PAYS 2 TO 1',
  'bj.tagline': 'Pays 3 to 2',
  'bj.insurance': 'INSURANCE?',
  'bj.insuranceText': 'The dealer shows an Ace. Take insurance for {n}? It pays 2 to 1 if the dealer has blackjack.',
  'bj.evenMoney': 'EVEN MONEY?',
  'bj.evenMoneyText': 'The dealer shows an Ace. Take a guaranteed 1 to 1 payout for your blackjack?',
  'bj.noBJ': 'Dealer does not have blackjack',
  'bj.strategy': 'Basic strategy: {move}',
  'bj.insPaid': 'INSURANCE PAID',
  'bj.insPaidSub': 'Bet protected',
  'bj.rules': `
    <p>Get closer to 21 than the dealer without going over. Face cards count 10 and Aces count 1 or 11.</p>
    <h4>Table</h4>
    <p>6 decks · Blackjack pays <b>3 to 2</b> · Dealer stands on all 17s (including soft 17) · Dealer peeks for blackjack with an Ace or ten up.</p>
    <h4>Moves</h4>
    <p><b>Hit</b>: take a card. <b>Stand</b>: keep your hand. <b>Double</b>: double the bet and take exactly one more card (any first two cards, also after splitting). <b>Split</b>: split a pair into two hands (up to 4 hands; split Aces get one card each).</p>
    <h4>Insurance</h4>
    <p>When the dealer shows an Ace you may insure for half your bet; it pays 2 to 1 if the dealer has blackjack. With a blackjack it becomes <b>even money</b> (a guaranteed 1 to 1).</p>
    <h4>Hint</h4>
    <p>The light bulb shows the basic-strategy play for these rules.</p>`,

  'game.threecard.tag': '6 modes · Pair Plus · Lucky 6',
  'game.videopoker.tag': 'Jacks or Better 9/6',
  'game.baccarat.tag': 'Punto Banco',
  'game.caribbean.tag': 'Stud · Jackpot',
  'game.uth.tag': "Hold'em · up to 4×",
  'game.letitride.tag': 'Pull back · 1000:1',
  'game.war.tag': 'High card wins',
  'game.reddog.tag': 'In between · 11:1',
  'game.paigow.tag': 'Split 7 cards · 5 + 2',
  'game.trump21.tag': 'Duel to 21 with trump cards',
  'game.fourcard.tag': 'Best 4 cards · Aces Up',
  'game.holdem3.tag': "Hold'em with 3-card hands",
  'game.doubledraw.tag': 'Two draws · Jokers wild',
  'game.showdown.tag': 'Build five cards, one turn at a time',
  'game.abyss.tag': "Heads-up Hold'em · bluffs and skills",
  'game.dragontiger.tag': 'One card each · higher card wins',
  'game.manilhadraw.tag': 'Truco duels · Vira and manilhas',
  'game.manilhaholdem.tag': 'Best three with the manilhas',
  'game.pifeexpress.tag': 'Two groups of three beat the dealer',
  'game.videopife.tag': 'Nine cards · up to three groups',
  'game.canastradraw.tag': 'Longest run wins · 2s are wild',
  'game.russian.tag': 'Buy a 6th card · Exchange',
  'game.videobj.tag': 'Up to 5 hands around the dealer',
  'game.tcpfaceup.tag': 'One dealer card face up',
  'game.slot3.tag': 'Poker reels · Mini Royal',
  'game.crazy4.tag': 'Best 4 of 5 · Four Aces 200:1',
  'game.thb.tag': 'Bet flop, turn and river',
  'game.hcf.tag': 'Longest flush wins',

  'hand.high': 'High card',
  'hand.pair': 'Pair',
  'hand.twoPair': 'Two pair',
  'hand.trips': 'Three of a kind',
  'hand.straight': 'Straight',
  'hand.flush': 'Flush',
  'hand.fullHouse': 'Full house',
  'hand.quads': 'Four of a kind',
  'hand.straightFlush': 'Straight flush',
  'hand.royal': 'Royal flush',
  'hand.jacks': 'Jacks or better',
};

type Key = keyof typeof EN;

const PT: Partial<Record<Key, string>> = {
  'load.fonts': 'CARREGANDO FONTES',
  'load.table': 'PREPARANDO A MESA',
  'load.chips': 'POLINDO AS FICHAS',
  'load.sound': 'AFINANDO O SOM',
  'load.ready': 'BOA SORTE',
  'load.error': 'Não foi possível abrir o cassino. Recarregue a página.',
  'splash.made': 'FEITO COM',
  'splash.notice.title': 'SÓ FICHAS FICTÍCIAS',
  'splash.notice.body':
    'Villa Lago Casino é um jogo social gratuito jogado com <b>fichas fictícias</b>. Não há dinheiro real, apostas reais nem nada para comprar. As fichas não têm valor em dinheiro.',
  'splash.notice.small': 'Apenas entretenimento · 18+ · Jogue com moderação',
  'lobby.foot': 'Somente fichas fictícias · sem dinheiro real<br>Jogue com moderação',
  'lobby.soon': 'EM BREVE',
  'lobby.soonToast': '{game} chega na próxima atualização',
  'menu.lobby': 'LOBBY',
  'menu.rules': 'REGRAS',
  'menu.settings': 'AJUSTES',
  'menu.credits': 'CRÉDITOS',
  'aria.free': 'Fichas grátis',
  'aria.settings': 'Ajustes',
  'aria.fullscreen': 'Tela cheia',
  'aria.hint': 'Dica',
  'aria.menu': 'Menu',
  'aria.close': 'Fechar',
  'aria.chip': 'Ficha {v}',
  'toast.refill': '+{n} fichas grátis!',
  'toast.refillNo': 'Recarga grátis com saldo abaixo de {n}',
  'toast.finishRound': 'Termine a rodada antes de sair',
  'toast.resetDone': 'Saldo reiniciado: 5.000 fichas',
  'toast.maxBet': 'Aposta máxima: {n}',
  'toast.minBet': 'Aposta mínima: {n}',
  'toast.noFunds': 'Saldo insuficiente',
  'toast.outOfChips': 'Sem fichas? Toque no + para recarregar',
  'toast.shuffling': 'Embaralhando…',
  'toast.skip': 'Toque para acelerar',
  'toast.placeBet': 'Faça sua aposta',
  'btn.clear': 'Limpar',
  'btn.deal': 'Dar cartas',
  'btn.rebet': 'Repetir',
  'btn.yes': 'Sim',
  'btn.no': 'Não',
  'btn.stand': 'Parar',
  'btn.hit': 'Pedir',
  'btn.double': 'Dobrar',
  'btn.split': 'Dividir',
  'btn.play': 'Jogar',
  'btn.fold': 'Desistir',
  'btn.raise': 'Aumentar',
  'btn.check': 'Passar',
  'btn.bet4': 'Apostar 4×',
  'btn.bet3': 'Apostar 3×',
  'btn.bet2': 'Apostar 2×',
  'btn.bet1': 'Apostar 1×',
  'btn.draw': 'Trocar',
  'btn.betOne': 'Aposta 1',
  'btn.betMax': 'Máx',
  'btn.next': 'Próxima',
  'win.you': 'VOCÊ GANHOU',
  'win.push': 'EMPATE',
  'win.pushSub': 'Aposta devolvida',
  'win.dealer': 'DEALER VENCE',
  'win.bust': 'ESTOUROU',
  'win.level': 'NÍVEL {n}',
  'win.levelSub': '+{n} fichas de bônus',
  'win.fold': 'DESISTIU',
  'settings.title': 'AJUSTES',
  'settings.volume': 'Volume',
  'settings.sound': 'Som',
  'settings.speed': 'Animações',
  'settings.quality': 'Gráficos',
  'settings.back': 'Verso',
  'settings.hints': 'Dicas',
  'settings.lang': 'Idioma',
  'settings.reset': 'Zerar saldo',
  'settings.resetConfirm': 'Toque de novo para confirmar',
  'rules.title': 'REGRAS · {game}',
  'rules.general':
    '<p>Escolha uma mesa no lobby. Toque nas fichas para apostar e use os botões grandes para jogar. A engrenagem abre os ajustes e o <b>+</b> recarrega fichas grátis quando o saldo fica baixo.</p><p>Todas as fichas são fictícias.</p>',
  'credits.title': 'CRÉDITOS',
  'bj.print1': 'BLACKJACK PAGA 3 PARA 2',
  'bj.print2': 'Dealer para em todos os 17',
  'bj.print3': 'SEGURO PAGA 2 PARA 1',
  'bj.tagline': 'Paga 3 para 2',
  'bj.insurance': 'SEGURO?',
  'bj.insuranceText': 'O dealer mostra um Ás. Fazer seguro por {n}? Paga 2 para 1 se ele tiver blackjack.',
  'bj.evenMoney': 'EVEN MONEY?',
  'bj.evenMoneyText': 'O dealer mostra um Ás. Quer receber 1 para 1 garantido pelo seu blackjack?',
  'bj.noBJ': 'O dealer não tem blackjack',
  'bj.strategy': 'Estratégia básica: {move}',
  'bj.insPaid': 'SEGURO PAGO',
  'bj.insPaidSub': 'Aposta protegida',
  'bj.rules': `
    <p>Chegue mais perto de 21 que o dealer sem passar. Figuras valem 10 e o Ás vale 1 ou 11.</p>
    <h4>Mesa</h4>
    <p>6 baralhos · Blackjack paga <b>3 para 2</b> · Dealer para em todos os 17 (inclusive soft 17) · Dealer espia o blackjack com Ás ou 10 aberto.</p>
    <h4>Jogadas</h4>
    <p><b>Pedir</b>: mais uma carta. <b>Parar</b>: fica com a mão. <b>Dobrar</b>: dobra a aposta e recebe só mais uma carta (em quaisquer 2 cartas, inclusive depois de dividir). <b>Dividir</b>: separa um par em duas mãos (até 4 mãos; Ases divididos recebem uma carta cada).</p>
    <h4>Seguro</h4>
    <p>Quando o dealer mostra um Ás você pode fazer seguro por metade da aposta. Paga 2 para 1 se o dealer tiver blackjack. Com blackjack na mão, vira <b>even money</b> (1 para 1 garantido).</p>
    <h4>Dica</h4>
    <p>A lâmpada mostra a jogada da estratégia básica para estas regras.</p>`,
  'game.uth.tag': "Hold'em · até 4×",
  'game.letitride.tag': 'Recolha · 1000:1',
  'game.war.tag': 'A maior carta vence',
  'game.reddog.tag': 'No meio · 11:1',
  'game.paigow.tag': 'Divida 7 cartas · 5 + 2',
  'game.trump21.tag': 'Duelo até 21 com trunfos',
  'game.fourcard.tag': 'Melhores 4 cartas · Aces Up',
  'game.holdem3.tag': "Hold'em com mãos de 3 cartas",
  'game.doubledraw.tag': 'Duas trocas · Coringas',
  'game.showdown.tag': 'Monte cinco cartas, uma por turno',
  'game.abyss.tag': "Hold'em mano a mano · blefes e habilidades",
  'game.dragontiger.tag': 'Uma carta cada · a mais alta vence',
  'game.manilhadraw.tag': 'Duelos de Truco · Vira e manilhas',
  'game.manilhaholdem.tag': 'Melhor trio com as manilhas',
  'game.pifeexpress.tag': 'Dois jogos de três contra o dealer',
  'game.videopife.tag': 'Nove cartas · até três jogos',
  'game.canastradraw.tag': 'Maior sequência vence · 2 é curinga',
  'game.russian.tag': 'Compre a 6ª carta · Troque',
  'game.videobj.tag': 'Até 5 mãos em volta do dealer',
  'game.tcpfaceup.tag': 'Uma carta do dealer aberta',
  'game.slot3.tag': 'Rolos de pôquer · Mini Royal',
  'game.crazy4.tag': 'Melhores 4 de 5 · Quatro Ases 200:1',
  'game.thb.tag': 'Aposte no flop, turn e river',
  'game.hcf.tag': 'Vence o maior flush',
  'game.threecard.tag': '6 modos · Pair Plus · Lucky 6',
  'hand.high': 'Carta alta',
  'hand.pair': 'Par',
  'hand.twoPair': 'Dois pares',
  'hand.trips': 'Trinca',
  'hand.straight': 'Sequência',
  'hand.flush': 'Flush',
  'hand.fullHouse': 'Full house',
  'hand.quads': 'Quadra',
  'hand.straightFlush': 'Straight flush',
  'hand.royal': 'Royal flush',
  'hand.jacks': 'Valete ou maior',
};

let lang: Lang = 'en';
const extra: Record<Lang, Record<string, string>> = { en: {}, pt: {} };

export function setLang(l: Lang) {
  lang = l;
  document.documentElement.lang = l === 'pt' ? 'pt-BR' : 'en';
}

export const getLang = () => lang;

/** Registers strings owned by a game module (keeps this file from growing forever). */
export function addStrings(en: Record<string, string>, pt: Record<string, string>) {
  Object.assign(extra.en, en);
  Object.assign(extra.pt, pt);
}

export function t(key: string, vars?: Record<string, string | number>): string {
  let s: string =
    (lang === 'pt' ? (extra.pt[key] ?? (PT as Record<string, string>)[key]) : undefined) ??
    extra.en[key] ??
    (EN as Record<string, string>)[key] ??
    key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export const locale = () => (lang === 'pt' ? 'pt-BR' : 'en-US');
