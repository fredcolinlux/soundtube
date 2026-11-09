import { bootSite, mountBackground } from './site.js?v=1.21.3';
import { applyDom } from './i18n.js';

mountBackground();
await bootSite('/' + (document.body.dataset.err || '404'));
applyDom(document);

const wave = document.getElementById('errWave');
if (wave) {
  wave.innerHTML = Array.from({ length: 18 }, (_, i) => {
    const h = 20 + ((i * 17) % 50);
    return `<b style="--h:${h};animation-delay:${(i % 7) * 0.08}s"></b>`;
  }).join('');
}
