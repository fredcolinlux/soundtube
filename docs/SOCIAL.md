# Réseaux sociaux (Facebook Page + X) — v1.21.0

Publication manuelle depuis la bibliothèque (panneau YouTube › **Publier sur Facebook / X**), avec brouillon prérempli (FR/EN, textes IA si présents, lien YouTube si déjà publié). Confirmation obligatoire : taper **PUBLISH** ou **PUBLIER**.

## Admin (LAN uniquement)

Section **Réseaux sociaux** :

- **Facebook Page** : Page ID + page access token (Graph API).
- **X / Twitter** : OAuth 1.0a (API key/secret + access token/secret) ou Bearer OAuth 2.
- Jetons **chiffrés** sur disque (`data/social.json`, mode `0600`), **jamais** renvoyés à l’UI (seulement masque / « présent »).
- **Auto-publication par style** : défaut **off**. Pour activer FB ou X sur un style, confirmer avec `PUBLISH` / `PUBLIER`. À la fin d’une génération, soundtube poste alors automatiquement (transport mock ou live).

## API

| Méthode | Chemin | Rôle |
|---|---|---|
| `GET` | `/api/admin/social` | Vue Admin (sans secrets) |
| `PUT` | `/api/admin/social` | Enregistrer credentials / autoPublish |
| `GET` | `/api/tracks/:id/social` | Brouillons + historique du morceau |
| `POST` | `/api/tracks/:id/social` | Publier (`network`, `lang`, `text`, `link`, `useCover`, `confirm`) |

## Tests / mock

```bash
SOUNDTUBE_SOCIAL_TRANSPORT=mock node test/v1210.js
```

Aucun appel réseau réel en `mock` : les envois sont journalisés dans `data/social-mock.jsonl`.
