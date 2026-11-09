// v1.21.2 — Admin › Réseaux sociaux
import { apiFetch } from './csrf.js';
import { t } from './i18n.js';
const $ = (s) => document.querySelector(s);
async function api(method, url, body) {
  const r = await apiFetch(url, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || r.status); return d;
}
function toast(msg) { const el = $('#toast'); if (!el) return; el.textContent = msg; el.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (el.hidden = true), 3200); }

async function load() {
  if (!$('#social')) return;
  const v = await api('GET', '/api/admin/social');
  $('#socFbOn').checked = !!v.facebook?.enabled;
  $('#socFbPageId').value = v.facebook?.pageId || '';
  $('#socFbToken').value = '';
  $('#socFbStatus').textContent = v.facebook?.ready
    ? t('admin.socialReady') + (v.facebook.tokenMask ? ` (${v.facebook.tokenMask})` : '')
    : t('admin.socialIncomplete');
  $('#socXOn').checked = !!v.x?.enabled;
  $('#socXMode').value = v.x?.authMode || 'oauth1';
  $('#socXApiKey').value = v.x?.apiKey || v.x?.clientId || '';
  $('#socXApiSecret').value = '';
  $('#socXAccess').value = '';
  $('#socXAccessSecret').value = '';
  $('#socXStatus').textContent = v.x?.ready ? t('admin.socialReady') : t('admin.socialIncomplete');
  const hist = v.history || [];

  // per-style auto (default off)
  const raw = await api('GET', '/api/styles').catch(() => ({ styles: [] }));
  const list = raw.styles || [];
  const wrap = $('#socAuto');
  if (wrap) {
    const ap = v.autoPublish || {};
    wrap.innerHTML = list.map((s) => {
      const id = s.id || s; const label = s.label || id;
      const cur = ap[id] || {};
      return `<label class="toggle"><input type="checkbox" data-soc-auto="${id}" data-net="facebook" ${cur.facebook?'checked':''}><span>FB · ${label}</span></label>
        <label class="toggle"><input type="checkbox" data-soc-auto="${id}" data-net="x" ${cur.x?'checked':''}><span>X · ${label}</span></label>`;
    }).join(' ') || `<span class="hint">${t('admin.socialHistoryEmpty')}</span>`;
  }

  $('#socHistory').innerHTML = hist.slice().reverse().map((h) =>
    `<li><code>${h.created || ''}</code> <b>${h.network}</b> ${h.status} — ${h.trackTitle || h.trackId}${h.error ? ' · ' + h.error : ''}${h.url ? ` · <a href="${h.url}" target="_blank" rel="noopener">link</a>` : ''}</li>`
  ).join('') || `<li>${t('admin.socialHistoryEmpty')}</li>`;
}

$('#socSave')?.addEventListener('click', async () => {
  try {
    const mode = $('#socXMode').value;
    const autoPublish = {};
    document.querySelectorAll('[data-soc-auto]').forEach((el) => {
      const id = el.dataset.socAuto, net = el.dataset.net;
      autoPublish[id] = autoPublish[id] || { facebook: false, x: false };
      autoPublish[id][net] = el.checked;
    });
    const enabling = Object.entries(autoPublish).some(([id, v]) => v.facebook || v.x);
    let confirm = undefined;
    if (enabling) {
      confirm = prompt(t('admin.socialConfirmAuto'), '') || '';
    }
    const body = {
      facebook: {
        enabled: $('#socFbOn').checked,
        pageId: $('#socFbPageId').value.trim(),
        pageAccessToken: $('#socFbToken').value.trim() || undefined,
      },
      x: {
        enabled: $('#socXOn').checked,
        authMode: mode,
        apiKey: mode === 'oauth1' ? $('#socXApiKey').value.trim() : undefined,
        clientId: mode === 'oauth2' ? $('#socXApiKey').value.trim() : undefined,
        apiSecret: mode === 'oauth1' ? ($('#socXApiSecret').value.trim() || undefined) : undefined,
        clientSecret: mode === 'oauth2' ? ($('#socXApiSecret').value.trim() || undefined) : undefined,
        accessToken: mode === 'oauth1' ? ($('#socXAccess').value.trim() || undefined) : undefined,
        bearer: mode === 'oauth2' ? ($('#socXAccess').value.trim() || undefined) : undefined,
        accessSecret: $('#socXAccessSecret').value.trim() || undefined,
      },
      autoPublish,
      confirm,
    };
    await api('PUT', '/api/admin/social', body);
    $('#socMsg').textContent = t('admin.sec.saved');
    toast(t('admin.sec.saved'));
    load();
  } catch (e) { toast(e.message); }
});
load().catch((e) => console.error(e));
