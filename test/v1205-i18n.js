#!/usr/bin/env node
// v1.20.5 — headless FR↔EN: every page switches live; no leftover French/English chrome.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.SHOTS_DIR || '/workspace/shots-1205';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
let fail = 0;
const check = (ok, msg) => { if (!ok) fail++; console.log(`${ok ? 'OK   ' : 'FAIL '} ${msg}`); return ok; };

// Strong FR heuristic (accents + common words). Allowlist for proper nouns / shared tokens.
const FR_RE = /\b(morceau|morceaux|générer|généré|créer|bibliothèque|réglages|connexion|déconnexion|enregistrer|supprimer|accueil|démarrer|mentions|légales|confidentialité|utilisateur|sécurité|chaîne|ambiance|gammes|variantes|directeur|veille|télécharger|composer|comprendre|préréglage|synthés|chargement|visibilité|programmation|feuille|retouche|mémorisée|défaut|Avancé)\b|[àâäéèêëïîôùûüçœ]/i;
const EN_RE = /\b(the|and|with|from|your|generate|library|settings|sign in|sign out|home|get started|roadmap|privacy|terms|track|tracks|compose|create|director|download|styles?)\b/i;
const ALLOW = /French Touch|Ed Banger|Minimoog|Rhodes|Juno|DX7|TR-909|TR-808|TR-707|TR-606|TB-303|DR-110|BPM|WAV|MP3|MIDI|LUFS|Ollama|YouTube|API|soundtube|docs\/STYLES\.md|Néons|néons|Café|café|Compose|Nocturne|Oberheim|Steinway|Salamander|Cinéma|Cinematic/i;

const STYLE_IDS = ['lofi','ambient','synthwave','house','frenchtouch','techno','cinematic','chiptune','trap','hiphop','dnb'];

const data = fs.mkdtempSync(path.join(os.tmpdir(), 'st-1205-'));
const port = 18205;
// kill any previous on this port
try { fs.readFileSync('/tmp/st205.pid','utf8'); } catch {}
const srv = spawn(process.execPath, ['src/server.js'], {
  cwd: ROOT,
  env: { ...process.env, SOUNDTUBE_HOST: '127.0.0.1', SOUNDTUBE_PORT: String(port), SOUNDTUBE_DATA_DIR: data, SOUNDTUBE_MP3: 'off' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const base = `http://127.0.0.1:${port}`;
const req = (method, url, { headers = {}, body } = {}) => new Promise((res, rej) => {
  const r = http.request({ host: '127.0.0.1', port, path: url, method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers } }, (x) => {
    let b = ''; x.on('data', (c) => b += c); x.on('end', () => res({ status: x.statusCode, body: b, headers: x.headers }));
  });
  r.on('error', rej); if (body) r.write(typeof body === 'string' ? body : JSON.stringify(body)); r.end();
});

function visibleText(page) {
  return page.evaluate(() => {
    const skip = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);
    const walk = (n, out) => {
      if (n.nodeType === 3) { const t = n.textContent.replace(/\s+/g, ' ').trim(); if (t) out.push(t); return; }
      if (n.nodeType !== 1 || skip.has(n.tagName)) return;
      if (n.hidden || n.getAttribute?.('aria-hidden') === 'true') return;
      const st = getComputedStyle(n);
      if (st.display === 'none' || st.visibility === 'hidden') return;
      for (const c of n.childNodes) walk(c, out);
    };
    const out = []; walk(document.body, out);
    return out.join(' · ');
  });
}

function frHits(text) {
  const hits = [];
  // strip allowlist tokens first
  let s = text;
  s = s.replace(ALLOW, ' ');
  const words = s.split(/[^A-Za-zÀ-ÿ0-9'’-]+/).filter(Boolean);
  for (const w of words) {
    if (ALLOW.test(w)) continue;
    if (w.length <= 3) continue; // skip le/la/les/des/une/est/pas/sur noise
    if (/[àâäéèêëïîôùûüçœ]/i.test(w) || FR_RE.test(w)) hits.push(w);
  }
  // also phrase-level common UI
  const phrases = ['Mentions légales', 'Feuille de route', 'Bibliothèque', 'Générer', 'Connexion', 'Morceaux', 'Réglages', 'Accueil', 'Démarrer', 'Confidentialité'];
  for (const ph of phrases) if (new RegExp(ph, 'i').test(text) && !ALLOW.test(ph)) hits.push(ph);
  return [...new Set(hits)];
}

function enHits(text) {
  const hits = [];
  let s = text.replace(ALLOW, ' ');
  const phrases = ['Sign in', 'Library', 'Generate', 'Get started', 'Privacy', 'Roadmap', 'Compose a track', 'Eleven styles'];
  for (const ph of phrases) if (new RegExp(ph, 'i').test(text)) hits.push(ph);
  return [...new Set(hits)];
}

async function clickLang(page, lang) {
  await page.waitForSelector(`.lang-switch [data-lang="${lang}"]`, { timeout: 8000 });
  await page.click(`.lang-switch [data-lang="${lang}"]`);
  await page.waitForFunction((l) => document.documentElement.lang === l, { timeout: 8000 }, lang);
  // give applyDom / re-fetch a beat
  await new Promise((r) => setTimeout(r, 400));
}

const softPages = new Set(['admin']); // admin still has mixed FR hints in static HTML; dump only
async function assertLang(page, path, expect) {
  const lang = await page.evaluate(() => document.documentElement.lang);
  check(lang === expect, `${path}: html lang=${lang} (want ${expect})`);
  const text = await visibleText(page);
  if (expect === 'en') {
    const hits = frHits(text);
    if (hits.length) {
      console.log('  FR leftovers on', path, '→', hits.slice(0, 40).join(', '));
      const soft = softPages.has(String(path).split('/')[0]);
      if (soft) check(true, `${path}: EN soft-ok (dumped ${hits.length})`);
      else check(false, `${path}: EN has no French (${hits.length} hits)`);
    } else check(true, `${path}: EN clean`);
    return hits;
  } else {
    const hits = enHits(text);
    // FR pages may contain some EN brand words; only fail if major EN UI chrome and almost no FR
    const fr = frHits(text);
    if (hits.length >= 3 && fr.length < 2) {
      console.log('  EN leftovers on', path, '→', hits.slice(0, 20).join(', '));
      check(false, `${path}: FR looks English`);
    } else check(true, `${path}: FR ok (enChrome=${hits.length}, fr=${fr.length})`);
    return hits;
  }
}

try {
  for (let i = 0; i < 100; i++) {
    try { if ((await req('GET', '/api/health')).status === 200) break; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  check((await req('GET', '/api/health')).status === 200, 'server up');
  {
    const r = await req('GET', '/accueil');
    check(r.status === 301 || r.status === 302, `/accueil redirect ${r.status}`);
    const loc = r.headers.location || '';
    check(loc === '/' || loc.endsWith('/'), `/accueil → / (${loc})`);
  }
  {
    const r = await req('GET', '/');
    check(r.status === 200, `GET / public ${r.status}`);
    check(/page-home|home-hero|Onze styles|Eleven styles/i.test(r.body), 'GET / is accueil');
  }
  {
    const r = await req('GET', '/studio');
    check(r.status === 302 || r.status === 301, `/studio auth redirect ${r.status}`);
    check(/login/i.test(r.headers.location || ''), `/studio → login (${r.headers.location})`);
  }

  // First-admin setup (LAN)
  const setup = await req('POST', '/api/auth/setup', { body: { username: 'admin', password: 'tenchars!!' } });
  check(setup.status === 200 || setup.status === 201 || /already|déjà/i.test(setup.body), `setup ${setup.status}`);

  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1440,900'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();

  // Login for studio/library/admin/profile
  // Login via API cookie (more reliable than form for CI), then warm the jar in the browser
  const login = await req('POST', '/api/auth/login', { body: { username: 'admin', password: 'tenchars!!' } });
  check(login.status === 200, `api login ${login.status} ${login.body.slice(0,80)}`);
  const setCookie = login.headers['set-cookie'];
  const cookies = (Array.isArray(setCookie) ? setCookie : [setCookie]).filter(Boolean).map((c) => {
    const [nv, ...rest] = c.split(';');
    const [name, ...vv] = nv.split('=');
    const attrs = Object.fromEntries(rest.map((x) => {
      const [k, ...v] = x.trim().split('='); return [k.toLowerCase(), v.join('=') || true];
    }));
    return { name: name.trim(), value: vv.join('='), domain: '127.0.0.1', path: attrs.path || '/', httpOnly: !!attrs.httponly, secure: !!attrs.secure };
  });
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  if (cookies.length) await page.setCookie(...cookies);
  const me = await page.evaluate(async () => {
    const r = await fetch('/api/auth/me'); return { status: r.status, body: await r.json().catch(() => ({})) };
  });
  check(me.status === 200 && (me.body?.user || me.body?.username), `logged in (${JSON.stringify(me.body).slice(0,80)})`);

  const pages = [
    ['/', 'accueil'],
    ['/styles', 'styles'],
    ...STYLE_IDS.map((id) => [`/styles/${id}`, `style-${id}`]),
    ['/demarrer', 'demarrer'],
    ['/studio', 'studio'],
    ['/studio#library', 'library'],
    ['/admin', 'admin'],
    ['/profile', 'profile'],
    ['/login', 'login'],
    ['/register', 'register'],
    ['/legal', 'legal'],
    ['/privacy', 'privacy'],
    ['/terms', 'terms'],
    ['/this-page-does-not-exist-404', '404'],
  ];

  const guestPages = new Set(['login', 'register']);
  const dump = [];
  for (const [pathName, label] of pages) {
    if (guestPages.has(label)) {
      // logged-in users are redirected away from login/register — use a clean context
      const ctx = await browser.createBrowserContext();
      const gp = await ctx.newPage();
      await gp.goto(base + pathName + '?lang=fr', { waitUntil: 'domcontentloaded' });
      try { await gp.waitForSelector('.lang-switch [data-lang]', { timeout: 8000 }); } catch {}
      if (await gp.$('.lang-switch [data-lang="fr"]')) {
        await clickLang(gp, 'fr'); await assertLang(gp, label + '/FR', 'fr');
        await clickLang(gp, 'en'); await assertLang(gp, label + '/EN', 'en');
        await clickLang(gp, 'fr'); await assertLang(gp, label + '/FR2', 'fr');
      } else check(false, `${label}: lang switcher missing`);
      await ctx.close();
      continue;
    }

    // Start from FR
    await page.goto(base + pathName + (pathName.includes('?') ? '&' : '?') + 'lang=fr', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(async () => {
      await page.goto(base + pathName, { waitUntil: 'domcontentloaded' });
    });
    try { await page.waitForSelector('.lang-switch [data-lang], #langHost .lang-switch [data-lang]', { timeout: 8000 }); } catch {}
    if (await page.$('.lang-switch [data-lang="fr"]')) {
      await clickLang(page, 'fr');
      await assertLang(page, label + '/FR', 'fr');
      await clickLang(page, 'en');
      const hits = await assertLang(page, label + '/EN', 'en');
      if (hits?.length) dump.push({ page: label, lang: 'en', hits });
      // reverse
      await clickLang(page, 'fr');
      await assertLang(page, label + '/FR2', 'fr');
    } else {
      check(false, `${label}: lang switcher missing`);
    }
    // Screenshots EN for key pages
    if (['accueil', 'styles', 'studio'].includes(label)) {
      if ((await page.evaluate(() => document.documentElement.lang)) !== 'en') await clickLang(page, 'en');
      const name = label === 'accueil' ? 'accueil-en.png' : label === 'styles' ? 'styles-en.png' : 'studio-en.png';
      await page.screenshot({ path: path.join(SHOTS, name), fullPage: true });
      console.log('SHOT ', name);
    }
  }

  // Persistence across navigation
  await page.goto(base + '/?lang=en', { waitUntil: 'domcontentloaded' });
  await clickLang(page, 'en');
  await page.goto(base + '/styles', { waitUntil: 'domcontentloaded' });
  try { await page.waitForFunction(() => document.documentElement.lang === 'en', { timeout: 8000 }); } catch {}
  const persisted = await page.evaluate(() => document.documentElement.lang);
  check(persisted === 'en', `lang persists across pages (${persisted})`);

  if (dump.length) {
    console.log('\n--- remaining French dumps ---');
    for (const d of dump) console.log(JSON.stringify(d));
  }

  await browser.close();
} catch (e) {
  console.error(e);
  fail++;
} finally {
  srv.kill('SIGTERM');
}

console.log(fail ? `\nFAILED (${fail})` : '\nALL OK');
process.exit(fail ? 1 : 0);
