# YouTube — channels, publish, design (v1.18.0)

## Overview

soundtube builds thumbnails, video (720p / 1080p / 4K), **FR + EN** titles/descriptions, tags, and can OAuth-publish to one or more channels. The UI language switcher does **not** change that pipeline — use `/api/youtube/lang` and the per-track YouTube panel.

Test transport: `SOUNDTUBE_YT_TRANSPORT=mock`.

## Admin → YouTube channels

Multiple channels, one default, style→channel bindings. OAuth secrets mode `0600`, never returned. Per-style publish profiles (templates, tags, visibility, playlist, schedule, opt-in auto-publish).

## Track panel

Thumb / animation, design, brand, text preview, loudness (`SOUNDTUBE_LUFS` / `SOUNDTUBE_TRUE_PEAK`). Publish → queue with cancel/retry.

## Video & animations

`POST /api/tracks/{id}/video` with `720p` | `1080p` | `2160p`/`4k`. Encoder preference via nodes. Media library `/api/media`; per-style or per-generate `animation`.

Never commit secrets. Prefer mock transport in automated tests.
