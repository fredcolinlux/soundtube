// v1.13.0 : Admin › Chaînes YouTube (secrets masqués : l'API ne renvoie que « présent / absent » et un masque du client ID).
import { queueHtml, bindQueue } from './pubqueue.js';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function toast(msg, ms = 3200) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms); }
async function api(method, url, body) {
  const r = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || `Erreur ${r.status}`); return d;
}
let V = null;
const flag = (ok, label) => `<span class="node-tag ${ok ? '' : 'tag-miss'}">${label} ${ok ? '✓' : 'manquant'}</span>`;
function render(v) {
  V = v;
  $('#ytMode').textContent = v.transport === 'mock' ? 'Mode simulation (SOUNDTUBE_YT_TRANSPORT=mock) : aucun envoi réel' : `Envoi réel : confirmation « ${v.confirmWord} » exigée`;
  $('#ytChannels').innerHTML = v.channels.length ? v.channels.map((c) => `<div class="node-row ${c.ready ? 'up' : 'down'}" data-cid="${esc(c.id)}">
    <span class="node-dot" title="${c.ready ? 'Prête' : 'Incomplète'}"></span>
    <div class="node-main"><div class="node-title"><b>${esc(c.name)}</b>${c.isDefault ? '<span class="node-tag">par défaut</span>' : ''}</div>
      <div class="node-url">${c.channelId ? esc(c.channelId) : 'ID de chaîne non renseigné'}${c.clientId ? ' · client ' + esc(c.clientId) : ''}</div>
      <div class="node-meta">${flag(c.hasClientId, 'client ID')}${flag(c.hasClientSecret, 'secret')}${flag(c.hasRefreshToken, 'jeton')}<span>${c.styles.length ? 'Styles : ' + c.styles.map((s) => esc(v.styles.find((x) => x.id === s)?.label || s)).join(', ') : c.isDefault ? 'Styles sans liaison' : 'Aucun style lié'}</span></div></div>
    <div class="node-actions">${c.isDefault ? '' : '<button class="btn btn-mini" data-yact="default" type="button">Par défaut</button>'}<button class="btn btn-mini" data-yact="edit" type="button">Modifier</button><button class="btn btn-mini" data-yact="cleartoken" type="button" ${c.hasRefreshToken ? '' : 'disabled'}>Effacer le jeton</button><button class="btn btn-mini btn-danger" data-yact="remove" type="button">Retirer</button></div></div>`).join('')
    : '<p class="hint nodes-empty">Aucune chaîne : rien ne peut être publié. Ajoute la première ci-dessous.</p>';
  const opts = (sel) => `<option value="">Chaîne par défaut${v.defaultId ? ' (' + esc(v.channels.find((c) => c.id === v.defaultId)?.name || '') + ')' : ''}</option>` + v.channels.map((c) => `<option value="${esc(c.id)}" ${sel === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  $('#ytBindings').innerHTML = v.styles.map((s) => `<label class="yt-bind"><span>${esc(s.label)}${s.autoPublish ? ' <span class="node-tag">auto</span>' : ''}</span><select data-style="${esc(s.id)}" ${v.channels.length ? '' : 'disabled'}>${opts(s.channelId)}</select><a class="hint" href="/styles/${esc(s.id)}#publish">profil</a></label>`).join('');
}
async function load() { render(await api('GET', '/api/admin/youtube')); }
async function loadQueue() { const q = await api('GET', '/api/publish/queue'); $('#ytQueue').innerHTML = queueHtml(q.items.slice(0, 30)); }
function resetForm() { $('#ytForm').reset(); $('#ytId').value = ''; $('#ytSave').textContent = 'Ajouter la chaîne'; $('#ytCancel').hidden = true; for (const k of ['#ytClientId', '#ytSecret', '#ytToken']) $(k).placeholder = $(k).dataset.ph || $(k).placeholder; }
for (const k of ['#ytClientId', '#ytSecret', '#ytToken']) $(k).dataset.ph = $(k).placeholder;
$('#ytForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const id = $('#ytId').value;
  const body = { name: $('#ytName').value, channelId: $('#ytChannelId').value, isDefault: $('#ytDefault').checked, clientId: $('#ytClientId').value, clientSecret: $('#ytSecret').value, refreshToken: $('#ytToken').value };
  try { render(await api(id ? 'PUT' : 'POST', id ? `/api/admin/youtube/channels/${id}` : '/api/admin/youtube/channels', body)); resetForm(); toast(id ? 'Chaîne mise à jour' : 'Chaîne ajoutée'); } catch (err) { $('#ytMsg').textContent = err.message; }
});
$('#ytCancel').addEventListener('click', resetForm);
$('#ytChannels').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-yact]'); if (!b) return; const id = b.closest('[data-cid]').dataset.cid, c = V.channels.find((x) => x.id === id);
  try {
    if (b.dataset.yact === 'edit') {
      $('#ytId').value = id; $('#ytName').value = c.name; $('#ytChannelId').value = c.channelId || ''; $('#ytDefault').checked = c.isDefault;
      for (const [k, has] of [['#ytClientId', c.hasClientId], ['#ytSecret', c.hasClientSecret], ['#ytToken', c.hasRefreshToken]]) { $(k).value = ''; $(k).placeholder = has ? '•••••••• (enregistré, laisser vide)' : $(k).dataset.ph; }
      $('#ytSave').textContent = 'Enregistrer'; $('#ytCancel').hidden = false; $('#ytName').focus();
    } else if (b.dataset.yact === 'default') render(await api('PUT', '/api/admin/youtube/default', { id }));
    else if (b.dataset.yact === 'cleartoken') { if (confirm(`Effacer le jeton d’actualisation de « ${c.name} » ? Plus rien ne pourra être publié sur cette chaîne.`)) render(await api('PUT', `/api/admin/youtube/channels/${id}`, { refreshToken: null })); }
    else if (b.dataset.yact === 'remove') { if (confirm(`Retirer la chaîne « ${c.name} » et ses secrets ?`)) render(await api('DELETE', `/api/admin/youtube/channels/${id}`)); }
  } catch (err) { toast(err.message); }
});
$('#ytBindings').addEventListener('change', async (e) => { const s = e.target.closest('select[data-style]'); if (!s) return; try { render(await api('PUT', '/api/admin/youtube/bindings', { style: s.dataset.style, channelId: s.value || null })); toast('Liaison enregistrée'); } catch (err) { toast(err.message); } });
bindQueue($('#ytQueue'), loadQueue, toast);
load().catch((e) => toast(e.message)); loadQueue().catch(() => {}); setInterval(() => loadQueue().catch(() => {}), 4000);
