# Pack ZIP complet (v1.18.0)

Depuis la **v1.14.0**, un morceau terminé peut produire un **ZIP complet** (manuel ou automatique en fin de rendu).

## Contenu (v2)

```
nom-du-morceau/
  LISEZMOI.txt    # FR
  README.txt      # EN (v1.21.2)
  youtube-fr.txt  # titre / description / tags YouTube du mix (v1.21.2)
  youtube-en.txt
  manifest.json
  video/          # MP4 si demandé / disponible
  mix/            # MP3, WAV, TXT métadonnées
  morceaux/       # par morceau : .mp4 (vidéo par morceau), .mp3, .wav, .txt (FR) + .en.txt (EN)
  MIDI/           # fichiers MIDI
  samples/        # stems groupés (batterie, basse, …)
```

`manifest.json` décrit les fichiers, les réglages, et depuis v1.16.0 la section `render` (nœud, combo, repli).

## Déclenchement

1. **Studio** — option de préparer le ZIP à la fin (`pack` / `meta.autoPack`).
2. **API** — `POST /api/tracks/{id}/pack` puis `GET /api/tracks/{id}/pack.zip`.
3. **Combo PC** — un ZIP unique est produit quand musique+vidéo finissent sur le nœud.

## Options utiles

- Inclure ou non la vidéo ; résolution par défaut 720p via la file vidéo si absente.
- Les textes `LISEZMOI` suivent la langue de contenu YouTube / options de pack (pas la langue d’UI seule).

Voir aussi le découpage (`/api/tracks/{id}/split`) pour exporter chaque titre d’un mix long séparément.

## v1.21.2

- Textes anglais toujours produits (avec l’option TXT) : `README.txt`, `youtube-en.txt`, `morceaux/<morceau>.en.txt`.
- Vidéos par morceau (option « Une vidéo par morceau ») : l’audio de chaque rendu est épinglé dès la mise en file — un renommage de morceau pendant l’attente ne fait plus échouer le ZIP (`ffmpeg code 254 : Error opening input file audio.wav`).
- Test bout en bout : `npm run test:e2e`.
