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
 * - "garage" : station-service — vend l'essence et répare les véhicules (v1.25,
 *   arbitrage Thibaut 2026-11-08 : c'est elle qui gère les accidents, pas le BTP).
 * Phase 3.10 (correction Thibaut 2026-11-06) : la détention se joue au
 * commissariat, pas dans un commerce à vocation — pas de vocation « prison ».
 * Sans service à vocation en ville, aucune activité ni frais lié à ce service.
 */
export type Vocation = "sante" | "btp" | "banque" | "garage";

export type EtatBatiment = "neuf" | "bon" | "degrade" | "sinistre";

/**
 * Véhicules (v1.25, arbitrage Thibaut 2026-11-08) : la ville roule. Un
 * véhicule consomme du carburant acheté sur place (monde fermé), peut être
 * municipal (rôle : pompiers, police, propreté, santé) ou privé (propriétaire
 * figurine — volable par le milieu), et porte les mêmes capacités que les
 * bâtiments : logements (caravane) et postes de travail (fourgon du facteur).
 */
export type CategorieVehicule = "municipal" | "prive";
export type RoleVehicule = "pompiers" | "police" | "proprete" | "sante" | "chantier";

export interface Vehicule {
  id: string;
  nom: string;
  categorie: CategorieVehicule;
  /** Rôle municipal (effets de jeu) — null pour un véhicule privé. */
  role: RoleVehicule | null;
  quartier: string;
  /** Valeur en centimes — dépréciée par les collisions non réparées. */
  valeur: number;
  etat: EtatBatiment;
  /** Carburant consommé par jour de route (centimes) — acheté sur place. */
  essenceJour: number;
  /** Capacités comme les bâtiments (v1.24) : logements (caravane) et postes de travail. */
  capaciteLogements: number;
  capacitePostes: number;
  /** Propriétaire (id de figurine) pour un véhicule privé — null pour la flotte municipale. */
  proprietairePnjId: string | null;
  /** Gang possessionnaire si le véhicule a été volé (transfert de propriété, monde fermé). */
  gangId: string | null;
  /** Bâtiment auquel le véhicule est affecté (garage, caserne, boutique) — ses postes s'y ajoutent. */
  garageBatimentId: string | null;
  /** v1.27 : en construction à la station-service — pas d'essence, pas de
   * rôle, pas de capacité active tant que le chantier n'est pas livré. */
  enConstruction?: boolean;
  /** v1.28 : travaux/jour produits sur le chantier en cours par un engin de
   * chantier (rôle « chantier ») qui a roulé — défaut PRODUCTION_ENGIN (2).
   * Ex. démo : la petite bétonnière de Didier (1), le tractopelle de Thomas (2). */
  efficacite?: number;
}

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
  /** Capacités séparées (v1.24) : un bâtiment peut à la fois loger des
   * figurines (batimentId) et offrir des postes de travail (travailBatimentId). */
  capaciteLogements: number;
  capacitePostes: number;
  /** Vocation du commerce (2026-11-06) : null = boutique de consommation ; sinon service local (santé, BTP, banque). */
  vocation?: Vocation | null;
  /** v1.27 : en construction au BTP — le bâtiment est visible sur le
   * chantier mais ses capacités dorment (pas de courses, pas de service,
   * pas de fonctionnement, pas d'incident) jusqu'à la livraison. */
  enConstruction?: boolean;
}

export type TypeJournal =
  | "impots"
  | "salaires"
  | "fonctionnement"
  | "dette"
  | "achats"
  | "essence"
  | "flux"
  | "incident"
  | "arbitrage"
  | "chantier"
  | "solde"
  | "systeme";

export interface JournalEntree {
  jour: number;
  type: TypeJournal;
  texte: string;
  /** Montant en centimes si pertinent. */
  montant?: number;
}

/**
 * Arbitrages du maître du jeu (v1.26, arbitrage Thibaut 2026-11-08) : les
 * incidents surviennent (probabilités du référentiel inchangées) et sont
 * notifiés, mais la simulation ne tranche PLUS l'issue — elle calcule les
 * issues possibles selon les moyens de la ville et offre le choix au
 * joueur ; le jeu applique les L de l'issue choisie. Non arbitré, un
 * incident reste en attente ; au bout de DELAI_ARBITRAGE_JOURS jours, la
 * pire issue s'impose d'elle-même.
 */
export type TypeArbitrage = "incendie" | "cambriolage" | "guerre_gangs" | "collision" | "vol_vehicule" | "accident";

/**
 * Photographie des moyens de la ville AU MOMENT de l'incident : gardes en
 * poste, engins qui ont roulé ce jour-là, services tenus. La résolution
 * (éventuellement des jours plus tard) rejoue l'issue avec ces moyens-là.
 */
export interface MoyensArbitrage {
  /** Effectifs de garde (pompiers, police, armée) le jour de l'incident. */
  pompiers: number;
  police: number;
  armee: number;
  /** Engins municipaux en service (ayant roulé) ce jour-là. */
  camionPompiers: boolean;
  fourgonPolice: boolean;
  camionProprete: boolean;
  ambulance: boolean;
  /** Bâtiments des services tenus ce jour-là (BTP, hôpital, station-service). */
  btpBatimentId: string | null;
  santeBatimentId: string | null;
  stationBatimentId: string | null;
  /** Un poste de police en ville : la détention y est jouée, sinon assignation. */
  commissariat: boolean;
}

/** Une issue possible d'un incident — le joueur en choisit une. */
export interface PropositionArbitrage {
  /** Clé d'issue (ex. « dejoue », « butin », « ravageur »…). */
  id: string;
  /** Texte narratif proposé au joueur (montants indicatifs). */
  libelle: string;
  /** Ce que la simulation aurait joué d'elle-même : la suggestion affichée. */
  attendu: boolean;
  /** L'issue du pire : celle qui s'impose à l'expiration du délai. */
  pire: boolean;
}

/** Un incident survenu, en attente de l'arbitrage du maître du jeu. */
export interface Arbitrage {
  id: string;
  /** Jour de survenance. */
  jour: number;
  /** Jour où la pire issue s'impose seule (jour + délai). */
  expireLe: number;
  type: TypeArbitrage;
  /** Titre court (ex. « Cambriolage chez Jean Castella »). */
  titre: string;
  /** Gravité 1 (pépin), 2 (grave), 3 (majeur). */
  gravite: 1 | 2 | 3;
  cibleBatimentId: string | null;
  ciblePnjId: string | null;
  cibleVehiculeId: string | null;
  /** Auteur tiré (cambriolage, vol de voiture) ou belligérants (guerre). */
  voleurPnjId: string | null;
  agresseurPnjId: string | null;
  defenseurPnjId: string | null;
  moyens: MoyensArbitrage;
  propositions: PropositionArbitrage[];
}

/**
 * Chantier (v1.27, arbitrage Thibaut 2026-11-08) : plus rien ne se crée
 * instantanément — un bâtiment se construit au BTP, un véhicule à la
 * station-service. La durée n'est pas un nombre de jours mais une
 * VALEUR DE TRAVAUX (défaut 100) : chaque ouvrier du constructeur
 * produit 1 travail/jour, chaque engin de chantier ayant roulé en
 * produit 2. Le coût se règle AU FUR ET À MESURE, au prorata de
 * l'avancement : la ville paie pour un acteur public, la figurine
 * commanditaire pour un acteur privé. Un seul chantier avance par
 * jour (le premier de la file, priorisable) ; sans constructeur en
 * ville, le chantier avance « à la main » (1 travail/jour, coups de
 * main bénévoles, sans paiement — la monnaie reste intacte).
 */
export interface Chantier {
  id: string;
  /** Jour de lancement. */
  jour: number;
  /** Cible : bâtiment (construit par le BTP) ou véhicule (station-service). */
  cibleBatimentId: string | null;
  cibleVehiculeId: string | null;
  /** Payeur : null = la ville ; sinon la figurine qui commande (privé). */
  payeurPnjId: string | null;
  /** Valeur totale des travaux en unités (arbitrage Thibaut : la durée est une valeur fixe, ex. 100 — pas un nombre de jours). */
  travauxTotal: number;
  /** Travaux déjà produits. */
  travauxFaits: number;
  /** Coût total du chantier (centimes), payé au prorata de l'avancement. */
  coutCentimes: number;
  /** Coût déjà réglé au constructeur (centimes). */
  coutPaye: number;
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
  /** Véhicules de la ville (v1.25) — flotte municipale et véhicules privés. */
  vehicules?: Vehicule[];
  /** Incidents survenus, en attente d'arbitrage du joueur (v1.26). */
  arbitrages?: Arbitrage[];
  /** Chantiers en cours (v1.27) : la file des constructions — un seul avance par jour. */
  chantiers?: Chantier[];
  /**
   * Recettes du dernier jour par commerce (centimes) — modèle flux, phase 3.6.
   * Sert au calibrage des effectifs (effectif_max ≈ 0,88 × recettes / 57,75).
   */
  recettesCommerce?: Record<string, number>;
  journal: JournalEntree[];
}
