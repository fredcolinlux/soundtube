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

### API documentation (v1.21.1)
`/docs`, `/api/docs` and `/api/openapi.json` are **LAN-only** (styled 404 from the internet). Authenticated API calls with a Bearer token still work remotely.
