// Arbitrages du maître du jeu (v1.26, arbitrage Thibaut 2026-11-08) : les
// incidents surviennent — probabilités du référentiel inchangées — et sont
// notifiés, mais la simulation ne tranche PLUS l'issue : elle photographie
// les moyens de la ville au moment de l'incident, propose les issues
// possibles au joueur, et applique les L de l'issue choisie. Un incident
// non arbitré ne bloque pas la partie : il reste en file d'attente et,
// au bout de DELAI_ARBITRAGE_JOURS jours, la pire issue s'impose seule.
// Pur et déterministe : les faits (camion de pompiers, renfort de la
// garnison, ambulance, camion de propreté) se rejouent sur la photographie
// des moyens du jour de l'incident, jamais sur la ville du jour de la
// résolution — la ville peut avoir changé, l'incident reste celui qu'il
// était.

import type {
  Arbitrage,
  Batiment,
  Etat,
  JournalEntree,
  MoyensArbitrage,
  Pnj,
  PropositionArbitrage,
} from "./types.ts";
import type { Incident } from "./evenements.ts";
import { PART_DEGATS_COLLISION } from "./referentiel.ts";
import {
  forceCriminelle,
  gangDe,
  generateurPour,
  quartierAdjacent,
} from "./evenements.ts";
import { coefficientRenfort, fraisMedicaux, posteDePolice } from "./economie.ts";

/** Jours de sursis avant que la pire issue s'impose seule (arbitrage Thibaut : 3 jours). */
export const DELAI_ARBITRAGE_JOURS = 3;

/**
 * Extrait structurel des totaux du jour du moteur : quand la résolution
 * tombe PENDANT le règlement (expiration du délai), les paiements rejoignent
 * les recettes du soir ; quand le joueur tranche entre deux jours, les L
 * sont crédités directement — le monde reste fermé dans les deux cas.
 */
export interface TotauxArbitrage {
  encaissements: Map<string, number>;
  volsJour: number;
  degatsJour: number;
  fraisMedicauxJour: number;
}

function fmt(centimes: number): string {
  const s = (centimes / 100).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return s + " L";
}

function prop(id: string, libelle: string, attendu: boolean, pire: boolean): PropositionArbitrage {
  return { id, libelle, attendu, pire };
}

/** Service tenu au moment de la résolution, résolu depuis la photographie du jour de l'incident. */
function serviceTenu(etat: Etat, batimentId: string | null): { bat: Batiment; gerant: Pnj } | null {
  if (!batimentId) return null;
  const bat = etat.batiments.find((b) => b.id === batimentId);
  if (!bat) return null;
  const gerant = etat.pnjs.find((p) => p.batimentId === bat.id && p.statut === "commercant");
  return gerant ? { bat, gerant } : null;
}

function etiquette(etat: Etat, x: Pnj): string {
  const g = gangDe(etat, x);
  return x.prenom + " " + x.nom + (g ? " (" + g.nom + ")" : " (indépendant)");
}

/** Nom actuel de l'engin municipal d'un rôle (pour le récit) — la photographie dit s'il agit. */
function nomEngin(etat: Etat, role: "pompiers" | "police" | "proprete" | "sante", defaut: string): string {
  const v = (etat.vehicules ?? []).find(
    (x) => x.categorie === "municipal" && x.role === role,
  );
  return v?.nom ?? defaut;
}

// ---------- Propositions par type d'incident ----------

/** Incendie : la part de la valeur partie en fumée dépend de l'issue choisie. */
function propositionsIncendie(m: MoyensArbitrage, gravite: 1 | 2 | 3): PropositionArbitrage[] {
  const LIBELLES: Record<string, string> = {
    maitrise: "Le feu est maîtrisé avant midi : 2 % de la valeur × gravité en dégâts",
    deborde: "Les flammes ne cèdent que vers midi : 8 % de la valeur × gravité en dégâts",
    ravageur: "Le feu ravage le bâtiment : 20 % de la valeur × gravité en dégâts",
  };
  const offerts =
    m.pompiers >= gravite ? ["maitrise", "deborde"] : m.pompiers > 0 ? ["deborde", "ravageur"] : ["ravageur"];
  const attendu = m.pompiers >= gravite ? "maitrise" : m.pompiers > 0 ? "deborde" : "ravageur";
  const pire = offerts[offerts.length - 1];
  return offerts.map((id) => prop(id, LIBELLES[id], id === attendu, id === pire));
}

/** Cambriolage : déjoué (police en nombre ET fourgon en service), fuite (moitié), butin (tout). */
function propositionsCambriolage(m: MoyensArbitrage, gravite: 1 | 2 | 3): PropositionArbitrage[] {
  const LIBELLES: Record<string, string> = {
    dejoue: "La patrouille surprend le cambrioleur sur le fait : rien de volé, arrestation",
    fuite: "Le voleur s'envole avec la moitié du butin",
    butin: "Le voleur s'envole avec tout le butin",
  };
  const conditions = m.police >= gravite && m.fourgonPolice;
  const offerts = conditions ? ["dejoue", "fuite", "butin"] : m.police > 0 ? ["fuite", "butin"] : ["butin"];
  const attendu = conditions ? "dejoue" : m.police > 0 ? "fuite" : "butin";
  return offerts.map((id) => prop(id, LIBELLES[id], id === attendu, id === "butin"));
}

/** Guerre de gangs : l'issue attendue est celle que le PRNG du jour aurait jouée ; la pire, le favori. */
function propositionsGuerre(
  etat: Etat,
  jour: number,
  agresseur: Pnj,
  defenseur: Pnj,
): PropositionArbitrage[] {
  const alea = generateurPour(jour * 7 + 13); // même flux dédié que l'ancien moteur
  const forceA = forceCriminelle(etat, agresseur);
  const forceD = forceCriminelle(etat, defenseur);
  const attendu = alea() * (forceA + forceD) < forceA ? "agresseur" : "defenseur";
  const favori = forceA >= forceD ? "agresseur" : "defenseur";
  return [
    prop(
      "agresseur",
      etiquette(etat, agresseur) + " remporte l'affrontement et pille le perdant",
      attendu === "agresseur",
      favori === "agresseur",
    ),
    prop(
      "defenseur",
      etiquette(etat, defenseur) + " tient bon et renvoie l'assaillant",
      attendu === "defenseur",
      favori === "defenseur",
    ),
  ];
}

/** Collision : réparée à la station-service si les caisses couvrent, sinon sinistrée. */
function propositionsCollision(
  etat: Etat,
  m: MoyensArbitrage,
  gravite: 1 | 2 | 3,
  vehId: string,
): PropositionArbitrage[] {
  const veh = (etat.vehicules ?? []).find((v) => v.id === vehId);
  if (!veh) return [];
  const degatsEstimes = Math.round(
    veh.valeur * PART_DEGATS_COLLISION * gravite * (m.camionProprete ? 1 : 2),
  );
  const payeurVille = veh.categorie === "municipal";
  const proprio = payeurVille
    ? null
    : etat.pnjs.find((p) => p.id === veh.proprietairePnjId) ?? null;
  const caisse = payeurVille ? etat.budgetVille : proprio?.compte ?? 0;
  const libelleRepare =
    "Réparé dans la foulée à la station-service : " + fmt(degatsEstimes) +
    (payeurVille ? " sur le budget de la ville" : " aux frais du propriétaire");
  const LIBELLES: Record<string, string> = {
    repare: libelleRepare,
    sinistre: "Bon pour la casse : le véhicule reste sinistré sur le bas-côté",
  };
  const offerts = m.stationBatimentId ? ["repare", "sinistre"] : ["sinistre"];
  const attendu = m.stationBatimentId && caisse >= degatsEstimes ? "repare" : "sinistre";
  return offerts.map((id) => prop(id, LIBELLES[id], id === attendu, id === "sinistre"));
}

/** Vol de voiture : déjoué (police en nombre ET fourgon), sinon transfert de propriété. */
function propositionsVolVehicule(m: MoyensArbitrage, gravite: 1 | 2 | 3): PropositionArbitrage[] {
  const LIBELLES: Record<string, string> = {
    dejoue: "La patrouille, fourgon en tête, ceinture le voleur sur le fait",
    vole: "Transfert de propriété : le voleur roule désormais dans la voiture",
  };
  const conditions = m.police >= gravite && m.fourgonPolice;
  const offerts = conditions ? ["dejoue", "vole"] : ["vole"];
  const attendu = conditions ? "dejoue" : "vole";
  return offerts.map((id) => prop(id, LIBELLES[id], id === attendu, id === "vole"));
}

/** Accident : soins standards ou aggravés (frais doublés) ; sans hôpital, personne pour facturer. */
function propositionsAccident(m: MoyensArbitrage, gravite: 1 | 2 | 3): PropositionArbitrage[] {
  if (!m.santeBatimentId) {
    return [prop("aucun", "Aucun service de santé en ville : personne pour facturer les soins", true, true)];
  }
  const LIBELLES: Record<string, string> = {
    contenu: "Secours efficaces : soins standards facturés à l'hôpital",
    aggrave: "Secours dépassés : le blessé s'aggrave, les frais doublent",
  };
  const attendu = m.pompiers >= gravite && m.ambulance ? "contenu" : "aggrave";
  return ["contenu", "aggrave"].map((id) => prop(id, LIBELLES[id], id === attendu, id === "aggrave"));
}

// ---------- Création ----------

/**
 * Crée l'arbitrage d'un incident tiré : titre, photographie des moyens,
 * propositions offertes (issue attendue suggérée, pire issue marquée).
 * Retourne null si la cible ou l'auteur a disparu (rien à arbitrer).
 */
export function creerArbitrage(
  etat: Etat,
  inc: Incident,
  moyens: MoyensArbitrage,
  index: number,
): Arbitrage | null {
  const jour = etat.jour;
  const g = inc.gravite;
  let titre = "";
  let propositions: PropositionArbitrage[] = [];
  let cibleBatimentId: string | null = null;
  let ciblePnjId: string | null = null;
  let cibleVehiculeId: string | null = null;
  let voleurPnjId: string | null = null;
  let agresseurPnjId: string | null = null;
  let defenseurPnjId: string | null = null;
  if (inc.type === "incendie") {
    const bat = etat.batiments.find((b) => b.id === inc.cibleId);
    if (!bat) return null;
    titre = "Incendie — " + bat.nom;
    propositions = propositionsIncendie(moyens, g);
    cibleBatimentId = bat.id;
  } else if (inc.type === "cambriolage") {
    const cible = etat.pnjs.find((p) => p.id === inc.cibleId);
    const voleur = etat.pnjs.find((p) => p.id === inc.voleurId);
    if (!cible || !voleur) return null;
    titre = "Cambriolage — chez " + cible.prenom + " " + cible.nom;
    propositions = propositionsCambriolage(moyens, g);
    ciblePnjId = cible.id;
    voleurPnjId = voleur.id;
  } else if (inc.type === "guerre_gangs") {
    const agresseur = etat.pnjs.find((p) => p.id === inc.agresseurId);
    const defenseur = etat.pnjs.find((p) => p.id === inc.defenseurId);
    if (!agresseur || !defenseur) return null;
    titre =
      "Guerre de gangs — " + agresseur.prenom + " " + agresseur.nom +
      " attaque " + defenseur.prenom + " " + defenseur.nom;
    propositions = propositionsGuerre(etat, jour, agresseur, defenseur);
    ciblePnjId = defenseur.id;
    agresseurPnjId = agresseur.id;
    defenseurPnjId = defenseur.id;
  } else if (inc.type === "collision") {
    const veh = (etat.vehicules ?? []).find((v) => v.id === inc.cibleId);
    if (!veh) return null;
    titre = "Collision — " + veh.nom;
    propositions = propositionsCollision(etat, moyens, g, veh.id);
    cibleVehiculeId = veh.id;
  } else if (inc.type === "vol_vehicule") {
    const veh = (etat.vehicules ?? []).find((v) => v.id === inc.cibleId);
    const voleur = etat.pnjs.find((p) => p.id === inc.voleurId);
    if (!veh || !voleur) return null;
    titre = "Vol de voiture — " + veh.nom;
    propositions = propositionsVolVehicule(moyens, g);
    cibleVehiculeId = veh.id;
    voleurPnjId = voleur.id;
  } else {
    const victime = etat.pnjs.find((p) => p.id === inc.cibleId);
    if (!victime) return null;
    titre = "Accident — " + victime.prenom + " " + victime.nom;
    propositions = propositionsAccident(moyens, g);
    ciblePnjId = victime.id;
  }
  return {
    id: "arb-j" + jour + "-" + index,
    jour,
    expireLe: jour + DELAI_ARBITRAGE_JOURS,
    type: inc.type,
    titre,
    gravite: g,
    cibleBatimentId,
    ciblePnjId,
    cibleVehiculeId,
    voleurPnjId,
    agresseurPnjId,
    defenseurPnjId,
    moyens,
    propositions,
  };
}

/** L'id de la pire issue proposée (celle qui s'impose à l'expiration) — hostile-proof. */
export function idPire(arbitrage: Arbitrage): string | undefined {
  const props = Array.isArray(arbitrage.propositions) ? arbitrage.propositions : [];
  return props.find((p) => p.pire)?.id ?? props[0]?.id;
}

// ---------- Résolution ----------

/**
 * Applique l'issue choisie d'un incident : les L bougent (réparations,
 * butins, soins — monde fermé), le récit reprend les formulations du
 * journal d'incident. `totaux` est fourni quand la résolution tombe
 * pendant le règlement du jour (expiration du délai) : les paiements
 * rejoignent alors les recettes du soir ; sans `totaux` (le maître du
 * jeu tranche entre deux jours), les L sont crédités directement.
 * Ne retire PAS l'arbitrage de la file — les appelants s'en chargent.
 */
export function appliquerArbitrage(
  etat: Etat,
  arbitrage: Arbitrage,
  propositionId: string,
  totaux?: TotauxArbitrage,
): JournalEntree[] {
  // Hostile-proof : une file d'attente tordue (import édité à la main)
  // n'a pas de propositions lisibles — l'affaire est classée, jamais crashée.
  const propositions = Array.isArray(arbitrage.propositions) ? arbitrage.propositions : [];
  const choix =
    propositions.find((p) => p.id === propositionId) ??
    propositions.find((p) => p.pire);
  if (
    choix === undefined ||
    arbitrage.moyens === null ||
    typeof arbitrage.moyens !== "object"
  ) {
    return [
      {
        jour: etat.jour,
        type: "arbitrage",
        texte:
          "Affaire classée : « " + arbitrage.titre + " » n'a plus d'issue possible — la ville a changé sous ses pieds.",
      },
    ];
  }
  const m = arbitrage.moyens;
  const g = arbitrage.gravite;
  const j = etat.jour;
  const renfort = m.armee >= 2 && g === 3;
  const entrees: JournalEntree[] = [];

  const perime = (quoi: string): JournalEntree[] => [
    {
      jour: j,
      type: "arbitrage",
      texte:
        "Affaire classée : « " + arbitrage.titre + " » — " + quoi +
        " ; la ville a changé depuis, l'incident ne concerne plus personne.",
    },
  ];
  const encaisser = (batId: string, somme: number): void => {
    if (!totaux) return;
    totaux.encaissements.set(batId, (totaux.encaissements.get(batId) ?? 0) + somme);
  };

  // ----- Incendie -----
  if (arbitrage.type === "incendie") {
    const bat = etat.batiments.find((b) => b.id === arbitrage.cibleBatimentId);
    if (!bat) return perime("le bâtiment n'est plus là");
    const part = choix.id === "maitrise" ? 0.02 : choix.id === "deborde" ? 0.08 : 0.2;
    const dispo = m.pompiers;
    const camion = m.camionPompiers ? nomEngin(etat, "pompiers", "le camion de pompiers") : null;
    const degats = Math.round(
      bat.valeur * part * g * coefficientRenfort(g, m.armee) * (m.camionPompiers ? 0.5 : 1),
    );
    const nomPompiers = dispo + (dispo > 1 ? " pompiers" : " pompier");
    const corps =
      choix.id === "maitrise"
        ? " : " + (dispo === 1 ? "1 pompier en vient à bout" : nomPompiers + " en viennent à bout") + " avant midi, "
        : choix.id === "deborde"
          ? " : " + nomPompiers + " contre un feu de gravité " + g + ", les flammes ne cèdent que vers midi, "
          : dispo === 0
            ? " — aucun pompier dans la ville : les voisins forment une chaîne de seaux, mais "
            : " : " + nomPompiers + " ne peuvent rien contre le feu qui ravage le bâtiment, ";
    let texte =
      bat.nom + " s'embrase au petit matin" + corps + fmt(degats) + " de dégâts" +
      (renfort ? " — la garnison déploie engins et bras, le sinistre est contenu" : "") +
      (camion ? " — " + camion + " déverse ses lances : la moitié des dégâts est évitée" : "");
    // Monde 100 % fermé : la remise en état est payée au BTP local (recette
    // redistribuée le soir). Sans BTP, pas de réparation : le bâtiment
    // reste marqué, rien ne sort.
    const btp = serviceTenu(etat, m.btpBatimentId);
    const repare = btp ? Math.min(degats, etat.budgetVille) : 0;
    if (btp && repare > 0) {
      etat.budgetVille -= repare;
      btp.gerant.compte += repare;
      encaisser(btp.bat.id, repare);
    }
    if (totaux) totaux.degatsJour += degats;
    if (repare >= degats) {
      texte +=
        " — réparés dans la foulée par " + (btp ? btp.bat.nom : "une entreprise locale") +
        " pour " + fmt(repare) + " : l'argent reste en ville.";
      entrees.push({ jour: j, type: "incident", texte, montant: -degats });
    } else {
      bat.valeur -= degats - repare;
      bat.etat = dispo === 0 ? "sinistre" : "degrade";
      texte += !btp
        ? " — aucune entreprise de BTP en ville : les dégâts resteront marqués."
        : repare > 0
          ? " — les caisses n'ont payé que " + fmt(repare) + ", le bâtiment reste marqué."
          : " — les caisses sont vides, le bâtiment reste marqué.";
      entrees.push({ jour: j, type: "incident", texte, montant: -degats });
    }

  // ----- Cambriolage -----
  } else if (arbitrage.type === "cambriolage") {
    const cible = etat.pnjs.find((p) => p.id === arbitrage.ciblePnjId);
    const voleur = etat.pnjs.find((p) => p.id === arbitrage.voleurPnjId);
    if (!cible || !voleur) return perime("le voleur ou la cible a quitté la ville");
    const gangVoleur = gangDe(etat, voleur);
    const signature = gangVoleur ? " — signé " + gangVoleur.nom : "";
    const dispo = m.police;
    if (choix.id === "dejoue") {
      // Rien de volé — le malfaiteur est arrêté sur le fait : le casier se
      // remplit, la détention au commissariat le neutralise quelques jours.
      voleur.casier = (voleur.casier ?? 0) + 1;
      const duree = 3 * g;
      voleur.arreteJusqua = j + duree;
      const commissariat = m.commissariat ? posteDePolice(etat) : undefined;
      entrees.push({
        jour: j,
        type: "incident",
        texte:
          "Un cambrioleur rôde chez " + cible.prenom + " " + cible.nom +
          " : la patrouille le surprend à temps, rien de volé — " +
          voleur.prenom + " " + voleur.nom + " est arrêté sur le fait" + signature +
          ", " + duree + " jour" + (duree > 1 ? "s" : "") +
          (commissariat ? " au " + commissariat.nom : " d'assignation à résidence") + ".",
      });
    } else {
      // Monde 100 % fermé : le crime ne détruit pas la monnaie — le butin
      // change de poche. Le casier se remplit même quand la police
      // arrive trop tard (la récidive pèsera sur les tirages futurs).
      const butin = Math.min(Math.round(cible.compte * 0.15 * g), cible.compte);
      const volBrut = choix.id === "fuite" ? Math.floor(butin / 2) : butin;
      const vol = Math.round(volBrut * coefficientRenfort(g, m.armee));
      cible.compte -= vol;
      voleur.compte += vol;
      etat.volsCumules += vol;
      if (totaux) totaux.volsJour += vol;
      voleur.casier = (voleur.casier ?? 0) + 1;
      entrees.push({
        jour: j,
        type: "incident",
        texte:
          "Cambriolage chez " + cible.prenom + " " + cible.nom + " : " +
          (choix.id === "fuite"
            ? dispo >= g
              ? m.fourgonPolice
                ? "la patrouille le voit filer sans pouvoir l'intercepter : le voleur s'envole avec la moitié du butin"
                : "la patrouille le voit filer — sans fourgon en service, impossible de l'intercepter : le voleur s'envole avec la moitié du butin"
              : "la patrouille arrive trop tard, le voleur s'envole avec la moitié du butin"
            : dispo > 0
              ? "la patrouille arrive trop tard, le voleur s'envole avec tout le butin"
              : "aucune patrouille pour lui couper la route") +
          (renfort ? " — patrouille Vigipirate de la garnison en renfort, une partie du butin est récupérée" : "") +
          " — " + fmt(vol) + " passés dans la poche de " + voleur.prenom + " " + voleur.nom +
          " : le butin reste en ville (monde fermé)." + signature,
        montant: -vol,
      });
    }

  // ----- Guerre de gangs -----
  } else if (arbitrage.type === "guerre_gangs") {
    const agresseur = etat.pnjs.find((p) => p.id === arbitrage.agresseurPnjId);
    const defenseur = etat.pnjs.find((p) => p.id === arbitrage.defenseurPnjId);
    if (!agresseur || !defenseur) return perime("un des belligérants a quitté la ville");
    const vainqueur = choix.id === "agresseur" ? agresseur : defenseur;
    const perdant = vainqueur === agresseur ? defenseur : agresseur;
    const pillage = Math.min(Math.round(perdant.compte * 0.1 * g), perdant.compte);
    perdant.compte -= pillage;
    vainqueur.compte += pillage;
    etat.volsCumules += pillage;
    if (totaux) totaux.volsJour += pillage;
    etat.affrontementsCumules = (etat.affrontementsCumules ?? 0) + 1;
    agresseur.casier = (agresseur.casier ?? 0) + 1;
    defenseur.casier = (defenseur.casier ?? 0) + 1;
    const quartiersVille = [...new Set(etat.batiments.map((b) => b.quartier))];
    const gangV = gangDe(etat, vainqueur);
    const gangP = gangDe(etat, perdant);
    let consigne = "";
    if (gangV && gangV !== gangP) {
      const conquete = quartierAdjacent(gangV, quartiersVille);
      if (conquete) {
        gangV.quartiers.push(conquete);
        consigne += " " + gangV.nom + " étendent leur emprise sur le quartier " + conquete + ".";
      }
    }
    if (gangP && gangP !== gangV && gangP.quartiers.length > 1) {
      const perdu = gangP.quartiers.pop();
      if (perdu) consigne += " " + gangP.nom + " reculent du quartier " + perdu + ".";
    }
    entrees.push({
      jour: j,
      type: "incident",
      texte:
        "Guerre de gangs : " + etiquette(etat, agresseur) + " attaque " + etiquette(etat, defenseur) +
        " au grand jour. " + etiquette(etat, vainqueur) + " remporte l'affrontement et pille " +
        fmt(pillage) +
        (pillage === 0 ? " — la cagnotte adverse était vide" : "") +
        " : la monnaie reste en ville (monde fermé)." + consigne,
      montant: -pillage,
    });

  // ----- Collision -----
  } else if (arbitrage.type === "collision") {
    const veh = (etat.vehicules ?? []).find((v) => v.id === arbitrage.cibleVehiculeId);
    if (!veh) return perime("le véhicule n'est plus là");
    const camionProprete = m.camionProprete;
    const station = serviceTenu(etat, m.stationBatimentId);
    const sante = serviceTenu(etat, m.santeBatimentId);
    const degats = Math.round(veh.valeur * PART_DEGATS_COLLISION * g * (camionProprete ? 1 : 2));
    const payeurVille = veh.categorie === "municipal";
    const proprietaire = payeurVille
      ? null
      : etat.pnjs.find((p) => p.id === veh.proprietairePnjId) ?? null;
    const caisse = payeurVille ? etat.budgetVille : proprietaire?.compte ?? 0;
    // Blessé (gravité ≥ 2) : un passager lié au véhicule — fait automatique,
    // facturé à l'hôpital local (doublé sans ambulance en service).
    let texteBlesse = "";
    if (g >= 2) {
      const passagers = etat.pnjs.filter(
        (p) => p.batimentId === veh.id || p.travailBatimentId === veh.id,
      );
      const blesse = passagers[0];
      if (blesse && sante) {
        const fraisBrut = Math.round(fraisMedicaux(g, !m.ambulance, blesse.compte));
        const frais = Math.min(fraisBrut, blesse.compte);
        if (frais > 0) {
          blesse.compte -= frais;
          sante.gerant.compte += frais;
          encaisser(sante.bat.id, frais);
          if (totaux) totaux.fraisMedicauxJour += frais;
          texteBlesse =
            " " + blesse.prenom + " " + blesse.nom + ", passager, est soigné pour " +
            fmt(frais) + " à " + sante.bat.nom +
            (!m.ambulance
              ? " (sans ambulance, les frais doublent)"
              : " (emmené par " + nomEngin(etat, "sante", "l'ambulance") + ")") + ".";
        }
      }
    }
    // Réparations à la STATION-SERVICE (vocation « garage », arbitrage
    // Thibaut : c'est elle qui gère les accidents, pas le BTP) ; les caisses
    // insuffisantes paient ce qu'elles peuvent ; un sinistre choisi alors
    // que les caisses couvraient n'encaisse rien — le maître du jeu a
    // condamné le véhicule.
    const veutReparer = choix.id === "repare";
    const paiePartiel = station !== null && (veutReparer || caisse < degats);
    const repare = paiePartiel ? Math.min(degats, caisse) : 0;
    if (paiePartiel && repare > 0 && station) {
      if (payeurVille) etat.budgetVille -= repare;
      else if (proprietaire) proprietaire.compte -= repare;
      station.gerant.compte += repare;
      encaisser(station.bat.id, repare);
    }
    if (repare >= degats) {
      entrees.push({
        jour: j,
        type: "incident",
        texte:
          "Collision au carrefour : " + veh.nom + " terminera la journée au garage — " +
          fmt(degats) + " de dégâts" +
          (!camionProprete ? " (doublés : pas de camion de propreté, la chaussée attend)" : "") +
          " réparés dans la foulée par " + (station ? station.bat.nom : "l'atelier local") +
          (payeurVille
            ? " sur le budget de la ville"
            : " aux frais de " + (proprietaire?.prenom ?? "son") + " " + (proprietaire?.nom ?? "propriétaire")) +
          " : l'argent reste en ville (monde fermé)." + texteBlesse,
        montant: -degats,
      });
    } else {
      veh.valeur -= degats - repare;
      veh.etat = "sinistre";
      entrees.push({
        jour: j,
        type: "incident",
        texte:
          "Collision au carrefour : " + veh.nom + " est bon pour la casse — " +
          (!station
            ? "aucune station-service en ville : il restera sinistré sur le bas-côté."
            : caisse >= degats
              ? "le maître du jeu l'envoie à la casse telles quelles — " + station.bat.nom + " n'encaisse rien."
              : "les caisses n'ont payé que " + fmt(repare) + " de réparations (" + station.bat.nom + "), le véhicule reste sinistré.") +
          (!camionProprete ? " Les dégâts avaient doublé faute de camion de propreté." : "") +
          texteBlesse,
        montant: -degats,
      });
    }

  // ----- Vol de voiture -----
  } else if (arbitrage.type === "vol_vehicule") {
    const veh = (etat.vehicules ?? []).find((v) => v.id === arbitrage.cibleVehiculeId);
    const voleur = etat.pnjs.find((p) => p.id === arbitrage.voleurPnjId);
    if (!veh || !voleur) return perime("le véhicule ou le voleur a disparu");
    const gangVoleur = gangDe(etat, voleur);
    const signature = gangVoleur ? " — signé " + gangVoleur.nom : "";
    const dispo = m.police;
    if (choix.id === "dejoue") {
      voleur.casier = (voleur.casier ?? 0) + 1;
      const duree = 3 * g;
      voleur.arreteJusqua = j + duree;
      const commissariat = m.commissariat ? posteDePolice(etat) : undefined;
      entrees.push({
        jour: j,
        type: "incident",
        texte:
          "Vol de voiture déjoué : " + voleur.prenom + " " + voleur.nom +
          " forçait le contact de " + veh.nom + " quand la patrouille, fourgon en tête, le ceinture sur le fait" +
          (commissariat
            ? " — " + duree + " jour(s) au " + commissariat.nom
            : " — " + duree + " jour(s) d'assignation à résidence") +
          "." + signature,
      });
    } else {
      voleur.casier = (voleur.casier ?? 0) + 1;
      const ancienProprio = etat.pnjs.find((p) => p.id === veh.proprietairePnjId);
      // Transfert de propriété : le véhicule change de main, pas un centime
      // de la masse monétaire — le patrimoine, lui, voyage.
      veh.proprietairePnjId = voleur.id;
      veh.gangId = voleur.gangId ?? null;
      entrees.push({
        jour: j,
        type: "incident",
        texte:
          "Vol de voiture : " + veh.nom +
          (ancienProprio ? " de " + ancienProprio.prenom + " " + ancienProprio.nom : "") +
          " disparaît dans la nuit — " + voleur.prenom + " " + voleur.nom + " roule désormais dedans" +
          (dispo >= g
            ? m.fourgonPolice
              ? " (la patrouille l'a identifié, mais le maître du jeu laisse filer)"
              : " (la patrouille l'a identifié, mais sans fourgon en service, personne pour l'embarquer)"
            : "") +
          " : transfert de propriété, pas une pièce ne quitte la ville (monde fermé)." + signature,
        montant: -veh.valeur,
      });
    }

  // ----- Accident -----
  } else {
    const victime = etat.pnjs.find((p) => p.id === arbitrage.ciblePnjId);
    if (!victime) return perime("la victime a quitté la ville");
    const dispo = m.pompiers;
    const sante = serviceTenu(etat, m.santeBatimentId);
    const ambulance = m.ambulance ? nomEngin(etat, "sante", "l'ambulance") : null;
    // Monde 100 % fermé : les soins sont facturés par le service de santé
    // local (recette redistribuée le soir). Sans hôpital en ville, pas de
    // mécanique de santé — aucune facture.
    const secoursJustes = choix.id === "aggrave";
    const fraisBrut = Math.round(
      fraisMedicaux(g, secoursJustes, victime.compte) * coefficientRenfort(g, m.armee),
    );
    const frais = Math.min(Math.min(fraisBrut, victime.compte), sante ? fraisBrut : 0);
    if (sante && frais > 0) {
      victime.compte -= frais;
      sante.gerant.compte += frais;
      encaisser(sante.bat.id, frais);
      if (totaux) totaux.fraisMedicauxJour += frais;
    }
    entrees.push({
      jour: j,
      type: "incident",
      texte:
        "Accident devant la " + (etat.batiments[0]?.nom ?? "mairie") + " : " +
        victime.prenom + " " + victime.nom +
        (dispo === 0
          ? " est raccompagné par les voisins, faute de secours"
          : dispo >= g
            ? " est dégagé en dix minutes par les pompiers"
            : " attend les secours, l'effectif est juste") +
        (renfort ? " — la garnison lève un poste de secours, les frais sont contenus" : "") +
        (ambulance ? " — " + ambulance + " l'emmène vers les soins" : "") +
        (sante
          ? " — " + fmt(frais) + " de soins facturés à " + sante.bat.nom + " : l'argent reste en ville."
          : " — aucun service de santé en ville : personne pour facturer les soins.") +
        (sante && frais === 0 ? " (la victime n'avait pas un centime)" : ""),
      montant: frais === 0 ? 0 : -frais,
    });
  }
  return entrees;
}
