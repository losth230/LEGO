// Tests du moteur (phases 1 à 3.9) — exécution : npm test
// (node --experimental-strip-types --test src/engine/moteur.test.ts)
// Critère d'acceptation phase 1 : 30 jours passés, argent cohérent, journal lisible.
// Phase 2 : incidents tirés (règle R × P × K / 10000 / 365), garde des
// services, dégâts/vols tracés, déterminisme seedé par jour.
// Phase 3.6 : modèle flux — les commerces redistribuent leurs recettes du
// jour (salaires + primes), la marge patronale seule reste au patron.
// Phase 3.9 : cartes d'identité & milieu criminel — profil criminel pondéré,
// territoire de gang, arrestations, guerres de gangs, migration v8.
// Phase 3.10 : traits actifs & détention au commissariat — consommation
// modulée (±20 %), ciblage pondéré par traits, prime de garde, rédemption,
// éditeur des gangs.

import test from "node:test";
import assert from "node:assert/strict";

import type { Etat, JournalEntree } from "./types.ts";
import {
  ajouterPnj,
  ajouterBatiment,
  ajouterGang,
  budgetAleatoire,
  createMondeDefaut,
  emprunterVille,
  modifierVille,
  nouveauBatiment,
  nouveauGang,
  nouveauPnj,
  rembourserVille,
  supprimerPnj,
  supprimerGang,
} from "./monde.ts";
import { migrerEtat } from "./migrations.ts";
import {
  budgetAchat,
  chargesJournalieres,
  interetsDus,
  coefficientRenfort,
  effectifMax,
  impotSur,
  joursDeMarge,
  monnaieEnCircuit,
  PART_SALARIALE_FLUX,
  passerJour,
  racheter,
  repartir,
  serviceLocal,
} from "./moteur.ts";
import {
  generateurPour,
  gardeArmee,
  gardePolice,
  gardePompiers,
  poidsAccident,
  poidsVictime,
  probaQuotidienne,
  profilCriminel,
} from "./evenements.ts";
import {
  CHANCE_REDEMPTION_ACTIF,
  CHANCE_REDEMPTION_SANS,
  COEFF_INTENSITE_DEFAUT,
  FRAIS_DETENTION_L,
  salaireJourL,
  TAUX_IMPOT_DEFAUT_BP,
} from "./referentiel.ts";

function entrees(jour: number, type: string, j: JournalEntree[]): JournalEntree[] {
  return j.filter((e) => e.jour === jour && e.type === type);
}

/** K = 1 : probabilités d'incident quasi nulles, pour isoler l'économie. */
function calme(etat: Etat): Etat {
  return modifierVille(etat, { coeffIntensite: 1 });
}

/** Neutralise le budget courses d'un PNJ pour suivre son compte au centime. */
function neutraliserCourses(etat: Etat, metier: string): void {
  const i = etat.pnjs.findIndex((p) => p.metier === metier);
  if (i >= 0) etat.pnjs[i] = { ...etat.pnjs[i], budgetAchat: 0 };
}

test("monde par défaut : 14 bâtiments, 55 figurines (garnison et gang incluses), jour 0", () => {
  const m = createMondeDefaut();
  assert.equal(m.batiments.length, 14);
  assert.equal(m.pnjs.length, 55);
  assert.equal(m.jour, 0);
  assert.equal(m.params.tauxImpotBp, TAUX_IMPOT_DEFAUT_BP);
  const services = m.batiments.filter((b) => b.type === "service_public");
  assert.equal(services.length, 4);
  const agents = m.pnjs.filter((p) => p.statut === "agent_public");
  assert.equal(agents.length, 6);
  // Monde 100 % fermé : 3 boutiques de consommation + 3 services à vocation
  // (hôpital, BTP, banque), chacun tenu par son gérant. La détention se
  // joue au commissariat (Poste de police), pas dans un bâtiment dédié.
  const boutiques = m.batiments.filter((b) => b.type === "commerce" && !b.vocation);
  assert.equal(boutiques.length, 3);
  assert.ok(serviceLocal(m, "sante") !== null, "l'hôpital est en ville et tenu");
  assert.ok(serviceLocal(m, "btp") !== null, "le BTP est en ville et tenu");
  assert.ok(serviceLocal(m, "banque") !== null, "la banque est en ville et tenue");
  assert.equal(m.batiments.filter((b) => b.type === "commerce").length, 6);
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
  assert.equal(migrerEtat("n'importe quoi").pnjs.length, 55);
  const futur = migrerEtat({ schemaVersion: 99 });
  assert.equal(futur.pnjs.length, 55, "version future -> monde par défaut");
  const m = migrerEtat({ schemaVersion: 1, jour: 5 });
  assert.equal(m.jour, 5, "le jour est conservé");
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
  assert.ok(m.pnjs.every((p) => p.travailBatimentId === null), "v3 -> v4 : lieu de travail initialisé");
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

test("incendie sans pompiers ni budget : le bâtiment reste sinistré, les caisses vides ne réparent rien", () => {
  let m = createMondeDefaut();
  for (const p of gardePompiers(m)) m = supprimerPnj(m, p.id);
  // ville pauvre : la réparation ne pourra pas suivre, le sinistre marque le bâtiment
  m = modifierVille(m, { coeffIntensite: 100000, budgetVille: 100 });
  neutraliserCourses(m, "chef d'entreprise BTP");
  const darioAvant = m.pnjs.find((p) => p.metier === "chef d'entreprise BTP")!.compte;
  const j1 = passerJour(m);
  assert.ok(
    j1.journal.some((e) => e.texte.includes("aucun pompier")),
    "le journal raconte l'absence de pompiers",
  );
  const touches = j1.batiments.filter((b) => b.etat === "sinistre");
  assert.ok(touches.length >= 1, "un bâtiment sinistré");
  assert.ok(
    j1.journal.some((e) => e.texte.includes("les caisses sont vides") && e.texte.includes("reste marqué")),
    "le BTP ne répare pas sans être payé",
  );
  assert.equal(j1.sortiesCumulees, 0, "monde fermé : rien ne part vers l'extérieur");
  const dario = j1.pnjs.find((p) => p.metier === "chef d'entreprise BTP")!;
  const retenuDario = j1.journal
    .filter(
      (e) =>
        e.type === "incident" &&
        e.texte.includes("Dario Costa") &&
        (e.texte.includes("Cambriolage") || e.texte.includes("Accident")),
    )
    .reduce((s, e) => s + (e.montant ?? 0), 0);
  assert.equal(
    dario.compte,
    darioAvant + retenuDario,
    "aucune réparation payée : les caisses étaient vides",
  );
  const base = new Map(m.batiments.map((b) => [b.id, b.valeur]));
  assert.ok(
    touches.every((b) => b.valeur < base.get(b.id)!),
    "les sinistrés ont perdu de la valeur",
  );
  assert.equal(gardePompiers(j1).length, 0);
});

test("incendie avec budget : les réparations encaissées par le BTP local restent en ville", () => {
  let m = createMondeDefaut();
  m = modifierVille(m, { coeffIntensite: 100000, budgetVille: 50000000 });
  neutraliserCourses(m, "chef d'entreprise BTP");
  const darioAvant = m.pnjs.find((p) => p.metier === "chef d'entreprise BTP")!.compte;
  const j1 = passerJour(m);
  const degatsFeux = j1.journal
    .filter((e) => e.type === "incident" && e.texte.includes("s'embrase"))
    .reduce((s, e) => s - (e.montant ?? 0), 0);
  assert.ok(degatsFeux > 0, "au moins un incendie");
  const retenuDario = j1.journal
    .filter(
      (e) =>
        e.type === "incident" &&
        e.texte.includes("Dario Costa") &&
        (e.texte.includes("Cambriolage") || e.texte.includes("Accident")),
    )
    .reduce((s, e) => s + (e.montant ?? 0), 0);
  const dario = j1.pnjs.find((p) => p.metier === "chef d'entreprise BTP")!;
  assert.equal(
    dario.compte,
    darioAvant + degatsFeux - impotSur(degatsFeux, j1.params.tauxImpotBp) + retenuDario,
    "le BTP de la ville encaisse les réparations, moins l'impôt sur sa marge",
  );
  assert.equal(j1.sortiesCumulees, 0, "monde fermé");
  assert.ok(
    entrees(1, "flux", j1.journal).some((e) => e.texte.includes("Bâtisseurs")),
    "le BTP raconte sa recette du soir",
  );
});

test("accident : les soins sont facturés à l'hôpital local, l'argent reste en ville", () => {
  let m = createMondeDefaut();
  m = modifierVille(m, { coeffIntensite: 100000 });
  neutraliserCourses(m, "cheffe de l'hôpital");
  const sofiaAvant = m.pnjs.find((p) => p.metier === "cheffe de l'hôpital")!.compte;
  const j1 = passerJour(m);
  const accident = j1.journal.find((e) => e.type === "incident" && e.texte.includes("Accident"));
  assert.ok(accident !== undefined, "un accident est arrivé");
  assert.ok(
    accident.texte.includes("soins facturés à Hôpital Sainte-Brique"),
    "l'hôpital local facture les soins",
  );
  const frais = -(accident.montant ?? 0);
  assert.ok(frais > 0, "des frais ont bien été facturés");
  const retenuSofia = j1.journal
    .filter(
      (e) =>
        e.type === "incident" &&
        e.texte.includes("Sofia Marchand") &&
        (e.texte.includes("Cambriolage") || e.texte.includes("Accident")),
    )
    .reduce((s, e) => s + (e.montant ?? 0), 0);
  const sofia = j1.pnjs.find((p) => p.metier === "cheffe de l'hôpital")!;
  assert.equal(
    sofia.compte,
    sofiaAvant + frais - impotSur(frais, j1.params.tauxImpotBp) + retenuSofia,
    "l'hôpital encaisse les soins, moins l'impôt sur sa marge du jour",
  );
  assert.equal(j1.sortiesCumulees, 0, "monde fermé");
});

test("sans hôpital : aucun service de santé, aucun frais", () => {
  let m = createMondeDefaut();
  m = modifierVille(m, { coeffIntensite: 100000 });
  const sofia = m.pnjs.find((p) => p.metier === "cheffe de l'hôpital")!;
  m = supprimerPnj(m, sofia.id); // l'hôpital reste, sans gérant il est fermé
  const j1 = passerJour(m);
  assert.ok(serviceLocal(j1, "sante") === null, "plus de service de santé tenu");
  const accident = j1.journal.find((e) => e.type === "incident" && e.texte.includes("Accident"));
  assert.ok(accident !== undefined, "un accident est arrivé");
  assert.ok(
    accident.texte.includes("aucun service de santé en ville"),
    "l'absence de service de santé est racontée",
  );
  assert.equal(accident.montant ?? 0, 0, "personne ne paie, personne n'est payé");
  assert.equal(j1.sortiesCumulees, 0, "monde fermé");
});

test("emprunter sans banque : pas de crédit ; la dette dort sans banquier", () => {
  let m = calme(createMondeDefaut());
  m = emprunterVille(m, 10000000);
  const emile = m.pnjs.find((p) => p.metier === "banquier")!;
  m = supprimerPnj(m, emile.id); // la banque reste, sans gérant elle est fermée
  assert.ok(serviceLocal(m, "banque") === null, "plus de banque tenue");
  const refuse = emprunterVille(m, 100000);
  assert.equal(refuse.dette, 10000000, "pas de nouvel emprunt");
  assert.equal(refuse.budgetVille, m.budgetVille, "les caisses ne bougent pas");
  assert.ok(refuse.journal.some((e) => e.texte.includes("aucune banque")), "le refus est raconté");
  const j1 = passerJour(m);
  assert.equal(j1.dette, 10000000, "sans banque, la dette dort : aucun intérêt prélevé ni capitalisé");
  assert.equal(entrees(1, "dette", j1.journal).length, 0, "aucune écriture d'intérêts");
  assert.equal(j1.sortiesCumulees, 0, "monde fermé");
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

test("cambriolage sans police : le butin change de poche, rien ne disparaît", () => {
  let m = createMondeDefaut();
  for (const p of gardePolice(m)) m = supprimerPnj(m, p.id);
  const avant = monnaieEnCircuit(m);
  const m2 = modifierVille(m, { coeffIntensite: 100000 });
  const j1 = passerJour(m2);
  const vols = j1.journal.filter((e) => e.texte.includes("Cambriolage"));
  assert.ok(vols.length >= 1, "le cambriolage est raconté");
  assert.ok(j1.volsCumules > 0, "butins tracés : " + j1.volsCumules);
  assert.equal(j1.pertesCumulees, 0, "plus aucune perte : le monde est fermé");
  const apres = monnaieEnCircuit(j1);
  assert.equal(apres, avant, "conservation exacte, vols compris : l'argent reste en ville");
  // Le butin est dans la poche d'un figurant nommé par le journal.
  const texteVol = vols.find((e) => e.texte.includes("poche de"))!;
  const nom = /poche de (.+) : le butin/.exec(texteVol.texte)![1];
  const voleur = j1.pnjs.find((p) => p.prenom + " " + p.nom === nom);
  assert.ok(voleur !== undefined, "le voleur est un figurant de la ville : " + nom);
  assert.ok(voleur.compte > 0, "le voleur a bien encaissé son butin");
});

test("déterminisme : même jour, mêmes événements, toujours", () => {
  const m = createMondeDefaut();
  const a = passerJour(m);
  const b = passerJour(m);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

// ---------- Phase 3.9 : cartes d'identité & milieu criminel ----------

/** Neutralise tout profil criminel d'un monde (figurines privées et commerçants). */
function assainir(m: Etat): void {
  for (const p of m.pnjs) {
    if (p.statut === "agent_public") continue;
    if (p.gangId) continue; // les gangs du monde témoin restent en place
    p.personnalite = ["honnête", "travailleur"];
    p.casier = 0;
    p.compte = Math.max(p.compte, 15 * Math.max(p.revenuIndicatif, 1)); // pas de pauvreté
  }
}

test("profil criminel : les traits, la pauvreté et le casier pèsent, pas le hasard", () => {
  const honnete = nouveauPnj({
    prenom: "Alice", nom: "Test", personnalite: ["honnête", "travailleur"],
    revenuIndicatif: 6000, compte: 600000,
  });
  const cupide = nouveauPnj({
    prenom: "Bob", nom: "Test", personnalite: ["cupide", "discret"],
    revenuIndicatif: 1500, compte: 10000, casier: 2, gangId: "g1",
  });
  assert.equal(profilCriminel(honnete), 0, "honnête travailleur aisé : profil nul, il ne vole jamais");
  assert.ok(profilCriminel(cupide) >= 10, "cupide, fauché, récidiviste et en gang : profil élevé");
});

test("milieu criminel : chaque voleur journalisé porte un casier (tirage profilé)", () => {
  let m = createMondeDefaut();
  m = modifierVille(m, { coeffIntensite: 100000 });
  // Budgets aléatoires (v1.16) : les gros tirages vident vite les comptes —
  // on garantit des victimes solvables sur toute la période testée.
  m.pnjs.forEach((p) => {
    if (p.statut !== "agent_public") p.compte = Math.max(p.compte, 5000000);
  });
  for (let j = 1; j <= 30; j++) m = passerJour(m);
  const vols = m.journal.filter((e) => e.texte.includes("poche de"));
  assert.ok(vols.length > 0, "des cambriolages ont eu lieu sur 30 jours");
  for (const v of vols) {
    const nom = /poche de (.+) : le butin/.exec(v.texte)![1];
    const voleur = m.pnjs.find((p) => p.prenom + " " + p.nom === nom);
    assert.ok(voleur !== undefined, "le voleur est un figurant de la ville : " + nom);
    assert.ok((voleur.casier ?? 0) > 0, "le voleur est un criminel au casier connu : " + nom);
  }
});

test("territoire de gang : les Corbeaux ne volent que sur leur terrain", () => {
  let m = createMondeDefaut();
  assainir(m); // seul le gang garde un profil criminel
  // Budgets aléatoires (v1.16) : victimes solvables sur toute la période.
  m.pnjs.forEach((p) => {
    if (p.statut !== "agent_public") p.compte = Math.max(p.compte, 5000000);
  });
  m = modifierVille(m, { coeffIntensite: 100000 });
  for (let j = 1; j <= 20; j++) m = passerJour(m);
  const vols = m.journal.filter((e) => e.texte.includes("Cambriolage chez"));
  assert.ok(vols.length > 0, "des cambriolages ont eu lieu sur 20 jours");
  const territoire = m.gangs![0].quartiers;
  for (const v of vols) {
    const nom = /Cambriolage chez (.+?) : /.exec(v.texte)![1];
    const cible = m.pnjs.find((p) => p.prenom + " " + p.nom === nom);
    assert.ok(cible !== undefined, "cible connue : " + nom);
    const bat = m.batiments.find((b) => b.id === cible!.batimentId);
    assert.ok(
      bat !== undefined && territoire.includes(bat.quartier),
      "la victime vit sur le territoire du gang : " + nom + " (" + (bat?.quartier ?? "?") + ")",
    );
  }
});

test("arrestation : la police surprend le voleur, il ne vole plus pendant sa détention", () => {
  let m = createMondeDefaut();
  assainir(m);
  // Une seule criminelle en ville : cupide, fauchée, indépendante.
  const criminelle = m.pnjs.find((p) => p.statut === "prive" && !p.gangId)!;
  criminelle.personnalite = ["cupide", "discret"];
  criminelle.compte = 10000;
  // Police nombreuse : 3 patrouilleurs couvrent la gravité 3.
  for (let i = 0; i < 2; i++) {
    m = ajouterPnj(m, nouveauPnj({
      prenom: "Renfort", nom: "Police" + i, metier: "policier municipal",
      statut: "agent_public", grade: "policier_municipal",
      batimentId: m.batiments[1].id, revenuIndicatif: 5300,
    }));
  }
  m = modifierVille(m, { coeffIntensite: 100000 });
  const j1 = passerJour(m);
  assert.ok(j1.journal.some((e) => e.texte.includes("arrêté sur le fait")), "l'arrestation est racontée");
  const arrete = j1.pnjs.find((p) => (p.arreteJusqua ?? 0) > j1.jour);
  assert.ok(arrete !== undefined, "le voleur est assigné à résidence");
  assert.ok((arrete!.casier ?? 0) >= 1, "le casier s'est rempli même raté");
  // Pendant toute sa détention, plus personne ne peut voler (une seule criminelle en ville).
  let e = j1;
  while (e.jour < (arrete!.arreteJusqua ?? 0)) e = passerJour(e);
  const volsPendant = e.journal.filter(
    (x) => x.texte.includes("Cambriolage chez") && x.jour > j1.jour,
  );
  assert.equal(volsPendant.length, 0, "un détenu ne peut pas voler");
});

test("guerre de gangs : pillage interne, territoire, conservation exacte", () => {
  let m = createMondeDefaut();
  assainir(m);
  // Une seule faction rivale : un indépendant cupide avec une cagnotte juteuse.
  const solo = m.pnjs.find((p) => p.statut === "prive" && !p.gangId)!;
  solo.personnalite = ["cupide", "téméraire"];
  solo.compte = 100000;
  const avant = monnaieEnCircuit(m);
  m = modifierVille(m, { coeffIntensite: 100000 });
  const j1 = passerJour(m);
  const guerre = j1.journal.find((e) => e.texte.includes("Guerre de gangs"));
  assert.ok(guerre !== undefined, "l'affrontement est raconté");
  assert.equal(j1.affrontementsCumules, 1, "l'affrontement est tracé");
  assert.equal(monnaieEnCircuit(j1), avant, "le pillage ne fait changer la monnaie que de poche");
  const gangGagne = guerre!.texte.includes("(Les Corbeaux du Sud) remporte");
  const corbeaux = j1.gangs![0];
  assert.equal(
    corbeaux.quartiers.length,
    gangGagne ? 2 : 1,
    gangGagne ? "le gang vainqueur étend son territoire" : "le gang tenace garde son seul quartier",
  );
  assert.ok(j1.volsCumules > 0, "le pillage rejoint les transferts criminels tracés");
});

test("migration v8 : carte d'identité complétée, le crime continue dans les vieilles villes", () => {
  const pnjsV7 = Array.from({ length: 13 }, (_, i) => ({
    id: "v" + i, prenom: "Vieux" + i, nom: "Test", age: 40, genre: "F" as const,
    metier: "habitant", statut: "prive" as const, batimentId: null,
    revenuIndicatif: 4000, budgetAchat: 4000, compte: 400000, epargne: 0,
  }));
  const v8 = migrerEtat({
    schemaVersion: 7, jour: 10,
    params: { tauxImpotBp: 3000, coeffIntensite: 1000 },
    pnjs: pnjsV7, batiments: [], journal: [],
  });
  assert.equal(v8.schemaVersion, 8, "v7 -> v8 : schema à jour");
  assert.ok(
    v8.pnjs.every((p) => Array.isArray(p.personnalite) && p.personnalite.length === 2),
    "v7 -> v8 : personnalité attribuée à chaque figurine",
  );
  assert.ok(
    v8.pnjs.every((p) => (p.casier ?? 0) === 0 && p.gangId === null && (p.arreteJusqua ?? 0) === 0),
    "v7 -> v8 : casier, gang et détention initialisés",
  );
  assert.deepEqual(v8.gangs, [], "v7 -> v8 : aucun gang inventé");
  assert.equal(v8.affrontementsCumules, 0, "v7 -> v8 : affrontements initialisés");
  assert.ok(
    v8.pnjs.some((p) => (p.personnalite ?? []).includes("cupide")),
    "au moins un habitant passe du mauvais côté de la barrière",
  );
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

// ---------- phase 3.5 : corps, grades hiérarchisés, branche militaire ----------

test("grilles de salaires strictement croissantes dans chaque corps", () => {
  // Référentiel v1.13 : trois grades par corps, du plus modeste au plus
  // élevé (arbitrage Thibaut 2026-11-06 ; v1.13 : l'inspecteur, métier à
  // part, cède sa place au commissaire). La garnison du monde par défaut
  // (soldat, caporal, capitaine) tient entière dans la grille conservée.
  const pompiers = ["sapeur_pompier_debutant", "sergent_spp", "colonel_spp"];
  const police = ["policier_municipal", "major_pm", "commissaire_pm"];
  const armee = ["soldat_armee", "caporal_armee", "capitaine_armee"];
  for (const grades of [pompiers, police, armee]) {
    for (let i = 1; i < grades.length; i++) {
      assert.ok(
        salaireJourL(grades[i]) > salaireJourL(grades[i - 1]),
        grades[i] + " (" + salaireJourL(grades[i]) + ") doit gagner plus que " + grades[i - 1] +
          " (" + salaireJourL(grades[i - 1]) + ")",
      );
    }
  }
  // Bas de tableau modeste, haut de tableau confortable (référentiel v1.12).
  assert.ok(salaireJourL("soldat_armee") < 50);
  assert.ok(salaireJourL("capitaine_armee") > 90);
  assert.ok(salaireJourL("commissaire_pm") > 90, "le commissaire, sommet de la police, est bien payé");
  assert.ok(salaireJourL("colonel_spp") > 160);
});

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
  // Les habitants commencent à l'indice 12 (après agents, commerçants et
  // les trois patrons des services à vocation).
  m.pnjs[12] = { ...m.pnjs[12], travailBatimentId: boulangerie, revenuIndicatif: 5775 };
  m.pnjs[13] = { ...m.pnjs[13], travailBatimentId: boulangerie, revenuIndicatif: 5775 };
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

// ---------- Phase 3.10 : traits actifs & détention au commissariat ----------

test("traits actifs : la personnalité module le budget d'achat (±20 % max)", () => {
  const base = nouveauPnj({
    prenom: "Marchande", nom: "Témoin", metier: "habitant",
    personnalite: ["honnête", "discret"], revenuIndicatif: 10000, budgetAchat: 10000, compte: 0,
  });
  assert.equal(budgetAchat(base), 10000, "sans trait moteur, la base");
  assert.equal(budgetAchat({ ...base, personnalite: ["sociable", "discret"] }), 12000, "le sociable fait vivre les commerces (+20 %)");
  assert.equal(budgetAchat({ ...base, personnalite: ["cupide", "discret"] }), 11000, "le cupide dépense (+10 %)");
  assert.equal(budgetAchat({ ...base, personnalite: ["travailleur", "discret"] }), 9000, "le travailleur économise (-10 %)");
  assert.equal(budgetAchat({ ...base, personnalite: ["prudent", "discret"] }), 8000, "le prudent garde son argent (-20 %)");
  assert.equal(budgetAchat({ ...base, personnalite: ["sociable", "cupide"] }), 12000, "clamp : sociable + cupide plafonne à +20 %");
  assert.equal(budgetAchat({ ...base, personnalite: ["prudent", "travailleur"] }), 8000, "clamp : prudent + travailleur plafonne à -20 %");
});

test("traits actifs : le ciblage pèse la personnalité (victimes ×1,5/×0,5, téméraire ×2)", () => {
  const temoin = nouveauPnj({
    prenom: "Habitable", nom: "Témoin", metier: "habitant",
    personnalite: ["honnête", "travailleur"], compte: 1000,
  });
  assert.equal(poidsVictime(temoin), 1000, "sans trait, le compte seul pèse");
  assert.equal(poidsVictime({ ...temoin, personnalite: ["cupide", "honnête"] }), 1500, "le cupide étale son argent (×1,5)");
  assert.equal(poidsVictime({ ...temoin, personnalite: ["sociable", "honnête"] }), 1500, "le sociable aussi (×1,5)");
  assert.equal(poidsVictime({ ...temoin, personnalite: ["prudent", "discret"] }), 500, "le discret cache le sien (×0,5)");
  assert.equal(poidsVictime({ ...temoin, compte: 0 }), 0, "sans le sou, pas de butin visé");
  assert.equal(poidsAccident(temoin), 1, "poids d'accident normal");
  assert.equal(poidsAccident({ ...temoin, personnalite: ["téméraire", "honnête"] }), 2, "le téméraire se fait plus souvent mal (×2)");
});

test("commissariat : la ville paie 5 L par détenu et par jour en prime de garde aux policiers", () => {
  const temoin = calme(createMondeDefaut());
  const avec = structuredClone(temoin);
  const detenu = avec.pnjs.find((p) => p.statut === "prive" && !p.gangId)!;
  detenu.arreteJusqua = 5; // détenu les jours 1 à 4, libéré le jour 5
  detenu.casier = 1;
  const j1 = passerJour(avec);
  const t1 = passerJour(temoin);
  const fonct1 = entrees(1, "fonctionnement", j1.journal)[0];
  const fonctT = entrees(1, "fonctionnement", t1.journal)[0];
  assert.ok(fonct1.texte.includes("primes de garde"), "la prime de garde est racontée");
  assert.equal(fonct1.montant! - fonctT.montant!, FRAIS_DETENTION_L * 100, "5 L par détenu, payés en plus du fonctionnement");
  // Coût net : la prime part aux policiers, mais l'impôt à la source sur
  // chaque part revient aux caisses (monde fermé, rien ne se perd).
  const net = FRAIS_DETENTION_L * 100 - impotSur(FRAIS_DETENTION_L * 100, avec.params.tauxImpotBp);
  assert.equal(j1.budgetVille - t1.budgetVille, -net, "coût net de la prime pour la ville : " + net);
  const karim1 = j1.pnjs.find((x) => x.metier.includes("policier"))!;
  const karimT = t1.pnjs.find((x) => x.metier.includes("policier"))!;
  assert.equal(karim1.compte - karimT.compte, net, "le policier encaisse la prime de garde, nette d'impôt");
  assert.equal(monnaieEnCircuit(j1), monnaieEnCircuit(avec), "conservation exacte : la prime reste en ville");
  assert.equal(j1.sortiesCumulees, 0, "monde fermé : la prime ne fuit pas vers l'extérieur");
  // Sans police en poste, personne ne garde les cellules : rien n'est payé.
  const vide = structuredClone(avec);
  const karim = vide.pnjs.find((x) => x.metier.includes("policier"))!;
  const sans = passerJour(supprimerPnj(vide, karim.id));
  const fonctSans = entrees(1, "fonctionnement", sans.journal)[0];
  assert.ok(!fonctSans.texte.includes("primes de garde"), "sans police en poste, pas de prime de garde");
});

test("commissariat : sans poste de police en ville, la détention est une assignation à résidence — aucune prime", () => {
  // Cohérence de la correction 2026-11-06 : la prime paie la garde des
  // cellules du poste. Sans bâtiment poste en ville, l'arrestation se
  // raconte « assignation à résidence » — la ville ne paie rien, même si
  // des policiers sont encore en poste.
  const temoin = calme(createMondeDefaut());
  const avec = structuredClone(temoin);
  const detenu = avec.pnjs.find((p) => p.statut === "prive" && !p.gangId)!;
  detenu.arreteJusqua = 5; // détenu les jours 1 à 4, libéré le jour 5
  detenu.casier = 1;
  avec.batiments = avec.batiments.filter((b) => !/police|commissariat/i.test(b.nom));
  const j1 = passerJour(avec);
  // Témoin identique (sans poste, donc sans ses 15 L de fonctionnement
  // municipal) mais sans détenu : la seule différence doit être nulle.
  const temoinSansPoste = structuredClone(temoin);
  temoinSansPoste.batiments = temoinSansPoste.batiments.filter(
    (b) => !/police|commissariat/i.test(b.nom),
  );
  const t1 = passerJour(temoinSansPoste);
  const fonct1 = entrees(1, "fonctionnement", j1.journal)[0];
  const fonctT = entrees(1, "fonctionnement", t1.journal)[0];
  assert.ok(
    !fonct1.texte.includes("primes de garde"),
    "sans poste de police en ville, pas de prime de garde (assignation à résidence)",
  );
  assert.equal(fonct1.montant! - fonctT.montant!, 0, "aucun frais de détention sans poste");
  assert.equal(monnaieEnCircuit(j1), monnaieEnCircuit(avec), "conservation exacte");
});

test("racheter : le premier trait criminel s'efface (cupide, puis opportuniste, puis téméraire)", () => {
  const p = nouveauPnj({ prenom: "Ancien", nom: "Détenu", metier: "habitant", personnalite: ["téméraire", "discret"] });
  assert.equal(racheter(p), "téméraire", "le trait téméraire s'efface");
  assert.deepEqual(p.personnalite, ["honnête", "discret"], "remplacé par honnête, l'autre trait reste");
  assert.equal(racheter(p), null, "un honnête homme ne peut plus se racheter");
});

test("budget aléatoire : loi log-uniforme entre ×0,5 et ×10 le revenu indicatif", () => {
  // Fonction pure (arbitrage Thibaut 2026-11-06) : u ∈ [0, 1] parcourt la
  // loi uniformément en log — beaucoup de budgets modestes, quelques très
  // gros, médiane géométrique √(0,5 × 10) ≈ ×2,24 le revenu.
  assert.equal(budgetAleatoire(5000, 0), 2500, "u = 0 : ×0,5 le revenu");
  assert.equal(budgetAleatoire(5000, 1), 50000, "u = 1 : ×10 le revenu");
  assert.ok(budgetAleatoire(5250, 0.5) > 5250, "u = 0,5 : médiane ≈ ×2,24, au-dessus du revenu");
  let precedent = -1;
  for (let i = 0; i <= 100; i++) {
    const u = i / 100;
    const b = budgetAleatoire(5250, u);
    assert.ok(b >= Math.max(1, Math.round(5250 * 0.5)), "borne basse respectée");
    assert.ok(b <= Math.round(5250 * 10), "borne haute respectée");
    assert.ok(b >= precedent, "le budget croît (faiblement) avec u");
    precedent = b;
  }
});

test("budget aléatoire : le monde par défaut tire le budget de chaque figurine, une fois pour toutes", () => {
  // Arbitrage Thibaut : tous les PNJ, total non recalé, aléatoire à chaque
  // partie (Math.random). La simulation journalière, elle, reste déterministe.
  const e = createMondeDefaut();
  assert.equal(e.pnjs.length, 55, "55 figurines");
  const tires = e.pnjs.filter((p) => p.budgetAchat !== p.revenuIndicatif);
  assert.ok(tires.length > 0, "au moins un budget tiré hors du revenu indicatif");
  for (const p of e.pnjs) {
    assert.ok(
      p.budgetAchat >= Math.max(1, Math.round(p.revenuIndicatif * 0.5)),
      "borne basse du tirage",
    );
    assert.ok(p.budgetAchat <= Math.round(p.revenuIndicatif * 10), "borne haute du tirage");
  }
  // Pas de nouveau tirage au chargement : la sauvegarde conserve ses budgets.
  const rel = migrerEtat(JSON.parse(JSON.stringify(e)));
  for (const p of e.pnjs) {
    const q = rel.pnjs.find((x) => x.id === p.id)!;
    assert.equal(q.budgetAchat, p.budgetAchat, "le budget tiré au départ survit au rechargement");
  }
});

test("rédemption : à sa sortie, le détenu peut se racheter — l'effectif du commissariat décide", () => {
  // Le tirage de libération du jour choisi tombe entre 10 % et 50 % : avec
  // un effectif suffisant le détenu se rachète, débordé il ressort amer.
  let jour = 1;
  let tirage = generateurPour(jour * 11 + 7)();
  while (!(tirage > CHANCE_REDEMPTION_SANS && tirage < CHANCE_REDEMPTION_ACTIF)) {
    jour += 1;
    tirage = generateurPour(jour * 11 + 7)();
  }
  // Un policier en poste (Karim), un détenu libéré ce jour-là : effectif
  // suffisant (1 >= 1), 50 % de chances — ce tirage-là rachète.
  const base = calme(createMondeDefaut());
  const detenu = base.pnjs.find((p) => p.statut === "prive" && !p.gangId)!;
  detenu.personnalite = ["cupide", "discret"];
  detenu.casier = 1;
  detenu.arreteJusqua = jour;
  base.jour = jour - 1;
  const avec = passerJour(structuredClone(base));
  const pAvec = avec.pnjs.find((p) => p.id === detenu.id)!;
  assert.ok(
    avec.journal.some((e) => e.texte.includes("sort de détention et se rachète")),
    "la rédemption est racontée (jour " + jour + ", tirage " + tirage.toFixed(3) + ")",
  );
  assert.ok(pAvec.personnalite!.includes("honnête") && !pAvec.personnalite!.includes("cupide"), "cupide s'est effacé au profit d'honnête");
  assert.equal(pAvec.casier, 1, "le casier reste : la récidive reste possible");
  assert.ok(avec.journal.some((e) => e.texte.includes("effectif suffisant")), "l'effectif suffisant est raconté");
  // Commissariat débordé : un deuxième détenu, un seul policier (1 < 2) —
  // 10 % seulement, et ce tirage-là ne rachète pas.
  const deborde = structuredClone(base);
  const second = deborde.pnjs.find((p) => p.statut === "prive" && !p.gangId && p.id !== detenu.id)!;
  second.arreteJusqua = jour + 5;
  const sans = passerJour(deborde);
  const pSans = sans.pnjs.find((p) => p.id === detenu.id)!;
  assert.ok(!sans.journal.some((e) => e.texte.includes("se rachète")), "débordé, pas de rédemption ce jour-là");
  assert.ok(pSans.personnalite!.includes("cupide"), "le trait criminel est resté");
});

test("éditeur des gangs : installer, recruter, démanteler — le journal raconte tout", () => {
  const m = createMondeDefaut();
  const gang = nouveauGang({ nom: "Les Rats du Port", quartiers: ["Port"] });
  const m2 = ajouterGang(m, gang);
  assert.equal(m2.gangs!.length, (m.gangs?.length ?? 0) + 1, "le gang est en ville");
  assert.ok(m2.journal.some((e) => e.texte.includes("Les Rats du Port s'installe")), "l'installation est racontée");
  // Recrutement (comme dans la fiche de la figurine) puis démantèlement.
  const m3 = structuredClone(m2);
  const i = m3.pnjs.findIndex((p) => p.statut === "prive" && !p.gangId);
  m3.pnjs[i] = { ...m3.pnjs[i], gangId: gang.id };
  const m4 = supprimerGang(m3, gang.id);
  assert.ok(!m4.gangs!.some((g) => g.id === gang.id), "le gang a disparu");
  assert.equal(m4.pnjs.find((p) => p.id === m3.pnjs[i].id)!.gangId, null, "le membre redevient indépendant");
  assert.ok(m4.journal.some((e) => e.texte.includes("Les Rats du Port est démantelé")), "le démantèlement est raconté");
  assert.equal(monnaieEnCircuit(m4), monnaieEnCircuit(m), "aucune monnaie n'a bougé");
});
