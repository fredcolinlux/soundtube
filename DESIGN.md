# soundtube — brief visuel v1.7.1 « nuit boréale »

Remplace le brief v1.7 (« régie de mastering », graphite + vermillon), jugé trop générique (« ça fait IA »).
Retour à l'idée de la toute première interface (v1.1 → v1.6) : un ciel de nuit bleu-violet, une aurore qui
bouge avec la musique, un grand titre, des cartes de style en couleur. On garde tout le fonctionnel de la v1.7.

## Scène
Quelqu'un compose le soir, casque sur les oreilles, et prépare des morceaux pour sa chaîne YouTube.
La page doit ressembler à de la musique qui tourne, pas à un tableau de bord.

## Couleurs
- Fond : dégradé vertical `#080b19 → #0d1230 → #080b19`, panneaux translucides `rgb(13 18 40 / .74)` + flou.
- Texte : `#eef0ff` / `#bcc3e6` / `#9ea7d2` (≥ 5,3:1 sur tous les fonds, cartes teintées comprises).
- Action : menthe `#5ef2c9` (encre `#04201a`). Iris `#a99dff` et ciel `#6cc6ff` vivent seulement dans l'aurore.
- Une couleur par style (lo-fi `#f3c97a`, ambient `#7fd0ff`, synthwave `#c792ff`, house `#5ef2c9`, techno `#a9b4d8`,
  cinématique `#e8dcb0`, chiptune `#b6f36a`, trap `#ff8fc7`, hip-hop `#ffb36b`, DnB `#6be3ff`). Elle colore la carte,
  le nom, le motif, la forme d'onde du morceau, le bouton lecture, l'oscilloscope et un rideau de l'aurore pendant l'écoute.

## Typo
- Familjen Grotesk (SIL OFL, variable 400–700) partout : grotesque suédoise aux terminaisons coupées, lisible en petit,
  caractère net en grand. Titre 2,6–4,9 rem, graisse 700, approche −0,045 em.
- JetBrains Mono seulement pour les accords, graines dans les détails et motifs de batterie.
- Space Grotesk reste réservée aux miniatures/vidéos YouTube générées côté serveur.

## Ce qu'on s'interdit (tics « IA »)
Pas de surtitre en capitales espacées, pas de numéros 01/02/03, pas de texte en dégradé, pas de halo lumineux,
pas de liseré coloré sur un bord, pas de bandeau de chiffres, pas d'encadré « 3 étapes », pas d'emoji, pas de phrases creuses.

## Éléments propres à soundtube
- Héros : « La musique s'écrit toute seule. » en couleur pleine, « toute seule. » en menthe ; un paragraphe qui dit
  concrètement ce que fait le moteur (accords, mélodie, batterie, instruments, −14 LUFS, graine reproductible).
- Carte « Dernier morceau » : un vrai morceau de la bibliothèque (ou celui en cours) avec style, durée, BPM, tonalité,
  graine, les 4 premiers accords du couplet, sa forme d'onde et l'oscilloscope en direct dans la couleur du style.
- Cartes de style : nom dans la couleur du style + vrai motif de batterie d'une mesure (16 pas, repris de
  `src/engine/styles.js` : grosse caisse haute, caisse claire moyenne, charley basse). Sur la carte choisie, le motif
  défile au tempo moyen du style.
- Aurore (`public/js/aurora.js`) : trois rideaux lents dans le haut de l'écran, presque éteints au repos (~20 i/s) ;
  en lecture, chaque rideau suit une bande (graves / médiums / aigus) et le rideau central prend la couleur du style.

## Mouvement
Courbes et durées de la v1.7 (Emil Kowalski) conservées : ease-out 150–300 ms, tiroir 400 ms, pression 0,97,
transform/opacity seulement. « Réduire les animations » : aurore figée sur une image, motifs immobiles, tiroir en fondu.

## Contrôle
`npx impeccable detect public/` et sur l'URL : 0 constat. Contrastes vérifiés ≥ 4,5:1.
