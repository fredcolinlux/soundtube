# Security — soundtube v1.20.0

See the French `docs/SECURITY.md` for the full guide. Summary:

- **LAN**: no auth required (legacy). Admin allowed.
- **Internet**: session cookie or Bearer token required. `/admin`, `/setup`, `/api/admin/*` return **404**.
- Passwords: Node **scrypt**. Sessions: `HttpOnly` + `SameSite=Strict` + `Secure` / `__Host-`.
- Optional TOTP 2FA + recovery codes (enrolment QR via `/api/me/totp/qr.svg`, vendored SVG encoder, no external service); optional WebAuthn passkeys.
- API tokens hashed at rest; YouTube secrets AES-256-GCM; master key `data/secret.key` mode 0600.
- Security headers aligned with WebGuardian 2026 (CSP, HSTS, COOP/COEP/CORP, …).
- Fail2ban filter sample: `deploy/fail2ban/soundtube-auth.conf`.
- Public domain is an Admin setting — never hardcoded in the public repo.

### Styles demo (v1.20.3)

Anonymous visitors: `POST /api/demo/generate` enforces **≤ 15 s**, audio only, **3 / 10 min / IP** rate limit, lower priority than signed-in jobs, files under `data/demo/` purged every **5 min**. Admin from the internet → branded **404**.

Demo is preview-only: any download, publish, or library write against a demo job returns **401**.

### Demo tracks and per-account library (v1.21.4)

Signed out, `GET /api/tracks` and `GET /api/demo/tracks` only return the tracks picked in Admin › 06b (≤ 10, < 5 min), in
a reduced form (title, style, duration, playback); audio goes through `GET /api/demo/tracks/{id}/audio` (inline MP3,
`Cache-Control: no-store`, `?download` → 401). Any other anonymous access to `/api/tracks/{id}/…` or `/api/jobs/{id}` →
**401**; a track that is not picked → **404**. Creator / viewer accounts: their own tracks only (otherwise 404). Selection and
samples folder: local admin API + CSRF (`/api/admin/demo-tracks`, `/api/admin/samples`). The samples folder is read-only;
system folders, the app and the data dir are refused.

### Lost admin access / lost OTP (v1.21.2)

On the server, as **root** (console or SSH from the LAN — refused from a public IP):

```bash
cd /opt/soundtube/app
node scripts/admin-reset.js <username> --disable-2fa             # drop TOTP + recovery codes + passkeys
node scripts/admin-reset.js <username> --password                # new password, typed hidden (TTY)
node scripts/admin-reset.js <username> --disable-2fa --password
```

Re-enables the account, revokes its sessions, appends `admin.cli_reset` to `audit.jsonl`, keeps files owned by `soundtube` with mode 0600, signals the service (SIGHUP: hot reload, login locks cleared; `--restart` to restart, `--no-reload` to send nothing). **Works with the service running.** The password is never a CLI argument. Data dir: `$SOUNDTUBE_DATA_DIR`, else `/etc/soundtube/soundtube.env`, else `/var/lib/soundtube`.

Hand-editing `users.json` (`"totpSecret": null`) works too, even with the service running: the server reloads changed auth files and never overwrites them from stale memory (before 1.21.2 a manual edit was overwritten on the next login). Empty / `{}` / `null` / partial auth JSON files are now normalised on load.

**Lockout root cause (fixed):** once 2FA was enabled, the login page's code step always failed with `403 invalid CSRF token` — `login.js` dropped the partial-session CSRF token returned by `/api/auth/login`, so the TOTP code was never even checked. Also: TOTP code checked before the recovery field (autofill no longer overrides it), ±1 step window kept, clock skew logged as `totp.skew`, undecryptable secret → explicit error pointing to `admin-reset.js`, 2FA failures logged as `Failed 2fa for …` (fail2ban filter updated — confirm the NPM proxy or the proxy IP gets banned).

**Master key:** `secret.key` lives in the data dir (`/var/lib/soundtube`), never in the app dir; no patch ships or overwrites it. A key found only in legacy `<app>/data/` is copied over; an unreadable key aborts start-up instead of being regenerated.

### API documentation (v1.21.1)
`/docs`, `/api/docs` and `/api/openapi.json` are **LAN-only** (styled 404 from the internet). Authenticated API calls with a Bearer token still work remotely.
