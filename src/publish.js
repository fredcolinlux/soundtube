// v1.13.0 : chaînes YouTube par style, profils de publication, file d'auto-publication.
// Secrets (client secret, jeton d'actualisation) : <données>/youtube-channels.json en 0600, jamais renvoyés par l'API ni écrits dans les journaux.
// Transport « mock » (SOUNDTUBE_YT_TRANSPORT=mock, utilisé par les tests) : aucune requête réseau, envois consignés dans youtube-mock.jsonl.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const VISIBILITIES = ['private', 'unlisted', 'public'];
export const VIS_LABEL = { private: 'Privée', unlisted: 'Non répertoriée', public: 'Publique' };
export const STATUS_LABEL = { queued: 'En attente', video: 'Vidéo en préparation', uploading: 'Envoi en cours', done: 'Publiée', error: 'Erreur', cancelled: 'Annulée' };
export const CONFIRM_WORD = 'PUBLIER';
export const DEFAULT_PROFILE = Object.freeze({ title: '{titre}', description: '{description}', tags: [], autoTags: true, thumbnail: 'auto', visibility: 'private', playlistId: '', schedule: { mode: 'none', at: '', delayHours: 24 }, autoPublish: false });
const SECRET_KEYS = ['clientSecret', 'refreshToken'];

/** Branche le chiffrement au repos (AES-GCM) fourni par AuthStore — optionnel. */
let _seal = (v) => v, _open = (v) => v;
export function setSecretCodec({ seal, open }) { if (typeof seal === 'function') _seal = seal; if (typeof open === 'function') _open = open; }
function sealSecret(v) { return v ? _seal(String(v)) : v; }
function openSecret(v) { return v ? _open(String(v)) : v; }

const str = (v, max = 200) => String(v ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
const text = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f]/g, '').trim().slice(0, max);
const httpErr = (status, msg) => Object.assign(new Error(msg), { status });
/** « 1234…abcd » : assez pour reconnaître une valeur sans la divulguer. */
export const mask = (v) => { v = String(v || ''); return !v ? '' : v.length <= 8 ? '••••' : `${v.slice(0, 4)}…${v.slice(-4)}`; };

function writePrivate(file, data) {
  const tmp = file + '.tmp'; fs.writeFileSync(tmp, data, { mode: 0o600 }); fs.chmodSync(tmp, 0o600); fs.renameSync(tmp, file); fs.chmodSync(file, 0o600);
}

/** Remplit un gabarit : {titre} {titre_en} {style} {bpm} {tonalite} {duree} {description} {chaine}. */
export function fillTemplate(tpl, vars) { return String(tpl ?? '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m)); }

export function normalizeProfile(p = {}, base = DEFAULT_PROFILE) {
  const s = p.schedule || base.schedule || {};
  const tags = (Array.isArray(p.tags) ? p.tags : typeof p.tags === 'string' ? p.tags.split(',') : base.tags).map((x) => str(x, 60)).filter(Boolean).slice(0, 40);
  const mode = ['none', 'at', 'delay'].includes(s.mode) ? s.mode : 'none';
  const at = mode === 'at' && s.at && !Number.isNaN(Date.parse(s.at)) ? new Date(s.at).toISOString() : '';
  return {
    title: str(p.title ?? base.title, 100) || '{titre}', description: text(p.description ?? base.description, 5000) || '{description}', tags,
    autoTags: p.autoTags ?? base.autoTags ?? true, thumbnail: (p.thumbnail ?? base.thumbnail) === 'none' ? 'none' : 'auto',
    visibility: VISIBILITIES.includes(p.visibility) ? p.visibility : base.visibility, playlistId: str(p.playlistId ?? base.playlistId, 64).replace(/[^\w-]/g, ''),
    schedule: { mode, at, delayHours: Math.max(0, Math.min(24 * 60, +(s.delayHours ?? 24) || 0)) }, autoPublish: !!(p.autoPublish ?? base.autoPublish),
  };
}
/** Date de mise en ligne programmée (ISO) ou null. */
export function publishAtOf(schedule, now = Date.now()) {
  if (!schedule || schedule.mode === 'none') return null;
  if (schedule.mode === 'at') { const d = Date.parse(schedule.at); return Number.isFinite(d) && d > now + 60e3 ? new Date(d).toISOString() : null; }
  if (schedule.mode === 'delay' && schedule.delayHours > 0) return new Date(now + schedule.delayHours * 3600e3).toISOString();
  return null;
}

// ---------- transports
/** Simulation : aucune requête réseau ; consigne l'envoi (sans secret) et renvoie un faux identifiant. */
export function mockTransport(logFile) {
  return {
    kind: 'mock',
    async upload({ channel, video, thumb, snippet, status, playlistId }) {
      if (!channel?.refreshToken) throw httpErr(412, 'Aucun jeton');
      const id = 'mock-' + crypto.randomBytes(5).toString('hex');
      const rec = { at: new Date().toISOString(), channel: channel.id, channelName: channel.name, videoId: id, video: path.basename(video), videoBytes: fs.statSync(video).size, thumb: thumb ? path.basename(thumb) : null, snippet, status, playlistId: playlistId || null };
      if (logFile) fs.appendFileSync(logFile, JSON.stringify(rec) + '\n');
      return { videoId: id, url: `https://youtu.be/${id}`, mock: true };
    },
  };
}
/** Envoi réel (API YouTube Data v3) : jeton d'accès obtenu à partir du jeton d'actualisation, envoi « resumable ». */
export function liveTransport(fetchImpl = globalThis.fetch) {
  async function accessToken(ch) {
    const r = await fetchImpl('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: ch.clientId, client_secret: ch.clientSecret, refresh_token: ch.refreshToken, grant_type: 'refresh_token' }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw httpErr(401, `Jeton refusé par Google (${str(j.error || r.status, 60)}) : régénère le jeton d'actualisation dans Admin.`);
    return j.access_token;
  }
  return {
    kind: 'live',
    async upload({ channel, video, thumb, snippet, status, playlistId }) {
      const tok = await accessToken(channel), auth = { authorization: `Bearer ${tok}` }, size = fs.statSync(video).size;
      const init = await fetchImpl('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', { method: 'POST',
        headers: { ...auth, 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-type': 'video/mp4', 'x-upload-content-length': String(size) }, body: JSON.stringify({ snippet, status }) });
      if (!init.ok) throw httpErr(502, `YouTube a refusé l'envoi (${init.status}).`);
      const loc = init.headers.get('location'); if (!loc) throw httpErr(502, 'YouTube : adresse d\'envoi absente.');
      const up = await fetchImpl(loc, { method: 'PUT', headers: { ...auth, 'content-type': 'video/mp4', 'content-length': String(size) }, body: fs.createReadStream(video), duplex: 'half' });
      const v = await up.json().catch(() => ({})); if (!up.ok || !v.id) throw httpErr(502, `Envoi de la vidéo interrompu (${up.status}).`);
      const warn = [];
      if (thumb) { const b = fs.readFileSync(thumb); const r = await fetchImpl(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${v.id}`, { method: 'POST', headers: { ...auth, 'content-type': 'image/jpeg' }, body: b }); if (!r.ok) warn.push(`miniature refusée (${r.status} — chaîne non validée ?)`); }
      if (playlistId) { const r = await fetchImpl('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId: v.id } } }) }); if (!r.ok) warn.push(`ajout à la playlist refusé (${r.status})`); }
      return { videoId: v.id, url: `https://youtu.be/${v.id}`, warnings: warn };
    },
  };
}

// ---------- chaînes, liaisons style → chaîne, profils
export class Channels {
  constructor(dataDir) {
    this.file = dataDir ? path.join(dataDir, 'youtube-channels.json') : null;
    this.s = { channels: [], defaultId: null, bindings: {}, profiles: {} };
    try { if (this.file && fs.existsSync(this.file)) { Object.assign(this.s, JSON.parse(fs.readFileSync(this.file, 'utf8'))); fs.chmodSync(this.file, 0o600); } } catch (e) { console.error('[youtube] réglages des chaînes illisibles'); }
  }
  save() {
    if (!this.file) return;
    const copy = JSON.parse(JSON.stringify(this.s));
    for (const c of copy.channels || []) for (const k of SECRET_KEYS) if (c[k] && !String(c[k]).startsWith('v1:')) c[k] = sealSecret(c[k]);
    writePrivate(this.file, JSON.stringify(copy, null, 1));
  }
  /** Secrets en clair pour l'usage interne (upload). */
  unlocked(c) {
    if (!c) return null;
    const o = { ...c };
    for (const k of SECRET_KEYS) if (o[k]) o[k] = openSecret(o[k]);
    return o;
  }
  /** Les secrets connus, pour les masquer dans tout message d'erreur. */
  scrub(msg) { let m = String(msg || ''); for (const c of this.s.channels) for (const k of ['clientId', ...SECRET_KEYS]) if (c[k] && c[k].length >= 6) m = m.split(c[k]).join('•••'); return m; }
  get(id) { return this.s.channels.find((c) => c.id === id) || null; }
  ready(c) { const u = this.unlocked(c); return !!(u && u.clientId && u.clientSecret && u.refreshToken); }
  missing(c, lang = 'fr') {
    c = this.unlocked(c);
    const en = lang === 'en';
    if (!c) return en
      ? 'No YouTube channel configured: add one in Admin › YouTube channels.'
      : 'Aucune chaîne YouTube configurée : ajoute-en une dans Admin › Chaînes YouTube.';
    const m = [];
    if (!c.clientId) m.push('client ID');
    if (!c.clientSecret) m.push('client secret');
    if (!c.refreshToken) m.push(en ? 'refresh token' : "jeton d'actualisation");
    if (!m.length) return null;
    if (en) return `Channel “${c.name}”: missing ${m.join(', ')}. Fill them in Admin › YouTube channels.`;
    return `Chaîne « ${c.name} » : ${m.join(', ')} manquant${m.length > 1 ? 's' : ''}. Renseigne-${m.length > 1 ? 'les' : 'le'} dans Admin › Chaînes YouTube.`;
  }
  /** Vue publique : aucun secret, seulement « présent » / masque du client ID. */
  publicChannel(c) { return { id: c.id, name: c.name, channelId: c.channelId, clientId: mask(c.clientId), hasClientId: !!c.clientId, hasClientSecret: !!c.clientSecret, hasRefreshToken: !!c.refreshToken, ready: this.ready(c), isDefault: this.s.defaultId === c.id, styles: Object.entries(this.s.bindings).filter(([, v]) => v === c.id).map(([k]) => k), created: c.created }; }
  view() { return { channels: this.s.channels.map((c) => this.publicChannel(c)), defaultId: this.s.defaultId, bindings: { ...this.s.bindings } }; }
  upsert(b = {}, id = null) {
    let c = id ? this.get(id) : null; if (id && !c) throw httpErr(404, 'Chaîne introuvable');
    const name = str(b.name ?? c?.name, 80); if (!name) throw httpErr(400, 'Nom de la chaîne obligatoire');
    const channelId = str(b.channelId ?? c?.channelId, 40); if (channelId && !/^UC[\w-]{10,}$/.test(channelId)) throw httpErr(400, 'ID de chaîne invalide (commence par « UC »)');
    if (!c) { c = { id: 'ch_' + crypto.randomBytes(4).toString('hex'), created: new Date().toISOString() }; this.s.channels.push(c); }
    c.name = name; c.channelId = channelId;
    // champ secret : absent ou vide = inchangé ; null = effacé (bouton « Effacer »)
    for (const k of ['clientId', ...SECRET_KEYS]) { if (b[k] === null) c[k] = ''; else if (typeof b[k] === 'string' && b[k].trim()) c[k] = b[k].trim().slice(0, 2048); else c[k] ??= ''; }
    if (!this.s.defaultId || b.isDefault) this.s.defaultId = c.id;
    this.save(); return this.publicChannel(c);
  }
  remove(id) {
    if (!this.get(id)) throw httpErr(404, 'Chaîne introuvable');
    this.s.channels = this.s.channels.filter((c) => c.id !== id);
    for (const [k, v] of Object.entries(this.s.bindings)) if (v === id) delete this.s.bindings[k];
    if (this.s.defaultId === id) this.s.defaultId = this.s.channels[0]?.id || null;
    this.save();
  }
  setDefault(id) { if (!this.get(id)) throw httpErr(404, 'Chaîne introuvable'); this.s.defaultId = id; this.save(); }
  bind(style, id) { if (id == null || id === '') delete this.s.bindings[style]; else { if (!this.get(id)) throw httpErr(404, 'Chaîne introuvable'); this.s.bindings[style] = id; } this.save(); }
  /** Chaîne d'un style : liaison, sinon chaîne par défaut. */
  forStyle(style) { return this.get(this.s.bindings[style]) || this.get(this.s.defaultId) || null; }
  profile(style) { return normalizeProfile(this.s.profiles[style] || {}); }
  setProfile(style, p, { confirm } = {}) {
    const cur = this.profile(style), next = normalizeProfile({ ...cur, ...p, schedule: { ...cur.schedule, ...(p.schedule || {}) } }, cur);
    if (next.autoPublish && !cur.autoPublish && confirm !== CONFIRM_WORD) throw httpErr(428, `Pour activer l'auto-publication, confirme en tapant « ${CONFIRM_WORD} ».`);
    this.s.profiles[style] = next; this.save(); return next;
  }
}

// ---------- file de publication
export class PublishQueue {
  /** deps : { dataDir, store, tracksDir, channels, transport, ensureVideo(t) → t, ensureThumb(t) → t, info(t) → { title, description, tags, vars } } */
  constructor(deps) {
    Object.assign(this, deps); this.file = deps.dataDir ? path.join(deps.dataDir, 'publish-queue.json') : null; this.items = []; this.busy = false;
    try { if (this.file && fs.existsSync(this.file)) this.items = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch {}
    for (const it of this.items) if (['video', 'uploading'].includes(it.status)) Object.assign(it, { status: 'queued', progress: 0 }); // reprise après redémarrage
    setImmediate(() => this.pump());
  }
  save() { if (this.file) writePrivate(this.file, JSON.stringify(this.items.slice(-500))); }
  view(it) { return { ...it, statusLabel: STATUS_LABEL[it.status] || it.status, visibilityLabel: VIS_LABEL[it.visibility] || it.visibility }; }
  list({ style } = {}) { return this.items.filter((x) => !style || x.style === style).slice().reverse().map((x) => this.view(x)); }
  /** Ce qui serait publié (formulaire prérempli), plus l'état du jeton. */
  draft(t, over = {}) {
    const ch = (over.channelId && this.channels.get(over.channelId)) || this.channels.forStyle(t.style);
    const prof = normalizeProfile({ ...this.channels.profile(t.style), ...over, schedule: { ...this.channels.profile(t.style).schedule, ...(over.schedule || {}) } });
    const I = this.info(t), vars = { ...I.vars, chaine: ch?.name || '' };
    const title = fillTemplate(prof.title, vars).slice(0, 100), description = fillTemplate(prof.description, vars).slice(0, 5000);
    let tags = [...prof.tags, ...(prof.autoTags ? I.tags : [])].filter((x, i, A) => A.indexOf(x) === i); let n = 0; tags = tags.filter((x) => (n += x.length + 1) <= 500);
    return { channel: ch ? this.channels.publicChannel(ch) : null, ready: this.channels.ready(ch), reason: this.channels.missing(ch), transport: this.transport.kind,
      profile: prof, title, description, tags, publishAt: publishAtOf(prof.schedule), thumbnail: prof.thumbnail, visibility: prof.visibility, playlistId: prof.playlistId };
  }
  /** Ajoute un envoi. mode = manual (confirmation obligatoire) | auto (profil avec auto-publication activée). */
  enqueue(t, over = {}, { mode = 'manual', confirm } = {}) {
    if (!t || t.status !== 'done') throw httpErr(409, 'Morceau pas encore terminé');
    if (mode === 'manual' && confirm !== CONFIRM_WORD) throw httpErr(428, `Confirmation requise : tape « ${CONFIRM_WORD} » pour envoyer réellement sur YouTube.`);
    if (mode === 'auto' && !this.channels.profile(t.style).autoPublish) throw httpErr(409, 'Auto-publication désactivée pour ce style');
    const d = this.draft(t, over); if (!d.ready) throw httpErr(412, d.reason);
    const dup = this.items.find((x) => x.trackId === t.id && x.channelId === d.channel.id && ['queued', 'video', 'uploading', 'done'].includes(x.status));
    if (dup && !over.again) throw httpErr(409, dup.status === 'done' ? `Déjà publiée sur « ${d.channel.name} » (${dup.url}).` : 'Déjà dans la file de publication.');
    const it = { id: 'pub_' + crypto.randomBytes(4).toString('hex'), trackId: t.id, trackTitle: t.title, style: t.style, channelId: d.channel.id, channelName: d.channel.name, mode, transport: this.transport.kind,
      title: d.title, description: d.description, tags: d.tags, visibility: d.visibility, publishAt: d.publishAt, thumbnail: d.thumbnail, playlistId: d.playlistId,
      status: 'queued', progress: 0, error: null, videoId: null, url: null, created: new Date().toISOString(), finished: null };
    this.items.push(it); this.save(); this.pump(); return this.view(it);
  }
  cancel(id) { const it = this.items.find((x) => x.id === id); if (!it) throw httpErr(404, 'Envoi introuvable'); if (it.status !== 'queued' && it.status !== 'error') throw httpErr(409, 'Envoi déjà commencé ou terminé'); it.status = 'cancelled'; this.save(); return this.view(it); }
  retry(id) { const it = this.items.find((x) => x.id === id); if (!it) throw httpErr(404, 'Envoi introuvable'); if (it.status !== 'error') throw httpErr(409, 'Seuls les envois en erreur peuvent être relancés'); Object.assign(it, { status: 'queued', error: null }); this.save(); this.pump(); return this.view(it); }
  /** Appelé à la fin d'une génération : file l'envoi si le style a l'auto-publication activée et une chaîne prête. */
  onTrackDone(t) {
    if (!t || !this.channels.profile(t.style).autoPublish) return null;
    try { return this.enqueue(t, {}, { mode: 'auto' }); } catch (e) {
      const it = { id: 'pub_' + crypto.randomBytes(4).toString('hex'), trackId: t.id, trackTitle: t.title, style: t.style, channelId: null, channelName: null, mode: 'auto', transport: this.transport.kind, status: 'error', error: this.channels.scrub(e.message), created: new Date().toISOString() };
      if (e.status !== 409) { this.items.push(it); this.save(); } return null;
    }
  }
  async pump() {
    if (this.busy) return; this.busy = true;
    try { let it; while ((it = this.items.find((x) => x.status === 'queued'))) await this.runOne(it); } finally { this.busy = false; }
  }
  async runOne(it) {
    try {
      const ch = this.channels.get(it.channelId); if (!this.channels.ready(ch)) throw httpErr(412, this.channels.missing(ch));
      let t = this.store.get(it.trackId); if (!t || t.status !== 'done') throw new Error('Morceau introuvable');
      it.status = 'video'; this.save(); t = await this.ensureVideo(t);
      if (!t.files?.mp4) throw new Error('Vidéo absente');
      if (it.thumbnail === 'auto') t = await this.ensureThumb(t);
      const dir = path.join(this.tracksDir, t.id), video = path.join(dir, t.files.mp4), thumb = it.thumbnail === 'auto' && t.files?.thumb ? path.join(dir, t.files.thumb) : null;
      it.status = 'uploading'; this.save();
      const status = { privacyStatus: it.publishAt ? 'private' : it.visibility, selfDeclaredMadeForKids: false, ...(it.publishAt ? { publishAt: it.publishAt } : {}) };
      const r = await this.transport.upload({ channel: this.channels.unlocked(ch), video, thumb, snippet: { title: it.title, description: it.description, tags: it.tags, categoryId: '10', defaultLanguage: 'fr' }, status, playlistId: it.playlistId });
      Object.assign(it, { status: 'done', progress: 1, videoId: r.videoId, url: r.url, warnings: r.warnings || [], finished: new Date().toISOString() });
      const now = this.store.get(t.id); if (now) this.store.update(t.id, { meta: { ...(now.meta || {}), published: [...(now.meta?.published || []), { channelId: ch.id, channelName: ch.name, videoId: r.videoId, url: r.url, at: it.finished, mock: !!r.mock }] } });
    } catch (e) { Object.assign(it, { status: 'error', error: this.channels.scrub(e.message).slice(0, 400) }); console.error('[publication]', it.id, it.error); }
    this.save();
  }
}
