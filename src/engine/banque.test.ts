// Tests dette & trésorerie (phase 3) : emprunts au taux réel 3,54 %/an,
// intérêts versés à la banque locale, capitalisation, marge en jours,
// alertes. Exécution : npm test.

import test from "node:test";

import assert from "node:assert/strict";

import {
  createMondeDefaut,
  emprunterVille,
  modifierVille,
  rembourserVille
} from "./monde.ts";

import {
  chargesJournalieres,
  interetsDus,
  impotSur,
  joursDeMarge,
  monnaieEnCircuit,
  passerJour
} from "./moteur.ts";

import {
  entrees,
  calme,
  neutraliserCourses
} from "./outils-test.ts";

// ---------- Phase 3 : dette bancaire, trésorerie, arbitrages ----------

test("charges et marge : la ville sait combien de jours elle tient", () => {
  const m = calme(createMondeDefaut());
  assert.ok(chargesJournalieres(m) > 0, "la ville a des charges");
  assert.equal(joursDeMarge(m), Math.floor(m.budgetVille / chargesJournalieres(m)));
});

test("emprunter : les caisses respirent, la dette grimpe, le journal raconte", () => {
  const m = createMondeDefaut();
  const e = emprunterVille(m, 200000);
  assert.equal(e.budgetVille, m.budgetVille + 200000);
  assert.equal(e.dette, 200000);
  assert.equal(e.mouvementsBanqueCumules, 200000);
  assert.ok(e.journal.some((x) => x.texte.includes("emprunte")), "l'emprunt est raconté");
});

test("les intérêts coulent chaque jour vers la banque locale (3,54 %/an réel)", () => {
  let m = calme(createMondeDefaut());
  m = emprunterVille(m, 10000000); // 100 000 L
  const interets = interetsDus(10000000);
  assert.ok(interets > 900 && interets < 1000, "≈ 9,70 L/jour : " + interets);
  neutraliserCourses(m, "banquier");
  const banquierAvant = m.pnjs.find((p) => p.metier === "banquier")!.compte;
  const j1 = passerJour(m);
  const dette = entrees(1, "dette", j1.journal);
  assert.equal(dette.length, 1);
  assert.equal(dette[0].montant, -interets);
  assert.equal(j1.sortiesCumulees, 0, "monde fermé : plus aucune sortie");
  // Monde fermé : les intérêts restent en ville — la banque locale les
  // encaisse comme recette du jour, imposée à la source sur sa marge.
  const banquier = j1.pnjs.find((p) => p.metier === "banquier")!;
  assert.equal(
    banquier.compte,
    banquierAvant + interets - impotSur(interets, j1.params.tauxImpotBp),
    "la banque de la ville encaisse les intérêts, moins l'impôt sur son gain",
  );
  assert.ok(
    entrees(1, "flux", j1.journal).some((e) => e.texte.includes("Banque")),
    "la banque raconte sa recette du soir",
  );
});

test("sans le sou : les intérêts se capitalisent, la dette grossit", () => {
  let m = calme(createMondeDefaut());
  m = emprunterVille(m, 10000000);
  m = modifierVille(m, { budgetVille: 0 });
  const j1 = passerJour(m);
  const du = interetsDus(10000000);
  // Les intérêts tombent avant les achats : au moment de payer, les caisses
  // sont vides et tout est capitalisé. Seule la retenue à la source du soir
  // (marges des commerces) relance les caisses en fin de journée.
  const attenduImpot = Object.values(j1.recettesCommerce!).reduce(
    (s, v) => s + impotSur(v, j1.params.tauxImpotBp),
    0,
  );
  assert.equal(j1.budgetVille, attenduImpot, "seule la retenue du soir entre en caisse");
  assert.equal(j1.dette, 10000000 + du, "les intérêts impayés s'ajoutent à l'encours");
  assert.ok(j1.journal.some((x) => x.texte.includes("capitalisés")), "la capitalisation est racontée");
});

test("rembourser : la dette fond ; à zéro, la ville est libre", () => {
  let m = calme(createMondeDefaut());
  const banquierAvant = m.pnjs.find((p) => p.metier === "banquier")!.compte;
  m = emprunterVille(m, 300000);
  m = rembourserVille(m, 100000);
  assert.equal(m.dette, 200000);
  // Monde fermé : mouvementsBanqueCumules ne mesure plus que la création
  // monétaire (les emprunts) — il ne baisse plus au remboursement.
  assert.equal(m.mouvementsBanqueCumules, 300000, "création monétaire cumulée");
  assert.equal(
    m.pnjs.find((p) => p.metier === "banquier")!.compte,
    banquierAvant + 100000,
    "le remboursement rejoint la banque de la ville, pas l'extérieur",
  );
  const libre = rembourserVille(m, 999999999);
  assert.equal(libre.dette, 0, "pas de remboursement au-delà de l'encours");
  assert.ok(libre.journal.some((x) => x.texte.includes("plus un centime de dette")), "la délivrance est racontée");
});

test("alerte trésorerie : le journal somme la ville de choisir", () => {
  let m = calme(createMondeDefaut());
  // Budgets aléatoires (v1.16) : les impôts du jour varient au tirage (ils
  // peuvent dépasser les charges). Sans impôt, la marge ne dépend que du
  // budget versé — le test reste exact quelle que soit la partie.
  m.params.tauxImpotBp = 0;
  m = modifierVille(m, { budgetVille: 300 });
  const j1 = passerJour(m);
  assert.equal(joursDeMarge(j1), 0, "la marge est critique : caisses vides");
  assert.ok(
    j1.journal.some(
      (x) =>
        x.type === "systeme" &&
        (x.texte.includes("Trésorerie tendue") || x.texte.includes("caisses sont vides")),
    ),
    "l'alerte est journalisée",
  );
});

test("conservation avec la banque : 30 jours, un emprunt en route", () => {
  let e = calme(createMondeDefaut());
  const initial = monnaieEnCircuit(e);
  for (let i = 0; i < 10; i++) e = passerJour(e);
  e = emprunterVille(e, 5000000);
  for (let i = 0; i < 20; i++) e = passerJour(e);
  assert.equal(
    monnaieEnCircuit(e),
    initial + e.mouvementsBanqueCumules - e.sortiesCumulees - e.pertesCumulees,
    "conservation exacte, banque incluse",
  );
});
