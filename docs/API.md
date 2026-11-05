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
