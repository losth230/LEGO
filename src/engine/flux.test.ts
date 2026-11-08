// Tests modèle flux (phase 3.6) : redistribution du soir, plafond 88 %,
// calibrage des effectifs, faillite racontée. Exécution : npm test.

import test from "node:test";

import assert from "node:assert/strict";

import type {
  Etat
} from "./types.ts";

import {
  nouveauBatiment,
  nouveauPnj,
  supprimerBatiment,
  supprimerPnj
} from "./monde.ts";
import { createMondeDemonstration } from "./monde.demo.ts";

import {
  boutiquesDuPatron,
  commercesPourAcheteur,
  effectifMax,
  impotSur,
  monnaieEnCircuit,
  PART_SALARIALE_FLUX,
  passerJour,
  patronDuCommerce,
  repartir
} from "./moteur.ts";
import { migrerEtat, SCHEMA_VERSION_ETAT } from "./migrations.ts";

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
  const base = calme(createMondeDemonstration());
  const boutique = base.batiments.find((b) => b.type === "commerce")!;
  const monde: Etat = {
    ...base,
    batiments: [boutique],
    // v1.25 : le témoin reste hermétique — pas de flotte, donc pas d'essence
    // dans les recettes (l'essence redistribuée a ses propres tests).
    vehicules: [],
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
  const base = calme(createMondeDemonstration());
  const boutique = base.batiments.find((b) => b.type === "commerce")!;
  const monde: Etat = {
    ...base,
    batiments: [boutique],
    // v1.25 : le témoin reste hermétique — pas de flotte, donc pas d'essence
    // dans les recettes (l'essence redistribuée a ses propres tests).
    vehicules: [],
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
  let m = calme(createMondeDemonstration());
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
  const m = calme(createMondeDemonstration());
  const boulangerie = m.batiments.find((b) => b.nom.includes("Fournil"))!.id;
  // Les habitants commencent à l'indice 18 (après les agents publics et
  // municipaux, les commerçants, les quatre gérants des services à
  // vocation — la station-service v1.25 s'ajoute à hôpital/BTP/banque —
  // et l'équipe du bureau de poste v1.22 : receveur + facteur).
  m.pnjs[18] = { ...m.pnjs[18], travailBatimentId: boulangerie, revenuIndicatif: 5775 };
  m.pnjs[19] = { ...m.pnjs[19], travailBatimentId: boulangerie, revenuIndicatif: 5775 };
  const j1 = passerJour(m);
  const recettes = j1.recettesCommerce![boulangerie];
  const plafond = Math.round(PART_SALARIALE_FLUX * recettes);
  const entree = entrees(1, "flux", j1.journal).find((e) => e.texte.includes("Fournil"));
  assert.ok(entree !== undefined, "le Fournil raconte sa journée");
  assert.equal(entree!.montant, plafond, "88 % du flux repartent en salaires et primes le soir même");
  // Les deux autres boutiques sans employé (friterie, quincaillerie) et la
  // station-service (v1.25 : son pompiste n'a pas d'employé, il encaisse
  // l'essence du jour) thésaurisent (raconté) ; le bureau de poste, lui,
  // paie son facteur (v1.22) : il ne thésaurise pas.
  assert.equal(entrees(1, "flux", j1.journal).filter((e) => e.texte.includes("stock")).length, 3);
  const poste = entrees(1, "flux", j1.journal).find((e) => e.texte.includes("Bureau de poste"));
  assert.ok(
    poste !== undefined && !poste.texte.includes("stock"),
    "le bureau de poste paie son facteur (v1.22) : il ne thésaurise pas",
  );
  assert.equal(j1.sortiesCumulees, 0, "rien ne sort du circuit quand les commerces sont ouverts");
});


// ---------- v1.33 « L'empire de Mario » : patron de plusieurs commerces ----------

/** Monde témoin hermétique : deux boutiques pures, un patron unique, un
 * employé dans la première, une cliente. K = 1 (calme), traits honnêtes :
 * on isole le flux pour suivre les comptes au centime. */
function empireMario() {
  const base = calme(createMondeDemonstration());
  const b1 = nouveauBatiment({ nom: "Friterie de Mario", type: "commerce" });
  const b2 = nouveauBatiment({ nom: "Station de Mario", type: "commerce" });
  const mario = nouveauPnj({
    prenom: "Mario", nom: "Rossi", statut: "commercant", batimentId: b1.id,
    // v1.33 : LA liste fait foi — Mario possède les deux boutiques.
    commercesId: [b1.id, b2.id],
    revenuIndicatif: 6000, budgetAchat: 0, compte: 0, personnalite: ["honnête", "discret"],
  });
  const alban = nouveauPnj({
    prenom: "Alban", nom: "Test", statut: "prive", travailBatimentId: b1.id,
    revenuIndicatif: 5775, budgetAchat: 0, compte: 0, personnalite: ["honnête", "discret"],
  });
  const claire = nouveauPnj({
    prenom: "Claire", nom: "Test", statut: "prive", revenuIndicatif: 5250,
    budgetAchat: 20000, compte: 200000, personnalite: ["honnête", "discret"],
  });
  const monde: Etat = { ...base, batiments: [b1, b2], vehicules: [], pnjs: [mario, alban, claire] };
  return { monde, b1, b2, mario, alban, claire };
}

test("v1.33 : l'empire de Mario — les deux boutiques encaissent, chacune redistribue de son côté", () => {
  const { monde, b1, b2, mario, alban, claire } = empireMario();
  // La liste fait foi : le moteur voit bien les deux boutiques du patron.
  assert.deepEqual(boutiquesDuPatron(monde, mario).map((b) => b.id), [b1.id, b2.id]);
  assert.equal(commercesPourAcheteur(monde, mario).length, 0, "un patron n'achète chez lui, dans aucune de ses boutiques");
  assert.equal(commercesPourAcheteur(monde, claire).length, 2, "la cliente, elle, a les deux boutiques ouvertes");
  const taux = monde.params.tauxImpotBp;
  const avant = monnaieEnCircuit(monde);
  const j1 = passerJour(monde);
  // La cliente achète 200 L, répartis entre les deux boutiques ouvertes.
  assert.equal(j1.recettesCommerce![b1.id], 10000, "la friterie encaisse sa moitié");
  assert.equal(j1.recettesCommerce![b2.id], 10000, "la station encaisse l'autre moitié");
  // Chaque boutique redistribue de son côté : la friterie paie son employé
  // (88 % du flux en salaires et primes), la station sans salarié garde tout.
  const flux = entrees(1, "flux", j1.journal);
  assert.equal(flux.length, 2, "une entrée par boutique du patron");
  assert.ok(flux.some((e) => e.texte.includes("Friterie") && e.texte.includes("redistribue")), "la friterie redistribue");
  assert.ok(flux.some((e) => e.texte.includes("Station") && e.texte.includes("stock")), "la station thésaurise (stock)");
  // Comptes au centime : marge de la friterie (12 %) + recettes de la
  // station gardées, moins l'impôt à la source sur chaque gain du patron.
  const marioApres = j1.pnjs.find((p) => p.id === mario.id)!;
  const attenduMario = 20000 - 8800 - impotSur(1200, taux) - impotSur(10000, taux);
  assert.equal(marioApres.compte, attenduMario, "le patron encaisse les deux caisses, marge par marge");
  // L'employé est payé par la seule caisse de la friterie (modèle flux).
  const albanApres = j1.pnjs.find((p) => p.id === alban.id)!;
  assert.equal(
    albanApres.compte,
    (5775 - impotSur(5775, taux)) + (3025 - impotSur(3025, taux)),
    "salaire + prime payés sur les recettes de la friterie uniquement",
  );
  // Monde fermé : rien ne disparaît, même avec deux boutiques au même patron.
  assert.equal(monnaieEnCircuit(j1), avant, "la conservation exacte tient avec l'empire");
});

test("v1.33 : migration v15 -> v16 — la liste des boutiques naît du bâtiment lié, à l'identique", () => {
  const { monde, b1, b2, mario } = empireMario();
  // Un état v15 : les figurines n'ont pas encore commercesId.
  const v15 = {
    ...monde,
    schemaVersion: 15,
    pnjs: monde.pnjs.map((p) => {
      const sans = { ...p };
      delete sans.commercesId;
      return sans;
    }),
  };
  const migre = migrerEtat(v15);
  assert.equal(migre.schemaVersion, SCHEMA_VERSION_ETAT, "l'état monte au schéma 16");
  const marioMigre = migre.pnjs.find((p) => p.id === mario.id)!;
  // v15 : Mario n'était patron que via son bâtiment lié (la friterie) —
  // la migration lui donne exactement cette boutique, ni plus ni moins.
  assert.deepEqual(marioMigre.commercesId, [b1.id], "la liste naît du bâtiment lié");
  assert.deepEqual(migre.pnjs.find((p) => p.prenom === "Alban")!.commercesId, [], "un privé ne possède rien");
  assert.equal(patronDuCommerce(migre, b1.id)?.id, mario.id, "Mario reste patron de sa friterie");
  assert.equal(patronDuCommerce(migre, b2.id), undefined, "la station reste sans patron — rien d'inventé");
  // Re-ingestion idempotente : la liste déjà là est conservée telle quelle.
  const encore = migrerEtat(migre);
  assert.deepEqual(
    encore.pnjs.map((p) => p.commercesId),
    migre.pnjs.map((p) => p.commercesId),
    "re-migrer ne change plus rien",
  );
});

test("v1.33 : une boutique supprimée quitte la liste de son patron", () => {
  const { monde, b1, b2, mario, alban } = empireMario();
  const apres = supprimerBatiment(monde, b1.id);
  const marioApres = apres.pnjs.find((p) => p.id === mario.id)!;
  assert.deepEqual(marioApres.commercesId, [b2.id], "la friterie fermée quitte la liste de possession");
  assert.equal(patronDuCommerce(apres, b2.id)?.id, mario.id, "il reste patron de sa station");
  assert.equal(apres.pnjs.find((p) => p.id === alban.id)!.travailBatimentId, null, "l'employé de la friterie perd son emploi");
});

test("v1.33 : un commerce n'a qu'un patron actif — le premier propriétaire trouvé", () => {
  const { monde, b1, b2, mario } = empireMario();
  // État bricolé à la main : un rival revendique aussi la friterie.
  const rival = nouveauPnj({
    prenom: "Rival", nom: "Test", statut: "commercant",
    commercesId: [b1.id], revenuIndicatif: 6000, budgetAchat: 0, compte: 0,
  });
  const bricole = { ...monde, pnjs: [rival, ...monde.pnjs] };
  assert.equal(patronDuCommerce(bricole, b1.id)?.id, rival.id, "le premier propriétaire trouvé encaisse");
  assert.equal(patronDuCommerce(bricole, b2.id)?.id, mario.id, "la station, elle, reste à Mario");
  assert.equal(commercesPourAcheteur(bricole, rival).length, 1, "le rival n'achète que chez Mario");
});
