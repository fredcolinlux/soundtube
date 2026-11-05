# YouTube — chaînes, publication, design (v1.18.0)

## Vue d’ensemble

soundtube prépare miniature, vidéo (720p / 1080p / 4K), titres et descriptions **FR + EN**, tags, et peut publier via OAuth vers une ou plusieurs chaînes. La langue d’interface (sélecteur FR|EN) **ne change pas** ce comportement : utilisez `/api/youtube/lang` et le panneau YouTube du morceau.

Transport de test : `SOUNDTUBE_YT_TRANSPORT=mock` (aucun envoi réel).

## Admin → Chaînes YouTube

- Plusieurs chaînes ; une **par défaut** ; **liaisons style → chaîne**.
- Secrets (jetons OAuth) stockés en mode `0600`, **jamais** renvoyés par l’API ni journalisés.
- Profil par style : gabarits titre/description, tags, miniature, visibilité, playlist, programmation, auto-publication (opt-in confirmé).

Endpoints : `GET /api/admin/youtube`, `POST/PUT/DELETE …/channels`, `PUT …/default`, `PUT …/bindings`, `GET/PUT /api/styles/{id}/publish`.

## Panneau morceau

- Miniature / fond (animation du style ou bibliothèque Admin → Animations).
- Mise en page (`/api/youtube/design`, surcharge `/api/tracks/{id}/design`).
- Marque (`/api/youtube/brand`).
- Génération / aperçu textes ; loudness cible `SOUNDTUBE_LUFS` / `SOUNDTUBE_TRUE_PEAK` (défaut −14 LUFS / −1 dBTP).
- Publication : `POST /api/tracks/{id}/publish` → file `GET /api/publish/queue` (cancel / retry).

## Vidéo

`POST /api/tracks/{id}/video` avec résolution `720p` | `1080p` | `2160p`/`4k`. Routage vers le meilleur nœud libre (NVENC → VT → libx264 → CT). Pas de BPM/tonalité incrustés sur l’image ; chapitres = titres du mix.

## Animations

Bibliothèque `/api/media` ; choix avant génération (`animation` dans `POST /api/generate`) ou mémorisé par style (`/api/styles/{id}/animation`). « Fond du style » = dégradé généré.

## Bonnes pratiques

- Ne jamais committer `client_secret` / refresh tokens.
- Vérifier le mock en CI (`test/v1130.js`).
- Séparer comptes de test et production.
