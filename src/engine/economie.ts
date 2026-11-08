// Économie pure du moteur — helpers sans état ni orchestration
// (extraction de moteur.ts, 2026-11-06 : le moteur garde le cycle du
// jour, les fonctions pures déménagent ici). Réexportés par moteur.ts
// pour ne casser aucun import existant.

import type {
  Batiment,
  Etat,
  Pnj,
  Vocation
} from "./types.ts";

import {
  TAUX_EMPRUNT_PCT,
  PART_SALARIALE_FLUX,
  salaireJourL
} from "./referentiel.ts";

/** Intérêts de dette dus pour une journée (centimes) — taux réel 3,54 %/an. */
export function interetsDus(dette: number): number {
  return Math.round((dette * TAUX_EMPRUNT_PCT) / 100 / 365);
}

/** Charges fixes quotidiennes de la ville (centimes) : salaires, fonctionnement, carburant municipal, intérêts. */
export function chargesJournalieres(etat: Etat): number {
  const salaires = etat.pnjs
    .filter((p) => p.statut === "agent_public")
    .reduce((s, p) => s + Math.round(salaireJourL(p.grade ?? "") * 100), 0);
  const fonct = etat.batiments
    .filter((b) => b.type === "service_public")
    .reduce((s, b) => s + b.coutFonctionnement, 0);
  // v1.25 : le carburant de la flotte municipale est une charge quotidienne
  // (même convention que le fonctionnement : comptée même si elle ne sera
  // dépensée qu'en présence d'une boutique ouverte — estimation prudente).
  const essence = (etat.vehicules ?? [])
    .filter((v) => v.categorie === "municipal" && v.etat !== "sinistre")
    .reduce((s, v) => s + v.essenceJour, 0);
  return salaires + fonct + essence + interetsDus(etat.dette);
}

/** Nombre de jours de charges encore couverts par la caisse (Infinity si tout va bien). */
export function joursDeMarge(etat: Etat): number {
  const charges = chargesJournalieres(etat);
  if (charges <= 0) return Infinity;
  return Math.floor(etat.budgetVille / charges);
}

/** Nombre de magasins ouverts pour un acheteur (un commerçant n'achète pas chez lui). */
export function commercesPourAcheteur(etat: Etat, pnj: Pnj): Batiment[] {
  return etat.batiments.filter((b) => {
    if (b.type !== "commerce" || b.vocation) return false;
    const proprio = etat.pnjs.find((p) => p.batimentId === b.id && p.statut === "commercant");
    return proprio !== undefined && proprio.id !== pnj.id;
  });
}

/** Boutiques de consommation ouvertes : un commerce sans vocation n'est ouvert que s'il a son commerçant. */
export function boutiquesOuvertes(etat: Etat): Batiment[] {
  return etat.batiments.filter(
    (b) =>
      b.type === "commerce" &&
      !b.vocation &&
      etat.pnjs.some((p) => p.batimentId === b.id && p.statut === "commercant"),
  );
}

/**
 * Service local à vocation (monde 100 % fermé, arbitrage 2026-11-06) :
 * renvoie le bâtiment et son gérant si le service existe et est tenu,
 * null sinon. Sans service en ville, aucune activité ni frais lié
 * à ce service (santé, BTP, banque).
 */
export function serviceLocal(
  etat: Etat,
  vocation: Vocation,
): { bat: Batiment; gerant: Pnj } | null {
  for (const b of etat.batiments) {
    if (b.type !== "commerce" || b.vocation !== vocation) continue;
    const gerant = etat.pnjs.find((p) => p.batimentId === b.id && p.statut === "commercant");
    if (gerant) return { bat: b, gerant };
  }
  return null;
}

/**
 * Employés privés travaillant dans un commerce (lieu de travail renseigné).
 * v1.25 : un véhicule affecté au commerce (garageBatimentId) ajoute ses
 * postes ambulant — les employés du fourgon sont payés par la boutique
 * qui l'abrite (le facteur du bureau de poste, la camionnette de livraison).
 */
export function employesDuCommerce(etat: Etat, batimentId: string): Pnj[] {
  return etat.pnjs.filter(
    (p) =>
      p.statut === "prive" &&
      (p.travailBatimentId === batimentId ||
        (p.travailBatimentId !== null &&
          (etat.vehicules ?? []).some(
            (v) =>
              v.id === p.travailBatimentId &&
              v.garageBatimentId === batimentId &&
              v.etat !== "sinistre",
          ))),
  );
}

/**
 * Effectif maximal qu'un commerce peut salarier sans thésauriser :
 * ~88 % des recettes en salaires, le reste est la marge patronale
 * (phase 3.6 — marge sur le flux, jamais le stock).
 */
export function effectifMax(recettesCentimes: number, salaireJourCentimes: number): number {
  if (salaireJourCentimes <= 0) return 0;
  return Math.floor((PART_SALARIALE_FLUX * recettesCentimes) / salaireJourCentimes);
}

/** Répartit un montant en centimes proportionnellement aux poids (sans en perdre). */
export function repartir(montant: number, poids: number[]): number[] {
  const total = poids.reduce((s, v) => s + v, 0);
  if (total <= 0 || montant <= 0) return poids.map(() => 0);
  const parts = poids.map((v) => Math.floor((montant * v) / total));
  let reste = montant - parts.reduce((s, v) => s + v, 0);
  for (let i = 0; i < parts.length && reste > 0; i++) {
    parts[i] += 1;
    reste -= 1;
  }
  return parts;
}

/**
 * Impôt prélevé à la source sur un gain du jour (centimes), arrondi à l'entier.
 * Arbitrage 2026-11-06 : une seule forme d'impôt, X % des gains réels de
 * chacun (solde des agents, salaires et primes des employés privés, marge
 * des patrons) — un habitant sans gain ne paie rien.
 */
export function impotSur(gainCentimes: number, tauxImpotBp: number): number {
  return Math.round((gainCentimes * tauxImpotBp) / 10000);
}

/**
 * Renfort de la garnison (branche militaire) : sur un incident majeur (gravité 3),
 * au moins deux militaires disponibles contiennent la moitié des dégâts/frais.
 * Renvoie le multiplicateur à appliquer (1 sans renfort, 0,5 avec).
 */
export function coefficientRenfort(gravite: 1 | 2 | 3, militairesDispo: number): number {
  return gravite === 3 && militairesDispo >= 2 ? 0.5 : 1;
}

/**
 * Budget d'achat quotidien EFFECTIF d'un PNJ (centimes) — phase 3.10, traits
 * actifs : la personnalité module la consommation (±20 % max). Le sociable
 * fait vivre les commerces (+20 %), le cupide dépense (+10 %), le
 * travailleur (-10 %) et surtout le prudent (-20 %) gardent leur argent —
 * et deviennent des cibles de choix pour les voleurs.
 */
export function budgetAchat(pnj: Pnj): number {
  const t = pnj.personnalite ?? [];
  let coef = 1;
  if (t.includes("sociable")) coef += 0.2;
  if (t.includes("cupide")) coef += 0.1;
  if (t.includes("travailleur")) coef -= 0.1;
  if (t.includes("prudent")) coef -= 0.2;
  coef = Math.min(1.2, Math.max(0.8, coef));
  return Math.round(pnj.budgetAchat * coef);
}
