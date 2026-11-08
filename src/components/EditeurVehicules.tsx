// Panneau Véhicules (v1.25) : flotte municipale et véhicules privés —
// mêmes capacités que les bâtiments (logements, postes de travail).
// v1.27 : plus de création instantanée — un véhicule entre en ville en
// chantier, c'est la station-service qui l'assemble.
// v1.28 : un engin de chantier (municipal ou privé à sa figurine) produit
// selon son efficacité, réglable sur sa fiche.

import { useState } from "react";
import { useStore } from "../state/store.tsx";
import type {
  CategorieVehicule,
  EtatBatiment,
  RoleVehicule,
  Vehicule,
} from "../engine/types.ts";
import {
  lancerChantierVehicule,
  modifierVehicule,
  nouveauVehicule,
  supprimerVehicule,
} from "../engine/monde.ts";
import { TRAVAUX_DEFAUT, coutChantier } from "../engine/chantiers.ts";
import {
  Champ,
  nombreL,
  versL,
  CATEGORIES_VEHICULE,
  ROLES_VEHICULE,
  ETATS_BATIMENT,
} from "./EditeurCommuns.tsx";

function LigneVehiculeEdit({ vehicule: v }: { vehicule: Vehicule }) {
  const { etat, majEtat } = useStore();
  const [ouvert, setOuvert] = useState(false);
  const [nom, setNom] = useState(v.nom);
  const [categorie, setCategorie] = useState<CategorieVehicule>(v.categorie);
  const [role, setRole] = useState<RoleVehicule | null>(v.role);
  const [quartier, setQuartier] = useState(v.quartier);
  const [valeur, setValeur] = useState(versL(v.valeur));
  const [etatVeh, setEtatVeh] = useState<EtatBatiment>(v.etat);
  const [essence, setEssence] = useState(versL(v.essenceJour));
  const [logements, setLogements] = useState(v.capaciteLogements.toString());
  const [postes, setPostes] = useState(v.capacitePostes.toString());
  const [proprietaire, setProprietaire] = useState(v.proprietairePnjId ?? "");
  const [garage, setGarage] = useState(v.garageBatimentId ?? "");
  const [efficacite, setEfficacite] = useState(v.efficacite?.toString() ?? "");

  const enregistrer = () => {
    majEtat(
      modifierVehicule(etat, v.id, {
        nom: nom.trim() === "" ? v.nom : nom.trim(),
        categorie,
        role: categorie === "municipal" ? role : role === "chantier" ? "chantier" : null,
        quartier: quartier.trim() === "" ? "Centre" : quartier.trim(),
        valeur: nombreL(valeur),
        etat: etatVeh,
        essenceJour: Math.max(0, nombreL(essence)),
        capaciteLogements: Number.isFinite(Number(logements)) ? Math.max(0, Number(logements)) : 0,
        capacitePostes: Number.isFinite(Number(postes)) ? Math.max(0, Number(postes)) : 0,
        proprietairePnjId: categorie === "prive" && proprietaire !== "" ? proprietaire : null,
        garageBatimentId: garage === "" ? null : garage,
        efficacite:
          role === "chantier" && Number.isFinite(Number(efficacite)) && Number(efficacite) >= 1
            ? Math.round(Number(efficacite))
            : undefined,
      }),
    );
    setOuvert(false);
  };

  return (
    <div className="ligne-edit">
      <div className="ligne-edit-tete">
        <span>
          <strong>{v.nom}</strong>{" "}
          <span className="mute">
            ({v.categorie === "municipal" ? "municipal" + (v.role ? " · " + v.role : "") : "privé"} ·{" "}
            {v.quartier})
          </span>
        </span>
        <span>
          <button className="bouton-mini" onClick={() => setOuvert(!ouvert)}>
            {ouvert ? "Fermer" : "Modifier"}
          </button>{" "}
          <button
            className="bouton-mini bouton-supprimer"
            onClick={() => {
              if (window.confirm("Retirer « " + v.nom + " » de la ville ? Les figurines logées ou affectées seront sans véhicule.")) {
                majEtat(supprimerVehicule(etat, v.id));
              }
            }}
          >
            ✕
          </button>
        </span>
      </div>
      {ouvert ? (
        <div className="formulaire">
          <Champ label="Nom">
            <input className="input" value={nom} onChange={(e) => setNom(e.target.value)} />
          </Champ>
          <Champ label="Catégorie">
            <select
              className="input"
              value={categorie}
              onChange={(e) => setCategorie(e.target.value as CategorieVehicule)}
            >
              {CATEGORIES_VEHICULE.map((c) => (
                <option key={c} value={c}>{c === "municipal" ? "municipal" : "privé"}</option>
              ))}
            </select>
          </Champ>
          {categorie === "municipal" ? (
            <Champ label="Rôle (effet de jeu quand il roule)">
              <select
                className="input"
                value={role ?? ""}
                onChange={(e) => setRole((e.target.value || null) as RoleVehicule | null)}
              >
                {ROLES_VEHICULE.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </Champ>
          ) : (
            <Champ label="Engin de chantier (v1.28 : produit sur le chantier, à son propriétaire)">
              <select
                className="input"
                value={role === "chantier" ? "chantier" : ""}
                onChange={(e) => setRole((e.target.value ? "chantier" : null) as RoleVehicule | null)}
              >
                <option value="">— non —</option>
                <option value="chantier">engin de chantier</option>
              </select>
            </Champ>
          )}
          {role === "chantier" ? (
            <Champ label="Efficacité (travaux/jour sur le chantier — vide = 2)">
              <input className="input" value={efficacite} onChange={(e) => setEfficacite(e.target.value)} />
            </Champ>
          ) : null}
          <Champ label="Quartier">
            <input className="input" value={quartier} onChange={(e) => setQuartier(e.target.value)} />
          </Champ>
          <Champ label="Valeur (L)">
            <input className="input" value={valeur} onChange={(e) => setValeur(e.target.value)} />
          </Champ>
          <Champ label="Essence/jour (L) — achetée à la station-service">
            <input className="input" value={essence} onChange={(e) => setEssence(e.target.value)} />
          </Champ>
          <Champ label="Logements (caravane, roulotte)">
            <input className="input" value={logements} onChange={(e) => setLogements(e.target.value)} />
          </Champ>
          <Champ label="Postes de travail (fourgon du facteur…)">
            <input className="input" value={postes} onChange={(e) => setPostes(e.target.value)} />
          </Champ>
          {categorie === "prive" ? (
            <Champ label="Propriétaire (figurine)">
              <select
                className="input"
                value={proprietaire}
                onChange={(e) => setProprietaire(e.target.value)}
              >
                <option value="">— sans propriétaire (immobilisé) —</option>
                {etat.pnjs.map((p) => (
                  <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>
                ))}
              </select>
            </Champ>
          ) : null}
          <Champ label="Garage (bâtiment d'affectation)">
            <select className="input" value={garage} onChange={(e) => setGarage(e.target.value)}>
              <option value="">— en ville —</option>
              {etat.batiments.map((b) => (
                <option key={b.id} value={b.id}>{b.nom}</option>
              ))}
            </select>
          </Champ>
          <Champ label="État">
            <select
              className="input"
              value={etatVeh}
              onChange={(e) => setEtatVeh(e.target.value as EtatBatiment)}
            >
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

export function CarteVehicules() {
  const { etat, majEtat } = useStore();
  const [nom, setNom] = useState("");
  const [categorie, setCategorie] = useState<CategorieVehicule>("municipal");
  const [role, setRole] = useState<RoleVehicule | null>("pompiers");
  const [quartier, setQuartier] = useState("Centre");
  const [valeur, setValeur] = useState("1500");
  const [essence, setEssence] = useState("8");
  const [logements, setLogements] = useState("0");
  const [postes, setPostes] = useState("0");
  const [proprietaire, setProprietaire] = useState("");
  const [garage, setGarage] = useState("");
  const [efficacite, setEfficacite] = useState("");
  // v1.27 : le véhicule entre en ville en chantier — la station-service
  // l'assemble (onglet 🏗 Chantiers).
  const [travauxTotal, setTravauxTotal] = useState(TRAVAUX_DEFAUT.toString());
  const [cout, setCout] = useState("");

  const coutDefaut = coutChantier(nombreL(valeur));

  const lancer = () => {
    if (nom.trim() === "") return;
    majEtat(
      lancerChantierVehicule(
        etat,
        nouveauVehicule({
          nom: nom.trim(),
          categorie,
          role: categorie === "municipal" ? role : role === "chantier" ? "chantier" : null,
          quartier: quartier.trim() === "" ? "Centre" : quartier.trim(),
          valeur: nombreL(valeur),
          essenceJour: Math.max(0, nombreL(essence)),
          capaciteLogements: Number.isFinite(Number(logements)) ? Math.max(0, Number(logements)) : 0,
          capacitePostes: Number.isFinite(Number(postes)) ? Math.max(0, Number(postes)) : 0,
          proprietairePnjId: categorie === "prive" && proprietaire !== "" ? proprietaire : null,
          garageBatimentId: garage === "" ? null : garage,
          efficacite:
            role === "chantier" && Number.isFinite(Number(efficacite)) && Number(efficacite) >= 1
              ? Math.round(Number(efficacite))
              : undefined,
        }),
        {
          travauxTotal: Number.isFinite(Number(travauxTotal)) && Number(travauxTotal) >= 1
            ? Math.round(Number(travauxTotal))
            : TRAVAUX_DEFAUT,
          coutCentimes: cout.trim() === "" ? undefined : Math.max(0, nombreL(cout)),
        },
      ),
    );
    setNom("");
  };

  return (
    <div className="carte">
      <h2>🚐 Véhicules</h2>
      {(etat.vehicules ?? []).map((v) => (
        <LigneVehiculeEdit key={v.id} vehicule={v} />
      ))}
      <h3>+ Lancer un chantier (v1.27 : la station-service assemble)</h3>
      <div className="formulaire">
        <Champ label="Nom">
          <input className="input" value={nom} onChange={(e) => setNom(e.target.value)} />
        </Champ>
        <Champ label="Catégorie">
          <select
            className="input"
            value={categorie}
            onChange={(e) => setCategorie(e.target.value as CategorieVehicule)}
          >
            {CATEGORIES_VEHICULE.map((c) => (
              <option key={c} value={c}>{c === "municipal" ? "municipal" : "privé"}</option>
            ))}
          </select>
        </Champ>
        {categorie === "municipal" ? (
          <Champ label="Rôle (effet de jeu quand il roule)">
            <select
              className="input"
              value={role ?? ""}
              onChange={(e) => setRole((e.target.value || null) as RoleVehicule | null)}
            >
              {ROLES_VEHICULE.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </Champ>
        ) : (
          <Champ label="Engin de chantier (v1.28 : produira selon son efficacité, pour sa figurine)">
            <select
              className="input"
              value={role === "chantier" ? "chantier" : ""}
              onChange={(e) => setRole((e.target.value ? "chantier" : null) as RoleVehicule | null)}
            >
              <option value="">— non —</option>
              <option value="chantier">engin de chantier</option>
            </select>
          </Champ>
        )}
        {role === "chantier" ? (
          <Champ label="Efficacité (travaux/jour sur le chantier — vide = 2)">
            <input className="input" value={efficacite} onChange={(e) => setEfficacite(e.target.value)} />
          </Champ>
        ) : null}
        <Champ label="Quartier">
          <input className="input" value={quartier} onChange={(e) => setQuartier(e.target.value)} />
        </Champ>
        <Champ label="Valeur (L)">
          <input className="input" value={valeur} onChange={(e) => setValeur(e.target.value)} />
        </Champ>
        <Champ label="Essence/jour (L) — achetée à la station-service">
          <input className="input" value={essence} onChange={(e) => setEssence(e.target.value)} />
        </Champ>
        <Champ label="Logements (caravane, roulotte)">
          <input className="input" value={logements} onChange={(e) => setLogements(e.target.value)} />
        </Champ>
        <Champ label="Postes de travail">
          <input className="input" value={postes} onChange={(e) => setPostes(e.target.value)} />
        </Champ>
        {categorie === "prive" ? (
          <Champ label="Propriétaire (figurine)">
            <select
              className="input"
              value={proprietaire}
              onChange={(e) => setProprietaire(e.target.value)}
            >
              <option value="">— sans propriétaire (immobilisé) —</option>
              {etat.pnjs.map((p) => (
                <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>
              ))}
            </select>
          </Champ>
        ) : null}
        <Champ label="Garage (bâtiment d'affectation)">
          <select className="input" value={garage} onChange={(e) => setGarage(e.target.value)}>
            <option value="">— en ville —</option>
            {etat.batiments.map((b) => (
              <option key={b.id} value={b.id}>{b.nom}</option>
            ))}
          </select>
        </Champ>
        <Champ label="Valeur des travaux (1 mécanicien = 1 travail/jour)">
          <input className="input" value={travauxTotal} onChange={(e) => setTravauxTotal(e.target.value)} />
        </Champ>
        <Champ label={"Coût total (L) — vide = 50 % de la valeur (" + versL(coutDefaut) + " L)"}>
          <input className="input" value={cout} onChange={(e) => setCout(e.target.value)} />
        </Champ>
        <button className="bouton" onClick={lancer}>🏗 Lancer le chantier</button>
      </div>
    </div>
  );
}
