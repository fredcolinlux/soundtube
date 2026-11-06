// v1.10.0 / v1.20.0 : visite guidée du studio (/?tour=1)
import { t } from './i18n.js';

function steps() {
  return [
    ['#create', t('tour.style'), t('tour.styleBody')],
    ['#aiBox', t('tour.ai'), t('tour.aiBody')],
    ['#durPresets', t('tour.dur'), t('tour.durBody')],
    ['#advBox', t('tour.adv'), t('tour.advBody')],
    ['#genBtn', t('tour.gen'), t('tour.genBody')],
    ['#library', t('tour.lib'), t('tour.libBody')],
  ];
}

export function startTour() {
  let i = 0;
  const STEPS = steps();
  if (!document.querySelector('link[data-tour]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/css/tour.css?v=1.20.0'; l.dataset.tour = '1'; document.head.append(l);
  }
  const ov = document.createElement('div'); ov.className = 'st-tour'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'false'); ov.setAttribute('aria-label', t('tour.label'));
  ov.innerHTML = `<div class="st-ring"></div><div class="st-pop"><p class="st-n"></p><b class="st-t"></b><p class="st-p"></p><div class="st-act"><button type="button" class="btn btn-ghost btn-mini" data-a="end">${t('tour.end')}</button><button type="button" class="btn btn-ghost btn-mini" data-a="prev">←</button><button type="button" class="btn btn-primary btn-mini" data-a="next">${t('tour.next')}</button></div></div>`;
  document.body.append(ov);
  const ring = ov.querySelector('.st-ring'), pop = ov.querySelector('.st-pop');
  const place = () => {
    const [q] = STEPS[i]; const el = document.querySelector(q); if (!el) return;
    const r = el.getBoundingClientRect(), pad = 8;
    Object.assign(ring.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + 2 * pad + 'px', height: Math.min(r.height, innerHeight * 0.8) + 2 * pad + 'px' });
    const pw = Math.min(340, innerWidth - 24), below = r.top + Math.min(r.height, innerHeight * 0.8) + pad + 14;
    const top = below + 190 < innerHeight ? below : Math.max(12, r.top - pad - 14 - pop.offsetHeight);
    Object.assign(pop.style, { width: pw + 'px', left: Math.max(12, Math.min(innerWidth - pw - 12, r.left)) + 'px', top: Math.max(12, Math.min(innerHeight - pop.offsetHeight - 12, top)) + 'px' });
  };
  const show = (k) => {
    i = Math.max(0, Math.min(STEPS.length - 1, k)); const [q, title, body] = STEPS[i]; const el = document.querySelector(q);
    if (el?.tagName === 'DETAILS') el.open = true;
    ov.querySelector('.st-n').textContent = t('tour.progress', { i: i + 1, n: STEPS.length });
    ov.querySelector('.st-t').textContent = title; ov.querySelector('.st-p').textContent = body;
    ov.querySelector('[data-a="prev"]').disabled = i === 0;
    ov.querySelector('[data-a="next"]').textContent = i === STEPS.length - 1 ? t('tour.end') : t('tour.next');
    el?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    setTimeout(place, 420); place();
  };
  const end = () => { ov.remove(); removeEventListener('resize', place); removeEventListener('scroll', place, true); removeEventListener('keydown', key); try { localStorage.setItem('st.tourDone', '1'); } catch {} history.replaceState(null, '', location.pathname); };
  const key = (e) => { if (e.key === 'Escape') end(); if (e.key === 'ArrowRight') show(i + 1); if (e.key === 'ArrowLeft') show(i - 1); };
  ov.addEventListener('click', (e) => { const a = e.target.closest('[data-a]')?.dataset.a; if (a === 'end') end(); if (a === 'prev') show(i - 1); if (a === 'next') (i === STEPS.length - 1 ? end() : show(i + 1)); });
  addEventListener('resize', place); addEventListener('scroll', place, true); addEventListener('keydown', key);
  show(0); ov.querySelector('[data-a="next"]').focus();
}
