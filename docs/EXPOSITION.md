# Exposer soundtube sur Internet (v1.20.0)

Prérequis : Nginx Proxy Manager déjà en place (TLS). soundtube écoute en HTTP sur le CT (`0.0.0.0:8080`).

## 1. NPM — Proxy Host

- Domain Names : ton domaine public (réglé aussi dans Admin › Sécurité › Domaine public)
- Scheme : `http` → Forward Hostname/IP : IP du CT, port `8080`
- Websockets : off (inutile)
- SSL : certificat Let’s Encrypt, Force SSL, HTTP/2
- **Custom location / Advanced** : coller `deploy/npm-admin-block.conf` (404 sur `/admin`, `/setup`, `/api/admin`)

## 2. soundtube — Admin (en local)

1. Ouvre `http://<IP-CT>:8080/setup` (première fois) → compte admin.
2. Admin › Sécurité :
   - **IP / CIDR du reverse proxy** = IP de NPM vue depuis le CT
   - **Domaine public** = FQDN (sans `https://`)
   - Mentions légales FR/EN
3. Crée des utilisateurs (creator / viewer) + quotas.
4. Optionnel : active 2FA / passkey sur ton compte ; crée un jeton API.

## 3. Vérifications

```bash
# Depuis le CT (local) : Admin OK
curl -sI http://127.0.0.1:8080/admin | head -1

# Via le domaine : Admin doit être 404 (NPM ou soundtube)
curl -sI https://TON_DOMAINE/admin | head -1

# Scan WebGuardian
# https://webguardian.cloud/ → saisis le domaine
```

## 4. Fail2ban (hôte Proxmox ou CT)

Voir `deploy/fail2ban/soundtube-auth.conf`. Oriente `logpath` vers la journalisation de ton service (`journalctl -u soundtube` via rsyslog, ou fichier).

## 5. Points d’attention

- Nodes de rendu, Ollama, veille : **local only** — ne les expose pas.
- Quotas + file équitable : protège le PC GPU.
- Fichiers : liens signés hors LAN.
- Le dépôt GitHub public ne doit contenir ni domaine perso, ni IP, ni secrets.
