// Registre de migrations de l'état (retour d'expérience Chasse & Pêche) :
// toute ingestion (localStorage, import JSON) passe par migrerEtat, qui
// complète les champs manquants plutôt que de crasher. Les migrations
// d'une version à l'autre se contentent de compléter, jamais de jeter
// une ville en cours (sauf état irrécupérable).

import type { Etat, Vocation } from "./types.ts";
import { createMondeDefaut } from "./monde.ts";
import { COEFF_INTENSITE_DEFAUT, TAUX_IMPOT_DEFAUT_BP } from "./referentiel.ts";

export const SCHEMA_VERSION_ETAT = 7;

/** Ancien taux d'impôt par défaut (v6 : 10 % des gains du jour). */
const ANCIEN_TAUX_IMPOT_DEFAUT_BP = 1000;

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
  // Migration v3 -> v4 : modèle flux (phase 3.6) — lieu de travail des
  // employés privés et recettes du dernier jour par commerce.
  // Migration v5 -> v6 (monde 100 % fermé, 2026-11-06) : vocation des
  // commerces (santé, BTP, banque) — complétée à null (boutique) si absente.
  const pnjs = (Array.isArray(b.pnjs) ? b.pnjs : defaut.pnjs).map((p) => ({
    ...p,
    travailBatimentId:
      (p as Partial<{ travailBatimentId?: string | null }>).travailBatimentId ?? null,
  }));
  const batiments = (Array.isArray(b.batiments) ? b.batiments : defaut.batiments).map((x) => ({
    ...x,
    vocation: (x as Partial<{ vocation?: Vocation | null }>).vocation ?? null,
  }));
  const journal = Array.isArray(b.journal) ? b.journal : defaut.journal;
  const recettesCommerce =
    b.recettesCommerce !== null && typeof b.recettesCommerce === "object"
      ? (b.recettesCommerce as Record<string, number>)
      : {};

  // Migration v1 -> v2 : K éditable (params.coeffIntensite) et pertes cumulées.
  // Migration v4 -> v5 (arbitrage 2026-11-06) : l'impôt change de base
  // (revenu indicatif -> gains réels du jour, prélevés à la source) ; un taux
  // réglé sous l'ancienne base n'a plus de sens, retour au défaut (10 %).
  // À partir de v5, le taux choisi par le joueur est conservé tel quel.
  const paramsBrut = (b.params ?? defaut.params) as Partial<Etat["params"]>;
  const tauxImpotConserve =
    typeof paramsBrut.tauxImpotBp === "number" ? paramsBrut.tauxImpotBp : defaut.params.tauxImpotBp;
  // Migration v6 -> v7 : le défaut passe à 30 % (arbitrage Thibaut
  // 2026-11-06) — une ville restée à l'ancien défaut de 10 % monte au
  // nouveau taux ; un taux réellement choisi reste le sien.
  const tauxBrut = version >= 5 ? tauxImpotConserve : TAUX_IMPOT_DEFAUT_BP;
  const tauxImpotBp =
    version < 7 && tauxBrut === ANCIEN_TAUX_IMPOT_DEFAUT_BP
      ? TAUX_IMPOT_DEFAUT_BP
      : tauxBrut;
  const params: Etat["params"] = {
    tauxImpotBp,
    coeffIntensite:
      typeof paramsBrut.coeffIntensite === "number" && paramsBrut.coeffIntensite >= 1
        ? Math.round(paramsBrut.coeffIntensite)
        : COEFF_INTENSITE_DEFAUT,
  };
  const pertesCumulees =
    typeof b.pertesCumulees === "number" ? b.pertesCumulees : 0;
  // Migration v6 -> v7 (monde fermé, arbitrage 2026-11-06) : le crime ne
  // détruit plus la monnaie — les butins vont aux voleurs, volsCumules
  // compte les transferts depuis la réforme.
  const volsCumules = typeof b.volsCumules === "number" ? b.volsCumules : 0;
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
    volsCumules,
    dette,
    mouvementsBanqueCumules,
    params,
    pnjs,
    batiments,
    journal,
    recettesCommerce,
  };
}
