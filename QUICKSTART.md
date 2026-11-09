<!-- v1.21.4 routes: / home, /studio studio -->
# Quick start — soundtube 1.21.4

Three steps. Nothing else is required.

## 1. Install

```bash
tar xzf soundtube-1.21.4-patch.tar.gz -C /opt/soundtube/app --no-same-owner
# restart the soundtube service
```

## 2. Create the admin (LAN)

Open `http://<CT-IP>:8080/setup` from your LAN.  
One step only: **username + password**.  
No OTP at setup — two-factor stays optional later under **My profile** (TOTP QR + recovery codes).

## 3. Behind NPM (internet)

1. Point the Proxy Host at the CT.
2. Paste `deploy/npm-admin-block.conf` (blocks `/admin` from the internet).
3. Open **Admin → Security** from the LAN: confirm the detected **proxy** and **domain** (one click each).  
   Until then, proxied traffic requires login (safe default).

**Studio** and **library** always require an account (even on LAN).  
Home, styles and legal pages stay public.

Registration: closed by default (`Admin → Open registration`).

Anonymous **Styles** pages offer a **15 s audio demo** (not stored in the library, 3 / 10 min cap). Sign in to generate full tracks.


## Update (flat patch)

Use the bundled script (**root**, no `sudo` inside the command):

```bash
/opt/soundtube/app/scripts/update.sh /path/soundtube-1.21.4-patch.tar.gz
# or several patches in order:
/opt/soundtube/app/scripts/update.sh /path/patch-a.tar.gz /path/patch-b.tar.gz
```

It **verifies** every archive (gzip, tar, **flat** layout — no `soundtube/` prefix) **before** stopping the service, backs up to `/var/backups/soundtube/`, extracts, runs `node --check`, **always** restarts (restores the backup if extraction failed), then waits for `http://127.0.0.1:8080/healthz`.

> Do not hand-roll `systemctl stop && tar … && systemctl start`: if `tar` fails, the service stays down (502).

## Locked out

```bash
node /opt/soundtube/app/scripts/admin-reset.js <user> --disable-2fa --password
```
Root + console/LAN only; hidden password prompt; audit entry; works with the service running.
