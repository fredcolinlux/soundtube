import { $, $$, esc, mountTopbar, mountBackground, reveal, colorOf } from './site.js?v=1.17.0';

mountTopbar('/demarrer'); mountBackground();
// Chaque étape : texte + petite illustration en HTML/CSS (aucune image externe)
const STEPS = [
  { t: 'Choisis un style', c: 'frenchtouch', p: 'Onze styles, chacun avec ses tempos, ses gammes, ses boîtes à rythmes et ses synthés. Certains ont des variantes : French Touch classique, Ed Banger ou Myd ; techno Detroit, minimale ou industrielle…',
    art: () => ['lofi', 'house', 'frenchtouch', 'techno', 'synthwave', 'dnb'].map((s, i) => `<span class="ta-card${i === 2 ? ' on' : ''}" style="--c:${colorOf(s)}"></span>`).join(''), link: ['/styles', 'Voir les styles'] },
  { t: 'Décris l’ambiance', c: 'synthwave', p: 'Une phrase suffit : « une nuit à Paris, basse sale, filtres qui montent ». Le directeur artistique (PC IA) propose style, ambiance, tempo et réglages ; le serveur les vérifie et les borne avant de remplir le formulaire. Sans IA, une proposition locale prend le relais.',
    art: () => `<span class="ta-bubble">une nuit à Paris, basse sale…</span><span class="ta-arrow">↓</span><span class="ta-tags"><i>French Touch</i><i>Nocturne</i><i>123 BPM</i><i>Ed Banger</i></span>`, link: ['/#settings', 'Essayer'] },
  { t: 'Règle ce qui compte', c: 'house', p: 'Durée de 20 s à 4 h, ambiance, tonalité. « Avancé » montre les valeurs exactes que le style va utiliser ; change-en une et elle est mémorisée pour ce style. Même graine = même morceau.',
    art: () => ['Énergie', 'Swing', 'Brillance', 'Espace'].map((l, i) => `<span class="ta-slider"><em>${l}</em><i style="--v:${[62, 18, 44, 70][i]}%"></i></span>`).join(''), link: ['/', 'Ouvrir le studio'] },
  { t: 'Génère et écoute', c: 'dnb', p: 'Le rendu se fait sur le serveur : quelques secondes pour un titre, quelques minutes pour un mix d’une heure. Le fond s’anime au rythme de la musique ; WAV, MP3 et MIDI par instrument sont prêts à télécharger.',
    art: () => `<span class="ta-wave">${Array.from({ length: 40 }, (_, k) => `<i style="--k:${k}"></i>`).join('')}</span>`, link: ['/', 'Générer un morceau'] },
  { t: 'Publie', c: 'cinematic', p: 'Pour chaque morceau : miniature et vidéo YouTube (fond animé, spectre, chapitres), titres et descriptions FR + EN, découpe d’un long mix en titres. Le PC Windows peut accélérer les vidéos.',
    art: () => `<span class="ta-thumb"><b>Néons sur la Seine</b><em>French Touch · 1 h</em></span>`, link: ['/#library', 'Bibliothèque'] },
];
let cur = 0;
function show(i) {
  cur = (i + STEPS.length) % STEPS.length; const s = STEPS[cur];
  $('#tourBox').style.setProperty('--c', colorOf(s.c));
  $('#tourDots').innerHTML = STEPS.map((x, k) => `<li><button type="button" role="tab" aria-selected="${k === cur}" aria-controls="tourPanel" data-k="${k}"><span>${k + 1}</span>${esc(x.t)}</button></li>`).join('');
  $('#tourPanel').innerHTML = `<p class="tour-n">Étape ${cur + 1}</p><h3>${esc(s.t)}</h3><p>${esc(s.p)}</p><a class="link-more" href="${s.link[0]}">${esc(s.link[1])} →</a>`;
  const art = $('#tourArt'); art.className = 'tour-art art-' + cur; art.innerHTML = s.art();
  $('#tourCount').textContent = `${cur + 1} / ${STEPS.length}`;
  $('#tourPrev').disabled = cur === 0; $('#tourNext').textContent = cur === STEPS.length - 1 ? 'Visite dans le studio →' : 'Suivant →';
}
$('#tourDots').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) show(+b.dataset.k); });
$('#tourPrev').addEventListener('click', () => show(cur - 1));
$('#tourNext').addEventListener('click', () => (cur === STEPS.length - 1 ? (location.href = '/?tour=1') : show(cur + 1)));
addEventListener('keydown', (e) => { if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return; if (e.key === 'ArrowRight') show(cur + 1); if (e.key === 'ArrowLeft' && cur > 0) show(cur - 1); });
show(0); reveal();
