// Panneau Bâtiments : liste éditable, vocations (santé, BTP, banque),
// calibrage du modèle flux par commerce.

import { useState } from "react";
import { useStore } from "../state/store.tsx";
import type { Batiment, EtatBatiment, TypeBatiment, Vocation } from "../engine/types.ts";
import {
  COUT_EMPLOYE_PRIVE_L,
  montantL
} from "../engine/referentiel.ts";
import {
  effectifMax,
  employesDuCommerce
} from "../engine/moteur.ts";
import {
  ajouterBatiment,
  modifierBatiment,
  nouveauBatiment,
  supprimerBatiment
} from "../engine/monde.ts";
import {
  Champ,
  nombreL,
  versL,
  TYPES_BATIMENT,
  ETATS_BATIMENT,
  VOCATIONS_BATIMENT
} from "./EditeurCommuns.tsx";

// ---------- bâtiments ----------

/** Calibrage du modèle flux affiché sur chaque commerce (phase 3.6). */
function InfoCommerce({ batiment: b }: { batiment: Batiment }) {
  const { etat } = useStore();
  const proprio = etat.pnjs.find((p) => p.batimentId === b.id && p.statut === "commercant");
  const recettes = etat.recettesCommerce?.[b.id] ?? 0;
  const employes = employesDuCommerce(etat, b.id).length;
  const cout = Math.round(COUT_EMPLOYE_PRIVE_L * 100);
  const conseille = effectifMax(recettes, cout);
  return (
    <p className="mute">
      {proprio
        ? "Recettes de la veille : " + montantL(recettes)
        : "Commerce sans commerçant : il n'encaisse rien"}{" "}
      · Employé(s) : {employes} · Calibrage flux : jusqu'à ~{conseille} figurine(s) à{" "}
      {montantL(cout)}/jour (88 % des recettes en salaires).
    </p>
  );
}

function LigneBatimentEdit({ batiment: b }: { batiment: import("../engine/types.ts").Batiment }) {
  const { etat, majEtat } = useStore();
  const [ouvert, setOuvert] = useState(false);
  const [nom, setNom] = useState(b.nom);
  const [quartier, setQuartier] = useState(b.quartier);
  const [valeur, setValeur] = useState(versL(b.valeur));
  const [fonctionnement, setFonctionnement] = useState(versL(b.coutFonctionnement));
  const [type, setType] = useState<TypeBatiment>(b.type);
  const [etatBat, setEtatBat] = useState<EtatBatiment>(b.etat);
  const [capaciteLogements, setCapaciteLogements] = useState(b.capaciteLogements.toString());
  const [capacitePostes, setCapacitePostes] = useState(b.capacitePostes.toString());
  const [vocation, setVocation] = useState<Vocation | null>(b.vocation ?? null);

  const enregistrer = () => {
    majEtat(
      modifierBatiment(etat, b.id, {
        nom,
        quartier,
        type,
        etat: etatBat,
        valeur: nombreL(valeur),
        coutFonctionnement: nombreL(fonctionnement),
        capaciteLogements: Number.isFinite(Number(capaciteLogements)) ? Number(capaciteLogements) : 0,
        capacitePostes: Number.isFinite(Number(capacitePostes)) ? Number(capacitePostes) : 0,
        vocation: type === "commerce" ? vocation : null,
      }),
    );
    setOuvert(false);
  };

  return (
    <div className="ligne-edit">
      <div className="ligne-edit-tete">
        <span>
          <strong>{b.nom}</strong> <span className="mute">({type} · {b.quartier})</span>
        </span>
        <span>
          <button className="bouton-mini" onClick={() => setOuvert(!ouvert)}>
            {ouvert ? "Fermer" : "Modifier"}
          </button>{" "}
          <button
            className="bouton-mini bouton-supprimer"
            onClick={() => {
              if (window.confirm("Supprimer « " + b.nom + " » ? Les figurines liées seront sans bâtiment.")) {
                majEtat(supprimerBatiment(etat, b.id));
              }
            }}
          >
            ✕
          </button>
        </span>
      </div>
      {b.type === "commerce" ? <InfoCommerce batiment={b} /> : null}
      {ouvert ? (
        <div className="formulaire">
          <Champ label="Nom">
            <input className="input" value={nom} onChange={(e) => setNom(e.target.value)} />
          </Champ>
          <Champ label="Type">
            <select className="input" value={type} onChange={(e) => setType(e.target.value as TypeBatiment)}>
              {TYPES_BATIMENT.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Champ>
          <Champ label="Quartier">
            <input className="input" value={quartier} onChange={(e) => setQuartier(e.target.value)} />
          </Champ>
          {type === "commerce" ? (
            <Champ label="Vocation (monde fermé)">
              <select
                className="input"
                value={vocation ?? ""}
                onChange={(e) => setVocation((e.target.value || null) as Vocation | null)}
              >
                {VOCATIONS_BATIMENT.map((v) => (
                  <option key={String(v.valeur)} value={v.valeur ?? ""}>{v.libelle}</option>
                ))}
              </select>
            </Champ>
          ) : null}
          <Champ label="Valeur (L)">
            <input className="input" value={valeur} onChange={(e) => setValeur(e.target.value)} />
          </Champ>
          <Champ label="Coût de fonctionnement/jour (L)">
            <input className="input" value={fonctionnement} onChange={(e) => setFonctionnement(e.target.value)} />
          </Champ>
          <Champ label="Logements">
            <input className="input" value={capaciteLogements} onChange={(e) => setCapaciteLogements(e.target.value)} />
          </Champ>
          <Champ label="Postes de travail">
            <input className="input" value={capacitePostes} onChange={(e) => setCapacitePostes(e.target.value)} />
          </Champ>
          <Champ label="État">
            <select className="input" value={etatBat} onChange={(e) => setEtatBat(e.target.value as EtatBatiment)}>
              {ETATS_BATIMENT.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Champ>
          <button className="bouton" onClick={enregistrer}>Enregistrer</button>
        </div>
      ) : null}
    </div>
  );
}

export function CarteBatiments() {
  const { etat, majEtat } = useStore();
  const [nom, setNom] = useState("");
  const [type, setType] = useState<TypeBatiment>("habitation");
  const [quartier, setQuartier] = useState("Centre");
  const [valeur, setValeur] = useState("3000");
  const [fonctionnement, setFonctionnement] = useState("0");
  const [capaciteLogements, setCapaciteLogements] = useState("4");
  const [capacitePostes, setCapacitePostes] = useState("0");
  const [vocation, setVocation] = useState<Vocation | null>(null);

  const ajouter = () => {
    if (nom.trim() === "") return;
    majEtat(
      ajouterBatiment(
        etat,
        nouveauBatiment({
          nom: nom.trim(),
          type,
          quartier: quartier.trim() === "" ? "Centre" : quartier.trim(),
          valeur: nombreL(valeur),
          coutFonctionnement: nombreL(fonctionnement),
          capaciteLogements: Number.isFinite(Number(capaciteLogements)) ? Number(capaciteLogements) : 0,
          capacitePostes: Number.isFinite(Number(capacitePostes)) ? Number(capacitePostes) : 0,
          vocation: type === "commerce" ? vocation : null,
        }),
      ),
    );
    setNom("");
  };

  return (
    <div className="carte">
      <h2>🧱 Bâtiments</h2>
      {etat.batiments.map((b) => (
        <LigneBatimentEdit key={b.id} batiment={b} />
      ))}
      <h3>+ Ajouter un bâtiment</h3>
      <div className="formulaire">
        <Champ label="Nom">
          <input className="input" value={nom} onChange={(e) => setNom(e.target.value)} />
        </Champ>
        <Champ label="Type">
          <select className="input" value={type} onChange={(e) => setType(e.target.value as TypeBatiment)}>
            {TYPES_BATIMENT.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </Champ>
        {type === "commerce" ? (
          <Champ label="Vocation (monde fermé)">
            <select
              className="input"
              value={vocation ?? ""}
              onChange={(e) => setVocation((e.target.value || null) as Vocation | null)}
            >
              {VOCATIONS_BATIMENT.map((v) => (
                <option key={String(v.valeur)} value={v.valeur ?? ""}>{v.libelle}</option>
              ))}
            </select>
          </Champ>
        ) : null}
        <Champ label="Quartier">
          <input className="input" value={quartier} onChange={(e) => setQuartier(e.target.value)} />
        </Champ>
        <Champ label="Valeur (L)">
          <input className="input" value={valeur} onChange={(e) => setValeur(e.target.value)} />
        </Champ>
        <Champ label="Fonctionnement/jour (L)">
          <input className="input" value={fonctionnement} onChange={(e) => setFonctionnement(e.target.value)} />
        </Champ>
        <Champ label="Logements">
          <input className="input" value={capaciteLogements} onChange={(e) => setCapaciteLogements(e.target.value)} />
        </Champ>
        <Champ label="Postes de travail">
          <input className="input" value={capacitePostes} onChange={(e) => setCapacitePostes(e.target.value)} />
        </Champ>
        <button className="bouton" onClick={ajouter}>Ajouter</button>
      </div>
    </div>
  );
}
