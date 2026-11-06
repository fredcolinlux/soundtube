// v1.21.0 — publication Facebook Page + X/Twitter (credentials chiffrés, jamais renvoyés).
// Transports mock (SOUNDTUBE_SOCIAL_TRANSPORT=mock) pour les tests.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createHmac, createHash, randomBytes } from 'node:crypto';

const SECRET_KEYS = ['fbPageAccessToken', 'xApiSecret', 'xAccessToken', 'xAccessSecret', 'xClientSecret'];
let _seal = (v) => v, _open = (v) => v;
export function setSocialSecretCodec({ seal, open }) {
  if (typeof seal === 'function') _seal = seal;
  if (typeof open === 'function') _open = open;
}
const seal = (v) => (v ? _seal(String(v)) : '');
const open = (v) => (v ? _open(String(v)) : '');
const mask = (v) => { v = String(v || ''); return !v ? '' : v.length <= 8 ? '••••' : `${v.slice(0, 4)}…${v.slice(-4)}`; };
const httpErr = (status, msg) => Object.assign(new Error(msg), { status });
function writePrivate(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, typeof data === 'string' ? data : JSON.stringify(data, null, 2), { mode: 0o600 });
  try { fs.chmodSync(tmp, 0o600); } catch {}
  fs.renameSync(tmp, file);
  try { fs.chmodSync(file, 0o600); } catch {}
}

const DEFAULT = () => ({
  facebook: { pageId: '', pageAccessToken: '', enabled: false },
  x: {
    apiKey: '', apiSecret: '', accessToken: '', accessSecret: '',
    clientId: '', clientSecret: '', bearer: '', enabled: false, authMode: 'oauth1',
  },
  autoPublish: {}, // styleId → { facebook?: bool, x?: bool } default off
  history: [],
});

export class SocialStore {
  constructor(dataDir) {
    this.file = path.join(dataDir, 'social.json');
    this.mockFile = path.join(dataDir, 'social-mock.jsonl');
    this.s = DEFAULT();
    this.transport = (process.env.SOUNDTUBE_SOCIAL_TRANSPORT || 'live').toLowerCase() === 'mock' ? 'mock' : 'live';
    this.load();
  }
  load() {
    try {
      if (!fs.existsSync(this.file)) return;
      const j = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.s = { ...DEFAULT(), ...j, facebook: { ...DEFAULT().facebook, ...(j.facebook || {}) }, x: { ...DEFAULT().x, ...(j.x || {}) }, autoPublish: j.autoPublish || {}, history: Array.isArray(j.history) ? j.history.slice(-200) : [] };
    } catch {}
  }
  save() {
    const copy = structuredClone(this.s);
    for (const k of SECRET_KEYS) {
      const [root, field] = k.startsWith('fb') ? ['facebook', 'pageAccessToken'] : k.startsWith('x') ? ['x', k.replace(/^x/, '').replace(/^./, (c) => c.toLowerCase())] : [null, null];
    }
    // seal secrets
    if (copy.facebook?.pageAccessToken && !String(copy.facebook.pageAccessToken).startsWith('v1:')) {
      copy.facebook.pageAccessToken = seal(copy.facebook.pageAccessToken);
    }
    for (const k of ['apiSecret', 'accessToken', 'accessSecret', 'clientSecret', 'bearer']) {
      if (copy.x?.[k] && !String(copy.x[k]).startsWith('v1:')) copy.x[k] = seal(copy.x[k]);
    }
    writePrivate(this.file, copy);
  }
  unlocked() {
    const fb = { ...this.s.facebook, pageAccessToken: open(this.s.facebook.pageAccessToken) };
    const x = { ...this.s.x };
    for (const k of ['apiSecret', 'accessToken', 'accessSecret', 'clientSecret', 'bearer']) x[k] = open(x[k]);
    return { facebook: fb, x, autoPublish: this.s.autoPublish || {}, history: this.s.history || [], transport: this.transport };
  }
  /** Vue publique Admin : pas de secrets, seulement présents + masques. */
  view() {
    const u = this.unlocked();
    return {
      transport: this.transport,
      facebook: {
        pageId: u.facebook.pageId || '',
        enabled: !!u.facebook.enabled,
        hasToken: !!u.facebook.pageAccessToken,
        tokenMask: mask(u.facebook.pageAccessToken),
        ready: !!(u.facebook.pageId && u.facebook.pageAccessToken),
      },
      x: {
        enabled: !!u.x.enabled,
        authMode: u.x.authMode || 'oauth1',
        apiKey: u.x.apiKey || '',
        clientId: u.x.clientId || '',
        hasApiSecret: !!u.x.apiSecret,
        hasAccessToken: !!u.x.accessToken,
        hasAccessSecret: !!u.x.accessSecret,
        hasClientSecret: !!u.x.clientSecret,
        ready: this.xReady(u.x),
      },
      autoPublish: { ...this.s.autoPublish },
      history: (this.s.history || []).slice(-50).map((h) => ({ ...h })),
    };
  }
  xReady(x = this.unlocked().x) {
    if ((x.authMode || 'oauth1') === 'oauth1') return !!(x.apiKey && x.apiSecret && x.accessToken && x.accessSecret);
    return !!(x.clientId && x.clientSecret && x.bearer);
  }
  update(patch = {}) {
    if (patch.facebook) {
      const f = patch.facebook;
      if (f.pageId !== undefined) this.s.facebook.pageId = String(f.pageId || '').trim().slice(0, 64);
      if (f.enabled !== undefined) this.s.facebook.enabled = !!f.enabled;
      if (f.pageAccessToken === null) this.s.facebook.pageAccessToken = '';
      else if (typeof f.pageAccessToken === 'string' && f.pageAccessToken.trim()) this.s.facebook.pageAccessToken = f.pageAccessToken.trim().slice(0, 4096);
    }
    if (patch.x) {
      const x = patch.x;
      for (const k of ['apiKey', 'clientId', 'authMode']) if (x[k] !== undefined) this.s.x[k] = String(x[k] || '').trim().slice(0, 256);
      if (x.enabled !== undefined) this.s.x.enabled = !!x.enabled;
      for (const k of ['apiSecret', 'accessToken', 'accessSecret', 'clientSecret', 'bearer']) {
        if (x[k] === null) this.s.x[k] = '';
        else if (typeof x[k] === 'string' && x[k].trim()) this.s.x[k] = x[k].trim().slice(0, 4096);
      }
    }
    if (patch.autoPublish && typeof patch.autoPublish === 'object') {
      for (const [style, v] of Object.entries(patch.autoPublish)) {
        const next = { facebook: !!(v && v.facebook), x: !!(v && v.x) };
        const cur = this.s.autoPublish[style] || { facebook: false, x: false };
        const enabling = (next.facebook && !cur.facebook) || (next.x && !cur.x);
        if (enabling && patch.confirm !== 'PUBLIER' && patch.confirm !== 'PUBLISH') {
          throw httpErr(428, 'Confirmation required: type PUBLISH / PUBLIER to enable auto social');
        }
        this.s.autoPublish[style] = next;
      }
    }
    this.save();
    return this.view();
  }
  pushHistory(entry) {
    this.s.history = [...(this.s.history || []), entry].slice(-200);
    this.save();
  }
  scrub(msg) {
    let m = String(msg || '');
    const u = this.unlocked();
    for (const v of [u.facebook.pageAccessToken, u.x.apiSecret, u.x.accessToken, u.x.accessSecret, u.x.clientSecret, u.x.bearer]) {
      if (v && v.length >= 6) m = m.split(v).join('•••');
    }
    return m;
  }

  draftTexts(track, ytInfo = {}) {
    const title = track.title || 'soundtube';
    const style = track.style || '';
    const url = ytInfo.url || (track.meta?.published || []).slice(-1)[0]?.url || '';
    const fr = (track.meta?.ai?.description_fr || track.meta?.ai?.pitch_fr || `${title} — instrumental ${style} généré avec soundtube.`).trim();
    const en = (track.meta?.ai?.description_en || track.meta?.ai?.pitch_en || `${title} — ${style} instrumental made with soundtube.`).trim();
    const link = url || '';
    return {
      fr: { text: fr.slice(0, 2000), link },
      en: { text: en.slice(0, 2000), link },
      xFr: { text: (fr + (link ? ` ${link}` : '')).slice(0, 280), link },
      xEn: { text: (en + (link ? ` ${link}` : '')).slice(0, 280), link },
      cover: track.files?.thumb ? true : false,
      youtubeUrl: link,
    };
  }

  async postFacebook({ text, link, imagePath }) {
    const u = this.unlocked();
    if (!u.facebook.enabled) throw httpErr(409, 'Facebook disabled');
    if (!u.facebook.pageId || !u.facebook.pageAccessToken) throw httpErr(412, 'Facebook Page not configured');
    if (this.transport === 'mock') {
      const id = 'fb_mock_' + randomBytes(4).toString('hex');
      fs.appendFileSync(this.mockFile, JSON.stringify({ at: new Date().toISOString(), network: 'facebook', id, text, link, image: !!imagePath }) + '\n');
      return { id, url: `https://facebook.com/${u.facebook.pageId}/posts/${id}`, mock: true };
    }
    const token = u.facebook.pageAccessToken;
    const pageId = u.facebook.pageId;
    if (imagePath && fs.existsSync(imagePath)) {
      const form = new FormData();
      form.set('message', text || '');
      if (link) form.set('link', link);
      form.set('access_token', token);
      const blob = new Blob([fs.readFileSync(imagePath)]);
      form.set('source', blob, path.basename(imagePath));
      const r = await fetch(`https://graph.facebook.com/v19.0/${encodeURIComponent(pageId)}/photos`, { method: 'POST', body: form });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw httpErr(r.status, j.error?.message || 'Facebook photo upload failed');
      return { id: j.id || j.post_id, url: j.id ? `https://facebook.com/${j.id}` : null, mock: false };
    }
    const body = new URLSearchParams({ message: text || '', access_token: token });
    if (link) body.set('link', link);
    const r = await fetch(`https://graph.facebook.com/v19.0/${encodeURIComponent(pageId)}/feed`, { method: 'POST', body });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw httpErr(r.status, j.error?.message || 'Facebook post failed');
    return { id: j.id, url: j.id ? `https://facebook.com/${j.id}` : null, mock: false };
  }

  async postX({ text, imagePath }) {
    const u = this.unlocked();
    if (!u.x.enabled) throw httpErr(409, 'X disabled');
    if (!this.xReady(u.x)) throw httpErr(412, 'X credentials incomplete');
    if (this.transport === 'mock') {
      const id = 'x_mock_' + randomBytes(4).toString('hex');
      fs.appendFileSync(this.mockFile, JSON.stringify({ at: new Date().toISOString(), network: 'x', id, text, image: !!imagePath }) + '\n');
      return { id, url: `https://x.com/i/status/${id}`, mock: true };
    }
    let mediaId = null;
    if (imagePath && fs.existsSync(imagePath)) {
      mediaId = await this._xUploadMedia(u.x, imagePath);
    }
    if ((u.x.authMode || 'oauth1') === 'oauth1') {
      const url = 'https://api.twitter.com/2/tweets';
      const body = { text: String(text || '').slice(0, 280) };
      if (mediaId) body.media = { media_ids: [mediaId] };
      const auth = oauth1Header('POST', url, u.x);
      const r = await fetch(url, { method: 'POST', headers: { Authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw httpErr(r.status, j.detail || j.title || j.errors?.[0]?.message || 'X post failed');
      const id = j.data?.id;
      return { id, url: id ? `https://x.com/i/status/${id}` : null, mock: false };
    }
    // OAuth2 bearer
    const body = { text: String(text || '').slice(0, 280) };
    if (mediaId) body.media = { media_ids: [mediaId] };
    const r = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${u.x.bearer}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw httpErr(r.status, j.detail || j.title || 'X post failed');
    const id = j.data?.id;
    return { id, url: id ? `https://x.com/i/status/${id}` : null, mock: false };
  }

  async _xUploadMedia(x, imagePath) {
    // v1.1 media upload with OAuth1
    const buf = fs.readFileSync(imagePath);
    const url = 'https://upload.twitter.com/1.1/media/upload.json';
    const auth = oauth1Header('POST', url, x);
    const form = new FormData();
    form.set('media', new Blob([buf]), path.basename(imagePath));
    const r = await fetch(url, { method: 'POST', headers: { Authorization: auth }, body: form });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw httpErr(r.status, j.errors?.[0]?.message || 'X media upload failed');
    return String(j.media_id_string || j.media_id);
  }

  async publishTrack({ track, network, lang = 'fr', text, link, useCover = true, confirm, tracksDir, styleAuto = false }) {
    if (confirm !== 'PUBLIER' && confirm !== 'PUBLISH') throw httpErr(428, 'Confirmation required: type PUBLISH / PUBLIER');
    const drafts = this.draftTexts(track);
    const d = network === 'x'
      ? (lang === 'en' ? drafts.xEn : drafts.xFr)
      : (lang === 'en' ? drafts.en : drafts.fr);
    const bodyText = (text != null && String(text).trim()) ? String(text).trim() : d.text;
    const bodyLink = link != null ? String(link).trim() : d.link;
    let imagePath = null;
    if (useCover && track.files?.thumb && tracksDir) {
      const p = path.join(tracksDir, track.id, track.files.thumb);
      if (fs.existsSync(p)) imagePath = p;
    }
    const entry = {
      id: 'soc_' + randomBytes(4).toString('hex'),
      trackId: track.id,
      trackTitle: track.title,
      style: track.style,
      network,
      lang,
      status: 'pending',
      created: new Date().toISOString(),
      auto: !!styleAuto,
    };
    try {
      const r = network === 'facebook'
        ? await this.postFacebook({ text: bodyText, link: bodyLink, imagePath })
        : await this.postX({ text: bodyText, imagePath });
      Object.assign(entry, { status: 'done', remoteId: r.id, url: r.url, mock: !!r.mock, finished: new Date().toISOString() });
    } catch (e) {
      Object.assign(entry, { status: 'error', error: this.scrub(e.message).slice(0, 400), finished: new Date().toISOString() });
      this.pushHistory(entry);
      throw Object.assign(e, { socialEntry: entry });
    }
    this.pushHistory(entry);
    return entry;
  }

  /** Après génération : poste FB/X si autoPublish[style] activé (défaut off). */
  async onTrackDone(t, tracksDir) {
    if (!t || t.status !== 'done') return [];
    const ap = this.s.autoPublish[t.style] || {};
    const out = [];
    for (const network of ['facebook', 'x']) {
      if (!ap[network]) continue;
      try {
        const entry = await this.publishTrack({
          track: t, network, lang: 'fr', useCover: true,
          confirm: 'PUBLISH', tracksDir, styleAuto: true,
        });
        out.push(entry);
      } catch (e) {
        out.push(e.socialEntry || { network, status: 'error', error: this.scrub(e.message) });
      }
    }
    return out;
  }
}

function percentEncode(s) {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}
function oauth1Header(method, url, x) {
  const oauth = {
    oauth_consumer_key: x.apiKey,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: x.accessToken,
    oauth_version: '1.0',
  };
  const params = Object.keys(oauth).sort().map((k) => `${percentEncode(k)}=${percentEncode(oauth[k])}`).join('&');
  const base = [method.toUpperCase(), percentEncode(url), percentEncode(params)].join('&');
  const key = `${percentEncode(x.apiSecret)}&${percentEncode(x.accessSecret)}`;
  oauth.oauth_signature = createHmac('sha1', key).update(base).digest('base64');
  return 'OAuth ' + Object.keys(oauth).sort().map((k) => `${percentEncode(k)}="${percentEncode(oauth[k])}"`).join(', ');
}
