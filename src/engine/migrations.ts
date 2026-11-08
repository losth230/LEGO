// Registre de migrations de l'état (retour d'expérience Chasse & Pêche) :
// toute ingestion (localStorage, import JSON) passe par migrerEtat, qui
// complète les champs manquants plutôt que de crasher. Les migrations
// d'une version à l'autre se contentent de compléter, jamais de jeter
// une ville en cours (sauf état irrécupérable).

import type { Etat, Pnj, Vehicule, Vocation } from "./types.ts";
import { createMondeDefaut, PAIRS_TRAITS } from "./monde.ts";
import { COEFF_INTENSITE_DEFAUT, TAUX_IMPOT_DEFAUT_BP } from "./referentiel.ts";

export const SCHEMA_VERSION_ETAT = 10;

/**
 * Carte d'identité (migration v8, phase 3.9) : traits attribués en rotation
 * déterministe — deux habitants sur dix-neuf passent du mauvais côté de la
 * barrière, pour que le crime continue d'exister dans les vieilles villes.
 */
function traitsMigres(i: number): string[] {
  if (i % 19 === 5) return ["cupide", "discret"];
  if (i % 19 === 12) return ["opportuniste", "téméraire"];
  return PAIRS_TRAITS[i % PAIRS_TRAITS.length];
}

/** Ancien taux d'impôt par défaut (v6 : 10 % des gains du jour). */
const ANCIEN_TAUX_IMPOT_DEFAUT_BP = 1000;

/** Normalise un état inconnu (localStorage corrompu, version future, import). */
export function migrerEtat(brut: unknown): Etat {
  if (brut === null || typeof brut !== "object") {
    return createMondeDefaut();
  }
  const b = brut as Partial<Etat> & { schemaVersion?: unknown };
  const version = typeof b.schemaVersion === "number" ? b.schemaVersion : 0;
  // Version inconnue (future) ou état irrécupérable : nouveau monde.
  if (version > SCHEMA_VERSION_ETAT) {
    return createMondeDefaut();
  }

  const defaut = createMondeDefaut();

// Corrections 2026-11-06 (référentiels v1.12 puis v1.13) : grilles resserrées à trois
// grades par corps (arbitrage Thibaut). Une figurine sauvegardée avec un
// grade retiré est convertie vers le grade conservé au salaire le plus
// proche — elle garde sa solde et sa fonction de garde (le suffixe du
// corps est préservé par construction).
const GRADES_RETIRES: Record<string, string> = {
  // Police : brigadier et brigadier chef disparaissent ; l'inspecteur
  // disparaît aussi (v1.13 : métier à part, remplacé par le commissaire
  // au sommet du corps) — converti au salaire le plus proche, le major.
  brigadier_pm: "policier_municipal",
  brigadier_chef_pm: "major_pm",
  inspecteur_pm: "major_pm",
  // Pompiers : 9 grades intermédiaires disparaissent.
  sapeur_1re_classe_spp: "sapeur_pompier_debutant",
  caporal_spp: "sapeur_pompier_debutant",
  caporal_chef_spp: "sergent_spp",
  adjudant_spp: "sergent_spp",
  adjudant_chef_spp: "sergent_spp",
  lieutenant_spp: "sergent_spp",
  capitaine_spp: "sergent_spp",
  commandant_spp: "sergent_spp",
  lieutenant_colonel_spp: "colonel_spp",
  // Armée : 12 grades disparaissent, la garnison (soldat, caporal,
  // capitaine) tient entière dans la grille conservée.
  caporal_chef_armee: "caporal_armee",
  sergent_armee: "caporal_armee",
  sergent_chef_armee: "caporal_armee",
  sous_lieutenant_armee: "caporal_armee",
  adjudant_armee: "caporal_armee",
  adjudant_chef_armee: "caporal_armee",
  major_armee: "caporal_armee",
  lieutenant_armee: "caporal_armee",
  commandant_armee: "capitaine_armee",
  lieutenant_colonel_armee: "capitaine_armee",
  colonel_armee: "capitaine_armee",
  general_armee: "capitaine_armee",
  // Mairie (v1.22) : la propreté n'a pas besoin de grades multiples
  // (arbitrage Thibaut) — retour au grade unique, adjoint technique.
  agent_maitrise: "adjoint_technique",
  technicien_territorial: "adjoint_technique",
};
  // Migration v3 -> v4 : modèle flux (phase 3.6) — lieu de travail des
  // employés privés et recettes du dernier jour par commerce.
  // Migration v5 -> v6 (monde 100 % fermé, 2026-11-06) : vocation des
  // commerces (santé, BTP, banque) — complétée à null (boutique) si absente.
  // Le callback est typé « : Pnj » : le type contextuel empêche les
  // littéraux ("M"/"F") de s'élargir en string — leçon de la CI du
  // 2026-11-06, la normalisation des scalaires doit rester typée.
  const pnjs = (Array.isArray(b.pnjs) ? b.pnjs : defaut.pnjs).map((p, i): Pnj => ({
    ...p,
    // Contrat de formes (découpe des tests du 2026-11-06) : une sauvegarde
    // incomplète ou hostile ne doit jamais produire un PNJ mal formé —
    // les champs scalaires de base sont complétés comme nouveauPnj le fait.
    id:
      typeof (p as Partial<Pnj>).id === "string" && (p as Partial<Pnj>).id !== ""
        ? (p as Partial<Pnj>).id!
        : "pnj-mig-" + i + "-" + version,
    prenom:
      typeof (p as Partial<Pnj>).prenom === "string" ? (p as Partial<Pnj>).prenom! : "",
    nom: typeof (p as Partial<Pnj>).nom === "string" ? (p as Partial<Pnj>).nom! : "",
    age: typeof (p as Partial<Pnj>).age === "number" ? (p as Partial<Pnj>).age! : 40,
    genre: (p as Partial<Pnj>).genre === "M" ? "M" : "F",
    metier: typeof (p as Partial<Pnj>).metier === "string" ? (p as Partial<Pnj>).metier! : "sans profession",
    batimentId:
      typeof (p as Partial<Pnj>).batimentId === "string" ? (p as Partial<Pnj>).batimentId! : null,
    revenuIndicatif:
      typeof (p as Partial<Pnj>).revenuIndicatif === "number" ? (p as Partial<Pnj>).revenuIndicatif! : 0,
    budgetAchat:
      typeof (p as Partial<Pnj>).budgetAchat === "number" ? (p as Partial<Pnj>).budgetAchat! : 0,
    compte: typeof (p as Partial<Pnj>).compte === "number" ? (p as Partial<Pnj>).compte! : 0,
    epargne: typeof (p as Partial<Pnj>).epargne === "number" ? (p as Partial<Pnj>).epargne! : 0,
    // Grades retirés (v1.12) : conversion vers le grade conservé au salaire
    // le plus proche, pour que l'ancienne figurine reste payée et de garde.
    grade:
      typeof (p as Partial<{ grade?: string | null }>).grade === "string"
        ? (GRADES_RETIRES[(p as Partial<{ grade?: string | null }>).grade!] ??
          (p as Partial<{ grade?: string | null }>).grade!)
        : undefined,
    statut:
      (p as Partial<Pnj>).statut === "agent_public" || (p as Partial<Pnj>).statut === "commercant"
        ? (p as Partial<Pnj>).statut!
        : "prive",
    travailBatimentId:
      (p as Partial<{ travailBatimentId?: string | null }>).travailBatimentId ?? null,
    // Migration v7 -> v8 (phase 3.9, milieu criminel) : carte d'identité —
    // personnalité, casier judiciaire, gang et assignation à résidence.
    personnalite: Array.isArray((p as Partial<{ personnalite?: string[] }>).personnalite)
      ? (p as Partial<{ personnalite?: string[] }>).personnalite
      : traitsMigres(i),
    casier:
      typeof (p as Partial<{ casier?: number }>).casier === "number"
        ? (p as Partial<{ casier?: number }>).casier
        : 0,
    gangId:
      typeof (p as Partial<{ gangId?: string | null }>).gangId === "string"
        ? (p as Partial<{ gangId?: string | null }>).gangId
        : null,
    arreteJusqua:
      typeof (p as Partial<{ arreteJusqua?: number }>).arreteJusqua === "number"
        ? (p as Partial<{ arreteJusqua?: number }>).arreteJusqua
        : 0,
  }));
  const batiments = (Array.isArray(b.batiments) ? b.batiments : defaut.batiments).map((x) => {
    // Correction 2026-11-06 (v1.15) : plus de vocation « prison » — les détenus
    // sont gardés au commissariat. Un bâtiment sauvegardé sous v1.14 avec
    // l'ancienne vocation « prison » redevient une boutique ordinaire.
    const vocationBrute = (x as Partial<{ vocation?: unknown }>).vocation;
    // Migration v8 -> v9 (v1.24) : la capacité unique se dédouble — un
    // bâtiment peut à la fois loger des figurines et employer du monde.
    // L'ancienne valeur est répartie selon le type (habitation -> logements,
    // commerce et service public -> postes), jamais perdue.
    const capaciteBrute = (x as Partial<{ capacite?: unknown }>).capacite;
    const capacite = typeof capaciteBrute === "number" ? capaciteBrute : 0;
    const logementsBrut = (x as Partial<{ capaciteLogements?: unknown }>).capaciteLogements;
    const postesBrut = (x as Partial<{ capacitePostes?: unknown }>).capacitePostes;
    const habitation = x.type === "habitation";
    return {
      id: typeof x.id === "string" ? x.id : "",
      nom: typeof x.nom === "string" ? x.nom : "",
      type: x.type,
      quartier: typeof x.quartier === "string" ? x.quartier : "Centre",
      valeur: typeof x.valeur === "number" ? x.valeur : 0,
      etat: x.etat,
      coutFonctionnement: typeof x.coutFonctionnement === "number" ? x.coutFonctionnement : 0,
      capaciteLogements:
        typeof logementsBrut === "number" ? logementsBrut : habitation ? capacite : 0,
      capacitePostes: typeof postesBrut === "number" ? postesBrut : habitation ? 0 : capacite,
      vocation:
        vocationBrute === "prison" ? null : ((vocationBrute as Vocation | null) ?? null),
    };
  });
  // Migration v9 -> v10 (v1.25) : les véhicules débarquent — un état v9 ou
  // moins n'en a pas, le tableau est complété à vide ; les champs manquants
  // d'un véhicule d'import tordu sont complétés au défaut, jamais devinés.
  const vehicules: Vehicule[] = (Array.isArray(b.vehicules) ? b.vehicules : []).map((v) => {
    const roleBrut = (v as Partial<{ role?: unknown }>).role;
    const categorieBrute = (v as Partial<{ categorie?: unknown }>).categorie;
    return {
      id: typeof v.id === "string" && v.id !== "" ? v.id : "",
      nom: typeof v.nom === "string" ? v.nom : "",
      categorie: categorieBrute === "municipal" || categorieBrute === "prive" ? categorieBrute : "prive",
      role:
        roleBrut === "pompiers" || roleBrut === "police" || roleBrut === "proprete" || roleBrut === "sante"
          ? roleBrut
          : null,
      quartier: typeof v.quartier === "string" ? v.quartier : "Centre",
      valeur: typeof v.valeur === "number" && v.valeur >= 0 ? v.valeur : 0,
      etat: v.etat === "neuf" || v.etat === "bon" || v.etat === "degrade" || v.etat === "sinistre" ? v.etat : "bon",
      essenceJour: typeof v.essenceJour === "number" && v.essenceJour >= 0 ? v.essenceJour : 0,
      capaciteLogements: typeof v.capaciteLogements === "number" && v.capaciteLogements >= 0 ? v.capaciteLogements : 0,
      capacitePostes: typeof v.capacitePostes === "number" && v.capacitePostes >= 0 ? v.capacitePostes : 0,
      proprietairePnjId:
        typeof (v as Partial<{ proprietairePnjId?: unknown }>).proprietairePnjId === "string"
          ? (v as Partial<{ proprietairePnjId?: string }>).proprietairePnjId!
          : null,
      gangId:
        typeof (v as Partial<{ gangId?: unknown }>).gangId === "string"
          ? (v as Partial<{ gangId?: string }>).gangId!
          : null,
      garageBatimentId:
        typeof (v as Partial<{ garageBatimentId?: unknown }>).garageBatimentId === "string"
          ? (v as Partial<{ garageBatimentId?: string }>).garageBatimentId!
          : null,
    };
  });
  const journal = Array.isArray(b.journal) ? b.journal : defaut.journal;
  const recettesCommerce =
    b.recettesCommerce !== null && typeof b.recettesCommerce === "object"
      ? (b.recettesCommerce as Record<string, number>)
      : {};

  // Migration v1 -> v2 : K éditable (params.coeffIntensite) et pertes cumulées.
  // Migration v4 -> v5 (arbitrage 2026-11-06) : l'impôt change de base
  // (revenu indicatif -> gains réels du jour, prélevés à la source) ; un taux
  // réglé sous l'ancienne base n'a plus de sens, retour au défaut (10 %).
  // À partir de v5, le taux choisi par le joueur est conservé tel quel.
  const paramsBrut = (b.params ?? defaut.params) as Partial<Etat["params"]>;
  const tauxImpotConserve =
    typeof paramsBrut.tauxImpotBp === "number" ? paramsBrut.tauxImpotBp : defaut.params.tauxImpotBp;
  // Migration v6 -> v7 : le défaut passe à 30 % (arbitrage Thibaut
  // 2026-11-06) — une ville restée à l'ancien défaut de 10 % monte au
  // nouveau taux ; un taux réellement choisi reste le sien.
  const tauxBrut = version >= 5 ? tauxImpotConserve : TAUX_IMPOT_DEFAUT_BP;
  const tauxImpotBp =
    version < 7 && tauxBrut === ANCIEN_TAUX_IMPOT_DEFAUT_BP
      ? TAUX_IMPOT_DEFAUT_BP
      : tauxBrut;
  const params: Etat["params"] = {
    tauxImpotBp,
    coeffIntensite:
      typeof paramsBrut.coeffIntensite === "number" && paramsBrut.coeffIntensite >= 1
        ? Math.round(paramsBrut.coeffIntensite)
        : COEFF_INTENSITE_DEFAUT,
  };
  const pertesCumulees =
    typeof b.pertesCumulees === "number" ? b.pertesCumulees : 0;
  // Migration v6 -> v7 (monde fermé, arbitrage 2026-11-06) : le crime ne
  // détruit plus la monnaie — les butins vont aux voleurs, volsCumules
  // compte les transferts depuis la réforme.
  const volsCumules = typeof b.volsCumules === "number" ? b.volsCumules : 0;
  // Migration v2 -> v3 : dette bancaire et mouvements de capitaux (phase 3).
  const dette = typeof b.dette === "number" ? b.dette : 0;
  const mouvementsBanqueCumules =
    typeof b.mouvementsBanqueCumules === "number" ? b.mouvementsBanqueCumules : 0;

  return {
    schemaVersion: SCHEMA_VERSION_ETAT,
    jour: typeof b.jour === "number" ? b.jour : 0,
    nomVille: typeof b.nomVille === "string" ? b.nomVille : defaut.nomVille,
    budgetVille: typeof b.budgetVille === "number" ? b.budgetVille : 0,
    sortiesCumulees: typeof b.sortiesCumulees === "number" ? b.sortiesCumulees : 0,
    pertesCumulees,
    volsCumules,
    dette,
    mouvementsBanqueCumules,
    // Migration v7 -> v8 : gangs de la ville et affrontements cumulés.
    gangs: Array.isArray(b.gangs) ? b.gangs : [],
    affrontementsCumules:
      typeof b.affrontementsCumules === "number" ? b.affrontementsCumules : 0,
    params,
    pnjs,
    batiments,
    vehicules,
    journal,
    recettesCommerce,
  };
}
