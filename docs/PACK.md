# ZIP complet (v1.14.0, PC Windows en v1.16.0)

Un clic, ou une case cochée avant la génération, et soundtube prépare un ZIP qui contient tout le morceau : la vidéo longue,
le mix, puis chaque morceau du mix en vidéo, MP3, WAV, TXT, MIDI et samples.

## Où ?

- **Avant la génération** : Créer › **Paquet ZIP** › « Préparer le ZIP complet à la fin du rendu ». Coche ce que tu veux :
  vidéo longue (et sa résolution), morceaux découpés, vidéo par morceau (et sa résolution), samples, WAV, MIDI, TXT. Ces choix
  sont mémorisés dans le navigateur. À la fin du rendu, le paquet se construit tout seul. Un lien « Télécharger le ZIP »
  apparaît sous les options et une notification l'annonce.
- **Après coup** : panneau YouTube d'un morceau › **ZIP complet** (mêmes options), puis « Créer le ZIP complet ».
- **API** : `POST /api/generate { …, pack: { … } }` ou `POST /api/tracks/{id}/pack { … }`, `GET /api/tracks/{id}/pack`
  (état, étape, progression) et `GET /api/tracks/{id}/pack.zip`.

Options (`pack`) : `video` (oui), `videoRes` (résolution actuelle), `pieces` (oui), `pieceVideo` (non),
`pieceRes` (`720p`), `wav` (non via l'API, oui dans le formulaire), `midi` (oui), `txt` (oui), `stems` (non), `mode`
(`mid` | `full` | `clean`).

## Option combinée sur le PC Windows (v1.16.0)

Générer › Paquet ZIP › **« Faire la musique et la vidéo en même temps sur le PC Windows »** (décochée par défaut,
mémorisée dans le navigateur). Cochée, elle suffit : le ZIP est construit même si « Préparer le ZIP complet » n’est pas
coché (vidéo longue, morceaux, WAV, MIDI, TXT ; vidéo par morceau et samples selon les cases).

1. La musique est rendue sur le PC (identique au bit près au CT, voir [`NODES.md`](NODES.md)).
2. Dès que le mix existe sur le PC, la vidéo longue y démarre, sur le même nœud et avec le WAV déjà présent.
3. Quand le morceau et la vidéo sont rentrés sur le CT, le ZIP se construit. Le lien **Télécharger le ZIP** apparaît
   sous le formulaire avec la mention « musique rendue sur le PC « … » (musique + vidéo) ».
4. `manifest.json` gagne `render: { music: { where: "pc"|"ct", node, reason, fallback, combo }, video: "<nœud>" }`.
   Ce champ est absent pour les morceaux rendus avant la v1.16.

Pannes : si le PC tombe pendant la musique, le CT reprend le morceau, puis la vidéo suit le chemin habituel. S’il tombe
pendant la vidéo, la vidéo partielle (`.part`) est jetée et la vidéo repart sur un autre nœud ou sur le CT. Le ZIP
n’est construit qu’une fois la vidéo complète, et un ZIP déjà construit n’est jamais réécrit (testé dans `test/v1160.js`).

## Arborescence

```
nom-du-morceau/
├─ LISEZMOI.txt        l'arborescence et la liste des morceaux, en français
├─ manifest.json       tempo, tonalité, graine, style, moteur, début/fin et fichiers de chaque morceau
├─ video/              la vidéo MP4 longue
├─ mix/                MP3 (+ WAV quand l'option est cochée ; + MIDI complet et pistes MIDI .zip si MIDI)
└─ morceaux/           un fichier par morceau, nommé « 01 - Titre »
   ├─ 01 - Titre.mp4     (vidéo par morceau)
   ├─ 01 - Titre.mp3
   ├─ 01 - Titre.wav     (WAV)
   ├─ 01 - Titre.txt     (TXT)
   ├─ …
   ├─ MIDI/
   │  └─ 01 - Titre/01 - Titre.mid, 01-lead.mid, 02-chords.mid…   (mix DJ)
   └─ samples/
      ├─ 01 - Titre - batterie.wav
      ├─ 01 - Titre - basse.wav
      ├─ 01 - Titre - accords.wav
      ├─ 01 - Titre - mélodie-pads.wav
      └─ 01 - Titre - percussions.wav
```

**Quand y a-t-il des morceaux ?** Pour un mix DJ, un morceau par titre, quelle que soit la durée. Pour un long morceau à
chapitres, un morceau par chapitre, au-delà de 30 min seulement. Un morceau unique et court n'a pas de dossier `morceaux/`.
Aucun fichier factice n'est créé : le manifeste renvoie alors aux fichiers de `mix/`, et une remarque l'explique.

### TXT par morceau

On y trouve le titre (et le titre anglais), le style, le tempo, la tonalité, la graine (et la variation), le moteur et la
position dans le mix. Suivent la progression d'accords (couplet, refrain, pont) puis la description YouTube complète du
morceau : titre YouTube, description et tags. C'est le même texte que si le morceau était publié seul.

### manifest.json

```json
{
  "version": 2, "generator": "soundtube", "created": "…Z",
  "options": { "video": true, "videoRes": "1080p", "pieces": true, "pieceVideo": true, "pieceRes": "720p", "wav": true, "midi": true, "txt": true, "stems": true, "mode": "mid", "lang": "fr" },
  "source": { "id": "…", "title": "…", "duration": 900, "style": "house", "seed": 1407, "bpm": 122, "key": "A", "scale": "minor", "keyLabel": "La mineur", "engine": 21, "mix": true, "split": "mix", "splitMode": "mid" },
  "video": "video/….mp4", "videoResolution": "1080p",
  "mix": { "mp3": "mix/….mp3", "wav": "mix/….wav", "mid": "mix/….mid", "midiTracks": "mix/…-midi.zip" },
  "samples": { "groups": ["batterie", "basse", "accords", "mélodie-pads"], "skipped": [{ "group": "percussions", "reason": "aucun son de ce groupe dans le morceau" }] },
  "notes": [],
  "pieces": [ { "n": 1, "title": "…", "base": "01 - …", "start": 0, "end": 301.2, "duration": 301.2, "style": "house", "seed": 4242, "bpm": 121.5, "key": "A", "scale": "minor", "keyLabel": "La mineur", "engine": 21,
               "chords": ["Couplet : Am7 – F – C – G"],
               "files": { "mp4": "morceaux/01 - ….mp4", "mp3": "morceaux/01 - ….mp3", "wav": "…", "txt": "…", "midi": ["morceaux/MIDI/01 - …/01 - ….mid", "…"], "samples": ["morceaux/samples/01 - … - batterie.wav", "…"] } } ]
}
```

## Vidéo par morceau

Chaque morceau passe par la file vidéo habituelle, avec les nœuds de rendu s'il y en a. Le navigateur n'attend rien, et le
paquet affiche « Vidéos des morceaux : x/N prêtes — rendu en cours, le ZIP attend ». Les morceaux sont aussi **ajoutés à la
bibliothèque**, comme avec « Découper › Ajouter à la bibliothèque », ce qui permet de les publier un par un ensuite. Ils
reprennent l'animation et la mise en page du mix. Par défaut ils sont en 720p, parce que c'est **long à rendre** : compte à peu
près le temps de rendu de la vidéo longue, une deuxième fois, réparti sur les morceaux.

**Aucune omission silencieuse.** Si la vidéo d'un morceau échoue, le paquet passe en erreur et indique laquelle (« Vidéo du
morceau 3 : … »). Il en va de même pour tout autre fichier demandé qui manquerait.

## Samples (stems)

Chaque groupe d'instruments est rendu seul par le moteur d'origine, avec la même graine, la même partition et le même gain de
mastering que le mix. Le sidechain reste piloté par la grosse caisse. Chaque stem est ensuite recoupé aux bornes exactes de
chaque morceau.

| Groupe | Contenu |
|---|---|
| batterie | kit (grosse caisse, caisse claire, charleston, cymbales, toms) |
| basse | basse |
| accords | piano / Rhodes / nappes d'accords |
| mélodie-pads | lead, arpèges, textures |
| percussions | congas, maracas, shaker, claves, cowbell, scratchs lo-fi |

Additionnés, les stems redonnent le mix à peu près : environ −9 à −22 dB d'écart selon le style. Ne sont pas inclus le
compresseur et le limiteur du master, qui agissent sur l'ensemble, ni la texture vinyle et bande ou le fond sonore lo-fi.
Un groupe absent du morceau (par exemple aucune percussion en house) n'est pas écrit, et le manifeste l'indique.
Les samples coûtent **5 rendus audio supplémentaires** du morceau entier, en parallèle sur les cœurs disponibles.

## Animation de la vidéo

Créer › Avancé › **Animation de la vidéo** propose « Fond du style » (le dégradé généré) ou une animation de la
bibliothèque. Survole ou clique une vignette pour voir quelques secondes du vrai mouvement. Le choix est **mémorisé par
style** (`PUT /api/styles/{id}/animation { media }`) et enregistré sur chaque génération (`meta.animation`). Il sert à la
vidéo longue et à chaque vidéo de morceau. Pour importer une animation, va dans Admin › Animations. Le panneau YouTube d'un
morceau peut toujours la changer, pour ce morceau seulement. Quand on recharge les réglages d'un morceau (« Réutiliser »), le
formulaire montre l'animation réellement utilisée par sa vidéo et précise si elle a été remplacée.

## Fichiers

Le ZIP est stocké sans recompression et ses CRC sont vérifiés. Ses fichiers restent dans `<morceau>/pack/` jusqu'au prochain
« Recréer le ZIP », et le ZIP reste téléchargeable après un redémarrage.
