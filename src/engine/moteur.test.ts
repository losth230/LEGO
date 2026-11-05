// Tests du moteur (phase 1) — exécution : npm test
// (node --experimental-strip-types --test src/engine/moteur.test.ts)
// Critère d'acceptation phase 1 : 30 jours passés, argent cohérent, journal lisible.

import test from "node:test";
import assert from "node:assert/strict";

import type { Etat, JournalEntree } from "./types.ts";
import { createMondeDefaut, modifierVille } from "./monde.ts";
import { migrerEtat } from "./migrations.ts";
import {
  impotDu,
  monnaieEnCircuit,
  passerJour,
} from "./moteur.ts";
import { salaireJourL, TAUX_IMPOT_DEFAUT_BP } from "./referentiel.ts";

function entrees(jour: number, type: string, j: JournalEntree[]): JournalEntree[] {
  return j.filter((e) => e.jour === jour && e.type === type);
}

test("monde par défaut : 10 bâtiments, 45 figurines, jour 0", () => {
  const m = createMondeDefaut();
  assert.equal(m.batiments.length, 10);
  assert.equal(m.pnjs.length, 45);
  assert.equal(m.jour, 0);
  assert.equal(m.params.tauxImpotBp, TAUX_IMPOT_DEFAUT_BP);
  const services = m.batiments.filter((b) => b.type === "service_public");
  assert.equal(services.length, 3);
  const agents = m.pnjs.filter((p) => p.statut === "agent_public");
  assert.equal(agents.length, 3);
  const boutiques = m.batiments.filter((b) => b.type === "commerce");
  assert.equal(boutiques.length, 3);
});

test("un jour : impôts prélevés, salaires versés, sorties tracées, achats encaissés", () => {
  const m = createMondeDefaut();
  const attenduImpots = m.pnjs.reduce((s, p) => s + impotDu(p, m.params.tauxImpotBp), 0);
  const attenduSalaires = m.pnjs
    .filter((p) => p.statut === "agent_public")
    .reduce((s, p) => s + Math.round(salaireJourL(p.grade ?? "") * 100), 0);
  const j1 = passerJour(m);
  assert.equal(j1.jour, 1);
  assert.equal(m.jour, 0, "l'état source n'est pas muté");
  const impots = entrees(1, "impots", j1.journal);
  assert.equal(impots.length, 1);
  assert.equal(impots[0].montant, attenduImpots);
  const salaires = entrees(1, "salaires", j1.journal);
  assert.equal(salaires[0].montant, attenduSalaires);
  const fonct = entrees(1, "fonctionnement", j1.journal);
  assert.equal(fonct[0].montant, 5000); // 3 services : 20 + 15 + 15 L
  const achats = entrees(1, "achats", j1.journal);
  assert.equal(achats.length, 1);
  assert.ok((achats[0].montant ?? 0) > 0);
  assert.equal(entrees(1, "solde", j1.journal).length, 1);
  // 5 entrées par jour (impôts, salaires, fonctionnement, achats, solde)
  assert.equal(j1.journal.filter((e) => e.jour === 1).length, 5);
});

test("conservation de la monnaie sur 30 jours (circuit fermé exact)", () => {
  const m = createMondeDefaut();
  const initial = monnaieEnCircuit(m);
  let e: Etat = m;
  for (let i = 0; i < 30; i++) e = passerJour(e);
  const restant = monnaieEnCircuit(e);
  assert.equal(restant, initial - e.sortiesCumulees);
  // chaque figurine a un compte positif ou nul, aucun NaN
  for (const p of e.pnjs) {
    assert.ok(Number.isFinite(p.compte) && p.compte >= 0, p.prenom);
  }
  assert.ok(Number.isFinite(e.budgetVille));
  assert.equal(e.jour, 30);
  // le journal a grossi chaque jour : 30 x 5 entrées + l'entrée du jour 0
  assert.equal(e.journal.length, 151);
});

test("le vendeur de frites encaisse les achats des habitants", () => {
  const m = createMondeDefaut();
  const avant = m.pnjs.find((p) => p.prenom === "Mario")!.compte;
  const j1 = passerJour(m);
  const mario = j1.pnjs.find((p) => p.prenom === "Mario")!;
  assert.ok(mario.compte > avant, "Mario doit s'enrichir");
  // les 44 autres figurines achètent chez 3 commerçants ; Mario ne peut pas
  // acheter chez lui : il achète dans les 2 autres boutiques.
  assert.ok(mario.compte - avant > 50000, "encaissement journalier > 500 L");
});

test("un PNJ sans le sou paie ce qu'il peut ; le journal le raconte", () => {
  const m = createMondeDefaut();
  const pauvre = m.pnjs[10];
  m.pnjs[10] = { ...pauvre, compte: 100 }; // 1,00 L
  const j1 = passerJour(m);
  const rupture = j1.journal.find((e) => e.type === "impots" && e.jour === 1);
  assert.ok(rupture !== undefined && rupture.texte.includes("à sec"));
  assert.equal(j1.pnjs[10].compte, 0);
  // la ville n'a encaissé que 1,00 L de sa part
  const attenduAutres = m.pnjs.reduce((s, p, i) => (i === 10 ? s : s + impotDu(p, m.params.tauxImpotBp)), 0);
  const impots = entrees(1, "impots", j1.journal);
  assert.equal(impots[0].montant, attenduAutres + 100);
});

test("taux d'imposition : plus de taux, plus de recettes", () => {
  const m = createMondeDefaut();
  const m2 = modifierVille(m, { tauxImpotBp: m.params.tauxImpotBp + 100 });
  const j1 = passerJour(m);
  const j2 = passerJour(m2);
  const i1 = entrees(1, "impots", j1.journal)[0].montant ?? 0;
  const i2 = entrees(1, "impots", j2.journal)[0].montant ?? 0;
  assert.ok(i2 > i1);
});

test("ville pauvre : salaires et fonctionnement payés au prorata des caisses", () => {
  const m = createMondeDefaut();
  // les impôts du jour tombent d'abord : la ville n'est donc jamais à zéro
  // avant les salaires — on force un monde sans contribuables privés,
  // aux caisses vides, pour tester le prorata.
  const vide: Etat = {
    ...m,
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
  const m = createMondeDefaut();
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
  const m = createMondeDefaut();
  m.pnjs[5] = { ...m.pnjs[5], epargne: 123456 };
  let e = m;
  for (let i = 0; i < 5; i++) e = passerJour(e);
  assert.equal(e.pnjs[5].epargne, 123456);
});

test("migrations : état corrompu -> monde par défaut ; état v1 complété", () => {
  assert.equal(migrerEtat(null).jour, 0);
  assert.equal(migrerEtat("n'importe quoi").pnjs.length, 45);
  const futur = migrerEtat({ schemaVersion: 99 });
  assert.equal(futur.pnjs.length, 45, "version future -> monde par défaut");
  const m = migrerEtat({ schemaVersion: 1, jour: 5 });
  assert.equal(m.jour, 5, "le jour est conservé");
  assert.ok(Array.isArray(m.journal) && Array.isArray(m.pnjs) && Array.isArray(m.batiments));
  assert.ok(typeof m.budgetVille === "number" && typeof m.params.tauxImpotBp === "number");
});
