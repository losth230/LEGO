// Contrat de types au runtime — point faible de l'outillage local : npm est
// interdit dans l'environnement de dev, le typecheck strict (tsc) ne tourne
// qu'en CI. Ces tests valident donc À L'EXÉCUTION les formes produites par
// le moteur et les migrations : ils attrapent en local la classe de bug qui
// a cassé la CI du 6 novembre 2026 (un `null` dans un champ `string | undefined`).
// Exécution : npm test.
import test from "node:test";
import assert from "node:assert/strict";
import type { Batiment, Pnj } from "./types.ts";
import { createMondeDefaut } from "./monde.ts";
import { createMondeDemonstration } from "./monde.demo.ts";
import { migrerEtat } from "./migrations.ts";
import { passerJour } from "./moteur.ts";

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
    x.vocation === "sante" || x.vocation === "btp" || x.vocation === "banque",
    ou + " : vocation");
}

test("contrat : la ville de démonstration respecte les formes de types.ts", () => {
  const m = createMondeDemonstration();
  for (const p of m.pnjs) contratPnj(p, "ville de démonstration");
  for (const x of m.batiments) contratBatiment(x, "ville de démonstration");
  // v1.24 : la capacité de chaque bâtiment de démonstration est répartie
  // selon son type — aucune n'est perdue dans le dédoublement.
  assert.equal(
    m.batiments.reduce((acc, x) => acc + x.capaciteLogements + x.capacitePostes, 0),
    88,
    "démonstration : la somme des capacités est conservée",
  );
});

test("contrat : le monde par défaut (v1.23) est une ville nue aux formes valides", () => {
  const nue = createMondeDefaut();
  assert.ok(Array.isArray(nue.pnjs) && nue.pnjs.length === 0, "pnjs : tableau vide");
  assert.ok(Array.isArray(nue.batiments) && nue.batiments.length === 0, "batiments : tableau vide");
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
  const rel = migrerEtat(JSON.parse(JSON.stringify(e)));
  for (const p of rel.pnjs) contratPnj(p, "sauvegarde migrée");
  for (const x of rel.batiments) contratBatiment(x, "sauvegarde migrée");
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
  assert.ok(typeof e.budgetVille === "number" && Number.isFinite(e.budgetVille), "budgetVille");
  assert.ok(typeof e.jour === "number", "jour");
  assert.ok(Array.isArray(e.journal), "journal");
});
