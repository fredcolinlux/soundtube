// v1.13.0 : rendu partagé de la file de publication YouTube (Admin, page Style, panneau YouTube).
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CLS = { queued: 'off', video: 'busy', uploading: 'busy', done: 'up', error: 'down', cancelled: 'off' };
const when = (iso) => { try { return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }); } catch { return ''; } };
export function queueHtml(items, { empty = 'Aucun envoi pour l’instant.' } = {}) {
  if (!items?.length) return `<p class="hint">${empty}</p>`;
  return items.map((x) => `<div class="node-row pub-row ${CLS[x.status] || 'off'}" data-pid="${esc(x.id)}">
    <span class="node-dot" title="${esc(x.statusLabel)}"></span>
    <div class="node-main"><div class="node-title"><b>${esc(x.title || x.trackTitle)}</b><span class="node-tag">${x.mode === 'auto' ? 'auto' : 'manuel'}</span>${x.transport === 'mock' ? '<span class="node-tag">simulation</span>' : ''}</div>
      <div class="node-url">${esc(x.channelName || 'aucune chaîne')} · ${esc(x.visibilityLabel || '')}${x.publishAt ? ' · programmée le ' + esc(when(x.publishAt)) : ''} · ${esc(when(x.created))}</div>
      <div class="node-meta"><span class="node-state">${esc(x.statusLabel)}</span>${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.url)}</a>` : ''}${x.error ? `<span class="node-err">${esc(x.error)}</span>` : ''}${(x.warnings || []).map((w) => `<span class="node-err">${esc(w)}</span>`).join('')}</div></div>
    <div class="node-actions">${x.status === 'queued' || x.status === 'error' ? '<button class="btn btn-mini" data-pact="cancel" type="button">Annuler</button>' : ''}${x.status === 'error' && x.channelId ? '<button class="btn btn-mini" data-pact="retry" type="button">Relancer</button>' : ''}</div></div>`).join('');
}
/** Branche Annuler / Relancer sur un conteneur ; onChange() après chaque action. */
export function bindQueue(el, onChange, toast = () => {}) {
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-pact]'); if (!b) return; const pid = b.closest('[data-pid]').dataset.pid;
    const r = await fetch(`/api/publish/queue/${pid}/${b.dataset.pact}`, { method: 'POST' }); const d = await r.json().catch(() => ({}));
    if (!r.ok) toast(d.error || 'Erreur'); onChange();
  });
}
