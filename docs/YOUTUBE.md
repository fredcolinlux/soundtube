# Publication YouTube et ZIP complet (v1.13.0)

soundtube peut envoyer ses vidéos sur une ou plusieurs chaînes YouTube : une chaîne par style, à la main ou
automatiquement. Il n'y a **pas de connexion Google depuis le navigateur** : soundtube tourne sur un réseau local, il n'a
donc pas d'adresse de retour OAuth publique. On obtient une fois, sur un PC, un **jeton d'actualisation**, puis on le colle
dans Admin.

## 1. Créer les identifiants Google (une fois)

1. Ouvre <https://console.cloud.google.com/>, crée un projet (par ex. « soundtube »).
2. **API et services › Bibliothèque** : active **YouTube Data API v3**.
3. **Écran de consentement OAuth** : type « Externe », ajoute ton adresse Google comme **utilisateur test**.
   En mode test, Google expire les jetons d'actualisation au bout de **7 jours**. Pour un jeton durable, publie
   l'application (la validation Google n'est pas nécessaire pour ton propre compte, mais un avertissement s'affiche à la connexion).
4. **Identifiants › Créer des identifiants › ID client OAuth**, type **Application de bureau**. Note le
   **client ID** (`….apps.googleusercontent.com`) et le **client secret** (`GOCSPX-…`).

## 2. Obtenir le jeton d'actualisation

### Méthode A : OAuth Playground (le plus simple)

1. Ouvre <https://developers.google.com/oauthplayground>, clique sur la roue dentée ⚙, coche **Use your own OAuth credentials**,
   puis colle ton client ID et ton client secret.
   (Pour cette méthode, l'ID client doit être de type « Application Web », avec
   `https://developers.google.com/oauthplayground` en URI de redirection autorisée.)
2. À gauche, saisis les portées
   `https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube`
   (la seconde sert à la miniature et à la playlist), puis clique sur **Authorize APIs** et connecte-toi avec le compte
   **propriétaire de la chaîne**. Si ce compte gère plusieurs chaînes, choisis la bonne à ce moment-là.
3. Clique sur **Exchange authorization code for tokens** et copie le **Refresh token** (`1//0…`).

### Méthode B : en ligne de commande (ID client « Application de bureau »)

```bash
CID=xxx.apps.googleusercontent.com
# 1) ouvre cette adresse dans le navigateur, connecte-toi, puis copie le paramètre code= de l'adresse finale
echo "https://accounts.google.com/o/oauth2/v2/auth?client_id=$CID&redirect_uri=http://127.0.0.1&response_type=code&access_type=offline&prompt=consent&scope=https://www.googleapis.com/auth/youtube.upload%20https://www.googleapis.com/auth/youtube"
# 2) échange le code contre le jeton d'actualisation
curl -s https://oauth2.googleapis.com/token -d client_id=$CID -d client_secret=GOCSPX-… \
  -d code=LE_CODE -d redirect_uri=http://127.0.0.1 -d grant_type=authorization_code
```

La réponse contient `"refresh_token": "1//0…"`. Le navigateur affiche « impossible de se connecter à 127.0.0.1 » : c'est
normal, le code est dans la barre d'adresse.

## 3. Déclarer la chaîne dans soundtube

Va dans **Admin › 05 Chaînes YouTube**.

- Renseigne le nom (libre), l'ID de chaîne `UC…` (facultatif, pour t'y retrouver), le client ID, le client secret et le jeton
  d'actualisation. Clique sur **Ajouter la chaîne**.
- Tu peux déclarer **plusieurs chaînes**. La première devient la **chaîne par défaut**. Le bouton « Par défaut » permet d'en
  choisir une autre.
- **Chaîne de chaque style** : un style est lié à une chaîne au plus, et une chaîne peut servir plusieurs styles. Un style sans
  liaison publie sur la chaîne par défaut.
- Pour **modifier** une chaîne, clique sur « Modifier ». Un champ secret laissé vide garde la valeur enregistrée.
  « Effacer le jeton » bloque toute publication sur cette chaîne.

L'API ne renvoie jamais les secrets : elle donne seulement `hasClientSecret` / `hasRefreshToken` et un masque du client ID
(`1234….com`).

## 4. Profil de publication par style

Sur la page de chaque style (**Styles › <style> › 05 Publication YouTube**) :

| Champ | Effet |
|---|---|
| Chaîne de ce style | liaison style → chaîne (vide = chaîne par défaut) |
| Titre, Description | gabarits. Variables : `{titre}` `{titre_en}` `{style}` `{bpm}` `{tonalite}` `{duree}` `{chaine}` `{description}` (la description automatique, avec chapitres, tempo et tonalité) `{titre_youtube}` |
| Tags ajoutés | ajoutés en tête ; « Tags automatiques » ajoute ceux de soundtube (le total reste ≤ 500 caractères) |
| Miniature soundtube | envoie la miniature générée (YouTube ne l'accepte que sur une chaîne validée par téléphone) |
| Visibilité | Privée (défaut), Non répertoriée, Publique |
| Playlist | ID `PL…` (facultatif) |
| Programmation | tout de suite / délai après la génération (heures) / à une date. Une vidéo programmée est envoyée **privée** avec `publishAt` : YouTube la rend publique à l'heure dite |
| Auto-publication | **désactivée par défaut**. Une fois activée, chaque nouvelle génération terminée de ce style est mise en file |

Le **formulaire « Publier sur YouTube »** du panneau YouTube d'un morceau (studio) reprend ce profil et la chaîne du style. Tu
peux tout modifier avant l'envoi, y compris choisir une autre chaîne.

## 5. File de publication

Chaque envoi passe par les états : **En attente → Vidéo en préparation** (rendu si la vidéo n'existe pas encore, avec les nœuds
de rendu habituels) **→ Envoi en cours → Publiée** (lien `https://youtu.be/…`), ou **Erreur** (message, bouton « Relancer »).
Tant qu'il n'a pas commencé, un envoi peut être annulé. La file est visible dans Admin (tous styles), sur la page de chaque style et dans le
panneau YouTube du morceau. Elle est enregistrée dans `<données>/publish-queue.json`, sans aucun secret, et reprend après un
redémarrage.

## 6. Règles de sécurité appliquées

- **Rien n'est publié sans confirmation explicite** : l'envoi manuel exige de taper `PUBLIER` (sinon 428). Activer
  l'auto-publication d'un style exige aussi `PUBLIER`. L'auto-publication ne touche que les styles où elle est cochée.
- **Chaîne complète obligatoire** : sans client ID, client secret ou jeton, le bouton affiche « Publication impossible : jeton
  YouTube manquant » ou « aucune chaîne configurée », et la raison exacte est indiquée (API : `ready: false`, `reason`, POST → 412).
  Un jeton refusé par Google donne l'erreur « Jeton refusé par Google (…) : régénère le jeton d'actualisation dans Admin. »
- **Secrets** : ils sont stockés dans `<données>/youtube-channels.json` en **0600**, ne sont jamais renvoyés par l'API et ne sont
  jamais écrits dans les journaux. Tout message d'erreur est filtré (les secrets connus sont remplacés par `•••`).
- **Une seule publication par morceau et par chaîne** (409 ensuite, sauf `again: true` dans l'API).
- **Tests sans envoi réel** : `SOUNDTUBE_YT_TRANSPORT=mock` remplace l'envoi par une simulation qui ne fait aucune requête réseau.
  Elle consigne chaque envoi, sans secret, dans `<données>/youtube-mock.jsonl`. `test/v1130.js` n'utilise que ce mode et un
  `fetch` factice. Sans cette variable, le transport est réel (API YouTube Data v3 : jeton d'accès à partir du jeton
  d'actualisation, envoi « resumable », miniature, playlist).
- **Conformité** : musique originale, aucun échantillon protégé. Ni BPM ni tonalité sur l'image (vidéo, miniature). Ils figurent
  seulement dans le texte de la description. Catégorie Musique, « conçue pour les enfants » : non.

## 7. ZIP complet (vidéo + mix + morceaux en vidéo / MP3 / WAV / TXT + MIDI + samples)

Depuis la v1.14.0, tout est dans **[docs/PACK.md](PACK.md)** : l'arborescence exacte, le manifeste, le TXT par morceau, la
vidéo par morceau (file vidéo, 720p par défaut), les samples (stems) et le paquet coché avant la génération. On y trouve aussi
l'animation de la vidéo choisie dans le formulaire.

## Limites

- Pas de connexion OAuth dans le navigateur (soundtube est local) : le jeton se colle à la main et expire au bout de 7 jours si
  l'application Google reste en mode test.
- Quota par défaut de l'API YouTube : 10 000 unités par jour, soit environ 6 envois (1 600 unités chacun).
- La miniature personnalisée demande une chaîne validée. Sinon, l'envoi réussit avec un avertissement « miniature refusée ».
- Pas de reprise d'un envoi interrompu au milieu : la vidéo repart du début avec « Relancer ».
- L'envoi réel n'a été essayé qu'avec un `fetch` factice et le mode simulation : aucun envoi n'a été fait vers YouTube depuis
  l'environnement de développement.
- Le ZIP d'un très long mix pèse environ la taille du WAV + MP3 + vidéo, et la découpe écrit les morceaux sur le disque.
