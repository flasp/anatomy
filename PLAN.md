# Le Corps Humain — plan v1

Outil interactif pour faire découvrir le corps humain à un enfant de 5 ans.

## Décisions validées

| Sujet | Choix |
|---|---|
| Rendu | Vraie 3D, rotation libre 360° |
| Appareils | Tablette (tactile) + ordinateur (souris) |
| Voix | Bouton « lire à voix haute » (synthèse vocale du navigateur, FR/EN) |
| Pudeur | Mannequin neutre : peau lisse sans organes génitaux, vessie incluse, pas d'appareil reproducteur |
| Langues | FR ⇄ EN en un clic, tout le texte bascule |
| Style | Planche d'anatomie vintage (papier crème, gravure, légendes italiques) |
| Lisibilité | Texte sombre partout, jamais de texte clair sur fond crème ; un bouton actif se signale par un fond teinté et une bordure épaisse, pas par du texte blanc |

## Fonctionnalités

1. **Rotation / zoom** : glisser (doigt/souris) pour tourner, pincer/molette pour zoomer, boutons « Face · Dos · Profil ».
2. **6 calques** activables par boutons illustrés : Aspect extérieur, Muscles, Sang, Nerfs, Organes, Os.
   Quand la peau est affichée, elle devient semi-transparente si un calque intérieur est actif.
3. **Vue éclatée** : curseur 0 → 100 ; chaque pièce s'éloigne du centre du corps le long de sa direction.
4. **Libellés** : italique sépia, trait fin jusqu'à un point d'ancrage sur la pièce, rangés en colonnes gauche/droite
   (comme les affiches). Seuls les calques visibles sont étiquetés. Interrupteur « afficher les noms ».
5. **Fiche** au clic sur un libellé (ou sur la pièce) : pièce en surbrillance, nom, 2–3 phrases pour enfant,
   « Le savais-tu ? », bouton 🔊, lien Wikipédia dans la langue courante.

## Contenu (≈ 70 pièces)

- **Aspect extérieur** : tête, front, yeux, nez, oreilles, bouche, cou, épaule, bras, coude, main, doigts, ventre, nombril, genou, jambe, pied, orteils
- **Muscles** : muscles du visage, trapèze, deltoïde, pectoraux, biceps, triceps, abdominaux, fessiers, quadriceps, ischio-jambiers, mollets
- **Sang** : cœur, aorte, artères, veines (veine cave)
- **Nerfs** : cerveau, moelle épinière, nerfs des bras, nerf sciatique
- **Organes** : cerveau, poumons, cœur, foie, estomac, intestin grêle, gros intestin, reins, vessie
- **Os** : crâne, mâchoire, colonne vertébrale, côtes, sternum, clavicule, omoplate, humérus, radius, cubitus, os de la main, bassin, fémur, rotule, tibia, péroné, os du pied

Chaque nom est vérifié contre la nomenclature française usuelle (et anglaise), chaque lien Wikipédia est testé (HTTP 200).

## Technique

- Site statique, **sans étape de build** : `index.html` + `style.css` + `app.js`, Three.js chargé par importmap (version figée), publié sur **GitHub Pages**.
- **Modèles 3D** : BodyParts3D (issus de scanners réels, CC BY 4.0 → crédit affiché dans l'appli).
  `tools/build-model.mjs` sélectionne les pièces, lisse l'entrejambe du mannequin, génère l'enveloppe des poumons,
  trace la moelle épinière et les nerfs des membres (absents des données), simplifie et produit `models/body.glb` (2,4 Mo).
- **Données** : `data/parts.json` — par pièce : id, calque, nom du mesh, libellé FR/EN, description FR/EN, anecdote FR/EN, liens Wikipédia FR/EN.
- **Rendu vintage** : shading « toon » doux + contours encre, palette gravure (muscles rouge brique, os ivoire, artères rouges, veines bleu ardoise, nerfs jaune paille), fond papier, polices IM Fell English.

```
index.html  style.css  app.js
data/parts.json
models/body.glb
tools/build-model.mjs   (outil de dev, pas chargé par le site)
```

## Étapes

1. **Pipeline modèle** (risque principal) : extraire les ≈ 70 pièces, vérifier positions et poids.
2. Scène 3D, rotation, calques, rendu vintage.
3. Curseur de vue éclatée.
4. Libellés + traits, fiches, Wikipédia, voix.
5. Bascule FR/EN.
6. Relecture du contenu, test tablette et PC, déploiement GitHub Pages (PR fusionnée automatiquement).

## Hors v1

Quiz, mode hors-ligne, comptes, niveau « expert », appareil reproducteur.
