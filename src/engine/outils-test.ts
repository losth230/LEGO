// Aides partagées des tests moteur (découpe du 2026-11-06).
// import type { Etat, JournalEntree } from "./types.ts";
// import { modifierVille } from "./monde.ts";

import type { Etat, JournalEntree } from "./types.ts";
import { modifierVille, resoudreArbitrage } from "./monde.ts";

export function entrees(jour: number, type: string, j: JournalEntree[]): JournalEntree[] {
  return j.filter((e) => e.jour === jour && e.type === type);
}

/**
 * Résout tous les arbitrages en attente avec l'issue attendue (v1.26) :
 * les tests qui vérifient le récit des incidents rejouent l'issue que la
 * simulation aurait jouée d'elle-même. `choix` permet de forcer une issue
 * par type d'incident (ex. { vol_vehicule: "vole" }) pour tester le pire.
 */
export function resoudreArbitrages(etat: Etat, choix?: Record<string, string>): Etat {
  let e = etat;
  for (const arb of etat.arbitrages ?? []) {
    const attendu = arb.propositions.find((p) => p.attendu)?.id ?? arb.propositions[0]?.id;
    const propositionId = (choix ?? {})[arb.type] ?? attendu;
    if (propositionId === undefined) continue;
    e = resoudreArbitrage(e, arb.id, propositionId);
  }
  return e;
}

/** K = 1 : probabilités d'incident quasi nulles, pour isoler l'économie. */
export function calme(etat: Etat): Etat {
  return modifierVille(etat, { coeffIntensite: 1 });
}

/** Détache les employés privés du monde par défaut (v1.22 : le facteur du
 * bureau de poste). Pour les tests qui recalculent la retenue à la source en
 * supposant qu'aucun commerce n'a d'employé (impotSur(recettes) exact) ;
 * le flux avec employé est couvert par flux.test.ts. */
export function sansEmployePrive(etat: Etat): Etat {
  return {
    ...etat,
    pnjs: etat.pnjs.map((p) => (p.travailBatimentId !== null ? { ...p, travailBatimentId: null } : p)),
  };
}

/** Neutralise le budget courses d'un PNJ pour suivre son compte au centime. */
export function neutraliserCourses(etat: Etat, metier: string): void {
  const i = etat.pnjs.findIndex((p) => p.metier === metier);
  if (i >= 0) etat.pnjs[i] = { ...etat.pnjs[i], budgetAchat: 0 };
}
