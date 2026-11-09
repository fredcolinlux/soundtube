// v1.21.2 — pied de page : version + lien GitHub (URL configurable Admin).
import { t, getUiLang, onLangChange } from './i18n.js';

const GH_SVG = `<svg class="gh-ico" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.5 7.5 0 0 1 8 3.5c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>`;

let cached = { version: '', githubUrl: 'https://github.com/fredcolinlux/soundtube' };

export async function loadSiteMeta() {
  try {
    const r = await fetch('/api/site', { cache: 'no-cache' });
    if (r.ok) cached = { ...cached, ...(await r.json()) };
  } catch {}
  try {
    if (!cached.version) {
      const r = await fetch('/api/health', { cache: 'no-cache' });
      if (r.ok) {
        const j = await r.json();
        cached.version = j.version || cached.version;
        if (j.githubUrl) cached.githubUrl = j.githubUrl;
      }
    }
  } catch {}
  return cached;
}

function paint(el) {
  if (!el) return;
  const ver = cached.version ? `v${cached.version}` : '';
  const url = cached.githubUrl || 'https://github.com/fredcolinlux/soundtube';
  const label = t('footer.github');
  const verHtml = ver ? `<span class="foot-ver" title="soundtube">${ver}</span>` : '';
  let slot = el.querySelector('.foot-meta');
  if (!slot) {
    slot = document.createElement('span');
    slot.className = 'foot-meta';
    el.appendChild(slot);
  }
  slot.innerHTML = `${verHtml}<a class="foot-gh" href="${url}" target="_blank" rel="noopener noreferrer" title="${label}">${GH_SVG}<span data-i18n-keep="1">${label}</span></a>`;
}

/** Remplit version + lien GitHub dans le footer trouvé (ou `root`). */
export async function mountSiteFooter(root = document) {
  await loadSiteMeta();
  const foot = root.querySelector?.('footer.site-foot, footer.foot, .auth-foot, footer') || (root.matches?.('footer, .auth-foot') ? root : null);
  if (!foot) return null;
  paint(foot);
  onLangChange(() => paint(foot));
  return foot;
}
