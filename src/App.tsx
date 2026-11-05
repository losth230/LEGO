// Application principale : barre de ville, onglets, filet de sécurité.

import { Component, useState, type ErrorInfo, type ReactNode } from "react";
import { FournisseurStore, useStore } from "./state/store.tsx";
import { montantL } from "./engine/referentiel.ts";
import { Journal } from "./components/Journal.tsx";
import { HabitantsTable } from "./components/HabitantsTable.tsx";
import { BatimentsTable } from "./components/BatimentsTable.tsx";
import { BudgetView } from "./components/BudgetView.tsx";
import { ReferentielsView } from "./components/ReferentielsView.tsx";
import { Editeur } from "./components/Editeur.tsx";

type Onglet = "journal" | "habitants" | "batiments" | "budget" | "referentiels" | "editeur";

const ONGLETS: Array<{ cle: Onglet; libelle: string }> = [
  { cle: "journal", libelle: "📖 Journal" },
  { cle: "habitants", libelle: "👥 Habitants" },
  { cle: "batiments", libelle: "🧱 Bâtiments" },
  { cle: "budget", libelle: "📊 Budget" },
  { cle: "referentiels", libelle: "📚 Référentiels" },
  { cle: "editeur", libelle: "🛠 Éditeur" },
];

class FiletSecurite extends Component<{ children: ReactNode }, { erreur: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { erreur: null };
  }
  static getDerivedStateFromError(erreur: Error): { erreur: Error | null } {
    return { erreur };
  }
  componentDidCatch(erreur: Error, info: ErrorInfo): void {
    console.error(erreur, info.componentStack);
  }
  render(): ReactNode {
    if (this.state.erreur !== null) {
      return (
        <div className="carte err-boundary">
          <h2>Une erreur est survenue</h2>
          <pre>{this.state.erreur.message}</pre>
          <button className="bouton" onClick={() => window.location.reload()}>
            Recharger l'application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function BarreVille(): ReactNode {
  const { etat, passerUnJour, exporter, importerFichier, reinitialiser } = useStore();
  return (
    <header className="barre-ville">
      <div className="barre-titre">
        <h1>🧱 {etat.nomVille}</h1>
        <p className="mute">
          Jour {etat.jour} · {etat.pnjs.length} figurines · {etat.batiments.length} bâtiments
        </p>
      </div>
      <div className="barre-budget">
        <p className="mute">Caisse de la ville</p>
        <p className="grand-nombre">{montantL(etat.budgetVille)}</p>
      </div>
      <button className="bouton bouton-jour" onClick={passerUnJour}>
        ⏭ Passer un jour
      </button>
      <div className="barre-outils">
        <button className="bouton-mini" onClick={exporter}>⬇ Exporter</button>
        <label className="bouton-mini bouton-import">
          ⬆ Importer
          <input
            type="file"
            accept="application/json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importerFichier(f);
              e.target.value = "";
            }}
          />
        </label>
        <button
          className="bouton-mini bouton-supprimer"
          onClick={() => {
            if (window.confirm("Repartir du monde par défaut ? La sauvegarde actuelle sera remplacée.")) {
              reinitialiser();
            }
          }}
        >
          ⟲ Réinitialiser
        </button>
      </div>
    </header>
  );
}

function Application(): ReactNode {
  const [onglet, setOnglet] = useState<Onglet>("journal");
  return (
    <div className="app">
      <BarreVille />
      <nav className="onglets">
        {ONGLETS.map((o) => (
          <button
            key={o.cle}
            className={"onglet " + (onglet === o.cle ? "actif" : "")}
            onClick={() => setOnglet(o.cle)}
          >
            {o.libelle}
          </button>
        ))}
      </nav>
      <main>
        {onglet === "journal" ? <Journal /> : null}
        {onglet === "habitants" ? <HabitantsTable /> : null}
        {onglet === "batiments" ? <BatimentsTable /> : null}
        {onglet === "budget" ? <BudgetView /> : null}
        {onglet === "referentiels" ? <ReferentielsView /> : null}
        {onglet === "editeur" ? <Editeur /> : null}
      </main>
      <footer className="mute">
        Données réelles françaises (INSEE, DGSCGC, SSMSI, IFRAP) — voir l'onglet Référentiels.
        Monnaie du jeu : le LEGO (L), 1 L = 1 €.
      </footer>
    </div>
  );
}

export default function App(): ReactNode {
  return (
    <FiletSecurite>
      <FournisseurStore>
        <FiletSecurite>
          <Application />
        </FiletSecurite>
      </FournisseurStore>
    </FiletSecurite>
  );
}
