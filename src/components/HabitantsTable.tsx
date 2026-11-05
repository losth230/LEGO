// Tableau des habitants + fiche PNJ dépliable (cahier des charges §6).

import { useMemo, useState } from "react";
import { useStore } from "../state/store.tsx";
import type { Pnj, Statut } from "../engine/types.ts";
import { montantL, salaireJourL } from "../engine/referentiel.ts";
import { impotDu } from "../engine/moteur.ts";

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
  const bat = etat.batiments.find((b) => b.id === pnj.batimentId);
  const travail = pnj.travailBatimentId
    ? etat.batiments.find((b) => b.id === pnj.travailBatimentId)
    : null;
  const impot = impotDu(pnj, etat.params.tauxImpotBp);
  return (
    <tr className="fiche-pnj">
      <td colSpan={6}>
        <div className="fiche-grille">
          <div>
            <strong>{nomComplet(pnj)}</strong> — {pnj.metier}, {pnj.age} ans
            <br />
            Logement/service : {bat ? bat.nom : "sans bâtiment"}
            {travail ? (
              <>
                <br />
                Lieu de travail : {travail.nom}
              </>
            ) : null}
          </div>
          <div>
            Revenu indicatif : {montantL(pnj.revenuIndicatif)} / jour
            <br />
            Budget d'achat : {montantL(pnj.budgetAchat)} / jour
          </div>
          <div>
            Impôt quotidien dû : {montantL(impot)}
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
  const badge = BADGES_STATUT[pnj.statut];
  return (
    <>
      <tr className={deplie === pnj.id ? "rangée-active" : undefined}>
        <td>{nomComplet(pnj)}</td>
        <td>{pnj.age}</td>
        <td>{pnj.metier}</td>
        <td>
          <span className={"badge " + badge.classe}>{badge.libelle}</span>
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
