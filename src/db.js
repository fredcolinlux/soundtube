// Stockage des morceaux : SQLite (better-sqlite3) avec repli automatique sur un fichier JSON.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const JSON_FIELDS = ['params', 'meta', 'waveform', 'files'];

function decode(row) {
  if (!row) return null;
  const o = { ...row };
  for (const f of JSON_FIELDS) if (typeof o[f] === 'string') { try { o[f] = JSON.parse(o[f]); } catch { o[f] = null; } }
  return o;
}
function encode(obj) {
  const o = { ...obj };
  for (const f of JSON_FIELDS) if (f in o && o[f] !== null && typeof o[f] !== 'string') o[f] = JSON.stringify(o[f]);
  return o;
}

const COLUMNS = ['id', 'title', 'style', 'status', 'progress', 'stage', 'error', 'params', 'meta', 'waveform', 'files',
  'seed', 'variation', 'bpm', 'key', 'scale', 'mood', 'duration', 'parent_id', 'render_ms', 'created_at', 'finished_at', 'eta'];

class SqliteStore {
  constructor(file) {
    const Database = require('better-sqlite3');
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY, title TEXT, style TEXT, status TEXT, progress REAL DEFAULT 0, stage TEXT, error TEXT,
      params TEXT, meta TEXT, waveform TEXT, files TEXT, seed INTEGER, variation INTEGER, bpm INTEGER, key TEXT,
      scale TEXT, mood TEXT, duration REAL, parent_id TEXT, render_ms INTEGER, created_at TEXT, finished_at TEXT);
      CREATE INDEX IF NOT EXISTS idx_tracks_created ON tracks(created_at);`);
    // migrations douces
    const cols = this.db.prepare('PRAGMA table_info(tracks)').all().map((c) => c.name);
    if (!cols.includes('eta')) this.db.exec('ALTER TABLE tracks ADD COLUMN eta REAL');
    this.kind = 'sqlite';
  }
  insert(t) {
    const o = encode(t); const cols = COLUMNS.filter((c) => c in o);
    this.db.prepare(`INSERT INTO tracks (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${cols.map((c) => '@' + c).join(',')})`).run(o);
  }
  update(id, patch) {
    const o = encode(patch); const cols = Object.keys(o).filter((c) => COLUMNS.includes(c) && c !== 'id');
    if (!cols.length) return;
    this.db.prepare(`UPDATE tracks SET ${cols.map((c) => `"${c}"=@${c}`).join(',')} WHERE id=@id`).run({ ...o, id });
  }
  get(id) { return decode(this.db.prepare('SELECT * FROM tracks WHERE id=?').get(id)); }
  missingDates() { return this.db.prepare("SELECT id, finished_at FROM tracks WHERE created_at IS NULL OR created_at = ''").all(); }
  list({ style, status, limit = 100, offset = 0 } = {}) {
    const where = []; const args = {};
    if (style) { where.push('style=@style'); args.style = style; }
    if (status) { where.push('status=@status'); args.status = status; }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const rows = this.db.prepare(`SELECT * FROM tracks ${w} ORDER BY created_at DESC, id DESC LIMIT @limit OFFSET @offset`).all({ ...args, limit, offset });
    const total = this.db.prepare(`SELECT COUNT(*) n FROM tracks ${w}`).get(args).n;
    return { items: rows.map(decode), total };
  }
  delete(id) { this.db.prepare('DELETE FROM tracks WHERE id=?').run(id); }
}

class JsonStore {
  constructor(file) {
    this.file = file; this.kind = 'json';
    this.rows = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  }
  save() { const tmp = this.file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(this.rows)); fs.renameSync(tmp, this.file); }
  insert(t) { this.rows[t.id] = { ...t }; this.save(); }
  update(id, patch) { if (this.rows[id]) { Object.assign(this.rows[id], patch); if (!('progress' in patch) || patch.status) this.save(); } }
  get(id) { return this.rows[id] ? structuredClone(this.rows[id]) : null; }
  list({ style, status, limit = 100, offset = 0 } = {}) {
    let all = Object.values(this.rows);
    if (style) all = all.filter((r) => r.style === style);
    if (status) all = all.filter((r) => r.status === status);
    all.sort((a, b) => (a.created_at === b.created_at ? (a.id < b.id ? 1 : -1) : (a.created_at || '') < (b.created_at || '') ? 1 : -1));
    return { items: all.slice(offset, offset + limit).map((r) => structuredClone(r)), total: all.length };
  }
  delete(id) { delete this.rows[id]; this.save(); }
  missingDates() { return Object.values(this.rows).filter((r) => !r.created_at).map((r) => ({ id: r.id, finished_at: r.finished_at })); }
}

export function openStore(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  try {
    return new SqliteStore(path.join(dataDir, 'soundtube.db'));
  } catch (e) {
    console.warn('[soundtube] better-sqlite3 indisponible, repli sur stockage JSON :', e.message);
    return new JsonStore(path.join(dataDir, 'tracks.json'));
  }
}
