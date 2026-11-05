// Registre de migrations de l'état (retour d'expérience Chasse & Pêche) :
// toute ingestion (localStorage, import JSON) passe par migrerEtat, qui
// complète les champs manquants plutôt que de crasher. Les migrations
// d'une version à l'autre se contentent de compléter, jamais de jeter
// une ville en cours (sauf état irrécupérable).

import type { Etat } from "./types.ts";
import { createMondeDefaut } from "./monde.ts";
import { COEFF_INTENSITE_DEFAUT } from "./referentiel.ts";

export const SCHEMA_VERSION_ETAT = 3;

/** Normalise un état inconnu (localStorage corrompu, version future, import). */
export function migrerEtat(brut: unknown): Etat {
  if (brut === null || typeof brut !== "object") {
    return createMondeDefaut();
  }
  const b = brut as Partial<Etat> & { schemaVersion?: unknown };
  const version = typeof b.schemaVersion === "number" ? b.schemaVersion : 0;
  // Version inconnue (future) ou état irrécupérable : nouveau monde.
  if (version > SCHEMA_VERSION_ETAT) {
    return createMondeDefaut();
  }

  const defaut = createMondeDefaut();
  const pnjs = Array.isArray(b.pnjs) ? b.pnjs : defaut.pnjs;
  const batiments = Array.isArray(b.batiments) ? b.batiments : defaut.batiments;
  const journal = Array.isArray(b.journal) ? b.journal : defaut.journal;

  // Migration v1 -> v2 : K éditable (params.coeffIntensite) et pertes cumulées.
  const paramsBrut = (b.params ?? defaut.params) as Partial<Etat["params"]>;
  const params: Etat["params"] = {
    tauxImpotBp:
      typeof paramsBrut.tauxImpotBp === "number"
        ? paramsBrut.tauxImpotBp
        : defaut.params.tauxImpotBp,
    coeffIntensite:
      typeof paramsBrut.coeffIntensite === "number" && paramsBrut.coeffIntensite >= 1
        ? Math.round(paramsBrut.coeffIntensite)
        : COEFF_INTENSITE_DEFAUT,
  };
  const pertesCumulees =
    typeof b.pertesCumulees === "number" ? b.pertesCumulees : 0;
  // Migration v2 -> v3 : dette bancaire et mouvements de capitaux (phase 3).
  const dette = typeof b.dette === "number" ? b.dette : 0;
  const mouvementsBanqueCumules =
    typeof b.mouvementsBanqueCumules === "number" ? b.mouvementsBanqueCumules : 0;

  return {
    schemaVersion: SCHEMA_VERSION_ETAT,
    jour: typeof b.jour === "number" ? b.jour : 0,
    nomVille: typeof b.nomVille === "string" ? b.nomVille : defaut.nomVille,
    budgetVille: typeof b.budgetVille === "number" ? b.budgetVille : 0,
    sortiesCumulees: typeof b.sortiesCumulees === "number" ? b.sortiesCumulees : 0,
    pertesCumulees,
    dette,
    mouvementsBanqueCumules,
    params,
    pnjs,
    batiments,
    journal,
  };
}
