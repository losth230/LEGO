// Panneau Nuage (v1.32) : sauvegardes en ligne dans le dépôt GitHub du jeu.
// 3 emplacements (Ville A/B/C), boutons manuels Envoyer/Charger — pas
// d'auto-envoi, la ville ne part dans le nuage que si le joueur le demande.

import { useEffect, useState } from "react";
import { useStore } from "../state/store.tsx";
import { montantL } from "../engine/referentiel.ts";
import {
  LIBELLES_SLOTS,
  SLOTS,
  envoyerSlot,
  lireSlot,
  lireToken,
  sauverToken,
  type Slot,
} from "../state/nuage.ts";

type InfoSlot = EtatCharge | null | "erreur" | "en cours";
type EtatCharge = { jour: number; figurines: number; caisse: number; nomVille: string };

function texteInfo(info: InfoSlot | undefined): string {
  if (info === undefined) return "…";
  if (info === "en cours") return "lecture…";
  if (info === "erreur") return "illisible (ou quota GitHub atteint)";
  return "Jour " + info.jour + " · " + info.figurines + " figurines · " + info.nomVille + " · " + montantL(info.caisse);
}

export function Nuage({ fermer }: { fermer: () => void }) {
  const { etat, majEtat } = useStore();
  const [jeton, setJeton] = useState("");
  const [jetonMemorise, setJetonMemorise] = useState(() => lireToken() !== "");
  const [infos, setInfos] = useState<Partial<Record<Slot, InfoSlot>>>({});
  const [occupe, setOccupe] = useState<Slot | null>(null);
  const [message, setMessage] = useState("");

  // À l'ouverture : lire les 3 emplacements (le dépôt est public, la lecture
  // marche même sans jeton — c'est l'envoi qui l'exige).
  useEffect(() => {
    let monte = true;
    for (const slot of SLOTS) {
      setInfos((i) => ({ ...i, [slot]: "en cours" }));
      lireSlot(slot)
        .then((e) => {
          if (!monte) return;
          setInfos((i) => ({
            ...i,
            [slot]:
              e === null
                ? null
                : { jour: e.jour, figurines: e.pnjs.length, caisse: e.budgetVille, nomVille: e.nomVille },
          }));
        })
        .catch(() => {
          if (monte) setInfos((i) => ({ ...i, [slot]: "erreur" }));
        });
    }
    return () => {
      monte = false;
    };
  }, []);

  const rafraichir = (slot: Slot) => {
    setInfos((i) => ({ ...i, [slot]: "en cours" }));
    lireSlot(slot)
      .then((e) =>
        setInfos((i) => ({
          ...i,
          [slot]:
            e === null
              ? null
              : { jour: e.jour, figurines: e.pnjs.length, caisse: e.budgetVille, nomVille: e.nomVille },
        })),
      )
      .catch(() => setInfos((i) => ({ ...i, [slot]: "erreur" })));
  };

  const envoyer = async (slot: Slot) => {
    if (lireToken() === "") {
      setMessage("Colle d'abord ton jeton GitHub ci-dessous — c'est lui qui autorise l'envoi.");
      return;
    }
    setOccupe(slot);
    setMessage("");
    try {
      await envoyerSlot(slot, etat);
      setMessage("☁️ " + LIBELLES_SLOTS[slot] + " envoyée — jour " + etat.jour + " sauvegardé dans le dépôt.");
      rafraichir(slot);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "L'envoi a échoué.");
    } finally {
      setOccupe(null);
    }
  };

  const charger = async (slot: Slot) => {
    setOccupe(slot);
    setMessage("");
    try {
      const e = await lireSlot(slot);
      if (e === null) {
        setMessage(LIBELLES_SLOTS[slot] + " : emplacement vide.");
      } else if (
        window.confirm(
          "Charger la " + LIBELLES_SLOTS[slot] + " (jour " + e.jour + ") ? La ville en cours sera remplacée dans ce navigateur — pense à l'envoyer ou l'exporter avant.",
        )
      ) {
        majEtat(e);
        setMessage("☁️ " + LIBELLES_SLOTS[slot] + " chargée — bon retour au jour " + e.jour + " !");
        fermer();
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Le chargement a échoué.");
    } finally {
      setOccupe(null);
    }
  };

  const memoriser = () => {
    sauverToken(jeton);
    setJetonMemorise(jeton.trim() !== "");
    setJeton("");
    setMessage(jeton.trim() === "" ? "Jeton effacé de ce navigateur." : "Jeton mémorisé dans ce navigateur (tu peux l'effacer en collant un champ vide).");
  };

  return (
    <div className="nuage-fond" onClick={fermer}>
      <div className="carte nuage-carte" onClick={(e) => e.stopPropagation()}>
        <h2>☁️ Sauvegardes en ligne</h2>
        <p className="mute">
          Trois emplacements dans le dépôt GitHub du jeu (<code>losth230/LEGO</code>, dossier{" "}
          <code>sauvegardes/</code>) — chaque envoi crée un commit : l'historique GitHub garde toutes tes
          sauvegardes.
        </p>
        <table className="table-slots">
          <thead>
            <tr>
              <th>Emplacement</th>
              <th>Contenu</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {SLOTS.map((slot) => (
              <tr key={slot}>
                <td>{LIBELLES_SLOTS[slot]}</td>
                <td className="mute">
                  {infos[slot] === null || infos[slot] === undefined ? "— vide —" : texteInfo(infos[slot])}
                </td>
                <td>
                  <button
                    className="bouton-mini"
                    disabled={occupe === slot}
                    onClick={() => void envoyer(slot)}
                  >
                    {occupe === slot ? "…" : "⬆ Envoyer"}
                  </button>{" "}
                  <button
                    className="bouton-mini"
                    disabled={occupe === slot || infos[slot] === null}
                    onClick={() => void charger(slot)}
                  >
                    ⬇ Charger
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {message !== "" ? <p className="message-nuage">{message}</p> : null}
        <h3>Jeton GitHub {jetonMemorise ? "(mémorisé ✅)" : ""}</h3>
        <p className="mute">
          L'envoi exige un jeton <em>fine-grained</em> : GitHub → Settings → Developer settings →
          Fine-grained tokens → Generate new token → dépôt <code>losth230/LEGO</code> uniquement,
          permission <b>Contents : Read and write</b>. Il reste dans ce navigateur (jamais envoyé
          ailleurs qu'à GitHub) et se révoque sur GitHub à tout moment.
        </p>
        <div className="formulaire">
          <input
            className="input"
            type="password"
            placeholder="github_pat_… (collez ici)"
            value={jeton}
            onChange={(e) => setJeton(e.target.value)}
          />
          <button className="bouton-mini" onClick={memoriser}>
            {jetonMemorise ? "Remplacer / effacer" : "Mémoriser"}
          </button>
        </div>
        <p className="mute">
          <button className="bouton-mini" onClick={fermer}>
            ✕ Fermer
          </button>
        </p>
      </div>
    </div>
  );
}
