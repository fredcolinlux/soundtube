// v1.10.0 : fiches de style lues dans docs/STYLES.md (une seule source de vérité pour la doc et les pages de style).
// Convertisseur Markdown minimal et sûr (tout est échappé, seules quelques balises sont produites).
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const FILE_FR = path.join(config.root, 'docs', 'STYLES.md');
const FILE_EN = path.join(config.root, 'docs', 'en', 'STYLES.md');
const fileFor = (lang) => (lang === 'en' && fs.existsSync(FILE_EN) ? FILE_EN : FILE_FR);
const HEAD_ID = [[/^Lo-fi/i, 'lofi'], [/^Ambient/i, 'ambient'], [/^Synthwave/i, 'synthwave'], [/^Deep House/i, 'house'], [/^French Touch/i, 'frenchtouch'],
  [/^Techno/i, 'techno'], [/^Cin[ée]matique|^Cinematic/i, 'cinematic'], [/^Chiptune/i, 'chiptune'], [/^Trap|^Instrumental Trap/i, 'trap'], [/^Hip-Hop/i, 'hiphop'], [/^Drum/i, 'dnb']];
/** Machines et synthés reconnus dans le texte d'une fiche (tous synthétisés en JS, aucun échantillon de machine). */
export const MACHINES = [
  ['TR-909', /TR-909|\b909\b/], ['TR-808', /TR-808|\b808\b/], ['TR-707', /TR-707/], ['TR-606', /TR-606/], ['DR-110', /DR-110/], ['TB-303', /TB-303|\b303\b/],
  ['DX7', /DX7/], ['Minimoog', /Minimoog/], ['Juno', /Juno/], ['Jupiter', /Jupiter/], ['ARP', /\bARP\b/], ['Talkbox / vocodeur', /talkbox|vocodeur/i],
  ['Rhodes', /Rhodes/], ['Supersaw', /supersaw/i], ['Reese', /\breese\b/i], ['Piano', /\bpiano/i], ['Cordes', /cordes|spiccato/i], ['Puce 8-bit', /8-bit|carrés/i],
];

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function inline(s) {
  return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[\s(«])\*([^*\s][^*]*?)\*(?=[\s,.;:)»]|$)/g, '$1<i>$2</i>');
}
const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
/** Markdown (sous-ensemble de STYLES.md) → HTML : paragraphes, listes à puces (avec lignes de suite), tableaux. */
export function mdToHtml(md) {
  const L = String(md).replace(/\r/g, '').split('\n'), out = []; let i = 0;
  while (i < L.length) {
    const l = L[i];
    if (!l.trim() || /^---+$/.test(l.trim())) { i++; continue; }
    if (/^#{1,4}\s/.test(l)) { const n = l.match(/^#+/)[0].length; out.push(`<h${Math.min(6, n + 1)}>${inline(l.replace(/^#+\s*/, ''))}</h${Math.min(6, n + 1)}>`); i++; continue; }
    if (/^\s*\|/.test(l) && /^\s*\|[\s:|-]+\|\s*$/.test(L[i + 1] || '')) {
      const h = cells(l); i += 2; const rows = [];
      while (i < L.length && /^\s*\|/.test(L[i])) rows.push(cells(L[i++]));
      out.push(`<div class="md-table"><table><thead><tr>${h.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^\s*[*-]\s/.test(l)) {
      const items = [];
      while (i < L.length && (/^\s*[*-]\s/.test(L[i]) || (/^\s{2,}\S/.test(L[i]) && items.length))) {
        if (/^\s*[*-]\s/.test(L[i])) items.push(L[i].replace(/^\s*[*-]\s/, '')); else items[items.length - 1] += ' ' + L[i].trim();
        i++;
      }
      out.push(`<ul>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</ul>`); continue;
    }
    const p = [];
    while (i < L.length && L[i].trim() && !/^\s*[*-]\s|^#|^\s*\|/.test(L[i])) p.push(L[i++].trim());
    out.push(`<p>${inline(p.join(' '))}</p>`);
  }
  return out.join('\n');
}

/** Puces « **Titre** texte » → fiche { label, html }. */
function factsOf(md) {
  const facts = []; let cur = null;
  for (const l of md.split('\n')) {
    if (/^\s*[*-]\s/.test(l)) { cur = l.replace(/^\s*[*-]\s/, ''); facts.push(cur); } else if (cur !== null && /^\s{2,}\S/.test(l)) facts[facts.length - 1] += ' ' + l.trim(); else cur = null;
  }
  return facts.map((t) => { const m = t.match(/^\*\*([^*]+)\*\*\s*(.*)$/); return m ? { label: m[1].replace(/[:\s]+$/, ''), html: inline(m[2].replace(/^[—:–-]\s*/, '')) } : { label: '', html: inline(t) }; });
}

const cache = { fr: { mtime: 0, data: null }, en: { mtime: 0, data: null } };
/** { sections: {styleId: {title, md, html, facts, machines}}, roadmap: html|null, intro: html } — relu si le fichier change. */
export function stylesDoc(lang = 'fr') {
  const L = lang === 'en' ? 'en' : 'fr';
  const FILE = fileFor(L);
  let st; try { st = fs.statSync(FILE); } catch { return { sections: {}, roadmap: null, intro: '' }; }
  const slot = cache[L];
  if (slot.data && slot.mtime === st.mtimeMs) return slot.data;
  const md = fs.readFileSync(FILE, 'utf8'); const parts = md.split(/\n(?=## )/);
  const sections = {}; let roadmap = null; let ai = null;
  for (const p of parts) {
    const m = p.match(/^## (.+)\n([\s\S]*)$/); if (!m) continue;
    const title = m[1].trim(), body = m[2].trim();
    if (/^(Feuille de route|Roadmap)/i.test(title)) { roadmap = mdToHtml(body); continue; }
    if (/^(Directeur artistique|Art director)/i.test(title)) { ai = mdToHtml(body); continue; }
    const id = HEAD_ID.find(([rx]) => rx.test(title))?.[1]; if (!id || sections[id]) continue;
    sections[id] = { title, html: mdToHtml(body), facts: factsOf(body), machines: MACHINES.filter(([, rx]) => rx.test(body)).map(([n]) => n) };
  }
  slot.mtime = st.mtimeMs; slot.data = { sections, roadmap, ai };
  return slot.data;
}
