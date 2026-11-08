// Tests chantiers (v1.27, arbitrage Thibaut 2026-11-08) : plus rien ne se
// crée instantanément — bâtiments au BTP, véhicules à la station-service,
// durée = valeur de travaux (1 ouvrier = 1/jour, engin = son efficacité,
// v1.28 — défaut 2), coût réglé au prorata au fil de l'eau (ville pour un
// public, figurine pour un privé), un seul chantier avance par jour (FIFO,
// priorisable) et l'amorçage à la main (1/jour, sans paiement) permet à la
// ville nue de bâtir son premier BTP. Exécution : npm test.

import test from "node:test";

import assert from "node:assert/strict";

import type { Etat } from "./types.ts";
import {
  ajouterVehicule,
  createMondeDefaut,
  lancerChantierBatiment,
  lancerChantierVehicule,
  modifierPnj,
  modifierVehicule,
  modifierVille,
  nouveauBatiment,
  nouveauVehicule,
  prioriserChantier,
  supprimerBatiment,
} from "./monde.ts";
import { createMondeDemonstration } from "./monde.demo.ts";

import {
  chargesJournalieres,
  monnaieEnCircuit,
  passerJour,
} from "./moteur.ts";
import { vehiculesRoulables } from "./evenements.ts";
import { boutiquesOuvertes } from "./economie.ts";
import { migrerEtat } from "./migrations.ts";
import {
  CARBURANT_RESERVOIR_ENGIN,
  coutChantier,
  efficaciteEngin,
  carburantEngin,
  PRODUCTION_ENGIN,
  PRODUCTION_OUVRIER,
  TRAVAUX_DEFAUT,
} from "./chantiers.ts";
import { calme, entrees } from "./outils-test.ts";

/** Le BTP de la ville de démonstration (patronne Samantha, 4 postes —
 * v1.28 : l'équipe Didier-Thomas et ses engins en font le chantier témoin). */
function idBtp(m: Etat): string {
  return m.batiments.find((b) => b.vocations.includes("btp"))!.id;
}

/** Vider le BTP de ses employés et de ses engins (isolation des tests). */
function btpVeuf(m: Etat): Etat {
  const btp = m.batiments.find((b) => b.vocations.includes("btp"))!.id;
  return {
    ...m,
    pnjs: m.pnjs.map((p) => (p.travailBatimentId === btp ? { ...p, travailBatimentId: null } : p)),
    vehicules: (m.vehicules ?? []).filter((v) => v.role !== "chantier"),
  };
}

/** La station-service de la démonstration (gérant Marco). */
function idStation(m: Etat): string {
  return m.batiments.find((b) => b.vocations.includes("garage"))!.id;
}

/** Embauche n employés privés dans un bâtiment (chantier : les ouvriers du BTP). */
function embaucher(m: Etat, batimentId: string, n: number): Etat {
  let e = m;
  const libres = e.pnjs.filter((p) => p.statut === "prive" && p.travailBatimentId === null);
  for (let i = 0; i < n; i++) {
    e = modifierPnj(e, libres[i].id, { travailBatimentId: batimentId, revenuIndicatif: 4930 });
  }
  return e;
}

// ---------- Lancement et amorçage ----------

test("chantier : le lancement marque la cible « en construction » et chiffré le coût", () => {
  const m = createMondeDefaut();
  const avant = monnaieEnCircuit(m);
  const ch = lancerChantierBatiment(
    m,
    nouveauBatiment({ nom: "Première Maison", type: "habitation", valeur: 300000 }),
  );
  assert.equal(ch.batiments.length, 1, "le bâtiment entre en ville");
  assert.equal(ch.batiments[0].enConstruction, true, "en construction");
  assert.equal(ch.chantiers!.length, 1, "le chantier rejoint la file");
  const c = ch.chantiers![0];
  assert.equal(c.travauxTotal, TRAVAUX_DEFAUT, "100 travaux par défaut (arbitrage Thibaut)");
  assert.equal(c.travauxFaits, 0, "aucun travail produit au lancement");
  assert.equal(c.coutCentimes, coutChantier(300000), "coût = 50 % de la valeur, par défaut");
  assert.equal(c.coutPaye, 0, "rien n'est payé d'avance : au fil de l'eau");
  assert.ok(ch.journal.some((e) => e.type === "systeme" && e.texte.includes("ouvre le chantier")), "le journal raconte l'ouverture");
  assert.equal(monnaieEnCircuit(ch), avant, "le lancement ne déplace pas un centime");
});

test("amorçage : sans constructeur en ville, le chantier avance à la main (1/jour, sans paiement)", () => {
  const m = lancerChantierBatiment(
    createMondeDefaut(),
    nouveauBatiment({ nom: "Hangar des Bâtisseurs", type: "commerce", valeur: 350000, vocations: ["btp"] }),
  );
  const j1 = passerJour(m);
  const c = j1.chantiers![0];
  assert.equal(c.travauxFaits, 1, "coups de main des habitants : 1 travail");
  assert.equal(c.coutPaye, 0, "aucun paiement possible : personne à payer (monde fermé)");
  assert.equal(j1.budgetVille, 500000, "la ville nue ne dépense rien");
  assert.ok(
    entrees(1, "chantier", j1.journal).some((e) => e.texte.includes("à la main")),
    "le journal raconte l'ouvrage à la main",
  );
  // Le BTP en construction ne rend aucun service : il ne construit pas
  // lui-même plus vite (c'est la main-d'œuvre bénévole qui avance).
  assert.equal(j1.chantiers![0].travauxFaits, 1, "pas d'auto-accélération");
});

test("chantier : le BTP au travail — ouvriers ET engins produisent, acompte au prorata", () => {
  // v1.28 : la démo embarque l'équipe du BTP — Didier et Thomas (2 ouvriers)
  // avec leurs engins (bétonnière efficacité 1, tractopelle efficacité 2) ;
  // la pelleteuse municipale ajoutée produit au défaut (2).
  let m = createMondeDemonstration();
  m = ajouterVehicule(
    m,
    nouveauVehicule({ nom: "Pelleteuse du chantier", categorie: "municipal", role: "chantier", essenceJour: 0, valeur: 100000 }),
  );
  m = lancerChantierBatiment(
    m,
    nouveauBatiment({ nom: "Pavillon du Parc", type: "habitation", valeur: 300000 }),
  );
  const production = 2 * PRODUCTION_OUVRIER + (1 + 2) + 1 * PRODUCTION_ENGIN; // 7 travaux
  const cout = coutChantier(300000);
  const avant = monnaieEnCircuit(m);
  const j1 = passerJour(m);
  const c = j1.chantiers![0];
  assert.equal(c.travauxFaits, production, "2 ouvriers + bétonnière (1) + tractopelle (2) + pelleteuse (2) = 7 travaux");
  assert.equal(c.coutPaye, Math.round((cout * production) / TRAVAUX_DEFAUT), "acompte au prorata de l'avancement");
  assert.ok(
    entrees(1, "chantier", j1.journal).some((e) => e.texte.includes("réglés par la ville")),
    "le journal raconte l'acompte réglé",
  );
  assert.equal(monnaieEnCircuit(j1), avant, "conservation exacte : l'acompte reste en ville");
});

test("efficacité (v1.28) : chaque engin produit selon sa fiche — bétonnière 1, tractopelle 2", () => {
  // La ville de démonstration telle quelle : le BTP de Samantha avance
  // avec ses deux ouvriers et leurs engins, sans rien embaucher de plus.
  const m = lancerChantierBatiment(
    createMondeDemonstration(),
    nouveauBatiment({ nom: "Maison des Maçons", type: "habitation", valeur: 300000 }),
  );
  const j1 = passerJour(m);
  const c = j1.chantiers![0];
  assert.equal(c.travauxFaits, 2 * PRODUCTION_OUVRIER + 1 + 2, "Didier + Thomas + bétonnière (1) + tractopelle (2) = 5 travaux");
  assert.equal(efficaciteEngin(m.vehicules!.find((v) => v.nom === "Bétonnière de Didier")!), 1, "la bétonnière produit 1 travail/jour");
  assert.equal(efficaciteEngin(m.vehicules!.find((v) => v.nom === "Tractopelle de Thomas")!), 2, "le tractopelle en produit 2");
  assert.equal(efficaciteEngin(nouveauVehicule({ nom: "Engin sans fiche", role: "chantier" })), PRODUCTION_ENGIN, "sans fiche : défaut 2, jamais muet ni négatif");
});

// ---------- Le réservoir des engins (v1.29, arbitrage Thibaut) : 50 L,
// 1 L par travail posé, journée de plein quand l'engin est à sec ----------

test("réservoir (v1.29) : 1 L brûlé par travail, journée de plein à sec sans production", () => {
  // BTP isolé (ni ouvriers ni engins démo) : seule une mini-pelle municipale
  // d'efficacité 2, réservoir 3 L, travaille — on suit sa jauge au fil des jours.
  let m = btpVeuf(createMondeDemonstration());
  m = ajouterVehicule(
    m,
    nouveauVehicule({ nom: "Mini-pelle municipale", categorie: "municipal", role: "chantier", efficacite: 2, carburant: 3, valeur: 100000 }),
  );
  m = lancerChantierBatiment(
    m,
    nouveauBatiment({ nom: "Muret du Parc", type: "habitation", valeur: 300000 }),
  );
  const pelle = (e: Etat) => e.vehicules!.find((v) => v.nom === "Mini-pelle municipale")!;
  const j1 = passerJour(m);
  assert.equal(j1.chantiers![0].travauxFaits, 2, "j1 : 2 travaux (efficacité 2, réservoir 3)");
  assert.equal(carburantEngin(pelle(j1)), 1, "le réservoir suit : 3 − 2 = 1 L");
  const j2 = passerJour(j1);
  assert.equal(j2.chantiers![0].travauxFaits, 3, "j2 : il ne reste qu'1 L, un seul travail");
  assert.equal(carburantEngin(pelle(j2)), 0, "réservoir vide");
  const j3 = passerJour(j2);
  assert.equal(j3.chantiers![0].travauxFaits, 3, "j3 : à sec, pas de production — journée de plein");
  assert.equal(carburantEngin(pelle(j3)), CARBURANT_RESERVOIR_ENGIN, "le plein remet 50 L");
  assert.ok(
    entrees(3, "chantier", j3.journal).some((e) => e.texte.includes("fait le plein") && e.texte.includes("réglés par la ville")),
    "la ville règle le plein de sa flotte, et le journal le raconte",
  );
  const j4 = passerJour(j3);
  assert.equal(j4.chantiers![0].travauxFaits, 5, "j4 : réservoir plein, 2 travaux à nouveau");
  assert.equal(carburantEngin(pelle(j4)), 48, "le réservoir suit encore");
  assert.equal(monnaieEnCircuit(j4), monnaieEnCircuit(m), "conservation exacte : le plein reste en ville");
});

test("plein privé (v1.29) : les engins du BTP sont à leur patronne, qui règle l'essence", () => {
  // Arbitrage Thibaut : un engin appartient à la figurine si elle travaille
  // pour elle-même, sinon au patron qui l'emploie — Samantha possède donc la
  // bétonnière et le tractopelle de ses deux salariés.
  const m0 = createMondeDemonstration();
  const samantha = m0.pnjs.find((p) => p.prenom === "Samantha")!;
  const betonniere = m0.vehicules!.find((v) => v.nom === "Bétonnière de Didier")!;
  const tractopelle = m0.vehicules!.find((v) => v.nom === "Tractopelle de Thomas")!;
  assert.equal(betonniere.proprietairePnjId, samantha.id, "la bétonnière est à la patronne du BTP");
  assert.equal(tractopelle.proprietairePnjId, samantha.id, "le tractopelle aussi — Didier et Thomas conduisent, la compagnie possède");
  assert.equal(carburantEngin(betonniere), CARBURANT_RESERVOIR_ENGIN, "les engins débarquent le réservoir plein");
  // Les deux engins tombés à sec : journée de plein réglée par Samantha,
  // et seuls les deux ouvriers produisent.
  let m = m0;
  m = modifierVehicule(m, betonniere.id, { carburant: 0 });
  m = modifierVehicule(m, tractopelle.id, { carburant: 0 });
  m = lancerChantierBatiment(
    m,
    nouveauBatiment({ nom: "Maison des Maçons", type: "habitation", valeur: 300000 }),
  );
  const j1 = passerJour(m);
  assert.equal(j1.chantiers![0].travauxFaits, 2, "les ouvriers posent 2 briques, les engins sont à la pompe");
  assert.equal(carburantEngin(j1.vehicules!.find((v) => v.id === betonniere.id)!), CARBURANT_RESERVOIR_ENGIN, "la bétonnière repart pleine");
  assert.equal(carburantEngin(j1.vehicules!.find((v) => v.id === tractopelle.id)!), CARBURANT_RESERVOIR_ENGIN, "le tractopelle aussi");
  const pleins = entrees(1, "chantier", j1.journal).filter((e) => e.texte.includes("fait le plein"));
  assert.equal(pleins.length, 2, "deux journées de plein racontées");
  assert.ok(pleins.every((e) => e.texte.includes("réglés par Samantha Faure")), "Samantha règle les pleins de sa compagnie");
  assert.equal(monnaieEnCircuit(j1), monnaieEnCircuit(m0), "conservation exacte : les pleins restent en ville");
});

test("plein impossible (v1.29) : sans station ou sans caisse, l'engin reste à sec", () => {
  // Sans station-service en ville : la pompe n'existe pas, l'engin municipal
  // à sec ne produit pas et ne dépense rien.
  let m = btpVeuf(createMondeDemonstration());
  const station = m.batiments.find((b) => b.vocations.includes("garage"))!;
  m = supprimerBatiment(m, station.id);
  m = ajouterVehicule(
    m,
    nouveauVehicule({ nom: "Pelleteuse esseulée", categorie: "municipal", role: "chantier", carburant: 0, valeur: 100000 }),
  );
  m = lancerChantierBatiment(
    m,
    nouveauBatiment({ nom: "Cabane du Jardin", type: "habitation", valeur: 300000 }),
  );
  const j1 = passerJour(m);
  assert.equal(j1.chantiers![0].travauxFaits, 0, "personne ne travaille : plus de station, plus de plein");
  assert.equal(carburantEngin(j1.vehicules!.find((v) => v.nom === "Pelleteuse esseulée")!), 0, "l'engin reste à sec");
  assert.ok(
    entrees(1, "chantier", j1.journal).some((e) => e.texte.includes("reste à sec") && e.texte.includes("aucune station-service")),
    "l'absence de pompe est racontée",
  );
  assert.equal(monnaieEnCircuit(j1), monnaieEnCircuit(m), "conservation exacte : rien n'a bougé d'un centime");
  // Patronne fauchée : la pompe ne fait pas crédit, le plein attend les caisses.
  let v = createMondeDemonstration();
  const samantha = v.pnjs.find((p) => p.prenom === "Samantha")!;
  v = modifierPnj(v, samantha.id, { compte: 0 });
  const betonniere = v.vehicules!.find((x) => x.nom === "Bétonnière de Didier")!;
  v = modifierVehicule(v, betonniere.id, { carburant: 0 });
  v = lancerChantierBatiment(
    v,
    nouveauBatiment({ nom: "Villa de Samantha", type: "habitation", valeur: 300000 }),
  );
  const k1 = passerJour(v);
  assert.equal(carburantEngin(k1.vehicules!.find((x) => x.id === betonniere.id)!), 0, "sans un L en caisse, pas de plein");
  assert.equal(k1.chantiers![0].travauxFaits, 2 * PRODUCTION_OUVRIER + 2, "les ouvriers et le tractopelle travaillent, pas la bétonnière à sec");
  assert.ok(
    entrees(1, "chantier", k1.journal).some((e) => e.texte.includes("n'a pas de quoi régler le plein")),
    "la pompe qui ne fait pas crédit est racontée",
  );
});

test("chantier : la livraison éveille la cible (capacités actives) et vide la file", () => {
  let m = createMondeDemonstration();
  m = embaucher(m, idBtp(m), 3);
  m = lancerChantierBatiment(
    m,
    nouveauBatiment({ nom: "Atelier du coin", type: "habitation", valeur: 200000 }),
    { travauxTotal: 10 },
  );
  const j1 = passerJour(m);
  // v1.28 : 5 ouvriers (3 embauchés + l'équipe démo) + les engins (1 + 2) = 8 travaux.
  assert.equal(j1.chantiers!.length, 1, "8 travaux sur 10 : pas encore livré");
  assert.equal(j1.chantiers![0].travauxFaits, 8, "l'équipe au complet produit 8 travaux");
  assert.equal(j1.batiments.find((b) => b.nom === "Atelier du coin")!.enConstruction, true, "toujours en chantier");
  const j2 = passerJour(j1);
  assert.equal(j2.chantiers!.length, 0, "livré : le chantier quitte la file");
  assert.equal(
    j2.batiments.find((b) => b.nom === "Atelier du coin")!.enConstruction,
    false,
    "les capacités s'éveillent à la livraison",
  );
  const c = j2.journal.filter((e) => e.type === "chantier");
  assert.ok(c.some((e) => e.texte.includes("Dernière brique")), "la livraison est racontée");
  assert.ok(c.some((e) => e.texte.includes("réglés par la ville")), "le solde de l'acompte est réglé");
});

// ---------- Effectifs et moyens ----------

test("chantier : BTP tenu mais sans ouvrier — le chantier attend, rien n'est payé", () => {
  // v1.28 : isolation — l'équipe du BTP est dégagée (Didier, Thomas renvoyés,
  // leurs engins retirés) : la patronne seule ne pose pas de briques.
  let m = btpVeuf(createMondeDemonstration());
  m = lancerChantierBatiment(
    m,
    nouveauBatiment({ nom: "Villa des Cyprès", type: "habitation", valeur: 300000 }),
  );
  const avant = monnaieEnCircuit(m);
  const j1 = passerJour(m);
  assert.equal(j1.chantiers![0].travauxFaits, 0, "le gérant ne pose pas de briques");
  assert.equal(j1.chantiers![0].coutPaye, 0, "aucun acompte");
  assert.ok(
    entrees(1, "chantier", j1.journal).some((e) => e.texte.includes("aucun ouvrier")),
    "le journal invite à embaucher",
  );
  assert.equal(monnaieEnCircuit(j1), avant, "conservation exacte");
});

test("chantier : un engin qui n'a pas roulé ne produit pas (il roule à l'essence de la station)", () => {
  // v1.28 : isolation — sans les engins du BTP, seule la grue sinistrée
  // et l'ouvrier embauché jouent.
  let m = btpVeuf(createMondeDemonstration());
  m = embaucher(m, idBtp(m), 1);
  m = ajouterVehicule(
    m,
    nouveauVehicule({ nom: "Grue hors service", categorie: "municipal", role: "chantier", essenceJour: 800, valeur: 100000, etat: "sinistre" }),
  );
  m = lancerChantierBatiment(
    m,
    nouveauBatiment({ nom: "Maison du port", type: "habitation", valeur: 300000 }),
  );
  const j1 = passerJour(m);
  // Grue sinistrée : ni essence ni production — un seul ouvrier travaille.
  assert.equal(j1.chantiers![0].travauxFaits, 1, "seul l'ouvrier produit");
});

// ---------- Payeurs ----------

test("chantier privé : la figurine commanditaire règle les acomptes, pas la ville", () => {
  const base = createMondeDemonstration();
  const jean = base.pnjs.find((p) => p.metier === "boulanger")!;
  const villa = () => nouveauBatiment({ nom: "Villa de Jean", type: "habitation", valeur: 300000 });
  const pourJean = lancerChantierBatiment(embaucher(base, idBtp(base), 3), villa(), { payeurPnjId: jean.id });
  const pourLaVille = lancerChantierBatiment(embaucher(base, idBtp(base), 3), villa());
  // v1.28 : 8 travaux le jour 1 — 3 embauchés + Didier + Thomas, et les
  // engins (bétonnière 1 + tractopelle 2).
  const acompte = Math.round((coutChantier(300000) * 8) / TRAVAUX_DEFAUT);
  const j1p = passerJour(pourJean);
  const j1v = passerJour(pourLaVille);
  assert.equal(j1p.chantiers![0].payeurPnjId, jean.id, "le chantier porte son commanditaire");
  assert.equal(j1p.chantiers![0].coutPaye, acompte, "l'acompte du jour est prélevé");
  assert.equal(j1p.budgetVille - j1v.budgetVille, acompte, "seul le cas public touche au budget de la ville");
  assert.ok(
    entrees(1, "chantier", j1p.journal).some((e) => e.texte.includes("réglés par " + jean.prenom)),
    "le journal nomme le payeur privé",
  );
});

test("chantier : faute de budget, le chantier marque une pause — puis reprend", () => {
  let m = createMondeDemonstration();
  m = embaucher(m, idBtp(m), 3);
  m = lancerChantierBatiment(
    m,
    nouveauBatiment({ nom: "Fontaine publique", type: "habitation", valeur: 300000 }),
  );
  m = modifierVille(m, { budgetVille: 0 });
  const j1 = passerJour(m);
  assert.equal(j1.chantiers![0].travauxFaits, 0, "pause : aucun travail ce jour");
  assert.equal(j1.chantiers![0].coutPaye, 0, "aucun acompte prélevé");
  assert.ok(
    entrees(1, "chantier", j1.journal).some((e) => e.texte.includes("pause")),
    "la pause est racontée",
  );
  const j2 = passerJour(modifierVille(j1, { budgetVille: 1000000 }));
  assert.equal(j2.chantiers![0].travauxFaits, 8, "les caisses reviennent, les travaux reprennent");
});

// ---------- La file : un chantier à la fois, priorisable ----------

test("chantiers : un seul avance par jour (FIFO) et le maître du jeu peut prioriser", () => {
  let m = createMondeDemonstration();
  m = embaucher(m, idBtp(m), 3);
  m = lancerChantierBatiment(m, nouveauBatiment({ nom: "École A", type: "habitation", valeur: 300000 }));
  m = lancerChantierBatiment(m, nouveauBatiment({ nom: "Crèche B", type: "habitation", valeur: 300000 }));
  const j1 = passerJour(m);
  const ecole = j1.chantiers!.find((c) => cibleNom(j1, c) === "École A")!;
  const creche = j1.chantiers!.find((c) => cibleNom(j1, c) === "Crèche B")!;
  assert.equal(ecole.travauxFaits, 8, "le premier de la file avance");
  assert.equal(creche.travauxFaits, 0, "le second attend son tour");
  assert.ok(
    entrees(1, "chantier", j1.journal).some((e) => e.texte.includes("attendent leur tour")),
    "la file d'attente est racontée",
  );
  const j2 = passerJour(prioriserChantier(j1, creche.id));
  const creche2 = j2.chantiers!.find((c) => c.id === creche.id)!;
  const ecole2 = j2.chantiers!.find((c) => c.id === ecole.id)!;
  assert.equal(creche2.travauxFaits, 8, "priorisée : c'est elle qui avance");
  assert.equal(ecole2.travauxFaits, 8, "l'autre ne bouge pas");
  assert.ok(
    j2.journal.some((e) => e.type === "systeme" && e.texte.includes("priorise")),
    "la priorisation est racontée",
  );
});

function cibleNom(e: Etat, c: { cibleBatimentId: string | null; cibleVehiculeId: string | null }): string {
  const b = e.batiments.find((x) => x.id === c.cibleBatimentId);
  if (b) return b.nom;
  const v = (e.vehicules ?? []).find((x) => x.id === c.cibleVehiculeId);
  return v?.nom ?? "";
}

// ---------- Véhicules : la station-service construit ----------

test("chantier véhicule : la station-service assemble, le véhicule en construction ne consomme rien", () => {
  // v1.28 : isolation — sans l'équipe du BTP, seuls les mécaniciens de la
  // station travaillent sur le chantier.
  let m = btpVeuf(createMondeDemonstration());
  const chargesAvant = chargesJournalieres(m);
  m = lancerChantierVehicule(
    m,
    nouveauVehicule({ nom: "Camion-béton municipal", categorie: "municipal", role: "chantier", essenceJour: 800, valeur: 120000 }),
  );
  const beton = m.vehicules!.find((v) => v.nom === "Camion-béton municipal")!;
  assert.equal(beton.enConstruction, true, "le véhicule entre en atelier");
  assert.equal(chargesJournalieres(m), chargesAvant, "pas d'essence comptée pour un véhicule en construction");
  assert.ok(!vehiculesRoulables(m).some((v) => v.id === beton.id), "il ne roule pas encore : ni collision, ni vol");
  m = embaucher(m, idStation(m), 2);
  const j1 = passerJour(m);
  const c = j1.chantiers![0];
  assert.equal(c.travauxFaits, 2, "2 mécaniciens de la station = 2 travaux");
  assert.equal(c.coutPaye, Math.round((coutChantier(120000) * 2) / TRAVAUX_DEFAUT), "l'acompte va à la station (recette du soir)");
});

test("chantier véhicule privé : le propriétaire paie par défaut", () => {
  let m = createMondeDemonstration();
  const jean = m.pnjs.find((p) => p.metier === "boulanger")!;
  m = embaucher(m, idStation(m), 2);
  m = lancerChantierVehicule(
    m,
    nouveauVehicule({ nom: "Coupé de Jean", categorie: "prive", essenceJour: 300, valeur: 90000, proprietairePnjId: jean.id }),
  );
  const c = m.chantiers![0];
  assert.equal(c.payeurPnjId, jean.id, "un véhicule privé est payé par son propriétaire");
  const j1 = passerJour(m);
  assert.equal(j1.chantiers![0].coutPaye > 0, true, "l'acompte est débité chez Jean");
});

// ---------- Monde fermé et résilience ----------

test("chantiers : conservation exacte de la monnaie sur 30 jours avec un chantier", () => {
  let m = createMondeDemonstration();
  m = embaucher(m, idBtp(m), 3);
  m = lancerChantierBatiment(
    m,
    nouveauBatiment({ nom: "Halle couverte", type: "habitation", valeur: 400000 }),
    { travauxTotal: 10 },
  );
  m = calme(m); // K = 1 : l'économie au propre, le chantier au premier plan
  const avant = monnaieEnCircuit(m);
  let e = m;
  for (let i = 0; i < 30; i++) e = passerJour(e);
  assert.equal(monnaieEnCircuit(e), avant, "monnaie = initiale : les acomptes restent en circuit");
  assert.equal(e.chantiers!.length, 0, "livré depuis longtemps");
  assert.equal(e.batiments.find((b) => b.nom === "Halle couverte")!.enConstruction, false, "livré");
});

test("chantiers : la cible disparue classe le chantier sans suite, sans crash", () => {
  const m = lancerChantierBatiment(
    createMondeDefaut(),
    nouveauBatiment({ nom: "Tour de verre", type: "habitation", valeur: 900000 }),
  );
  const sansTour = supprimerBatiment(m, m.batiments[0].id);
  const j1 = passerJour(sansTour);
  assert.equal(j1.chantiers!.length, 0, "classé sans suite");
  assert.ok(
    entrees(1, "chantier", j1.journal).some((e) => e.texte.includes("sans suite")),
    "la radiation est racontée",
  );
});

test("chantiers : un bâtiment en construction n'est ni boutique ni service ni cible", () => {
  let m = createMondeDemonstration();
  m = lancerChantierBatiment(
    m,
    nouveauBatiment({ nom: "Supérette du futur", type: "commerce", valeur: 250000, capacitePostes: 2 }),
  );
  const superette = m.batiments.find((b) => b.nom === "Supérette du futur")!;
  const gerante = m.pnjs.find((p) => p.statut === "prive" && p.travailBatimentId === null)!;
  m = modifierPnj(m, gerante.id, { statut: "commercant", batimentId: superette.id });
  assert.equal(
    boutiquesOuvertes(m).some((b) => b.id === superette.id),
    false,
    "en construction : pas de caddies malgré la gérante",
  );
  // Le service public en construction ne charge pas la ville.
  const chargesAvant = chargesJournalieres(m);
  m = lancerChantierBatiment(
    m,
    nouveauBatiment({ nom: "Poste de police annexe", type: "service_public", coutFonctionnement: 1500, valeur: 600000 }),
  );
  assert.equal(chargesJournalieres(m), chargesAvant, "pas de fonctionnement facturé pour un chantier");
});

// ---------- Migrations v11 / v12 / v13 -> v15 ----------

test("migration v11 -> v15 : la file des chantiers est filtrée, jamais inventée", () => {
  const demo = createMondeDemonstration();
  const valide = {
    id: "cha-001",
    jour: 2,
    cibleBatimentId: demo.batiments[0].id,
    cibleVehiculeId: null,
    payeurPnjId: null,
    travauxTotal: 100,
    travauxFaits: 30,
    coutCentimes: 150000,
    coutPaye: 45000,
  };
  const v11 = migrerEtat({
    ...demo,
    schemaVersion: 11,
    chantiers: [valide, null, 42, { id: "" }, { id: "tordu", jour: "hier" }] as unknown as typeof demo.chantiers,
  });
  assert.equal(v11.schemaVersion, 15, "v11 -> v15 : schema à jour");
  assert.equal(v11.chantiers!.length, 1, "seul le chantier bien formé est conservé");
  assert.equal(v11.chantiers![0].travauxFaits, 30, "l'avancement est conservé");
  // Un bâtiment v11 (sans le champ) est forcément achevé.
  assert.equal(v11.batiments.every((b) => b.enConstruction !== true), true, "les bâtiments existants restent livrés");
  const nue = migrerEtat({ schemaVersion: 11, jour: 3 });
  assert.equal(nue.chantiers!.length, 0, "une vieille sauvegarde n'a pas de file");
});

test("migration v12 -> v15 : l'efficacité d'un engin n'est jamais inventée", () => {
  const demo = createMondeDemonstration();
  const engin = (id: string, e: unknown) => ({
    ...demo.vehicules![0],
    id,
    nom: "Engin témoin",
    categorie: "municipal",
    role: "chantier",
    proprietairePnjId: null,
    gangId: null,
    garageBatimentId: null,
    enConstruction: undefined,
    efficacite: e,
  });
  const v12 = migrerEtat({
    ...demo,
    schemaVersion: 12,
    vehicules: [engin("veh-trois", 3), engin("veh-un", 1), engin("veh-tordu", "beaucoup"), engin("veh-zero", 0)] as unknown as typeof demo.vehicules,
  });
  assert.equal(v12.schemaVersion, 15, "v12 -> v15 : schema à jour");
  assert.equal(v12.vehicules!.length, 4, "les engins migrent");
  assert.equal(v12.vehicules![0].efficacite, 3, "une fiche valable est conservée");
  assert.equal(v12.vehicules![1].efficacite, 1, "même la plus petite fiche");
  assert.equal(v12.vehicules![2].efficacite, undefined, "une valeur tordue est jetée");
  assert.equal(v12.vehicules![3].efficacite, undefined, "un zéro est jeté");
  assert.equal(efficaciteEngin(v12.vehicules![2]), 2, "sans fiche, l'engin produit 2 (défaut)");
});

test("migration v13 -> v15 : la jauge du réservoir n'est jamais inventée", () => {
  const demo = createMondeDemonstration();
  const engin = (id: string, c: unknown) => ({
    ...demo.vehicules![0],
    id,
    nom: "Engin témoin",
    categorie: "municipal",
    role: "chantier",
    proprietairePnjId: null,
    gangId: null,
    garageBatimentId: null,
    enConstruction: undefined,
    carburant: c,
  });
  const v13 = migrerEtat({
    ...demo,
    schemaVersion: 13,
    vehicules: [
      engin("veh-sept", 7),
      engin("veh-tordu", "beaucoup"),
      engin("veh-neg", -1),
      engin("veh-haut", 999),
      { ...engin("veh-famille", 42), categorie: "prive", role: null },
    ] as unknown as typeof demo.vehicules,
  });
  assert.equal(v13.schemaVersion, 15, "v13 -> v15 : schema à jour");
  assert.equal(v13.vehicules!.length, 5, "les véhicules migrent");
  assert.equal(v13.vehicules![0].carburant, 7, "une jauge lisible est conservée");
  assert.equal(v13.vehicules![1].carburant, 50, "une valeur tordue devient un plein — jamais à sec par accident");
  assert.equal(v13.vehicules![2].carburant, 50, "un négatif devient un plein");
  assert.equal(v13.vehicules![3].carburant, 50, "une jauge au-delà du réservoir est ramenée au plein");
  assert.equal(v13.vehicules![4].carburant, undefined, "un véhicule sans rôle chantier n'a pas de réservoir");
});
