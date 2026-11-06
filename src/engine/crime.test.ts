// Tests milieu criminel (phase 3.9) : profil criminel pondéré,
// territoires de gangs, arrestations, guerres, migration v8.
// Exécution : npm test.

import test from "node:test";

import assert from "node:assert/strict";

import type {
  Etat
} from "./types.ts";

import {
  ajouterPnj,
  ajouterBatiment,
  createMondeDefaut,
  modifierVille,
  nouveauBatiment,
  nouveauPnj
} from "./monde.ts";

import {
  migrerEtat
} from "./migrations.ts";

import {
  monnaieEnCircuit,
  passerJour
} from "./moteur.ts";

import {
  profilCriminel
} from "./evenements.ts";

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
