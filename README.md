# 🏙️ Simulateur de ville LEGO — Cahier des charges

> **Statut :** v0.1 — document de cadrage. Il s'agit d'une base de propositions à arbitrer : chaque section est modifiable, les questions ouvertes sont listées en §9.
> **Repo :** `losth230/LEGO` — ce README sert de cahier des charges vivant.

---

## 1. Vision

L'application est **le double numérique de la vraie ville LEGO** posée sur la table. Chaque bâtiment construit en briques a son équivalent simulé ; chaque figurine est un habitant avec un nom, un métier, un salaire, une épargne et une famille. Une horloge fait tourner la vie : les habitants travaillent, consomment, paient des impôts ; des incidents surviennent (incendie, cambriolage, accident) ; les services publics — police, pompiers — mobilisent leurs moyens pour y répondre.

Trois promesses :

1. **Fidélité au réel (la table)** — la ville simulée reflète la ville physique : mêmes bâtiments, mêmes habitants.
2. **Cohérence économique réaliste** — salaires, prix, budgets et effectifs calibrés sur des **données françaises réelles** (INSEE, data.gouv.fr, ministère de l'Intérieur), pas sur des valeurs inventées.
3. **Une vie lisible** — pas seulement des tableaux : un **journal de la ville** raconte ce qui s'y passe, journée après journée.

## 2. Périmètre

**Dans le périmètre v1**

- Population de PNJ individuels (identité, métier, revenus, foyer)
- Bâtiments avec fonction, valeur et occupants
- Économie des ménages (salaires, dépenses, loyers, épargne)
- Budget municipal (impôts, dépenses de fonctionnement, investissement)
- Services de sécurité : police, pompiers (effectifs, moyens, interventions)
- Horloge de simulation (jour / semaine / mois / année) + événements aléatoires calibrés
- Journal des événements + tableau de bord d'indicateurs
- Éditeur du monde (ajouter/modifier bâtiments et habitants pour coller à la vraie ville)

**Hors périmètre v1** (candidats pour des phases ultérieures)

- Multijoueur / sauvegarde en ligne
- Rendu 3D
- Simulation de trafic détaillée
- Module « tour des héros » et menaces de super-vilains (narratif, cf. plan ville vivante — arbitré en phase 5)

## 3. Le monde — modèle de données

### 3.1 Bâtiments

| Attribut | Description |
|---|---|
| Identité | Nom, type, quartier, position sur la carte |
| Type | Habitation, Commerce, Service public (mairie, police, pompiers, école), Tour des héros, Industrie |
| Capacité | Logements (habitations) ou postes de travail (commerces, services) |
| Valeurs | Valeur foncière, coût de fonctionnement mensuel, revenus générés |
| État | Neuf / bon / dégradé / sinistré (les incidents dégradent l'état) |

### 3.2 PNJ (habitants)

| Attribut | Description |
|---|---|
| Identité | Prénom, nom, âge, genre |
| Foyer | Famille (couple, enfants), logement occupé |
| Socio-éco | Métier (nomenclature de professions), employeur, salaire net mensuel, épargne |
| Vie quotidienne | Routine domicile → travail → commerces ; besoins (alimentation, loisirs…) |
| Cycle de vie | Études → activité → retraite → décès ; naissances, mises en couple |

### 3.3 La ville (niveau collectif)

- **Budget municipal** : recettes (taxe foncière, taxe d'habitation locale…), dépenses (fonctionnement par service, investissement, dette)
- **Services** : police (effectifs, véhicules), pompiers (casernes, moyens, temps d'intervention), éducation, santé
- **Indicateurs** : sécurité, attractivité, emploi, richesse moyenne — dans le temps

## 4. La simulation

### 4.1 Horloge

- Unité de base : **la journée**. Contrôles : pause, vitesse ×1 / ×5 / ×20 (1 jour = N secondes réglable)
- Calendrier : semaine de travail (5 jours + week-end), mois, année — les salaires tombent en fin de mois, les impôts annuellement

### 4.2 Moteurs (exécutés à chaque pas de temps)

1. **Moteur économique** — versement des salaires, dépenses des ménages réparties entre les commerces (structure de consommation réelle), loyers, épargne, recettes fiscales de la ville
2. **Moteur démographique** — naissances, décès, départs/arrivées de ménages selon l'attractivité
3. **Moteur d'événements** — tirage probabiliste des incidents (incendies, cambriolages, accidents de la route, pannes) à partir de taux réels par habitant
4. **Moteur de services** — chaque incident mobilise les moyens disponibles : effectifs de garde, temps de trajet, gravité → réussite/délai/échec de l'intervention, conséquences matérielles et humaines

### 4.3 Exemple de chaîne causale

Incendie déclaré (probabilité calée sur les statistiques réelles) → les pompiers engagent des moyens selon la gravité (échelle réelle des interventions) → si l'effectif de garde est insuffisant, le délai augmente et les dégâts sont plus lourds → réparation payée par la ville ou l'assurance → creux dans le budget municipal → arbitrage : la ville diffère un investissement ou augmente un taux.

**Chaque mortier de la chaîne est visible dans le journal de la ville.**

## 5. Données réelles de référence

**Principe :** chaque paramètre de simulation s'appuie sur une source publique française, stockée dans un **référentiel JSON versionné et éditable** dans l'application (retour d'expérience : les référentiels éditables sont ce qui rend une simulation vivante ajustable). L'utilisateur garde la main sur chaque valeur.

| Domaine | Donnée | Source |
|---|---|---|
| Salaires | Salaires nets par profession, par tranche d'âge | INSEE — base des salaires, fichier localisé social et fiscal (FiLoSFi) |
| Démographie | Pyramide des âges, taille des ménages, natalité, mortalité | INSEE — recensement, indicateurs communaux |
| Budget municipal | Recettes/dépenses des communes, taux de taxe foncière, dette | [Comptes consolidés des communes 2018-2025](https://www.data.gouv.fr/datasets/comptes-consolides-des-communes-2018-2025), [Balances comptables 2024](https://www.data.gouv.fr/datasets/balances-comptables-des-communes-en-2024) (data.gouv.fr) |
| Police municipale | Effectifs par commune, taux pour 10 000 habitants | [Effectifs de police municipale par commune](https://www.data.gouv.fr/datasets/police-municipale-effectifs-par-commune) (data.gouv.fr) |
| Pompiers | Effectifs, volume et types d'interventions par habitant | [Statistiques annuelles DGSCGC](https://www.interieur.gouv.fr/documentation/etudes-et-statistiques/statistiques-2024-dgscgc.html) (ministère de l'Intérieur) |
| Consommation | Structure des dépenses des ménages (logement, alimentation, loisirs…) | INSEE — enquête Budget de famille |
| Criminalité | Cambriolages, vols, délits par habitant | SSMSI (service statistique du ministère de l'Intérieur) |

**Calibrage initial :** choisir une **commune réelle de référence** de taille comparable à la ville LEGO (ou une moyenne de communes de cette strate) et caler tous les paramètres sur elle. Le référentiel garde la trace de la source de chaque valeur (champ `source`).

## 6. Interface

- **La carte de la ville** — plan interactif éditable (ou photo de la vraie table avec zones cliquables — question ouverte n°3) ; chaque bâtiment est cliquable
- **Fiches PNJ** — identité, métier, salaire, épargne, foyer, historique personnel
- **Tableau de bord** — population, budget, emploi, sécurité, évolution dans le temps (graphes)
- **Journal de la ville** — les événements racontés en texte (« 12 mars : incendie chez le boulanger, 4 pompiers mobilisés, 2 400 € de dégâts »)
- **Éditeur du monde** — créer/déplacer/renommer bâtiments et habitants
- **Référentiels** — tous les paramètres (salaires, taux, effectifs, probabilités) consultables et modifiables, avec leur source

## 7. Architecture technique (proposée)

- **React + TypeScript, déployé sur GitHub Pages** — même socle que le jeu Chasse & Pêche (push = CI + Pages, éprouvé)
- **Moteur de simulation pur** : fonctions déterministes, testables, sans dépendance React ; état versionné avec registre de migrations (retour d'expérience CP)
- **Référentiel de données réelles en JSON** versionné dans le repo (données publiques, licences ouvertes Etalab — mentionner la source dans l'application)
- **Persistance** : localStorage + export/import JSON (le multijoueur/l'en ligne est une phase ultérieure, pas une contrainte de conception maintenant)
- **Tests** : moteur couvert par un harnais de tests unitaires (node), rendu vérifié avant push

## 8. Feuille de route

| Phase | Contenu | Sortie |
|---|---|---|
| **0** | Cadrage (ce document) + arbitrage des questions ouvertes | v1.0 de ce cahier des charges |
| **1 — MVP** | Monde statique éditable (bâtiments + PNJ) + horloge + moteur économique simple + journal | La ville vit, on voit l'argent circuler |
| **2 — Services** | Police, pompiers, incidents probabilistes, interventions | Les catastrophes arrivent, on gère |
| **3 — Boucle fiscale** | Budget municipal complet, indicateurs, tableau de bord | La ville a des finances |
| **4 — Démographie** | Cycles de vie complets (naissances, retraite, décès, migrations) | La population évolue sur des années |
| **5 — Modules** | Tour des héros/menaces, multijoueur, export & partage | Selon arbitrage |

## 9. Questions ouvertes (à arbitrer)

1. **Commune de référence** pour le calibrage : une petite ville française type (≈ 5 000-10 000 hab.) ? Laquelle ? Ou plutôt un panier de communes moyennes ?
2. **Échelle de population** : 1 figurine = 1 habitant (la ville LEGO ≈ un village) ou facteur d'échelle (1 figurine = 50 habitants pour retrouver les taux réels) ? Impacts en chaîne sur tous les moteurs.
3. **Carte** : schéma interactif éditable (grille/canvas) ou photo de la table réelle avec zones cliquables ?
4. **Objectifs** : simulation pure type bac à sable, ou objectifs optionnels (équilibre budgétaire, sécurité, bonheur des habitants) ?
5. **Nom du projet/ville** : nommer la ville et l'application.
6. **Tonalité du journal** : sobre factuel ou romancé (micro-narration façon « La Brique du Jour ») ?

---

*Document vivant — chaque arbitrage est réécrit directement ici. Le moteur d'implémentation suit ensuite, phase par phase.*
