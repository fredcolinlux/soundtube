// Admin › Utilisateurs / Sécurité / Audit / Jetons / Sauvegarde (v1.20.0)
import { apiFetch } from './csrf.js';
import { t } from './i18n.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function api(method, url, body) {
  const r = await apiFetch(url, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  if (r.status === 204) return null;
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || r.status); return d;
}
function toast(msg) { const el = $('#toast'); if (!el) return alert(msg); el.textContent = msg; el.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (el.hidden = true), 3200); }

async function loadUsers() {
  const { users } = await api('GET', '/api/admin/auth/users');
  const box = $('#usersList'); if (!box) return;
  box.innerHTML = users.map((u) => `<tr data-id="${esc(u.id)}">
    <td><code>${esc(u.username)}</code></td><td>${esc(u.role)}</td>
    <td>${u.disabled ? '⛔' : '✓'}</td>
    <td>${u.totpEnabled ? '2FA' : '—'} · ${u.passkeys || 0} pk</td>
    <td>${u.quota?.generationsPerDay ?? '—'}/${u.quota?.maxDuration ?? '—'}s</td>
    <td class="row">
      <button type="button" class="btn btn-mini" data-act="reset">${esc(t('admin.users.reset'))}</button>
      <button type="button" class="btn btn-mini" data-act="toggle">${u.disabled ? t('common.enable') : t('common.disable')}</button>
      <button type="button" class="btn btn-mini btn-ghost" data-act="del">Suppr.</button>
    </td></tr>`).join('') || `<tr><td colspan="6" class="hint">${t('admin.users.empty')}</td></tr>`;
}

async function loadSecurity() {
  const s = await api('GET', '/api/admin/auth/security');
  $('#secProxies').value = (s.trustedProxies || []).join('\n');
  $('#secLocal').value = (s.localCidrs || []).join('\n');
  $('#secDomain').value = s.publicDomain || '';
  $('#secTtl').value = s.sessionTtlHours ?? 12;
  $('#secAttempts').value = s.loginMaxAttempts ?? 5;
  $('#secLock').value = s.loginLockMinutes ?? 15;
  $('#secSigned').value = s.signedLinkTtlSec ?? 3600;
  $('#secLegalFr').value = s.legal?.fr || '';
  $('#secLegalEn').value = s.legal?.en || '';
}

async function loadAudit() {
  const { items } = await api('GET', '/api/admin/auth/audit?limit=80');
  $('#auditList').innerHTML = items.map((i) => `<li><code>${esc(i.at)}</code> <b>${esc(i.action)}</b> ${esc(JSON.stringify({ ...i, at: undefined, action: undefined }))}</li>`).join('') || '<li class="hint">—</li>';
}

async function loadTokens() {
  const { tokens } = await api('GET', '/api/admin/auth/tokens');
  $('#tokensList').innerHTML = tokens.map((t) => `<tr data-id="${esc(t.id)}"><td>${esc(t.name)}</td><td><code>${esc(t.userId)}</code></td><td>${esc((t.scopes || []).join(', '))}</td><td>${esc(t.expiresAt || '∞')}</td>
    <td><button type="button" class="btn btn-mini" data-trev>${t('common.revoke')}</button></td></tr>`).join('') || `<tr><td colspan="5" class="hint">${t('admin.tokens.empty')}</td></tr>`;
}

export async function bootAdminAuth() {
  if (!$('#users')) return;
  await Promise.all([loadUsers(), loadSecurity(), loadAudit(), loadTokens()]);

  $('#userAdd')?.addEventListener('click', async () => {
    try {
      await api('POST', '/api/admin/auth/users', {
        username: $('#newUser').value.trim(), password: $('#newPass').value,
        role: $('#newRole').value, quota: { generationsPerDay: +$('#newQuota').value || 50, maxDuration: +$('#newMaxDur').value || 3600 },
      });
      $('#newPass').value = ''; toast(t('admin.users.created')); loadUsers();
    } catch (e) { toast(e.message); }
  });

  $('#usersList')?.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.closest('tr').dataset.id;
    try {
      if (b.dataset.act === 'del') { if (!confirm(t('common.deleteConfirm'))) return; await api('DELETE', '/api/admin/auth/users/' + id); }
      if (b.dataset.act === 'toggle') {
        const dis = b.textContent.includes('Désactiver');
        await api('PATCH', '/api/admin/auth/users/' + id, { disabled: dis });
      }
      if (b.dataset.act === 'reset') {
        const password = prompt(t('admin.users.newPwd'));
        if (!password) return;
        await api('PATCH', '/api/admin/auth/users/' + id, { password });
      }
      loadUsers();
    } catch (err) { toast(err.message); }
  });

  $('#secSave')?.addEventListener('click', async () => {
    try {
      await api('PUT', '/api/admin/auth/security', {
        trustedProxies: $('#secProxies').value.split(/\n+/).map((x) => x.trim()).filter(Boolean),
        localCidrs: $('#secLocal').value.split(/\n+/).map((x) => x.trim()).filter(Boolean),
        publicDomain: $('#secDomain').value.trim(),
        sessionTtlHours: +$('#secTtl').value,
        loginMaxAttempts: +$('#secAttempts').value,
        loginLockMinutes: +$('#secLock').value,
        signedLinkTtlSec: +$('#secSigned').value,
        legal: { fr: $('#secLegalFr').value, en: $('#secLegalEn').value },
      });
      toast(t('admin.sec.saved'));
    } catch (e) { toast(e.message); }
  });

  $('#tokenAdd')?.addEventListener('click', async () => {
    try {
      const r = await api('POST', '/api/admin/auth/tokens', { name: $('#tokName').value || 'api', userId: $('#tokUser').value || undefined, scopes: ['api'] });
      prompt(t('admin.tokens.once'), r.raw); loadTokens();
    } catch (e) { toast(e.message); }
  });
  $('#tokensList')?.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-trev]'); if (!b) return;
    try { await api('DELETE', '/api/admin/auth/tokens/' + b.closest('tr').dataset.id); loadTokens(); } catch (err) { toast(err.message); }
  });

  $('#backupBtn')?.addEventListener('click', async () => {
    const r = await apiFetch('/api/admin/auth/backup', { method: 'POST' });
    if (!r.ok) return toast('Échec sauvegarde');
    const blob = await r.blob(); const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'soundtube-auth-backup.tgz'; a.click();
  });
  $('#auditRefresh')?.addEventListener('click', () => loadAudit().catch((e) => toast(e.message)));
}
bootAdminAuth().catch((e) => console.error(e));
