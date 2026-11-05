# API reference — soundtube 1.18.0

Interactive docs: **`/docs`**. OpenAPI 3 JSON: **`GET /api/openapi.json`** (`info.version` = 1.18.0).

Typical base: `http://<host>:8080`. JSON bodies unless noted.

## Health & options

| Method | Path | Role |
|---|---|---|
| GET | `/api/health` | Version, storage, ffmpeg, queue |
| GET | `/api/options` | Styles, moods, keys, scales, instruments, limits, advanced |
| POST | `/api/advanced/defaults` | Concrete advanced values for style + seed |
| GET/PUT | `/api/ui/lang` | **UI** language (`fr`\|`en`) |

## Generate & library

| Method | Path | Role |
|---|---|---|
| POST | `/api/generate` | Enqueue job (202) |
| POST | `/api/check-duplicates` | Duplicate / similarity check |
| GET | `/api/jobs/{id}` | Job status |
| GET | `/api/tracks` | Library list |
| GET/PATCH/DELETE | `/api/tracks/{id}` | Detail / rename / delete |
| POST | `/api/tracks/{id}/variation` | Variation |
| POST | `/api/tracks/{id}/regenerate` | New engine-21 track (original kept) |
| GET | `/api/tracks/{id}/settings` | Stored settings |
| GET | `/api/tracks/{id}/audio.wav` · `audio.mp3` · `track.mid` · `midi.zip` | Downloads |

`POST /api/generate` body highlights: `style`, `bpm`, `key`, `scale`, `mood`, `duration`, `wav`, `adv`, `engine` (17–21), `variety`, `mixStyles`, `seed`, `variation`, `instruments`, `title`, `title_en`, `aiPlan`, `aiMeta`, `animation`, `pcCombo`, `pack`, `split`.

## Split · video · YouTube · pack · styles · admin

Same surface as the French [API.md](../API.md) tables (split, youtube, media, pack, styles animation/publish, admin nodes/AI/trends/director/channels, publish queue).

## Distinguishing language endpoints

| Endpoint | Affects |
|---|---|
| `/api/ui/lang` | Chrome UI strings only |
| `/api/youtube/lang` | Preferred language for generated YouTube texts / filenames |

## Common status codes

`400` bad params · `404` missing · `409` node engine mismatch · `202` accepted generate.

## Admin — watch AI (v1.19)

| Method | Path | Role |
|---|---|---|
| GET | `/api/admin/ai` | Director + `watch` object |
| PUT | `/api/admin/ai` | Director; optional `watchUrl` / `watchModel` |
| PUT | `/api/admin/ai/watch` | Watch model/URL only |
| POST | `/api/admin/ai/test` | `role: "director"` \| `"watch"` |
| GET | `/api/admin/trends` | settings + report + `history` + `watchAi` |

