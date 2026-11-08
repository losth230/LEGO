// Contrat de types au runtime — point faible de l'outillage local : npm est
// interdit dans l'environnement de dev, le typecheck strict (tsc) ne tourne
// qu'en CI. Ces tests valident donc À L'EXÉCUTION les formes produites par
// le moteur et les migrations : ils attrapent en local la classe de bug qui
// a cassé la CI du 6 novembre 2026 (un `null` dans un champ `string | undefined`).
// Exécution : npm test.
import test from "node:test";
import assert from "node:assert/strict";
import type { Arbitrage, Batiment, Chantier, Pnj, Vehicule } from "./types.ts";
import { createMondeDefaut, lancerChantierBatiment, modifierVille, nouveauBatiment } from "./monde.ts";
import { createMondeDemonstration } from "./monde.demo.ts";
import { migrerEtat } from "./migrations.ts";
import { passerJour } from "./moteur.ts";
import { DELAI_ARBITRAGE_JOURS } from "./arbitrages.ts";
import { TRAVAUX_DEFAUT } from "./chantiers.ts";

/** Vérifie qu'un PNJ respecte les formes déclarées dans types.ts. */
function contratPnj(p: Pnj, ou: string): void {
  assert.ok(typeof p.id === "string" && p.id !== "", ou + " : id");
  assert.ok(typeof p.prenom === "string" && p.prenom !== "", ou + " : prenom");
  assert.ok(typeof p.nom === "string" && p.nom !== "", ou + " : nom");
  assert.ok(typeof p.metier === "string", ou + " : metier");
  assert.ok(typeof p.age === "number", ou + " : age");
  assert.ok(p.genre === "F" || p.genre === "M", ou + " : genre");
  assert.ok(typeof p.statut === "string", ou + " : statut");
  // Le champ qui a coûté la CI du 6 novembre : grade?: string — jamais null.
  assert.ok(p.grade === undefined || (typeof p.grade === "string" && p.grade !== ""),
    ou + " : grade doit être string ou absent, jamais null (bug v1.17)");
  assert.ok(p.batimentId === null || typeof p.batimentId === "string", ou + " : batimentId");
  assert.ok(
    p.travailBatimentId === undefined || p.travailBatimentId === null ||
      typeof p.travailBatimentId === "string",
    ou + " : travailBatimentId",
  );
  assert.ok(typeof p.revenuIndicatif === "number", ou + " : revenuIndicatif");
  assert.ok(typeof p.budgetAchat === "number", ou + " : budgetAchat");
  assert.ok(typeof p.compte === "number", ou + " : compte");
  assert.ok(typeof p.epargne === "number", ou + " : epargne");
  assert.ok(
    p.personnalite === undefined ||
      (Array.isArray(p.personnalite) && p.personnalite.every((t) => typeof t === "string")),
    ou + " : personnalite",
  );
  assert.ok(p.casier === undefined || typeof p.casier === "number", ou + " : casier");
  assert.ok(
    p.gangId === undefined || p.gangId === null || typeof p.gangId === "string",
    ou + " : gangId",
  );
  assert.ok(p.arreteJusqua === undefined || typeof p.arreteJusqua === "number", ou + " : arreteJusqua");
}

/** Vérifie qu'un bâtiment respecte les formes déclarées dans types.ts. */
function contratBatiment(x: Batiment, ou: string): void {
  assert.ok(typeof x.id === "string" && x.id !== "", ou + " : id");
  assert.ok(typeof x.nom === "string" && x.nom !== "", ou + " : nom");
  assert.ok(x.type === "habitation" || x.type === "commerce" || x.type === "service_public",
    ou + " : type");
  assert.ok(typeof x.quartier === "string", ou + " : quartier");
  assert.ok(typeof x.valeur === "number" && Number.isFinite(x.valeur), ou + " : valeur");
  assert.ok(typeof x.etat === "string", ou + " : etat");
  assert.ok(typeof x.coutFonctionnement === "number", ou + " : coutFonctionnement");
  // v1.24 : la capacité unique devient deux capacités indépendantes —
  // un bâtiment peut loger des figurines ET offrir des postes de travail.
  assert.ok(typeof x.capaciteLogements === "number" && x.capaciteLogements >= 0,
    ou + " : capaciteLogements");
  assert.ok(typeof x.capacitePostes === "number" && x.capacitePostes >= 0,
    ou + " : capacitePostes");
  assert.ok(!("capacite" in x), ou + " : plus de champ capacite (v1.24)");
  assert.ok(x.vocation === undefined || x.vocation === null ||
    x.vocation === "sante" || x.vocation === "btp" || x.vocation === "banque" || x.vocation === "garage",
    ou + " : vocation");
  // v1.27 : le drapeau de chantier, booléen ou absent (livré).
  assert.ok(x.enConstruction === undefined || typeof x.enConstruction === "boolean",
    ou + " : enConstruction");
}

/** Vérifie qu'un véhicule respecte les formes déclarées dans types.ts (v1.25). */
function contratVehicule(v: Vehicule, ou: string): void {
  assert.ok(typeof v.id === "string" && v.id !== "", ou + " : id");
  assert.ok(typeof v.nom === "string" && v.nom !== "", ou + " : nom");
  assert.ok(v.categorie === "municipal" || v.categorie === "prive", ou + " : categorie");
  assert.ok(
    v.role === null || v.role === "pompiers" || v.role === "police" ||
      v.role === "proprete" || v.role === "sante" || v.role === "chantier",
    ou + " : role",
  );
  assert.ok(typeof v.quartier === "string", ou + " : quartier");
  assert.ok(typeof v.valeur === "number" && Number.isFinite(v.valeur) && v.valeur >= 0,
    ou + " : valeur");
  assert.ok(
    v.etat === "neuf" || v.etat === "bon" || v.etat === "degrade" || v.etat === "sinistre",
    ou + " : etat",
  );
  assert.ok(typeof v.essenceJour === "number" && v.essenceJour >= 0, ou + " : essenceJour");
  assert.ok(typeof v.capaciteLogements === "number" && v.capaciteLogements >= 0,
    ou + " : capaciteLogements");
  assert.ok(typeof v.capacitePostes === "number" && v.capacitePostes >= 0,
    ou + " : capacitePostes");
  assert.ok(v.proprietairePnjId === null || typeof v.proprietairePnjId === "string",
    ou + " : proprietairePnjId jamais undefined");
  assert.ok(v.gangId === null || typeof v.gangId === "string", ou + " : gangId");
  assert.ok(v.garageBatimentId === null || typeof v.garageBatimentId === "string",
    ou + " : garageBatimentId");
  assert.ok(v.enConstruction === undefined || typeof v.enConstruction === "boolean",
    ou + " : enConstruction");
  assert.ok(
    v.efficacite === undefined || (typeof v.efficacite === "number" && Number.isInteger(v.efficacite) && v.efficacite >= 1),
    ou + " : efficacite (entier >= 1 ou absente)",
  );
  assert.ok(
    v.carburant === undefined ||
      (typeof v.carburant === "number" && Number.isInteger(v.carburant) && v.carburant >= 0 && v.carburant <= 50),
    ou + " : carburant (entier 0..50, réservoir d'un engin, ou absent)",
  );
}

/** Vérifie qu'un arbitrage respecte les formes déclarées dans types.ts (v1.26). */
function contratArbitrage(a: Arbitrage, ou: string): void {
  assert.ok(typeof a.id === "string" && a.id !== "", ou + " : id");
  assert.ok(typeof a.jour === "number", ou + " : jour");
  assert.ok(
    typeof a.expireLe === "number" && a.expireLe === a.jour + DELAI_ARBITRAGE_JOURS,
    ou + " : expireLe = jour + 3 (le délai du maître du jeu)",
  );
  assert.ok(
    a.type === "incendie" || a.type === "cambriolage" || a.type === "guerre_gangs" ||
      a.type === "collision" || a.type === "vol_vehicule" || a.type === "accident",
    ou + " : type",
  );
  assert.ok(a.gravite >= 1 && a.gravite <= 3, ou + " : gravité 1-3");
  assert.ok(Array.isArray(a.propositions) && a.propositions.length >= 1, ou + " : propositions");
  assert.equal(
    a.propositions.filter((p) => p.attendu).length,
    1,
    ou + " : exactement une issue attendue (la suggestion)",
  );
  assert.ok(a.propositions.some((p) => p.pire), ou + " : au moins une pire issue (l'expiration)");
  for (const p of a.propositions) {
    assert.ok(typeof p.id === "string" && p.id !== "", ou + " : proposition id");
    assert.ok(typeof p.libelle === "string" && p.libelle !== "", ou + " : proposition libelle");
  }
  const m = a.moyens;
  assert.ok(m !== null && typeof m === "object", ou + " : moyens");
  assert.ok(typeof m.pompiers === "number" && typeof m.police === "number" && typeof m.armee === "number",
    ou + " : effectifs photographiés");
  assert.ok(
    typeof m.camionPompiers === "boolean" && typeof m.fourgonPolice === "boolean" &&
      typeof m.camionProprete === "boolean" && typeof m.ambulance === "boolean",
    ou + " : engins photographiés",
  );
  assert.ok(
    m.btpBatimentId === null || typeof m.btpBatimentId === "string",
    ou + " : btpBatimentId",
  );
  assert.ok(m.commissariat === undefined || typeof m.commissariat === "boolean", ou + " : commissariat");
}

/** Vérifie qu'un chantier respecte les formes déclarées dans types.ts (v1.27). */
function contratChantier(c: Chantier, ou: string): void {
  assert.ok(typeof c.id === "string" && c.id !== "", ou + " : id");
  assert.ok(typeof c.jour === "number", ou + " : jour");
  assert.ok(
    typeof c.cibleBatimentId === "string" || typeof c.cibleVehiculeId === "string",
    ou + " : une cible, bâtiment ou véhicule",
  );
  assert.ok(c.payeurPnjId === null || typeof c.payeurPnjId === "string", ou + " : payeurPnjId");
  assert.ok(
    typeof c.travauxTotal === "number" && Number.isFinite(c.travauxTotal) && c.travauxTotal >= 1,
    ou + " : travauxTotal (une valeur de travaux, pas une durée)",
  );
  assert.ok(
    typeof c.travauxFaits === "number" && c.travauxFaits >= 0 && c.travauxFaits <= c.travauxTotal,
    ou + " : travauxFaits borné par le total",
  );
  assert.ok(typeof c.coutCentimes === "number" && c.coutCentimes >= 0, ou + " : coutCentimes");
  assert.ok(
    typeof c.coutPaye === "number" && c.coutPaye >= 0 && c.coutPaye <= c.coutCentimes,
    ou + " : coutPaye borné par le coût total (au prorata, jamais plus)",
  );
}

test("contrat : la ville de démonstration respecte les formes de types.ts", () => {
  const m = createMondeDemonstration();
  for (const p of m.pnjs) contratPnj(p, "ville de démonstration");
  for (const x of m.batiments) contratBatiment(x, "ville de démonstration");
  for (const v of m.vehicules ?? []) contratVehicule(v, "ville de démonstration");
  assert.equal(m.vehicules!.length, 9, "démonstration : 9 véhicules (4 engins municipaux, 3 privés, 2 engins de chantier du BTP v1.28)");
  assert.equal(
    m.vehicules!.filter((v) => v.categorie === "municipal").length,
    4,
    "démonstration : camion, fourgon, balayeur et ambulance en flotte municipale",
  );
  // v1.24 : la capacité de chaque bâtiment de démonstration est répartie
  // selon son type — aucune n'est perdue dans le dédoublement.
  // v1.25 : la station-service ajoute ses 2 postes (88 -> 90).
  assert.equal(
    m.batiments.reduce((acc, x) => acc + x.capaciteLogements + x.capacitePostes, 0),
    90,
    "démonstration : la somme des capacités est conservée",
  );
});

test("contrat : le monde par défaut (v1.23) est une ville nue aux formes valides", () => {
  const nue = createMondeDefaut();
  assert.ok(Array.isArray(nue.pnjs) && nue.pnjs.length === 0, "pnjs : tableau vide");
  assert.ok(Array.isArray(nue.batiments) && nue.batiments.length === 0, "batiments : tableau vide");
  assert.ok(Array.isArray(nue.vehicules) && nue.vehicules.length === 0, "vehicules : tableau vide");
  assert.ok(Array.isArray(nue.journal) && nue.journal.length >= 1, "journal : au moins le jour 0");
  assert.ok(Array.isArray(nue.gangs ?? []) && (nue.gangs ?? []).length === 0, "gangs : aucun");
  assert.ok(typeof nue.budgetVille === "number" && Number.isFinite(nue.budgetVille), "budgetVille");
  // La ville nue survit à quelques jours : les formes tiennent aussi vide.
  let e = nue;
  for (let i = 0; i < 3; i++) e = passerJour(e);
  assert.ok(Array.isArray(e.journal), "journal après 3 jours");
  assert.ok(typeof e.jour === "number" && e.jour === 3, "jour");
});

test("contrat : une sauvegarde hostile migrée respecte les formes (payloads tordus)", () => {
  const e = createMondeDemonstration();
  e.pnjs[0].grade = null as unknown as string; // le bug v1.17, volontairement
  (e.pnjs[1] as unknown as Record<string, unknown>).casier = "beaucoup";
  (e.pnjs[2] as unknown as Record<string, unknown>).personnalite = "cupide";
  delete (e.pnjs[3] as unknown as Record<string, unknown>).compte;
  (e.pnjs[4] as unknown as Record<string, unknown>).batimentId = 12;
  // v1.24 : un bâtiment v8 avec l'ancienne capacité unique (et une valeur
  // tordue) doit ressortir en v9 avec les deux capacités propres.
  const vieuxBat = e.batiments[0] as unknown as Record<string, unknown>;
  vieuxBat.capacite = "plein";
  delete vieuxBat.capaciteLogements;
  delete vieuxBat.capacitePostes;
  (e.batiments[1] as unknown as Record<string, unknown>).capaciteLogements = "trois";
  // v1.25 : un véhicule d'import tordu — rôle inconnu, catégorie inconnue,
  // essence négative, champs absents — doit ressortir en v10 avec des
  // formes propres, jamais un null dans un champ string.
  e.vehicules = [
    {
      id: "veh-tordu",
      nom: "Épave d'import",
    } as unknown as Vehicule,
    {
      ...e.vehicules![0],
      role: "démolisseur",
      categorie: "militaire",
      essenceJour: -50,
    } as unknown as Vehicule,
  ];
  const rel = migrerEtat(JSON.parse(JSON.stringify(e)));
  for (const p of rel.pnjs) contratPnj(p, "sauvegarde migrée");
  for (const x of rel.batiments) contratBatiment(x, "sauvegarde migrée");
  for (const v of rel.vehicules ?? []) contratVehicule(v, "sauvegarde migrée");
  const tordu = (rel.vehicules ?? []).find((v) => v.id === "veh-tordu")!;
  assert.equal(tordu.categorie, "prive", "catégorie inconnue -> privé par défaut");
  assert.equal(tordu.role, null, "rôle inconnu -> aucun rôle inventé");
  assert.equal(tordu.essenceJour, 0, "consentation illisible -> 0");
  assert.equal(tordu.etat, "bon", "état absent -> bon");
  const recupere = (rel.vehicules ?? []).find((v) => v.id === e.vehicules![1].id)!;
  assert.equal(recupere.essenceJour, 0, "essence négative -> 0, pas de crédit à la pompe");
  const premiere = rel.batiments.find((x) => x.id === e.batiments[0].id)!;
  assert.ok(
    premiere.capaciteLogements + premiere.capacitePostes === 0,
    "capacité v8 illisible -> 0/0, pas de capacité inventée",
  );
});

test("contrat : passerJour ne casse aucune forme", () => {
  let e = createMondeDemonstration();
  for (let i = 0; i < 3; i++) e = passerJour(e);
  for (const p of e.pnjs) contratPnj(p, "après 3 jours");
  for (const v of e.vehicules ?? []) contratVehicule(v, "après 3 jours");
  assert.ok(typeof e.budgetVille === "number" && Number.isFinite(e.budgetVille), "budgetVille");
  assert.ok(typeof e.jour === "number", "jour");
  assert.ok(Array.isArray(e.journal), "journal");
});

test("contrat : une file d'arbitrages hostile ressort vide ou propre (payloads tordus)", () => {
  const e = createMondeDemonstration();
  // v1.26 : la file d'arbitrages n'est pas un tableau -> complétée à vide.
  (e as unknown as Record<string, unknown>).arbitrages = "pas une liste";
  let rel = migrerEtat(JSON.parse(JSON.stringify(e)));
  assert.ok(
    Array.isArray(rel.arbitrages) && rel.arbitrages.length === 0,
    "arbitrages non-tableau -> []",
  );
  // Des entrées tordues sont filtrées, jamais décodées en force.
  (e as unknown as Record<string, unknown>).arbitrages = [{ prix: "tordu" }, null, 42];
  rel = migrerEtat(JSON.parse(JSON.stringify(e)));
  assert.equal(rel.arbitrages!.length, 0, "arbitrages mal formés filtrés, rien n'est inventé");
  // Les arbitrages produits par le moteur respectent les formes.
  const m = modifierVille(e, { coeffIntensite: 100000 });
  const j1 = passerJour(m);
  assert.ok((j1.arbitrages ?? []).length >= 2, "des incidents attendent le maître du jeu");
  for (const a of j1.arbitrages ?? []) contratArbitrage(a, "après 1 jour");
});

test("contrat : une file de chantiers hostile ressort vide ou propre (payloads tordus)", () => {
  const e = createMondeDemonstration();
  // v1.27 : la file de chantiers n'est pas un tableau -> complétée à vide.
  (e as unknown as Record<string, unknown>).chantiers = "pas une liste";
  let rel = migrerEtat(JSON.parse(JSON.stringify(e)));
  assert.ok(
    Array.isArray(rel.chantiers) && rel.chantiers.length === 0,
    "chantiers non-tableau -> []",
  );
  // Des entrées tordues sont filtrées, jamais décodées en force.
  (e as unknown as Record<string, unknown>).chantiers = [{ prix: "tordu" }, null, 17];
  rel = migrerEtat(JSON.parse(JSON.stringify(e)));
  assert.equal(rel.chantiers!.length, 0, "chantiers mal formés filtrés, rien n'est inventé");
  // Les chantiers produits par le moteur respectent les formes.
  const propre = createMondeDemonstration();
  const lance = lancerChantierBatiment(
    propre,
    nouveauBatiment({ nom: "Pavillon des Contrats", type: "habitation", valeur: 300000 }),
    { travauxTotal: TRAVAUX_DEFAUT },
  );
  assert.ok((lance.chantiers ?? []).length === 1, "un chantier est lancé");
  for (const c of lance.chantiers ?? []) contratChantier(c, "au lancement");
  // Une fois livré, le chantier quitte la file sans casser les formes.
  const j1 = passerJour(lance);
  for (const c of j1.chantiers ?? []) contratChantier(c, "après 1 jour");
  const vise = j1.batiments.find((b) => b.nom === "Pavillon des Contrats")!;
  assert.ok(vise.enConstruction === true, "le bâtiment reste en construction (100 travaux)");
});
