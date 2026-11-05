# soundtube

Plateforme auto-hébergée de **musique instrumentale algorithmique** (sans voix).
Chaque morceau est composé (théorie musicale : gammes, progressions d’accords, mélodies
de Markov, basse, batterie, intro / couplet / refrain / pont / outro) puis **synthétisé en temps réel**.

| | |
|---|---|
| **Version** | **1.18.0** |
| **Langues d’interface** | Français et anglais (sélecteur **FR \| EN** dans la barre du haut) |
| **Licence** | Voir `LICENSE` (tous droits réservés) |
| **Moteur par défaut** | 21 (harmonie juste) ; empreinte `696de0f4125a` |

**English:** [README.md](README.md) · [docs/en/USER-MANUAL.md](docs/en/USER-MANUAL.md) · [docs/en/INSTALL-MANUAL.md](docs/en/INSTALL-MANUAL.md) · [docs/en/OPERATIONS.md](docs/en/OPERATIONS.md)

**Manuels français :** [docs/MANUEL-UTILISATEUR.md](docs/MANUEL-UTILISATEUR.md) · [docs/MANUEL-INSTALLATION.md](docs/MANUEL-INSTALLATION.md) · [docs/EXPLOITATION.md](docs/EXPLOITATION.md)

**Index :** [docs/README.md](docs/README.md) · [QUICKSTART.fr.md](QUICKSTART.fr.md) · [CHANGELOG.md](CHANGELOG.md)

## Démarrage rapide (Debian 13 LXC / machine dédiée)

Le serveur central (**CT**) est prévu pour tourner **en root** (LXC Proxmox typique).
N’appelez **pas** `sudo` si vous êtes déjà root :

```bash
tar -xzf soundtube-1.18.0-standalone.tar.gz
cd soundtube-1.18.0
./install.sh --port 8080
# équivalent : ./deploy/install.sh --port 8080
```

Ouvrez `http://<hôte>:8080/`. Changez la langue avec **FR | EN**
(`localStorage` + cookie `soundtube_ui_lang` ; défaut `Accept-Language` ; repli français).
La langue d’interface est **indépendante** de la langue des titres / descriptions / tags YouTube.

Agents de rendu dans `dist/` :

- `dist/soundtube-node-agent-1.18.0-windows.zip`
- `dist/soundtube-node-agent-1.18.0-macos.zip`

## Fonctions

- **11 styles** instrumentaux (Lo-fi, Ambient, Synthwave, Deep House, French Touch, Techno, Cinématique, Chiptune, Trap, Hip-Hop, Drum & Bass)
- Moteur génératif (WAV / MP3 / MIDI + ZIP MIDI par instrument)
- Mix DJ longs (15 min–4 h), découpage, vidéo YouTube (720p / 1080p / 4K)
- Pack ZIP complet (vidéo, mix, stems, MIDI, manifeste)
- Directeur artistique optionnel (Ollama) + veille tendances + contexte de goût
- Nœuds de rendu (Windows NVENC, macOS VideoToolbox, secours CT)
- Admin : nœuds, répartition, PC IA, chaînes YouTube, animations, contexte directeur
- i18n léger (fichiers JSON, sans framework lourd)


## Banque d'échantillons

Le dépôt public inclut `assets/samples/` (FLAC, ~120 Mo, CC0 + Salamander **CC BY 3.0**).  
Détail et attributions : [SAMPLES-LICENSES.md](SAMPLES-LICENSES.md).  
**Non inclus** : `jrhodes/` (jRhodes3d, CC BY-NC 4.0) — repli sur synthèse Rhodes.  
`./install.sh` copie la banque dans `/opt/soundtube/app/assets/samples` ; `GET /api/health` → `samples: true`.

## i18n (v1.18.0)

| Élément | Chemin / API |
|---|---|
| Locales | `public/i18n/fr.json`, `public/i18n/en.json` (mêmes clés) |
| Client | `public/js/i18n.js` |
| API | `GET` / `PUT` `/api/ui/lang` |
| Langue contenus YouTube | `GET` / `PUT` `/api/youtube/lang` — **inchangée**, séparée de l’UI |

## Tests

```bash
npm test          # inclut test/v1180.js (i18n + empreinte moteur)
```

## Suite

Styles · Théorie · Nœuds · YouTube · Pack · Directeur · API — voir [docs/README.md](docs/README.md).  
OpenAPI interactif : `/docs` (`/api/openapi.json`).
