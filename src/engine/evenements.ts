// Moteur d'événements (phase 2) — cahier des charges §4.2 et §5.
// Incidents (incendie, cambriolage, accident) tirés selon la règle d'échelle :
//   proba quotidienne = R × P × K / 10000 / 365
//   R = taux réel (événements pour 10 000 habitants et par an, référentiel)
//   P = figurines de la ville, K = coefficient d'intensité (params, éditable).
// Pur et déterministe : l'aléa est un PRNG seedé par le jour — rejouer le
// même jour depuis le même état produit exactement les mêmes événements.

import type { Etat, Pnj } from "./types.ts";
import { refNombre } from "./referentiel.ts";

export type TypeIncident = "incendie" | "cambriolage" | "accident";

export interface Incident {
  type: TypeIncident;
  /** Gravité 1 (pépin), 2 (grave), 3 (majeur) — détermine les effectifs requis. */
  gravite: 1 | 2 | 3;
  /** Bâtiment visé (incendie) ou figurine visée (cambriolage, accident). */
  cibleId: string;
  /**
   * Auteur du cambriolage (monde 100 % fermé, arbitrage 2026-11-06) : le
   * butin ne disparaît plus, il rejoint la poche de ce figurant de la ville.
   */
  voleurId?: string;
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
  const sansAccents = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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
};

/** Gravité tirée : 1 (60 %), 2 (30 %), 3 (10 %). */
function tirerGravite(a: Alea): 1 | 2 | 3 {
  const x = a();
  if (x < 0.6) return 1;
  if (x < 0.9) return 2;
  return 3;
}

/**
 * Tire les incidents du jour (au plus un par type). Retourne [] si la
 * destinée s'ennuie ; les cibles sont désignées par le PRNG du jour.
 */
export function tirerIncidents(etat: Etat, jour: number): Incident[] {
  const a = generateurPour(jour);
  const k = etat.params.coeffIntensite;
  const p = etat.pnjs.length;
  const incidents: Incident[] = [];
  for (const type of ["incendie", "cambriolage", "accident"] as TypeIncident[]) {
    const taux = refNombre(TAUX[type], 0);
    if (a() >= probaQuotidienne(taux, p, k)) continue;
    const gravite = tirerGravite(a);
    let cibleId: string | null = null;
    let voleurId: string | null = null;
    if (type === "incendie" && etat.batiments.length > 0) {
      cibleId = etat.batiments[Math.floor(a() * etat.batiments.length)].id;
    } else if (type === "cambriolage") {
      const proies = etat.pnjs.filter((x) => x.compte > 0 && x.statut !== "agent_public");
      if (proies.length > 0) cibleId = proies[Math.floor(a() * proies.length)].id;
      if (cibleId !== null) {
        // Monde 100 % fermé : un cambriolage a un auteur figurant en ville,
        // le butin lui revient. Pas de candidat (ville d'agents publics) :
        // pas de cambriolage — rien ne peut disparaître du circuit.
        const voleurs = etat.pnjs.filter(
          (x) => x.id !== cibleId && x.statut !== "agent_public",
        );
        if (voleurs.length > 0) voleurId = voleurs[Math.floor(a() * voleurs.length)].id;
        else cibleId = null;
      }
    } else if (type === "accident" && etat.pnjs.length > 0) {
      cibleId = etat.pnjs[Math.floor(a() * etat.pnjs.length)].id;
    }
    if (cibleId !== null) {
      incidents.push({ type, gravite, cibleId, voleurId: voleurId ?? undefined });
    }
  }
  return incidents;
}
