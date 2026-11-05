# data/ — Référentiel de valeurs réelles

**[referentiel.json](referentiel.json)** (v1.3, 2026-11-05) : toutes les valeurs de calibration de la simulation, extraites de sources publiques françaises (Licence Ouverte v2 / Etalab sauf mention contraire).

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

`proba quotidienne = taux_par_10k_hab_an × P_figurines × K / 10000 / 365` avec **K = 1 000** (éditable). L'économie reste à l'échelle figurine : valeurs réelles par habitant appliquées telles quelles (impôt ≈ 4,0 L/PNJ/jour, achats ≈ 52,5 L/PNJ/jour, taux d'emprunt des collectivités 3,54 %/an).

## À affiner (suivi)

1. **Impôt quotidien** : proxy IFRAP (dépenses de fonctionnement BP Marseille, 1 455 €/hab./an). L'API OFGL (comptes consolidés) bloque l'accès automatisé ; le compte administratif de marseille.fr n'est pas extractible par robot. Piste : consultation manuelle + inscription de la valeur, ou agrégats publiés par commune.
2. **Salaires publics** : grilles FPT 2025 « à valider » contre le décret (JORFTEXT000051724928) — ordres de grandeur corrects, montants exacts à figer en phase 2.
3. **Effectifs pompiers** : extraits au niveau national en phase 2 (DGSCGC 2024 : 44 000 SPP, 198 900 SPV, 4 754 800 interventions ; détail dans `services.pompiers`). Le détail propre au SDIS 13 reste une piste d'affinage.
4. **Gros CSV OFGL** (comptes consolidés, balances comptables) : non téléchargeables via le robot — archivage d'extraits bruts prévu dans `data/sources/` (extraits uniquement, fichiers complets trop volumineux).
