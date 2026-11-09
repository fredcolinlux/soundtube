# Journal des versions

## 1.21.4 — 2026-11-09

**EN summary** — New Admin card **06b Demo tracks**: pick up to 10 finished tracks under 5 minutes (limit enforced in the page and by the server; stored in the data dir as `demo-tracks.json`, local-only admin API with CSRF). Signed-out visitors on the Styles pages now only see those tracks, listen-only (no download, no YouTube, no library actions; audio served inline by `/api/demo/tracks/{id}/audio`, `?download` → 401). The library is scoped per account: creators / viewers see their own tracks, the admin sees everything; any other anonymous track/job access → 401. New Admin card **06c External samples folder** (default `/mnt/samples`, read-only, never copied): scans WAV / AIFF / FLAC drum one-shots (kick, snare, clap, rim, closed / open hats, ride, crash; sorted by file and folder names, loops and files ≥ 6 s skipped), shows counts and skipped files, Rescan button; index in the data dir. New drum kit **“My samples (external folder)”** (`adv.drumKit = "user"`) usable in every style with drums: one file per category per track picked from the seed, peak-normalised, missing categories filled by synthesis; always rendered on the CT. Install manuals FR/EN: mounting a Synology SMB share on the Proxmox host (cifs-utils, `/root/.smb-samples`, fstab with uid/gid 100000+uid, `pct set <CTID> -mp0 /mnt/nas-samples,mp=/mnt/samples,ro=1`). Engine fingerprint `22573aa0f775` (existing renders bit-identical); node-agent zips rebuilt for 1.21.4.

### Morceaux de la démo (Admin › 06b)
- Carte **Morceaux de la démo** : morceaux terminés de moins de 5 min (titre, style, durée, date, auteur), filtre, « Sélection seulement », écoute, « Tout décocher », **Enregistrer**. Au plus **10** cases cochées (cases désactivées au-delà) ; le serveur refuse aussi > 10, un morceau inexistant, trop long ou non terminé (`400` avec l’`id` fautif).
- Stockage `dataDir/demo-tracks.json` (`ids`, `updatedAt`). API `GET/PUT /api/admin/demo-tracks` : local + session admin + CSRF.
- Visiteurs non connectés : la liste « Bibliothèque » des pages Styles ne montre que ces morceaux, en **écoute seule** (pas de téléchargement, YouTube, variation, renommage, suppression). `GET /api/demo/tracks`, `GET /api/demo/tracks/{id}/audio` (inline, `no-store`). Aucun choix → aucune piste visible. Fiche d’un morceau inconnu ou hors démo → 404 (même réponse : l’existence d’un morceau privé n’est pas révélée) ; toute autre route → 401.
- **Bibliothèque par compte** : `GET /api/tracks`, `/api/tracks/{id}/…` et `/api/jobs/{id}` sont filtrés — anonyme : morceaux de la démo seulement (lecture), sinon 401/404 ; créateur / lecteur : ses morceaux (`meta.ownerId`) ; admin : tout. Variations et régénérations gardent le propriétaire. Comptes par style calculés pour la personne connectée.

### Samples du NAS (Admin › 06c) et kit « Mes samples »
- Réglage **Dossier de samples externes** (défaut `/mnt/samples` ou `SOUNDTUBE_EXT_SAMPLES_DIR`), case « Utiliser ces samples », **Re-scanner**, comptes par catégorie, exemples, fichiers ignorés (non classés, trop longs, illisibles, silencieux). Chemin absolu obligatoire ; dossiers système, application et données refusés. Lecture seule : rien n’est écrit ni copié.
- Scan : `.wav`, `.aif`, `.aiff`, `.flac` (profondeur 12, liens symboliques de dossiers ignorés, `@eaDir` / `#recycle` / `._*` Synology-Mac ignorés) ; classement par nom de fichier puis dossiers parents ; boucles (`loop`, `break`, `fill`, `groove`, `bpm`) et fichiers ≥ 6 s ignorés ; analyse ffmpeg (crête, attaque, durée). Index `dataDir/external-samples-index.json`, scan auto au démarrage si besoin.
- Moteur : kit **« Mes samples (dossier externe) »** dans Créer › Avancé › Kit de batterie (`adv.drumKit = "user"`). Un fichier par catégorie et par morceau tiré de la graine ; normalisation en crête ; catégorie absente → synthèse ; ni kick ni caisse claire/clap → kit synthétisé. Pas de caisse claire → les claps la remplacent ; notes fantômes = même caisse claire, plus douce. Rendu toujours sur le CT (`route` « samples-externes ») ; aperçu anonyme 15 s sans ce kit. `meta.extSamples` (dossier, empreinte, comptes) dans le morceau.
- Directeur artistique (Ollama) : l’option « user » n’est jamais proposée au modèle ni acceptée de sa réponse (le prompt reste identique à v1.14 quand les sources sont coupées).
- Rendus existants inchangés (empreintes audio identiques sur 9 rendus de référence) ; empreinte du moteur `22573aa0f775` (code modifié) → zips d’agent `dist/soundtube-node-agent-1.21.4-{windows,macos}.zip`.

### Docs
- Manuels d’installation FR/EN : section **Samples du NAS** (Synology SMB → hôte Proxmox → CT, `cifs-utils`, `/root/.smb-samples` en 600, ligne fstab, `pct set … -mp0 …,ro=1`, vérifications `pct exec`) + « Comment le moteur utilise ces samples » ; section v1.21.4.
- Manuels utilisateur, API (FR/EN + OpenAPI), SECURITY, EXPLOITATION / OPERATIONS, NODES (zips et empreinte 1.21.4), `deploy/soundtube.env` (`#SOUNDTUBE_EXT_SAMPLES_DIR`).
- `test/v1180.js` / `test/v1190.js` : empreinte moteur attendue `22573aa0f775`.
- `test/v1214.js` (dossier NAS simulé, classement, limites, cloisonnement, API admin + CSRF, 404 depuis Internet, i18n FR/EN, déterminisme du moteur).

## 1.21.3 — 2026-11-09

**EN summary** — macOS node agent installer fixed: the "Configuration" step crashed with `NameError: name 'true' is not defined` (JSON booleans inside the Python heredoc, now `True`/`False`), and with `--system` `config.json` in `/usr/local/soundtube-node` is now written with `sudo`. The installer warns when `--token` looks like a copied placeholder (or is empty) and prints where the token is stored (`config.json`, readable without sudo) with the command to read it. Docs: Mac node troubleshooting (`ECONNREFUSED` = agent not running, `401` = token mismatch). Node-agent zips rebuilt for 1.21.3. New: **art director system prompt** in Admin › 07 — prompt source selector (soundtube built-in / custom Admin prompt up to 20,000 characters with the mandatory JSON contract + catalogue appended / Modelfile SYSTEM with no system message and no forced temperature), temperature (default 0.7, empty = model default) and `num_ctx` (default 8192, empty = model default, 16384 hint for long prompts), stored in the data dir (`director-prompt.json`), local-only admin API with CSRF. Nodes: an ffmpeg without `drawtext` (Homebrew build without freetype) no longer fails the video (`No such filter: drawtext`) — chapter titles are dropped, the agent reports `drawtext` in `--detect`/`/health`, Admin shows "drawtext missing", and the macOS installer prefers/recommends `ffmpeg-full`. Agent zips carry the CT engine (1.21.3 · 7afdf699074e). Audio engine unchanged (hash unchanged).

### Directeur artistique — prompt système (Admin › 07)
- Nouveau bloc **Prompt système du directeur artistique** : zone de texte (20 000 caractères max, compteur caractères / jetons estimés), **Enregistrer** et **Restaurer le prompt intégré**. Libellés FR + EN.
- **Source du prompt** : « Prompt intégré de soundtube » (défaut, prompt identique à 1.21.2) ; « Prompt personnalisé (Admin) » (texte Admin en message système, suivi du contrat JSON + catalogue obligatoires du code) ; « Prompt du Modelfile » (aucun message système : Ollama applique le `SYSTEM` du modèle ; contrat + catalogue dans le message utilisateur ; température jamais imposée).
- **Température** (défaut 0.7, vide = défaut du modèle) et **`num_ctx`** (défaut 8192, vide = défaut du modèle ; l’Admin conseille 16384 au-delà de ~2 000 jetons de prompt). La veille garde ses propres réglages (0.4).
- Stockage `dataDir/director-prompt.json` (mode 600, jamais dans le dossier de l’application). API `GET/PUT /api/admin/director/prompt` : local + session admin + CSRF comme les autres réglages admin ; plafond serveur 20 000 caractères (corps JSON jusqu’à 256 Ko pour cette route seulement).
- Utilisé par Créer → « Décris l’ambiance » et par « Tester avec Ollama » ; l’aperçu affiche le mode, la température et le `num_ctx` effectifs. Le modèle reste celui d’Admin › PC IA (jamais codé en dur).
- `test/v1213.js` (Ollama simulé : messages, options, plafond, CSRF, stockage, i18n).

### Nœuds : ffmpeg sans drawtext, moteur audio
- **Cause de « ffmpeg code 8 : No such filter: drawtext »** sur le Mac : le `ffmpeg` Homebrew est compilé sans freetype. L’agent détecte maintenant les filtres (`--detect`, `/health` : `drawtext`, `filters`) et, sans drawtext, retire les filtres `drawtext` du graphe (`stripFilter`, guillemets respectés) : la vidéo est rendue sans les titres de chapitre au lieu d’échouer ; avertissement renvoyé au CT (historique du nœud).
- Admin › carte du nœud : avertissement **« drawtext absent »** (FR + EN, conseil `brew install ffmpeg-full` sur Mac).
- `install-macos.sh` : vérifie drawtext, préfère automatiquement `ffmpeg-full` (keg-only) s’il est installé, sinon recommande `brew install ffmpeg-full` + `--ffmpeg "$(brew --prefix ffmpeg-full)/bin/ffmpeg"`.
- `AGENT_VERSION` 1.21.3. Zips de l’agent reconstruits avec le moteur du CT (`core/ENGINE.json` : 1.21.3 · `7afdf699074e`) : un agent 1.19.x (`696de0f4125a`) est refusé pour la musique, il faut le réinstaller.

### Agent macOS (`node-agent/install-macos.sh`)
- **Cause de l’échec « NameError: name 'true' is not defined »** : `AUDIO_JSON` / `DISCOVERY_JSON` valaient `true`/`false` et étaient injectés dans le code Python qui écrit `config.json`. Corrigé : `True`/`False` (le JSON produit reste `true`/`false`).
- Mode `--system` : `config.json` dans `/usr/local/soundtube-node` est écrit avec `sudo python3` (l’écriture sans sudo aurait échoué juste après).
- Avertissement si le jeton ressemble à un texte d’exemple (`…JETON…`, `…TOKEN…`, `<…>`) ou s’il est vide ; fin d’installation : chemin de `config.json` + commande pour relire le jeton sans sudo.
- `node-agent/package.json` → 1.21.3 ; zips `dist/soundtube-node-agent-1.21.3-{macos,windows}.zip` (moteur inchangé).

### Docs
- `docs/NODES.md` / `docs/en/NODES.md` : diagnostic « Offline » (`ECONNREFUSED` = agent non lancé, `401` = jetons différents, injoignable), lecture du jeton dans `config.json` (pas `agent-config.json`) sans sudo.
- Manuels d’installation FR/EN : section v1.21.3 ; `node-agent/README.md`.
- `docs/DIRECTEUR.md` / `docs/en/DIRECTOR.md` : prompt système (modes, température, num_ctx, exemple de Modelfile) ; manuels utilisateur FR/EN.

## 1.21.2 — 2026-11-09

**EN summary** — Admin card 07 (listening profile) shows again and "Restore shipped profile" works (missing `apiFetch` import); profile lives in the data dir, generic example in the standalone. Auth files are loaded schema-tolerantly (`sessions.json` = `{}` no longer crashes login) and never overwritten from stale memory. 2FA step fixed (CSRF token of the partial session), ±1 step TOTP, clock-skew audit. New `scripts/admin-reset.js <user> [--disable-2fa] [--password]` (root, hidden prompt, works with the service running, audit entry). Studio opens the **Tracks** panel after a generation with auto-split. Complete ZIP: English texts (README.txt, youtube-en.txt, per-track `.en.txt`) and per-track videos fixed (audio pinned at queue time; `ffmpeg code 254 … audio.wav` gone). Full `npm test` green again; e2e test `npm run test:e2e`.

### Accès admin / 2FA
- **Cause du blocage** : après activation du TOTP, l’étape « code » de `/login` renvoyait toujours `403 Jeton CSRF invalide` (jeton de la session partielle ignoré par `login.js`). Corrigé : jeton repris côté client + en-tête `X-CSRF-Token` renvoyé par login/setup/2FA.
- Code TOTP vérifié avant le code de récupération (champ prérempli ne bloque plus), fenêtre ±1 pas conservée, décalage d’horloge journalisé (`totp.skew`).
- Secret indéchiffrable → message clair (plus de 500 opaque). Échecs 2FA journalisés `Failed 2fa for …` (filtre fail2ban mis à jour).
- `scripts/admin-reset.js <user> [--disable-2fa] [--password] [--no-restart]` : root + console/LAN uniquement, mot de passe saisi masqué (TTY), réactive le compte, révoque les sessions, audit `admin.cli_reset`, redémarre le service.
- Chargement tolérant de `users.json`, `sessions.json`, `api-tokens.json`, `security.json` (vides, `{}`, `null`, clés manquantes — corrige le 500 au login avec `sessions.json` = `{}`).
- Fichiers écrits par root (CLI, lancement manuel) : propriétaire du dossier de données conservé (`soundtube`), mode 0600.
- Clé maître : jamais régénérée si illisible, migrée depuis `<app>/data/` si besoin ; sans `SOUNDTUBE_DATA_DIR`, `/var/lib/soundtube` est préféré s’il contient des comptes.

- **Plus d’écrasement depuis la mémoire** : le serveur relit `users.json` / `sessions.json` / `api-tokens.json` / `security.json` dès qu’ils changent sur disque (édition manuelle, `admin-reset.js`) et n’écrit jamais par-dessus une version plus récente. `admin-reset.js` fonctionne **service en marche** (écriture atomique + SIGHUP ; `--restart` pour redémarrer). `ExecReload` ajouté à l’unité systemd.

### ZIP complet / vidéos de morceaux
- **Cause du « ffmpeg code 254 : Error opening input file audio.wav »** : le fichier audio n’était lié dans le dossier du rendu qu’au moment où un emplacement se libérait (parfois des minutes après la mise en file). Un renommage entre-temps (titre modifié, alignement des noms) laissait un lien cassé → vidéo en échec → ZIP en échec, donc **aucune vidéo de morceau**. Corrigé : audio épinglé dès la préparation (lien physique), fichier réel retrouvé/réparé si `files` est désynchronisé, plus jamais de lien symbolique cassé (erreur explicite).
- **Textes anglais dans le ZIP** (n’existaient pas) : `README.txt` (EN) à côté de `LISEZMOI.txt`, `youtube-en.txt` / `youtube-fr.txt` (titre, description, tags du mix), et pour chaque morceau `<morceau>.en.txt` en plus de `<morceau>.txt` ; `title_en` + `txtEn` dans `manifest.json`.
- Message « N morceau(x) : fichiers renommés » qui s’affichait à chaque démarrage sans renommage réel (comparaison dépendante de l’ordre des clés) : corrigé.
- `meta.ownerId` conservé après le rendu.

### Studio
- **Cause du panneau « Morceaux » absent** : après une génération avec « Découper en morceaux », la découpe automatique tournait côté serveur mais le Studio ne rouvrait ni ne suivait le panneau, et la bibliothèque n'était rechargée qu'à la fin du rendu audio (pas à la fin de la découpe). Corrigé : le panneau Morceaux du mix s'ouvre dès la fin du rendu et suit la découpe.
- La bibliothèque se rafraîchit seule (toutes les 15 s, onglet visible) quand une génération, une découpe ou un ZIP ajoute des morceaux hors de cet onglet : la carte et le bouton « Morceaux » apparaissent sans recharger la page.
- `test/v1212-e2e.js` (`npm run test:e2e`, ~10 min) : mix > 30 min → ZIP complet (vidéo par morceau, textes FR + EN), course renommage/file vidéo, Studio headless (bouton et liste « Morceaux »).

### Directeur — carte 07
- Carte « Profil d’écoute » vide et bouton « Revenir au profil livré » cassé : import `apiFetch` manquant (idem `ytadmin.js`), erreurs affichées.
- Profil actif dans `/var/lib/soundtube/gout.json` (survit aux patchs) ; repli sur l’exemple générique `contexte/gout.example.json`.
- Le profil personnel `contexte/gout.json` n’est plus publié (gitignore).
- `test/v1212.js`.

### Mise à jour / tests
- `scripts/update.sh` refuse une archive contenant des données d'exécution (`data/`, `secret.key`, `users.json`, `sessions.json`, `api-tokens.json`).
- `/api/openapi.json` : version lue dans `package.json` (était figée à 1.20.1).
- Anciens tests (écrits avant l'authentification v1.20) : préchargement `test/helpers/autologin.mjs` (session admin de test) ; contrôles périmés mis à jour (routes `/` et `/studio`, libellés i18n, empreinte moteur, version) ; plus aucune donnée personnelle dans les tests (profil synthétique `test/fixtures/gout.test.json`). `npm test` passe en entier. `test/v1205-i18n.js` (scan DOM anglais strict) échouait déjà en 1.21.1 — libellés FR restants dans l'UI anglaise du Studio/Admin — il est sorti de `npm test` et se lance avec `npm run test:i18n-dom` en attendant leur traduction.

## 1.21.1 — 2026-11-06

### Safe updates
- `scripts/update.sh` (root): verifies every flat `.tar.gz` **before** `systemctl stop`; backup to `/var/backups/soundtube/app-<date>.tar.gz`; extract in order; `chown`; `node --check`; **always** restarts (trap), restores backup if extract failed; waits for `/healthz` (20s) and prints version; on failure dumps `journalctl -n 40`.
- `GET /healthz` (+ `/health`) — liveness JSON `{ ok, version }` (no auth).

### API docs — LAN only
- Nav/footer « API » links hidden when `isLocal` is false (`/api/me`, `/api/site`, `/api/auth/status`).
- `/docs`, `/api/docs`, `/api/openapi.json` → styled **404** from the internet; API routes themselves still work with Bearer token.
- `test/v1211.js`.


## 1.21.0 — 2026-11-06

### Social — Facebook Page + X/Twitter
- Admin › Réseaux sociaux : credentials chiffrés (jamais réaffichés), LAN only.
- Bibliothèque : panneau « Publier sur Facebook / X » (brouillon FR/EN, compteur X 280, confirmation PUBLISH/PUBLIER, historique).
- Auto-publication par style (défaut off, confirmation à l’activation).
- `SOUNDTUBE_SOCIAL_TRANSPORT=mock` + `test/v1210.js`.
- Docs : `docs/SOCIAL.md`, `docs/en/SOCIAL.md`.

### Correctif chrome auth
- `setup.html` charge `site.css` (barre du haut + pied GitHub comme login/register/404).


## 1.20.5 — 2026-11-06

### Public site & Studio routes
- **`/` is the public home** (Accueil). Studio moved to **`/studio`** (login required → `/login?next=/studio`).
- **`/accueil` → 301 `/`**. Legacy `/?style|tour|track=` redirects to `/studio`.
- Nav, CTAs, post-login redirect, library/deep links updated.

### i18n FR/EN (live switch)
- Home & Styles keyed with `data-i18n`; style metadata (`taglineEn`, `genreEn`, moods, instruments, advanced options, YouTube visibility) localized by cookie/`Accept-Language`.
- Studio FR|EN selector remounts/repaints options; docs `docs/en/STYLES.md` for style sheets.
- Headless browser test `test/v1205-i18n.js` (Puppeteer) FR↔EN on all public/auth pages.

### Auth / error pages
- Login, register, setup, 404/403/500 and legal pages use the **full site topbar** (logo, nav, language selector, Login/Logout) and common footer (version + GitHub), including mobile hamburger.

### Footer
- Every page footer: **version** + **GitHub** link (icon). URL configurable in Admin › Sécurité (default `https://github.com/fredcolinlux/soundtube`).

## 1.20.4 — Démo Styles : écoute seule

- Démo anonyme = **preview only** : pas de téléchargement / ZIP / YouTube / bibliothèque (boutons masqués ; `401` serveur sur les routes track/publish/pack/job pour un id démo ; `?download=1` refusé sur `/api/demo/audio`).
- Test `test/v1204.js`.

## 1.20.3 — Démo Styles (15 s) & pages d’erreur

- Page **Styles** anonyme = démo : prévisualisation **audio ≤ 15 s** (durée forcée serveur), hors bibliothèque, file basse priorité, rate-limit 3 / 10 min / IP, concurrence démo 1, purge toutes les 5 min (+ au démarrage). CTA « Connectez-vous pour créer des morceaux complets ».
- Pages d’erreur brandées **404 / 403 / 500** (FR/EN, vinyle + waveform, CSP) pour routes inconnues et Admin bloqué hors LAN.
- Tests `test/v1203.js` ; i18n FR/EN.

## 1.20.2 — QR TOTP sur le profil

- Activation MFA (TOTP) : génération d’un URI `otpauth://` (émetteur *soundtube* ou nom éditeur Admin, SHA1, 6 chiffres, 30 s) et **QR code SVG** servi par `/api/me/totp/qr.svg` (session requise, `Cache-Control: no-store`, encodeur JS vendored, aucun service externe).
- Affichage secret base32 groupé + copie ; activation seulement après un code valide ; codes de récupération une fois + téléchargement.
- Tests `test/v1202.js` (décodage QR + round-trip TOTP) ; i18n FR/EN.

## 1.20.1 — Configuration simple, auth stricte, i18n & légal

- Setup LAN en **une étape** (user + mot de passe) ; **pas d’OTP** imposé (2FA/passkeys optionnelles dans `/profile`).
- Studio + bibliothèque + APIs de génération : **login obligatoire pour tous** (plus de bypass IP locale). Admin : LAN **et** session admin.
- Menu compte (avatar / Connexion) sur toutes les pages ; page `/register` si « Inscriptions ouvertes » (défaut OFF, rate-limit, validation admin optionnelle).
- Détection proxy/domaine (suggestions Admin, confirmation un clic) ; XFF non confirmé = non-local (défaut sûr).
- Mentions légales / confidentialité / CGU (FR+EN) + champs éditeur en Admin (placeholders, jamais de PII dans le dépôt).
- i18n 823 clés ; test DOM EN headless zéro chrome FR ; tests `test/v1201.js`.


## 1.20.0 — Exposition Internet, auth & durcissement WebGuardian

- Login state-of-the-art (scrypt, session `__Host-` / Secure / HttpOnly / SameSite=Strict, CSRF, rate-limit + verrouillage, TOTP + recovery, passkeys WebAuthn).
- Gestion des utilisateurs (admin / creator / viewer), quotas, file d’attente équitable, jetons API.
- Admin + `/api/admin/*` **local only** (404 depuis internet) ; snippet NPM `deploy/npm-admin-block.conf`.
- Proxy de confiance (X-Forwarded-*) ; domaine public = réglage Admin.
- API : auth obligatoire hors LAN ; OpenAPI sur `/api/docs` ; liens de fichiers signés.
- Secrets YouTube chiffrés au repos ; journal d’audit ; backup/restore ; `security.txt`.
- En-têtes CSP/HSTS/COOP/COEP/CORP/… ; plus de scripts inline ; pages Mentions légales.
- Docs `SECURITY.md` / `EXPOSITION.md` (+ EN) ; fail2ban ; tests `test/v1200.js` + `test/security-headers.sh`.

## 1.19.2 — 2026-11-06

### Fixed
- **Patch layout for CT**: archives are now extractable with `tar xzf … -C /opt/soundtube/app --no-same-owner` (flat tree). The 1.19.0/1.19.1 patches used a `soundtube/` prefix, so that command nested files under `app/soundtube/` and the live Admin kept showing **03 PC IA (Ollama)** without the watch model.
- Same visible **Modèles IA** card (Directeur | Veille) and version pill as 1.19.1; asset `?v=1.19.2`.

### Verify after update
```bash
grep -E 'aiWatchCard|Modèles IA' /opt/soundtube/app/public/admin.html
curl -s localhost:8080/api/health   # "version":"1.19.2"
# hard refresh Admin → pastille v1.19.2, section 03 Modèles IA
```

## 1.19.1 — 2026-11-06

### Fixed
- Admin: second Ollama model for trend watch was easy to miss (buried under “PC IA”) and asset URLs still used `?v=1.18.0`, so browsers could keep the old `admin.js`
- Visible top-level **Modèles IA / AI models** block with **Directeur** and **Veille** side by side; version pill in the Admin header (`/api/health`)
- Cache-busting: all public HTML `?v=1.19.1`; Admin/studio HTML served with `Cache-Control: no-store`

### Unchanged
- Watch crawl / SSRF behaviour from 1.19.0; director path; engine fingerprint `696de0f4125a`

## 1.19.0 — 2026-11-05

### Added
- Dedicated Ollama settings for trend watch (URL optional, model from `/api/tags`, Test button, fall back to director with notice)
- Autonomous public crawl: default RSS sources, optional DuckDuckGo HTML discovery (off by default), YouTube HTML complement
- SSRF protections (block private/loopback/link-local unless explicitly listed + Admin override), robots.txt, rate limit, cache, size/timeout caps
- Watch history in Admin; watch LLM prompt fenced as untrusted data; temperature 0.4 (director unchanged at 0.7)
- `test/v1190.js`

### Unchanged
- Art-director prompt and behaviour (byte-identical path)
- Audio engine fingerprint `696de0f4125a`

# Changelog — soundtube

All notable releases. Personal hostnames, private IPs, library exports and tokens are omitted.


## 1.18.0 (docs / samples follow-up)

### Added
- Public redistributable `assets/samples/` (CC0 + Salamander CC BY 3.0); `SAMPLES-LICENSES.md`
- `jrhodes/` (CC BY-NC) **not** shipped in the public tree

## 1.18.0 — 2026-11-05

### Added
- Lightweight UI i18n (French / English): `public/i18n/{fr,en}.json`, `public/js/i18n.js`
- Header language switcher **FR | EN** (studio, admin, site pages); fits 1440 and 390 layouts
- Persistence: `localStorage` + cookie `soundtube_ui_lang`; default from `Accept-Language`; French fallback; `html[lang]` updated
- API `GET` / `PUT` `/api/ui/lang` (does not change YouTube content language)
- English README + manuals under `docs/en/`; French manuals kept
- `test/v1180.js` (identical key sets, referenced keys, engine fingerprint unchanged)

### Unchanged
- Audio engine byte-identical — fingerprint `696de0f4125a`
- YouTube title / description / tag generation (existing FR+EN behaviour)

## 1.17.0 — 2026-11-05

- Official **macOS Apple Silicon** render agent (VideoToolbox after NVENC in encoder order)
- `install-macos.sh` / `uninstall-macos.sh` (LaunchAgent by default without elevated privileges; LaunchDaemon with `--system`)
- Admin shows platform `darwin` + arch; audio load balancing by measured speed
- `test/v1170.js`

## 1.16.0 — 2026-11-05

- Windows agent renders **music** with the same engine as the CT (protocol + fingerprint + reference render)
- Job routing: combined music+video on PC, threshold for long audio, CT fallback
- Admin: capacity, engine hash, Verify, render history
- `test/v1160.js`

## 1.15.0 — 2026-11-05

- Art director context: optional taste profile + latest trend summary (off by default)
- Distill tool for a music-library CSV → `contexte/gout.json` (example profile shipped)
- `docs/DIRECTEUR.md`, `test/v1150.js`

## 1.14.0 — 2026-11-05

- Animation picker before generate; per-style remembered animation
- Automatic complete ZIP pack at end of render (`pack` / `meta.autoPack`)
- Admin media library; `docs/PACK.md`, `test/v1140.js`

## 1.13.0 — 2026-11-04

- Multiple YouTube channels, style→channel bindings, publish profiles, publish queue
- Complete ZIP with video + mix + stems; `SOUNDTUBE_YT_TRANSPORT=mock` for tests
- `docs/YOUTUBE.md`, `test/v1130.js`

## 1.12.0 — 2026-11-04

- Engine **21** — harmony fixes (`docs/THEORIE.md`)
- `POST /api/tracks/:id/regenerate`; engines ≤ 20 unchanged (fingerprints)

## 1.11.0 — 2026-11-03

- Engine **20** — lo-fi redesign (six sub-genres, textures, new beds)
- Engines ≤ 19 identical outside lo-fi path

## 1.10.0 — 2026-11-02

- Site pages: Accueil, Démarrer, Styles catalogue + per-style page
- Shared top bar; `GET /api/styles`, `GET /api/styles/:id`

## 1.9.0 — 2026-11-02

- Advanced panel prefilled with real style/seed values
- Art director (`/api/ai/suggest`) + trend watch
- Engine **19** — French Touch variants (classic / Ed Banger / Myd)

## 1.8.0 — 2026-11-02

- Engine **18** — vintage drum machines & synths; French Touch style
- Windows installer `-AllowFrom`; force flags for advanced options

## 1.7.0 — 2026-11-02

- Distributed **video** render (Windows NVENC agent), Admin nodes page
- 15-minute duration preset; long mixes remain contrasted

## 1.6.x — 2026-10-31

- Sample pack (pianos, Rhodes, drums), realism, variation selector, split videos
- UI spirit retained as the reference look through later versions

## 1.5.0 — 2026-10-30

- Hip-Hop + Drum & Bass styles, moods / beds, groove realism across 4/4 styles

## 1.4.0 — 2026-10-29

- DJ mix mode 1–4 h, Camelot / energy curve, video 720p/1080p/4K

## Earlier

- 1.0–1.3: core studio, library, MP3/MIDI, YouTube panel foundations, config migration (`deploy/migrate-env.sh`)
