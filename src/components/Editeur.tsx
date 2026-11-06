// Éditeur du monde : bâtiments, figurines, paramètres de la ville (§6).
// Toutes les modifications passent par les mutateurs purs du moteur.

import { useState, type ReactNode } from "react";
import { useStore } from "../state/store.tsx";
import type { Batiment, EtatBatiment, Pnj, Statut, TypeBatiment, Vocation } from "../engine/types.ts";
import { TRAITS_PNJ } from "../engine/types.ts";
import { COUT_EMPLOYE_PRIVE_L, montantL, salaireJourL } from "../engine/referentiel.ts";
import { effectifMax, employesDuCommerce } from "../engine/moteur.ts";
import {
  ajouterBatiment,
  ajouterGang,
  ajouterPnj,
  modifierBatiment,
  modifierPnj,
  modifierVille,
  nouveauBatiment,
  nouveauGang,
  nouveauPnj,
  supprimerBatiment,
  supprimerGang,
  supprimerPnj,
} from "../engine/monde.ts";

// Grilles resserrées à trois grades par corps (arbitrage Thibaut
// 2026-11-06, référentiel v1.12) : du plus modeste au plus élevé. La garnison
// du monde par défaut (soldat, caporal, capitaine) tient entière dedans.
const GROUPES_GRADES: Array<{ corps: string; grades: string[] }> = [
  { corps: "Mairie", grades: ["adjoint_technique"] },
  { corps: "Police municipale", grades: ["policier_municipal", "major_pm", "inspecteur_pm"] },
  { corps: "Sapeurs-pompiers", grades: ["sapeur_pompier_debutant", "sergent_spp", "colonel_spp"] },
  { corps: "Armée", grades: ["soldat_armee", "caporal_armee", "capitaine_armee"] },
];

const GRADES = GROUPES_GRADES.flatMap((g) => g.grades);

const TYPES_BATIMENT: TypeBatiment[] = ["habitation", "commerce", "service_public"];
const ETATS_BATIMENT: EtatBatiment[] = ["neuf", "bon", "degrade", "sinistre"];

/** Vocations des commerces (monde 100 % fermé, 2026-11-06 ; pas de vocation
 * « prison » : les détenus sont gardés au commissariat, correction 3.10). */
const VOCATIONS_BATIMENT: Array<{ valeur: Vocation | null; libelle: string }> = [
  { valeur: null, libelle: "Boutique (consommation)" },
  { valeur: "sante", libelle: "Santé (facture les soins)" },
  { valeur: "btp", libelle: "BTP (répare les bâtiments)" },
  { valeur: "banque", libelle: "Banque (prête à la ville)" },
];

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
        Impôt unique prélevé à la source :{" "}
        {(etat.params.tauxImpotBp / 100).toLocaleString("fr-FR")} % des gains du jour de
        chacun (solde des agents, salaires et primes des employés privés, marge des
        patrons). Une figurine sans gain ne paie rien.
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
  const [capacite, setCapacite] = useState(b.capacite.toString());
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
        capacite: Number.isFinite(Number(capacite)) ? Number(capacite) : 0,
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
          capacite: Number.isFinite(Number(capacite)) ? Number(capacite) : 0,
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
        <Champ label="Capacité">
          <input className="input" value={capacite} onChange={(e) => setCapacite(e.target.value)} />
        </Champ>
        <button className="bouton" onClick={ajouter}>Ajouter</button>
      </div>
    </div>
  );
}

// ---------- gangs (phase 3.10 : le milieu criminel se crée ici) ----------

function CarteGangs() {
  const { etat, majEtat } = useStore();
  const [nom, setNom] = useState("");
  const [territoire, setTerritoire] = useState("");
  const quartiers = [...new Set(etat.batiments.map((b) => b.quartier))];

  const creer = () => {
    if (nom.trim() === "" || territoire === "") return;
    majEtat(
      ajouterGang(etat, nouveauGang({ nom: nom.trim(), quartiers: [territoire] })),
    );
    setNom("");
    setTerritoire("");
  };

  return (
    <div className="carte">
      <h2>🥷 Gangs ({(etat.gangs ?? []).length})</h2>
      <p className="mute">
        Un gang ne vole que sur son territoire (extensible par la guerre).
        Pour recruter : ouvrir une figurine ci-dessous et choisir son gang.
      </p>
      {(etat.gangs ?? []).map((g) => {
        const membres = etat.pnjs.filter((p) => p.gangId === g.id);
        const detenus = membres.filter((p) => (p.arreteJusqua ?? 0) > etat.jour).length;
        return (
          <div className="ligne-edit" key={g.id}>
            <div className="ligne-edit-tete">
              <span>
                <strong>{g.nom}</strong>{" "}
                <span className="mute">
                  · territoire : {g.quartiers.join(", ")} · {membres.length} membre(s)
                  {detenus > 0 ? " · " + detenus + " détenu(s)" : ""}
                </span>
              </span>
              <button
                className="bouton-mini bouton-supprimer"
                onClick={() => {
                  if (window.confirm("Démanteler " + g.nom + " ? Les membres deviennent indépendants.")) {
                    majEtat(supprimerGang(etat, g.id));
                  }
                }}
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
      <h3>+ Installer un gang</h3>
      <div className="formulaire">
        <Champ label="Nom du gang">
          <input
            className="input"
            placeholder="Les Rats du Port"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
          />
        </Champ>
        <Champ label="Territoire initial">
          <select className="input" value={territoire} onChange={(e) => setTerritoire(e.target.value)}>
            <option value="">— quartier —</option>
            {quartiers.map((q) => (
              <option key={q} value={q}>{q}</option>
            ))}
          </select>
        </Champ>
        <button className="bouton" onClick={creer}>Installer</button>
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

function CartePnjs() {
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

export function Editeur() {
  return (
    <div className="grille-editeur">
      <CarteVille />
      <CarteBatiments />
      <CarteGangs />
      <CartePnjs />
    </div>
  );
}
