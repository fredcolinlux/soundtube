<!-- v1.20.5 routes: / home, /studio studio -->
# Manuel utilisateur — soundtube 1.18.0

L’interface web est en **français** et en **anglais** (**FR | EN** dans la barre du haut). Le choix est stocké dans le navigateur (`localStorage` + cookie `soundtube_ui_lang`). La génération des titres / descriptions / tags YouTube (FR+EN) est **indépendante** de la langue d’interface (`/api/youtube/lang`).

## Pages

| Chemin | Libellé | Rôle |
|---|---|---|
| `/accueil` | Accueil | Entrée |
| `/demarrer` | Démarrer | Visite guidée + premiers réglages |
| `/styles` | Styles | Catalogue |
| `/styles/<id>` | Fiche de style | Texte issu de `docs/STYLES.md`, préréglage → génération |
| `/` | Studio | Créer, bibliothèque, panneau YouTube |
| `/admin` | Admin | Nœuds, répartition, IA, YouTube, animations, directeur, veille, marque |
| `/docs` | API | Interface OpenAPI |

## 1. Studio — Créer

Libellés tels qu’affichés en français :

1. **Style** — l’un des 11 styles (voir `docs/STYLES.md`).
2. **Durée** — secondes ; préréglage 15 min (= 900 s) ; plafond `SOUNDTUBE_MAX_DURATION` (défaut 14400 = 4 h).
3. **Tempo**, **Tonalité**, **Gamme / mode**, **Ambiance** — Auto possible.
4. **Variante** — sous-styles (lo-fi, French Touch, hip-hop, DnB…).
5. **Fond sonore** — synthétisé + volume.
6. **Variation** — Faible / Moyenne / Forte / Maximale (Moyenne = comportement historique octet pour octet). Sur les longs mix : **Autoriser d’autres styles proches dans le mix**.
7. **Avancé** — valeurs réelles pour la graine affichée ; champs modifiés en vert, mémorisés par style.
8. **Directeur artistique** — décrire l’ambiance → **Proposer** ; option **Titre, description et tags FR + EN** ; **Plan titre par titre** (mix ≥ 1 h).
9. **Formats** — MP3 + MIDI toujours ; **WAV (sans perte)** optionnel.
10. **Découpage** (jobs > 30 min) — coupe milieu / transitions complètes / sans transitions ; bibliothèque et vidéos par morceau optionnelles.
11. **Pack** — préparer le ZIP complet en fin de rendu.
12. Option **Faire la musique et la vidéo en même temps sur le PC / Mac**.
13. **Générer le morceau**.

## 2. Bibliothèque

Écoute, téléchargements WAV / MP3 / MIDI / ZIP MIDI, détails (graine, moteur, nœud), renommage FR/EN, **Variation**, **Régénérer** (harmonie v1.12+), découpage, pack, YouTube, publication.

## 3. Panneau YouTube

Miniature / fond animé, mise en page, loudness, textes FR+EN, publication OAuth si chaînes configurées. Voir [YOUTUBE.md](YOUTUBE.md).

## 4. Admin

- **Nœuds de rendu (musique + vidéo)** — URL `http://hôte:8765`, jeton optionnel, découverte LAN, tout tester, historique.
- **Répartition** — forcer un nœud ; CT local = secours / parallèle ; **Musique sur le PC à partir de** N min.
- **PC IA (Ollama)** — URL + modèle + délai.
- **Chaînes YouTube** — multi-chaînes, défaut, liaisons par style (secrets jamais renvoyés).
- **Animations vidéo** — import des fonds.
- **Contexte du directeur artistique** — goût / veille (coupés par défaut).
- **Veille tendances**.
- **Marque / nom affiché**.

## 5. Mobile

Sous ~390 px la barre se replie ; le sélecteur de langue reste visible.

## Banque d'échantillons

Pianos, cordes, batterie acoustique, etc. depuis `assets/samples/` (voir [SAMPLES-LICENSES.md](../SAMPLES-LICENSES.md)). Le Rhodes échantillonné (jRhodes, CC BY-NC) n'est pas dans le dépôt public : synthèse à la place. Le piano Salamander ajoute automatiquement le crédit CC BY dans les descriptions YouTube.

## Veille tendances

Dans **Admin**, configurez les sources RSS publiques (liste par défaut fournie) et, si besoin, un **modèle Ollama dédié** à la veille. Lancement manuel ou planifié. Les propositions ont un bouton **Appliquer** (rien n’est appliqué seul). Les noms d’artistes sont retirés des textes générés.

## Profil & double authentification (v1.20.2)

Dans **Mon profil**, tu peux activer un TOTP optionnel : un **QR code** (SVG servi par `/api/me/totp/qr.svg`, sans service externe) + secret base32, puis confirmation par code. Les codes de récupération s’affichent **une seule fois** (téléchargement possible). Les passkeys restent optionnelles.

## Démo Styles (sans compte)

Sans connexion, chaque page de style propose un **aperçu de 15 secondes** (audio seul). Les fichiers démo ne rejoignent pas la bibliothèque et sont effacés automatiquement. Le bouton **Connectez-vous pour créer des morceaux complets** mène au login.

## Nouveautés v1.21.2

- **Morceaux** : une génération lancée avec « Découper en morceaux individuels » ouvre le panneau **Morceaux** du mix dès la fin du rendu et suit la découpe ; la bibliothèque se met aussi à jour seule (toutes les 15 s) quand des morceaux sont ajoutés ailleurs (autre onglet, ZIP, API).
- **ZIP complet** : textes en français **et** en anglais — `LISEZMOI.txt` + `README.txt`, `youtube-fr.txt` + `youtube-en.txt` (titre, description, tags du mix), et pour chaque morceau `<morceau>.txt` + `<morceau>.en.txt`. Avec « Vidéo par morceau », chaque morceau a sa vidéo MP4 dans `morceaux/`.
- **Admin › 07 Contexte du directeur** : le profil d'écoute s'affiche de nouveau et « Revenir au profil livré » fonctionne. Le profil actif est enregistré dans le dossier de données (`/var/lib/soundtube/gout.json`) et survit aux mises à jour ; sans profil personnel, un exemple générique est chargé.
- **Connexion avec double authentification** : l'étape « code » fonctionne de nouveau. Accès perdu : voir [EXPLOITATION.md](EXPLOITATION.md) (`scripts/admin-reset.js`).
