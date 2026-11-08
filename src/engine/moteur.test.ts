// Tests moteur — économie de base : monnaie, impôt à la source, achats,
// migrations d'état corrompu (phases 1, 3.8). Exécution : npm test.

import test from "node:test";

import assert from "node:assert/strict";

import type {
  Etat
} from "./types.ts";

import {
  accueillirArrivant,
  ajouterPnj,
  ajouterVehicule,
  createMondeDefaut,
  modifierPnj,
  modifierVille,
  nouveauBatiment,
  nouveauPnj,
  nouveauVehicule,
  supprimerVehicule
} from "./monde.ts";
import { createMondeDemonstration } from "./monde.demo.ts";

import {
  migrerEtat
, SCHEMA_VERSION_ETAT } from "./migrations.ts";

import {
  impotSur,
  monnaieEnCircuit,
  passerJour,
  serviceLocal
} from "./moteur.ts";

import {
  COEFF_INTENSITE_DEFAUT,
  salaireJourL,
  TAUX_IMPOT_DEFAUT_BP
} from "./referentiel.ts";

import {
  entrees,
  calme,
  sansEmployePrive
} from "./outils-test.ts";

test("ville de démonstration : 16 bâtiments, 62 figurines (garnison, brigade, gang, bureau de poste et équipe du BTP inclus), jour 0", () => {
  const m = createMondeDemonstration();
  assert.equal(m.batiments.length, 16);
  assert.equal(m.pnjs.length, 62);
  assert.equal(m.jour, 0);
  assert.equal(m.params.tauxImpotBp, TAUX_IMPOT_DEFAUT_BP);
  const services = m.batiments.filter((b) => b.type === "service_public");
  assert.equal(services.length, 4);
  const agents = m.pnjs.filter((p) => p.statut === "agent_public");
  assert.equal(agents.length, 9);
  // Monde 100 % fermé : 4 boutiques de consommation (dont le bureau de
  // poste, v1.22) + 4 services à vocation (hôpital, BTP, banque et
  // station-service — arbitrage Thibaut v1.25 : c'est elle qui gère la
  // pompe et les accidents, pas le BTP), chacun tenu par son gérant. La
  // détention se joue au commissariat (Poste de police), pas dans un
  // bâtiment dédié.
  const boutiques = m.batiments.filter((b) => b.type === "commerce" && b.boutique);
  assert.equal(boutiques.length, 4);
  assert.ok(serviceLocal(m, "sante") !== null, "l'hôpital est en ville et tenu");
  assert.ok(serviceLocal(m, "btp") !== null, "le BTP est en ville et tenu");
  assert.ok(serviceLocal(m, "banque") !== null, "la banque est en ville et tenue");
  assert.ok(serviceLocal(m, "garage") !== null, "la station-service est en ville et tenue");
  assert.equal(m.batiments.filter((b) => b.type === "commerce").length, 8);
});

test("monde par défaut (v1.30) : le terrain nu + l'équipe BTP qui débarque", () => {
  const m = createMondeDefaut();
  assert.equal(m.batiments.length, 0, "aucun bâtiment : le terrain est nu");
  assert.equal(m.pnjs.length, 3, "l'équipe BTP : Samantha, Didier, Thomas");
  assert.equal((m.vehicules ?? []).length, 2, "les deux engins de l'équipe");
  assert.equal((m.gangs ?? []).length, 0, "aucun gang");
  assert.equal(m.jour, 0);
  assert.equal(m.budgetVille, 500000, "5 000 L en caisse");
  // Monnaie en circuit : la caisse de la ville + les poches de l'équipe
  // (Samantha 5 500 L, Didier 4 000 L, Thomas 4 000 L).
  assert.equal(monnaieEnCircuit(m), 1850000, "la monnaie : la ville + l'équipe");
  assert.equal(m.dette, 0);
  assert.equal(m.journal.length, 1, "une seule entrée : le coup de crayon inaugural");
  assert.ok(m.journal[0].texte.includes("équipe du BTP"), "le journal raconte l'arrivée de l'équipe");
  // L'équipe (v1.28-v1.29) : les engins sont à la patronne, pleins.
  const samantha = m.pnjs.find((p) => p.prenom === "Samantha")!;
  assert.ok(
    (m.vehicules ?? []).every((v) => v.proprietairePnjId === samantha.id),
    "la bétonnière et le tractopelle appartiennent à Samantha",
  );
  assert.ok(
    (m.vehicules ?? []).every((v) => v.role === "chantier" && v.carburant === 50),
    "deux engins de chantier, réservoirs pleins (50 L)",
  );
  const didier = m.pnjs.find((p) => p.prenom === "Didier")!;
  const thomas = m.pnjs.find((p) => p.prenom === "Thomas")!;
  assert.ok(didier.travailBatimentId === null && thomas.travailBatimentId === null,
    "sans bâtiment en ville, l'équipe n'a pas encore d'employeur");
});

test("terrain nu : trente jours sans crash, la monnaie ne bouge pas d'un centime", () => {
  // Coefficient d'intensité à 0 : aucune probabilité d'incident — l'équipe
  // est là mais rien ne doit perturber la conservation.
  let e = modifierVille(createMondeDefaut(), { coeffIntensite: 0 });
  const initial = monnaieEnCircuit(e);
  for (let i = 0; i < 30; i++) e = passerJour(e);
  assert.equal(e.jour, 30, "les jours passent, même sur un terrain nu");
  assert.equal(monnaieEnCircuit(e), initial, "rien n'entre, rien ne sort : la monnaie intacte");
  assert.equal(e.sortiesCumulees, 0, "monde fermé");
  assert.equal(e.pnjs.length, 3, "l'équipe est toujours là, sans employeur ni boutique");
  assert.equal(e.batiments.length, 0, "toujours rien de bâti");
  assert.equal((e.arbitrages ?? []).length, 0, "aucun incident tiré (K = 0)");
});

test("arrivant (v1.30) : seul, il débarque et le journal raconte l'installation", () => {
  const m = createMondeDefaut();
  const avant = monnaieEnCircuit(m);
  const apres = accueillirArrivant(m, {
    pnj: nouveauPnj({ prenom: "Nora", nom: "Nguyen", metier: "factrice", statut: "prive" }),
  });
  assert.equal(apres.pnjs.length, 4, "l'équipe + la nouvelle arrivante");
  assert.equal(apres.batiments.length, 0, "aucune maison demandée");
  assert.equal((apres.vehicules ?? []).length, 2, "aucun véhicule demandé");
  assert.ok(apres.journal.some((e) => e.texte.includes("Nora Nguyen débarque en ville")), "l'installation est racontée");
  assert.equal(monnaieEnCircuit(apres), avant + 400000, "l'arrivante apporte sa cagnotte (4 000 L) : le monde fermé grandit avec elle");
  assert.equal(m.pnjs.length, 3, "l'état source n'est pas muté");
});

test("arrivant (v1.30) : avec maison et véhicule, tout est relié d'emblée", () => {
  const m = createMondeDefaut();
  const maison = nouveauBatiment({ nom: "Maison de Rémi", type: "habitation", capaciteLogements: 1, valeur: 300000 });
  const camion = nouveauVehicule({ nom: "Camion de Rémi", categorie: "prive", role: "chantier", efficacite: 3, essenceJour: 0, valeur: 80000 });
  const apres = accueillirArrivant(m, {
    pnj: nouveauPnj({ prenom: "Rémi", nom: "Débarde", metier: "maçon", statut: "prive" }),
    maison,
    vehicule: camion,
  });
  assert.equal(apres.batiments.length, 1, "la maison entre en ville");
  assert.equal(apres.pnjs.length, 4, "l'arrivant entre en ville");
  const remi = apres.pnjs.find((p) => p.prenom === "Rémi")!;
  assert.equal(remi.batimentId, maison.id, "l'arrivant loge dans sa maison dès l'arrivée");
  const vehicule = apres.vehicules!.find((v) => v.nom === "Camion de Rémi")!;
  assert.equal(vehicule.proprietairePnjId, remi.id, "le véhicule est à son nom");
  assert.equal(vehicule.role, "chantier");
  assert.equal(vehicule.carburant, 50, "un engin de chantier arrive le réservoir plein");
  assert.ok(apres.journal.some((e) => e.texte.includes("Maison de Rémi")), "la maison est racontée");
  assert.ok(apres.journal.some((e) => e.texte.includes("réservoir plein")), "l'engin est raconté");
  // Le monde reste sain : une journée passe sans perdre un centime.
  const calmeApres = modifierVille(apres, { coeffIntensite: 0 });
  const avant = monnaieEnCircuit(calmeApres);
  const j1 = passerJour(calmeApres);
  assert.equal(monnaieEnCircuit(j1), avant, "conservation : l'installation ne coûte rien à personne");
});

test("un jour : impôts retenus à la source, salaires versés, sorties tracées, achats encaissés", () => {
  // Ce test vérifie l'arithmétique de l'impôt sans employé privé : le
  // facteur du bureau de poste (v1.22) est détaché — le flux avec employé
  // est couvert par flux.test.ts.
  const m = sansEmployePrive(calme(createMondeDemonstration()));
  const taux = m.params.tauxImpotBp;
  const attenduSalaires = m.pnjs
    .filter((p) => p.statut === "agent_public")
    .reduce((s, p) => s + Math.round(salaireJourL(p.grade ?? "") * 100), 0);
  const j1 = passerJour(m);
  assert.equal(j1.jour, 1);
  assert.equal(m.jour, 0, "l'état source n'est pas muté");
  // Impôt à la source (arbitrage 2026-11-06) : X % des soldes versées
  // + X % des marges ; sans employé, la marge du patron = ses recettes.
  const attenduAgents = m.pnjs
    .filter((p) => p.statut === "agent_public")
    .reduce((s, p) => s + impotSur(Math.round(salaireJourL(p.grade ?? "") * 100), taux), 0);
  const attenduPatrons = Object.values(j1.recettesCommerce!).reduce(
    (s, v) => s + impotSur(v, taux),
    0,
  );
  const impots = entrees(1, "impots", j1.journal);
  assert.equal(impots.length, 1);
  assert.equal(impots[0].montant, attenduAgents + attenduPatrons);
  assert.ok(impots[0].texte.includes("à la source"), "la retenue à la source est racontée");
  const salaires = entrees(1, "salaires", j1.journal);
  assert.equal(salaires[0].montant, attenduSalaires);
  const fonct = entrees(1, "fonctionnement", j1.journal);
  assert.equal(fonct[0].montant, 8000); // 4 services : 20 + 15 + 15 + 30 L (caserne militaire incluse)
  const achats = entrees(1, "achats", j1.journal);
  assert.equal(achats.length, 1);
  assert.ok((achats[0].montant ?? 0) > 0);
  assert.equal(entrees(1, "solde", j1.journal).length, 1);
  // Entrées économiques par jour : impôts, salaires, fonctionnement, achats,
  // flux (3 commerces, testés séparément) et solde.
  for (const typeAtt of ["impots", "salaires", "fonctionnement", "achats", "solde"]) {
    assert.equal(entrees(1, typeAtt, j1.journal).length, 1, typeAtt);
  }
  assert.equal(entrees(1, "flux", j1.journal).length, 5, "quatre boutiques et la station-service racontent leur flux");
  // Sans employé, un commerce thésaurise : la phase 3.6 le raconte (stock).
  // (Le facteur du bureau de poste est détaché pour ce test : voir plus haut.)
  assert.ok(
    entrees(1, "flux", j1.journal).every((e) => e.texte.includes("stock")),
    "l'accumulation sans employé est racontée",
  );
  // Recettes du dernier jour persistées (calibrage des effectifs).
  assert.ok(j1.recettesCommerce !== undefined);
  assert.equal(Object.keys(j1.recettesCommerce!).length, 5);
  for (const [id, v] of Object.entries(j1.recettesCommerce!)) {
    // La station-service (vocation « garage ») n'encaisse que l'essence du
    // jour (35 L : 27 de flotte + 8 de privés) — pas d'achats de consommation.
    if (j1.batiments.find((b) => b.id === id)?.vocations.includes("garage")) {
      assert.ok(v > 0 && v <= 4000, "station : l'essence du jour : " + v);
    } else {
      assert.ok(v > 70000, "recettes: " + v);
    }
  }
  // Fonctionnement rerouté : la ville achète sur place (montant identique).
  assert.ok(fonct[0].texte.includes("commerces locaux"), "l'achat sur place est raconté");
});

test("conservation de la monnaie sur 30 jours (circuit fermé exact)", () => {
  const m = createMondeDemonstration();
  const initial = monnaieEnCircuit(m);
  let e: Etat = m;
  for (let i = 0; i < 30; i++) e = passerJour(e);
  assert.equal(e.sortiesCumulees, 0, "monde 100 % fermé : aucune sortie documentée");
  assert.equal(e.pertesCumulees, 0, "le crime ne détruit plus la monnaie");
  const restant = monnaieEnCircuit(e);
  assert.equal(
    restant,
    initial + e.mouvementsBanqueCumules - e.sortiesCumulees - e.pertesCumulees,
  );
  assert.equal(restant, initial, "rien n'a disparu : même les butins restent en ville");
  // chaque figurine a un compte positif ou nul, aucun NaN
  for (const p of e.pnjs) {
    assert.ok(Number.isFinite(p.compte) && p.compte >= 0, p.prenom);
  }
  assert.ok(Number.isFinite(e.budgetVille));
  assert.equal(e.jour, 30);
  // le journal a grossi chaque jour : 30 x 5 entrées économiques minimum
  // (plus les incidents tirés au K par défaut) + l'entrée du jour 0
  assert.ok(e.journal.length >= 151, "journal: " + e.journal.length);
  assert.ok(e.journal.some((x) => x.type === "incident"), "au moins un incident en 30 jours");
});

test("le vendeur de frites encaisse les achats des habitants", () => {
  const m = calme(createMondeDemonstration());
  const avant = m.pnjs.find((p) => p.prenom === "Mario")!.compte;
  const j1 = passerJour(m);
  const mario = j1.pnjs.find((p) => p.prenom === "Mario")!;
  assert.ok(mario.compte > avant, "Mario doit s'enrichir");
  // les 44 autres figurines achètent chez 3 commerçants ; Mario ne peut pas
  // acheter chez lui : il achète dans les 2 autres boutiques.
  assert.ok(mario.compte - avant > 50000, "encaissement journalier > 500 L");
});

test("impôt à la source : sans gain, pas d'impôt — même à sec", () => {
  // Même neutralisation que le test « un jour » : sans employé privé,
  // la retenue patronale se confond avec l'impôt sur les recettes.
  const m = sansEmployePrive(calme(createMondeDemonstration()));
  const taux = m.params.tauxImpotBp;
  m.pnjs[17] = { ...m.pnjs[17], compte: 100 }; // 1,00 L, aucun gain à venir (première habitante)
  const j1 = passerJour(m);
  const impots = entrees(1, "impots", j1.journal);
  // Le PNJ à sec n'a rien gagné dans la journée : il n'est pas imposé du tout.
  const attenduAgents = m.pnjs
    .filter((p) => p.statut === "agent_public")
    .reduce((s, p) => s + impotSur(Math.round(salaireJourL(p.grade ?? "") * 100), taux), 0);
  const attenduPatrons = Object.values(j1.recettesCommerce!).reduce(
    (s, v) => s + impotSur(v, taux),
    0,
  );
  assert.equal(impots[0].montant, attenduAgents + attenduPatrons);
  // Son unique L a servi ses achats, pas l'impôt.
  assert.equal(j1.pnjs[17].compte, 0);
});

test("taux d'imposition : plus de taux, plus de recettes", () => {
  const m = createMondeDemonstration();
  const m2 = modifierVille(m, { tauxImpotBp: m.params.tauxImpotBp + 100 });
  const j1 = passerJour(m);
  const j2 = passerJour(m2);
  const i1 = entrees(1, "impots", j1.journal)[0].montant ?? 0;
  const i2 = entrees(1, "impots", j2.journal)[0].montant ?? 0;
  assert.ok(i2 > i1);
});

test("ville pauvre : salaires et fonctionnement payés au prorata des caisses", () => {
  const m = createMondeDemonstration();
  // L'impôt est retenu à la source sur les soldes : une part des caisses
  // revient immédiatement, mais avec 3,00 L le prorata reste total — on
  // force un monde sans contribuables privés, aux caisses vides.
  const vide: Etat = {
    ...calme(m),
    pnjs: m.pnjs.filter((p) => p.statut === "agent_public"),
  };
  vide.budgetVille = 300;
  const j2 = passerJour(vide);
  assert.equal(j2.budgetVille, 0);
  const salaires = entrees(1, "salaires", j2.journal)[0];
  assert.ok(salaires.texte.includes("caisses"));
  assert.equal(j2.sortiesCumulees, 0, "aucun fournisseur payé, rien à payer");
});

test("sans commerce, personne ne dépense et l'argent reste en place", () => {
  const m = calme(createMondeDemonstration());
  m.batiments = m.batiments.filter((b) => b.type !== "commerce");
  const avant = monnaieEnCircuit(m);
  const j1 = passerJour(m);
  const achats = entrees(1, "achats", j1.journal);
  assert.equal(achats.length, 1, "le journal raconte la journée sans commerce");
  assert.equal(achats[0].montant, 0);
  const apres = monnaieEnCircuit(j1);
  assert.equal(apres, avant - j1.sortiesCumulees);
  assert.ok(j1.journal.some((e) => e.texte.includes("nulle part où dépenser")));
});

test("l'épargne n'est pas touchée par le moteur", () => {
  const m = createMondeDemonstration();
  m.pnjs[5] = { ...m.pnjs[5], epargne: 123456 };
  let e = m;
  for (let i = 0; i < 5; i++) e = passerJour(e);
  assert.equal(e.pnjs[5].epargne, 123456);
});

test("migrations : état corrompu -> monde par défaut ; état v1 complété", () => {
  // v1.30 : le monde par défaut est le terrain nu + l'équipe BTP —
  // un état corrompu ou une version future repart de ce départ.
  const nue = migrerEtat(null);
  assert.equal(nue.jour, 0);
  assert.equal(nue.pnjs.length, 3, "l'équipe BTP dans le monde par défaut");
  assert.equal(nue.batiments.length, 0, "aucun bâtiment");
  assert.equal((nue.gangs ?? []).length, 0, "aucun gang");
  assert.equal(nue.budgetVille, 500000, "5 000 L en caisse pour bâtir");
  assert.equal(migrerEtat("n'importe quoi").pnjs.length, 3);
  const futur = migrerEtat({ schemaVersion: 99 });
  assert.equal(futur.pnjs.length, 3, "version future -> monde par défaut (l'équipe)");
  // Complétion v1 -> v8 sur une vraie ville (la démo) : les figurines
  // existantes sont conservées, les champs manquants complétés.
  const demo = createMondeDemonstration();
  const m = migrerEtat({ ...demo, schemaVersion: 1, jour: 5 });
  assert.equal(m.jour, 5, "le jour est conservé");
  assert.equal(m.pnjs.length, 62, "les figurines sont conservées");
  assert.ok(Array.isArray(m.journal) && Array.isArray(m.pnjs) && Array.isArray(m.batiments));
  assert.ok(typeof m.budgetVille === "number" && typeof m.params.tauxImpotBp === "number");
  assert.equal(m.params.coeffIntensite, COEFF_INTENSITE_DEFAUT, "v1 -> v2 : K complété au défaut");
  assert.equal(m.pertesCumulees, 0, "v1 -> v2 : pertes initialisées");
  assert.equal(m.volsCumules, 0, "v6 -> v7 : vols cumulés initialisés");
  assert.equal(m.schemaVersion, SCHEMA_VERSION_ETAT, "v1 -> v16 : schema à jour");
  assert.equal(
    m.params.tauxImpotBp,
    TAUX_IMPOT_DEFAUT_BP,
    "v4 et moins : la base fiscale change, retour au taux par défaut",
  );
  assert.equal(m.dette, 0, "v2 -> v3 : dette initialisée");
  assert.equal(m.mouvementsBanqueCumules, 0, "v2 -> v3 : mouvements banque initialisés");
  assert.ok(
    m.pnjs.every((p) => p.travailBatimentId === null || typeof p.travailBatimentId === "string"),
    "v3 -> v4 : champ lieu de travail initialisé (null, ou déjà renseigné — le facteur du bureau de poste, v1.22)",
  );
  assert.deepEqual(m.recettesCommerce, {}, "v3 -> v4 : recettes des commerces initialisées");
  // v5 : le taux réglé par le joueur est conservé, la vocation est complétée.
  const v5 = migrerEtat({
    schemaVersion: 5,
    jour: 3,
    params: { tauxImpotBp: 555, coeffIntensite: 2 },
  });
  assert.equal(v5.jour, 3, "v5 : le jour est conservé");
  assert.equal(v5.params.tauxImpotBp, 555, "v5 : le taux choisi par le joueur est conservé");
  assert.equal(v5.params.coeffIntensite, 2, "v5 : K conservé");
  assert.equal(v5.schemaVersion, SCHEMA_VERSION_ETAT, "v5 -> v16 : schema à jour");
  // v5 -> v6 : la vocation des bâtiments existants est complétée à null
  // (boutique de consommation par défaut), jamais devinée.
  const v5bat = migrerEtat({
    schemaVersion: 5,
    jour: 3,
    params: { tauxImpotBp: 555, coeffIntensite: 2 },
    batiments: [
      { id: "b1", nom: "Vieille boutique", type: "commerce" },
      { id: "b2", nom: "Mairie", type: "service_public" },
    ],
  });
  assert.equal(v5bat.schemaVersion, SCHEMA_VERSION_ETAT, "v5 -> v16 : schema à jour");
  assert.ok(
    v5bat.batiments.every((b) => b.vocations.length === 0 &&
      (b.type === "commerce" ? b.boutique === true : b.boutique === false)),
    "v5 -> v15 : anciens commerces complétés en boutiques, aucun service inventé (la case boutique ne concerne que les commerces)",
  );
  assert.equal(v5bat.batiments.length, 2, "les bâtiments du joueur sont conservés");
  assert.ok(
    v5bat.batiments.every((x) => x.capaciteLogements === 0 && x.capacitePostes === 0),
    "v8 -> v9 : capacités absentes complétées à 0/0, jamais devinées",
  );
  // v6 -> v7 : le crime ne détruit plus la monnaie (volsCumules) ; le taux
  // par défaut passe de 10 % à 30 % — une ville restée à l'ancien défaut
  // monte au nouveau taux, un taux choisi reste le sien.
  const v6defaut = migrerEtat({ schemaVersion: 6, params: { tauxImpotBp: 1000, coeffIntensite: 2 } });
  assert.equal(v6defaut.schemaVersion, SCHEMA_VERSION_ETAT, "v6 -> v16 : schema à jour");
  assert.equal(v6defaut.volsCumules, 0, "v6 -> v7 : vols cumulés initialisés");
  assert.equal(v6defaut.params.tauxImpotBp, TAUX_IMPOT_DEFAUT_BP, "v6 -> v7 : l'ancien défaut 10 % devient 30 %");
  const v6choisi = migrerEtat({ schemaVersion: 6, params: { tauxImpotBp: 555, coeffIntensite: 2 } });
  assert.equal(v6choisi.params.tauxImpotBp, 555, "v6 -> v7 : le taux choisi par le joueur est conservé");
});

test("capacités séparées (v1.24) : un bâtiment peut loger et employer à la fois", () => {
  const mixte = nouveauBatiment({
    nom: "Immeuble du Fournil",
    type: "commerce",
    capaciteLogements: 4,
    capacitePostes: 2,
  });
  assert.equal(mixte.capaciteLogements, 4, "logements au-dessus de la boutique");
  assert.equal(mixte.capacitePostes, 2, "postes de travail au rez-de-chaussée");
  // Migration v8 -> v9 : l'ancienne capacité unique est répartie selon le
  // type (habitation -> logements, commerce et service -> postes), jamais perdue.
  const vieux = migrerEtat({
    schemaVersion: 8,
    batiments: [
      { id: "b1", nom: "Maison des Dupont", type: "habitation", capacite: 4 },
      { id: "b2", nom: "Le Fournil Doré", type: "commerce", capacite: 2 },
    ],
  });
  assert.equal(vieux.schemaVersion, SCHEMA_VERSION_ETAT, "v8 -> v16 : schema à jour");
  const maison = vieux.batiments.find((x) => x.id === "b1")!;
  assert.equal(maison.capaciteLogements, 4, "habitation : la capacité devient des logements");
  assert.equal(maison.capacitePostes, 0, "habitation : aucun poste inventé");
  const boulangerie = vieux.batiments.find((x) => x.id === "b2")!;
  assert.equal(boulangerie.capacitePostes, 2, "commerce : la capacité devient des postes");
  assert.equal(boulangerie.capaciteLogements, 0, "commerce : aucun logement inventé");
  assert.ok(!("capacite" in maison), "l'ancien champ capacite disparaît");
});

// ---------- v1.25 : les véhicules — essence, monde fermé, migrations ----------

test("essence (v1.25) : le carburant s'achète à la station-service, la ville et les privés paient", () => {
  // Monde témoin : la station-service (vocation « garage », arbitrage
  // Thibaut 2026-11-08 : c'est elle qui gère la pompe et les accidents,
  // pas le BTP), son pompiste, la flotte et une privée.
  const base = calme(createMondeDefaut());
  const pompe = nouveauBatiment({ nom: "Station-service du Centre", type: "commerce", vocations: ["garage"] });
  const pompiste = nouveauPnj({ prenom: "Essa", nom: "Pompiste", statut: "commercant", batimentId: pompe.id, revenuIndicatif: 6000, compte: 0 });
  const perrine = nouveauPnj({ prenom: "Perrine", nom: "Volant", statut: "prive", revenuIndicatif: 4000, budgetAchat: 0, compte: 5000 });
  const monde: Etat = {
    ...base,
    batiments: [pompe],
    pnjs: [pompiste, perrine],
    vehicules: [
      nouveauVehicule({ nom: "Balayeuse municipale", categorie: "municipal", role: "proprete", essenceJour: 800 }),
      nouveauVehicule({ nom: "Voiture de Perrine", categorie: "prive", proprietairePnjId: perrine.id, essenceJour: 500 }),
    ],
  };
  const avant = monnaieEnCircuit(monde);
  const j1 = passerJour(monde);
  assert.equal(
    j1.budgetVille,
    monde.budgetVille - 800 + impotSur(1300, monde.params.tauxImpotBp),
    "la flotte se paie sur le budget de la ville, la pompe reverse sa retenue à la source",
  );
  assert.equal(
    j1.pnjs.find((p) => p.prenom === "Perrine")!.compte,
    5000 - 500,
    "la privée paie son plein sur son propre compte",
  );
  const essence = entrees(1, "essence", j1.journal);
  assert.equal(essence.length, 1, "le plein du jour est raconté");
  assert.equal(essence[0].montant, 1300, "800 de flotte + 500 de privé");
  assert.ok(essence[0].texte.includes("flotte municipale : 8,00 L"), "le détail flotte/privés est raconté");
  assert.equal(j1.recettesCommerce![pompe.id], 1300, "la pompe locale encaisse tout le carburant");
  assert.ok(j1.pnjs[0].compte > 0, "le pompiste garde sa recette du jour");
  assert.equal(monnaieEnCircuit(j1), avant, "conservation exacte : l'argent a seulement circulé");
});

test("essence (v1.25) : sans station-service en ville, la flotte dort au garage — rien ne sort", () => {
  const base = calme(createMondeDefaut());
  const monde: Etat = {
    ...base,
    vehicules: [nouveauVehicule({ nom: "Ambulance", categorie: "municipal", role: "sante", essenceJour: 600 })],
  };
  const avant = monnaieEnCircuit(monde);
  const j1 = passerJour(monde);
  const essence = entrees(1, "essence", j1.journal);
  assert.equal(essence.length, 1, "la journée sans carburant est racontée");
  assert.equal(essence[0].montant, 0, "pas un centime de carburant dépensé");
  assert.ok(
    essence[0].texte.includes("aucune station-service en ville") && essence[0].texte.includes("leurs rôles dorment"),
    "l'immobilisation est racontée, le rôle dort",
  );
  assert.equal(j1.budgetVille, monde.budgetVille, "rien dépensé : la pompe ne fait pas crédit");
  assert.equal(monnaieEnCircuit(j1), avant, "monde fermé");
});

test("migrations v9 -> v10 (v1.25) : les véhicules sont complétés, jamais inventés", () => {
  const v9 = migrerEtat({ schemaVersion: 9, jour: 4 });
  assert.equal(v9.schemaVersion, SCHEMA_VERSION_ETAT, "v9 -> v16 : schema à jour");
  assert.deepEqual(v9.vehicules, [], "un état v9 sans véhicules obtient une liste vide, pas une flotte inventée");
  // Payload tordu : un véhicule d'import aux champs manquants est complété
  // au défaut (privé, bon état, essence 0), jamais deviné.
  const tordu = migrerEtat({
    schemaVersion: 9,
    jour: 2,
    vehicules: [{ id: "veh-x", nom: "Caisse à roulettes" }],
  });
  assert.equal(tordu.vehicules!.length, 1, "le véhicule d'import est conservé");
  const v = tordu.vehicules![0];
  assert.equal(v.id, "veh-x");
  assert.equal(v.categorie, "prive", "catégorie complétée au défaut");
  assert.equal(v.etat, "bon", "état complété au défaut");
  assert.equal(v.essenceJour, 0, "consentation complétée à 0 : rien n'est deviné");
  assert.equal(v.role, null, "pas de rôle inventé");
  // Le monde par défaut (v1.30) démarre avec les deux engins de l'équipe.
  const depart = createMondeDefaut();
  assert.equal(depart.vehicules!.length, 2, "la ville par défaut démarre avec les deux engins");
  assert.ok(
    depart.vehicules!.every((v) => v.role === "chantier"),
    "bétonnière et tractopelle, engins de chantier",
  );
  assert.ok(
    depart.journal.some((e) => e.texte.includes("équipe du BTP")),
    "le journal du jour 0 raconte l'arrivée de l'équipe",
  );
});

test("éditeur de véhicules (v1.25) : la caravane loge, on la retire — plus rien ne pend", () => {
  let m = createMondeDefaut();
  const caravane = nouveauVehicule({ nom: "Caravane de l'étudiant", capaciteLogements: 2 });
  m = ajouterVehicule(m, caravane);
  assert.ok(
    m.journal.some((e) => e.texte.includes("il peut loger 2 figurine(s)")),
    "l'arrivée de la roulotte est racontée",
  );
  const etudiant = nouveauPnj({ prenom: "Léo", nom: "Nomade", statut: "prive" });
  m = ajouterPnj(m, etudiant);
  m = modifierPnj(m, etudiant.id, { batimentId: caravane.id });
  assert.equal(m.pnjs.find((p) => p.id === etudiant.id)!.batimentId, caravane.id, "l'étudiant loge dans la caravane");
  m = supprimerVehicule(m, caravane.id);
  assert.equal(m.vehicules!.length, 2, "la caravane a disparu, l'équipe BTP reste");
  assert.equal(
    m.pnjs.find((p) => p.id === etudiant.id)!.batimentId,
    null,
    "plus de logement fantôme : rien ne pend à un véhicule disparu",
  );
  assert.ok(m.journal.some((e) => e.texte.includes("quitte la ville")), "le départ est raconté");
});

test("migrations v10 -> v12 (v1.26) : la file d'arbitrages est complétée, jamais inventée", () => {
  const v10 = migrerEtat({ schemaVersion: 10, jour: 4 });
  assert.equal(v10.schemaVersion, SCHEMA_VERSION_ETAT, "v10 -> v16 : schema à jour");
  assert.deepEqual(v10.arbitrages, [], "un état v10 sans file d'arbitrages obtient une liste vide");
  // Payload tordu : seuls les arbitrages bien formés traversent la
  // migration — rien n'est décodé en force, rien n'est inventé.
  const arbitrageValide = {
    id: "arb-j1-0",
    jour: 1,
    expireLe: 4,
    type: "incendie",
    titre: "Incendie — Test",
    gravite: 2,
    cibleBatimentId: "bat-1",
    ciblePnjId: null,
    cibleVehiculeId: null,
    voleurPnjId: null,
    agresseurPnjId: null,
    defenseurPnjId: null,
    moyens: {
      pompiers: 2, police: 1, armee: 0,
      camionPompiers: false, fourgonPolice: false, camionProprete: false, ambulance: false,
      btpBatimentId: null, santeBatimentId: null, stationBatimentId: null, commissariat: true,
    },
    propositions: [{ id: "maitrise", libelle: "Le feu est maîtrisé", attendu: true, pire: false }],
  };
  const tordu = migrerEtat({
    schemaVersion: 10,
    jour: 2,
    arbitrages: [arbitrageValide, { prix: "tordu" }, null, "chaine"],
  });
  assert.equal(tordu.arbitrages!.length, 1, "seul l'arbitrage bien formé traverse la migration");
  assert.equal(tordu.arbitrages![0].id, "arb-j1-0", "la file valide est conservée telle quelle");
  assert.equal(tordu.arbitrages![0].expireLe, 4, "l'échéance du maître du jeu est conservée");
});

// ---------- v1.31 : le magasin de village (vocations multiples) ----------

test("vocations multiples (v1.31) : un commerce rend deux services, sans vendre de courses", () => {
  // L'Hôtel des Bricoles cumule santé ET banque : le même gérant tient les
  // deux comptoirs (case « boutique » décochée : pas de courses ici).
  const base = calme(createMondeDefaut());
  const maison = nouveauBatiment({
    nom: "Hôtel des Bricoles", type: "commerce", quartier: "Centre",
    valeur: 800000, capacitePostes: 2, vocations: ["sante", "banque"], boutique: false,
  });
  const gerant = nouveauPnj({
    prenom: "Guy", nom: "Tout-Faire", metier: "patron polyvalent", statut: "commercant",
    batimentId: maison.id, revenuIndicatif: 6000, budgetAchat: 0, compte: 0,
  });
  const monde: Etat = { ...base, batiments: [maison], pnjs: [gerant] };
  assert.equal(serviceLocal(monde, "sante")?.bat.id, maison.id, "le service santé est rendu");
  assert.equal(serviceLocal(monde, "banque")?.bat.id, maison.id, "le service banque est rendu par le même commerce");
  assert.equal(serviceLocal(monde, "btp"), null, "le BTP n'est pas coché : pas de service");
  const avant = monnaieEnCircuit(monde);
  const j1 = passerJour(monde);
  assert.ok(!j1.recettesCommerce?.[maison.id], "sans case boutique, aucune course n'est encaissée");
  assert.equal(monnaieEnCircuit(j1), avant, "conservation exacte");
});

test("magasin de village (v1.31) : station-service ET supérette dans le même commerce", () => {
  // Le Relais cumule la pompe (vocation « garage ») et le comptoir de courses
  // (case « boutique ») : essence et courses rejoignent la même caisse.
  const base = calme(createMondeDefaut());
  const relais = nouveauBatiment({
    nom: "Le Relais du Sud", type: "commerce", quartier: "Sud",
    valeur: 250000, capacitePostes: 2, vocations: ["garage"], boutique: true,
  });
  const gerante = nouveauPnj({
    prenom: "Rita", nom: "Comptoir", metier: "gérante du relais", statut: "commercant",
    batimentId: relais.id, revenuIndicatif: 5500, budgetAchat: 0, compte: 100000,
  });
  const acheteur = nouveauPnj({
    prenom: "Paul", nom: "Poussette", statut: "prive",
    revenuIndicatif: 4000, budgetAchat: 30000, compte: 30000,
  });
  const monde: Etat = {
    ...base,
    batiments: [relais],
    pnjs: [gerante, acheteur],
    vehicules: [
      nouveauVehicule({ nom: "Fourgonnette de Rita", categorie: "prive", proprietairePnjId: gerante.id, essenceJour: 700 }),
    ],
  };
  const avant = monnaieEnCircuit(monde);
  const j1 = passerJour(monde);
  assert.equal(serviceLocal(j1, "garage")?.bat.id, relais.id, "le relais EST la station-service de la ville");
  const essence = entrees(1, "essence", j1.journal);
  assert.equal(essence.length, 1, "l'essence du jour est vendue au relais");
  assert.equal(essence[0].montant, 700, "le plein de la fourgonnette");
  const achats = entrees(1, "achats", j1.journal);
  assert.equal(achats.length, 1, "les courses du jour sont racontées");
  assert.ok((achats[0].montant ?? 0) > 0, "le comptoir du même commerce encaisse les courses");
  assert.ok(achats[0].texte.includes("Relais du Sud"), "le relais raconte ses ventes au comptoir");
  assert.equal(
    j1.recettesCommerce![relais.id],
    700 + (achats[0].montant ?? 0),
    "essence et courses rejoignent la même caisse du soir",
  );
  assert.equal(monnaieEnCircuit(j1), avant, "conservation exacte : l'argent a seulement circulé");
});

test("migration v14 -> v15 (v1.31) : la vocation devient une liste de services, la boutique une case", () => {
  const demo = createMondeDemonstration();
  const batV14 = (id: string, nom: string, vocation: unknown) => ({
    id, nom, type: "commerce", quartier: "Port", valeur: 100000, etat: "bon",
    coutFonctionnement: 0, capaciteLogements: 0, capacitePostes: 1, vocation,
  });
  const v14 = migrerEtat({
    ...createMondeDefaut(),
    schemaVersion: 14,
    jour: 2,
    batiments: [
      batV14("bat-station", "Station du Port", "garage"),
      batV14("bat-boutique", "Supérette du Port", null),
      batV14("bat-tordu", "Cabinet tordu", "beaucoup"),
      batV14("bat-prison", "Ancienne prison", "prison"),
    ] as unknown as typeof demo.batiments,
  });
  assert.equal(v14.schemaVersion, SCHEMA_VERSION_ETAT, "v14 -> v16 : schema à jour");
  const station = v14.batiments.find((b) => b.id === "bat-station")!;
  assert.deepEqual(station.vocations, ["garage"], "l'ancienne vocation devient une liste");
  assert.equal(station.boutique, false, "un ancien service ne vend pas de courses : comportement inchangé");
  const boutique = v14.batiments.find((b) => b.id === "bat-boutique")!;
  assert.deepEqual(boutique.vocations, [], "une ancienne boutique n'a aucune vocation");
  assert.equal(boutique.boutique, true, "elle reste boutique");
  const tordu = v14.batiments.find((b) => b.id === "bat-tordu")!;
  assert.deepEqual(tordu.vocations, [], "une vocation tordue est jetée, jamais inventée");
  const prison = v14.batiments.find((b) => b.id === "bat-prison")!;
  assert.deepEqual(prison.vocations, [], "la correction v1.15 traverse : « prison » redevient une boutique");
  assert.equal(prison.boutique, true, "l'ancienne prison vend des courses");
  assert.ok(v14.batiments.every((b) => !("vocation" in b)), "plus de champ vocation nulle part");
  // Re-ingestion d'un état v15 : les choix du joueur (vocations multiples,
  // case boutique) sont conservés au centime près ; une liste tordue est
  // filtrée sur la liste fermée.
  const relais = { ...boutique, id: "bat-relais", nom: "Le Relais", vocations: ["garage", "banque"], boutique: true };
  const relaisTordu = { ...relais, id: "bat-relais-tordu", vocations: ["garage", "sante", "beaucoup"], boutique: "peut-être" };
  const v15 = migrerEtat({ ...v14, batiments: [...v14.batiments, relais, relaisTordu] as unknown as typeof demo.batiments });
  const relais2 = v15.batiments.find((b) => b.id === "bat-relais")!;
  assert.deepEqual(relais2.vocations, ["garage", "banque"], "les vocations multiples sont conservées");
  assert.equal(relais2.boutique, true, "la case boutique est conservée");
  const relaisTordu2 = v15.batiments.find((b) => b.id === "bat-relais-tordu")!;
  assert.deepEqual(relaisTordu2.vocations, ["garage", "sante"], "une liste tordue est filtrée sur la liste fermée");
  assert.equal(relaisTordu2.boutique, false, "un drapeau tordu retombe au défaut : un service ne vend pas de courses");
});
