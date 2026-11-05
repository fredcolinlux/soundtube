// v1.15.0 : Admin › Contexte du directeur artistique — interrupteurs, profil de goût, dernière veille, aperçu du prompt (diff) et test Ollama.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toast = (m) => { const t = $('#toast'); if (!t) return; t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3500); };
async function api(method, url, body) {
  const r = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || `Erreur ${r.status}`); return d;
}
const n = (x) => Number(x || 0).toLocaleString('fr-FR');
const tok = (c) => Math.ceil(c / 3.5);
let V = null;
function render(v) {
  V = v; const s = v.settings, p = v.profile;
  $('#dirTaste').checked = s.taste; $('#dirTrends').checked = s.trends;
  $('#dirState').textContent = `${s.taste ? 'goût : activé' : 'goût : coupé'} · ${s.trends ? 'veille : activée' : 'veille : coupée'}`;
  $('#dirProfMeta').textContent = p ? `${p.source} · ${n(p.stats.tracks)} pistes · ${n(p.stats.plays)} écoutes · distillé le ${p.builtAt}${s.edited ? ' · références modifiées' : ''}` : 'profil absent (contexte/gout.json)';
  $('#dirProfile').innerHTML = p ? `<div><b>Artistes les plus écoutés</b><ol>${p.topArtists.slice(0, 10).map((a) => `<li>${esc(a.name)} <span class="hint">${n(a.plays)}</span></li>`).join('')}</ol></div>
    <div><b>Genres</b><ol>${p.topGenres.slice(0, 8).map((g) => `<li>${esc(g.name)} <span class="hint">${n(g.plays)} · ${String(g.share).replace('.', ',')} %</span></li>`).join('')}</ol></div>` : '';
  if (document.activeElement !== $('#dirRefs')) $('#dirRefs').value = v.refsText || '';
  $('#dirTasteText').textContent = v.taste || '—'; $('#dirTasteMeta').textContent = `${v.style} · ${n(v.taste.length)} / ${n(v.budget.taste)} caractères · ~${tok(v.taste.length)} jetons${s.taste ? '' : ' · coupé : non envoyé'}`;
  $('#dirTrText').textContent = v.trends?.text || 'Aucun rapport de veille : rien n’est ajouté.';
  $('#dirTrMeta').textContent = v.trends ? `rapport du ${v.trends.date} · ${n(v.trends.text.length)} / ${n(v.budget.trends)} caractères · ~${tok(v.trends.text.length)} jetons${s.trends ? '' : ' · coupé : non envoyé'}` : '';
  $('#dirTrText').classList.toggle('muted', !v.trends);
}
async function load() { try { render(await api('GET', '/api/admin/director')); } catch (e) { $('#dirMsg').textContent = e.message; } }
async function put(b, msg) { try { render(await api('PUT', '/api/admin/director', b)); if (msg) toast(msg); } catch (e) { toast(e.message); $('#dirMsg').textContent = e.message; } }
$('#dirTaste').addEventListener('change', (e) => put({ taste: e.target.checked }, e.target.checked ? 'Profil de goût activé.' : 'Profil de goût coupé.'));
$('#dirTrends').addEventListener('change', (e) => put({ trends: e.target.checked }, e.target.checked ? 'Veille activée dans le prompt.' : 'Veille coupée du prompt.'));
$('#dirSave').addEventListener('click', () => { $('#dirMsg').textContent = ''; put({ refsText: $('#dirRefs').value }, 'Références enregistrées.'); });
$('#dirReset').addEventListener('click', () => { if (confirm('Revenir aux artistes de référence du profil livré ?')) { $('#dirRefs').blur(); put({ reset: true }, 'Profil livré rétabli.'); } });

function diffHTML(d) {
  const out = []; let i = 0;
  while (i < d.length) {
    if (d[i].op !== '=') { out.push(`<div class="dl ${d[i].op === '+' ? 'add' : 'del'}"><span>${d[i].op}</span>${esc(d[i].t) || '&nbsp;'}</div>`); i++; continue; }
    let j = i; while (j < d.length && d[j].op === '=') j++;
    const run = d.slice(i, j), keep = 2;
    if (run.length > keep * 2 + 1) { const head = i === 0 ? [] : run.slice(0, keep), tail = j === d.length ? [] : run.slice(-keep);
      for (const x of head) out.push(`<div class="dl"><span> </span>${esc(x.t) || '&nbsp;'}</div>`);
      out.push(`<div class="dl gap">… ${run.length - head.length - tail.length} lignes identiques à la v1.14 …</div>`);
      for (const x of tail) out.push(`<div class="dl"><span> </span>${esc(x.t) || '&nbsp;'}</div>`); }
    else for (const x of run) out.push(`<div class="dl"><span> </span>${esc(x.t) || '&nbsp;'}</div>`);
    i = j;
  }
  return out.join('');
}
async function preview(run) {
  const b = { style: $('#dirStyle').value, prompt: $('#dirPrompt').value, run };
  $('#dirDiff').innerHTML = `<p class="hint">${run ? 'Appel du PC IA…' : 'Calcul…'}</p>`;
  try {
    const r = await api('POST', '/api/admin/director/preview', b), S = r.sources;
    const res = r.result ? (r.result.ok ? `<div class="dir-res ok"><b>Réponse de ${esc(r.result.model)}</b> (${n(r.result.ms)} ms) : style <code>${esc(r.result.params.style)}</code>, ambiance <code>${esc(r.result.params.mood)}</code>${r.result.meta ? ` · titre « ${esc(r.result.meta.title_fr)} » · tags ${esc((r.result.meta.tags || []).join(', '))}` : ''}<br>${esc(r.result.explanation)}</div>` : `<div class="dir-res bad">${esc(r.result.error)}</div>`) : '';
    $('#dirDiff').innerHTML = `${res}<p class="hint dir-sizes">Prompt v1.14 : <b>${n(r.base.total)}</b> caractères (~${n(r.base.tokens)} jetons) → envoyé : <b>${n(r.sent.total)}</b> caractères (~${n(r.sent.tokens)} jetons) sur num_ctx ${n(r.numCtx)} · goût ${n(S.taste)} car. (~${n(S.tasteTokens)} j.) · veille ${n(S.trends)} car. (~${n(S.trendsTokens)} j.)${S.trendsDate ? ` du ${S.trendsDate}` : ''}</p>
      <h4>Message système</h4><div class="diff">${diffHTML(r.diff.system)}</div><h4>Message utilisateur</h4><div class="diff">${diffHTML(r.diff.user)}</div>`;
  } catch (e) { $('#dirDiff').innerHTML = `<p class="warn">${esc(e.message)}</p>`; }
}
$('#dirPreview').addEventListener('click', () => preview(false));
$('#dirRun').addEventListener('click', () => preview(true));
$('#dirStyle').addEventListener('change', async () => { try { render(await api('GET', `/api/admin/director?style=${encodeURIComponent($('#dirStyle').value)}`)); } catch {} });
(async () => {
  try { const { styles } = await api('GET', '/api/styles'); $('#dirStyle').innerHTML = styles.map((s) => `<option value="${esc(s.id)}" ${s.id === 'frenchtouch' ? 'selected' : ''}>${esc(s.label)}</option>`).join(''); } catch {}
  load();
})();
