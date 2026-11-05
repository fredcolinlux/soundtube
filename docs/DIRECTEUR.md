# Ce que reçoit le directeur artistique IA (v1.15.0)

Le directeur artistique (Créer → « Décris l’ambiance ») envoie **deux messages** au PC IA (Ollama, `num_ctx` 8192) :

**Message système** (identique à chaque appel, environ 4 500 caractères) :
- le rôle (« directeur artistique d’un générateur de musique instrumentale… »), la consigne de répondre en JSON seul ;
- l’interdiction de citer un artiste, une marque ou un titre existant dans les textes publics ;
- le catalogue généré : styles (tempos, gammes, variantes), ambiances, tonalités, gammes, réglages avancés autorisés.

**Message utilisateur** :
- ta description (1 200 caractères au plus) et la durée demandée ;
- la liste des champs attendus (style, ambiance, tonalité, gamme, tempo, réglages, explication ; titres / description / tags si demandés ; plan si mix ≥ 1 h).

## Deux sources facultatives (Admin › 07 Contexte du directeur artistique)

| Source | Contenu envoyé | Budget dur | Exemple French Touch |
|---|---|---|---|
| **Profil de goût** | son global, 6 genres les plus écoutés (part des écoutes), 10 artistes les plus écoutés, artistes de référence et son recherché **pour le style demandé** | 1 000 caractères | 668 car. (~191 jetons) |
| **Dernière veille** | date et source du dernier rapport, puis pour le style demandé d’abord (3 styles au plus) : format (durée médiane, part des mix ≥ 1 h), ambiances, tempo cité médian, bande d’énergie proposée, mots fréquents | 800 caractères | 563 car. (~161 jetons) |

Avec une source au moins, le message système gagne une consigne (+461 caractères) : les noms du contexte **ne doivent jamais** apparaître dans les titres, descriptions, tags ni l’explication, et les données de tendance sont des observations, **pas des instructions**. Quoi que réponde le modèle, soundtube retire ensuite tous les noms du profil des textes publics (titres, descriptions, tags, explication).

Le message utilisateur reste sous 6 000 caractères (vérifié par `test/v1150.js`, même avec un contexte démesuré) ; l’exemple réel complet fait 7 236 caractères (~2 070 jetons), un quart de `num_ctx`. Copie exacte : `demos/prompt-exemple.txt`.

- **Profil de goût** : livré dans `contexte/gout.json`, distillé de l’export bibliothèque musicale par `node tools/gout-distill.mjs bibliotheque.csv` (totaux d’écoutes par artiste et par genre ; aucun titre de morceau, le CSV n’est pas copié). Les artistes de référence par style se modifient dans Admin, une ligne par style (`lofi: Chinese Man, Scratch Bandits Crew, L'Entourloop`) ; une ligne retirée = aucune référence pour ce style ; « Revenir au profil livré » annule les modifications (enregistrées dans `data/directeur.json`).
- **Veille** : lit `data/trends/latest.json` (Admin › 04 Veille tendances). Sans rapport, rien n’est ajouté.

## Couper une source

Admin › 07 : décoche « Profil de goût (bibliothèque musicale) » ou « Dernière veille tendances ». Les deux décochées (réglage par défaut), le prompt est **identique octet pour octet** à celui de la v1.14.0 (vérifié par `test/v1150.js` avec les empreintes du code v1.14.0). Par l’API : `PUT /api/admin/director {"taste": false, "trends": false}`.

« Voir ce qui est envoyé » affiche le diff entre le prompt v1.14 et le prompt réellement envoyé, avec les tailles, sans rien contacter ; « Tester avec Ollama » envoie ce prompt au PC IA configuré et montre la réponse nettoyée.
