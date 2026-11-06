// Tests incidents & services (phase 2) : garde des pompiers et de la
// police, règle R × P × K / 10000 / 365, dégâts, soins facturés,
// déterminisme seedé. Exécution : npm test.

import test from "node:test";

import assert from "node:assert/strict";

import {
  createMondeDefaut,
  emprunterVille,
  modifierVille,
  nouveauPnj,
  supprimerPnj
} from "./monde.ts";

import {
  impotSur,
  monnaieEnCircuit,
  passerJour,
  serviceLocal
} from "./moteur.ts";

import {
  gardePolice,
  gardePompiers,
  probaQuotidienne
} from "./evenements.ts";

import {
  entrees,
  calme,
  neutraliserCourses
} from "./outils-test.ts";

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
