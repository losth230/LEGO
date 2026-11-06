// Panneau Paramètres de la ville : nom, budget, taux d'impôt, K.

import { useState } from "react";
import { useStore } from "../state/store.tsx";
import { modifierVille } from "../engine/monde.ts";
import {
  Champ,
  nombreL,
  versL
} from "./EditeurCommuns.tsx";

// ---------- carte ville ----------

export function CarteVille() {
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
