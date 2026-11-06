// Page Admin : nœuds de rendu musique + vidéo (v1.16.0 : capacité musicale, moteur, historique ; état en direct, ajout / retrait, activation, nœud forcé), CT local, PC IA (Ollama).
import { AuroraField } from './aurora.js';
import { initI18n, t, mountLangSwitcher, onLangChange, applyDom } from './i18n.js';
import { apiFetch, refreshAuth } from './csrf.js';
await initI18n();
await refreshAuth();
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function toast(msg, ms = 3200) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (el.hidden = true), ms); }
try { new AuroraField($('#bgCanvas')); } catch {}
async function api(method, url, body) {
  const r = await apiFetch(url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || t('err.generic', { status: r.status })); return d;
}
const STATUS_L = () => ({ up: [t('admin.st.up'), 'up'], down: [t('admin.st.down'), 'down'], disabled: [t('admin.st.off'), 'off'], unknown: [t('admin.st.test'), 'off'] });
const STATUS = new Proxy({}, { get: (_, k) => STATUS_L()[k] });
const PLATFORM = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' };
let V = null, editing = false; const open = new Set();
const KIND = new Proxy({}, { get: (_, k) => ({ audio: t('admin.kind.audio'), video: t('admin.kind.video') })[k] });
const HSTAT = new Proxy({}, { get: (_, k) => ({ done: [t('admin.h.done'), 'ok'], error: [t('admin.h.err'), 'bad'], fallback: [t('admin.h.fb'), 'warn'] })[k] });
const parisTime = (iso) => { try { return new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } };
const dur = (ms) => (ms == null ? '' : ms < 60000 ? `${Math.round(ms / 1000)} s` : `${Math.floor(ms / 60000)} min ${String(Math.round(ms / 1000) % 60).padStart(2, '0')}`);
function histTable(list, showNode = false) {
  if (!list.length) return `<p class="hint">${t('admin.histEmpty')}</p>`;
  return `<table class="hist"><thead><tr><th>${t('admin.histWhen')}</th><th>${t('admin.histType')}</th>${showNode ? `<th>${t('admin.histWhere')}</th>` : ''}<th>${t('admin.histTrack')}</th><th>${t('admin.histResult')}</th><th class="c-dur">${t('admin.histDur')}</th></tr></thead><tbody>${list.map((h) => {
    const [lab, cls] = HSTAT[h.status] || [h.status, ''];
    return `<tr><td>${esc(parisTime(h.at))}</td><td>${esc(KIND[h.kind] || h.kind)}</td>${showNode ? `<td>${esc(h.nodeName || t('admin.ctLocal'))}</td>` : ''}<td>${esc(h.title || '—')}</td><td><span class="hist-st ${cls}">${esc(lab)}</span>${h.note ? `<div class="hint">${esc(h.note)}</div>` : ''}</td><td class="c-dur">${esc(dur(h.ms))}</td></tr>`;
  }).join('')}</tbody></table>`;
}
function audioLine(n) {
  const a = n.audio || {};
  if (a.capable) return `<div class="node-audio ok"><b>Musique : oui</b><span>moteur ${esc(a.engine?.version || '?')} · ${esc(a.engine?.hash || '')}</span><span>${a.samples ? `échantillons synchronisés (${a.samples.files})` : 'échantillons envoyés au 1er rendu'}</span>${a.node ? `<span>Node ${esc(a.node)}</span>` : ''}<span>${a.verified?.ok ? `empreinte vérifiée ${esc(parisTime(a.verified.at))}` : 'empreinte vérifiée au 1er rendu'}</span><span>${a.running ?? 0}/${a.slots ?? 1} en cours</span>${a.audioJobs ? `<span>${a.audioJobs} morceau${a.audioJobs > 1 ? 'x' : ''}</span>` : ''}</div>`;
  return `<div class="node-audio no"><b>Musique : non</b><span>${esc(a.reason || 'indisponible')}</span>${a.engine ? `<span>moteur du PC ${esc(a.engine.version || '?')} · ${esc(a.engine.hash)}</span>` : ''}</div>`;
}

function render(v) {
  V = v;
  const up = v.nodes.filter((n) => n.status === 'up').length;
  $('#statusText').textContent = v.nodes.length ? (v.nodes.length > 1 ? t('admin.nodesOnline_plural', { up, total: v.nodes.length }) : t('admin.nodesOnline', { up, total: v.nodes.length })) : t('admin.ctOnly');
  $('#statusPill').classList.toggle('busy', v.active.length > 0);
  $('#nodesList').innerHTML = v.nodes.length ? v.nodes.map((n) => {
    const [lab, cls] = STATUS[n.status] || STATUS.unknown;
    const details = n.status === 'up'
      ? `<span>${esc(n.encoderLabel || n.encoder)}</span><span>${t('admin.nodeRunning', { n: n.running, slots: n.slots ?? '?' })}</span><span>${n.latency} ms</span>${n.platform ? `<span>${esc(PLATFORM[n.platform] || n.platform)}${n.arch ? ' ' + esc(n.arch) : ''}${n.hostname ? ' · ' + esc(n.hostname) : ''}</span>` : ''}${n.jobs ? `<span>${n.jobs} vidéo${n.jobs > 1 ? 's' : ''}</span>` : ''}`
      : `<span class="node-err">${esc(n.error || (n.status === 'disabled' ? t('admin.nodeIgnored') : ''))}</span>`;
    return `<div class="node-row ${cls}" data-id="${n.id}">
      <span class="node-dot" title="${lab}"></span>
      <div class="node-main"><div class="node-title"><b>${esc(n.name || n.hostname || n.url)}</b>${n.forced ? `<span class="node-tag">${t('admin.nodeForced')}</span>` : ''}${n.hasToken ? '<span class="node-tag">jeton</span>' : ''}</div>
        <div class="node-url">${esc(n.url)} · <span class="node-state">${lab}</span></div>
        <div class="node-meta">${details}</div>${audioLine(n)}
        <div class="node-detail" ${open.has(n.id) ? '' : 'hidden'}><div class="node-detail-head">${t('admin.nodeLastRenders')}</div>${histTable(n.history || [])}</div></div>
      <div class="node-actions">
        <label class="toggle small" title="${t('admin.nodeEnableTitle')}"><input type="checkbox" data-act="enable" ${n.enabled ? 'checked' : ''}> Actif</label>
        <label class="toggle small" title="${t('admin.nodeAudioTitle')}"><input type="checkbox" data-act="audio" ${n.audio?.enabled !== false ? 'checked' : ''}> ${t('admin.music')}</label>
        <button class="btn btn-mini" data-act="detail" type="button">${open.has(n.id) ? t('admin.nodeHide') : t('admin.nodeDetail')}</button>
        <button class="btn btn-mini" data-act="verify" type="button" title="${t('admin.nodeVerifyTitle')}">${t('admin.verify')}</button>
        <button class="btn btn-mini" data-act="rename" type="button">${t('admin.rename')}</button>
        <button class="btn btn-mini btn-danger" data-act="remove" type="button">${t('admin.remove')}</button>
      </div></div>`;
  }).join('') : `<p class="hint nodes-empty">${t('admin.nodesEmpty')}</p>`;
  const sel = $('#forceSel');
  sel.innerHTML = `<option value="">${t('admin.forceAuto')}</option>` + v.nodes.map((n) => `<option value="${esc(n.url)}" ${n.forced ? 'selected' : ''}>${esc(n.name || n.url)}</option>`).join('');
  $('#localSel').value = v.localMode;
  $('#localHint').textContent = t('admin.localSlots', { slots: v.local.slots, running: v.local.running, cpus: v.local.cpus });
  $('#orderHint').textContent = v.forceUrl ? t('admin.orderForced', { url: v.forceUrl }) : v.order.length ? t('admin.orderList', { order: v.order.join(' → ') }) : t('admin.orderCtOnly');
  if (!editing && document.activeElement !== $('#audioMin')) $('#audioMin').value = Math.round(v.audioMinSec / 60);
  $('#ctEngine').textContent = `Moteur du CT : ${v.engine.version} · ${v.engine.hash}`;
  const capable = v.nodes.filter((n) => n.audio?.capable).map((n) => n.name || n.url);
  $('#audioHint').textContent = capable.length ? `Musique sur nœud : ${capable.join(', ')}. Une génération de ${Math.round(v.audioMinSec / 60)} min ou plus y part en priorité (moins chargé, puis le plus rapide mesuré) ; les plus courtes restent sur le CT sauf s’il est saturé.` : t('admin.audioNone');
  $('#histAll').innerHTML = histTable(v.history || [], true);
  $('#activeJobs').innerHTML = v.active.length ? t('admin.activeJobs') +  + v.active.map((a) => `<span class="node-tag">${esc(a.title || 'vidéo')} → ${esc(a.name)} (${esc(a.encoder || '')}) ${Math.round(a.progress * 100)} %</span>`).join(' ') : (v.waiting ? `${v.waiting} vidéo(s) en attente d’un nœud libre` : '');
}
async function load() { if (editing) return; try { render(await api('GET', '/api/admin/nodes')); } catch (e) { $('#statusText').textContent = 'Serveur injoignable'; } }

$('#nodesList').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'INPUT') return;
  const id = b.closest('.node-row').dataset.id, n = V.nodes.find((x) => x.id === id);
  try {
    if (b.dataset.act === 'remove') { if (!confirm(t('confirm.nodeRemove', { name: n.name || n.url }))) return; render(await api('DELETE', `/api/admin/nodes/${id}`)); toast(t('toast.nodeRemoved')); }
    if (b.dataset.act === 'detail') { open.has(id) ? open.delete(id) : open.add(id); render(V); return; }
    if (b.dataset.act === 'verify') { b.disabled = true; toast(t('toast.nodeVerify'), 60000); const r = await fetch(`/api/admin/nodes/${id}/verify`, { method: 'POST' }).then((x) => x.json()); toast(r.ok ? t('toast.nodeIdentical', { ct: r.ct }) : (r.error || t('err.generic', { status: '' })), 8000); load(); return; }
    if (b.dataset.act === 'rename') { const name = prompt('Nom du nœud', n.name || ''); if (name == null) return; render(await api('PATCH', `/api/admin/nodes/${id}`, { name })); }
  } catch (err) { toast(err.message); }
});
$('#nodesList').addEventListener('change', async (e) => {
  const id = e.target.closest('.node-row')?.dataset.id;
  if (e.target.dataset.act === 'audio') { try { render(await api('PATCH', `/api/admin/nodes/${id}`, { audio: e.target.checked })); toast(e.target.checked ? t('toast.nodeAudioOn') : t('toast.nodeAudioOff')); } catch (err) { toast(err.message); } return; }
  if (e.target.dataset.act !== 'enable') return;
  try { render(await api('PATCH', `/api/admin/nodes/${id}`, { enabled: e.target.checked })); toast(e.target.checked ? t('toast.nodeOn') : t('toast.nodeOff')); } catch (err) { toast(err.message); }
});
$('#addBtn').addEventListener('click', async () => {
  const url = $('#nodeUrl').value.trim(); if (!url) return toast(t('toast.needNodeUrl'));
  $('#addBtn').disabled = true; $('#addMsg').textContent = t('common.connecting');
  try {
    const v = await api('POST', '/api/admin/nodes', { url, name: $('#nodeName').value.trim(), token: $('#nodeToken').value.trim() }); render(v);
    const n = v.nodes[v.nodes.length - 1]; $('#addMsg').textContent = n.status === 'up' ? t('admin.addedUpLabel', { label: n.encoderLabel }) : t('admin.addedDownLabel', { label: n.error || '' });
    $('#nodeUrl').value = ''; $('#nodeName').value = ''; $('#nodeToken').value = '';
  } catch (err) { $('#addMsg').textContent = err.message; } finally { $('#addBtn').disabled = false; }
});
$('#refreshBtn').addEventListener('click', async () => { $('#refreshBtn').disabled = true; try { render(await api('POST', '/api/admin/nodes/check')); toast(t('toast.nodesChecked')); } catch (e) { toast(e.message); } finally { $('#refreshBtn').disabled = false; } });
$('#forceSel').addEventListener('change', async (e) => { try { render(await api('PUT', '/api/admin/render', { forceUrl: e.target.value || null })); toast(e.target.value ? t('toast.nodeForced') : t('toast.nodeAuto')); } catch (err) { toast(err.message); } });
$('#forceBtn').addEventListener('click', async () => { const u = $('#forceUrl').value.trim(); if (!u) return toast(t('toast.needAddress')); try { render(await api('PUT', '/api/admin/render', { forceUrl: u })); $('#forceUrl').value = ''; toast(t('toast.nodeForced')); } catch (err) { toast(err.message); } });
$('#audioMin').addEventListener('change', async (e) => { try { render(await api('PUT', '/api/admin/render', { audioMinSec: Math.round(+e.target.value * 60) })); toast(`Seuil : ${e.target.value} min.`); } catch (err) { toast(err.message); } });
$('#localSel').addEventListener('change', async (e) => { try { render(await api('PUT', '/api/admin/render', { localMode: e.target.value })); } catch (err) { toast(err.message); } });
$('#discoverBtn').addEventListener('click', async () => {
  const box = $('#discovered'); box.hidden = false; box.innerHTML = `<p class="hint">${t('admin.discovering')}</p>`;
  try {
    const { found } = await api('POST', '/api/admin/discover');
    box.innerHTML = found.length ? found.map((f) => `<div class="row node-found"><span><b>${esc(f.name)}</b> · ${esc(f.url)} · ${esc(f.encoderLabel || '')}</span>${f.known ? `<span class="hint">${t('common.alreadyAdded')}</span>` : `<button class="btn btn-mini" data-url="${esc(f.url)}" data-name="${esc(f.name)}" type="button">${t('common.add')}</button>`}</div>`).join('')
      : `<p class="hint">${t('admin.discoverNone')}</p>`;
  } catch (e) { box.innerHTML = `<p class="hint">${esc(e.message)}</p>`; }
});
$('#discovered').addEventListener('click', async (e) => { const b = e.target.closest('button[data-url]'); if (!b) return; try { render(await api('POST', '/api/admin/nodes', { url: b.dataset.url, name: b.dataset.name })); b.replaceWith(Object.assign(document.createElement('span'), { className: 'hint', textContent: 'ajouté' })); } catch (err) { toast(err.message); } });

// PC IA (directeur) + modèle veille dédié (v1.19)
function fillModels(listId, models) {
  const dl = $(listId); if (!dl) return;
  dl.innerHTML = (models || []).map((m) => `<option value="${esc(m)}">`).join('');
}
function paintWatch(w) {
  if (!w) return;
  if (document.activeElement !== $('#watchUrl')) $('#watchUrl').value = w.url || '';
  if (document.activeElement !== $('#watchModel')) $('#watchModel').value = w.model || '';
  const note = w.notice || (w.usingDirectorModel ? t('admin.watchFallback') : '');
  $('#watchMsg').textContent = note || (w.effective ? `Effectif : ${w.effective.model || '—'} @ ${w.effective.url || '—'}` : '');
  $('#watchMsg').className = 'hint' + (note ? ' warn' : '');
}
(async () => {
  try {
    const a = await api('GET', '/api/admin/ai');
    $('#aiUrl').value = a.url || ''; $('#aiModel').value = a.model || ''; $('#aiTimeout').value = a.timeout || 120;
    paintWatch(a.watch);
  } catch {}
})();
$('#aiSave').addEventListener('click', async () => {
  try {
    const a = await api('PUT', '/api/admin/ai', {
      url: $('#aiUrl').value.trim(), model: $('#aiModel').value.trim(), timeout: +$('#aiTimeout').value || 120,
      watchUrl: $('#watchUrl').value.trim(), watchModel: $('#watchModel').value.trim(),
    });
    $('#aiModel').value = a.model; paintWatch(a.watch); toast(t('admin.aiSaved'));
  } catch (e) { toast(e.message); }
});
$('#aiTest').addEventListener('click', async () => {
  $('#aiMsg').textContent = 'Test…';
  try {
    const r = await api('POST', '/api/admin/ai/test', { url: $('#aiUrl').value.trim(), model: $('#aiModel').value.trim(), role: 'director' });
    $('#aiMsg').textContent = r.ok ? `${r.message} (${r.latency} ms${r.version ? ', Ollama ' + r.version : ''})` : r.error;
    $('#aiMsg').className = 'hint ' + (r.ok ? (r.hasModel ? 'ok' : 'warn') : 'bad');
    if (r.models) fillModels('#aiModelsList', r.models);
  } catch (e) { $('#aiMsg').textContent = e.message; }
});
$('#watchTest').addEventListener('click', async () => {
  $('#watchMsg').textContent = 'Test…';
  try {
    const r = await api('POST', '/api/admin/ai/test', { url: $('#watchUrl').value.trim(), model: $('#watchModel').value.trim(), role: 'watch' });
    const extra = r.notice ? ' — ' + r.notice : '';
    $('#watchMsg').textContent = r.ok ? `${r.message} (${r.latency} ms)${extra}` : (r.error || '') + extra;
    $('#watchMsg').className = 'hint ' + (r.ok ? (r.hasModel ? 'ok' : 'warn') : 'bad');
    if (r.models) fillModels('#watchModelsList', r.models);
  } catch (e) { $('#watchMsg').textContent = e.message; }
});
for (const el of document.querySelectorAll('input[type=text]')) { el.addEventListener('focus', () => (editing = false)); }
load(); setInterval(load, 4000);

// ---------- v1.9.0 : veille tendances
const TWEAKS_KEY = 'st.advTweaks';
let TR = null, trPoll = 0;
const fmtDate = (s) => (s ? new Date(s).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
function renderTrends({ settings: s, report: r }) {
  TR = { s, r };
  $('#trEvery').value = s.intervalDays; $('#trPer').value = s.perStyle; $('#trOn').checked = s.enabled; $('#trHtml').checked = s.html;
  if ($('#trCrawl')) $('#trCrawl').checked = s.crawl !== false; if ($('#trDiscover')) $('#trDiscover').checked = !!s.discover; if ($('#trPrivate')) $('#trPrivate').checked = !!s.allowPrivateSources;
  if (document.activeElement !== $('#trFeeds')) $('#trFeeds').value = s.feeds || '';
  $('#trKeyDel').hidden = !s.hasKey;
  $('#trKey').placeholder = s.hasKey ? t('admin.trKeyPhHas', { tail: s.keyTail }) : t('admin.trKeyPh');
  $('#trSource').textContent = s.source === 'none' ? t('admin.trSourceNone') : t('admin.trSource', { label: s.sourceLabel });
  $('#trSource').classList.toggle('warn', s.source === 'none');
  $('#trStyles').innerHTML = s.styleIds.map((id) => `<button type="button" class="chip ${s.styles.includes(id) ? 'on' : ''}" data-id="${esc(id)}">${esc(id)}</button>`).join('');
  $('#trMsg').textContent = s.running ? t('admin.trRunning') : t('admin.trLast', { last: fmtDate(s.lastRun), next: s.enabled ? fmtDate(s.nextRun) : t('admin.trNextOff') }) + (s.lastError ? t('admin.trLastErr', { err: s.lastError }) : '');
  $('#trRun').disabled = s.running;
  if (!r) { $('#trReport').innerHTML = `<p class="hint">${s.source === 'none' ? t('admin.trNoReport') : t('admin.trNoReportYet')}</p>`; return; }
  const cards = Object.entries(r.styles || {}).map(([id, x]) => {
    const d = x.digest || {};
    const sug = (x.suggestions || []).map((g, i) => `<li><span>${Object.entries(g.adv || {}).map(([k, v]) => `<code>${esc(k)}=${esc(v)}</code>`).join(' ')}${g.mood ? ` <code>ambiance=${esc(g.mood)}</code>` : ''}${g.why ? ` — ${esc(g.why)}` : ''}</span> <button class="btn btn-mini" type="button" data-apply="${esc(id)}" data-i="${i}">${t('admin.trApply')}</button></li>`).join('');
    return `<article class="tr-card"><h3>${esc(x.label || id)} <span class="hint">${t('admin.trVideos', { n: d.count ?? 0 })}${d.medianDuration ? t('admin.trMedian', { m: Math.round(d.medianDuration / 60) }) : ''}</span></h3>
      ${x.error ? `<p class="warn">${esc(t('admin.trError', { err: x.error }))}</p>` : ''}${x.aiError ? `<p class="warn">${esc(x.aiError)}${esc(t('admin.trAiLocal'))}</p>` : ''}
      <p>${esc(x.summary || '')}</p>${d.topWords?.length ? `<p class="hint">${esc(t('admin.trTopWords', { words: d.topWords.slice(0, 10).join(', ') }))}</p>` : ''}
      ${sug ? `<ul class="tr-sug">${sug}</ul>` : `<p class="hint">${t('admin.trNoSug')}</p>`}${(x.warnings || []).length ? `<p class="hint">${esc(t('admin.trIgnored', { w: x.warnings.join(' · ') }))}</p>` : ''}</article>`;
  }).join('');
  $('#trReport').innerHTML = `<p class="hint">${esc(t('admin.trReportLine', { at: fmtDate(r.at), reason: r.reason, source: r.sourceLabel, analysis: r.analysis }))}</p>${r.source === 'none' ? `<p class="warn">${t('admin.trNoSourceWarn')}</p>` : ''}<div class="tr-grid">${cards}</div>`;
}
async function loadTrends() { try { const v = await api('GET', '/api/admin/trends'); renderTrends(v); paintWatch(v.watchAi); if ($('#trHistory')) {
    const h = v.history || [];
    $('#trHistory').innerHTML = h.length ? (t('admin.trHistory') + h.slice(0, 8).map((x) => `${esc(x.at || x.file)} · ${esc(x.sourceLabel || x.source || '')}${x.errors?.length ? t('admin.trErrCount', { n: x.errors.length }) : ''}`).join(' · ')) : '';
  } } catch (e) { $('#trMsg').textContent = e.message; } }
$('#trFeedsReset')?.addEventListener('click', async () => {
  try { const v = await api('PUT', '/api/admin/trends', { resetFeeds: true }); $('#trFeeds').value = v.feeds || v.settings?.feeds || ''; toast(t('toast.trendsFeedsReset')); loadTrends(); }
  catch (e) { toast(e.message); }
});
$('#trStyles').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) c.classList.toggle('on'); });
$('#trSave').addEventListener('click', async () => {
  const b = { enabled: $('#trOn').checked, intervalDays: +$('#trEvery').value, perStyle: +$('#trPer').value, html: $('#trHtml').checked, crawl: $('#trCrawl')?.checked !== false, discover: !!$('#trDiscover')?.checked, allowPrivateSources: !!$('#trPrivate')?.checked, feeds: $('#trFeeds').value, styles: [...document.querySelectorAll('#trStyles .chip.on')].map((c) => c.dataset.id) };
  if ($('#trKey').value.trim()) b.ytKey = $('#trKey').value.trim();
  try { await api('PUT', '/api/admin/trends', b); $('#trKey').value = ''; toast(t('toast.trendsSaved')); loadTrends(); } catch (e) { toast(e.message); }
});
$('#trKeyDel').addEventListener('click', () => { if (confirm(t('confirm.trendsKeyDel'))) api('PUT', '/api/admin/trends', { ytKey: '' }).then(loadTrends).catch((e) => toast(e.message)); });
$('#trRun').addEventListener('click', async () => {
  try { await api('POST', '/api/admin/trends/run'); toast(t('toast.trendsRun')); $('#trRun').disabled = true; clearInterval(trPoll);
    trPoll = setInterval(async () => { const v = await api('GET', '/api/admin/trends').catch(() => null); if (v) renderTrends(v); if (v && !v.settings.running) clearInterval(trPoll); }, 2000);
  } catch (e) { toast(e.message, 5000); }
});
$('#trReport').addEventListener('click', (e) => {
  const b = e.target.closest('[data-apply]'); if (!b || !TR?.r) return;
  const id = b.dataset.apply, g = TR.r.styles?.[id]?.suggestions?.[+b.dataset.i]; if (!g) return;
  let all = {}; try { all = JSON.parse(localStorage.getItem(TWEAKS_KEY) || '{}') || {}; } catch { all = {}; }
  all[id] = { ...(all[id] || {}), ...g.adv };
  localStorage.setItem(TWEAKS_KEY, JSON.stringify(all));
  b.textContent = t('admin.applied'); b.disabled = true;
  toast(t('toast.trendsApplied', { label: TR.r.styles[id].label || id, mood: g.mood ? t('toast.trendsMood', { mood: g.mood }) : '' }), 6000);
});
loadTrends();


mountLangSwitcher(document.querySelector('.topbar'));
applyDom(document);
onLangChange(() => { applyDom(document); try { render(); } catch {} });

async function showVersion() {
  const el = document.getElementById('appVersion');
  if (!el) return;
  try {
    const h = await api('GET', '/api/health');
    el.textContent = 'v' + (h.version || '?');
  } catch {
    el.textContent = 'v?';
  }
}
showVersion();
