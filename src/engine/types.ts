// Types du monde LEGO — moteur pur, aucune dépendance React.
// CONVENTION MONNAIE : tous les montants du moteur sont des ENTIERS en centimes
// de LEGO (1 L = 100 centimes). L'UI convertit à l'affichage. Les entiers
// garantissent la conservation exacte de la monnaie (cahier des charges §4.3).

export type Statut = "agent_public" | "commercant" | "prive";

/**
 * Carte d'identité (phase 3.9) : traits de personnalité en liste fermée.
 * Les traits criminels (cupide, opportuniste, téméraire) alimentent le
 * profil criminel ; les traits honnêtes le neutralisent.
 */
export const TRAITS_PNJ = [
  "honnête",
  "travailleur",
  "sociable",
  "prudent",
  "discret",
  "opportuniste",
  "cupide",
  "téméraire",
] as const;
export type TraitPnj = (typeof TRAITS_PNJ)[number];

export type TypeBatiment = "habitation" | "commerce" | "service_public";

/**
 * Vocation d'un commerce (monde 100 % fermé, arbitrage 2026-11-06) :
 * - null : boutique de consommation (achats des habitants, fonctionnement municipal) ;
 * - "sante" : hôpital/clinique — facture les soins des accidents ;
 * - "btp" : entreprise de construction — répare les dégâts d'incendie ;
 * - "banque" : banque locale — prête à la ville, encaisse intérêts et remboursements ;
 * - "prison" : maison d'arrêt — encaisse les frais de détention, et la qualité
 *   du service (gérant présent) décide des chances de rédemption à la
 *   libération (phase 3.10, arbitrage Thibaut 2026-11-06).
 * Sans service à vocation en ville, aucune activité ni frais lié à ce service.
 */
export type Vocation = "sante" | "btp" | "banque" | "prison";

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
  /**
   * Carte d'identité (phase 3.9) : 2 traits de personnalité (liste TRAITS_PNJ).
   * Absent des sauvegardes v7 et moins : la migration v8 l'attribue.
   */
  personnalite?: string[];
  /** Casier judiciaire (phase 3.9) : cambriolages et affrontements commis, même ratés. */
  casier?: number;
  /** Gang d'appartenance (id dans Etat.gangs) — null : indépendant ou honnête citoyen. */
  gangId?: string | null;
  /** Jour de libération si arrêté (0 ou absent : libre). Un détenu ne peut pas voler. */
  arreteJusqua?: number;
}

/**
 * Gang de la ville (phase 3.9, milieu criminel) : un gang ancré dans un
 * quartier opère chez lui ; une guerre gagnée lui ouvre un quartier adjacent
 * (expansion territoriale, arbitrage Thibaut 2026-11-06).
 */
export interface Gang {
  id: string;
  nom: string;
  /** Quartiers où le gang opère : victimes éligibles des cambriolages de ses membres. */
  quartiers: string[];
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
  /** Gangs de la ville (phase 3.9) — un membre de gang vole sur le territoire du gang. */
  gangs?: Gang[];
  /** Affrontements criminels cumulés (guerres de gangs, phase 3.9). */
  affrontementsCumules?: number;
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
