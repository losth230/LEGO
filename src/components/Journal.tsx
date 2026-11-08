// Journal de la ville — les événements racontés, très légèrement romancés (§6).

import { useStore } from "../state/store.tsx";
import type { JournalEntree, TypeJournal } from "../engine/types.ts";
import { montantL } from "../engine/referentiel.ts";

const ETIQUETTES: Record<TypeJournal, { icone: string; libelle: string; classe: string }> = {
  impots: { icone: "💰", libelle: "Impôts", classe: "badge-impots" },
  salaires: { icone: "👩‍✒️", libelle: "Salaires publics", classe: "badge-salaires" },
  fonctionnement: { icone: "🛠", libelle: "Fonctionnement", classe: "badge-fonctionnement" },
  essence: { icone: "⛽", libelle: "Carburant", classe: "badge-essence" },
  dette: { icone: "💳", libelle: "Dette", classe: "badge-dette" },
  achats: { icone: "🛒", libelle: "Achats", classe: "badge-achats" },
  flux: { icone: "🔁", libelle: "Flux privé", classe: "badge-flux" },
  incident: { icone: "🚨", libelle: "Incident", classe: "badge-incident" },
  arbitrage: { icone: "⚖️", libelle: "Arbitrage", classe: "badge-arbitrage" },
  solde: { icone: "📊", libelle: "Solde", classe: "badge-solde" },
  systeme: { icone: "🏙", libelle: "Ville", classe: "badge-systeme" },
};

function Ligne({ entree }: { entree: JournalEntree }) {
  const e = ETIQUETTES[entree.type];
  return (
    <li className={"journal-ligne type-" + entree.type}>
      <span className={"badge " + e.classe}>
        {e.icone} {e.libelle}
      </span>
      <span className="journal-texte">{entree.texte}</span>
      {entree.montant !== undefined ? (
        <span className={"journal-montant " + (entree.montant < 0 ? "negatif" : "positif")}>
          {entree.montant < 0 ? "" : "+"}
          {montantL(entree.montant)}
        </span>
      ) : null}
    </li>
  );
}

export function Journal() {
  const { etat } = useStore();
  const ordre = [...etat.journal].reverse();
  const groupes: Array<{ jour: number; entrees: JournalEntree[] }> = [];
  for (const entree of ordre) {
    const dernier = groupes[groupes.length - 1];
    if (dernier !== undefined && dernier.jour === entree.jour) {
      dernier.entrees.push(entree);
    } else {
      groupes.push({ jour: entree.jour, entrees: [entree] });
    }
  }
  return (
    <div className="carte">
      <h2>📖 Journal de la ville</h2>
      {groupes.map((g) => (
        <section key={g.jour} className="journal-jour">
          <h3>Jour {g.jour}</h3>
          <ul>
            {g.entrees.map((entree, i) => (
              <Ligne key={g.jour + "-" + i} entree={entree} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
