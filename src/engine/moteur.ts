// Moteur économique quotidien — cahier des charges §4.1 et §4.3.
// Pur et déterministe : aucun accès réseau, aucun stockage, pas de React.
// Ordre du règlement (§4.1) : impôts -> salaires publics -> fonctionnement
// (acheté sur place si un commerce est ouvert, phase 3.6) -> intérêts ->
// achats -> redistribution du flux (salaires privés + primes, phase 3.6)
// -> incidents.

import type {
  Batiment,
  Etat,
  JournalEntree,
  Pnj,
} from "./types.ts";
import {
  COUT_EMPLOYE_PRIVE_L,
  PART_SALARIALE_FLUX,
  TAUX_EMPRUNT_PCT,
  TAUX_IMPOT_DEFAUT_BP,
  salaireJourL,
} from "./referentiel.ts";
import { gardePolice, gardePompiers, gardeArmee, tirerIncidents } from "./evenements.ts";

export { TAUX_IMPOT_DEFAUT_BP, PART_SALARIALE_FLUX, COUT_EMPLOYE_PRIVE_L };

/** Intérêts de dette dus pour une journée (centimes) — taux réel 3,54 %/an. */
export function interetsDus(dette: number): number {
  return Math.round((dette * TAUX_EMPRUNT_PCT) / 100 / 365);
}

/** Charges fixes quotidiennes de la ville (centimes) : salaires, fonctionnement, intérêts. */
export function chargesJournalieres(etat: Etat): number {
  const salaires = etat.pnjs
    .filter((p) => p.statut === "agent_public")
    .reduce((s, p) => s + Math.round(salaireJourL(p.grade ?? "") * 100), 0);
  const fonct = etat.batiments
    .filter((b) => b.type === "service_public")
    .reduce((s, b) => s + b.coutFonctionnement, 0);
  return salaires + fonct + interetsDus(etat.dette);
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
    if (b.type !== "commerce") return false;
    const proprio = etat.pnjs.find((p) => p.batimentId === b.id && p.statut === "commercant");
    return proprio !== undefined && proprio.id !== pnj.id;
  });
}

/** Commerces ouverts : un commerce n'est ouvert que s'il a son commerçant. */
export function commercesOuverts(etat: Etat): Batiment[] {
  return etat.batiments.filter(
    (b) =>
      b.type === "commerce" &&
      etat.pnjs.some((p) => p.batimentId === b.id && p.statut === "commercant"),
  );
}

/** Employés privés travaillant dans un commerce (lieu de travail renseigné). */
export function employesDuCommerce(etat: Etat, batimentId: string): Pnj[] {
  return etat.pnjs.filter(
    (p) => p.statut === "prive" && p.travailBatimentId === batimentId,
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
function repartir(montant: number, poids: number[]): number[] {
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

/** Impôt dû par un PNJ pour une journée (centimes), arrondi à l'entier. */
export function impotDu(pnj: Pnj, tauxImpotBp: number): number {
  return Math.round((pnj.revenuIndicatif * tauxImpotBp) / 10000);
}

/**
 * Renfort de la garnison (branche militaire) : sur un incident majeur (gravité 3),
 * au moins deux militaires disponibles contiennent la moitié des dégâts/frais.
 * Renvoie le multiplicateur à appliquer (1 sans renfort, 0,5 avec).
 */
export function coefficientRenfort(gravite: 1 | 2 | 3, militairesDispo: number): number {
  return gravite === 3 && militairesDispo >= 2 ? 0.5 : 1;
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
  // --- phase 3 : dette bancaire ---
  interetsPayes: number;
  interetsDusTotal: number;
  interetsCapitalises: number;
  // --- phase 3.6 : modèle flux ---
  fonctionnementLocal: boolean;
  salairesPrivesPayes: number;
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
  // Phase 3.6 — la ville achète sur place : le fonctionnement des services
  // rejoint les recettes des commerces ouverts et repart en salaires le soir.
  // Sans commerce ouvert, la ville se fournit à l'extérieur (sortie tracée).
  const boutiques = commercesOuverts(etat);
  totaux.fonctionnementLocal = boutiques.length > 0;
  for (const bat of etat.batiments) {
    if (bat.type !== "service_public") continue;
    const paye = Math.min(bat.coutFonctionnement, etat.budgetVille);
    etat.budgetVille -= paye;
    totaux.fonctionnementPaye += paye;
    if (paye === 0) continue;
    if (boutiques.length === 0) {
      etat.sortiesCumulees += paye;
      totaux.sortiesJour += paye;
    } else {
      const parts = repartir(paye, boutiques.map(() => 1));
      for (let i = 0; i < boutiques.length; i++) {
        const proprio = etat.pnjs.find(
          (p) => p.batimentId === boutiques[i].id && p.statut === "commercant",
        );
        if (proprio) proprio.compte += parts[i];
        totaux.encaissements.set(
          boutiques[i].id,
          (totaux.encaissements.get(boutiques[i].id) ?? 0) + parts[i],
        );
      }
    }
  }
}

/** Intérêts de la dette versés à la banque (phase 3) ; impayés capitalisés. */
function etapeInterets(etat: Etat, totaux: Totaux): void {
  if (etat.dette <= 0) return;
  const du = interetsDus(etat.dette);
  const paye = Math.min(du, etat.budgetVille);
  etat.budgetVille -= paye;
  etat.sortiesCumulees += paye;
  totaux.interetsPayes += paye;
  totaux.interetsDusTotal += du;
  totaux.sortiesJour += paye;
  if (paye < du) {
    etat.dette += du - paye;
    totaux.interetsCapitalises += du - paye;
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

/**
 * Modèle flux (phase 3.6) : un commerce ne thésaurise pas — il redistribue
 * ses recettes du jour. Les salaires des employés sont contractuels (payés
 * sur les recettes, puis sur le matelas du patron, prorata si les caisses
 * ne suffisent pas) ; au-delà, tout l'excédent jusqu'à 88 % des recettes
 * repart en primes proportionnelles. Seule la marge (12 %) reste au patron.
 * Un commerce sans employé, lui, garde tout : l'accumulation (stock) est
 * racontée dans le journal — c'est au joueur d'embaucher pour la corriger.
 */
function etapeSalariesPrives(etat: Etat, totaux: Totaux): JournalEntree[] {
  const entrees: JournalEntree[] = [];
  if (etat.recettesCommerce === undefined) etat.recettesCommerce = {};
  for (const bat of etat.batiments) {
    if (bat.type !== "commerce") continue;
    const proprio = etat.pnjs.find(
      (p) => p.batimentId === bat.id && p.statut === "commercant",
    );
    if (!proprio) continue;
    const recettes = totaux.encaissements.get(bat.id) ?? 0;
    etat.recettesCommerce[bat.id] = recettes;
    const employes = employesDuCommerce(etat, bat.id);
    if (recettes === 0 && employes.length === 0) continue;

    const salairesDus = employes.reduce((s, p) => s + p.revenuIndicatif, 0);
    const plafond = Math.round(PART_SALARIALE_FLUX * recettes);
    let payeSalaires = 0;
    let primesPayees = 0;
    let impayes = 0;

    if (employes.length > 0) {
      // 1) Salaires contractuels : d'abord les recettes du jour, puis la réserve du patron.
      const disponibles = proprio.compte;
      if (disponibles >= salairesDus) {
        for (const p of employes) p.compte += p.revenuIndicatif;
        proprio.compte -= salairesDus;
        payeSalaires = salairesDus;
      } else {
        const parts = repartir(disponibles, employes.map((p) => p.revenuIndicatif));
        for (let i = 0; i < employes.length; i++) {
          employes[i].compte += parts[i];
          payeSalaires += parts[i];
        }
        proprio.compte = 0;
        impayes = salairesDus - payeSalaires;
      }
      // 2) Primes : l'excédent au-delà des salaires, jusqu'à 88 % des recettes,
      //    repart aux employés — jamais au stock.
      const poolPrimes = Math.max(0, plafond - salairesDus);
      if (poolPrimes > 0 && proprio.compte > 0) {
        const parts = repartir(Math.min(poolPrimes, proprio.compte), employes.map((p) => p.revenuIndicatif));
        for (let i = 0; i < employes.length; i++) {
          employes[i].compte += parts[i];
          primesPayees += parts[i];
        }
        proprio.compte -= primesPayees;
      }
    }

    const redistribute = payeSalaires + primesPayees;
    totaux.salairesPrivesPayes += redistribute;
    const marge = recettes - redistribute;
    let texte: string;
    if (employes.length === 0) {
      texte =
        bat.nom + " encaisse " + fmt(recettes) + " : aucun salarié — " +
        proprio.prenom + " " + proprio.nom +
        " garde tout. Sans redistribution, l'argent s'accumule (stock) ; embaucher ferait tourner le flux.";
    } else {
      texte =
        bat.nom + " redistribue ses recettes du jour (" + fmt(recettes) + ") : " +
        fmt(payeSalaires) + " de salaires pour " + employes.length + " employé(s)" +
        (primesPayees > 0 ? ", " + fmt(primesPayees) + " de primes partagées" : "") +
        (impayes > 0
          ? " — alerte : " + fmt(impayes) + " de salaires impayés, la boutique est au bord de la faillite"
          : "") +
        " ; " + proprio.prenom + " " + proprio.nom + " " +
        (marge >= 0
          ? "garde sa marge : " + fmt(marge)
          : "puise dans sa réserve pour " + fmt(-marge)) +
        ".";
    }
    entrees.push({ jour: etat.jour, type: "flux", texte, montant: redistribute });
  }
  return entrees;
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
  const armee = gardeArmee(etat);

  for (const inc of tirerIncidents(etat, etat.jour)) {
    totaux.incidentsJour += 1;
    const renfort = armee.length >= 2 && inc.gravite === 3;
    if (inc.type === "incendie") {
      const bat = etat.batiments.find((b) => b.id === inc.cibleId);
      if (!bat) continue;
      const dispo = pompiers.length;
      const part = dispo >= inc.gravite ? 0.02 : dispo > 0 ? 0.08 : 0.2;
      const degats = Math.round(bat.valeur * part * inc.gravite * coefficientRenfort(inc.gravite, armee.length));
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
        fmt(degats) + " de dégâts" +
        (renfort ? " — la garnison déploie engins et bras, le sinistre est contenu" : "");
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
        const volBrut = dispo > 0 ? Math.floor(butin / 2) : butin;
        const vol = Math.round(volBrut * coefficientRenfort(inc.gravite, armee.length));
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
            (renfort ? " — patrouille Vigipirate de la garnison en renfort, une partie du butin est récupérée" : "") +
            " — " + fmt(vol) + " disparus.",
          montant: -vol,
        });
      }
    } else {
      const victime = etat.pnjs.find((p) => p.id === inc.cibleId);
      if (!victime) continue;
      const dispo = pompiers.length;
      const frais = Math.round(
        fraisMedicaux(inc.gravite, dispo < inc.gravite, victime.compte) *
          coefficientRenfort(inc.gravite, armee.length),
      );
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
          (renfort ? " — la garnison lève un poste de secours, les frais sont contenus" : "") +
          " — " + fmt(frais) + " de frais médicaux.",
        montant: -frais,
      });
    }
  }
  return entrees;
}

function journaliserJour(
  etat: Etat,
  totaux: Totaux,
  flux: JournalEntree[],
  incidents: JournalEntree[],
): void {
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
    texte: totaux.fonctionnementLocal
      ? "Fournitures, énergie et entretien des services publics : " +
        fmt(totaux.fonctionnementPaye) +
        " versés aux commerces locaux — la ville achète sur place, l'argent reste dans le circuit."
      : "Fournitures, énergie et entretien des services publics : " +
        fmt(totaux.fonctionnementPaye) +
        " quittent le circuit vers des fournisseurs extérieurs — aucun commerce ouvert pour acheter sur place.",
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
  for (const f of flux) j.push(f);
  if (totaux.interetsDusTotal > 0) {
    j.push({
      jour: etat.jour,
      type: "dette",
      texte:
        totaux.interetsCapitalises > 0
          ? "Les caisses n'ont pu honorer que " +
            fmt(totaux.interetsPayes) +
            " d'intérêts : " +
            fmt(totaux.interetsCapitalises) +
            " sont capitalisés dans la dette (encours : " +
            fmt(etat.dette) +
            ")."
          : "La banque encaisse " +
            fmt(totaux.interetsPayes) +
            " d'intérêts de la dette (encours : " +
            fmt(etat.dette) +
            ").",
      montant: -totaux.interetsPayes,
    });
  }
  const solde =
    totaux.impotsPayes - totaux.salairesPayes - totaux.fonctionnementPaye - totaux.interetsPayes;
  j.push({
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
  // Ordre du journal : économie de routine -> incidents de la journée -> solde -> alerte.
  etat.journal.push(...j.slice(0, -1));
  etat.journal.push(...incidents);
  etat.journal.push(j[j.length - 1]);
  alerteTresorerie(etat);
}

/**
 * Alerte de trésorerie (phase 3) : quand les caisses ne couvrent plus que
 * quelques jours de charges, le journal somme la ville de choisir —
 * monter l'impôt, fermer un service dans l'éditeur, ou emprunter (§8 phase 3).
 */
function alerteTresorerie(etat: Etat): void {
  const marge = joursDeMarge(etat);
  if (marge > 5) return;
  const texte =
    etat.budgetVille === 0
      ? "Les caisses sont vides ! Il faut choisir : monter le taux d'imposition (onglet Éditeur), fermer un service, ou emprunter (onglet Budget)."
      : "Trésorerie tendue : les caisses ne couvrent plus que " +
        marge +
        (marge > 1 ? " jours" : " jour") +
        " de charges. Monter le taux d'imposition, fermer un service dans l'éditeur, ou emprunter dans l'onglet Budget — il faut choisir.";
  etat.journal.push({ jour: etat.jour, type: "systeme", texte });
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
    interetsPayes: 0,
    interetsDusTotal: 0,
    interetsCapitalises: 0,
    fonctionnementLocal: false,
    salairesPrivesPayes: 0,
  };
  etapeImpots(e, totaux);
  etapeSalaires(e, totaux);
  etapeFonctionnement(e, totaux);
  etapeInterets(e, totaux);
  etapeAchats(e, totaux);
  const entreesFlux = etapeSalariesPrives(e, totaux);
  const entreesIncidents = etapeIncidents(e, totaux);
  journaliserJour(e, totaux, entreesFlux, entreesIncidents);
  return e;
}

/** Monnaie totale en circulation dans le circuit (PNJ + ville) — centimes. */
export function monnaieEnCircuit(etat: Etat): number {
  let somme = etat.budgetVille;
  for (const p of etat.pnjs) somme += p.compte + p.epargne;
  return somme;
}
