# Exposing soundtube on the Internet (v1.20.0)

TLS terminates at Nginx Proxy Manager. soundtube listens on HTTP `:8080` in the CT.

1. Create a Proxy Host → CT:8080, Force SSL.
2. Paste `deploy/npm-admin-block.conf` into NPM Advanced / custom locations (404 for `/admin`, `/setup`, `/api/admin`).
3. On the LAN open `/setup`, create the admin, then fill Admin › Security (trusted proxy IP, public domain, legal text).
4. Scan with https://webguardian.cloud/

Full details: French `docs/EXPOSITION.md`.
