// Tableau des véhicules (v1.25) — la ville roule : flotte municipale et
// véhicules privés, mêmes capacités que les bâtiments (logements, postes).

import { useStore } from "../state/store.tsx";
import type { EtatBatiment, RoleVehicule, Vehicule } from "../engine/types.ts";
import { montantL } from "../engine/referentiel.ts";

const ETIQUETTES_ETAT: Record<EtatBatiment, string> = {
  neuf: "neuf",
  bon: "bon état",
  degrade: "dégradé",
  sinistre: "sinistré",
};

const LIBELLES_ROLE: Record<RoleVehicule, string> = {
  pompiers: "🚒 Pompiers",
  police: "🚓 Police",
  proprete: "🧹 Propreté",
  sante: "🚑 Santé",
};

export function VehiculesTable() {
  const { etat } = useStore();
  const vehicules = etat.vehicules ?? [];
  return (
    <div className="carte">
      <h2>🚐 Véhicules ({vehicules.length})</h2>
      <table>
        <thead>
          <tr>
            <th>Nom</th>
            <th>Catégorie</th>
            <th>Quartier</th>
            <th className="col-nombre">Valeur</th>
            <th className="col-nombre">Essence/j</th>
            <th>Logés</th>
            <th>Postes</th>
            <th>Propriétaire</th>
            <th>Garage</th>
            <th>État</th>
          </tr>
        </thead>
        <tbody>
          {vehicules.map((v) => (
            <LigneVehicule key={v.id} vehicule={v} />
          ))}
        </tbody>
      </table>
      {vehicules.length === 0 ? (
        <p className="mute">Aucun véhicule en ville — la flotte se recrute dans l'éditeur.</p>
      ) : null}
    </div>
  );
}

function LigneVehicule({ vehicule: v }: { vehicule: Vehicule }) {
  const { etat } = useStore();
  const loges = etat.pnjs.filter((p) => p.batimentId === v.id);
  const postes = etat.pnjs.filter((p) => p.travailBatimentId === v.id);
  const proprietaire = v.proprietairePnjId
    ? etat.pnjs.find((p) => p.id === v.proprietairePnjId)
    : null;
  const gang = v.gangId ? (etat.gangs ?? []).find((g) => g.id === v.gangId) : null;
  const garage = v.garageBatimentId
    ? etat.batiments.find((b) => b.id === v.garageBatimentId)
    : null;
  return (
    <tr>
      <td>{v.nom}</td>
      <td>
        {v.categorie === "municipal" ? (
          <>
            <span className="badge badge-agent">Municipal</span>{" "}
            {v.role ? <span className="badge badge-vocation">{LIBELLES_ROLE[v.role]}</span> : null}
          </>
        ) : (
          <span className="badge badge-prive">Privé</span>
        )}
        {gang ? <span className="badge badge-incident"> 🥷 {gang.nom}</span> : null}
      </td>
      <td>{v.quartier}</td>
      <td className="col-nombre">{montantL(v.valeur)}</td>
      <td className="col-nombre">{v.essenceJour > 0 ? montantL(v.essenceJour) : "—"}</td>
      <td>
        {loges.length}
        {v.capaciteLogements > 0 ? <span className="mute"> / {v.capaciteLogements}</span> : null}
      </td>
      <td>
        {postes.length}
        {v.capacitePostes > 0 ? <span className="mute"> / {v.capacitePostes}</span> : null}
      </td>
      <td>
        {v.categorie === "municipal"
          ? "Ville"
          : proprietaire
            ? proprietaire.prenom + " " + proprietaire.nom
            : "—"}
      </td>
      <td>{garage ? garage.nom : "—"}</td>
      <td>{ETIQUETTES_ETAT[v.etat]}</td>
    </tr>
  );
}
