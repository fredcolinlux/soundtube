# Manuel utilisateur — soundtube

Interface en français. Aucune voix chantée : musique instrumentale générée par algorithme.

## 1. Studio (page Générer)

1. Choisir un **style** (lo-fi, house, techno, French Touch, synthwave, drum & bass, hip-hop, ambient…).
2. Régler la **durée**, le **tempo**, la **tonalité** / mode, l’**ambiance**.
3. Optionnel : panneau **Avancé** (énergie, kits, patches, swing, sous-variantes).
4. Lancer la génération. Suivre la file dans **Jobs**.
5. Écouter, télécharger WAV/MP3, ou préparer la vidéo YouTube.

La **visite guidée** (`/?tour=1` ou depuis /demarrer) pose des bulles sur le formulaire.

## 2. Styles

Chaque style a des bornes (BPM, tonalités, instrumentation). Voir `docs/STYLES.md` pour le détail musical.

- **French Touch** : variantes classic / Ed Banger / Myd (`ftStyle`).
- **Lo-fi** : sous-genres jazzy, chillhop, lofi-house, ambient, sad, beatmaker (`lofiStyle`).
- **Moteur** : les nouvelles générations utilisent le moteur courant (voir `/api/options`).

## 3. Pack ZIP

Depuis un job terminé : **Pack ZIP** regroupe audio, MIDI, métadonnées et éventuelle vidéo selon les options (voir `docs/PACK.md`).

Utile pour archiver un mix long (chapitres, stems relatifs) ou livrer un lot cohérent.

## 4. YouTube

Panneau YouTube d’un job :

- vignette / fond animé, titre, description, tags (FR/EN si fournis par le directeur IA) ;
- mastering loudness (LUFS / true-peak) ;
- publication via OAuth (chaînes enregistrées dans Admin) — voir `docs/YOUTUBE.md` et le manuel d’installation § OAuth.

Le transport de test `SOUNDTUBE_YT_TRANSPORT=mock` n’envoie rien à Google.

## 5. Directeur artistique (IA)

Sur Générer → *Directeur artistique* : décrire l’ambiance → **Proposer**.

- Nécessite un PC IA (Ollama) configuré dans Admin, sinon **repli local** par mots-clés.
- Réponse validée et bornée par le serveur (tempo, style, avancés).
- Options : métadonnées FR+EN, plan titre-par-titre pour les mix ≥ 1 h.
- Contexte optionnel (Admin › Contexte) : profil de goût (`contexte/gout.json`) et dernière veille tendances — **coupés par défaut**.

## 6. Admin

| Section | Rôle |
|--------|------|
| Nœuds de rendu | Agents Windows / macOS, santé, répartition CT / nœuds audio |
| PC IA | URL Ollama, modèle, délai |
| YouTube / chaînes | OAuth, playlists |
| Veille tendances | clé API YouTube optionnelle, RSS, intervalle |
| Contexte directeur | goût, veille, aperçu du prompt, test Ollama |
| Réglages | marque, slots locaux, seuils de routage (ex. durée mini audio nœud) |

## 7. Page d’accueil et démarrage

- `/` — studio
- `/demarrer` — schéma système + visite 5 étapes + premiers réglages
- `/admin` — administration
- `/docs` — OpenAPI

## 8. Conseils

- Pour un mix ≥ 1 h : laisser le routage envoyer l’audio vers un nœud dédié si disponible.
- `pcCombo` : combiner rendu CT + nœud selon la charge.
- Ne jamais coller de jetons ou clés dans le chat ou les captures d’écran.
