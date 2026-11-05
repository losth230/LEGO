// Application principale : barre de ville, onglets, filet de sécurité.

import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { FournisseurStore, useStore } from "./state/store.tsx";
import { montantL } from "./engine/referentiel.ts";
import { joursDeMarge } from "./engine/moteur.ts";
import { appliquerTheme, ecrireTheme, lireTheme } from "./theme.ts";
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
  const marge = joursDeMarge(etat);
  const margeCritique = marge <= 5;
  const [clair, setClair] = useState(() => lireTheme() === "clair");
  useEffect(() => {
    const theme = clair ? "clair" : "sombre";
    appliquerTheme(theme);
    ecrireTheme(theme);
  }, [clair]);
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
      <div className="barre-budget">
        <p className="mute">Marge de trésorerie</p>
        <p className={"grand-nombre " + (margeCritique ? "negatif" : "")}>
          {marge === Infinity ? "∞" : marge + " j"}
        </p>
      </div>
      <button className="bouton bouton-jour" onClick={passerUnJour}>
        ⏭ Passer un jour
      </button>
      <div className="barre-outils">
        <button
          className="bouton-mini"
          onClick={() => setClair((c) => !c)}
          title="Basculer entre thème sombre et clair (préférence gardée)"
        >
          {clair ? "🌙 Sombre" : "☀️ Clair"}
        </button>
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
  const { etat } = useStore();
  const marge = joursDeMarge(etat);
  const alerte = marge <= 5;
  return (
    <div className="app">
      <BarreVille />
      {alerte ? (
        <div className="alerte-tresorerie" role="alert">
          ⚠️{" "}
          {etat.budgetVille === 0
            ? "Les caisses sont vides ! Il faut choisir : monter le taux d'imposition (Éditeur), fermer un service, ou emprunter (Budget)."
            : "Trésorerie tendue : " +
              marge +
              (marge > 1 ? " jours" : " jour") +
              " de charges en caisse. Monte l'impôt, ferme un service, ou emprunte."}
        </div>
      ) : null}
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
