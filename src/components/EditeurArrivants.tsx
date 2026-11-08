// Panneau Arrivants (v1.30, demande Thibaut « ajouter de nouveaux
// arrivants, potentiellement avec maison et/ou véhicule ») : un seul
// formulaire accueille la figurine et, au choix, sa maison et son
// véhicule — tout arrive déjà relié (logement, propriété).

import { useState } from "react";
import { useStore } from "../state/store.tsx";
import type { Statut } from "../engine/types.ts";
import {
  salaireJourL,
  GROUPES_GRADES,
  GRADES
} from "../engine/referentiel.ts";
import {
  accueillirArrivant,
  nouveauBatiment,
  nouveauPnj,
  nouveauVehicule
} from "../engine/monde.ts";
import { Champ, nombreL } from "./EditeurCommuns.tsx";

export function CarteArrivants() {
  const { etat, majEtat } = useStore();
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [metier, setMetier] = useState("");
  const [statut, setStatut] = useState<Statut>("prive");
  const [grade, setGrade] = useState(GRADES[0]);
  const [revenu, setRevenu] = useState("52,50");
  const [compte, setCompte] = useState("4000");
  // La maison de l'arrivant (optionnelle).
  const [avecMaison, setAvecMaison] = useState(false);
  const [nomMaison, setNomMaison] = useState("");
  const [logements, setLogements] = useState("1");
  const [valeurMaison, setValeurMaison] = useState("3000");
  // Le véhicule de l'arrivant (optionnel) — engin de chantier au choix.
  const [avecVehicule, setAvecVehicule] = useState(false);
  const [nomVehicule, setNomVehicule] = useState("");
  const [valeurVehicule, setValeurVehicule] = useState("900");
  const [essence, setEssence] = useState("8");
  const [engin, setEngin] = useState(false);
  const [efficacite, setEfficacite] = useState("2");

  const accueillir = () => {
    if (prenom.trim() === "" || nom.trim() === "") return;
    const p = prenom.trim();
    const maison =
      avecMaison &&
      nouveauBatiment({
        nom: nomMaison.trim() === "" ? "Maison de " + p : nomMaison.trim(),
        type: "habitation",
        capaciteLogements: Math.max(1, Math.round(Number(logements) || 1)),
        valeur: nombreL(valeurMaison),
      });
    const vehicule =
      avecVehicule &&
      nouveauVehicule({
        nom:
          nomVehicule.trim() === ""
            ? (engin ? "Engin de " : "Voiture de ") + p
            : nomVehicule.trim(),
        categorie: "prive",
        role: engin ? "chantier" : null,
        efficacite: engin ? Math.max(1, Math.round(Number(efficacite) || 2)) : undefined,
        // Un engin vit sur son réservoir (50 L, plein à l'arrivée) ;
        // une voiture passe à la pompe quotidienne.
        essenceJour: engin ? 0 : nombreL(essence),
        valeur: nombreL(valeurVehicule),
      });
    majEtat(
      accueillirArrivant(etat, {
        pnj: nouveauPnj({
          prenom: p,
          nom: nom.trim(),
          metier: metier.trim() === "" ? "sans profession" : metier.trim(),
          statut,
          grade: statut === "agent_public" ? grade : undefined,
          revenuIndicatif: nombreL(revenu),
          compte: nombreL(compte),
        }),
        maison: maison || undefined,
        vehicule: vehicule || undefined,
      }),
    );
    setPrenom("");
    setNom("");
    setMetier("");
    setNomMaison("");
    setNomVehicule("");
  };

  return (
    <div className="carte">
      <h2>🚚 Nouvel arrivant</h2>
      <p className="note">
        La figurine débarque en ville avec, au choix, sa maison et/ou son
        véhicule — tout arrive déjà relié : elle loge chez elle et possède
        sa voiture (ou son engin de chantier, réservoir plein).
      </p>
      <div className="formulaire">
        <Champ label="Prénom">
          <input className="input" value={prenom} onChange={(e) => setPrenom(e.target.value)} />
        </Champ>
        <Champ label="Nom">
          <input className="input" value={nom} onChange={(e) => setNom(e.target.value)} />
        </Champ>
        <Champ label="Métier">
          <input className="input" value={metier} onChange={(e) => setMetier(e.target.value)} />
        </Champ>
        <Champ label="Statut">
          <select className="input" value={statut} onChange={(e) => setStatut(e.target.value as Statut)}>
            <option value="prive">privé</option>
            <option value="commercant">commerçant</option>
            <option value="agent_public">agent public</option>
          </select>
        </Champ>
        {statut === "agent_public" ? (
          <Champ label={"Grade (salaire " + salaireJourL(grade) + " L/jour)"}>
            <select className="input" value={grade} onChange={(e) => setGrade(e.target.value)}>
              {GROUPES_GRADES.map((g) => (
                <optgroup key={g.corps} label={g.corps}>
                  {g.grades.map((gr) => (
                    <option key={gr} value={gr}>{gr}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Champ>
        ) : null}
        <Champ label="Revenu indicatif (L/jour)">
          <input className="input" value={revenu} onChange={(e) => setRevenu(e.target.value)} />
        </Champ>
        <Champ label="Cagnotte d'arrivée (L)">
          <input className="input" value={compte} onChange={(e) => setCompte(e.target.value)} />
        </Champ>

        <label className="champ">
          <span>
            <input
              type="checkbox"
              checked={avecMaison}
              onChange={(e) => setAvecMaison(e.target.checked)}
            />{" "}
            Il arrive avec sa maison
          </span>
        </label>
        {avecMaison ? (
          <>
            <Champ label="Nom de la maison (vide = « Maison de … »)">
              <input className="input" value={nomMaison} onChange={(e) => setNomMaison(e.target.value)} />
            </Champ>
            <Champ label="Logements (dont le sien)">
              <input className="input" value={logements} onChange={(e) => setLogements(e.target.value)} />
            </Champ>
            <Champ label="Valeur (L)">
              <input className="input" value={valeurMaison} onChange={(e) => setValeurMaison(e.target.value)} />
            </Champ>
          </>
        ) : null}

        <label className="champ">
          <span>
            <input
              type="checkbox"
              checked={avecVehicule}
              onChange={(e) => setAvecVehicule(e.target.checked)}
            />{" "}
            Il arrive avec son véhicule
          </span>
        </label>
        {avecVehicule ? (
          <>
            <Champ label="Nom du véhicule (vide = « Voiture de … »)">
              <input className="input" value={nomVehicule} onChange={(e) => setNomVehicule(e.target.value)} />
            </Champ>
            <Champ label="Valeur (L)">
              <input className="input" value={valeurVehicule} onChange={(e) => setValeurVehicule(e.target.value)} />
            </Champ>
            <label className="champ">
              <span>
                <input type="checkbox" checked={engin} onChange={(e) => setEngin(e.target.checked)} />{" "}
                Engin de chantier (réservoir 50 L, 1 L par travail posé)
              </span>
            </label>
            {engin ? (
              <Champ label="Efficacité (travaux/jour)">
                <input className="input" value={efficacite} onChange={(e) => setEfficacite(e.target.value)} />
              </Champ>
            ) : (
              <Champ label="Essence (L/jour, achetée à la station-service)">
                <input className="input" value={essence} onChange={(e) => setEssence(e.target.value)} />
              </Champ>
            )}
          </>
        ) : null}

        <button className="bouton" onClick={accueillir}>
          🚚 Accueillir en ville
        </button>
      </div>
    </div>
  );
}
