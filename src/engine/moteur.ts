// Moteur économique quotidien — cahier des charges §4.1 et §4.3.
// Pur et déterministe : aucun accès réseau, aucun stockage, pas de React.
// Ordre du règlement (§4.1) : salaires publics (impôt à la source, arbitrage
// 2026-11-06) -> frais de détention (phase 3.10 : prime de garde aux
// policiers en poste, les détenus sont gardés au commissariat)
// -> fonctionnement (acheté sur place, rien sinon : monde fermé)
// -> essence des véhicules (v1.25 : carburant acheté à la station-service,
// sans station ou sans argent le véhicule ne roule pas et son rôle dort)
// -> intérêts (banque locale) -> achats (budget effectif modulé par les
// traits, phase 3.10) -> incidents de la journée (v1.26 : tirés et
// NOTIFIÉS — le maître du jeu tranche l'issue dans l'onglet Arbitrages ;
// sans réponse sous 3 jours, la pire issue s'impose seule ; les faits —
// engins, renforts, hôpital — se rejouent sur les moyens du jour de
// l'incident)
// -> libérations et rédemptions (phase 3.10) -> redistribution du flux le soir.
// Monde 100 % fermé (2026-11-06) : aucune sortie documentée, tout reste
// dans le circuit (la seule création monétaire : les emprunts, vers la
// banque locale ; les seules pertes : le crime et l'usure non réparée).

import type {
  Arbitrage,
  Batiment,
  Etat,
  JournalEntree,
  MoyensArbitrage,
  Pnj,
  RoleVehicule,
  Vehicule,
} from "./types.ts";
import {
  CHANCE_REDEMPTION_ACTIF,
  CHANCE_REDEMPTION_SANS,
  COUT_EMPLOYE_PRIVE_L,
  FRAIS_DETENTION_L,
  PART_SALARIALE_FLUX,
  TAUX_IMPOT_DEFAUT_BP,
  gradeConnu,
  salaireJourL
} from "./referentiel.ts";
import {
  gardeArmee,
  gardePolice,
  gardePompiers,
  generateurPour,
  tirerIncidents,
} from "./evenements.ts";

import {
  interetsDus,
  joursDeMarge,
  commercesPourAcheteur,
  boutiquesOuvertes,
  serviceLocal,
  employesDuCommerce,
  repartir,
  impotSur,
  posteDePolice,
  budgetAchat
} from "./economie.ts";
import { appliquerArbitrage, creerArbitrage, idPire } from "./arbitrages.ts";
// Ré-exports de compatibilité : les 12 helpers purs vivent dans economie.ts
// (extraction du 2026-11-06), les imports existants continuent de marcher.
export {
  interetsDus,
  chargesJournalieres,
  joursDeMarge,
  commercesPourAcheteur,
  boutiquesOuvertes,
  serviceLocal,
  employesDuCommerce,
  effectifMax,
  repartir,
  impotSur,
  coefficientRenfort,
  budgetAchat
} from "./economie.ts";

export { TAUX_IMPOT_DEFAUT_BP, PART_SALARIALE_FLUX, COUT_EMPLOYE_PRIVE_L };

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
  // --- phase 3.10 : détention (prime de garde au poste) ---
  detentionPayee: number;
  // --- v1.25 : les véhicules ---
  essencePayee: number; // carburant du jour (centimes), acheté sur place
  essenceMunicipale: number;
  essencePrivee: number;
  roulent: Set<string>; // ids des véhicules qui roulent aujourd'hui
  vehiculesImmobilises: number; // sans carburant aujourd'hui
}

function etapeSalaires(etat: Etat, totaux: Totaux): JournalEntree[] {
  const secours: JournalEntree[] = [];
  for (const pnj of etat.pnjs) {
    if (pnj.statut !== "agent_public") continue;
    const grade = pnj.grade ?? "";
    const du = Math.round(salaireJourL(grade) * 100);
    const paye = Math.min(du, etat.budgetVille);
    // Impôt à la source (arbitrage 2026-11-06) : la ville retient sa part
    // de la solde au moment du versement — pas de rupture d'impôt possible.
    const impot = Math.min(impotSur(paye, etat.params.tauxImpotBp), paye);
    etat.budgetVille -= paye - impot;
    pnj.compte += paye - impot;
    totaux.salairesPayes += paye;
    totaux.salairesDus += du;
    totaux.impotsPayes += impot;
    // v1.20 : plus de salaire de secours silencieux — un grade absent du
    // référentiel (typo d'une sauvegarde, grade futur) est journalisé chaque
    // jour, jusqu'à ce que la figurine soit corrigée dans l'éditeur.
    if (!gradeConnu(grade)) {
      secours.push({
        jour: etat.jour,
        type: "salaires",
        texte:
          pnj.prenom + " " + pnj.nom + " est payé au salaire de secours (" + fmt(du) + "/jour)" +
          (grade === ""
            ? " : aucun grade n'est défini pour cette figurine."
            : " : le grade « " + grade + " » est inconnu du référentiel.") +
          " À corriger dans l'éditeur.",
        montant: du,
      });
    }
  }
  totaux.villeSansLeSou = etat.budgetVille === 0;
  return secours;
}

function etapeFonctionnement(etat: Etat, totaux: Totaux): void {
  // Frais de détention (phase 3.10, correction Thibaut 2026-11-06 : les
  // détenus sont gardés au commissariat, pas dans un bâtiment dédié) :
  // chaque détenu du jour coûte 5 L à la ville, versés en prime de garde
  // aux policiers en poste (répartie, imposée à la source comme toute
  // solde — monde fermé). Se paie même sans boutique ouverte ; sans
  // poste de police en ville ou sans policier en poste, la détention se
  // joue en assignation à résidence et rien n'est payé.
  const police = gardePolice(etat);
  const detenus = etat.pnjs.filter((p) => (p.arreteJusqua ?? 0) > etat.jour).length;
  if (detenus > 0 && police.length > 0 && posteDePolice(etat)) {
    const du = Math.round(FRAIS_DETENTION_L * 100) * detenus;
    const paye = Math.min(du, etat.budgetVille);
    const parts = repartir(paye, police.map(() => 1));
    etat.budgetVille -= paye;
    for (let i = 0; i < police.length; i++) {
      const impot = Math.min(impotSur(parts[i], etat.params.tauxImpotBp), parts[i]);
      police[i].compte += parts[i] - impot;
      etat.budgetVille += impot;
      totaux.impotsPayes += impot;
    }
    totaux.fonctionnementPaye += paye;
    totaux.detentionPayee += paye;
  }
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

/**
 * Carburant du matin (v1.25, arbitrage Thibaut 2026-11-08) : chaque véhicule
 * en état de rouler achète son essence À LA STATION-SERVICE (vocation
 * « garage » — arbitrage Thibaut : c'est elle qui gère les accidents et la
 * pompe, pas le BTP ni les boutiques ; monde fermé — l'argent rejoint les
 * recettes du soir, redistribué en salaires comme tout le flux). Municipal :
 * la ville paie ; privé : le propriétaire paie depuis son compte. Sans
 * station-service, sans argent ou véhicule sinistré : pas de carburant,
 * pas de route — le véhicule n'exerce ni son rôle ni ses capacités ce
 * jour-là (la mécanique dort).
 */
function etapeEssence(etat: Etat, totaux: Totaux): void {
  const vehicules = etat.vehicules ?? [];
  if (vehicules.length === 0) return;
  const station = serviceLocal(etat, "garage");
  for (const veh of vehicules) {
    if (veh.etat === "sinistre") continue;
    if (veh.essenceJour <= 0) {
      totaux.roulent.add(veh.id); // véhicule sans consommation : il roule toujours
      continue;
    }
    if (!station) {
      totaux.vehiculesImmobilises += 1;
      continue;
    }
    const payeurVille = veh.categorie === "municipal";
    const proprietaire = payeurVille
      ? null
      : etat.pnjs.find((p) => p.id === veh.proprietairePnjId) ?? null;
    if (!payeurVille && !proprietaire) {
      totaux.vehiculesImmobilises += 1;
      continue;
    }
    const caisse = payeurVille ? etat.budgetVille : proprietaire!.compte;
    if (caisse < veh.essenceJour) {
      totaux.vehiculesImmobilises += 1;
      continue; // tout ou rien : la pompe ne fait pas crédit
    }
    if (payeurVille) etat.budgetVille -= veh.essenceJour;
    else proprietaire!.compte -= veh.essenceJour;
    totaux.essencePayee += veh.essenceJour;
    if (payeurVille) totaux.essenceMunicipale += veh.essenceJour;
    else totaux.essencePrivee += veh.essenceJour;
    station.gerant.compte += veh.essenceJour;
    totaux.encaissements.set(
      station.bat.id,
      (totaux.encaissements.get(station.bat.id) ?? 0) + veh.essenceJour,
    );
    totaux.roulent.add(veh.id);
  }
}

/**
 * L'engin municipal en service pour un rôle donné (v1.25) : non sinistré et
 * roulé aujourd'hui (carburant acheté). Sans lui — pas de camion, pas de
 * fourgon, pas d'ambulance — l'effet du rôle dort ce jour-là.
 */
function enginDeService(etat: Etat, totaux: Totaux, role: RoleVehicule): Vehicule | undefined {
  return (etat.vehicules ?? []).find(
    (v) =>
      v.categorie === "municipal" &&
      v.role === role &&
      v.etat !== "sinistre" &&
      totaux.roulent.has(v.id),
  );
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

/**
 * Rédemption (phase 3.10, arbitrage Thibaut 2026-11-06) : remplace le
 * premier trait criminel de la figurine (cupide, puis opportuniste, puis
 * téméraire) par « honnête ». Retourne le trait effacé, null s'il n'y
 * avait rien à racheter. Le casier reste : la récidive reste possible.
 */
export function racheter(pnj: Pnj): string | null {
  const traits = pnj.personnalite ?? [];
  for (const criminel of ["cupide", "opportuniste", "téméraire"]) {
    const i = traits.indexOf(criminel);
    if (i >= 0) {
      pnj.personnalite = traits.map((t, j) => (j === i ? "honnête" : t));
      return criminel;
    }
  }
  return null;
}

/**
 * Notifie les incidents du jour (v1.26, arbitrage Thibaut 2026-11-08) : la
 * simulation tire les incidents — probabilités du référentiel inchangées —
 * mais ne tranche PLUS l'issue. Chaque incident devient un arbitrage en
 * attente : le maître du jeu choisit l'issue dans l'onglet Arbitrages, le
 * jeu applique les L de l'issue choisie. Sans réponse au bout de
 * DELAI_ARBITRAGE_JOURS jours, la pire issue s'impose d'elle-même
 * (passage d'expiration du règlement quotidien).
 */
function etapeIncidents(etat: Etat, totaux: Totaux): JournalEntree[] {
  const entrees: JournalEntree[] = [];
  // Libérations du jour (phase 3.10) : à sa sortie, un détenu peut se
  // racheter — et la qualité du service dépend de l'effectif du
  // commissariat (correction Thibaut 2026-11-06 : les détenus sont gardés
  // au poste, pas dans un bâtiment dédié). Police au moins aussi nombreuse
  // que les détenus du jour : 50 % ; commissariat débordé : 10 %.
  const police = gardePolice(etat);
  const detenusCeJour = etat.pnjs.filter((p) => (p.arreteJusqua ?? 0) >= etat.jour).length;
  const serviceActif = police.length >= detenusCeJour;
  const chance = serviceActif ? CHANCE_REDEMPTION_ACTIF : CHANCE_REDEMPTION_SANS;
  const aleaSortie = generateurPour(etat.jour * 11 + 7);
  for (const libere of etat.pnjs.filter(
    (p) => (p.arreteJusqua ?? 0) === etat.jour && (p.casier ?? 0) > 0,
  )) {
    if (aleaSortie() >= chance) continue;
    const traitPerdu = racheter(libere);
    if (traitPerdu === null) continue;
    entrees.push({
      jour: etat.jour,
      type: "incident",
      texte:
        libere.prenom + " " + libere.nom + " sort de détention et se rachète : le trait « " +
        traitPerdu + " » s'efface, remplacé par « honnête » — " +
        (serviceActif
          ? "le commissariat, en effectif suffisant, a fait son œuvre (le casier reste : " + (libere.casier ?? 0) + " fait(s))."
          : "même d'un commissariat débordé, contre toute attente."),
    });
  }
  const pompiers = gardePompiers(etat);
  const armee = gardeArmee(etat);

  // Photographie des moyens de la ville au moment des incidents (v1.26) :
  // la résolution — éventuellement des jours plus tard — rejoue l'issue
  // avec les moyens du jour de l'incident, jamais ceux du jour de la
  // résolution. Les engins ne comptent que s'ils ont roulé ce jour-là.
  const moyens: MoyensArbitrage = {
    pompiers: pompiers.length,
    police: police.length,
    armee: armee.length,
    camionPompiers: enginDeService(etat, totaux, "pompiers") !== undefined,
    fourgonPolice: enginDeService(etat, totaux, "police") !== undefined,
    camionProprete: enginDeService(etat, totaux, "proprete") !== undefined,
    ambulance: enginDeService(etat, totaux, "sante") !== undefined,
    btpBatimentId: serviceLocal(etat, "btp")?.bat.id ?? null,
    santeBatimentId: serviceLocal(etat, "sante")?.bat.id ?? null,
    stationBatimentId: serviceLocal(etat, "garage")?.bat.id ?? null,
    commissariat: posteDePolice(etat) !== undefined,
  };
  // La file des arbitrages en attente : les incidents notifiés attendent
  // le maître du jeu — la partie continue, rien ne se joue tout seul.
  const file = (etat.arbitrages ??= []);
  for (const inc of tirerIncidents(etat, etat.jour)) {
    totaux.incidentsJour += 1;
    const arb = creerArbitrage(etat, inc, moyens, file.length);
    if (!arb) continue; // cible ou auteur disparu : rien à arbitrer
    file.push(arb);
    entrees.push({
      jour: etat.jour,
      type: "arbitrage",
      texte:
        "⚠️ " + arb.titre + " (gravité " + arb.gravite + ") — le maître du jeu tranche (onglet Arbitrages) ; sans réponse, la pire issue s'imposera le jour " +
        arb.expireLe + ".",
    });
  }
  return entrees;
}

function journaliserJour(
  etat: Etat,
  totaux: Totaux,
  flux: JournalEntree[],
  incidents: JournalEntree[],
  secours: JournalEntree[],
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
  // v1.20 : salaires de secours journalisés à la suite du résumé des soldes.
  j.push(...secours);
  j.push({
    jour: etat.jour,
    type: "fonctionnement",
    texte: totaux.fonctionnementLocal
      ? "Fournitures, énergie et entretien des services publics : " +
        fmt(totaux.fonctionnementPaye - totaux.detentionPayee) +
        " versés aux commerces locaux" +
        (totaux.detentionPayee > 0
          ? " et " + fmt(totaux.detentionPayee) + " de primes de garde versées aux policiers en poste (frais de détention)"
          : "") +
        " — la ville achète sur place, l'argent reste dans le circuit."
      : totaux.detentionPayee > 0
        ? "Aucune boutique ouverte : la ville ne s'équipe pas, mais les policiers de garde encaissent " +
          fmt(totaux.detentionPayee) +
          " de primes de détention — l'argent reste dans le circuit (monde fermé)."
        : "Fournitures, énergie et entretien des services publics : aucune boutique ouverte en ville, la ville ne s'équipe pas — rien ne quitte le circuit (monde fermé).",
    montant: totaux.fonctionnementPaye,
  });
  // v1.25 : le carburant du jour — acheté à la station-service (vocation
  // « garage », arbitrage Thibaut 2026-11-08 : c'est elle qui gère les
  // accidents, pas le BTP).
  if (totaux.essencePayee > 0 || totaux.vehiculesImmobilises > 0) {
    const station = serviceLocal(etat, "garage");
    const flotte = totaux.essenceMunicipale > 0 ? " (flotte municipale : " + fmt(totaux.essenceMunicipale) + (totaux.essencePrivee > 0 ? ", privés : " + fmt(totaux.essencePrivee) : "") + ")" : totaux.essencePrivee > 0 ? " (véhicules privés)" : "";
    j.push({
      jour: etat.jour,
      type: "essence",
      texte: totaux.essencePayee > 0
        ? "Les moteurs tournent : " + fmt(totaux.essencePayee) +
          " de carburant achetés à " + (station ? station.bat.nom : "la station-service") + flotte +
          (totaux.vehiculesImmobilises > 0
            ? " — " + totaux.vehiculesImmobilises + " véhicule(s) faute de carburant restent au garage"
            : "") +
          "."
        : totaux.vehiculesImmobilises > 0
          ? totaux.vehiculesImmobilises +
            " véhicule(s) faute de carburant (aucune station-service en ville, caisses vides) : ils restent au garage — leurs rôles dorment ce jour (monde fermé)."
          : "Rien à signaler côté pompe.",
      montant: totaux.essencePayee,
    });
  }
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
      ((etat.arbitrages?.length ?? 0) > 0
        ? " — " + (etat.arbitrages?.length ?? 0) + " arbitrage(s) attendent le maître du jeu (onglet Arbitrages)"
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
    detentionPayee: 0,
    essencePayee: 0,
    essenceMunicipale: 0,
    essencePrivee: 0,
    roulent: new Set(),
    vehiculesImmobilises: 0,
  };
  // Règlement quotidien (arbitrage 2026-11-06) : l'impôt n'est plus une étape
  // du matin — il est retenu à la source sur chaque gain versé dans la journée
  // (soldes publiques, salaires et primes privés, marges des patrons).
  const entreesSecours = etapeSalaires(e, totaux);
  etapeFonctionnement(e, totaux);
  etapeEssence(e, totaux);
  etapeInterets(e, totaux);
  etapeAchats(e, totaux);
  // Les incidents arrivent dans la journée (frais d'hôpital, réparations)
  // et sont NOTIFIÉS (v1.26) : le maître du jeu tranche l'issue dans
  // l'onglet Arbitrages, le règlement du soir (flux) redistribue les
  // recettes des issues résolues comme tout flux du jour — monde fermé.
  e.arbitrages ??= [];
  const entreesIncidents = etapeIncidents(e, totaux);
  // Expiration des arbitrages (v1.26) : sans réponse du maître du jeu au
  // bout du délai, la pire issue s'impose — les affaires traînées se
  // soldent au pire, les paiements rejoignent les recettes du soir.
  const expirations: JournalEntree[] = [];
  const restants: Arbitrage[] = [];
  for (const arb of e.arbitrages ?? []) {
    // Hostile-proof : une entrée tordue de la file (import édité à la main)
    // est classée sans suite — elle quitte la file sans rien casser.
    if (arb === null || typeof arb !== "object") continue;
    if (arb.expireLe > e.jour) {
      restants.push(arb);
      continue;
    }
    const pire = idPire(arb);
    if (pire === undefined) continue; // plus d'issue possible : classée sans suite
    for (const r of appliquerArbitrage(e, arb, pire, totaux)) {
      expirations.push(
        r.type === "incident"
          ? { ...r, texte: "Sans arbitrage du maître du jeu, le pire est arrivé : " + r.texte }
          : r,
      );
    }
  }
  e.arbitrages = restants;
  const entreesFlux = etapeSalariesPrives(e, totaux);
  journaliserJour(e, totaux, entreesFlux, [...entreesIncidents, ...expirations], entreesSecours);
  return e;
}

/** Monnaie totale en circulation dans le circuit (PNJ + ville) — centimes. */
export function monnaieEnCircuit(etat: Etat): number {
  let somme = etat.budgetVille;
  for (const p of etat.pnjs) somme += p.compte + p.epargne;
  return somme;
}
