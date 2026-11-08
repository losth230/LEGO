// Tableau des habitants + fiche PNJ dépliable (cahier des charges §6).

import { useMemo, useState } from "react";
import { useStore } from "../state/store.tsx";
import type { Pnj, Statut } from "../engine/types.ts";
import { montantL, salaireJourL } from "../engine/referentiel.ts";
import { budgetAchat, impotSur } from "../engine/moteur.ts";
import { gangDe } from "../engine/evenements.ts";

const BADGES_STATUT: Record<Statut, { libelle: string; classe: string }> = {
  agent_public: { libelle: "Agent public", classe: "badge-agent" },
  commercant: { libelle: "Commerçant", classe: "badge-commerce" },
  prive: { libelle: "Privé", classe: "badge-prive" },
};

function nomComplet(p: Pnj): string {
  return p.prenom + " " + p.nom;
}

function Fiche({ pnj }: { pnj: Pnj }) {
  const { etat } = useStore();
  // v1.25 : le logement ou le lieu de travail peut être un véhicule (caravane,
  // fourgon affecté) — la fiche résout les deux mondes.
  const vehicules = etat.vehicules ?? [];
  const bat = etat.batiments.find((b) => b.id === pnj.batimentId) ??
    vehicules.find((v) => v.id === pnj.batimentId);
  const logeDansVehicule = vehicules.some((v) => v.id === pnj.batimentId);
  const travail = pnj.travailBatimentId
    ? etat.batiments.find((b) => b.id === pnj.travailBatimentId) ??
      vehicules.find((v) => v.id === pnj.travailBatimentId)
    : null;
  const travailleDansVehicule = pnj.travailBatimentId
    ? vehicules.some((v) => v.id === pnj.travailBatimentId)
    : false;
  const taux = etat.params.tauxImpotBp;
  const gang = gangDe(etat, pnj);
  const detenu = (pnj.arreteJusqua ?? 0) > etat.jour;
  return (
    <tr className="fiche-pnj">
      <td colSpan={6}>
        <div className="fiche-grille">
          <div>
            <strong>{nomComplet(pnj)}</strong> — {pnj.metier}, {pnj.age} ans
            <br />
            Quartier : {bat ? bat.quartier : "sans attache"}
            <br />
            Logement/service : {bat ? bat.nom : "sans bâtiment"}
            {logeDansVehicule ? <span className="mute"> (véhicule)</span> : null}
            {travail ? (
              <>
                <br />
                Lieu de travail : {travail.nom}
                {travailleDansVehicule ? <span className="mute"> (véhicule affecté)</span> : null}
              </>
            ) : null}
          </div>
          <div>
            <strong>Carte d'identité</strong>
            <br />
            Personnalité :{" "}
            {(pnj.personnalite ?? []).length > 0
              ? (pnj.personnalite ?? []).join(" · ")
              : "inconnue"}
            <br />
            Casier judiciaire : {pnj.casier ?? 0} fait(s)
            <br />
            {gang ? (
              <>
                Gang : {gang.nom} — territoire : {gang.quartiers.join(", ")}
              </>
            ) : (pnj.casier ?? 0) > 0 ? (
              "Criminel indépendant"
            ) : (
              "Casier vierge, pas de gang"
            )}
            {detenu ? (
              <>
                <br />
                🔒 Assigné à résidence jusqu'au jour {pnj.arreteJusqua}
              </>
            ) : null}
          </div>
          <div>
            Revenu indicatif : {montantL(pnj.revenuIndicatif)} / jour
            <br />
            Budget d'achat : {montantL(budgetAchat(pnj))} / jour
            {budgetAchat(pnj) !== pnj.budgetAchat ? (
              <>
                {" "}
                <span className="mute">
                  (modulé par la personnalité ; base {montantL(pnj.budgetAchat)})
                </span>
              </>
            ) : null}
          </div>
          <div>
            Impôt à la source :{" "}
            {pnj.statut === "agent_public" ? (
              <>
                {montantL(impotSur(Math.round(salaireJourL(pnj.grade ?? "") * 100), taux))} retenus
                sur la solde
              </>
            ) : travail ? (
              <>
                {montantL(impotSur(pnj.revenuIndicatif, taux))} retenus sur le salaire du jour
              </>
            ) : pnj.statut === "commercant" ? (
              <>{(taux / 100).toLocaleString("fr-FR")} % de la marge du jour</>
            ) : (
              <>aucun gain, aucun impôt</>
            )}
            <br />
            {pnj.statut === "agent_public" ? (
              <>Salaire : {montantL(Math.round(salaireJourL(pnj.grade ?? "") * 100))} / jour</>
            ) : travail ? (
              <>Salaire privé : {montantL(pnj.revenuIndicatif)} / jour versé par le commerce (modèle flux)</>
            ) : (
              <>Sans rémunération régulière (§4.3 — cas assumé)</>
            )}
          </div>
          <div className="comptes">
            Compte : <strong>{montantL(pnj.compte)}</strong>
            <br />
            Épargne : {montantL(pnj.epargne)}
          </div>
        </div>
      </td>
    </tr>
  );
}

export function HabitantsTable() {
  const { etat } = useStore();
  const [filtre, setFiltre] = useState("");
  const [deplie, setDeplie] = useState<string | null>(null);

  const liste = useMemo(() => {
    const f = filtre.trim().toLowerCase();
    const base = f === "" ? [...etat.pnjs] : etat.pnjs.filter((p) =>
      (p.prenom + " " + p.nom + " " + p.metier).toLowerCase().includes(f),
    );
    return base.sort((a, b) => b.compte - a.compte);
  }, [etat.pnjs, filtre]);

  return (
    <div className="carte">
      <h2>👥 Habitants ({etat.pnjs.length})</h2>
      <input
        className="input recherche"
        placeholder="Chercher un habitant, un métier…"
        value={filtre}
        onChange={(e) => setFiltre(e.target.value)}
      />
      <table>
        <thead>
          <tr>
            <th>Nom</th>
            <th>Âge</th>
            <th>Métier</th>
            <th>Statut</th>
            <th className="col-nombre">Compte</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {liste.map((p) => (
            <PaireLignes key={p.id} pnj={p} deplie={deplie} setDeplie={setDeplie} />
          ))}
        </tbody>
      </table>
      {liste.length === 0 ? <p className="mute">Aucun habitant ne correspond.</p> : null}
    </div>
  );
}

function PaireLignes({
  pnj,
  deplie,
  setDeplie,
}: {
  pnj: Pnj;
  deplie: string | null;
  setDeplie: (id: string | null) => void;
}) {
  const { etat } = useStore();
  const badge = BADGES_STATUT[pnj.statut];
  const criminel = pnj.gangId !== null && pnj.gangId !== undefined;
  const detenu = (pnj.arreteJusqua ?? 0) > etat.jour;
  const recidive = (pnj.casier ?? 0) > 0;
  return (
    <>
      <tr className={deplie === pnj.id ? "rangée-active" : undefined}>
        <td>{nomComplet(pnj)}</td>
        <td>{pnj.age}</td>
        <td>{pnj.metier}</td>
        <td>
          <span className={"badge " + badge.classe}>{badge.libelle}</span>
          {criminel ? <span className="badge badge-agent"> 🥷 gang</span> : null}
          {recidive && !criminel ? <span className="badge badge-prive"> 🥷 casier</span> : null}
          {detenu ? <span className="badge badge-commerce"> 🔒</span> : null}
        </td>
        <td className="col-nombre">{montantL(pnj.compte)}</td>
        <td>
          <button className="bouton-mini" onClick={() => setDeplie(deplie === pnj.id ? null : pnj.id)}>
            {deplie === pnj.id ? "▲" : "▼"}
          </button>
        </td>
      </tr>
      {deplie === pnj.id ? <Fiche pnj={pnj} /> : null}
    </>
  );
}
