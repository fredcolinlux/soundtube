
import { AuroraField } from './aurora.js';
import { initI18n, t, mountLangSwitcher, applyDom } from './i18n.js';
import { apiFetch, refreshAuth } from './csrf.js';

await initI18n(); applyDom(); mountLangSwitcher(document.getElementById('langHost'));
try { new AuroraField(document.getElementById('bgCanvas')); } catch {}

const st = await refreshAuth();
if (st?.authenticated) location.replace('/');
if (!st?.openRegistration) {
  document.querySelector('main').innerHTML = `<h1>${t('register.closedTitle')}</h1><p class="hint">${t('register.closed')}</p><p class="hint"><a href="/login">${t('nav.login')}</a></p>`;
  throw new Error('closed');
}

const $ = (s) => document.querySelector(s);
function score(pw) {
  let s = 0;
  if (pw.length >= 10) s++;
  if (pw.length >= 14) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}
const LABELS = () => [t('register.strengthWeak'), t('register.strengthFair'), t('register.strengthOk'), t('register.strengthGood'), t('register.strengthStrong')];
$('#pass').addEventListener('input', () => {
  const sc = score($('#pass').value);
  const bar = $('#pwdBar'); bar.dataset.score = String(sc); bar.style.width = ((sc + 1) * 20) + '%';
  $('#pwdStrength').textContent = LABELS()[sc];
});

$('#regForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const msg = $('#msg'); msg.hidden = true;
  if ($('#pass').value !== $('#pass2').value) { msg.hidden = false; msg.textContent = t('setup.mismatch'); return; }
  if (score($('#pass').value) < 2) { msg.hidden = false; msg.textContent = t('register.tooWeak'); return; }
  try {
    const r = await apiFetch('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: $('#user').value.trim(), password: $('#pass').value }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || t('err.generic', { status: r.status }));
    if (j.pendingApproval) { msg.hidden = false; msg.classList.remove('err'); msg.textContent = t('register.pending'); return; }
    location.replace('/');
  } catch (err) { msg.hidden = false; msg.classList.add('err'); msg.textContent = err.message; }
});
