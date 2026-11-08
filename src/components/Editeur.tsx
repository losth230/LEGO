// Éditeur du monde (§6) — découpe du 2026-11-06 : chaque panneau vit dans
// son fichier, ce composant assemble la grille. Toutes les modifications
// passent par les mutateurs purs du moteur.

import { CarteVille } from "./EditeurCarteVille.tsx";
import { CarteBatiments } from "./EditeurBatiments.tsx";
import { CarteVehicules } from "./EditeurVehicules.tsx";
import { CarteGangs } from "./EditeurGangs.tsx";
import { CartePnjs } from "./EditeurPnjs.tsx";
import { CarteArrivants } from "./EditeurArrivants.tsx";

export function Editeur() {
  return (
    <div className="grille-editeur">
      <CarteVille />
      <CarteArrivants />
      <CarteBatiments />
      <CarteVehicules />
      <CarteGangs />
      <CartePnjs />
    </div>
  );
}
