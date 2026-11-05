// Vérificateur d'équilibre des balises JSX (règle de la maison Chasse & Pêche).
// esbuild n'est pas disponible en bac à sable : ce harnais détecte les balises
// JSX ouvertes et jamais refermées AVANT le push (incident historique : écran
// blanc en production). Conventions : pas de littéraux regex dans les .tsx.
//
// Usage : node tools/check-jsx.mjs <fichiers .tsx...>

import { readFileSync } from "node:fs";

const CODE = 0; // code TS (niveau racine ou intérieur d'expression JSX)
const TEXT = 2; // texte enfants entre balises JSX

class VerifJsx {
  constructor(src, fichier) {
    this.src = src;
    this.fichier = fichier;
    this.i = 0;
    this.mode = CODE;
    this.pileExpr = []; // cadres { } ouverts depuis TEXT : { retour, depth }
    this.pileTags = []; // { nom, modeRetour }
    this.erreurs = [];
    this.ligne = 1;
  }

  erreur(msg) {
    this.erreurs.push(this.fichier + ":" + this.ligne + " : " + msg);
  }

  sauteChaine() {
    // src[i] est l'ouverture ; avance jusqu'à la fermeture (échappements inclus)
    const q = this.src[this.i];
    this.i++;
    while (this.i < this.src.length) {
      const c = this.src[this.i];
      if (c === "\\") {
        this.i += 2;
        continue;
      }
      if (c === q) {
        this.i++;
        return;
      }
      if (q === "`" && c === "$" && this.src[this.i + 1] === "{") {
        // interpolation : compte les accolades pour ne pas s'arrêter sur un `
        this.i += 2;
        let prof = 1;
        while (this.i < this.src.length && prof > 0) {
          if (this.src[this.i] === "{") prof++;
          else if (this.src[this.i] === "}") prof--;
          else if (this.src[this.i] === "`") this.sauteChaine();
          this.i++;
        }
        continue;
      }
      this.i++;
    }
    this.erreur("chaîne non refermée (" + q + ")");
  }

  sauteCommentaireLigne() {
    while (this.i < this.src.length && this.src[this.i] !== "\n") this.i++;
  }

  sauteCommentaireBloc() {
    this.i += 2;
    while (this.i < this.src.length) {
      if (this.src[this.i] === "*" && this.src[this.i + 1] === "/") {
        this.i += 2;
        return;
      }
      if (this.src[this.i] === "\n") this.ligne++;
      this.i++;
    }
    this.erreur("commentaire bloc non refermé");
  }

  // Gère '<' rencontré en CODE ou TEXT : ouvrante, fermante, auto-fermante,
  // fragment (<> / </>), généricité (<Foo<Bar>> ou useMemo<X>).
  litBalise() {
    const prev = this.i > 0 ? this.src[this.i - 1] : "";
    if (this.mode === CODE && /[A-Za-z0-9_]/.test(prev)) {
      // < précédé d'un identifiant EN CODE : généricité TypeScript (useMemo<X>)
      this.i++;
      return;
    }
    this.i++; // saute '<'
    if (this.src[this.i] === ">") {
      // fragment ouvert <>
      this.i++;
      this.pileTags.push({ nom: "fragment", modeRetour: this.mode });
      this.mode = TEXT;
      return;
    }
    if (this.src[this.i] === "/") {
      this.i++;
      if (this.src[this.i] === ">") {
        // fragment fermé </>
        this.i++;
        const attendu = this.pileTags.pop();
        if (attendu === undefined) {
          this.erreur("fragment fermant </> sans ouverture");
        } else {
          this.mode = attendu.modeRetour;
        }
        return;
      }
      let nom = "";
      while (this.i < this.src.length && /[A-Za-z0-9_.]/.test(this.src[this.i])) {
        nom += this.src[this.i];
        this.i++;
      }
      while (this.i < this.src.length && this.src[this.i] !== ">") this.i++;
      if (this.src[this.i] !== ">") {
        this.erreur("</" + nom + " sans '>'");
        return;
      }
      this.i++;
      const attendu = this.pileTags.pop();
      if (attendu === undefined) {
        this.erreur("balise fermante </" + nom + "> sans ouverture");
      } else if (attendu.nom !== nom) {
        this.erreur("</" + nom + "> ferme <" + attendu.nom + ">");
      } else {
        this.mode = attendu.modeRetour;
      }
      return;
    }
    let nom = "";
    while (this.i < this.src.length && /[A-Za-z0-9_.]/.test(this.src[this.i])) {
      nom += this.src[this.i];
      this.i++;
    }
    if (nom === "") {
      return; // '<' isolé : comparaison ou généricité
    }
    if (this.src[this.i] === "<") {
      return; // <Foo<Bar>> : généricité TypeScript
    }
    if (nom === "T" || nom === "S") {
      // pas un vrai risque : balises d'une lettre rares ; traitées normalement
    }
    // scan des attributs jusqu'à '>' avec chaînes et {} équilibrés
    let selfFerme = false;
    while (this.i < this.src.length) {
      const c = this.src[this.i];
      if (c === '"' || c === "'" || c === "`") {
        this.sauteChaine();
        continue;
      }
      if (c === "/" && this.src[this.i + 1] === "/") {
        this.sauteCommentaireLigne();
        continue;
      }
      if (c === "{") {
        let prof = 1;
        this.i++;
        while (this.i < this.src.length && prof > 0) {
          const d = this.src[this.i];
          if (d === '"' || d === "'" || d === "`") {
            this.sauteChaine();
            continue;
          }
          if (d === "/" && this.src[this.i + 1] === "/") {
            this.sauteCommentaireLigne();
            continue;
          }
          if (d === "<") {
            this.litBalise(); // JSX imbriqué dans un attribut JSX (rare)
            continue;
          }
          if (d === "{") prof++;
          if (d === "}") prof--;
          this.i++;
        }
        continue;
      }
      if (c === ">" && this.src[this.i - 1] === "/") {
        selfFerme = true;
        this.i++;
        break;
      }
      if (c === ">") {
        this.i++;
        break;
      }
      this.i++;
    }
    if (!selfFerme) {
      this.pileTags.push({ nom, modeRetour: this.mode });
      this.mode = TEXT;
    }
  }

  verifie() {
    const src = this.src;
    while (this.i < src.length) {
      const c = src[this.i];
      if (c === "\n") {
        this.ligne++;
        this.i++;
        continue;
      }
      if (this.mode === CODE) {
        if (c === '"' || c === "'" || c === "`") {
          this.sauteChaine();
        } else if (c === "/" && src[this.i + 1] === "/") {
          this.sauteCommentaireLigne();
        } else if (c === "/" && src[this.i + 1] === "*") {
          this.sauteCommentaireBloc();
        } else if (c === "<") {
          this.litBalise();
        } else if (c === "{") {
          if (this.pileExpr.length > 0) this.pileExpr[this.pileExpr.length - 1].depth++;
          this.i++;
        } else if (c === "}") {
          if (this.pileExpr.length > 0) {
            const cadre = this.pileExpr[this.pileExpr.length - 1];
            cadre.depth--;
            if (cadre.depth === 0) {
              this.pileExpr.pop();
              this.mode = cadre.retour;
            }
          }
          this.i++;
        } else {
          this.i++;
        }
      } else {
        // mode TEXT : enfants d'une balise JSX (possiblement dans une expression)
        if (c === "<") {
          this.litBalise();
        } else if (c === "{") {
          this.pileExpr.push({ retour: TEXT, depth: 1 });
          this.mode = CODE;
          this.i++;
        } else {
          this.i++; // texte, apostrophes françaises incluses
        }
      }
    }
    if (this.pileTags.length > 0) {
      this.erreur("balises jamais refermées : " + this.pileTags.map((t) => t.nom).join(", "));
    }
    return this.erreurs;
  }
}

const fichiers = process.argv.slice(2);
let ko = 0;
for (const f of fichiers) {
  const v = new VerifJsx(readFileSync(f, "utf8"), f);
  const erreurs = v.verifie();
  if (erreurs.length === 0) {
    console.log("OK    " + f);
  } else {
    ko++;
    for (const e of erreurs) console.log("ÉCHEC " + e);
  }
}
process.exit(ko === 0 ? 0 : 1);
