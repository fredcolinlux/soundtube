import { AuroraField } from './aurora.js';
import { initI18n, t, mountLangSwitcher, applyDom } from './i18n.js';
import { apiFetch, refreshAuth } from './csrf.js';

await initI18n(); applyDom(); mountLangSwitcher(document.getElementById('langHost'));
try { new AuroraField(document.getElementById('bgCanvas')); } catch {}

const st = await refreshAuth();
if (!st?.authenticated) location.replace('/login?next=/profile');

const $ = (s) => document.querySelector(s);
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

function render2fa(u, { keepSetup = false, keepRecovery = false } = {}) {
  const on = !!u.totpEnabled;
  $('#totpLabel').textContent = on ? t('profile.totpOn') : t('profile.totpOff');
  $('#totpEnable').hidden = on;
  $('#totpDisable').hidden = !on;
  if (!keepSetup) $('#totpSetup').hidden = true;
  if (!keepRecovery) $('#totpRecoveryBox').hidden = true;
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

let pendingSecret = '';

$('#totpEnable').addEventListener('click', async () => {
  try {
    toast($('#totpMsg'));
    const r = await api('POST', '/api/auth/totp/begin');
    pendingSecret = r.secret || '';
    const grouped = r.secretGrouped || pendingSecret;
    $('#totpSecret').textContent = grouped;
    $('#totpUri').textContent = r.otpauthUrl || r.url || '';
    const qr = $('#totpQr');
    qr.alt = t('profile.totpQrAlt');
    // Authenticated SVG endpoint (no-store); cache-bust so a new begin() shows a new QR
    qr.src = (r.qrPath || '/api/me/totp/qr.svg') + '?t=' + Date.now();
    $('#totpCode').value = '';
    $('#totpSetup').hidden = false;
    $('#totpRecoveryBox').hidden = true;
  } catch (e) { alert(e.message); }
});

$('#totpCopy').addEventListener('click', async () => {
  const text = ($('#totpSecret').textContent || '').replace(/\s+/g, '');
  try {
    await navigator.clipboard.writeText(text);
    toast($('#totpMsg'), t('profile.totpCopied'));
  } catch {
    toast($('#totpMsg'), text);
  }
});

$('#totpConfirm').addEventListener('click', async () => {
  try {
    toast($('#totpMsg'));
    const r = await api('POST', '/api/auth/totp/confirm', { code: $('#totpCode').value.replace(/\s/g, '') });
    const codes = r.recovery || r.recoveryCodes || [];
    if (codes.length) {
      const body = codes.join('\n');
      $('#totpRecovery').textContent = body;
      $('#totpRecoveryBox').hidden = false;
      $('#totpRecoveryBox').dataset.codes = body;
      $('#totpSetup').hidden = true;
    }
    const me2 = await api('GET', '/api/auth/me');
    render2fa(me2.user || me2, { keepRecovery: true });
  } catch (e) { toast($('#totpMsg'), e.message); }
});

$('#totpRecoveryDl').addEventListener('click', () => {
  const body = $('#totpRecoveryBox').dataset.codes || $('#totpRecovery').textContent || '';
  const blob = new Blob([`# soundtube recovery codes\n${body}\n`], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'soundtube-recovery-codes.txt';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});
$('#totpRecoveryCopy').addEventListener('click', async () => {
  const body = $('#totpRecoveryBox').dataset.codes || $('#totpRecovery').textContent || '';
  try { await navigator.clipboard.writeText(body); toast($('#totpMsg'), t('profile.totpCopied')); }
  catch { toast($('#totpMsg'), body); }
});

$('#totpDisable').addEventListener('click', async () => {
  if (!confirm(t('profile.totpDisableConfirm'))) return;
  try { await api('DELETE', '/api/auth/totp'); const me2 = await api('GET', '/api/auth/me'); render2fa(me2.user || me2); }
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
    const me2 = await api('GET', '/api/auth/me'); render2fa(me2.user || me2);
  } catch (e) { alert(e.message); }
});
