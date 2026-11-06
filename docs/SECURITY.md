# Sécurité — soundtube v1.20.0

## Modèle d’exposition

- **Réseau local (RFC1918 / loopback / CIDR Admin)** : comportement historique, pas d’auth obligatoire. Admin accessible.
- **Internet** (derrière Nginx Proxy Manager) : session cookie ou jeton Bearer requis pour l’API. `/admin`, `/setup` et `/api/admin/*` répondent **404** même connecté.
- TLS : géré par NPM (Let’s Encrypt). soundtube envoie HSTS seulement si `X-Forwarded-Proto: https` vient d’un **proxy de confiance**.

## Proxy de confiance

Dans Admin › Sécurité, renseigne l’IP (ou CIDR) de NPM. Seules ces adresses peuvent injecter `X-Forwarded-For` / `X-Forwarded-Proto`.

Le **domaine public** (ex. `soundtube.example.com`) est un réglage Admin, jamais codé en dur dans le dépôt.

## Authentification

- Mots de passe : **scrypt** (Node.js natif, paramètres N=16384,r=8,p=1) — zéro dépendance native.
- Cookie de session : `HttpOnly`, `SameSite=Strict`, `Secure` + préfixe `__Host-` en HTTPS.
- CSRF : en-tête `X-CSRF-Token` pour les mutations cookie-session.
- Rate-limit / verrouillage temporaire après N échecs (réglable).
- 2FA TOTP optionnel + codes de récupération (QR d’enrollement via `/api/me/totp/qr.svg`, encodeur SVG vendored, aucun service externe) ; passkeys WebAuthn (ES256) optionnelles.
- Jetons API `st_…` stockés hachés (SHA-256), scopes, révocation Admin.

## Fichiers générés

Hors LAN, les URL de fichiers passent par des **liens HMAC signés** à durée limitée (`/api/signed/…`). Propriété `meta.ownerId` par morceau.

## Secrets au repos

Clé maître `data/secret.key` (chmod 600). Secrets YouTube chiffrés AES-256-GCM (`v1:…`).

## En-têtes (WebGuardian / OWASP)

CSP (`script-src 'self'`, pas d’inline), HSTS, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, nosniff, Referrer-Policy, Permissions-Policy, COOP/CORP/COEP, pas de `X-Powered-By`, `/.well-known/security.txt`.

## Fail2ban

Journaux : `[soundtube-auth] Failed password for USER from IP`. Filtre / jail d’exemple : `deploy/fail2ban/soundtube-auth.conf`.

## Sauvegarde

Admin › Sécurité › « Sauvegarder users/config » ou `tools/backup-auth.sh`. Restauration : `POST /api/admin/auth/restore` `{ "archive": "<base64>" }` puis `systemctl restart soundtube`.

## Checklist WebGuardian

| Contrôle | Statut |
|---|---|
| Content-Security-Policy | Oui |
| Strict-Transport-Security | Oui (via HTTPS / XFP) |
| X-Frame-Options DENY | Oui |
| X-Content-Type-Options nosniff | Oui |
| Referrer-Policy | Oui |
| Permissions-Policy | Oui |
| COOP / COEP / CORP | Oui |
| Cookies Secure + HttpOnly + SameSite=Strict | Oui |
| Préfixe __Host- | Oui (HTTPS) |

### Démo Styles (v1.20.3)

Visiteurs anonymes : `POST /api/demo/generate` force **≤ 15 s**, audio seul, rate-limit **3 / 10 min / IP**, priorité inférieure aux jobs connectés, fichiers dans `data/demo/` purgés toutes les **5 min**. Admin hors LAN → **404** brandée.

Démo = écoute seule : toute tentative de téléchargement, publication ou écriture bibliothèque sur un job démo renvoie **401**.

### Documentation API (v1.21.1)
`/docs`, `/api/docs` et `/api/openapi.json` sont **réservés au LAN** (404 stylée depuis internet). L’API elle-même reste utilisable à distance avec un jeton Bearer.
