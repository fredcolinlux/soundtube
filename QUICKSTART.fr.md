# Démarrage rapide — soundtube 1.20.4

Trois étapes. Rien d’autre n’est obligatoire.

## 1. Installer

```bash
tar xzf soundtube-1.20.4-patch.tar.gz -C /opt/soundtube/app --no-same-owner
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
