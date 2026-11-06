import { $, api, esc, bootSite, mountBackground, reveal, styleCardHtml, MiniPlayer, trackRowHtml, colorOf, t } from './site.js?v=1.19.2';

const field = mountBackground();
await bootSite('/accueil');
const player = new MiniPlayer(field);
let latest = [];
const renderLatest = () => { $('#latestList').innerHTML = latest.map((t) => trackRowHtml(t, player)).join(''); };
player.onChange = renderLatest;
$('#latestList').addEventListener('click', (e) => { const b = e.target.closest('[data-play]'); if (b) player.play(latest.find((t) => t.id === b.dataset.play)); });

(async () => {
  const [st, health, ai, lib] = await Promise.all([api('/api/styles'), api('/api/health').catch(() => ({})), api('/api/admin/ai').catch(() => null), api('/api/tracks?status=done&limit=6').catch(() => ({ items: [], total: 0 }))]);
  $('#homeGrid').innerHTML = st.styles.map(styleCardHtml).join('');
  $('#ticker').innerHTML = [...st.styles, ...st.styles].map((s) => `<span style="--c:${colorOf(s.id)}">${esc(s.label)}</span>`).join('');
  $('#hsStyles').textContent = st.styles.length; $('#hsTracks').textContent = String(lib.total ?? 0);
  $('#hsAi').textContent = ai?.url ? 'connecté' : 'facultatif';
  $('#ver').textContent = health.version ? 'v' + health.version : '';
  latest = (lib.items || []).filter((t) => t.status === 'done'); $('#latestSec').hidden = !latest.length; renderLatest();
  reveal();
})().catch((e) => { $('#homeGrid').innerHTML = `<p class="err">Serveur injoignable : ${esc(e.message)}</p>`; });
