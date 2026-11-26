import { t } from '../core/i18n';
import { emblemDataURL } from './emblem';

/**
 * Title screen of the PC edition: the house emblem and the game's name over the lobby table,
 * waiting for Enter (or a click). Resolves when the player starts.
 */
export class TitleScreen {
  private el: HTMLElement;

  constructor(frame: HTMLElement) {
    const el = document.createElement('section');
    el.id = 'title';
    el.className = 'live';
    el.innerHTML = `
      <div class="ti-box">
        <img class="ti-emblem" alt="" src="${emblemDataURL(320)}">
        <div class="ti-poker gold-text">POKER</div>
        <div class="ti-against"><i></i><span>AGAINST THE HOUSE</span><i></i></div>
        <div class="ti-sub">${t('title.sub')}</div>
      </div>
      <div class="ti-press"><b>${t('title.press')}</b><small>${t('title.pressSub')}</small></div>
      <div class="ti-foot">${t('title.chips')}</div>`;
    frame.appendChild(el);
    this.el = el;
  }

  /** Shows the title and waits for Enter, Space or a click. */
  run(onStart: () => void): Promise<void> {
    return new Promise((res) => {
      requestAnimationFrame(() => this.el.classList.add('show'));
      const go = () => {
        window.removeEventListener('keydown', key);
        this.el.removeEventListener('click', go);
        onStart();
        this.el.classList.add('out');
        setTimeout(() => {
          this.el.remove();
          res();
        }, 600);
      };
      const key = (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          go();
        }
      };
      window.addEventListener('keydown', key);
      this.el.addEventListener('click', go);
    });
  }
}
