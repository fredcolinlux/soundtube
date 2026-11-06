# Quick start — soundtube 1.20.2

Three steps. Nothing else is required.

## 1. Install

```bash
tar xzf soundtube-1.20.2-patch.tar.gz -C /opt/soundtube/app --no-same-owner
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
