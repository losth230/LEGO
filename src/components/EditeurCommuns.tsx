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
export const VOCATIONS_BATIMENT: Array<{ valeur: Vocation | null; libelle: string }> = [
  { valeur: null, libelle: "Boutique (consommation)" },
  { valeur: "sante", libelle: "Santé (facture les soins)" },
  { valeur: "btp", libelle: "BTP (répare les bâtiments)" },
  { valeur: "banque", libelle: "Banque (prête à la ville)" },
  { valeur: "garage", libelle: "Station-service (vend l'essence, répare les véhicules)" },
];

// ---------- petits contrôles ----------

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
