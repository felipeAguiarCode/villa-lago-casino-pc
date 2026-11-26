import '@fontsource/cinzel/latin-700.css';
import '@fontsource/cinzel/latin-900.css';
import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-800.css';
import '@fontsource/barlow-condensed/latin-500-italic.css';
import '@fontsource/barlow-condensed/latin-600-italic.css';
import '@fontsource/barlow-condensed/latin-700-italic.css';
import '@fontsource/barlow-condensed/latin-800-italic.css';
import './ui/hud.css';
import './ui/pc.css';
import './ui/pcStrings';
import { setLang, t } from './core/i18n';
import { loadSettings } from './core/settings';
import { BootChime } from './audio/bootChime';
import { App } from './app';
import { Splash } from './ui/splash';
import { bindLayoutVars } from './ui/layout';

const settings = loadSettings();
setLang(settings.lang);

let skipEngine = false;
try {
  skipEngine = sessionStorage.getItem('vlc.skipSplash') === '1';
  sessionStorage.removeItem('vlc.skipSplash');
} catch {
  /* ignore */
}

const frame = document.getElementById('frame')!;
bindLayoutVars(frame);
const splash = new Splash(frame);
const app = new App();
const boot = app.boot((f, m) => splash.progress(f, m));
boot.catch((err) => {
  console.error(err);
  splash.fail(t('load.error'));
});

const chime = new BootChime(settings.volume, settings.muted);
splash.run(boot, skipEngine, () => void app.start(), chime);

if (import.meta.env.DEV) {
  (window as unknown as { __vlc: App; __chime: BootChime }).__vlc = app;
  (window as unknown as { __chime: BootChime }).__chime = chime;
  void import('./dev/previews').then((m) => m.installPreviewTools(app));
}
