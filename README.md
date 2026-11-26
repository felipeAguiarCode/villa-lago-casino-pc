# ♠ Poker: Against the House — PC Edition

**Gênero:** Poker RPG / Casino Career Simulator

**Formato:** Single-player — Player vs. Dealer

**Proposta:** Construir uma carreira no mundo do poker, dominar diferentes modalidades e conquistar seu lugar entre os jogadores de elite.

---

> **PC edition.** This is the widescreen, full-screen version for computers. The phone version (portrait) lives in [villa-lago-casino](https://github.com/felipeAguiarCode/villa-lago-casino) and plays at https://felipeaguiarcode.github.io/villa-lago-casino/.

**▶ Play it in the browser: https://felipeaguiarcode.github.io/villa-lago-casino-pc/** (GitHub Pages, published by `.github/workflows/pages.yml` on every push to `main`; play chips only, no real money).

## Villa Lago Casino

The game is set at the Villa Lago casino, whose symbol is **VL on a golden chip**. A widescreen 3D card casino for the computer, made with **three.js**: forty-eight games against the dealer or the house, rich card animations, chips that fly and stack, and a big video-poker style HUD.

> **Play chips only.** There is no real money, no real-money gambling and nothing to buy. Chips have no cash value. "Villa Lago" is an original name, not affiliated with any real casino.

## Games

| Table | Highlights |
|---|---|
| Blackjack | 6 decks, 3:2, split up to 4 hands, double after split, insurance / even money, basic-strategy hint |
| Party Blackjack | The same blackjack at a full table: you and four AI regulars each play their own hands, in seat order, against one dealer; RTP 99.65% with basic strategy (2,000,000-round simulation). The regulars' calculated mindset counts cards (Hi-Lo, index plays, bet spread) |
| Party Trump 21 | Trump 21 at a full table: one shoe of five 1–11 decks, every seat with its own target and trump hand; attacks on the dealer's hand (Heist, Gift and Rewind among them) change the round for the whole table; bonus trumps on a hit as at Trump 21 (Overload stays a single-table card); ties go to the dealer, who gets two trumps a round; best strategy 97.8% |
| Party Lucky Horses | Lucky Horses with four regulars at the rail: everybody's chips on every horse in their seat colours, cheering for the leader; same odds and RTP as Lucky Horses (94.9%) |
| Craps | Casino craps on a 3D table with diamond-pyramid walls and physical translucent dice: Pass / Don't Pass, Come / Don't Come, free 3-4-5× odds, Place, Field, Big 6/8, hardways and the centre props, ON/OFF puck, stickman calls; every house edge as in the textbooks (Pass 1.41%, odds 0%) |
| Poker Dice | Five card-faced dice (9 to A) rolled from a leather cup into a tray, three rolls with holds, then the dealer rolls to beat you; five of a kind pays 2:1, Bonus side bet; ANTE 96.6% with the exact optimal holds |
| Roulette | European single zero on a 3D wheel: straight, split, street, corner, six line, columns, dozens and the even-money bets; every bet returns 97.30%, zero loses the even-money bets; dolly on the winning number and history of the last spins. The ball is heard as it moves (`src/audio/rouletteSound.ts`, driven frame by frame by the spin): its roll round the wooden track, darker and rougher as it slows until it chatters against the wall, the smoother roll down the stator, the clack on a brass deflector, the drop onto the rotor, the hops over frets and pockets and the rattle as it settles, over the hum of the rotor |
| Coin Flip | The dealer tosses a gold coin that spins, wobbles and settles: heads or tails 1:1 (97.5%), or on its edge 35:1 (1 in 40, 90%); the dealer covers every bet with chips of its own |
| Lucky Horses | Five toy jockeys race one lap of a board track with random bursts and changes of pace; each race re-rolls the form and the house's odds (x1.5 minimum, a 5% book margin, every horse about 93-95%); bet on one or several horses and the dealer covers each bet |
| High & Low | Higher, lower or the same rank as the card showing; Higher / Lower pay by the cards still in the deck (never above 95%), Same pays 11:1 while its return stays under 95% |
| Red or Black | One card from a 54-card deck: colour 1:1, suit 3:1; the two Jokers beat every bet (96.30%) |
| Pick a Number | The dealer shows a target number and lays five cards face down, one of them matching (unless the house Joker slipped in, 1 in 20): chips under the right card pay 4:1 (95%) |
| Trump 21 | Original duel blackjack with an 11-card deck (1–11) and **52 trump cards** in three rarities that change the target, draws and stakes, among them 16 target cards (lines 15 to 30, Line ±2 and the random **Wild Line**) and Lighten, Heist, Gift, Overload, Rewind, Barrier (blocks an attack), Tiebreaker, Bullseye (3:1 right on the target) and Reinforce. About one hit in five turns up a **bonus trump** instead of the card: it flies out of the deck with its own sound, the turn stays yours and the next hit is a sure card. **Point at a trump** with the mouse and it shows what it does (an enlarged card with its effect and whether it can be played now); a click plays it. On a touch screen, hold it to read it. Ties go to the dealer; best strategy (the hint) 98.4% |
| Three Card Poker | Ante / Play, Pair Plus, **Lucky 6**, ante bonus, and six table modes: Classic, **Ultimate** (raise up to 3×), **Face Up** (one dealer card shown), **Prime** (colour bet), **Draw** (replace a card), **Hold'em** (shared cards) |
| Party Three Card Poker | Three Card Poker with four regulars: Ante / Play, Pair Plus and the ante bonus, decisions in seat order, regulars who read the cards you turn face up |
| Three Card Slots | Slot machine with three card reels, Mini Royal |
| Poker Slots | A four-reel poker slot machine: each reel is a strip of the 52 cards and the four on the payline are paid as a four-card poker hand (Royal flush 1000 per coin). One losing spin in four lights the HOLD keys for the next spin at the same bet; 97.4% holding as the hint does, 79.5% never holding (exact, `src/games/pokerslots/sim.ts`) |
| Hold'em Slots | A seven-reel Texas Hold'em machine dealt from one deck: spin your two hole cards, then Play 4× the ante to run the flop, turn and river reels, or fold. The best five of the seven pay the whole bet (Royal flush 500×, two pair gives the bet back); 97.7% folding as the hint does (about 3 hands in 10), exact from a table of the 169 starting hands over all 2,118,760 boards |
| Video Blackjack | Machine blackjack with up to 5 hands played one by one in a circle around the dealer, coin meters, one split per hand |
| Texas Hold'em Bonus | Flop 2×, turn and river bets, AA bonus up to 1000:1 |
| Crazy 4 Poker | Super Bonus (four Aces 200:1), Queens Up, play 3× with Aces |
| High Card Flush | Seven cards, longest flush wins, raise up to 3×, flush side bets |
| Manilha Draw | 40-card Truco deck with a Vira and suit-ranked manilhas (Zap ♣ highest); Play or Fold, one free draw, then three duels against the dealer's fixed order |
| Manilha Hold'em | Two hole cards, three board cards, best three with at least one hole card, compared card by card |
| Pife Express | Six cards, up to two draws, sets and runs of three; most groups then least deadwood beats the dealer |
| Video Pife | Nine cards, up to three draws, paid by groups: Perfect Pife (3) 7×, Double Set (2) 2× |
| Canastra Draw | Two decks, nine cards, best single run with 2s as wild (one substitute per run); Clean Canastra 3:1, Dirty 2:1, runs 1:1 |
| Dragon Tiger | Eight-deck shoe with a burn card, one card to Dragon and one to Tiger (Ace low, King high): Dragon / Tiger 1:1 with half back on ties, Tie 11:1, Suited Tie 50:1 and twelve side bets (Big, Small, Odd, Even, Red, Black on either card); exact payouts in cents, round history, statistics and recovery of interrupted rounds |
| Abyss Poker | Heads-up Texas Hold'em against a dealer with five behaviour profiles (conservative, balanced, aggressive, calling station, unpredictable) that bets, raises, calls, folds and bluffs; 11 skills in four tiers bought with chips (reads on the dealer's cards, Pressure, Lock Raise, Block Bet, Reveal Card, Peek, Make 'Em Chase), priced from the matched pot |
| Showdown Poker | Build a five-card hand one confirmed card at a time against a Monte Carlo dealer; Check / Double / Fold after cards 2 and 4, 1:1 on the total bet |
| Four Card Poker | Play 1×–3×, player wins ties, Aces Up |
| 3 Card Hold'em | Two raises, best three cards of five, Pair or Suited and Straight or Up side bets |
| Video Poker | Jacks or Better 9/6, hold & draw, LED meters, simple-strategy hint |
| Double Draw Poker | Two jokers, two draws, bonus table up to 500:1 |
| Baccarat | Punto Banco with card squeeze and bead road |
| Caribbean Stud | Call 2×, fictional progressive jackpot |
| Russian Poker | Buy a sixth card, exchange cards, buy a game |
| Ultimate Texas Hold'em | Bet 4×/3× pre-flop, 2× flop, 1× river, Trips |
| Party Ultimate Hold'em | Ultimate Texas Hold'em at a full table: same board and dealer for five seats, Trips, raises 4×/3×, 2× and 1× in seat order; 99.4% per chip with the hint |
| Seven-Card Stud | Stud against the dealer: raise 4× on 3rd street, 2× on 4th or 5th, or bet at the end; Blind and Stud Bonus; the dealer needs a pair; 97.5% |
| Party Seven-Card Stud | The same stud with four regulars: every up card is in view and the cards showing elsewhere are dead (99.0% for a player who reads them) |
| Vanunu | A home-game hi-lo variant against the dealer: seven cards face down, five revealed one by one, one paid swap, then declare HIGH, LOW or BOTH; a single side splits the pot, a scoop pays 1:1 and BOTH 2:1; 97.4% |
| Suit Poker | Draw poker with picture cards (two Jokers and the four suits, no ranks): raise up to 5× after seeing your hand, hold and draw, the dealer must make three of a kind to call raises; 96.8% |
| Let It Ride | Pull back two of three bets |
| Pai Gow Poker | Split seven cards into 5 + 2, house way |
| Casino War | War or surrender on ties, tie bet 10:1 |
| Red Dog | Spread payouts, raise, three of a kind 11:1 |

Every table opens with a cardistry show picked at random, never the same one twice in a row. The flourishes are ribbon spread with a wave turnover, pressure fan, triple cut with a twirl, card spring, waterfall, faro weave, overhand, circle spread, chemmy wash, riffle and an arched bridge, plus bold aerial moves (`src/table/flourish.ts`): a card fountain, boomerang throws, a Sybil cut with orbiting packets, Charlier cuts, an arm spread with a turnover wave, long springs, a tornado, a dribble from height, a pirouette and fan-to-wheel-to-fan. There are 13 opening routines, 5 shorter reshuffles and 32 on the title screen. Cards fly real parabolas, bend in the air and snap flat on landing, piles land a little messy and are squared up with two soft taps, and the sounds land on the impacts. Cards are dealt from deck boxes in six original brands, and the tables use icon buttons. Motion is physically modelled: cards fly low, land and slide on the felt with friction, and turn over by rolling on one edge; chips fly on ballistic arcs, bounce and wobble flat like coins; stacks lean with inertia when pushed. Levels follow an RPG curve (`src/core/progression.ts`): the first levels come in a few hands and every level asks for more XP than the last, while bigger bets add XP with diminishing returns; each level-up pays a chip bonus. Text is in English by default with Portuguese available in the settings.

## PC edition

### Screens
- **Splash, title, Game Select.** The *Made with CARD ENGINE* splash rings a 16-bit console style boot chime, synthesized with an original melody (`src/audio/bootChime.ts`): pulse-wave blips as the emblem's cards land, a bell run with the shine, and an "item got" chord through a console-style echo. A browser only starts sound after a key or a click, so when the sound is still locked the game opens like a console being switched on, with a power light and PRESS ANY KEY. After the engine splash and the play-chips notice comes a *Press Start* title: the game's name over the lobby table, a deck that keeps shuffling, a lit cigar resting on an ashtray beside a brass lighter, and a breeze that now and then lifts a few cards and blows them across the felt (`src/table/wind.ts`: drag, lift and tumbling, cards landing face up or down), cards scattered around it that flip to random faces, and a blinking **PRESS ENTER** (or click). Then comes **Game Select** (`src/ui/gameSelect.ts`):
  - On the left, a preview of the highlighted table: a picture captured from the game itself, its name, a description, the hands played and its three achievements.
  - On the right, a grid of table tiles, each with its own pictogram (`src/ui/gameIcons.ts`), and a *Surprise me* tile.
  - The **bankroll**, shared by every table, is shown large with the level, next to the Achievements, full-screen and settings buttons.
  - Mouse or keyboard: arrows choose a table and Enter plays it.
- **Deck, Reset and Game Over.** The **Deck** screen picks the card backs: 25 classic patterns (diamond lattice, houndstooth, guilloché, arabesque…) in 20 colours, or each table's own colour. The backs are pattern only, with no emblem or picture (`src/table/backPatterns.ts`, `src/ui/deckMenu.ts`). **Reset** starts over with the starting bankroll after a confirmation. When the bankroll runs out between hands, the game returns to Game Select with **GAME OVER** and a new game starts with 5,000 chips (achievements are kept).
- **Achievements** (`src/core/trophies.ts`, `src/ui/trophies.ts`). A list of 165 achievements in bronze, silver, gold and one platinum, in the style of console achievements.
  - Career: hands played and levels.
  - Bankroll: balance milestones, big bets, a comeback won at the tables, the free refill.
  - Explorer: playing different tables.
  - Three per table: a first hand, a three-win streak, and a signature result such as a natural blackjack, a Clean Sweep in Manilha Draw or a Canastra.
  - Each achievement has its badge, a progress bar or its date. The list filters by category and by table.
  - An **Achievement unlocked** notice slides in with its own sound (`sfx.achievement`): an airy swell, a round "bloop" gliding up and two bells a fifth apart, in the spirit of a console achievement pop; gold and platinum add a third bell and a sparkle. Original, synthesized.

### Tables
- **Full window, any widescreen.** The HUD scales with the screen height, from a 1366×768 laptop to a 1440p monitor or an ultrawide. A button switches to full screen.
- **A big table.** The tables keep the phone version's layouts. A virtual portrait camera places every card, chip and print as before. A seated widescreen camera, tilted 34°, frames the play area (`src/table/stage.ts`).
  - Each table is framed at its own size (`src/games/pcFraming.ts`, measured with the cards dealt), so tables with room to spare, such as Video Poker, Video Pife, War or Red Dog, get larger cards and betting circles.
  - The layout is stretched sideways to use the width.
  - Table texts are printed 30% larger, and betting circles 15% larger.
- **Slot-machine control strip.** A steel deck with a gold top edge runs along the bottom of every table.
  - Lobby and Rules keys sit on the left, then LCD readouts of the balance and of the chips on the table; the Hint key sits on the right.
  - Each table's chips and buttons sit in the middle as square keycaps in gold bezels: the cap sinks onto its coloured skirt and clunks when pressed.
  - At the tables with many places (Roulette, Lucky Horses, Pick a Number...) you choose a chip and click a place; a right click takes one back.
- **Top bar in the corners.** The menu button, balance and level sit on the left; full screen and settings on the right. The menu opens from the top-left button.
- **Side zones.** Paytables, the Three Card mode selector and the baccarat bead road sit on the left. Trump 21's trump cards sit on the right.
- **Slot cabinets** (`src/games/pokerslots/cabinet.ts`, shared by Poker Slots and Hold'em Slots). The machine stands in the middle with chasing bulbs, three dot-matrix displays (messages, won, credits) in a 5×7 LED font with the four suits, and a lever on its side that can be pulled or clicked. The reels are drawn on a canvas as drums: each card bends round the cylinder, the drum darkens toward its edges, the cards smear with motion blur at speed, and every reel kicks back, spins up, brakes onto its stop and settles with a damped bounce. The last reel keeps spinning and glows when a straight flush, a royal or four of a kind is one card away. The pictorial paytable sits on the left, and the round **?** key on the machine opens every hand with an example, what it takes, its pay and its chance. Hold'em Slots stretches the cabinet for seven reels in four groups (hand, flop, turn, river) with captions, dims the board until you play, and shows the made hand under the reels as the streets come. Keys 1–4 hold, Space spins, and the reel motor, stops, lever and HOLD keys have their own synthesized sounds.
- **Party tables.** Party Blackjack, Party Three Card, Party Ultimate Hold'em, Party Seven-Card Stud, Party Trump 21 and Party Lucky Horses seat four regulars drawn from a pool of 40 single-name characters, pun nicknames in the spirit of poker legends (`src/games/partybj/roster.ts`). A broke regular leaves and a new one sits in. Each hand, every regular draws a hidden mindset (calculated, aggressive, conservative, hybrid or hunch) weighted by temperament, streak and stack (`mindset.ts`); the player never sees it, only the play it produces.
- **Deck brands per table** (`src/table/deckBrands.ts`). Each table deals from its own brand of deck, with a matching box: *Veloce* (red), *VL Poker Series* (black and gold), *Stallion* (western blue), *Royal Salon* (green), *Canarinho* (Brazilian yellow and green) and the house deck. Where there is room the box stands open with cards poking out and a ribbon of cards spread beside it. The card backs follow the Deck screen. The brands are original designs in the spirit of classic decks; no real trademark is used.
- **Casino decor per table** (`src/table/decor.ts`, `decorKit.ts`). Each table has its own set of elegant pieces beside the play area, plus a placard with the table's name:
  - Poker tables: whisky, an Old Fashioned, a Negroni or cognac in a snifter, with a crystal decanter, a card guard, the dealer button, a dealer's chip rack or a banker's lamp with its green shade lit.
  - Baccarat and Coin Flip: champagne with the bottle in a silver ice bucket, high-value plaques, a pocket watch.
  - Dragon Tiger and Pai Gow: blue-and-white porcelain tea.
  - Blackjack and the machines: gin and tonic, Margarita, Cosmopolitan, martini, a brass service bell.
  - Brazilian tables: caipirinha and cafezinho.
  - The gothic Trump 21: brass goblets, a lit candle, a claret decanter and the pocket watch.
  - War and Caribbean Stud: an open humidor of cigars.
  - The busy tables (the Party tables, Roulette, Lucky Horses, Craps) keep their felt clear.
  - Everything is modelled in code except the goblets, the watch and the lighter, which are CC0 models from Poly Haven.
- **Sound.** Besides the Kenney casino sounds, synthesized effects: falling coins and a bell on wins, a jackpot run on big wins, a wah-wah on losses, slot reel ticks, the roulette ball, the spinning coin, the starting fanfare and the gallop, a clunk on every key, and at the Trump 21 tables a shimmer and a run of glassy bells when a bonus trump comes out of the deck (brighter for the rarer cards) and a clang when a Barrier blocks an attack.
- **Mouse and keyboard.** Buttons, chips and tiles light up on hover. **Esc** closes the open panel or the menu.

### Dev tools
`npm run dev` loads `src/dev/previews.ts`, which adds two calls on `__vlc`:
- `__vlc.runQueue('measure', ids)` measures each table's layout.
- `__vlc.runQueue('capture', ids)` saves each table's Game Select picture to `public/assets/previews/` through a dev-only endpoint (`vite.config.ts`).

## Run

```bash
npm install
npm run dev          # http://127.0.0.1:5174
npm run test         # 586 rule / payout / RTP / achievement tests
npm run sim:showdown # Showdown Poker balance report → docs/showdown-balance.md
npm run sim:abyss    # Abyss Poker balance report → docs/abyss-balance.md
npm run sim:brazil   # Brazilian games balance report → docs/brazil-balance.md
npm run build        # static site in dist/
```

## Tech

Vite · TypeScript · three.js · GSAP · Vitest. Game rules are pure TypeScript modules (`src/games/*/rules.ts`) with tests; the views animate their events.

## Credits

All third-party assets are CC0 or open licensed — see [CREDITS.md](CREDITS.md):
Kenney *Casino Audio* (CC0, including the dice sounds), *Felt Backgrounds* by jbp4444 (CC0), English pattern court cards by Dmitry Fomin (CC0), Poly Haven models *Brass Goblets* (Tina), *Vintage Pocket Watch* (Tal Swicegood) and *Vintage Lighter* (Slinc), and textures *Brown Leather* and *Dark Wood* (CC0), Cinzel and Barlow Condensed (SIL OFL), three.js (MIT), GSAP.

---

### Português

Versão para PC (tela cheia, widescreen) do cassino de cartas 3D feito com three.js: 48 jogos contra o dealer ou a banca (incluindo Roleta, Craps com dados de física real, Coin Flip, Lucky Horses, Poker Dice, Poker Slots com rolos de cartas e travas, Hold'em Slots com sete rolos, Seven-Card Stud, Vanunu, Suit Poker e seis mesas Party com rivais de IA que mudam de mentalidade a cada mão), tela Press Start com baralho embaralhando e cartas piscando, menu de Baralho (25 padronagens × 20 cores), Zerar banca e Game Over, Game Select com preview de cada mesa e bankroll compartilhado em destaque, conquistas (achievements) com som de desbloqueio no estilo de console (165, com filtros por categoria e por mesa), mesa grande enquadrada por jogo, faixa de teclas de máquina de cassino embaixo, baralhos de marcas originais diferentes por mesa, efeitos sonoros de cassino e decoração diferente em cada mesa. A versão para celular está em [villa-lago-casino](https://github.com/felipeAguiarCode/villa-lago-casino). Somente fichas fictícias — sem dinheiro real. Jogue no navegador em https://felipeaguiarcode.github.io/villa-lago-casino-pc/ ou rode com `npm install` e `npm run dev`.
