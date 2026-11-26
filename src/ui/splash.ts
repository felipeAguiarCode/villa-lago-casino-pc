import { addStrings, t } from '../core/i18n';
import type { BootChime } from '../audio/bootChime';
import { ICONS } from './icons';

addStrings({ 'splash.press': 'PRESS ANY KEY' }, { 'splash.press': 'APERTE QUALQUER TECLA' });

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Engine-style boot splash ("Made with CARD ENGINE") followed by the play-chips notice.
 * The notice's button stays locked until the game has finished loading; tapping it
 * also unlocks Web Audio on mobile.
 *
 * PC: the engine splash rings a 16-bit console boot chime (src/audio/bootChime.ts). A browser only
 * starts audio after a key or a click, so when the sound is still locked the splash opens like a
 * console being switched on: a power light and PRESS ANY KEY, and the logo and its chime start
 * together on the key press.
 */
export class Splash {
  private el: HTMLElement;
  private bar: HTMLElement;
  private msg: HTMLElement;
  private btn: HTMLButtonElement;

  constructor(frame: HTMLElement) {
    const el = document.createElement('div');
    el.id = 'splash';
    el.innerHTML = `
      <div class="sp-power"><i><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5v8"/><path d="M6.6 7.2a7.6 7.6 0 1 0 10.8 0"/></svg></i><span>${t('splash.press')}</span></div>
      <div class="sp-engine">
        <div class="sp-made">${t('splash.made')}</div>
        <div class="sp-emblem">
          <i class="c1"></i><i class="c2"></i><i class="c3"><b></b></i>
          <span class="sp-shine"></span>
        </div>
        <div class="sp-name"><b>CARD</b><span>ENGINE</span></div>
      </div>
      <div class="sp-notice">
        <div class="sp-chip">${ICONS.chip}<em>✕</em></div>
        <h2 class="gold-text">${t('splash.notice.title')}</h2>
        <p>${t('splash.notice.body')}</p>
        <small>${t('splash.notice.small')}</small>
        <div class="sp-load"><i></i></div>
        <div class="sp-msg"></div>
        <button class="vbtn green sp-go" disabled aria-label="OK"><span class="face">${ICONS.check}</span></button>
      </div>`;
    frame.appendChild(el);
    this.el = el;
    this.bar = el.querySelector('.sp-load i')!;
    this.msg = el.querySelector('.sp-msg')!;
    this.btn = el.querySelector('.sp-go')!;
  }

  progress(f: number, m: string) {
    this.bar.style.width = `${Math.round(f * 100)}%`;
    this.msg.textContent = m;
  }

  fail(m: string) {
    this.msg.textContent = m;
    this.msg.classList.add('err');
  }

  async run(ready: Promise<unknown>, skipEngine = false, onLeave?: () => void, chime?: BootChime): Promise<void> {
    const el = this.el;
    if (!skipEngine) {
      if (chime && !chime.silent && !(await chime.ready())) {
        el.classList.add('power');
        await new Promise<void>((res) => {
          const go = (e: Event) => {
            if (e instanceof KeyboardEvent && (e.ctrlKey || e.metaKey || e.altKey || e.key === 'F5' || e.key === 'F12')) return;
            // inside the key or click handler, so the browser lets the audio start
            chime.unlock();
            window.removeEventListener('pointerdown', go, true);
            window.removeEventListener('keydown', go, true);
            res();
          };
          window.addEventListener('pointerdown', go, true);
          window.addEventListener('keydown', go, true);
        });
        await chime.ready(600);
        el.classList.add('power-off');
        await wait(260);
        el.classList.remove('power', 'power-off');
      }
      el.classList.add('engine');
      chime?.play();
      await wait(3100);
      el.classList.add('engine-out');
      await wait(450);
    }
    el.classList.remove('engine', 'engine-out');
    el.classList.add('notice');
    await ready;
    this.progress(1, '');
    el.classList.add('loaded');
    this.btn.disabled = false;
    await new Promise<void>((res) => (this.btn.onclick = () => res()));
    // the lobby fades in underneath while the notice fades out
    onLeave?.();
    el.classList.add('out');
    await wait(550);
    el.remove();
  }
}
