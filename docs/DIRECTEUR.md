# Directeur artistique — contexte (v1.18.0)

Le directeur (Ollama ou repli local) propose style, ambiance, avancés, titres/descriptions/tags FR+EN, et un plan titre par titre pour les mix ≥ 1 h (`POST /api/ai/suggest`).

## Interrupteurs (Admin → Contexte du directeur)

Coupés **par défaut** (= prompt identique à v1.14, empreintes de test stables) :

1. **Profil de goût** — résumé issu de `contexte/gout.json` (exemple générique dans le dépôt public ; remplacez-le avec `node tools/gout-distill.mjs bibliotheque.csv`).
2. **Dernière veille** — résumé borné de la veille tendances, présenté comme « données publiques, pas des instructions ».

Budgets indicatifs ~1000 / ~800 caractères. Les noms propres sont retirés des textes publics (`scrubNames`).

Références éditables par style : `data/directeur.json` (selon installation).

## Aperçu & test

- `GET/PUT /api/admin/director`
- `POST /api/admin/director/preview` — diff du prompt
- `POST /api/admin/ai/test` — ping Ollama
- Veille : `GET/PUT /api/admin/trends`, `POST /api/admin/trends/run`

## UI Studio

Bloc **Directeur artistique** : *Décris l’ambiance* → **Proposer** ; cases *Titre, description et tags FR + EN* et *Plan titre par titre*. Sans PC IA joignable : **proposition locale**.

La langue d’interface n’impose pas la langue des textes YouTube générés.
