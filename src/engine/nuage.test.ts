// Tests du cœur pur du Nuage (v1.32) : base64 UTF-8, chemins d'emplacements
// et décodage d'un fichier GitHub en état jouable (migré, jamais crashé).
// La couche fetch (API Contents) n'est pas couverte — elle est navigateur.

import test from "node:test";
import assert from "node:assert/strict";
import {
  cheminSlot,
  decoderBase64Utf8,
  decoderEtat,
  encoderBase64Utf8,
} from "../state/nuage.ts";
import { createMondeDefaut } from "./monde.ts";
import { SCHEMA_VERSION_ETAT } from "./migrations.ts";

test("nuage (v1.32) : base64 UTF-8 — accents et emojis font le aller-retour", () => {
  const texte = "Bricke-en-Provence, jour 3 — 🧱 voilà l'équipe « BTP » !";
  assert.equal(decoderBase64Utf8(encoderBase64Utf8(texte)), texte, "aller-retour exact");
  assert.equal(decoderBase64Utf8(encoderBase64Utf8("sans accent")), "sans accent");
});

test("nuage (v1.32) : un fichier GitHub découdé devient un état migré, jamais un crash", () => {
  const depart = createMondeDefaut();
  const e = decoderEtat(encoderBase64Utf8(JSON.stringify(depart)));
  assert.equal(e.schemaVersion, SCHEMA_VERSION_ETAT, "l'état du nuage est migré au schéma courant");
  assert.equal(e.jour, depart.jour, "le jour est conservé");
  assert.equal(e.pnjs.length, depart.pnjs.length, "l'équipe BTP traverse le nuage");
  // Payload hostile : du JSON cassé retombe sur la ville de départ, pas de crash.
  const casse = decoderEtat(encoderBase64Utf8("{pas du json"));
  assert.equal(casse.schemaVersion, SCHEMA_VERSION_ETAT, "un fichier cassé retombe sur la ville de départ");
  assert.ok(casse.journal.length > 0, "le journal d'invitation raconte le nouveau départ");
});

test("nuage (v1.32) : trois emplacements, trois fichiers distincts", () => {
  assert.equal(cheminSlot("a"), "sauvegardes/ville-a.json");
  assert.equal(cheminSlot("b"), "sauvegardes/ville-b.json");
  assert.equal(cheminSlot("c"), "sauvegardes/ville-c.json");
});

test("nuage (v1.32) : la ville de départ naît au schéma courant (régression v1.31)", () => {
  // Le bug attrapé par le nuage : createMondeDefaut marquait encore 14 alors
  // que le schéma était passé à 15 — une ville neuve repartait en migration
  // au premier chargement (sans perte, mais jamais voulu).
  assert.equal(
    createMondeDefaut().schemaVersion,
    SCHEMA_VERSION_ETAT,
    "createMondeDefaut doit naître au schéma courant",
  );
});
