# 🏙️ Simulateur de ville LEGO — Cahier des charges

> **Statut :** v1.0 — **cadrage figé** : toutes les questions ouvertes sont arbitrées. Les évolutions de cadrage seront datées en §9 ; l'implémentation suit la feuille de route §8.
> **Repo :** `losth230/LEGO` — ce README sert de cahier des charges vivant.

---

## 1. Vision

L'application est **le double numérique de la vraie ville LEGO** posée sur la table. Chaque bâtiment construit en briques a son équivalent simulé ; chaque figurine est un habitant avec un nom, un métier et un compte en banque. La ville s'imagin(e) comme **une métropole d'environ un million d'habitants** — la table en est l'échantillon de figurines nommées, et un coefficient d'intensité fait vivre à ce petit nombre la vie trépidante d'une grande ville. Le temps avance d'un clic : **un bouton fait passer les jours**. Chaque jour, les habitants paient leurs impôts et achètent dans les commerces ; le budget municipal finance ses services publics — police, pompiers — qui mobilisent leurs moyens face aux incidents.

Trois promesses :

1. **Fidélité au réel (la table)** — la ville simulée reflète la ville physique : mêmes bâtiments, mêmes habitants.
2. **Cohérence économique réaliste** — fiscalité, consommation, budgets et effectifs calibrés sur des **données françaises réelles** (data.gouv.fr, INSEE, ministère de l'Intérieur), pas sur des valeurs inventées.
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
2. **Moteur d'événements** — tirage probabiliste des **incidents** (incendies, cambriolages, accidents de la route, pannes) selon la **règle d'échelle §5** (taux réels × coefficient d'intensité 10 000), ET des **faits de vie** (une naissance, un accident de la vie, un ménage qui arrive ou repart) — seule porte d'entrée des changements de population.
3. **Moteur de services** — chaque incident mobilise les moyens disponibles : effectifs de garde, gravité → réussite/délai/échec de l'intervention, conséquences matérielles et humaines (amendes, dommages).

### 4.3 Circuit court de la monnaie (comptabilité fermée)

L'argent ne naît ni ne disparaît : il **circule en boucle courte**.

- Comptes : **PNJ** (courant + épargne) et **ville** (budget).
- Flux PNJ ↔ ville : impôt quotidien **PNJ → ville** ; salaire quotidien **ville → agent public** ; amende **PNJ → ville** (via événement).
- Flux PNJ ↔ PNJ : achat quotidien **habitant → commerçant** (la seule rémunération privée de la simulation, calibrée sur la consommation réelle des ménages).
- Sorties documentées du circuit : coûts de fonctionnement payés à des fournisseurs extérieurs (carburant, réparations) — tracées comme pertes pour la ville ; sinistres/vols = pertes tracées.
- **Cas limite assumé** : un PNJ privé **hors commerce** (sans boutique) ne reçoit aucun flux régulier — son compte s'érode par l'impôt. Les PNJ concernés peuvent être définis commerçants/agents publics dans l'éditeur ; c'est un choix de peuplement, pas un bug du moteur.

### 4.4 Exemple de chaîne causale

Incendie déclaré (probabilité calée sur les statistiques réelles × coefficient d'intensité) → les pompiers engagent des moyens selon la gravité → si l'effectif de garde est insuffisant, le délai augmente et les dégâts sont plus lourds → réparation payée par la ville → creux dans le budget municipal → arbitrage : la ville diffère un investissement ou **augmente le taux d'imposition quotidien**.

**Chaque maillon de la chaîne est visible dans le journal de la ville.**

## 5. Données réelles de référence

**Principe :** chaque paramètre de simulation s'appuie sur une source publique française, stockée dans un **référentiel JSON versionné et éditable** dans l'application. L'utilisateur garde la main sur chaque valeur, qui porte sa source (champ `source`).

| Domaine | Donnée | Source |
|---|---|---|
| Fiscalité & budget | Recettes fiscales par habitant, dépenses de fonctionnement, dette | [Comptes consolidés des communes 2018-2025](https://www.data.gouv.fr/datasets/comptes-consolides-des-communes-2018-2025), [Balances comptables 2024](https://www.data.gouv.fr/datasets/balances-comptables-des-communes-en-2024) (data.gouv.fr) |
| Consommation | Budget consommation quotidien des ménages, structure des dépenses (alimentation, loisirs…) | INSEE — enquête Budget de famille |
| Salaires publics | Rémunération des agents territoriaux (policiers municipaux, sapeurs-pompiers professionnels) | INSEE / statuts de la fonction publique territoriale, DGSCGC |
| Police municipale | Effectifs par commune, taux pour 10 000 habitants | [Effectifs de police municipale par commune](https://www.data.gouv.fr/datasets/police-municipale-effectifs-par-commune) (data.gouv.fr) |
| Pompiers | Effectifs, volume et types d'interventions par habitant | [Statistiques annuelles DGSCGC](https://www.interieur.gouv.fr/documentation/etudes-et-statistiques/statistiques-2024-dgscgc.html) (ministère de l'Intérieur) |
| Criminalité | Cambriolages, vols, délits par habitant | SSMSI (service statistique du ministère de l'Intérieur) |
| Faits de vie | Natalité, mortalité (pour les événements), taille des ménages | INSEE — indicateurs communaux |

### Règle d'échelle (actée — 2026-11-05)

La ville LEGO est **une échelle très réduite** (les figurines nommées, quelques dizaines), mais s'imagin(e) comme **une métropole ≈ 1 million d'habitants**. Deux règles distinctes :

- **Événements — coefficient d'intensité × 10 000** (éditable dans les référentiels). Pour un incident de taux réel `R` (événements par an pour 10 000 habitants) et une population de `P` figurines :
  `proba quotidienne = R × P × K / 10 000 / 365`, avec `K = 10 000`.
  Exemple : incendies R ≈ 3 pour 10 000 hab./an, P = 60 figurines → **≈ 0,49 incendie/jour** — la ville vit la vie trépidante d'une métropole. Le coefficient `K` est modifiable : `K = 1` = réalisme strict à l'échelle figurine.
- **Économie — valeurs réelles par habitant, appliquées telles quelles aux figurines** (impôt quotidien ≈ budget communal par habitant / 365, salaires publics réels, consommation quotidienne réelle par ménage). Les comptes restent à l'échelle figurine pour préserver le circuit court : le « million d'habitants » est la population **imaginée** (elle justifie les taux, effectifs et valeurs de référence d'une grande ville), pas une masse monétaire multipliée.

### Ville de référence (actée — 2026-11-05)

Le calibrage s'appuie sur **une métropole française ≈ 1 million d'habitants**. Candidates pour la phase 0.5 : Marseille (~875 000 hab., commune la plus proche du million), agglomération lyonnaise, ou panneau de métropoles — choix définitif lors de la qualification des données.

### Qualification des données (à faire avant tout développement)

Les sources ci-dessus sont **nommées mais pas encore qualifiées** : vérifier pour chacune le format d'exploitation (CSV/API), la licence (ouverte Etalab attendue), la granularité et l'année de référence ; retenir la valeur chiffrée exacte pour chaque paramètre du référentiel.

## 6. Interface

- **Tableaux** — bâtiments, habitants (triables/filtrables), budget, indicateurs dans le temps
- **Fiches PNJ** — identité, métier, statut (agent public / commerçant / privé), compte, impôt payé, historique personnel
- **Journal de la ville** — les événements racontés, **très légèrement romancés** (« 12 mars : le four du boulanger a pris feu au petit matin ; 4 pompiers ont eu raison des flammes, 2 400 € de dégâts »)
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
| **0.5 — Données** | Qualification des sources (§5) + extraction des valeurs réelles + choix de la ville de référence | Référentiel JSON initial avec chaque valeur + sa source | ▶ Prochaine |
| **1 — MVP** | Monde éditable (bâtiments + PNJ) + bouton « Passer un jour » + circuit court complet (impôts quotidiens, achats dans les commerces, salaires publics, fonctionnement) + journal | Une ville de ~10 bâtiments / ~40 PNJ : 30 jours passés, chaque jour impôts et achats sont réglés, les commerçants encaissent, le budget reste cohérent, le journal est lisible | |
| **2 — Services** | Police, pompiers, incidents probabilistes (coeff. d'intensité), interventions | Une série de jours génère des incidents variés, chaque intervention mobilise les moyens disponibles et ses effets remontent dans le journal et l'état des bâtiments | |
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
| 2026-11-05 | **Échelle très réduite + coefficient d'intensité × 10 000** (éditable) sur les taux d'événements réels ; l'économie reste à l'échelle figurine (valeurs réelles par habitant) |
| 2026-11-05 | **Ville de référence ≈ 1 million d'habitants** (métropole française — choix définitif en phase 0.5) ; la ville LEGO s'imagin(e) comme sa version réduite |
| 2026-11-05 | **Objectifs** : bac à sable par défaut + objectifs optionnels activables (équilibre budgétaire, sécurité, incendie, secours) — alertes sans écran de défaite |
| 2026-11-05 | **Nom du projet/ville : LEGO** (provisoire) |
| 2026-11-05 | **Tonalité du journal : très légèrement romancé** |

### Questions ouvertes

Aucune — le cadrage est figé (v1.0). De nouvelles questions seront rouvertes au fil du développement, datées ici.

---

*Document vivant — chaque évolution de cadrage est réécrite directement ici et datée en §9. L'implémentation suit ensuite, phase par phase.*
