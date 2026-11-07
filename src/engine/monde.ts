// Monde par défaut (ville nue depuis la v1.23) et mutateurs d'édition (phase 1 — MVP).
// Monnaie en centimes ; budget d'achat par défaut = consommation de référence
// (INSEE) pour un revenu médian ; comptes initiaux réalistes et modifiables.

import type { Batiment, Etat, Gang, Pnj } from "./types.ts";
import {
  ACHAT_REFERENCE_L,
  BUDGET_FACTEUR_MAX,
  BUDGET_FACTEUR_MIN,
  COEFF_INTENSITE_DEFAUT,
  TAUX_IMPOT_DEFAUT_BP,
  montantL,
} from "./referentiel.ts";
import { serviceLocal } from "./moteur.ts";

const REF_ACHAT = Math.round(ACHAT_REFERENCE_L * 100); // 5250 centimes = 52,50 L

// Carte d'identité (phase 3.9) : paires de traits attribuées en rotation
// déterministe aux figurines qui n'en ont pas de curaté (milieu criminel).
export const PAIRS_TRAITS: string[][] = [
  ["honnête", "travailleur"],
  ["travailleur", "sociable"],
  ["sociable", "discret"],
  ["honnête", "prudent"],
  ["travailleur", "discret"],
  ["sociable", "téméraire"],
  ["prudent", "discret"],
  ["honnête", "sociable"],
  ["travailleur", "téméraire"],
  ["sociable", "prudent"],
  ["honnête", "discret"],
  ["travailleur", "prudent"],
];

let compteur = 0;
function nouvelId(prefixe: string): string {
  compteur += 1;
  return prefixe + "-" + String(compteur).padStart(3, "0");
}

export function nouveauPnj(p: Partial<Pnj> & { prenom: string; nom: string }): Pnj {
  const revenu = p.revenuIndicatif ?? REF_ACHAT;
  return {
    id: p.id ?? nouvelId("pnj"),
    prenom: p.prenom,
    nom: p.nom,
    age: p.age ?? 40,
    genre: p.genre ?? "F",
    metier: p.metier ?? "sans profession",
    statut: p.statut ?? "prive",
    grade: p.grade,
    batimentId: p.batimentId ?? null,
    travailBatimentId: p.travailBatimentId ?? null,
    revenuIndicatif: revenu,
    budgetAchat: p.budgetAchat ?? revenu,
    compte: p.compte ?? 400000,
    epargne: p.epargne ?? 0,
    // Carte d'identité (phase 3.9) : paire de traits en rotation déterministe.
    personnalite: p.personnalite ?? PAIRS_TRAITS[compteur % PAIRS_TRAITS.length],
    casier: p.casier ?? 0,
    gangId: p.gangId ?? null,
    arreteJusqua: p.arreteJusqua ?? 0,
  };
}

/**
 * Budget d'achat aléatoire au départ (arbitrage Thibaut 2026-11-06) :
 * loi log-uniforme entre ×0,5 et ×10 le revenu indicatif — beaucoup de
 * budgets modestes, quelques très gros, total non recalé. Tiré une seule
 * fois à la création du monde (Math.random : chaque partie démarre
 * différemment) ; la simulation journalière reste déterministe, reseedée
 * par numéro de jour. u ∈ [0, 1] parcourt la loi uniformément en log.
 */
export function budgetAleatoire(revenu: number, u: number = Math.random()): number {
  const min = Math.log(BUDGET_FACTEUR_MIN);
  const max = Math.log(BUDGET_FACTEUR_MAX);
  return Math.max(1, Math.round(revenu * Math.exp(min + u * (max - min))));
}

/** Usine à gang (phase 3.10) : identifiant séquentiel, territoire initial. */
export function nouveauGang(p: { nom: string; quartiers: string[] }): Gang {
  compteur += 1;
  return {
    id: "gang-" + String(compteur).padStart(3, "0"),
    nom: p.nom,
    quartiers: [...p.quartiers],
  };
}

export function nouveauBatiment(p: Partial<Batiment> & { nom: string; type: Batiment["type"] }): Batiment {
  return {
    id: p.id ?? nouvelId("bat"),
    nom: p.nom,
    type: p.type,
    quartier: p.quartier ?? "Centre",
    valeur: p.valeur ?? 500000,
    etat: p.etat ?? "bon",
    coutFonctionnement: p.coutFonctionnement ?? 0,
    capacite: p.capacite ?? 0,
    vocation: p.vocation ?? null,
  };
}

/**
 * Réinitialise les identifiants séquentiels (la ville de démonstration
 * reconstruite pour les tests repart à pnj-001/bat-001).
 */
export function reinitialiserIds(): void {
  compteur = 0;
}

/** Le monde par défaut (v1.23, arbitrage Thibaut) : une ville nue — aucun
 * PNJ, aucun bâtiment, aucun gang, 5 000 L en caisse. Tout se construit
 * dans l'éditeur, la ville vit des coups de crayon du joueur. L'ancienne
 * ville de démonstration (Bricke-en-Provence, 59 figurines) vit dans
 * monde.demo.ts : retirée du jeu, elle reste la terre d'essai des tests. */
export function createMondeDefaut(): Etat {
  return {
    schemaVersion: 8,
    jour: 0,
    nomVille: "Bricke-en-Provence",
    budgetVille: 500000,
    sortiesCumulees: 0,
    pertesCumulees: 0,
    volsCumulees: 0,
    dette: 0,
    mouvementsBanqueCumules: 0,
    gangs: [],
    affrontementsCumules: 0,
    params: { tauxImpotBp: TAUX_IMPOT_DEFAUT_BP, coeffIntensite: COEFF_INTENSITE_DEFAUT },
    pnjs: [],
    batiments: [],
    journal: [
      {
        jour: 0,
        type: "systeme",
        texte:
          "Jour 0 : un terrain nu et 5 000 L en caisse — aucun habitant, aucun bâtiment, aucun gang. Bricke-en-Provence attend ses premiers coups de crayon : ouvre l'éditeur et bâtis ta ville.",
      },
    ],
  };
}

// ---------- Mutateurs purs pour l'éditeur ----------
// Chaque création et suppression raconte une entrée de journal (arbitrage
// 2026-11-05 : l'éditeur journalise) : la ville construite à la main vit
// dans le journal comme le reste.

function raconter(e: Etat, texte: string): void {
  e.journal.push({ jour: e.jour, type: "systeme", texte });
}

export function ajouterPnj(etat: Etat, pnj: Pnj): Etat {
  const e = structuredClone(etat);
  const bat = e.batiments.find((b) => b.id === pnj.batimentId);
  const chez = bat ? " (" + bat.nom + ")" : "";
  const travail = pnj.travailBatimentId
    ? e.batiments.find((b) => b.id === pnj.travailBatimentId)
    : null;
  raconter(
    e,
    pnj.statut === "commercant"
      ? pnj.prenom + " " + pnj.nom + " ouvre sa boutique" + chez + " : les caddies s'annoncent."
      : pnj.statut === "agent_public"
        ? pnj.prenom + " " + pnj.nom + " entre au service de la ville comme " + pnj.metier + chez + "."
        : travail
          ? pnj.prenom + " " + pnj.nom + " est embauché(e) chez " + travail.nom + " comme " +
            pnj.metier + " : son salaire privé coulera chaque soir (modèle flux)."
          : pnj.prenom + " " + pnj.nom + " emménage en ville" + chez + ", " + pnj.metier + ". Bienvenue !",
  );
  e.pnjs.push(pnj);
  return e;
}

export function modifierPnj(etat: Etat, id: string, patch: Partial<Pnj>): Etat {
  const e = structuredClone(etat);
  const i = e.pnjs.findIndex((p) => p.id === id);
  if (i >= 0) e.pnjs[i] = { ...e.pnjs[i], ...patch, id };
  return e;
}

export function supprimerPnj(etat: Etat, id: string): Etat {
  const e = structuredClone(etat);
  const partis = e.pnjs.find((p) => p.id === id);
  e.pnjs = e.pnjs.filter((p) => p.id !== id);
  if (partis) raconter(e, partis.prenom + " " + partis.nom + " quitte la ville. Adieu !");
  return e;
}

export function ajouterBatiment(etat: Etat, bat: Batiment): Etat {
  const e = structuredClone(etat);
  raconter(
    e,
    bat.type === "habitation"
      ? "Un nouveau bâtiment se dresse : " + bat.nom + " — les emménagements s'annoncent."
      : bat.type === "commerce"
        ? bat.nom + " ouvre ses portes : la ville compte un commerce de plus."
        : bat.nom + " entre en service : la ville s'équipe.",
  );
  e.batiments.push(bat);
  return e;
}

export function modifierBatiment(etat: Etat, id: string, patch: Partial<Batiment>): Etat {
  const e = structuredClone(etat);
  const i = e.batiments.findIndex((b) => b.id === id);
  if (i >= 0) e.batiments[i] = { ...e.batiments[i], ...patch, id };
  return e;
}

export function supprimerBatiment(etat: Etat, id: string): Etat {
  const e = structuredClone(etat);
  const parti = e.batiments.find((b) => b.id === id);
  const emploisPerdus = e.pnjs.filter((p) => p.travailBatimentId === id).length;
  e.batiments = e.batiments.filter((b) => b.id !== id);
  e.pnjs = e.pnjs.map((p) =>
    p.batimentId === id
      ? { ...p, batimentId: null }
      : p.travailBatimentId === id
        ? { ...p, travailBatimentId: null }
        : p,
  );
  if (parti)
    raconter(
      e,
      parti.nom + " ferme et s'efface du paysage." +
        (emploisPerdus > 0 ? " Ses " + emploisPerdus + " employé(s) se retrouvent sans emploi." : ""),
    );
  return e;
}

// ---------- Mutateurs de gangs (phase 3.10 : l'éditeur crée le milieu) ----------

/** Crée un gang en ville : territoire initial à choisir parmi les quartiers bâtis. */
export function ajouterGang(etat: Etat, gang: Gang): Etat {
  const e = structuredClone(etat);
  e.gangs = [...(e.gangs ?? []), gang];
  raconter(
    e,
    gang.nom + " s'installe en ville et tient le quartier " + gang.quartiers.join(" et ") +
      ". Les figurines qui le rejoignent (fiche de la figurine → Gang) ne voleront que sur son territoire.",
  );
  return e;
}

/**
 * Démantele un gang : ses membres redeviennent indépendants (gangId null) —
 * personne ne quitte la ville, le milieu se réorganise.
 */
export function supprimerGang(etat: Etat, id: string): Etat {
  const e = structuredClone(etat);
  const gang = (e.gangs ?? []).find((g) => g.id === id);
  const membres = e.pnjs.filter((p) => p.gangId === id);
  for (const p of e.pnjs) {
    if (p.gangId === id) p.gangId = null;
  }
  e.gangs = (e.gangs ?? []).filter((g) => g.id !== id);
  if (gang)
    raconter(
      e,
      gang.nom + " est démantelé" +
        (membres.length > 0
          ? " : " + membres.length + " figurine(s) repartent en indépendant(e)s — le milieu ne meurt jamais."
          : " : plus personne ne tenait la baraque."),
    );
  return e;
}

export function modifierVille(
  etat: Etat,
  patch: { nomVille?: string; budgetVille?: number; tauxImpotBp?: number; coeffIntensite?: number },
): Etat {
  const e = structuredClone(etat);
  if (patch.nomVille !== undefined) e.nomVille = patch.nomVille;
  if (patch.budgetVille !== undefined) e.budgetVille = Math.max(0, Math.round(patch.budgetVille));
  if (patch.tauxImpotBp !== undefined) e.params.tauxImpotBp = Math.max(0, Math.round(patch.tauxImpotBp));
  if (patch.coeffIntensite !== undefined) {
    e.params.coeffIntensite = Math.max(1, Math.round(patch.coeffIntensite));
  }
  return e;
}

/** Emprunter à la banque locale (phase 3) : les caisses respirent, la dette grimpe. Sans banque en ville, pas de crédit (monde fermé). */
export function emprunterVille(etat: Etat, montantCentimes: number): Etat {
  const e = structuredClone(etat);
  const m = Math.max(0, Math.round(montantCentimes));
  if (m === 0) return e;
  const banque = serviceLocal(e, "banque");
  if (!banque) {
    raconter(
      e,
      "La ville voudrait emprunter " +
        montantL(m) +
        ", mais aucune banque n'est installée en ville : pas de banque, pas de crédit (monde fermé).",
    );
    return e;
  }
  e.budgetVille += m;
  e.dette += m;
  e.mouvementsBanqueCumules += m;
  raconter(
    e,
    "La ville emprunte " +
      montantL(m) +
      " à " +
      banque.bat.nom +
      " : les caisses respirent, la dette grimpe à " +
      montantL(e.dette) +
      " d'encours.",
  );
  return e;
}

/**
 * Rembourser la banque locale (phase 3) : la dette fond. Monde 100 % fermé
 * (2026-11-06) : l'argent rejoint la banque de la ville, il ne quitte plus
 * le circuit — mouvementsBanqueCumules (création monétaire) ne baisse plus.
 */
export function rembourserVille(etat: Etat, montantCentimes: number): Etat {
  const e = structuredClone(etat);
  const r = Math.min(Math.max(0, Math.round(montantCentimes)), etat.budgetVille, etat.dette);
  if (r === 0) return e;
  const banque = serviceLocal(e, "banque");
  if (!banque) {
    raconter(
      e,
      "La ville voudrait rembourser " +
        montantL(r) +
        ", mais la banque n'est plus en ville : personne à rembourser (monde fermé).",
    );
    return e;
  }
  e.budgetVille -= r;
  e.dette -= r;
  banque.gerant.compte += r; // circuit fermé : la banque locale encaisse
  raconter(
    e,
    "La ville rembourse " +
      montantL(r) +
      " de sa dette à " +
      banque.bat.nom +
      (e.dette === 0 ? " : plus un centime de dette, la ville respire !" : " — encours restant : " + montantL(e.dette) + "."),
  );
  return e;
}
