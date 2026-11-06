import { AuroraField } from './aurora.js';
import { initI18n, t, mountLangSwitcher, applyDom } from './i18n.js';
import { apiFetch, refreshAuth } from './csrf.js';

await initI18n(); applyDom(); mountLangSwitcher(document.getElementById('langHost'));
try { new AuroraField(document.getElementById('bgCanvas')); } catch {}

const st = await refreshAuth();
if (!st?.authenticated) location.replace('/login?next=/profile');

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function api(method, url, body) {
  const r = await apiFetch(url, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || r.status); return d;
}
function toast(el, msg) { el.hidden = !msg; el.textContent = msg || ''; }

const _me = await api('GET', '/api/auth/me');
const me = _me.user || _me;
$('#profUser').textContent = me.username || '—';
$('#profRole').textContent = me.role || '';
render2fa(me);

function render2fa(u) {
  const on = !!u.totpEnabled;
  $('#totpLabel').textContent = on ? t('profile.totpOn') : t('profile.totpOff');
  $('#totpEnable').hidden = on;
  $('#totpDisable').hidden = !on;
  $('#totpSetup').hidden = true;
  const n = u.passkeys || 0;
  $('#pkLabel').textContent = n ? t('profile.pkOn', { n }) : t('profile.pkOff');
}

$('#pwdForm').addEventListener('submit', async (e) => {
  e.preventDefault(); toast($('#pwdMsg'));
  try {
    await api('POST', '/api/auth/password', { current: $('#pwdCur').value, next: $('#pwdNew').value });
    toast($('#pwdMsg'), t('profile.pwdOk')); $('#pwdCur').value = ''; $('#pwdNew').value = '';
  } catch (err) { toast($('#pwdMsg'), err.message); }
});

$('#totpEnable').addEventListener('click', async () => {
  try {
    const r = await api('POST', '/api/auth/totp/begin');
    $('#totpSecret').textContent = r.secret;
    $('#totpUri').textContent = r.otpauthUrl || '';
    $('#totpSetup').hidden = false;
  } catch (e) { alert(e.message); }
});
$('#totpConfirm').addEventListener('click', async () => {
  try {
    const r = await api('POST', '/api/auth/totp/confirm', { code: $('#totpCode').value.replace(/\s/g, '') });
    if (r.recovery?.length) {
      $('#totpRecovery').hidden = false;
      $('#totpRecovery').textContent = t('profile.recoveryOnce') + ' ' + r.recovery.join(' · ');
    }
    const me2 = await api('GET', '/api/auth/me'); render2fa(me2);
  } catch (e) { alert(e.message); }
});
$('#totpDisable').addEventListener('click', async () => {
  if (!confirm(t('profile.totpDisableConfirm'))) return;
  try { await api('DELETE', '/api/auth/totp'); const me2 = await api('GET', '/api/auth/me'); render2fa(me2); }
  catch (e) { alert(e.message); }
});

$('#pkAdd').addEventListener('click', async () => {
  try {
    if (!window.PublicKeyCredential) throw new Error(t('login.noWebauthn'));
    const opts = await api('POST', '/api/auth/passkey/register/options');
    const b64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const cred = await navigator.credentials.create({ publicKey: {
      challenge: b64u(opts.challenge), rp: opts.rp, user: { ...opts.user, id: b64u(opts.user.id) },
      pubKeyCredParams: opts.pubKeyCredParams, timeout: opts.timeout, authenticatorSelection: opts.authenticatorSelection,
      excludeCredentials: (opts.excludeCredentials || []).map((c) => ({ type: 'public-key', id: b64u(c.id) })),
    } });
    await api('POST', '/api/auth/passkey/register', {
      id: cred.id,
      response: { clientDataJSON: b64(cred.response.clientDataJSON), attestationObject: b64(cred.response.attestationObject) },
    });
    const me2 = await api('GET', '/api/auth/me'); render2fa(me2);
  } catch (e) { alert(e.message); }
});
