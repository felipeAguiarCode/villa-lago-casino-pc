import { getLang, t } from '../core/i18n';
import type { BackColor, Quality, Settings, Speed } from '../core/settings';
import { BACK_COLORS } from '../table/cardFaces';
import type { Hud } from './hud';
import { ICONS } from './icons';

type Opt<T> = [value: T, html: string, aria: string];

/** Segmented control made of icon buttons. */
function seg<T extends string>(opts: Opt<T>[], value: T, onPick: (v: T) => void): HTMLElement {
  const s = document.createElement('div');
  s.className = 'seg';
  for (const [v, html, aria] of opts) {
    const b = document.createElement('button');
    b.innerHTML = html;
    b.setAttribute('aria-label', aria);
    b.title = aria;
    b.className = v === value ? 'on' : '';
    b.onclick = () => {
      s.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      onPick(v);
    };
    s.appendChild(b);
  }
  return s;
}

function row(icon: string, label: string, control: HTMLElement): HTMLElement {
  const r = document.createElement('div');
  r.className = 'row';
  const l = document.createElement('span');
  l.className = 'row-label';
  l.innerHTML = `${icon}<span>${label}</span>`;
  r.append(l, control);
  return r;
}

const swatch = (c: BackColor) => `<i class="swatch" style="background:linear-gradient(135deg, ${BACK_COLORS[c][0]}, ${BACK_COLORS[c][1]})"></i>`;

export function openSettings(hud: Hud, s: Settings, apply: (s: Settings) => void, resetWallet: () => void) {
  const body = document.createElement('div');
  const vol = document.createElement('input');
  vol.type = 'range';
  vol.min = '0';
  vol.max = '1';
  vol.step = '0.05';
  vol.value = String(s.volume);
  vol.setAttribute('aria-label', t('settings.volume'));
  vol.oninput = () => {
    s.volume = Number(vol.value);
    apply(s);
  };
  body.append(
    row(
      ICONS.speaker,
      t('settings.sound'),
      seg<'on' | 'off'>(
        [
          ['on', ICONS.speaker, 'On'],
          ['off', ICONS.mute, 'Off'],
        ],
        s.muted ? 'off' : 'on',
        (v) => {
          s.muted = v === 'off';
          apply(s);
        },
      ),
    ),
    row('', t('settings.volume'), vol),
    row(
      ICONS.speed2,
      t('settings.speed'),
      seg<Speed>(
        [
          ['normal', ICONS.speed1, 'Normal'],
          ['fast', ICONS.speed2, 'Fast'],
          ['instant', ICONS.speed3, 'Turbo'],
        ],
        s.speed,
        (v) => {
          s.speed = v;
          apply(s);
        },
      ),
    ),
    row(
      ICONS.sparkle,
      t('settings.quality'),
      seg<Quality>(
        [
          ['high', ICONS.sparkle, 'High'],
          ['low', ICONS.leaf, 'Battery saver'],
        ],
        s.quality,
        (v) => {
          s.quality = v;
          apply(s);
        },
      ),
    ),
    row(
      ICONS.deal,
      t('settings.back'),
      seg<BackColor>(
        [
          ['bordo', swatch('bordo'), 'Burgundy'],
          ['marinho', swatch('marinho'), 'Navy'],
          ['esmeralda', swatch('esmeralda'), 'Emerald'],
        ],
        s.back,
        (v) => {
          s.back = v;
          apply(s);
        },
      ),
    ),
    row(
      ICONS.bulb,
      t('settings.hints'),
      seg<'on' | 'off'>(
        [
          ['on', ICONS.bulb, 'On'],
          ['off', ICONS.bulbOff, 'Off'],
        ],
        s.hints ? 'on' : 'off',
        (v) => {
          s.hints = v === 'on';
          apply(s);
        },
      ),
    ),
    row(
      ICONS.globe,
      t('settings.lang'),
      seg<'en' | 'pt'>(
        [
          ['en', '<b>EN</b>', 'English'],
          ['pt', '<b>PT</b>', 'Português'],
        ],
        getLang(),
        (v) => {
          s.lang = v;
          apply(s);
        },
      ),
    ),
  );
  const reset = document.createElement('button');
  reset.className = 'vbtn dark';
  reset.setAttribute('aria-label', t('settings.reset'));
  reset.innerHTML = `<span class="face">${ICONS.redo}</span><span class="lbl">${t('settings.reset')}</span>`;
  let armed = false;
  reset.onclick = () => {
    if (!armed) {
      armed = true;
      reset.className = 'vbtn red';
      reset.querySelector('.lbl')!.textContent = t('settings.resetConfirm');
      return;
    }
    resetWallet();
    reset.className = 'vbtn green';
    reset.querySelector('.face')!.innerHTML = ICONS.check;
    reset.disabled = true;
  };
  const ar = document.createElement('div');
  ar.className = 'actions-row';
  ar.appendChild(reset);
  body.appendChild(ar);
  hud.modal(t('settings.title'), body);
}

const CREDITS_EN = `
  <p>Villa Lago Casino is played with <b>fictional chips</b> only: no real money, no real-money gambling and no purchases. "Villa Lago" is an original name, not affiliated with any real casino.</p>
  <h4>Engine</h4>
  <p>"Card Engine" splash: original, made for this game.</p>
  <h4>Sound</h4>
  <p>Casino Audio — Kenney (kenney.nl), <a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noopener">CC0</a>.</p>
  <h4>Textures</h4>
  <p>Felt: "Felt Backgrounds" — jbp4444, OpenGameArt.org, CC0.</p>
  <p>Table decor: "Brass Goblets" (Tina), "Vintage Pocket Watch" (Tal Swicegood) — Poly Haven, CC0. Glasses, chips, plaques, dice and placards are modelled for the game.</p>
  <h4>Cards</h4>
  <p>Court cards (Jack, Queen, King): "English pattern playing cards" — Dmitry Fomin, Wikimedia Commons, CC0. Indices, suits, aces, card back and chips were drawn for this game.</p>
  <h4>Fonts</h4>
  <p>Cinzel — Natanael Gama · Barlow Condensed — Jeremy Tribby. SIL Open Font License 1.1.</p>
  <h4>Code</h4>
  <p>three.js (MIT) · GSAP ("Standard No Charge" license).</p>`;

const CREDITS_PT = `
  <p>Villa Lago Casino é jogado só com <b>fichas fictícias</b>: sem dinheiro real, apostas reais ou compras. "Villa Lago" é um nome original, sem vínculo com cassinos reais.</p>
  <h4>Engine</h4>
  <p>Splash "Card Engine": original, feita para este jogo.</p>
  <h4>Sons</h4>
  <p>Casino Audio — Kenney (kenney.nl), <a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noopener">CC0</a>.</p>
  <h4>Texturas</h4>
  <p>Feltro: "Felt Backgrounds" — jbp4444, OpenGameArt.org, CC0.</p>
  <p>Decoração da mesa: "Brass Goblets" (Tina), "Vintage Pocket Watch" (Tal Swicegood) — Poly Haven, CC0. Copos, fichas, placas, dados e plaquetas foram modelados para o jogo.</p>
  <h4>Cartas</h4>
  <p>Figuras (Valete, Dama, Rei): "English pattern playing cards" — Dmitry Fomin, Wikimedia Commons, CC0. Índices, naipes, ases, verso e fichas desenhados para o jogo.</p>
  <h4>Fontes</h4>
  <p>Cinzel — Natanael Gama · Barlow Condensed — Jeremy Tribby. SIL Open Font License 1.1.</p>
  <h4>Código</h4>
  <p>three.js (MIT) · GSAP (licença gratuita "Standard No Charge").</p>`;

export const creditsHtml = () => (getLang() === 'pt' ? CREDITS_PT : CREDITS_EN);
