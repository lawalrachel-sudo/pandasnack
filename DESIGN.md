# DESIGN.md — Panda Snack

## Skins par métier

Panda Snack sert plusieurs métiers (École La Patience, Pandattitude, Panda
Guest). Chaque métier a sa propre identité visuelle (couleurs, voix, ton),
mais partage le même produit. Le skin est résolu côté serveur depuis
`account.source_group` et appliqué via variables CSS.

### Skin École (actif aujourd'hui)

Le contexte : familles avec enfants, école privée Martinique, registre
familial et rassurant. Pas un restaurant, pas un app store, pas une
boutique premium.

**Palette OKLCH** (tinted neutrals, ne pas utiliser `#000` / `#fff`) :

| Rôle | Valeur OKLCH | Hex approx | Usage |
|---|---|---|---|
| `--bg` | `oklch(0.95 0.018 75)` | `#F0E6D6` | Fond crème, surface principale |
| `--bg-alt` | `oklch(0.92 0.025 75)` | `#E8D6BF` | Surface secondaire (cards, sections) |
| `--accent` | `oklch(0.63 0.16 45)` | `#C85A3C` | Terracotta chaud, CTA principal |
| `--accent-2` | `oklch(0.78 0.15 85)` | `#E8B931` | Jaune doré, secondaire / wallet pill |
| `--ink` | `oklch(0.25 0.02 50)` | `#2D2A26` | Texte principal (≠ pur noir) |
| `--ink-soft` | `oklch(0.50 0.02 50)` | `#6B5742` | Texte secondaire, métadonnées |
| `--border` | `oklch(0.85 0.025 75)` | `#D6C2A6` | Bordures, séparateurs |

**Stratégie couleur** : Restrained avec un seul accent dominant
(terracotta `--accent`) ≤10% de la surface. Le jaune doré `--accent-2`
n'apparaît que sur la pastille wallet et les confirmations positives.

**Voix** : familial, rassurant, simple, direct.
- "Mon panier" pas "Ma commande en cours"
- "Heure limite" pas "Cut-off time"
- Tutoiement parent-enfant cohérent avec famille
- Pas de promesse marketing ("Le meilleur bento de Martinique" ❌)
- Pas de jargon ("Cart abandonment" ❌, "Out of stock" ❌)

**Logo** : Panda Snack existant (panda chef sur fond rouge brique), affiché
en bannière au-dessus de la pastille wallet. Pas plus haut que 320px sur
mobile, jamais étiré.

### Skin Panda Guest (futur, à préparer)

Le contexte : adultes au bureau, petit-déj livré, sandwich garni > viennoiserie.
Registre premium discret, calme, fonctionnel. Distance émotionnelle assumée
(c'est un service, pas une famille).

**Direction palette à proposer** (à finaliser quand Panda Guest est activé) :

| Rôle | Direction | Justification |
|---|---|---|
| `--bg` | Lin clair `oklch(0.96 0.008 80)` | Neutre tiède, pas crème enfantin |
| `--accent` | Terre profonde `oklch(0.45 0.10 30)` | Sienne brûlée, sérieux |
| `--accent-2` | Vert sauge `oklch(0.55 0.06 140)` | Salé/végétal, contrepoint frais |
| `--ink` | `oklch(0.22 0.01 50)` | Anthracite tiède |

**Stratégie couleur** : Restrained encore plus stricte. Pas de jaune doré.
L'identité Panda Guest se voit dans la **typographie et la mise en page**,
pas dans la couleur.

**Voix** : sérénité, premium discret, adulte.
- "Votre commande" (vouvoiement client B2C adulte)
- "Livraison" pas "Le sandwich arrive bientôt"
- Pas de mascotte panda visible (logo simplifié, monogramme)
- Copy concise, factuel ("Petit-déj 09:30 · CTM rdc")

**Cible Martinique** : sandwich garni, jus pressé, café/thé, pas de
viennoiserie industrielle. Ton "qualité du quotidien" plutôt que "premium
ostentatoire".

---

## Typographie — 2 options

### Option A — Fraunces (display) + Inter (body) — **recommandée**

- **Fraunces** : serif moderne avec axe SOFT et OPSZ variables.
  - Caractère doux qui colle au registre familial École
  - Distinctif (anti-slop : pas Inter partout)
  - Variable font → un seul fichier pour tous les poids/grades
  - Usage : titres `h1`/`h2`, prénoms d'enfants sur étiquettes, GRAND TOTAL
- **Inter** : sans-serif neutre éprouvé pour body et UI.
  - Compatibilité maximale (touche tabulaire, latine étendue, accents
    français impeccables)
  - Excellente lisibilité aux petites tailles (étiquettes 8-11pt)
  - Usage : labels, navigation, body, formulaires, tables admin

Couplage Fraunces (titres) + Inter (body) = contraste serif/sans qui
hiérarchise visuellement sans dépendre uniquement du poids. Justification
"earned familiarity" : Stripe utilise un couple similaire (Sohne + Inter).

### Option B — Plus Jakarta Sans (partout) — alternative neutre

- **Plus Jakarta Sans** : sans-serif géométrique humaniste, indonésien,
  open-source, 8 poids variables.
  - Tonalité légèrement amicale (terminaisons douces, x-height haute)
  - Aucun couplage à gérer = simplicité d'intégration et de maintenance
  - Lisible mobile petites tailles
  - Inconvénient : moins distinctif (utilisé par beaucoup d'apps tech)

Choix par défaut si on veut minimiser la charge de décision typo. À
préférer si on n'a pas de stratégie d'extension long terme (Panda Guest
voudrait peut-être un duo distinct).

### Recommandation
**Option A** (Fraunces + Inter) pour Skin École. Elle porte mieux le
registre familial et offre une voie pour Panda Guest (passer à un duo
plus géométrique style Söhne + Inter).

### Tailles minimum
- Body **16px** mobile, **17px** desktop (jamais en-dessous)
- Labels secondaires **14px**, jamais sous **12px** en UI
- Hiérarchie : ratio ≥1.25 entre échelons consécutifs (12 → 14 → 16 → 20 → 24 → 32)
- Étiquettes cuisine : 8pt minimum (anti-flou impression A4)
- Tabulaire : `font-variant-numeric: tabular-nums` partout où des montants
  s'alignent

---

## Espacement & layout

- Échelle 4pt (4, 8, 12, 16, 24, 32, 48, 64). Pas de valeurs ad hoc.
- Padding cards **16-20px** sur mobile, **24px** desktop.
- Touch targets **44×44px minimum** (iOS guideline). Boutons toujours ≥44px de
  haut, y compris boutons "Annuler" secondaires.
- Pas de carte imbriquée dans une carte. Une carte = un objet unique.
- Le panier est une **liste**, pas un grid de cards.
- Tables admin : préférer densité info à l'aération (Rachel veut tout voir).

---

## Motion

- Loaders et transitions de page : `ease-out-quart` ou `ease-out-quint`.
  Pas de bounce, pas d'elastic. Confiance > délice.
- Animations max 200ms. Au-delà, c'est de l'attente perçue.
- Pas d'animation layout (height, width, top). Transform/opacity seulement.
- Hover desktop : transition douce (150ms ease-out). Mobile : `active:scale-[0.98]`
  pour feedback tactile, pas plus.

---

## Anti-patterns interdits

Match-and-refuse. Si une PR contient un de ces éléments, refus immédiat.

- **Gradient `purple-to-blue`** (le slop par excellence des dashboards 2020-2024).
- **Cards imbriquées** (une card dans une card dans une card = perte de
  hiérarchie).
- **Texte gris sur fond coloré** (`text-gray-400` sur un accent saturé → contraste mort).
- **Glassmorphism** (`backdrop-blur`, transparence empilée) : flou cognitif.
- **Hero "gros chiffre + accent glowing"** ($1M+ users, animated counters).
- **Easing bounce / elastic** sur paiements, validation, loaders.
- **Touch targets < 44px** sur mobile (boutons collés, icônes nues sans hitbox).
- **Side-stripe borders > 1px** comme accent décoratif sur cards. Préférer fond teinté plein ou rien.
- **Gradient text** (`background-clip: text` + gradient). Solide ou rien.
- **Skeleton loaders agités** (shimmer animé qui distrait). Préférer placeholder statique discret.
- **Sparkles / emoji décoratifs** sans fonction informationnelle.
- **Dark mode "parce que c'est cool"**. Si ajouté un jour, justifier par contexte d'usage réel.

---

## Composants critiques

### Bouton CTA principal
- Hauteur **48-56px** mobile, **44px** desktop
- Fond `--accent` plein, texte blanc cassé `oklch(0.98 0.005 75)`
- Radius **12px** (cohérent avec cards)
- Pas d'ombre flottante. Une légère teinte au hover suffit.
- `active:scale-[0.98]` pour feedback tactile mobile

### Cart pill / Wallet pill
- Pastille pleine `--accent-2` (jaune doré), pas de bordure
- Texte blanc cassé, gras
- Toujours visible en sticky Navbar

### Table admin
- Rows hover `--bg-alt`
- En-tête `--bg-alt` gras uppercase 11px
- Bordures `--border` discrètes, jamais épaisses
- Pas de zébrures (lourdes visuellement)

### Étiquette HACCP (cuisine)
- Format strict 105×57mm Office Star OS43425
- Padding interne 2-4mm vertical, 5mm horizontal
- Hiérarchie : en-tête métier+date · prénom+classe · items · allergènes · footer date+conservation
- Typo dense, line-height resserré (1.0-1.15), contraste fort
- Pas de couleur décorative : noir sur blanc, allergènes en jaune pâle de
  signal seulement

---

## Tokens CSS (Skin École)

```css
:root {
  /* Palette OKLCH (Skin École) */
  --bg: oklch(0.95 0.018 75);
  --bg-alt: oklch(0.92 0.025 75);
  --accent: oklch(0.63 0.16 45);
  --accent-2: oklch(0.78 0.15 85);
  --ink: oklch(0.25 0.02 50);
  --ink-soft: oklch(0.50 0.02 50);
  --border: oklch(0.85 0.025 75);
  --shadow: oklch(0.20 0.01 50 / 0.08);

  /* Typo */
  --font-display: "Fraunces", Georgia, serif;
  --font-body: "Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;

  /* Échelle espacement (4pt) */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;

  /* Radius */
  --radius-sm: 8px;
  --radius: 12px;
  --radius-lg: 16px;
}
```

(Note : la prod actuelle utilise déjà des variables CSS équivalentes en
hex. Migration OKLCH = effort S, à planifier post-audit.)
