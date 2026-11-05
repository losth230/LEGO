// Éditeur du monde : bâtiments, figurines, paramètres de la ville (§6).
// Toutes les modifications passent par les mutateurs purs du moteur.

import { useState, type ReactNode } from "react";
import { useStore } from "../state/store.tsx";
import type { EtatBatiment, Pnj, Statut, TypeBatiment } from "../engine/types.ts";
import { montantL, salaireJourL } from "../engine/referentiel.ts";
import {
  ajouterBatiment,
  ajouterPnj,
  modifierBatiment,
  modifierPnj,
  modifierVille,
  nouveauBatiment,
  nouveauPnj,
  supprimerBatiment,
  supprimerPnj,
} from "../engine/monde.ts";

const GROUPES_GRADES: Array<{ corps: string; grades: string[] }> = [
  { corps: "Mairie", grades: ["adjoint_technique"] },
  { corps: "Police municipale", grades: ["policier_municipal", "brigadier_pm", "brigadier_chef_pm", "major_pm", "inspecteur_pm"] },
  { corps: "Sapeurs-pompiers", grades: ["sapeur_pompier_debutant", "sapeur_1re_classe_spp", "caporal_spp", "caporal_chef_spp", "sergent_spp", "adjudant_spp", "adjudant_chef_spp", "lieutenant_spp", "capitaine_spp", "commandant_spp", "lieutenant_colonel_spp", "colonel_spp"] },
  { corps: "Armée", grades: ["soldat_armee", "caporal_armee", "caporal_chef_armee", "sergent_armee", "sergent_chef_armee", "sous_lieutenant_armee", "adjudant_armee", "adjudant_chef_armee", "major_armee", "lieutenant_armee", "capitaine_armee", "commandant_armee", "lieutenant_colonel_armee", "colonel_armee", "general_armee"] },
];

const GRADES = GROUPES_GRADES.flatMap((g) => g.grades);

const TYPES_BATIMENT: TypeBatiment[] = ["habitation", "commerce", "service_public"];
const ETATS_BATIMENT: EtatBatiment[] = ["neuf", "bon", "degrade", "sinistre"];

// ---------- petits contrôles ----------

function Champ({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="champ">
      <span>{label}</span>
      {children}
    </label>
  );
}

function nombreL(entree: string): number {
  const v = Number(entree.replace(",", "."));
  return Number.isFinite(v) ? Math.round(v * 100) : 0;
}

function versL(centimes: number): string {
  return (centimes / 100).toString();
}

// ---------- carte ville ----------

function CarteVille() {
  const { etat, majEtat } = useStore();
  const [nom, setNom] = useState(etat.nomVille);
  const [budget, setBudget] = useState(versL(etat.budgetVille));
  const [taux, setTaux] = useState((etat.params.tauxImpotBp / 100).toString());
  const [k, setK] = useState(String(etat.params.coeffIntensite));
  return (
    <div className="carte">
      <h2>🏙 Paramètres de la ville</h2>
      <div className="formulaire">
        <Champ label="Nom de la ville">
          <input className="input" value={nom} onChange={(e) => setNom(e.target.value)} />
        </Champ>
        <Champ label="Budget municipal (L)">
          <input className="input" value={budget} onChange={(e) => setBudget(e.target.value)} />
        </Champ>
        <Champ label="Taux d'imposition quotidien (%)">
          <input className="input" value={taux} onChange={(e) => setTaux(e.target.value)} />
        </Champ>
        <Champ label="Coefficient d'intensité K (curseur d'animation)">
          <input className="input" value={k} onChange={(e) => setK(e.target.value)} />
        </Champ>
        <button
          className="bouton"
          onClick={() => {
            const t = Number(taux.replace(",", ".")) * 100;
            const kNum = Number(k.replace(",", "."));
            majEtat(
              modifierVille(etat, {
                nomVille: nom,
                budgetVille: nombreL(budget),
                tauxImpotBp: Number.isFinite(t) ? Math.round(t) : etat.params.tauxImpotBp,
                coeffIntensite: Number.isFinite(kNum) && kNum >= 1 ? Math.round(kNum) : etat.params.coeffIntensite,
              }),
            );
          }}
        >
          Appliquer
        </button>
      </div>
      <p className="mute">
        Impôt payé par une figurine au revenu médian (52,50 L) :{" "}
        {montantL(Math.round((5250 * etat.params.tauxImpotBp) / 10000))} / jour.
      </p>
      <p className="mute">
        K règle le rythme des incidents (proba = taux réel × figurines × K ÷ 10 000 ÷ 365) :{" "}
        100 = paisible, 1 000 = animé (défaut), 10 000 = frénétique. Ville petite ? Monte K
        pour garder la même vie qu'une grande.
      </p>
    </div>
  );
}

// ---------- bâtiments ----------

function LigneBatimentEdit({ batiment: b }: { batiment: import("../engine/types.ts").Batiment }) {
  const { etat, majEtat } = useStore();
  const [ouvert, setOuvert] = useState(false);
  const [nom, setNom] = useState(b.nom);
  const [quartier, setQuartier] = useState(b.quartier);
  const [valeur, setValeur] = useState(versL(b.valeur));
  const [fonctionnement, setFonctionnement] = useState(versL(b.coutFonctionnement));
  const [type, setType] = useState<TypeBatiment>(b.type);
  const [etatBat, setEtatBat] = useState<EtatBatiment>(b.etat);
  const [capacite, setCapacite] = useState(b.capacite.toString());

  const enregistrer = () => {
    majEtat(
      modifierBatiment(etat, b.id, {
        nom,
        quartier,
        type,
        etat: etatBat,
        valeur: nombreL(valeur),
        coutFonctionnement: nombreL(fonctionnement),
        capacite: Number.isFinite(Number(capacite)) ? Number(capacite) : 0,
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
          <Champ label="Valeur (L)">
            <input className="input" value={valeur} onChange={(e) => setValeur(e.target.value)} />
          </Champ>
          <Champ label="Coût de fonctionnement/jour (L)">
            <input className="input" value={fonctionnement} onChange={(e) => setFonctionnement(e.target.value)} />
          </Champ>
          <Champ label="Capacité">
            <input className="input" value={capacite} onChange={(e) => setCapacite(e.target.value)} />
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

function CarteBatiments() {
  const { etat, majEtat } = useStore();
  const [nom, setNom] = useState("");
  const [type, setType] = useState<TypeBatiment>("habitation");
  const [quartier, setQuartier] = useState("Centre");
  const [valeur, setValeur] = useState("3000");
  const [fonctionnement, setFonctionnement] = useState("0");
  const [capacite, setCapacite] = useState("4");

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
          capacite: Number.isFinite(Number(capacite)) ? Number(capacite) : 0,
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
        <Champ label="Quartier">
          <input className="input" value={quartier} onChange={(e) => setQuartier(e.target.value)} />
        </Champ>
        <Champ label="Valeur (L)">
          <input className="input" value={valeur} onChange={(e) => setValeur(e.target.value)} />
        </Champ>
        <Champ label="Fonctionnement/jour (L)">
          <input className="input" value={fonctionnement} onChange={(e) => setFonctionnement(e.target.value)} />
        </Champ>
        <Champ label="Capacité">
          <input className="input" value={capacite} onChange={(e) => setCapacite(e.target.value)} />
        </Champ>
        <button className="bouton" onClick={ajouter}>Ajouter</button>
      </div>
    </div>
  );
}

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
  const [revenu, setRevenu] = useState(versL(p.revenuIndicatif));
  const [achat, setAchat] = useState(versL(p.budgetAchat));
  const [compte, setCompte] = useState(versL(p.compte));
  const [epargne, setEpargne] = useState(versL(p.epargne));

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
        revenuIndicatif: nombreL(revenu),
        budgetAchat: nombreL(achat),
        compte: nombreL(compte),
        epargne: nombreL(epargne),
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
          <button className="bouton" onClick={enregistrer}>Enregistrer</button>
        </div>
      ) : null}
    </div>
  );
}

function CartePnjs() {
  const { etat, majEtat } = useStore();
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [metier, setMetier] = useState("");
  const [statut, setStatut] = useState<Statut>("prive");
  const [grade, setGrade] = useState(GRADES[0]);
  const [batimentId, setBatimentId] = useState("");
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

export function Editeur() {
  return (
    <div className="grille-editeur">
      <CarteVille />
      <CarteBatiments />
      <CartePnjs />
    </div>
  );
}
