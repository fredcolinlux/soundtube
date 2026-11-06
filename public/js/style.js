// v1.10.0+ : page d'un style — démo anonyme 15 s (v1.20.3) ou génération complète si connecté.
import { $, $$, api, esc, fmt, bootSite, mountBackground, reveal, MiniPlayer, trackRowHtml, colorOf, color2Of, STYLE_WORDS, t, refreshAuth, getAuthUser, onLangChange } from './site.js?v=1.20.5';

const id = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] || '');
await bootSite('/styles/' + id);
await refreshAuth();
const isDemo = !getAuthUser();
if (isDemo) document.body.classList.add('demo-mode');

const field = mountBackground(id);
const player = new MiniPlayer(field);
const S = { style: null, opt: null, variant: '', mood: 'auto', amb: null, ambLevel: null, duration: isDemo ? 15 : 180, ai: null, tracks: [], total: 0, job: null, labels: { key: {}, mood: {} }, demo: isDemo };
const DURS = isDemo ? [[15, t('style.demoOnly')]] : [[60, '1 min'], [180, '3 min'], [300, '5 min'], [600, '10 min'], [1800, '30 min'], [3600, '1 h']];
const TWEAKS_KEY = 'st.advTweaks';
const tweaks = () => { try { const t0 = JSON.parse(localStorage.getItem(TWEAKS_KEY) || '{}')?.[id]; return t0 && typeof t0 === 'object' ? t0 : {}; } catch { return {}; } };

function chips(el, list, cur, attr) {
  el.innerHTML = list.map(([v, l]) => `<button type="button" class="chip${v === cur ? ' on' : ''}" data-${attr}="${esc(v)}" aria-pressed="${v === cur}">${esc(l)}</button>`).join('');
}
function renderPreset() {
  const s = S.style, o = S.opt;
  if (s.variants) { $('#pVarField').hidden = false; chips($('#pVar'), [['', 'Au choix de la graine'], ...Object.entries(s.variants.options).map(([k, l]) => [k, l.split(' (')[0]])], S.variant, 'var'); }
  chips($('#pMood'), [['auto', 'Auto'], ...o.moods.filter((m) => m.id !== 'auto').map((m) => [m.id, m.label])], S.mood, 'mood');
  const T = tweaks(); if (S.amb === null) S.amb = T.ambience || 'auto'; if (S.ambLevel === null) S.ambLevel = T.ambienceLevel ?? 50;
  const ambOpts = o.advanced?.ambience?.options || {}, defAmb = S.mood !== 'auto' ? o.moods.find((m) => m.id === S.mood)?.ambience : null;
  chips($('#pAmb'), [['auto', defAmb ? `Auto · ${ambOpts[defAmb] || defAmb}` : 'Auto'], ...Object.entries(ambOpts).map(([k, l]) => [k, l.split(' (')[0]])], S.amb, 'amb');
  const eff = S.amb === 'auto' ? defAmb : S.amb;
  $('#pAmbVolRow').hidden = !eff || eff === 'none';
  $('#pAmbVol').value = S.ambLevel; $('#pAmbVolVal').textContent = S.ambLevel;
  const max = S.demo ? 15 : (o.limits?.maxDuration || 14400);
  chips($('#pDur'), DURS.filter(([d]) => d <= max), S.duration, 'dur');
  if (S.demo) {
    $('#pTweaks').textContent = '';
    $('#pGo').textContent = t('style.demoGenerate');
    const ban = $('#demoBanner'); if (ban) { ban.hidden = false; }
    const cta = $('#demoLoginCta'); if (cta) cta.href = '/login?next=' + encodeURIComponent(location.pathname);
  } else {
    const n = Object.keys(tweaks()).length;
    $('#pTweaks').textContent = n ? t(n > 1 ? 'style.tweaks_plural' : 'style.tweaks', { n }) : t('style.tweaksNone');
    $('#openStudio').href = `/studio?style=${encodeURIComponent(id)}#settings`;
  }
}
$('#preset').addEventListener('click', (e) => {
  const b = e.target.closest('.chip'); if (!b) return;
  if (b.dataset.var !== undefined) S.variant = b.dataset.var;
  if (b.dataset.mood !== undefined) S.mood = b.dataset.mood;
  if (b.dataset.amb !== undefined) S.amb = b.dataset.amb;
  if (b.dataset.dur !== undefined && !S.demo) S.duration = +b.dataset.dur;
  renderPreset();
});

$('#pAmbVol').addEventListener('input', (e) => { S.ambLevel = +e.target.value; $('#pAmbVolVal').textContent = e.target.value; });

$('#pAsk')?.addEventListener('click', async () => {
  if (S.demo) return;
  const prompt = $('#pIdea').value.trim(), out = $('#pAiOut'); out.hidden = false;
  if (prompt.length < 3) { out.textContent = t('toast.aiNeedPrompt'); return; }
  $('#pAsk').disabled = true; out.textContent = t('toast.aiThinking');
  try {
    const r = await api('/api/ai/suggest', { method: 'POST', body: JSON.stringify({ prompt, style: id, duration: S.duration }) });
    const p = r.params || {}; const same = p.style === id;
    S.ai = same ? p : { mood: p.mood };
    if (p.mood && S.opt.moods.some((m) => m.id === p.mood)) S.mood = p.mood;
    const vk = S.style.variants?.key; if (same && vk && p.adv?.[vk]) S.variant = p.adv[vk];
    renderPreset();
    const src = r.source === 'ai' ? 'IA' : 'proposition locale';
    out.innerHTML = `<b>${esc(src)}</b> · ${esc(r.explanation || '')}${same ? '' : ` <span class="warn">(l’IA proposait un autre style : seule l’ambiance est reprise — <a href="/?style=${encodeURIComponent(p.style || '')}">ouvrir le studio</a>)</span>`}${r.error ? ` <span class="warn">${esc(r.error)}</span>` : ''}`;
  } catch (e) { out.textContent = e.message; } finally { $('#pAsk').disabled = false; }
});

$('#pGo').addEventListener('click', async () => {
  const adv = { ...tweaks(), ...(S.ai?.adv || {}) }; const vk = S.style.variants?.key;
  if (vk && S.variant) adv[vk] = S.variant;
  if (S.amb && S.amb !== 'auto') adv.ambience = S.amb; else if (S.amb === 'auto' && !S.ai?.adv?.ambience) delete adv.ambience;
  if (S.ambLevel != null && S.ambLevel !== 50) adv.ambienceLevel = S.ambLevel; else delete adv.ambienceLevel;
  const body = { style: id, mood: S.mood, duration: S.demo ? 15 : S.duration, adv, engine: S.opt.engine || 21, wav: S.opt.wavDefault !== false };
  if (!S.demo) {
    if (S.ai?.key) body.key = S.ai.key; if (S.ai?.scale) body.scale = S.ai.scale; if (S.ai?.bpm) body.bpm = S.ai.bpm;
    if (S.duration > 3600 && !confirm(t('style.longConfirm', { dur: fmt(S.duration) }))) return;
  }
  $('#pGo').disabled = true;
  try {
    const url = S.demo ? '/api/demo/generate' : '/api/generate';
    const j = await api(url, { method: 'POST', body: JSON.stringify(body) });
    S.job = j.id; poll();
  } catch (e) { $('#pJob').hidden = false; $('#pStage').textContent = e.message; $('#pGo').disabled = false; }
});
async function poll() {
  $('#pJob').hidden = false;
  try {
    const j = await api((S.demo ? '/api/demo/jobs/' : '/api/jobs/') + S.job);
    $('#pBar').style.width = Math.round((j.progress || 0) * 100) + '%';
    if (S.demo) {
      $('#pStage').textContent = j.status === 'queued' ? `${t('style.demoQueued')}${j.queue_position ? ' (' + j.queue_position + ')' : ''}`
        : j.status === 'done' ? t('style.demoReady', { title: j.title })
        : j.status === 'error' ? t('style.err') + (j.error || '')
        : `${j.stage || '…'} · ${Math.round((j.progress || 0) * 100)} %`;
      if (j.status === 'done') {
        $('#pGo').disabled = false;
        const url = j.urls?.audio;
        if (url) player.play({ id: j.id, title: j.title, style: id, urls: { mp3: url }, duration: 15 });
        return;
      }
    } else {
      $('#pStage').textContent = j.status === 'queued' ? `${t('style.queued')}${j.queue_position ? ' (' + j.queue_position + ')' : ''}` : j.status === 'done' ? `${t('style.ready', { title: j.title })}` : j.status === 'error' ? t('style.err') + (j.error || '') : `${j.stage || 'Rendu'} · ${Math.round((j.progress || 0) * 100)} %`;
      if (j.status === 'done') { $('#pGo').disabled = false; await loadLib(true); const tr = S.tracks.find((x) => x.id === j.id); if (tr) player.play(tr); return; }
    }
    if (j.status === 'error') { $('#pGo').disabled = false; return; }
  } catch (e) { $('#pStage').textContent = e.message; }
  setTimeout(poll, 1500);
}

function renderLib() {
  $('#sLib').innerHTML = S.tracks.length ? S.tracks.map((tr) => trackRowHtml(tr, player, S.labels, { listenOnly: S.demo })).join('') : `<li class="tr-empty">${t('style.emptyLib', { label: esc(S.style.label) })}</li>`;
  $('#sLibCount').textContent = S.total ? `${S.total} morceau${S.total > 1 ? 'x' : ''}` : '';
  $('#sMore').hidden = S.tracks.length >= S.total;
}
async function loadLib(reset) {
  const off = reset ? 0 : S.tracks.length;
  const r = await api(`/api/tracks?style=${encodeURIComponent(id)}&status=done&limit=30&offset=${off}`);
  S.tracks = reset ? r.items : [...S.tracks, ...r.items]; S.total = r.total; renderLib();
}
player.onChange = renderLib;
$('#sLib').addEventListener('click', async (e) => {
  const r = e.target.closest('[data-regen]');
  if (r) {
    if (S.demo) { location.href = '/login?next=' + encodeURIComponent(location.pathname); return; }
    r.disabled = true;
    try { const j = await api(`/api/tracks/${r.dataset.regen}/regenerate`, { method: 'POST', body: '{}' }); S.job = j.id; $('#pGo').disabled = true; poll(); $('#pJob').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    catch (err) { r.disabled = false; $('#pJob').hidden = false; $('#pStage').textContent = err.message; }
    return;
  }
  const b = e.target.closest('[data-play]'); if (b) player.play(S.tracks.find((tr) => tr.id === b.dataset.play));
});
$('#sMore').addEventListener('click', () => loadLib(false));

async function paintStyle() {
  let s;
  try { [s, S.opt] = await Promise.all([api('/api/styles/' + encodeURIComponent(id)), api('/api/options')]); }
  catch (e) { $('#sTitle').textContent = t('style.notFound'); $('#sTag').innerHTML = `${esc(e.message)} — <a href="/styles">${t('style.allStyles')}</a>`; return; }
  S.style = s; document.title = `soundtube — ${s.label}`;
  S.opt.keys.forEach((k) => (S.labels.key[k.id] = k.label)); S.opt.moods.forEach((m) => (S.labels.mood[m.id] = m.label));
  const root = document.documentElement; root.style.setProperty('--c', colorOf(id)); root.style.setProperty('--c2', color2Of(id));
  const beat = 60 / ((s.bpm[0] + s.bpm[1]) / 2); root.style.setProperty('--beat', beat.toFixed(3) + 's');
  $('#sCrumb').textContent = s.label; $('#sGenre').textContent = s.genre; $('#sTitle').innerHTML = `${esc(s.label)}<span>${esc((STYLE_WORDS[id] || []).join(' · '))}</span>`;
  $('#sTag').textContent = s.tagline; $('#sLibName').textContent = s.label;
  const scales = (S.opt.styles.find((x) => x.id === id)?.scales || []).map((x) => S.opt.scales.find((y) => y.id === x)?.label?.split(' (')[0]).filter(Boolean);
  $('#sFacts').innerHTML = [[`${s.bpm[0]}–${s.bpm[1]}`, 'BPM'], [scales.slice(0, 3).join(' · ') || '—', t('style.factScales')], [s.variants ? Object.keys(s.variants.options).length : '1', s.variants ? t('style.factVariants') : t('style.factVariant')], [String(s.tracks), t('style.factTracks')]]
    .map(([v, l]) => `<li><b>${esc(v)}</b><span>${esc(l)}</span></li>`).join('');
  $('#sPulse').innerHTML = Array.from({ length: 32 }, (_, k) => `<i style="--k:${k}"></i>`).join('');
  $('#sDoc').innerHTML = s.html || `<p>${esc(s.tagline)}</p>`;
  $('#sMach').innerHTML = s.machines.length ? s.machines.map((m) => `<span class="mach-chip">${esc(m)}</span>`).join('') : `<span class="hint">${t('style.machHint')}</span>`;
  const keep = (s.facts || []).filter((f) => /batterie|instrument|machine|basse|son|lead|synth|kit|boucle|drum|bass|sound|loop/i.test(f.label));
  $('#sFiche').innerHTML = keep.map((f) => `<div><dt>${esc(f.label)}</dt><dd>${f.html}</dd></div>`).join('');
  $('#sNext').innerHTML = `<span class="hint">${t('style.otherStyles')}</span>` + s.neighbours.map((n) => `<a href="/styles/${n}" style="--c:${colorOf(n)}">${esc(S.opt.styles.find((x) => x.id === n)?.label || n)}</a>`).join('');
  renderPreset();
}
onLangChange(() => { paintStyle().then(() => loadLib(true)).catch(() => {}); });
(async () => { await paintStyle(); await loadLib(true); reveal(); })();
