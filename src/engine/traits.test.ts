// Tests traits actifs & détention (phase 3.10) : consommation modulée
// (±20 %), ciblage pondéré, prime de garde, rédemption, budgets
// aléatoires (v1.16), éditeur des gangs. Exécution : npm test.

import test from "node:test";

import assert from "node:assert/strict";

import {
  ajouterGang,
  budgetAleatoire,
  nouveauGang,
  nouveauPnj,
  supprimerPnj,
  supprimerGang
} from "./monde.ts";
import { createMondeDemonstration } from "./monde.demo.ts";

import {
  migrerEtat
} from "./migrations.ts";

import {
  budgetAchat,
  impotSur,
  monnaieEnCircuit,
  passerJour,
  racheter
} from "./moteur.ts";

import {
  generateurPour,
  poidsAccident,
  poidsVictime
} from "./evenements.ts";

import {
  CHANCE_REDEMPTION_ACTIF,
  CHANCE_REDEMPTION_SANS,
  FRAIS_DETENTION_L
} from "./referentiel.ts";

import {
  entrees,
  calme
} from "./outils-test.ts";

// ---------- Phase 3.10 : traits actifs & détention au commissariat ----------

test("traits actifs : la personnalité module le budget d'achat (±20 % max)", () => {
  const base = nouveauPnj({
    prenom: "Marchande", nom: "Témoin", metier: "habitant",
    personnalite: ["honnête", "discret"], revenuIndicatif: 10000, budgetAchat: 10000, compte: 0,
  });
  assert.equal(budgetAchat(base), 10000, "sans trait moteur, la base");
  assert.equal(budgetAchat({ ...base, personnalite: ["sociable", "discret"] }), 12000, "le sociable fait vivre les commerces (+20 %)");
  assert.equal(budgetAchat({ ...base, personnalite: ["cupide", "discret"] }), 11000, "le cupide dépense (+10 %)");
  assert.equal(budgetAchat({ ...base, personnalite: ["travailleur", "discret"] }), 9000, "le travailleur économise (-10 %)");
  assert.equal(budgetAchat({ ...base, personnalite: ["prudent", "discret"] }), 8000, "le prudent garde son argent (-20 %)");
  assert.equal(budgetAchat({ ...base, personnalite: ["sociable", "cupide"] }), 12000, "clamp : sociable + cupide plafonne à +20 %");
  assert.equal(budgetAchat({ ...base, personnalite: ["prudent", "travailleur"] }), 8000, "clamp : prudent + travailleur plafonne à -20 %");
});

test("traits actifs : le ciblage pèse la personnalité (victimes ×1,5/×0,5, téméraire ×2)", () => {
  const temoin = nouveauPnj({
    prenom: "Habitable", nom: "Témoin", metier: "habitant",
    personnalite: ["honnête", "travailleur"], compte: 1000,
  });
  assert.equal(poidsVictime(temoin), 1000, "sans trait, le compte seul pèse");
  assert.equal(poidsVictime({ ...temoin, personnalite: ["cupide", "honnête"] }), 1500, "le cupide étale son argent (×1,5)");
  assert.equal(poidsVictime({ ...temoin, personnalite: ["sociable", "honnête"] }), 1500, "le sociable aussi (×1,5)");
  assert.equal(poidsVictime({ ...temoin, personnalite: ["prudent", "discret"] }), 500, "le discret cache le sien (×0,5)");
  assert.equal(poidsVictime({ ...temoin, compte: 0 }), 0, "sans le sou, pas de butin visé");
  assert.equal(poidsAccident(temoin), 1, "poids d'accident normal");
  assert.equal(poidsAccident({ ...temoin, personnalite: ["téméraire", "honnête"] }), 2, "le téméraire se fait plus souvent mal (×2)");
});

test("commissariat : la ville paie 5 L par détenu et par jour en prime de garde aux policiers", () => {
  const temoin = calme(createMondeDemonstration());
  const avec = structuredClone(temoin);
  const detenu = avec.pnjs.find((p) => p.statut === "prive" && !p.gangId)!;
  detenu.arreteJusqua = 5; // détenu les jours 1 à 4, libéré le jour 5
  detenu.casier = 1;
  const j1 = passerJour(avec);
  const t1 = passerJour(temoin);
  const fonct1 = entrees(1, "fonctionnement", j1.journal)[0];
  const fonctT = entrees(1, "fonctionnement", t1.journal)[0];
  assert.ok(fonct1.texte.includes("primes de garde"), "la prime de garde est racontée");
  assert.equal(fonct1.montant! - fonctT.montant!, FRAIS_DETENTION_L * 100, "5 L par détenu, payés en plus du fonctionnement");
  // Coût net : la prime part aux policiers, mais l'impôt à la source sur
  // chaque part revient aux caisses (monde fermé, rien ne se perd).
  const net = FRAIS_DETENTION_L * 100 - impotSur(FRAIS_DETENTION_L * 100, avec.params.tauxImpotBp);
  assert.equal(j1.budgetVille - t1.budgetVille, -net, "coût net de la prime pour la ville : " + net);
  const karim1 = j1.pnjs.find((x) => x.metier.includes("policier"))!;
  const karimT = t1.pnjs.find((x) => x.metier.includes("policier"))!;
  assert.equal(karim1.compte - karimT.compte, net, "le policier encaisse la prime de garde, nette d'impôt");
  assert.equal(monnaieEnCircuit(j1), monnaieEnCircuit(avec), "conservation exacte : la prime reste en ville");
  assert.equal(j1.sortiesCumulees, 0, "monde fermé : la prime ne fuit pas vers l'extérieur");
  // Sans police en poste, personne ne garde les cellules : rien n'est payé.
  const vide = structuredClone(avec);
  const karim = vide.pnjs.find((x) => x.metier.includes("policier"))!;
  const sans = passerJour(supprimerPnj(vide, karim.id));
  const fonctSans = entrees(1, "fonctionnement", sans.journal)[0];
  assert.ok(!fonctSans.texte.includes("primes de garde"), "sans police en poste, pas de prime de garde");
});

test("commissariat : sans poste de police en ville, la détention est une assignation à résidence — aucune prime", () => {
  // Cohérence de la correction 2026-11-06 : la prime paie la garde des
  // cellules du poste. Sans bâtiment poste en ville, l'arrestation se
  // raconte « assignation à résidence » — la ville ne paie rien, même si
  // des policiers sont encore en poste.
  const temoin = calme(createMondeDemonstration());
  const avec = structuredClone(temoin);
  const detenu = avec.pnjs.find((p) => p.statut === "prive" && !p.gangId)!;
  detenu.arreteJusqua = 5; // détenu les jours 1 à 4, libéré le jour 5
  detenu.casier = 1;
  avec.batiments = avec.batiments.filter((b) => !/police|commissariat/i.test(b.nom));
  const j1 = passerJour(avec);
  // Témoin identique (sans poste, donc sans ses 15 L de fonctionnement
  // municipal) mais sans détenu : la seule différence doit être nulle.
  const temoinSansPoste = structuredClone(temoin);
  temoinSansPoste.batiments = temoinSansPoste.batiments.filter(
    (b) => !/police|commissariat/i.test(b.nom),
  );
  const t1 = passerJour(temoinSansPoste);
  const fonct1 = entrees(1, "fonctionnement", j1.journal)[0];
  const fonctT = entrees(1, "fonctionnement", t1.journal)[0];
  assert.ok(
    !fonct1.texte.includes("primes de garde"),
    "sans poste de police en ville, pas de prime de garde (assignation à résidence)",
  );
  assert.equal(fonct1.montant! - fonctT.montant!, 0, "aucun frais de détention sans poste");
  assert.equal(monnaieEnCircuit(j1), monnaieEnCircuit(avec), "conservation exacte");
});

test("racheter : le premier trait criminel s'efface (cupide, puis opportuniste, puis téméraire)", () => {
  const p = nouveauPnj({ prenom: "Ancien", nom: "Détenu", metier: "habitant", personnalite: ["téméraire", "discret"] });
  assert.equal(racheter(p), "téméraire", "le trait téméraire s'efface");
  assert.deepEqual(p.personnalite, ["honnête", "discret"], "remplacé par honnête, l'autre trait reste");
  assert.equal(racheter(p), null, "un honnête homme ne peut plus se racheter");
});

test("budget aléatoire : loi log-uniforme entre ×0,5 et ×10 le revenu indicatif", () => {
  // Fonction pure (arbitrage Thibaut 2026-11-06) : u ∈ [0, 1] parcourt la
  // loi uniformément en log — beaucoup de budgets modestes, quelques très
  // gros, médiane géométrique √(0,5 × 10) ≈ ×2,24 le revenu.
  assert.equal(budgetAleatoire(5000, 0), 2500, "u = 0 : ×0,5 le revenu");
  assert.equal(budgetAleatoire(5000, 1), 50000, "u = 1 : ×10 le revenu");
  assert.ok(budgetAleatoire(5250, 0.5) > 5250, "u = 0,5 : médiane ≈ ×2,24, au-dessus du revenu");
  let precedent = -1;
  for (let i = 0; i <= 100; i++) {
    const u = i / 100;
    const b = budgetAleatoire(5250, u);
    assert.ok(b >= Math.max(1, Math.round(5250 * 0.5)), "borne basse respectée");
    assert.ok(b <= Math.round(5250 * 10), "borne haute respectée");
    assert.ok(b >= precedent, "le budget croît (faiblement) avec u");
    precedent = b;
  }
});

test("budget aléatoire : le monde par défaut tire le budget de chaque figurine, une fois pour toutes", () => {
  // Arbitrage Thibaut : tous les PNJ, total non recalé, aléatoire à chaque
  // partie (Math.random). La simulation journalière, elle, reste déterministe.
  const e = createMondeDemonstration();
  assert.equal(e.pnjs.length, 60, "60 figurines");
  const tires = e.pnjs.filter((p) => p.budgetAchat !== p.revenuIndicatif);
  assert.ok(tires.length > 0, "au moins un budget tiré hors du revenu indicatif");
  for (const p of e.pnjs) {
    assert.ok(
      p.budgetAchat >= Math.max(1, Math.round(p.revenuIndicatif * 0.5)),
      "borne basse du tirage",
    );
    assert.ok(p.budgetAchat <= Math.round(p.revenuIndicatif * 10), "borne haute du tirage");
  }
  // Pas de nouveau tirage au chargement : la sauvegarde conserve ses budgets.
  const rel = migrerEtat(JSON.parse(JSON.stringify(e)));
  for (const p of e.pnjs) {
    const q = rel.pnjs.find((x) => x.id === p.id)!;
    assert.equal(q.budgetAchat, p.budgetAchat, "le budget tiré au départ survit au rechargement");
  }
});

test("rédemption : à sa sortie, le détenu peut se racheter — l'effectif du commissariat décide", () => {
  // Le tirage de libération du jour choisi tombe entre 10 % et 50 % : avec
  // un effectif suffisant le détenu se rachète, débordé il ressort amer.
  let jour = 1;
  let tirage = generateurPour(jour * 11 + 7)();
  while (!(tirage > CHANCE_REDEMPTION_SANS && tirage < CHANCE_REDEMPTION_ACTIF)) {
    jour += 1;
    tirage = generateurPour(jour * 11 + 7)();
  }
  // Un policier en poste (Karim), un détenu libéré ce jour-là : effectif
  // suffisant (1 >= 1), 50 % de chances — ce tirage-là rachète.
  const base = calme(createMondeDemonstration());
  const detenu = base.pnjs.find((p) => p.statut === "prive" && !p.gangId)!;
  detenu.personnalite = ["cupide", "discret"];
  detenu.casier = 1;
  detenu.arreteJusqua = jour;
  base.jour = jour - 1;
  const avec = passerJour(structuredClone(base));
  const pAvec = avec.pnjs.find((p) => p.id === detenu.id)!;
  assert.ok(
    avec.journal.some((e) => e.texte.includes("sort de détention et se rachète")),
    "la rédemption est racontée (jour " + jour + ", tirage " + tirage.toFixed(3) + ")",
  );
  assert.ok(pAvec.personnalite!.includes("honnête") && !pAvec.personnalite!.includes("cupide"), "cupide s'est effacé au profit d'honnête");
  assert.equal(pAvec.casier, 1, "le casier reste : la récidive reste possible");
  assert.ok(avec.journal.some((e) => e.texte.includes("effectif suffisant")), "l'effectif suffisant est raconté");
  // Commissariat débordé : un deuxième détenu, un seul policier (1 < 2) —
  // 10 % seulement, et ce tirage-là ne rachète pas.
  const deborde = structuredClone(base);
  const second = deborde.pnjs.find((p) => p.statut === "prive" && !p.gangId && p.id !== detenu.id)!;
  second.arreteJusqua = jour + 5;
  const sans = passerJour(deborde);
  const pSans = sans.pnjs.find((p) => p.id === detenu.id)!;
  assert.ok(!sans.journal.some((e) => e.texte.includes("se rachète")), "débordé, pas de rédemption ce jour-là");
  assert.ok(pSans.personnalite!.includes("cupide"), "le trait criminel est resté");
});

test("éditeur des gangs : installer, recruter, démanteler — le journal raconte tout", () => {
  const m = createMondeDemonstration();
  const gang = nouveauGang({ nom: "Les Rats du Port", quartiers: ["Port"] });
  const m2 = ajouterGang(m, gang);
  assert.equal(m2.gangs!.length, (m.gangs?.length ?? 0) + 1, "le gang est en ville");
  assert.ok(m2.journal.some((e) => e.texte.includes("Les Rats du Port s'installe")), "l'installation est racontée");
  // Recrutement (comme dans la fiche de la figurine) puis démantèlement.
  const m3 = structuredClone(m2);
  const i = m3.pnjs.findIndex((p) => p.statut === "prive" && !p.gangId);
  m3.pnjs[i] = { ...m3.pnjs[i], gangId: gang.id };
  const m4 = supprimerGang(m3, gang.id);
  assert.ok(!m4.gangs!.some((g) => g.id === gang.id), "le gang a disparu");
  assert.equal(m4.pnjs.find((p) => p.id === m3.pnjs[i].id)!.gangId, null, "le membre redevient indépendant");
  assert.ok(m4.journal.some((e) => e.texte.includes("Les Rats du Port est démantelé")), "le démantèlement est raconté");
  assert.equal(monnaieEnCircuit(m4), monnaieEnCircuit(m), "aucune monnaie n'a bougé");
});
