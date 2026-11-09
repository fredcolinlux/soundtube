import { t, onLangChange } from './i18n.js';
import { apiFetch } from './csrf.js';
// premier rendu une fois le catalogue i18n chargé (sinon des clés brutes s'affichent) ; sans dépendre d'un nouvel export d'i18n.js (cache 1 h)
const i18nReady = new Promise((r) => { const t0 = Date.now(); const go = () => (t('admin.demoTitle') !== 'admin.demoTitle' || Date.now() - t0 > 5000 ? r() : setTimeout(go, 40)); go(); });
// v1.21.4 : Admin › 06b — morceaux de la démo publique (≤ 10, < 5 min, écoute seule pour les visiteurs).
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toast = (m) => { const el = $('#toast'); if (!el) return; el.textContent = m; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 4000); };
const fmt = (s) => { s = Math.round(+s || 0); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const day = (iso) => { try { return new Date(iso).toLocaleDateString(document.documentElement.lang === 'en' ? 'en-GB' : 'fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return iso || ''; } };
async function api(method, body) {
  const r = await apiFetch('/api/admin/demo-tracks', { method, headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || t('err.generic', { status: r.status }));
  return d;
}
let V = null, sel = new Set(), dirty = false, playing = null;
function render() {
  if (!V) return;
  const max = V.max || 10, q = ($('#dmFilter').value || '').trim().toLowerCase(), only = $('#dmOnlySel').checked;
  const full = sel.size >= max;
  const rows = V.candidates.filter((c) => (!only || sel.has(c.id)) && (!q || `${c.title} ${c.title_en || ''} ${c.style} ${c.owner || ''}`.toLowerCase().includes(q)));
  $('#dmCount').textContent = t('admin.demoCount', { n: sel.size, max }) + (dirty ? ' · ' + t('admin.demoUnsaved') : '');
  $('#dmList').innerHTML = rows.length ? rows.map((c) => {
    const on = sel.has(c.id), dis = !on && full;
    return `<tr class="${on ? 'dm-on' : ''}"><td><input type="checkbox" data-dm="${esc(c.id)}" ${on ? 'checked' : ''} ${dis ? 'disabled' : ''} aria-label="${esc(t('admin.demoPick', { title: c.title }))}" title="${dis ? esc(t('admin.demoFull', { max })) : ''}"></td>
      <td><b>${esc(document.documentElement.lang === 'en' && c.title_en ? c.title_en : c.title)}</b></td><td>${esc(c.style)}</td><td class="c-dur">${esc(fmt(c.duration))}</td><td>${esc(day(c.created_at))}</td><td>${esc(c.owner || '—')}</td>
      <td><button type="button" class="btn btn-ghost btn-mini" data-dmplay="${esc(c.id)}">${playing === c.id ? '❚❚' : '▶'}</button></td></tr>`;
  }).join('') : `<tr><td colspan="7" class="hint">${esc(V.candidates.length ? t('admin.demoNoMatch') : t('admin.demoEmpty'))}</td></tr>`;
}
function load(v) { V = v; sel = new Set(v.selected || []); dirty = false; render(); }
$('#dmList')?.addEventListener('change', (e) => {
  const cb = e.target.closest('[data-dm]'); if (!cb) return;
  const max = V?.max || 10;
  if (cb.checked && sel.size >= max) { cb.checked = false; toast(t('admin.demoFull', { max })); return; }
  cb.checked ? sel.add(cb.dataset.dm) : sel.delete(cb.dataset.dm); dirty = true; render();
});
$('#dmList')?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-dmplay]'); if (!b) return;
  const a = $('#dmAudio'), id = b.dataset.dmplay;
  if (playing === id) { a.pause(); playing = null; render(); return; }
  a.src = `/api/tracks/${encodeURIComponent(id)}/audio.mp3`; a.play().catch(() => { a.src = `/api/tracks/${encodeURIComponent(id)}/audio.wav`; a.play().catch(() => {}); });
  playing = id; a.onended = () => { playing = null; render(); }; render();
});
['#dmFilter', '#dmOnlySel'].forEach((s) => $(s)?.addEventListener('input', render));
$('#dmClear')?.addEventListener('click', () => { sel.clear(); dirty = true; render(); });
$('#dmSave')?.addEventListener('click', async () => {
  try { load(await api('PUT', { ids: [...sel] })); $('#dmMsg').textContent = t('admin.demoSaved', { n: sel.size }); toast(t('admin.demoSaved', { n: sel.size })); }
  catch (e) { $('#dmMsg').textContent = e.message; toast(e.message); }
});
onLangChange(render);
if ($('#demotracks')) i18nReady.then(() => api('GET')).then(load).catch((e) => { $('#dmMsg').textContent = e.message; });
