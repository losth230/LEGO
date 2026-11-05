// Types du monde LEGO — moteur pur, aucune dépendance React.
// CONVENTION MONNAIE : tous les montants du moteur sont des ENTIERS en centimes
// de LEGO (1 L = 100 centimes). L'UI convertit à l'affichage. Les entiers
// garantissent la conservation exacte de la monnaie (cahier des charges §4.3).

export type Statut = "agent_public" | "commercant" | "prive";

export type TypeBatiment = "habitation" | "commerce" | "service_public";

export type EtatBatiment = "neuf" | "bon" | "degrade" | "sinistre";

export interface Pnj {
  id: string;
  prenom: string;
  nom: string;
  age: number;
  genre: "F" | "M";
  /** Étiquette narrative (ex. « vendeur de frites », « professeure »). */
  metier: string;
  statut: Statut;
  /** Clé de grille salariale (référentiel salaires_publics_nets_par_jour) si agent_public. */
  grade?: string;
  /** Bâtiment lié : logement (habitation), boutique (commerce) ou service (service public). */
  batimentId: string | null;
  /** Revenu indicatif quotidien en centimes — assiette fiscale (cahier des charges §3.2). */
  revenuIndicatif: number;
  /** Budget d'achat quotidien en centimes (dépense dans les commerces). */
  budgetAchat: number;
  /** Compte courant en centimes. */
  compte: number;
  /** Épargne en centimes (touched uniquement par l'éditeur en phase 1). */
  epargne: number;
}

export interface Batiment {
  id: string;
  nom: string;
  type: TypeBatiment;
  quartier: string;
  /** Valeur en centimes (dépréciée par les sinistres en phase 2). */
  valeur: number;
  etat: EtatBatiment;
  /** Coût de fonctionnement quotidien en centimes (services publics) — sortie du circuit. */
  coutFonctionnement: number;
  /** Capacité : logements (habitation) ou postes de travail (commerce, service). */
  capacite: number;
}

export type TypeJournal =
  | "impots"
  | "salaires"
  | "fonctionnement"
  | "achats"
  | "solde"
  | "systeme";

export interface JournalEntree {
  jour: number;
  type: TypeJournal;
  texte: string;
  /** Montant en centimes si pertinent. */
  montant?: number;
}

export interface ParamsVille {
  /** Taux d'imposition quotidien en points de base (762 = 7,62 %). */
  tauxImpotBp: number;
}

export interface Etat {
  schemaVersion: number;
  jour: number;
  nomVille: string;
  /** Budget municipal en centimes. */
  budgetVille: number;
  /** Cumul des sorties vers les fournisseurs extérieurs en centimes. */
  sortiesCumulees: number;
  params: ParamsVille;
  pnjs: Pnj[];
  batiments: Batiment[];
  journal: JournalEntree[];
}
