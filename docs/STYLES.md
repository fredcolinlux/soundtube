# soundtube — les styles (moteur 20, v1.11.0)

Ce document décrit, style par style, ce que soundtube joue **par défaut** : tempo, groove, batterie, harmonie,
arrangement, instruments et mixage. Toutes les valeurs sont des *points de départ* : la graine tire au sort
dans ces réservoirs (même graine = même morceau). Depuis la v1.9.0, *Avancé* est **pré-rempli avec les valeurs
réelles** que le style va utiliser pour la graine affichée (« aléatoire (prochaine : N) ») : ce qui est affiché est
exactement ce qui sera joué. Une valeur changée passe en vert, est mémorisée pour ce style (↺ par champ,
« Réinitialiser ce style ») ; seules les valeurs changées sont envoyées.

Tout est synthétisé en JavaScript (ou joué avec les banques d'échantillons libres CC0 / CC-BY déjà fournies :
pianos, cordes, Rhodes, batteries acoustiques). Les noms de modèles (TR-606, DX7, Minimoog…) désignent le
**caractère visé** : aucun échantillon d'appareil ni d'enregistrement protégé n'est utilisé.

## Moteur 1.8 et compatibilité

* Les nouvelles générations (interface et `POST /api/generate` sans `engine`) utilisent le moteur **1.8** :
  réservoirs de sons enrichis, nouvelles boîtes à rythmes, quelques tempos / mixages revus (ci-dessous).
* Les réglages d'un morceau existant (« Réutiliser », « Variation », JSON copié) portent `engine: 17` :
  ils recalculent **exactement** le même morceau qu'avant. `engine: 17` peut aussi être envoyé à l'API.
* La French Touch n'existe qu'en moteur 1.8 et plus.

## Moteur 1.9 (v1.9.0)

* Les nouvelles générations utilisent le moteur **19** ; les morceaux 1.8 (`engine: 18`) et plus anciens
  sont recalculés à l'identique (empreintes de test inchangées).
* **French Touch refaite** (composition dédiée, trois variantes ci-dessous) — en 4/4 ; autres mesures : moteur 1.8.
* **Retouches légères** de quatre styles (moteur 19 seulement) : deep house, boom-bap, neurofunk, synthwave.
* Toutes les références d'artistes désignent des **techniques** de production (filtre, pompe, saturation, découpe,
  choix de sons) ; aucune mélodie, grille ou échantillon d'un morceau existant n'est reproduit.

## Moteur 20 (v1.11.0) — refonte lo-fi

* Les nouvelles générations utilisent le moteur **20** ; les morceaux `engine: 19` et plus anciens sont recalculés
  **à l'identique** (événements et audio, empreintes de test inchangées). Hors lo-fi, le moteur 20 compose
  exactement comme le 19.
* **Lo-fi refait** : six sous-genres, textures réglables (vinyle, bande, poussière, chaleur), arrangement
  qui respire (scènes, coupures, breaks, fills, entrées et sorties d'instruments), quatre nouveaux fonds sonores.
* Les références (Chinese Man, Scratch Bandits Crew, L'Entourloop, Bonobo, DJ Koze) désignent des **techniques** :
  boom-bap poussiéreux, swing appuyé, stabs de cuivres, scratchs. Les scratchs et les cuivres sont **synthétisés**
  (aucun échantillon, aucune voix) ; aucune mélodie ou grille existante n'est reproduite.

## Boîtes à rythmes et synthés (synthèse JS)

| Nom dans l'interface | Ce qui est modélisé |
|---|---|
| TR-808 / TR-909 | kick sinus à enveloppe de hauteur, caisse/claps bruités, charleston métallique (6 carrés) — inchangés |
| **TR-606** | kick court et sec, caisse claire fine, charleston très aigu « tss », toms filtrés : techno minimale, acid |
| **TR-707** | frappes « PCM 6 bits » imitées (résolution et fréquence réduites, repliement) ; kick punchy, clap large, cowbell, tambourin : house de Chicago, synthwave |
| **DR-110** | petite boîte analogique bon marché : kick « toc » mat, caisse tout en bruit, charleston « tic », clap filtré ; lo-fi / dream-pop |
| **DX7 e-piano / basse / cloches** | FM (piles d'opérateurs utiles), index de modulation qui décroît, attaque « tine », stéréo léger |
| **Minimoog basse / lead** | 3 oscillateurs désaccordés, filtre en échelle 4 pôles saturé, glide |
| **Juno polysynth** | scie + pulse modulée (PWM) + sub-oscillateur, filtre 24 dB, chorus stéréo |
| **ARP lead** | deux oscillateurs dont un synchronisé (balayage de sync), filtre 12 dB résonant, glide |
| **Talkbox / vocodeur** | buzz riche passé dans des formants « voyelles » (talkbox) ou banc de 10 bandes (vocodeur) |
| TB-303 (« acid 303 ») | saw/carré, filtre résonant à accent et slide — inchangé |

Chaque style tire ses sons dans ces réservoirs (voir tableaux) ; les mix d'une heure et plus font tourner les
boîtes et les sons d'un titre à l'autre (contraste), dans la liste du style.

---

## Lo-fi Hip-Hop
* **Tempo** 70-88 BPM ; **groove** swing 14-30 % (shuffle « paresseux »), micro-retards de la caisse.
* **Batterie** kit lo-fi (défaut), hip-hop lo-fi acoustique, **DR-110**.
* **Harmonie** dorien / mineur / majeur, 7e et 9e, progressions ii–V, IV–iii–ii–V, IV–III–II–V, II–V–I–IV.
* **Instruments** Rhodes, pianos, **DX7 e-piano**, guitare ; contrebasse / basse ronde ; vibraphone, flûte.
* **Mix** bande 0,65, saturation, filtre lo-fi, sidechain léger (0,12), craquements vinyle.

Moteur 20 (v1.11.0) : un **sous-genre** est tiré par la graine (ou choisi dans *Avancé → Sous-genre lo-fi*,
ou sur la page du style) :

| Sous-genre | Tempo | Caractère |
|---|---|---|
| Jazzy | 72-86 | Rhodes, accords étendus (9e, 11e, 13e, voicings sans fondamentale), batterie swinguée à la ride, contrebasse |
| Chillhop | 80-92 | groove plus net, guitare / piano, basse ronde, swing modéré |
| Lo-fi house | 112-122 | 4/4 au kick, charleston ouvert, accords filtrés (passe-bas qui s'ouvre et se referme) |
| Ambient lo-fi | 60-75 | nappes, peu ou pas de batterie (environ deux morceaux sur cinq sans rythme), bande très ondulée |
| Sad lo-fi | 62-76 | tonalités mineures (mineur, harmonique, phrygien), lent, piano feutré |
| Beatmaker (French) | 86-98 | boom-bap poussiéreux, swing appuyé, stabs de cuivres et d'orchestre, scratchs synthétisés (baby, chirp, transformer) |

* **Textures** (0-100, *Avancé*, défauts par sous-genre, légère variation par graine) : **craquements vinyle**
  (crépitement + pops), **pleurage / scintillement** (wow & flutter de bande), **saturation bande**,
  **poussière** (réduction de bits et de fréquence d'échantillonnage), **chaleur** (passe-bas doux).
  *Vintage* reste le macro : 50 = défauts du sous-genre, 0 = propre, 100 = tout doublé.
* **Arrangement** : chaque phrase reçoit une « scène » (complète, sans batterie, batterie seule, dépouillée,
  break) ; fills (roulement, double kick, coupure, toms, charley ouvert, scratch) ; mélodie et arpège entrent
  en cours de morceau ; la grille d'accords change entre sections ; *Variété* « élevée » par défaut.
* **Mix d'une heure et plus** : chaque titre tire son propre sous-genre (voisins compatibles en tempo ;
  la lo-fi house, trop rapide pour s'enchaîner, n'est tirée que pour les morceaux courts).
* **Fonds sonores** (tous styles) : pluie, **café** (brouhaha sans paroles intelligibles, tasses), **nuit en ville**
  (grillons + ville lointaine), **salle d'étude** (souffle de la pièce, pages, horloge), plus les fonds existants ;
  **volume du fond** 0-100 (studio et page du style).

## Ambient
* **Tempo** 58-74 BPM (revu, plus lent) ; sans swing.
* **Batterie** kit doux, rare.
* **Harmonie** accords de 5 sons, longues tenues (2-4 mesures par accord), nouvelles cadences I–IV, I–V–IV–I.
* **Instruments** nappes chaudes / Juno / ensemble, **Juno polysynth**, **cloches DX7** (lead et arpèges).
* **Mix** réverbération 0,62, chorus 0,5, pas de sidechain.

## Synthwave (outrun / dreamwave)
* **Moteur 1.9 : plus sombre, côté synth-pop 80s (synth-pop 80s)** — 100-116 BPM, mineur / phrygien / harmonique,
  nappe sombre, basse 80s liée, lead analogique, arpèges 80s, batterie plus métallique (saturation 1,4), réverbe 0,5.
* **Tempo** outrun 100-118, dreamwave 80-100 ; swing quasi nul.
* **Batterie** rétro 80s (gated), **TR-707**, TR-808.
* **Harmonie** mineur / dorien, 7e-9e, IV majeur emprunté, nouvelles progressions I–IV–V–VI, VI–IV–I–V.
* **Instruments** supersaw, Jupiter, Juno, **Juno polysynth**, **DX7 e-piano** ; basses 80s, **Minimoog** ;
  leads analogiques, cuivres, **Minimoog lead**, **ARP lead** ; arpèges 80s, **cloches DX7**.
* **Mix** chorus d'ensemble, réverbe ample, sidechain 0,45.

## Deep House
* **Moteur 1.9 : plus chaloupée, « à la DJ Koze »** — 116-122 BPM, swing 13 %, Rhodes / vibraphone / guitare étouffée /
  vinyle, bande 0,55, chorus 0,35, réverbe et délai plus amples, sidechain adouci (0,45). Moteur 1.8 ci-dessous.
* **Tempo** 118-125 BPM ; **groove** swing 4-20 % (ou shuffle 909).
* **Batterie** house, **TR-909** (2 chances sur 5), **TR-707**, TR-808 ; quatre temps, clap 2 et 4, charleston ouvert sur les contretemps.
* **Harmonie** mineur / dorien, 7e, nouvelles boucles I–IV, I–VII, II–V.
* **Instruments** piano, stabs, Rhodes, **DX7 e-piano**, **Juno polysynth** ; basse house, **Minimoog**, **DX7 basse** ; pluck, **cloches DX7**.
* **Arrangement** intro mixable, montée → drop, breakdown.
* **Mix** sidechain 0,62, chorus 0,25.

## French Touch (moteur 1.9 : trois variantes)
Variante tirée par la graine (classique 3 chances sur 7, Ed Banger 2/7, Myd 2/7) ou choisie : *Variante* / `adv.ftStyle`.
Socle commun :
* **Forme** intro batterie seule → boucle filtrée qui entre → montée (8-16 mesures) → drop → breakdown filtre fermé →
  montée courte → drop 2 varié → outro ; formes courtes ajustées par pas de 2 mesures (jamais de section d'une mesure).
* **Boucle « samplée »** stabs d'accords 7e/9e découpés (contretemps, anticipations, gate court), boucle de 1-2 mesures
  répétée à l'identique, découpe qui change toutes les 8-16 mesures ; guitare étouffée funk.
* **Filtre** passe-bas **24 dB/oct** automatisé sur toute la boucle (accords + basse + guitare, parfois la batterie).
* **Pompe** sidechain à la croche par bus (courbe réglable), **la réverbe pompe aussi** ; phaser sur accords / guitare.
* **Batterie** TR-909 : grosse caisse courte accordée entre 44 et 62 Hz, clap + caisse sur 2 et 4 (réverbe courte),
  charleston ouvert sur les contretemps, doubles-croches fermées shufflées, fills et coupures avant les drops ;
  bus batterie compressé (colle) et saturé.

| Variante | Techniques | Tempo | Sons | Mix |
|---|---|---|---|---|
| **Classique** (Cassius, Daft Punk *Homework* / *Discovery*) | boucle disco filtrée, longues montées de filtre, talkbox | 120-126 | stabs, Juno, Rhodes ; Minimoog ; talkbox ; guitare étouffée | pompe profonde (accords 0,93), phaser 0,5, swing 12 % |
| **Ed Banger** (Justice) | saws distordus et compressés, basse saturée, batterie dure, sale et granuleux | 116-126 | lead saw en accords, basse saw, stabs en arpèges | saturation accords 3,2 / basse 2,8 / batterie 2,4, punch 0,68, lead +35 %, peu de réverbe |
| **Myd** (house française moderne) | lumineuse et joueuse : basse rebondissante, hooks de synthé découpés, majeur / mixolydien | 118-124 | Juno polysynth, Minimoog, pluck / cloches DX7, guitare | pompe plus légère et rebondissante (courbe 1,5), chorus, délai 0,3 |

Démos (60 s) : `demos-190/01-ft-classique-filtree`, `02-ft-edbanger`, `03-ft-myd`, `04-ft-classique-b`.

## Techno (Detroit / minimale / industrielle)
* **Tempo** Detroit 130-140, minimale 126-133, industrielle 136-146 ; swing ≤ 6 %.
* **Batterie** **TR-909** (2/5), techno, TR-808, **TR-606** (nouveau, sec et aigu) ; 909 « jouée » qui mute.
* **Harmonie** mineur / phrygien, stabs Detroit 7e mineures ou nappe sombre.
* **Instruments** stabs, nappe sombre, **Juno polysynth** ; **TB-303 acid**, basse saw, 909, **Minimoog** ; **cloches DX7**.
* **Mix** sidechain 0,5 (revu), saturation du bus batterie.

## Cinématique
* **Tempo** 72-100 BPM (revu : plus de pièces lentes) ; sans swing.
* **Batterie** percussions cinéma (taïkos, toms), crescendos.
* **Harmonie** mineur / harmonique, nouvelles cadences VI–IV–I–V, I–III–IV–V.
* **Instruments** ensemble de cordes, spiccato, cor, **Juno polysynth** en nappe.
* **Mix** grande réverbe, batterie en retrait.

## Chiptune
* **Tempo** 130-156 BPM, quantifié (idiome console).
* **Batterie** 8-bit (bruit + carrés).
* **Harmonie** majeur / mineur, nouvelle grille de 8 mesures I–V–VI–IV–I–V–IV–V.
* **Instruments** carrés / pulse / triangle ; inchangés (fidélité 8-bit).
* **Mix** bit-crush 6 bits, réverbe minimale.

## Trap
* **Tempo** 130-150 BPM, demi-temps.
* **Batterie** trap, TR-808 ; rafales de charleston, 808 glissées.
* **Instruments** nappes sombres, piano, cloches, **cloches DX7** (nouveau) au lead.
* **Mix** 808 en avant, saturation.

## Hip-Hop (boom-bap / lo-fi / trap)
* **Boom-bap (moteur 1.9 : poussiéreux)** bande 0,85, batterie et basse plus granuleuses, swing 18 % ; scratchs de
  transition (bruits de « scratch » synthétisés, sans échantillon) conservés.
* **Boom-bap** 85-95 BPM, swing MPC ; kits boom-bap acoustique, TR-808, hip-hop lo-fi ; basse sub, contrebasse, **Minimoog** ; accords découpés « MPC ». Nouvelle progression II–V–I–VI.
* **Lo-fi** 72-88 BPM, swing « Dilla » ; kits hip-hop lo-fi, lo-fi, **DR-110** ; **DX7 e-piano** au clavier ; nouvelle progression IV–III–II–V.
* **Trap** 130-150 BPM ; kits trap / TR-808 ; **cloches DX7** au lead.

## Drum & Bass (liquid / neurofunk / jungle)
* **Tempo** 166-176 BPM selon la variante.
* **Batterie** acoustique reconstruite (two-step, breaks jungle).
* **Liquid** nappes liquides, **Juno polysynth**, **DX7 e-piano** ; nouvelle progression IV–V–III–VI.
* **Neurofunk (moteur 1.9 : « à la Pendulum »)** supersaw et lead analogique au premier plan, reese, batterie saturée
  et frappante (saturation 1,6, punch 0,45, batterie +25 %).
* **Jungle** inchangée (sub jungle).
* **Mix** sub mono, sidechain dédié de la basse.

---

## Feuille de route (styles à venir)

| Style / variante | Pistes de techniques (jamais de mélodie ni d'échantillon copiés) | État |
|---|---|---|
| **Trip-hop** (Bristol) | 80-95 BPM, breaks lents et lourds, basse sub ronde, nappes cinématiques, vinyle, Rhodes et cordes mélancoliques, scratchs | à faire |
| **Hip-hop dub / reggae** (L'Entourloop, Chinese Man) | skank de guitare / orgue sur les contretemps, basse dub profonde, délais à bande en écho, cuivres synthétiques, breaks boom-bap | à faire |
| **Électro Ed Banger** (style à part) | au-delà de la variante French Touch : formes plus électro, basses « fizz », tempos 110-128 | variante French Touch livrée (v1.9.0) |
| **Deep house « Koze »** (variante à part) | grooves bancals, échantillons de soul rejoués (accords), textures étranges, tempos 112-120 | retouches par défaut livrées (v1.9.0) ; variante dédiée à faire |

## Directeur artistique et veille (v1.9.0)

* **« Décris l'ambiance »** (page Générer) : le PC IA (Ollama, Admin) propose style, ambiance, tonalité, tempo et
  réglages avancés, **validés et bornés** par le serveur (clés connues, plages, listes fermées) puis appliqués au
  formulaire (tout reste modifiable). Options : titres / description / tags FR + EN (jamais de tempo ni de tonalité
  sur la vidéo), plan titre par titre pour les mix ≥ 1 h. Sans IA joignable : proposition locale par mots-clés.
* **Veille tendances** (Admin) : métadonnées publiques de vidéos récentes par style → résumé et retouches proposées ;
  chaque proposition s'applique par un bouton (retouche mémorisée du style), jamais automatiquement.
