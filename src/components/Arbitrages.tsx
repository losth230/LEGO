// Arbitrages du maître du jeu (v1.26) — les incidents surviennent, la
// simulation ne tranche plus : chaque incident attend sa carte ici, le
// joueur choisit l'issue, le jeu applique les L. L'issue attendue est
// suggérée (✓), la pire (⚠️) s'impose seule au bout du délai.

import { useStore } from "../state/store.tsx";
import type { Arbitrage } from "../engine/types.ts";

const ICONES: Record<Arbitrage["type"], string> = {
  incendie: "🔥",
  cambriolage: "🥷",
  guerre_gangs: "⚔️",
  collision: "💥",
  vol_vehicule: "🚗",
  accident: "🚑",
};

export function Arbitrages() {
  const { etat, resoudreArbitrage } = useStore();
  const file = etat.arbitrages ?? [];
  return (
    <div className="carte">
      <h2>⚖️ Arbitrages du maître du jeu ({file.length})</h2>
      <p className="mute">
        La ville subit ses incidents — probabilités inchangées — mais c'est le maître du jeu
        qui décide de l'issue. Sans réponse sous 3 jours, la pire issue s'impose seule :
        la partie continue, le récit se règle au pire.
      </p>
      {file.length === 0 ? (
        <p className="mute">
          Aucun incident en attente — la ville attend le maître du jeu, le maître du jeu
          attend la ville.
        </p>
      ) : (
        file.map((a) => (
          <CarteArbitrage
            key={a.id}
            arbitrage={a}
            jour={etat.jour}
            onChoisit={(propositionId) => resoudreArbitrage(a.id, propositionId)}
          />
        ))
      )}
    </div>
  );
}

function CarteArbitrage({
  arbitrage: a,
  jour,
  onChoisit,
}: {
  arbitrage: Arbitrage;
  jour: number;
  onChoisit: (propositionId: string) => void;
}) {
  const restants = a.expireLe - jour;
  const echeance =
    restants <= 0
      ? "la pire issue s'impose au prochain jour"
      : restants === 1
        ? "dernier jour avant la pire issue"
        : "pire issue le jour " + a.expireLe + " sans réponse";
  return (
    <section className="arbitrage-carte">
      <header>
        <h3>
          {ICONES[a.type]} {a.titre}
        </h3>
        <p className="mute">
          Gravité {a.gravite} · survenu le jour {a.jour} · {echeance}
        </p>
      </header>
      <div className="arbitrage-propositions">
        {a.propositions.map((p) => (
          <button
            key={p.id}
            className={
              "bouton proposition" +
              (p.attendu ? " proposition-suggeree" : "") +
              (p.pire ? " proposition-pire" : "")
            }
            onClick={() => onChoisit(p.id)}
          >
            {p.libelle}
            {p.attendu ? " ✓" : ""}
            {p.pire ? " ⚠️" : ""}
          </button>
        ))}
      </div>
      <p className="mute">✓ issue attendue de la simulation · ⚠️ la pire, à l'échéance</p>
    </section>
  );
}
