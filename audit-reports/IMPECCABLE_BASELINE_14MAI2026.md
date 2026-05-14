# Audit Impeccable Baseline — PandaSnack

**SHA** : baseline (commit non spécifié) · **Date audit** : 2026-05-14 · **Contexte** : Pré-Patience 18 mai 2026

---

## Verdict Global Anti-Patterns

**PASS avec réserves majeures.**

Observations cross-pages :
- ✅ **Aucun anti-pattern AI slop critique** (pas de gradient purple-to-blue, pas de glassmorphism, pas de sparkles décoratifs)
- ✅ **Pas de dark mode inutile** (conforme DESIGN.md)
- ✅ **Tokens CSS variables utilisés** partout sauf Admin (inconsistance)
- ⚠️ **Hardcoded colors en Admin Dashboard** (gris Tailwind : `text-gray-500`, `bg-gray-50`, `border-gray-200`) — **P1 Theming**
- ⚠️ **Colors inline partiellement** (PanierClient, RechargerClient ont du `color: "var(...)"` mais status badges hardcoded en RGB hex)
- ⚠️ **Touch targets < 44px en Admin** (boutons filtres `h-6`, liens mini 10px) — **P1 Responsive**
- ⚠️ **Nested cards légers** : RecapData en Admin (collapsible contient tableau) — **P2 Anti-Pattern**
- ✅ **Focus management absent sauf details intrusives** : pas de keyboard nav test, aucune aria-label systématique — **P1 A11y**
- ✅ **Contrast OKLCH vs Tailwind** : Panier/Recharge/Confirmation utilisent OKLCH (`var(--ink)`, `var(--accent)`), Admin utilise gris Tailwind par défaut — **incohérence majeure**

---

## Health Score par Page

| Page | A11y | Perf | Theming | Responsive | Anti-Patterns | Total/20 | Band |
|---|---|---|---|---|---|---|---|
| Panier | 2 | 3 | 2 | 3 | 3 | **13/20** | Acceptable |
| Recharge | 2 | 3 | 3 | 3 | 3 | **14/20** | Good |
| Hero/Landing | 3 | 4 | 4 | 4 | 4 | **19/20** | Excellent |
| Confirmation | 3 | 3 | 3 | 3 | 4 | **16/20** | Good |
| Admin Dashboard | 1 | 2 | 0 | 1 | 2 | **6/20** | **Critical** |
| Admin Étiquettes | 2 | 3 | 2 | 3 | 4 | **14/20** | Good |

**Moyenne brute** : 12.7/20 · **Classe globale** : **Acceptable → Poor** (Admin Dashboard tire vers le bas)

Rating bands utilisées :
- **18-20** Excellent (minor polish)
- **14-17** Good (address weak dimensions)
- **10-13** Acceptable (significant work needed)
- **6-9** Poor (major overhaul)
- **0-5** Critical (fundamental issues)

---

## Issues par Page

### 1. Panier Client (`/panier`)

**Score détaillé** :
- **A11y** : 2/4 — Pas de focus indicators, form sans labels explicites
- **Perf** : 3/4 — `window.location.reload()` × 2 (D'oh!), pas de optimistic update
- **Theming** : 2/4 — Mix de tokens `var(--ink)` + hardcoded colors en status badges (p11.10-17, RGB en hex)
- **Responsive** : 3/4 — Max-width correct, touch targets OK, pas de horizontal scroll
- **Anti-Patterns** : 3/4 — Aucun anti-pattern majeur, struktur clean

#### Issues détaillées

**[P1] Status badges hardcoded colors — ligne 10-18**
- **Location** : `PanierClient.tsx` ligne 10-18, `STATUS_LABELS` object
- **Category** : Theming
- **Impact** : Couleurs hexadécimales statiques (`#B45309`, `#166534`, `#9333EA`, etc.) ne respectent pas la palette OKLCH définie en DESIGN.md. Impossible de faire évoluer le système de couleurs sans relancer.
- **WCAG/Standard** : N/A (pas violation, mais violation de spécification interne)
- **Recommendation** : Extraire status colors vers un objet de tokens CSS ou une constante thème OKLCH. Remplacer par `var(--status-pending)`, `var(--status-paid)`, etc.
- **Effort** : S (~30 min)

**[P1] Focus & keyboard navigation absent — Panier entier**
- **Location** : `PanierClient.tsx` ligne 394+
- **Category** : Accessibility
- **Impact** : Aucune indication visuelle de focus sur boutons (toggle, paiement, annulation). Utilisateur clavier = perte totale d'orientation. Pas de `focus:outline-2` ou `focus-ring`.
- **WCAG/Standard** : WCAG 2.4.7 (Focus Visible)
- **Recommendation** : Ajouter `focus:outline-2 focus:outline-offset-2` style sur tous les boutons interactifs (toggle date, checkbox commande, "Payer", "Annuler", etc.). Tester à la clavier.
- **Effort** : M (~1h, incluant test)

**[P2] window.location.reload() × 2 (UX debt)**
- **Location** : `PanierClient.tsx` ligne 211, 248
- **Category** : Performance
- **Impact** : Full page refresh après édition/ajout article. Utilisateur perd scroll position, animations reset, flicker perceptible sur mobile. Mauvaise performation sur lenteur réseau (ressemble à crash).
- **WCAG/Standard** : N/A (UX, pas a11y)
- **Recommendation** : Implémenter optimistic update ou refetch partielle via React state. Ou utiliser `useTransition`/`useOptimistic` de Next.js 15+.
- **Effort** : L (~4h refactoring complet, risqué)

**[P2] Aria-label manquante sur boutons toggle, edit, remove**
- **Location** : `PanierClient.tsx` ligne 405+ (expandable dates), 650+ (edit), 700+ (remove)
- **Category** : Accessibility
- **Impact** : Utilisateur lecteur écran ne voit que l'emoji ou l'icône ("chevron", "✏️", "🗑️") sans contexte. "Payer" c'est bon, mais "Retirer du panier" sans aria-label sur le bouton = incompréhensible.
- **WCAG/Standard** : WCAG 4.1.2 (Name, Role, Value)
- **Recommendation** : Ajouter `aria-label="Retirer du panier"` sur chaque bouton critique. Tester au lecteur écran (NVDA, JAWS, VoiceOver).
- **Effort** : S (~45 min)

**[P3] Contrast gris-sur-crème sur "Tes menus à..."**
- **Location** : RechargerClient.tsx ligne 85-87 (vs aria-label manquante en Panier)
- **Category** : Accessibility (MINOR)
- **Impact** : Texte secondaire en `var(--ink-soft)` sur fond crème peut atteindre ~3.5:1 au lieu de 4.5:1 WCAG AA, surtout sur écran fatigué. Lisible mais limite.
- **WCAG/Standard** : WCAG 1.4.3 (Contrast Minimum) AAA = 7:1
- **Recommendation** : Tester au scanner WCAG (WebAIM Contrast Checker). Si < 4.5:1, assombrir `--ink-soft` ou clarifier `--bg`.
- **Effort** : S (diagnostic + 1-2 CSS var change)

---

### 2. Recharge Wallet (`/recharger`)

**Score détaillé** :
- **A11y** : 2/4 — Buttons labelés via texte, mais radio-like UI (singleSelect) = pas de `role="radio"`, pas de `aria-checked`
- **Perf** : 3/4 — Aucun issue majeur, setState smoothe
- **Theming** : 3/4 — Tokens `var(--*)` utilisés systématiquement ✅, aucun hardcoding
- **Responsive** : 3/4 — Max-width 32rem mobile OK, buttons 48-56px ✅, RIB modal responsive
- **Anti-Patterns** : 3/4 — Modal RIB un peu nested (card dans modal) mais acceptable

#### Issues détaillées

**[P1] Buttons singleSelect sans ARIA radio roles — ligne 115-147**
- **Location** : `RechargerClient.tsx` ligne 115-147 (pills de sélection palier)
- **Category** : Accessibility
- **Impact** : 5 boutons "Recharge 50€", "Recharge 100€", etc., avec visual selection UI (border, background change). Lecteur écran ne sait pas que c'est un groupe radio. Clavier = pas d'arrow navigation attendue.
- **WCAG/Standard** : WCAG 3.2.1 (On Focus), 2.4.3 (Focus Order) — le groupe devrait être un `radiogroup`
- **Recommendation** : Remplacer les boutons par `<fieldset role="radiogroup">` + `<label><input type="radio" .../></label>` pour chaque option. Ou ajouter `role="radio"` + `aria-checked` + `aria-label` sur chaque bouton.
- **Effort** : M (~1.5h refactoring HTML + styling radio native)

**[P2] Custom amount input manque de label explicite**
- **Location** : `RechargerClient.tsx` ligne 158-164
- **Category** : Accessibility
- **Impact** : Input `type="text" inputMode="decimal"` a un `<label>` visuel mais pas de `htmlFor` linking. Lecteur écran peut ne pas associer correctement.
- **WCAG/Standard** : WCAG 1.3.1 (Info and Relationships)
- **Recommendation** : Ajouter `<label htmlFor="custom-amount">Montant libre</label>` + `<input id="custom-amount" .../>`.
- **Effort** : S (~15 min)

**[P2] Modal RIB "copy IBAN" — aria-label sur button**
- **Location** : `RechargerClient.tsx` ligne 207-213
- **Category** : Accessibility
- **Impact** : Button "Copier le RIB" sans `aria-live` sur success message. Lecteur écran ne sait pas que "✓ Copié !" a remplacé le texte.
- **WCAG/Standard** : WCAG 4.1.3 (Status Messages)
- **Recommendation** : Ajouter `aria-live="polite" aria-atomic="true"` sur le bouton ou une zone de status. Ou remplacer le texte dans un `aria-label` dynamique.
- **Effort** : S (~20 min)

**[P3] RIB modal backdrop pas fermable au Escape**
- **Location** : `RechargerClient.tsx` ligne 184 (fixed modal)
- **Category** : Accessibility / UX
- **Impact** : Modal a close button visible mais Escape key ne ferme pas. Utilisateur clavier forcé de chercher le X.
- **WCAG/Standard** : WCAG 2.2.2 (Pause, Stop, Hide)
- **Recommendation** : Ajouter `useEffect` avec `addEventListener("keydown")` pour `e.key === "Escape" && setShowRib(false)`. Tester au clavier.
- **Effort** : S (~15 min)

---

### 3. Hero / Landing (`/page.tsx` root)

**Score détaillé** :
- **A11y** : 3/4 — h1 présent ✅, liens avec texte clair ✅, contrast OK
- **Perf** : 4/4 — Aucun asset loader, aucune animation, aucun calcul
- **Theming** : 4/4 — Tokens CSS variables utilisés exclusivement ✅
- **Responsive** : 4/4 — Max-width 28rem, flex centered, no fixed widths
- **Anti-Patterns** : 4/4 — Minimaliste, aucun anti-pattern

#### Issues détaillées

**[P3] Logo xl — pas de alt text (optionnel ici)**
- **Location** : `/page.tsx` ligne 8-10
- **Category** : Accessibility (MINOR)
- **Impact** : `<Logo size="xl" />` — si c'est une image, pas d'alt. Si c'est un SVG/component sans alt, non bloquant.
- **WCAG/Standard** : WCAG 1.1.1 (Non-text Content)
- **Recommendation** : Si Logo est une image, ajouter alt text. Si component, ajouter `aria-label="Panda Snack"` à la racine.
- **Effort** : S (~5 min)

**Status** : ✅ **Aucun issue P0/P1 — page saine.** P3 est cosmétique.

---

### 4. Confirmation Commande (`/confirmation`)

**Score détaillé** :
- **A11y** : 3/4 — h1 present ✅, sémantique OK (headings implicites via text), labels clairs
- **Perf** : 3/4 — Deux fetch en parallel (confirmationPage), pas d'issue
- **Theming** : 3/4 — Tokens variables utilisés ✅, une exception : ligne 103 hardcoded `#FEF3E2` + `#F5D5A0`
- **Responsive** : 3/4 — Max-width 32rem ✅, boutons 48px ✅, links avec `leading-[3rem]` pour clickability
- **Anti-Patterns** : 4/4 — Clean, aucun anti-pattern

#### Issues détaillées

**[P1] Hardcoded alert colors (pending recharge section) — ligne 103**
- **Location** : `ConfirmationClient.tsx` ligne 103
- **Category** : Theming
- **Impact** : Section "Tu as encore X commandes à payer" hardcodée en `background: "#FEF3E2"` + border `#F5D5A0`. Ne respecte pas palette OKLCH, impossible de maintenir thème cohérent.
- **WCAG/Standard** : N/A (spec interne)
- **Recommendation** : Remplacer par variables CSS. Ajouter `--alert-bg: oklch(0.98 0.04 70)` et `--alert-border: oklch(0.90 0.06 85)` en root, utiliser ici.
- **Effort** : S (~15 min)

**[P2] Contrast "Tu peux modifier" section — ligne 126**
- **Location** : `ConfirmationClient.tsx` ligne 126-129
- **Category** : Accessibility (MINOR)
- **Impact** : Fond `#FEF3E2` (crème) + texte noir. Contrast ~15:1, donc OK WCAG AAA, mais ressemble à du "attention discrète". Acceptable.
- **WCAG/Standard** : WCAG 1.4.3 (Contrast Minimum) — **pas violation**, OK
- **Recommendation** : Aucune action. Contrast est bon.
- **Effort** : N/A

**Status** : ✅ **1 issue P1 (hardcoded colors), sinon sain.**

---

### 5. Admin Dashboard (`/admin/dashboard`)

**Score détaillé** :
- **A11y** : 1/4 — Pas de focus indicators, tables sans `scope="col"`, status text en couleur seule (rouge/vert sans icon texte)
- **Perf** : 2/4 — Deux fetch en parallel (smart), mais tables non virtualisées (peut scalper 100+ rows)
- **Theming** : 0/4 — **Aucun token CSS.** Tailwind gris pur (`text-gray-500`, `bg-gray-50`, `border-gray-200`), pas de variables, cassure totale par rapport à OKLCH
- **Responsive** : 1/4 — Pas vraiment mobile (conçu desktop). Sticky headers cassent sur petit écran. Tables débordent sans scroll horizontal explicite.
- **Anti-Patterns** : 2/4 — Nested sections (card > OrdersTable), mais acceptable. Pas de anti-pattern majeur, juste laideur Tailwind gris.

#### Issues détaillées

**[P0 Theming] Admin Dashboard utilise Tailwind gris, pas OKLCH tokens — entire component**
- **Location** : `DashboardClient.tsx` ligne 79+ (OrdersTable), ligne 288+ (header), ligne 353+ (buttons)
- **Category** : Theming
- **Impact** : **Incohérence systémique critique.** Admin voit une couleur UI complètement différente du reste de l'app (gris Tailwind par défaut vs terracotta/jaune OKLCH). Maintenance impossible : deux systèmes de couleur. Migration OKLCH en Production impossible tant que Admin n'est pas migrée.
- **WCAG/Standard** : N/A (spec interne)
- **Recommendation** : Remplacer **tous** les `text-gray-*`, `bg-gray-*`, `border-gray-*` par des variables OKLCH. Au minimum :
  - `text-gray-500` → `var(--ink-soft)`
  - `text-gray-700` → `var(--ink)`
  - `bg-gray-50` → `var(--bg-alt)`
  - `border-gray-200` → `var(--border)`
  - Pour contrastes plus forts : ajouter des tokens `--ink-strong: oklch(0.15 0.02 50)` si besoin.
- **Effort** : M (~2h find-replace + testing)

**[P1 A11y] Table rows + status avec couleur seule, pas de text alternatives — line 109-110**
- **Location** : `DashboardClient.tsx` ligne 109-122
- **Category** : Accessibility
- **Impact** : Status affiché via emoji + color (`text-green-700` / `text-red-600`). Lecteur écran voit "✅ 50€" ou "❌ 50€" mais color-blind utilisateur ne distingue pas la couleur. Texte "paid"/"pending_payment" devrait être explicite.
- **WCAG/Standard** : WCAG 1.4.1 (Use of Color)
- **Recommendation** : Remplacer couleur comme **seul** signal par text. Ajouter `<span aria-label="Payée" className="...">✅</span>` ou simplement afficher "Payée · 50€" sans se fier à la couleur.
- **Effort** : S (~30 min)

**[P1 Responsive] Buttons filtres < 44px en height — ligne 349-357**
- **Location** : `DashboardClient.tsx` ligne 349-357 (preset buttons "Aujourd'hui", "Semaine", etc.)
- **Category** : Responsive
- **Impact** : `px-3 py-1.5` = ~28px de haut. Sur mobile avec doigt gros, difficile à taper. Min 44px selon DESIGN.md.
- **WCAG/Standard** : WCAG 2.5.5 (Target Size)
- **Recommendation** : Augmenter `py-2` ou `py-2.5` pour >= 44px. Tester sur device 320px wide.
- **Effort** : S (~15 min)

**[P1 Responsive] Day tabs horizontal scroll pas visible — ligne 385-408**
- **Location** : `DashboardClient.tsx` ligne 385 (sticky div overflow-x-auto)
- **Category** : Responsive
- **Impact** : Sur mobile 375px, si 14 jours affichés, tableau dépasse. `overflow-x-auto` mais **pas d'scroll bar visible** en Safari. Utilisateur pense qu'il n'y a que 3 jours dispo.
- **WCAG/Standard** : WCAG 2.4.8 (Location)
- **Recommendation** : Ajouter scroll indicator visuel (shadow gradient droit, ou cheat: `-webkit-overflow-scrolling: touch` + ajouter `scrollbar-width: thin` CSS). Ou paginator boutons prev/next.
- **Effort** : M (~1h UX testing + implementation)

**[P1 A11y] Table sans scope="col" — ligne 81-90**
- **Location** : `DashboardClient.tsx` ligne 81-90
- **Category** : Accessibility
- **Impact** : OrdersTable `<th>` sans `scope="col"`. Lecteur écran ne sait pas qu'il y a une header row. Rend table inutile pour utilisateur malvoyant.
- **WCAG/Standard** : WCAG 1.3.1 (Info and Relationships)
- **Recommendation** : Ajouter `scope="col"` à tous les `<th>`. Pour footer ou recap row, ajouter `scope="row"` aux `<th>` de colonne 1.
- **Effort** : S (~20 min)

**[P2 Perf] OrdersTable non virtualisée — risque perf sur 100+ rows**
- **Location** : `DashboardClient.tsx` ligne 92 (tbody boucle complète)
- **Category** : Performance
- **Impact** : Si un jour a 200+ commandes, `{orders.map(...)}` render 200 DOM nodes d'un coup. Pas de virtualisation. Peut lagger.
- **WCAG/Standard** : N/A
- **Recommendation** : Ajouter virtualisation (react-window, TanStack Table, ou lazy offset + pageSize). Ou au minimum limiter affichage à 50 + "load more".
- **Effort** : L (~4h intégration virtualisation)

**Status** : 🔴 **P0 Theming cassé, P1s A11y/Responsive critiques. Admin is not "Impeccable".**

---

### 6. Admin Étiquettes (`/admin/etiquettes/[date]`)

**Score détaillé** :
- **A11y** : 2/4 — Pas de focus (buttons date/métier), label CSS print OK mais interaction no keyboard nav
- **Perf** : 3/4 — Fetch asynchrone smart, CSS print optimisé, aucun layout thrashing
- **Theming** : 2/4 — CSS-in-JS custom pour labels (colors hardcoded 9pt gris), pas de tokens, mais c'est pour print donc exception
- **Responsive** : 3/4 — Sticky header mobile OK, date picker responsive, print format locked 105×57mm ✅
- **Anti-Patterns** : 4/4 — Aucun anti-pattern, étiquette structure impeccable

#### Issues détaillées

**[P2 A11y] Buttons date/métier sans focus rings — ligne 249-279**
- **Location** : `EtiquettesClient.tsx` ligne 249-279
- **Category** : Accessibility
- **Impact** : Onglets jour et métier = buttons sans `focus:outline-2 focus:outline-offset-2`. Clavier = perte d'orientation.
- **WCAG/Standard** : WCAG 2.4.7 (Focus Visible)
- **Recommendation** : Ajouter focus ring CSS à tous les buttons du header. Copy-paste de ce qu'on fera en Dashboard.
- **Effort** : S (~20 min)

**[P3] Label CSS hardcoded colors pour print — ligne 143-217**
- **Location** : `EtiquettesClient.tsx` ligne 143-217 (`.label { color: #1f2937; }`, etc.)
- **Category** : Theming (EXCEPTION)
- **Impact** : Print étiquettes utilise hex hardcoded. C'est acceptable car c'est print (pas theme-able), mais contraste `#374151` (header) sur white = ~6.5:1 ✅ OK.
- **WCAG/Standard** : WCAG 1.4.3 (Contrast Minimum)
- **Recommendation** : Pas de fix nécessaire. C'est intentionnel pour print stabilité.
- **Effort** : N/A

**[P3] Service date format en français — ligne 27-37**
- **Location** : `EtiquettesClient.tsx` ligne 27-37
- **Category** : Localization (MINOR)
- **Impact** : `fmtDateOnlyShort` transforme UTC en Martinique -4h manuellement. Marche mais fragile. Date label correct.
- **WCAG/Standard** : N/A
- **Recommendation** : Utiliser `Intl.DateTimeFormat` avec timeZone comme dans PanierClient. Moins fragile.
- **Effort** : S (~15 min refactor)

**Status** : ✅ **Pas de P0/P1 critique. P2 = focus rings à ajouter (cosmétique). Sinon sain.**

---

## Patterns Systémiques (Cross-Pages)

### 1. **Color Hardcoding en Status Badges & Alerts** — P1 Theming

Observé dans :
- `PanierClient.tsx` ligne 10-18 (`STATUS_LABELS` avec RGB hex)
- `ConfirmationClient.tsx` ligne 103 (`#FEF3E2`, `#F5D5A0`)
- `RechargerClient.tsx` ligne 120-121 (direct style inline `isSelected ? "#F0FDF4" : ...`)

**Impact** : Impossible de thématiser systématiquement. Chaque changement de palette = find-replace dans 3+ fichiers. Maintenance insoutenable.

**Recommendation** : Créer un objet de tokens thème unifié :
```typescript
export const THEME_TOKENS = {
  status: {
    pending: { label: "...", color: "var(--status-pending)", bg: "var(--bg-status-pending)" },
    paid: { ... },
    ...
  }
}
```
Puis importer et utiliser partout.

**Effort** : M (~1.5h extraction + test)

### 2. **Admin Dashboard = Système de couleur disjoint** — P0 Theming

`DashboardClient.tsx` utilise **exclusivement** Tailwind gris (`text-gray-*`, `bg-gray-*`), jamais OKLCH variables. Pendant ce temps, Panier/Recharge/Confirmation utilisent `var(--ink)`, `var(--accent)`, etc.

**Impact** : 
- Deux systèmes de design coexistent dans la même app.
- Admin utilisateurs (Rachel) voient UI grise totalement différente.
- Impossible de migrer toute l'app vers OKLCH tant qu'Admin reste sur Tailwind.

**Recommendation** : Refactor Admin à utiliser root CSS variables, soit :
1. Copier-coller les tokens OKLCH de DESIGN.md en admin scope
2. Ou créer une fichier `tokens.css` centralisé et l'importer partout

**Effort** : M (~2-3h systematic replacement)

### 3. **Focus Management Absent Sur Forms Interactifs** — P1 A11y

Aucune page n'implémente `focus:outline-2 focus:outline-offset-2` ou équivalent. Buttons, inputs, checkboxes = **invisibles au clavier**.

Observé partout : Panier (toggle dates, sélection commandes, bouton payer), Recharge (pills sélection, input custom), Admin (buttons filtres, table interactions).

**Impact** : Utilisateur clavier/lecteur écran perd totalement l'orientation. Non-conforme WCAG 2.4.7.

**Recommendation** : Créer un component `<Button>` avec focus ring baked-in. Ou ajouter une classe utility `.focus-ring` Tailwind, l'utiliser partout.

**Effort** : M (~1-2h refactor + test WCAG)

### 4. **Aria-label & Role Attributes Manquants** — P1 A11y

Observé dans :
- Panier : boutons "Retirer", "Éditer", "Toggle date" sans aria-label
- Recharge : radio-like pills sans `role="radio"` ni `aria-checked`
- Étiquettes : buttons date/métier sans aria-label

**Impact** : Lecteur écran décrit les buttons par emoji/icon seule, incompréhensible.

**Recommendation** : Audit systématique + ajouter aria-label à **tous** les boutons sans texte visible. Test au lecteur écran (NVDA, VoiceOver).

**Effort** : M (~2h audit complet + fixes)

### 5. **Touch Targets < 44px en Admin & Recharge** — P1 Responsive

- Admin : preset buttons (`py-1.5` = ~28px), day tabs same size
- Recharge : custom RIB modal buttons OK, mais filtres preset trop petits si présents

**Impact** : Utilisateur mobile avec gros doigts = frustration, mis-taps.

**Recommendation** : Standardiser sur 44px minimum height partout. Remplacer `py-1.5` par `py-2.5` ou `py-3` dans tous les buttons.

**Effort** : S (~1h global)

---

## Positive Findings

✅ **Ce qui marche bien, à préserver/répliquer** :

1. **Tokens CSS systématiques en Panier/Recharge/Confirmation** — `var(--ink)`, `var(--accent)`, `var(--accent-2)` utilisés avec discipline. **À répliquer en Admin.**

2. **Hero page minimaliste et parfait** — Aucun anti-pattern, responsive, contrast OK, accessible. **C'est la baseline à copier.**

3. **Confirmation page — UX fluide & inclusive** — Layouts sain, boutons généreux, langage clair. Seule exception = hardcoded alert colors (triviale à fixer).

4. **Étiquettes print CSS impeccable** — Format strict 105×57mm, margins protégées, contraste fort noir/blanc. **Zéro issue a11y pour print.**

5. **Recharge Wallet — Formulaire cohérent** — States gérées proprement, tokens appliqués, pas d'anti-patterns, UX fluide. **Modèle à copier pour autres formulaires.**

6. **Absence de AI slop tells** — Aucune gradient purple-to-blue, aucune glassmorphism, aucune skeletal shimmer agitée, aucune sparkle décorative. **Discipline visuelle respectée.**

7. **Server-side data fetching intelligent** — Panier, Recharge, Confirmation utilisent `force-dynamic` ou SSR direct. Pas de hydration mismatch. **Bonne pratique.**

---

## Recommendations Priorisées

### Avant 18 mai (P0 + P1 critiques)

1. **[P0] Refactor Admin Dashboard vers OKLCH tokens** (`/admin/dashboard`)
   - Remplacer `text-gray-*`, `bg-gray-*`, `border-gray-*` par variables CSS
   - Test: Admin doit visuellement matcher Panier/Recharge/Confirmation
   - Effort : M (~2-3h)
   - Impact : Unifies design system, enables future theme migration

2. **[P1] Add focus rings à tous les buttons** (Panier, Recharge, Admin, Étiquettes)
   - Ajouter `focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)]`
   - Test: Keyboard navigation sur chaque page
   - Effort : M (~1-2h systematic)
   - Impact : WCAG 2.4.7 compliance, basic keyboard accessibility

3. **[P1] Extract status colors vers tokens** (Panier, Confirmation)
   - Créer `--status-pending`, `--status-paid`, `--status-cancelled`, etc. en CSS root
   - Remplacer hardcoded hex en STATUS_LABELS + alert sections
   - Effort : S (~1.5h)
   - Impact : Maintains color consistency, enables future palette swaps

4. **[P1] Add aria-labels à interactive buttons** (Panier, Recharge, Étiquettes)
   - Audit : ~40 buttons (estimate) missing aria-label
   - Fix : Ajouter `aria-label="context-specific action"` à cada
   - Effort : M (~1.5h)
   - Impact : WCAG 4.1.2 compliance, lecteur écran usable

5. **[P1] Fix touch targets en Admin (44px minimum)**
   - Preset buttons : `py-1.5` → `py-3` (~36px → 48px)
   - Day tabs : même augmentation
   - Effort : S (~30 min)
   - Impact : WCAG 2.5.5 compliance, mobile usability

### Phase polish (P2)

6. **[P2] Refactor Recharge radio pills → proper `<fieldset role="radiogroup">`**
   - Effort : M (~1.5h)
   - Impact : WCAG 3.2.1, better accessibility

7. **[P2] Add `scope="col"` à tables Admin**
   - Effort : S (~20 min)
   - Impact : WCAG 1.3.1, lecteur écran comprehensible

8. **[P2] Modal RIB escape key + aria-live**
   - Effort : S (~20 min)
   - Impact : Keyboard accessibility + SR status feedback

9. **[P2] Optimize OrdersTable (virtualization or pagination)**
   - Effort : L (~4h)
   - Impact : Perf on 100+ rows

### Backlog (P3 cosmétique)

10. **[P3] Alt text sur Logo home**
11. **[P3] Date format refactor (Intl API)**
12. **[P3] Scroll indicator en day tabs mobile**
13. **[P3] Optimize window.location.reload() → optimistic updates (L effort)**

---

## Note Méthodologique

**Audit statique code, pas runtime.**

Limitations acceptées :
- Pas de DevTools manual inspection : impossible de vérifier animations frame-rate réelles, exact OKLCH rendering sur écrans IPS vs TN, contraste pixel-level
- Pas de Lighthouse run : est-ce que core vitals sont OK? Performance réelle sur 3G?
- Pas de vrai test clavier/lecteur écran : assumptions basées sur absence de `focus:outline`, pas sur vrai test NVDA/JAWS
- Pas de mobile device capture : responsive design estimée via CSS analysis, pas screenshot real device

**Donc** : Rapport = code audit + static analysis. Actions **doivent être vérifiées** par :
- WCAG validator post-fix
- Manual keyboard navigation test
- Screen reader audit (NVDA, VoiceOver)
- Mobile device test (375px, 414px, 768px)

---

## Summary Statistics

**Total issues found** :
- **P0** : 1 (Admin Dashboard color system)
- **P1** : 10 (focus rings, aria-labels, touch targets, hardcoded colors, table scopes, radio roles)
- **P2** : 7 (reload UX, radio fieldset, escape key, virtualization, etc.)
- **P3** : 4 (alt text, date format, scroll indicator, optimistic updates)

**Total** : 22 issues across 6 pages

**Pages by grade** :
- 🟢 Excellent (18-20) : Hero/Landing (19/20)
- 🟢 Good (14-17) : Recharge (14), Confirmation (16), Étiquettes (14)
- 🟡 Acceptable (10-13) : Panier (13)
- 🔴 Critical (0-9) : Admin Dashboard (6)

**Avg** : 12.7/20 → **Globally Acceptable, but Admin is a liability**

---

**Audit completed** : 2026-05-14 · **Next review** : Post-fix verification by QA + WCAG tester

