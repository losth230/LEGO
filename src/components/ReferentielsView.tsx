// Référentiels : toutes les valeurs réelles avec leur source (cahier §5-§6).
// Lecture seule en phase 1 — l'édition fine arrive avec les phases 2/3.

import { montantL, referentiel } from "../engine/referentiel.ts";

interface LigneRef {
  chemin: string;
  valeur: unknown;
  unite?: string;
  source?: string;
  url?: string;
  annee?: number;
  calcul?: string;
  fiabilite?: string;
  note?: string;
  comptage?: string;
  mensuel_net?: string;
  formule?: string;
}

const TITRES: Record<string, string> = {
  meta: "🌍 Cadre",
  economie: "💰 Économie",
  evenements: "⚡ Événements (pour 10 000 hab./an)",
  services: "🚓 Services",
};

function aplatir(noeud: Record<string, unknown>, chemin: string, out: LigneRef[]): void {
  for (const [cle, valeur] of Object.entries(noeud)) {
    const sousChemin = chemin === "" ? cle : chemin + "." + cle;
    if (valeur !== null && typeof valeur === "object" && !Array.isArray(valeur)) {
      const o = valeur as Record<string, unknown>;
      if ("valeur" in o) {
        out.push({
          chemin: sousChemin,
          valeur: o.valeur,
          unite: o.unite === undefined ? undefined : String(o.unite),
          source: o.source === undefined ? undefined : String(o.source),
          url: o.url === undefined ? undefined : String(o.url),
          annee: o.annee === undefined ? undefined : Number(o.annee),
          calcul: o.calcul === undefined ? undefined : String(o.calcul),
          fiabilite: o.fiabilite === undefined ? undefined : String(o.fiabilite),
          note: o.note === undefined ? undefined : String(o.note),
          comptage: o.comptage === undefined ? undefined : String(o.comptage),
          mensuel_net: o.mensuel_net === undefined ? undefined : String(o.mensuel_net),
          formule: o.formule === undefined ? undefined : String(o.formule),
        });
      } else {
        aplatir(o, sousChemin, out);
      }
    } else if (typeof valeur === "string") {
      out.push({ chemin: sousChemin, valeur });
    }
  }
}

function affichage(l: LigneRef): string {
  if (typeof l.valeur === "number") {
    return String(l.valeur).replace(".", ",");
  }
  return String(l.valeur);
}

export function ReferentielsView() {
  const sections: Array<{ cle: string; lignes: LigneRef[] }> = [];
  const racine = referentiel as Record<string, unknown>;
  for (const [cle, contenu] of Object.entries(racine)) {
    if (cle === "version" || cle === "date_extraction" || cle === "principe") continue;
    if (contenu !== null && typeof contenu === "object") {
      const lignes: LigneRef[] = [];
      aplatir(contenu as Record<string, unknown>, "", lignes);
      sections.push({ cle, lignes });
    }
  }
  const meta = racine as unknown as { meta?: { monnaie?: { note?: string } } };
  return (
    <div className="carte">
      <h2>📚 Référentiel des données réelles</h2>
      <p className="mute">
        Monnaie du jeu : le <strong>LEGO (L)</strong> — 1 L = 1 €. Les valeurs ci-dessous sont les
        sources réelles (en euros) qui calibrent la simulation.{" "}
        {meta.meta?.monnaie?.note ?? ""}
      </p>
      <p className="mute">
        Version du référentiel : {String(racine.version)} — extraction du{" "}
        {String(racine.date_extraction)}. Édition fine des valeurs : phase 2.
      </p>
      {sections.map((s) => (
        <section key={s.cle}>
          <h3>{TITRES[s.cle] ?? s.cle}</h3>
          <table>
            <thead>
              <tr>
                <th>Paramètre</th>
                <th>Valeur</th>
                <th>Source (année)</th>
              </tr>
            </thead>
            <tbody>
              {s.lignes.map((l) => (
                <tr key={l.chemin}>
                  <td>
                    {l.chemin}
                    {l.fiabilite === "proxy" ? <span className="badge badge-proxy">proxy</span> : null}
                    {l.note ? <div className="mute note">{l.note}</div> : null}
                    {l.calcul ? <div className="mute note">Calcul : {l.calcul}</div> : null}
                    {l.comptage ? <div className="mute note">Comptage : {l.comptage}</div> : null}
                    {l.mensuel_net ? <div className="mute note">Mensuel net : {l.mensuel_net} €</div> : null}
                    {l.formule ? <div className="mute note">{l.formule}</div> : null}
                  </td>
                  <td className="col-nombre">
                    {affichage(l)}
                    {l.unite ? <div className="mute">{l.unite}</div> : null}
                  </td>
                  <td>
                    {l.url ? <a href={l.url}>lien</a> : null}{" "}
                    {l.source ? <div className="mute note">{l.source}</div> : null}
                    {l.annee ? <div className="mute">{l.annee}</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      <p className="mute">
        Les montants en L affichés ailleurs dans l'application sont des centimes convertis (ex. :{" "}
        {montantL(40000)} = 40 L de valeur).
      </p>
    </div>
  );
}
