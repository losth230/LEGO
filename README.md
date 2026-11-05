# 🏙️ Simulateur de ville LEGO — Cahier des charges

> **Statut :** v0.3 — document de cadrage. Base de propositions : chaque section est arbitralbe, les décisions actées et les questions ouvertes vivent en §8-§9.
> **Repo :** `losth230/LEGO` — ce README sert de cahier des charges vivant.

---

## 1. Vision

L'application est **le double numérique de la vraie ville LEGO** posée sur la table. Chaque bâtiment construit en briques a son équivalent simulé ; chaque figurine est un habitant avec un nom, un métier et un compte en banque. Le temps avance d'un clic : **un bouton fait passer les jours**. Chaque jour, les habitants paient leurs impôts ; le budget municipal finance chaque jour ses services publics — police, pompiers — qui mobilisent leurs moyens face aux incidents.

Trois promesses :

1. **Fidélité au réel (la table)** — la ville simulée reflète la ville physique : mêmes bâtiments, mêmes habitants.
2. **Cohérence économique réaliste** — fiscalité, budgets et effectifs calibrés sur des **données françaises réelles** (data.gouv.fr, INSEE, ministère de l'Intérieur), pas sur des valeurs inventées.
3. **Une vie lisible** — des **tableaux et un journal** racontent ce qui s'y passe, jour après jour. Pas de carte : l'information vit dans des listes, des fiches et le journal.

## 2. Périmètre

**Dans le périmètre v1**

- Population de PNJ individuels (identité, métier, revenu indicatif, compte, foyer)
- Bâtiments avec fonction, valeur et occupants
- **Économie en circuit court** : impôts quotidiens des habitants → budget municipal → salaires des agents publics et coûts de fonctionnement des services
- Budget municipal (équilibre, déficit, dette)
- Services de sécurité : police, pompiers (effectifs, moyens, interventions)
- Avancement du temps manuel : **bouton « Passer un jour »** — l'unité de règlement est **la journée**
- Journal des événements + tableaux d'indicateurs
- Éditeur du monde (ajouter/modifier bâtiments et habitants pour coller à la vraie ville)

**Hors périmètre v1** (arbitré ou candidat pour des phases ultérieures)

- **Salaires privés et consommation des ménages** — arbitré : circuit court, seuls les agents publics sont rémunérés par la simulation (2026-11-05)
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
| Type | Habitation, Commerce, Service public (mairie, police, pompiers, école), Tour des héros, Industrie |
| Capacité | Logements (habitations) ou postes de travail (commerces, services) |
| Valeurs | Valeur foncière (assiette de la taxe foncière), coût de fonctionnement quotidien |
| État | Neuf / bon / dégradé / sinistré (les incidents dégradent l'état) |

### 3.2 PNJ (habitants)

| Attribut | Description |
|---|---|
| Identité | Prénom, nom, âge, genre — l'âge est **fixe** (pas de vieillissement) |
| Foyer | Famille (couple, enfants), logement occupé |
| Métier | Étiquette narrative + **revenu indicatif** (assiette fiscale uniquement — pas de flux de salaire privé) |
| Statut | **Agent public** (rémunéré chaque jour par la ville) ou secteur privé (non rémunéré dans la simulation) |
| Comptes | Compte courant + épargne |

> **Rappel d'arbitrage :** naissance, décès, emménagement ne surviennent **que par événement** (§4.2), jamais par écoulement du temps.

### 3.3 La ville (niveau collectif)

- **Budget municipal** : recettes = impôt quotidien des habitants + taxe foncière des bâtiments imposables ; dépenses = salaires quotidiens des agents publics + coûts de fonctionnement des services + investissement + dette
- **Services** : police (effectifs, véhicules), pompiers (casernes, moyens, temps d'intervention), éducation, santé
- **Indicateurs** : sécurité, richesse moyenne, solde budgétaire — dans le temps

## 4. La simulation

### 4.1 Avancement du temps

- **Un seul contrôle : le bouton « Passer un jour ».** Pas d'horloge, pas de vitesse.
- Chaque journée déclenche un **règlement quotidien** dans cet ordre : impôts prélevés → salaires publics versés → coûts de fonctionnement payés → puis les moteurs d'événements et de services jouent.

### 4.2 Moteurs (exécutés à chaque passage de jour)

1. **Moteur économique (circuit court)** — prélèvement de l'impôt quotidien sur chaque PNJ (assiette : revenu indicatif) et de la taxe foncière sur les bâtiments imposables → budget municipal ; versement quotidien des salaires aux agents publics ; paiement des coûts de fonctionnement (carburant, entretien). L'épargne des PNJ absorbe les à-coups.
2. **Moteur d'événements** — tirage probabiliste des **incidents** (incendies, cambriolages, accidents de la route, pannes) à partir de taux réels, ET des **faits de vie** (une naissance, un accident de la vie, un ménage qui arrive ou repart) — seule porte d'entrée des changements de population.
3. **Moteur de services** — chaque incident mobilise les moyens disponibles : effectifs de garde, gravité → réussite/délai/échec de l'intervention, conséquences matérielles et humaines (amendes, dommages).

### 4.3 Circuit court de la monnaie (comptabilité fermée)

L'argent ne naît ni ne disparaît : il **circule en boucle courte** entre deux sphères.

- Comptes : **PNJ** (courant + épargne) et **ville** (budget).
- Flux simulés : impôt quotidien **PNJ → ville** ; taxe foncière **propriétaire → ville** ; salaire quotidien **ville → agent public** ; amende **PNJ → ville** (via événement) ; sinistre/vol **PNJ → perte tracée**.
- Sorties documentées du circuit : coûts de fonctionnement payés à des fournisseurs extérieurs (carburant, réparations) — tracées comme pertes pour la ville.
- **Conséquence assumée du circuit court** : le revenu privé n'est pas simulé — le seul flux entrant d'un PNJ est son salaire public (et les gains d'événements). Les comptes des PNJ privés s'érodent lentement (impôts quotidiens). Choix assumé pour v1 ; question ouverte n°3 pour la suite.

### 4.4 Exemple de chaîne causale

Incendie déclaré (probabilité calée sur les statistiques réelles) → les pompiers engagent des moyens selon la gravité → si l'effectif de garde est insuffisant, le délai augmente et les dégâts sont plus lourds → réparation payée par la ville → creux dans le budget municipal → arbitrage : la ville diffère un investissement ou **augmente le taux d'imposition quotidien**.

**Chaque maillon de la chaîne est visible dans le journal de la ville.**

## 5. Données réelles de référence

**Principe :** chaque paramètre de simulation s'appuie sur une source publique française, stockée dans un **référentiel JSON versionné et éditable** dans l'application. L'utilisateur garde la main sur chaque valeur, qui porte sa source (champ `source`).

| Domaine | Donnée | Source |
|---|---|---|
| Fiscalité & budget | Recettes fiscales par habitant, dépenses de fonctionnement, dette, taux de taxe foncière | [Comptes consolidés des communes 2018-2025](https://www.data.gouv.fr/datasets/comptes-consolides-des-communes-2018-2025), [Balances comptables 2024](https://www.data.gouv.fr/datasets/balances-comptables-des-communes-en-2024) (data.gouv.fr) |
| Salaires publics | Rémunération des agents territoriaux (policiers municipaux, sapeurs-pompiers professionnels) | INSEE / statuts de la fonction publique territoriale, DGSCGC |
| Police municipale | Effectifs par commune, taux pour 10 000 habitants | [Effectifs de police municipale par commune](https://www.data.gouv.fr/datasets/police-municipale-effectifs-par-commune) (data.gouv.fr) |
| Pompiers | Effectifs, volume et types d'interventions par habitant | [Statistiques annuelles DGSCGC](https://www.interieur.gouv.fr/documentation/etudes-et-statistiques/statistiques-2024-dgscgc.html) (ministère de l'Intérieur) |
| Criminalité | Cambriolages, vols, délits par habitant | SSMSI (service statistique du ministère de l'Intérieur) |
| Faits de vie | Natalité, mortalité (pour les événements), taille des ménages | INSEE — indicateurs communaux |

### ⚠ Règle d'échelle (problème ouvert majeur — cf. question n°1)

Les taux réels s'expriment **pour 1 000 ou 10 000 habitants**. Une ville LEGO fait plutôt 30 à 60 figurines. Appliquer les taux réels tels quels = **quasi aucun incident en des années de jeu** (ex. ~3 incendies pour 10 000 hab./an → 0,02 pour 60 figurines). Trois options :

- **A. Réalisme strict** : taux réels, les incidents sont rarissimes — cohérent mais probablement ternant ;
- **B. Densification éditable** : taux réels × coefficient d'intensité réglable dans les référentiels (le réalisme reste la base, le joueur dose le drame) ;
- **C. Facteur d'échelle** : 1 figurine = N habitants (la ville LEGO « représente » une vraie commune) — mais alors le journal raconte des statistiques abstraites, pas des figurines nommées.

### Qualification des données (à faire avant tout développement)

Les sources ci-dessus sont **nommées mais pas encore qualifiées** : vérifier pour chacune le format d'exploitation (CSV/API), la licence (ouverte Etalab attendue), la granularité et l'année de référence ; retenir la valeur chiffrée exacte pour chaque paramètre du référentiel.

## 6. Interface

- **Tableaux** — bâtiments, habitants (triables/filtrables), budget, indicateurs dans le temps
- **Fiches PNJ** — identité, métier, statut (agent public / privé), compte, impôt payé, historique personnel
- **Journal de la ville** — les événements racontés en texte (« 12 mars : incendie chez le boulanger, 4 pompiers mobilisés, 2 400 € de dégâts »)
- **Éditeur du monde** — créer/modifier/renommer bâtiments et habitants
- **Référentiels** — tous les paramètres (taux d'imposition, salaires publics, effectifs, probabilités) consultables et modifiables, avec leur source

## 7. Architecture technique (proposée)

- **React + TypeScript, déployé sur GitHub Pages** — même socle que le jeu Chasse & Pêche (push = CI + Pages, éprouvé)
- **Moteur de simulation pur** : fonctions déterministes, testables, sans dépendance React ; état versionné avec registre de migrations (retour d'expérience CP)
- **Référentiel de données réelles en JSON** versionné dans le repo (licence ouverte — mention de source dans l'application)
- **Persistance** : localStorage + export/import JSON (l'en ligne est une phase ultérieure)
- **Tests** : moteur couvert par un harnais de tests unitaires (node), rendu vérifié avant push

## 8. Feuille de route

| Phase | Contenu | Critère d'acceptation |
|---|---|---|
| **0 — Cadrage** | Ce document + arbitrage des questions ouvertes | Toutes les questions §9 tranchées, v1.0 figée |
| **0.5 — Données** | Qualification des sources (§5) + extraction des valeurs réelles | Référentiel JSON initial avec chaque valeur + sa source |
| **1 — MVP** | Monde éditable (bâtiments + PNJ) + bouton « Passer un jour » + circuit court complet (impôts quotidiens → budget → salaires publics et fonctionnement) + journal | Une ville de ~10 bâtiments / ~40 PNJ : 30 jours passés, chaque jour les impôts et salaires sont réglés, le budget reste cohérent, le journal est lisible |
| **2 — Services** | Police, pompiers, incidents probabilistes, interventions | Une série de jours génère des incidents variés, chaque intervention mobilise les moyens disponibles et ses effets remontent dans le journal et l'état des bâtiments |
| **3 — Budget approfondi** | Investissement, dette, sinistres majeurs, arbitrages de taux d'imposition | Un déficit force une décision visible : augmenter l'impôt, couper un service, ou emprunter |
| **4 — Modules** | Tour des héros/menaces, export & partage, multijoueur | Selon arbitrage |

## 9. Décisions actées et questions ouvertes

### Décisions actées

| Date | Décision |
|---|---|
| 2026-11-05 | **Pas de carte** : l'interface se compose de tableaux, fiches et journal |
| 2026-11-05 | **Pas d'horloge** : un bouton « Passer un jour » fait avancer le temps |
| 2026-11-05 | **Pas de cycle de vie** : moteurs = économique, événements, services ; les naissances/morts/déménagements n'existent que comme événements |
| 2026-11-05 | **Économie en circuit court** : les PNJ paient l'impôt, l'impôt finance les services publics ; salaires privés non simulés, seuls les agents publics sont rémunérés |
| 2026-11-05 | **L'unité de règlement = la journée** : impôts et salaires prélevés/versés chaque jour, pas de mensualisation |

### Questions ouvertes (à arbitrer)

1. **Échelle de population** *(prioritaire — conditionne tout le moteur d'événements)* : 1 figurine = 1 habitant avec taux réels (option A — rareté réaliste), taux × coefficient d'intensité éditable (option B), ou 1 figurine = N habitants (option C) ? Cf. §5.
2. **Commune de référence** pour le calibrage : une petite ville française type (≈ 5 000-10 000 hab.) ? Laquelle ?
3. **Érosion des comptes privés** : les PNJ du secteur privé ne reçoivent aucun flux (hors événements) — assumé pour v1, ou ajouter des événements de compensation (héritage, prime, remboursement) pour éviter les comptes à zéro sur le long terme ?
4. **Objectifs** : simulation pure type bac à sable, ou objectifs optionnels (équilibre budgétaire, sécurité) ?
5. **Nom du projet/ville** : nommer la ville et l'application.
6. **Tonalité du journal** : sobre factuel ou romancé (micro-narration façon « La Brique du Jour ») ?

---

*Document vivant — chaque arbitrage est réécrit directement ici, daté en tête de §9. L'implémentation suit ensuite, phase par phase.*
