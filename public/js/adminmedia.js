import { t } from './i18n.js';
import { apiFetch } from './csrf.js';
// v1.14.0 : Admin → Animations (bibliothèque des fonds de vidéo, partagée avec le studio).
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toast = (m) => { const t = $('#toast'); if (!t) return; t.textContent = m; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 3200); };
let M = { items: [], maxBytes: 0, accept: '' };
async function load() {
  try { const r = await apiFetch('/api/media'); M = await r.json(); } catch { M = { items: [] }; }
  $('#mdFile').accept = M.accept || '';
  $('#mdCount').textContent = `${M.items.length} animation${M.items.length > 1 ? 's' : ''}${M.maxBytes ? ` · max ${Math.round(M.maxBytes / 1048576)} Mo par fichier` : ''}`;
  $('#mdList').innerHTML = M.items.length ? M.items.map((m) => `<figure class="md-item"><img src="${m.poster}" alt="" loading="lazy"><figcaption><b>${esc(m.name)}</b><span class="hint">${esc(m.kind)}${m.width ? ` · ${m.width}×${m.height}` : ''}${m.duration ? ` · ${Math.round(m.duration)} s` : ''}</span><button class="btn btn-mini btn-ghost" type="button" data-mddel="${m.id}">${t('common.delete')}</button></figcaption></figure>`).join('') : `<p class="hint">${t('media.empty')}</p>`;
}
$('#mdFile').addEventListener('change', (e) => {
  const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
  if (M.maxBytes && f.size > M.maxBytes) return toast(`Fichier trop volumineux (max ${Math.round(M.maxBytes / 1048576)} Mo).`);
  const x = new XMLHttpRequest(); x.open('POST', `/api/media?name=${encodeURIComponent(f.name)}`); x.setRequestHeader('Content-Type', 'application/octet-stream');
  x.upload.onprogress = (ev) => { if (ev.lengthComputable) $('#mdState').textContent = `Envoi ${Math.round(ev.loaded / ev.total * 100)} %…`; };
  x.upload.onload = () => { $('#mdState').textContent = t('media.probing'); };
  x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch {} $('#mdState').textContent = ''; if (x.status === 201) { toast(t('media.added', { name: j.name })); load(); } else toast(j.error || t('err.generic', { status: x.status })); };
  x.onerror = () => { $('#mdState').textContent = ''; toast('Envoi impossible.'); };
  x.send(f);
});
$('#mdList').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-mddel]'); if (!b) return; const m = M.items.find((x) => x.id === b.dataset.mddel);
  if (!confirm(t('media.delConfirm', { name: m?.name || '' }))) return;
  const r = await apiFetch(`/api/media/${b.dataset.mddel}`, { method: 'DELETE' }); if (!r.ok) toast(t('media.delFail')); load();
});
load();
