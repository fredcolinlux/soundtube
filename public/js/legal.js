import { bootSite } from './site.js';
import { getUiLang, t, applyDom } from './i18n.js';

const kind = document.body.dataset.legalKind || 'notice';
const path = kind === 'privacy' ? '/privacy' : kind === 'terms' ? '/terms' : '/legal';
await bootSite(path); applyDom();
const lang = getUiLang();
const r = await fetch(`/api/legal?lang=${lang}&kind=${kind}`);
const j = await r.json();
const el = document.getElementById('legalBody');
const text = j.text || j[kind] || '';
if (text) el.innerHTML = '<pre class="legal-pre">' + text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) + '</pre>';
else el.innerHTML = '<p class="hint">' + t('legal.empty') + '</p>';
