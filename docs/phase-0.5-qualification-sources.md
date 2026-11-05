# Phase 0.5 — Qualification des sources & état de l'art

> **Date :** 2026-11-05 · **Statut :** qualification réalisée, ville de référence arbitrée (Marseille) ; extraction du référentiel JSON à la suite.
> **Méthode :** inspection des métadonnées API data.gouv.fr, des pages INSEE/ministère de l'Intérieur, et veille web (requêtes FR + EN) sur les projets similaires.

---

## 1. Verdict global

**Toutes les sources nécessaires sont publiques, gratuites et sous licence ouverte** (Licence Ouverte v2 / Etalab). Aucune donnée payante ni captation restrictive n'est requise. Aucun blocage identifié pour la phase 1.

**Le projet n'existe pas déjà** sous cette forme : la veille (§4) ne trouve aucun jumeau numérique d'une ville LEGO personnelle avec PNJ nommés et calibration sur données publiques françaises réelles.

---

## 2. Sources qualifiées

| # | Source | Format | Licence | Granularité | Année(s) | Statut |
|---|---|---|---|---|---|---|
| 1 | [Comptes consolidés des communes 2018-2025](https://www.data.gouv.fr/datasets/comptes-consolides-des-communes-2018-2025) (OFG, data.gouv) | CSV, JSON, ZIP | **Licence Ouverte v2** (confirmée sur la page du jeu) | Par commune | 2012 → 2025 (ressources annuelles) | ✅ Qualifiée |
| 2 | [Balances comptables des communes 2024](https://www.data.gouv.fr/datasets/balances-comptables-des-communes-en-2024) (DGF, data.gouv) | CSV, JSON, ZIP, ODS | À confirmer (Lov2 attendue, même écosystème) | Par commune | 2024 | ✅ Qualifiée |
| 3 | [Police municipale : effectifs par commune](https://www.data.gouv.fr/datasets/police-municipale-effectifs-par-commune) (data.gouv) | ODS, XLSX | Licence Ouverte (fr-lo) | Par commune | 2015 → 2024, annuel | ✅ Qualifiée |
| 4 | [Effectifs de police municipale par commune 2013-2024](https://www.data.gouv.fr/datasets/effectifs-de-police-municipale-par-commune-france-entiere-2013-2024) (data.gouv) | **CSV** | Licence Ouverte v2 | Par commune (France entière) | 2013 → 2024 | ✅ Qualifiée — **recommandée** (CSV, 12 ans d'historique) |
| 5 | [Statistiques 2024 DGSCGC](https://www.interieur.gouv.fr/documentation/etudes-et-statistiques/statistiques-2024-dgscgc.html) (ministère de l'Intérieur) | Page web + PDF (Statistiques-SDIS25) | Information publique (réutilisation des données publiques) | National (taux par habitant calculables) | 2024 (édition SDIS25 à télécharger) | ✅ Qualifiée + **valeurs extraites** (§3) |
| 6 | [Caractéristiques des victimes et mis en cause](https://www.data.gouv.fr/datasets/principales-caracteristiques-des-victimes-enregistrees-et-des-mis-en-cause-pour-des-infractions-elucidees-par-la-police-et-la-gendarmerie-nationales) (SSMSI, data.gouv) + [Chiffres clés Insécurité et délinquance 2025](https://statistiques.interieur.gouv.fr/ssmsi/publications/chiffres-cles-insecurite-et-delinquance-edition-2025) | XLSX, PDF | Licence Ouverte v2 | National, mise à jour semestrielle | 2016 → 2025 | ✅ Qualifiée |
| 7 | [Enquête Budget de famille](https://www.insee.fr/fr/information/7652980) (INSEE) | Publications agrégées (INSEE Première…) | Licence ouverte (agrégats) ; micro-données à accès restreint (inutiles au projet) | Structure de consommation par poste | Édition 2026 (29 000 logements) ; agrégats disponibles avant | ✅ Qualifiée via agrégats |
| 8 | Grilles indiciaires FPT (salaires pompiers pro, police municipale) — [décrets Légifrance](https://www.legifrance.gouv.fr/loda/id/JORFTEXT000051724928/) (officiel) + synthèses 2025 | Texte réglementaire | Information publique | Par grade/échelon | 2025 | ✅ Qualifiée (vérifier la valeur du point d'indice) |
| 9 | Indicateurs démographiques INSEE (natalité, mortalité, ménages) | CSV / API insee.fr | Licence ouverte | National, départemental, communal | Millésime annuel | ✅ Qualifiée |

**Ville de référence (arbitrée 2026-11-05) : Marseille (~875 000 hab.)** — commune française la plus proche du million, couverte par toutes les sources communales ci-dessus (comptes consolidés, effectifs de police municipale). Une seule ville, pas de moyenne : le réalisme est un point de départ, pas l'objectif.

---

## 3. Valeurs réelles extraites (préfiguration du référentiel)

### Pompiers — DGSCGC 2024 (France ≈ 68,6 M hab.)

| Indicateur | Valeur 2024 | Taux par habitant |
|---|---|---|
| Interventions totales | 4 754 800 | ≈ 69,5 / 1 000 hab. / an |
| Incendies | 234 702 | ≈ **34,2 / 10 000 hab. / an** |
| Secours d'urgence aux personnes | 4 119 994 (dont 303 781 accidents de circulation) | ≈ 60,1 / 1 000 hab. / an |
| Risques technologiques | 56 031 | ≈ 0,8 / 10 000 hab. / an |
| Opérations diverses | 344 084 | ≈ 5,0 / 1 000 hab. / an |

*(Recalcul exact au référentiel avec la population retenue ; le PDF « Statistiques-SDIS25 » est la source à archiver dans le repo.)*

### Salaires publics indicatifs 2025 (grilles FPT, net mensuel — à valider contre Légifrance)

| Grade | Fourchette observée |
|---|---|
| Sapeur-pompier professionnel (début) | ≈ 1 806 – 1 944 € |
| Caporal | ≈ 1 836 – 2 353 € |
| Sergent | ≈ 1 821 – 2 370 € |
| Adjudant | ≈ 1 880 – 2 450 € |
| Lieutenant | ≈ 1 954 – 2 826 € |
| Agent de police municipale | ≈ 1 700 € |
| Adjoint technique territorial | ≈ 1 450 € |

### Coefficient d'intensité — arbitrage du 2026-11-05 : option C, K = 1 000

Le point de départ : avec le taux réel d'incendies (≈ 34,2 / 10 000 hab./an), P = 60 figurines et K = 10 000, la ville vivait **≈ 5,6 incendies/jour** (le rythme réel d'une métropole de 600 000 habitants) — incompatible avec des moyens à l'échelle figurine (quelques pompiers).

Trois options étaient sur la table : **A.** effectifs des services « imaginés » à l'échelle métropole · **B.** moyens figurine face au rythme métropole (crise permanente) · **C.** coefficient abaissé.

**Arbitrage : C — K = 1 000** (éditable dans les référentiels), au motif : *« l'objectif n'est pas d'être réaliste mais de s'amuser »*.

Conséquences avec P = 60 figurines et K = 1 000 :

- Incendies : 34,2 × 60 × 1 000 / 10 000 / 365 ≈ **0,56/jour** — ≈ 1 incendie tous les 2 jours : assez pour animer le journal, assez rare pour que les quelques pompiers de la ville restent à la hauteur ;
- Le curseur K reste le seul réglage de rythme : K = 100 = très calme, K = 1 000 = animé (défaut), K = 10 000 = frénétique ;
- Les secours aux personnes (≈ 60 % des interventions réelles) pourront être traités en incidents légers ou agrégés — choix d'implémentation en phase 2, dosé par le même K.

---

## 4. État de l'art — ce qui existe déjà (veille 2026-11-05)

**Verdict : le projet n'existe pas déjà.** Aucun outil trouvé ne combine (a) le jumeau numérique d'une **ville LEGO personnelle réelle**, (b) des **PNJ nommés avec comptes en banque en circuit économique fermé**, (c) une **calibration sur des données publiques françaises réelles**.

| Catégorie | Exemples trouvés | Ce qu'ils font — et ce qui nous manque chez eux |
|---|---|---|
| Simulations urbaines open source à agents individuels | [emergent-city](https://github.com/leatag/emergent-city) (agents avec personnalités, besoins, économie, crime — Python/Pygame), [manyworld](https://github.com/alinojoumi8/manyworld) (agents qui travaillent, échangent, bâtissent), [AgentSociety](https://deepwiki.com/tsinghua-fib-lab/AgentSociety/12.2-mobility-and-economic-simulations) (Tsinghua, agents LLM, mobilité et économie) | Villes fictives générées, pas de ville physique du joueur, pas de données réelles, pas de LEGO |
| LEGO + simulation (recherche) | [CityScope](https://www.media.mit.edu/projects/cityscope/) (MIT Media Lab) — interface tangible en briques + simulation urbaine pour ateliers de planification | Le plus proche en esprit « LEGO + simu », mais outil d'aide à la décision urbanistique : pas de PNJ, pas d'économie individuelle, pas de ville personnelle |
| Jeux commerciaux à citoyens individuels | The Sims (foyers), Dwarf Fortress (individus avec possessions — le plus profond, mais colonie fantasy), Cities: Skylines / SimCity (citoyens abstraits, économie agrégée) | Aucun ne simule l'argent de chaque citoyen nommé dans une ville réelle du joueur |
| LEGO officiel | [LEGO Tower](https://play.google.com/store/apps/details?id=com.nimblebit.legotower&hl=fr) (gestion de tour, citoyens fictifs), LEGO City Build and Protect (mini city-builder HTML5) | Jeux de gestion fiction, sans ville réelle ni données réelles |

**Positionnement du projet LEGO (le nôtre) :** unique par la combinaison « ma ville LEGO réelle » + « chaque figurine est un habitant nommé avec ses finances » + « les taux et budgets viennent des données publiques françaises ». Inspirations à garder en vue : Dwarf Fortress (profondeur de l'individu), CityScope (le LEGO comme objet tangible), emergent-city (architecture d'agents open source).

---

## 5. Recommandations pour la suite (extraction du référentiel)

1. **Ville de référence : Marseille** (~875 000 hab.) — arbitré 2026-11-05. Extraire en priorité ses valeurs par habitant dans les sources #1, #3, #4.
2. **Priorité d'extraction** : (1) budget par habitant (source #1), (2) taux d'incidents DGSCGC/SSMSI (sources #5, #6), (3) grilles salariales FPT (#8), (4) structure de consommation (#7), (5) effectifs police/pompiers (#3, #4).
3. **Archivage** : télécharger les fichiers sources (CSV/PDF) dans le repo (dossier `data/sources/`) pour que le référentiel reste reproductible même si une source disparaît.
4. **Traçabilité** : chaque valeur du référentiel JSON porte `source`, `url`, `annee` et `granularite` (règle du cahier des charges §5).
5. **Coefficient d'intensité** : K = 1 000 par défaut, éditable dans les référentiels (arbitrage « fun » du 2026-11-05).
