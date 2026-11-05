// v1.13.0 : panneau YouTube › « Publier sur YouTube » (formulaire prérempli par le profil du style) et « ZIP complet ».
import { queueHtml } from './pubqueue.js';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const P = { pub: new Map(), pack: new Map(), draft: new Map(), polls: new Set() };
let ctx = null; // { api, toast, rerender }
export function initPubPanel(c) { ctx = c; }
export async function loadPub(id, channelId) {
  try { P.pub.set(id, await ctx.api(`/api/tracks/${id}/publish${channelId ? '?channelId=' + encodeURIComponent(channelId) : ''}`)); } catch (e) { P.pub.set(id, { error: e.message }); }
  try { P.pack.set(id, await ctx.api(`/api/tracks/${id}/pack`)); } catch (e) { P.pack.set(id, { error: e.message }); }
  ctx.rerender(); if (P.pack.get(id)?.state?.status === 'running' || (P.pub.get(id)?.queue || []).some((x) => ['queued', 'video', 'uploading'].includes(x.status))) poll(id);
}
const localDT = (iso) => { if (!iso) return ''; const d = new Date(iso), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
export function publishHTML(t) {
  const d = P.pub.get(t.id); if (!d) return '<div class="pub-form"><p class="muted">Chargement du formulaire de publication…</p></div>';
  if (d.error) return `<div class="pub-form"><p class="err">${esc(d.error)}</p></div>`;
  const D = { title: d.title, description: d.description, tags: d.tags.join(', '), visibility: d.visibility, playlistId: d.playlistId, at: localDT(d.publishAt), thumb: d.thumbnail === 'auto', ...(P.draft.get(t.id) || {}) };
  const mock = d.transport === 'mock', running = (d.queue || []).some((x) => ['queued', 'video', 'uploading'].includes(x.status));
  const btn = !d.ready ? `Publication impossible : ${d.channel ? 'jeton YouTube manquant' : 'aucune chaîne configurée'}` : mock ? 'Publier (simulation)' : 'Publier sur YouTube';
  return `<div class="pub-form" data-pubform>
    <h4>Publier sur YouTube ${mock ? '<span class="node-tag">simulation</span>' : ''}</h4>
    <div class="pub-state ${d.ready ? 'ok' : 'bad'}">${d.ready ? `Chaîne : « ${esc(d.channel.name)} »${d.channel.styles.includes(t.style) ? ' (chaîne du style)' : ' (chaîne par défaut)'}. Profil du style appliqué ; modifie ci-dessous avant l’envoi.` : `${esc(d.reason)} <a href="/admin#youtube">Ouvrir Admin</a>`}</div>
    <div class="pub-grid">
      <div class="field"><label>Chaîne</label><select data-pubk="channelId">${d.channels.map((c) => `<option value="${esc(c.id)}" ${d.channel?.id === c.id ? 'selected' : ''}>${esc(c.name)}${c.ready ? '' : ' — incomplète'}</option>`).join('') || '<option value="">Aucune chaîne</option>'}</select></div>
      <div class="field"><label>Visibilité</label><select data-pubk="visibility">${d.visibilities.map((v) => `<option value="${v.id}" ${D.visibility === v.id ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></div>
      <div class="field full"><label>Titre <span class="hint">${D.title.length}/100</span></label><input type="text" data-pubk="title" maxlength="100" value="${esc(D.title)}"></div>
      <div class="field full"><label>Description</label><textarea data-pubk="description" rows="8" maxlength="5000">${esc(D.description)}</textarea></div>
      <div class="field full"><label>Tags</label><input type="text" data-pubk="tags" value="${esc(D.tags)}"></div>
      <div class="field"><label>Playlist <span class="opt">(ID)</span></label><input type="text" data-pubk="playlistId" value="${esc(D.playlistId)}" placeholder="facultatif"></div>
      <div class="field"><label>Programmer <span class="opt">(vide = tout de suite)</span></label><input type="datetime-local" data-pubk="at" value="${esc(D.at)}"></div>
      <div class="field full"><label class="toggle"><input type="checkbox" data-pubk="thumb" ${D.thumb ? 'checked' : ''}><span>Envoyer la miniature soundtube</span></label></div>
    </div>
    <div class="pub-confirm"><span class="hint">Confirmation : tape <b>${esc(d.confirmWord)}</b></span><input type="text" data-pubk="confirm" autocomplete="off" spellcheck="false" ${d.ready ? '' : 'disabled'}>
      <button class="btn btn-primary" data-act="pubgo" type="button" ${d.ready && !running ? '' : 'disabled'}>${esc(btn)}</button></div>
    <p class="hint">La vidéo est rendue si besoin, puis envoyée. ${mock ? 'Mode simulation : rien ne part sur YouTube.' : 'Envoi réel sur la chaîne choisie.'}</p>
    ${(d.queue || []).length ? `<div class="yt-queue">${queueHtml(d.queue.slice().reverse())}</div>` : ''}
  </div>`;
}
// v1.14.0 : options du paquet (brouillon gardé entre deux rafraîchissements du panneau)
const PK_DEF = { video: true, videoRes: '', pieces: true, pieceVideo: false, pieceRes: '720p', wav: false, midi: true, txt: true, stems: false };
const pkOpts = (id) => ({ ...PK_DEF, ...(P.pack.get(id)?.state?.options || {}), ...(P.pkDraft?.get(id) || {}) });
const tree = (o, split, info = {}) => {
  const k = [o.pieceVideo && 'vidéo MP4', 'MP3', o.wav && 'WAV', o.txt && 'TXT'].filter(Boolean).join(', ');
  const n = (x) => (x != null ? ` (${x} fichier${x > 1 ? 's' : ''})` : '');
  return `nom-du-morceau/
├─ LISEZMOI.txt
├─ manifest.json        tempo, tonalité, graine, style par morceau
├─ video/               ${o.video ? `la vidéo MP4${o.videoRes ? ' ' + o.videoRes : ''}` : '(vidéo non demandée)'}
${split && o.pieces ? '├' : '└'}─ mix/                 MP3${o.wav ? ' + WAV' : ''}${o.midi ? ' + MIDI' : ''}${split && o.pieces ? `
└─ morceaux/            « 01 - Titre » : ${k}${n(info.pieces)}${o.midi && split === 'mix' ? '\n   ├─ MIDI/' : ''}${o.stems ? '\n   └─ samples/         « 01 - Titre - batterie.wav »…' : ''}` : ''}`;
};
export function packHTML(t) {
  const d = P.pack.get(t.id); if (!d) return '';
  if (d.error) return `<div class="pack-box"><p class="err">${esc(d.error)}</p></div>`;
  const s = d.state, run = s?.status === 'running', o = pkOpts(t.id), sp = d.split && o.pieces;
  const ck = (k, label, dis = false) => `<label class="toggle small"><input type="checkbox" data-packk="${k}" ${o[k] ? 'checked' : ''} ${dis ? 'disabled' : ''}><span>${label}</span></label>`;
  const res = (k, def) => `<select data-packk="${k}" aria-label="Résolution">${def ? `<option value="" ${!o[k] ? 'selected' : ''}>${esc(def)}</option>` : ''}${[['720p', '720p'], ['1080p', '1080p'], ['2160p', '4K']].map(([v, l]) => `<option value="${v}" ${o[k] === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  return `<div class="pack-box" data-packbox>
    <h4>ZIP complet</h4>
    <p class="hint">${d.split ? `Découpe à la volée : ${d.split === 'mix' ? 'un morceau par titre du mix' : 'un morceau par chapitre'}.` : `Morceau unique (${esc(d.splitReason || 'ni mix DJ ni chapitres')}) : pas de dossier morceaux/.`}</p>
    <div class="row">${ck('video', 'Vidéo longue')} ${res('videoRes', 'résolution actuelle')} ${ck('wav', 'WAV')} ${ck('midi', 'MIDI')}</div>
    ${d.split ? `<div class="row">${ck('pieces', 'Morceaux découpés')} ${ck('txt', 'TXT par morceau', !o.pieces)}</div>
    <div class="row">${ck('pieceVideo', 'Une vidéo par morceau', !o.pieces)} ${res('pieceRes')}<span class="hint warn">long à rendre, 720p par défaut ; les morceaux sont ajoutés à la bibliothèque</span></div>
    <div class="row">${ck('stems', 'Samples (stems par groupe d’instruments)', !o.pieces)}<span class="hint">5 rendus supplémentaires</span></div>` : ''}
    <div class="row"><button class="btn" data-act="packgo" type="button" ${run ? 'disabled' : ''}>${s?.status === 'done' ? 'Recréer le ZIP' : 'Créer le ZIP complet'}</button>
      ${s?.status === 'done' ? `<a class="btn btn-primary" href="${s.url}">Télécharger (${(s.size / 1048576).toFixed(1)} Mo)</a>` : ''}</div>
    ${run ? `<div class="p-job"><div class="p-bar"><span style="width:${Math.round(100 * (s.progress || 0))}%"></span></div><span>${esc(s.stage || '')} ${Math.round(100 * (s.progress || 0))} %</span></div>` : ''}
    ${s?.status === 'error' ? `<p class="err">${esc(s.error)}</p>` : ''}
    <pre class="pack-tree">${esc(tree(o, d.split, { pieces: s?.status === 'done' ? s.pieces : null }))}</pre>
  </div>`;
}
async function poll(id) {
  if (P.polls.has(id)) return; P.polls.add(id);
  try {
    for (;;) {
      await new Promise((r) => setTimeout(r, 1200));
      const [pk, pb] = await Promise.all([ctx.api(`/api/tracks/${id}/pack`), ctx.api(`/api/tracks/${id}/publish${P.pub.get(id)?.channel ? '?channelId=' + P.pub.get(id).channel.id : ''}`)]);
      const wasPk = P.pack.get(id)?.state?.status; P.pack.set(id, pk); P.pub.set(id, pb); ctx.rerender();
      if (wasPk === 'running' && pk.state?.status === 'done') ctx.toast('ZIP complet prêt 📦');
      const busy = pk.state?.status === 'running' || (pb.queue || []).some((x) => ['queued', 'video', 'uploading'].includes(x.status));
      if (!busy) break;
    }
  } catch (e) { ctx.toast(e.message); } finally { P.polls.delete(id); }
}
/** Saisie dans le formulaire : mémorisée (le panneau est redessiné souvent). Renvoie true si l'évènement a été traité. */
export function onPubInput(e) {
  const q = e.target.closest('[data-packk]'); if (q) { const id = q.closest('.track')?.dataset.id; if (!id) return false; (P.pkDraft ||= new Map()).set(id, { ...(P.pkDraft.get(id) || {}), [q.dataset.packk]: q.type === 'checkbox' ? q.checked : q.value }); if (e.type === 'change') ctx.rerender(); return true; }
  const i = e.target.closest('[data-pubk]'); if (!i) return false; const id = i.closest('.track')?.dataset.id; if (!id) return false;
  const k = i.dataset.pubk;
  if (k === 'channelId') { if (e.type === 'change') { P.draft.delete(id); loadPub(id, i.value); } return true; }
  if (k === 'confirm') return true;
  P.draft.set(id, { ...(P.draft.get(id) || {}), [k]: i.type === 'checkbox' ? i.checked : i.value }); return true;
}
export async function onPubAction(act, t, btn) {
  if (act === 'pubgo') {
    const f = btn.closest('[data-pubform]'), v = (k) => f.querySelector(`[data-pubk="${k}"]`);
    const at = v('at').value ? new Date(v('at').value).toISOString() : '';
    const body = { channelId: v('channelId').value, title: v('title').value, description: v('description').value, tags: v('tags').value, visibility: v('visibility').value, playlistId: v('playlistId').value,
      thumbnail: v('thumb').checked ? 'auto' : 'none', autoTags: false, schedule: at ? { mode: 'at', at } : { mode: 'none' }, confirm: v('confirm').value.trim() };
    btn.disabled = true;
    try { const it = await ctx.api(`/api/tracks/${t.id}/publish`, { method: 'POST', body: JSON.stringify(body) }); P.draft.delete(t.id); ctx.toast(it.transport === 'mock' ? 'Envoi simulé ajouté à la file.' : 'Envoi ajouté à la file de publication.'); await loadPub(t.id, body.channelId); poll(t.id); }
    catch (e) { btn.disabled = false; ctx.toast(e.message, 5000); }
    return true;
  }
  if (act === 'packgo') {
    const o = pkOpts(t.id); if (o.pieceVideo && o.pieces && !confirm('Une vidéo par morceau : chaque morceau est rendu en vidéo (long), et ajouté à la bibliothèque. Le ZIP attendra la fin des rendus. Continuer ?')) return true;
    btn.disabled = true; P.pack.set(t.id, await ctx.api(`/api/tracks/${t.id}/pack`, { method: 'POST', body: JSON.stringify({ ...o, videoRes: o.videoRes || undefined }) })); P.pkDraft?.delete(t.id); ctx.rerender(); poll(t.id); ctx.toast('Préparation du ZIP complet…');
    return true;
  }
  return false;
}
