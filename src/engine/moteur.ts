// Moteur économique quotidien — cahier des charges §4.1 et §4.3.
// Pur et déterministe : aucun accès réseau, aucun stockage, pas de React.
// Ordre du règlement (§4.1) : salaires publics (impôt à la source, arbitrage
// 2026-11-06) -> fonctionnement (acheté sur place, rien sinon : monde fermé)
// -> intérêts (banque locale) -> achats -> incidents de la journée (frais
// d'hôpital, réparations du BTP local) -> redistribution du flux le soir.
// Monde 100 % fermé (2026-11-06) : aucune sortie documentée, tout reste
// dans le circuit (la seule création monétaire : les emprunts, vers la
// banque locale ; les seules pertes : le crime et l'usure non réparée).

import type {
  Batiment,
  Etat,
  JournalEntree,
  Pnj,
  Vocation,
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

/** Budget d'achat quotidien d'un PNJ (centimes). */
export function budgetAchat(pnj: Pnj): number {
  return pnj.budgetAchat;
}

interface Totaux {
  impotsPayes: number;
  salairesPayes: number;
  salairesDus: number;
  villeSansLeSou: boolean;
  fonctionnementPaye: number;
  achatsTotal: number;
  encaissements: Map<string, number>; // id bâtiment commerce -> centimes encaissés
  acheteursSansCommerce: number;
  // --- phase 2 : incidents ---
  incidentsJour: number;
  pertesVolJour: number; // historique : plus alimenté depuis le monde fermé
  volsJour: number; // butins du jour remis aux voleurs (transferts internes)
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

function etapeSalaires(etat: Etat, totaux: Totaux): void {
  for (const pnj of etat.pnjs) {
    if (pnj.statut !== "agent_public") continue;
    const du = Math.round(salaireJourL(pnj.grade ?? "") * 100);
    const paye = Math.min(du, etat.budgetVille);
    // Impôt à la source (arbitrage 2026-11-06) : la ville retient sa part
    // de la solde au moment du versement — pas de rupture d'impôt possible.
    const impot = Math.min(impotSur(paye, etat.params.tauxImpotBp), paye);
    etat.budgetVille -= paye - impot;
    pnj.compte += paye - impot;
    totaux.salairesPayes += paye;
    totaux.salairesDus += du;
    totaux.impotsPayes += impot;
  }
  totaux.villeSansLeSou = etat.budgetVille === 0;
}

function etapeFonctionnement(etat: Etat, totaux: Totaux): void {
  // Phase 3.6 — la ville achète sur place : le fonctionnement des services
  // rejoint les recettes des boutiques et repart en salaires le soir.
  // Monde 100 % fermé (2026-11-06) : sans boutique ouverte, la ville ne
  // s'équipe pas — rien n'est dépensé, rien ne quitte le circuit.
  const boutiques = boutiquesOuvertes(etat);
  totaux.fonctionnementLocal = boutiques.length > 0;
  if (boutiques.length === 0) return;
  for (const bat of etat.batiments) {
    if (bat.type !== "service_public") continue;
    const paye = Math.min(bat.coutFonctionnement, etat.budgetVille);
    etat.budgetVille -= paye;
    totaux.fonctionnementPaye += paye;
    if (paye === 0) continue;
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

/** Intérêts de la dette versés à la banque locale (phase 3) ; impayés capitalisés. */
function etapeInterets(etat: Etat, totaux: Totaux): void {
  if (etat.dette <= 0) return;
  // Monde 100 % fermé (2026-11-06) : sans banque en ville, la dette dort —
  // aucun intérêt prélevé ni capitalisé.
  const banque = serviceLocal(etat, "banque");
  if (!banque) return;
  const du = interetsDus(etat.dette);
  const paye = Math.min(du, etat.budgetVille);
  etat.budgetVille -= paye;
  banque.gerant.compte += paye; // circuit fermé : la banque locale encaisse
  // Les intérêts sont la recette du jour de la banque : ils rejoignent le
  // flux du soir (marge imposée à la source, redistribution si embauche).
  totaux.encaissements.set(
    banque.bat.id,
    (totaux.encaissements.get(banque.bat.id) ?? 0) + paye,
  );
  totaux.interetsPayes += paye;
  totaux.interetsDusTotal += du;
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
  const taux = etat.params.tauxImpotBp;
  if (etat.recettesCommerce === undefined) etat.recettesCommerce = {};
  for (const bat of etat.batiments) {
    if (bat.type !== "commerce") continue;
    const proprio = etat.pnjs.find(
      (p) => p.batimentId === bat.id && p.statut === "commercant",
    );
    if (!proprio) continue;
    const recettes = totaux.encaissements.get(bat.id) ?? 0;
    const employes = employesDuCommerce(etat, bat.id);
    if (recettes === 0 && employes.length === 0) continue;
    etat.recettesCommerce[bat.id] = recettes;

    let impotCommerce = 0; // retenue à la source du jour pour ce commerce
    const salairesDus = employes.reduce((s, p) => s + p.revenuIndicatif, 0);
    const plafond = Math.round(PART_SALARIALE_FLUX * recettes);
    let payeSalaires = 0;
    let primesPayees = 0;
    let impayes = 0;

    if (employes.length > 0) {
      // 1) Salaires contractuels : d'abord les recettes du jour, puis la réserve du patron.
      //    Impôt à la source (2026-11-06) : retenu sur chaque salaire versé.
      const disponibles = proprio.compte;
      if (disponibles >= salairesDus) {
        for (const p of employes) {
          const impot = Math.min(impotSur(p.revenuIndicatif, taux), p.revenuIndicatif);
          p.compte += p.revenuIndicatif - impot;
          etat.budgetVille += impot;
          totaux.impotsPayes += impot;
          impotCommerce += impot;
        }
        proprio.compte -= salairesDus;
        payeSalaires = salairesDus;
      } else {
        const parts = repartir(disponibles, employes.map((p) => p.revenuIndicatif));
        for (let i = 0; i < employes.length; i++) {
          const impot = Math.min(impotSur(parts[i], taux), parts[i]);
          employes[i].compte += parts[i] - impot;
          etat.budgetVille += impot;
          totaux.impotsPayes += impot;
          impotCommerce += impot;
          payeSalaires += parts[i];
        }
        proprio.compte = 0;
        impayes = salairesDus - payeSalaires;
      }
      // 2) Primes : l'excédent au-delà des salaires, jusqu'à 88 % des recettes,
      //    repart aux employés — jamais au stock. Impôt à la source idem.
      const poolPrimes = Math.max(0, plafond - salairesDus);
      if (poolPrimes > 0 && proprio.compte > 0) {
        const pool = Math.min(poolPrimes, proprio.compte);
        const parts = repartir(pool, employes.map((p) => p.revenuIndicatif));
        for (let i = 0; i < employes.length; i++) {
          const impot = Math.min(impotSur(parts[i], taux), parts[i]);
          employes[i].compte += parts[i] - impot;
          etat.budgetVille += impot;
          totaux.impotsPayes += impot;
          impotCommerce += impot;
          primesPayees += parts[i];
        }
        proprio.compte -= primesPayees;
      }
    }

    const redistribute = payeSalaires + primesPayees;
    totaux.salairesPrivesPayes += redistribute;
    const marge = recettes - redistribute;
    // 3) Impôt à la source sur le gain du patron : la marge du jour (quand il
    //    n'y a pas d'employé, toute la recette encaissée est son gain).
    const gainPatron = Math.max(0, marge);
    const impotPatron = Math.min(impotSur(gainPatron, taux), proprio.compte);
    if (impotPatron > 0) {
      proprio.compte -= impotPatron;
      etat.budgetVille += impotPatron;
      totaux.impotsPayes += impotPatron;
      impotCommerce += impotPatron;
    }
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
    if (impotCommerce > 0) {
      texte += " Le percepteur retient " + fmt(impotCommerce) + " à la source.";
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
      // Monde 100 % fermé (2026-11-06) : la remise en état est payée à
      // l'entreprise de BTP locale (recette redistribuée le soir). Sans BTP
      // en ville, pas de réparation : le bâtiment reste marqué, rien ne sort.
      const btp = serviceLocal(etat, "btp");
      const repare = btp ? Math.min(degats, etat.budgetVille) : 0;
      if (btp && repare > 0) {
        etat.budgetVille -= repare;
        btp.gerant.compte += repare;
        totaux.encaissements.set(
          btp.bat.id,
          (totaux.encaissements.get(btp.bat.id) ?? 0) + repare,
        );
      }
      totaux.degatsJour += degats;
      if (repare >= degats) {
        texte +=
          " — réparés dans la foulée par " + (btp ? btp.bat.nom : "une entreprise locale") +
          " pour " + fmt(repare) + " : l'argent reste en ville.";
        entrees.push({ jour: etat.jour, type: "incident", texte, montant: -degats });
      } else {
        bat.valeur -= degats - repare;
        bat.etat = dispo === 0 ? "sinistre" : "degrade";
        texte +=
          !btp
            ? " — aucune entreprise de BTP en ville : les dégâts resteront marqués."
            : repare > 0
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
        // Monde 100 % fermé (arbitrage 2026-11-06) : le crime ne détruit plus
        // la monnaie — le butin change de poche, il rejoint le voleur,
        // un figurant de la ville. Aucune perte, aucune disparition.
        const voleur = etat.pnjs.find((p) => p.id === inc.voleurId);
        if (!voleur) continue; // pas de voleur en ville : pas de vol
        cible.compte -= vol;
        voleur.compte += vol;
        etat.volsCumules += vol;
        totaux.volsJour += vol;
        entrees.push({
          jour: etat.jour,
          type: "incident",
          texte:
            "Cambriolage chez " + cible.prenom + " " + cible.nom + " : " +
            (dispo > 0
              ? "la patrouille arrive trop tard, le voleur s'envole avec la moitié du butin"
              : "aucune patrouille pour lui couper la route") +
            (renfort ? " — patrouille Vigipirate de la garnison en renfort, une partie du butin est récupérée" : "") +
            " — " + fmt(vol) + " passés dans la poche de " + voleur.prenom + " " + voleur.nom +
            " : le butin reste en ville (monde fermé).",
          montant: -vol,
        });
      }
    } else {
      const victime = etat.pnjs.find((p) => p.id === inc.cibleId);
      if (!victime) continue;
      const dispo = pompiers.length;
      const sante = serviceLocal(etat, "sante");
      // Monde 100 % fermé (2026-11-06) : les soins sont facturés par le
      // service de santé local (recette redistribuée le soir). Sans hôpital
      // en ville, pas de mécanique de santé — aucune facture.
      const fraisBrut = Math.round(
        fraisMedicaux(inc.gravite, dispo < inc.gravite, victime.compte) *
          coefficientRenfort(inc.gravite, armee.length),
      );
      const frais = Math.min(Math.min(fraisBrut, victime.compte), sante ? fraisBrut : 0);
      if (sante && frais > 0) {
        victime.compte -= frais;
        sante.gerant.compte += frais;
        totaux.encaissements.set(
          sante.bat.id,
          (totaux.encaissements.get(sante.bat.id) ?? 0) + frais,
        );
        totaux.fraisMedicauxJour += frais;
      }
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
          (sante
            ? " — " + fmt(frais) + " de soins facturés à " + sante.bat.nom + " : l'argent reste en ville."
            : " — aucun service de santé en ville : personne pour facturer les soins.") +
          (sante && frais === 0 ? " (la victime n'avait pas un centime)" : ""),
        montant: frais === 0 ? 0 : -frais,
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
  j.push({
    jour: etat.jour,
    type: "impots",
    texte:
      "Le percepteur prélève à la source : " +
      fmt(totaux.impotsPayes) +
      " retenus sur les gains du jour (soldes, salaires privés, marges des commerces)" +
      (totaux.impotsPayes === 0 ? " — personne n'a rien gagné aujourd'hui" : "") +
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
      : "Fournitures, énergie et entretien des services publics : aucune boutique ouverte en ville, la ville ne s'équipe pas — rien ne quitte le circuit (monde fermé).",
    montant: totaux.fonctionnementPaye,
  });
  if (totaux.achatsTotal > 0 || totaux.acheteursSansCommerce > 0) {
    const detail: string[] = [];
    for (const [batId, somme] of totaux.encaissements) {
      const bat = etat.batiments.find((b) => b.id === batId);
      // Les services à vocation (santé, BTP, banque) ne sont pas des courses :
      // leurs recettes sont racontées par les incidents et le flux du soir.
      if (bat && !bat.vocation) detail.push(bat.nom + " : " + fmt(somme));
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
    salairesPayes: 0,
    salairesDus: 0,
    villeSansLeSou: false,
    fonctionnementPaye: 0,
    achatsTotal: 0,
    encaissements: new Map(),
    acheteursSansCommerce: 0,
    incidentsJour: 0,
    pertesVolJour: 0,
    volsJour: 0,
    degatsJour: 0,
    fraisMedicauxJour: 0,
    interetsPayes: 0,
    interetsDusTotal: 0,
    interetsCapitalises: 0,
    fonctionnementLocal: false,
    salairesPrivesPayes: 0,
  };
  // Règlement quotidien (arbitrage 2026-11-06) : l'impôt n'est plus une étape
  // du matin — il est retenu à la source sur chaque gain versé dans la journée
  // (soldes publiques, salaires et primes privés, marges des patrons).
  etapeSalaires(e, totaux);
  etapeFonctionnement(e, totaux);
  etapeInterets(e, totaux);
  etapeAchats(e, totaux);
  // Les incidents arrivent dans la journée (frais d'hôpital, réparations du
  // BTP) : le règlement du soir (flux) les redistribue comme toute recette
  // du jour — monde fermé, l'argent ne fait que circuler.
  const entreesIncidents = etapeIncidents(e, totaux);
  const entreesFlux = etapeSalariesPrives(e, totaux);
  journaliserJour(e, totaux, entreesFlux, entreesIncidents);
  return e;
}

/** Monnaie totale en circulation dans le circuit (PNJ + ville) — centimes. */
export function monnaieEnCircuit(etat: Etat): number {
  let somme = etat.budgetVille;
  for (const p of etat.pnjs) somme += p.compte + p.epargne;
  return somme;
}
