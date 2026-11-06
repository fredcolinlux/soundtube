// soundtube — interface web (vanilla JS, sans build).
import { AuroraField } from './aurora.js';
import { initI18n, t, mountLangSwitcher, onLangChange, applyDom, getUiLang, syncLangSwitchers } from './i18n.js';
import { mountSiteFooter } from './sitefoot.js';
const i18n = t; // alias: track locals often shadow `t`
import { apiFetch, refreshAuth, isLocal } from './csrf.js';
import { mountAuthMenu } from './authmenu.js';
import { initEditors, editorSlot, mountEditors } from './yteditor.js?v=1.21.1';
import { initGenForm, onStyle as genStyle, showTrack as genShowTrack, genExtras, watch as watchPack } from './genform.js?v=1.21.1';
import { initPubPanel, loadPub, publishHTML, packHTML, socialHTML, onPubInput, onPubAction } from './pubpanel.js?v=1.21.1';

const $ = (s) => document.querySelector(s);
const api = async (url, opts = {}) => {
  const r = await apiFetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (r.status === 204) return null;
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || t('err.generic', { status: r.status }));
  return data;
};
const fmt = (s) => { s = Math.max(0, Math.round(s || 0)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
const hms = (s) => { s = Math.max(0, Math.round(s || 0)); return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((v) => String(v).padStart(2, '0')).join(':'); };
/** « 90 », « 1:30 », « 01:02:03 », « 1h30 », « 2h », « 45m », « 30s » -> secondes (NaN si illisible). */
const DATE_FR = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtDate = (iso) => { if (!iso) return '—'; const d = new Date(iso); return isNaN(d) ? '—' : DATE_FR.format(d).replace(',', ''); };
// Durées proposées (choix fixes ; l'API accepte toujours une durée libre en secondes)
const DUR_PRESETS = [[60, '1 min'], [180, '3 min'], [300, '5 min'], [420, '7 min'], [600, '10 min'], [900, '15 min'], [3600, '1 h'], [5400, '1 h 30'], [7200, '2 h'], [9000, '2 h 30'], [10800, '3 h'], [12600, '3 h 30'], [14400, '4 h']];
const DUR_DEFAULT = 180;
const durLabel = (s) => (DUR_PRESETS.find(([v]) => v === s) || [0, s >= 3600 ? `${Math.floor(s / 3600)} h ${String(Math.round(s % 3600 / 60)).padStart(2, '0')}` : s >= 60 ? `${Math.floor(s / 60)} min${s % 60 ? ' ' + String(s % 60).padStart(2, '0') + ' s' : ''}` : `${s} s`])[1];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function toast(msg, ms = 2800) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (el.hidden = true), ms); }

const state = { options: null, style: 'lofi', mood: 'auto', instruments: {}, tracks: [], jobs: new Map(), current: null, duration: DUR_DEFAULT, maxDur: 14400, minDur: 20, adv: {}, open: new Set(), ytOpen: new Set(), yt: new Map(), sort: 'desc', variation: 0 };
// Couleur propre à chaque style (cartes, badges, bibliothèque)
const STYLE_COLOR = { lofi: '#f3c97a', ambient: '#7fd0ff', synthwave: '#c792ff', house: '#5ef2c9', frenchtouch: '#ffd23f', techno: '#a9b4d8', cinematic: '#e8dcb0', chiptune: '#b6f36a', trap: '#ff8fc7', hiphop: '#ffb36b', dnb: '#6be3ff' };
const colorOf = (id) => STYLE_COLOR[id] || '#5ef2c9';
const KEY_FR = {}; const SCALE_FR = {}; const STYLE_LABEL = {}; const MOOD_FR = {}; const INST_FR = {};

// ---------- fond « aurore + oscilloscope » + analyseur audio
const field = new AuroraField($('#bgCanvas'));
let actx = null, analyser = null, freq = null, timeData = null;
const audio = $('#audio');
function ensureAudioGraph() {
  if (actx) return;
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    const src = actx.createMediaElementSource(audio);
    analyser = actx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.78;
    src.connect(analyser); analyser.connect(actx.destination);
    freq = new Uint8Array(analyser.frequencyBinCount); timeData = new Uint8Array(analyser.fftSize);
  } catch (e) { console.warn('Web Audio indisponible', e); }
}
const viz = $('#vizCanvas'); const vctx = viz.getContext('2d');
field.onTick = () => {
  if (analyser && !audio.paused) {
    analyser.getByteFrequencyData(freq);
    let e = 0, b = 0; for (let i = 0; i < freq.length; i++) { e += freq[i]; if (i < 12) b += freq[i]; }
    field.setAudio(e / freq.length / 140, b / 12 / 255);
    const avg = (a, z) => { let v = 0; for (let i = a; i < z; i++) v += freq[i]; return v / (z - a) / 255; };
    field.setBands(avg(0, 10), avg(10, 80), avg(80, 300));
    analyser.getByteTimeDomainData(timeData); field.setWave(timeData);
    drawViz();
  } else { field.setAudio(0, 0); field.setBands(0, 0, 0); field.setWave(null); }
  drawWaveProgress();
};
function drawViz() {
  const w = viz.clientWidth, h = viz.clientHeight, d = devicePixelRatio || 1;
  if (viz.width !== w * d) { viz.width = w * d; viz.height = h * d; }
  vctx.setTransform(d, 0, 0, d, 0, 0); vctx.clearRect(0, 0, w, h);
  const bars = 28, step = Math.floor(freq.length * 0.7 / bars);
  for (let i = 0; i < bars; i++) {
    let v = 0; for (let k = 0; k < step; k++) v += freq[i * step + k]; v /= step * 255;
    const bh = Math.max(2, v * h); const x = i * (w / bars);
    vctx.globalAlpha = 0.35 + 0.65 * v;
    const g = vctx.createLinearGradient(0, h, 0, h - bh); g.addColorStop(0, '#5ef2c9'); g.addColorStop(1, '#9b8cff');
    vctx.fillStyle = g; vctx.fillRect(x + 1, h - bh, w / bars - 2, bh);
  }
  vctx.globalAlpha = 1;
}

// ---------- forme d'onde
function drawPeaks(canvas, peaks, progress = 0, color = '#5ef2c9') {
  const w = canvas.clientWidth, h = canvas.clientHeight, d = devicePixelRatio || 1;
  if (!w) return;
  if (canvas.width !== Math.round(w * d)) { canvas.width = Math.round(w * d); canvas.height = Math.round(h * d); }
  const c = canvas.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, w, h);
  if (!peaks || !peaks.length) return;
  const n = Math.min(peaks.length, Math.floor(w / 3)); const bw = w / n;
  for (let i = 0; i < n; i++) {
    const p = peaks[Math.floor(i * peaks.length / n)];
    const bh = Math.max(1.5, p * (h - 4));
    c.fillStyle = i / n < progress ? color : 'rgba(190,200,255,.26)';
    const r = Math.min(1.5, (bw - 1.2) / 2);
    c.beginPath(); c.roundRect(i * bw + 0.5, (h - bh) / 2, Math.max(1, bw - 1.2), bh, r); c.fill();
  }
}
let lastProg = -1;
function drawWaveProgress() {
  if (!state.current) return;
  const p = audio.duration ? audio.currentTime / audio.duration : 0;
  if (Math.abs(p - lastProg) < 0.001) return; lastProg = p;
  drawPeaks($('#waveCanvas'), state.current.waveform, p, '#5ef2c9');
  $('#tCur').textContent = fmt(audio.currentTime);
  const mini = document.querySelector(`.track[data-id="${state.current.id}"] canvas.mini`);
  if (mini) drawPeaks(mini, state.current.waveform, p, colorOf(state.current.style));
}

// ---------- options & formulaire
let optionsBound = false;
async function loadOptions() {
  const o = await api('/api/options'); state.options = o;
  o.keys.forEach((k) => (KEY_FR[k.id] = k.label)); o.scales.forEach((s) => (SCALE_FR[s.id] = s.label));
  o.styles.forEach((s) => (STYLE_LABEL[s.id] = s.label)); o.moods.forEach((m) => (MOOD_FR[m.id] = m.label)); o.instruments.forEach((i) => (INST_FR[i.id] = i.label));
  $('#stylesGrid').innerHTML = o.styles.map((s, i) => `
    <button type="button" class="style-card" data-style="${s.id}" style="--c:${colorOf(s.id)}">
      <div class="style-top"><span class="style-idx">${String(i + 1).padStart(2, '0')}</span><span class="check" aria-hidden="true"></span></div>
      <b>${esc(s.label)}</b>
      <p class="style-genre">${esc(s.genre)}</p>
      <p class="style-tag">${esc(s.tagline)}</p>
      <div class="style-meta"><span>${s.bpm[0]}–${s.bpm[1]} BPM</span><span>${s.scales.slice(0, 2).map((x) => esc(SCALE_FR[x].split(' ')[0])).join(' · ')}</span></div>
    </button>`).join('');
  if ($('#statStyles')) $('#statStyles').textContent = o.styles.length;
  $('#moodChips').innerHTML = o.moods.map((m) => `<button type="button" class="chip" data-mood="${m.id}">${esc(m.label.replace(/ \((selon le style|per style)\)/, ''))}</button>`).join('');
  $('#keySel').innerHTML = '<option value="auto">Auto</option>' + o.keys.map((k) => `<option value="${k.id}">${esc(k.label)} (${k.id})</option>`).join('');
  $('#scaleSel').innerHTML = `<option value="auto">${esc(t('form.scaleAuto') || 'Auto')}</option>` + o.scales.map((s) => `<option value="${s.id}">${esc(s.label)}</option>`).join('');
  const curFilter = $('#filterStyle')?.value || '';
  $('#filterStyle').innerHTML = `<option value="">${esc(t('lib.allStyles'))}</option>` + o.styles.map((s) => `<option value="${s.id}">${esc(s.label)}</option>`).join('');
  if (curFilter) $('#filterStyle').value = curFilter;
  state.maxDur = o.limits.maxDuration; state.minDur = o.limits.minDuration;
  renderDurations();
  $('#wavOn').checked = o.wavDefault !== false;
  buildAdvanced(o.advanced || {});
  if (!optionsBound) {
    $('#stylesGrid').addEventListener('click', (e) => { const c = e.target.closest('.style-card'); if (c) selectStyle(c.dataset.style); });
    $('#moodChips').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (!c) return; state.mood = c.dataset.mood; renderChips(); refreshDefaults(); });
    const setAdvKey = (k, v) => { if (!state.advDefs?.[k]) return; state.adv[k] = v === 'auto' ? null : v; state.advSession = false; readAdvanced(); saveTweaks(); refreshDefaults(); };
    $('#variantChips').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (!c) return; const s = state.options.styles.find((x) => x.id === state.style); if (s?.variants) setAdvKey(s.variants.key, c.dataset.v); });
    $('#ambChips').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) setAdvKey('ambience', c.dataset.v); });
    $('#varietyChips').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (!c) return; const v = c.dataset.v; setAdvKey('variety', lofi20() ? (v === 'auto' ? 'medium' : v === 'high' ? 'auto' : v) : v); });
    $('#ambVol').addEventListener('input', (e) => { $('#ambVolVal').textContent = e.target.value; });
    $('#ambVol').addEventListener('change', (e) => setAdvKey('ambienceLevel', +e.target.value === 50 ? 'auto' : +e.target.value));
    $('#mixRelated').addEventListener('change', (e) => setAdvKey('mixStyles', e.target.checked ? 'related' : 'auto'));
    $('#durPresets').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) setDuration(+c.dataset.dur); });
    $('#instChips').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (!c) return; state.instruments[c.dataset.inst] = !state.instruments[c.dataset.inst]; renderChips(); refreshDefaults(); });
    ['#keySel', '#scaleSel', '#bpmAuto'].forEach((q) => $(q).addEventListener('change', refreshDefaults)); $('#bpmIn').addEventListener('change', refreshDefaults);
    optionsBound = true;
  }
  if (!state.style) setDuration(DUR_DEFAULT);
  const qs = new URLSearchParams(location.search).get('style');
  selectStyle(state.style || (qs && o.styles.some((x) => x.id === qs) ? qs : 'lofi'));
}
function selectStyle(id) {
  state.style = id;
  const s = state.options.styles.find((x) => x.id === id);
  state.instruments = { ...s.defaults };
  document.querySelectorAll('.style-card').forEach((c) => c.classList.toggle('active', c.dataset.style === id));
  if ($('#bpmAuto').checked) $('#bpmIn').value = Math.round((s.bpm[0] + s.bpm[1]) / 2);
  // réglages propres à un style (ex. « Style techno ») : affichés seulement pour ce style
  document.querySelectorAll('.adv-field[data-styles]').forEach((f) => { f.hidden = !f.dataset.styles.split(' ').includes(id); });
  renderChips(); updateLabels();
  genStyle(id); // v1.14.0 : animation mémorisée pour ce style
  if (state.advDefs) setAdvanced(); // v1.9.0 : retouches mémorisées de CE style + valeurs réelles du style
}
function renderAdvChips() {
  if (!state.options) return;
  const s = state.options.styles.find((x) => x.id === state.style), vf = $('#variantField');
  vf.hidden = !s?.variants || (s.id === 'lofi' && !lofi20()); // sous-genres lo-fi : nouveaux morceaux (moteur 20) seulement
  if (s?.variants) {
    const cur = state.adv?.[s.variants.key] || 'auto';
    const rv = state.resolved?.style === s.id ? state.resolved.values?.[s.variants.key] : null, autoV = rv ? `Auto · ${String(s.variants.options[rv] || rv).split(' (')[0]}` : 'Auto';
    $('#variantChips').innerHTML = [['auto', autoV], ...Object.entries(s.variants.options)].map(([v, l]) => `<button type="button" class="chip ${cur === v ? 'on' : ''}" data-v="${esc(v)}" title="${esc(l)}">${esc(l.split(' (')[0])}</button>`).join('');
  }
  const amb = state.advDefs?.ambience;
  if (amb) {
    const cur = state.adv?.ambience || 'auto', def = state.options.moods.find((m) => m.id === state.mood)?.ambience;
    const autoL = def ? `Auto · ${amb.options[def] || def}` : 'Auto';
    $('#ambChips').innerHTML = [['auto', autoL], ...Object.entries(amb.options)].map(([v, l]) => `<button type="button" class="chip ${cur === v ? 'on' : ''}" data-v="${esc(v)}">${esc(l)}</button>`).join('');
    const eff = cur === 'auto' ? def : cur, lv = state.adv?.ambienceLevel ?? 50;
    $('#ambVolRow').hidden = !eff || eff === 'none' || !state.advDefs?.ambienceLevel;
    if (document.activeElement !== $('#ambVol')) { $('#ambVol').value = lv; $('#ambVolVal').textContent = lv; }
  }
  renderVariety();
}
const VARIETY_HINT = {
  low: 'Stable : peu de changements dans le morceau ; dans les mix, même sous-style, tempo et tonalité proches, mêmes sons (concentration, sommeil).',
  auto: 'Équilibrée : le comportement habituel (une même graine redonne le même morceau).',
  high: 'Sections, mélodies, accords et batterie qui évoluent davantage, modulations ; dans les mix, sous-styles, tempos, tonalités, sons et ambiances qui changent d’un titre à l’autre.',
  max: 'Change sans cesse : sous-styles en rotation à chaque titre, voyages de tempo et de tonalité, kits, pianos et ambiances différents, aucune section répétée à l’identique.',
};
/** Mix DJ probable avec ces réglages (mêmes seuils que le moteur : auto dès 1 h, forcé dès 15 min). */
const mixLikely = () => { const m = state.adv?.mix, d = state.duration; return m === 'off' ? false : m === 'on' ? d >= 900 : d >= 3600; };
const lofi20 = () => state.style === 'lofi' && (state.engine || state.options?.engine || 21) >= 20;
function renderVariety() {
  const raw = state.adv?.variety, v = lofi20() ? (raw === 'medium' ? 'auto' : raw || 'high') : raw || 'auto';
  document.querySelectorAll('#varietyChips .chip').forEach((c) => { const on = c.dataset.v === v; c.classList.toggle('on', on); c.setAttribute('aria-checked', on); });
  $('#varietyHint').textContent = VARIETY_HINT[v] || '';
  $('#mixStylesRow').hidden = !(mixLikely() && (v === 'high' || v === 'max'));
  $('#mixRelated').checked = state.adv?.mixStyles === 'related';
}
function renderChips() {
  document.querySelectorAll('#moodChips .chip').forEach((c) => c.classList.toggle('on', c.dataset.mood === state.mood));
  renderAdvChips();
  $('#instChips').innerHTML = state.options.instruments.map((i) => `<button type="button" class="chip ${state.instruments[i.id] ? 'on' : ''}" data-inst="${i.id}">${esc(i.label)}</button>`).join('');
}
function updateLabels() {
  $('#bpmVal').textContent = $('#bpmAuto').checked ? 'auto' : `${$('#bpmIn').value} BPM`;
  $('#bpmIn').disabled = $('#bpmAuto').checked;
  const d = state.duration;
  $('#durVal').textContent = durLabel(d);
  document.querySelectorAll('#durPresets .chip').forEach((c) => { const on = +c.dataset.dur === d; c.classList.toggle('on', on); c.setAttribute('aria-checked', on); });
}
// Durée : choix fixes. Une durée hors liste (réglages d'un ancien morceau) est ajoutée comme choix « personnalisé ».
function renderDurations(extra) {
  const list = DUR_PRESETS.filter(([v]) => v <= state.maxDur).map(([v, l]) => [v, l, false]);
  if (extra && !list.some(([v]) => v === extra)) { list.push([extra, durLabel(extra), true]); list.sort((a, b) => a[0] - b[0]); }
  $('#durPresets').innerHTML = list.map(([v, l, x]) => `<button type="button" role="radio" class="chip${x ? ' custom' : ''}" data-dur="${v}" title="${x ? 'Durée du morceau d’origine' : l}">${l}</button>`).join('');
}
function setDuration(sec) {
  sec = Math.round(Math.min(state.maxDur, Math.max(state.minDur, +sec || DUR_DEFAULT)));
  if (state.options && !DUR_PRESETS.some(([v]) => v === sec)) renderDurations(sec);
  state.duration = sec;
  updateLabels(); updateSplitOpt(); updateAiOpts(); if (state.options) { renderVariety(); refreshDefaults(); }
}
// option « Découper en morceaux individuels » : seulement au-delà de 30 min
const SPLIT_MIN = 1800;
function updateSplitOpt() { const on = state.duration > SPLIT_MIN; $('#splitOpt').hidden = !on; $('#splitMore').hidden = !on || !$('#splitOn').checked; }
$('#splitOn').addEventListener('change', updateSplitOpt);
$('#splitVid').addEventListener('change', () => { if ($('#splitVid').checked) $('#splitLib').checked = true; $('#splitLib').disabled = $('#splitVid').checked; });
{ const r = localStorage.getItem('st.ytRes'); if (r && $(`#splitRes option[value="${r}"]`)) $('#splitRes').value = r; }
['#bpmIn', '#bpmAuto'].forEach((s) => $(s).addEventListener('input', updateLabels));
$('#diceBtn').addEventListener('click', () => { $('#seedIn').value = Math.floor(Math.random() * 2 ** 31); $('#seedLock').checked = true; state.variation = 0; refreshDefaults(); });
$('#seedClear').addEventListener('click', () => { $('#seedIn').value = ''; $('#seedLock').checked = false; state.variation = 0; refreshDefaults(); });
$('#seedIn').addEventListener('input', () => { state.variation = 0; if ($('#seedIn').value === '') $('#seedLock').checked = false; refreshDefaults(); });
$('#resetBtn').addEventListener('click', () => {
  state.mood = 'auto'; $('#keySel').value = 'auto'; $('#scaleSel').value = 'auto'; $('#bpmAuto').checked = true; setDuration(DUR_DEFAULT); $('#seedIn').value = ''; $('#seedLock').checked = false; $('#titleIn').value = '';
  state.variation = 0; state.engine = null; $('#wavOn').checked = state.options.wavDefault !== false;
  selectStyle(state.style);
});

// ---------- réglages avancés (v1.9.0 : pré-remplis avec les valeurs réelles du style, retouches mémorisées par style)
// state.adv = retouches de l'utilisateur pour le style courant (null = valeur du style) ; state.resolved = valeurs réelles
// renvoyées par /api/advanced/defaults pour ce style, cette graine et ces réglages : ce qui est affiché est ce qui sera utilisé.
const TWEAKS_KEY = 'st.advTweaks';
function loadTweaks() { try { const t = JSON.parse(localStorage.getItem(TWEAKS_KEY) || 'null'); return t && typeof t === 'object' ? t : {}; } catch { return {}; } }
function saveTweaks() {
  if (state.advSession) return; // réglages d'un morceau chargé : pas enregistrés tant que l'utilisateur n'y touche pas
  const all = loadTweaks(), cur = Object.fromEntries(Object.entries(state.adv || {}).filter(([, v]) => v !== null && v !== undefined));
  if (Object.keys(cur).length) all[state.style] = cur; else delete all[state.style];
  try { localStorage.setItem(TWEAKS_KEY, JSON.stringify(all)); } catch { /* stockage plein */ }
}
const emptyAdv = () => Object.fromEntries(Object.keys(state.advDefs || {}).map((k) => [k, null]));
/** Retouches mémorisées du style (ou objet fourni) → state.adv, puis valeurs réelles recalculées. */
function setAdvanced(a = null, { session = false } = {}) {
  state.advSession = session;
  const src = a || loadTweaks()[state.style] || {};
  state.adv = emptyAdv();
  for (const [k, v] of Object.entries(src)) if (k in state.adv && v !== null && v !== undefined && v !== '' && v !== 'auto') state.adv[k] = v;
  readAdvanced(); refreshDefaults();
}
function buildAdvanced(defs) {
  state.advDefs = defs; state.adv = emptyAdv();
  $('#advGrid').innerHTML = Object.entries(defs).map(([k, d]) => {
    const ctl = d.type === 'range'
      ? `<input type="range" id="adv_${k}" min="${d.min}" max="${d.max}" step="1" value="${Math.round((d.min + d.max) / 2)}">`
      : `<select id="adv_${k}"><option value="" data-style="1">Choix du style</option>${Object.entries(d.options).map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>`;
    return `<div class="adv-field" data-k="${k}"${d.styles ? ` data-styles="${esc(d.styles.join(' '))}"` : ''} ${d.help ? `title="${esc(d.help)}"` : ''}>
      <div class="adv-head"><label for="adv_${k}">${esc(d.label)}</label>
        <button type="button" class="adv-undo" data-k="${k}" title="Revenir à la valeur du style" hidden>↺</button></div>${ctl}
      <b class="adv-val" id="advv_${k}">valeur du style</b></div>`;
  }).join('');
  const onEdit = (e) => {
    const f = e.target.closest('.adv-field'); if (!f) return; const k = f.dataset.k, d = defs[k], el = $('#adv_' + k);
    let v = d.type === 'range' ? +el.value : el.value;
    const r = state.resolved?.values?.[k], ex = state.resolved?.exact?.[k];
    if (v === '' || (ex && r !== null && r !== undefined && String(r) === String(v))) v = null; // égal à la valeur du style = pas de retouche
    state.adv[k] = v; state.advSession = false;
    readAdvanced(); saveTweaks();
    if (e.type === 'change') refreshDefaults();
  };
  $('#advGrid').addEventListener('input', (e) => { if (e.target.type === 'range') { const k = e.target.closest('.adv-field').dataset.k; $('#advv_' + k).textContent = i18n('adv.modifiedLabel', { v: advText(k, +e.target.value) }); } });
  $('#advGrid').addEventListener('change', onEdit);
  $('#advGrid').addEventListener('click', (e) => { const b = e.target.closest('.adv-undo'); if (!b) return; state.adv[b.dataset.k] = null; state.advSession = false; readAdvanced(); saveTweaks(); refreshDefaults(); });
  $('#advRandom').addEventListener('click', () => {
    const a = {};
    for (const [k, d] of Object.entries(defs)) {
      if (d.styles && !d.styles.includes(state.style)) continue;
      if (['mix', 'mixStyles', 'meter', 'fadeIn', 'fadeOut'].includes(k) || Math.random() < 0.35) continue; // une partie garde la personnalité de la graine
      if (d.type === 'range') a[k] = Math.round(d.min + Math.random() * (d.max - d.min));
      else { const keys = Object.keys(d.options); a[k] = keys[Math.floor(Math.random() * keys.length)]; }
    }
    setAdvanced(a); saveTweaks(); $('#advBox').open = true;
  });
  $('#advAuto').addEventListener('click', () => { state.adv = emptyAdv(); state.advSession = false; saveTweaks(); readAdvanced(); refreshDefaults(); toast(t('toast.advReset')); });
}
/** Graine des valeurs affichées : la graine saisie, sinon une graine « prochaine génération » tirée d'avance. */
function previewSeed() {
  if ($('#seedIn').value !== '') return +$('#seedIn').value;
  if (state.nextSeed == null) state.nextSeed = Math.floor(Math.random() * 2 ** 31);
  return state.nextSeed;
}
let defTimer = 0, defSeq = 0;
function refreshDefaults() {
  if (!state.options || !state.advDefs) return;
  clearTimeout(defTimer);
  defTimer = setTimeout(async () => {
    const seq = ++defSeq, seed = previewSeed();
    $('#seedIn').placeholder = $('#seedIn').value === '' ? i18n('create.seedNext', { seed }) : i18n('create.seedRandom');
    const body = { style: state.style, mood: state.mood, key: $('#keySel').value, scale: $('#scaleSel').value, bpm: $('#bpmAuto').checked ? 0 : +$('#bpmIn').value,
      duration: state.duration, instruments: state.instruments, adv: sentAdv(), engine: state.engine || state.options.engine || 21, seed, variation: state.variation || 0 };
    try { const r = await api('/api/advanced/defaults', { method: 'POST', body: JSON.stringify(body) }); if (seq === defSeq) { state.resolved = r; readAdvanced(); } }
    catch { /* hors ligne : les champs gardent leurs valeurs */ }
  }, 120);
}
/** Seules les retouches partent au serveur : les autres valeurs sont celles que le style choisit (même morceau). */
function sentAdv() { return Object.fromEntries(Object.entries(state.adv || {}).filter(([, v]) => v !== null && v !== undefined)); }
function advText(k, v) {
  const d = state.advDefs?.[k]; if (!d || v === null || v === undefined || v === '') return 'style';
  return d.type === 'range' ? `${v}${d.unit || ''}` : String(d.options[v] ?? v);
}
/** Fond sonore d'un morceau : forcé (réglage) ou implicite (ambiance). */
function ambText(P, adv) {
  const opts = state.advDefs?.ambience?.options || {};
  if (adv?.ambience) return adv.ambience === 'none' ? '' : esc(opts[adv.ambience] || adv.ambience);
  const def = state.options?.moods.find((m) => m.id === P.mood)?.ambience;
  return def ? `${esc(opts[def] || def)} <span class="muted">${esc(i18n('adv.fromMood'))}</span>` : '';
}
/** Met les champs à jour : retouche (vert, ↺) ou valeur réelle du style. Renvoie les réglages à envoyer. */
function readAdvanced() {
  const R = state.resolved && state.resolved.style === state.style ? state.resolved : null;
  let n = 0;
  for (const [k, d] of Object.entries(state.advDefs || {})) {
    const el = $('#adv_' + k), vb = $('#advv_' + k), u = state.adv?.[k], set = u !== null && u !== undefined;
    const rv = R?.values?.[k], ex = R?.exact?.[k] !== false, note = R?.notes?.[k];
    if (set) n++;
    const v = set ? u : rv;
    if (d.type === 'range') { if (v !== null && v !== undefined) el.value = String(v); }
    else { const o0 = el.options[0]; o0.textContent = note ? i18n('adv.fromStyleNote', { note }) : i18n('adv.choiceOfStyle'); el.value = v === null || v === undefined ? '' : String(v); }
    vb.textContent = set ? i18n('adv.modifiedLabel', { v: advText(k, u) }) : !R ? i18n('adv.styleDefault') : ex ? i18n('adv.styleValue', { v: advText(k, rv) }) : i18n('adv.stylePrefix', { v: note || i18n('adv.styleSeed') });
    vb.classList.toggle('forced', set); vb.title = vb.textContent;
    document.querySelector(`.adv-undo[data-k="${k}"]`).hidden = !set;
  }
  const lbl = STYLE_LABEL[state.style] || '';
  $('#advCount').textContent = (n ? (n > 1 ? i18n('adv.countSet_plural', { n }) : i18n('adv.countSet', { n })) : i18n('adv.countDefault')) + (lbl ? ` · ${lbl}` : '') + (R ? ` · ${i18n('adv.seed', { seed: R.seed })}` : '');
  renderAdvChips();
  return sentAdv();
}

// ---------- v1.9.0 : directeur artistique (« Décris l'ambiance » → réglages validés par le serveur)
// state.ai = { meta, plan } de la dernière proposition appliquée (envoyés avec la génération tant que le style ne change pas)
function updateAiOpts() { const on = state.duration >= 3600; $('#aiPlanOpt').hidden = !on; if (!on) $('#aiPlan').checked = false; }
function applySuggestion(r) {
  const P = r.params;
  selectStyle(P.style);
  state.mood = P.mood || 'auto'; renderChips();
  $('#keySel').value = P.key || 'auto'; $('#scaleSel').value = P.scale || 'auto';
  if (P.bpm) { $('#bpmAuto').checked = false; $('#bpmIn').value = P.bpm; } else $('#bpmAuto').checked = true;
  updateLabels();
  setAdvanced({ ...emptyAdv(), ...(P.adv || {}) }, { session: true }); // proposition affichée, pas mémorisée comme retouche du style
  if (Object.keys(P.adv || {}).length) $('#advBox').open = true;
  if (r.meta?.title_fr) $('#titleIn').value = r.meta.title_fr;
  state.ai = { style: P.style, meta: r.meta || null, plan: r.plan || null };
}
function renderSuggestion(r) {
  const o = $('#aiOut'), S = STYLE_LABEL[r.params.style] || r.params.style, A = r.params.adv || {};
  const src = r.source === 'ai' ? `IA · ${esc(r.model || '')}${r.ms ? ` · ${(r.ms / 1000).toFixed(1).replace('.', ',')} s` : ''}` : 'Proposition locale (sans IA)';
  const advL = Object.entries(A).map(([k, v]) => `${esc(state.advDefs?.[k]?.label || k)} : ${esc(advText(k, v))}`).join(' · ');
  const m = r.meta;
  o.innerHTML = `<span class="ai-src${r.fallback ? ' fb' : ''}">${src}</span>`
    + (r.error ? `<span class="ai-warn">${esc(r.error)}</span>` : '')
    + `<div><b>${esc(S)}</b>${r.params.mood !== 'auto' ? ` · ${esc(state.options.moods.find((x) => x.id === r.params.mood)?.label || r.params.mood)}` : ''}${r.params.bpm ? ` · ${r.params.bpm} BPM` : ''}${r.params.key !== 'auto' ? ` · ${esc(r.params.key)}` : ''}</div>`
    + (r.explanation ? `<div>${esc(r.explanation)}</div>` : '')
    + (advL ? `<div class="muted">${advL}</div>` : '')
    + (m ? `<ul>${m.title_fr ? `<li>Titre : ${esc(m.title_fr)}</li>` : ''}${m.title_en ? `<li>Title : ${esc(m.title_en)}</li>` : ''}${m.description_fr ? `<li>Description : ${esc(m.description_fr)}</li>` : ''}${m.description_en ? `<li>Description (EN) : ${esc(m.description_en)}</li>` : ''}${m.tags?.length ? `<li>Tags : ${esc(m.tags.join(', '))}</li>` : ''}</ul>` : '')
    + (r.plan ? `<div class="ai-plan">Plan (${r.plan.length} parties) : ${r.plan.map((p) => `${Math.round(p.from * 100)}–${Math.round(p.to * 100)} % énergie ${p.energy ?? '—'}${p.sub ? ' · ' + esc(p.sub) : ''}${p.note ? ' · ' + esc(p.note) : ''}`).join(' | ')}</div>` : '')
    + (r.warnings?.length ? `<div class="ai-warn">${r.warnings.map(esc).join(' · ')}</div>` : '')
    + '<div class="muted">Appliqué au formulaire : tout reste modifiable avant « Générer ».</div>';
  o.hidden = false;
}
$('#aiGo').addEventListener('click', async () => {
  const prompt = $('#aiPrompt').value.trim();
  if (prompt.length < 3) return toast(t('toast.aiNeedPrompt'));
  const b = $('#aiGo'); b.disabled = true; b.textContent = t('create.aiThinking'); $('#aiState').textContent = t('create.aiBusy');
  try {
    const r = await api('/api/ai/suggest', { method: 'POST', body: JSON.stringify({ prompt, style: state.style, duration: state.duration, meta: $('#aiMeta').checked, plan: $('#aiPlan').checked }) });
    applySuggestion(r); renderSuggestion(r);
    $('#aiState').textContent = r.source === 'ai' ? t('create.aiApplied') : t('create.aiLocal');
  } catch (e) { toast(e.message); $('#aiState').textContent = t('create.aiFail'); }
  finally { b.disabled = false; b.textContent = t('create.aiGo'); }
});

/** Charge des réglages (objet « settings » de l'API) dans le formulaire. */
function applySettings(st) {
  if (!st) return;
  selectStyle(st.style);
  state.mood = st.mood || 'auto';
  if (st.instruments) state.instruments = { ...st.instruments };
  renderChips();
  $('#keySel').value = st.key || 'auto'; $('#scaleSel').value = st.scale || 'auto';
  if (st.bpm) { $('#bpmAuto').checked = false; $('#bpmIn').value = st.bpm; } else $('#bpmAuto').checked = true;
  setDuration(st.duration || DUR_DEFAULT);
  if (st.seed !== undefined && st.seed !== null) { $('#seedIn').value = st.seed; $('#seedLock').checked = true; }
  state.variation = st.variation || 0;
  $('#wavOn').checked = st.wav !== false;
  state.engine = st.engine || null; // v1.8.0 : réglages d'un ancien morceau = moteur d'origine (même morceau)
  setAdvanced(st.adv || {}, { session: true }); // v1.9.0 : réglages du morceau affichés, pas enregistrés comme retouches du style
  $('#advBox').open = Object.values(st.adv || {}).some((v) => v !== null && v !== undefined);
  updateLabels();
}

$('#genBtn').addEventListener('click', async () => {
  const body = {
    style: state.style, mood: state.mood, key: $('#keySel').value, scale: $('#scaleSel').value,
    bpm: $('#bpmAuto').checked ? 0 : +$('#bpmIn').value, duration: state.duration, instruments: state.instruments,
    wav: $('#wavOn').checked, adv: readAdvanced(), engine: state.engine || state.options?.engine || 21,
  };
  if (state.duration > SPLIT_MIN && $('#splitOn').checked) { body.split = { mode: $('#splitMode').value, library: $('#splitLib').checked || $('#splitVid').checked, lang: state.ytLang }; if ($('#splitVid').checked) { body.split.video = { resolution: $('#splitRes').value }; localStorage.setItem('st.ytRes', $('#splitRes').value); } }
  Object.assign(body, genExtras()); // v1.14.0 : animation + paquet ZIP
  if ($('#seedIn').value !== '') { body.seed = +$('#seedIn').value; if (state.variation) body.variation = state.variation; }
  const preview = $('#seedIn').value === '' && state.nextSeed != null;
  if (preview) body.seed = state.nextSeed; // v1.9.0 : la graine des valeurs affichées dans « Avancé »
  if (state.duration > 3600 && !confirm(`Morceau de ${fmt(state.duration)} : le rendu prendra plusieurs minutes (fichier WAV ≈ ${(state.duration * 176400 / 1e9).toFixed(1).replace('.', ',')} Go). Continuer ?`)) return;
  if ($('#titleIn').value.trim()) body.title = $('#titleIn').value.trim();
  if (state.ai && state.ai.style === state.style) { // v1.9.0 : textes et plan du directeur artistique
    const m = state.ai.meta;
    if (m?.title_en && body.title && body.title === m.title_fr) body.title_en = m.title_en;
    if (m && (m.description_fr || m.description_en || m.tags?.length)) body.aiMeta = { description_fr: m.description_fr, description_en: m.description_en, tags: m.tags };
    if (state.ai.plan && state.duration >= 3600) body.aiPlan = state.ai.plan;
  }
  if (!Object.values(state.instruments).some(Boolean)) return toast(t('toast.needInstrument'));
  $('#genBtn').disabled = true;
  try {
    if (body.seed !== undefined && !preview) { // graine fixée : risque de doublon (contenu répétitif aux yeux de YouTube)
      const { duplicates = [] } = await api('/api/check-duplicates', { method: 'POST', body: JSON.stringify(body) }).catch(() => ({}));
      if (duplicates.length && !confirm(dupText(duplicates) + '\n\n' + i18n('toast.dupMonetize'))) return;
    }
    const job = await api('/api/generate', { method: 'POST', body: JSON.stringify(body) }); trackJob(job); if (body.pack) watchPack(job.id, job.title);
    $('#lastSeed').textContent = job.variation ? i18n('create.lastSeedVar', { seed: job.seed, variation: job.variation }) : i18n('create.lastSeed', { seed: job.seed });
    if (!$('#seedLock').checked) { $('#seedIn').value = ''; state.variation = 0; }
    state.nextSeed = null; refreshDefaults(); // nouvelle graine pour la prochaine génération
    if (job.duplicates?.length) toast(`⚠ « ${job.title} » : ${job.duplicates[0].label} de « ${job.duplicates[0].title} ».`, 6000);
    else toast(t('toast.jobQueued', { title: job.title, dur: durLabel(body.duration), seed: job.seed }));
  }
  catch (e) { toast(e.message); }
  finally { setTimeout(() => ($('#genBtn').disabled = false), 600); }
});

/** Texte d'avertissement doublons (confirm / toast). */
function dupText(d) {
  return 'Attention, doublon possible :\n' + d.slice(0, 4).map((x) => `• ${x.label} de « ${x.title} » — ${x.reasons.join(', ')}`).join('\n');
}
const isDup = (t) => (t.duplicates || []).some((d) => d.level !== 'tres-proche');

// ---------- suivi des tâches
function trackJob(job) { state.jobs.set(job.id, job); renderJobs(); pollJobs(); }
let polling = false;
async function pollJobs() {
  if (polling) return; polling = true;
  while (state.jobs.size) {
    for (const id of [...state.jobs.keys()]) {
      try {
        const j = await api(`/api/jobs/${id}`); state.jobs.set(id, j);
        if (j.status === 'done') { state.jobs.delete(id); await loadLibrary(); const t = state.tracks.find((x) => x.id === id); if (t && (!state.current || audio.paused)) play(t); toast(i18n('toast.jobReady', { title: j.title })); }
        if (j.status === 'error') { setTimeout(() => { state.jobs.delete(id); renderJobs(); }, 8000); }
      } catch { state.jobs.delete(id); }
    }
    renderJobs();
    await new Promise((r) => setTimeout(r, 700));
  }
  polling = false; renderJobs();
}
function renderJobs() {
  const busy = [...state.jobs.values()].some((j) => j.status !== 'error');
  $('#statusPill').classList.toggle('busy', busy);
  $('#statusText').textContent = busy ? t('status.busy', { n: state.jobs.size }) : t('status.ready');
  $('#jobsBox').innerHTML = [...state.jobs.values()].map((j) => `
    <div class="job ${j.status === 'error' ? 'error' : ''}">
      <div class="job-top"><b>${esc(j.title)}</b><span>${esc(STYLE_LABEL[j.style] || j.style)} · ${j.status === 'queued' ? `en file (${j.queue_position || 1})` : j.status === 'error' ? 'erreur : ' + esc(j.error) : esc(j.stage || '')} · ${Math.round((j.progress || 0) * 100)}%${j.status === 'running' && j.eta ? ' · reste ≈ ' + fmt(j.eta) : ''}</span></div>
      <div class="bar"><i style="width:${Math.round((j.progress || 0) * 100)}%"></i></div>
    </div>`).join('');
}

// ---------- bibliothèque
async function loadLibrary() {
  const st = $('#filterStyle').value;
  const { items, total } = await api(`/api/tracks?limit=200${st ? '&style=' + st : ''}`);
  state.tracks = items;
  for (const t of items) if ((t.status === 'queued' || t.status === 'running') && !state.jobs.has(t.id)) trackJob(t);
  renderLibrary(total);
}
$('#filterStyle').addEventListener('change', loadLibrary);
function sortedTracks() {
  const done = state.tracks.filter((t) => t.status === 'done');
  const k = (t) => t.created_at || t.finished_at || '';
  done.sort((a, b) => (k(a) === k(b) ? 0 : k(a) < k(b) ? 1 : -1) * (state.sort === 'asc' ? -1 : 1));
  return done;
}
const scaleName = (id) => (SCALE_FR[id] || id || '').split(' (')[0].toLowerCase();
const settingsOf = (t) => t.settings || { style: t.style, seed: t.seed, variation: t.variation || 0, mood: t.params?.mood, key: t.params?.key, scale: t.params?.scale, bpm: t.params?.bpm, duration: t.params?.duration, instruments: t.params?.instruments, wav: t.params?.wav !== false, adv: t.params?.adv || {} };

/** Panneau « Détails » : tous les paramètres de création du morceau. */
const nf = (x) => (x == null ? '—' : String(x).replace('.', ','));
/** Tracklist du mix DJ (≥ 1 h) : sert aussi aux chapitres YouTube. */
const SUB_FR = { boombap: 'boom-bap', lofi: 'lo-fi', trap: 'trap', liquid: 'liquid', neuro: 'neurofunk', jungle: 'jungle', detroit: 'Detroit', minimal: 'minimale', industriel: 'industrielle', outrun: 'outrun', dreamwave: 'dreamwave' };
const subText = (d) => [d.style ? STYLE_LABEL[d.style] || d.style : '', d.sub ? SUB_FR[d.sub] || d.sub : ''].filter(Boolean).join(' · ') + (d.halftime ? ' · demi-temps' : '') + (d.mood ? ` · ${(MOOD_FR[d.mood] || d.mood).replace(' (selon le style)', '')}` : '');
function mixHTML(X) {
  if (!X || !(X.decks || []).length || X.count < 2) return '';
  const nrg = (e) => `<span class="nrg" title="Énergie ${Math.round(e * 100)} %"><i style="width:${Math.round(e * 100)}%"></i></span>`;
  const rows = X.decks.map((d) => `<tr>
      <td class="mono">${esc(d.time)}</td><td><b>${esc(d.name)}</b>${subText(d) ? ` <span class="muted">${esc(subText(d))}</span>` : ''}</td>
      <td>${esc(d.keyLabel || d.key)} <span class="mono cam">${esc(d.camelot)}</span></td>
      <td class="mono"${d.halftime ? ` title="Demi-temps : ${d.gridBpm} BPM sur la grille du mix"` : ''}>${d.bpm}${d.bpmIn && d.bpmOut ? ` <span class="muted">${String(d.bpmIn).replace('.', ',')}→${String(d.bpmOut).replace('.', ',')}</span>` : ''}</td>
      <td>${nrg(d.energy || 0)}</td>
      <td>${d.transitionOut ? `${esc(d.transitionOut.label)} <span class="muted">${d.transitionOut.bars} mes.</span>` : '<span class="muted">fin du set</span>'}</td></tr>`).join('');
  return `<div class="dmix"><h4>Tracklist du mix DJ — ${X.count} titres · ${X.bpmMin}–${X.bpmMax} BPM</h4>
    <div class="mixwrap"><table class="mixlist"><thead><tr><th>Début</th><th>Titre</th><th>Tonalité / Camelot</th><th>BPM (entrée→sortie)</th><th>Énergie</th><th>Transition suivante</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="hint">Chaque titre a sa propre graine (tonalité, accords, motifs, sons, batterie, arrangement). Les débuts servent de chapitres YouTube (milieu de chaque transition).</p></div>`;
}
function detailsHTML(t) {
  const P = t.params || {}, M = t.meta || {}, R = M.recipe || {}, adv = P.adv || {}, L = M.loudness;
  const row = (k, v) => `<div class="dl-row"><dt>${esc(k)}</dt><dd>${v}</dd></div>`;
  const isMix = M.mix?.count > 1;
  const prog = M.progressions || {};
  const progRows = [['A', 'Couplet'], ['B', 'Refrain'], ['bridge', 'Pont']].filter(([k]) => prog[k]?.length)
    .map(([k, l]) => row(l, `<span class="mono">${prog[k].map(esc).join(' – ')}</span>`)).join('');
  const chapters = (M.chapters || []);
  const structure = chapters.length > 1
    ? `${chapters.length} mouvements · ${esc(chapters[0].structure || '')}…`
    : esc(chapters[0]?.structure || (M.sections || []).map((x) => x.label).join(' · '));
  const insts = Object.entries(P.instruments || {}).map(([k, on]) => `<span class="tag ${on ? 'on' : 'off'}">${esc(INST_FR[k] || k)}</span>`).join('');
  const sons = Object.entries(R.sons || {}).map(([k, v]) => row(k[0].toUpperCase() + k.slice(1).replace('melodie', 'mélodie').replace('arpeges', 'arpèges'), esc(v))).join('');
  const advRows = Object.keys(state.advDefs || adv).map((k) => {
    const v = adv[k]; const set = v !== null && v !== undefined;
    return row(state.advDefs?.[k]?.label || k, set ? `<b>${esc(advText(k, v))}</b>` : '<span class="muted">auto</span>');
  }).join('');
  const groove = R.groove || {}, jeu = R.jeu || {}, mel = R.melodie || {}, fx = R.effets || {};
  const VK = { techno: 'technoStyle', synthwave: 'synthStyle', hiphop: 'hiphopStyle', dnb: 'dnbStyle', frenchtouch: 'ftStyle' }[t.style];
  const variant = VK && P[VK] ? String(state.advDefs?.[VK]?.options?.[P[VK]] || P[VK]).split(' (')[0] : null;
  const recipe = [
    jeu.basse && row('Jeu de basse', esc(jeu.basse)), jeu.accords && row('Jeu des accords', `${esc(jeu.accords)} · ${jeu.mesuresParAccord} mesure(s)/accord · ${jeu.notesParAccord} notes`),
    jeu.arpeges && row('Arpèges', esc(jeu.arpeges)), groove.kit && row('Kit de batterie', esc(groove.kit)), groove.swing != null && row('Swing', `${Math.round(groove.swing * 100)} %`),
    groove.kick && row('Grosse caisse', `<span class="mono">${esc(groove.kick)}</span>`), groove.caisse && row('Caisse claire', `<span class="mono">${esc(groove.caisse)}</span>`),
    groove.charley && row('Charleston', `<span class="mono">${esc(groove.charley)}</span>`),
    mel.contour && row('Mélodie', `contour ${esc(mel.contour)} · densité ${Math.round((mel.densite || 0) * 100)} %${mel.pentatonique ? ' · pentatonique' : ''}`),
    fx.reverb != null && row('Effets', `réverb ${Math.round(fx.reverb * 100)} % · délai ${Math.round((fx.delai || 0) * 100)} % · sidechain ${Math.round((fx.sidechain || 0) * 100)} %`),
  ].filter(Boolean).join('');
  return `<div class="details">
    <div class="dcol">
      <h4>Général</h4><dl>
        ${row('Style', esc(STYLE_LABEL[t.style] || t.style))}
        ${variant ? row('Variante', esc(variant)) : ''}
        ${row('Graine', `<span class="mono">${t.seed}</span>${t.variation ? ' · variation ' + t.variation : ''}`)}
        ${row('Tonalité / mode', isMix ? `variable : ${[...new Set(M.mix.decks.map((d) => d.camelot))].length} tonalités <span class="muted">(${esc(M.mix.decks[0].camelot)} → ${esc(M.mix.decks[M.mix.decks.length - 1].camelot)}, voir la tracklist)</span>` : `${esc(KEY_FR[P.key] || P.key)} ${esc(scaleName(P.scale))}`)}
        ${M.mix?.count > 1 ? row('Mode', `<b>Mix DJ</b> · ${M.mix.count} titres enchaînés`) : ''}
        ${row('Tempo', M.mix?.count > 1 ? `${M.mix.bpmMin}–${M.mix.bpmMax} BPM <span class="muted">(dérive progressive)</span>` : `${P.bpm} BPM`)}
        ${row('Mesure', esc(M.meter || adv.meter || '4/4'))}
        ${row('Durée', `${fmt(t.duration)}${P.duration && Math.abs(P.duration - t.duration) > 1 ? ` <span class="muted">(demandée ${fmt(P.duration)}, + fin naturelle)</span>` : ''}`)}
        ${row('Ambiance', esc((MOOD_FR[P.mood] || P.mood || 'auto').replace(' (selon le style)', '')))}
        ${row('Variation', `${esc({ low: 'Faible', high: 'Forte', max: 'Maximale' }[adv.variety] || 'Moyenne')}${adv.mixStyles === 'related' ? ' <span class="muted">· styles proches autorisés</span>' : ''}${isMix && M.mix.styles?.length > 1 ? ` <span class="muted">· ${M.mix.styles.length} styles / sous-styles</span>` : ''}`)}
        ${ambText(P, adv) ? row('Fond sonore', ambText(P, adv)) : ''}
        ${t.title_en && t.title_en !== t.title ? row('Titre anglais', esc(t.title_en)) : ''}
        ${t.meta?.splitFrom ? row('Extrait de', `« ${esc(t.meta.splitFrom.title)} » · morceau ${t.meta.splitFrom.n}/${t.meta.splitFrom.of} (${fmt(t.meta.splitFrom.start)} – ${fmt(t.meta.splitFrom.end)})`) : ''}
        ${canSplit(t) ? row(i18n('lib.split'), `<button class="btn btn-mini" data-act="split" type="button"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/></svg> Découper en morceaux individuels</button>`) : ''}
        ${row('Créé le', fmtDate(t.created_at))}
        ${t.render_ms ? row('Temps de rendu', `${(t.render_ms / 1000).toFixed(1).replace('.', ',')} s`) : ''}
        ${row('Formats', Object.keys(t.urls || {}).map((f) => ({ wav: 'WAV', mp3: 'MP3', mid: 'MIDI', midzip: 'ZIP MIDI' }[f] || f)).join(' · '))}
      </dl>
      <h4>Harmonie & structure${isMix ? ' (1er titre)' : ''}</h4><dl>${progRows}${row('Structure', isMix ? `${M.mix.count} titres enchaînés (mix DJ)` : structure)}</dl>
      <h4>Mastering YouTube</h4><dl>${L ? [
        row('Loudness intégrée', `<b>${nf(L.integrated)} LUFS</b> <span class="muted">(cible ${nf(L.target)})</span>`),
        row('Crête vraie', `${nf(L.truePeak)} dBTP <span class="muted">(max ${nf(L.ceiling)})</span>`),
        row('Plage (LRA)', `${nf(L.lra)} LU`), row('Gain appliqué', `${L.gainDb > 0 ? '+' : ''}${nf(L.gainDb)} dB${L.limiterDb < -0.05 ? ` · limiteur ${nf(L.limiterDb)} dB` : ''}`),
      ].join('') : row('—', '<span class="muted">morceau antérieur au mastering -14 LUFS</span>')}</dl>
      ${t.duplicates?.length ? `<h4>Doublons possibles</h4><ul class="duplist">${t.duplicates.map((d) => `<li class="${d.level}"><b>${esc(d.label)}</b> de « ${esc(d.title)} »<br><span class="muted">${esc(d.reasons.join(', '))}</span></li>`).join('')}</ul>` : ''}
    </div>
    <div class="dcol">
      <h4>Instruments${isMix ? ' (1er titre)' : ''}</h4><div class="tags">${insts}</div>
      <dl>${sons}</dl>
      <h4>Recette de la graine${isMix ? ' (1er titre)' : ''}</h4><dl>${recipe || row('—', 'non disponible')}</dl>
    </div>
    <div class="dcol">
      <h4>Paramètres avancés</h4><dl>${advRows}</dl>
    </div>
    ${mixHTML(M.mix)}
    <div class="dact">
      <button class="btn btn-primary btn-mini" data-act="reuse" type="button">${esc(i18n('lib.reuse'))}</button>
      <button class="btn btn-mini" data-act="copy" type="button">${esc(i18n('lib.copySettings'))}</button>
      <span class="hint">Même graine + mêmes réglages = morceau identique.</span>
    </div>
  </div>`;
}

/** v1.12.0 : lien « régénéré en v1.12.0 » entre un ancien morceau et sa nouvelle version. */
function regenHtml(t) {
  const lk = (x) => `<a href="/studio?track=${encodeURIComponent(x.id)}#library" data-goto="${esc(x.id)}">« ${esc(x.title || 'morceau supprimé')} »</a>`;
  if (t.regen_of) return `<div class="tregen">↻ régénéré en v${esc(t.regen_of.version || '1.12.0')} · depuis ${lk(t.regen_of)}</div>`;
  if (t.regenerations?.length) return `<div class="tregen">↻ version régénérée (v1.12.0) : ${t.regenerations.map(lk).join(', ')}</div>`;
  return '';
}
function renderLibrary() {
  const done = sortedTracks();
  $('#libCount').textContent = done.length > 1 ? i18n('pack.pieceCount_plural', { n: done.length }) : i18n('pack.pieceCount', { n: done.length });
  if (!done.length) { $('#libraryList').innerHTML = `<div class="empty">${esc(i18n('lib.empty'))}</div>`; return; }
  $('#libraryList').innerHTML = done.map((t) => {
    const open = state.open.has(t.id);
    return `
    <div class="track ${state.current?.id === t.id ? 'playing' : ''} ${open ? 'open' : ''}" data-id="${t.id}" style="--c:${colorOf(t.style)}">
      <button class="tplay" data-act="play" title="${esc(i18n('player.listen'))}">${state.current?.id === t.id && !audio.paused ? '❚❚' : '▶'}</button>
      <div class="tinfo">
        <b title="${esc(t.title)}">${esc(t.title)}</b>
        <div class="tmeta"><span class="badge">${esc(STYLE_LABEL[t.style] || t.style)}</span>${t.duplicates?.length ? `<span class="badge dup ${isDup(t) ? 'hard' : ''}" title="${esc(dupText(t.duplicates))}">${isDup(t) ? '⚠ Doublon' : '≈ Proche'}</span>` : ''}<span>${t.bpm} BPM</span><span>${esc(KEY_FR[t.key] || t.key)} ${esc(scaleName(t.scale))}</span><span>${fmt(t.duration)}</span><span title="Graine">#${t.seed}${t.variation ? ' · v' + t.variation : ''}</span><span class="date" title="Date de création">${fmtDate(t.created_at)}</span></div>${regenHtml(t)}
      </div>
      <canvas class="mini" data-act="seek"></canvas>
      <div class="tact">
        <button class="btn btn-mini ${open ? 'on' : ''}" data-act="details" aria-expanded="${open}" title="Tous les paramètres de création">Détails ${open ? '▴' : '▾'}</button>
        <button class="btn btn-mini btn-yt ${state.ytOpen.has(t.id) ? 'on' : ''}" data-act="yt" aria-expanded="${state.ytOpen.has(t.id)}" title="Titre, description, tags, miniature et vidéo pour YouTube">▶ YouTube</button>
        <button class="btn btn-mini" data-act="variation" title="Même harmonie, tempo et réglages ; nouvelle mélodie et groove">Variation</button>
        <button class="btn btn-mini" data-act="remix" title="Nouvelle graine, mêmes réglages">Remix</button>
        ${t.regen_ok && !t.regenerations?.length ? `<button class="btn btn-mini btn-regen" data-act="regen" title="Même graine, mêmes réglages, harmonie corrigée (moteur 21). L’original est conservé, la nouvelle version apparaît à côté.">Régénérer en v1.12.0</button>` : ''}
        ${t.urls.mp3 ? `<a class="btn btn-mini" href="${t.urls.mp3}?download=1" title="Télécharger en MP3">MP3</a>` : ''}
        ${t.urls.wav ? `<a class="btn btn-mini" href="${t.urls.wav}?download=1" title="Télécharger en WAV">WAV</a>` : ''}
        ${t.urls.mid ? `<a class="btn btn-mini" href="${t.urls.mid}?download=1" title="Exporter en MIDI (fichier complet)">MIDI</a>` : ''}
        ${t.urls.midzip ? `<a class="btn btn-mini" href="${t.urls.midzip}?download=1" title="ZIP : un fichier MIDI par instrument + le complet">ZIP</a>` : ''}
        ${canSplit(t) ? `<button class="btn btn-mini ${state.splitOpen.has(t.id) ? 'on' : ''}" data-act="split" aria-expanded="${state.splitOpen.has(t.id)}" title="Découper en morceaux individuels (WAV, MP3, MIDI en ZIP)"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/></svg> Morceaux</button>` : ''}
        <button class="btn btn-mini" data-act="rename" title="Renommer">✎</button>
        <button class="btn btn-mini btn-danger" data-act="delete" title="Supprimer">✕</button>
      </div>
      ${open ? detailsHTML(t) : ''}
      ${state.splitOpen.has(t.id) ? splitHTML(t) : ''}
      ${state.ytOpen.has(t.id) ? ytHTML(t) : ''}
    </div>`;
  }).join('');
  requestAnimationFrame(() => document.querySelectorAll('.track').forEach((el) => {
    const t = state.tracks.find((x) => x.id === el.dataset.id);
    drawPeaks(el.querySelector('canvas.mini'), t.waveform, state.current?.id === t.id && audio.duration ? audio.currentTime / audio.duration : 0, colorOf(t.style));
  }));
  mountEditors($('#libraryList'));
}
// résolution vidéo / miniature choisie dans le panneau YouTube (mémorisée par navigateur)
state.ytResSel = new Map();
const ytRes = (id) => state.ytResSel.get(id) || localStorage.getItem('st.ytRes') || state.yt.get(id)?.defaultResolution || '1080p';
const ytResLabel = (id) => ({ '720p': '720p', '1080p': '1080p', '2160p': '4K' })[ytRes(id)] || ytRes(id);
$('#libraryList').addEventListener('change', (e) => {
  const sel = e.target.closest('select[data-ytres]'); if (!sel) return;
  const id = sel.closest('.track')?.dataset.id; if (!id) return;
  state.ytResSel.set(id, sel.value); localStorage.setItem('st.ytRes', sel.value); renderLibrary();
});
// nom affiché sur la miniature / la vidéo (réglage global mémorisé par le serveur) ; brouillon gardé pendant la saisie
state.brandDraft = null;
$('#libraryList').addEventListener('input', (e) => { if (e.target.matches('input[data-ytbrand]')) state.brandDraft = e.target.value; });
$('#libraryList').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('input[data-ytbrand]')) { e.preventDefault(); e.target.closest('.yt-brand')?.querySelector('[data-act="ytbrand"]')?.click(); }
});
$('#libraryList').addEventListener('change', (e) => {
  if (e.target.matches('input[data-ytbrandhide]')) e.target.closest('.yt-brand')?.querySelector('[data-act="ytbrand"]')?.click();
});
async function applyBrand(id, box) {
  const name = box.querySelector('input[data-ytbrand]').value, hidden = box.querySelector('input[data-ytbrandhide]').checked;
  const b = await api('/api/youtube/brand', { method: 'PUT', body: JSON.stringify({ name, hidden }) });
  state.brandDraft = null;
  for (const [k, d] of state.yt) if (d && !d.error) d.brand = b;
  renderLibrary();
  state.yt.set(id, await api(`/api/tracks/${id}/thumbnail`, { method: 'POST', body: JSON.stringify({ resolution: ytRes(id) }) }));
  for (const other of state.ytOpen) if (other !== id) loadYt(other);
  renderLibrary();
  toast(b.hidden ? i18n('toast.brandOff') : i18n('toast.brandOn', { text: b.text }));
}
$('#sortSel').addEventListener('change', () => { state.sort = $('#sortSel').value; renderLibrary(); });

async function copyText(text) {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch {}
  // Repli pour http:// (pas de contexte sécurisé, ex. accès LAN au conteneur)
  const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
  document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch {} ta.remove(); return ok;
}
$('#libraryList').addEventListener('click', async (e) => {
  const go = e.target.closest('[data-goto]'); // v1.12.0 : lien original ↔ version régénérée
  if (go) { const c = $(`#libraryList .track[data-id="${go.dataset.goto}"]`); if (c) { e.preventDefault(); c.scrollIntoView({ behavior: 'smooth', block: 'center' }); c.classList.add('flash'); setTimeout(() => c.classList.remove('flash'), 1600); } return; }
  const btn = e.target.closest('[data-act]'); if (!btn) return;
  const el = e.target.closest('.track'); const t = state.tracks.find((x) => x.id === el.dataset.id); if (!t) return;
  const act = btn.dataset.act;
  try {
    if (act === 'play') { if (state.current?.id === t.id) togglePlay(); else play(t); }
    else if (act === 'seek') { const r = btn.getBoundingClientRect(); const p = (e.clientX - r.left) / r.width; if (state.current?.id !== t.id) await play(t); const go = () => { audio.currentTime = p * audio.duration; }; audio.duration ? go() : audio.addEventListener('loadedmetadata', go, { once: true }); }
    else if (act === 'variation' || act === 'remix') { const j = await api(`/api/tracks/${t.id}/variation`, { method: 'POST', body: JSON.stringify({ mode: act }) }); trackJob(j); toast(act === 'variation' ? i18n('toast.variation') : i18n('toast.remix')); $('#create').scrollIntoView(); }
    else if (act === 'regen') { btn.disabled = true; const j = await api(`/api/tracks/${t.id}/regenerate`, { method: 'POST', body: '{}' }); trackJob(j); toast(i18n('toast.regen', { title: t.title })); }
    else if (act === 'yt') { if (state.ytOpen.has(t.id)) state.ytOpen.delete(t.id); else { state.ytOpen.add(t.id); loadYt(t.id); loadPub(t.id); } renderLibrary(); }
    else if (await onPubAction(act, t, btn)) { /* v1.13.0 : publication, ZIP complet */ }
    else if (act.startsWith('ytcopy-')) { const d = ytTexts(state.yt.get(t.id)); const k = act.slice(7); const txt = k === 'tags' ? d.tags.join(', ') : d[k]; if (await copyText(txt)) toast({ title: i18n('toast.copyTitle'), description: i18n('toast.copyDesc'), tags: i18n('toast.copyTags') }[k]); else prompt(i18n('prompt.copyManual'), txt); }
    else if (act === 'split') { if (state.splitOpen.has(t.id)) state.splitOpen.delete(t.id); else { state.splitOpen.add(t.id); loadSplit(t.id); } renderLibrary(); }
    else if (act === 'splitgo') { btn.disabled = true; await startSplit(t.id, btn.closest('.split-panel')); }
    else if (act === 'splitvideos') { btn.disabled = true; await startSplitVideos(t.id, btn.closest('.split-videos')); }
    else if (act === 'splitdel') { if (confirm(i18n('confirm.splitDel'))) { await api(`/api/tracks/${t.id}/split`, { method: 'DELETE' }); await loadSplit(t.id); } }
    else if (act === 'ytlang') { await setYtLang(btn.dataset.lang); }
    else if (act === 'yttitles') { btn.disabled = true; await saveTitles(t, btn.closest('.yt-titles')); }
    else if (act === 'ytbrand') { btn.disabled = true; await applyBrand(t.id, btn.closest('.yt-brand')); }
    else if (act === 'ytthumb') { btn.disabled = true; state.yt.set(t.id, await api(`/api/tracks/${t.id}/thumbnail`, { method: 'POST', body: JSON.stringify({ resolution: ytRes(t.id) }) })); renderLibrary(); toast(i18n('toast.thumbDone')); }
    else if (act === 'ytvideo') { state.yt.set(t.id, await api(`/api/tracks/${t.id}/video`, { method: 'POST', body: JSON.stringify({ resolution: ytRes(t.id) }) })); renderLibrary(); pollYt(t.id); toast(i18n('toast.videoStart', { res: ytResLabel(t.id) })); }
    else if (act === 'details') { state.open.has(t.id) ? state.open.delete(t.id) : state.open.add(t.id); renderLibrary(); }
    else if (act === 'reuse') { applySettings(settingsOf(t)); genShowTrack(t.id); $('#settings').scrollIntoView({ behavior: 'smooth' }); toast(i18n('toast.settingsLoaded')); }
    else if (act === 'copy') {
      const json = JSON.stringify(settingsOf(t), null, 2);
      if (await copyText(json)) toast(i18n('toast.settingsCopied'));
      else prompt(i18n('prompt.copySettings'), JSON.stringify(settingsOf(t)));
    }
    else if (act === 'rename') {
      const title = prompt(i18n('prompt.titleFr'), t.title); if (title == null) return;
      const en = prompt('Titre anglais (vide = traduction automatique)', t.meta?.titleEnManual ? t.title_en : (title.trim() === t.title ? t.title_en : '')); if (en == null) return;
      const body = { title_en: en.trim() }; if (title.trim()) body.title = title;
      await api(`/api/tracks/${t.id}`, { method: 'PATCH', body: JSON.stringify(body) }); await loadLibrary(); if (state.ytOpen.has(t.id)) loadYt(t.id);
    }
    else if (act === 'delete') { if (confirm(`Supprimer « ${t.title} » ?`)) { if (state.current?.id === t.id) { audio.pause(); $('#player').hidden = true; state.current = null; } await api(`/api/tracks/${t.id}`, { method: 'DELETE' }); loadLibrary(); } }
  } catch (err) { toast(err.message); }
});

// ---------- découpage en morceaux individuels (générations > 30 min)
state.splitOpen = new Set(); state.split = new Map(); state.splitDraft = new Map();
const canSplit = (t) => t.duration > SPLIT_MIN && ((t.meta?.mix?.decks?.length || 0) >= 2 || (t.meta?.chapters || []).filter((c) => Number.isFinite(c.startSec)).length >= 2);
const fmtBytes = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(2).replace('.', ',')} Go` : `${Math.max(1, Math.round(b / 1e6))} Mo`);
async function loadSplit(id, mode) {
  try { state.split.set(id, await api(`/api/tracks/${id}/split${mode ? '?mode=' + mode : ''}`)); } catch (e) { state.split.set(id, { error: e.message }); }
  renderLibrary(); const j = state.split.get(id)?.job; if (j && (j.status === 'queued' || j.status === 'running')) pollSplit(id); else if (state.split.get(id)?.videos?.running) pollSplitVideos(id);
}
const splitPolls = new Set();
async function pollSplit(id) {
  if (splitPolls.has(id)) return; splitPolls.add(id);
  try {
    for (;;) {
      await new Promise((r) => setTimeout(r, 1000));
      const d = await api(`/api/tracks/${id}/split`); state.split.set(id, d);
      const el = document.querySelector(`.track[data-id="${id}"] .split-job`);
      if (el && d.job?.status === 'running') el.outerHTML = splitJobHTML(d); else renderLibrary();
      if (!d.job || d.job.status === 'done' || d.job.status === 'error') { if (d.job?.status === 'done') { if (d.result?.library?.length) await loadLibrary(); toast(i18n('toast.splitDone', { n: d.result?.pieces.length })); if (d.videos?.running) pollSplitVideos(id); } break; }
    }
  } catch (e) { toast(e.message); } finally { splitPolls.delete(id); }
}
async function startSplit(id, box) {
  const q = (s) => box.querySelector(s), body = { mode: q('[data-splitmode]:checked')?.value || 'mid', lang: q('[data-splitlang]:checked')?.value || state.ytLang,
    formats: { wav: q('[data-splitf="wav"]').checked, mp3: !!q('[data-splitf="mp3"]')?.checked, midi: q('[data-splitf="midi"]').checked }, library: q('[data-splitlib]').checked };
  if (q('[data-splitvid]')?.checked) { body.video = { resolution: q('select[name="splitres"]').value }; body.library = true; localStorage.setItem('st.ytRes', body.video.resolution); }
  try { state.split.set(id, await api(`/api/tracks/${id}/split`, { method: 'POST', body: JSON.stringify(body) })); renderLibrary(); pollSplit(id); toast(t('toast.splitStart')); }
  catch (e) { toast(e.message); renderLibrary(); }
}
$('#libraryList').addEventListener('change', (e) => {
  const i = e.target.closest('.split-panel input, .split-panel select'); if (!i) return; const id = i.closest('.track')?.dataset.id; if (!id) return;
  const box = i.closest('.split-panel'), dr = {};
  box.querySelectorAll('input, select').forEach((x) => { const k = x.name || x.dataset.splitf || (x.dataset.splitvid != null ? 'vid' : 'lib'); dr[k] = x.tagName === 'SELECT' ? x.value : x.type === 'radio' ? (x.checked ? x.value : dr[x.name]) : x.checked; });
  state.splitDraft.set(id, dr);
  if (i.matches('[data-splitmode]')) loadSplit(id, i.value); // aperçu des points de coupe du mode choisi
  else if (i.matches('[data-splitlang], [data-splitvid]')) renderLibrary();
});
function splitJobHTML(d) {
  const j = d.job; if (!j || j.status === 'done') return '<div class="split-job"></div>';
  if (j.status === 'error') return `<div class="split-job"><p class="err">Erreur : ${esc(j.error || '')}</p></div>`;
  return `<div class="split-job"><div class="bar"><i style="width:${Math.round((j.progress || 0) * 100)}%"></i></div><span class="hint">${j.status === 'queued' ? 'En file d\'attente…' : `${esc(j.stage || '')} · ${Math.round((j.progress || 0) * 100)} %${j.eta ? ' · reste ≈ ' + fmt(j.eta) : ''}`}</span></div>`;
}
function splitHTML(t) {
  const d = state.split.get(t.id);
  if (!d) return '<div class="split-panel"><p class="muted">Préparation du découpage…</p></div>';
  if (d.error) return `<div class="split-panel"><p class="err">${esc(d.error)}</p></div>`;
  if (!d.available) return `<div class="split-panel"><p class="hint">${esc(d.reason || 'Découpage indisponible.')}</p></div>`;
  const dr = state.splitDraft.get(t.id) || {}, R = d.result, running = d.job && (d.job.status === 'queued' || d.job.status === 'running');
  const mode = dr.splitmode || R?.mode || 'mid', lang = dr.splitlang || state.ytLang, on = (k, def = true) => (dr[k] ?? def);
  const plan = d.plan || [], ext = (f) => [on('wav') && 'wav', on('mp3', d.mp3) && d.mp3 && 'mp3'].filter(Boolean)[0] || 'mid';
  return `<div class="split-panel">
    <div class="split-cols">
      <div>
        <h4>Où couper</h4>
        ${d.kind === 'mix' ? d.modes.map((m) => `<label class="split-radio"><input type="radio" name="splitmode" data-splitmode value="${m.id}" ${mode === m.id ? 'checked' : ''}><span><b>${esc(m.label)}</b><br><span class="hint">${esc(m.help)}</span></span></label>`).join('')
          : '<p class="hint">Long morceau sans sous-morceaux : découpe à chaque chapitre (fondu de 15 ms).</p><input type="radio" name="splitmode" data-splitmode value="mid" checked hidden>'}
        <h4>Fichiers</h4>
        <div class="row">
          <label class="toggle"><input type="checkbox" data-splitf="wav" ${on('wav') ? 'checked' : ''}><span>WAV</span></label>
          ${d.mp3 ? `<label class="toggle"><input type="checkbox" data-splitf="mp3" ${on('mp3') ? 'checked' : ''}><span>MP3</span></label>` : ''}
          <label class="toggle"><input type="checkbox" data-splitf="midi" ${on('midi') ? 'checked' : ''} ${d.kind === 'mix' ? '' : 'disabled'}><span>MIDI par instrument</span></label>
        </div>
        <h4>Noms des fichiers</h4>
        <div class="row">
          <label class="toggle"><input type="radio" name="splitlang" data-splitlang value="fr" ${lang === 'fr' ? 'checked' : ''}><span>Français</span></label>
          <label class="toggle"><input type="radio" name="splitlang" data-splitlang value="en" ${lang === 'en' ? 'checked' : ''}><span>English</span></label>
        </div>
        <label class="toggle split-lib"><input type="checkbox" data-splitlib ${on('lib', false) || on('vid', false) ? 'checked' : ''} ${on('vid', false) ? 'disabled' : ''}><span>Ajouter chaque morceau à la bibliothèque (avec ses réglages, titres FR/EN, miniature)</span></label>
        <div class="row split-vidopt">
          <label class="toggle"><input type="checkbox" data-splitvid ${on('vid', false) ? 'checked' : ''}><span>Créer aussi une vidéo YouTube par morceau</span></label>
          ${resSelect(dr.splitres)}
        </div>
        <div class="row">
          <button class="btn btn-mini btn-primary" type="button" data-act="splitgo" ${running ? 'disabled' : ''}>${R ? 'Redécouper' : 'Découper'} en ${plan.length} morceaux</button>
          ${R && !running ? `<a class="btn btn-mini btn-primary" href="${R.zipUrl}" download>Télécharger le ZIP (${fmtBytes(R.zipBytes)})</a><button class="btn btn-mini" type="button" data-act="splitdel">Supprimer le ZIP</button>` : ''}
        </div>
        ${splitJobHTML(d)}
        ${R && !running ? `<p class="hint">Dernier découpage : ${esc((d.modes.find((m) => m.id === R.mode) || {}).label || R.mode)}, noms en ${R.lang === 'en' ? 'anglais' : 'français'}, ${R.files} fichiers${R.ms ? ` en ${(R.ms / 1000).toFixed(1).replace('.', ',')} s` : ''}${R.library?.length ? ` · ${R.library.length} morceaux dans la bibliothèque` : ''}.</p>` : ''}
        <p class="hint">Coupes exactes à l'échantillon près, fondu très court contre les clics. Le WAV source est lu en flux (aussi pour 4 h). Le ZIP contient aussi la liste des morceaux avec leurs minutages.</p>
      </div>
      <div>
        <h4>Morceaux (${plan.length})</h4>
        ${d.kind === 'mix' ? `<p class="hint">Vidéo complète : ses chapitres YouTube commencent au milieu de chaque transition, c'est-à-dire exactement aux coupes du mode « ${esc((d.modes.find((m) => m.id === 'mid') || {}).label || 'mid')} », avec les mêmes titres FR/EN que les morceaux.</p>` : ''}
        <ol class="split-list">${plan.map((p) => `<li><span class="mono">${fmt(p.start)} – ${fmt(p.end)}</span><span class="split-name" title="${esc(lang === 'en' ? p.title : p.title_en)}">${esc(String(p.n).padStart(2, '0'))} - ${esc(lang === 'en' ? p.title_en : p.title)}.${ext()}</span><span class="muted">${fmt(p.duration)}</span></li>`).join('')}</ol>
      </div>
    </div>
    ${splitVideosHTML(t, d)}
  </div>`;
}

// ---------- une vidéo YouTube par morceau découpé
const RES_OPTS = [['720p', '720p'], ['1080p', '1080p'], ['2160p', '4K']];
const resSelect = (v) => { v = v || localStorage.getItem('st.ytRes') || '1080p'; return `<select name="splitres" class="split-res" aria-label="Résolution des vidéos">${RES_OPTS.map(([k, l]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`; };
function splitVideosHTML(t, d) {
  const V = d.videos, dr = state.splitDraft.get(t.id) || {}, splitting = d.job && (d.job.status === 'queued' || d.job.status === 'running');
  if (!V || !V.total) return `<div class="split-videos"><h4>Vidéos YouTube des morceaux</h4><p class="hint">${splitting && d.job.video ? 'Les vidéos partiront dès la fin du découpage.' : 'Pour créer une vidéo par morceau, découpez avec « Créer aussi une vidéo YouTube par morceau » (ou « Ajouter à la bibliothèque »).'}</p></div>`;
  const L = state.ytLang, pct = (x) => Math.round((x.progress || 0) * 100);
  const st = (x) => x.status === 'done' ? `<span class="ok">Prête · ${({ '2160p': '4K' })[x.resolution] || x.resolution || ''}${x.lang === 'en' ? ' · EN' : ''}</span>`
    : x.status === 'running' ? `<div class="bar"><i style="width:${pct(x)}%"></i></div><span class="hint">${pct(x)} %${x.eta ? ' · reste ≈ ' + fmt(x.eta) : ''}</span>`
    : x.status === 'queued' ? '<span class="hint">En file d\'attente…</span>' : x.status === 'error' ? `<span class="err">Erreur : ${esc(x.error || '')}</span>` : '<span class="muted">Pas encore créée</span>';
  return `<div class="split-videos">
    <h4>Vidéos YouTube des morceaux · ${V.ready}/${V.total} prêtes</h4>
    <div class="row">
      ${resSelect(dr.splitres || V.request?.resolution)}
      <button class="btn btn-mini btn-primary" type="button" data-act="splitvideos" ${V.running || splitting ? 'disabled' : ''}>${V.ready ? 'Créer / mettre à jour' : 'Créer'} les ${V.total} vidéos (${L === 'en' ? 'EN' : 'FR'})</button>
      ${V.zip && !V.running ? `<a class="btn btn-mini" href="${V.zip}?lang=${L}" download>Tout télécharger (ZIP : vidéos, miniatures, textes FR/EN)</a>` : ''}
    </div>
    <p class="hint">Chaque vidéo reprend l'animation, la mise en page du texte et la langue (${L === 'en' ? 'anglais' : 'français'}, sélecteur du panneau YouTube) du mix ; chaque morceau a sa miniature, son titre, sa description et ses tags FR/EN (panneau YouTube du morceau dans la bibliothèque). Rendu une vidéo à la fois.</p>
    <ol class="split-vlist">${V.items.map((x) => `<li data-vid="${x.id}">
      ${x.thumb ? `<img src="${x.thumb}" alt="" loading="lazy">` : '<span class="split-vthumb"></span>'}
      <span class="split-name">${esc(String(x.n || '').padStart(2, '0'))} - ${esc(L === 'en' ? x.title_en : x.title)} <span class="muted">· ${fmt(x.duration)}</span></span>
      <span class="split-vst">${st(x)}</span>
      <span class="split-vdl">${x.video ? `<a href="${x.video}" download>MP4</a>` : ''}${x.thumb ? ` <a href="${x.thumb}" download>Miniature</a>` : ''}</span>
    </li>`).join('')}</ol>
  </div>`;
}
async function startSplitVideos(id, box) {
  const resolution = box.querySelector('select[name="splitres"]').value; localStorage.setItem('st.ytRes', resolution);
  try { const V = await api(`/api/tracks/${id}/split/videos`, { method: 'POST', body: JSON.stringify({ resolution, lang: state.ytLang }) }); const d = state.split.get(id); if (d) d.videos = V; renderLibrary(); pollSplitVideos(id); toast(i18n('toast.splitVideos', { res: ({ '2160p': '4K' })[resolution] || resolution })); }
  catch (e) { toast(e.message); renderLibrary(); }
}
const splitVidPolls = new Set();
async function pollSplitVideos(id) {
  if (splitVidPolls.has(id)) return; splitVidPolls.add(id);
  try {
    for (;;) {
      await new Promise((r) => setTimeout(r, 1500));
      if (!state.splitOpen.has(id)) break;
      const V = await api(`/api/tracks/${id}/split/videos`), d = state.split.get(id); if (!d) break; d.videos = V;
      const el = document.querySelector(`.track[data-id="${id}"] .split-videos`); if (el) el.outerHTML = splitVideosHTML({ id }, d);
      if (!V.running) { toast(i18n('toast.splitVideosDone', { ready: V.ready, total: V.total })); break; }
    }
  } catch (e) { toast(e.message); } finally { splitVidPolls.delete(id); }
}

// ---------- panneau « Infos YouTube »
async function loadYt(id) {
  try { const d = await api(`/api/tracks/${id}/youtube`); state.yt.set(id, d); if (d.lang === 'fr' || d.lang === 'en') { state.ytLang = d.lang; localStorage.setItem('st.ytLang', d.lang); } } catch (e) { state.yt.set(id, { error: e.message }); }
  renderLibrary(); const v = state.yt.get(id)?.video; if (v && (v.status === 'queued' || v.status === 'running')) pollYt(id);
}
const ytPolls = new Set();
async function pollYt(id) {
  if (ytPolls.has(id)) return; ytPolls.add(id);
  try {
    for (;;) {
      await new Promise((r) => setTimeout(r, 1000));
      const d = await api(`/api/tracks/${id}/youtube`); state.yt.set(id, d);
      const el = document.querySelector(`.track[data-id="${id}"] .yt-video`);
      if (el && d.video && d.video.status === 'running') el.outerHTML = ytVideoHTML(d, id); else renderLibrary();
      if (!d.video || d.video.status === 'done' || d.video.status === 'error') { if (d.video?.status === 'done') { await loadLibrary(); toast(i18n('toast.videoReady')); } break; }
    }
  } catch (e) { toast(e.message); } finally { ytPolls.delete(id); }
}
// langue des textes YouTube (titre, description, tags et textes dessinés) : mémorisée par le serveur et le navigateur
state.ytLang = localStorage.getItem('st.ytLang') === 'en' ? 'en' : 'fr';
const ytTexts = (d) => d?.langs?.[state.ytLang] || d;
async function setYtLang(l) {
  if (l !== 'fr' && l !== 'en' || l === state.ytLang) return;
  state.ytLang = l; localStorage.setItem('st.ytLang', l); renderLibrary();
  await api('/api/youtube/lang', { method: 'PUT', body: JSON.stringify({ lang: l }) });
  await Promise.all([...state.ytOpen].map((id) => loadYt(id))); // miniatures redessinées dans la langue choisie
  toast(l === 'en' ? i18n('toast.ytLangEn') : i18n('toast.ytLangFr'));
}
async function saveTitles(t, box) {
  const fr = box.querySelector('[data-yttitle="fr"]').value.trim(), en = box.querySelector('[data-yttitle="en"]').value.trim();
  if (!fr) { toast(i18n('toast.frTitleRequired')); return renderLibrary(); }
  const d = state.yt.get(t.id), body = {};
  if (fr !== t.title) body.title = fr;
  if (en !== (d?.trackTitle?.en || '')) body.title_en = en; // vide = traduction automatique
  state.titleDraft.delete(t.id);
  if (Object.keys(body).length) { await api(`/api/tracks/${t.id}`, { method: 'PATCH', body: JSON.stringify(body) }); await loadLibrary(); toast(i18n('toast.titlesSaved')); }
  await loadYt(t.id);
}
state.titleDraft = new Map();
$('#libraryList').addEventListener('input', (e) => {
  const i = e.target.closest('[data-yttitle]'); if (!i) return; const id = i.closest('.track')?.dataset.id; if (!id) return;
  const box = i.closest('.yt-titles'); state.titleDraft.set(id, { fr: box.querySelector('[data-yttitle="fr"]').value, en: box.querySelector('[data-yttitle="en"]').value });
});
function ytTitlesHTML(t, d) {
  const tt = d.trackTitle || { fr: t.title, en: t.title_en || '' }, dr = state.titleDraft.get(t.id) || {};
  return `<div class="yt-titles">
      <h4>Nom du morceau</h4>
      <label class="yt-tl"><span>FR</span><input type="text" data-yttitle="fr" maxlength="80" value="${esc(dr.fr ?? tt.fr)}" aria-label="Titre français" spellcheck="false"></label>
      <label class="yt-tl"><span>EN</span><input type="text" data-yttitle="en" maxlength="80" value="${esc(dr.en ?? (tt.enManual ? tt.en : ''))}" placeholder="${esc(tt.en)}" aria-label="Titre anglais" spellcheck="false"></label>
      <div class="row"><button class="btn btn-mini" data-act="yttitles" type="button">Enregistrer les titres</button><span class="hint">EN vide = traduction automatique (« ${esc(tt.en)} »).</span></div>
    </div>`;
}
function ytVideoHTML(d, id) {
  const v = d.video, cur = ytRes(id);
  const RES = d.resolutions || [{ id: '720p', label: '720p (1280×720)' }, { id: '1080p', label: '1080p (1920×1080)' }, { id: '2160p', label: '4K (3840×2160)' }];
  const SPEED = { '720p': '1 h ≈ 9 min, 4 h ≈ 22 min', '1080p': '1 h ≈ 11 min, 4 h ≈ 28 min', '2160p': '1 h ≈ 22 min, 4 h ≈ 1 h 10 (15 i/s, 12 i/s au-delà d\'1 h)' };
  const bar = v && (v.status === 'running' || v.status === 'queued') ? `<div class="bar"><i style="width:${Math.round((v.progress || 0) * 100)}%"></i></div><span class="hint">${v.status === 'queued' ? 'En file d\'attente…' : `Encodage ${Math.round((v.progress || 0) * 100)} %${v.eta ? ' · reste ≈ ' + fmt(v.eta) : ''}`}</span>` : '';
  const done = d.urls?.video && (!v || v.status === 'done');
  return `<div class="yt-video">
    <h4>Vidéo MP4 ${d.urls?.video && d.videoResolution ? esc((RES.find((r) => r.id === d.videoResolution) || {}).label || d.videoResolution) : ''}</h4>
    <label class="yt-res">Résolution (vidéo et miniature)
      <select data-ytres>${RES.map((r) => `<option value="${r.id}" ${r.id === cur ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}</select>
    </label>
    ${bar}
    ${v?.status === 'error' ? `<p class="err">Erreur : ${esc(v.error || '')}</p>` : ''}
    ${d.videoStale ? '<p class="hint warn">Le titre a changé depuis la création de la vidéo : regénère-la.</p>' : ''}
    ${!d.videoStale && d.videoStaleBrand ? '<p class="hint warn">Le nom affiché a changé depuis la création de la vidéo : recrée-la.</p>' : ''}
    ${!d.videoStale && !d.videoStaleBrand && d.videoStaleDesign ? '<p class="hint warn">Fond, mise en page ou langue modifiés depuis la création de la vidéo : recrée-la.</p>' : ''}
    <div class="row">
      ${!v || v.status === 'done' || v.status === 'error' ? `<button class="btn btn-mini ${done ? '' : 'btn-primary'}" data-act="ytvideo" type="button" ${d.ffmpeg === false ? 'disabled' : ''}>${done ? 'Recréer la vidéo' : 'Créer la vidéo'}</button>` : ''}
      ${done ? `<a class="btn btn-mini btn-primary" href="${d.urls.video}?download=1">Télécharger la vidéo</a>` : ''}
    </div>
    <p class="hint">${d.design?.background?.media ? 'Animation de fond en boucle + textes' : 'Fond fixe (titre, style)'} + spectre animé + chapitre courant + barre de progression ; audio AAC 384 kb/s. Durée d'encodage en ${esc((RES.find((r) => r.id === cur) || {}).label || cur)} : ${SPEED[cur] || '—'} (8 cœurs). 24 i/s jusqu'à 1 h, 15 i/s au-delà.</p>
  </div>`;
}
function ytBrandHTML(d) {
  const b = d.brand || { name: '', hidden: false, default: 'soundtube', max: 40 };
  const val = state.brandDraft ?? b.name, uid = 'ytb-' + Math.random().toString(36).slice(2, 8);
  return `<div class="yt-brand">
    <h4><label for="${uid}">Nom affiché sur la vidéo</label></h4>
    <div class="yt-field"><input id="${uid}" type="text" data-ytbrand maxlength="${b.max || 40}" autocomplete="off" spellcheck="false" placeholder="${esc(b.default || 'soundtube')}" value="${esc(val)}" ${b.hidden ? 'disabled' : ''} aria-describedby="${uid}-h"><button class="btn btn-mini" data-act="ytbrand" type="button">Appliquer</button></div>
    <label class="yt-check"><input type="checkbox" data-ytbrandhide ${b.hidden ? 'checked' : ''}> Aucun nom</label>
    <p class="hint" id="${uid}-h">Ex. le nom de ta chaîne (40 caractères max., sans emoji). Vide = « ${esc(b.default || 'soundtube')} ». Vaut pour toutes les miniatures, vidéos et descriptions.</p>
  </div>`;
}
function ytHTML(t) {
  const d = state.yt.get(t.id);
  if (!d) return '<div class="yt-panel"><p class="muted">Préparation des infos YouTube…</p></div>';
  if (d.error) return `<div class="yt-panel"><p class="err">${esc(d.error)}</p></div>`;
  const X = ytTexts(d), L = d.loudness, ok = (b) => (b ? '<i class="ok">✓</i>' : '<i class="ko">⚠</i>');
  const checks = [
    L ? `${ok(Math.abs(L.integrated - L.target) <= 0.5)} Loudness ${nf(L.integrated)} LUFS (cible ${nf(L.target)})` : `${ok(false)} Pas de mesure de loudness (morceau antérieur) : régénère-le pour le mastering -14 LUFS`,
    L ? `${ok(L.truePeak <= L.ceiling)} Crête vraie ${nf(L.truePeak)} dBTP (max ${nf(L.ceiling)})` : '',
    d.duplicates?.length ? `${ok(false)} ${esc(d.duplicates[0].label)} de « ${esc(d.duplicates[0].title)} » : évite de publier les deux` : `${ok(true)} Aucun doublon dans la bibliothèque`,
    d.chapters?.length ? `${ok(true)} ${d.chapters.length} chapitres dans la description` : '<i class="muted">–</i> Trop court ou trop uniforme pour des chapitres YouTube (3 × 10 s min.)',
    `${ok(true)} Balises ID3 / WAV, musique originale sans paroles`,
  ].filter(Boolean);
  return `<div class="yt-panel">
    <div class="yt-media">
      ${d.urls?.thumb ? `<img class="yt-thumb" src="${d.urls.thumb}" alt="Miniature YouTube" width="1280" height="720" loading="lazy">` : '<div class="yt-thumb empty">Miniature indisponible (ffmpeg absent)</div>'}
      <div class="row">${d.urls?.thumb ? `<a class="btn btn-mini" href="${d.urls.thumb.split('?')[0]}?download=1">Télécharger la miniature</a>` : ''}<button class="btn btn-mini" data-act="ytthumb" type="button" title="Regénère la miniature à la résolution choisie ci-dessous">Regénérer</button>${d.thumbResolution ? `<span class="hint">${esc(d.thumbResolution === '2160p' ? '4K' : d.thumbResolution)}</span>` : ''}</div>
      ${ytBrandHTML(d)}
      ${ytVideoHTML(d, t.id)}
      <h4>Vérifications</h4><ul class="yt-checks">${checks.map((c) => `<li>${c}</li>`).join('')}</ul>
    </div>
    <div class="yt-text">
      <div class="yt-lang"><span>Langue des textes</span><div class="seg seg-sm" role="radiogroup" aria-label="Langue des textes YouTube">${[['fr', 'Français'], ['en', 'English']].map(([l, n]) => `<button type="button" role="radio" aria-checked="${state.ytLang === l}" class="${state.ytLang === l ? 'on' : ''}" data-act="ytlang" data-lang="${l}" lang="${l}">${n}</button>`).join('')}</div><span class="hint">titre, description, tags, miniature et vidéo</span></div>
      <label>Titre <span class="hint">${X.title.length}/100</span></label>
      <div class="yt-field"><input type="text" readonly value="${esc(X.title)}" lang="${state.ytLang}"><button class="btn btn-mini" data-act="ytcopy-title" type="button">Copier</button></div>
      <label>Description <span class="hint">${X.description.length}/5000 · ${state.ytLang === 'en' ? 'chapitres et crédits en anglais' : 'chapitres inclus'}</span></label>
      <div class="yt-field"><textarea readonly rows="14" lang="${state.ytLang}">${esc(X.description)}</textarea><button class="btn btn-mini" data-act="ytcopy-description" type="button">Copier</button></div>
      <label>Tags <span class="hint">${X.tags.join(', ').length}/500</span></label>
      <div class="yt-field"><textarea readonly rows="3" lang="${state.ytLang}">${esc(X.tags.join(', '))}</textarea><button class="btn btn-mini" data-act="ytcopy-tags" type="button">Copier</button></div>
      ${ytTitlesHTML(t, d)}
      ${publishHTML(t)}
      ${socialHTML(t)}
      ${packHTML(t)}
    </div>
    ${editorSlot(t.id)}
  </div>`;
}

// ---------- lecteur
async function play(t) {
  ensureAudioGraph(); if (actx?.state === 'suspended') actx.resume();
  state.current = t; lastProg = -1;
  $('#player').hidden = false; $('#player').style.setProperty('--c', colorOf(t.style));
  audio.src = t.urls.mp3 || t.urls.wav;
  $('#pTitle').textContent = t.title;
  $('#pMeta').textContent = `${STYLE_LABEL[t.style]} · ${t.bpm} BPM · ${KEY_FR[t.key]} ${(SCALE_FR[t.scale] || '').split(' (')[0].toLowerCase()} · #${t.seed} · ${(t.meta?.progressions?.A || []).join(' – ')}`;
  $('#tDur').textContent = fmt(t.duration);
  $('#dlMp3').href = (t.urls.mp3 || '') + '?download=1'; $('#dlMp3').hidden = !t.urls.mp3;
  $('#dlWav').href = (t.urls.wav || '') + '?download=1'; $('#dlWav').hidden = !t.urls.wav;
  $('#dlMid').href = (t.urls.mid || '') + '?download=1';
  $('#dlZip').href = (t.urls.midzip || '') + '?download=1'; $('#dlZip').hidden = !t.urls.midzip;
  try { await audio.play(); } catch (e) { console.warn(e); }
  renderLibrary();
}
function togglePlay() { if (!state.current) return; ensureAudioGraph(); if (actx?.state === 'suspended') actx.resume(); audio.paused ? audio.play() : audio.pause(); }
$('#playBtn').addEventListener('click', togglePlay);
audio.addEventListener('play', () => { $('#icoPlay').toggleAttribute('hidden', true); $('#icoPause').toggleAttribute('hidden', false); renderLibrary(); });
audio.addEventListener('pause', () => { $('#icoPlay').toggleAttribute('hidden', false); $('#icoPause').toggleAttribute('hidden', true); renderLibrary(); });
audio.addEventListener('loadedmetadata', () => { $('#tDur').textContent = fmt(audio.duration); });
$('#volIn').addEventListener('input', (e) => (audio.volume = +e.target.value));
$('#waveCanvas').addEventListener('click', (e) => { if (!audio.duration) return; const r = e.currentTarget.getBoundingClientRect(); audio.currentTime = ((e.clientX - r.left) / r.width) * audio.duration; });
document.addEventListener('keydown', (e) => { if (e.code === 'Space' && !['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(document.activeElement.tagName) && state.current) { e.preventDefault(); togglePlay(); } });
addEventListener('resize', () => { lastProg = -1; renderLibrary(); });

async function boot() {
  await initI18n();
await refreshAuth();
// v1.21.1 — hide API docs links when not LAN
if (!isLocal()) {
  for (const a of document.querySelectorAll('a[href="/docs"], a[href="/api/docs"]')) {
    const prev = a.previousSibling;
    if (prev && prev.nodeType === 3 && /[·•|]/.test(prev.textContent)) prev.textContent = prev.textContent.replace(/\s*[·•|]\s*$/, '');
    const next = a.nextSibling;
    if (next && next.nodeType === 3 && /^\s*[·•|]/.test(next.textContent)) next.textContent = next.textContent.replace(/^\s*[·•|]\s*/, '');
    a.remove();
  }
}

await mountAuthMenu(document.getElementById('topAuth')).catch(() => {});
  mountLangSwitcher(document.querySelector('.topbar'));
  applyDom(document);
  await mountSiteFooter();
  onLangChange(async () => {
    applyDom(document);
    syncLangSwitchers();
    try { await loadOptions(); } catch {}
    try { renderLibrary(); } catch {}
    updateStatus();
  });
  initPubPanel({ api, toast, rerender: () => { if (!document.activeElement?.closest?.('[data-pubform]')) renderLibrary(); } });
  initGenForm({ api, toast, esc }).then(() => { if (state.style) genStyle(state.style); });
  ['input', 'change', 'click'].forEach((ev) => $('#libraryList').addEventListener(ev, onPubInput));
  initEditors({ api, toast, getTrack: (id) => state.tracks.find((x) => x.id === id), getYt: (id) => state.yt.get(id), onSaved: async (id) => { await Promise.all([...new Set([id, ...state.ytOpen])].map((x) => loadYt(x))); } });
  field.start();
  loadOptions().then(loadLibrary).then(() => {
    const q = new URLSearchParams(location.search), tid = q.get('track');
    const el = tid && document.querySelector(`.track[data-id="${CSS.escape(tid)}"]`);
    if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 2400); }
    if (q.get('tour') === '1') import('./tour.js?v=1.21.1').then((m) => m.startTour());
  }).catch((e) => toast(t('err.generic', { status: e.message }), 6000));
}
function updateStatus() {
  const busy = state.jobs.size > 0;
  const el = $('#statusText'); if (el) el.textContent = busy ? t('status.busy', { n: state.jobs.size }) : t('status.ready');
  $('#statusPill')?.classList.toggle('busy', busy);
}
boot();
