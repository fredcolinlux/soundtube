// v1.13.0 : page Style › Publication YouTube (profil par style, chaîne liée, auto-publication avec confirmation, file du style).
import { t, onLangChange } from './i18n.js';
import { queueHtml, bindQueue } from './pubqueue.js';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const id = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] || '');
// v1.20.4 — anonymous Styles demo: preview only (no YouTube publish UI)
const __pubAuth = await fetch('/api/auth/status', { credentials: 'same-origin' }).then((r) => r.json()).catch(() => ({}));
const __pubDemo = !__pubAuth.authenticated;
if (__pubDemo) {
  const el = document.getElementById('publish');
  if (el) el.hidden = true;
}
async function api(method, url, body) {
  const r = await fetch(url, { method, credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(d.error || `Erreur ${r.status}`), { status: r.status }); return d;
}
let V = null;
const localDT = (iso) => { if (!iso) return ''; const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
function fill(P) {
  $('#pubTitle').value = P.title; $('#pubDesc').value = P.description; $('#pubTags').value = P.tags.join(', ');
  $('#pubAutoTags').checked = P.autoTags; $('#pubThumb').checked = P.thumbnail === 'auto'; $('#pubVis').value = P.visibility; $('#pubPlaylist').value = P.playlistId;
  $('#pubSched').value = P.schedule.mode; $('#pubDelay').value = P.schedule.delayHours || 24; $('#pubAt').value = localDT(P.schedule.at); sched();
  $('#pubAuto').checked = P.autoPublish; $('#pubConfirm').value = ''; confirmRow();
}
function sched() { const m = $('#pubSched').value; $('#pubDelay').hidden = m !== 'delay'; $('#pubAt').hidden = m !== 'at'; }
function confirmRow() { $('#pubConfirmRow').hidden = !($('#pubAuto').checked && !V?.profile.autoPublish); }
function render(v) {
  V = v;
  $('#pubMode').textContent = v.transport === 'mock' ? t('style.pubMock') : '';
  $('#pubWord').textContent = v.confirmWord;
  const st = $('#pubState');
  st.className = 'pub-state ' + (v.ready ? 'ok' : 'bad');
  st.textContent = v.ready ? t(v.profile.autoPublish ? 'style.pubReadyOn' : 'style.pubReadyOff', { name: v.channel.name, def: v.channelId ? '' : t('style.pubDefault') }) : v.reason;
  $('#pubChannel').innerHTML = `<option value="">${t('style.channelDefault')}${v.channels.find((c) => c.isDefault) ? ' (' + esc(v.channels.find((c) => c.isDefault).name) + ')' : ''}</option>` + v.channels.map((c) => `<option value="${esc(c.id)}" ${v.channelId === c.id ? 'selected' : ''}>${esc(c.name)}${c.ready ? '' : t('style.incomplete')}</option>`).join('');
  $('#pubVis').innerHTML = v.visibilities.map((x) => `<option value="${x.id}">${esc(x.label)}</option>`).join('');
  fill(v.profile);
  $('#pubQueue').innerHTML = queueHtml(v.queue, { empty: t('pub.queueEmpty') });
}
function collect() {
  const at = $('#pubAt').value ? new Date($('#pubAt').value).toISOString() : '';
  return { title: $('#pubTitle').value, description: $('#pubDesc').value, tags: $('#pubTags').value, autoTags: $('#pubAutoTags').checked, thumbnail: $('#pubThumb').checked ? 'auto' : 'none', visibility: $('#pubVis').value, playlistId: $('#pubPlaylist').value,
    schedule: { mode: $('#pubSched').value, delayHours: +$('#pubDelay').value || 24, at }, autoPublish: $('#pubAuto').checked };
}
async function load() { render(await api('GET', `/api/styles/${encodeURIComponent(id)}/publish`)); }
$('#pubSched').addEventListener('change', sched);
$('#pubAuto').addEventListener('change', confirmRow);
$('#pubSave').addEventListener('click', async () => {
  $('#pubMsg').textContent = '';
  try { render(await api('PUT', `/api/styles/${encodeURIComponent(id)}/publish`, { channelId: $('#pubChannel').value || null, profile: collect(), confirm: $('#pubConfirm').value.trim() })); $('#pubMsg').textContent = t('toast.pubProfileSaved'); }
  catch (e) { $('#pubMsg').textContent = e.message; }
});
$('#pubReset').addEventListener('click', () => { fill({ ...V.defaults, autoPublish: false }); $('#pubMsg').textContent = t('toast.pubDefaults'); });
bindQueue($('#pubQueue'), () => load().catch(() => {}));
if (id && !__pubDemo) { load().catch((e) => { $('#pubState').textContent = e.message; }); onLangChange(() => { load().catch(() => {}); }); setInterval(async () => { try { const q = await api('GET', `/api/publish/queue?style=${encodeURIComponent(id)}`); $('#pubQueue').innerHTML = queueHtml(q.items.slice(0, 50), { empty: t('pub.queueEmpty') }); } catch {} }, 5000); }
