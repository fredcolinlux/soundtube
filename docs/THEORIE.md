# Audit de théorie musicale — moteur 20 (v1.11.0)

Date : 4 novembre 2026. Analyse en lecture seule : seule la partition est générée (`compose`), sans rendu audio.
Corpus : 200 graines par style et sous-style, 90 s, moteur 20, plus `lofi` en moteur 19 pour comparaison. Cela fait 26 variantes et 5 200 morceaux.
Le script d'analyse est hors dépôt : `/tmp/theo/audit.mjs` sur la box. `ROOT=<copie> node audit.mjs` permet d'auditer une copie patchée.

Méthode :
- La gamme de référence est `P.key` et `P.scale`. Pour le dernier refrain modulé (`keyLift`), l'analyse prend le décalage (0, +1 ou +2) qui explique le mieux la fin du morceau.
- L'accord de chaque mesure est relevé sur les notes réellement émises par l'instrument `chords` au premier attaque de la mesure. Sa qualité est reconnue par gabarits.
- La colonne « corrigé » vient de la même analyse, refaite sur une copie du code où seul le correctif n° 1 ci-dessous est appliqué.

## 1. Constat principal : un bug de `voiceLead` transpose les accords

`src/engine/theory.js`, `voiceLead()`, ligne 53 :

```js
for (let base = low - 12; base <= high; base += 12) {
  ...
  let m = base + pc;          // pc = classe de hauteur voulue
```

`base` part de `low - 12`, et `low` n'est pas un multiple de 12. Chaque note devient donc `pc + (low mod 12)` : l'accord entier est transposé de `chordRange[0] % 12` demi-tons. Il garde la bonne couleur, mais pas la bonne fondamentale. Exemple mesuré : house, graine 2, Do mixolydien, accord voulu I7 (Do Mi Sol Si♭). La sortie est La Do♯ Mi Sol (La7, +9).

| Plage d'accords (`chordRange[0]`) | Décalage | Styles concernés |
|---|---|---|
| 55 (Sol) | +7 (quinte) | lofi (moteur 19, chillhop, lofihouse), hiphop, trap, dnb, synthwave, frenchtouch classic/myd (`frenchtouch.js:179`) |
| 52 (Mi) | +4 (tierce majeure) | lofi jazzy, ambient, sad, beatmaker |
| 57 (La) | +9 | house |
| 50 (Ré) | +2 | ambient, cinematic, frenchtouch edbanger |
| 48 ou 60 | 0 | techno, chiptune : seuls styles justes |

Le défaut existe depuis le premier commit (`f266c07`). Il touche tous les moteurs, puisque `voiceLead` est commun.
À +7, l'accord sonne dans la tonalité de la dominante : une seule note sort de la gamme, et le défaut passe donc presque inaperçu. Il reste quand même faux : basse et mélodie sont sur I quand les accords jouent V. À +4, +9 et +2, il s'entend nettement.

### Mesures (200 graines par variante)

| Style | Notes hors gamme (actuel) | Accords hors gamme actuel → corrigé | Basse = fondamentale au 1er temps actuel → corrigé | Mélodie : temps forts sur note de l'accord actuel → corrigé | Frottements de demi-ton mélodie/accord actuel → corrigé |
|---|---|---|---|---|---|
| lofi/jazzy | 33.57 % | 45.75 % → 0 % | 0 % → 48.85 % | 24.44 % → 86.08 % | 47.62 % → 5.82 % |
| lofi/chillhop | 5.64 % | 13.66 % → 0 % | 0 % → 96.92 % | 24.69 % → 100 % | 30.33 % → 6.74 % |
| lofi/lofihouse | 7.78 % | 13.09 % → 0 % | 0 % → 89.46 % | 25.16 % → 99.97 % | 31.16 % → 5.14 % |
| lofi/ambient | 14.67 % | 51.77 % → 0.01 % | 0 % → 75.72 % | 24.89 % → 100 % | 46.19 % → 3.26 % |
| lofi/sad | 31.58 % | 42.76 % → 0 % | 0.76 % → 91.62 % | 25.2 % → 100 % | 59.08 % → 9.37 % |
| lofi/beatmaker | 30.12 % | 45.44 % → 0 % | 1.13 % → 97.12 % | 25.99 % → 96.76 % | 63.36 % → 6.5 % |
| lofi (moteur 19) | 7.65 % | 12.93 % → 0 % | 0 % → 95.43 % | 24.88 % → 99.38 % | 31.33 % → 6.64 % |
| hiphop/boombap | 9.98 % | 16.96 % → 0 % | 0 % → 95.79 % | 23.9 % → 100 % | 33.03 % → 6.22 % |
| hiphop/lofi | 9.25 % | 16.08 % → 0 % | 0 % → 95.75 % | 26.61 % → 99.26 % | 32.06 % → 6.34 % |
| hiphop/trap | 8.76 % | 23.14 % → 0 % | 0 % → 75.91 % | 25.48 % → 100 % | 27.2 % → 5.76 % |
| trap | 7.36 % | 22.78 % → 0 % | 0 % → 73.58 % | 25.48 % → 100 % | 25.92 % → 6.22 % |
| house | 21.14 % | 35.88 % → 0 % | 53.73 % → 93.32 % | 60.38 % → 100 % | 40.52 % → 6.46 % |
| frenchtouch/classic | 11.27 % | 13.08 % → 0 % | 0 % → 66.98 % | 28.57 % → 92.13 % | 33.08 % → 5.68 % |
| frenchtouch/edbanger | 12.39 % | 15.53 % → 0 % | 0 % → 100 % | 10.82 % → 100 % | 6.55 % → 0 % |
| frenchtouch/myd | 12.4 % | 13.66 % → 0 % | 0 % → 67.02 % | 28.86 % → 89.48 % | 0 % → 0 % |
| techno/detroit | 0.33 % | 0 % → 0 % | 78.54 % → 78.54 % | — | — |
| techno/minimal | 0.59 % | 0 % → 0 % | 47.33 % → 47.33 % | — | — |
| techno/industriel | 0.64 % | 0 % → 0 % | 53.11 % → 53.11 % | — | — |
| synthwave/outrun | 2.29 % | 22.31 % → 1.52 % | 7.04 % → 62.31 % | 32.15 % → 92.32 % | 21.6 % → 8.39 % |
| synthwave/dreamwave | 2.26 % | 22.15 % → 1.19 % | 8.62 % → 61.62 % | 32.9 % → 90 % | 20.28 % → 8.12 % |
| dnb/liquid | 8.02 % | 15.48 % → 0 % | 0 % → 77.89 % | 24.99 % → 100 % | 30.73 % → 2.64 % |
| dnb/neuro | 13.44 % | 20.23 % → 0.01 % | 0 % → 60.63 % | — | — |
| dnb/jungle | 8.07 % | 15.45 % → 0 % | 0 % → 77.38 % | 21.88 % → 100 % | 29.91 % → 2.65 % |
| ambient | 7.83 % | 27.29 % → 0 % | 0 % → 75.11 % | 42.13 % → 100 % | 27.01 % → 0.89 % |
| cinematic | 5.4 % | 33.07 % → 0 % | 0 % → 89.21 % | 4.81 % → 100 % | 31.13 % → 5.2 % |
| chiptune | 0.33 % | 0 % → 0 % | 29.79 % → 29.79 % | 47.49 % → 47.49 % | 6.34 % → 6.34 % |

Lecture :
- Aujourd'hui, la basse ne tombe presque jamais sur la fondamentale de l'accord entendu (0 à 8 % ; house 54 % ; techno 47 à 79 %, car non touché).
- Les temps forts de la mélodie ne tombent sur une note de l'accord qu'environ une fois sur quatre, c'est-à-dire au hasard.
- Le code vise pourtant 100 % : `snapDeg` cale les temps forts sur l'accord du degré. La mélodie et la basse sont justes. C'est l'accord qui est faux.
- Avec le correctif :
  - 0 à 1,5 % de notes d'accord hors gamme ;
  - basse sur la fondamentale au premier temps dans 60 à 97 % des mesures ;
  - temps forts de la mélodie sur l'accord : 86 à 100 % ;
  - frottements de demi-ton : 2 à 9 %.

**Styles justes aujourd'hui :** techno (detroit, minimal, industriel) et chiptune.
**Tous les autres** souffrent du décalage. C'est le plus grave pour lofi jazzy, sad et beatmaker (+4), house (+9), cinematic, ambient et Ed Banger (+2).

## 2. Mesures détaillées par style (avec le correctif n° 1)

| Style | Gammes tirées | Swing (min/méd/max) | Qualités d'accord (top 4, corrigé) | Quintes parallèles | Octaves parallèles | Mouvement moyen (demi-tons/voix) | Renversements | Basse hors gamme (corrigé) | Notes étrangères résolues par degré conjoint |
|---|---|---|---|---|---|---|---|---|---|
| lofi/jazzy | major 23.5%, dorian 42.5%, mixolydian 19.5%, minor 14.5% | 0.31 / 0.33 / 0.33 | 5(maj7,13) 12.03%, m(7,9) 8.78%, (9,11) 7.36%, 5(7,b13) 7.09% | 24.57 % | 0 % | 2.23 | 73.76 % | 11.74 % | 29.26 % |
| lofi/chillhop | major 33%, dorian 33%, mixolydian 19.5%, minor 14.5% | 0.19 / 0.231 / 0.27 | m(7) 30.91%, (maj7) 15.66%, (7) 11.65%, maj 9.32% | 17.14 % | 0 % | 1.35 | 73.07 % | 1.96 % | 49.47 % |
| lofi/lofihouse | minor 24.5%, dorian 37.5%, mixolydian 20%, major 18% | 0 / 0.124 / 0.25 | m(7) 29.98%, (maj7) 14.08%, (7) 11.75%, m 8.66% | 20.93 % | 0 % | 1.44 | 68.23 % | 0 % | 49.97 % |
| lofi/ambient | lydian 24.5%, major 37.5%, dorian 20%, minor 18% | 0.1 / 0.151 / 0.199 | (maj7) 23.68%, m(7) 23.3%, maj 9.06%, m 8.32% | 18.31 % | 0 % | 1.32 | 68.96 % | 0 % | 43.18 % |
| lofi/sad | harmonic_minor 13.5%, minor 48.5%, dorian 20%, phrygian 18% | 0.171 / 0.233 / 0.29 | m(7) 31.53%, (maj7) 12.6%, m 10%, m(7,9) 6.81% | 16.07 % | 0 % | 1.38 | 71.25 % | 7.02 % | 49.49 % |
| lofi/beatmaker | dorian 34.5%, minor 37.5%, phrygian 10%, harmonic_minor 18% | 0.32 / 0.33 / 0.33 | m(7) 30.87%, m 10.76%, (maj7) 10.07%, (7) 8.05% | 18.81 % | 0 % | 1.48 | 72.31 % | 3.44 % | 44.58 % |
| lofi (moteur 19) | minor 24.5%, dorian 37.5%, major 20%, mixolydian 18% | 0.19 / 0.276 / 0.33 | m(7) 35.73%, (maj7) 12.92%, (7) 10.45%, m 9.45% | 14.51 % | 0 % | 1.31 | 69.85 % | 6.37 % | 52.86 % |
| hiphop/boombap | dorian 28%, minor 32.5%, mixolydian 9%, major 16.5%, harmonic_minor 14% | 0.17 / 0.216 / 0.25 | m(7) 31.96%, (maj7) 14.46%, (7) 8.99%, m 8.26% | 17.94 % | 0 % | 1.41 | 70.27 % | 3.04 % | 48.31 % |
| hiphop/lofi | dorian 28%, minor 32.5%, mixolydian 9%, major 16.5%, harmonic_minor 14% | 0.23 / 0.282 / 0.33 | m(7) 28.8%, (maj7) 13.65%, m 10.13%, (7) 9.01% | 20.45 % | 0 % | 1.43 | 69.21 % | 3.82 % | 46.01 % |
| hiphop/trap | harmonic_minor 31%, minor 39.5%, phrygian 29.5% | 0 / 0.019 / 0.04 | m(7) 28.28%, (maj7) 11.62%, m 9.01%, dim(ø7) 6.7% | 15.74 % | 0 % | 1.44 | 72.56 % | 0 % | 48.17 % |
| trap | harmonic_minor 36.5%, phrygian 28.5%, minor 35% | 0 / 0.049 / 0.1 | m 48.03%, maj 23.7%, dim 9.36%, m(7) 7.08% | 9.48 % | 0 % | 1.13 | 61.64 % | 0 % | 41.46 % |
| house | dorian 47%, mixolydian 14%, minor 39% | 0 / 0.12 / 0.25 | m(7) 41%, (7) 11.03%, (maj7) 10.52%, m 8.16% | 15.93 % | 0 % | 1.33 | 67.91 % | 2.36 % | 33.41 % |
| frenchtouch/classic | dorian 39%, major 15.5%, minor 22.5%, mixolydian 23% | 0.08 / 0.113 / 0.16 | m(7) 32.07%, 5(maj7,13) 13.14%, (maj7) 13.03%, (7) 12.19% | 14.73 % | 9.66 % | 1.72 | 75.35 % | 5.85 % | 39.38 % |
| frenchtouch/edbanger | minor 54.5%, dorian 22%, phrygian 23.5% | 0 / 0.021 / 0.05 | m 38.15%, maj 22.27%, m(7) 19.06%, dim 6.57% | 19.35 % | 66.46 % | 1.31 | 64.74 % | 0 % | 27.39 % |
| frenchtouch/myd | major 31%, dorian 32%, mixolydian 37% | 0.1 / 0.133 / 0.18 | m(7) 26.89%, (maj7) 16.84%, (7) 15.07%, 5(maj7,13) 11.51% | 13.52 % | 12.52 % | 1.7 | 71.2 % | 12.91 % | 34.06 % |
| techno/detroit | phrygian 42.5%, minor 41.5%, dorian 16% | 0 / 0.036 / 0.25 | m(7) 77.16%, (maj7) 11.09%, dim(ø7) 4.27%, (6) 3.52% | 23.22 % | 0 % | 1.08 | 65.37 % | 1.33 % | — |
| techno/minimal | phrygian 42.5%, minor 41.5%, dorian 16% | 0 / 0.034 / 0.25 | m(7) 75.57%, (maj7) 11.68%, dim(ø7) 4.31%, (6) 3.57% | 23.34 % | 0 % | 1.04 | 64.7 % | 1.57 % | — |
| techno/industriel | phrygian 42.5%, minor 41.5%, dorian 16% | 0 / 0.034 / 0.25 | m 64.89%, maj 14.01%, m(7) 13.15%, dim 3.78% | 26.24 % | 0 % | 1.29 | 57.4 % | 1.51 % | — |
| synthwave/outrun | minor 47%, phrygian 25.5%, harmonic_minor 27.5% | 0 / 0.014 / 0.03 | m(7) 17.58%, (7) 9.7%, m(9) 8.54%, (maj7) 7.8% | 17.17 % | 0.11 % | 2.13 | 65.09 % | 0 % | 21.18 % |
| synthwave/dreamwave | minor 47%, phrygian 25.5%, harmonic_minor 27.5% | 0 / 0.014 / 0.03 | m(7) 12.26%, m(9) 11.1%, (7) 7.62%, sus2(7) 6.83% | 17.5 % | 0.31 % | 2.33 | 65.07 % | 0 % | 18.14 % |
| dnb/liquid | minor 42.5%, phrygian 11.5%, harmonic_minor 12%, dorian 34% | 0 / 0.025 / 0.05 | m(7) 34.79%, (maj7) 11.63%, m 9.18%, (7) 7.86% | 15.8 % | 0 % | 1.36 | 71.47 % | 0 % | 37.77 % |
| dnb/neuro | phrygian 38.5%, harmonic_minor 24%, minor 37.5% | 0 / 0.011 / 0.02 | m 49.07%, maj 21.14%, dim 9.33%, m(7) 8.79% | 9.66 % | 0 % | 1.21 | 62.97 % | 4.54 % | — |
| dnb/jungle | minor 42.5%, phrygian 11.5%, harmonic_minor 12%, dorian 34% | 0.03 / 0.057 / 0.09 | m(7) 33.35%, m 11.54%, (maj7) 11.45%, m(7,9) 7.12% | 17.64 % | 0 % | 1.41 | 71.02 % | 0 % | 38.84 % |
| ambient | dorian 25%, lydian 36%, minor 11%, major 28% | 0 / 0 / 0 | (maj7,9) 30.65%, m(7,9) 21.72%, (7,9) 8.51%, dim(ø7,b9) 6.83% | 52.24 % | 0 % | 2.58 | 57.76 % | 0 % | 23.23 % |
| cinematic | harmonic_minor 22.5%, minor 46.5%, dorian 18%, major 13% | 0 / 0 / 0 | m 43.08%, maj 29.3%, m(7) 9.52%, dim 7.26% | 9.1 % | 0 % | 1.16 | 62.5 % | 0 % | 40.49 % |
| chiptune | minor 30.5%, mixolydian 16%, major 40.5%, dorian 13% | 0 / 0.055 / 0.1 | autre 70.25%, maj 11.59%, m 11.35%, m(7) 2.5% | 4.7 % | 0 % | 1.54 | 64.54 % | 1.61 % | 9.45 % |

Notes sur les métriques :
- **Quintes parallèles** : pourcentage des changements d'accord où deux voix gardent une quinte juste en bougeant du même intervalle. C'est le mouvement « en bloc » des nappes.
- **Chiptune** : l'accord est arpégé (`chiparp`), si bien que la reconnaissance par attaque échoue (« autre » à 70 %). Ses chiffres d'accord et de mélodie ne sont pas significatifs.
- **Lofi jazzy** : `jazzVoice` supprime souvent la quinte (1-3-7-9). Le gabarit lit alors parfois l'accord comme « 5(maj7,13) ». C'est un artefact de reconnaissance, pas une faute.

### Lecture par genre
- **Lofi jazzy.**
  - Enchaînements les plus fréquents : V→I (7>0), I→IV, ii→V (2>7), I→V et ♭VII→I. Le ii-V-I est bien présent.
  - Accords 7, 9, 11 et 13 conformes au genre.
  - La basse jazz sort de la gamme dans 11 % des notes. Ce sont les approches chromatiques voulues (`nextRoot − 1`), acceptables en walking bass.
  - Notes étrangères de la mélodie résolues par degré conjoint : seulement 29 %.
- **Lofi chillhop, lofihouse, ambient, sad et beatmaker ; hiphop.**
  - Après correctif : m7, maj7 et 7 dominants, V→I et IV→V. Sain.
  - Basse hors gamme de 2 à 7 % : approches chromatiques.
- **Trap.**
  - Boucles mineures i→♭VI→i (0>8, 8>0), V→i en harmonique mineur. Triades surtout (m 48 %, M 24 %, dim 9 %). Conforme au genre.
  - Accords augmentés : 1,6 % en trap, 2,6 % en hiphop/trap. C'est le III+ de la gamme harmonique mineure, rarement voulu en trap.
- **House.** m7 (41 %), 7 dominants et maj7. V→I, IV→I et I→IV. Sain après correctif.
- **French Touch.**
  - Classic et Myd : boucles disco à septièmes, saines après correctif.
  - Myd : basse hors gamme à 12,7 %, surtout la sensible ajoutée en mixolydien (+11). Ce sont des approches chromatiques disco, mais elles sont trop fréquentes.
  - Ed Banger : 66 % d'octaves parallèles. Ce sont des accords doublés à l'octave, en bloc. C'est stylistique (Justice), pas une faute.
- **Synthwave.**
  - Après correctif, 1,2 à 1,5 % des notes d'accord sont hors gamme : c'est le IV majeur emprunté en mineur (`RET.majIV`), donc voulu.
  - Revers : la mélodie peut jouer ♭6 contre ce IV majeur. Ses frottements de demi-ton (8 %) sont les plus élevés du corpus.
  - Les sus2, sus4 et add9 sont bien présents.
- **Techno.** m7 à 75 %, i en boucle et peu de mouvement. Juste. Pas de mélodie (le rôle mélodique est tenu par les stabs et l'arpège).
- **Ambient.** maj9 et m9, vocabulaire juste. 52 % de quintes parallèles, inhérentes aux voicings ouverts. Accepté.
- **Cinematic.** Triades m et M, V→i et IV→i. Accords augmentés à 2 % (III+ harmonique).

## 3. Rythme
- **Swing.**
  - Appliqué une seule fois, dans `stepT` (`swing*0.25` temps sur les doubles-croches impaires).
  - Le champ `swing` de `groove.js` (GROOVES) n'est lu nulle part, donc il n'y a pas de double swing via le groove.
  - Valeurs médianes : lofi jazzy 0,33 (le maximum, soit un triolet de doubles-croches) ; chillhop 0,23 ; boombap 0,22 ; house 0,12 ; trap 0,05 ; dnb 0,03 ; synthwave 0,01 ; ambient et cinematic 0.
- **Swing du style `strum`.** Un `swing*0.1` est ajouté à tous les coups, y compris le premier temps : décalage constant de 0 à 0,033 temps (environ 23 ms à 85 BPM). Ce n'est pas un swing, c'est un léger retard global. Le cumul est mineur, mais incohérent.
- **Jazz.** Le swing porte sur les doubles-croches. En lofi jazzy, un ride et un walking « jazz » appellent un swing de croches (ternaire sur les croches). C'est une limite de conception, pas un bug.
- **Humanisation (groove.js).**
  - Décalage fixe par famille : par exemple dilla, caisse claire +20 ms et grosse caisse −6 ms.
  - Plus un jitter gaussien borné à ±2σ (σ de 1,5 à 7 ms, moitié moins pour la grosse caisse).
  - Plus la vélocité ±4 à 5 %.
  - Ces plages sont réalistes.

## 4. Mélodie
- **Gamme.** Les notes de la mélodie sont 100 % dans la gamme après correctif. Aujourd'hui, 0 à 11 % sortent, uniquement à cause de la mesure contre des accords décalés : aucune note de mélodie n'est fausse en soi.
- **Phrases.**
  - Les motifs font 2 mesures (`makeMotif`), avec motif/réponse (A, B et answerA, answerB). La réponse se place en position 4 de chaque groupe de 8 mesures ou en fin de section : c'est bien une structure antécédent/conséquent.
  - Les silences de plus d'1,5 temps découpent cependant beaucoup de fragments d'une mesure (mesuré). Les phrases sont aérées.
  - French Touch utilise des boucles longues (6 à 14 mesures), cohérentes avec le genre.
- **Notes étrangères.** Seuls les temps forts sont calés sur l'accord. Sur les temps faibles, 6 à 28 % de notes étrangères, résolues par degré conjoint vers une note de l'accord dans seulement 18 à 53 % des cas.
- **Grands sauts.** Plus d'une quinte dans 2 à 7 % des notes, mais 32 % en house, 39 à 47 % en synthwave et 44 % en Ed Banger (octaves voulues).

## 5. Basse
- **Fondamentale.** Toujours jouée à partir du degré de l'accord en position fondamentale. Les renversements des accords (58 à 75 % des voicings) ne sont pas suivis par la basse. C'est correct en musique électronique (la basse définit la fondamentale), donc pas une faute.
- **Hors gamme.** Ce sont uniquement les approches chromatiques des styles walking et disco : 0 à 4 % en général, 6 % en French Touch classic, 11 % en lofi jazzy et 13 % en Myd.
- **Sauts d'octave.** Ils sont dans le style (octave, disco, synthwave). Les écarts de plus d'une octave entre deux notes restent sous 5 %, sauf en chiptune (12 %).

## 6. Tonalités, modulation et mix
- **Tonalité.** Tirage uniforme sur 12 toniques. Gammes pondérées par style ; exemple trap : harmonique mineure 37 %, phrygien 29 %, mineur 35 %.
- **Modulation `keyLift`.** +1 ou +2 demi-tons au dernier refrain, sur tout sauf la batterie et les textures. Elle reste jusqu'à la fin, outro comprise. C'est cohérent.
- **Mix.** Enchaînements Camelot corrects : même clé, ±1 (quinte ou quarte), relatif, ou +2 pour l'énergie. Mais à cause du bug n° 1, l'harmonie réellement jouée par les accords n'est pas celle annoncée par l'étiquette Camelot. Le mélange harmonique entre decks ne repose donc que sur la basse et la mélodie.

## 7. Batterie
- **Accord de la grosse caisse.** `kickTune` est un rapport fixe (réglage avancé), jamais calé sur la tonalité. La 808 « basse » est accordée, mais la grosse caisse ne l'est pas.
- **Caisse claire et clap.** Registres fixes. Pas de problème harmonique notable, à part ce manque de tonalité.

## 8. Correctifs proposés, par ordre d'impact

| # | Problème | Correctif | Change les morceaux existants ? |
|---|---|---|---|
| 1 | **Accords transposés de `chordRange[0] % 12`** (bug, tous styles sauf techno et chiptune) | Aligner `base` sur un Do : `Math.floor(low / 12) * 12 - 12` | **Oui**, si on l'applique à tous les moteurs. **Non**, si on le réserve au moteur 21 (paramètre `aligned`, voir patch). |
| 2 | III+ (accord augmenté) issu de l'harmonique mineure (1 à 2,6 % en trap et cinematic) | En harmonique mineure, construire l'accord du III sur le mineur naturel (abaisser la quinte augmentée), moteur ≥ 21 | Non, si réservé au moteur 21 |
| 3 | Mélodie ♭6 contre IV majeur (synthwave) | Dans `snapDeg` ou à la pose, remonter ♭6 en 6 quand l'accord courant est le IV emprunté | Non, si réservé au moteur 21 |
| 4 | Notes étrangères aux temps faibles mal résolues (18 à 53 %) | Si une note longue (≥ croche) est étrangère et à un demi-ton d'une note de l'accord, la caler sur l'accord ; sinon, forcer la note suivante à un degré conjoint | Non, si réservé au moteur 21 |
| 5 | Approches chromatiques de basse trop fréquentes (Myd 13 %, jazzy 11 %) | Les limiter aux dernières doubles-croches et exiger une résolution par demi-ton vers la fondamentale suivante | Non, si réservé au moteur 21 |
| 6 | Nappes en quintes parallèles (15 à 25 % des changements) | Dans `voiceLead`, ajouter un coût de +3 par paire de quintes ou d'octaves parallèles | Non, si réservé au moteur 21 |
| 7 | `strum` : `swing*0.1` sur tous les coups | Supprimer, ou appliquer seulement aux coups hors temps | Non, si réservé au moteur 21 |
| 8 | Grosse caisse non accordée | `kickTune` par défaut = rapport rapprochant la fondamentale du kick de la tonique (ou de la quinte) | Non, si réservé au moteur 21 |
| 9 | Swing jazz en doubles-croches | Option de swing de croches pour lofi jazzy (`stepT` sur les pas 2 et 6 de chaque temps) | Non, si réservé au moteur 21 |

Recommandation : livrer le n° 1 en v1.12.0 avec un moteur 21, et garder le comportement actuel pour les moteurs 19 et 20. C'est ce qui assure la reproductibilité des graines déjà partagées. Le n° 1 est un vrai bug, mais le corriger pour tous les moteurs modifierait le son de chaque morceau existant (sauf techno et chiptune).

### Patch exact proposé pour le n° 1 (non appliqué)

```diff
--- a/src/engine/theory.js
+++ b/src/engine/theory.js
-export function voiceLead(chord, prev, low = 52, high = 76) {
+export function voiceLead(chord, prev, low = 52, high = 76, aligned = false) {
   const pcs = chord.map((m) => ((m % 12) + 12) % 12);
   const candidates = [];
   // génère des renversements dans la plage
+  // moteur ≥ 21 : base alignée sur un Do (avant : base = low - 12 transposait l'accord de low % 12 demi-tons)
+  const base0 = aligned ? Math.floor(low / 12) * 12 - 12 : low - 12;
   for (let inv = 0; inv < pcs.length; inv++) {
-    for (let base = low - 12; base <= high; base += 12) {
+    for (let base = base0; base <= high; base += 12) {
--- a/src/engine/composer.js
+++ b/src/engine/composer.js
-        const voicing = voiceLead(chord, prevVoicing, S.chordRange[0], S.chordRange[1]);
+        const voicing = voiceLead(chord, prevVoicing, S.chordRange[0], S.chordRange[1], P.engine >= 21);
--- a/src/engine/frenchtouch.js
+++ b/src/engine/frenchtouch.js
-      voicing[deg] = EB ? voiceLead(ch, prev, 50, 70) : voiceLead(ch, prev, 55, 77); prev = voicing[deg];
+      voicing[deg] = EB ? voiceLead(ch, prev, 50, 70, P.engine >= 21) : voiceLead(ch, prev, 55, 77, P.engine >= 21); prev = voicing[deg];
```

Le moteur 21 doit aussi être ajouté là où `resolveParams` borne la valeur `engine`. Il faut ensuite un test de non-régression : la graine × style de référence en moteur 20 doit rester identique octet pour octet, et en moteur 21, les accords doivent être 100 % dans la gamme.

## 9. Corrigé en moteur 21 (v1.12.0)

Les nouvelles générations utilisent le **moteur 21** (= moteur 20 + les corrections ci-dessous). Les moteurs 0, 17, 18, 19 et 20
restent **identiques à l'octet près** : 335 cas d'empreinte (événements, rendus PCM, morceaux longs, plans de mix, réglages
avancés) comparés à l'étiquette v1.11.0, 0 différence ; `test/v1120.js` revérifie 9 cas du moteur 20 (événements + audio).

| # | Correctif | Moteur 21 | Où |
|---|---|---|---|
| 1 | `voiceLead` aligné sur un Do (plus de transposition des accords) | ✅ | `theory.js` (`opts.aligned`), `composer.js`, `frenchtouch.js` |
| 2 | Harmonique mineure : accords hors V / vii° construits sur le mineur naturel (plus de III+) | ✅ | `composer.js` (`chSteps`) |
| 3 | Mélodie et arpège suivent l'accord **réellement joué** (IV majeur emprunté de la synthwave compris) | ✅ | `composer.js` (`barPcs`, `chordPcs`) |
| 4 | Note longue d'un temps faible à un demi-ton de l'accord : calée sur l'accord | ✅ | `composer.js` (`placeMelody`), `frenchtouch.js` (lead) |
| 5 | Basse : quinte / tierce prises dans l'accord joué, approche diatonique (disco, Myd, classique), approche de la marche jazz sur le 4ᵉ temps | ✅ partiel | `composer.js`, `frenchtouch.js` |
| 6 | Coût des quintes / octaves parallèles (+3 par paire) dans `voiceLead` | ✅ (sauf ambient et Ed Banger) | `theory.js` (`parallels`) |
| 7 | `strum` : plus de retard `swing×0,1` sur tous les coups | ✅ | `composer.js` |
| 8 | Grosse caisse accordée sur la tonique | ❌ volontairement non appliqué | — |
| 9 | Swing de croches pour la lo-fi jazzy | ✅ | `composer.js` (`SW8`) |

**Non corrigés, volontairement (traits de style)** : les octaves parallèles d'Ed Banger (riff doublé à l'octave, 66 %) et les
quintes parallèles de l'ambient (nappes en quintes, 52 %).

**N° 8 non appliqué** : accorder le kick sur la tonique demande de le monter ou de le descendre jusqu'à ±6 demi-tons ; vers le
haut, le sub perd son assise (house, trap, French Touch), vers le bas, l'attaque se noie sous 40 Hz. Le réglage
« Accord de la grosse caisse » reste disponible à la main.

### Mesures avant / après (200 graines par variante, 90 s, moteur 20 → moteur 21)

| Variante | Accords hors gamme stricte¹ | Accords augmentés | Quintes parallèles² | Octaves parallèles² | Mélodie : temps forts sur une note de l'accord | Frottements de demi-ton mélodie / accord | Basse : fondamentale au 1er temps |
|---|---|---|---|---|---|---|---|
| lofi/jazzy | 45,8 % → **0,0 %** | 0,0 % → 0,0 % | 23,8 % → 15,7 % | 0,0 % → 0,0 % | 24,4 % → 86,4 % | 47,6 % → 0,2 % | 0,0 % → 48,9 % |
| lofi/chillhop | 13,7 % → **0,0 %** | 0,0 % → 0,0 % | 16,7 % → 10,7 % | 0,0 % → 0,0 % | 24,7 % → 100,0 % | 30,3 % → 0,0 % | 0,0 % → 96,9 % |
| lofi/lofihouse | 13,1 % → **0,0 %** | 0,0 % → 0,0 % | 21,6 % → 12,1 % | 0,0 % → 0,0 % | 25,2 % → 100,0 % | 31,2 % → 0,0 % | 0,0 % → 89,5 % |
| lofi/ambient | 51,8 % → **0,0 %** | 0,0 % → 0,0 % | 16,0 % → 8,9 % | 0,0 % → 0,0 % | 24,9 % → 100,0 % | 46,2 % → 0,0 % | 0,0 % → 75,7 % |
| lofi/sad | 42,8 % → **1,3 %** | 0,5 % → 0,0 % | 16,8 % → 9,5 % | 0,0 % → 0,0 % | 25,2 % → 99,8 % | 59,1 % → 0,1 % | 0,8 % → 91,6 % |
| lofi/beatmaker | 45,4 % → **1,7 %** | 0,8 % → 0,0 % | 19,2 % → 9,6 % | 0,0 % → 0,0 % | 26,0 % → 97,2 % | 63,4 % → 0,2 % | 1,1 % → 97,1 % |
| hiphop/boombap | 17,0 % → **1,2 %** | 0,1 % → 0,0 % | 16,6 % → 10,0 % | 0,0 % → 0,0 % | 23,9 % → 99,8 % | 33,0 % → 0,1 % | 0,0 % → 95,8 % |
| hiphop/lofi | 16,1 % → **1,0 %** | 0,1 % → 0,0 % | 18,1 % → 11,4 % | 0,0 % → 0,0 % | 26,6 % → 99,2 % | 32,1 % → 0,1 % | 0,0 % → 95,8 % |
| hiphop/trap | 23,1 % → **3,0 %** | 0,1 % → 0,0 % | 17,0 % → 10,1 % | 0,0 % → 0,0 % | 25,5 % → 99,4 % | 27,2 % → 0,3 % | 0,0 % → 75,9 % |
| trap | 22,8 % → **1,3 %** | 1,4 % → 0,0 % | 9,1 % → 3,0 % | 0,0 % → 0,0 % | 25,5 % → 99,6 % | 25,9 % → 0,1 % | 0,0 % → 73,6 % |
| house | 35,9 % → **0,0 %** | 0,0 % → 0,0 % | 16,5 % → 9,2 % | 0,0 % → 0,0 % | 60,4 % → 100,0 % | 40,5 % → 0,0 % | 53,7 % → 93,3 % |
| frenchtouch/classic | 13,1 % → **0,0 %** | 0,0 % → 0,0 % | 11,2 % → 10,2 % | 9,8 % → 9,7 % | 28,6 % → 92,1 % | 33,1 % → 0,0 % | 0,0 % → 67,0 % |
| frenchtouch/edbanger | 15,5 % → **0,0 %** | 0,0 % → 0,0 % | 19,9 % → 19,4 % | 67,3 % → 66,5 % | 10,8 % → 100,0 % | 6,5 % → 0,0 % | 0,0 % → 100,0 % |
| frenchtouch/myd | 13,7 % → **0,0 %** | 0,0 % → 0,0 % | 12,6 % → 10,5 % | 12,0 % → 12,4 % | 28,9 % → 89,5 % | 0,0 % → 0,0 % | 0,0 % → 67,0 % |
| techno/detroit | 0,0 % → **0,0 %** | 0,0 % → 0,0 % | 23,2 % → 11,0 % | 0,0 % → 0,0 % | 0,0 % → 0,0 % | 0,0 % → 0,0 % | 78,5 % → 78,5 % |
| techno/minimal | 0,0 % → **0,0 %** | 0,0 % → 0,0 % | 23,3 % → 10,1 % | 0,0 % → 0,0 % | 0,0 % → 0,0 % | 0,0 % → 0,0 % | 47,3 % → 47,3 % |
| techno/industriel | 0,0 % → **0,0 %** | 0,0 % → 0,0 % | 26,2 % → 5,6 % | 0,0 % → 0,0 % | 0,0 % → 0,0 % | 0,0 % → 0,0 % | 53,1 % → 53,1 % |
| synthwave/outrun | 22,3 % → **3,6 %** | 0,5 % → 0,0 % | 16,9 % → 11,1 % | 0,1 % → 0,0 % | 32,1 % → 92,0 % | 21,6 % → 1,3 % | 7,0 % → 62,6 % |
| synthwave/dreamwave | 22,1 % → **3,2 %** | 0,6 % → 0,0 % | 17,2 % → 10,9 % | 0,3 % → 0,1 % | 32,9 % → 89,9 % | 20,3 % → 1,5 % | 8,6 % → 62,1 % |
| dnb/liquid | 15,5 % → **0,9 %** | 0,1 % → 0,0 % | 16,2 % → 8,3 % | 0,0 % → 0,0 % | 25,0 % → 99,8 % | 30,7 % → 0,1 % | 0,0 % → 77,9 % |
| dnb/neuro | 20,2 % → **1,2 %** | 0,7 % → 0,0 % | 9,5 % → 3,3 % | 0,0 % → 0,0 % | 0,0 % → 0,0 % | 0,0 % → 0,0 % | 0,0 % → 60,6 % |
| dnb/jungle | 15,4 % → **0,9 %** | 0,1 % → 0,0 % | 18,6 % → 10,6 % | 0,0 % → 0,0 % | 21,9 % → 99,9 % | 29,9 % → 0,1 % | 0,0 % → 77,4 % |
| ambient | 27,3 % → **0,0 %** | 0,0 % → 0,0 % | 51,5 % → 52,2 % | 0,0 % → 0,0 % | 42,1 % → 100,0 % | 27,0 % → 0,0 % | 0,0 % → 75,1 % |
| cinematic | 33,1 % → **0,9 %** | 2,0 % → 0,0 % | 9,1 % → 2,6 % | 0,0 % → 0,0 % | 4,8 % → 99,2 % | 31,1 % → 0,5 % | 0,0 % → 89,2 % |
| chiptune | 0,0 % → **0,0 %** | 0,0 % → 0,0 % | 4,7 % → 1,4 % | 0,0 % → 0,0 % | 47,5 % → 47,3 % | 6,3 % → 0,9 % | 29,8 % → 29,8 % |

¹ Gamme stricte. Les restes (0,8 à 3,6 %) sont des emprunts voulus : ♭7 naturel des accords hors V en harmonique mineure, et
IV majeur emprunté de la synthwave. Avec ces deux emprunts déclarés, `test/v1120.js` mesure **0 note d'accord hors tonalité**
sur 25 variantes × 6 graines (30 747 notes ; 201 540 notes sur 40 graines).
² Pourcentage des changements d'accord. Techno et chiptune : accords courts ou arpégés, mesure peu fiable pour la mélodie.

Restes connus : approches chromatiques de basse (1 à 8,6 % des notes de basse, surtout jazzy et Myd : c'est du vocabulaire), et
les temps forts « hors accord » de la lo-fi jazzy (86 %) viennent des extensions (9ᵉ, 11ᵉ) volontaires.

### Régénérer un ancien morceau

Bouton **« Régénérer en v1.12.0 »** (studio et pages de style) ou `POST /api/tracks/:id/regenerate` : même graine, mêmes
réglages, **nouveau** morceau à côté de l'original (jamais écrasé), titre suffixé « (régénéré en v1.12.0) ».
Moteur 20 → moteur 21. Moteurs 17 à 19 : même moteur (donc même arrangement, même tempo, même tonalité) avec les corrections
harmoniques ci-dessus (`harmonyFix`) ; passer au moteur 21 changerait tout l'arrangement. Style, sous-style ou réglage
inconnu : erreur 400, rien n'est deviné.
