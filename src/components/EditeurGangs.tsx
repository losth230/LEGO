// Panneau Gangs (phase 3.10) : installer ou démanteler un gang, recruter
// via la fiche figurine.

import { useState } from "react";
import { useStore } from "../state/store.tsx";
import {
  ajouterGang,
  nouveauGang,
  supprimerGang
} from "../engine/monde.ts";
import { Champ } from "./EditeurCommuns.tsx";

// ---------- gangs (phase 3.10 : le milieu criminel se crée ici) ----------

export function CarteGangs() {
  const { etat, majEtat } = useStore();
  const [nom, setNom] = useState("");
  const [territoire, setTerritoire] = useState("");
  const quartiers = [...new Set(etat.batiments.map((b) => b.quartier))];

  const creer = () => {
    if (nom.trim() === "" || territoire === "") return;
    majEtat(
      ajouterGang(etat, nouveauGang({ nom: nom.trim(), quartiers: [territoire] })),
    );
    setNom("");
    setTerritoire("");
  };

  return (
    <div className="carte">
      <h2>🥷 Gangs ({(etat.gangs ?? []).length})</h2>
      <p className="mute">
        Un gang ne vole que sur son territoire (extensible par la guerre).
        Pour recruter : ouvrir une figurine ci-dessous et choisir son gang.
      </p>
      {(etat.gangs ?? []).map((g) => {
        const membres = etat.pnjs.filter((p) => p.gangId === g.id);
        const detenus = membres.filter((p) => (p.arreteJusqua ?? 0) > etat.jour).length;
        return (
          <div className="ligne-edit" key={g.id}>
            <div className="ligne-edit-tete">
              <span>
                <strong>{g.nom}</strong>{" "}
                <span className="mute">
                  · territoire : {g.quartiers.join(", ")} · {membres.length} membre(s)
                  {detenus > 0 ? " · " + detenus + " détenu(s)" : ""}
                </span>
              </span>
              <button
                className="bouton-mini bouton-supprimer"
                onClick={() => {
                  if (window.confirm("Démanteler " + g.nom + " ? Les membres deviennent indépendants.")) {
                    majEtat(supprimerGang(etat, g.id));
                  }
                }}
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
      <h3>+ Installer un gang</h3>
      <div className="formulaire">
        <Champ label="Nom du gang">
          <input
            className="input"
            placeholder="Les Rats du Port"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
          />
        </Champ>
        <Champ label="Territoire initial">
          <select className="input" value={territoire} onChange={(e) => setTerritoire(e.target.value)}>
            <option value="">— quartier —</option>
            {quartiers.map((q) => (
              <option key={q} value={q}>{q}</option>
            ))}
          </select>
        </Champ>
        <button className="bouton" onClick={creer}>Installer</button>
      </div>
    </div>
  );
}
