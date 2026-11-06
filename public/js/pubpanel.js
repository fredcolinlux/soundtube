import { t as tf } from './i18n.js';
// v1.13.0 : panneau YouTube › « Publier sur YouTube » + ZIP. v1.21.1 : Facebook Page + X.
import { queueHtml } from './pubqueue.js';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const P = { pub: new Map(), pack: new Map(), draft: new Map(), soc: new Map(), socDraft: new Map(), polls: new Set() };
let ctx = null; // { api, toast, rerender }
export function initPubPanel(c) { ctx = c; }
export async function loadPub(id, channelId) {
  try { P.pub.set(id, await ctx.api(`/api/tracks/${id}/publish${channelId ? '?channelId=' + encodeURIComponent(channelId) : ''}`)); } catch (e) { P.pub.set(id, { error: e.message }); }
  try { P.pack.set(id, await ctx.api(`/api/tracks/${id}/pack`)); } catch (e) { P.pack.set(id, { error: e.message }); }
  try { P.soc.set(id, await ctx.api(`/api/tracks/${id}/social`)); } catch (e) { P.soc.set(id, { error: e.message }); }
  ctx.rerender(); if (P.pack.get(id)?.state?.status === 'running' || (P.pub.get(id)?.queue || []).some((x) => ['queued', 'video', 'uploading'].includes(x.status))) poll(id);
}
const localDT = (iso) => { if (!iso) return ''; const d = new Date(iso), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
export function publishHTML(t) {
  const d = P.pub.get(t.id); if (!d) return `<div class="pub-form"><p class="muted">${esc(tf('pub.loading'))}</p></div>`;
  if (d.error) return `<div class="pub-form"><p class="err">${esc(d.error)}</p></div>`;
  const D = { title: d.title, description: d.description, tags: d.tags.join(', '), visibility: d.visibility, playlistId: d.playlistId, at: localDT(d.publishAt), thumb: d.thumbnail === 'auto', ...(P.draft.get(t.id) || {}) };
  const mock = d.transport === 'mock', running = (d.queue || []).some((x) => ['queued', 'video', 'uploading'].includes(x.status));
  const btn = !d.ready ? (d.channel ? tf('pub.impossibleToken') : tf('pub.impossibleChannel')) : mock ? tf('pub.publishSim') : tf('pub.publishYt');
  const readyMsg = d.ready
    ? (d.channel.styles.includes(t.style) ? tf('pub.readyStyle', { name: d.channel.name }) : tf('pub.readyDefault', { name: d.channel.name }))
    : `${esc(d.reason)} <a href="/admin#youtube">${tf('pub.openAdmin')}</a>`;
  return `<div class="pub-form" data-pubform>
    <h4>${esc(tf('pub.heading'))} ${mock ? `<span class="node-tag">${esc(tf('pub.simTag'))}</span>` : ''}</h4>
    <div class="pub-state ${d.ready ? 'ok' : 'bad'}">${readyMsg}</div>
    <div class="pub-grid">
      <div class="field"><label>${tf('pub.channel')}</label><select data-pubk="channelId">${d.channels.map((c) => `<option value="${esc(c.id)}" ${d.channel?.id === c.id ? 'selected' : ''}>${esc(c.name)}${c.ready ? '' : tf('pub.incomplete')}</option>`).join('') || `<option value="">${tf('pub.noChannel')}</option>`}</select></div>
      <div class="field"><label>${tf('pub.visibility')}</label><select data-pubk="visibility">${d.visibilities.map((v) => `<option value="${v.id}" ${D.visibility === v.id ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></div>
      <div class="field full"><label>${tf('pub.title')} <span class="hint">${D.title.length}/100</span></label><input type="text" data-pubk="title" maxlength="100" value="${esc(D.title)}"></div>
      <div class="field full"><label>${tf('pub.description')}</label><textarea data-pubk="description" rows="8" maxlength="5000">${esc(D.description)}</textarea></div>
      <div class="field full"><label>${tf('pub.tags')}</label><input type="text" data-pubk="tags" value="${esc(D.tags)}"></div>
      <div class="field"><label>${tf('pub.playlist')} <span class="opt">${tf('pub.playlistId')}</span></label><input type="text" data-pubk="playlistId" value="${esc(D.playlistId)}" placeholder="${tf('common.optional')}"></div>
      <div class="field"><label>${tf('pub.schedule')} <span class="opt">${tf('pub.scheduleHint')}</span></label><input type="datetime-local" data-pubk="at" value="${esc(D.at)}"></div>
      <div class="field full"><label class="toggle"><input type="checkbox" data-pubk="thumb" ${D.thumb ? 'checked' : ''}><span>${tf('pub.sendThumb')}</span></label></div>
    </div>
    <div class="pub-confirm"><span class="hint">${tf('pub.confirmHint')} <b>${esc(d.confirmWord)}</b></span><input type="text" data-pubk="confirm" autocomplete="off" spellcheck="false" ${d.ready ? '' : 'disabled'}>
      <button class="btn btn-primary" data-act="pubgo" type="button" ${d.ready && !running ? '' : 'disabled'}>${esc(btn)}</button></div>
    <p class="hint">${mock ? tf('pub.hintMock') : tf('pub.hintReal')}</p>
    ${(d.queue || []).length ? `<div class="yt-queue">${queueHtml(d.queue.slice().reverse())}</div>` : ''}
  </div>`;
}
// v1.14.0 : options du paquet (brouillon gardé entre deux rafraîchissements du panneau)
const PK_DEF = { video: true, videoRes: '', pieces: true, pieceVideo: false, pieceRes: '720p', wav: false, midi: true, txt: true, stems: false };
const pkOpts = (id) => ({ ...PK_DEF, ...(P.pack.get(id)?.state?.options || {}), ...(P.pkDraft?.get(id) || {}) });
const tree = (o, split, info = {}) => {
  const k = [o.pieceVideo && tf('pack.tree.videoMp4'), 'MP3', o.wav && 'WAV', o.txt && 'TXT'].filter(Boolean).join(', ');
  const n = (x) => (x != null ? (x > 1 ? tf('pack.tree.files_plural', { n: x }) : tf('pack.tree.files', { n: x })) : '');
  return `${tf('pack.tree.titleFolder')}\n├─ ${tf('pack.tree.readme')}\n├─ ${tf('pack.tree.manifest')}\n├─ video/               ${o.video ? tf('pack.tree.videoOn', { res: o.videoRes ? ' ' + o.videoRes : '' }) : tf('pack.tree.videoOff')}
${split && o.pieces ? '├' : '└'}─ mix/                 MP3${o.wav ? ' + WAV' : ''}${o.midi ? ' + MIDI' : ''}${split && o.pieces ? `
└─ ${tf('pack.tree.pieces')}            ${tf('pack.tree.pieceEx', { kinds: k })}${n(info.pieces)}${o.midi && split === 'mix' ? '\n   ├─ MIDI/' : ''}${o.stems ? '\n   └─ samples/         « 01 - Titre - batterie.wav »…' : ''}` : ''}`;
};
export function packHTML(t) {
  const d = P.pack.get(t.id); if (!d) return '';
  if (d.error) return `<div class="pack-box"><p class="err">${esc(d.error)}</p></div>`;
  const s = d.state, run = s?.status === 'running', o = pkOpts(t.id), sp = d.split && o.pieces;
  const ck = (k, label, dis = false) => `<label class="toggle small"><input type="checkbox" data-packk="${k}" ${o[k] ? 'checked' : ''} ${dis ? 'disabled' : ''}><span>${label}</span></label>`;
  const res = (k, def) => `<select data-packk="${k}" aria-label="${tf('pack.resAria')}">${def ? `<option value="" ${!o[k] ? 'selected' : ''}>${esc(def)}</option>` : ''}${[['720p', '720p'], ['1080p', '1080p'], ['2160p', '4K']].map(([v, l]) => `<option value="${v}" ${o[k] === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const splitHint = d.split
    ? (d.split === 'mix' ? tf('pack.splitMix') : tf('pack.splitChapter'))
    : tf('pack.single', { reason: d.splitReason || '—' });
  return `<div class="pack-box" data-packbox>
    <h4>${tf('pack.heading')}</h4>
    <p class="hint">${esc(splitHint)}</p>
    <div class="row">${ck('video', tf('pack.longVideo'))} ${res('videoRes', tf('pack.currentRes'))} ${ck('wav', tf('pack.wav'))} ${ck('midi', tf('pack.midi'))}</div>
    ${d.split ? `<div class="row">${ck('pieces', tf('pack.pieces'))} ${ck('txt', tf('pub.zipTxt'), !o.pieces)}</div>
    <div class="row">${ck('pieceVideo', tf('pack.pieceVideo'), !o.pieces)} ${res('pieceRes')}<span class="hint warn">${tf('pack.pieceVideoHint2')}</span></div>
    <div class="row">${ck('stems', tf('pack.stemsShort'), !o.pieces)}<span class="hint">${tf('pack.stemsExtra')}</span></div>` : ''}
    <div class="row"><button class="btn" data-act="packgo" type="button" ${run ? 'disabled' : ''}>${s?.status === 'done' ? tf('pack.recreate') : tf('pack.create')}</button>
      ${s?.status === 'done' ? `<a class="btn btn-primary" href="${s.url}">${tf('pack.downloadMb', { mb: (s.size / 1048576).toFixed(1) })}</a>` : ''}</div>
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
      if (wasPk === 'running' && pk.state?.status === 'done') ctx.toast(tf('toast.packReady'));
      const busy = pk.state?.status === 'running' || (pb.queue || []).some((x) => ['queued', 'video', 'uploading'].includes(x.status));
      if (!busy) break;
    }
  } catch (e) { ctx.toast(e.message); } finally { P.polls.delete(id); }
}

export function socialHTML(t) {
  const d = P.soc.get(t.id); if (!d) return '';
  if (d.error) return `<div class="soc-form"><p class="err">${esc(d.error)}</p></div>`;
  const draft = P.socDraft.get(t.id) || {};
  const lang = draft.lang || 'fr';
  const net = draft.network || 'facebook';
  const base = net === 'x'
    ? (lang === 'en' ? d.drafts?.xEn : d.drafts?.xFr)
    : (lang === 'en' ? d.drafts?.en : d.drafts?.fr);
  const text = draft.text != null ? draft.text : (base?.text || '');
  const link = draft.link != null ? draft.link : (base?.link || d.drafts?.youtubeUrl || '');
  const max = net === 'x' ? (d.x?.maxChars || 280) : 2000;
  const ready = net === 'facebook' ? d.facebook?.ready : d.x?.ready;
  const useCover = draft.useCover !== false;
  const hist = (d.history || []).slice().reverse();
  return `<div class="soc-form" data-socform>
    <h4>${esc(tf('soc.heading'))}</h4>
    <div class="row">
      <div class="seg seg-sm" role="radiogroup">${[['facebook','Facebook'],['x','X']].map(([v,l]) => `<button type="button" role="radio" data-sock="network" data-v="${v}" aria-checked="${net===v}" class="${net===v?'on':''}">${l}</button>`).join('')}</div>
      <div class="seg seg-sm" role="radiogroup">${[['fr','FR'],['en','EN']].map(([v,l]) => `<button type="button" role="radio" data-sock="lang" data-v="${v}" aria-checked="${lang===v}" class="${lang===v?'on':''}">${l}</button>`).join('')}</div>
    </div>
    <div class="pub-state ${ready ? 'ok' : 'bad'}">${ready ? esc(tf('soc.ready')) : `${esc(tf('soc.notReady'))} <a href="/admin#social">${esc(tf('soc.openAdmin'))}</a>`}</div>
    <div class="field full"><label>${tf('soc.text')} <span class="hint">${text.length}/${max}</span></label>
      <textarea data-sock="text" rows="4" maxlength="${max}">${esc(text)}</textarea></div>
    ${net === 'facebook' ? `<div class="field full"><label>${tf('soc.link')}</label><input type="url" data-sock="link" value="${esc(link)}" placeholder="https://…"></div>` : ''}
    <div class="field full"><label class="toggle"><input type="checkbox" data-sock="useCover" ${useCover ? 'checked' : ''}><span>${tf('soc.useCover')}</span></label></div>
    <div class="pub-confirm"><span class="hint">${tf('soc.confirmHint')} <b>${esc(d.confirmWord || 'PUBLISH')}</b></span>
      <input type="text" data-sock="confirm" autocomplete="off" spellcheck="false" ${ready ? '' : 'disabled'}>
      <button class="btn btn-primary" data-act="socgo" type="button" ${ready ? '' : 'disabled'}>${esc(net === 'x' ? tf('soc.publishX') : tf('soc.publishFb'))}</button></div>
    ${hist.length ? `<ul class="soc-hist hint">${hist.map((h) => `<li><b>${esc(h.network)}</b> ${esc(h.status)}${h.url ? ` · <a href="${esc(h.url)}" target="_blank" rel="noopener">link</a>` : ''}${h.error ? ' · ' + esc(h.error) : ''}</li>`).join('')}</ul>` : ''}
  </div>`;
}

/** Saisie dans le formulaire : mémorisée (le panneau est redessiné souvent). Renvoie true si l'évènement a été traité. */
export function onPubInput(e) {
  const sockBtn = e.target.closest('[data-sock][data-v]');
  if (sockBtn && (e.type === 'click' || e.type === 'change')) {
    const id = sockBtn.closest('.track')?.dataset.id; if (!id) return false;
    const k = sockBtn.dataset.sock, v = sockBtn.dataset.v;
    const cur = { ...(P.socDraft.get(id) || {}), [k]: v };
    if (k === 'network' || k === 'lang') { delete cur.text; delete cur.link; }
    P.socDraft.set(id, cur); ctx.rerender(); return true;
  }
  const s = e.target.closest('[data-sock]');
  if (s && !s.dataset.v) {
    const id = s.closest('.track')?.dataset.id; if (!id) return false;
    const k = s.dataset.sock;
    if (k === 'confirm') return true;
    P.socDraft.set(id, { ...(P.socDraft.get(id) || {}), [k]: s.type === 'checkbox' ? s.checked : s.value });
    if (k === 'text') { const hint = s.closest('.field')?.querySelector('.hint'); if (hint) { const max = s.getAttribute('maxlength') || ''; hint.textContent = `${s.value.length}/${max}`; } }
    return true;
  }
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
    try { const it = await ctx.api(`/api/tracks/${t.id}/publish`, { method: 'POST', body: JSON.stringify(body) }); P.draft.delete(t.id); ctx.toast(it.transport === 'mock' ? tf('toast.pubQueuedMock') : tf('toast.pubQueued')); await loadPub(t.id, body.channelId); poll(t.id); }
    catch (e) { btn.disabled = false; ctx.toast(e.message, 5000); }
    return true;
  }
  if (act === 'packgo') {
    const o = pkOpts(t.id); if (o.pieceVideo && o.pieces && !confirm(tf('confirm.pieceVideo'))) return true;
    btn.disabled = true; P.pack.set(t.id, await ctx.api(`/api/tracks/${t.id}/pack`, { method: 'POST', body: JSON.stringify({ ...o, videoRes: o.videoRes || undefined }) })); P.pkDraft?.delete(t.id); ctx.rerender(); poll(t.id); ctx.toast(tf('toast.packPreparing'));
    return true;
  }
  if (act === 'socgo') {
    const f = btn.closest('[data-socform]');
    const v = (k) => f.querySelector(`[data-sock="${k}"]:not([data-v])`);
    const draft = P.socDraft.get(t.id) || {};
    const body = {
      network: draft.network || 'facebook',
      lang: draft.lang || 'fr',
      text: v('text')?.value,
      link: v('link')?.value,
      useCover: v('useCover') ? v('useCover').checked : true,
      confirm: v('confirm')?.value.trim(),
    };
    btn.disabled = true;
    try {
      const it = await ctx.api(`/api/tracks/${t.id}/social`, { method: 'POST', body: JSON.stringify(body) });
      P.socDraft.delete(t.id);
      ctx.toast(it.mock ? tf('toast.socMock') : tf('toast.socDone'));
      P.soc.set(t.id, await ctx.api(`/api/tracks/${t.id}/social`));
      ctx.rerender();
    } catch (e) { btn.disabled = false; ctx.toast(e.message, 5000); }
    return true;
  }
  return false;
}
