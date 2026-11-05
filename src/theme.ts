// Thème clair / sombre : clé de préférence et application avant le premier
// rendu (évite le flash). Défaut : sombre — le mode clair s'active depuis
// la barre de la ville et se garde en localStorage.

export const CLE_THEME = "lego-ville-theme";

export type Theme = "clair" | "sombre";

export function lireTheme(): Theme {
  try {
    return localStorage.getItem(CLE_THEME) === "clair" ? "clair" : "sombre";
  } catch {
    return "sombre";
  }
}

export function appliquerTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

export function ecrireTheme(theme: Theme): void {
  try {
    localStorage.setItem(CLE_THEME, theme);
  } catch {
    /* pas de localStorage : le choix ne sera pas gardé */
  }
}
