// Moteur économique quotidien — cahier des charges §4.1 et §4.3.
// Pur et déterministe : aucun accès réseau, aucun stockage, pas de React.
// Ordre du règlement (§4.1) : impôts -> salaires publics -> fonctionnement -> achats.

import type {
  Batiment,
  Etat,
  JournalEntree,
  Pnj,
} from "./types.ts";
import {
  TAUX_IMPOT_DEFAUT_BP,
  salaireJourL,
} from "./referentiel.ts";

export { TAUX_IMPOT_DEFAUT_BP };

/** Nombre de magasins ouverts pour un acheteur (un commerçant n'achète pas chez lui). */
export function commercesPourAcheteur(etat: Etat, pnj: Pnj): Batiment[] {
  return etat.batiments.filter((b) => {
    if (b.type !== "commerce") return false;
    const proprio = etat.pnjs.find((p) => p.batimentId === b.id && p.statut === "commercant");
    return proprio !== undefined && proprio.id !== pnj.id;
  });
}

/** Impôt dû par un PNJ pour une journée (centimes), arrondi à l'entier. */
export function impotDu(pnj: Pnj, tauxImpotBp: number): number {
  return Math.round((pnj.revenuIndicatif * tauxImpotBp) / 10000);
}

/** Budget d'achat quotidien d'un PNJ (centimes). */
export function budgetAchat(pnj: Pnj): number {
  return pnj.budgetAchat;
}

interface Totaux {
  impotsPayes: number;
  impotsDus: number;
  ruptures: number;
  salairesPayes: number;
  salairesDus: number;
  villeSansLeSou: boolean;
  fonctionnementPaye: number;
  sortiesJour: number;
  achatsTotal: number;
  encaissements: Map<string, number>; // id bâtiment commerce -> centimes encaissés
  acheteursSansCommerce: number;
}

function etapeImpots(etat: Etat, totaux: Totaux): void {
  for (const pnj of etat.pnjs) {
    const du = impotDu(pnj, etat.params.tauxImpotBp);
    const paye = Math.min(du, pnj.compte);
    pnj.compte -= paye;
    etat.budgetVille += paye;
    totaux.impotsPayes += paye;
    totaux.impotsDus += du;
    if (paye < du) totaux.ruptures += 1;
  }
}

function etapeSalaires(etat: Etat, totaux: Totaux): void {
  for (const pnj of etat.pnjs) {
    if (pnj.statut !== "agent_public") continue;
    const du = Math.round(salaireJourL(pnj.grade ?? "") * 100);
    const paye = Math.min(du, etat.budgetVille);
    etat.budgetVille -= paye;
    pnj.compte += paye;
    totaux.salairesPayes += paye;
    totaux.salairesDus += du;
  }
  totaux.villeSansLeSou = etat.budgetVille === 0;
}

function etapeFonctionnement(etat: Etat, totaux: Totaux): void {
  for (const bat of etat.batiments) {
    if (bat.type !== "service_public") continue;
    const paye = Math.min(bat.coutFonctionnement, etat.budgetVille);
    etat.budgetVille -= paye;
    etat.sortiesCumulees += paye;
    totaux.fonctionnementPaye += paye;
    totaux.sortiesJour += paye;
  }
}

function etapeAchats(etat: Etat, totaux: Totaux): void {
  for (const pnj of etat.pnjs) {
    const boutiques = commercesPourAcheteur(etat, pnj);
    if (boutiques.length === 0) {
      if (budgetAchat(pnj) > 0) totaux.acheteursSansCommerce += 1;
      continue;
    }
    const achat = Math.min(budgetAchat(pnj), pnj.compte);
    if (achat <= 0) continue;
    pnj.compte -= achat;
    totaux.achatsTotal += achat;
    const base = Math.floor(achat / boutiques.length);
    let reste = achat - base * boutiques.length;
    for (const bat of boutiques) {
      const part = base + (reste > 0 ? 1 : 0);
      if (reste > 0) reste -= 1;
      const proprio = etat.pnjs.find(
        (p) => p.batimentId === bat.id && p.statut === "commercant",
      );
      if (proprio) proprio.compte += part;
      totaux.encaissements.set(bat.id, (totaux.encaissements.get(bat.id) ?? 0) + part);
    }
  }
}

function journaliserJour(etat: Etat, totaux: Totaux): void {
  const j: JournalEntree[] = [];
  const contrib = etat.pnjs.length;
  j.push({
    jour: etat.jour,
    type: "impots",
    texte:
      "Le percepteur fait sa tournée : " +
      contrib +
      " foyers contribuables, " +
      fmt(totaux.impotsPayes) +
      " versés à la ville" +
      (totaux.ruptures > 0
        ? " — " + totaux.ruptures + " foyer(s) à sec n'ont pu payer qu'une partie"
        : "") +
      ".",
    montant: totaux.impotsPayes,
  });
  const agents = etat.pnjs.filter((p) => p.statut === "agent_public").length;
  j.push({
    jour: etat.jour,
    type: "salaires",
    texte:
      "La ville règle ses " +
      agents +
      " agent(s) public(s) : " +
      fmt(totaux.salairesPayes) +
      (totaux.villeSansLeSou && totaux.salairesPayes < totaux.salairesDus
        ? " — les caisses étaient trop basses pour payer intégralement"
        : "") +
      ".",
    montant: totaux.salairesPayes,
  });
  j.push({
    jour: etat.jour,
    type: "fonctionnement",
    texte:
      "Fournitures, énergie et entretien des services publics : " +
      fmt(totaux.fonctionnementPaye) +
      " quittent le circuit vers les fournisseurs extérieurs.",
    montant: totaux.fonctionnementPaye,
  });
  if (totaux.achatsTotal > 0 || totaux.acheteursSansCommerce > 0) {
    const detail: string[] = [];
    for (const [batId, somme] of totaux.encaissements) {
      const bat = etat.batiments.find((b) => b.id === batId);
      if (bat) detail.push(bat.nom + " : " + fmt(somme));
    }
    j.push({
      jour: etat.jour,
      type: "achats",
      texte:
        "Les caddies roulent : " +
        fmt(totaux.achatsTotal) +
        " dépensés dans les commerces — " +
        detail.join(" ; ") +
        (totaux.acheteursSansCommerce > 0
          ? " (" +
            totaux.acheteursSansCommerce +
            " habitant(s) n'ont trouvé nulle part où dépenser)"
          : "") +
        ".",
      montant: totaux.achatsTotal,
    });
  }
  const solde = totaux.impotsPayes - totaux.salairesPayes - totaux.fonctionnementPaye;
  j.push({
    jour: etat.jour,
    type: "solde",
    texte:
      (solde >= 0 ? "Bonne journée pour les caisses : +" : "Journée déficitaire : ") +
      fmt(solde) +
      " — budget municipal : " +
      fmt(etat.budgetVille) +
      ".",
    montant: solde,
  });
  etat.journal.push(...j);
}

function fmt(centimes: number): string {
  const s = (centimes / 100).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return s + " L";
}

/** Clone profond (structuredClone est disponible en ES2022). */
export function clonerEtat(etat: Etat): Etat {
  return structuredClone(etat);
}

/**
 * Fait passer UN jour à la ville (§4.1). Retourne un NOUVEL état ;
 * l'état passé en paramètre n'est pas modifié.
 */
export function passerJour(etat: Etat): Etat {
  const e = clonerEtat(etat);
  e.jour += 1;
  const totaux: Totaux = {
    impotsPayes: 0,
    impotsDus: 0,
    ruptures: 0,
    salairesPayes: 0,
    salairesDus: 0,
    villeSansLeSou: false,
    fonctionnementPaye: 0,
    sortiesJour: 0,
    achatsTotal: 0,
    encaissements: new Map(),
    acheteursSansCommerce: 0,
  };
  etapeImpots(e, totaux);
  etapeSalaires(e, totaux);
  etapeFonctionnement(e, totaux);
  etapeAchats(e, totaux);
  journaliserJour(e, totaux);
  return e;
}

/** Monnaie totale en circulation dans le circuit (PNJ + ville) — centimes. */
export function monnaieEnCircuit(etat: Etat): number {
  let somme = etat.budgetVille;
  for (const p of etat.pnjs) somme += p.compte + p.epargne;
  return somme;
}
