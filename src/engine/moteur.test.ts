// Tests du moteur (phases 1 à 3.6) — exécution : npm test
// (node --experimental-strip-types --test src/engine/moteur.test.ts)
// Critère d'acceptation phase 1 : 30 jours passés, argent cohérent, journal lisible.
// Phase 2 : incidents tirés (règle R × P × K / 10000 / 365), garde des
// services, dégâts/vols tracés, déterminisme seedé par jour.
// Phase 3.6 : modèle flux — les commerces redistribuent leurs recettes du
// jour (salaires + primes), la marge patronale seule reste au patron.

import test from "node:test";
import assert from "node:assert/strict";

import type { Etat, JournalEntree } from "./types.ts";
import {
  ajouterPnj,
  ajouterBatiment,
  createMondeDefaut,
  emprunterVille,
  modifierVille,
  nouveauBatiment,
  nouveauPnj,
  rembourserVille,
  supprimerPnj,
} from "./monde.ts";
import { migrerEtat } from "./migrations.ts";
import {
  chargesJournalieres,
  interetsDus,
  coefficientRenfort,
  effectifMax,
  impotSur,
  joursDeMarge,
  monnaieEnCircuit,
  PART_SALARIALE_FLUX,
  passerJour,
  repartir,
} from "./moteur.ts";
import { gardeArmee, gardePolice, gardePompiers, probaQuotidienne } from "./evenements.ts";
import { COEFF_INTENSITE_DEFAUT, salaireJourL, TAUX_IMPOT_DEFAUT_BP } from "./referentiel.ts";

function entrees(jour: number, type: string, j: JournalEntree[]): JournalEntree[] {
  return j.filter((e) => e.jour === jour && e.type === type);
}

/** K = 1 : probabilités d'incident quasi nulles, pour isoler l'économie. */
function calme(etat: Etat): Etat {
  return modifierVille(etat, { coeffIntensite: 1 });
}

test("monde par défaut : 11 bâtiments, 48 figurines (garnison incluse), jour 0", () => {
  const m = createMondeDefaut();
  assert.equal(m.batiments.length, 11);
  assert.equal(m.pnjs.length, 48);
  assert.equal(m.jour, 0);
  assert.equal(m.params.tauxImpotBp, TAUX_IMPOT_DEFAUT_BP);
  const services = m.batiments.filter((b) => b.type === "service_public");
  assert.equal(services.length, 4);
  const agents = m.pnjs.filter((p) => p.statut === "agent_public");
  assert.equal(agents.length, 6);
  const boutiques = m.batiments.filter((b) => b.type === "commerce");
  assert.equal(boutiques.length, 3);
});

test("un jour : impôts retenus à la source, salaires versés, sorties tracées, achats encaissés", () => {
  const m = calme(createMondeDefaut());
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
  assert.equal(entrees(1, "flux", j1.journal).length, 3, "trois commerces racontent leur flux");
  // Sans employé, un commerce thésaurise : la phase 3.6 le raconte (stock).
  assert.ok(
    entrees(1, "flux", j1.journal).every((e) => e.texte.includes("stock")),
    "l'accumulation sans employé est racontée",
  );
  // Recettes du dernier jour persistées (calibrage des effectifs).
  assert.ok(j1.recettesCommerce !== undefined);
  assert.equal(Object.keys(j1.recettesCommerce!).length, 3);
  for (const v of Object.values(j1.recettesCommerce!)) assert.ok(v > 70000, "recettes: " + v);
  // Fonctionnement rerouté : la ville achète sur place (montant identique).
  assert.ok(fonct[0].texte.includes("commerces locaux"), "l'achat sur place est raconté");
});

test("conservation de la monnaie sur 30 jours (circuit fermé exact)", () => {
  const m = createMondeDefaut();
  const initial = monnaieEnCircuit(m);
  let e: Etat = m;
  for (let i = 0; i < 30; i++) e = passerJour(e);
  const restant = monnaieEnCircuit(e);
  assert.equal(
    restant,
    initial + e.mouvementsBanqueCumules - e.sortiesCumulees - e.pertesCumulees,
  );
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
  const m = calme(createMondeDefaut());
  const avant = m.pnjs.find((p) => p.prenom === "Mario")!.compte;
  const j1 = passerJour(m);
  const mario = j1.pnjs.find((p) => p.prenom === "Mario")!;
  assert.ok(mario.compte > avant, "Mario doit s'enrichir");
  // les 44 autres figurines achètent chez 3 commerçants ; Mario ne peut pas
  // acheter chez lui : il achète dans les 2 autres boutiques.
  assert.ok(mario.compte - avant > 50000, "encaissement journalier > 500 L");
});

test("impôt à la source : sans gain, pas d'impôt — même à sec", () => {
  const m = calme(createMondeDefaut());
  const taux = m.params.tauxImpotBp;
  m.pnjs[10] = { ...m.pnjs[10], compte: 100 }; // 1,00 L, aucun gain à venir
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
  assert.equal(j1.pnjs[10].compte, 0);
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
  const m = calme(createMondeDefaut());
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
  assert.equal(migrerEtat("n'importe quoi").pnjs.length, 48);
  const futur = migrerEtat({ schemaVersion: 99 });
  assert.equal(futur.pnjs.length, 48, "version future -> monde par défaut");
  const m = migrerEtat({ schemaVersion: 1, jour: 5 });
  assert.equal(m.jour, 5, "le jour est conservé");
  assert.ok(Array.isArray(m.journal) && Array.isArray(m.pnjs) && Array.isArray(m.batiments));
  assert.ok(typeof m.budgetVille === "number" && typeof m.params.tauxImpotBp === "number");
  assert.equal(m.params.coeffIntensite, COEFF_INTENSITE_DEFAUT, "v1 -> v2 : K complété au défaut");
  assert.equal(m.pertesCumulees, 0, "v1 -> v2 : pertes initialisées");
  assert.equal(m.schemaVersion, 5, "v1 -> v5 : schema à jour");
  assert.equal(
    m.params.tauxImpotBp,
    TAUX_IMPOT_DEFAUT_BP,
    "v4 et moins : la base fiscale change, retour au taux par défaut",
  );
  assert.equal(m.dette, 0, "v2 -> v3 : dette initialisée");
  assert.equal(m.mouvementsBanqueCumules, 0, "v2 -> v3 : mouvements banque initialisés");
  assert.ok(m.pnjs.every((p) => p.travailBatimentId === null), "v3 -> v4 : lieu de travail initialisé");
  assert.deepEqual(m.recettesCommerce, {}, "v3 -> v4 : recettes des commerces initialisées");
  // v5 : le taux réglé par le joueur est conservé tel quel.
  const v5 = migrerEtat({
    schemaVersion: 5,
    jour: 3,
    params: { tauxImpotBp: 555, coeffIntensite: 2 },
  });
  assert.equal(v5.jour, 3, "v5 : le jour est conservé");
  assert.equal(v5.params.tauxImpotBp, 555, "v5 : le taux choisi par le joueur est conservé");
  assert.equal(v5.params.coeffIntensite, 2, "v5 : K conservé");
});

// ---------- Phase 2 : incidents, garde des services ----------

test("garde : pompiers (pro + volontaire) et police identifiés par métier/grade", () => {
  const m = createMondeDefaut();
  assert.equal(gardePompiers(m).length, 2, "Élodie + la sapeuse-pompière volontaire");
  assert.equal(gardePolice(m).length, 1, "Karim, policier municipal");
});

test("règle d'échelle : R × P × K / 10000 / 365", () => {
  // R = 34,21 incendies/10k/an, P = 45 figurines, K = 1000 -> ~0,42/jour
  const p = probaQuotidienne(34.21, 45, 1000);
  assert.ok(Math.abs(p - 0.4219) < 0.001, "proba = " + p);
  assert.equal(probaQuotidienne(34.21, 45, 1) < 0.001, true, "K = 1 : ville quasi paisible");
});

test("K géant : le jour 1 déborde d'incidents", () => {
  const m = modifierVille(createMondeDefaut(), { coeffIntensite: 100000 });
  const j1 = passerJour(m);
  const inc = entrees(1, "incident", j1.journal);
  assert.ok(inc.length >= 2, "incidents attendus, obtenu : " + inc.length);
  assert.ok(j1.journal.some((e) => e.texte.includes("s'embrase")), "l'incendie est raconté");
});

test("incendie sans pompiers ni budget : le bâtiment reste sinistré", () => {
  let m = createMondeDefaut();
  for (const p of gardePompiers(m)) m = supprimerPnj(m, p.id);
  // ville pauvre : la réparation ne pourra pas suivre, le sinistre marque le bâtiment
  m = modifierVille(m, { coeffIntensite: 100000, budgetVille: 100 });
  const j1 = passerJour(m);
  assert.ok(
    j1.journal.some((e) => e.texte.includes("aucun pompier")),
    "le journal raconte l'absence de pompiers",
  );
  const touches = j1.batiments.filter((b) => b.etat === "sinistre");
  assert.ok(touches.length >= 1, "un bâtiment sinistré");
  assert.ok(j1.batiments.some((b) => b.valeur < 300000 && b.etat === "sinistre"), "valeur dépréciée");
  assert.equal(gardePompiers(j1).length, 0);
});

test("garde au complet : l'incendie est maîtrisé, dégâts légers", () => {
  let m = createMondeDefaut();
  // 4 pompiers supplémentaires : garde de 5, gravité 3 couverte.
  for (let i = 0; i < 4; i++) {
    m.pnjs.push(
      nouveauPnj({
        prenom: "Pompier" + i,
        nom: "Test" + i,
        metier: "sapeur-pompier",
        statut: "agent_public",
        grade: "sapeur_pompier_debutant",
        batimentId: m.batiments[2].id,
        revenuIndicatif: 5800,
      }),
    );
  }
  const m2 = modifierVille(m, { coeffIntensite: 100000 });
  const j1 = passerJour(m2);
  assert.equal(j1.batiments.filter((b) => b.etat === "sinistre").length, 0, "aucun sinistre");
  const feu = j1.journal.find((e) => e.texte.includes("s'embrase"));
  assert.ok(feu !== undefined && feu.texte.includes("avant midi"), "maitrise rapide racontée");
  // dégâts légers : <= 2 % x 3 de la valeur du plus gros bâtiment
  const maxValeur = Math.max(...j1.batiments.map((b) => b.valeur));
  assert.ok(Math.abs(feu.montant ?? 0) <= Math.round(maxValeur * 0.06));
});

test("cambriolage sans police : la perte sort du circuit", () => {
  let m = createMondeDefaut();
  for (const p of gardePolice(m)) m = supprimerPnj(m, p.id);
  const avant = monnaieEnCircuit(m);
  const m2 = modifierVille(m, { coeffIntensite: 100000 });
  const j1 = passerJour(m2);
  const vols = j1.journal.filter((e) => e.texte.includes("Cambriolage"));
  assert.ok(vols.length >= 1, "le cambriolage est raconté");
  assert.ok(j1.pertesCumulees > 0, "pertes tracées : " + j1.pertesCumulees);
  const apres = monnaieEnCircuit(j1);
  assert.equal(apres, avant - j1.sortiesCumulees - j1.pertesCumulees, "conservation exacte");
});

test("déterminisme : même jour, mêmes événements, toujours", () => {
  const m = createMondeDefaut();
  const a = passerJour(m);
  const b = passerJour(m);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test("l'éditeur raconte : emménagement, arrivée, départ, ouverture", () => {
  let m = createMondeDefaut();
  const n = m.journal.length;
  m = ajouterBatiment(m, nouveauBatiment({ nom: "Maison des Tests", type: "habitation" }));
  assert.ok(m.journal.length > n, "une entrée de journal a été ajoutée");
  assert.ok(m.journal.some((e) => e.texte.includes("Maison des Tests")));
});

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

test("les intérêts coulent chaque jour vers la banque (3,54 %/an réel)", () => {
  let m = calme(createMondeDefaut());
  m = emprunterVille(m, 10000000); // 100 000 L
  const interets = interetsDus(10000000);
  assert.ok(interets > 900 && interets < 1000, "≈ 9,70 L/jour : " + interets);
  const j1 = passerJour(m);
  const dette = entrees(1, "dette", j1.journal);
  assert.equal(dette.length, 1);
  assert.equal(dette[0].montant, -interets);
  assert.ok(j1.sortiesCumulees >= interets, "les intérêts sont une sortie documentée");
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
  m = emprunterVille(m, 300000);
  m = rembourserVille(m, 100000);
  assert.equal(m.dette, 200000);
  assert.equal(m.mouvementsBanqueCumules, 200000);
  const libre = rembourserVille(m, 999999999);
  assert.equal(libre.dette, 0, "pas de remboursement au-delà de l'encours");
  assert.ok(libre.journal.some((x) => x.texte.includes("plus un centime de dette")), "la délivrance est racontée");
});

test("alerte trésorerie : le journal somme la ville de choisir", () => {
  let m = calme(createMondeDefaut());
  m = modifierVille(m, { budgetVille: 300 });
  const j1 = passerJour(m);
  assert.ok(joursDeMarge(j1) <= 5, "la marge est critique");
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

// ---------- phase 3.5 : corps, grades hiérarchisés, branche militaire ----------

test("grilles de salaires strictement croissantes dans chaque corps", () => {
  const pompiers = [
    "sapeur_pompier_debutant", "sapeur_1re_classe_spp", "caporal_spp", "caporal_chef_spp",
    "sergent_spp", "adjudant_spp", "adjudant_chef_spp", "lieutenant_spp", "capitaine_spp",
    "commandant_spp", "lieutenant_colonel_spp", "colonel_spp",
  ];
  const police = ["policier_municipal", "brigadier_pm", "brigadier_chef_pm", "major_pm", "inspecteur_pm"];
  const armee = [
    "soldat_armee", "caporal_armee", "caporal_chef_armee", "sergent_armee", "sergent_chef_armee",
    "sous_lieutenant_armee", "adjudant_armee", "adjudant_chef_armee", "major_armee", "lieutenant_armee",
    "capitaine_armee", "commandant_armee", "lieutenant_colonel_armee", "colonel_armee", "general_armee",
  ];
  for (const grades of [pompiers, police, armee]) {
    for (let i = 1; i < grades.length; i++) {
      assert.ok(
        salaireJourL(grades[i]) > salaireJourL(grades[i - 1]),
        grades[i] + " (" + salaireJourL(grades[i]) + ") doit gagner plus que " + grades[i - 1] +
          " (" + salaireJourL(grades[i - 1]) + ")",
      );
    }
  }
  // Bas de tableau modeste, haut de tableau confortable (référentiel v1.4).
  assert.ok(salaireJourL("soldat_armee") < 50);
  assert.ok(salaireJourL("general_armee") > 180);
  assert.ok(salaireJourL("colonel_spp") > 160);
});

test("gardeArmee : la garnison est détectée par grade et par métier", () => {
  const m = createMondeDefaut();
  const g = gardeArmee(m);
  assert.equal(g.length, 3);
  assert.ok(g.every((p) => p.grade?.endsWith("_armee")));

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
    pnjs: m.pnjs.filter((p) => !(p.grade ?? "").endsWith("_armee")),
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
      nouveauPnj({ prenom: "Claire", nom: "Test", statut: "prive", revenuIndicatif: 5250, budgetAchat: 20000, compte: 200000 }),
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
      nouveauPnj({ prenom: "Claire", nom: "Test", statut: "prive", revenuIndicatif: 5250, budgetAchat: 20000, compte: 200000 }),
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

test("flux : sans commerce ouvert, la ville se fournit à l'extérieur (sortie tracée)", () => {
  let m = calme(createMondeDefaut());
  for (const p of m.pnjs.filter((p) => p.statut === "commercant")) m = supprimerPnj(m, p.id);
  const j1 = passerJour(m);
  const fonct = entrees(1, "fonctionnement", j1.journal)[0];
  assert.ok(fonct.texte.includes("extérieurs"), "l'approvisionnement extérieur est raconté");
  assert.equal(fonct.montant, 8000, "le fonctionnement reste dû");
  assert.equal(j1.sortiesCumulees, 8000, "la sortie est tracée");
  assert.equal(Object.keys(j1.recettesCommerce ?? {}).length, 0, "aucune recettes de commerce");
});

test("flux : deux employés au Fournil Doré, la bascule stock vers flux en monde réel", () => {
  const m = calme(createMondeDefaut());
  const boulangerie = m.batiments.find((b) => b.nom.includes("Fournil"))!.id;
  m.pnjs[10] = { ...m.pnjs[10], travailBatimentId: boulangerie, revenuIndicatif: 5775 };
  m.pnjs[11] = { ...m.pnjs[11], travailBatimentId: boulangerie, revenuIndicatif: 5775 };
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
