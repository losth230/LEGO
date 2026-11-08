// Chantiers de la ville (v1.27, arbitrage Thibaut 2026-11-08) : plus rien
// ne se crée instantanément — les bâtiments se construisent au BTP, les
// véhicules à la station-service. La durée d'un chantier n'est pas un
// nombre de jours mais une VALEUR DE TRAVAUX (défaut 100) : un ouvrier
// du constructeur produit 1 travail/jour, un engin de chantier en produit
// son EFFICACITÉ (v1.28, défaut 2 — la bétonnière de la démo produit 1,
// son tractopelle 2). v1.29 : un engin vit sur son RÉSERVOIR (50 L) —
// chaque travail ajouté consomme 1 L, et l'engin à sec passe la journée
// à faire le plein à la station-service (payé par son propriétaire —
// la figurine qui travaille pour elle-même ou le patron qui l'emploie —
// ou par la ville pour la flotte) : il ne produit pas ce jour-là.
// Le coût du chantier se règle au fur et à mesure, au prorata de
// l'avancement — la ville paie pour un acteur public, la figurine
// commanditaire pour un acteur privé (monde fermé : le constructeur
// encaisse, son flux du soir redistribue).
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
/** v1.29 : capacité du réservoir d'un engin de chantier (L) — chaque travail
 * ajouté à un chantier consomme 1 L (arbitrage Thibaut : « un engin peut
 * contenir 50 de carburant, et dépense 1 de carburant pour chaque
 * progression qu'il ajoute à un chantier »). */
export const CARBURANT_RESERVOIR_ENGIN = 50;

/** L'efficacité d'un engin de chantier (v1.28) : sa fiche si elle est
 * lisible (entier ≥ 1), sinon le défaut 2 — jamais d'engin muet ou négatif. */
export function efficaciteEngin(v: Vehicule): number {
  const e = v.efficacite;
  return typeof e === "number" && Number.isInteger(e) && e >= 1 ? e : PRODUCTION_ENGIN;
}

/** Le carburant du réservoir d'un engin de chantier (v1.29) : la jauge si
 * elle est lisible (entier ≥ 0, bornée au réservoir), sinon le plein — un
 * engin qui débarque n'arrive jamais à sec par accident de sauvegarde. */
export function carburantEngin(v: Vehicule): number {
  const c = v.carburant;
  return typeof c === "number" && Number.isInteger(c) && c >= 0
    ? Math.min(c, CARBURANT_RESERVOIR_ENGIN)
    : CARBURANT_RESERVOIR_ENGIN;
}

/** Un engin de chantier est APTE (v1.29) : pas sinistré, pas en atelier,
 * et — pour un privé — à quelqu'un (un engin sans propriétaire est
 * immobilisé, il ne peut ni produire ni faire le plein). */
export function enginApte(v: Vehicule): boolean {
  return (
    v.role === "chantier" &&
    v.etat !== "sinistre" &&
    v.enConstruction !== true &&
    (v.categorie === "municipal" || v.proprietairePnjId !== null)
  );
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
  /** Ids des véhicules qui ont roulé aujourd'hui (les engins de chantier
   * vivent sur leur réservoir depuis la v1.29, ils ne passent plus à la
   * pompe quotidienne — ce champ ne les concerne plus). */
  roulent: Set<string>;
  /** Acomptes du jour versés aux constructeurs (centimes). */
  chantiersPayes: number;
  /** Travaux produits aujourd'hui. */
  travauxJour: number;
  /** v1.29 : pleins des engins à sec (centimes, achetés sur place) —
   * ils rejoignent le carburant du jour dans le récap du budget. */
  essencePayee?: number;
  essenceMunicipale?: number;
  essencePrivee?: number;
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
 * Production du jour pour un chantier (v1.29) : les employés du constructeur
 * (1 travail chacun) et les engins de chantier aptes — chacun produit
 * min(efficacité, carburant du réservoir) et brûle autant de litres ; les
 * engins à sec (moins de 1 L) ne produisent rien, ils passent la journée
 * à faire le plein (etapeChantiers s'en charge).
 * Sans constructeur en ville : à la main, 1 travail/jour sans paiement.
 */
export function productionJournee(
  etat: Etat,
  chantier: Chantier,
): {
  production: number;
  employes: number;
  /** Engins qui produisent aujourd'hui, avec leurs travaux (v1.29 : la
   * consommation du réservoir suit ces travaux). */
  engins: Array<{ vehicule: Vehicule; travaux: number }>;
  /** Engins aptes mais à sec : journée de plein, pas de production (v1.29). */
  secs: Vehicule[];
  constructeur: { bat: Batiment; gerant: Pnj } | null;
} {
  const constructeur = constructeurDu(etat, chantier);
  if (constructeur === null) {
    return { production: PRODUCTION_MANOEUVRANCE, employes: 0, engins: [], secs: [], constructeur: null };
  }
  const employes = employesDuCommerce(etat, constructeur.bat.id).length;
  const aptes = (etat.vehicules ?? []).filter(enginApte);
  const engins: Array<{ vehicule: Vehicule; travaux: number }> = [];
  const secs: Vehicule[] = [];
  for (const v of aptes) {
    const carburant = carburantEngin(v);
    if (carburant < 1) secs.push(v);
    else engins.push({ vehicule: v, travaux: Math.min(efficaciteEngin(v), carburant) });
  }
  return {
    production: employes * PRODUCTION_OUVRIER + engins.reduce((somme, e) => somme + e.travaux, 0),
    employes,
    engins,
    secs,
    constructeur,
  };
}

/** Le payeur d'un chantier : « la ville » ou la figurine commanditaire. */
export function payeurDe(etat: Etat, chantier: Chantier): { nom: string; caisse: number } | null {
  if (chantier.payeurPnjId === null) return { nom: "la ville", caisse: etat.budgetVille };
  const pnj = etat.pnjs.find((p) => p.id === chantier.payeurPnjId);
  return pnj ? { nom: pnj.prenom + " " + pnj.nom, caisse: pnj.compte } : null;
}

/**
 * v1.29 : le plein des engins à sec — la journée part à la station-service,
 * payée par le propriétaire (la figurine qui travaille pour elle-même ou le
 * patron qui l'emploie) ou par la ville pour la flotte ; la pompe encaisse
 * (recette du soir, monde fermé). Tout ou rien : sans station, sans gérant
 * ou sans caisse, l'engin reste à sec — il ne produira pas davantage.
 */
function faireLePlein(etat: Etat, secs: Vehicule[], totaux: TotauxChantiers): JournalEntree[] {
  const entrees: JournalEntree[] = [];
  if (secs.length === 0) return entrees;
  const station = serviceLocal(etat, "garage");
  for (const v of secs) {
    const manque = CARBURANT_RESERVOIR_ENGIN - carburantEngin(v);
    const payeurVille = v.categorie === "municipal";
    const proprietaire = payeurVille
      ? null
      : etat.pnjs.find((p) => p.id === v.proprietairePnjId) ?? null;
    const caisse = payeurVille ? etat.budgetVille : proprietaire?.compte ?? 0;
    if (station === null || caisse < manque) {
      entrees.push({
        jour: etat.jour,
        type: "chantier",
        texte:
          v.nom + " reste à sec (" +
          (station === null
            ? "aucune station-service en ville pour faire le plein"
            : "son propriétaire n'a pas de quoi régler le plein") +
          ") — il ne produit pas sur le chantier aujourd'hui.",
      });
      continue; // tout ou rien : la pompe ne fait pas crédit
    }
    if (payeurVille) etat.budgetVille -= manque;
    else proprietaire!.compte -= manque;
    totaux.essencePayee = (totaux.essencePayee ?? 0) + manque;
    if (payeurVille) totaux.essenceMunicipale = (totaux.essenceMunicipale ?? 0) + manque;
    else totaux.essencePrivee = (totaux.essencePrivee ?? 0) + manque;
    station.gerant.compte += manque;
    totaux.encaissements.set(
      station.bat.id,
      (totaux.encaissements.get(station.bat.id) ?? 0) + manque,
    );
    v.carburant = CARBURANT_RESERVOIR_ENGIN;
    entrees.push({
      jour: etat.jour,
      type: "chantier",
      texte:
        "⛽ " + v.nom + " fait le plein à " + station.bat.nom + " (" + CARBURANT_RESERVOIR_ENGIN +
        " L réglés par " + (payeurVille ? "la ville" : proprietaire!.prenom + " " + proprietaire!.nom) +
        ") — journée à la pompe, il ne produit pas sur le chantier.",
    });
  }
  return entrees;
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
  const { production, employes, engins, secs, constructeur } = productionJournee(etat, chantier);
  // v1.29 : les engins à sec passent la journée à la station-service —
  // peu importe la suite du chantier (pause comprise), la pompe a eu leur
  // journée. Ils ne comptent pas dans la production du jour.
  if (constructeur !== null) entrees.push(...faireLePlein(etat, secs, totaux));
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
      const faitsAvant = chantier.travauxFaits;
      chantier.travauxFaits = faitsApres;
      // v1.29 : chaque travail réellement ajouté au chantier brûle 1 L du
      // réservoir de l'engin qui l'a produit — jamais plus que posé de
      // briques (un chantier livré en milieu de journée n'excite pas les
      // moteurs pour rien).
      let brulables = faitsApres - faitsAvant;
      for (const e of engins) {
        const brule = Math.min(e.travaux, brulables);
        e.vehicule.carburant = carburantEngin(e.vehicule) - brule;
        brulables -= brule;
      }
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
          ? employes + " ouvrier(s) et " + engins.length + " engin(s) de " + constructeur.bat.nom
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
