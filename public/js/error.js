import { AuroraField } from './aurora.js';
import { initI18n, mountLangSwitcher, applyDom } from './i18n.js';

await initI18n(); applyDom();
mountLangSwitcher(document.getElementById('langHost'));
try { new AuroraField(document.getElementById('bgCanvas')); } catch {}

const wave = document.getElementById('errWave');
if (wave) {
  wave.innerHTML = Array.from({ length: 18 }, (_, i) => {
    const h = 20 + ((i * 17) % 50);
    return `<b style="--h:${h};animation-delay:${(i % 7) * 0.08}s"></b>`;
  }).join('');
}
