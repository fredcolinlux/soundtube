# Crédits et licences de la banque d'échantillons soundtube

La banque `assets/samples/` réunit plusieurs sources aux licences **différentes**. La musique générée par soundtube
vous appartient ; les conditions ci-dessous portent sur les **fichiers d'échantillons** eux-mêmes (redistribution du pack).

| Banque (dossiers) | Source | Auteur | Licence |
|---|---|---|---|
| Orchestre, piano droit, batterie d'origine (`piano`, `violins*`, `celli*`, `harp`, `flute`, `horn`, `vibes`, `upbass`, `timpani`, `bassdrum`, `snare`, `hat`, …) | [VCSL](https://github.com/sgossner/VCSL), [VSCO 2 CE](https://github.com/sgossner/VSCO-2-CE) | Versilian Studios — Sam Gossner | CC0 1.0 |
| Batterie acoustique v1.6 (`vd_*` : kick, caisse claire 36 vélocités, ghost notes « muted », rimshot, cross-stick, charleston fermée/mi-ouverte/ouverte/pédale, ride, crash ; `vl_*` : micro « lofi ») | [Virtuosity Drums](https://github.com/sfzinstruments/virtuosity_drums) | Versilian Studios / sfzinstruments | CC0 1.0 |
| Caisses claires & claps (`fs_tight` = 20m tight, `fs_rimshot` = 13b rimshot, `fs_clap`) | [Frankensnare](https://github.com/sfzinstruments/karoryfer.frankensnare) | Karoryfer Samples | CC0 1.0 |
| Piano à queue Steinway B (`steinwayb`) | [VCSL — Grand Piano, Steinway B](https://github.com/sgossner/VCSL) | Versilian Studios — Sam Gossner | CC0 1.0 |
| Piano à queue Salamander Grand V3, Yamaha C5 (`salamander`) | [Salamander Grand Piano](https://github.com/sfzinstruments/SalamanderGrandPiano) | **Alexander Holm** | **CC-BY 3.0** — attribution requise |
| Rhodes Mark I Stage 73 — jRhodes3d (`jrhodes`) | [jRhodes3d](https://github.com/sfzinstruments/jlearman.jRhodes3d) | **Jeff Learman** | **CC BY-NC 4.0** pour les échantillons ; la musique produite avec est libre (CC0) |

## Conséquences pratiques

- **Vos morceaux et vidéos** (y compris YouTube monétisé) : libres. Le Salamander demande une attribution ; soundtube
  l'ajoute automatiquement dans la description générée quand ce piano est utilisé (« Piano : Salamander Grand Piano V3 par
  Alexander Holm, CC-BY 3.0 »). La licence jRhodes3d précise que la musique produite est CC0.
- **Le pack lui-même** (les fichiers `.flac`) : à cause de jRhodes3d, la redistribution du pack complet est **non commerciale**
  (ne pas vendre le pack ni l'inclure dans un produit payant). Pour un pack 100 % libre, supprimez `jrhodes/` (le Rhodes
  retombe alors sur la synthèse) et, pour éviter l'attribution, `salamander/`.

## Traitement appliqué

Rognage du silence initial, longueur limitée (≈ 8 s dans le grave, moins dans l'aigu ; 0,5 à 3,5 s pour la batterie),
fondu de fin, **normalisation par instrument** (les écarts de vélocité d'origine sont conservés), mélange des micros pour la
batterie (direct + overheads + room, voir `tools/premix-drums.mjs`), conversion FLAC 16 bits 44,1 kHz.
Textes des licences : `licenses/` et `CC0-1.0-legalcode.txt`. Détail fichier par fichier : `manifest.json`.
Reconstruction : `node tools/build-sample-pack.mjs [--extra-only]`.
