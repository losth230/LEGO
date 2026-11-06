// Moteur d'événements (phase 2) — cahier des charges §4.2 et §5.
// Incidents (incendie, cambriolage, accident, affrontement de gangs) tirés
// selon la règle d'échelle :
//   proba quotidienne = R × P × K / 10000 / 365
//   R = taux réel (événements pour 10 000 habitants et par an, référentiel)
//   P = figurines de la ville, K = coefficient d'intensité (params, éditable).
// Pur et déterministe : l'aléa est un PRNG seedé par le jour — rejouer le
// même jour depuis le même état produit exactement les mêmes événements.
//
// Phase 3.9 (milieu criminel, arbitrage Thibaut 2026-11-06) : le voleur
// n'est plus tiré au hasard uniforme. Chaque figurine porte une carte
// d'identité (traits, casier, gang) qui alimente un profil criminel ;
// le tirage est pondéré par ce profil. Un membre de gang ne vole que sur
// le territoire de son gang ; un indépendant opère partout.

import type { Etat, Gang, Pnj } from "./types.ts";
import { refNombre } from "./referentiel.ts";

export type TypeIncident = "incendie" | "cambriolage" | "accident" | "guerre_gangs";

export interface Incident {
  type: TypeIncident;
  /** Gravité 1 (pépin), 2 (grave), 3 (majeur) — détermine les effectifs requis. */
  gravite: 1 | 2 | 3;
  /** Bâtiment visé (incendie) ou figurine visée (cambriolage, accident, guerre). */
  cibleId: string;
  /**
   * Auteur du cambriolage (monde 100 % fermé, arbitrage 2026-11-06) : le
   * butin ne disparaît plus, il rejoint la poche de ce figurant de la ville.
   * Phase 3.9 : tiré pondéré par le profil criminel, jamais au hasard uniforme.
   */
  voleurId?: string;
  /** Belligérants d'un affrontement de gangs (phase 3.9). */
  agresseurId?: string;
  defenseurId?: string;
}

// ---------- PRNG déterministe (mulberry32) ----------

export type Alea = () => number;

/** Générateur pseudo-aléatoire seedé : même jour, mêmes tirages, toujours. */
export function generateurPour(jour: number): Alea {
  let a = (Math.imul(jour, 0x9e3779b1) ^ 0x85ebca6b) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Règle d'échelle (§5) ----------

/** Probabilité quotidienne d'un incident de taux réel R pour P figurines. */
export function probaQuotidienne(tauxReel10k: number, figurines: number, k: number): number {
  return (tauxReel10k * figurines * k) / 10000 / 365;
}

/** Tir pondéré par un poids (retourne null si tous les poids sont nuls). */
function tirerPondere<T>(a: Alea, elems: T[], poids: (x: T) => number): T | null {
  const effectifs = elems.map((e) => Math.max(0, poids(e)));
  const total = effectifs.reduce((s, v) => s + v, 0);
  if (total <= 0) return null;
  let x = a() * total;
  for (let i = 0; i < elems.length; i++) {
    x -= effectifs[i];
    if (x < 0) return elems[i];
  }
  return elems[elems.length - 1];
}

// ---------- Carte d'identité : profil criminel (phase 3.9) ----------

/**
 * Profil criminel d'une figurine (poids de tirage d'un cambriolage) :
 * traits de personnalité, pauvreté relative, récidive (casier) et
 * appartenance à un gang. Un honnête travailleur aisé pèse 0 : il ne
 * vole jamais. Le score reste nul ou positif.
 */
export function profilCriminel(pnj: Pnj): number {
  const t = pnj.personnalite ?? [];
  let score = 0;
  if (t.includes("cupide")) score += 4;
  if (t.includes("opportuniste")) score += 2;
  if (t.includes("téméraire")) score += 1;
  if (t.includes("honnête")) score -= 4;
  if (t.includes("travailleur")) score -= 2;
  if (t.includes("prudent")) score -= 2;
  // Pauvreté relative : moins de 15 jours de revenu sur le compte,
  // et revenu quotidien sous 25 L (petits boulots, absence d'emploi).
  if (pnj.compte < 15 * Math.max(pnj.revenuIndicatif, 1)) score += 3;
  if (pnj.revenuIndicatif < 2500) score += 1;
  // Récidive : le casier pèse lourd — un voleur repris recommence.
  score += 2 * (pnj.casier ?? 0);
  // L'appartenance à un gang met le crime au menu du jour.
  if (pnj.gangId) score += 3;
  return Math.max(0, score);
}

/** Une figurine arrêtée (assignée à résidence) ne peut pas commettre de crime. */
export function libre(pnj: Pnj, jour: number): boolean {
  return (pnj.arreteJusqua ?? 0) <= jour;
}

/** Gang d'une figurine, null si indépendante (ou gang inconnu). */
export function gangDe(etat: Etat, pnj: Pnj): Gang | null {
  if (!pnj.gangId) return null;
  return etat.gangs?.find((g) => g.id === pnj.gangId) ?? null;
}

/**
 * Force d'une figurine dans un affrontement : elle-même plus, si elle
 * appartient à un gang, ses coéquipiers libres (le gang se bat en meute).
 */
export function forceCriminelle(etat: Etat, pnj: Pnj): number {
  let force = 1 + (pnj.casier ?? 0);
  const gang = gangDe(etat, pnj);
  if (gang) {
    force += etat.pnjs.filter((x) => x.gangId === gang.id && libre(x, etat.jour)).length;
  }
  return force;
}

/** Quartier du logement d'une figurine ("" si sans bâtiment). */
export function quartierDe(etat: Etat, pnj: Pnj): string {
  const bat = etat.batiments.find((b) => b.id === pnj.batimentId);
  return bat?.quartier ?? "";
}

/** Quartiers adjacents (expansion territoriale des gangs). */
const ADJACENCES: Record<string, string[]> = {
  Centre: ["Nord", "Sud", "Port"],
  Nord: ["Centre", "Sud"],
  Sud: ["Centre", "Nord", "Port"],
  Port: ["Centre", "Sud"],
};

/** Premier quartier adjacent au territoire d'un gang qui n'en fait pas partie. */
export function quartierAdjacent(gang: Gang, quartiersVille: string[]): string | null {
  for (const q of gang.quartiers) {
    for (const voisin of ADJACENCES[q] ?? []) {
      if (!gang.quartiers.includes(voisin) && quartiersVille.includes(voisin)) {
        return voisin;
      }
    }
  }
  return null;
}

// ---------- Effectifs de garde ----------

/** Figurines pompiers mobilisables : pros et volontaires (78 % du modèle réel). */
export function gardePompiers(etat: Etat): Pnj[] {
  return etat.pnjs.filter(
    (p) =>
      (p.grade ?? "").startsWith("sapeur_pompier") ||
      p.metier.toLowerCase().includes("pompi"),
  );
}

/** Figurines police mobilisables. */
export function gardePolice(etat: Etat): Pnj[] {
  return etat.pnjs.filter(
    (p) =>
      (p.grade ?? "").startsWith("policier") ||
      p.metier
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .includes("police"),
  );
}

/** Figurines de la garnison mobilisables (branche militaire). */
export function gardeArmee(etat: Etat): Pnj[] {
  const sansAccents = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return etat.pnjs.filter(
    (p) =>
      (p.grade ?? "").endsWith("_armee") ||
      ["milita", "soldat", "general", "armee"].some((m) =>
        sansAccents(p.metier).includes(m),
      ),
  );
}

// ---------- Tirages ----------

const TAUX: Record<TypeIncident, string> = {
  incendie: "evenements.incendie.valeur",
  cambriolage: "evenements.cambriolage_logement.valeur",
  accident: "evenements.accident_circulation.valeur",
  guerre_gangs: "evenements.affrontement_gangs.valeur",
};

/** Gravité tirée : 1 (60 %), 2 (30 %), 3 (10 %). */
function tirerGravite(a: Alea): 1 | 2 | 3 {
  const x = a();
  if (x < 0.6) return 1;
  if (x < 0.9) return 2;
  return 3;
}

/**
 * Candidats au cambriolage : figurines libres (pas en prison), pas agents
 * publics, au profil criminel strictement positif — plus une ville d'honnêtes
 * citoyens, plus de cambriolage (phase 3.9).
 */
export function candidatsCriminels(etat: Etat, jour: number): Pnj[] {
  return etat.pnjs.filter(
    (x) => x.statut !== "agent_public" && libre(x, jour) && profilCriminel(x) > 0,
  );
}

/**
 * Tire les incidents du jour (au plus un par type). Retourne [] si la
 * destinée s'ennuie ; cibles et auteurs sont désignés par le PRNG du jour,
 * pondérés par leurs profils (phase 3.9 : plus de tirage uniforme).
 */
export function tirerIncidents(etat: Etat, jour: number): Incident[] {
  const a = generateurPour(jour);
  const k = etat.params.coeffIntensite;
  const p = etat.pnjs.length;
  const incidents: Incident[] = [];
  for (const type of ["incendie", "cambriolage", "accident", "guerre_gangs"] as TypeIncident[]) {
    const taux = refNombre(TAUX[type], 0);
    if (a() >= probaQuotidienne(taux, p, k)) continue;
    const gravite = tirerGravite(a);
    let cibleId: string | null = null;
    let voleurId: string | null = null;
    let agresseurId: string | null = null;
    let defenseurId: string | null = null;
    if (type === "incendie" && etat.batiments.length > 0) {
      cibleId = etat.batiments[Math.floor(a() * etat.batiments.length)].id;
    } else if (type === "cambriolage") {
      // Phase 3.9 : l'auteur est désigné par son profil criminel, la cible
      // par sa richesse. Un membre de gang ne vole que sur son territoire.
      const voleurs = candidatsCriminels(etat, jour);
      const voleur = tirerPondere(a, voleurs, profilCriminel);
      if (voleur) {
        const gang = gangDe(etat, voleur);
        const proies = etat.pnjs.filter(
          (x) =>
            x.compte > 0 &&
            x.statut !== "agent_public" &&
            x.id !== voleur.id &&
            (!gang || gang.quartiers.includes(quartierDe(etat, x))),
        );
        const cible = tirerPondere(a, proies, (x) => x.compte);
        if (cible) {
          cibleId = cible.id;
          voleurId = voleur.id;
        }
      }
    } else if (type === "accident" && etat.pnjs.length > 0) {
      cibleId = etat.pnjs[Math.floor(a() * etat.pnjs.length)].id;
    } else if (type === "guerre_gangs") {
      // Affrontement criminel (phase 3.9) : il faut au moins deux factions
      // rivales actives (gangs et/ou indépendants au profil positif).
      const criminels = candidatsCriminels(etat, jour);
      const factions = new Set(criminels.map((x) => x.gangId ?? "solo:" + x.id));
      if (factions.size >= 2) {
        const agresseur = tirerPondere(a, criminels, (x) => forceCriminelle(etat, x));
        if (agresseur) {
          const campAgresseur = agresseur.gangId ?? "solo:" + agresseur.id;
          const rivaux = criminels.filter(
            (x) => (x.gangId ?? "solo:" + x.id) !== campAgresseur,
          );
          const defenseur = tirerPondere(a, rivaux, (x) => forceCriminelle(etat, x));
          if (defenseur) {
            cibleId = defenseur.id;
            agresseurId = agresseur.id;
            defenseurId = defenseur.id;
          }
        }
      }
    }
    if (cibleId !== null) {
      incidents.push({
        type,
        gravite,
        cibleId,
        voleurId: voleurId ?? undefined,
        agresseurId: agresseurId ?? undefined,
        defenseurId: defenseurId ?? undefined,
      });
    }
  }
  return incidents;
}
