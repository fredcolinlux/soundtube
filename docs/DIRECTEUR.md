# Directeur artistique — contexte (v1.18.0) et prompt système (v1.21.3)

Le directeur (Ollama ou repli local) propose style, ambiance, avancés, titres/descriptions/tags FR+EN, et un plan titre par titre pour les mix ≥ 1 h (`POST /api/ai/suggest`).

## Interrupteurs (Admin → Contexte du directeur)

Coupés **par défaut** (= prompt identique à v1.14, empreintes de test stables) :

1. **Profil de goût** — profil actif `/var/lib/soundtube/gout.json` (dossier de données : **jamais écrasé par un patch**). Au premier démarrage il est copié depuis `contexte/gout.json` s’il existe (profil personnel, **non publié**), sinon depuis `contexte/gout.example.json` (exemple générique neutre). Créez le vôtre avec `node tools/gout-distill.mjs bibliotheque.csv /var/lib/soundtube/gout.json`.
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

## Carte 07 — « Revenir au profil livré » (v1.21.2)

- Carte vide corrigée (import `apiFetch` manquant dans `admindirector.js`) ; erreurs API affichées dans la carte.
- Le bouton réinstalle `/var/lib/soundtube/gout.shipped.json` (copie figée du profil personnel) ou `contexte/gout.json`, sinon l’**exemple générique** (message « exemple générique installé »).
- Installation autonome (dépôt public) : seul l’exemple générique est livré.
- Profil privé : `gout.json` + `gout.shipped.json` à copier dans `/var/lib/soundtube/` (propriétaire `soundtube`, mode 600), puis `systemctl restart soundtube`.

## Prompt système du directeur (v1.21.3)

Admin → **07 Contexte du directeur artistique** → bloc **Prompt système du directeur artistique**. Réglages stockés dans
`/var/lib/soundtube/director-prompt.json` (dossier de données, mode 600, **jamais** dans `/opt/soundtube/app` : survit à
`update.sh`). API locale uniquement, session admin + jeton CSRF : `GET/PUT /api/admin/director/prompt`.

| Source du prompt | Message système envoyé à Ollama | Température |
|---|---|---|
| **Prompt intégré de soundtube** (défaut) | Prompt de soundtube, inchangé | réglage Admin |
| **Prompt personnalisé (Admin)** | Ton texte (≤ 20 000 caractères) **+ contrat JSON + catalogue** des styles/réglages, ajoutés par le code | réglage Admin |
| **Prompt du Modelfile** | **Aucun** : Ollama applique le `SYSTEM` du Modelfile du modèle choisi dans Admin › PC IA. Le contrat JSON + catalogue passent en tête du message utilisateur | **jamais imposée** (celle du Modelfile) |

- **Contrat JSON + catalogue** : toujours ajoutés (identifiants de styles, ambiances, gammes, réglages avancés). La réponse
  reste validée strictement ; une clé inconnue est ignorée.
- **Température** : défaut **0.7** (comportement historique) ; champ vide = défaut du modèle.
- **Contexte `num_ctx`** : défaut **8192** ; vide = défaut du modèle. Avec un long prompt (~10 000 caractères ≈ 3 000 jetons,
  plus le catalogue ≈ 1 500 jetons), passe à **16384** : l’Admin l’indique quand le prompt dépasse ~2 000 jetons.
- **Restaurer le prompt intégré** : efface le texte personnalisé et repasse en mode intégré (température / num_ctx inchangés).
- Le modèle n’est jamais codé en dur : c’est celui d’Admin › PC IA. « Tester avec Ollama » et Créer → « Décris l’ambiance »
  utilisent le même mode.
- Le champ « Tester le directeur » (1 200 caractères) reste une description d’ambiance de test, pas le prompt système.

Créer un modèle avec son propre SYSTEM (mode Modelfile) :

```
FROM <modèle de base>
SYSTEM """…ton prompt de directeur artistique…"""
PARAMETER num_ctx 16384
```
`ollama create <nom> -f Modelfile`, puis choisir `<nom>` dans Admin › PC IA.
