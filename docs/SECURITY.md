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

Clé maître `secret.key` (chmod 600) dans le **dossier de données** (`/var/lib/soundtube` en production, jamais dans `/opt/soundtube/app`). Aucun patch ne la contient ni ne l’écrase. v1.21.2 : si elle n’existe que dans l’ancien `<app>/data/`, elle y est **copiée** au démarrage ; une clé illisible bloque le démarrage au lieu d’être régénérée ; si le service est lancé à la main sans `SOUNDTUBE_DATA_DIR`, `/var/lib/soundtube` est utilisé dès qu’il contient des comptes. Secrets TOTP / YouTube / réseaux chiffrés AES-256-GCM (`v1:…`).

## En-têtes (WebGuardian / OWASP)

CSP (`script-src 'self'`, pas d’inline), HSTS, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, nosniff, Referrer-Policy, Permissions-Policy, COOP/CORP/COEP, pas de `X-Powered-By`, `/.well-known/security.txt`.

## Fail2ban

Journaux : `[soundtube-auth] Failed password for USER from IP` et (v1.21.2) `Failed 2fa for USER from IP`. Filtre / jail d’exemple : `deploy/fail2ban/soundtube-auth.conf`.

## Accès admin perdu / OTP perdu (v1.21.2)

Sur le serveur, en **root** (console ou SSH depuis le LAN — refusé depuis une IP publique) :

```bash
cd /opt/soundtube/app
node scripts/admin-reset.js <utilisateur> --disable-2fa             # supprime TOTP + codes de récupération + passkeys
node scripts/admin-reset.js <utilisateur> --password                # nouveau mot de passe, saisi masqué (TTY)
node scripts/admin-reset.js <utilisateur> --disable-2fa --password  # les deux
```

Le script réactive le compte, ferme toutes ses sessions, écrit `admin.cli_reset` dans `audit.jsonl`, garde le propriétaire `soundtube` et le mode 0600 des fichiers, puis signale le service (SIGHUP : rechargement à chaud, verrous de connexion effacés ; `--restart` pour redémarrer, `--no-reload` pour ne rien envoyer). **Fonctionne service en marche.** Le mot de passe n’est **jamais** passé en argument. Données lues dans `$SOUNDTUBE_DATA_DIR`, sinon `/etc/soundtube/soundtube.env`, sinon `/var/lib/soundtube`.

> Éditer `users.json` à la main reste possible (`"totpSecret": null`), même service en marche : depuis 1.21.2 le serveur détecte le changement sur disque, recharge le fichier et ne le réécrit jamais depuis une copie mémoire périmée (avant, l’édition manuelle était écrasée à la première connexion). Depuis 1.21.2, des fichiers `users.json` / `sessions.json` / `api-tokens.json` / `security.json` vides, `{}`, `null` ou incomplets sont tolérés (normalisés au chargement).

### Cause du blocage corrigée en 1.21.2

Depuis l’activation de la 2FA, l’étape « code » de la page de connexion échouait **toujours** avec `403 Jeton CSRF invalide` : `login.js` ne reprenait pas le jeton CSRF de la session partielle renvoyé par `/api/auth/login`. Le code TOTP n’était même pas vérifié. Corrigé (jeton repris côté client + en-tête `X-CSRF-Token` côté serveur). Autres durcissements :

- le **code TOTP est vérifié en premier** (fenêtre ±1 pas de 30 s) ; un champ « code de récupération » prérempli par le navigateur ne l’écrase plus ;
- décalage d’horloge détecté (±10 pas) → entrée `totp.skew` dans l’audit (vérifiez NTP : `timedatectl`) ;
- secret TOTP indéchiffrable (clé maître changée) → message explicite renvoyant vers `admin-reset.js` au lieu d’une erreur 500 opaque ;
- échecs 2FA journalisés `Failed 2fa for …` (filtre fail2ban mis à jour). Confirmez le proxy NPM dans Admin › Sécurité, sinon c’est l’IP du proxy qui serait bannie.

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
