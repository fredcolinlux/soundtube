# soundtube

Plateforme auto-hébergée de **création musicale instrumentale par algorithme** (aucune voix).

**Version :** 1.17.0  
**Licence :** tous droits réservés (voir `LICENSE`).

## Package standalone

Archive recommandée pour une machine Debian 13 neuve :

```bash
# en root
tar -xzf soundtube-1.17.0-standalone.tar.gz
cd soundtube-1.17.0
./install.sh --port 8080
```

Contenu typique de l’archive : application CT, `dist/*-windows.zip` et `dist/*-macos.zip` (agents de rendu), `QUICKSTART.md`, manuels dans `docs/`.

| Doc | Contenu |
|-----|---------|
| `QUICKSTART.md` | Installation minimale CT + Windows + Mac + Ollama |
| `docs/MANUEL-UTILISATEUR.md` | Studio, styles, pack ZIP, YouTube, directeur IA, Admin |
| `docs/MANUEL-INSTALLATION.md` | CT/LXC, nœuds, OAuth, réseau, MAJ, sauvegarde, dépannage |
| `docs/EXPLOITATION.md` | Plan d’exploitation |
| `docs/NODES.md` | Détail agents et routage |
| `docs/YOUTUBE.md` | Publication YouTube |
| `docs/DIRECTEUR.md` | Directeur artistique |
| `docs/STYLES.md` / `THEORIE.md` / `PACK.md` | Musique, théorie, packs |

Les échantillons audio volumineux ne sont **pas** inclus : voir `assets/samples/LISEZMOI.txt`.

---

Plateforme auto-hébergée de **création musicale instrumentale par algorithme** (aucune voix).
Chaque morceau est composé (théorie musicale : gammes, progressions d'accords, mélodies par chaînes de Markov,
basses, batteries, arrangement intro / couplet / refrain / pont / outro) puis **synthétisé en temps réel**
(oscillateurs, FM, Karplus-Strong, synthèse de batterie, réverbération, delay, sidechain…) entièrement en **JavaScript / Node.js**. Les instruments acoustiques (pianos à queue Steinway B et Salamander, piano droit, Rhodes Mark I, cordes, cor, harpe, vibraphone,
flûte, contrebasse, pizzicati, batteries acoustiques multi-couches, timbales) jouent une **banque d'échantillons libres** embarquée
(`assets/samples/`, 143 Mo, licences : voir [Échantillons et droits](#échantillons-et-droits)) ; les synthétiseurs et la guitare sont modélisés.

![capture](screenshot.png)

![détails d'un morceau](samples/ui-details.png)

## Fonctionnalités

- 10 styles : **Lo-fi Hip-Hop, Ambient, Synthwave, Deep House, Techno, Cinématique, Chiptune, Trap instrumental, Hip-Hop, Drum & Bass**
  - **Hip-Hop** (v1.5) : variantes boom-bap (85-95 BPM, swing MPC, Rhodes / accords 7e-9e jazzy), lo-fi (vinyle, saturation, groove « Dilla »),
    trap (130-150 BPM en demi-temps, 808 glissantes, rafales de charleys)
  - **Drum & Bass** (v1.5) : liquid (170-174, nappes, sub rond), neurofunk (172-176, reese synchronisée), jungle (166-172, breaks « amen-like »
    reconstruits coup par coup — aucun échantillon de disque) ; intro mixable → montée → drop → breakdown → drop
  - **Batterie acoustique v1.6** (boom-bap, lo-fi, DnB, jungle) : Virtuosity Drums + Frankensnare (CC0), 4 couches de vélocité
    × round-robin sans normalisation par frappe, ghost notes jouées sur la caisse claire étouffée, rimshot / cross-stick, charleston
    fermée / mi-ouverte / ouverte, ride, crash ; grosse caisse échantillonnée + couche de synthèse légère ; plus de passe-bas 7-9 kHz,
    passe-haut 30 Hz ; sub mono (< 120 Hz) + sidechain basse ← grosse caisse en DnB, largeur stéréo de la reese en neurofunk.
    Techno et trap gardent leurs 909 / 808 synthétisées. Démos : `samples/hiphop-boombap-v2.mp3`, `hiphop-lofi-v2`, `dnb-liquid-v2`,
    `dnb-neuro-v2`, `dnb-jungle-v2` ; avant/après chiffré : `samples/avant-apres/LISEZMOI-v16.md`
  - **Pianos et Rhodes v1.6** : réglage « Son de piano » (Steinway B, Salamander Grand V3 à 4 couches, piano droit ; auto = un des deux
    pianos à queue) et « Son du Rhodes » (jRhodes3d échantillonné à 5 couches par défaut, synthèse en option) ; utilisés en lo-fi,
    boom-bap, DnB liquid et dans les ambiances chill / nocturne ; affichés dans les Détails de la bibliothèque, programmes GM 1 / 5 dans le MIDI.
    Démos : `samples/piano-salamander-lofi-v2.mp3`, `piano-steinway-ambient-v2.mp3`, `rhodes-jrhodes-boombap-v2.mp3`
- Paramètres : style (+ **variante** pour Techno, Synthwave, Hip-Hop, Drum & Bass), tempo (BPM ou auto), tonalité + mode (majeur, mineur, dorien, phrygien, lydien, mixolydien, mineur harmonique),
  ambiance (calme, joyeux, mélancolique, sombre, épique, rêveur, énergique, chill, nocturne, cinématique, mystérieux, nostalgique, pluvieux,
  hypnotique, solaire, urbain, aérien), **fond sonore** synthétisé (vinyle, pluie, vagues, vent, grillons, feu de cheminée, ville lointaine ;
  automatique selon l'ambiance ou forcé), **durée au choix** : 1, 3, 5, 7, 10 min, 1 h, 1 h 30, 2 h, 2 h 30, 3 h, 3 h 30, 4 h
  (l'API accepte toute durée de 20 s à 4 h, en secondes ; durée réelle des fichiers à ±2 % près, vérifiée par `npm run test:durations`), graine (seed, nouvelle graine aléatoire à chaque génération, « Garder cette graine »), instruments on/off
  (batterie, basse, accords, mélodie, arpèges, textures)
- **Réalisme** (v1.5, tous styles en 4/4) : gabarits de groove (micro-timing par instrument, swing, accents), dynamique par mesure,
  notes fantômes, mini-fills, automatisations lentes (filtre, réverbe par section, delay throw), compression parallèle de la batterie,
  saturation bande + colle au master, sidechain idiomatique
- Section **« Avancé »** (UI + API `adv`) : énergie, complexité, swing, brillance, espace, largeur stéréo, lo-fi/vintage, humanisation,
  présence de la mélodie, son de la mélodie / des accords / de la basse, jeu de basse, kit de batterie, progression d'accords,
  mesure (4/4, 3/4, 6/8), structure, vitesse d'évolution, fondus d'entrée/sortie — chaque réglage « auto » est tiré de la graine
- **Arrangement idiomatique par style** : intro DJ et entrée progressive des couches (techno/house), montée de 2 mesures puis
  **drop**, coupures avant le refrain, roulements (909, toms, charleston trap), **automation** (filtre acid 303 sur 32 mesures,
  balayage des accords, respiration ambient), lead à l'octave et **modulation d'un ton** au dernier refrain (synthwave/chiptune),
  intro qui annonce le thème (chiptune/trap), batterie laid-back (lofi) — comparatifs dans `samples/avant-apres/LISEZMOI-jalon6.md`
- **Kits et basses synthétisés** (aucun échantillon) : **TR-909** et **TR-808** (grosse caisse longue accordable, caisse, clap, charleys,
  cowbell, claves, congas, maracas ; utilisable dans tous les styles, tiré au sort une fois sur deux en trap), **basse 909** (kick accordé)
  dans « Son de la basse » — démos `samples/kit-808.mp3`, `samples/basse-909.mp3`
- **Techno « jouée »** (réglage « Style techno » : Detroit 130-140 BPM / minimale / industrielle) : 909 qui mute en permanence
  (mutes toutes les 4/8/16 mesures, charleys roulants ou en contretemps, automation d'accent et d'ouverture, fills de toms/clap,
  coupures de kick, intro/outro mixables), stabs mineurs Detroit en boucles courtes — démo `samples/techno-detroit-909.mp3`
- **Synthwave 80s** (réglage « Style synthwave » : outrun 100-118 BPM / dreamwave 80-100 BPM) : jeu **lié** (lead legato avec portamento,
  basse 80s liée avec glide, nappes Jupiter/Juno tenues d'un accord à l'autre avec longues relâches), colle de bus (réverbe commune,
  chorus Juno sur nappes/arpèges/lead, saturation bande, sidechain du kick sur tous les instruments), caisse « gated », cuivres Oberheim,
  arpèges en doubles-croches avec délai pointé synchronisé, accords sus2/sus4/add9 et IV majeur en mineur —
  démos `samples/synthwave-80s-v2.mp3`, `samples/synthwave-80s-v2-dreamwave.mp3`
- Rendu **en flux** (RAM bornée ≈ 250 Mo quelle que soit la durée) : **WAV 44,1 kHz 16 bits stéréo** (par défaut), **MP3** (ffmpeg,
  320 kb/s), **MIDI** (une piste par instrument, programmes General MIDI, batterie canal 10 séparée par élément) et **ZIP MIDI**
  (un fichier par instrument + le fichier complet ; programmes GM aussi pour les sons v1.5 : reese, neuro, sub DnB, sub-basse, nappe liquide)
- **Mode mix DJ (1 h à 4 h)** — réglage avancé « Mode mix DJ » (auto = activé dès 1 h ; « Activé » le force dès 15 min ;
  « Désactivé » = un seul long morceau) : le morceau devient un **set continu de sous-morceaux distincts** de 4 à 8 min, chacun avec
  sa graine (tonalité, progression, motifs, sons, batterie, arrangement, sous-style voisin : techno, synthwave, hip-hop boom-bap ↔ lo-fi, trap entre elles, DnB liquid/neuro/jungle entre elles) ; enchaînements
  **calés sur une grille de tempo commune** (beatmatching), fondus de **16 à 32 mesures** avec **échange des basses** (crossover
  Linkwitz-Riley 180 Hz), filtre passe-bas de sortie ou entrée filtrée passe-haut (fondu long pour ambient/cinématique),
  tonalités voisines sur la **roue Camelot** (même clé, ±1, relatif, +2 en montée d'énergie), **dérive lente du tempo** (quelques BPM)
  et **courbe d'énergie** de soirée. Intro/outro « DJ » (rythme seul) pour le calage. Rendu en flux : au plus **2 decks** actifs
  (RAM ≈ 400 Mo max). Tracklist horodatée (titre, Camelot, BPM entrée→sortie, énergie, transition) dans « Détails », reprise en
  **chapitres YouTube** (début = milieu de chaque transition). **MIDI** : toutes les notes du set sur la timeline globale, avec la
  **carte de tempo** (un changement de tempo par mesure si besoin) ; le programme GM de chaque piste est celui du 1er titre.
  Mesure objective de la répétition : `node tools/repetition.mjs fichier.wav` (auto-similarité de fenêtres de 5 min et motifs
  de 4 s retrouvés ailleurs) ; rendu sans serveur : `node tools/render-file.mjs <style> <graine> <durée> <on|off|auto> out.wav`.
  Mesures (techno, 1 h) : motifs de 4 s quasi identiques (> 0,90) retrouvés à ≥ 5 min d'écart **19,3 % → 0,3 %** ;
  extraits autour d'une transition : `samples/mix-transition.mp3` (techno), `samples/mix-hiphop-transition.mp3`,
  `samples/mix-dnb-transition.mp3` (v1.5, mix forcé de 15 min)
- **Noms de fichiers lisibles** : `tracks/<id>/<titre>_<style>_<AAAA-MM-JJ_HHhMM>.mp3|.wav|.mid|-midi.zip` (accents et caractères spéciaux
  retirés, heure de Paris ; même nom au téléchargement). Renommer un morceau renomme ses fichiers ; les anciens `track.*` sont migrés au démarrage
- **Conformité YouTube** :
  - **mastering -14 LUFS intégrés / ≤ -1 dBTP** (ITU-R BS.1770-4 / EBU R128) : passe 1 = synthèse + mesure de loudness en flux,
    passe 2 = gain + limiteur *true-peak* à anticipation (détection inter-échantillons ×4, plafond interne -1,5 dBTP pour la marge MP3),
    réécriture du WAV **sur place** (aucun disque en plus) et encodage MP3 ; surcoût ≈ 2 s par 10 min de musique.
    Mesures (LUFS, dBTP, LRA, gain appliqué) visibles dans « Détails » ; cible réglable (`SOUNDTUBE_LUFS`, `SOUNDTUBE_TRUE_PEAK`)
  - **Balises** ID3v2.3 + ID3v1 (MP3) et LIST/INFO (WAV) : titre, artiste, album, genre, date, BPM, tonalité, commentaire, copyright,
    logiciel ; réécrites automatiquement quand on renomme un morceau
  - **Anti-doublon** : avant de générer avec une graine fixée, l'interface avertit si le morceau serait identique (même graine + réglages),
    le même avec une autre durée, ou très proche (même tonalité, tempo, progressions, groove et sons) d'un morceau de la bibliothèque —
    YouTube peut refuser la monétisation des contenus répétitifs ; badge « ⚠ Doublon » / « ≈ Proche » dans la bibliothèque
    (`POST /api/check-duplicates`)
- **Sélecteur « Variation »** (v1.6.3, réglages : Faible / **Moyenne** par défaut / Forte / Maximale ; API `variety` =
  `low|medium|high|max` ou `faible|moyenne|forte|maximale`, enregistré dans `adv.variety`, affiché dans « Détails », repris par
  Remix / Réutiliser). **Moyenne = comportement historique** : une graine existante redonne exactement le même morceau.
  - Dans un morceau : nombre de changements de section (mouvements plus longs en Faible, plus courts en Forte / Maximale), retour
    du thème, variations de mélodie et d'accords (progressions tournées, réponses d'arpège), rotation de l'arrangement, variantes de
    batterie (Faible : motif stable ; Forte / Maximale : motif changé toutes les 4–8 mesures, mutations, fills plus fréquents),
    dérive lente du timbre (filtre, réverbération), **modulations** entre mouvements (Forte / Maximale, retour à la tonalité
    d'origine à la fin).
  - Surtout pour les **générations longues** (mix DJ ≥ 1 h, ou forcé dès 15 min) : **Faible** = même sous-style, même tempo, tonalités
    voisines, mêmes sons (piano, accords, lead, kit, basse) d'un titre à l'autre — concentration / sommeil ; **Forte / Maximale** =
    rotation des sous-styles (hip-hop boom-bap → lo-fi → trap joué en demi-temps sur la grille, DnB liquid → neurofunk → jungle,
    techno Detroit → minimale → industrielle…), voyage de tempo par paliers (≤ 7 % par titre) et de tonalité (Camelot plus large),
    ambiances, kits, pianos et sons différents par titre (Maximale), arc d'énergie plus marqué, **anti-répétition** (un titre ne
    reprend pas la progression / le son d'accords des titres récents). Corrige « un mix hip-hop qui commence en trap reste trap » et
    « les variantes DnB ne se mélangent qu'avec certaines graines ».
  - Sous-option « Autoriser d'autres styles proches dans le mix » (Forte / Maximale ; API `mixStyles: "related"`) : quelques titres
    d'un style voisin (lo-fi ↔ hip-hop, house ↔ techno, ambient ↔ cinématique, trap ↔ hip-hop), ~30 % au plus, jamais au début ni à
    la fin. Un sous-style, une ambiance ou un son choisi par l'utilisateur est respecté (pas de rotation).
  - Déterministe : même graine + mêmes réglages = même résultat. Découpage, chapitres et vidéos par morceau inchangés.
- **Découpage des générations longues en morceaux individuels** (v1.6.2, > 30 min) : bouton « Morceaux » de la bibliothèque (ou
  « Détails » → « Découpage »), ou case « Découper en morceaux individuels » du formulaire (visible au-delà de 30 min, découpe
  automatique à la fin du rendu). Chaque sous-morceau d'un mix DJ devient `NN - <titre FR ou EN>.wav` + `.mp3` (balises ID3/INFO)
  + MIDI par instrument (`MIDI/NN - Titre/`), avec son propre titre bilingue. Trois points de coupe : **au milieu des transitions**
  (défaut : bout à bout, ils redonnent le mix), **transitions complètes**, **sans transitions** (fondu court de 0,25 s). Coupes à
  l'échantillon près, fondu de 15 ms contre les clics (aucun fondu aux bords du fichier) ; WAV source lu en flux par blocs de 1 Mo
  (4 h sans charger le fichier en mémoire). Téléchargement en **ZIP** (en flux, taille exacte, ZIP64 au-delà de 4 Go) avec
  `00 - Liste des morceaux.txt`. Option « Ajouter chaque morceau à la bibliothèque » : nouveaux morceaux avec leurs réglages,
  titres FR/EN, chapitres, miniature (fichiers en liens physiques : pas de place disque en double). Long morceau sans
  sous-morceaux : découpe aux chapitres (« — partie N »).
- **Une vidéo YouTube par morceau découpé** (v1.6.2) : case « Créer aussi une vidéo YouTube par morceau » + résolution
  (720p / 1080p / 4K) dans le panneau « Morceaux » ou dans l'option de découpage du formulaire, ou plus tard avec le bouton
  « Créer les N vidéos » de la section « Vidéos YouTube des morceaux ». Chaque morceau (ajouté à la bibliothèque) reprend
  l'animation de fond et la mise en page du texte du mix, la langue du sélecteur FR/EN (titre dessiné, miniature) et reçoit sa
  propre miniature, son titre, sa description (« Extrait du mix « X » : morceau n/N ») et ses tags FR/EN. Rendu en file, une vidéo
  à la fois, progression et temps restant par morceau ; téléchargement individuel (MP4, miniature) ou groupé en ZIP (vidéos +
  miniatures + `NN - Titre - YouTube.txt` avec titre/description/tags en français et en anglais). Une vidéo déjà à jour n'est pas
  refaite. **Vidéo complète conservée** : ses chapitres YouTube (description) commencent au milieu de chaque transition, c'est-à-dire
  exactement aux coupes du mode « au milieu des transitions », avec les mêmes titres FR/EN que les morceaux.
- **Outils YouTube** (bouton « ▶ YouTube » de chaque morceau → panneau « Infos YouTube ») :
  - **titre** (≤ 100 car.), **description** en français (ambiance, usages, tempo/tonalité/mesure/durée, mesure de loudness, crédits,
    hashtags) avec **chapitres** horodatés (sections du morceau ; « Mouvements » pour les morceaux longs ; règles YouTube : 1er à 0:00,
    ≥ 3 chapitres de ≥ 10 s) et **tags** (≤ 500 car.), chacun avec un bouton « Copier »
  - **miniature** JPEG 1280×720 (ou 1920×1080 / 3840×2160 au choix, ≤ 2 Mo) : dégradé aux couleurs du style, style, titre, durée
    (plus de tempo ni de tonalité), créée automatiquement à la fin de chaque génération (≈ 0,15 s) et regénérée au renommage
  - **nom affiché sur la vidéo** (v1.6.1, champ du panneau YouTube) : remplace « soundtube » en haut à droite de la miniature et de la
    vidéo par le nom de ta chaîne (40 caractères max., accents gardés, emoji retirés), ou case « Aucun nom » ; mémorisé côté serveur
    (`<data>/settings.json`), repris dans la description (« … par algorithme pour <nom> »), les tags et la balise artiste du MP4 ;
    les miniatures se regénèrent d'elles-mêmes à l'ouverture du panneau, la vidéo signale qu'il faut la recréer
  - **titres et textes en français et en anglais** (v1.6.2) : chaque génération reçoit un titre FR (`title`, affiché dans la
    bibliothèque) et un titre EN (`meta.titleEn`, ligne « Titre anglais » de « Détails ») ; « ✎ » et la zone « Nom du morceau » du
    panneau modifient les deux (EN vide = traduction automatique). Sélecteur **« Langue des textes » Français / English** en haut du
    panneau : titre, description (crédits et chapitres compris), tags, boutons « Copier », textes dessinés sur la miniature / la
    vidéo et aperçu basculent ensemble ; choix mémorisé (`settings.json`, `GET/PUT /api/youtube/lang`)
  - **animation de fond personnelle** (v1.6.2, bouton « Animation et mise en page… » du panneau) : import MP4, WebM, MOV, GIF, PNG
    ou JPG (envoi brut en flux, vérifié par ffprobe, `SOUNDTUBE_MEDIA_MAX_MB`, 500 Mo par défaut) dans une bibliothèque
    (`<data>/media/`, suppression par « ✕ ») ; la vidéo boucle l'animation (`-stream_loop`, décodée une seule fois, aussi pour 4 h)
    en **Remplir** (recadrage) ou **Ajuster** (bandes), voile sombre réglable, spectre / forme d'onde par-dessus en option ;
    miniature = image de l'animation ou visuel généré. Rappel dans l'interface : n'importer que des images dont tu as les droits
  - **éditeur de mise en page** (v1.6.2, même bouton) : aperçu 16:9 en direct, **glisser-déposer** du titre, du nom affiché, de
    l'étiquette du style, de la durée et du chapitre (jamais BPM ni tonalité) ; taille, alignement, visibilité, couleur, ombre par
    élément ; guides d'alignement magnétiques (Alt pour les ignorer), flèches du clavier (Maj = 10 px), « Réinitialiser » ;
    positions relatives (0–1, identiques en 720p / 1080p / 4K) ; mises en page séparées **Miniature** / **Vidéo** ; réglage pour
    **tous les morceaux** ou **ce morceau uniquement** ; « Comparer au rendu » montre l'image exacte produite par le serveur
    (mêmes polices et mêmes calculs que l'aperçu : `public/js/layout.js` partagé)
  - **vidéo MP4 au choix 720p (1280×720), 1080p (1920×1080) ou 4K (3840×2160)** (sélecteur « Résolution » du panneau, ou
    `{"resolution":"720p"|"1080p"|"4k"}` dans l'API ; mise en page mise à l'échelle) : fond fixe (style, titre, durée — **sans BPM ni
    tonalité**) + spectre (Constant-Q) animé avec reflet, titre courant du mix / chapitre, barre de progression ; H.264 veryfast
    (CRF 27 / 26 / 28) + AAC 384 kb/s 48 kHz, `+faststart` ; 24 i/s jusqu'à 1 h puis 15 i/s (4K : 15 puis 12 i/s). Spectre calculé
    en 1280 px (1920 px en 4K) puis agrandi. Mesuré sur 75 s (8 cœurs, machine partagée) : **720p 6,8×** le temps réel,
    **1080p 5,3×**, **4K 2,7×** ⇒ 1 h ≈ 9 / 11 / 22 min, 4 h ≈ 22 / 28 / 70 min. Une vidéo à la fois, progression et temps restant
    dans le panneau ; avertissement si le titre a changé depuis. Banc d'essai : `node tools/video-bench.mjs`
  - liste de **vérifications** : loudness, crête, doublons, chapitres, balises
  - exemples : `samples/miniature-v2.jpg`, `samples/video-720p.mp4` (nouvelle incrustation), capture `samples/ui-youtube.png`
- Progression avec temps restant estimé ; forme d'onde calculée côté serveur
- Génération en tâche de fond (workers) avec file d'attente et progression en direct
- Bibliothèque (SQLite, repli JSON automatique) : écouter, télécharger, renommer, supprimer, filtrer par style, trier par date
  (« jj/mm/aaaa hh:mm », plus récents d'abord)
- **Panneau « Détails »** pour chaque morceau : style, graine, tonalité/mode, tempo, mesure, durée, ambiance, instruments et sons utilisés,
  tous les paramètres avancés, progressions d'accords, structure, recette tirée de la graine, date de création ; boutons
  **« Réutiliser ces réglages »** (recharge le formulaire : même graine + mêmes réglages ⇒ morceau identique au bit près) et
  **« Copier les réglages »** (JSON directement utilisable dans `POST /api/generate`)
- **Variation** (même harmonie, nouvelle mélodie/groove), **Remix** (nouvelle graine, mêmes réglages), regénération identique
  (même graine ⇒ même morceau, au bit près)
- Lecteur avec forme d'onde cliquable, visualiseur de spectre et fond animé « aurore + oscilloscope » qui réagit à la musique
- Polices Space Grotesk et JetBrains Mono embarquées (licence SIL OFL, `public/fonts/`) : aucune dépendance à un CDN
- API REST documentée (OpenAPI / Swagger sur `/docs`)

- **v1.7.0 — rendu vidéo réparti + page Admin** (menu **Admin**, réseau local) :
  - les vidéos YouTube peuvent être encodées sur le **PC Windows (RTX 5070 Ti, NVENC)** grâce à un petit agent
    (`node-agent/`, zip `soundtube-node-agent-1.7.0-windows.zip`) ; le CT reste le **secours** (libx264) ;
  - répartiteur : santé des nœuds toutes les 15 s, priorité NVENC → autres nœuds → CT, nouvel essai automatique sur un autre
    nœud (puis sur le CT) si un nœud tombe, plusieurs vidéos en parallèle (2 par carte NVENC, 1 par nœud libx264, 1 sur le CT) ;
  - même image que sur le CT : le CT prépare le job (audio, fond, polices, textes des chapitres, filtre ffmpeg) et ne l'envoie
    qu'avec des noms de fichiers relatifs ; seul l'encodeur change ;
  - page Admin : nœuds (ajouter, retirer, activer, renommer, jeton, tester), répartition (automatique ou nœud forcé, CT en secours
    seulement ou aussi en parallèle), découverte UDP optionnelle, PC IA (URL Ollama + modèle, défaut `qwen3:14b`, enregistrés
    et testés seulement) ; API `/api/admin/*` (voir /api/docs) ;
  - Détails → YouTube indique où et avec quel encodeur la vidéo a été faite (`videoNode`, `videoEncoder`).
- **Durée « 15 min »** dans les choix de durée (v1.7.0).
- **Mix ≥ 1 h aux titres bien distincts** (v1.7.0) : à partir d'1 h, le planificateur contrasté est toujours utilisé — chaque titre
  change de motif de batterie, de structure, de sons (piano, accords, lead, basse, kit), de brillance / espace, d'énergie, de
  tempo (paliers ≤ 8 %) et de tonalité, sauf les réglages que tu as fixés. Mesuré sur 1 h (11 titres, 5 styles) : 9,1 à 10,5
  attributs changés sur 11 entre deux titres consécutifs (v1.6.3 : 5,4 à 6,3). Les mix plus courts restent identiques à la v1.6.3.

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
  - **Profil de goût** distillé de l’export bibliothèque musicale (1 200 pistes) : son global, genres et artistes les plus écoutés, artistes de référence par style **modifiables à la main** (une ligne par style). Livré dans `contexte/gout.json` ; outil `tools/gout-distill.mjs` pour le refaire.
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
- Démos et mesures : `demos/` (`COMPARAISON.md`, hors dépôt).

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
- **Retouches légères (moteur 19)** : deep house plus chaloupée (DJ Koze), boom-bap poussiéreux, neurofunk « Pendulum », synthwave plus sombre (synth-pop 80s). Feuille de route : trip-hop, hip-hop dub/reggae, électro Ed Banger, variante Koze.
- **Compatibilité** : nouvelles générations en `engine: 19` ; `engine: 18` et plus anciens = morceaux identiques. API inchangée par ailleurs (nouveaux champs facultatifs `aiPlan`, `aiMeta`).
- Test : `test/v190.js` (dans `npm test`, serveurs Ollama / YouTube / RSS simulés, aucun appel extérieur).

## Nouveautés v1.8.0 — moteur de style 1.8

Détail complet par style : [`docs/STYLES.md`](docs/STYLES.md).

- **Nouveau style French Touch** (118–126 BPM) : house disco filtrée, grosse caisse quatre temps + clap, boucle d'accords disco (4 sons et plus), basse disco en octaves, **passe-bas résonant automatisé par section** (fermé dans l'intro, montée de filtre avant chaque drop, fermé et résonant au breakdown, se referme à l'outro), sidechain marqué, phaser sur les accords, flanger sur la batterie, lead **talkbox / vocodeur** (synthèse : formants, aucun échantillon de voix).
- **Boîtes à rythmes** par style : TR-606, TR-707, DR-110 en plus des TR-808 / TR-909 (100 % synthétisées, timbres imités, aucun échantillon de machine).
- **Synthés vintage** : DX7 (e-piano, basse, cloches — synthèse FM), Minimoog (basse, lead — 3 oscillateurs + filtre 4 pôles), Juno (nappe PWM + chorus stéréo), ARP (lead à oscillateur synchronisé), TB-303 (déjà présent, renommé par modèle dans les menus).
- **Défauts revus par style** (tempos, boîtes, sons, progressions, mix) : lo-fi, ambient, synthwave, house, techno, cinématique, chiptune, hip-hop, drum & bass. Ils alimentent aussi la variété des mix ≥ 1 h (boîtes et synthés qui tournent d'un titre à l'autre, house ↔ French Touch comme styles voisins).
- **Options avancées « Forcer »** : chaque option a une case *Forcer*. Décochée, c'est le style (ou plus tard le directeur artistique IA) qui choisit — la valeur par défaut du style est affichée sous l'option ; cochée, ta valeur est utilisée. L'état des cases est mémorisé ; bouton « Tout au défaut du style ». Anciens réglages compatibles : une valeur enregistrée vaut « forcée ».
- **Compatibilité** : les nouveaux morceaux utilisent le moteur 1.8 (`engine: 18` dans les réglages). Les anciens morceaux (Variation, Remix, Réutiliser) et toute requête API avec `"engine": 17` restent sur le moteur historique, octet pour octet. Paramètre API `engine` documenté dans `/api/openapi.json`.
- **Agent Windows** : `install-windows.ps1 -AllowFrom <CIDR,…>` (défaut : sous-réseau local + 10/8, 172.16/12, 192.168/16) pour un CT sur un autre sous-réseau routé, ex. `-AllowFrom 192.168.0.0/24` ; `-CtAddress` conservé.
- Test : `test/v180.js` (dans `npm test`).

## Rendu vidéo sur le PC Windows (v1.7.0)

1. Sur le PC (Windows 11, pilote NVIDIA ≥ 570 pour une RTX 50) : décompresser `soundtube-node-agent-1.7.0-windows.zip`, ouvrir
   PowerShell **en administrateur** dans le dossier, puis `Set-ExecutionPolicy -Scope Process Bypass -Force` et
   `.\install-windows.ps1` (ou `.\install-windows.ps1 -GenerateToken` pour un jeton). Le script installe Node.js LTS et ffmpeg
   (winget), crée la tâche planifiée « soundtube-node » (au démarrage) et ouvre TCP 8765 (+ UDP 47811) en profil **Privé**.
   Détails : `node-agent/README.md`.
2. Dans soundtube : **Admin → Nœuds de rendu vidéo → Ajouter** `http://<IP-du-PC>:8765` (+ jeton), ou « Rechercher sur le réseau ».
3. Les vidéos suivantes partent sur le PC ; s'il est éteint, le CT les rend lui-même.

Réglages du CT : liste de départ `SOUNDTUBE_RENDER_NODES`, jeton commun `SOUNDTUBE_NODE_TOKEN`, rendus simultanés sur le CT
`SOUNDTUBE_LOCAL_VIDEO_SLOTS` (tableau ci-dessous). Tout reste sur le réseau local.

## Installation sur Proxmox (conteneur LXC Debian 13)

### 1. Créer le conteneur

Sur l'hôte Proxmox (shell) :

```bash
pveam update
pveam available --section system | grep debian-13      # repérer le nom exact du modèle
pveam download local debian-13-standard_13.1-2_amd64.tar.zst   # adapter le nom

pct create 120 local:vztmpl/debian-13-standard_13.1-2_amd64.tar.zst \
  --hostname soundtube --cores 4 --memory 2048 --swap 512 \
  --rootfs local-lvm:8 --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --unprivileged 1 --features nesting=1 --onboot 1 --password
pct start 120
```

Ou via l'interface web : *Créer CT* → modèle Debian 13 → disque 8 Go → 2 à 4 cœurs → 2 Go de RAM → réseau DHCP ;
puis *Options → Fonctionnalités* → cocher **Imbrication (nesting)** (nécessaire au durcissement systemd).

> Ressources conseillées : 2 cœurs minimum, 1 à 2 Go de RAM (≈ 250 Mo par rendu en cours, quelle que soit la durée).
> Vitesse mesurée (1 cœur) : 1 h de musique en ~1 min 30 (≈ 40× temps réel), 4 h en ~8 min (≈ 30×).
> Disque : 10,6 Mo par minute en WAV + 2,4 Mo en MP3 320k (1 h ≈ 636 Mo + 144 Mo ; 4 h ≈ 2,5 Go + 576 Mo) — prévoir 8 Go
> ou plus selon l'usage, ou `SOUNDTUBE_KEEP_WAV=false`. Une génération est refusée si l'espace libre est insuffisant.

### 2. Copier et installer soundtube

Depuis votre poste :

```bash
scp soundtube.tar.gz root@<ip-du-ct>:/root/
```

Dans le conteneur (`pct enter 120` ou ssh) :

```bash
cd /root
tar xzf soundtube.tar.gz
cd soundtube
./deploy/install.sh            # en root (ou : sudo ./deploy/install.sh)
```

Le script :
1. installe `ffmpeg`, `curl`, `ca-certificates`, `gnupg` (apt) ;
2. installe **Node.js 22 LTS** (dépôt NodeSource) si aucun Node ≥ 20 n'est présent ;
3. crée l'utilisateur système `soundtube` ;
4. déploie l'application dans `/opt/soundtube/app` et installe les dépendances npm ;
5. crée `/var/lib/soundtube` (données) et `/etc/soundtube/soundtube.env` (configuration) ;
6. installe et démarre le service **`soundtube.service`** (port **8080** sur `0.0.0.0`).

Ouvrir ensuite **http://&lt;ip-du-ct&gt;:8080/** (API : `/docs`).

Options :

| Option | Effet |
|---|---|
| `--port 9000` | change le port d'écoute |
| `--nodesource` | force l'installation de Node.js depuis NodeSource (`NODE_MAJOR=22` par défaut) |
| `--debian-node` | utilise le Node.js des dépôts Debian 13 (v20) au lieu de NodeSource |
| `--no-start` | installe sans démarrer le service |
| `--skip-apt` | n'utilise pas apt (ffmpeg et Node ≥ 20 déjà installés, machine hors ligne…) |

### Commandes utiles

```bash
systemctl status soundtube
journalctl -u soundtube -f
systemctl restart soundtube        # après modification de /etc/soundtube/soundtube.env
```

## Configuration (`/etc/soundtube/soundtube.env`)

| Variable | Défaut | Rôle |
|---|---|---|
| `SOUNDTUBE_HOST` | `0.0.0.0` | adresse d'écoute (`127.0.0.1` derrière nginx) |
| `SOUNDTUBE_PORT` | `8080` | port |
| `SOUNDTUBE_DATA_DIR` | `/var/lib/soundtube` | base de données + fichiers audio |
| `SOUNDTUBE_MAX_JOBS` | `2` | générations simultanées (≈ nombre de cœurs) |
| `SOUNDTUBE_MAX_QUEUE` | `50` | taille max de la file d'attente |
| `SOUNDTUBE_MAX_DURATION` | `14400` | durée max d'un morceau (s), 4 h |
| `SOUNDTUBE_MP3` | `auto` | `auto` / `on` / `off` (export MP3 via ffmpeg) |
| `SOUNDTUBE_MP3_BITRATE` | `320k` | débit MP3 (à 192k l'encodage fait perdre ≈ 0,3 LU) |
| `SOUNDTUBE_LUFS` | `-14` | loudness intégrée cible du mastering (LUFS) |
| `SOUNDTUBE_TRUE_PEAK` | `-1` | crête vraie maximale (dBTP) |
| `SOUNDTUBE_ARTIST` | `soundtube` | artiste inscrit dans les balises ID3 / WAV |
| `SOUNDTUBE_FFMPEG` | `ffmpeg` | chemin de ffmpeg |
| `SOUNDTUBE_KEEP_WAV` | `true` | WAV coché par défaut dans l'interface (`false` : MP3 seul par défaut) |
| `SOUNDTUBE_SAMPLES` | `assets/samples` | dossier de la banque d'échantillons (absente ⇒ repli sur la synthèse) |
| `SOUNDTUBE_SAMPLE_CACHE_MB` | `160` | cache mémoire des échantillons décodés (par worker) |
| `SOUNDTUBE_DRUM_CACHE_MB` | `64` | cache des frappes de batterie acoustique préparées (partagé par les titres d'un mix) |
| `SOUNDTUBE_MEDIA_MAX_MB` | `500` | taille max d'une animation de fond importée (v1.6.2) |
| `SOUNDTUBE_RENDER_NODES` | — | v1.7.0 : nœuds de rendu vidéo au premier démarrage (URL séparées par des virgules, ensuite gérés dans Admin) |
| `SOUNDTUBE_NODE_TOKEN` | — | v1.7.0 : jeton commun des agents (optionnel ; un nœud peut avoir le sien) |
| `SOUNDTUBE_LOCAL_VIDEO_SLOTS` | `1` | v1.7.0 : vidéos encodées en même temps sur le CT |

## Mise à jour

Copier la nouvelle archive, puis :

```bash
tar xzf soundtube.tar.gz && cd soundtube && ./deploy/install.sh
```

La configuration existante (`/etc/soundtube/soundtube.env`) et les morceaux (`/var/lib/soundtube`) sont conservés ;
le service est redémarré automatiquement. À chaque mise à jour, `deploy/migrate-env.sh` sauvegarde la config
(`soundtube.env.bak-<date>`), remplace l'ancien plafond de 7 min (`SOUNDTUBE_MAX_DURATION=420`, défaut de la v1.0, ou clé absente)
par 14400 (4 h) et ajoute les nouvelles clés du modèle, sans modifier vos autres valeurs.

Sauvegarde : `tar czf soundtube-data.tgz /var/lib/soundtube /etc/soundtube` (ou simplement les sauvegardes/snapshots Proxmox du CT).

## Désinstallation

```bash
./deploy/uninstall.sh            # supprime le service et /opt/soundtube, garde données et configuration
./deploy/uninstall.sh --purge    # supprime aussi /var/lib/soundtube, /etc/soundtube et l'utilisateur soundtube
```

Node.js et ffmpeg ne sont pas désinstallés (`apt purge nodejs ffmpeg` si besoin).

## Reverse proxy nginx (optionnel)

Voir `deploy/nginx-soundtube.conf` :

```bash
apt install nginx
cp deploy/nginx-soundtube.conf /etc/nginx/sites-available/soundtube   # adapter server_name
ln -s ../sites-available/soundtube /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

Puis passer `SOUNDTUBE_HOST=127.0.0.1` dans la configuration pour ne plus exposer le port 8080. Pour HTTPS : `certbot --nginx`.
`proxy_buffering off` est recommandé pour la lecture audio (requêtes Range).

## API

Documentation interactive : `http://<ip>:8080/docs` — spécification : `/api/openapi.json`.

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/health` | état (stockage, mp3, tâches en cours) |
| GET | `/api/options` | styles, gammes, ambiances, instruments, limites |
| GET | `/api/styles` · `/api/styles/:id` | cartes des styles + feuille de route / fiche d'un style (description de `docs/STYLES.md`, faits, voisins ; 404 si inconnu) — v1.10.0 |
| POST | `/api/generate` | lance une génération (202 + tâche) ; la réponse contient `duplicates` ; `"split":true` (ou options) = découper à la fin (> 30 min) |
| GET | `/api/tracks/:id/youtube` | titre, description (chapitres), tags, URL miniature/vidéo, état de la vidéo, vérifications |
| POST | `/api/tracks/:id/thumbnail` | (re)crée la miniature ; corps optionnel `{"resolution":"720p"|"1080p"|"4k"}` (défaut : 720p, ou la dernière choisie) |
| POST | `/api/tracks/:id/video` | lance la vidéo MP4 (202) ; corps optionnel `{"resolution":"720p"|"1080p"|"4k"}` (défaut 1080p) ; suivre via `GET …/youtube` |
| GET / PUT | `/api/youtube/lang` | langue des textes YouTube : `{"lang":"fr"|"en"}` ; aussi `"lang"` dans les corps miniature / vidéo / aperçu |
| GET / PUT | `/api/youtube/design` | réglage global : `{"design":{"background":{…},"layout":{"thumb":{…},"video":{…}}}}` |
| PUT | `/api/tracks/:id/design` | réglage propre au morceau (`{"design":null}` = revenir au réglage global) |
| POST | `/api/tracks/:id/youtube/preview` | image exacte du rendu (720p) pour un réglage non enregistré : `{"target":"thumb"|"video","design":…,"at":8}` |
| GET / POST | `/api/media` | animations de fond : liste / import (corps brut, `?name=`) ; `DELETE /api/media/:id`, `GET /api/media/:id/poster.jpg` |
| GET / POST / DELETE | `/api/tracks/:id/split` | découpage (> 30 min) : état + plan (`?mode=mid|full|clean`) / lancer `{"mode":"mid","lang":"fr","formats":{"wav":true,"mp3":true,"midi":true},"library":false}` / supprimer les fichiers |
| GET | `/api/tracks/:id/split.zip` | ZIP des morceaux découpés |
| GET / POST | `/api/tracks/:id/split/videos` | vidéos YouTube des morceaux : état par morceau / lancer `{"resolution":"720p","lang":"fr"}` (aussi `"video":{"resolution":"1080p"}` dans les options de découpage) |
| GET | `/api/tracks/:id/split/videos.zip` | ZIP des vidéos prêtes + miniatures + textes FR/EN (`?lang=en` : noms anglais) |
| GET / PUT | `/api/youtube/brand` | nom affiché sur miniatures / vidéos : `{"name":"Ma chaîne","hidden":false}` (vide = « soundtube ») ; aussi accepté en `"brand"` dans les corps miniature / vidéo |
| GET | `/api/tracks/:id/thumb.jpg` · `/video.mp4` | miniature / vidéo (`?download=1` pour télécharger) |
| POST | `/api/check-duplicates` | mêmes paramètres que `/api/generate` : doublons / morceaux très proches existants |
| GET | `/api/jobs/:id` | progression d'une tâche |
| GET | `/api/tracks` | bibliothèque (`?style=&status=&limit=&offset=`) |
| GET / PATCH / DELETE | `/api/tracks/:id` | détail / renommer (`{"title":"…","title_en":"…"}`) / supprimer |
| POST | `/api/tracks/:id/variation` | `{"mode":"variation"|"remix"|"same"}` |
| GET | `/api/tracks/:id/audio.mp3`, `audio.wav`, `track.mid`, `midi.zip` | fichiers (`?download=1` pour forcer le téléchargement) |
| GET | `/api/tracks/:id/settings` | réglages complets du morceau (JSON réutilisable tel quel dans `/api/generate`) |

Exemples :

```bash
# Lancer un morceau synthwave de 2 minutes en la mineur, sans arpèges
curl -s -X POST http://localhost:8080/api/generate -H 'Content-Type: application/json' -d '{
  "style":"synthwave","duration":120,"bpm":108,"key":"A","scale":"minor","mood":"epique",
  "seed":42,"instruments":{"arp":false}
}'
# → {"id":"92764461c5f7","status":"queued"|"running","progress":0.01,…}

curl -s http://localhost:8080/api/jobs/92764461c5f7          # jusqu'à "status":"done"
curl -o morceau.mp3 http://localhost:8080/api/tracks/92764461c5f7/audio.mp3
curl -s -X POST http://localhost:8080/api/tracks/92764461c5f7/variation -H 'Content-Type: application/json' -d '{"mode":"variation"}'

# Refaire exactement le même morceau à partir de ses réglages
curl -s http://localhost:8080/api/tracks/92764461c5f7/settings > reglages.json
curl -s -X POST http://localhost:8080/api/generate -H 'Content-Type: application/json' -d @reglages.json

# 1 h de lo-fi en 3/4, contrebasse et Rhodes, sans WAV
curl -s -X POST http://localhost:8080/api/generate -H 'Content-Type: application/json' -d '{
  "style":"lofi","duration":3600,"wav":false,"adv":{"meter":"3/4","bassPatch":"uprightbass","chordPatch":"rhodes","swing":35}
}'
```

Valeurs : `style` ∈ `lofi, ambient, synthwave, house, techno, cinematic, chiptune, trap` ;
`scale` ∈ `auto, major, minor, dorian, phrygian, lydian, mixolydian, harmonic_minor` ;
`key` ∈ `auto, C, C#, D, … B` ; `mood` ∈ `auto, calme, joyeux, melancolique, sombre, epique, reveur, energique` ;
`bpm` : 50–180 ou `"auto"` ; `duration` : 20–14400 s ; `seed` : entier (aléatoire si absent) ; `wav` : booléen ;
`adv` : objet de paramètres avancés (liste complète et valeurs permises : `GET /api/options` → `advanced`, ou `/docs`).
Une valeur avancée inconnue est ignorée (« auto ») ; une valeur numérique hors bornes est ramenée dans les bornes.

## Développement

```bash
npm install
npm start          # http://localhost:8080  (données dans ./data)
npm test           # un court morceau par style + durée réelle (ffprobe) de deux rendus
npm run test:durations   # durée réelle WAV/MP3 pour 1, 3, 7, 10 min et 1 h (plusieurs styles, tempos, mesures)
#                  (npm test :) un court morceau par style (signal + MIDI), déterminisme, réglages réutilisables, échantillons
#                  + test/v162.js : mise en page, titres FR/EN, textes YouTube EN, animations (API + rendu 720p), découpage (précision, fondus, ZIP), vidéos par morceau (API + rendu 720p), chapitres = coupes
#                  + test/v163.js : variation, mix courts identiques (empreintes) ; test/v170.js : préréglage 15 min, mix 1 h distincts, agent de rendu (sécurité, jeton, découverte), répartiteur (priorité, relance, parallèle, image identique CT/agent), API Admin
node tools/build-sample-pack.mjs   # reconstruit assets/samples depuis VCSL / VSCO-2-CE (git + ffmpeg requis)
```

Structure : `src/engine/` (théorie, composition, DSP, instruments, rendu), `src/server.js` (API Express),
`src/jobs.js` + `src/worker.js` (file de rendu, worker_threads), `src/db.js` (SQLite / JSON), `public/` (interface) ;
v1.6.2 : `src/media.js` (animations), `src/design.js` + `public/js/layout.js` (mise en page partagée aperçu / serveur), `src/split.js` + `src/splitqueue.js` (découpage), `public/js/yteditor.js` (éditeur).
`samples/` contient des morceaux d'exemple : `avant-apres/` (moteur avant/après, ~45 s par style), `instruments/`
(démonstrations des instruments échantillonnés) et des captures de l'interface.

## Dépannage

- **Le service ne démarre pas (`status=226/NAMESPACE`)** : activer *nesting* sur le CT
  (`pct set 120 --features nesting=1` puis redémarrer le CT), ou commenter les lignes `Protect*`/`PrivateTmp`
  de `/etc/systemd/system/soundtube.service` puis `systemctl daemon-reload && systemctl restart soundtube`.
- **Pas de MP3** : vérifier `ffmpeg -version` ; `/api/health` indique `"mp3":false` si ffmpeg est introuvable.
- **« stockage : json »** : le module natif `better-sqlite3` n'a pas pu être installé (pas de binaire précompilé pour la plateforme) ;
  soundtube fonctionne alors avec un fichier `tracks.json` (adapté jusqu'à quelques milliers de morceaux).
- **Génération lente** : réduire `SOUNDTUBE_MAX_JOBS` à 1 sur un petit CT, ou attribuer plus de cœurs.
- **Port déjà utilisé** : `./deploy/install.sh --port 9000` ou modifier `SOUNDTUBE_PORT`.

## Limites connues

- Minimum 8 mesures (une demande de 20 s à tempo lent donne ~25–35 s). Au-delà d'une minute, la durée réelle (queue de réverbération
  comprise) reste à ±2 % de la durée demandée.
- Pas de guitare échantillonnée (aucune source libre de qualité suffisante trouvée) : elle reste modélisée (Karplus-Strong).
- Banque de 143 Mo (v1.5 : 61 Mo). Le premier chargement d'un instrument passe par ffmpeg (décodage FLAC) : un rendu court peut être
  jusqu'à 2× plus lent qu'en v1.5 ; sur un long rendu ou un mix, le surcoût est amorti par les caches.
- La pédale de charleston (`vd_pedal`) est dans la banque mais pas encore jouée par les motifs.
- Un rendu de 4 h prend plusieurs minutes de CPU et ~2,9 Go de disque (WAV + MP3).
- Les breaks jungle/DnB sont des motifs « amen-like » réécrits et joués par des sons de synthèse / CC0 : pas le grain d'un vrai break
  échantillonné (choix délibéré, aucun échantillon protégé). Les fonds sonores (pluie, vagues…) sont synthétisés, donc stylisés.
- En mix DJ, les titres d'un set partagent une grille de tempo commune : une variante peut jouer 1-3 BPM hors de sa plage nominale
  pour rester calée (ex. neurofunk à 167 BPM aux côtés de la jungle).

- v1.13.0 : envoi YouTube réel vérifié seulement avec un `fetch` factice (aucun envoi depuis le développement) ; jeton collé à
  la main (pas d'OAuth web), expiré au bout de 7 jours si l'application Google reste en mode test ; quota par défaut ≈ 6 envois
  par jour ; pas de reprise d'un envoi coupé (relance complète). Le ZIP d'un morceau court non mixé contient un seul morceau
  (= le mix) ; la découpe par chapitres reste réservée aux morceaux de plus de 30 min.
- v1.7.0 : l'agent et son installateur n'ont pas été essayés sur un vrai PC Windows / une vraie RTX (NVENC vérifié seulement par
  la détection et les arguments ffmpeg ; l'image est identique, la compression NVENC diffère légèrement de libx264). La page Admin
  n'a pas d'authentification propre : comme le reste de soundtube, elle suppose un réseau local de confiance. Le fond en dégradé
  animé est tiré au hasard à chaque rendu (comme avant) : deux rendus successifs d'un même morceau ne sont pas identiques au bit
  près. Le PC IA (Ollama) est seulement enregistré et testé, il n'est pas encore utilisé. La découverte UDP demande la règle de
  pare-feu et un réseau en profil Privé ; sinon, ajouter l'adresse à la main.
- v1.6.3 : la variation Faible / Forte / Maximale ne change pas les morceaux déjà générés (ils gardent Moyenne). En Maximale, un
  titre trap au sein d'un mix hip-hop est joué en demi-temps (grille 65–75 BPM) : le tempo affiché est le tempo réel (130–150).
  Les styles proches ne s'appliquent qu'en Forte / Maximale et dans un mix DJ ; un style seul sans voisin (ex. chiptune, synthwave)
  ne tourne que dans ses propres variantes / ambiances. L'anti-répétition essaie 4 graines au plus par titre.
- v1.6.2 : l'animation de fond n'est pas analysée : seuls des fichiers dont tu as les droits doivent être importés (YouTube
  Content ID). Le rendu d'une vidéo avec animation coûte plus de CPU qu'avec le dégradé (décodage + mise à l'échelle par image).
  Le MIDI par morceau découpé n'existe que pour les mix DJ (recomposé à l'identique par sous-morceau) ; le MIDI d'un long morceau
  simple n'est pas découpé. Le découpage écrit les fichiers sur le disque (≈ taille du WAV source + MP3) : 507 si l'espace manque.
  Vidéos par morceau : rendu séquentiel (720p avec animation MP4 : ≈ 2 min pour 6 min de musique sur le serveur de test ; 4K bien plus
  lent) ; il faut ajouter les morceaux à la bibliothèque (forcé par l'option). Les vidéos ne sont pas envoyées sur YouTube : à
  téléverser soi-même avec les textes fournis. Les chapitres de la vidéo complète correspondent au mode « au milieu des
  transitions » ; en modes « transitions complètes » / « sans transitions », les morceaux se chevauchent ou omettent les fondus.

## Échantillons et droits

`assets/samples/` réunit plusieurs licences (détail : `assets/samples/CREDITS.md`, textes dans `assets/samples/licenses/`) :

| Banque | Auteur | Licence |
|---|---|---|
| [VCSL](https://github.com/sgossner/VCSL) (dont piano à queue Steinway B), [VSCO 2 CE](https://github.com/sgossner/VSCO-2-CE) | Versilian Studios | CC0 1.0 |
| [Virtuosity Drums](https://github.com/sfzinstruments/virtuosity_drums) | Versilian Studios / sfzinstruments | CC0 1.0 |
| [Frankensnare](https://github.com/sfzinstruments/karoryfer.frankensnare) | Karoryfer Samples | CC0 1.0 |
| [Salamander Grand Piano V3](https://github.com/sfzinstruments/SalamanderGrandPiano) | Alexander Holm | CC-BY 3.0 (attribution) |
| [jRhodes3d](https://github.com/sfzinstruments/jlearman.jRhodes3d) | Jeff Learman | CC BY-NC 4.0 (échantillons) ; musique produite CC0 |

La musique générée vous appartient, y compris sur YouTube monétisé. La description YouTube ajoute automatiquement le crédit
« Salamander Grand Piano V3 par Alexander Holm (CC-BY 3.0) » et celui de jRhodes3d quand ces sons sont utilisés.
**Le pack lui-même ne peut être redistribué qu'à titre non commercial** (à cause de jRhodes3d) : pour une banque 100 % libre,
supprimez `assets/samples/jrhodes/` (le Rhodes passe en synthèse) et, pour éviter l'attribution, `assets/samples/salamander/`
(le Steinway B le remplace) ; soundtube s'adapte automatiquement. Les micros de batterie sont pré-mélangés en Node.js + ffmpeg
(`tools/premix-drums.mjs`), et le pack se reconstruit avec `PACK_SRC=<sources> node tools/build-sample-pack.mjs`.
- Aucune authentification : à garder sur le réseau local ou derrière un reverse proxy avec authentification.

Licence MIT.
