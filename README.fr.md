<p align="center">
  <img src="docs/screenshots/hero.jpg" alt="soundtube — musique instrumentale algorithmique auto-hébergée" width="100%">
</p>

<p align="center">
  <strong>soundtube</strong> — plateforme <em>auto-hébergée</em> de musique instrumentale algorithmique (sans voix).<br/>
  Théorie musicale · synthèse temps réel · démo Styles · studio, bibliothèque &amp; admin — <strong>FR &amp; EN</strong>
</p>

<p align="center">
  <a href="https://github.com/fredcolinlux/soundtube/releases/tag/v1.20.4"><img alt="release" src="https://img.shields.io/github/v/release/fredcolinlux/soundtube?style=flat-square&color=5ef2c9"></a>
  <img alt="node" src="https://img.shields.io/badge/node-%3E%3D20-7dd3fc?style=flat-square">
  <img alt="license" src="https://img.shields.io/badge/licence-tous%20droits%20r%C3%A9serv%C3%A9s-c792ff?style=flat-square">
  <img alt="i18n" src="https://img.shields.io/badge/UI-FR%20%7C%20EN-f3c97a?style=flat-square">
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="QUICKSTART.fr.md">Démarrage rapide</a> ·
  <a href="docs/MANUEL-UTILISATEUR.md">Manuel</a> ·
  <a href="docs/MANUEL-INSTALLATION.md">Installation</a> ·
  <a href="docs/SECURITY.md">Sécurité</a> ·
  <a href="CHANGELOG.md">Journal</a>
</p>

<p align="center">
  <img src="docs/screenshots/preview.gif" alt="Aperçu de l’interface soundtube" width="800">
</p>

---


> **Routes :** `/` accueil public · `/studio` générateur (connexion) · `/styles` catalogue · `/accueil` → `/`.

## Pourquoi soundtube ?

La plupart des outils « IA musique » sont des SaaS fermés. **soundtube** tourne sur *ton* matériel :

- **Moteur procédural** — gammes, progressions, mélodies de Markov, batterie, formes intro→outro, puis synthèse temps réel.
- **Interface soignée** — accueil, Styles, studio, bibliothèque, YouTube optionnel, Admin — bascule **FR | EN**.
- **Auth prête pour Internet** — sessions, CSRF, TOTP optionnel (QR) & passkeys, Admin **LAN only**.
- **Démo Styles anonyme** — **aperçu audio 15 s** (écoute seule : pas de téléchargement, publication ni bibliothèque).
- **Auto-hébergé** — LXC Debian / bare metal, compatible NPM, en-têtes type WebGuardian.

## Points forts

| Zone | Contenu |
|------|---------|
| **Studio** | Génération complète, réglages avancés, MIDI, pack ZIP, nœuds vidéo |
| **Styles** | Fiches riches + **démo 15 s** hors connexion |
| **Bibliothèque** | Écoute, régénération, export (connecté) |
| **Auth** | Setup, login, inscriptions optionnelles, 2FA profil |
| **Admin** | Sécurité (proxy/domaine), users, nœuds, directeur IA — **LAN + admin** |
| **i18n** | 800+ clés, Mentions / Confidentialité / CGU |

## Galerie

| Accueil | Démo Styles | Studio |
|:---:|:---:|:---:|
| ![Accueil](docs/screenshots/home.jpg) | ![Démo](docs/screenshots/styles-demo-fr.jpg) | ![Studio](docs/screenshots/studio.jpg) |

| Bibliothèque | Admin | Connexion |
|:---:|:---:|:---:|
| ![Bibliothèque](docs/screenshots/library.jpg) | ![Admin](docs/screenshots/admin.jpg) | ![Login](docs/screenshots/login.jpg) |

| 404 | Enrollement TOTP | Mobile |
|:---:|:---:|:---:|
| ![404](docs/screenshots/error-404-fr.jpg) | ![2FA](docs/screenshots/totp-2fa-fr.jpg) | ![Mobile](docs/screenshots/styles-demo-mobile.jpg) |

## Démarrage en 3 étapes

```bash
# 1) Décompresser le standalone
tar -xzf soundtube-1.20.4-standalone.tar.gz
cd soundtube

# 2) Installer (Debian 13 LXC / bare metal — en root)
./deploy/install.sh --port 8080

# 3) Ouvrir le wizard LAN
#    http://<hôte>:8080/setup   → identifiant + mot de passe (pas d’OTP imposé)
```

Derrière **NPM** : Proxy Host → CT, snippet `deploy/npm-admin-block.conf`, puis confirmer proxy + domaine dans **Admin → Sécurité**.

**Patch** (archive à plat) :

```bash
tar xzf soundtube-1.20.4-patch.tar.gz -C /opt/soundtube/app --no-same-owner
```

## Architecture

```mermaid
flowchart LR
  Visiteur -->|Démo Styles 15s| DemoQueue
  User -->|Studio / Bibliothèque| API
  Admin -->|LAN + session| AdminAPI
  API --> JobQueue
  DemoQueue -->|audio seul| DemoDir[(data/demo purge 5 min)]
  JobQueue --> Worker[Worker de rendu]
  Worker --> Tracks[(data/tracks)]
  JobQueue -.->|optionnel| Node[Agent PC de rendu]
  API --> Auth[AuthStore sessions CSRF TOTP]
```

## Manuels

Voir le tableau dans [README.md](README.md#manuals) — chemins `docs/` et `docs/en/`.

## Sécurité (résumé)

- Studio + APIs de génération : **login pour tous**.
- Admin = LAN **et** session admin ; hors LAN → **404** brandée.
- TOTP optionnel avec QR SVG serveur ; codes de récupération une fois.
- Démo Styles : 15 s, rate-limit, **écoute seule** (`401` sur download/publish/library).

## FAQ

**GPU obligatoire ?** Non pour les rendus courts sur le CT. Nœuds Windows/macOS optionnels pour le long / la vidéo.

**La démo Styles est-elle gratuite ?** Oui : **15 s, audio, écoute seule**. Connexion pour les morceaux complets.

**Admin depuis Internet ?** Non — 404 brandée. Passe par le LAN / VPN.

**OTP au setup ?** Non. La 2FA est optionnelle dans **Mon profil**.

**Licence ?** Tous droits réservés — [`LICENSE`](LICENSE).

## Releases

➡️ **[GitHub Releases](https://github.com/fredcolinlux/soundtube/releases)** — archives standalone + patch.
