import { $, api, esc, bootSite, mountBackground, reveal, styleCardHtml } from '/js/site.js';
await bootSite('/styles'); mountBackground();
api('/api/styles').then((st) => {
  $('#allGrid').innerHTML = st.styles.map(styleCardHtml).join('');
  if (st.roadmap) { $('#roadmap').innerHTML = st.roadmap; $('#roadSec').hidden = false; }
  reveal();
}).catch((e) => { $('#allGrid').innerHTML = `<p class="err">Serveur injoignable : ${esc(e.message)}</p>`; });
