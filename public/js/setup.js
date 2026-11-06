import { AuroraField } from './aurora.js';
import { initI18n, t, mountLangSwitcher, applyDom } from './i18n.js';
import { apiFetch, refreshAuth } from './csrf.js';
await initI18n(); applyDom(); mountLangSwitcher(document.getElementById('langHost'));
try { new AuroraField(document.getElementById('bgCanvas')); } catch {}
const st = await refreshAuth();
if (!st?.local) { document.body.innerHTML = '<p class="wrap">404</p>'; throw new Error('local only'); }
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
