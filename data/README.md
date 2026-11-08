# data/ — Référentiel de valeurs réelles

**[referentiel.json](referentiel.json)** (v1.17, 2026-11-08) : toutes les valeurs de calibration de la simulation, extraites de sources publiques françaises (Licence Ouverte v2 / Etalab sauf mention contraire). Chaque valeur porte sa source, son année et son calcul ; les évolutions de cadrage sont datées dans le README racine (§9).

### Fil des versions du référentiel

- **v1.17 (2026-11-08)** : **les véhicules** (v1.25) — incident `evenements.vol_vehicule` (18,95 vols de voiture pour 10 000 hab./an, SSMSI : ~130 000 vols avec violences ou menaces en France) ; incident `evenements.collision_vehicule` (15 pour 10 000 hab./an, taux de jeu assumé) ; domaine `vehicules` : essence de référence 8 L/jour (achetée à la station-service, vocation « garage », arbitrage Thibaut 2026-11-08 : c'est elle qui gère la pompe et les accidents, pas le BTP), part des dégâts de collision 0,10 de la valeur (réparations à la station-service).

- **v1.16 (2026-11-06)** : retour au **grade unique pour le corps Mairie** (adjoint technique, 48,30 L/jour) — la propreté n'a pas besoin de grades multiples (arbitrage Thibaut v1.22) ; les grades agent de maîtrise et technicien territorial (v1.15) sont retirés et reconvertis en adjoint technique au chargement des sauvegardes.
- **v1.15 (2026-11-06)** : le corps **Mairie** passe de 1 à 3 grades — adjoint technique (48,30 L/jour), **agent de maîtrise** (55,00) et **technicien territorial** (61,70) — grilles FPT emploi-collectivites (point d'indice 4,92278 €, net ≈ brut × 0,794) : les agents municipaux (balayeurs, éboueurs, chefs d'équipe) existent enfin (v1.21 ; le monde par défaut embauche une brigade de 3).
- **v1.14 (2026-11-06)** : chaque grade porte son **corps** (champ `corps`) ; grilles de salaires publics **figées** (vérifiées : point d'indice 4,92278 €, grilles FPT 2025, commissaire en grille indiciaire FPE) ; les groupes de grades de l'application sont **générés depuis ce fichier** (plus de liste en parallèle dans l'éditeur).
- **v1.13** : le commissaire remplace l'inspecteur au sommet de la police (arbitrage Thibaut 2026-11-06 : l'inspecteur est un métier à part) — un inspecteur sauvegardé devient major, le grade conservé au salaire le plus proche.
- **v1.12** : grilles resserrées à **trois grades par corps** (police, pompiers, armée ; arbitrage Thibaut 2026-11-06, 33 → 10 grades), les sauvegardes sont converties vers le grade conservé au salaire le plus proche.
- **v1.10–v1.11** : détenus gardés **au commissariat** (prime de garde 5 L/jour/détenu versée aux policiers en poste, rédemption 50 % / 10 % selon l'effectif) ; **budgets d'achat aléatoires au départ** (loi log-uniforme ×0,5–×10 le revenu indicatif ; arbitrage Thibaut : tous les PNJ, total non recalé, tirage différent à chaque partie).
- **v1.8–v1.9** : affrontements de gangs (2 pour 10 000 hab./an, **taux de jeu assumé**) ; domaine `penitentiaire` (frais de détention, rédemption — valeurs de jeu assumées).
- **v1.6–v1.7** : taux d'impôt à la source sur les gains du jour (arbitrage Thibaut), défaut 10 % puis porté à 30 %.
- **v1.5** : modèle flux — part salariale 0,88 (marge patronale 12 %), coût complet d'un employé privé 57,75 L/jour (`effectif_max ≈ 0,88 × recettes / 57,75`).
- **v1.4** : grilles de salaires complètes par corps — police (5 grades), sapeurs-pompiers (12, indemnité de feu incluse), armée (15, solde nette avec primes NPRM 2025). Historique : resserrées à trois grades par corps en v1.12.

## Monnaie

L'application affiche des **LEGOs (L)** — 1 L = 1 €. Le référentiel stocke des **euros réels** (ce sont les sources) ; la conversion est purement cosmétique (taux 1:1).

## Schéma de chaque valeur

| Champ | Rôle |
|---|---|
| `valeur` | Nombre appliqué par le moteur |
| `unite` | Unité (euro/PNJ/jour, événements/10 000 hab./an…) |
| `source`, `url`, `annee` | Provenance — affichée dans l'application, référentiels éditables |
| `calcul` | Dérivation quand la valeur n'est pas publiée telle quelle |
| `fiabilite` | `proxy` = valeur de remplacement en attendant la source exacte |
| `note` | Caveats et limites |

## Règle d'échelle

`proba quotidienne = taux_par_10k_hab_an × P_figurines × K / 10000 / 365` avec **K = 1 000** (éditable). L'économie reste à l'échelle figurine : valeurs réelles par habitant appliquées telles quelles (achats ≈ 52,5 L/PNJ/jour, taux d'emprunt des collectivités 3,54 %/an, impôt à la source 30 % des gains par défaut, affrontements de gangs 2 pour 10 000 hab./an).

## À affiner (suivi)

1. **Impôt quotidien (proxy IFRAP)** : **retiré du calcul en v1.6** — l'impôt est désormais un taux à la source sur les gains du jour (10 %, arbitrage Thibaut 2026-11-06) ; la valeur reste archivée dans le référentiel à titre documentaire.
2. **Salaires publics** : grilles FPT 2025 **figées le 2026-11-06** (point d'indice 4,92278 €, emploi-collectivites ; police municipale catégorie B vérifiée contre la grille FPT 2025, commissaire contre la grille indiciaire FPE — décret JORFTEXT000051724928 en référence).
3. **Effectifs pompiers** : extraits au niveau national en phase 2 (DGSCGC 2024 : 44 000 SPP, 198 900 SPV, 4 754 800 interventions ; détail dans `services.pompiers`). Le détail propre au SDIS 13 reste une piste d'affinage.
4. **Gros CSV OFGL** (comptes consolidés, balances comptables) : non téléchargeables via le robot — archivage d'extraits bruts prévu dans `data/sources/` (extraits uniquement, fichiers complets trop volumineux).
