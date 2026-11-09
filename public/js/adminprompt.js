import { t } from './i18n.js';
import { apiFetch } from './csrf.js';
// v1.21.3 : Admin › 07 — prompt système du directeur artistique (intégré / personnalisé / Modelfile), température, num_ctx.
const $ = (s) => document.querySelector(s);
const toast = (m) => { const el = $('#toast'); if (!el) return; el.textContent = m; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 4000); };
const nf = (x) => Number(x || 0).toLocaleString(document.documentElement.lang === 'en' ? 'en-GB' : 'fr-FR');
async function api(method, body) {
  const r = await apiFetch('/api/admin/director/prompt', { method, headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || d.message || t('err.generic', { status: r.status }));
  return d;
}
let MAX = 20000, REC = 16384;
function refresh() {
  const mode = $('#dirSysMode').value, len = $('#dirSysPrompt').value.length, tok = Math.ceil(len / 3.5);
  $('#dirSysCount').textContent = `${nf(len)} / ${nf(MAX)} ${t('dirsys.chars')} · ~${nf(tok)} ${t('dirsys.tokens')}`;
  $('#dirSysModeHint').textContent = t(mode === 'custom' ? 'dirsys.hintCustom' : mode === 'modelfile' ? 'dirsys.hintModelfile' : 'dirsys.hintBuiltin');
  $('#dirSysTemp').disabled = mode === 'modelfile';
  const ctx = $('#dirSysCtx').value === '' ? 0 : +$('#dirSysCtx').value;
  $('#dirSysCtxWarn').hidden = !(mode === 'custom' && tok > 2000 && ctx < REC);
}
function render(v) {
  MAX = v.max || MAX; REC = v.numCtxRange?.recommendedLong || REC;
  $('#dirSysMode').value = v.mode;
  if (document.activeElement !== $('#dirSysPrompt')) $('#dirSysPrompt').value = v.prompt || '';
  $('#dirSysPrompt').maxLength = MAX;
  $('#dirSysTemp').value = v.temperature ?? '';
  $('#dirSysCtx').value = v.numCtx ?? '';
  refresh();
}
async function save(body, okMsg) {
  try { const v = await api('PUT', body); render(v); $('#dirSysMsg').textContent = okMsg; toast(okMsg); }
  catch (e) { $('#dirSysMsg').textContent = e.message; toast(e.message); }
}
['#dirSysMode', '#dirSysPrompt', '#dirSysCtx'].forEach((s) => $(s)?.addEventListener('input', refresh));
$('#dirSysMode')?.addEventListener('change', refresh);
$('#dirSysSave')?.addEventListener('click', () => save({ mode: $('#dirSysMode').value, prompt: $('#dirSysPrompt').value, temperature: $('#dirSysTemp').value === '' ? null : $('#dirSysTemp').value, numCtx: $('#dirSysCtx').value === '' ? null : $('#dirSysCtx').value }, t('dirsys.saved')));
$('#dirSysRestore')?.addEventListener('click', () => { if (!confirm(t('dirsys.confirmRestore'))) return; $('#dirSysPrompt').blur(); save({ restore: true }, t('dirsys.restored')); });
if ($('#dirSys')) api('GET').then(render).catch((e) => { $('#dirSysMsg').textContent = e.message; });
