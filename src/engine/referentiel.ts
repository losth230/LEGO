// Accès typé au référentiel de données réelles (data/referentiel.json).
// Le référentiel est la source de vérité : chaque valeur porte sa source et
// reste éditable ; l'accès par chemin tolère les ajouts et renommages de
// champs sans casser la compilation.

import refDoc from "../../data/referentiel.json" with { type: "json" };

type Noeud = Record<string, unknown>;

export const referentiel = refDoc as unknown as Noeud;

export function refChemin(chemin: string): unknown {
  return chemin.split(".").reduce<unknown>((acc, cle) => {
    if (acc && typeof acc === "object") {
      return (acc as Noeud)[cle];
    }
    return undefined;
  }, referentiel);
}

export function refNombre(chemin: string, defaut = 0): number {
  const v = refChemin(chemin);
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : defaut;
}

export function refTexte(chemin: string, defaut = ""): string {
  const v = refChemin(chemin);
  return v === undefined || v === null ? defaut : String(v);
}

/** Référence d'impôt quotidien ≈ 4,0 L/PNJ/jour (proxy IFRAP — voir référentiel). */
export const IMPOT_REFERENCE_L = refNombre("economie.impot_quotidien_reference.valeur");

/** Consommation quotidienne moyenne ≈ 52,5 L/PNJ/jour (INSEE 2023). */
export const ACHAT_REFERENCE_L = refNombre("economie.budget_achat_quotidien_reference.valeur");

/** Salaires publics nets par jour (grilles FPT 2025) — en L. */
export function salaireJourL(grade: string): number {
  return refNombre("economie.salaires_publics_nets_par_jour." + grade + ".valeur", 50);
}

/**
 * Taux d'imposition par défaut : un PNJ au revenu indicatif médian
 * (= consommation de référence) paie l'impôt de référence.
 * 4,0 L sur 52,5 L → 762 points de base (7,62 %).
 */
export const TAUX_IMPOT_DEFAUT_BP = Math.round((IMPOT_REFERENCE_L / ACHAT_REFERENCE_L) * 10000);

/** Coefficient d'intensité K par défaut : 1 000 (« animé », cahier §5). */
export const COEFF_INTENSITE_DEFAUT = Math.max(1, Math.round(refNombre("meta.coeff_intensite.valeur", 1000)));

/** Taux d'emprunt annuel des collectivités en % (3,54 % en 2024). */
export const TAUX_EMPRUNT_PCT = refNombre("economie.taux_emprunt_collectivites.valeur", 3.54);

/** Formate des centimes en LEGOs affichables : 123456 -> "1 234,56 L". */
export function montantL(centimes: number): string {
  const euros = (centimes / 100).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return euros + " L";
}
