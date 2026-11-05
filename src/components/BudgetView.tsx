// Vue budget : caisses, flux du dernier jour, moyennes 7 jours, indicateurs.

import { useStore } from "../state/store.tsx";
import type { JournalEntree, TypeJournal } from "../engine/types.ts";
import { montantL } from "../engine/referentiel.ts";

function montant(jour: number, type: TypeJournal, journal: JournalEntree[]): number {
  const e = journal.find((x) => x.jour === jour && x.type === type);
  return e?.montant ?? 0;
}

export function BudgetView() {
  const { etat } = useStore();
  const dernierJour = etat.jour;
  const jours = [7, 6, 5, 4, 3, 2, 1]
    .map((n) => dernierJour - n + 1)
    .filter((j) => j >= 1);
  const comptes = etat.pnjs.map((p) => p.compte).sort((a, b) => a - b);
  const richesseMoyenne =
    etat.pnjs.length === 0
      ? 0
      : Math.round(comptes.reduce((s, c) => s + c, 0) / etat.pnjs.length);
  const mediane = comptes.length === 0 ? 0 : comptes[Math.floor(comptes.length / 2)];
  const soldeJour =
    montant(dernierJour, "impots", etat.journal) -
    montant(dernierJour, "salaires", etat.journal) -
    montant(dernierJour, "fonctionnement", etat.journal);

  return (
    <div className="grille-cartes">
      <div className="carte carte-indicateur">
        <h2>🏛 Caisse de la ville</h2>
        <p className="grand-nombre">{montantL(etat.budgetVille)}</p>
        <p className={soldeJour < 0 ? "negatif" : "positif"}>
          Solde du jour {dernierJour} : {soldeJour < 0 ? "" : "+"}
          {montantL(soldeJour)}
        </p>
        <p className="mute">
          Taux d'imposition : {((etat.params.tauxImpotBp / 100) * 1).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} %
        </p>
      </div>
      <div className="carte carte-indicateur">
        <h2>💸 Sorties vers l'extérieur</h2>
        <p className="grand-nombre">{montantL(etat.sortiesCumulees)}</p>
        <p className="mute">
          Cumul des coûts de fonctionnement payés aux fournisseurs extérieurs depuis le jour 1
          (seules sorties documentées du circuit, §4.3).
        </p>
      </div>
      <div className="carte carte-indicateur">
        <h2>👥 Richesse des figurines</h2>
        <p className="grand-nombre">{montantL(richesseMoyenne)}</p>
        <p className="mute">
          Compte moyen (médian : {montantL(mediane)}) sur {etat.pnjs.length} figurines.
        </p>
      </div>
      <div className="carte carte-large">
        <h2>📈 Les 7 derniers jours</h2>
        <table>
          <thead>
            <tr>
              <th>Jour</th>
              <th className="col-nombre">Impôts</th>
              <th className="col-nombre">Salaires</th>
              <th className="col-nombre">Fonctionnement</th>
              <th className="col-nombre">Achats</th>
              <th className="col-nombre">Solde ville</th>
            </tr>
          </thead>
          <tbody>
            {[...jours].reverse().map((j) => {
              const impots = montant(j, "impots", etat.journal);
              const salaires = montant(j, "salaires", etat.journal);
              const fonct = montant(j, "fonctionnement", etat.journal);
              const solde = impots - salaires - fonct;
              return (
                <tr key={j}>
                  <td>J{j}</td>
                  <td className="col-nombre">{montantL(impots)}</td>
                  <td className="col-nombre">{montantL(salaires)}</td>
                  <td className="col-nombre">{montantL(fonct)}</td>
                  <td className="col-nombre">{montantL(montant(j, "achats", etat.journal))}</td>
                  <td className={"col-nombre " + (solde < 0 ? "negatif" : "positif")}>
                    {solde < 0 ? "" : "+"}
                    {montantL(solde)}
                  </td>
                </tr>
              );
            })}
            {jours.length === 0 ? (
              <tr>
                <td colSpan={6} className="mute">
                  Passe le premier jour pour voir les flux.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
