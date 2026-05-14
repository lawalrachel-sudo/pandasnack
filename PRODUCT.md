# PRODUCT.md — Panda Snack

## Produit
Panda Snack est une PWA de commande de repas (bentos, snacks, boissons) pour
écoles privées et livraison petit-déjeuner entreprises en Martinique.
Les parents commandent à l'avance pour leurs enfants, paient via wallet
prépayé ou carte bancaire, et la cuisine reçoit chaque matin les listes de
production + étiquettes HACCP imprimables.

## Mode
**Product** (pas Brand).
L'interface sert le produit. Cible : *earned familiarity* type Linear /
Stripe / Notion. La forme ne doit pas concurrencer le fond. Pas de
storytelling visuel, pas d'effets de marque envahissants. La confiance se
gagne par la clarté et la régularité, pas par la séduction.

## register
product

## Users

### 1. Parent commanditaire (école) — utilisateur principal
- Commande pour ses enfants (1 à 4 profils par compte typiquement).
- Paie via wallet prépayé (avec paliers bonus 5%/10%/15%) ou directement CB.
- Mobile-first : commande dans le bus, à la queue, le soir tard. Lumière dehors.
- Pas de temps. Pas de patience pour les erreurs. Veut savoir : "Ma fille a
  bien sa pasta box demain ? Combien il me reste sur le wallet ?".
- Inquiétude latente : la responsabilité de nourrir son enfant. Tout doute
  ou friction = défection.

### 2. Admin Rachel — opératrice du système
- Gère commandes, catalogue, planning, étiquettes, dashboard depuis ordi.
- Doit voir d'un coup d'œil : combien de menus à préparer demain, par
  enfant, par classe, par école.
- Imprime tous les jours les listes cuisine + étiquettes HACCP collées sur
  les sachets.
- Pas une utilisatrice tech. Apprend par usage, pas par doc.

### 3. Cuisine
- N'utilise pas l'interface directement.
- Reçoit le papier imprimé par Rachel : récap production (combien de
  bentos, combien de sandwichs, garnitures détaillées) + planche d'étiquettes
  Office Star OS43425 (105×57 mm, 10 par A4).
- Étiquettes doivent être lisibles à 50cm dans une cuisine pressée
  (typo dense mais nette, contraste fort, hiérarchie évidente).

### 4. Futur — Panda Guest (à préparer)
- Adulte qui commande son petit-déj bureau (sandwich garni > viennoiseries).
- Livraison matin sur lieu de travail Martinique (CTM, Fort-de-France).
- Différent registre visuel à préparer (cf DESIGN.md skin Panda Guest),
  même cœur produit.

## Parcours critique
1. **Onboarding** : création compte → ajout profils enfants (prénom + classe)
2. **Catalogue jour** : sélection plats/menus pour 1 enfant, 1 jour, à la fois
3. **Panier multi-jours multi-profils** : agrégat de toutes les commandes en
   attente, sélection des jours à payer maintenant, GRAND TOTAL visible
4. **Checkout** : wallet (gratuit) ou Stripe (CB) ou mix
5. **Confirmation** : ticket immédiat, mail de confirmation, retour /panier
6. **Espace perso** : historique commandes, soldes wallet, gestion profils,
   gestion compte

## Ce qui compte

- **Confiance immédiate.** Les parents confient l'alimentation de leurs
  enfants. Tout doit communiquer "système solide, opéré par des humains
  attentifs".
- **Clarté mobile.** Gros doigts, soleil, peu de temps. Cibles tactiles
  généreuses (≥44px), contraste sans hésitation, hiérarchie typographique
  qui guide sans annoter.
- **Zéro friction panier → checkout.** Un parent qui hésite ne paie pas.
  Wallet visible en permanence. Cutoff (heure limite veille 20h) clair sans
  être anxiogène.
- **Admin lisible sans formation.** Rachel n'a pas de manuel. L'interface
  admin doit être autopédagogique. Étiquettes : zéro réglage manuel, ça
  imprime à l'A4 cible directement.
- **Cohérence parcours.** Le parent doit retrouver la même langue, les
  mêmes affordances, les mêmes feedbacks d'écran en écran. Pas de surprise.

## Ce qui ne compte pas

- **Effet wow marketing.** On n'est pas une campagne. On est une cantine
  numérique.
- **Animations complexes.** Une animation = un signifiant fonctionnel (un
  loader, un check de validation). Pas de plaisir gratuit.
- **Dark mode.** Aucune valeur ajoutée pour le contexte (commande matin,
  lumière du jour). Charge de maintenance évitée.
- **Personnalisation thème.** Une seule identité par métier (École /
  Pandattitude / Panda Guest), choisie côté serveur.
- **Branding lourd.** Le logo Panda est présent mais ne domine pas. Le
  produit (la commande) est le héros.

## Anti-références (à ne pas imiter)
- Stripe Checkout : trop neutre, manque de personnalité familiale.
- DoorDash / Uber Eats : trop bruyants, trop d'options, trop de promo.
- Notion : trop pro adulte, distance émotionnelle.

## Références de cap (à imiter dans l'esprit)
- **Linear** pour la rigueur typographique et l'absence de fioritures.
- **Stripe Dashboard** pour la lisibilité tabulaire admin.
- **Cabane (boulangerie premium)** pour la chaleur sans tomber dans le
  cliché "fait maison".
