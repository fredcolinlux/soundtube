# soundtube

Plateforme auto-hébergée de **musique instrumentale algorithmique** (sans voix).
Chaque morceau est composé (théorie musicale : gammes, progressions d’accords, mélodies
de Markov, basse, batterie, intro / couplet / refrain / pont / outro) puis **synthétisé en temps réel**.

| | |
|---|---|
| **Version** | **1.19.0** |
| **Langues d’interface** | Français et anglais (sélecteur **FR \| EN** dans la barre du haut) |
| **Licence** | Voir `LICENSE` (tous droits réservés) |
| **Moteur par défaut** | 21 (harmonie juste) ; empreinte `696de0f4125a` |

**English:** [README.md](README.md) · [docs/en/USER-MANUAL.md](docs/en/USER-MANUAL.md) · [docs/en/INSTALL-MANUAL.md](docs/en/INSTALL-MANUAL.md) · [docs/en/OPERATIONS.md](docs/en/OPERATIONS.md)

**Manuels français :** [docs/MANUEL-UTILISATEUR.md](docs/MANUEL-UTILISATEUR.md) · [docs/MANUEL-INSTALLATION.md](docs/MANUEL-INSTALLATION.md) · [docs/EXPLOITATION.md](docs/EXPLOITATION.md)

**Index :** [docs/README.md](docs/README.md) · [QUICKSTART.fr.md](QUICKSTART.fr.md) · [CHANGELOG.md](CHANGELOG.md)

## Démarrage rapide (Debian 13 LXC / machine dédiée)

Le serveur central (**CT**) est prévu pour tourner **en root** (LXC Proxmox typique).
N’appelez **pas** `sudo` si vous êtes déjà root :

```bash
tar -xzf soundtube-1.19.0-standalone.tar.gz
cd soundtube-1.19.0
./install.sh --port 8080
# équivalent : ./deploy/install.sh --port 8080
```

Ouvrez `http://<hôte>:8080/`. Changez la langue avec **FR | EN**
(`localStorage` + cookie `soundtube_ui_lang` ; défaut `Accept-Language` ; repli français).
La langue d’interface est **indépendante** de la langue des titres / descriptions / tags YouTube.

Agents de rendu dans `dist/` :

- `dist/soundtube-node-agent-1.19.0-windows.zip`
- `dist/soundtube-node-agent-1.19.0-macos.zip`

## Fonctions

- **11 styles** instrumentaux (Lo-fi, Ambient, Synthwave, Deep House, French Touch, Techno, Cinématique, Chiptune, Trap, Hip-Hop, Drum & Bass)
- Moteur génératif (WAV / MP3 / MIDI + ZIP MIDI par instrument)
- Mix DJ longs (15 min–4 h), découpage, vidéo YouTube (720p / 1080p / 4K)
- Pack ZIP complet (vidéo, mix, stems, MIDI, manifeste)
- Directeur artistique optionnel (Ollama) + veille tendances + contexte de goût
- Nœuds de rendu (Windows NVENC, macOS VideoToolbox, secours CT)
- Admin : nœuds, répartition, PC IA, chaînes YouTube, animations, contexte directeur
- i18n léger (fichiers JSON, sans framework lourd)


## Banque d'échantillons

Le dépôt public inclut `assets/samples/` (FLAC, ~120 Mo, CC0 + Salamander **CC BY 3.0**).  
Détail et attributions : [SAMPLES-LICENSES.md](SAMPLES-LICENSES.md).  
**Non inclus** : `jrhodes/` (jRhodes3d, CC BY-NC 4.0) — repli sur synthèse Rhodes.  
`./install.sh` copie la banque dans `/opt/soundtube/app/assets/samples` ; `GET /api/health` → `samples: true`.


## Veille (v1.19.0)

Modèle Ollama **séparé** pour la veille (repli sur le directeur) et crawl autonome RSS (DuckDuckGo optionnel, anti-SSRF). Voir [docs/EXPLOITATION.md](docs/EXPLOITATION.md).
## i18n (v1.19.0)

| Élément | Chemin / API |
|---|---|
| Locales | `public/i18n/fr.json`, `public/i18n/en.json` (mêmes clés) |
| Client | `public/js/i18n.js` |
| API | `GET` / `PUT` `/api/ui/lang` |
| Langue contenus YouTube | `GET` / `PUT` `/api/youtube/lang` — **inchangée**, séparée de l’UI |

## Tests

```bash
npm test          # inclut test/v1180.js (i18n + empreinte moteur)
```

## Suite

Styles · Théorie · Nœuds · YouTube · Pack · Directeur · API — voir [docs/README.md](docs/README.md).  
OpenAPI interactif : `/docs` (`/api/openapi.json`).

## Nouveautés v1.19.0 — modèle veille dédié + crawl autonome

- **Réglage Admin séparé** pour le LLM de veille : URL Ollama optionnelle (repli URL directeur), modèle choisi dans `/api/tags` (jamais de nom en dur), bouton **Tester**, repli sur le modèle directeur avec notice si non configuré.
- **Crawl autonome** de sources publiques (RSS/Atom) : feeds musique / électronique / YouTube RSS publics / Reddit `.rss` / Bandcamp Daily / Resident Advisor, plus mots-clés par style ; DuckDuckGo HTML optionnel (désactivé par défaut).
- **Sécurité** : http(s) seulement, blocage IP privées / loopback / link-local (sauf sources explicitement listées + override Admin), robots.txt, UA poli, rate-limit, timeout, plafond taille, cache ; HTML → texte ; contenu fencé « non fiable » dans le prompt.
- Directeur artistique **inchangé** (température 0,7, prompt identique). Empreinte moteur `696de0f4125a`.
- Planification : bouton **Lancer la veille** + intervalle optionnel ; historique des runs sur la page veille.

## Nouveautés v1.18.0 — interface FR/EN

- i18n léger : `public/i18n/{fr,en}.json`, sélecteur **FR | EN**, `GET`/`PUT` `/api/ui/lang` (langue YouTube inchangée).
- Manuels anglais sous `docs/en/` ; empreinte moteur inchangée.

## Nouveautés v1.17.0 — nœud de rendu sur Mac mini (Apple Silicon)

- **Même agent** que Windows, sur **macOS arm64** : musique (moteur `core/`, identité au bit près, refus si moteur différent) + vidéo **VideoToolbox** (`h264_videotoolbox`, `hevc_videotoolbox` en secours), sinon libx264.
- **Ordre vidéo** : NVENC (PC NVIDIA) → VideoToolbox (Mac) → QSV/AMF → libx264. Args VT en mode débit (`-b:v` / `-maxrate`, `qmin/qmax -1`, `-allow_sw 0`, `-realtime 0`).
- **Installateur** `install-macos.sh` : Node 24 + ffmpeg via Homebrew, LaunchAgent (défaut, sans sudo) ou LaunchDaemon (`--system`), options `--no-audio`, `--audio-slots N`. `uninstall-macos.sh`.
- **Réseau** : si la découverte UDP ne traverse pas les sous-réseaux (CT 192.168.1.x, PC 192.168.2.x, Mac ailleurs), ajouter l’URL dans Admin. Pare-feu macOS : autoriser `node` à la première invite.
- **Musique** : même seuil 15 min ; à charge égale, le nœud au rendu musical le plus rapide mesuré est choisi.
- Détails : [`docs/NODES.md`](docs/NODES.md) § macOS. Zip : `soundtube-node-agent-1.17.0-macos.zip`.

## Nouveautés v1.16.0 — le PC Windows rend aussi la musique, tout dans un seul ZIP

- **Musique sur le PC Windows** : l’agent 1.16.0 embarque une copie exacte du moteur audio. Il rend WAV, MIDI et ZIP MIDI ; le CT encode le MP3. Le résultat est **identique au bit près** au rendu du CT : vérifié par SHA-256 sur 4 morceaux (lofi 30 s, cinématique 1 min 30, synthwave 2 min 30, techno 1 min).
- **Routage** : une génération de **15 min ou plus** part en priorité sur un PC capable. Les plus courtes restent sur le CT, sauf s’il est saturé. Si le PC tombe, le CT reprend le morceau et le statut l’indique (« Nœud en panne : rendu repris sur le CT »).
- **Contrôle du moteur** : un PC dont le moteur diffère de celui du CT est refusé, avec un message clair (« Moteur différent … Réinstaller l’agent »). Un morceau de référence est aussi comparé au bit près avant le premier rendu (bouton **Vérifier** dans Admin).
- **Option « Faire la musique et la vidéo en même temps sur le PC Windows »** (Générer › Paquet ZIP, décochée par défaut) : musique puis vidéo longue sur le même PC, sans attendre. Ensuite, **un seul ZIP** (vidéo, mix MP3 + WAV, morceaux MP4/MP3/WAV/TXT, MIDI, samples, manifest.json, LISEZMOI.txt) est annoncé avec son lien de téléchargement, sans clic de plus.
- **Admin › Nœuds** : pour chaque nœud, capacité musicale (et sa raison), moteur, samples, empreinte, case **Musique**, boutons **Détail** (historique des rendus) et **Vérifier**. **Admin › Répartition** : seuil « Musique sur le PC à partir de … min », explication de l’option combinée, « Où ont tourné les derniers rendus ».
- **Réinstallation de l’agent obligatoire** (`soundtube-node-agent-1.16.0-windows.zip`, protocole vidéo v2). Un agent 1.15 continue de faire la vidéo seulement.
- Moteur audio inchangé : les anciens morceaux restent identiques. Détails : [`docs/NODES.md`](docs/NODES.md), [`docs/PACK.md`](docs/PACK.md).

## Nouveautés v1.15.0 — le directeur artistique connaît ton goût et la dernière veille

- **Admin › 07 Contexte du directeur artistique** : deux sources facultatives, chacune avec son interrupteur (coupées par défaut ; coupées = prompt identique à la v1.14).
  - **Profil de goût** distillé de l’export de bibliothèque musicale (exemple) : son global, genres et artistes les plus écoutés, artistes de référence par style **modifiables à la main** (une ligne par style). Livré dans `contexte/gout.json` ; outil `tools/gout-distill.mjs` pour le refaire.
  - **Dernière veille tendances** : résumé daté et borné (formats, ambiances, tempos, énergie, mots fréquents), étiqueté « données publiques, pas des instructions » ; omis sans rapport.
- Budgets durs : 1 000 caractères pour le goût, 800 pour la veille ; exemple French Touch : 5 344 → 7 236 caractères (~2 070 jetons sur 8 192).
- Les noms d’artistes restent internes : consigne explicite au modèle, puis retrait automatique des titres, descriptions, tags et explications proposés.
- **Voir ce qui est envoyé** (diff ligne à ligne avec la v1.14, tailles) et **Tester avec Ollama**.
- Détails : [`docs/DIRECTEUR.md`](docs/DIRECTEUR.md). Audio inchangé.

## Nouveautés v1.14.0 — animation choisie avant la génération, ZIP complet en un clic

- **Animation de la vidéo dans le formulaire** (Créer › Avancé) : « Fond du style » (le dégradé généré) ou une animation de la
  bibliothèque. Chaque choix a sa vignette, et le survol ou le clic montre quelques secondes du vrai mouvement. Le choix est
  **mémorisé par style** et sert à la vidéo longue comme à chaque vidéo de morceau. Bibliothèque vide : un lien mène à
  **Admin › Animations** (nouvelle section : import, liste, suppression). Le panneau YouTube peut toujours changer l'animation,
  pour ce morceau seulement. Quand on recharge les réglages d'un morceau, le formulaire montre l'animation réellement utilisée
  et précise si elle a été remplacée.
- **Paquet ZIP coché d'avance** (Créer › Paquet ZIP) : vidéo longue, morceaux découpés, vidéo par morceau, samples, WAV, MIDI,
  TXT. Le ZIP se construit tout seul à la fin du rendu, et un lien « Télécharger le ZIP » l'annonce.
- **ZIP complet** : `nom-du-morceau/` contient `LISEZMOI.txt`, `manifest.json`, `video/`, `mix/` et `morceaux/`. Chaque morceau
  « 01 - Titre » y a son MP4, MP3, WAV et TXT, avec `MIDI/` et `samples/` à côté. Le TXT de chaque morceau donne le titre, le
  style, le tempo, la tonalité, la graine, la progression d'accords et la description YouTube. Le manifeste donne, pour chaque
  morceau, le début et la fin, le style, la graine, le tempo, la tonalité, le moteur et les fichiers présents.
- **Vidéo par morceau** : « long à rendre, 720p par défaut », dans la file vidéo habituelle. Le ZIP affiche sa progression et
  attend les rendus en le disant. Si un rendu échoue, le paquet passe en erreur au lieu d'omettre un fichier. Les morceaux sont
  aussi ajoutés à la bibliothèque.
- **Samples (stems)** : un WAV par groupe d'instruments et par morceau (batterie, basse, accords, mélodie-pads, percussions),
  rendu par le moteur d'origine au même gain que le mix. Les groupes absents sont signalés.
- Chapitres découpés seulement au-delà de 30 min. Un mix DJ est découpé à toute durée. Un morceau court et unique n'a ni
  morceaux ni fichiers factices.
- Moteurs inchangés : 335 empreintes identiques. Le crochet « stem » du moteur est inerte sans option. L'agent Windows n'a pas
  changé. Détails : [docs/PACK.md](docs/PACK.md). Tests : `node test/v1140.js` (`--mix` : mix DJ forcé de 15 min, complet).

## Nouveautés v1.13.0 — chaînes YouTube par style, auto-publication, ZIP complet

- **Chaînes YouTube** (Admin › 05) : plusieurs chaînes (nom, ID `UC…`, client ID, client secret, jeton d'actualisation), une
  chaîne par défaut, un style lié à une chaîne (une chaîne peut servir plusieurs styles). Les secrets sont masqués à l'écran,
  jamais renvoyés par l'API ni journalisés, et stockés dans `youtube-channels.json` en 0600. Pas de connexion OAuth web : le
  jeton s'obtient une fois, voir [`docs/YOUTUBE.md`](docs/YOUTUBE.md).
- **Profil de publication par style** (page du style › 05) : titre et description en gabarits (`{titre}`, `{bpm}`,
  `{tonalite}`, `{description}`…), tags, miniature, visibilité, playlist, programmation. **Auto-publication** désactivée par défaut ;
  l'activer exige de taper `PUBLIER`.
- **Formulaire « Publier sur YouTube »** dans le panneau YouTube d'un morceau, prérempli par le profil et la chaîne du style.
  Il exige la confirmation `PUBLIER` ; sans jeton, le bouton dit « Publication impossible : jeton YouTube manquant ».
- **File de publication** (En attente → Vidéo en préparation → Envoi en cours → Publiée / Erreur), avec Annuler et Relancer, dans Admin,
  sur la page du style et dans le panneau du morceau.
- **ZIP complet** : vidéo + MP3 (+ WAV) + MIDI du mix entier, morceaux découpés à la volée (mix DJ : un par titre, même court),
  `manifest.json` (tempo, tonalité, graine, style par morceau) et `LISEZMOI.txt`. Arborescence : `docs/YOUTUBE.md` § 7.
- Tests : `SOUNDTUBE_YT_TRANSPORT=mock`, aucun envoi réel ; `test/v1130.js` (`--mix` pour le cas mix DJ de 15 min).
- Audio inchangé : moteurs 17 à 21 identiques à la v1.12.0 à l'octet près. Agent Windows (rendu vidéo) inchangé : pas de
  réinstallation.

## Nouveautés v1.12.0 — harmonie juste (moteur 21) et régénération des anciens morceaux

- **Moteur 21** pour les nouvelles générations : accords toujours dans la tonalité (un bug de `voiceLead` transposait les accords
  du moteur 20 : 13 à 52 % de notes d'accord hors gamme selon le style → 0 %), plus d'accord augmenté parasite en mineur
  harmonique, mélodie, arpège et basse accordés sur l'accord réellement joué (frottements de demi-ton 20-63 % → 0-1,5 %),
  moins de quintes parallèles dans les nappes, strum sans retard parasite, swing de croches pour la lo-fi jazzy.
  Détail, mesures et choix (Ed Banger et ambient gardent leurs octaves / quintes parallèles, kick non accordé) :
  [`docs/THEORIE.md`](docs/THEORIE.md), section 9.
- **Anciens morceaux identiques** : moteurs 17 à 20 recalculés à l'octet près (335 cas comparés à la v1.11.0).
- **Bouton « Régénérer en v1.12.0 »** sur les cartes du studio et les lignes des pages de style : même graine, mêmes réglages,
  harmonie corrigée. L'original n'est jamais modifié ; la nouvelle version apparaît à côté avec le lien
  « régénéré en v1.12.0 · depuis « … » » (et l'original affiche « version régénérée »). Moteur 20 → 21 ; moteurs 17-19 : même
  arrangement + corrections harmoniques. Style ou réglage inconnu : message d'erreur, rien n'est deviné.
- API : `engine` accepte 21 (défaut) ; nouvelle route `POST /api/tracks/{id}/regenerate` (202 / 400 / 404 / 409) ; champs
  `regen_of`, `regenerations`, `regen_ok` dans les morceaux.
- Agent Windows (rendu vidéo) inchangé : pas de réinstallation.

## Nouveautés v1.11.0 — refonte lo-fi (moteur 20)

Toujours 100 % synthétisé en JavaScript (aucun échantillon nouveau ; les banques CC0 fournies sont jouées comme avant).

- **Moteur 20** pour les nouvelles générations. Les morceaux existants (`engine: 19` et plus anciens) sont recalculés **à l'identique** (événements et audio vérifiés octet par octet) ; hors lo-fi, le moteur 20 compose exactement comme le 19.
- **Six sous-genres lo-fi** (*Avancé → Sous-genre lo-fi* / `adv.lofiStyle`, ou tiré par la graine) : **jazzy** (Rhodes, accords étendus, batterie swinguée à la ride), **chillhop**, **lo-fi house** (4/4, accords filtrés), **ambient lo-fi** (nappes, peu ou pas de batterie), **sad lo-fi** (mineur, lent) et **beatmaker** — variante française dans l'esprit de Chinese Man / Scratch Bandits Crew : boom-bap poussiéreux, swing appuyé, stabs de cuivres et d'orchestre, **scratchs synthétisés** (baby, chirp, transformer). Techniques seulement : aucune mélodie, grille ni échantillon repris.
- **Textures réglables** (0-100, défauts par sous-genre) : craquements vinyle, pleurage / scintillement de bande, saturation bande, poussière (réduction bits / fréquence d'échantillonnage), chaleur (passe-bas doux). Elles sont **pré-remplies** dans *Avancé* avec les valeurs réelles du morceau et, comme tout réglage avancé depuis la v1.9, une valeur changée est **mémorisée par style** (`st.advTweaks`, reprise par la page du style). *Vintage* sert de macro (50 = défauts).
- **Moins de répétition** : scènes par phrase (sans batterie, batterie seule, dépouillée, break), fills et coupures, changements de grille entre sections, mélodie / arpège qui entrent en cours de morceau ; *Variété* « élevée » par défaut en lo-fi. En mix DJ (≥ 1 h), chaque titre tire son sous-genre (voisins compatibles en tempo).
- **Fonds sonores** : nouveaux **café** (brouhaha sans paroles intelligibles, tasses), **nuit en ville** (grillons + ville lointaine), **salle d'étude** (souffle, pages, horloge), en plus de la pluie et des autres ; **volume du fond** (0-100, `adv.ambienceLevel`, 50 = comme avant) dans le studio et sur la page de chaque style, avec le choix du fond.
- Directeur artistique (IA ou repli local) : peut proposer `lofiStyle` et `ambienceLevel` ; mots-clés locaux « Chinese Man », « jazzy », « lo-fi house », « café », « bibliothèque »… Description YouTube : titres et tags propres à chaque sous-genre et aux nouveaux fonds ; toujours ni BPM ni tonalité sur l'image.
- API : `engine` accepte 20 (défaut) ; nouveaux champs avancés facultatifs `lofiStyle`, `ambienceLevel`, `crackle`, `wow`, `tapeSat`, `dust`, `warmth`. Rien d'autre ne change (routes, noms de fichiers). Agent Windows inchangé (1.7.0).
- Démos et mesures : `/var/tmp/soundtube-example` (`COMPARAISON.md`, hors dépôt).

## Nouveautés v1.10.0 — pages Accueil, Démarrer, Styles, une page par style

Le studio reste à `/` (favoris et habitudes inchangés, formulaire non restylé). Autour de lui, des pages publiques dans le même esprit (fond animé, gros titre, cartes colorées par style), en français, utilisables sur mobile :

- **`/accueil`** — page d'accroche : « Onze styles. Une graine. Ta musique. », chiffres (styles, morceaux, IA facultative), défilé des styles, grille des 11 cartes, le circuit en 4 temps, les derniers morceaux avec un lecteur intégré. Le logo du studio et de l'Admin y mène.
- **`/demarrer`** — page de démarrage : le système (navigateur → serveur soundtube → PC IA Ollama et PC Windows, tous deux facultatifs), une **visite en 5 étapes** (flèches du clavier), puis les premiers réglages (nom de marque, PC IA, nœuds de rendu vidéo, veille tendances) et un bouton **« Visite guidée du studio »** (`/?tour=1` : bulles posées sur le vrai formulaire, Échap pour quitter).
- **`/styles`** — toutes les cartes de style et la feuille de route.
- **`/styles/<id>`** (`lofi`, `ambient`, `synthwave`, `house`, `frenchtouch`, `techno`, `cinematic`, `chiptune`, `trap`, `hiphop`, `dnb`) — page par style aux couleurs du style : tempo, gammes, variantes, nombre de morceaux, barres qui pulsent au tempo ; « Le son » et « Instruments & machines » tirés de [`docs/STYLES.md`](docs/STYLES.md) (source unique, relue à chaud) ; **préréglage** du style (variante, ambiance, durée, idée → « Proposer » si le PC IA est configuré, retouches avancées mémorisées dans le studio) et **« Générer dans ce style »** ; **bibliothèque du style** (lecture, MP3 / WAV / MIDI, « Afficher plus », lien vers le morceau dans le studio) ; styles voisins ; « Tous les réglages » ouvre le studio sur ce style (`/?style=<id>`).
- **Navigation** : barre commune Accueil · Démarrer · Styles · Studio · Admin · API (menu repliable sur mobile) ; le studio et l'Admin gagnent les liens Accueil, Styles et Aide.
- **API** (ajouts, rien de modifié) : `GET /api/styles` (cartes + feuille de route), `GET /api/styles/:id` (fiche, 404 si inconnu).
- **Agent Windows** : inchangé (pas de réinstallation).
- Test : `test/v1100.js` (dans `npm test`).

## Nouveautés v1.9.0 — réglages du style, directeur artistique IA, veille tendances, French Touch refaite

Détail par style : [`docs/STYLES.md`](docs/STYLES.md).

- **Avancé pré-rempli avec les valeurs réelles du style** : pour la graine affichée (« aléatoire (prochaine : N) », tirée d'avance), chaque champ montre ce que le style va vraiment utiliser (`POST /api/advanced/defaults`). Plus de cases « Forcer » : ce qui est affiché est exactement ce qui sera utilisé. Une valeur changée passe en vert, est **mémorisée pour ce style** (↺ par champ, « Réinitialiser ce style ») ; seules les valeurs changées sont envoyées, donc une génération sans retouche est identique au rendu du style. Anciens morceaux et anciens réglages : relus à l'identique.
- **Directeur artistique (Ollama)** — page Générer → *Directeur artistique* : « Décris l'ambiance » + **Proposer**. Le PC IA (Admin → PC IA, ex. `http://192.168.1.50:11434`, modèle `qwen3:14b`, chemins relatifs `api/chat` puis `api/generate`, `format: json`, délai réglable 10–600 s) renvoie style, ambiance, tonalité, tempo et réglages avancés, **validés strictement et bornés** par le serveur, puis appliqués au formulaire (tout reste modifiable). Options : **titre, description et tags FR + EN** (jamais de tempo ni de tonalité ; utilisés dans les infos YouTube) et, pour les mix ≥ 1 h, un **plan titre par titre** (énergie, ambiance, variante). Sans IA joignable ou réponse illisible : proposition locale par mots-clés, et l'interface le dit. API `POST /api/ai/suggest`.
- **Veille tendances** (Admin → Veille tendances) : tâche planifiée (hebdomadaire par défaut, fréquence réglable, « Lancer maintenant ») qui lit seulement des **métadonnées publiques** de vidéos récentes par style — clé **YouTube Data API** facultative, sinon flux **RSS/Atom ou pages** (lignes « style URL »), sinon recherche YouTube publique (option) ; sans source, l'interface affiche « aucune source ». Le PC IA (ou une analyse locale) fait un résumé par style et propose des retouches ; **chaque proposition s'applique par un bouton**, jamais automatiquement. API `GET/PUT /api/admin/trends`, `POST /api/admin/trends/run`.
- **French Touch refaite (moteur 19)**, trois variantes (*Variante* / `adv.ftStyle`) : **classique** (Cassius, Daft Punk *Homework* / *Discovery* : boucle disco filtrée 24 dB, longues montées, pompe profonde, talkbox), **Ed Banger** (Justice : saws distordus et compressés, basse saturée, batterie dure), **Myd** (lumineuse, basse rebondissante, hooks découpés). Techniques seulement, aucune mélodie ni échantillon repris. Pompe 1,4 dB → 3–8 dB (mesures : `demos-190/COMPARAISON.md`).
- **Retouches légères (moteur 19)** : deep house plus chaloupée (DJ Koze), boom-bap poussiéreux, neurofunk « Pendulum », synthwave plus sombre (Depeche Mode). Feuille de route : trip-hop, hip-hop dub/reggae, électro Ed Banger, variante Koze.
- **Compatibilité** : nouvelles générations en `engine: 19` ; `engine: 18` et plus anciens = morceaux identiques. API inchangée par ailleurs (nouveaux champs facultatifs `aiPlan`, `aiMeta`).
- Test : `test/v190.js` (dans `npm test`, serveurs Ollama / YouTube / RSS simulés, aucun appel extérieur).

## Nouveautés v1.8.0 — moteur de style 1.8

Détail complet par style : [`docs/STYLES.md`](docs/STYLES.md).

- **Nouveau style French Touch** (118–126 BPM) : house disco filtrée, grosse caisse quatre temps + clap, boucle d'accords disco (4 sons et plus), basse disco en octaves, **passe-bas résonant automatisé par section** (fermé dans l'intro, montée de filtre avant chaque drop, fermé et résonant au breakdown, se referme à l'outro), sidechain marqué, phaser sur les accords, flanger sur la batterie, lead **talkbox / vocodeur** (synthèse : formants, aucun échantillon de voix).
- **Boîtes à rythmes** par style : TR-606, TR-707, DR-110 en plus des TR-808 / TR-909 (100 % synthétisées, timbres imités, aucun échantillon de machine).
- **Synthés vintage** : DX7 (e-piano, basse, cloches — synthèse FM), Minimoog (basse, lead — 3 oscillateurs + filtre 4 pôles), Juno (nappe PWM + chorus stéréo), ARP (lead à oscillateur synchronisé), TB-303 (déjà présent, renommé par modèle dans les menus).
- **Défauts revus par style** (tempos, boîtes, sons, progressions, mix) : lo-fi, ambient, synthwave, house, techno, cinématique, chiptune, hip-hop, drum & bass. Ils alimentent aussi la variété des mix ≥ 1 h (boîtes et synthés qui tournent d'un titre à l'autre, house ↔ French Touch comme styles voisins).
- **Options avancées « Forcer »** : chaque option a une case *Forcer*. Décochée, c'est le style (ou plus tard le directeur artistique IA) qui choisit — la valeur par défaut du style est affichée sous l'option ; cochée, ta valeur est utilisée. L'état des cases est mémorisé ; bouton « Tout au défaut du style ». Anciens réglages compatibles : une valeur enregistrée vaut « forcée ».

