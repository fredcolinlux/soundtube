// v1.21.3 : prompt système du directeur artistique, réglé dans Admin › 07 (stocké dans le dossier de données,
// jamais dans /opt/soundtube/app : survit aux patchs). Trois modes :
//   builtin   — prompt intégré de soundtube (défaut, comportement inchangé) ;
//   custom    — texte de l'Admin comme message système, suivi du contrat JSON + catalogue obligatoires du code ;
//   modelfile — AUCUN message système : Ollama applique le SYSTEM du Modelfile du modèle choisi (Admin › PC IA) ;
//               le contrat JSON + catalogue passent dans le message utilisateur ; la température n'est pas imposée.
// Réglages d'inférence : température (défaut 0.7, vide = défaut du modèle) et num_ctx (défaut 8192, vide = défaut du modèle).
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

export const PROMPT_MAX = 20000;
export const MODES = ['builtin', 'custom', 'modelfile'];
export const DEFAULTS = Object.freeze({ mode: 'builtin', prompt: '', temperature: 0.7, numCtx: 8192 });
export const NUM_CTX = { min: 2048, max: 131072, recommendedLong: 16384 };
const FILE = () => path.join(config.dataDir, 'director-prompt.json');
const err = (msg, status = 400) => Object.assign(new Error(msg), { status });
const CTRL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

function normalize(o = {}) {
  const out = { ...DEFAULTS };
  if (MODES.includes(o.mode)) out.mode = o.mode;
  if (typeof o.prompt === 'string') out.prompt = o.prompt.replace(/\r\n?/g, '\n').replace(CTRL, '').slice(0, PROMPT_MAX);
  if (o.temperature === null) out.temperature = null;
  else if (o.temperature !== undefined && Number.isFinite(+o.temperature) && +o.temperature >= 0 && +o.temperature <= 2) out.temperature = Math.round(+o.temperature * 100) / 100;
  if (o.numCtx === null) out.numCtx = null;
  else if (o.numCtx !== undefined && Number.isInteger(+o.numCtx) && +o.numCtx >= NUM_CTX.min && +o.numCtx <= NUM_CTX.max) out.numCtx = +o.numCtx;
  return out;
}

export function get() {
  try { return normalize(JSON.parse(fs.readFileSync(FILE(), 'utf8'))); } catch { return { ...DEFAULTS }; }
}

/** Mise à jour partielle validée. `restore: true` efface le texte personnalisé et revient au prompt intégré. */
export function update(b = {}) {
  const cur = get();
  if (b.restore) { cur.mode = 'builtin'; cur.prompt = ''; }
  if (b.mode !== undefined) { if (!MODES.includes(b.mode)) throw err('Mode de prompt inconnu'); cur.mode = b.mode; }
  if (b.prompt !== undefined) {
    if (typeof b.prompt !== 'string') throw err('Prompt système : texte attendu');
    if (b.prompt.length > PROMPT_MAX) throw err(`Prompt système trop long (${b.prompt.length} > ${PROMPT_MAX} caractères)`);
    cur.prompt = b.prompt;
  }
  if (b.temperature !== undefined) {
    if (b.temperature === null || b.temperature === '') cur.temperature = null;
    else { const t = +String(b.temperature).replace(',', '.'); if (!Number.isFinite(t) || t < 0 || t > 2) throw err('Température : entre 0 et 2 (vide = défaut du modèle)'); cur.temperature = t; }
  }
  if (b.numCtx !== undefined) {
    if (b.numCtx === null || b.numCtx === '') cur.numCtx = null;
    else { const c = +b.numCtx; if (!Number.isInteger(c) || c < NUM_CTX.min || c > NUM_CTX.max) throw err(`num_ctx : entier entre ${NUM_CTX.min} et ${NUM_CTX.max} (vide = défaut du modèle)`); cur.numCtx = c; }
  }
  if (cur.mode === 'custom' && !cur.prompt.trim()) throw err('Mode « Prompt personnalisé » : le prompt système est vide');
  const next = normalize(cur);
  fs.mkdirSync(config.dataDir, { recursive: true });
  const tmp = FILE() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, FILE());
  return next;
}

/** Options Ollama effectives pour le directeur (le mode Modelfile n'impose jamais la température). */
export function inference(cfg = get()) {
  return {
    temperature: cfg.mode === 'modelfile' ? null : cfg.temperature,
    num_ctx: cfg.numCtx,
    noSystem: cfg.mode === 'modelfile',
  };
}

/** Vue Admin. */
export function view(cfg = get()) {
  const est = Math.ceil(cfg.prompt.length / 3.5);
  return { ...cfg, max: PROMPT_MAX, modes: MODES, defaults: DEFAULTS, numCtxRange: NUM_CTX, chars: cfg.prompt.length, estTokens: est,
    longPromptHint: cfg.mode === 'custom' && est > 2000 && (cfg.numCtx ?? 0) < NUM_CTX.recommendedLong, file: path.basename(FILE()) };
}
