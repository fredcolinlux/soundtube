import { $, $$, esc, bootSite, mountBackground, reveal, colorOf, t } from './site.js?v=1.20.0';

mountBackground(); await bootSite('/demarrer');
// Chaque étape : texte + petite illustration en HTML/CSS (aucune image externe) — i18n après bootSite
function buildSteps() {
  return [
    { t: t('tour.s1.t'), c: 'frenchtouch', p: t('tour.s1.p'),
      art: () => ['lofi', 'house', 'frenchtouch', 'techno', 'synthwave', 'dnb'].map((s, i) => `<span class="ta-card${i === 2 ? ' on' : ''}" style="--c:${colorOf(s)}"></span>`).join(''), link: ['/styles', t('tour.s1.link')] },
    { t: t('tour.s2.t'), c: 'synthwave', p: t('tour.s2.p'),
      art: () => `<span class="ta-bubble">${esc(t('tour.s2.bubble'))}</span><span class="ta-arrow">↓</span><span class="ta-tags"><i>French Touch</i><i>Nocturne</i><i>123 BPM</i><i>Ed Banger</i></span>`, link: ['/#settings', t('tour.s2.link')] },
    { t: t('tour.s3.t'), c: 'house', p: t('tour.s3.p'),
      art: () => [t('tour.s3.energy'), t('tour.s3.swing'), t('tour.s3.brightness'), t('tour.s3.space')].map((l, i) => `<span class="ta-slider"><em>${esc(l)}</em><i style="--v:${[62, 18, 44, 70][i]}%"></i></span>`).join(''), link: ['/', t('tour.s3.link')] },
    { t: t('tour.s4.t'), c: 'dnb', p: t('tour.s4.p'),
      art: () => `<span class="ta-wave">${Array.from({ length: 40 }, (_, k) => `<i style="--k:${k}"></i>`).join('')}</span>`, link: ['/', t('tour.s4.link')] },
    { t: t('tour.s5.t'), c: 'cinematic', p: t('tour.s5.p'),
      art: () => `<span class="ta-thumb"><b>Néons sur la Seine</b><em>French Touch · 1 h</em></span>`, link: ['/#library', t('tour.s5.link')] },
  ];
}
let STEPS = buildSteps();
let cur = 0;
function show(i) {
  STEPS = buildSteps();
  cur = (i + STEPS.length) % STEPS.length; const s = STEPS[cur];
  $('#tourBox').style.setProperty('--c', colorOf(s.c));
  $('#tourDots').innerHTML = STEPS.map((x, k) => `<li><button type="button" role="tab" aria-selected="${k === cur}" aria-controls="tourPanel" data-k="${k}"><span>${k + 1}</span>${esc(x.t)}</button></li>`).join('');
  $('#tourPanel').innerHTML = `<p class="tour-n">${esc(t('tour.step', { n: cur + 1 }))}</p><h3>${esc(s.t)}</h3><p>${esc(s.p)}</p><a class="link-more" href="${s.link[0]}">${esc(s.link[1])} →</a>`;
  const art = $('#tourArt'); art.className = 'tour-art art-' + cur; art.innerHTML = s.art();
  $('#tourCount').textContent = `${cur + 1} / ${STEPS.length}`;
  $('#tourPrev').disabled = cur === 0; $('#tourNext').textContent = cur === STEPS.length - 1 ? t('tour.studioBtn') : t('tour.nextBtn');
}
$('#tourDots').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) show(+b.dataset.k); });
$('#tourPrev').addEventListener('click', () => show(cur - 1));
$('#tourNext').addEventListener('click', () => (cur === STEPS.length - 1 ? (location.href = '/?tour=1') : show(cur + 1)));
addEventListener('keydown', (e) => { if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return; if (e.key === 'ArrowRight') show(cur + 1); if (e.key === 'ArrowLeft' && cur > 0) show(cur - 1); });
show(0); reveal();
