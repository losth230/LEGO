// Monde par défaut (ville nue depuis la v1.23) et mutateurs d'édition (phase 1 — MVP).
// Monnaie en centimes ; budget d'achat par défaut = consommation de référence
// (INSEE) pour un revenu médian ; comptes initiaux réalistes et modifiables.

import type { Batiment, Chantier, Etat, Gang, Pnj, Vehicule } from "./types.ts";
import {
  ACHAT_REFERENCE_L,
  BUDGET_FACTEUR_MAX,
  BUDGET_FACTEUR_MIN,
  COEFF_INTENSITE_DEFAUT,
  ESSENCE_REFERENCE_L,
  TAUX_IMPOT_DEFAUT_BP,
  montantL,
} from "./referentiel.ts";
import { serviceLocal } from "./moteur.ts";
import { appliquerArbitrage } from "./arbitrages.ts";
import { coutChantier, nomCible, TRAVAUX_DEFAUT } from "./chantiers.ts";

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
    capaciteLogements: p.capaciteLogements ?? 0,
    capacitePostes: p.capacitePostes ?? 0,
    vocation: p.vocation ?? null,
  };
}

/**
 * Usine à véhicule (v1.25) : identifiant séquentiel, carburant de référence
 * du référentiel par défaut. Municipal : un rôle (effets de jeu) ; privé :
 * un propriétaire figurine (volable par le milieu).
 */
export function nouveauVehicule(p: Partial<Vehicule> & { nom: string }): Vehicule {
  return {
    id: p.id ?? nouvelId("veh"),
    nom: p.nom,
    categorie: p.categorie ?? "prive",
    role: p.role ?? null,
    quartier: p.quartier ?? "Centre",
    valeur: p.valeur ?? 150000,
    etat: p.etat ?? "bon",
    essenceJour: p.essenceJour ?? Math.round(ESSENCE_REFERENCE_L * 100),
    capaciteLogements: p.capaciteLogements ?? 0,
    capacitePostes: p.capacitePostes ?? 0,
    proprietairePnjId: p.proprietairePnjId ?? null,
    gangId: p.gangId ?? null,
    garageBatimentId: p.garageBatimentId ?? null,
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
    schemaVersion: 12,
    jour: 0,
    nomVille: "Bricke-en-Provence",
    budgetVille: 500000,
    sortiesCumulees: 0,
    pertesCumulees: 0,
    volsCumules: 0,
    dette: 0,
    mouvementsBanqueCumules: 0,
    gangs: [],
    affrontementsCumules: 0,
    params: { tauxImpotBp: TAUX_IMPOT_DEFAUT_BP, coeffIntensite: COEFF_INTENSITE_DEFAUT },
    pnjs: [],
    batiments: [],
    vehicules: [],
    arbitrages: [],
    chantiers: [],
    journal: [
      {
        jour: 0,
        type: "systeme",
        texte:
          "Jour 0 : un terrain nu et 5 000 L en caisse — aucun habitant, aucun bâtiment, aucun véhicule, aucun gang. Bricke-en-Provence attend ses premiers coups de crayon : ouvre l'éditeur et lance les premiers chantiers (un bâtiment se construit au BTP, un véhicule à la station-service — et sans constructeur en ville, le chantier avance à la main).",
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

// ---------- Mutateurs de véhicules (v1.25 : l'éditeur construit la flotte) ----------

export function ajouterVehicule(etat: Etat, veh: Vehicule): Etat {
  const e = structuredClone(etat);
  const garage = veh.garageBatimentId
    ? e.batiments.find((b) => b.id === veh.garageBatimentId)
    : null;
  raconter(
    e,
    veh.categorie === "municipal"
      ? veh.nom + " rejoint la flotte municipale" +
        (garage ? " et range au garage de " + garage.nom : "") +
        (veh.role ? " — poste " + veh.role + " assuré tant qu'il roule." : ".")
      : veh.nom + " entre en ville" +
        (garage ? " et se gare à " + garage.nom : "") +
        (veh.capacitePostes > 0
          ? " — ses " + veh.capacitePostes + " poste(s) de travail ambulant" +
            (garage ? " s'ajoutent à ceux de " + garage.nom : " sont à pourvoir") + "."
          : veh.capaciteLogements > 0
            ? " — il peut loger " + veh.capaciteLogements + " figurine(s) (roulotte)."
            : "."),
  );
  e.vehicules = [...(e.vehicules ?? []), veh];
  return e;
}

export function modifierVehicule(etat: Etat, id: string, patch: Partial<Vehicule>): Etat {
  const e = structuredClone(etat);
  const i = (e.vehicules ?? []).findIndex((v) => v.id === id);
  if (i >= 0) e.vehicules![i] = { ...e.vehicules![i], ...patch, id };
  return e;
}

export function supprimerVehicule(etat: Etat, id: string): Etat {
  const e = structuredClone(etat);
  const parti = (e.vehicules ?? []).find((v) => v.id === id);
  e.vehicules = (e.vehicules ?? []).filter((v) => v.id !== id);
  // Une caravane logeait peut-être des figurines, un fourgon employait :
  // rien ne pend à un véhicule disparu.
  e.pnjs = e.pnjs.map((p) =>
    p.batimentId === id
      ? { ...p, batimentId: null }
      : p.travailBatimentId === id
        ? { ...p, travailBatimentId: null }
        : p,
  );
  if (parti) raconter(e, parti.nom + " quitte la ville. Bonne route !");
  return e;
}

// ---------- Arbitrages du maître du jeu (v1.26) ----------

/**
 * Le maître du jeu tranche un incident en attente (v1.26, arbitrage
 * Thibaut 2026-11-08) : la simulation ne décide PLUS de l'issue — le
 * joueur choisit parmi les propositions (l'issue attendue est suggérée,
 * la pire est marquée), le jeu applique les L de l'issue choisie sur la
 * photographie des moyens du jour de l'incident, et l'affaire quitte la
 * file. La partie n'est jamais bloquée : un incident non arbitré attend,
 * puis la pire issue s'impose au bout du délai.
 */
export function resoudreArbitrage(etat: Etat, arbitrageId: string, propositionId: string): Etat {
  const e = structuredClone(etat);
  const i = (e.arbitrages ?? []).findIndex((a) => a.id === arbitrageId);
  if (i < 0) return e;
  const [arb] = e.arbitrages!.splice(i, 1);
  for (const r of appliquerArbitrage(e, arb, propositionId)) {
    e.journal.push(r);
  }
  return e;
}

// ---------- Chantiers (v1.27 : tout se construit, plus de création instantanée) ----------

/** Options de lancement d'un chantier (défauts : travaux 100, coût = 50 % de la valeur). */
export interface OptionsChantier {
  /** Payeur : null = la ville ; sinon la figurine qui commande (acteur privé). */
  payeurPnjId?: string | null;
  /** Valeur totale des travaux (défaut TRAVAUX_DEFAUT = 100). */
  travauxTotal?: number;
  /** Coût total en centimes (défaut : la moitié de la valeur de la cible). */
  coutCentimes?: number;
}

/**
 * Lance le chantier d'un bâtiment (v1.27, arbitrage Thibaut 2026-11-08) :
 * le bâtiment entre en ville EN CONSTRUCTION (visible, capacités
 * inactives) et rejoint la file des chantiers — c'est le BTP local qui
 * le construit ; sans BTP en ville, il avance à la main (1 travail/
 * jour, sans paiement). Le coût se règle au prorata de l'avancement :
 * la ville paie pour un acteur public, la figurine commanditaire pour
 * un acteur privé. Un seul chantier avance par jour (FIFO).
 */
export function lancerChantierBatiment(etat: Etat, bat: Batiment, opts?: OptionsChantier): Etat {
  const e = structuredClone(etat);
  const travauxTotal = Math.max(1, Math.round(opts?.travauxTotal ?? TRAVAUX_DEFAUT));
  const cout = Math.max(0, Math.round(opts?.coutCentimes ?? coutChantier(bat.valeur)));
  const payeur =
    opts?.payeurPnjId !== undefined && opts.payeurPnjId !== null
      ? e.pnjs.find((p) => p.id === opts.payeurPnjId)
      : null;
  const chantier: Chantier = {
    id: nouvelId("cha"),
    jour: e.jour,
    cibleBatimentId: bat.id,
    cibleVehiculeId: null,
    payeurPnjId: payeur ? payeur.id : null,
    travauxTotal,
    travauxFaits: 0,
    coutCentimes: cout,
    coutPaye: 0,
  };
  e.batiments.push({ ...bat, enConstruction: true });
  e.chantiers = [...(e.chantiers ?? []), chantier];
  const btp = serviceLocal(e, "btp");
  raconter(
    e,
    "🏗 " + (btp ? btp.bat.nom + " ouvre le chantier" : "La ville ouvre le chantier") +
      " de " + bat.nom + " : " + travauxTotal + " travaux" +
      (btp ? " — ses ouvriers et ses engins y travailleront chaque jour" : " — sans BTP en ville, il avance à la main (1 travail/jour)") +
      ", " + montantL(cout) + " réglés au fil de l'eau par " +
      (payeur ? payeur.prenom + " " + payeur.nom : "la ville") +
      (e.chantiers.length > 1 ? " ; il attend son tour derrière les chantiers en cours" : "") +
      ".",
  );
  return e;
}

/**
 * Lance le chantier d'un véhicule (v1.27) : le véhicule entre en ville EN
 * CONSTRUCTION (pas d'essence, pas de rôle) — c'est la station-service
 * locale qui l'assemble ; sans station en ville, il avance à la main.
 */
export function lancerChantierVehicule(etat: Etat, veh: Vehicule, opts?: OptionsChantier): Etat {
  const e = structuredClone(etat);
  const travauxTotal = Math.max(1, Math.round(opts?.travauxTotal ?? TRAVAUX_DEFAUT));
  const cout = Math.max(0, Math.round(opts?.coutCentimes ?? coutChantier(veh.valeur)));
  const payeur =
    opts?.payeurPnjId !== undefined && opts.payeurPnjId !== null
      ? e.pnjs.find((p) => p.id === opts.payeurPnjId)
      : null;
  const chantier: Chantier = {
    id: nouvelId("cha"),
    jour: e.jour,
    cibleBatimentId: null,
    cibleVehiculeId: veh.id,
    payeurPnjId: payeur ? payeur.id : veh.categorie === "prive" ? veh.proprietairePnjId : null,
    travauxTotal,
    travauxFaits: 0,
    coutCentimes: cout,
    coutPaye: 0,
  };
  e.vehicules = [...(e.vehicules ?? []), { ...veh, enConstruction: true }];
  e.chantiers = [...(e.chantiers ?? []), chantier];
  const station = serviceLocal(e, "garage");
  raconter(
    e,
    "🏗 " + (station ? station.bat.nom + " ouvre l'atelier" : "La ville ouvre le chantier") +
      " de " + veh.nom + " : " + travauxTotal + " travaux" +
      (station ? " — ses mécaniciens et les engins y travailleront chaque jour" : " — sans station-service en ville, il avance à la main (1 travail/jour)") +
      ", " + montantL(cout) + " réglés au fil de l'eau par " +
      (chantier.payeurPnjId !== null
        ? (() => {
            const p = e.pnjs.find((x) => x.id === chantier.payeurPnjId);
            return p ? p.prenom + " " + p.nom : "son commanditaire";
          })()
        : "la ville") +
      ".",
  );
  return e;
}

/**
 * Le maître du jeu priorise un chantier : il passe en tête de la file —
 * c'est lui qui avance au prochain règlement (un seul chantier par jour).
 */
export function prioriserChantier(etat: Etat, id: string): Etat {
  const e = structuredClone(etat);
  const file = e.chantiers ?? [];
  const i = file.findIndex((c) => c.id === id);
  if (i <= 0) return e;
  const [ch] = file.splice(i, 1);
  file.unshift(ch);
  raconter(
    e,
    "🏗 Le maître du jeu priorise le chantier de " + nomCible(e, ch) +
      " : c'est lui qui avancera au prochain règlement, les autres patientent.",
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
