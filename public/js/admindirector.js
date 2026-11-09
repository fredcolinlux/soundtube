import { t } from './i18n.js';
import { apiFetch } from './csrf.js';
// v1.15.0 / v1.21.2 : Admin › Contexte du directeur — profil de goût (dataDir), restore livré / exemple.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toast = (m) => { const el = $('#toast'); if (!el) return; el.textContent = m; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 4000); };
async function api(method, url, body) {
  const r = await apiFetch(url, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || d.message || t('err.generic', { status: r.status }));
  return d;
}
const n = (x) => Number(x || 0).toLocaleString(document.documentElement.lang === 'en' ? 'en-GB' : 'fr-FR');
const tok = (c) => Math.ceil(c / 3.5);
let V = null;
function render(v) {
  V = v; const s = v.settings, p = v.profile;
  $('#dirTaste').checked = s.taste; $('#dirTrends').checked = s.trends;
  $('#dirState').textContent = `${s.taste ? t('dir.tasteOn') : t('dir.tasteOff')} · ${s.trends ? t('dir.trendsOn') : t('dir.trendsOff')}`;
  const origin = v.origin?.kind || '';
  const originHint = v.generic
    ? t('dir.originExample')
    : (origin.includes('personal') || origin === 'data' ? t('dir.originPersonal') : (p ? t('dir.originData') : t('dir.originMissing')));
  $('#dirProfMeta').textContent = p
    ? `${p.source || '—'} · ${n(p.stats?.tracks)} ${t('dir.tracks')} · ${n(p.stats?.plays)} ${t('dir.plays')} · ${p.builtAt || ''}${s.edited ? ' · ' + t('dir.refsEdited') : ''} · ${originHint}`
    : t('dir.profileMissing');
  const fav = (p?.favourites || []).map((a) => (typeof a === 'string' ? a : a.name));
  $('#dirProfile').innerHTML = p ? `<div><b>${esc(t('dir.topArtists'))}</b><ol>${(p.topArtists || []).slice(0, 10).map((a) => `<li>${esc(a.name)} <span class="hint">${n(a.plays)}</span></li>`).join('')}</ol></div>
    <div><b>${esc(t('dir.genres'))}</b><ol>${(p.topGenres || []).slice(0, 8).map((g) => `<li>${esc(g.name)} <span class="hint">${n(g.plays)} · ${String(g.share).replace('.', ',')} %</span></li>`).join('')}</ol></div>
    ${fav.length ? `<div><b>${esc(t('dir.favourites'))}</b><p class="hint">${esc(fav.slice(0, 16).join(', '))}</p></div>` : ''}
    ${p.sound ? `<p class="hint">${esc(p.sound)}</p>` : ''}` : `<p class="warn">${esc(t('dir.profileMissing'))}</p>`;
  if (document.activeElement !== $('#dirRefs')) $('#dirRefs').value = v.refsText || '';
  const taste = v.taste || '';
  $('#dirTasteText').textContent = taste || '—';
  $('#dirTasteMeta').textContent = `${v.style} · ${n(taste.length)} / ${n(v.budget.taste)} ${t('dir.chars')} · ~${tok(taste.length)} ${t('dir.tokens')}${s.taste ? '' : ' · ' + t('dir.tasteSkipped')}`;
  $('#dirTrText').textContent = v.trends?.text || t('dir.noTrends');
  $('#dirTrMeta').textContent = v.trends ? `${t('dir.reportOf')} ${v.trends.date} · ${n(v.trends.text.length)} / ${n(v.budget.trends)} · ~${tok(v.trends.text.length)}${s.trends ? '' : ' · ' + t('dir.tasteSkipped')}` : '';
  $('#dirTrText').classList.toggle('muted', !v.trends);
  if (v.message) $('#dirMsg').textContent = v.message;
}
async function load() {
  try { render(await api('GET', '/api/admin/director')); }
  catch (e) { $('#dirMsg').textContent = e.message; toast(e.message); console.error('[director]', e); }
}
async function put(b, msg) {
  try {
    const v = await api('PUT', '/api/admin/director', b);
    render(v);
    const m = v.message || msg;
    if (m) { toast(m); $('#dirMsg').textContent = m; }
  } catch (e) { toast(e.message); $('#dirMsg').textContent = e.message; console.error('[director]', e); }
}
$('#dirTaste')?.addEventListener('change', (e) => put({ taste: e.target.checked }, e.target.checked ? t('dir.tasteOn') : t('dir.tasteOff')));
$('#dirTrends')?.addEventListener('change', (e) => put({ trends: e.target.checked }, e.target.checked ? t('dir.trendsOn') : t('dir.trendsOff')));
$('#dirSave')?.addEventListener('click', () => { $('#dirMsg').textContent = ''; put({ refsText: $('#dirRefs').value }, t('dir.saved')); });
$('#dirReset')?.addEventListener('click', () => {
  if (!confirm(t('confirm.dirReset'))) return;
  $('#dirRefs')?.blur();
  $('#dirMsg').textContent = t('dir.restoring');
  put({ reset: true }, t('toast.dirResetOk'));
});

function diffHTML(d) {
  const out = []; let i = 0;
  while (i < d.length) {
    if (d[i].op !== '=') { out.push(`<div class="dl ${d[i].op === '+' ? 'add' : 'del'}"><span>${d[i].op}</span>${esc(d[i].t) || '&nbsp;'}</div>`); i++; continue; }
    let j = i; while (j < d.length && d[j].op === '=') j++;
    const run = d.slice(i, j), keep = 2;
    if (run.length > keep * 2 + 1) { const head = i === 0 ? [] : run.slice(0, keep), tail = j === d.length ? [] : run.slice(-keep);
      for (const x of head) out.push(`<div class="dl"><span> </span>${esc(x.t) || '&nbsp;'}</div>`);
      out.push(`<div class="dl gap">… ${run.length - head.length - tail.length} …</div>`);
      for (const x of tail) out.push(`<div class="dl"><span> </span>${esc(x.t) || '&nbsp;'}</div>`); }
    else for (const x of run) out.push(`<div class="dl"><span> </span>${esc(x.t) || '&nbsp;'}</div>`);
    i = j;
  }
  return out.join('');
}
async function preview(run) {
  const b = { style: $('#dirStyle').value, prompt: $('#dirPrompt').value, run };
  $('#dirDiff').innerHTML = `<p class="hint">${run ? '…' : '…'}</p>`;
  try {
    const r = await api('POST', '/api/admin/director/preview', b), S = r.sources;
    const res = r.result ? (r.result.ok ? `<div class="dir-res ok"><b>${esc(r.result.model)}</b> (${n(r.result.ms)} ms) : <code>${esc(r.result.params.style)}</code> · <code>${esc(r.result.params.mood)}</code>${r.result.meta ? ` · « ${esc(r.result.meta.title_fr)} »` : ''}<br>${esc(r.result.explanation)}</div>` : `<div class="dir-res bad">${esc(r.result.error)}</div>`) : '';
    $('#dirDiff').innerHTML = `${res}<p class="hint dir-sizes">v1.14 : <b>${n(r.base.total)}</b> → <b>${n(r.sent.total)}</b> · goût ${n(S.taste)} · veille ${n(S.trends)}</p>
      <h4>system</h4><div class="diff">${diffHTML(r.diff.system)}</div><h4>user</h4><div class="diff">${diffHTML(r.diff.user)}</div>`;
  } catch (e) { $('#dirDiff').innerHTML = `<p class="warn">${esc(e.message)}</p>`; toast(e.message); }
}
$('#dirPreview')?.addEventListener('click', () => preview(false));
$('#dirRun')?.addEventListener('click', () => preview(true));
$('#dirStyle')?.addEventListener('change', async () => { try { render(await api('GET', `/api/admin/director?style=${encodeURIComponent($('#dirStyle').value)}`)); } catch (e) { toast(e.message); } });
(async () => {
  try { const { styles } = await api('GET', '/api/styles'); $('#dirStyle').innerHTML = styles.map((s) => `<option value="${esc(s.id)}" ${s.id === 'frenchtouch' ? 'selected' : ''}>${esc(s.label)}</option>`).join(''); } catch (e) { console.warn(e); }
  load();
})();
