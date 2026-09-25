# PS-05 — Audit fonctionnel + Impeccable · front parents ET admin

**Date** : 24 septembre 2026 · **Cible** : production `https://pandasnack.online`
**SHA prod local** : `857836d` · **Compte test** : `lawalrachel@gmail.com` (flag `accounts.is_admin = true`)
**Outil** : Playwright headless (Chromium), viewport 420×900 et 360×800, locale fr-FR
**Périmètre** : rapport uniquement — **aucune modification de code**

---

## ⚠️ 3 CHOSES À LIRE AVANT TOUT

1. **Il reste une commande de test PAYÉE en base que je n'ai pas pu supprimer** : `PS-20260924-0001`, 15,00 €, Sam 26/09, profil Loulou. Elle est visible sur `/admin/liste/2026-09-26`, `/admin/etiquettes/2026-09-26` et dans le récap production. **Elle partira en cuisine si tu ne l'annules pas.** SQL en §A-9.
2. **La cause la plus probable du « 0 commande depuis la rentrée » est identifiée** : **19 profils sur 22 sont `inactif` avec `classe = NULL`**. Tous les parents inscrits depuis le 05/06/2026 (dont les 3 de la rentrée : Cécile 15/09, Ila 23/09, frédéric 23/09) sont dans ce cas. Aucun d'eux n'a de profil utilisable dans `/commander`. Détail §A-11.
3. **`/api/cancel-order` répond `{"success":true}` sans rien annuler** sur une commande payée. Le `update` n'est jamais vérifié. P0.

---

# A. SMOKE TEST FONCTIONNEL

| # | Étape | Verdict | Preuve |
|---|---|---|---|
| 1 | Accueil `/` charge | ✅ **OK** | HTTP 200, `<title>` « Panda Snack — Commande en ligne », H1 « Commande en ligne » |
| 1b | Bandeau horaires + bandeau Info parents visibles | ✅ **OK** | Les deux textes rendus sur `/` et `/commander`. `INFO_PARENTS_UNTIL = 2026-10-07` respecté (`InfoParentsBanner.tsx:12`) |
| 1c | Favicon panda | ✅ **OK** | `/favicon.ico`, `/icons/icon-192.png`, `/apple-icon.png`, `/manifest.json` déclarés |
| 2 | Connexion → `/commander` | ✅ **OK** | POST login → redirection automatique vers `/commander`, 0 erreur console, 0 HTTP ≥ 400 |
| 2b | Créneaux mer/sam affichés | ✅ **OK** | 7 créneaux : Sam 26/09, Mer 30/09, Sam 03/10, Mer 07/10, Sam 10/10, Mer 14/10, Sam 17/10 |
| 2c | Cutoff veille 20h Martinique | ✅ **OK** | `orders_cutoff_at` = `service_date` à `00:00:00+00:00` = **veille 20h en UTC-4**. Calcul exact. Filtre `gt("orders_cutoff_at", now)` appliqué côté serveur (`commander/page.tsx:97`) |
| 3 | Menu Panda — items actifs affichés | ✅ **OK** | SAND (Jambon/fromage, Thon Mayo, Omelette-Jambon, Club Thon-Mayo, Club Œuf), CROQ (Croque Panda), PASTA (Bolognaise), SOUP (400 ml) — tous à **10,00 €** |
| 3b | `coming_soon` grisés et non cliquables | ✅ **OK** | Burger Poulet / Burger Veggie : badge « Bientôt disponible ! », `role` supprimé, `aria-disabled="true"`, classe `pcard-soon`, `onClick` = `undefined`. Garde serveur aussi (`order-item/route.ts:203` + `:228`) |
| 3c | Items inactifs absents | ✅ **OK** | `SAND-VOLAILLE` exclu par `visForSource()` — absent du rendu |
| 4 | Carrousel « Article seul » + Bubble Tea fixe | ✅ **OK** | 11 cartes carrousel + bloc « + Bubble Tea 2,50 € » fixe sous le carrousel |
| 5 | Panier : Menu + article seul + piment, totaux | ✅ **OK** | Menu Panda — Jambon/fromage **10,00 €** + « + Sauce piment » (gratuite) / Croque simple **2,50 €** / Bubble Tea **2,50 €** → **TOTAL 15,00 €**. Prix menu identique quel que soit le plat ✅ |
| 6 | Paiement « sur place » | ⚠️ **OK (≠ brief)** | Commande créée : `PS-20260924-0001`, `status=pending_payment`, `payment_method=on_site`, `total_cents=1500`. **Pas de redirection vers `/confirmation`** : le flux renvoie vers `/panier?onsite=ok` — c'est **volontaire** (`checkout-onsite/route.ts:47-50`), pas un bug. Aucun appel Stripe déclenché ✅ |
| 6b | `/confirmation?order=<id>` rend correctement | ✅ **OK** | Détail complet, « ⏳ En attente de paiement » puis « Commande confirmée ! » après encaissement |
| 7 | `/mon-espace` : la commande apparaît | ❌ **KO** | **`/mon-espace` n'affiche aucune liste de commandes.** Il ne contient que Profils / Panda Wallet / Mon compte + un compteur `orderCount` filtré sur `status='paid'` (`mon-espace/page.tsx:38`). Affichait « 0 commandes » alors que la commande existait |
| 7b | Annulation avant cutoff | ❌ **KO** | Une fois la commande marquée encaissée, **`/panier` affiche « Aucune commande »** → le bouton « Annuler toute la commande » devient inatteignable. Et l'appel direct à `/api/cancel-order` renvoie `200 {"success":true}` **sans annuler** (voir §A-10) |
| 8 | `/admin` accessible | ✅ **OK** | Pas de mot de passe requis : accès par `accounts.is_admin` (2ᵉ voie légitime, `lib/auth/admin.ts`). `ADMIN_PASSWORD` non nécessaire |
| 8a | Dashboard affiche la commande, badge NON PAYÉ | ✅ **OK** | Ligne `PS-20260924-0001 · Pandattitude · Rachel Lawal · Loulou` → `NON PAYÉ · 15,00 €` |
| 8b | « Marquer encaissé » | ✅ **OK** | `POST /api/admin/mark-paid` → 200. Badge passe à `🟢 Encaissé · 15,00 €`, compteur « COMMANDES PAYÉES » → `1 · 15,00 €` |
| 8c | `/admin/etiquettes/2026-09-26` | ✅ **OK** | 1 étiquette, format Office Star OS43425, contient n° + Loulou (mercredi) + 3 lignes + « ⚠️ Allergènes : Gluten · Lactose » |
| 8d | `/admin/liste/2026-09-26` | ⚠️ **OK avec défaut** | Contient la commande. Mais l'en-tête affiche **« PANDATTITUDE (1 commande · 0,00 €) »** alors que la ligne vaut 15,00 € : le total de groupe exclut les non-payées → chiffre trompeur pour la prod |
| 8e | `/admin/recapitulatif` | ❌ **KO (route inexistante)** | **HTTP 404.** Le récap existe mais c'est un bloc repliable **dans `/admin/dashboard`** (« 📦 Récap production »), alimenté par `/api/admin/recap`. Il a rendu correctement : 1 × Menu Panda (Jambon/fromage, Sauce piment), 1 × Croque simple, 1 × Bubble Tea |
| 9 | Supprimer / annuler la commande de test | ❌ **KO — action requise de ta part** | `/api/cancel-order` → `200 {"success":true}` mais en base : `status` toujours `paid`, `cancelled_at` toujours `NULL`. **La commande est encore là.** |
| 10 | Console + erreurs réseau | ⚠️ | **Aucune erreur console, aucun 4xx/5xx sur le parcours parent complet.** Seuls incidents : `404 GET /admin/recapitulatif` (route inexistante) et **1 × React error #418** (mismatch d'hydratation) constatée sur le parcours admin |

---

### A-9 · Commande de test à nettoyer (à faire par toi)

```sql
-- Vérifier
select order_number, status, payment_method, total_cents, paid_at, cancelled_at
from orders where order_number = 'PS-20260924-0001';

-- Annuler (service_role / SQL editor Supabase)
update orders
   set status = 'cancelled', cancelled_at = now()
 where order_number = 'PS-20260924-0001';
```

Aucun recrédit wallet à prévoir : `payment_method = 'on_site'`, le wallet n'a jamais été débité (solde vérifié : 0,00 €).

### A-10 · P0 — `/api/cancel-order` ment sur son résultat

`src/app/api/cancel-order/route.ts:48-51` :

```ts
await (supabase as any).from("orders").update({
  status: "cancelled",
  cancelled_at: new Date().toISOString(),
}).eq("id", orderId)
// ← aucun { error } récupéré, aucun test, on tombe directement sur success:true
```

Le client Supabase utilisé est le client **utilisateur** (anon + cookies), donc soumis à la RLS. Sur une commande `paid`, l'UPDATE est refusé, l'erreur est avalée, et la route répond `success`. Le parent (ou ici l'admin) croit avoir annulé.

Indice supplémentaire : la commande `PS-20260910-0001` est en `status='cancelled'` avec `cancelled_at = NULL` — la même RLS laisse manifestement passer certaines colonnes et pas d'autres.

Contraste : `/api/admin/mark-paid` fait exactement le bon travail (service_role + `{ data, error }` vérifiés + 404 si rien n'a bougé). C'est le modèle à copier.

**Fichiers concernés** : `src/app/api/cancel-order/route.ts` · policy RLS `UPDATE` sur `orders`.

### A-11 · Cause probable du « 0 commande depuis la rentrée »

Constat DB (via `/admin/profils` → « Afficher inactifs ») : **22 profils, dont 19 `inactif`**.

| Parent | Inscription | Profil | Classe | Statut |
|---|---|---|---|---|
| frédéric lebailly | 23/09/2026 | frédéric (défaut) | — | **inactif** |
| Ila Petricien | 23/09/2026 | Ila (défaut) | — | **inactif** |
| Cécile GERMAINY | 15/09/2026 | Cécile (défaut) | — | **inactif** |
| Laurent, Cindy, Yohan, Mathieu, Damien, Jean-Max, Elyas ×2, Florina, Dimitri, Maïda, Alicia, sebastien | 05/06 → 09/07 | prénom du **parent** (défaut) | — | **inactif** |
| Loulou (compte test) | 04/05/2026 | Loulou | mercredi | actif |

Deux constats qui se cumulent :

**(a) Le sélecteur « Commande pour » est vide pour tous ces comptes.** `CommanderClient.tsx:221-226` exige trois conditions cumulées :

```ts
const activeProfils = profils.filter((p) => {
  if (!p.active) return false          // ← échoue : active = false
  if (p.metier !== pageMetier) return false
  if (pageMetier === "panda_guest") return true
  return !!p.classe                    // ← échoue aussi : classe = NULL
})
```

Résultat affiché à ces parents : un bandeau orange **« Aucun profil pour ce métier. Créer un profil »** (`CommanderClient.tsx:561-566`) au lieu du prénom de leur enfant. Le catalogue reste techniquement cliquable, mais le parcours est cassé visuellement dès la première étape.

**(b) L'insertion de profils de l'onboarding ne produit rien.** `OnboardingClient.tsx:153-168` insère les profils **sans le champ `active`** :

```ts
const profilRows = profils.map((p, i) => ({
  account_id: account.id, prenom: ..., classe: p.classe, metier,
  notes_allergies: ..., is_default: i === 0,
  // pas de `active`  ← contrairement à /api/profils qui pose active: true
}))
```

Or chaque compte inscrit depuis juin possède **exactement un** profil, portant le **prénom du parent**, `type_profil = 'adulte'`, `classe = NULL` — c'est-à-dire la ligne créée automatiquement à la création du compte, **pas** celle saisie à l'étape 3 de l'onboarding. Exemple : Cécile GERMAINY, compte créé 21:57:50, `cgu_accepted_at` à 21:59:51 (donc étape 3 atteinte et validée), et pourtant **un seul profil**, celui du trigger.

→ L'`insert` de l'étape 3 **échoue** (le `throw profErr` bloque alors le parent sur l'écran d'onboarding, avant le `router.push('/commander')`).

**À confirmer côté DB** (je n'ai pas la service_role, je n'ai pas pu tester l'insert) :

```sql
-- 1) valeur par défaut de profils.active
select column_name, column_default, is_nullable
  from information_schema.columns
 where table_name = 'profils' and column_name in ('active','is_default','type_profil');

-- 2) policies RLS INSERT sur profils
select policyname, cmd, qual, with_check from pg_policies where tablename = 'profils';

-- 3) contraintes / index uniques (piste : unicité sur is_default par compte+metier)
select conname, pg_get_constraintdef(oid) from pg_constraint
 where conrelid = 'profils'::regclass;
select indexname, indexdef from pg_indexes where tablename = 'profils';
```

**Fichiers concernés** : `src/app/onboarding/OnboardingClient.tsx` (insert sans `active`, erreur non diagnostiquée côté UI) · `src/app/commander/CommanderClient.tsx:221-226` (double garde `active` + `classe`) · policies/contraintes `profils`.

### A-12 · Autres constats fonctionnels

| Constat | Gravité | Détail |
|---|---|---|
| **Aucun écran « Mes commandes » côté parent** | **P1** | Une fois encaissée, la commande disparaît de `/panier` ET n'apparaît nulle part dans `/mon-espace`. Le parent n'a plus aucune trace de ce qu'il a commandé ni aucun moyen de l'annuler avant cutoff |
| **Le « dessert » promis n'existe pas dans la formule** | **P1 (produit)** | La carte Menu Panda annonce « plat + bubble tea + **dessert du jour** » (idem `HOWTO_STEPS`), mais `menu_formula_slots` ne contient que 2 slots (Plat principal, Boisson) et **les 4 articles DESSERT sont tous `coming_soon = true`**. Promesse commerciale non tenable en l'état |
| **CGU et CGV citent `pandasnack.vercel.app`** | **P1 (juridique)** | `cgu/page.tsx:13` et `cgv/page.tsx:21`. Le contrat désigne un domaine qui n'est pas celui du service (`pandasnack.online`) |
| **Mentions légales : « Site : vercel.com »** | P2 | `mentions-legales/page.tsx:39` — lien hébergeur affiché comme site de l'éditeur |
| **RLS en lecture à vérifier** | **À VÉRIFIER** | Avec le JWT de `lawalrachel@gmail.com` (compte **admin**), PostgREST renvoie **19 comptes, 22 profils, 12 commandes** — tout le parc. L'anon key seule ne renvoie rien (RLS active ✅). Je n'ai pas pu tester avec un compte **non-admin** : si une policy `is_admin` existe, tout va bien ; sinon c'est une fuite RGPD (e-mails parents, prénoms d'enfants, allergies). Test : `select policyname, cmd, qual from pg_policies where tablename in ('accounts','profils','orders');` |
| **Paiement : `/confirmation` marque `paid` sur simple paramètre d'URL** | **P1 (sécurité)** | `confirmation/page.tsx:27-33` passe une commande en `paid` à partir du seul `?session_id=` de l'URL, **sans vérification auprès de Stripe** et **sans filtre `account_id`**. Un parent qui abandonne le paiement Stripe mais revient sur l'URL de succès obtient une commande payée. Le webhook `stripe/webhook` existe : c'est lui qui doit faire foi |
| **`/api/cancel-order` : pattern d'erreur avalée** | P1 | Même absence de contrôle d'erreur sur les `update` wallet (`route.ts:70-78`) |
| **React error #418** | P2 | 1 mismatch d'hydratation constaté sur le parcours admin (non reproduit de façon déterministe) |

---

# B. IMPECCABLE — mode PRODUCT

Registre confirmé : `PRODUCT.md` → `register: product`. Cible « earned familiarity » (Linear / Stripe / Notion).
Méthode : mesures automatisées en page réelle (contraste calculé sur couleurs résolues, rects des cibles tactiles, `scrollWidth` à 360 px, arbre des titres, `alt`/`loading`, `tabIndex`, tokens vs valeurs en dur).

## Verdict Anti-Patterns — global

**PASS.** Aucun marqueur d'IA générique : pas de dégradé violet-bleu, pas de texte en gradient, pas de glassmorphisme, pas de hero-metric SaaS, pas de bordure latérale colorée. Palette chaude terracotta/crème assumée et cohérente, Fredoka + Nunito.

**Charte PS-01 : ✅ aucun résidu Fraunces ni Inter.** Les seules familles détectées en production sont `Fredoka` (display) et `Nunito` (texte), plus `ui-monospace` et `-apple-system` sur les écrans admin non tokenisés.

Réserves : modal auto à l'arrivée sur `/commander` (ban partagé « Modal as first thought »), grilles de cartes homogènes répétées trois fois sur `/commander`, et trois écrans admin encore hors charte (Tailwind brut).

## Health Score par page

| Page | A11y | Perf | Theming | Responsive | Anti-Patterns | Total /20 | Band |
|---|---|---|---|---|---|---|---|
| Accueil `/` | 3 | 3 | 4 | 3 | 4 | **17/20** | Good |
| `/commander` | **1** | 2 | 4 | 2 | 3 | **12/20** | Acceptable |
| `/panier` | 2 | 3 | 4 | 3 | 4 | **16/20** | Good |
| `/confirmation` | 3 | 3 | 3 | 4 | 4 | **17/20** | Good |
| `/admin/dashboard` | 3 | 4 | 4 | 3 | 4 | **18/20** | **Excellent** |
| `/admin/etiquettes` | 2 | 4 | **1** | 3 | 3 | **13/20** | Acceptable |

**Moyenne : 15,5/20** (baseline 14/05/2026 : 12,7/20).
Progression nette : **Admin Dashboard 6/20 → 18/20** — entièrement retokenisé (83 `var(--…)`, 0 gris Tailwind).

---

### Accueil `/` — 17/20

1. **[P1 · A11y]** CTA « Commander » : blanc sur `--accent` `#C85A3C` = **4,21:1** < 4,5 AA (WCAG 1.4.3). Même couple que celui déjà corrigé sur le bandeau en PS-04c, mais resté sur le bouton principal.
2. **[P2 · Responsive]** Liens de pied de page hauts de **16 px** (CGV, CGU, Mentions légales, Allergènes, Nos prix shop) — échec WCAG 2.5.8 (24×24 px minimum en AA).
3. **[P3 · Perf]** 4 images, aucune en `loading="lazy"`, les 4 servies à plus du double de leur taille d'affichage.

### `/commander` — 12/20 ⚠️ page la plus faible

1. **[P0 · A11y] Tout le parcours de commande est inaccessible au clavier.** Les 17 cartes produit détectées à l'écran sont des `div role="button"` **sans `tabIndex`** et sans classe `focus-ring` (`ProductCard.tsx:74-78`). Impossible de choisir un plat ou d'ajouter un article sans souris. WCAG 2.1.1 (A).
2. **[P1 · A11y]** **30 échecs de contraste**, tous sur le même couple blanc / `--accent` : « Choisir » ×8 (14 px), les puces de créneau, les badges « Bientôt disponible ! » (11 px), les deux bandeaux. Un seul token à corriger règle les 30.
3. **[P1 · Responsive]** **48 cibles tactiles < 44 px**, dont 25 boutons « ⓘ Allergènes » à **68×17 px** et des puces de carrousel à **7×7 px**. Sur mobile, l'accès aux allergènes — information de sécurité alimentaire — est quasi impraticable.

Aussi : aucun `aria-live` sur la page, donc le toast « Ajouté » et l'incrément du panier sont muets pour un lecteur d'écran ; 2 images sans `alt` ; 18 images sur 31 servies à plus du double de leur taille ; le H1 de la page est le badge métier « Pandattitude », pas un titre de page.

### `/panier` — 16/20

1. **[P1 · A11y]** **Trois `<h1>` sur la même page** : « Pandattitude », « Mon panier », « Panda Snack — Mon panier ». Structure de titres invalide, navigation par titres inutilisable.
2. **[P1 · A11y]** « Ma commande » (barre de paiement) en blanc sur `--accent` = 4,21:1 ; « Mon panier » (nav basse active) en `--accent` sur blanc à 11 px = 4,21:1.
3. **[P2 · Clarté]** La pastille « 0,00 € » en haut de page est le **solde wallet**, sans libellé. Placée juste sous le logo, au-dessus d'un panier à 15,00 €, elle se lit spontanément comme le total du panier. L'icône porte `alt=""`, un lecteur d'écran n'annonce que « 0,00 € ».

### `/confirmation` — 17/20

1. **[P2 · Theming]** Trois couleurs en dur hors tokens dans les styles inline : `#E8F5E9` (succès), `#FEF3E2` (rappel), `#FFFFFF`.
2. **[P2 · A11y]** « Voir mon panier » : blanc sur `--accent` = 4,21:1.
3. **[P3 · Perf]** 3 images, aucune `lazy`, toutes surdimensionnées.

Point positif : c'est la page la plus propre du parcours parent — hiérarchie H1/H2 correcte, un seul message par bloc, rappel du délai d'annulation bien placé.

### `/admin/dashboard` — 18/20 ✅ meilleure page

1. **[P2 · Responsive]** Tableau à 9 colonnes (DATE, N°, MÉTIER, PARENT, PROFILS, COMPOSITION, NOTE, PAIEMENT, HIST.) sans variante mobile : pas de débordement horizontal à 360 px, donc les colonnes s'écrasent au lieu de scroller.
2. **[P2 · A11y]** 4 échecs de contraste sur les puces de filtre actives (12 px blanc sur `--accent`) — texte petit, donc seuil 4,5 applicable.
3. **[P3 · A11y]** Tableau sans `<caption>` ni `scope` sur les en-têtes.

À conserver : tokenisation complète, densité assumée, `focus-ring` posé sur les actions, `min-h-11` respecté sur les boutons de période. C'est le modèle à répliquer sur les autres écrans admin.

### `/admin/etiquettes` — 13/20

1. **[P1 · Theming] Zéro design token.** 17 classes Tailwind brutes (`bg-blue-600`, `bg-gray-100`, `text-gray-700`). Îlot hors charte au milieu d'une app entièrement tokenisée. Même problème sur `/admin/liste` (14 occurrences) et `/admin/profils` (23 occurrences), tous à 0 `var(--…)`.
2. **[P1 · A11y]** Le champ date n'a **aucun label** (ni `<label for>`, ni `aria-label`).
3. **[P2 · Responsive]** 10 cibles < 44 px : puces de filtre métier à **28 px** de haut, lien « ← Retour dashboard » à **19 px**.

---

## Problèmes systémiques

- **Un seul token casse le contraste de toute l'app.** `--accent: #C85A3C` sur blanc = 4,21:1. Il porte tous les CTA primaires, les états sélectionnés et les badges, sur les 6 pages. PS-04c a résolu le cas du bandeau en changeant de couple (`--ink` / `--bg`, 12,65:1) ; la même décision reste à prendre pour les boutons. Assombrir `--accent` d'environ 6 % suffit à passer 4,5:1 sans changer l'identité.
- **Cibles tactiles sous la norme, partout.** 48 sur `/commander`, 10 sur `/admin/etiquettes`, 3 à 7 sur les autres. Le pied de page (16 px) et les puces de filtre admin (28 px) sont des motifs répétés.
- **Deux mondes visuels dans l'admin.** Dashboard = 83 tokens / 0 Tailwind brut. Étiquettes, Liste, Profils = 0 token / 54 classes Tailwind brutes cumulées.
- **Les erreurs Supabase ne sont pas contrôlées sur les chemins d'écriture utilisateur.** `cancel-order` (commande + wallet) et l'onboarding en sont les deux cas visibles, et ce sont exactement les deux fonctionnalités cassées en production.
- **Aucun `aria-live` dans toute l'application** : tous les retours dynamiques (toast d'ajout, badge panier, encaissement) sont silencieux pour un lecteur d'écran.

## Points positifs

- Parcours parent complet exécuté **sans une seule erreur console ni un seul 4xx/5xx**.
- Cutoff « veille 20h Martinique » : implémentation exacte, y compris le filtrage serveur des créneaux périmés.
- Garde `coming_soon` **doublée** : non cliquable côté UI *et* refusée côté serveur sur `/api/order-item` (POST et PATCH).
- Totaux justes de bout en bout : 10 € quel que soit le plat, sauce piment gratuite correctement portée par `notes` jusqu'à l'étiquette de production.
- Charte PS-01 (Fredoka) déployée proprement, aucun résidu Fraunces/Inter.
- Admin Dashboard : de 6/20 en mai à 18/20 aujourd'hui.
- `mark-paid` est un modèle de route correcte : service_role, erreurs vérifiées, idempotence, 404 explicite.

---

## Ordre de traitement suggéré (pour le prochain brief)

| Prio | Sujet | Où |
|---|---|---|
| **P0** | Annuler la commande de test `PS-20260924-0001` | SQL §A-9 |
| **P0** | Réactiver les 19 profils / réparer l'insert d'onboarding | `OnboardingClient.tsx`, RLS/contraintes `profils`, `CommanderClient.tsx:221-226` |
| **P0** | `cancel-order` : vérifier l'erreur, basculer en service_role comme `mark-paid` | `api/cancel-order/route.ts` |
| **P1** | `/confirmation` : ne plus marquer `paid` depuis l'URL, laisser faire le webhook Stripe | `confirmation/page.tsx:27-33` |
| **P1** | Vérifier les policies RLS de lecture avec un compte non-admin | Supabase |
| **P1** | Écran « Mes commandes » côté parent (commandes payées, annulation avant cutoff) | `mon-espace` |
| **P1** | Contraste `--accent` (règle ≈ 38 échecs d'un coup) | `globals.css:9` |
| **P1** | Cartes produit focusables au clavier (`tabIndex={0}` + `focus-ring` + `onKeyDown`) | `ProductCard.tsx:74-78` |
| **P1** | CGU/CGV : `pandasnack.vercel.app` → `pandasnack.online` | `cgu/page.tsx:13`, `cgv/page.tsx:21` |
| **P1** | Dessert du Menu Panda : soit le sortir de `coming_soon`, soit corriger le texte | DB + `banner.ts` |
| **P2** | Cibles tactiles ≥ 44 px (allergènes, pied de page, filtres admin) | transverse |
| **P2** | Tokeniser `/admin/etiquettes`, `/admin/liste`, `/admin/profils` | 3 fichiers |
| **P2** | Un seul `<h1>` par page | `panier`, `commander` |
| **P2** | Total de groupe de `/admin/liste` incluant les non-payées | `ListeClient.tsx` |

---

## Notes de méthode

- **L'extension Claude in Chrome n'a pas répondu** (injection de script en timeout sur toutes les URL, y compris `example.com`). Basculé sur **Playwright headless**, conformément à l'option principale du brief.
- Les scores Impeccable reposent sur des mesures exécutées dans la page rendue, pas sur une lecture du code seule. Le contraste est calculé sur les couleurs résolues avec remontée de l'arbre pour l'arrière-plan.
- Un relevé initial de contraste à 1,44:1 sur les puces de `/admin/etiquettes` **a été écarté** après vérification : couleurs exprimées en `lab()` par Tailwind v4, mal converties par ma sonde. `gray-700` sur `gray-100` et blanc sur `blue-600` passent tous deux AA. Le défaut réel sur cette page est l'absence de tokens, pas le contraste.
- Aucune modification de code n'a été apportée. La seule écriture en production est la commande de test §A-9, qui reste à annuler.
