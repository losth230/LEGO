// Panneau Figurines : liste éditable (carte d'identité, traits, casier,
// gang), création avec grade issu du référentiel.

import { useState } from "react";
import { useStore } from "../state/store.tsx";
import type { Pnj, Statut } from "../engine/types.ts";
import { TRAITS_PNJ } from "../engine/types.ts";
import {
  salaireJourL,
  GROUPES_GRADES,
  GRADES
} from "../engine/referentiel.ts";
import {
  ajouterPnj,
  modifierPnj,
  nouveauPnj,
  supprimerPnj
} from "../engine/monde.ts";
import {
  Champ,
  nombreL,
  versL
} from "./EditeurCommuns.tsx";

// ---------- figurines ----------

function LignePnjEdit({ pnj: p }: { pnj: Pnj }) {
  const { etat, majEtat } = useStore();
  const [ouvert, setOuvert] = useState(false);
  const [prenom, setPrenom] = useState(p.prenom);
  const [nom, setNom] = useState(p.nom);
  const [age, setAge] = useState(p.age.toString());
  const [metier, setMetier] = useState(p.metier);
  const [statut, setStatut] = useState<Statut>(p.statut);
  const [grade, setGrade] = useState(p.grade ?? GRADES[0]);
  const [batimentId, setBatimentId] = useState(p.batimentId ?? "");
  const [travailId, setTravailId] = useState(p.travailBatimentId ?? "");
  const [revenu, setRevenu] = useState(versL(p.revenuIndicatif));
  const [achat, setAchat] = useState(versL(p.budgetAchat));
  const [compte, setCompte] = useState(versL(p.compte));
  const [epargne, setEpargne] = useState(versL(p.epargne));
  const [trait1, setTrait1] = useState(p.personnalite?.[0] ?? "honnête");
  const [trait2, setTrait2] = useState(p.personnalite?.[1] ?? "travailleur");
  const [casier, setCasier] = useState(String(p.casier ?? 0));
  const [gang, setGang] = useState(p.gangId ?? "");

  const enregistrer = () => {
    majEtat(
      modifierPnj(etat, p.id, {
        prenom: prenom.trim() === "" ? p.prenom : prenom.trim(),
        nom: nom.trim() === "" ? p.nom : nom.trim(),
        age: Number.isFinite(Number(age)) ? Number(age) : p.age,
        metier: metier.trim() === "" ? p.metier : metier.trim(),
        statut,
        grade: statut === "agent_public" ? grade : undefined,
        batimentId: batimentId === "" ? null : batimentId,
        travailBatimentId: statut === "prive" && travailId !== "" ? travailId : null,
        revenuIndicatif: nombreL(revenu),
        budgetAchat: nombreL(achat),
        compte: nombreL(compte),
        epargne: nombreL(epargne),
        // Carte d'identité (phase 3.9) : le designer façonne le milieu criminel.
        personnalite: [trait1, trait2],
        casier: Number.isFinite(Number(casier)) ? Math.max(0, Number(casier)) : 0,
        gangId: statut === "agent_public" ? null : gang === "" ? null : gang,
      }),
    );
    setOuvert(false);
  };

  return (
    <div className="ligne-edit">
      <div className="ligne-edit-tete">
        <span>
          <strong>{p.prenom} {p.nom}</strong>{" "}
          <span className="mute">({p.metier} · {p.statut})</span>
        </span>
        <span>
          <button className="bouton-mini" onClick={() => setOuvert(!ouvert)}>
            {ouvert ? "Fermer" : "Modifier"}
          </button>{" "}
          <button
            className="bouton-mini bouton-supprimer"
            onClick={() => {
              if (window.confirm("Retirer " + p.prenom + " " + p.nom + " de la ville ?")) {
                majEtat(supprimerPnj(etat, p.id));
              }
            }}
          >
            ✕
          </button>
        </span>
      </div>
      {ouvert ? (
        <div className="formulaire">
          <Champ label="Prénom">
            <input className="input" value={prenom} onChange={(e) => setPrenom(e.target.value)} />
          </Champ>
          <Champ label="Nom">
            <input className="input" value={nom} onChange={(e) => setNom(e.target.value)} />
          </Champ>
          <Champ label="Âge (fixe)">
            <input className="input" value={age} onChange={(e) => setAge(e.target.value)} />
          </Champ>
          <Champ label="Métier (narratif)">
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
          {statut === "prive" ? (
            <Champ label="Lieu de travail (commerce — le salaire privé est le revenu indicatif)">
              <select className="input" value={travailId} onChange={(e) => setTravailId(e.target.value)}>
                <option value="">— sans emploi —</option>
                {etat.batiments
                  .filter((b) => b.type === "commerce")
                  .map((b) => (
                    <option key={b.id} value={b.id}>{b.nom}</option>
                  ))}
              </select>
            </Champ>
          ) : null}
          <Champ label="Bâtiment">
            <select className="input" value={batimentId} onChange={(e) => setBatimentId(e.target.value)}>
              <option value="">— aucun —</option>
              {etat.batiments.map((b) => (
                <option key={b.id} value={b.id}>{b.nom}</option>
              ))}
            </select>
          </Champ>
          <Champ label="Revenu indicatif (L/jour)">
            <input className="input" value={revenu} onChange={(e) => setRevenu(e.target.value)} />
          </Champ>
          <Champ label="Budget d'achat (L/jour)">
            <input className="input" value={achat} onChange={(e) => setAchat(e.target.value)} />
          </Champ>
          <Champ label="Compte (L)">
            <input className="input" value={compte} onChange={(e) => setCompte(e.target.value)} />
          </Champ>
          <Champ label="Épargne (L)">
            <input className="input" value={epargne} onChange={(e) => setEpargne(e.target.value)} />
          </Champ>
          <Champ label="Trait de personnalité n°1 (carte d'identité)">
            <select className="input" value={trait1} onChange={(e) => setTrait1(e.target.value)}>
              {TRAITS_PNJ.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Champ>
          <Champ label="Trait de personnalité n°2">
            <select className="input" value={trait2} onChange={(e) => setTrait2(e.target.value)}>
              {TRAITS_PNJ.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Champ>
          <Champ label="Casier judiciaire (cambriolages commis)">
            <input className="input" value={casier} onChange={(e) => setCasier(e.target.value)} />
          </Champ>
          {statut !== "agent_public" ? (
            <Champ label="Gang (vide : indépendant)">
              <select className="input" value={gang} onChange={(e) => setGang(e.target.value)}>
                <option value="">— aucun (indépendant) —</option>
                {(etat.gangs ?? []).map((g) => (
                  <option key={g.id} value={g.id}>{g.nom}</option>
                ))}
              </select>
            </Champ>
          ) : null}
          <button className="bouton" onClick={enregistrer}>Enregistrer</button>
        </div>
      ) : null}
    </div>
  );
}

export function CartePnjs() {
  const { etat, majEtat } = useStore();
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [metier, setMetier] = useState("");
  const [statut, setStatut] = useState<Statut>("prive");
  const [grade, setGrade] = useState(GRADES[0]);
  const [batimentId, setBatimentId] = useState("");
  const [travailId, setTravailId] = useState("");
  const [revenu, setRevenu] = useState("52,50");

  const ajouter = () => {
    if (prenom.trim() === "" || nom.trim() === "") return;
    const p = nouveauPnj({
      prenom: prenom.trim(),
      nom: nom.trim(),
      metier: metier.trim() === "" ? "sans profession" : metier.trim(),
      statut,
      grade: statut === "agent_public" ? grade : undefined,
      batimentId: batimentId === "" ? null : batimentId,
      travailBatimentId: statut === "prive" && travailId !== "" ? travailId : null,
      revenuIndicatif: nombreL(revenu),
    });
    majEtat(ajouterPnj(etat, p));
    setPrenom("");
    setNom("");
    setMetier("");
  };

  return (
    <div className="carte">
      <h2>👥 Figurines ({etat.pnjs.length})</h2>
      {etat.pnjs.map((p) => (
        <LignePnjEdit key={p.id} pnj={p} />
      ))}
      <h3>+ Ajouter une figurine</h3>
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
        {statut === "prive" ? (
          <Champ label="Lieu de travail (commerce — le salaire privé est le revenu indicatif)">
            <select className="input" value={travailId} onChange={(e) => setTravailId(e.target.value)}>
              <option value="">— sans emploi —</option>
              {etat.batiments
                .filter((b) => b.type === "commerce")
                .map((b) => (
                  <option key={b.id} value={b.id}>{b.nom}</option>
                ))}
            </select>
          </Champ>
        ) : null}
        <Champ label="Bâtiment">
          <select className="input" value={batimentId} onChange={(e) => setBatimentId(e.target.value)}>
            <option value="">— aucun —</option>
            {etat.batiments.map((b) => (
              <option key={b.id} value={b.id}>{b.nom}</option>
            ))}
          </select>
        </Champ>
        <Champ label="Revenu indicatif (L/jour)">
          <input className="input" value={revenu} onChange={(e) => setRevenu(e.target.value)} />
        </Champ>
        <button className="bouton" onClick={ajouter}>Ajouter</button>
      </div>
    </div>
  );
}
