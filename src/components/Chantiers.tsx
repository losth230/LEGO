// Chantiers de la ville (v1.27) — plus de création instantanée : chaque
// bâtiment se construit au BTP, chaque véhicule à la station-service.
// La file montre l'avancement en %, le payeur et l'acompte réglé au fil
// de l'eau ; un seul chantier avance par jour (FIFO), priorisable ici.

import { useStore } from "../state/store.tsx";
import type { Chantier } from "../engine/types.ts";
import { montantL } from "../engine/referentiel.ts";
import { PRODUCTION_OUVRIER, constructeurDu, efficaciteEngin, nomCible, payeurDe } from "../engine/chantiers.ts";
import { employesDuCommerce } from "../engine/economie.ts";
import { prioriserChantier } from "../engine/monde.ts";

export function Chantiers() {
  const { etat, majEtat } = useStore();
  const file = etat.chantiers ?? [];
  return (
    <div className="carte">
      <h2>🏗 Chantiers ({file.length})</h2>
      <p className="mute">
        Rien n'apparaît fini : les bâtiments se construisent au BTP, les véhicules à la
        station-service — 1 travail par ouvrier et par jour, et chaque engin de chantier
        produit selon son efficacité (fiche du véhicule, 2 par défaut). Sans constructeur
        en ville, l'ouvrage avance à la main (1 travail/jour, sans
        paiement). Le coût se règle au prorata de l'avancement : la ville pour un acteur
        public, la figurine commanditaire pour un privé. Un seul chantier avance par jour,
        dans l'ordre de la file.
      </p>
      {file.length === 0 ? (
        <p className="mute">
          Aucun chantier en cours — les nouvelles constructions se lancent depuis l'éditeur
          (Bâtiments ou Véhicules).
        </p>
      ) : (
        file.map((c, i) => (
          <CarteChantier
            key={c.id}
            chantier={c}
            rang={i}
            onPriorise={() => majEtat(prioriserChantier(etat, c.id))}
          />
        ))
      )}
    </div>
  );
}

function CarteChantier({
  chantier: c,
  rang,
  onPriorise,
}: {
  chantier: Chantier;
  rang: number;
  onPriorise: () => void;
}) {
  const { etat } = useStore();
  const constructeur = constructeurDu(etat, c);
  const payeur = payeurDe(etat, c);
  const pct = Math.min(100, Math.round((c.travauxFaits / Math.max(1, c.travauxTotal)) * 100));
  const restant = c.coutCentimes - c.coutPaye;
  // v1.28 : potentiel de l'équipe — ouvriers du constructeur + efficacité
  // des engins de chantier aptes (les sinistrés et les véhicules encore en
  // atelier ne produisent pas, et un engin sans essence ne roule pas).
  const ouvriers = constructeur ? employesDuCommerce(etat, constructeur.bat.id).length : 0;
  const engins = (etat.vehicules ?? []).filter(
    (v) => v.role === "chantier" && v.enConstruction !== true && v.etat !== "sinistre",
  );
  const potentiel = ouvriers * PRODUCTION_OUVRIER + engins.reduce((n, v) => n + efficaciteEngin(v), 0);
  return (
    <section className="chantier-carte">
      <header>
        <h3>
          {c.cibleBatimentId !== null ? "🧱" : "🚐"} {nomCible(etat, c)}
        </h3>
        <p className="mute">
          Lancé le jour {c.jour} · {rang === 0 ? "avance au prochain règlement" : "attend son tour (rang " + (rang + 1) + ")"} ·{" "}
          {constructeur
            ? "construit par " + constructeur.bat.nom
            : "sans constructeur en ville : à la main, 1 travail/jour sans paiement"}
        </p>
        {rang === 0 && constructeur ? (
          <p className="mute">
            Équipe du jour (si tout le monde roule) : {potentiel} travaux — {ouvriers}{" "}
            ouvrier(s) × 1
            {engins.length > 0
              ? " + " + engins.length + " engin(s) (eff. " + engins.map(efficaciteEngin).join(" + ") + ")"
              : ""}
          </p>
        ) : null}
      </header>
      <div className="chantier-progression">
        <div className="chantier-barre">
          <div className="chantier-barre-remplie" style={{ width: pct + "%" }} />
        </div>
        <span className="mute">
          {c.travauxFaits}/{c.travauxTotal} travaux · {pct} %
        </span>
      </div>
      <p className="mute">
        Payeur : {payeur ? payeur.nom : "—"} · Acompte réglé : {montantL(c.coutPaye)} sur{" "}
        {montantL(c.coutCentimes)} · Reste à régler : {montantL(restant)}
      </p>
      {rang > 0 ? (
        <button className="bouton-mini" onClick={onPriorise}>
          ⬆ Prioriser
        </button>
      ) : null}
    </section>
  );
}
