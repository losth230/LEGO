// Ville de démonstration Bricke-en-Provence — FICHIER DE TESTS UNIQUEMENT.
// Retirée de l'application en v1.23 (arbitrage Thibaut : le monde par
// défaut est une ville nue, tout se construit dans l'éditeur) : cette
// ville riche reste le banc d'essai des tests moteur (économie, incidents,
// milieu criminel, migrations). Rien ici n'est appelé par l'app.

import type { Batiment, Etat, Pnj, Vehicule } from "./types.ts";
import { COEFF_INTENSITE_DEFAUT, TAUX_IMPOT_DEFAUT_BP } from "./referentiel.ts";
import { budgetAleatoire, nouveauBatiment, nouveauPnj, nouveauVehicule, reinitialiserIds } from "./monde.ts";

const PRENOMS_F = "Adèle:Camille:Delphine:Émilie:Fantine:Gabrielle:Hélène:Inès:Juliette:Louise:Manon:Nora:Océane:Paloma:Rosa:Sylvie:Tiphaine:Véra:Yasmine:Zoé:Brigitte:Élodie:Léa:Karima:Fatou".split(":");
const PRENOMS_M = "Antoine:Bastien:Célestin:Damien:Étienne:Félix:Gaël:Hugo:Ibrahim:Jules:Kévin:Léo:Marco:Nicolas:Oscar:Pierre:Quentin:Raphaël:Sacha:Tanguy:Ulysse:Victor:Xavier:Yann:Zaïd:Jean:Karim:Mario".split(":");
const NOMS = "Arnaud:Berthier:Castella:Dupont:Escoffier:Faure:Guibert:Hoarau:Imbert:Jouvet:Kaczmarek:Lambert:Marchand:Nguyen:Orsini:Perrin:Quintal:Roussel:Sabatini:Thibault:Ursini:Vasseur:Winkler:Yven:Zeller:Rossi:Benali:Garnier".split(":");


/** La ville de démonstration : 16 bâtiments, 60 figurines, 7 véhicules (monde
 * fermé 2026-11-06, brigade municipale v1.21, bureau de poste v1.22, flotte
 * et station-service v1.25 — arbitrage Thibaut : c'est la station qui gère
 * la pompe et les accidents, pas le BTP).
 * Supprimée de l'application en v1.23 (arbitrage Thibaut : le monde par défaut
 * est nu) — elle reste la terre d'essai des tests moteur. */
export function createMondeDemonstration(): Etat {
  reinitialiserIds();

  const batiments: Batiment[] = [
    nouveauBatiment({ nom: "Mairie de Bricke-en-Provence", type: "service_public", quartier: "Centre", valeur: 1200000, etat: "neuf", coutFonctionnement: 2000, capacitePostes: 6 }),
    nouveauBatiment({ nom: "Poste de police", type: "service_public", quartier: "Centre", valeur: 800000, coutFonctionnement: 1500, capacitePostes: 4 }),
    nouveauBatiment({ nom: "Caserne de pompiers", type: "service_public", quartier: "Nord", valeur: 900000, coutFonctionnement: 1500, capacitePostes: 6 }),
    nouveauBatiment({ nom: "Le Fournil Doré (boulangerie)", type: "commerce", quartier: "Centre", valeur: 400000, capacitePostes: 2 }),
    nouveauBatiment({ nom: "Chez Mario (friterie)", type: "commerce", quartier: "Port", valeur: 250000, capacitePostes: 2 }),
    nouveauBatiment({ nom: "Quincaillerie du Port", type: "commerce", quartier: "Port", valeur: 300000, capacitePostes: 2 }),
    // Services locaux à vocation (monde 100 % fermé, arbitrage 2026-11-06) :
    // sans eux, aucune mécanique liée (soins, réparations, emprunts).
    nouveauBatiment({ nom: "Hôpital Sainte-Brique", type: "commerce", quartier: "Nord", valeur: 1000000, etat: "neuf", capacitePostes: 4, vocation: "sante" }),
    nouveauBatiment({ nom: "Bâtisseurs du Sud (BTP)", type: "commerce", quartier: "Sud", valeur: 350000, capacitePostes: 4, vocation: "btp" }),
    nouveauBatiment({ nom: "Banque de Bricke-en-Provence", type: "commerce", quartier: "Centre", valeur: 800000, capacitePostes: 2, vocation: "banque" }),
    // Bureau de poste (v1.22, arbitrage Thibaut : entreprise privée) : La
    // Poste n'est pas municipale — le receveur tient la boutique, la ville
    // ne paie rien, le facteur est salarié payé par le flux du soir.
    nouveauBatiment({ nom: "Bureau de poste de Bricke-en-Provence", type: "commerce", quartier: "Centre", valeur: 300000, capacitePostes: 2 }),
    // Phase 3.10 (correction Thibaut 2026-11-06) : les détenus sont gardés
    // au Poste de police, pas dans un bâtiment dédié — pas de maison d'arrêt.
    nouveauBatiment({ nom: "Les Terrasses (immeuble)", type: "habitation", quartier: "Centre", valeur: 1500000, capaciteLogements: 16 }),
    nouveauBatiment({ nom: "Maison des Dupont", type: "habitation", quartier: "Nord", valeur: 350000, capaciteLogements: 4 }),
    nouveauBatiment({ nom: "Résidence du Stade", type: "habitation", quartier: "Sud", valeur: 900000, capaciteLogements: 20 }),
    nouveauBatiment({ nom: "Maison de la Colline", type: "habitation", quartier: "Nord", valeur: 300000, capaciteLogements: 6 }),
    nouveauBatiment({ nom: "Caserne militaire du Sud", type: "service_public", quartier: "Sud", valeur: 1100000, etat: "neuf", coutFonctionnement: 3000, capacitePostes: 8 }),
    // Station-service (v1.25, arbitrage Thibaut 2026-11-08) : la pompe
    // officielle et l'atelier des collisions — c'est elle qui gère les
    // accidents des véhicules, pas le BTP (qui ne répare que les bâtiments).
    nouveauBatiment({ nom: "Station-service du Port", type: "commerce", quartier: "Port", valeur: 250000, capacitePostes: 2, vocation: "garage" }),
  ];

  const idMairie = batiments[0].id;
  const idPolice = batiments[1].id;
  const idCaserne = batiments[2].id;
  const idBoulangerie = batiments[3].id;
  const idFriterie = batiments[4].id;
  const idQuincaillerie = batiments[5].id;
  const idHopital = batiments[6].id;
  const idBtp = batiments[7].id;
  const idBanque = batiments[8].id;
  const idPosteBureau = batiments[9].id;
  const immeubles = [batiments[10].id, batiments[11].id, batiments[12].id, batiments[13].id];
  const idStade = immeubles[2]; // Résidence du Stade (Sud) — fief des Corbeaux
  const idCaserneMilitaire = batiments[14].id;
  const idStation = batiments[15].id;

  const pnjs: Pnj[] = [];

  // Agents publics (3) — salaires réels grilles FPT 2025 (voir référentiel).
  pnjs.push(nouveauPnj({ prenom: "Brigitte", nom: "Roussel", age: 52, genre: "F", metier: "secrétaire de mairie", statut: "agent_public", grade: "adjoint_technique", batimentId: idMairie, revenuIndicatif: 4500 }));
  // Brigade municipale (v1.21) : les agents techniques de la ville existent
  // enfin — balayeurs, éboueurs, chef d'équipe de la voirie. La propreté
  // n'a pas besoin de grades multiples (arbitrage Thibaut v1.22) : un seul
  // grade Mairie, adjoint technique (48,30 L/j, grille FPT 2025).
  // Comptent pour la garde de rien : ils balayent, la ville leur doit ses soldes.
  pnjs.push(nouveauPnj({ prenom: "Gérard", nom: "Lavigne", age: 58, genre: "M", metier: "balayeur municipal", statut: "agent_public", grade: "adjoint_technique", batimentId: idMairie, revenuIndicatif: 4830 }));
  pnjs.push(nouveauPnj({ prenom: "Solène", nom: "Pichon", age: 36, genre: "F", metier: "éboueuse", statut: "agent_public", grade: "adjoint_technique", batimentId: idMairie, revenuIndicatif: 4830 }));
  pnjs.push(nouveauPnj({ prenom: "Robert", nom: "Vidal", age: 47, genre: "M", metier: "chef d'équipe de la voirie", statut: "agent_public", grade: "adjoint_technique", batimentId: idMairie, revenuIndicatif: 4830 }));
  pnjs.push(nouveauPnj({ prenom: "Karim", nom: "Benali", age: 34, genre: "M", metier: "policier municipal", statut: "agent_public", grade: "policier_municipal", batimentId: idPolice, revenuIndicatif: 5300 }));
  pnjs.push(nouveauPnj({ prenom: "Élodie", nom: "Garnier", age: 29, genre: "F", metier: "sapeur-pompier", statut: "agent_public", grade: "sapeur_pompier_debutant", batimentId: idCaserne, revenuIndicatif: 5800 }));
  // Garnison (3) — branche militaire, soldes réelles 2025 (grilles NPRM, voir référentiel).
  pnjs.push(nouveauPnj({ prenom: "Rémi", nom: "Fontaine", age: 22, genre: "M", metier: "soldat", statut: "agent_public", grade: "soldat_armee", batimentId: idCaserneMilitaire, revenuIndicatif: 1300 }));
  pnjs.push(nouveauPnj({ prenom: "Aline", nom: "Mercier", age: 31, genre: "F", metier: "caporal", statut: "agent_public", grade: "caporal_armee", batimentId: idCaserneMilitaire, revenuIndicatif: 1500 }));
  pnjs.push(nouveauPnj({ prenom: "Hugo", nom: "Delattre", age: 45, genre: "M", metier: "capitaine", statut: "agent_public", grade: "capitaine_armee", batimentId: idCaserneMilitaire, revenuIndicatif: 2600 }));

  // Commerçants (3).
  pnjs.push(nouveauPnj({ prenom: "Jean", nom: "Castella", age: 47, genre: "M", metier: "boulanger", statut: "commercant", batimentId: idBoulangerie, revenuIndicatif: 6000, compte: 600000 }));
  pnjs.push(nouveauPnj({ prenom: "Mario", nom: "Rossi", age: 41, genre: "M", metier: "vendeur de frites", statut: "commercant", batimentId: idFriterie, revenuIndicatif: 5000, compte: 500000 }));
  pnjs.push(nouveauPnj({ prenom: "Léa", nom: "Kaczmarek", age: 38, genre: "F", metier: "quincaillière", statut: "commercant", batimentId: idQuincaillerie, revenuIndicatif: 5500, compte: 550000 }));

  // Services locaux à vocation (monde 100 % fermé, 2026-11-06) : santé,
  // BTP, banque. Sans gérant, le service est fermé et sa mécanique dort.
  pnjs.push(nouveauPnj({ prenom: "Sofia", nom: "Marchand", age: 44, genre: "F", metier: "cheffe de l'hôpital", statut: "commercant", batimentId: idHopital, revenuIndicatif: 7500, compte: 750000 }));
  pnjs.push(nouveauPnj({ prenom: "Dario", nom: "Costa", age: 39, genre: "M", metier: "chef d'entreprise BTP", statut: "commercant", batimentId: idBtp, revenuIndicatif: 5500, compte: 550000 }));
  pnjs.push(nouveauPnj({ prenom: "Émile", nom: "Verne", age: 51, genre: "M", metier: "banquier", statut: "commercant", batimentId: idBanque, revenuIndicatif: 8000, compte: 800000 }));
  // Station-service (v1.25) : le pompiste-garagiste tient la pompe officielle
  // et l'atelier — l'essence de la flotte et les réparations des collisions
  // passent par lui (arbitrage Thibaut : pas le BTP).
  pnjs.push(nouveauPnj({ prenom: "Marco", nom: "Tempo", age: 43, genre: "M", metier: "gérant de station-service", statut: "commercant", batimentId: idStation, revenuIndicatif: 4900, compte: 490000 }));

  // Bureau de poste (v1.22, arbitrage Thibaut : entreprise privée — La
  // Poste n'est pas municipale) : un patron et son facteur, salariés du
  // privé payés par le flux du soir (convention d'entreprise La Poste,
  // IDCC 5516). Receveur : grille La Poste 2025, classe III niveau 2,
  // 2 250 EUR brut ≈ 1 780 net → 59,30 L/j. Facteur : débutant au SMIC,
  // 1 867 EUR brut ≈ 1 480 net → 49,30 L/j (reconversionprofessionnelle.org).
  pnjs.push(nouveauPnj({ prenom: "Philippe", nom: "Aubert", age: 45, genre: "M", metier: "receveur de la poste", statut: "commercant", batimentId: idPosteBureau, revenuIndicatif: 5930, compte: 593000 }));
  pnjs.push(nouveauPnj({ prenom: "Nora", nom: "Nguyen", age: 49, genre: "F", metier: "facteur", statut: "prive", batimentId: immeubles[0], travailBatimentId: idPosteBureau, revenuIndicatif: 4930 }));

  // 38 habitants privés : métiers narratifs, revenus variés autour du médian.
  const metiers: Array<[string, number]> = [
    ["professeure des écoles", 5800], ["pêcheur", 3800], ["ingénieure", 7200], ["médecin", 9000],
    ["retraité", 3000], ["libraire", 4200], ["chauffeur de bus", 4600], ["cuisinière", 4800],
    ["jardinier", 4000], ["photographe", 4400], ["banquière", 8500], ["étudiant", 2000],
    ["coiffeuse", 4300], ["électricien", 5000], ["artiste peintre", 3300],
    ["infirmière", 5400], ["architecte", 7500], ["fromager", 5200], ["serveur", 3600],
    ["garagiste", 4900], ["vétérinaire", 8200], ["conseillère municipale", 5100], ["prof de sport", 4500],
    ["horlogère", 4700], ["boucher", 5300], ["apicultrice", 3900], ["pilote de ferry", 6800],
    ["restauratrice", 6200], ["sapeuse-pompière volontaire", 4000], ["bouquiniste", 3500], ["agents immobilier", 5600],
    ["musicien", 3100], ["guide touristique", 3900], ["horticultrice", 4100], ["grutier", 5700],
    ["pâtissière", 4900], ["ébéniste", 4600], ["contrôleuse SNCF", 5800],
  ];
  // Noms complets uniques (correctif 2026-11-06) : le journal identifie les
  // figurines par leur nom — deux homonymes faussaient le rattachement (un
  // cambriolage pouvait être porté au casier du mauvais figurant). En cas de
  // collision, on avance dans la liste des noms jusqu'à un nom libre.
  const nomsPris = new Set<string>(pnjs.map((p) => p.prenom + " " + p.nom));
  for (let i = 0; i < metiers.length; i++) {
    const [metier, revenu] = metiers[i];
    const genre: "F" | "M" = i % 2 === 0 ? "F" : "M";
    const prenom = genre === "F" ? PRENOMS_F[i % PRENOMS_F.length] : PRENOMS_M[i % PRENOMS_M.length];
    let idxNom = i % NOMS.length;
    while (nomsPris.has(prenom + " " + NOMS[idxNom % NOMS.length])) idxNom += 1;
    const nom = NOMS[idxNom % NOMS.length];
    nomsPris.add(prenom + " " + nom);
    pnjs.push(
      nouveauPnj({
        prenom,
        nom,
        age: 20 + ((i * 7) % 55),
        genre,
        metier,
        revenuIndicatif: revenu,
        batimentId: immeubles[i % immeubles.length],
      }),
    );
  }

  // Milieu criminel (phase 3.9, arbitrage Thibaut 2026-11-06) :
  // un gang dédié, les Corbeaux du Sud, ancrés à la Résidence du Stade —
  // ils ne volent que sur leur territoire, qui peut s'étendre par la guerre.
  for (const g of [
    { prenom: "Otto", nom: "Sabatini", age: 49, genre: "M", metier: "chef des Corbeaux du Sud", revenu: 1500, compte: 120000, casier: 3, traits: ["cupide", "téméraire"] },
    { prenom: "Nino", nom: "Vasseur", age: 23, genre: "M", metier: "guetteur des Corbeaux", revenu: 1200, compte: 30000, casier: 1, traits: ["opportuniste", "discret"] },
    { prenom: "Rita", nom: "Ursini", age: 27, genre: "F", metier: "receleuse des Corbeaux", revenu: 1800, compte: 45000, casier: 2, traits: ["cupide", "discret"] },
    { prenom: "Sacha", nom: "Zeller", age: 31, genre: "M", metier: "bras droit des Corbeaux", revenu: 2000, compte: 50000, casier: 2, traits: ["opportuniste", "téméraire"] },
  ] as const) {
    pnjs.push(
      nouveauPnj({
        prenom: g.prenom,
        nom: g.nom,
        age: g.age,
        genre: g.genre,
        metier: g.metier,
        statut: "prive",
        batimentId: idStade,
        revenuIndicatif: g.revenu,
        compte: g.compte,
        personnalite: [...g.traits],
        casier: g.casier,
        gangId: "gang-corbeaux",
      }),
    );
  }

  // Indépendants (criminels sans gang) : trois habitants à la marge —
  // petits revenus, traits criminels. Le profil criminel fait le reste.
  const independants: Array<[string, string[]]> = [
    ["étudiant", ["opportuniste", "discret"]],
    ["musicien", ["cupide", "sociable"]],
    ["artiste peintre", ["opportuniste", "téméraire"]],
  ];
  for (const [metierCible, traits] of independants) {
    const p = pnjs.find((x) => x.metier === metierCible);
    if (p) {
      p.personnalite = traits;
      p.compte = 45000; // la faucille : 450 L en tout et pour tout
    }
  }

  // Budgets d'achat aléatoires au départ (arbitrage Thibaut 2026-11-06) :
  // chaque figurine tire une loi log-uniforme entre ×0,5 et ×10 son revenu
  // indicatif — total non recalé, chaque partie démarre différemment.
  // Les figurines ajoutées ensuite dans l'éditeur gardent le défaut
  // (budget = revenu indicatif) et les sauvegardes existantes aussi.
  for (const p of pnjs) {
    p.budgetAchat = budgetAleatoire(p.revenuIndicatif);
  }

  // Véhicules (v1.25, arbitrage Thibaut 2026-11-08) : la flotte municipale
  // (camion de pompiers, fourgon de police, camion de propreté, ambulance)
  // roule tant qu'il y a du carburant acheté sur place ; les privés
  // appartiennent à des figurines — volables par le milieu. La caravane de
  // l'étudiant loge, la camionnette de Mario ajoute un poste ambulant à la
  // friterie (les capacités des véhicules s'ajoutent à leur garage).
  const idJean = pnjs.find((x) => x.prenom === "Jean")!.id;
  const idMario = pnjs.find((x) => x.prenom === "Mario")!.id;
  const idEtudiant = pnjs.find((x) => x.metier === "étudiant")!.id;
  const vehicules: Vehicule[] = [
    nouveauVehicule({ nom: "Camion de pompiers « Lanceur »", categorie: "municipal", role: "pompiers", quartier: "Nord", valeur: 300000, essenceJour: 800, garageBatimentId: idCaserne }),
    nouveauVehicule({ nom: "Fourgon de police", categorie: "municipal", role: "police", quartier: "Centre", valeur: 180000, essenceJour: 600, garageBatimentId: idPolice }),
    nouveauVehicule({ nom: "Camion de propreté de la voirie", categorie: "municipal", role: "proprete", quartier: "Centre", valeur: 120000, essenceJour: 700, garageBatimentId: idMairie }),
    nouveauVehicule({ nom: "Ambulance de l'hôpital", categorie: "municipal", role: "sante", quartier: "Nord", valeur: 200000, essenceJour: 600, garageBatimentId: idHopital }),
    nouveauVehicule({ nom: "Voiture de Jean", categorie: "prive", quartier: "Centre", valeur: 90000, essenceJour: 300, garageBatimentId: idBoulangerie, proprietairePnjId: idJean }),
    nouveauVehicule({ nom: "Camionnette de Mario", categorie: "prive", quartier: "Port", valeur: 60000, essenceJour: 400, capacitePostes: 1, garageBatimentId: idFriterie, proprietairePnjId: idMario }),
    nouveauVehicule({ nom: "Caravane de l'étudiant", categorie: "prive", quartier: "Port", valeur: 40000, essenceJour: 100, capaciteLogements: 2, proprietairePnjId: idEtudiant }),
  ];
  // L'étudiant vit dans sa caravane (capacité logement d'un véhicule, v1.25).
  const etudiant = pnjs.find((x) => x.metier === "étudiant")!;
  etudiant.batimentId = vehicules[6].id;

  return {
    schemaVersion: 10,
    jour: 0,
    nomVille: "Bricke-en-Provence",
    budgetVille: 500000,
    sortiesCumulees: 0,
    pertesCumulees: 0,
    volsCumules: 0,
    dette: 0,
    mouvementsBanqueCumules: 0,
    gangs: [
      {
        id: "gang-corbeaux",
        nom: "Les Corbeaux du Sud",
        quartiers: ["Sud"],
      },
    ],
    affrontementsCumules: 0,
    params: { tauxImpotBp: TAUX_IMPOT_DEFAUT_BP, coeffIntensite: COEFF_INTENSITE_DEFAUT },
    pnjs,
    batiments,
    vehicules,
    journal: [
      {
        jour: 0,
        type: "systeme",
        texte:
          "Jour 0 : " + pnjs.length + " figurines, " + batiments.length + " bâtiments et " +
          vehicules.length + " véhicules attendent que la ville s'anime. Appuie sur « Passer un jour ».",
      },
    ],
  };
}

