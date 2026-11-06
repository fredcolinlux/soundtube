import { t } from './i18n.js';
// v1.14.0 : formulaire de génération — choix de l'animation de la vidéo (par style) et paquet ZIP coché d'avance.
let D = null; // { api, toast, esc, style() }
let media = { items: [] }, cur = { style: null, media: null }, shown = null; // shown = { trackId, media, scope, override }
const PACK_KEY = 'st.packOpts', WATCH_KEY = 'st.packWatch';
const PACK_DEF = { on: false, video: true, videoRes: '1080p', pieces: true, pieceVideo: false, pieceRes: '720p', wav: true, midi: true, txt: true, stems: false, pc: false };
const $ = (s) => document.querySelector(s);
const loadPack = () => { try { return { ...PACK_DEF, ...JSON.parse(localStorage.getItem(PACK_KEY) || '{}') }; } catch { return { ...PACK_DEF }; } };
const savePack = (o) => localStorage.setItem(PACK_KEY, JSON.stringify(o));

export async function initGenForm(deps) {
  D = deps;
  try { media = await D.api('/api/media'); } catch { media = { items: [] }; }
  renderPackOpts();
  $('#animPick')?.addEventListener('click', onPick);
  $('#animPick')?.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-anim]')) { e.preventDefault(); onPick(e); } });
  $('#animPick')?.addEventListener('pointerover', (e) => { const c = e.target.closest('[data-anim]'); if (c) play(c); });
  $('#animPick')?.addEventListener('pointerout', (e) => { const c = e.target.closest('[data-anim]'); if (c && !c.contains(e.relatedTarget)) stop(c); });
  $('#packOpts')?.addEventListener('change', onPackInput);
  for (const w of watched()) watch(w.id, w.title);
}

/** Style choisi dans le formulaire : relit l'animation mémorisée pour ce style. */
export async function onStyle(style) {
  if (!D) return; cur.style = style; shown = null;
  try { const r = await D.api(`/api/styles/${style}/animation`); if (cur.style === style) cur.media = r.media || null; } catch { cur.media = null; }
  renderAnim();
}
/** Réglages d'un morceau rechargés : montre l'animation réellement utilisée par sa vidéo (et si le panneau YouTube la remplace). */
export async function showTrack(id) {
  try { const r = await D.api(`/api/tracks/${id}/animation`); shown = { trackId: id, ...r }; renderAnim(); } catch { shown = null; }
}
/** Ajouts au corps de /api/generate. */
export function genExtras() {
  const o = loadPack(), out = { animation: cur.media || null };
  if (o.pc) { out.pcCombo = true; if (!o.on) out.pack = { video: true, videoRes: o.videoRes, pieces: o.pieces, pieceVideo: o.pieces && o.pieceVideo, pieceRes: o.pieceRes, wav: true, midi: true, txt: true, stems: o.pieces && o.stems }; } // v1.16.0 : tout sur le PC, ZIP unique
  if (o.on) out.pack = { video: o.video, videoRes: o.videoRes, pieces: o.pieces, pieceVideo: o.pieces && o.pieceVideo, pieceRes: o.pieceRes, wav: o.wav, midi: o.midi, txt: o.txt, stems: o.pieces && o.stems };
  return out;
}

function tile(id, label, img, video, kind) {
  const on = (cur.media || null) === (id || null);
  return `<div class="an-tile ${on ? 'on' : ''}" role="radio" tabindex="0" aria-checked="${on}" data-anim="${id || ''}" ${video ? `data-src="${video}"` : ''} title="${D.esc(label)}">
    <div class="an-media"><img src="${img}" alt="" loading="lazy">${video ? '<span class="an-play" aria-hidden="true">▶</span>' : ''}</div>
    <span class="an-label">${D.esc(label)}</span>${kind ? `<span class="an-kind">${D.esc(kind)}</span>` : ''}</div>`;
}
function renderAnim() {
  const el = $('#animPick'); if (!el || !cur.style) return;
  const items = media.items || [], label = (id) => items.find((m) => m.id === id)?.name || t('anim.styleBg');
  const tiles = [tile(null, t('anim.styleBg'), `/api/youtube/base.jpg?style=${encodeURIComponent(cur.style)}`, null, t('anim.gradient')),
    ...items.map((m) => tile(m.id, m.name, `/api/media/${m.id}/poster.jpg`, m.kind === 'video' || m.kind === 'gif' ? `/api/media/${m.id}/file` : null, m.kind === 'video' ? `${t('anim.kindVideo')}${m.duration ? ' · ' + Math.round(m.duration) + ' s' : ''}` : m.kind === 'gif' ? 'GIF' : t('anim.kindImage')))];
  let note = '';
  if (shown) {
    note = shown.override
      ? `<p class="an-note warn">${D.esc(t('anim.noteOverride', { name: shown.item?.name || t('anim.styleBg') }))}</p>`
      : `<p class="an-note">${D.esc(t('anim.noteReload', { name: shown.item?.name || t('anim.styleBg'), scope: shown.scope === 'generation' ? t('anim.scopeGen') : t('anim.scopeCommon') }))}</p>`;
  }
  el.innerHTML = `<div class="an-head"><b>${t('anim.title')}</b><span class="hint">mémorisée pour ce style · utilisée par la vidéo longue et par chaque vidéo de morceau · modifiable ensuite dans le panneau YouTube (pour ce morceau seulement)</span></div>
    <div class="an-grid" role="radiogroup" aria-label="${t('anim.aria')}">${tiles.join('')}</div>
    ${items.length ? '' : `<p class="an-empty">${t('media.empty')} <a href="/admin#media">${t('anim.importLink')}</a></p>`}
    <p class="hint an-cur">Choix pour ce style : <b>${D.esc(label(cur.media))}</b></p>${note}`;
}
async function onPick(e) {
  const c = e.target.closest('[data-anim]'); if (!c) return;
  const id = c.dataset.anim || null;
  play(c, 4000);
  if ((cur.media || null) === id) return;
  try { const r = await D.api(`/api/styles/${cur.style}/animation`, { method: 'PUT', body: JSON.stringify({ media: id }) }); cur.media = r.media || null; renderAnim(); D.toast(t('anim.saved', { name: id ? media.items.find((m) => m.id === id)?.name : t('anim.styleBg') })); }
  catch (err) { D.toast(err.message); }
}
// aperçu : quelques secondes du vrai mouvement au survol ou au clic
function play(c, ms = 0) {
  const src = c.dataset.src, box = c.querySelector('.an-media'); if (!src || !box || box.querySelector('video, .an-gif')) return;
  const isGif = /\.gif|gif/i.test(c.querySelector('.an-kind')?.textContent || '');
  const v = isGif ? Object.assign(document.createElement('img'), { src, className: 'an-gif' }) : Object.assign(document.createElement('video'), { src, muted: true, autoplay: true, loop: true, playsInline: true });
  if (!isGif) { v.muted = true; v.play?.().catch(() => {}); }
  box.appendChild(v); clearTimeout(c._t); c._t = setTimeout(() => stop(c), ms || 6000);
}
function stop(c) { clearTimeout(c._t); c.querySelectorAll('.an-media video, .an-media .an-gif').forEach((v) => v.remove()); }

// ---------- paquet ZIP coché d'avance
function renderPackOpts() {
  const el = $('#packOpts'); if (!el) return; const o = loadPack();
  const ck = (k, label, extra = '') => `<label class="toggle small"><input type="checkbox" data-pk="${k}" ${o[k] ? 'checked' : ''} ${extra}><span>${label}</span></label>`;
  const res = (k) => `<select data-pk="${k}" aria-label="${t('pack.resAria')}">${[['720p', '720p'], ['1080p', '1080p'], ['2160p', '4K']].map(([v, l]) => `<option value="${v}" ${o[k] === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  el.innerHTML = `<label>Paquet ZIP</label>
    <div class="row">${ck('on', '<b>' + t('pack.prepare') + '</b>')}</div>
    <div class="row pk-pc">${ck('pc', '<b>' + t('pack.pcCombo') + '</b>')}<span class="hint">${o.pc ? t('pack.pcOn') : t('pack.pcOff')}</span></div>
    <div class="pk-more" ${o.on ? '' : 'hidden'}>
      <div class="row">${ck('video', t('pack.longVideo'))} ${res('videoRes')}</div>
      <div class="row">${ck('pieces', t('pack.piecesDetail'))}</div>
      <div class="row pk-sub">${ck('pieceVideo', t('pack.pieceVideo'), o.pieces ? '' : 'disabled')} ${res('pieceRes')}<span class="hint warn">${t('pack.pieceVideoHint')}</span></div>
      <div class="row pk-sub">${ck('stems', t('pack.stems'), o.pieces ? '' : 'disabled')}<span class="hint">${t('pack.stemsHint')}</span></div>
      <div class="row">${ck('wav', 'WAV (mix + morceaux)')} ${ck('midi', 'MIDI')} ${ck('txt', 'TXT par morceau')}</div>
      <p class="hint">${t('pack.treeHint')}</p>
    </div><div id="packWatch" class="pk-watch"></div>`;
}
function onPackInput(e) {
  const i = e.target.closest('[data-pk]'); if (!i) return; const o = loadPack();
  o[i.dataset.pk] = i.type === 'checkbox' ? i.checked : i.value; savePack(o);
  if (['on', 'pieces', 'pc'].includes(i.dataset.pk)) { const w = $('#packWatch')?.innerHTML; renderPackOpts(); if (w) $('#packWatch').innerHTML = w; }
}

// ---------- suivi des paquets automatiques
const watched = () => { try { return JSON.parse(localStorage.getItem(WATCH_KEY) || '[]'); } catch { return []; } };
const setWatched = (L) => localStorage.setItem(WATCH_KEY, JSON.stringify(L.slice(-8)));
const boxes = new Map();
export function watch(id, title) {
  if (!watched().some((w) => w.id === id)) setWatched([...watched(), { id, title }]);
  if (boxes.has(id)) return; boxes.set(id, { title, html: '' }); tick(id);
}
const mb = (n) => `${(n / 1048576).toFixed(n > 1e8 ? 0 : 1).replace('.', ',')} Mo`;
async function tick(id) {
  const b = boxes.get(id); if (!b) return;
  let r = null, wait = 2500;
  try { r = await D.api(`/api/tracks/${id}/pack`); } catch (e) { if (/introuvable|pas terminé/i.test(e.message)) { let st = ''; try { st = (await D.api(`/api/jobs/${id}`)).stage || ''; } catch {} b.html = `<div class="pk-job"><b>${D.esc(b.title)}</b> · ${st ? D.esc(st) : t('pack.waitingMusic')}, ${t('pack.waiting')}</div>`; } }
  const s = r?.state;
  if (r && !s) b.html = `<div class="pk-job"><b>${D.esc(b.title)}</b> · ZIP en attente…</div>`;
  if (s?.status === 'running') b.html = `<div class="pk-job"><b>ZIP complet de « ${D.esc(b.title)} »</b> · ${D.esc(s.stage || '')}${/%/.test(s.stage || '') ? '' : ` · ${Math.round((s.progress || 0) * 100)} %`}<div class="bar"><i style="width:${Math.round((s.progress || 0) * 100)}%"></i></div></div>`;
  if (s?.status === 'done') { const rw = r.render ? (r.render.where === 'node' ? t('pack.renderNode', { node: r.render.node || '', combo: r.render.combo ? t('pack.renderCombo') : '' }) : r.render.fallback ? t('pack.renderFallback') : '') : ''; const n = s.pieces || 1; const pc = n > 1 ? t('pack.pieceCount_plural', { n }) : t('pack.pieceCount', { n }); b.html = `<div class="pk-job ok"><b>${D.esc(t('pack.readyHtml', { title: b.title }))}</b> · ${rw}${pc} · ${mb(s.size || 0)} · <a class="btn btn-mini btn-primary" href="${s.url}" download>${t('pack.download')}</a> <button class="btn btn-mini btn-ghost" type="button" data-pkclose="${id}">${t('pack.hide')}</button></div>`; if (!b.announced) { b.announced = true; D.toast(t('pack.readyToast', { title: b.title }), 6000); } wait = 0; }
  if (s?.status === 'error') { b.html = `<div class="pk-job error"><b>ZIP complet de « ${D.esc(b.title)} »</b> · erreur : ${D.esc(s.error || '')} <button class="btn btn-mini btn-ghost" type="button" data-pkclose="${id}">${t('pack.hide')}</button></div>`; wait = 0; }
  renderWatch(); if (wait) setTimeout(() => tick(id), wait);
}
function renderWatch() {
  const el = $('#packWatch'); if (!el) return;
  el.innerHTML = [...boxes.values()].map((b) => b.html).join('');
  el.onclick = (e) => { const c = e.target.closest('[data-pkclose]'); if (!c) return; boxes.delete(c.dataset.pkclose); setWatched(watched().filter((w) => w.id !== c.dataset.pkclose)); renderWatch(); };
}
