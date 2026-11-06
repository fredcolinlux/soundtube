import { $, api, esc, bootSite, mountBackground, reveal, styleCardHtml, MiniPlayer, trackRowHtml, colorOf, t, onLangChange } from './site.js?v=1.20.5';

const field = mountBackground();
await bootSite('/');
const player = new MiniPlayer(field);
let latest = [];
let styles = [];
const renderLatest = () => { $('#latestList').innerHTML = latest.map((tr) => trackRowHtml(tr, player)).join(''); };
const renderStyles = () => {
  $('#homeGrid').innerHTML = styles.map(styleCardHtml).join('');
  $('#ticker').innerHTML = [...styles, ...styles].map((s) => `<span style="--c:${colorOf(s.id)}">${esc(s.label)}</span>`).join('');
};
player.onChange = renderLatest;
$('#latestList').addEventListener('click', (e) => { const b = e.target.closest('[data-play]'); if (b) player.play(latest.find((tr) => tr.id === b.dataset.play)); });

async function load() {
  const [st, health, ai, lib] = await Promise.all([api('/api/styles'), api('/api/health').catch(() => ({})), api('/api/admin/ai').catch(() => null), api('/api/tracks?status=done&limit=6').catch(() => ({ items: [], total: 0 }))]);
  styles = st.styles || [];
  renderStyles();
  $('#hsStyles').textContent = styles.length; $('#hsTracks').textContent = String(lib.total ?? 0);
  $('#hsAi').textContent = ai?.url ? t('home.aiOn') : t('home.aiOff');
  $('#ver').textContent = health.version ? 'v' + health.version : '';
  latest = (lib.items || []).filter((tr) => tr.status === 'done'); $('#latestSec').hidden = !latest.length; renderLatest();
}
onLangChange(() => { load().catch(() => {}); });
load().catch((e) => { $('#homeGrid').innerHTML = `<p class="err">${t('home.serverDown', { msg: esc(e.message) })}</p>`; }).then(() => reveal());
