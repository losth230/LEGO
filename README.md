# 🏙️ Simulateur de ville LEGO — Cahier des charges

> **Statut :** v1.4 — cadrage figé (v1.0, 2026-11-05) ; phase 0.5 terminée (qualification des sources + [référentiel JSON initial](data/referentiel.json) v1.0) ; monnaie du jeu arbitrée : **le LEGO (L)**. Les évolutions de cadrage sont datées en §9 ; l'implémentation suit la feuille de route §8.
> **Repo :** `losth230/LEGO` — ce README sert de cahier des charges vivant.

---

## 1. Vision

L'application est **le double numérique de la vraie ville LEGO** posée sur la table. Chaque bâtiment construit en briques a son équivalent simulé ; chaque figurine est un habitant avec un nom, un métier et un compte en banque. La ville s'imagin(e) comme **une métropole d'environ un million d'habitants** — la table en est l'échantillon de figurines nommées. Le temps avance d'un clic : **un bouton fait passer les jours**. Chaque jour, les habitants paient leurs impôts et achètent dans les commerces ; le budget municipal finance ses services publics — police, pompiers — qui mobilisent leurs moyens face aux incidents.

**Principe directeur (arbitré 2026-11-05) : le réalisme est le point de départ, pas l'objectif — chaque arbitrage privilégie l'amusement.**

Trois promesses :

1. **Fidélité au réel (la table)** — la ville simulée reflète la ville physique : mêmes bâtiments, mêmes habitants.
2. **Cohérence économique réaliste comme base** — fiscalité, consommation, budgets et effectifs partent de **données françaises réelles** (data.gouv.fr, INSEE, ministère de l'Intérieur), jamais de valeurs inventées — puis le curseur du fun (coefficient d'intensité, référentiels éditables) dose le rythme.
3. **Une vie lisible** — des **tableaux et un journal** (très légèrement romancé) racontent ce qui s'y passe, jour après jour. Pas de carte : l'information vit dans des listes, des fiches et le journal.

## 2. Périmètre

**Dans le périmètre v1**

- Population de PNJ individuels (identité, métier, revenu indicatif, compte, foyer)
- Bâtiments avec fonction, valeur et occupants
- **Économie en circuit court** : impôts quotidiens des habitants → budget municipal → salaires des agents publics ; **achats quotidiens des habitants dans les commerces → revenus des commerçants**
- Budget municipal (équilibre, déficit, dette)
- Services de sécurité : police, pompiers (effectifs, moyens, interventions)
- Avancement du temps manuel : **bouton « Passer un jour »** — l'unité de règlement est **la journée**
- Journal des événements + tableaux d'indicateurs
- **Objectifs optionnels activables** : équilibre budgétaire, sécurité, incendie, secours — des indicateurs qui alertent sans bloquer ; la simulation reste un **bac à sable**
- Éditeur du monde (ajouter/modifier bâtiments et habitants pour coller à la vraie ville)

**Hors périmètre v1** (arbitré ou candidat pour des phases ultérieures)

- **Taxe foncière** — arbitré : pas pour l'instant (2026-11-05)
- **Salaires privés** — arbitré : pas de flux salarial des employeurs privés ; un PNJ privé gagne de l'argent par les **achats des autres habitants** (ex. le vendeur de frites encaisse quand on lui achète des frites) (2026-11-05)
- **Carte de la ville** — arbitré : des tableaux et journaux suffisent (2026-11-05)
- **Horloge temps réel / vitesses ×N** — arbitré : uniquement le bouton « Passer un jour » (2026-11-05)
- **Cycle de vie des habitants** — arbitré : pas de vieillissement ni de mort de vieillesse ; naissances, décès, départs/arrivées n'existent **que comme événements** tirés par le moteur d'événements (2026-11-05)
- Multijoueur / sauvegarde en ligne
- Rendu 3D, simulation de trafic
- Module « tour des héros » et menaces de super-vilains (narratif — phase ultérieure)

## 3. Le monde — modèle de données

### 3.1 Bâtiments

| Attribut | Description |
|---|---|
| Identité | Nom, type, quartier |
| Type | Habitation, Commerce (avec un PNJ commerçant à sa tête), Service public (mairie, police, pompiers, école), Tour des héros, Industrie |
| Capacité | Logements (habitations) ou postes de travail (commerces, services) |
| Valeurs | Valeur (dépréciée par les sinistres), coût de fonctionnement quotidien pour les services publics |
| État | Neuf / bon / dégradé / sinistré (les incidents dégradent l'état) |

### 3.2 PNJ (habitants)

| Attribut | Description |
|---|---|
| Identité | Prénom, nom, âge, genre — l'âge est **fixe** (pas de vieillissement) |
| Foyer | Famille (couple, enfants), logement occupé |
| Métier | Étiquette narrative + **revenu indicatif** (assiette fiscale uniquement) |
| Statut | **Agent public** (salaire quotidien versé par la ville) / **Commerçant** (encaisse les achats des habitants) / privé hors commerce (aucun flux régulier — voir §4.3) |
| Comptes | Compte courant + épargne |

> **Rappel d'arbitrage :** naissance, décès, emménagement ne surviennent **que par événement** (§4.2), jamais par écoulement du temps.

### 3.3 La ville (niveau collectif)

- **Budget municipal** : recettes = impôt quotidien des habitants (seule recette en v1) ; dépenses = salaires quotidiens des agents publics + coûts de fonctionnement des services + investissement + dette
- **Services** : police (effectifs, véhicules), pompiers (casernes, moyens, temps d'intervention), éducation, santé
- **Indicateurs** : sécurité, richesse moyenne, solde budgétaire — dans le temps

## 4. La simulation

### 4.1 Avancement du temps

- **Un seul contrôle : le bouton « Passer un jour ».** Pas d'horloge, pas de vitesse.
- Chaque journée déclenche un **règlement quotidien** dans cet ordre : impôts prélevés → salaires publics versés → coûts de fonctionnement payés → achats des habitants dans les commerces → puis les moteurs d'événements et de services jouent.

### 4.2 Moteurs (exécutés à chaque passage de jour)

1. **Moteur économique (circuit court)** — prélèvement de l'impôt quotidien sur chaque PNJ (assiette : revenu indicatif) → budget municipal ; versement quotidien des salaires aux agents publics ; paiement des coûts de fonctionnement ; **achats quotidiens des habitants** (budget consommation calibré sur les dépenses réelles des ménages) répartis entre les commerces de la ville → les commerçants encaissent.
2. **Moteur d'événements** — tirage probabiliste des **incidents** (incendies, cambriolages, accidents de la route, pannes) selon la **règle d'échelle §5** (taux réels × coefficient d'intensité 1 000), ET des **faits de vie** (une naissance, un accident de la vie, un ménage qui arrive ou repart) — seule porte d'entrée des changements de population.
3. **Moteur de services** — chaque incident mobilise les moyens disponibles : effectifs de garde, gravité → réussite/délai/échec de l'intervention, conséquences matérielles et humaines (amendes, dommages).

### 4.3 Circuit court de la monnaie (comptabilité fermée)

L'argent ne naît ni ne disparaît : il **circule en boucle courte**.

- Comptes : **PNJ** (courant + épargne) et **ville** (budget).
- Flux PNJ ↔ ville : impôt quotidien **PNJ → ville** ; salaire quotidien **ville → agent public** ; amende **PNJ → ville** (via événement).
- Flux PNJ ↔ PNJ : achat quotidien **habitant → commerçant** (la seule rémunération privée de la simulation, calibrée sur la consommation réelle des ménages).
- Sorties documentées du circuit : coûts de fonctionnement payés à des fournisseurs extérieurs (carburant, réparations) — tracés comme pertes pour la ville ; sinistres/vols = pertes tracées.
- **Cas limite assumé** : un PNJ privé **hors commerce** (sans boutique) ne reçoit aucun flux régulier — son compte s'érode par l'impôt. Les PNJ concernés peuvent être définis commerçants/agents publics dans l'éditeur ; c'est un choix de peuplement, pas un bug du moteur.

### 4.4 Exemple de chaîne causale

Incendie déclaré (probabilité calée sur les statistiques réelles × coefficient d'intensité) → les pompiers engagent des moyens selon la gravité → si l'effectif de garde est insuffisant, le délai augmente et les dégâts sont plus lourds → réparation payée par la ville → creux dans le budget municipal → arbitrage : la ville diffère un investissement ou **augmente le taux d'imposition quotidien**.

**Chaque maillon de la chaîne est visible dans le journal de la ville.**

## 5. Données réelles de référence

**Principe :** chaque paramètre de simulation s'appuie sur une source publique française, stockée dans un **référentiel JSON versionné et éditable** dans l'application. L'utilisateur garde la main sur chaque valeur, qui porte sa source (champ `source`).

| Domaine | Donnée | Source |
|---|---|---|
| Fiscalité & budget | Recettes fiscales par habitant, dépenses de fonctionnement, dette | [Comptes consolidés des communes 2018-2025](https://www.data.gouv.fr/datasets/comptes-consolides-des-communes-2018-2025), [Balances comptables 2024](https://www.data.gouv.fr/datasets/balances-comptables-des-communes-en-2024) (data.gouv.fr) |
| Consommation | Budget consommation quotidien des ménages, structure des dépenses (alimentation, loisirs…) | INSEE — enquête [Budget de famille](https://www.insee.fr/fr/information/7652980) (agrégats) |
| Salaires publics | Rémunération des agents territoriaux (policiers municipaux, sapeurs-pompiers professionnels) | Grilles indiciaires FPT — décrets [Légifrance](https://www.legifrance.gouv.fr/loda/id/JORFTEXT000051724928/) |
| Police municipale | Effectifs par commune, taux pour 10 000 habitants | [Effectifs par commune 2013-2024](https://www.data.gouv.fr/datasets/effectifs-de-police-municipale-par-commune-france-entiere-2013-2024) (data.gouv.fr, CSV) |
| Pompiers | Effectifs, volume et types d'interventions par habitant | [Statistiques annuelles DGSCGC](https://www.interieur.gouv.fr/documentation/etudes-et-statistiques/statistiques-2024-dgscgc.html) (ministère de l'Intérieur) |
| Criminalité | Cambriolages, vols, délits par habitant | [SSMSI](https://statistiques.interieur.gouv.fr/ssmsi/chiffres-cles) — chiffres clés annuels + jeux de données data.gouv |
| Faits de vie | Natalité, mortalité (pour les événements), taille des ménages | INSEE — indicateurs communaux |

**Qualification des sources — FAITE (2026-11-05).** Toutes les sources nécessaires sont publiques et sous **licence ouverte** (Licence Ouverte v2 / Etalab) ; formats exploitables (CSV/ODS/XLSX/PDF), granularité par commune ou nationale. Détail complet, statuts par source et valeurs extraites : [docs/phase-0.5-qualification-sources.md](docs/phase-0.5-qualification-sources.md).

**Monnaie du jeu : le LEGO (L)** — les valeurs réelles du référentiel sont exprimées en euros (ce sont les sources) ; l'application affiche des L (1 L = 1 €).

**Référentiel extrait — FAIT (2026-11-05) : [data/referentiel.json](data/referentiel.json) (v1.0)** — chaque valeur porte sa source, son année et son calcul : impôt quotidien ≈ 4,0 €/PNJ (proxy IFRAP, à affiner), achats quotidiens ≈ 52,5 €/PNJ (INSEE), salaires publics nets/jour (grilles FPT 2025), taux d'incidents pour 10 000 hab./an (DGSCGC 2024 : incendies 34,2, accidents 44,3 ; SSMSI 2024 : cambriolages 31,8, homicides 0,14), natalité 96,7 / mortalité 94,2 (INSEE), police municipale ≈ 7 agents pour 10 000 hab. (Marseille : 610 agents). Provenance et suivi « à affiner » : [data/README.md](data/README.md).

### Règle d'échelle (actée — 2026-11-05, K abaissé le même jour)

La ville LEGO est **une échelle très réduite** (les figurines nommées, quelques dizaines), mais s'imagin(e) comme **une métropole ≈ 1 million d'habitants** — identité narrative ; le rythme des événements, lui, est dosé par un **curseur d'amusement** :

- **Événements — coefficient d'intensité K = 1 000** (éditable dans les référentiels). Pour un incident de taux réel `R` (événements par an pour 10 000 habitants) et une population de `P` figurines :
  `proba quotidienne = R × P × K / 10 000 / 365`, avec `K = 1 000`.
  Exemple avec le taux réel d'incendies (≈ 34,2 pour 10 000 hab./an, DGSCGC 2024) et P = 60 figurines : **≈ 0,56 incendie/jour** — un incendie tous les deux jours environ : assez pour animer le journal, assez rare pour que les pompiers de la ville restent à la hauteur. Le curseur : K = 100 = très calme, K = 1 000 = animé (défaut), K = 10 000 = métropole frénétique.
- **Économie — valeurs réelles par habitant de la ville de référence, appliquées telles quelles aux figurines** (impôt quotidien ≈ budget communal par habitant / 365, salaires publics réels, consommation quotidienne réelle par ménage). Les comptes restent à l'échelle figurine pour préserver le circuit court : le « million d'habitants » est la population **imaginée**, pas une masse monétaire multipliée.

### Ville de référence (actée — 2026-11-05)

**Une seule ville : Marseille (~875 000 habitants)** — la commune française la plus proche du million, couverte par toutes les sources communales qualifiées. Ses valeurs par habitant servent d'ancrage économique ; le réalisme est le point de départ, l'amusement arbitre (coefficient d'intensité, référentiels éditables).

## 6. Interface

- **Tableaux** — bâtiments, habitants (triables/filtrables), budget, indicateurs dans le temps
- **Fiches PNJ** — identité, métier, statut (agent public / commerçant / privé), compte, impôt payé, historique personnel
- **Journal de la ville** — les événements racontés, **très légèrement romancés** (« 12 mars : le four du boulanger a pris feu au petit matin ; 4 pompiers ont eu raison des flammes, 2 400 L de dégâts »)
- **Objectifs optionnels** — panneau activable : équilibre budgétaire, sécurité (criminalité, délai d'intervention police), incendie/secours (délai moyen et taux de réussite des interventions) ; alertes sans écran de défaite
- **Éditeur du monde** — créer/modifier/renommer bâtiments et habitants
- **Référentiels** — tous les paramètres (taux d'imposition, consommation quotidienne, salaires publics, effectifs, probabilités, coefficient d'intensité) consultables et modifiables, avec leur source

## 7. Architecture technique (proposée)

- **React + TypeScript, déployé sur GitHub Pages** — même socle que le jeu Chasse & Pêche (push = CI + Pages, éprouvé)
- **Moteur de simulation pur** : fonctions déterministes, testables, sans dépendance React ; état versionné avec registre de migrations (retour d'expérience CP)
- **Référentiel de données réelles en JSON** versionné dans le repo (licence ouverte — mention de source dans l'application)
- **Persistance** : localStorage + export/import JSON (l'en ligne est une phase ultérieure)
- **Tests** : moteur couvert par un harnais de tests unitaires (node), rendu vérifié avant push

## 8. Feuille de route

| Phase | Contenu | Critère d'acceptation | État |
|---|---|---|---|
| **0 — Cadrage** | Ce document + arbitrage des questions ouvertes | Toutes les questions §9 tranchées, v1.0 figée | ✅ Fait (2026-11-05) |
| **0.5 — Données** | Qualification des sources (§5) + extraction des valeurs réelles (Marseille) | Référentiel JSON initial avec chaque valeur + sa source | ✅ Fait (2026-11-05) — référentiel v1.0 poussé : [data/referentiel.json](data/referentiel.json) |
| **1 — MVP** | Monde éditable (bâtiments + PNJ) + bouton « Passer un jour » + circuit court complet (impôts quotidiens, achats dans les commerces, salaires publics, fonctionnement) + journal | Une ville de ~10 bâtiments / ~40 PNJ : 30 jours passés, chaque jour impôts et achats sont réglés, les commerçants encaissent, le budget reste cohérent, le journal est lisible | |
| **2 — Services** | Police, pompiers, incidents probabilistes (K = 1 000), interventions | Une série de jours génère des incidents variés, chaque intervention mobilise les moyens disponibles et ses effets remontent dans le journal et l'état des bâtiments | |
| **3 — Budget approfondi** | Investissement, dette, sinistres majeurs, arbitrages de taux d'imposition, objectifs optionnels | Un déficit force une décision visible : augmenter l'impôt, couper un service, ou emprunter | |
| **4 — Modules** | Tour des héros/menaces, export & partage, multijoueur | Selon arbitrage | |

## 9. Décisions actées

| Date | Décision |
|---|---|
| 2026-11-05 | **Pas de carte** : l'interface se compose de tableaux, fiches et journal |
| 2026-11-05 | **Pas d'horloge** : un bouton « Passer un jour » fait avancer le temps |
| 2026-11-05 | **Pas de cycle de vie** : moteurs = économique, événements, services ; les naissances/morts/déménagements n'existent que comme événements |
| 2026-11-05 | **Économie en circuit court** : les PNJ paient l'impôt, l'impôt finance les services publics ; pas de flux salarial privé |
| 2026-11-05 | **L'unité de règlement = la journée** : impôts et salaires prélevés/versés chaque jour, pas de mensualisation |
| 2026-11-05 | **Rémunération des commerçants par les achats** : un PNJ privé gagne de l'argent quand d'autres habitants achètent chez lui (ex. le vendeur de frites) |
| 2026-11-05 | **Pas de taxe foncière pour l'instant** |
| 2026-11-05 | **Échelle très réduite** : coefficient d'intensité sur les taux d'événements réels (d'abord × 10 000, abaissé le même jour — cf. ci-dessous) ; l'économie reste à l'échelle figurine (valeurs réelles par habitant) |
| 2026-11-05 | **Coefficient d'intensité abaissé à K = 1 000** (option C, éditable) — « l'objectif n'est pas d'être réaliste mais de s'amuser » : ~0,56 incendie/jour pour 60 figurines, un rythme animé mais tenable pour les moyens figurine des services |
| 2026-11-05 | **Ville de référence unique : Marseille** (~875 000 hab., commune la plus proche du million) — pas de moyenne de villes |
| 2026-11-05 | **Objectifs** : bac à sable par défaut + objectifs optionnels activables (équilibre budgétaire, sécurité, incendie, secours) — alertes sans écran de défaite |
| 2026-11-05 | **Nom du projet/ville : LEGO** (provisoire) |
| 2026-11-05 | **Tonalité du journal : très légèrement romancé** |
| 2026-11-05 | **Principe directeur : le réalisme est le point de départ, l'amusement arbitre** — en cas de doute, trancher en faveur du fun |
| 2026-11-05 | **Référentiel v1.0 poussé** : valeurs réelles extraites avec sources ; impôt quotidien ≈ 4,0 €/PNJ (proxy IFRAP — dépenses de fonctionnement Marseille 1 455 €/hab./an, à affiner), consommation ≈ 52,5 €/PNJ/jour (INSEE), K = 1 000 confirmé |
| 2026-11-05 | **Monnaie du jeu : le LEGO (L)** — tous les montants s'affichent en L (1 L = 1 €) ; le référentiel reste en euros réels issus des sources |

### Questions ouvertes

Aucune en attente — le cadrage est complet. De nouvelles questions seront rouvertes au fil du développement, datées ici.

## 10. État de l'art et positionnement (veille 2026-11-05)

**Le projet n'existe pas déjà sous cette forme.** Aucun outil trouvé ne combine un jumeau numérique de sa propre ville LEGO, des PNJ nommés avec comptes en banque en circuit fermé, et une calibration sur données publiques françaises réelles. Les plus proches :

- **[MIT CityScope](https://www.media.mit.edu/projects/cityscope/)** — briques tangibles + simulation urbaine, mais pour ateliers de planification : pas de PNJ ni de ville personnelle ;
- **[emergent-city](https://github.com/leatag/emergent-city), [manyworld](https://github.com/alinojoumi8/manyworld), [AgentSociety](https://deepwiki.com/tsinghua-fib-lab/AgentSociety/12.2-mobility-and-economic-simulations)** — simulations de société à agents individuels open source, mais villes fictives, sans données réelles ni LEGO ;
- **Jeux commerciaux** — The Sims, Dwarf Fortress (individus profonds), Cities: Skylines/SimCity (économies agrégées) : aucun ne suit l'argent de chaque citoyen nommé d'une ville réelle du joueur ;
- **LEGO officiel** — LEGO Tower, LEGO City Build and Protect : gestion fiction, sans jumeau numérique.

Analyse complète : [docs/phase-0.5-qualification-sources.md](docs/phase-0.5-qualification-sources.md) §4.

---

*Document vivant — chaque évolution de cadrage est réécrite directement ici et datée en §9. L'implémentation suit ensuite, phase par phase.*
