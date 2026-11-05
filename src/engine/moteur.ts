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
import { gardePolice, gardePompiers, tirerIncidents } from "./evenements.ts";

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
  // --- phase 2 : incidents ---
  incidentsJour: number;
  pertesVolJour: number;
  degatsJour: number;
  fraisMedicauxJour: number;
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

// ---------- Incidents et services (phase 2, §4.2) ----------

/** Frais médicaux d'un accident : 30 L × gravité, doublés si secours insuffisants. */
function fraisMedicaux(gravite: number, secoursJustes: boolean, plafondCompte: number): number {
  const base = gravite * 3000 * (secoursJustes ? 2 : 1);
  return Math.min(base, plafondCompte);
}

/**
 * Déroule les incidents du jour : chaque incident mobilise la garde du
 * service concerné (effectif requis = gravité), puis applique dégâts,
 * vols et frais, et raconte le tout pour le journal. Modifie e et totaux.
 */
function etapeIncidents(etat: Etat, totaux: Totaux): JournalEntree[] {
  const entrees: JournalEntree[] = [];
  const pompiers = gardePompiers(etat);
  const police = gardePolice(etat);

  for (const inc of tirerIncidents(etat, etat.jour)) {
    totaux.incidentsJour += 1;
    if (inc.type === "incendie") {
      const bat = etat.batiments.find((b) => b.id === inc.cibleId);
      if (!bat) continue;
      const dispo = pompiers.length;
      const part = dispo >= inc.gravite ? 0.02 : dispo > 0 ? 0.08 : 0.2;
      const degats = Math.round(bat.valeur * part * inc.gravite);
      const nomPompiers = dispo + (dispo > 1 ? " pompiers" : " pompier");
      let texte =
        bat.nom + " s'embrase au petit matin" +
        (dispo === 0
          ? " — aucun pompier dans la ville : les voisins forment une chaîne de seaux, mais "
          : dispo >= inc.gravite
            ? " : " +
              (dispo === 1 ? "1 pompier en vient à bout" : nomPompiers + " en viennent à bout") +
              " avant midi, "
            : " : " + nomPompiers + " contre un feu de gravité " + inc.gravite + ", les flammes ne cèdent que vers midi, ") +
        fmt(degats) + " de dégâts";
      // La ville paie la remise en état (§4.4) : sortie vers entreprises extérieures.
      const repare = Math.min(degats, etat.budgetVille);
      etat.budgetVille -= repare;
      etat.sortiesCumulees += repare;
      totaux.degatsJour += degats;
      totaux.sortiesJour += repare;
      if (dispo > 0) {
        const carburant = inc.gravite * 5000;
        const paye = Math.min(carburant, etat.budgetVille);
        etat.budgetVille -= paye;
        etat.sortiesCumulees += paye;
        totaux.sortiesJour += paye;
      }
      if (repare >= degats) {
        texte += " — réparés dans la foulée pour " + fmt(repare) + ".";
        entrees.push({ jour: etat.jour, type: "incident", texte, montant: -degats });
      } else {
        bat.valeur -= degats - repare;
        bat.etat = dispo === 0 ? "sinistre" : "degrade";
        texte +=
          repare > 0
            ? " — les caisses n'ont payé que " + fmt(repare) + ", le bâtiment reste marqué."
            : " — les caisses sont vides, le bâtiment reste marqué.";
        entrees.push({ jour: etat.jour, type: "incident", texte, montant: -degats });
      }
    } else if (inc.type === "cambriolage") {
      const cible = etat.pnjs.find((p) => p.id === inc.cibleId);
      if (!cible) continue;
      const butin = Math.min(Math.round(cible.compte * 0.15 * inc.gravite), cible.compte);
      const dispo = police.length;
      if (dispo >= inc.gravite) {
        entrees.push({
          jour: etat.jour,
          type: "incident",
          texte:
            "Un cambrioleur rôde chez " + cible.prenom + " " + cible.nom +
            " : la patrouille le surprend à temps, rien de volé.",
        });
      } else {
        const vol = dispo > 0 ? Math.floor(butin / 2) : butin;
        cible.compte -= vol;
        etat.pertesCumulees += vol;
        totaux.pertesVolJour += vol;
        entrees.push({
          jour: etat.jour,
          type: "incident",
          texte:
            "Cambriolage chez " + cible.prenom + " " + cible.nom + " : " +
            (dispo > 0
              ? "la patrouille arrive trop tard, le voleur s'envole avec la moitié du butin"
              : "aucune patrouille pour lui couper la route") +
            " — " + fmt(vol) + " disparus.",
          montant: -vol,
        });
      }
    } else {
      const victime = etat.pnjs.find((p) => p.id === inc.cibleId);
      if (!victime) continue;
      const dispo = pompiers.length;
      const frais = fraisMedicaux(inc.gravite, dispo < inc.gravite, victime.compte);
      victime.compte -= frais;
      etat.sortiesCumulees += frais;
      totaux.fraisMedicauxJour += frais;
      totaux.sortiesJour += frais;
      entrees.push({
        jour: etat.jour,
        type: "incident",
        texte:
          "Accident devant la " + (etat.batiments[0]?.nom ?? "mairie") + " : " +
          victime.prenom + " " + victime.nom +
          (dispo === 0
            ? " est raccompagné par les voisins, faute de secours"
            : dispo >= inc.gravite
              ? " est dégagé en dix minutes par les pompiers"
              : " attend les secours, l'effectif est juste") +
          " — " + fmt(frais) + " de frais médicaux.",
        montant: -frais,
      });
    }
  }
  return entrees;
}

function journaliserJour(etat: Etat, totaux: Totaux, incidents: JournalEntree[]): void {
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
  etat.journal.push(...j);
  etat.journal.push(...incidents);
  const solde = totaux.impotsPayes - totaux.salairesPayes - totaux.fonctionnementPaye;
  etat.journal.push({
    jour: etat.jour,
    type: "solde",
    texte:
      (solde >= 0 ? "Bonne journée pour les caisses : +" : "Journée déficitaire : ") +
      fmt(solde) +
      " — budget municipal : " +
      fmt(etat.budgetVille) +
      (totaux.incidentsJour > 0
        ? " (" + totaux.incidentsJour + " incident(s) dans la journée)"
        : "") +
      ".",
    montant: solde,
  });
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
    incidentsJour: 0,
    pertesVolJour: 0,
    degatsJour: 0,
    fraisMedicauxJour: 0,
  };
  etapeImpots(e, totaux);
  etapeSalaires(e, totaux);
  etapeFonctionnement(e, totaux);
  etapeAchats(e, totaux);
  const entreesIncidents = etapeIncidents(e, totaux);
  journaliserJour(e, totaux, entreesIncidents);
  return e;
}

/** Monnaie totale en circulation dans le circuit (PNJ + ville) — centimes. */
export function monnaieEnCircuit(etat: Etat): number {
  let somme = etat.budgetVille;
  for (const p of etat.pnjs) somme += p.compte + p.epargne;
  return somme;
}
