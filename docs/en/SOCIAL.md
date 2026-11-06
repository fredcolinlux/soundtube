# Social networks (Facebook Page + X) — v1.21.0

Manual publish from the library (YouTube panel → **Publish to Facebook / X**), with AI-prefilled FR/EN drafts and the YouTube link when available. Confirmation required: type **PUBLISH** or **PUBLIER**.

## Admin (LAN only)

**Social networks** section:

- **Facebook Page**: Page ID + page access token (Graph API).
- **X / Twitter**: OAuth 1.0a or OAuth 2 bearer.
- Tokens **encrypted** on disk (`data/social.json`, mode `0600`), **never** echoed to the UI.
- **Per-style auto-publish**: default **off**. Enabling FB/X for a style requires `PUBLISH` / `PUBLIER`. After a render finishes, soundtube posts automatically when enabled.

## Mock tests

```bash
SOUNDTUBE_SOCIAL_TRANSPORT=mock node test/v1210.js
```
