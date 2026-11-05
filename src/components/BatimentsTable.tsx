// Tableau des bâtiments (cahier des charges §3.1 et §6).

import { useStore } from "../state/store.tsx";
import type { Batiment, EtatBatiment, TypeBatiment } from "../engine/types.ts";
import { montantL } from "../engine/referentiel.ts";

const ETIQUETTES_TYPE: Record<TypeBatiment, { libelle: string; classe: string; icone: string }> = {
  habitation: { libelle: "Habitation", classe: "badge-habitation", icone: "🏠" },
  commerce: { libelle: "Commerce", classe: "badge-commerce", icone: "🏪" },
  service_public: { libelle: "Service public", classe: "badge-agent", icone: "🏛" },
};

const ETIQUETTES_ETAT: Record<EtatBatiment, string> = {
  neuf: "neuf",
  bon: "bon état",
  degrade: "dégradé",
  sinistre: "sinistré",
};

export function BatimentsTable() {
  const { etat } = useStore();
  return (
    <div className="carte">
      <h2>🧱 Bâtiments ({etat.batiments.length})</h2>
      <table>
        <thead>
          <tr>
            <th>Nom</th>
            <th>Type</th>
            <th>Quartier</th>
            <th className="col-nombre">Valeur</th>
            <th className="col-nombre">Fonctionnement/j</th>
            <th>Occupants</th>
            <th>État</th>
          </tr>
        </thead>
        <tbody>
          {etat.batiments.map((b) => (
            <LigneBatiment key={b.id} batiment={b} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LigneBatiment({ batiment: b }: { batiment: Batiment }) {
  const { etat } = useStore();
  const t = ETIQUETTES_TYPE[b.type];
  const occupants = etat.pnjs.filter((p) => p.batimentId === b.id);
  const proprio = occupants.find((p) => p.statut === "commercant");
  return (
    <tr>
      <td>
        {t.icone} {b.nom}
        {proprio ? <span className="mute"> — tenu par {proprio.prenom} {proprio.nom}</span> : null}
      </td>
      <td>
        <span className={"badge " + t.classe}>{t.libelle}</span>
      </td>
      <td>{b.quartier}</td>
      <td className="col-nombre">{montantL(b.valeur)}</td>
      <td className="col-nombre">
        {b.type === "service_public" ? montantL(b.coutFonctionnement) : "—"}
      </td>
      <td>
        {occupants.length}
        {b.type === "habitation" ? <span className="mute"> / {b.capacite}</span> : null}
      </td>
      <td>{ETIQUETTES_ETAT[b.etat]}</td>
    </tr>
  );
}
