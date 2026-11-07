// Tests grades & garnison (phase 3.5) : grilles par corps issues du
// référentiel (source de vérité v1.14), coercition des grades
// retirés, détection des gardes. Exécution : npm test.

import test from "node:test";

import assert from "node:assert/strict";

import {
  ajouterPnj,
  createMondeDefaut,
  nouveauPnj
} from "./monde.ts";

import {
  migrerEtat
} from "./migrations.ts";

import {
  chargesJournalieres,
  coefficientRenfort,
  passerJour
} from "./moteur.ts";

import {
  gardeArmee,
  gardePolice,
  gardePompiers
} from "./evenements.ts";

import {
  salaireJourL,
  GROUPES_GRADES,
  GRADES,
  corpsDuGrade,
  gradeConnu
} from "./referentiel.ts";

// ---------- phase 3.5 : corps, grades hiérarchisés, branche militaire ----------

test("grades retirés : une sauvegarde v1.11 est convertie vers le grade conservé au salaire le plus proche", () => {
  // Arbitrage Thibaut 2026-11-06 : trois grades par corps. Au chargement,
  // chaque grade retiré devient le grade conservé le plus proche en solde.
  const e = createMondeDefaut();
  e.pnjs[0].grade = "general_armee";
  e.pnjs[1].grade = "brigadier_pm";
  e.pnjs[2].grade = "commandant_spp";
  e.pnjs[4].grade = "inspecteur_pm"; // v1.13 : métier à part, retiré du corps
  const rel = migrerEtat(JSON.parse(JSON.stringify(e)));
  assert.equal(rel.pnjs[0].grade, "capitaine_armee", "général → capitaine (sommet conservé)");
  assert.equal(rel.pnjs[1].grade, "policier_municipal", "brigadier → policier municipal");
  assert.equal(rel.pnjs[2].grade, "sergent_spp", "commandant → sergent");
  assert.equal(rel.pnjs[4].grade, "major_pm", "inspecteur (retiré en v1.13) → major, salaire le plus proche");
  assert.equal(salaireJourL(rel.pnjs[0].grade ?? ""), 96.7, "la figurine garde une solde lue dans la grille conservée");
  // Un grade inconnu (éditeur libre) reste tel quel : pas d'invention.
  e.pnjs[3].grade = "grade_fantaisie";
  const rel2 = migrerEtat(JSON.parse(JSON.stringify(e)));
  assert.equal(rel2.pnjs[3].grade, "grade_fantaisie", "un grade hors référentiel n'est pas réécrit");
});

test("gardes : les grades conservés suffisent à repérer police et pompiers (suffixes de corps)", () => {
  // v1.12 : major_pm et colonel_spp ne commencent ni par « policier » ni par
  // « sapeur » — la détection passe aussi par le suffixe du corps.
  const m = createMondeDefaut();
  const avecMajor = ajouterPnj(
    m,
    nouveauPnj({ prenom: "Test", nom: "Major", metier: "agent", statut: "agent_public", grade: "major_pm" }),
  );
  assert.equal(gardePolice(avecMajor).length, 2, "major_pm détecté comme policier");
  const avecColonel = ajouterPnj(
    m,
    nouveauPnj({ prenom: "Test", nom: "Colonel", metier: "agent", statut: "agent_public", grade: "colonel_spp" }),
  );
  assert.equal(gardePompiers(avecColonel).length, 3, "colonel_spp détecté comme pompier");
});

test("gardeArmee : la garnison est détectée par grade et par métier", () => {
  const m = createMondeDefaut();
  const g = gardeArmee(m);
  assert.equal(g.length, 3);
  assert.ok(g.every((p) => corpsDuGrade(p.grade ?? "") === "Armée"));

  // Un figurant promu par métier seul (grade non renseigné) compte aussi.
  const avecVolontaire = ajouterPnj(
    m,
    nouveauPnj({ prenom: "Léo", nom: "Test", metier: "militaire de carrière", statut: "agent_public" }),
  );
  assert.equal(gardeArmee(avecVolontaire).length, 4);
});

test("charges : la garnison pèse sur les charges journalières", () => {
  const m = createMondeDefaut();
  const avec = chargesJournalieres(m);
  const sansGarnison = chargesJournalieres({
    ...m,
    pnjs: m.pnjs.filter((p) => corpsDuGrade(p.grade ?? "") !== "Armée"),
    batiments: m.batiments.filter((b) => !b.nom.includes("militaire")),
  });
  const soldes = salaireJourL("soldat_armee") + salaireJourL("caporal_armee") + salaireJourL("capitaine_armee");
  // Écart attendu : 3 soldes + le fonctionnement de la caserne militaire (30 L/j).
  assert.equal(avec - sansGarnison, Math.round(soldes * 100) + 3000);
});

test("coefficientRenfort : deux militaires contiennent la moitié d un incident majeur", () => {
  assert.equal(coefficientRenfort(3, 2), 0.5);
  assert.equal(coefficientRenfort(3, 5), 0.5);
  assert.equal(coefficientRenfort(3, 1), 1);
  assert.equal(coefficientRenfort(3, 0), 1);
  assert.equal(coefficientRenfort(1, 10), 1);
  assert.equal(coefficientRenfort(2, 10), 1);
});

test("référentiel v1.15 : chaque grade porte son corps, l'éditeur propose exactement la grille du référentiel", () => {
  assert.deepEqual(
    GROUPES_GRADES.map((g) => g.corps),
    ["Mairie", "Police municipale", "Sapeurs-pompiers", "Armée"],
  );
  assert.equal(GRADES.length, 12, "trois grades par corps — la Mairie comprise depuis la v1.21");
  for (const g of GROUPES_GRADES) {
    for (const gr of g.grades) {
      assert.ok(gradeConnu(gr), gr + " doit être défini dans le référentiel (sinon le moteur paie 50 L de secours en silence)");
      assert.ok(salaireJourL(gr) > 0, gr + " a un salaire positif");
    }
  }
});

test("grilles strictement croissantes dans chaque corps (le référentiel est la source de vérité)", () => {
  for (const g of GROUPES_GRADES) {
    for (let i = 1; i < g.grades.length; i++) {
      assert.ok(
        salaireJourL(g.grades[i]) > salaireJourL(g.grades[i - 1]),
        g.grades[i] + " (" + salaireJourL(g.grades[i]) + ") doit gagner plus que " +
          g.grades[i - 1] + " (" + salaireJourL(g.grades[i - 1]) + ")",
      );
    }
  }
  // Bas de tableau modeste, haut de tableau confortable (référentiel v1.14).
  assert.ok(salaireJourL("soldat_armee") < 50);
  assert.ok(salaireJourL("capitaine_armee") > 90);
  assert.ok(salaireJourL("commissaire_pm") > 90, "le commissaire, sommet de la police, est bien payé");
  assert.ok(salaireJourL("colonel_spp") > 160);
});

test("gardes : chaque grade du référentiel est repéré par la garde de son corps (corps du référentiel, v1.20)", () => {
  const base = createMondeDefaut();
  for (const g of GROUPES_GRADES) {
    const garde =
      g.corps === "Police municipale" ? gardePolice :
      g.corps === "Sapeurs-pompiers" ? gardePompiers :
      g.corps === "Armée" ? gardeArmee : undefined;
    for (const gr of g.grades) {
      const monde = ajouterPnj(base, nouveauPnj({ prenom: "Garde", nom: "De-Test", metier: "agent", statut: "agent_public", grade: gr }));
      if (garde) {
        assert.equal(
          garde(monde).filter((p) => p.nom === "De-Test").length,
          1,
          gr + " (" + g.corps + ") doit être repéré par sa garde",
        );
      } else {
        assert.ok(
          gardePolice(monde).every((p) => p.nom !== "De-Test") &&
            gardePompiers(monde).every((p) => p.nom !== "De-Test"),
          gr + " (Mairie) n'appartient à aucune garde",
        );
      }
    }
  }
});

test("v1.20 : la garde lit le corps du référentiel — un suffixe plausible sur un grade inconnu ne garde plus", () => {
  // « faux_pm » ressemble à une clé de police par son suffixe, mais il
  // n'existe pas dans le référentiel : plus de garde fantôme. La figurine
  // sera journalisée au salaire de secours (test suivant), à corriger.
  const monde = ajouterPnj(
    createMondeDefaut(),
    nouveauPnj({ prenom: "Faux", nom: "Suffixe", metier: "agent", statut: "agent_public", grade: "faux_pm" }),
  );
  assert.ok(
    gardePolice(monde).every((p) => p.grade !== "faux_pm"),
    "faux_pm ne doit plus être compté comme police (détection par corps)",
  );
  assert.ok(
    gardePompiers(monde).every((p) => p.grade !== "faux_pm"),
    "faux_pm ne doit pas être compté comme pompier",
  );
  assert.ok(
    gardeArmee(monde).every((p) => p.grade !== "faux_pm"),
    "faux_pm ne doit pas être compté comme armée",
  );
});

test("v1.20 : salaire de secours journalisé — un grade inconnu paie 50 L/jour et le journal le raconte", () => {
  let e = ajouterPnj(
    createMondeDefaut(),
    nouveauPnj({ prenom: "Cas", nom: "Inconnu", metier: "agent", statut: "agent_public", grade: "commisaire_pm" }),
  );
  e = passerJour(e);
  const entree = e.journal.find(
    (j) => j.type === "salaires" && j.texte.includes("salaire de secours") && j.texte.includes("Cas Inconnu"),
  );
  assert.ok(entree, "le salaire de secours doit être journalisé (plus de paiement silencieux)");
  assert.match(entree.texte, /commisaire_pm/);
  assert.equal(entree.montant, 5000); // 50,00 L bruts, retenus à la source
});

test("v1.21 : corps Mairie — trois grades croissants pour les agents municipaux (balayeurs, éboueurs, chefs d'équipe)", () => {
  const mairie = GROUPES_GRADES.find((g) => g.corps === "Mairie");
  assert.ok(mairie, "le corps Mairie existe");
  assert.deepEqual(mairie.grades, ["adjoint_technique", "agent_maitrise", "technicien_territorial"]);
  assert.equal(salaireJourL("adjoint_technique"), 48.3);
  assert.equal(salaireJourL("agent_maitrise"), 55.0);
  assert.equal(salaireJourL("technicien_territorial"), 61.7);
});

test("v1.21 : la brigade municipale du monde par défaut est payée et ne garde rien (aucun corps de sécurité)", () => {
  const m = createMondeDefaut();
  const brigade = m.pnjs.filter((p) => p.batimentId !== null && p.metier.match(/balayeur|éboueuse|voirie/));
  assert.equal(brigade.length, 3, "balayeur, éboueuse, chef d'équipe");
  assert.ok(brigade.every((p) => p.statut === "agent_public"));
  assert.ok(brigade.every((p) => corpsDuGrade(p.grade ?? "") === "Mairie"));
  assert.ok(
    brigade.every((p) => !gardePolice(m).includes(p) && !gardePompiers(m).includes(p) && !gardeArmee(m).includes(p)),
    "les agents municipaux n'appartiennent à aucune garde",
  );
  const soldes = brigade.reduce((s, p) => s + Math.round(salaireJourL(p.grade ?? "") * 100), 0);
  assert.equal(soldes, Math.round((48.3 + 48.3 + 55.0) * 100), "soldes brutes de la brigade (grilles FPT 2025)");
});
