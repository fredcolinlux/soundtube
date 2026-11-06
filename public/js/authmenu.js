// Menu compte : Connexion / avatar (initiales) › Profil · Déconnexion — v1.20.1
import { t } from './i18n.js';
import { apiFetch, refreshAuth, getAuthUser } from './csrf.js';

function initials(name) {
  const s = String(name || '?').trim();
  const parts = s.split(/[._\s-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return s.slice(0, 2).toUpperCase();
}

/** Monte le contrôle auth dans `host` (élément du topbar). */
export async function mountAuthMenu(host, { showRegister = true } = {}) {
  if (!host) return null;
  const st = await refreshAuth().catch(() => null);
  const user = st?.authenticated ? (st.user || getAuthUser()) : null;
  const openReg = !!st?.openRegistration;

  const paint = () => {
    if (!user) {
      host.innerHTML = `<div class="auth-menu">
        <a class="btn btn-ghost btn-mini" href="/login" data-i18n="nav.login">${t('nav.login')}</a>
        ${openReg && showRegister ? `<a class="btn btn-primary btn-mini" href="/register" data-i18n="nav.register">${t('nav.register')}</a>` : ''}
      </div>`;
      return;
    }
    const ini = initials(user.username);
    host.innerHTML = `<div class="auth-menu">
      <button type="button" class="auth-avatar" id="authMenuBtn" aria-haspopup="menu" aria-expanded="false" title="${user.username}">
        <span class="auth-ini" aria-hidden="true">${ini}</span>
        <span class="auth-name">${user.username}</span>
      </button>
      <div class="auth-drop" id="authDrop" hidden role="menu">
        <a href="/profile" role="menuitem" data-i18n="nav.profile">${t('nav.profile')}</a>
        ${user.role === 'admin' ? `<a href="/admin" role="menuitem" data-i18n="nav.admin">${t('nav.admin')}</a>` : ''}
        <button type="button" role="menuitem" id="authLogout" data-i18n="nav.logout">${t('nav.logout')}</button>
      </div>
    </div>`;
    const btn = host.querySelector('#authMenuBtn');
    const drop = host.querySelector('#authDrop');
    btn.addEventListener('click', () => {
      const open = drop.hidden; drop.hidden = !open; btn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', (e) => {
      if (!host.contains(e.target)) { drop.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
    });
    host.querySelector('#authLogout')?.addEventListener('click', async () => {
      try { await apiFetch('/api/auth/logout', { method: 'POST' }); } catch {}
      location.href = '/';
    });
  };
  paint();
  return { user, st, repaint: paint };
}
