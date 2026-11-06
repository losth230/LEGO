// Types du monde LEGO — moteur pur, aucune dépendance React.
// CONVENTION MONNAIE : tous les montants du moteur sont des ENTIERS en centimes
// de LEGO (1 L = 100 centimes). L'UI convertit à l'affichage. Les entiers
// garantissent la conservation exacte de la monnaie (cahier des charges §4.3).

export type Statut = "agent_public" | "commercant" | "prive";

export type TypeBatiment = "habitation" | "commerce" | "service_public";

/**
 * Vocation d'un commerce (monde 100 % fermé, arbitrage 2026-11-06) :
 * - null : boutique de consommation (achats des habitants, fonctionnement municipal) ;
 * - "sante" : hôpital/clinique — facture les soins des accidents ;
 * - "btp" : entreprise de construction — répare les dégâts d'incendie ;
 * - "banque" : banque locale — prête à la ville, encaisse intérêts et remboursements.
 * Sans service à vocation en ville, aucune activité ni frais lié à ce service.
 */
export type Vocation = "sante" | "btp" | "banque";

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
  /**
   * Lieu de travail d'un employé privé (commerce) — modèle flux, phase 3.6.
   * Le patron (commerçant) garde sa boutique dans batimentId ; l'employé
   * habite dans batimentId et travaille ici.
   */
  travailBatimentId?: string | null;
  /** Revenu indicatif quotidien en centimes — salaire contractuel des employés privés (modèle flux) et base du budget d'achat. */
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
  /** Coût de fonctionnement quotidien en centimes (services publics) — acheté sur place si une boutique est ouverte, sinon non dépensé (circuit fermé). */
  coutFonctionnement: number;
  /** Capacité : logements (habitation) ou postes de travail (commerce, service). */
  capacite: number;
  /** Vocation du commerce (2026-11-06) : null = boutique de consommation ; sinon service local (santé, BTP, banque). */
  vocation?: Vocation | null;
}

export type TypeJournal =
  | "impots"
  | "salaires"
  | "fonctionnement"
  | "dette"
  | "achats"
  | "flux"
  | "incident"
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
  /**
   * Coefficient d'intensité des événements K (défaut 1 000, cahier §5).
   * Curseur d'amusement personnel : la proba quotidienne d'un incident
   * est R × P × K / 10000 / 365 — une petite ville monte K pour vivre
   * au même rythme qu'une grande (arbitrage 2026-11-05 : K adaptatif).
   */
  coeffIntensite: number;
}

export interface Etat {
  schemaVersion: number;
  jour: number;
  nomVille: string;
  /** Budget municipal en centimes. */
  budgetVille: number;
  /** Sorties vers l'extérieur en centimes : plus alimentée depuis le monde 100 % fermé (2026-11-06), reste à 0 à jamais. */
  sortiesCumulees: number;
  /** Pertes disparues du circuit en centimes — uniquement les vols d'avant la réforme du monde fermé ; les butins vont désormais aux voleurs (volsCumules). */
  pertesCumulees: number;
  /** Cumul des butins remis aux voleurs en centimes — transferts internes entre figurants : la monnaie ne disparaît plus (monde fermé, 2026-11-06). */
  volsCumules: number;
  /** Encours de dette bancaire en centimes (intérêts réels : référentiel). */
  dette: number;
  /** Création monétaire cumulée : somme des emprunts contractés. Les remboursements vont à la banque locale et ne détruisent plus de monnaie (monde fermé, 2026-11-06). */
  mouvementsBanqueCumules: number;
  params: ParamsVille;
  pnjs: Pnj[];
  batiments: Batiment[];
  /**
   * Recettes du dernier jour par commerce (centimes) — modèle flux, phase 3.6.
   * Sert au calibrage des effectifs (effectif_max ≈ 0,88 × recettes / 57,75).
   */
  recettesCommerce?: Record<string, number>;
  journal: JournalEntree[];
}
