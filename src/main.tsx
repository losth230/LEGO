import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { appliquerTheme, lireTheme } from "./theme.ts";
import "./styles.css";

// Thème appliqué avant le premier rendu pour éviter le flash.
appliquerTheme(lireTheme());

const racine = document.getElementById("racine");
if (racine === null) {
  throw new Error("Élément #racine introuvable");
}
createRoot(racine).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
