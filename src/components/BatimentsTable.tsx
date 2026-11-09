// Tableau des bâtiments (cahier des charges §3.1 et §6).

import { useStore } from "../state/store.tsx";
import type { Batiment, EtatBatiment, TypeBatiment } from "../engine/types.ts";
import { montantL } from "../engine/referentiel.ts";
import { patronDuCommerce } from "../engine/moteur.ts";

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

/** Vocations des commerces (monde 100 % fermé, 2026-11-06 ; station-service v1.25). */
const ETIQUETTES_VOCATION = {
  sante: "Santé",
  btp: "BTP",
  banque: "Banque",
  garage: "⛽ Station-service",
} as const;

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
            <th>Logés</th>
            <th>Postes</th>
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
  // v1.33 : le patron est résolu par la liste des boutiques possédées —
  // une seconde boutique de Mario affiche son nom aussi.
  const proprio = b.type === "commerce" ? patronDuCommerce(etat, b.id) : undefined;
  // v1.27 : le bâtiment en construction est visible, capacités inactives.
  const chantier = b.enConstruction
    ? (etat.chantiers ?? []).find((c) => c.cibleBatimentId === b.id)
    : undefined;
  const pct = chantier
    ? Math.min(100, Math.round((chantier.travauxFaits / Math.max(1, chantier.travauxTotal)) * 100))
    : 0;
  return (
    <tr>
      <td>
        {t.icone} {b.nom}
        {proprio ? <span className="mute"> — tenu par {proprio.prenom} {proprio.nom}</span> : null}
        {b.enConstruction ? (
          <>
            {" "}
            <span className="badge badge-chantier">🏗 en chantier {pct} %</span>
          </>
        ) : null}
      </td>
      <td>
        <span className={"badge " + t.classe}>{t.libelle}</span>
        {b.type === "commerce" && b.vocations.length > 0 ? (
          <>
            {" "}
            {b.vocations.map((v) => (
              <span key={v} className="badge badge-vocation">{ETIQUETTES_VOCATION[v]}</span>
            ))}
          </>
        ) : null}
        {b.type === "commerce" && b.boutique ? (
          <>
            {" "}
            <span className="badge badge-vocation">🛒 Boutique</span>
            {b.necessite ? (
              <>
                {" "}
                <span className="badge badge-vocation">🥖 1re nécessité</span>
              </>
            ) : null}
          </>
        ) : null}
      </td>
      <td>{b.quartier}</td>
      <td className="col-nombre">{montantL(b.valeur)}</td>
      <td className="col-nombre">
        {b.type === "service_public" ? montantL(b.coutFonctionnement) : "—"}
      </td>
      <td>
        {occupants.length}
        {b.capaciteLogements > 0 ? <span className="mute"> / {b.capaciteLogements}</span> : null}
      </td>
      <td>
        {etat.pnjs.filter((p) => p.travailBatimentId === b.id).length}
        {b.capacitePostes > 0 ? <span className="mute"> / {b.capacitePostes}</span> : null}
      </td>
      <td>{ETIQUETTES_ETAT[b.etat]}</td>
    </tr>
  );
}
