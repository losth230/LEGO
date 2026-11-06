# data/ — Référentiel de valeurs réelles

**[referentiel.json](referentiel.json)** (v1.8, 2026-11-06) : toutes les valeurs de calibration de la simulation, extraites de sources publiques françaises (Licence Ouverte v2 / Etalab sauf mention contraire). v1.4 : grilles de salaires complètes par corps — police municipale (5 grades), sapeurs-pompiers (12 grades, indemnité de feu incluse) et armée (15 grades, solde nette avec primes NPRM 2025). v1.5 : modèle flux — part salariale 0,88 (88 % des recettes d'un commerce redistribuées en salaires, marge patronale 12 %) et coût complet d'un employé privé 57,75 L/jour (calibrage de jeu : `effectif_max ≈ 0,88 × recettes / 57,75`). v1.6 : taux d'impôt à la source sur les gains du jour (arbitrage Thibaut 2026-11-06 — impôt unique prélevé à la source). v1.7 : le taux par défaut passe de 10 % à 30 % (arbitrage Thibaut 2026-11-06). v1.8 : affrontements de gangs — 2 pour 10 000 hab./an, **taux de jeu assumé** (aucune statistique réelle, arbitrage Thibaut 2026-11-06 : un affrontement par ~5 semaines dans une ville comptant au moins deux factions criminelles rivales).

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
2. **Salaires publics** : grilles FPT 2025 « à valider » contre le décret (JORFTEXT000051724928) — ordres de grandeur corrects, montants exacts à figer en phase 2.
3. **Effectifs pompiers** : extraits au niveau national en phase 2 (DGSCGC 2024 : 44 000 SPP, 198 900 SPV, 4 754 800 interventions ; détail dans `services.pompiers`). Le détail propre au SDIS 13 reste une piste d'affinage.
4. **Gros CSV OFGL** (comptes consolidés, balances comptables) : non téléchargeables via le robot — archivage d'extraits bruts prévu dans `data/sources/` (extraits uniquement, fichiers complets trop volumineux).
