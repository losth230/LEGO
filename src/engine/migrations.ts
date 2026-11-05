// Registre de migrations de l'état (retour d'expérience Chasse & Pêche) :
// toute ingestion (localStorage, import JSON) passe par migrerEtat, qui
// complète les champs manquants plutôt que de crasher.

import type { Etat } from "./types.ts";
import { createMondeDefaut } from "./monde.ts";

export const SCHEMA_VERSION_ETAT = 1;

/** Normalise un état inconnu (localStorage corrompu, version future, import). */
export function migrerEtat(brut: unknown): Etat {
  if (brut === null || typeof brut !== "object") {
    return createMondeDefaut();
  }
  const b = brut as Partial<Etat>;
  if (b.schemaVersion !== SCHEMA_VERSION_ETAT) {
    return createMondeDefaut();
  }
  const defaut = createMondeDefaut();
  const pnjs = Array.isArray(b.pnjs) ? b.pnjs : defaut.pnjs;
  const batiments = Array.isArray(b.batiments) ? b.batiments : defaut.batiments;
  const journal = Array.isArray(b.journal) ? b.journal : defaut.journal;
  const params = b.params ?? defaut.params;
  return {
    schemaVersion: SCHEMA_VERSION_ETAT,
    jour: typeof b.jour === "number" ? b.jour : 0,
    nomVille: typeof b.nomVille === "string" ? b.nomVille : defaut.nomVille,
    budgetVille: typeof b.budgetVille === "number" ? b.budgetVille : 0,
    sortiesCumulees: typeof b.sortiesCumulees === "number" ? b.sortiesCumulees : 0,
    params,
    pnjs,
    batiments,
    journal,
  };
}
