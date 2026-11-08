// Chantiers de la ville (v1.27, arbitrage Thibaut 2026-11-08) : plus rien
// ne se crée instantanément — les bâtiments se construisent au BTP, les
// véhicules à la station-service. La durée d'un chantier n'est pas un
// nombre de jours mais une VALEUR DE TRAVAUX (défaut 100) : un ouvrier
// du constructeur produit 1 travail/jour, un engin de chantier ayant
// roulé en produit son EFFICACITÉ (v1.28, défaut 2 — la bétonnière de
// la démo produit 1, son tractopelle 2). Le coût se règle au fur et à
// mesure, au prorata de l'avancement — la ville paie pour un acteur
// public, la figurine commanditaire pour un acteur privé (monde fermé :
// le constructeur encaisse, son flux du soir redistribue).
// Amorçage : sans constructeur en ville, le chantier avance « à la main »
// (1 travail/jour, coups de main bénévoles, sans paiement) — sinon la
// ville nue ne pourrait jamais bâtir son premier BTP.
// Un seul chantier avance par jour : le premier de la file (FIFO) ;
// le maître du jeu peut en prioriser un autre (mutateur monde).

import type { Batiment, Chantier, Etat, JournalEntree, Pnj, Vehicule } from "./types.ts";
import { employesDuCommerce, serviceLocal } from "./economie.ts";
import { montantL } from "./referentiel.ts";

/** Valeur de travaux d'un chantier standard (arbitrage Thibaut : « une valeur fixe, par exemple 100 »). */
export const TRAVAUX_DEFAUT = 100;
/** Un ouvrier du constructeur produit 1 travail par jour. */
export const PRODUCTION_OUVRIER = 1;
/** v1.28 : chaque engin de chantier porte sa propre efficacité (travaux/
 * jour quand il a roulé) — 2 reste le défaut d'un engin sans fiche. */
export const PRODUCTION_ENGIN = 2;
/** Sans constructeur en ville : le chantier avance à la main, 1 travail/jour, sans paiement. */
export const PRODUCTION_MANOEUVRANCE = 1;
/** Le chantier coûte la moitié de la valeur de la cible (défaut, éditable au lancement). */
export const PART_COUT_CONSTRUCTION = 0.5;

/** L'efficacité d'un engin de chantier (v1.28) : sa fiche si elle est
 * lisible (entier ≥ 1), sinon le défaut 2 — jamais d'engin muet ou négatif. */
export function efficaciteEngin(v: Vehicule): number {
  const e = v.efficacite;
  return typeof e === "number" && Number.isInteger(e) && e >= 1 ? e : PRODUCTION_ENGIN;
}

/** Coût par défaut d'un chantier : la moitié de la valeur de la cible (centimes). */
export function coutChantier(valeurCentimes: number): number {
  return Math.max(0, Math.round(valeurCentimes * PART_COUT_CONSTRUCTION));
}

/**
 * Totaux que le moteur prête à l'étape des chantiers (extrait structurel,
 * même convention que TotauxArbitrage) : les acomptes encaissés rejoignent
 * les recettes du jour du constructeur, redistribuées le soir.
 */
export interface TotauxChantiers {
  encaissements: Map<string, number>;
  /** Ids des véhicules qui ont roulé aujourd'hui (l'engin doit avoir roulé). */
  roulent: Set<string>;
  /** Acomptes du jour versés aux constructeurs (centimes). */
  chantiersPayes: number;
  /** Travaux produits aujourd'hui. */
  travauxJour: number;
}

/** La cible d'un chantier, résolue (bâtiment ou véhicule), null si disparue. */
export function cibleDe(
  etat: Etat,
  chantier: Chantier,
): { batiment: Batiment; vehicule: null } | { batiment: null; vehicule: NonNullable<Etat["vehicules"]>[number] } | null {
  if (chantier.cibleBatimentId !== null) {
    const bat = etat.batiments.find((b) => b.id === chantier.cibleBatimentId);
    return bat ? { batiment: bat, vehicule: null } : null;
  }
  if (chantier.cibleVehiculeId !== null) {
    const veh = (etat.vehicules ?? []).find((v) => v.id === chantier.cibleVehiculeId);
    return veh ? { batiment: null, vehicule: veh } : null;
  }
  return null;
}

/** Le nom de la cible d'un chantier (pour le journal et l'interface). */
export function nomCible(etat: Etat, chantier: Chantier): string {
  const cible = cibleDe(etat, chantier);
  if (cible === null) return "un chantier sans cible";
  return cible.batiment !== null ? cible.batiment.nom : cible.vehicule.nom;
}

/** Le constructeur d'un chantier : le BTP pour un bâtiment, la station-service pour un véhicule. */
export function constructeurDu(etat: Etat, chantier: Chantier): { bat: Batiment; gerant: Pnj } | null {
  return serviceLocal(etat, chantier.cibleBatimentId !== null ? "btp" : "garage");
}

/**
 * Production du jour pour un chantier : les employés du constructeur
 * (1 travail chacun) et les engins de chantier ayant roulé (leur
 * efficacité propre, v1.28 — défaut 2).
 * Sans constructeur en ville : à la main, 1 travail/jour sans paiement.
 */
export function productionJournee(
  etat: Etat,
  chantier: Chantier,
  totaux: TotauxChantiers,
): { production: number; employes: number; engins: number; constructeur: { bat: Batiment; gerant: Pnj } | null } {
  const constructeur = constructeurDu(etat, chantier);
  if (constructeur === null) {
    return { production: PRODUCTION_MANOEUVRANCE, employes: 0, engins: 0, constructeur: null };
  }
  const employes = employesDuCommerce(etat, constructeur.bat.id).length;
  const enginsRoulent = (etat.vehicules ?? []).filter(
    (v) => v.role === "chantier" && totaux.roulent.has(v.id),
  );
  return {
    production:
      employes * PRODUCTION_OUVRIER +
      enginsRoulent.reduce((somme, v) => somme + efficaciteEngin(v), 0),
    employes,
    engins: enginsRoulent.length,
    constructeur,
  };
}

/** Le payeur d'un chantier : « la ville » ou la figurine commanditaire. */
export function payeurDe(etat: Etat, chantier: Chantier): { nom: string; caisse: number } | null {
  if (chantier.payeurPnjId === null) return { nom: "la ville", caisse: etat.budgetVille };
  const pnj = etat.pnjs.find((p) => p.id === chantier.payeurPnjId);
  return pnj ? { nom: pnj.prenom + " " + pnj.nom, caisse: pnj.compte } : null;
}

function fmtPct(faits: number, total: number): string {
  return Math.min(100, Math.round((faits / Math.max(1, total)) * 100)) + " %";
}

/**
 * L'étape chantiers du règlement quotidien (v1.27) : le premier chantier
 * de la file avance — les employés du constructeur et les engins de
 * chantier produisent, le payeur règle l'acompte au prorata (tout ou
 * rien : faute de budget, le chantier marque une pause, la monnaie
 * bouge d'un centime). Les chantiers dont la cible a disparu sont
 * classés sans suite. Un chantier livré réveille sa cible (capacités
 * actives) et quitte la file.
 */
export function etapeChantiers(etat: Etat, totaux: TotauxChantiers): JournalEntree[] {
  const entrees: JournalEntree[] = [];
  const file = (etat.chantiers ??= []);
  // Hostile-proof : les chantiers sans cible (bâtiment ou véhicule disparu,
  // import édité à la main) sont classés sans suite — sans crash.
  const restants: Chantier[] = [];
  for (const ch of file) {
    if (ch !== null && typeof ch === "object" && cibleDe(etat, ch) !== null) restants.push(ch);
    else
      entrees.push({
        jour: etat.jour,
        type: "chantier",
        texte: "Le chantier est classé sans suite : sa cible n'est plus en ville.",
      });
  }
  etat.chantiers = restants;
  if (restants.length === 0) return entrees;

  const chantier = restants[0]; // FIFO : un seul chantier avance par jour
  const nom = nomCible(etat, chantier);
  const { production, employes, engins, constructeur } = productionJournee(etat, chantier, totaux);
  const payeur = payeurDe(etat, chantier);

  if (production <= 0) {
    entrees.push({
      jour: etat.jour,
      type: "chantier",
      texte:
        constructeur !== null
          ? "Le chantier de " + nom + " attend : " + constructeur.bat.nom +
            " n'a aucun ouvrier sur le chantier — embaucher des employés relancerait les travaux."
          : "Le chantier de " + nom + " marque le pas.",
    });
  } else if (payeur === null) {
    entrees.push({
      jour: etat.jour,
      type: "chantier",
      texte:
        "Le chantier de " + nom + " est suspendu : son commanditaire n'est plus en ville, personne ne règle les acomptes.",
    });
  } else {
    // Acompte du jour : le prorata cumulé de l'avancement, moins le déjà
    // réglé. À la main (sans constructeur en ville), personne n'encaisse :
    // l'ouvrage bénévole ne coûte rien — la monnaie reste intacte.
    const faitsApres = Math.min(chantier.travauxTotal, chantier.travauxFaits + production);
    const du =
      constructeur === null
        ? 0
        : Math.max(0, Math.round((chantier.coutCentimes * faitsApres) / Math.max(1, chantier.travauxTotal)) - chantier.coutPaye);
    if (du > payeur.caisse) {
      entrees.push({
        jour: etat.jour,
        type: "chantier",
        texte:
          "Le chantier de " + nom + " marque une pause : " + payeur.nom + " n'a pas de quoi régler l'acompte du jour (" +
          montantL(du) + " manquants). Les travaux reprendront quand les caisses seront là.",
      });
    } else {
      chantier.travauxFaits = faitsApres;
      chantier.coutPaye += du;
      if (du > 0) {
        if (chantier.payeurPnjId === null) etat.budgetVille -= du;
        else {
          const pnj = etat.pnjs.find((p) => p.id === chantier.payeurPnjId);
          if (pnj) pnj.compte -= du;
        }
        if (constructeur !== null) {
          // Monde fermé : l'acompte va au constructeur, recette du jour
          // redistribuée le soir (salaires, primes, marge imposée).
          constructeur.gerant.compte += du;
          totaux.encaissements.set(
            constructeur.bat.id,
            (totaux.encaissements.get(constructeur.bat.id) ?? 0) + du,
          );
        }
        totaux.chantiersPayes += du;
      }
      totaux.travauxJour += production;
      const detail =
        constructeur !== null
          ? employes + " ouvrier(s) et " + engins + " engin(s) de " + constructeur.bat.nom
          : "coups de main des habitants, à la main";
      entrees.push({
        jour: etat.jour,
        type: "chantier",
        texte:
          "Le chantier de " + nom + " avance (" + detail + ") : " + production + " travaux ce jour, " +
          fmtPct(chantier.travauxFaits, chantier.travauxTotal) + " de " + chantier.travauxTotal +
          (du > 0 ? " — " + montantL(du) + " réglés par " + payeur.nom : "") + ".",
      });
      // Livraison : la cible s'éveille, ses capacités deviennent actives.
      if (chantier.travauxFaits >= chantier.travauxTotal) {
        const cible = cibleDe(etat, chantier);
        if (cible !== null) {
          if (cible.batiment !== null) cible.batiment.enConstruction = false;
          else cible.vehicule.enConstruction = false;
        }
        etat.chantiers = restants.filter((c) => c.id !== chantier.id);
        entrees.push({
          jour: etat.jour,
          type: "chantier",
          texte:
            "🏗 Dernière brique : " + nom + " est livré" +
            (cible !== null && cible.batiment === null ? "e" : "") +
            " — le chantier touche à sa fin, la ville grandit.",
        });
      }
    }
  }
  if ((etat.chantiers ?? []).length > 1) {
    entrees.push({
      jour: etat.jour,
      type: "chantier",
      texte:
        (etat.chantiers ?? []).length - 1 + " chantier(s) attendent leur tour derrière " + nom +
        " — l'onglet Chantiers permet d'en prioriser un autre.",
    });
  }
  return entrees;
}
