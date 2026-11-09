import { bootSite, mountBackground, t } from './site.js?v=1.21.3';
import { applyDom } from './i18n.js';
import { apiFetch, refreshAuth } from './csrf.js';

mountBackground();
await bootSite('/setup');
applyDom(document);

const st = await refreshAuth();
if (!st?.local) { document.querySelector('main').innerHTML = '<p class="hint">404</p>'; throw new Error('local only'); }
if (!st.setupRequired) location.replace('/login');
const $ = (s) => document.querySelector(s);
$('#setupForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const msg = $('#msg'); msg.hidden = true;
  if ($('#pass').value !== $('#pass2').value) { msg.hidden = false; msg.textContent = t('setup.mismatch'); return; }
  try {
    const r = await apiFetch('/api/auth/setup', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: $('#user').value.trim(), password: $('#pass').value }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || 'err');
    location.replace('/admin');
  } catch (err) { msg.hidden = false; msg.textContent = err.message; }
});
