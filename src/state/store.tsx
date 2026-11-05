// Store React : persistance localStorage + export/import JSON (cahier §7).
// Toute ingestion (chargement, import) passe par migrerEtat.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Etat } from "../engine/types.ts";
import { migrerEtat } from "../engine/migrations.ts";
import { passerJour } from "../engine/moteur.ts";

const CLE_STORAGE = "lego-ville-etat-v1";

function charger(): Etat {
  try {
    const brut = localStorage.getItem(CLE_STORAGE);
    if (brut === null) return migrerEtat(null);
    return migrerEtat(JSON.parse(brut));
  } catch {
    return migrerEtat(null);
  }
}

interface ApiStore {
  etat: Etat;
  majEtat: (nouveau: Etat) => void;
  passerUnJour: () => void;
  reinitialiser: () => void;
  exporter: () => void;
  importerFichier: (fichier: File) => Promise<void>;
}

const ContexteStore = createContext<ApiStore | null>(null);

export function FournisseurStore({ children }: { children: ReactNode }) {
  const [etat, setEtat] = useState<Etat>(() => charger());

  useEffect(() => {
    try {
      localStorage.setItem(CLE_STORAGE, JSON.stringify(etat));
    } catch {
      /* quota dépassé : la session continue sans persistance */
    }
  }, [etat]);

  const api = useMemo<ApiStore>(
    () => ({
      etat,
      majEtat: (nouveau: Etat) => setEtat(nouveau),
      passerUnJour: () => setEtat((e) => passerJour(e)),
      reinitialiser: () => setEtat(migrerEtat(null)),
      exporter: () => {
        const blob = new Blob([JSON.stringify(etat, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "ville-lego-jour-" + etat.jour + ".json";
        a.click();
        URL.revokeObjectURL(url);
      },
      importerFichier: async (fichier: File) => {
        const texte = await fichier.text();
        setEtat(migrerEtat(JSON.parse(texte)));
      },
    }),
    [etat],
  );

  return <ContexteStore.Provider value={api}>{children}</ContexteStore.Provider>;
}

export function useStore(): ApiStore {
  const api = useContext(ContexteStore);
  if (api === null) {
    throw new Error("useStore doit être utilisé sous <FournisseurStore>");
  }
  return api;
}
