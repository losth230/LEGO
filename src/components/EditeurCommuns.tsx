// Petits contrôles et listes partagés par les panneaux de l'éditeur
// (découpe du 2026-11-06 : ce fichier remplace le haut de Editeur.tsx).
// Les groupes de grades vivent dans le référentiel (v1.14), importés par
// les panneaux qui en ont besoin — plus de liste en parallèle.

import { type ReactNode } from "react";
import type { CategorieVehicule, EtatBatiment, RoleVehicule, TypeBatiment, Vocation } from "../engine/types.ts";

export const TYPES_BATIMENT: TypeBatiment[] = ["habitation", "commerce", "service_public"];
export const ETATS_BATIMENT: EtatBatiment[] = ["neuf", "bon", "degrade", "sinistre"];

// v1.25 : la ville roule — catégories et rôles des véhicules.
// v1.27 : rôle « chantier » — l'engin produit 2 travaux/jour sur l'ouvrage en cours.
export const CATEGORIES_VEHICULE: CategorieVehicule[] = ["municipal", "prive"];
export const ROLES_VEHICULE: RoleVehicule[] = ["pompiers", "police", "proprete", "sante", "chantier"];

/** Vocations des commerces (monde 100 % fermé, 2026-11-06 ; pas de vocation
 * « prison » : les détenus sont gardés au commissariat, correction 3.10). */
// v1.31 : les vocations se cochent (un commerce en cumule plusieurs) ; la
// vente au comptoir (courses) est une case séparée, indépendante des services.
export const VOCATIONS_BATIMENT: Array<{ valeur: Vocation; libelle: string }> = [
  { valeur: "sante", libelle: "Santé (facture les soins)" },
  { valeur: "btp", libelle: "BTP (répare les bâtiments)" },
  { valeur: "banque", libelle: "Banque (prête à la ville)" },
  { valeur: "garage", libelle: "Station-service (vend l'essence, répare les véhicules)" },
];

// ---------- petits contrôles ----------

// v1.32 : suggestions de métiers pour les champs libres (datalist HTML).
// Le champ reste LIBRE : le métier est narratif — les mécaniques du jeu
// (salaire public, garde) viennent du statut et du grade, jamais du métier,
// et « cheffe d'entreprise BTP » n'existe dans aucune liste fermée. La
// datalist propose simplement les métiers de la ville de démonstration.
export const ID_DATALIST_METIERS = "metiers-suggeres";
export const METIERS_SUGGERES = [
  "sans profession",
  "boulanger",
  "vendeur de frites",
  "quincaillière",
  "cheffe de l'hôpital",
  "cheffe d'entreprise BTP",
  "banquier",
  "gérant de station-service",
  "receveur de la poste",
  "facteur",
  "maçon",
  "conducteur d'engins",
  "secrétaire de mairie",
  "balayeur municipal",
  "éboueuse",
  "chef d'équipe de la voirie",
  "policier municipal",
  "sapeur-pompier",
  "soldat",
  "caporal",
  "capitaine",
  "chef des Corbeaux du Sud",
  "guetteur des Corbeaux",
];

export function DatalistMetiers() {
  return (
    <datalist id={ID_DATALIST_METIERS}>
      {METIERS_SUGGERES.map((m) => (
        <option key={m} value={m} />
      ))}
    </datalist>
  );
}

export function Champ({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="champ">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function nombreL(entree: string): number {
  const v = Number(entree.replace(",", "."));
  return Number.isFinite(v) ? Math.round(v * 100) : 0;
}

export function versL(centimes: number): string {
  return (centimes / 100).toString();
}
