// Tests modèle flux (phase 3.6) : redistribution du soir, plafond 88 %,
// calibrage des effectifs, faillite racontée. Exécution : npm test.

import test from "node:test";

import assert from "node:assert/strict";

import type {
  Etat
} from "./types.ts";

import {
  createMondeDefaut,
  nouveauPnj,
  supprimerPnj
} from "./monde.ts";

import {
  effectifMax,
  impotSur,
  monnaieEnCircuit,
  PART_SALARIALE_FLUX,
  passerJour,
  repartir
} from "./moteur.ts";

import {
  entrees,
  calme
} from "./outils-test.ts";

// ---------- phase 3.6 : compagnies privées, modèle flux ----------

test("effectifMax : le calibrage des effectifs d'un commerce (0,88 × recettes / 57,75)", () => {
  assert.equal(effectifMax(77400, 5775), 11, "0,88 × 774 / 57,75 ≈ 11,8 -> 11 employés max");
  assert.equal(effectifMax(0, 5775), 0, "pas de recettes, pas d'emploi");
  assert.equal(effectifMax(100000, 0), 0, "salaire nul : calibrage impossible, 0");
});

test("flux : un commerce redistribue le jour même, seul le patron garde sa marge (monde témoin)", () => {
  // Monde témoin : 1 commerce, 1 patron, 2 employés, 1 client, aucun service public.
  const base = calme(createMondeDefaut());
  const boutique = base.batiments.find((b) => b.type === "commerce")!;
  const monde: Etat = {
    ...base,
    batiments: [boutique],
    pnjs: [
      nouveauPnj({ prenom: "Jeanne", nom: "Test", statut: "commercant", batimentId: boutique.id, revenuIndicatif: 6000, compte: 0 }),
      nouveauPnj({ prenom: "Alban", nom: "Test", statut: "prive", travailBatimentId: boutique.id, revenuIndicatif: 5775, compte: 0 }),
      nouveauPnj({ prenom: "Brune", nom: "Test", statut: "prive", travailBatimentId: boutique.id, revenuIndicatif: 5775, compte: 0 }),
      nouveauPnj({ prenom: "Claire", nom: "Test", statut: "prive", personnalite: ["honnête", "discret"], revenuIndicatif: 5250, budgetAchat: 20000, compte: 200000 }),
    ],
  };
  const avant = monnaieEnCircuit(monde);
  const j1 = passerJour(monde);
  // Le client achète 200 L : tout atterrit chez le patron (l'impôt se paie
  // sur son compte, il ne réduit pas son budget d'achat).
  const recettes = j1.recettesCommerce![boutique.id];
  assert.equal(recettes, 20000);
  const plafond = Math.round(PART_SALARIALE_FLUX * recettes);
  // Salaires contractuels + primes = 88 % des recettes, racontés et payés.
  const flux = entrees(1, "flux", j1.journal);
  assert.equal(flux.length, 1);
  assert.equal(flux[0].montant, plafond, "le commerce ne garde que 12 % du flux");
  assert.ok(flux[0].texte.includes("redistribue") && flux[0].texte.includes("primes"), "la redistribution est racontée");
  assert.ok(flux[0].texte.includes("à la source"), "la retenue à la source est racontée");
  const employes = j1.pnjs.filter((p) => p.travailBatimentId === boutique.id);
  // 115,50 L de salaires dus + primes partagées à parts égales ; l'impôt à la
  // source (10 %) est retenu sur chaque versement (arbitrage 2026-11-06).
  const taux = monde.params.tauxImpotBp;
  const prime1 = Math.round((plafond - 11550) / 2);
  const prime2 = plafond - 11550 - prime1;
  assert.equal(
    employes[0].compte,
    (5775 - impotSur(5775, taux)) + prime1 - impotSur(prime1, taux),
  );
  assert.equal(
    employes[1].compte,
    (5775 - impotSur(5775, taux)) + prime2 - impotSur(prime2, taux),
  );
  // Le patron ne garde que sa marge patronale (12 %), moins l'impôt à la source.
  const marge = recettes - plafond;
  assert.equal(j1.pnjs[0].compte, marge - impotSur(marge, taux));
  assert.equal(monnaieEnCircuit(j1), avant, "conservation exacte : l'argent a seulement circulé");
});

test("flux : sur-embauche et caisses vides — prorata, salaires impayés, faillite racontée", () => {
  const base = calme(createMondeDefaut());
  const boutique = base.batiments.find((b) => b.type === "commerce")!;
  const monde: Etat = {
    ...base,
    batiments: [boutique],
    pnjs: [
      nouveauPnj({ prenom: "Jeanne", nom: "Test", statut: "commercant", batimentId: boutique.id, revenuIndicatif: 6000, compte: 0 }),
      // Cinq employés à 57,75 L/j : 288,75 L dus pour ~193 L de recettes.
      ...[1, 2, 3, 4, 5].map((i) =>
        nouveauPnj({ prenom: "Employe" + i, nom: "Test", statut: "prive", travailBatimentId: boutique.id, revenuIndicatif: 5775, compte: 0 }),
      ),
      nouveauPnj({ prenom: "Claire", nom: "Test", statut: "prive", personnalite: ["honnête", "discret"], revenuIndicatif: 5250, budgetAchat: 20000, compte: 200000 }),
    ],
  };
  const j1 = passerJour(monde);
  const recettes = j1.recettesCommerce![boutique.id];
  const salairesDus = 5 * 5775;
  const flux = entrees(1, "flux", j1.journal);
  assert.equal(flux.length, 1);
  assert.ok(flux[0].texte.includes("impayés") && flux[0].texte.includes("faillite"), "la faillite est racontée");
  // Prorata exact : les employés se partagent tout ce que le patron possédait,
  // moins l'impôt à la source retenu sur chaque part — la retenue rejoint
  // les caisses de la ville, rien ne se perd.
  const parts = repartir(recettes, [5775, 5775, 5775, 5775, 5775]);
  const taxe = parts.reduce((s, part) => s + impotSur(part, monde.params.tauxImpotBp), 0);
  const paye = j1.pnjs.filter((p) => p.travailBatimentId === boutique.id).reduce((s, p) => s + p.compte, 0);
  assert.equal(paye, recettes - taxe, "prorata au centime : tout est versé, rien de caché");
  assert.equal(j1.budgetVille, monde.budgetVille + taxe, "l'impôt retenu rejoint les caisses de la ville");
  assert.ok(salairesDus - paye - taxe > 0, "une partie des salaires reste due : " + (salairesDus - paye - taxe));
  assert.equal(j1.pnjs[0].compte, 0, "le patron a vidé ses caisses jusqu'au dernier centime");
});

test("flux : sans boutique ouverte, la ville ne s'équipe pas — rien ne sort (monde fermé)", () => {
  let m = calme(createMondeDefaut());
  // Tous les commerçants partis : plus aucune boutique, plus aucun service
  // à vocation ouvert (hôpital, BTP, banque inclus) — cohérent : un service
  // sans gérant est un service fermé.
  for (const p of m.pnjs.filter((p) => p.statut === "commercant")) m = supprimerPnj(m, p.id);
  const j1 = passerJour(m);
  const fonct = entrees(1, "fonctionnement", j1.journal)[0];
  assert.ok(fonct.texte.includes("aucune boutique ouverte"), "l'inaction est racontée");
  assert.equal(fonct.montant, 0, "le fonctionnement n'est pas dépensé");
  assert.equal(j1.sortiesCumulees, 0, "monde fermé : aucune sortie");
  // Seuls les salaires publics sortent des caisses (et l'impôt à la source
  // sur ces soldes y revient) : le reste n'a pas bougé.
  const impots = entrees(1, "impots", j1.journal)[0];
  const salaires = entrees(1, "salaires", j1.journal)[0];
  assert.equal(
    j1.budgetVille,
    m.budgetVille + (impots.montant ?? 0) - (salaires.montant ?? 0),
    "les caisses n'ont bougé que des salaires publics",
  );
  assert.equal(Object.keys(j1.recettesCommerce ?? {}).length, 0, "aucune recette de commerce");
});

test("flux : deux employés au Fournil Doré, la bascule stock vers flux en monde réel", () => {
  const m = calme(createMondeDefaut());
  const boulangerie = m.batiments.find((b) => b.nom.includes("Fournil"))!.id;
  // Les habitants commencent à l'indice 15 (après les agents publics et
  // municipaux, les commerçants et les trois gérants des services à vocation).
  m.pnjs[15] = { ...m.pnjs[15], travailBatimentId: boulangerie, revenuIndicatif: 5775 };
  m.pnjs[16] = { ...m.pnjs[16], travailBatimentId: boulangerie, revenuIndicatif: 5775 };
  const j1 = passerJour(m);
  const recettes = j1.recettesCommerce![boulangerie];
  const plafond = Math.round(PART_SALARIALE_FLUX * recettes);
  const entree = entrees(1, "flux", j1.journal).find((e) => e.texte.includes("Fournil"));
  assert.ok(entree !== undefined, "le Fournil raconte sa journée");
  assert.equal(entree!.montant, plafond, "88 % du flux repartent en salaires et primes le soir même");
  // Les deux autres commerces, sans employé, thésaurisent toujours (raconté).
  assert.equal(entrees(1, "flux", j1.journal).filter((e) => e.texte.includes("stock")).length, 2);
  assert.equal(j1.sortiesCumulees, 0, "rien ne sort du circuit quand les commerces sont ouverts");
});
