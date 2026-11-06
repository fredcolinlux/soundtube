import { bootSite } from './site.js';
import { getUiLang, t, applyDom } from './i18n.js';
await bootSite('/legal'); applyDom();
const lang = getUiLang();
const r = await fetch('/api/legal?lang=' + lang);
const j = await r.json();
const el = document.getElementById('legalBody');
if (j.text) el.innerHTML = '<pre style="white-space:pre-wrap;font:inherit">' + j.text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) + '</pre>';
else el.innerHTML = '<p class="hint">' + t('legal.empty') + '</p>';
