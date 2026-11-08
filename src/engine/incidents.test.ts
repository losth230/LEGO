// Tests incidents & services (phase 2) : garde des pompiers et de la
// police, règle R × P × K / 10000 / 365, dégâts, soins facturés,
// déterminisme seedé. Exécution : npm test.

import test from "node:test";

import assert from "node:assert/strict";

import type { Etat } from "./types.ts";
import {
  createMondeDefaut,
  emprunterVille,
  modifierVille,
  nouveauBatiment,
  nouveauPnj,
  nouveauVehicule,
  supprimerPnj
} from "./monde.ts";
import { createMondeDemonstration } from "./monde.demo.ts";

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
  const m = createMondeDemonstration();
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
  const m = modifierVille(createMondeDemonstration(), { coeffIntensite: 100000 });
  const j1 = passerJour(m);
  const inc = entrees(1, "incident", j1.journal);
  assert.ok(inc.length >= 2, "incidents attendus, obtenu : " + inc.length);
  assert.ok(j1.journal.some((e) => e.texte.includes("s'embrase")), "l'incendie est raconté");
});

test("incendie sans pompiers ni budget : le bâtiment reste sinistré, les caisses vides ne réparent rien", () => {
  let m = createMondeDemonstration();
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
        (e.texte.includes("Cambriolage") || e.texte.includes("Accident") || e.texte.includes("Guerre de gangs")),
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
  let m = createMondeDemonstration();
  // v1.25 : témoin hermétique — sans flotte, le BTP n'encaisse que les
  // réparations d'incendie (l'essence et les collisions ont leurs tests).
  m.vehicules = [];
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
        (e.texte.includes("Cambriolage") || e.texte.includes("Accident") || e.texte.includes("Guerre de gangs")),
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
  let m = createMondeDemonstration();
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
  let m = createMondeDemonstration();
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
  let m = calme(createMondeDemonstration());
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
  let m = createMondeDemonstration();
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
  let m = createMondeDemonstration();
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
  const m = createMondeDemonstration();
  const a = passerJour(m);
  const b = passerJour(m);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

// ---------- v1.25 : les véhicules — collisions, vols, engins de service ----------

test("collision (v1.25) : le BTP local répare, le véhicule reste en service, la monnaie reste en ville", () => {
  // Témoin : un atelier, son patron, un camion municipal qui roule (sans
  // consommation pour isoler la collision). Les figurines comptent dans
  // la règle d'échelle des incidents (R × P × K / 10000 / 365).
  const base = calme(createMondeDefaut());
  const atelier = nouveauBatiment({ nom: "Atelier du coin", type: "commerce", vocation: "btp" });
  const dario = nouveauPnj({ prenom: "Dario", nom: "Costa", metier: "chef d'entreprise BTP", statut: "commercant", batimentId: atelier.id, revenuIndicatif: 5500, budgetAchat: 0, compte: 0 });
  const figurines = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) =>
    nouveauPnj({ prenom: "Figurante" + i, nom: "Témoin", statut: "prive", revenuIndicatif: 4000, budgetAchat: 0, compte: 0 }),
  );
  let monde: Etat = {
    ...base,
    batiments: [atelier],
    pnjs: [dario, ...figurines],
    vehicules: [nouveauVehicule({ nom: "Camion de pompiers", categorie: "municipal", role: "pompiers", valeur: 200000, essenceJour: 0 })],
  };
  monde = modifierVille(monde, { coeffIntensite: 100000, budgetVille: 50000000 });
  const avant = monnaieEnCircuit(monde);
  const j1 = passerJour(monde);
  const collisions = j1.journal.filter((e) => e.type === "incident" && e.texte.includes("Collision au carrefour"));
  assert.equal(collisions.length, 1, "une collision est racontée");
  assert.ok(collisions[0].texte.includes("réparés dans la foulée"), "le véhicule est réparé sur place");
  assert.ok(collisions[0].texte.includes("sur le budget de la ville"), "la ville paie pour sa flotte");
  const veh = j1.vehicules![0];
  assert.equal(veh.etat, "bon", "pas sinistré");
  assert.equal(veh.valeur, 200000, "réparé intégralement : aucune valeur perdue");
  assert.ok(j1.pnjs[0].compte > 0, "l'atelier encaisse les réparations");
  assert.equal(j1.sortiesCumulees, 0, "monde fermé");
  assert.equal(monnaieEnCircuit(j1), avant, "conservation exacte");
});

test("collision (v1.25) : sans BTP en ville, le véhicule reste sinistré sur le bas-côté", () => {
  const figurines = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) =>
    nouveauPnj({ prenom: "Figurante" + i, nom: "Témoin", statut: "prive", revenuIndicatif: 4000, budgetAchat: 0, compte: 0 }),
  );
  let monde: Etat = {
    ...createMondeDefaut(),
    pnjs: figurines,
    vehicules: [nouveauVehicule({ nom: "Caisse à roulettes", categorie: "prive", valeur: 100000, essenceJour: 0 })],
  };
  monde = modifierVille(monde, { coeffIntensite: 100000 });
  const j1 = passerJour(monde);
  const collisions = j1.journal.filter((e) => e.type === "incident" && e.texte.includes("Collision au carrefour"));
  assert.equal(collisions.length, 1, "une collision est racontée");
  assert.ok(collisions[0].texte.includes("aucune entreprise de BTP en ville"), "le défaut de service est raconté");
  const veh = j1.vehicules![0];
  assert.equal(veh.etat, "sinistre", "le véhicule reste marqué");
  assert.ok(veh.valeur < 100000, "la valeur patrimoniale a fondu");
  assert.equal(j1.budgetVille, monde.budgetVille, "aucune réparation : rien à payer");
  assert.equal(j1.sortiesCumulees, 0, "monde fermé");
});

test("camion de pompiers (v1.25) : en service, la moitié des dégâts du feu est évitée", () => {
  let sans = modifierVille(createMondeDemonstration(), { coeffIntensite: 100000, budgetVille: 50000000 });
  sans.vehicules = [];
  const avec = modifierVille(createMondeDemonstration(), { coeffIntensite: 100000, budgetVille: 50000000 });
  const jSans = passerJour(sans);
  const jAvec = passerJour(avec);
  const degatsFeu = (j: ReturnType<typeof passerJour>) =>
    j.journal
      .filter((e) => e.type === "incident" && e.texte.includes("s'embrase"))
      .reduce((s, e) => s - (e.montant ?? 0), 0);
  assert.ok(degatsFeu(jSans) > 0, "au moins un incendie");
  assert.ok(
    degatsFeu(jAvec) < degatsFeu(jSans),
    "le camion contient le feu : " + degatsFeu(jAvec) + " < " + degatsFeu(jSans),
  );
  assert.ok(jAvec.journal.some((e) => e.texte.includes("déverse ses lances")), "l'effet du camion est raconté");
  assert.ok(
    !jSans.journal.some((e) => e.texte.includes("déverse ses lances")),
    "sans flotte, pas d'effet camion",
  );
});

test("vol de voiture (v1.25) : sans fourgon, transfert de propriété — le patrimoine change de main, pas la monnaie", () => {
  // Témoin : la ville de démonstration, mais la flotte municipale est
  // retirée — plus de fourgon : le milieu s'y met.
  const m = modifierVille(createMondeDemonstration(), { coeffIntensite: 100000, budgetVille: 50000000 });
  m.vehicules = m.vehicules!.filter((v) => v.categorie === "prive");
  const avant = monnaieEnCircuit(m);
  const proprietaires = new Map(m.vehicules!.map((v) => [v.id, v.proprietairePnjId]));
  const j1 = passerJour(m);
  const vol = j1.journal.find((e) => e.type === "incident" && e.texte.includes("Vol de voiture : "));
  assert.ok(vol, "le vol est raconté");
  assert.ok(vol!.texte.includes("transfert de propriété"), "le mécanisme est raconté");
  const volee = j1.vehicules!.find((v) => v.proprietairePnjId !== proprietaires.get(v.id));
  assert.ok(volee, "un véhicule a changé de propriétaire");
  const voleur = j1.pnjs.find((p) => p.id === volee!.proprietairePnjId)!;
  assert.ok(vol!.texte.includes(voleur.prenom + " " + voleur.nom), "le voleur roule désormais dedans");
  assert.equal(volee!.gangId, voleur.gangId ?? null, "le butin rejoint le gang du voleur");
  assert.ok((voleur.casier ?? 0) >= 1, "le casier se remplit");
  assert.equal(vol!.montant, -volee!.valeur, "la perte patrimoniale est racontée");
  assert.equal(monnaieEnCircuit(j1), avant, "pas une pièce ne quitte la ville (monde fermé)");
});

test("fourgon en service (v1.25) : cambriolage et vol de voiture déjoués — arrestation sur le fait", () => {
  // Trois policiers mobilisables : la patrouille couvre toute gravité,
  // le fourgon municipal roule (essence payée sur place).
  const m = modifierVille(createMondeDemonstration(), { coeffIntensite: 100000, budgetVille: 50000000 });
  m.pnjs.push(
    nouveauPnj({ prenom: "Brigitte", nom: "Renfort", age: 30, genre: "F", metier: "policier municipal", statut: "agent_public", grade: "policier_municipal", revenuIndicatif: 5300 }),
    nouveauPnj({ prenom: "Camille", nom: "Renfort", age: 31, genre: "F", metier: "policier municipal", statut: "agent_public", grade: "policier_municipal", revenuIndicatif: 5300 }),
  );
  const proprietaires = new Map(m.vehicules!.map((v) => [v.id, v.proprietairePnjId]));
  const j1 = passerJour(m);
  assert.ok(
    j1.journal.some((e) => e.texte.includes("la patrouille le surprend à temps, rien de volé")),
    "cambriolage déjoué : arrestation sur le fait",
  );
  assert.ok(j1.journal.some((e) => e.texte.includes("Vol de voiture déjoué")), "vol de voiture déjoué");
  assert.ok(j1.pnjs.some((p) => (p.arreteJusqua ?? 0) > 0), "un malfaiteur est détenu");
  assert.ok(
    j1.vehicules!.every((v) => v.proprietairePnjId === proprietaires.get(v.id)),
    "aucune voiture ne change de main",
  );
  assert.equal(j1.sortiesCumulees, 0, "monde fermé");
});
