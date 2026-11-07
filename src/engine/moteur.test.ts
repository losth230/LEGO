// Tests moteur — économie de base : monnaie, impôt à la source, achats,
// migrations d'état corrompu (phases 1, 3.8). Exécution : npm test.

import test from "node:test";

import assert from "node:assert/strict";

import type {
  Etat
} from "./types.ts";

import {
  createMondeDefaut,
  modifierVille
} from "./monde.ts";
import { createMondeDemonstration } from "./monde.demo.ts";

import {
  migrerEtat
} from "./migrations.ts";

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

test("ville de démonstration : 15 bâtiments, 59 figurines (garnison, brigade, gang et bureau de poste inclus), jour 0", () => {
  const m = createMondeDemonstration();
  assert.equal(m.batiments.length, 15);
  assert.equal(m.pnjs.length, 59);
  assert.equal(m.jour, 0);
  assert.equal(m.params.tauxImpotBp, TAUX_IMPOT_DEFAUT_BP);
  const services = m.batiments.filter((b) => b.type === "service_public");
  assert.equal(services.length, 4);
  const agents = m.pnjs.filter((p) => p.statut === "agent_public");
  assert.equal(agents.length, 9);
  // Monde 100 % fermé : 4 boutiques de consommation (dont le bureau de
  // poste, v1.22) + 3 services à vocation (hôpital, BTP, banque), chacun
  // tenu par son gérant. La détention se joue au commissariat (Poste de
  // police), pas dans un bâtiment dédié.
  const boutiques = m.batiments.filter((b) => b.type === "commerce" && !b.vocation);
  assert.equal(boutiques.length, 4);
  assert.ok(serviceLocal(m, "sante") !== null, "l'hôpital est en ville et tenu");
  assert.ok(serviceLocal(m, "btp") !== null, "le BTP est en ville et tenu");
  assert.ok(serviceLocal(m, "banque") !== null, "la banque est en ville et tenue");
  assert.equal(m.batiments.filter((b) => b.type === "commerce").length, 7);
});

test("monde par défaut (v1.23) : une ville nue, tout se construit dans l'éditeur", () => {
  const m = createMondeDefaut();
  assert.equal(m.batiments.length, 0, "aucun bâtiment");
  assert.equal(m.pnjs.length, 0, "aucun figurant");
  assert.equal((m.gangs ?? []).length, 0, "aucun gang");
  assert.equal(m.jour, 0);
  assert.equal(m.budgetVille, 500000, "5 000 L en caisse");
  assert.equal(monnaieEnCircuit(m), 500000, "la monnaie se résume aux caisses de la ville");
  assert.equal(m.dette, 0);
  assert.equal(m.journal.length, 1, "une seule entrée : le coup de crayon inaugural");
  assert.ok(m.journal[0].texte.includes("éditeur"), "le journal invite à bâtir");
});

test("ville nue : trente jours sans crash, la monnaie ne bouge pas d'un centime", () => {
  let e = createMondeDefaut();
  const initial = monnaieEnCircuit(e);
  for (let i = 0; i < 30; i++) e = passerJour(e);
  assert.equal(e.jour, 30, "les jours passent, même sur un terrain nu");
  assert.equal(monnaieEnCircuit(e), initial, "rien n'entre, rien ne sort : 5 000 L intacts");
  assert.equal(e.sortiesCumulees, 0, "monde fermé");
  assert.equal(e.pnjs.length, 0, "toujours personne");
  assert.equal(e.batiments.length, 0, "toujours rien de bâti");
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
  assert.equal(entrees(1, "flux", j1.journal).length, 4, "quatre boutiques racontent leur flux");
  // Sans employé, un commerce thésaurise : la phase 3.6 le raconte (stock).
  // (Le facteur du bureau de poste est détaché pour ce test : voir plus haut.)
  assert.ok(
    entrees(1, "flux", j1.journal).every((e) => e.texte.includes("stock")),
    "l'accumulation sans employé est racontée",
  );
  // Recettes du dernier jour persistées (calibrage des effectifs).
  assert.ok(j1.recettesCommerce !== undefined);
  assert.equal(Object.keys(j1.recettesCommerce!).length, 4);
  for (const v of Object.values(j1.recettesCommerce!)) assert.ok(v > 70000, "recettes: " + v);
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

test("migrations : état corrompu -> ville nue ; état v1 complété", () => {
  // v1.23 : le monde par défaut est une ville nue (arbitrage Thibaut) —
  // un état corrompu ou une version future repart d'un terrain vide.
  const nue = migrerEtat(null);
  assert.equal(nue.jour, 0);
  assert.equal(nue.pnjs.length, 0, "aucun PNJ dans le monde par défaut");
  assert.equal(nue.batiments.length, 0, "aucun bâtiment");
  assert.equal((nue.gangs ?? []).length, 0, "aucun gang");
  assert.equal(nue.budgetVille, 500000, "5 000 L en caisse pour bâtir");
  assert.equal(migrerEtat("n'importe quoi").pnjs.length, 0);
  const futur = migrerEtat({ schemaVersion: 99 });
  assert.equal(futur.pnjs.length, 0, "version future -> ville nue");
  // Complétion v1 -> v8 sur une vraie ville (la démo) : les figurines
  // existantes sont conservées, les champs manquants complétés.
  const demo = createMondeDemonstration();
  const m = migrerEtat({ ...demo, schemaVersion: 1, jour: 5 });
  assert.equal(m.jour, 5, "le jour est conservé");
  assert.equal(m.pnjs.length, 59, "les figurines sont conservées");
  assert.ok(Array.isArray(m.journal) && Array.isArray(m.pnjs) && Array.isArray(m.batiments));
  assert.ok(typeof m.budgetVille === "number" && typeof m.params.tauxImpotBp === "number");
  assert.equal(m.params.coeffIntensite, COEFF_INTENSITE_DEFAUT, "v1 -> v2 : K complété au défaut");
  assert.equal(m.pertesCumulees, 0, "v1 -> v2 : pertes initialisées");
  assert.equal(m.volsCumules, 0, "v6 -> v7 : vols cumulés initialisés");
  assert.equal(m.schemaVersion, 8, "v1 -> v8 : schema à jour");
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
  assert.equal(v5.schemaVersion, 8, "v5 -> v8 : schema à jour");
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
  assert.equal(v5bat.schemaVersion, 8, "v5 -> v8 : schema à jour");
  assert.ok(
    v5bat.batiments.every((b) => b.vocation === null),
    "v5 -> v6 : vocation des bâtiments complétée (boutique par défaut)",
  );
  assert.equal(v5bat.batiments.length, 2, "les bâtiments du joueur sont conservés");
  // v6 -> v7 : le crime ne détruit plus la monnaie (volsCumules) ; le taux
  // par défaut passe de 10 % à 30 % — une ville restée à l'ancien défaut
  // monte au nouveau taux, un taux choisi reste le sien.
  const v6defaut = migrerEtat({ schemaVersion: 6, params: { tauxImpotBp: 1000, coeffIntensite: 2 } });
  assert.equal(v6defaut.schemaVersion, 8, "v6 -> v8 : schema à jour");
  assert.equal(v6defaut.volsCumules, 0, "v6 -> v7 : vols cumulés initialisés");
  assert.equal(v6defaut.params.tauxImpotBp, TAUX_IMPOT_DEFAUT_BP, "v6 -> v7 : l'ancien défaut 10 % devient 30 %");
  const v6choisi = migrerEtat({ schemaVersion: 6, params: { tauxImpotBp: 555, coeffIntensite: 2 } });
  assert.equal(v6choisi.params.tauxImpotBp, 555, "v6 -> v7 : le taux choisi par le joueur est conservé");
});
