// v1.10.0 : visite guidée du studio (/?tour=1) — bulles posées sur les vrais blocs de la page, sans toucher à leur style.
const STEPS = [
  ['#create', 'Le style', 'Chaque carte est un genre complet : tempos, gammes, machines. Clique pour choisir ; la page du style détaille tout.'],
  ['#aiBox', 'Directeur artistique', 'Décris l’ambiance en une phrase, puis « Proposer » : les réglages sont vérifiés par le serveur et remplissent le formulaire.'],
  ['#durPresets', 'La durée', 'De 20 secondes à 4 heures. Au-delà d’une heure, le mix enchaîne des titres variés.'],
  ['#advBox', 'Avancé', 'Les valeurs affichées sont exactement celles que le style utilisera. Une valeur changée est mémorisée pour ce style.'],
  ['#genBtn', 'Générer', 'Le rendu se fait sur le serveur. La progression s’affiche ici, puis le morceau joue tout seul.'],
  ['#library', 'Bibliothèque', 'Tous les morceaux : écoute, téléchargements, variation, vidéo et textes YouTube.'],
];
export function startTour() {
  let i = 0;
  if (!document.querySelector('link[data-tour]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/css/tour.css?v=1.17.0'; l.dataset.tour = '1'; document.head.append(l); }
  const ov = document.createElement('div'); ov.className = 'st-tour'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'false'); ov.setAttribute('aria-label', 'Visite guidée');
  ov.innerHTML = '<div class="st-ring"></div><div class="st-pop"><p class="st-n"></p><b class="st-t"></b><p class="st-p"></p><div class="st-act"><button type="button" class="btn btn-ghost btn-mini" data-a="end">Terminer</button><button type="button" class="btn btn-ghost btn-mini" data-a="prev">←</button><button type="button" class="btn btn-primary btn-mini" data-a="next">Suivant</button></div></div>';
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
    i = Math.max(0, Math.min(STEPS.length - 1, k)); const [q, t, p] = STEPS[i]; const el = document.querySelector(q);
    if (el?.tagName === 'DETAILS') el.open = true;
    ov.querySelector('.st-n').textContent = `Visite · ${i + 1} / ${STEPS.length}`; ov.querySelector('.st-t').textContent = t; ov.querySelector('.st-p').textContent = p;
    ov.querySelector('[data-a="prev"]').disabled = i === 0; ov.querySelector('[data-a="next"]').textContent = i === STEPS.length - 1 ? 'Terminer' : 'Suivant';
    el?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    setTimeout(place, 420); place();
  };
  const end = () => { ov.remove(); removeEventListener('resize', place); removeEventListener('scroll', place, true); removeEventListener('keydown', key); try { localStorage.setItem('st.tourDone', '1'); } catch {} history.replaceState(null, '', location.pathname); };
  const key = (e) => { if (e.key === 'Escape') end(); if (e.key === 'ArrowRight') show(i + 1); if (e.key === 'ArrowLeft') show(i - 1); };
  ov.addEventListener('click', (e) => { const a = e.target.closest('[data-a]')?.dataset.a; if (a === 'end') end(); if (a === 'prev') show(i - 1); if (a === 'next') (i === STEPS.length - 1 ? end() : show(i + 1)); });
  addEventListener('resize', place); addEventListener('scroll', place, true); addEventListener('keydown', key);
  show(0); ov.querySelector('[data-a="next"]').focus();
}
