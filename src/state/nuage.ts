// Nuage (v1.32) : sauvegardes en ligne dans le dépôt GitHub du jeu
// (losth230/LEGO), via l'API Contents et un jeton d'accès fine-grained que
// le joueur colle une fois dans le jeu (portée : contenus du dépôt LEGO,
// lecture + écriture — rien d'autre, révocable à tout moment).
// 3 emplacements fixes : Ville A / Ville B / Ville C.
// Toute ingestion passe par migrerEtat, comme le localStorage et l'import
// JSON : un fichier tordu ou hostile retombe sur la ville de départ.
// Ce module est de l'infrastructure navigateur (fetch) : seul le cœur pur
// (base64, chemins, décodage) est couvert par les tests.

import type { Etat } from "../engine/types.ts";
import { migrerEtat } from "../engine/migrations.ts";

export const DEPOT = "losth230/LEGO";
export const BRANCHE = "main";

export const SLOTS = ["a", "b", "c"] as const;
export type Slot = (typeof SLOTS)[number];

export const LIBELLES_SLOTS: Record<Slot, string> = {
  a: "Ville A",
  b: "Ville B",
  c: "Ville C",
};

export const CLE_TOKEN = "lego-ville-jeton-github";

/** Chemin du fichier d'un emplacement dans le dépôt. */
export function cheminSlot(slot: Slot): string {
  return "sauvegardes/ville-" + slot + ".json";
}

export function lireToken(): string {
  try {
    return localStorage.getItem(CLE_TOKEN) ?? "";
  } catch {
    return "";
  }
}

export function sauverToken(jeton: string): void {
  try {
    const j = jeton.trim();
    if (j === "") localStorage.removeItem(CLE_TOKEN);
    else localStorage.setItem(CLE_TOKEN, j);
  } catch {
    /* stockage indisponible : le nuage reste en mode jeton à recoller */
  }
}

/** base64 → UTF-8 (l'API Contents renvoie le fichier encodé en base64). */
export function decoderBase64Utf8(base64: string): string {
  const binaire = atob(base64.replace(/\s/g, ""));
  const octets = Uint8Array.from(binaire, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(octets);
}

/** UTF-8 → base64 (l'API Contents attend le contenu du commit en base64). */
export function encoderBase64Utf8(texte: string): string {
  const octets = new TextEncoder().encode(texte);
  let binaire = "";
  for (const o of octets) binaire += String.fromCharCode(o);
  return btoa(binaire);
}

/** Découde un fichier GitHub en état jouable : migré, jamais crashé. */
export function decoderEtat(base64: string): Etat {
  try {
    return migrerEtat(JSON.parse(decoderBase64Utf8(base64)));
  } catch {
    return migrerEtat(null);
  }
}

async function api(chemin: string, init?: RequestInit): Promise<Response> {
  const jeton = lireToken();
  const entetes: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (jeton !== "") entetes.Authorization = "Bearer " + jeton;
  return fetch("https://api.github.com" + chemin, {
    ...init,
    headers: { ...entetes, ...(init?.headers as Record<string, string> | undefined) },
  });
}

/**
 * Lit un emplacement : l'état s'il existe, null si l'emplacement est vide.
 * Sans jeton, la lecture d'un dépôt public marche quand même (API anonyme).
 */
export async function lireSlot(slot: Slot): Promise<Etat | null> {
  const r = await api("/repos/" + DEPOT + "/contents/" + cheminSlot(slot) + "?ref=" + BRANCHE);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("GitHub a répondu " + r.status);
  return decoderEtat((await r.json()).content);
}

/** Envoie l'état sur un emplacement (crée le fichier ou l'écrase). */
export async function envoyerSlot(slot: Slot, etat: Etat): Promise<void> {
  const chemin = cheminSlot(slot);
  // Le PUT exige le sha du fichier existant pour l'écraser.
  const tete = await api("/repos/" + DEPOT + "/contents/" + chemin + "?ref=" + BRANCHE);
  let sha: string | undefined;
  if (tete.ok) sha = (await tete.json()).sha;
  else if (tete.status !== 404) throw new Error("GitHub a répondu " + tete.status);
  const r = await api("/repos/" + DEPOT + "/contents/" + chemin, {
    method: "PUT",
    body: JSON.stringify({
      message: "☁️ " + LIBELLES_SLOTS[slot] + " — jour " + etat.jour + " (" + etat.nomVille + ")",
      content: encoderBase64Utf8(JSON.stringify(etat, null, 2)),
      branch: BRANCHE,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!r.ok) {
    if (r.status === 401) throw new Error("Jeton refusé (401) : vérifie qu'il autorise « Contents : Read and write » sur le dépôt LEGO.");
    if (r.status === 403) throw new Error("Accès refusé (403) : le jeton doit cibler le dépôt losth230/LEGO avec « Contents : Read and write ».");
    throw new Error("GitHub a répondu " + r.status);
  }
}
