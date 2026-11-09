# Référence API — soundtube 1.18.0

Spécification interactive : **`/docs`**. JSON OpenAPI 3 : **`GET /api/openapi.json`** (champ `info.version` = 1.18.0).

Base URL typique : `http://<hôte>:8080`. Corps JSON (`Content-Type: application/json`) sauf envois binaires.

## Santé & options

| Méthode | Chemin | Rôle |
|---|---|---|
| GET | `/api/health` | Version, stockage, ffmpeg, file |
| GET | `/api/options` | Styles, ambiances, tonalités, gammes, instruments, limites, avancés |
| POST | `/api/advanced/defaults` | Valeurs avancées réelles pour style + graine |
| GET/PUT | `/api/ui/lang` | Langue d’**interface** (`fr`\|`en`) |

## Génération & bibliothèque

| Méthode | Chemin | Rôle |
|---|---|---|
| POST | `/api/generate` | Crée un job (202 + morceau) |
| POST | `/api/check-duplicates` | Doublons / proximité avant génération |
| GET | `/api/jobs/{id}` | Suivi de job |
| GET | `/api/tracks` | Liste (`style`, `status`, `limit`, `offset`) |
| GET/PATCH/DELETE | `/api/tracks/{id}` | Détail / renommer / supprimer |
| POST | `/api/tracks/{id}/variation` | Variation |
| POST | `/api/tracks/{id}/regenerate` | Nouvelle piste moteur 21 (original intact) |
| GET | `/api/tracks/{id}/settings` | Réglages enregistrés |
| GET | `/api/tracks/{id}/audio.wav` | WAV |
| GET | `/api/tracks/{id}/audio.mp3` | MP3 |
| GET | `/api/tracks/{id}/track.mid` | MIDI mix |
| GET | `/api/tracks/{id}/midi.zip` | MIDI par piste |

Paramètres principaux de `POST /api/generate` : `style`, `bpm`, `key`, `scale`, `mood`, `duration`, `wav`, `adv`, `engine` (17–21), `variety`, `mixStyles`, `seed`, `variation`, `instruments`, `title`, `title_en`, `aiPlan`, `aiMeta`, `animation`, `pcCombo`, `pack`, `split`.

## Démo publique & cloisonnement de la bibliothèque (v1.21.4)

| Méthode | Chemin | Rôle |
|---|---|---|
| GET | `/api/demo/tracks` | Sans compte : morceaux choisis par l’admin (`items`, `total`, `max` = 10 ; filtre `style`). Forme réduite, `listenOnly: true`, `urls.mp3` = route ci-dessous |
| GET | `/api/demo/tracks/{id}/audio` | Audio d’un morceau choisi (inline, `no-store`, `Range`). `?download` → 401 ; non choisi → 404 |
| GET/PUT | `/api/admin/demo-tracks` | Admin (local + session admin + CSRF). GET : `max`, `maxSeconds` (300), `selected`, `candidates[]` (`id`, `title`, `style`, `duration`, `created_at`, `owner`, `selected`). PUT `{ "ids": [...] }` : ≤ 10 morceaux terminés de moins de 5 min, sinon 400 (`id` fautif) |
| GET/PUT | `/api/admin/samples` | Admin. Dossier de samples externes : GET = réglage, état du dossier, comptes, scan en cours ; PUT `{ "dir": "/mnt/samples", "enabled": true }` (chemin absolu, pas de dossier système / application / données → 400). Nouveau dossier lisible → scan lancé |
| POST | `/api/admin/samples/scan` | Admin. Re-scan (202 ; `?wait` attend la fin). Dossier illisible → 409 |

Règles de visibilité : **sans compte**, `GET /api/tracks` renvoie seulement les morceaux de la démo et toute autre route
`/api/tracks/{id}/…` ou `/api/jobs/{id}` → 401 (404 si le morceau n’est pas choisi) ; **créateur / lecteur** : uniquement ses
morceaux (`meta.ownerId`), les autres → 404 ; **admin** : tout. `GET /api/options` expose `extSamples { active, counts }` ;
`POST /api/generate` accepte `adv.drumKit = "user"` (kit « Mes samples », 400 si l’index est inactif ; rendu toujours local).

## Découpage

| Méthode | Chemin |
|---|---|
| GET/POST/DELETE | `/api/tracks/{id}/split` |
| GET | `/api/tracks/{id}/split.zip` |
| GET/POST | `/api/tracks/{id}/split/videos` |
| GET | `/api/tracks/{id}/split/videos.zip` |

## Vidéo / miniature / YouTube (morceau)

| Méthode | Chemin |
|---|---|
| GET | `/api/tracks/{id}/youtube` |
| POST | `/api/tracks/{id}/thumbnail` |
| POST | `/api/tracks/{id}/video` |
| GET | `/api/tracks/{id}/video.mp4` |
| GET | `/api/tracks/{id}/thumb.jpg` |
| POST | `/api/tracks/{id}/youtube/preview` |
| GET/PUT | `/api/tracks/{id}/design` |
| GET/POST | `/api/tracks/{id}/publish` |

## YouTube global & médias

| Méthode | Chemin |
|---|---|
| GET/PUT | `/api/youtube/brand` |
| GET/PUT | `/api/youtube/design` |
| GET/PUT | `/api/youtube/lang` | Langue des **contenus** YouTube (≠ UI) |
| GET | `/api/youtube/base.jpg` |
| GET/POST | `/api/media` |
| DELETE | `/api/media/{id}` |
| GET | `/api/media/{id}/poster.jpg` |
| GET | `/api/media/{id}/file` |

## Pack ZIP

| Méthode | Chemin |
|---|---|
| GET/POST | `/api/tracks/{id}/pack` |
| GET | `/api/tracks/{id}/pack.zip` |

## Styles & animation / publication par style

| Méthode | Chemin |
|---|---|
| GET | `/api/styles` |
| GET | `/api/styles/{id}` |
| GET/PUT | `/api/styles/{id}/animation` |
| GET/PUT | `/api/styles/{id}/publish` |
| GET | `/api/tracks/{id}/animation` |

## Admin — nœuds & rendu

| Méthode | Chemin |
|---|---|
| GET/POST | `/api/admin/nodes` |
| PATCH/DELETE | `/api/admin/nodes/{id}` |
| POST | `/api/admin/nodes/{id}/verify` |
| POST | `/api/admin/nodes/check` |
| PUT | `/api/admin/render` |
| POST | `/api/admin/discover` |

## Admin — IA, tendances, directeur

| Méthode | Chemin |
|---|---|
| GET/PUT | `/api/admin/ai` |
| POST | `/api/admin/ai/test` |
| POST | `/api/ai/suggest` |
| GET/PUT | `/api/admin/trends` |
| POST | `/api/admin/trends/run` |
| GET/PUT | `/api/admin/director` |
| POST | `/api/admin/director/preview` |

## Admin — chaînes YouTube & file

| Méthode | Chemin |
|---|---|
| GET | `/api/admin/youtube` |
| POST | `/api/admin/youtube/channels` |
| PUT/DELETE | `/api/admin/youtube/channels/{cid}` |
| PUT | `/api/admin/youtube/default` |
| PUT | `/api/admin/youtube/bindings` |
| GET | `/api/publish/queue` |
| POST | `/api/publish/queue/{pid}/cancel` |
| POST | `/api/publish/queue/{pid}/retry` |

## Erreurs courantes

- `400` — paramètres hors bornes (durée, split sur morceau trop court…).
- `404` — style / morceau inconnu.
- `409` — moteur de nœud différent (audio).
- `202` — génération acceptée (suivre `/api/jobs/{id}` ou le morceau).

## Admin — IA veille (v1.19)

| Méthode | Chemin | Rôle |
|---|---|---|
| GET | `/api/admin/ai` | Directeur + objet `watch` (effectif, notice) |
| PUT | `/api/admin/ai` | Directeur ; `watchUrl` / `watchModel` optionnels |
| PUT | `/api/admin/ai/watch` | Uniquement le modèle / URL veille |
| POST | `/api/admin/ai/test` | `role: "director"` \| `"watch"` — liste `/api/tags` |
| GET | `/api/admin/trends` | settings + report + `history` + `watchAi` |

