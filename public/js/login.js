import { bootSite, mountBackground, t } from './site.js?v=1.20.5';
import { applyDom } from './i18n.js';
import { apiFetch, refreshAuth } from './csrf.js';

mountBackground();
await bootSite('/login');
applyDom(document);

const st = await refreshAuth();
if (st?.setupRequired && st.local) location.replace('/setup');
const next = new URLSearchParams(location.search).get('next') || '/studio';
if (st?.authenticated) location.replace(next);
if (st?.openRegistration) {
  const a = document.createElement('a');
  a.href = '/register'; a.className = 'hint'; a.style.display = 'block'; a.style.marginTop = '.6rem';
  a.dataset.i18n = 'nav.register'; a.textContent = t('nav.register');
  document.querySelector('.auth-foot')?.before(a);
  applyDom(document);
}

const $ = (s) => document.querySelector(s);
function show(el, msg) { el.hidden = !msg; el.textContent = msg || ''; }

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault(); show($('#msg'));
  try {
    const r = await apiFetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: $('#user').value.trim(), password: $('#pass').value }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || t('err.generic', { status: r.status }));
    if (j.needs2fa) { $('#loginForm').hidden = true; $('#totpForm').hidden = false; $('#pkBtn').hidden = !j.passkeys; return; }
    location.replace(next);
  } catch (err) { show($('#msg'), err.message); }
});

$('#totpForm').addEventListener('submit', async (e) => {
  e.preventDefault(); show($('#msg2'));
  try {
    const r = await apiFetch('/api/auth/2fa', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: $('#code').value.replace(/\s/g, ''), recovery: $('#recovery').value.trim() || undefined }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || t('err.generic', { status: r.status }));
    location.replace(next);
  } catch (err) { show($('#msg2'), err.message); }
});

$('#pkBtn').addEventListener('click', async () => {
  show($('#msg'));
  try {
    if (!window.PublicKeyCredential) throw new Error(t('login.noWebauthn'));
    const optR = await apiFetch('/api/auth/passkey/login/options', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: $('#user').value.trim() }) });
    const opts = await optR.json();
    const cred = await navigator.credentials.get({ publicKey: {
      challenge: Uint8Array.from(atob(opts.challenge.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
      rpId: opts.rpId, timeout: opts.timeout, userVerification: opts.userVerification,
      allowCredentials: (opts.allowCredentials || []).map((c) => ({ type: 'public-key', id: Uint8Array.from(atob(c.id.replace(/-/g, '+').replace(/_/g, '/')), (x) => x.charCodeAt(0)) })),
    } });
    const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const body = { id: cred.id, username: $('#user').value.trim(), response: {
      clientDataJSON: b64(cred.response.clientDataJSON),
      authenticatorData: b64(cred.response.authenticatorData),
      signature: b64(cred.response.signature),
    } };
    const r = await apiFetch('/api/auth/passkey/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Passkey');
    location.replace(next);
  } catch (err) { show($('#msg'), err.message); }
});
