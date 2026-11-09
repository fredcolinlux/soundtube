import { t, onLangChange } from './i18n.js';
import { apiFetch } from './csrf.js';
// premier rendu une fois le catalogue i18n chargé (sinon des clés brutes s'affichent) ; sans dépendre d'un nouvel export d'i18n.js (cache 1 h)
const i18nReady = new Promise((r) => { const t0 = Date.now(); const go = () => (t('admin.extTitle') !== 'admin.extTitle' || Date.now() - t0 > 5000 ? r() : setTimeout(go, 40)); go(); });
// v1.21.4 : Admin › 06c — dossier de samples externes (NAS monté en lecture seule), scan et comptes par catégorie.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toast = (m) => { const el = $('#toast'); if (!el) return; el.textContent = m; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 4000); };
const nf = (x) => Number(x || 0).toLocaleString(document.documentElement.lang === 'en' ? 'en-GB' : 'fr-FR');
const when = (iso) => { try { return new Date(iso).toLocaleString(document.documentElement.lang === 'en' ? 'en-GB' : 'fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return iso || ''; } };
async function api(method, url, body) {
  const r = await apiFetch(url, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || t('err.generic', { status: r.status })), { data: d });
  return d;
}
let V = null, timer = null;
function render() {
  if (!V) return;
  const S = V.settings, st = V.state || {}, I = V.index, sc = V.scan || {};
  if (document.activeElement !== $('#exDir')) $('#exDir').value = S.dir;
  $('#exEnabled').checked = !!S.enabled;
  $('#exScan').disabled = !!sc.running;
  $('#exState').textContent = sc.running ? t('admin.extScanning', { done: nf(sc.done), total: nf(sc.total) })
    : V.active ? t('admin.extActive', { n: nf(I.used) }) : !S.enabled ? t('admin.extOff') : !st.readable ? t('admin.extMissing') : t('admin.extInactive');
  const lines = [];
  lines.push(`<p class="hint ${st.readable ? 'ok' : 'bad'}">${esc(st.readable ? t('admin.extReadable', { dir: S.dir }) : t('admin.extNotReadable', { dir: S.dir, err: st.error || '—' }))}</p>`);
  if (st.readable && st.writable) lines.push(`<p class="hint warn">${esc(t('admin.extWritable'))}</p>`);
  if (V.staleIndex) lines.push(`<p class="hint warn">${esc(t('admin.extStale'))}</p>`);
  if (I) {
    const cats = V.categories.map((c) => `<tr><td>${esc(t('admin.extCat.' + c))}</td><td class="c-dur">${nf(I.counts[c])}${I.aliases?.[c] ? ' · ' + esc(t('admin.extAlias', { from: t('admin.extCat.' + I.aliases[c]) })) : ''}</td><td class="hint">${esc((I.examples?.[c] || []).join(' · '))}</td></tr>`).join('');
    const sk = I.skipped || {};
    lines.push(`<table class="hist"><thead><tr><th>${esc(t('admin.extColCat'))}</th><th class="c-dur">${esc(t('admin.extColFiles'))}</th><th>${esc(t('admin.extColExamples'))}</th></tr></thead><tbody>${cats}</tbody></table>`);
    lines.push(`<p class="hint">${esc(t('admin.extSummary', { when: when(I.scannedAt), found: nf(I.found), used: nf(I.used), sec: (I.ms / 1000).toFixed(1), hash: I.hash }))}</p>`);
    lines.push(`<p class="hint">${esc(t('admin.extSkipped', { unclassified: nf(sk.unclassified), tooLong: nf(sk.tooLong), unreadable: nf(sk.unreadable), silent: nf(sk.silent), tooBig: nf(sk.tooBig) }))}${I.truncated ? ' · ' + esc(t('admin.extTruncated')) : ''}</p>`);
    if (I.errors?.length) lines.push(`<pre class="dir-pre">${esc(I.errors.join('\n'))}</pre>`);
    lines.push(`<p class="hint ${I.usable ? 'ok' : 'warn'}">${esc(I.usable ? t('admin.extUsable') : t('admin.extNotUsable'))}</p>`);
  } else if (st.readable) lines.push(`<p class="hint">${esc(t('admin.extNoIndex'))}</p>`);
  $('#exInfo').innerHTML = lines.join('');
  clearTimeout(timer); if (sc.running) timer = setTimeout(refresh, 1500);
}
async function refresh() { try { V = await api('GET', '/api/admin/samples'); render(); } catch (e) { $('#exMsg').textContent = e.message; } }
$('#exSave')?.addEventListener('click', async () => {
  try { V = await api('PUT', '/api/admin/samples', { dir: $('#exDir').value.trim(), enabled: $('#exEnabled').checked }); render(); $('#exMsg').textContent = t('admin.extSaved'); toast(t('admin.extSaved')); }
  catch (e) { $('#exMsg').textContent = e.message; toast(e.message); }
});
$('#exScan')?.addEventListener('click', async () => {
  try { V = await api('POST', '/api/admin/samples/scan'); render(); $('#exMsg').textContent = t('admin.extScanStarted'); }
  catch (e) { if (e.data?.settings) { V = e.data; render(); } $('#exMsg').textContent = e.message; toast(e.message); }
});
onLangChange(render);
if ($('#extsamples')) i18nReady.then(refresh);
