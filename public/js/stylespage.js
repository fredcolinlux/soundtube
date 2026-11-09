import { $, api, esc, bootSite, mountBackground, reveal, styleCardHtml, t, onLangChange } from '/js/site.js?v=1.21.2';
await bootSite('/styles'); mountBackground();

async function load() {
  const st = await api('/api/styles');
  $('#allGrid').innerHTML = st.styles.map(styleCardHtml).join('');
  if (st.roadmap) { $('#roadmap').innerHTML = st.roadmap; $('#roadSec').hidden = false; }
  else $('#roadSec').hidden = true;
  reveal();
}
onLangChange(() => { load().catch(() => {}); });
load().catch((e) => { $('#allGrid').innerHTML = `<p class="err">${t('home.serverDown', { msg: esc(e.message) })}</p>`; });
