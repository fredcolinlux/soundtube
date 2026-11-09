<!-- v1.21.4 routes: / home, /studio studio -->
# Démarrage rapide — soundtube 1.21.4

Trois étapes. Rien d’autre n’est obligatoire.

## 1. Installer

```bash
tar xzf soundtube-1.21.4-patch.tar.gz -C /opt/soundtube/app --no-same-owner
# redémarre le service soundtube
```

## 2. Créer l’admin (réseau local)

Ouvre `http://<IP-du-CT>:8080/setup` depuis le LAN.  
Une seule étape : **identifiant + mot de passe**.  
Pas de code OTP à l’installation — la 2FA reste optionnelle dans **Mon profil** (QR TOTP + codes de récupération).

## 3. Derrière NPM (internet)

1. Pointe le Proxy Host vers le CT.
2. Colle le snippet `deploy/npm-admin-block.conf` (bloque `/admin` depuis internet).
3. Ouvre **Admin → Sécurité** depuis le LAN : confirme le **proxy** et le **domaine** détectés (un clic chacun).  
   Jusque-là, le trafic proxifié exige une connexion (défaut sûr).

Le **studio** et la **bibliothèque** demandent toujours un compte (même en LAN).  
Accueil, styles, mentions légales restent publics.

Inscriptions : fermées par défaut (`Admin → Inscriptions ouvertes`).

Les pages **Styles** sans compte proposent une **démo audio de 15 s** (hors bibliothèque, limite 3 / 10 min). Connecte-toi pour générer des morceaux complets.


## Mise à jour (patch plat)

Utilise le script inclus (en **root**, sans `sudo` dans la commande) :

```bash
# depuis n’importe où, avec le script déjà déployé :
/opt/soundtube/app/scripts/update.sh /chemin/soundtube-1.21.4-patch.tar.gz

# ou plusieurs patches dans l’ordre :
/opt/soundtube/app/scripts/update.sh /chemin/patch-a.tar.gz /chemin/patch-b.tar.gz
```

Le script **vérifie** chaque archive (gzip, tar, layout **plat** sans préfixe `soundtube/`) **avant** d’arrêter le service, crée une sauvegarde dans `/var/backups/soundtube/`, applique, contrôle la syntaxe Node, redémarre **toujours** (reprise de la sauvegarde si l’extraction a échoué), puis attend `http://127.0.0.1:8080/healthz`.

> Ne plus enchaîner à la main `systemctl stop && tar … && systemctl start` : si le `tar` échoue, le service reste arrêté (502).

## Accès perdu

```bash
node /opt/soundtube/app/scripts/admin-reset.js <utilisateur> --disable-2fa --password
```
Root + console/LAN uniquement ; mot de passe saisi masqué ; entrée d’audit ; fonctionne service en marche.
