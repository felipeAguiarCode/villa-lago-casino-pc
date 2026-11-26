# Villa Lago Casino — créditos

Jogo com **fichas fictícias**: sem dinheiro real, apostas reais ou compras (aviso exibido na abertura).
"Villa Lago" é um nome original, sem relação com cassinos reais.

| Asset | Autor / fonte | Licença | Onde fica |
|---|---|---|---|
| Casino Audio (cartas, fichas, embaralhar) | Kenney — https://kenney.nl/assets/casino-audio | CC0 | `public/assets/sfx/` (convertidos de OGG para WAV mono 22 kHz) |
| Felt Backgrounds (feltro cinza) | jbp4444 — https://opengameart.org/content/felt-backgrounds | CC0 | `public/assets/felt/felt_grey_1k.jpg` (reduzido para 1024 px) |
| English pattern playing cards (J, Q, K) | Dmitry Fomin — Wikimedia Commons | CC0 | `public/assets/cards/court/` (miniaturas 500 px, convertidas para JPEG) |
| Brass Goblets (decoração da mesa, PC) | Tina — Poly Haven, https://polyhaven.com/a/brass_goblets | CC0 | `public/assets/models/brass_goblets/` (glTF, texturas 1k) |
| Vintage Pocket Watch (decoração da mesa, PC) | Tal Swicegood — Poly Haven, https://polyhaven.com/a/vintage_pocket_watch | CC0 | `public/assets/models/vintage_pocket_watch/` (glTF, texturas 1k) |
| Cinzel | Natanael Gama (via @fontsource) | SIL OFL 1.1 | títulos, mesa |
| Barlow Condensed | Jeremy Tribby (via @fontsource) | SIL OFL 1.1 | HUD, índices das cartas |
| three.js | three.js authors | MIT | renderização 3D |
| GSAP | GreenSock / Webflow | Standard "No Charge" License | animações |

Splash "Made with CARD ENGINE": logo e animação originais, feitos para o jogo (não usa marca de nenhuma engine real).

Trump 21: modo de blackjack original (baralho de 1 a 11 e cartas trunfo com nomes, efeitos e arte próprios),
inspirado na mecânica de "blackjack com trunfos" — não usa personagens, nomes, arte ou marca de nenhum jogo existente.

Decoração de mesa do PC modelada no código (sem assets externos): copos de cristal com bebidas, torres de fichas, placas de alto valor, botão de dealer, dados e plaquetas de mesa (`src/table/decorKit.ts`).

Marcas de baralho do PC (Veloce, VL Poker Series, Stallion, Royal Salon, Canarinho): desenhos originais feitos no código (`src/table/deckBrands.ts`), inspirados no estilo de baralhos clássicos de cassino; não usam nome, logo ou arte de nenhuma marca real.

Mesas novas do PC modeladas no código (sem assets externos): roda e pano da roleta europeia, moeda de ouro do Coin Flip, pista de tabuleiro e cavalinhos de brinquedo do Lucky Horses (`src/games/roulette`, `coinflip`, `horses`). High & Low, Red or Black e Pick a Number são jogos de cartas simples e genéricos; as regras e os pagamentos desta versão (contra a banca) são nossos.

Teclas da faixa estilo máquina de cassino: feitas em CSS, sem imagens externas. Efeitos sonoros extras (moedas, sino, jackpot, roleta, moeda girando, fanfarra, galope, clique das teclas) sintetizados com WebAudio (`src/audio/sfx.ts`).

Criados para o jogo (sem assets externos): coringas e cartas numeradas do Trump 21, índices, naipes, ases e layout das cartas numeradas,
verso das cartas (padrão "lago" + medalhão VL), fichas, impressões da mesa, ícones da HUD e
os jingles sintetizados (vitória, empate, derrota, nível).
