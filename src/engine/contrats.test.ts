// Contrat de types au runtime — point faible de l'outillage local : npm est
// interdit dans l'environnement de dev, le typecheck strict (tsc) ne tourne
// qu'en CI. Ces tests valident donc À L'EXÉCUTION les formes produites par
// le moteur et les migrations : ils attrapent en local la classe de bug qui
// a cassé la CI du 6 novembre 2026 (un `null` dans un champ `string | undefined`).
// Exécution : npm test.
import test from "node:test";
import assert from "node:assert/strict";
import type { Pnj } from "./types.ts";
import { createMondeDefaut } from "./monde.ts";
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

test("contrat : le monde par défaut respecte les formes de types.ts", () => {
  const m = createMondeDefaut();
  for (const p of m.pnjs) contratPnj(p, "monde par défaut");
});

test("contrat : une sauvegarde hostile migrée respecte les formes (payloads tordus)", () => {
  const e = createMondeDefaut();
  e.pnjs[0].grade = null as unknown as string; // le bug v1.17, volontairement
  (e.pnjs[1] as unknown as Record<string, unknown>).casier = "beaucoup";
  (e.pnjs[2] as unknown as Record<string, unknown>).personnalite = "cupide";
  delete (e.pnjs[3] as unknown as Record<string, unknown>).compte;
  (e.pnjs[4] as unknown as Record<string, unknown>).batimentId = 12;
  const rel = migrerEtat(JSON.parse(JSON.stringify(e)));
  for (const p of rel.pnjs) contratPnj(p, "sauvegarde migrée");
});

test("contrat : passerJour ne casse aucune forme", () => {
  let e = createMondeDefaut();
  for (let i = 0; i < 3; i++) e = passerJour(e);
  for (const p of e.pnjs) contratPnj(p, "après 3 jours");
  assert.ok(typeof e.budgetVille === "number" && Number.isFinite(e.budgetVille), "budgetVille");
  assert.ok(typeof e.jour === "number", "jour");
  assert.ok(Array.isArray(e.journal), "journal");
});
