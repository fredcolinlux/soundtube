// Page Admin : nœuds de rendu musique + vidéo (v1.16.0 : capacité musicale, moteur, historique ; état en direct, ajout / retrait, activation, nœud forcé), CT local, PC IA (Ollama).
import { AuroraField } from './aurora.js';
import { initI18n, t, mountLangSwitcher, onLangChange, applyDom } from './i18n.js';
await initI18n();
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function toast(msg, ms = 3200) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (el.hidden = true), ms); }
try { new AuroraField($('#bgCanvas')); } catch {}
async function api(method, url, body) {
  const r = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
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
  if (!list.length) return '<p class="hint">Aucun rendu pour l’instant.</p>';
  return `<table class="hist"><thead><tr><th>Quand (Paris)</th><th>Type</th>${showNode ? '<th>Où</th>' : ''}<th>Morceau</th><th>Résultat</th><th class="c-dur">Durée</th></tr></thead><tbody>${list.map((h) => {
    const [lab, cls] = HSTAT[h.status] || [h.status, ''];
    return `<tr><td>${esc(parisTime(h.at))}</td><td>${esc(KIND[h.kind] || h.kind)}</td>${showNode ? `<td>${esc(h.nodeName || 'CT (local)')}</td>` : ''}<td>${esc(h.title || '—')}</td><td><span class="hist-st ${cls}">${esc(lab)}</span>${h.note ? `<div class="hint">${esc(h.note)}</div>` : ''}</td><td class="c-dur">${esc(dur(h.ms))}</td></tr>`;
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
  $('#statusText').textContent = v.nodes.length ? `${up}/${v.nodes.length} nœud${v.nodes.length > 1 ? 's' : ''} en ligne` : 'CT seul';
  $('#statusPill').classList.toggle('busy', v.active.length > 0);
  $('#nodesList').innerHTML = v.nodes.length ? v.nodes.map((n) => {
    const [lab, cls] = STATUS[n.status] || STATUS.unknown;
    const details = n.status === 'up'
      ? `<span>${esc(n.encoderLabel || n.encoder)}</span><span>${n.running}/${n.slots ?? '?'} en cours</span><span>${n.latency} ms</span>${n.platform ? `<span>${esc(PLATFORM[n.platform] || n.platform)}${n.arch ? ' ' + esc(n.arch) : ''}${n.hostname ? ' · ' + esc(n.hostname) : ''}</span>` : ''}${n.jobs ? `<span>${n.jobs} vidéo${n.jobs > 1 ? 's' : ''}</span>` : ''}`
      : `<span class="node-err">${esc(n.error || (n.status === 'disabled' ? 'Ignoré pour les rendus' : ''))}</span>`;
    return `<div class="node-row ${cls}" data-id="${n.id}">
      <span class="node-dot" title="${lab}"></span>
      <div class="node-main"><div class="node-title"><b>${esc(n.name || n.hostname || n.url)}</b>${n.forced ? '<span class="node-tag">forcé</span>' : ''}${n.hasToken ? '<span class="node-tag">jeton</span>' : ''}</div>
        <div class="node-url">${esc(n.url)} · <span class="node-state">${lab}</span></div>
        <div class="node-meta">${details}</div>${audioLine(n)}
        <div class="node-detail" ${open.has(n.id) ? '' : 'hidden'}><div class="node-detail-head">Derniers rendus sur ce nœud</div>${histTable(n.history || [])}</div></div>
      <div class="node-actions">
        <label class="toggle small" title="Utiliser ce nœud pour les rendus"><input type="checkbox" data-act="enable" ${n.enabled ? 'checked' : ''}> Actif</label>
        <label class="toggle small" title="Autoriser le rendu de la musique sur ce nœud"><input type="checkbox" data-act="audio" ${n.audio?.enabled !== false ? 'checked' : ''}> Musique</label>
        <button class="btn btn-mini" data-act="detail" type="button">${open.has(n.id) ? 'Masquer' : 'Détail'}</button>
        <button class="btn btn-mini" data-act="verify" type="button" title="Rend un morceau de référence de 20 s sur le CT et sur le PC et compare les WAV">Vérifier</button>
        <button class="btn btn-mini" data-act="rename" type="button">Renommer</button>
        <button class="btn btn-mini btn-danger" data-act="remove" type="button">Retirer</button>
      </div></div>`;
  }).join('') : '<p class="hint nodes-empty">Aucun nœud : les vidéos sont rendues sur le CT (libx264). Lance l’agent sur le PC Windows ou le Mac mini puis ajoute son adresse ci-dessous (ex. http://192.168.1.50:8765).</p>';
  const sel = $('#forceSel');
  sel.innerHTML = '<option value="">Automatique (meilleur nœud libre)</option>' + v.nodes.map((n) => `<option value="${esc(n.url)}" ${n.forced ? 'selected' : ''}>${esc(n.name || n.url)}</option>`).join('');
  $('#localSel').value = v.localMode;
  $('#localHint').textContent = `Rendus simultanés sur le CT : ${v.local.slots} (en cours : ${v.local.running}, ${v.local.cpus} cœurs).`;
  $('#orderHint').textContent = v.forceUrl ? `Nœud forcé : ${v.forceUrl}` : v.order.length ? `Ordre actuel : ${v.order.join(' → ')} → CT` : 'Ordre actuel : CT seul';
  if (!editing && document.activeElement !== $('#audioMin')) $('#audioMin').value = Math.round(v.audioMinSec / 60);
  $('#ctEngine').textContent = `Moteur du CT : ${v.engine.version} · ${v.engine.hash}`;
  const capable = v.nodes.filter((n) => n.audio?.capable).map((n) => n.name || n.url);
  $('#audioHint').textContent = capable.length ? `Musique sur nœud : ${capable.join(', ')}. Une génération de ${Math.round(v.audioMinSec / 60)} min ou plus y part en priorité (moins chargé, puis le plus rapide mesuré) ; les plus courtes restent sur le CT sauf s’il est saturé.` : 'Aucun nœud ne peut rendre la musique pour l’instant : tout est rendu sur le CT.';
  $('#histAll').innerHTML = histTable(v.history || [], true);
  $('#activeJobs').innerHTML = v.active.length ? 'En cours : ' + v.active.map((a) => `<span class="node-tag">${esc(a.title || 'vidéo')} → ${esc(a.name)} (${esc(a.encoder || '')}) ${Math.round(a.progress * 100)} %</span>`).join(' ') : (v.waiting ? `${v.waiting} vidéo(s) en attente d’un nœud libre` : '');
}
async function load() { if (editing) return; try { render(await api('GET', '/api/admin/nodes')); } catch (e) { $('#statusText').textContent = 'Serveur injoignable'; } }

$('#nodesList').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'INPUT') return;
  const id = b.closest('.node-row').dataset.id, n = V.nodes.find((x) => x.id === id);
  try {
    if (b.dataset.act === 'remove') { if (!confirm(`Retirer le nœud ${n.name || n.url} ?`)) return; render(await api('DELETE', `/api/admin/nodes/${id}`)); toast('Nœud retiré.'); }
    if (b.dataset.act === 'detail') { open.has(id) ? open.delete(id) : open.add(id); render(V); return; }
    if (b.dataset.act === 'verify') { b.disabled = true; toast('Vérification : rendu de référence sur le CT et sur le PC…', 60000); const r = await fetch(`/api/admin/nodes/${id}/verify`, { method: 'POST' }).then((x) => x.json()); toast(r.ok ? `Identique au bit près (WAV ${r.ct}…).` : `Écart : ${r.error}`, 8000); load(); return; }
    if (b.dataset.act === 'rename') { const name = prompt('Nom du nœud', n.name || ''); if (name == null) return; render(await api('PATCH', `/api/admin/nodes/${id}`, { name })); }
  } catch (err) { toast(err.message); }
});
$('#nodesList').addEventListener('change', async (e) => {
  const id = e.target.closest('.node-row')?.dataset.id;
  if (e.target.dataset.act === 'audio') { try { render(await api('PATCH', `/api/admin/nodes/${id}`, { audio: e.target.checked })); toast(e.target.checked ? 'Musique autorisée sur ce nœud.' : 'Musique désactivée sur ce nœud : vidéo seulement.'); } catch (err) { toast(err.message); } return; }
  if (e.target.dataset.act !== 'enable') return;
  try { render(await api('PATCH', `/api/admin/nodes/${id}`, { enabled: e.target.checked })); toast(e.target.checked ? 'Nœud activé.' : 'Nœud désactivé.'); } catch (err) { toast(err.message); }
});
$('#addBtn').addEventListener('click', async () => {
  const url = $('#nodeUrl').value.trim(); if (!url) return toast(t('toast.needNodeUrl'));
  $('#addBtn').disabled = true; $('#addMsg').textContent = 'Connexion…';
  try {
    const v = await api('POST', '/api/admin/nodes', { url, name: $('#nodeName').value.trim(), token: $('#nodeToken').value.trim() }); render(v);
    const n = v.nodes[v.nodes.length - 1]; $('#addMsg').textContent = n.status === 'up' ? `Ajouté : ${n.encoderLabel}` : `Ajouté, mais hors ligne : ${n.error || ''}`;
    $('#nodeUrl').value = ''; $('#nodeName').value = ''; $('#nodeToken').value = '';
  } catch (err) { $('#addMsg').textContent = err.message; } finally { $('#addBtn').disabled = false; }
});
$('#refreshBtn').addEventListener('click', async () => { $('#refreshBtn').disabled = true; try { render(await api('POST', '/api/admin/nodes/check')); toast('Nœuds testés.'); } catch (e) { toast(e.message); } finally { $('#refreshBtn').disabled = false; } });
$('#forceSel').addEventListener('change', async (e) => { try { render(await api('PUT', '/api/admin/render', { forceUrl: e.target.value || null })); toast(e.target.value ? 'Nœud forcé.' : 'Répartition automatique.'); } catch (err) { toast(err.message); } });
$('#forceBtn').addEventListener('click', async () => { const u = $('#forceUrl').value.trim(); if (!u) return toast('Indique une adresse.'); try { render(await api('PUT', '/api/admin/render', { forceUrl: u })); $('#forceUrl').value = ''; toast('Nœud forcé.'); } catch (err) { toast(err.message); } });
$('#audioMin').addEventListener('change', async (e) => { try { render(await api('PUT', '/api/admin/render', { audioMinSec: Math.round(+e.target.value * 60) })); toast(`Seuil : ${e.target.value} min.`); } catch (err) { toast(err.message); } });
$('#localSel').addEventListener('change', async (e) => { try { render(await api('PUT', '/api/admin/render', { localMode: e.target.value })); } catch (err) { toast(err.message); } });
$('#discoverBtn').addEventListener('click', async () => {
  const box = $('#discovered'); box.hidden = false; box.innerHTML = '<p class="hint">Recherche des agents sur le réseau local…</p>';
  try {
    const { found } = await api('POST', '/api/admin/discover');
    box.innerHTML = found.length ? found.map((f) => `<div class="row node-found"><span><b>${esc(f.name)}</b> · ${esc(f.url)} · ${esc(f.encoderLabel || '')}</span>${f.known ? '<span class="hint">déjà ajouté</span>' : `<button class="btn btn-mini" data-url="${esc(f.url)}" data-name="${esc(f.name)}" type="button">Ajouter</button>`}</div>`).join('')
      : '<p class="hint">Aucun agent trouvé (diffusion UDP 47811 bloquée par le pare-feu ?). Ajoute l’adresse à la main.</p>';
  } catch (e) { box.innerHTML = `<p class="hint">${esc(e.message)}</p>`; }
});
$('#discovered').addEventListener('click', async (e) => { const b = e.target.closest('button[data-url]'); if (!b) return; try { render(await api('POST', '/api/admin/nodes', { url: b.dataset.url, name: b.dataset.name })); b.replaceWith(Object.assign(document.createElement('span'), { className: 'hint', textContent: 'ajouté' })); } catch (err) { toast(err.message); } });

// PC IA
(async () => { try { const a = await api('GET', '/api/admin/ai'); $('#aiUrl').value = a.url || ''; $('#aiModel').value = a.model || ''; $('#aiTimeout').value = a.timeout || 120; } catch {} })();
$('#aiSave').addEventListener('click', async () => { try { const a = await api('PUT', '/api/admin/ai', { url: $('#aiUrl').value.trim(), model: $('#aiModel').value.trim(), timeout: +$('#aiTimeout').value || 120 }); $('#aiModel').value = a.model; toast('Réglages IA enregistrés.'); } catch (e) { toast(e.message); } });
$('#aiTest').addEventListener('click', async () => {
  $('#aiMsg').textContent = 'Test…';
  try { const r = await api('POST', '/api/admin/ai/test', { url: $('#aiUrl').value.trim(), model: $('#aiModel').value.trim() }); $('#aiMsg').textContent = r.ok ? `${r.message} (${r.latency} ms${r.version ? ', Ollama ' + r.version : ''})` : r.error; $('#aiMsg').className = 'hint ' + (r.ok ? (r.hasModel ? 'ok' : 'warn') : 'bad'); }
  catch (e) { $('#aiMsg').textContent = e.message; }
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
  if (document.activeElement !== $('#trFeeds')) $('#trFeeds').value = s.feeds || '';
  $('#trKeyDel').hidden = !s.hasKey;
  $('#trKey').placeholder = s.hasKey ? `clé enregistrée (…${s.keyTail}) — vide = garder` : 'AIza…';
  $('#trSource').textContent = s.source === 'none' ? 'aucune source configurée' : `source : ${s.sourceLabel}`;
  $('#trSource').classList.toggle('warn', s.source === 'none');
  $('#trStyles').innerHTML = s.styleIds.map((id) => `<button type="button" class="chip ${s.styles.includes(id) ? 'on' : ''}" data-id="${esc(id)}">${esc(id)}</button>`).join('');
  $('#trMsg').textContent = s.running ? 'Veille en cours…' : `Dernière : ${fmtDate(s.lastRun)} · prochaine : ${s.enabled ? fmtDate(s.nextRun) : 'désactivée'}${s.lastError ? ' · erreur : ' + s.lastError : ''}`;
  $('#trRun').disabled = s.running;
  if (!r) { $('#trReport').innerHTML = `<p class="hint">${s.source === 'none' ? 'Aucune source : renseigne une clé YouTube Data API, des flux RSS ou active la recherche YouTube publique, puis « Lancer maintenant ».' : 'Pas encore de rapport.'}</p>`; return; }
  const cards = Object.entries(r.styles || {}).map(([id, x]) => {
    const d = x.digest || {};
    const sug = (x.suggestions || []).map((g, i) => `<li><span>${Object.entries(g.adv || {}).map(([k, v]) => `<code>${esc(k)}=${esc(v)}</code>`).join(' ')}${g.mood ? ` <code>ambiance=${esc(g.mood)}</code>` : ''}${g.why ? ` — ${esc(g.why)}` : ''}</span> <button class="btn btn-mini" type="button" data-apply="${esc(id)}" data-i="${i}">Appliquer</button></li>`).join('');
    return `<article class="tr-card"><h3>${esc(x.label || id)} <span class="hint">${d.count ?? 0} vidéos${d.medianDuration ? ` · médiane ${Math.round(d.medianDuration / 60)} min` : ''}</span></h3>
      ${x.error ? `<p class="warn">Erreur : ${esc(x.error)}</p>` : ''}${x.aiError ? `<p class="warn">${esc(x.aiError)} — analyse locale</p>` : ''}
      <p>${esc(x.summary || '')}</p>${d.topWords?.length ? `<p class="hint">Mots fréquents : ${esc(d.topWords.slice(0, 10).join(', '))}</p>` : ''}
      ${sug ? `<ul class="tr-sug">${sug}</ul>` : '<p class="hint">Pas de retouche proposée.</p>'}${(x.warnings || []).length ? `<p class="hint">Ignoré : ${esc(x.warnings.join(' · '))}</p>` : ''}</article>`;
  }).join('');
  $('#trReport').innerHTML = `<p class="hint">Rapport du ${fmtDate(r.at)} (${esc(r.reason)}) · source : ${esc(r.sourceLabel)} · analyse : ${esc(r.analysis)}</p>${r.source === 'none' ? '<p class="warn">Aucune source : rien n’a été analysé.</p>' : ''}<div class="tr-grid">${cards}</div>`;
}
async function loadTrends() { try { renderTrends(await api('GET', '/api/admin/trends')); } catch (e) { $('#trMsg').textContent = e.message; } }
$('#trStyles').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) c.classList.toggle('on'); });
$('#trSave').addEventListener('click', async () => {
  const b = { enabled: $('#trOn').checked, intervalDays: +$('#trEvery').value, perStyle: +$('#trPer').value, html: $('#trHtml').checked, feeds: $('#trFeeds').value, styles: [...document.querySelectorAll('#trStyles .chip.on')].map((c) => c.dataset.id) };
  if ($('#trKey').value.trim()) b.ytKey = $('#trKey').value.trim();
  try { await api('PUT', '/api/admin/trends', b); $('#trKey').value = ''; toast('Veille enregistrée.'); loadTrends(); } catch (e) { toast(e.message); }
});
$('#trKeyDel').addEventListener('click', () => { if (confirm('Effacer la clé YouTube enregistrée ?')) api('PUT', '/api/admin/trends', { ytKey: '' }).then(loadTrends).catch((e) => toast(e.message)); });
$('#trRun').addEventListener('click', async () => {
  try { await api('POST', '/api/admin/trends/run'); toast('Veille lancée.'); $('#trRun').disabled = true; clearInterval(trPoll);
    trPoll = setInterval(async () => { const v = await api('GET', '/api/admin/trends').catch(() => null); if (v) renderTrends(v); if (v && !v.settings.running) clearInterval(trPoll); }, 2000);
  } catch (e) { toast(e.message, 5000); }
});
$('#trReport').addEventListener('click', (e) => {
  const b = e.target.closest('[data-apply]'); if (!b || !TR?.r) return;
  const id = b.dataset.apply, g = TR.r.styles?.[id]?.suggestions?.[+b.dataset.i]; if (!g) return;
  let all = {}; try { all = JSON.parse(localStorage.getItem(TWEAKS_KEY) || '{}') || {}; } catch { all = {}; }
  all[id] = { ...(all[id] || {}), ...g.adv };
  localStorage.setItem(TWEAKS_KEY, JSON.stringify(all));
  b.textContent = 'Appliqué ✓'; b.disabled = true;
  toast(`Retouches enregistrées pour ${TR.r.styles[id].label || id} : elles apparaissent en vert dans « Avancé » (page Générer).${g.mood ? ` Ambiance conseillée : ${g.mood}.` : ''}`, 6000);
});
loadTrends();


mountLangSwitcher(document.querySelector('.topbar'));
applyDom(document);
onLangChange(() => { applyDom(document); try { render(); } catch {} });
