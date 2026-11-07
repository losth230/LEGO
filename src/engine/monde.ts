// Monde par défaut et mutateurs d'édition (phase 1 — MVP).
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

const PRENOMS_F = "Adèle:Camille:Delphine:Émilie:Fantine:Gabrielle:Hélène:Inès:Juliette:Louise:Manon:Nora:Océane:Paloma:Rosa:Sylvie:Tiphaine:Véra:Yasmine:Zoé:Brigitte:Élodie:Léa:Karima:Fatou".split(":");
const PRENOMS_M = "Antoine:Bastien:Célestin:Damien:Étienne:Félix:Gaël:Hugo:Ibrahim:Jules:Kévin:Léo:Marco:Nicolas:Oscar:Pierre:Quentin:Raphaël:Sacha:Tanguy:Ulysse:Victor:Xavier:Yann:Zaïd:Jean:Karim:Mario".split(":");
const NOMS = "Arnaud:Berthier:Castella:Dupont:Escoffier:Faure:Guibert:Hoarau:Imbert:Jouvet:Kaczmarek:Lambert:Marchand:Nguyen:Orsini:Perrin:Quintal:Roussel:Sabatini:Thibault:Ursini:Vasseur:Winkler:Yven:Zeller:Rossi:Benali:Garnier".split(":");


/** Le monde par défaut : 14 bâtiments, 58 figurines (monde fermé 2026-11-06, brigade municipale v1.21). */
export function createMondeDefaut(): Etat {
  compteur = 0;

  const batiments: Batiment[] = [
    nouveauBatiment({ nom: "Mairie de Bricke-en-Provence", type: "service_public", quartier: "Centre", valeur: 1200000, etat: "neuf", coutFonctionnement: 2000, capacite: 6 }),
    nouveauBatiment({ nom: "Poste de police", type: "service_public", quartier: "Centre", valeur: 800000, coutFonctionnement: 1500, capacite: 4 }),
    nouveauBatiment({ nom: "Caserne de pompiers", type: "service_public", quartier: "Nord", valeur: 900000, coutFonctionnement: 1500, capacite: 6 }),
    nouveauBatiment({ nom: "Le Fournil Doré (boulangerie)", type: "commerce", quartier: "Centre", valeur: 400000, capacite: 2 }),
    nouveauBatiment({ nom: "Chez Mario (friterie)", type: "commerce", quartier: "Port", valeur: 250000, capacite: 2 }),
    nouveauBatiment({ nom: "Quincaillerie du Port", type: "commerce", quartier: "Port", valeur: 300000, capacite: 2 }),
    // Services locaux à vocation (monde 100 % fermé, arbitrage 2026-11-06) :
    // sans eux, aucune mécanique liée (soins, réparations, emprunts).
    nouveauBatiment({ nom: "Hôpital Sainte-Brique", type: "commerce", quartier: "Nord", valeur: 1000000, etat: "neuf", capacite: 4, vocation: "sante" }),
    nouveauBatiment({ nom: "Bâtisseurs du Sud (BTP)", type: "commerce", quartier: "Sud", valeur: 350000, capacite: 4, vocation: "btp" }),
    nouveauBatiment({ nom: "Banque de Bricke-en-Provence", type: "commerce", quartier: "Centre", valeur: 800000, capacite: 2, vocation: "banque" }),
    // Phase 3.10 (correction Thibaut 2026-11-06) : les détenus sont gardés
    // au Poste de police, pas dans un bâtiment dédié — pas de maison d'arrêt.
    nouveauBatiment({ nom: "Les Terrasses (immeuble)", type: "habitation", quartier: "Centre", valeur: 1500000, capacite: 16 }),
    nouveauBatiment({ nom: "Maison des Dupont", type: "habitation", quartier: "Nord", valeur: 350000, capacite: 4 }),
    nouveauBatiment({ nom: "Résidence du Stade", type: "habitation", quartier: "Sud", valeur: 900000, capacite: 20 }),
    nouveauBatiment({ nom: "Maison de la Colline", type: "habitation", quartier: "Nord", valeur: 300000, capacite: 6 }),
    nouveauBatiment({ nom: "Caserne militaire du Sud", type: "service_public", quartier: "Sud", valeur: 1100000, etat: "neuf", coutFonctionnement: 3000, capacite: 8 }),
  ];

  const idMairie = batiments[0].id;
  const idPolice = batiments[1].id;
  const idCaserne = batiments[2].id;
  const idBoulangerie = batiments[3].id;
  const idFriterie = batiments[4].id;
  const idQuincaillerie = batiments[5].id;
  const idHopital = batiments[6].id;
  const idBtp = batiments[7].id;
  const idBanque = batiments[8].id;
  const immeubles = [batiments[9].id, batiments[10].id, batiments[11].id, batiments[12].id];
  const idStade = immeubles[2]; // Résidence du Stade (Sud) — fief des Corbeaux
  const idCaserneMilitaire = batiments[13].id;

  const pnjs: Pnj[] = [];

  // Agents publics (3) — salaires réels grilles FPT 2025 (voir référentiel).
  pnjs.push(nouveauPnj({ prenom: "Brigitte", nom: "Roussel", age: 52, genre: "F", metier: "secrétaire de mairie", statut: "agent_public", grade: "adjoint_technique", batimentId: idMairie, revenuIndicatif: 4500 }));
  // Brigade municipale (v1.21) : les agents techniques de la ville existent
  // enfin — balayeurs, éboueurs, chef d'équipe de la voirie (grilles FPT
  // 2025, corps Mairie du référentiel v1.15). Comptent pour la garde de
  // rien : ils balayent, la ville leur doit ses soldes.
  pnjs.push(nouveauPnj({ prenom: "Gérard", nom: "Lavigne", age: 58, genre: "M", metier: "balayeur municipal", statut: "agent_public", grade: "adjoint_technique", batimentId: idMairie, revenuIndicatif: 4830 }));
  pnjs.push(nouveauPnj({ prenom: "Solène", nom: "Pichon", age: 36, genre: "F", metier: "éboueuse", statut: "agent_public", grade: "adjoint_technique", batimentId: idMairie, revenuIndicatif: 4830 }));
  pnjs.push(nouveauPnj({ prenom: "Robert", nom: "Vidal", age: 47, genre: "M", metier: "chef d'équipe de la voirie", statut: "agent_public", grade: "agent_maitrise", batimentId: idMairie, revenuIndicatif: 5500 }));
  pnjs.push(nouveauPnj({ prenom: "Karim", nom: "Benali", age: 34, genre: "M", metier: "policier municipal", statut: "agent_public", grade: "policier_municipal", batimentId: idPolice, revenuIndicatif: 5300 }));
  pnjs.push(nouveauPnj({ prenom: "Élodie", nom: "Garnier", age: 29, genre: "F", metier: "sapeur-pompier", statut: "agent_public", grade: "sapeur_pompier_debutant", batimentId: idCaserne, revenuIndicatif: 5800 }));
  // Garnison (3) — branche militaire, soldes réelles 2025 (grilles NPRM, voir référentiel).
  pnjs.push(nouveauPnj({ prenom: "Rémi", nom: "Fontaine", age: 22, genre: "M", metier: "soldat", statut: "agent_public", grade: "soldat_armee", batimentId: idCaserneMilitaire, revenuIndicatif: 1300 }));
  pnjs.push(nouveauPnj({ prenom: "Aline", nom: "Mercier", age: 31, genre: "F", metier: "caporal", statut: "agent_public", grade: "caporal_armee", batimentId: idCaserneMilitaire, revenuIndicatif: 1500 }));
  pnjs.push(nouveauPnj({ prenom: "Hugo", nom: "Delattre", age: 45, genre: "M", metier: "capitaine", statut: "agent_public", grade: "capitaine_armee", batimentId: idCaserneMilitaire, revenuIndicatif: 2600 }));

  // Commerçants (3).
  pnjs.push(nouveauPnj({ prenom: "Jean", nom: "Castella", age: 47, genre: "M", metier: "boulanger", statut: "commercant", batimentId: idBoulangerie, revenuIndicatif: 6000, compte: 600000 }));
  pnjs.push(nouveauPnj({ prenom: "Mario", nom: "Rossi", age: 41, genre: "M", metier: "vendeur de frites", statut: "commercant", batimentId: idFriterie, revenuIndicatif: 5000, compte: 500000 }));
  pnjs.push(nouveauPnj({ prenom: "Léa", nom: "Kaczmarek", age: 38, genre: "F", metier: "quincaillière", statut: "commercant", batimentId: idQuincaillerie, revenuIndicatif: 5500, compte: 550000 }));

  // Services locaux à vocation (monde 100 % fermé, 2026-11-06) : santé,
  // BTP, banque. Sans gérant, le service est fermé et sa mécanique dort.
  pnjs.push(nouveauPnj({ prenom: "Sofia", nom: "Marchand", age: 44, genre: "F", metier: "cheffe de l'hôpital", statut: "commercant", batimentId: idHopital, revenuIndicatif: 7500, compte: 750000 }));
  pnjs.push(nouveauPnj({ prenom: "Dario", nom: "Costa", age: 39, genre: "M", metier: "chef d'entreprise BTP", statut: "commercant", batimentId: idBtp, revenuIndicatif: 5500, compte: 550000 }));
  pnjs.push(nouveauPnj({ prenom: "Émile", nom: "Verne", age: 51, genre: "M", metier: "banquier", statut: "commercant", batimentId: idBanque, revenuIndicatif: 8000, compte: 800000 }));

  // 39 habitants privés : métiers narratifs, revenus variés autour du médian.
  const metiers: Array<[string, number]> = [
    ["professeure des écoles", 5800], ["pêcheur", 3800], ["ingénieure", 7200], ["médecin", 9000],
    ["retraité", 3000], ["libraire", 4200], ["chauffeur de bus", 4600], ["cuisinière", 4800],
    ["jardinier", 4000], ["photographe", 4400], ["banquière", 8500], ["étudiant", 2000],
    ["facteur", 4200], ["coiffeuse", 4300], ["électricien", 5000], ["artiste peintre", 3300],
    ["infirmière", 5400], ["architecte", 7500], ["fromager", 5200], ["serveur", 3600],
    ["garagiste", 4900], ["vétérinaire", 8200], ["conseillère municipale", 5100], ["prof de sport", 4500],
    ["horlogère", 4700], ["boucher", 5300], ["apicultrice", 3900], ["pilote de ferry", 6800],
    ["restauratrice", 6200], ["sapeuse-pompière volontaire", 4000], ["bouquiniste", 3500], ["agents immobilier", 5600],
    ["musicien", 3100], ["guide touristique", 3900], ["horticultrice", 4100], ["grutier", 5700],
    ["pâtissière", 4900], ["ébéniste", 4600], ["contrôleuse SNCF", 5800],
  ];
  // Noms complets uniques (correctif 2026-11-06) : le journal identifie les
  // figurines par leur nom — deux homonymes faussaient le rattachement (un
  // cambriolage pouvait être porté au casier du mauvais figurant). En cas de
  // collision, on avance dans la liste des noms jusqu'à un nom libre.
  const nomsPris = new Set<string>(pnjs.map((p) => p.prenom + " " + p.nom));
  for (let i = 0; i < metiers.length; i++) {
    const [metier, revenu] = metiers[i];
    const genre: "F" | "M" = i % 2 === 0 ? "F" : "M";
    const prenom = genre === "F" ? PRENOMS_F[i % PRENOMS_F.length] : PRENOMS_M[i % PRENOMS_M.length];
    let idxNom = i % NOMS.length;
    while (nomsPris.has(prenom + " " + NOMS[idxNom % NOMS.length])) idxNom += 1;
    const nom = NOMS[idxNom % NOMS.length];
    nomsPris.add(prenom + " " + nom);
    pnjs.push(
      nouveauPnj({
        prenom,
        nom,
        age: 20 + ((i * 7) % 55),
        genre,
        metier,
        revenuIndicatif: revenu,
        batimentId: immeubles[i % immeubles.length],
      }),
    );
  }

  // Milieu criminel (phase 3.9, arbitrage Thibaut 2026-11-06) :
  // un gang dédié, les Corbeaux du Sud, ancrés à la Résidence du Stade —
  // ils ne volent que sur leur territoire, qui peut s'étendre par la guerre.
  for (const g of [
    { prenom: "Otto", nom: "Sabatini", age: 49, genre: "M", metier: "chef des Corbeaux du Sud", revenu: 1500, compte: 120000, casier: 3, traits: ["cupide", "téméraire"] },
    { prenom: "Nino", nom: "Vasseur", age: 23, genre: "M", metier: "guetteur des Corbeaux", revenu: 1200, compte: 30000, casier: 1, traits: ["opportuniste", "discret"] },
    { prenom: "Rita", nom: "Ursini", age: 27, genre: "F", metier: "receleuse des Corbeaux", revenu: 1800, compte: 45000, casier: 2, traits: ["cupide", "discret"] },
    { prenom: "Sacha", nom: "Zeller", age: 31, genre: "M", metier: "bras droit des Corbeaux", revenu: 2000, compte: 50000, casier: 2, traits: ["opportuniste", "téméraire"] },
  ] as const) {
    pnjs.push(
      nouveauPnj({
        prenom: g.prenom,
        nom: g.nom,
        age: g.age,
        genre: g.genre,
        metier: g.metier,
        statut: "prive",
        batimentId: idStade,
        revenuIndicatif: g.revenu,
        compte: g.compte,
        personnalite: [...g.traits],
        casier: g.casier,
        gangId: "gang-corbeaux",
      }),
    );
  }

  // Indépendants (criminels sans gang) : trois habitants à la marge —
  // petits revenus, traits criminels. Le profil criminel fait le reste.
  const independants: Array<[string, string[]]> = [
    ["étudiant", ["opportuniste", "discret"]],
    ["musicien", ["cupide", "sociable"]],
    ["artiste peintre", ["opportuniste", "téméraire"]],
  ];
  for (const [metierCible, traits] of independants) {
    const p = pnjs.find((x) => x.metier === metierCible);
    if (p) {
      p.personnalite = traits;
      p.compte = 45000; // la faucille : 450 L en tout et pour tout
    }
  }

  // Budgets d'achat aléatoires au départ (arbitrage Thibaut 2026-11-06) :
  // chaque figurine tire une loi log-uniforme entre ×0,5 et ×10 son revenu
  // indicatif — total non recalé, chaque partie démarre différemment.
  // Les figurines ajoutées ensuite dans l'éditeur gardent le défaut
  // (budget = revenu indicatif) et les sauvegardes existantes aussi.
  for (const p of pnjs) {
    p.budgetAchat = budgetAleatoire(p.revenuIndicatif);
  }

  return {
    schemaVersion: 8,
    jour: 0,
    nomVille: "Bricke-en-Provence",
    budgetVille: 500000,
    sortiesCumulees: 0,
    pertesCumulees: 0,
    volsCumules: 0,
    dette: 0,
    mouvementsBanqueCumules: 0,
    gangs: [
      {
        id: "gang-corbeaux",
        nom: "Les Corbeaux du Sud",
        quartiers: ["Sud"],
      },
    ],
    affrontementsCumules: 0,
    params: { tauxImpotBp: TAUX_IMPOT_DEFAUT_BP, coeffIntensite: COEFF_INTENSITE_DEFAUT },
    pnjs,
    batiments,
    journal: [
      {
        jour: 0,
        type: "systeme",
        texte:
          "Jour 0 : " + pnjs.length + " figurines et " + batiments.length +
          " bâtiments attendent que la ville s'anime. Appuie sur « Passer un jour ».",
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
