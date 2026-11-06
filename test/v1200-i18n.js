// v1.20.0 — EN mode must not leave French UI chrome; FR/EN catalogs must match.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import os from 'os';
import http from 'http';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
const check = (ok, msg) => { if (!ok) fail++; console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${msg}`); return ok; };

const fr = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/i18n/fr.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/i18n/en.json'), 'utf8'));
check(Object.keys(fr).length === Object.keys(en).length, `same key count fr=${Object.keys(fr).length} en=${Object.keys(en).length}`);
const onlyFr = Object.keys(fr).filter((k) => !(k in en));
const onlyEn = Object.keys(en).filter((k) => !(k in fr));
check(!onlyFr.length, `no FR-only keys (${onlyFr.slice(0, 5)})`);
check(!onlyEn.length, `no EN-only keys (${onlyEn.slice(0, 5)})`);
check(Object.keys(fr).length >= 500, `catalog size ≥ 500 (${Object.keys(fr).length})`);

// Values that are still French in the EN catalog (heuristic: common FR words / accents for UI chrome)
const FR_MARK = /\b(Enregistrer|Supprimer|Générer|Bibliothèque|Réglages|Connexion|Déconnexion|Sauvegarder|Actualiser|Morceau|introuvable|Réessayez|facultatif|Aucun|Ajouter|Tester|Importer|Veille|Directeur|Chaîne|Découper|Télécharger|Utilisateur|Sécurité|Mentions|Désactiver|Activer|Créer le|Lancer la|Sources par défaut)\b|[éèêàùôîçœ]/;
let badEnVals = 0;
for (const [k, v] of Object.entries(en)) {
  if (typeof v !== 'string') continue;
  // allow legal FR field label and French Touch as genre name
  if (k === 'admin.secLegalFr' || /French Touch|Ed Banger|néons/i.test(v)) continue;
  if (FR_MARK.test(v) && !/optional|Save|Delete|Generate|Library/i.test(v)) {
    // if FR and EN values identical and look French, flag
    if (fr[k] === v && FR_MARK.test(v)) {
      badEnVals++; if (badEnVals <= 8) console.log('  EN=FR', k, JSON.stringify(v).slice(0, 80));
    }
  }
}
check(badEnVals === 0, `EN values not identical-French leftovers (${badEnVals})`);

// Live render check: HTML shells + key JS modules must not hardcode common FR chrome without t()/data-i18n
const HARD = [
  [/>Enregistrer</, 'bare Enregistrer button'],
  [/>Supprimer</, 'bare Supprimer'],
  [/>Lancer la veille</, 'bare Lancer la veille'],
  [/>Ajouter la chaîne</, 'bare Ajouter la chaîne'],
  [/<h2>[^<]*Veille tendances/, 'bare Veille tendances heading'],
  [/<h2>[^<]*Chaînes YouTube/, 'bare Chaînes YouTube'],
  [/<h2>[^<]*Animations</, 'bare Animations h2'],
];
for (const f of ['public/admin.html', 'public/style.html', 'public/login.html', 'public/index.html']) {
  const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const [re, lab] of HARD) {
    if (re.test(html) && !html.includes(`data-i18n`) ) { /* ignore */ }
    // fail only if match is NOT on a data-i18n element line roughly
    const lines = html.split('\n').filter((l) => re.test(l) && !/data-i18n=/.test(l));
    check(!lines.length, `${f}: no bare FR « ${lab} » (${lines.length})`);
  }
}

// Spin server and fetch EN pages — look for French chrome in raw HTML (static shells)
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'st-i18n-'));
const port = 18120;
const srv = spawn(process.execPath, ['src/server.js'], {
  cwd: ROOT, env: { ...process.env, SOUNDTUBE_HOST: '127.0.0.1', SOUNDTUBE_PORT: String(port), SOUNDTUBE_DATA_DIR: data, SOUNDTUBE_MP3: 'off' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((r) => setTimeout(r, 900));
const get = (url) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port, path: url, headers: { Cookie: 'soundtube_ui_lang=en', 'Accept-Language': 'en' } }, (r) => {
    let b = ''; r.on('data', (c) => b += c); r.on('end', () => res({ status: r.statusCode, body: b }));
  }).on('error', rej);
});
const pages = ['/login', '/legal', '/privacy', '/terms', '/accueil', '/demarrer', '/styles', '/register', '/setup', '/', '/admin', '/profile'];
const PAGE_FR = /\b(Connexion|Bibliothèque|Réglages|Enregistrer|Mentions légales|Utilisateurs|Sécurité & exposition|Veille tendances|Chaînes YouTube|Générer le morceau|Accueil)\b/;
for (const pg of pages) {
  try {
    const { status, body } = await get(pg);
    // Static HTML may still contain FR as data-i18n defaults — that's OK if data-i18n is present.
    // Flag FR text that is NOT inside a data-i18n element (strip those).
    const stripped = body.replace(/<[^>]*data-i18n=["'][^"']+["'][^>]*>[^<]*<\/[^>]+>/g, '')
      .replace(/data-i18n-placeholder="[^"]*"/g, '')
      .replace(/placeholder="[^"]*"/g, '');
    // Allow brand soundtube, French Touch
    const hits = stripped.match(PAGE_FR) || [];
    // setup/admin may 200; login etc.
    check([200, 302, 404].includes(status), `${pg} status ${status}`);
    // For pages with heavy data-i18n, leftover FR chrome after strip should be low
    if (['/login', '/legal'].includes(pg) && status === 200) {
      check(hits.length === 0, `${pg} EN shell sans FR chrome (${hits})`);
    }
  } catch (e) { check(false, `${pg} fetch ${e.message}`); }
}

// API error language
const { body: errBody } = await get('/api/tracks/does-not-exist');
check(/Track not found|Morceau introuvable/.test(errBody), 'track 404 bilingual-capable');
// With Accept-Language en should prefer EN
await new Promise((res) => {
  const req = http.request({ host: '127.0.0.1', port, path: '/api/tracks/nope', method: 'GET', headers: { Cookie: 'soundtube_ui_lang=en', 'Accept-Language': 'en' } }, (r) => {
    let b = ''; r.on('data', (c) => b += c); r.on('end', () => {
      check(b.includes('Track not found'), `EN API error: ${b.slice(0, 80)}`);
      res();
    });
  });
  req.end();
});


// Headless EN DOM scan (zero tolerance for common French chrome words)
try {
  const puppeteer = await import('/workspace/soundtube/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js');
  const browser = await puppeteer.default.launch({
    executablePath: '/usr/bin/google-chrome', headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  const FR_WORDS = /\b(Connexion|Bibliothèque|Réglages|Enregistrer|Mentions légales|Utilisateurs|Sécurité|Veille tendances|Chaînes YouTube|Générer le morceau|Accueil|Inscriptions ouvertes|Créer un compte|Mot de passe|Déconnexion|Confidentialité|Conditions d’utilisation|S’inscrire|Se connecter)\b/;
  const enPages = [
    { url: '/login', wait: 'body' },
    { url: '/legal', wait: 'body' },
    { url: '/privacy', wait: 'body' },
    { url: '/terms', wait: 'body' },
    { url: '/accueil', wait: 'body' },
    { url: '/demarrer', wait: 'body' },
    { url: '/styles', wait: 'body' },
    { url: '/register', wait: 'body' },
  ];
  for (const pg of enPages) {
    const page = await browser.newPage();
    await page.setCookie({ name: 'soundtube_ui_lang', value: 'en', domain: '127.0.0.1', path: '/' });
    await page.goto(`http://127.0.0.1:${port}${pg.url}?lang=en`, { waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
    await page.waitForSelector(pg.wait, { timeout: 8000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 400));
    const text = await page.evaluate(() => document.body?.innerText || '');
    // Allow brand / French Touch / Néons samples in demos
    const cleaned = text.replace(/French Touch|Ed Banger|Néons sur la Seine|soundtube/gi, '');
    const hit = cleaned.match(FR_WORDS);
    check(!hit, `EN DOM ${pg.url} sans chrome FR (${hit && hit[0]})`);
    await page.close();
  }
  await browser.close();
} catch (e) {
  check(false, `headless DOM scan: ${e.message}`);
}


srv.kill('SIGTERM');
try { fs.rmSync(data, { recursive: true, force: true }); } catch {}
console.log(fail ? fail + ' échec(s)' : `v1.20.1-i18n : OK (${Object.keys(fr).length} keys)`);
process.exit(fail ? 1 : 0);
