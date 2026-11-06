# Migration v1.19.x → v1.20.0

## Dépendances

Aucune nouvelle dépendance npm native. Auth = crypto Node (scrypt, AES-GCM, HMAC).  
`npm ci` / `npm install` inchangé si tu as déjà `express`, `swagger-ui-express`, `@tonejs/midi` (+ optionnel `better-sqlite3`).

## Appliquer le patch (CT, root, sans sudo)

```bash
systemctl stop soundtube
cd /opt/soundtube/app
tar xzf /root/soundtube-1.20.0-patch.tar.gz --no-same-owner
# vérifier : pas de sous-dossier soundtube/
ls src/auth/store.js public/login.html
chown -R root:root /opt/soundtube/app
systemctl start soundtube
```

Puis Ctrl+F5. Première visite locale : `/setup` pour créer l’admin.

## NPM

Coller `deploy/npm-admin-block.conf` dans Advanced / custom locations du Proxy Host.  
Dans Admin › Sécurité : IP du proxy + domaine public.

## Données

Nouveaux fichiers sous `data/` : `users.json`, `sessions.json`, `api-tokens.json`, `security.json`, `secret.key`, `audit.jsonl` (chmod 600).  
Les secrets YouTube existants sont re-chiffrés au démarrage.
