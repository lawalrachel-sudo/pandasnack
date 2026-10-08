# Pont PandApp → Panda Snack — contrat du jeton (PS-15)

**Source de vérité : `pandattitude-3d/src/lib/pandaSnack.ts`** (fonctions `signerJetonPont` /
`verifierJetonPont`, en prod depuis le 08/10). Côté Panda Snack, `src/lib/pont-pandapp.ts` transpose
`verifierJetonPont` à l'identique (Web Crypto) — **ne pas réinventer** : toute évolution du format
part de `pandaSnack.ts`.

Depuis PandApp (`/famille` → `/api/famille/panda-snack` quand `PONT_PANDA_SNACK_ACTIF = true`), la
tuile panda cuisto signe un jeton et redirige vers :

```
https://pandasnack.online/pont?t=<jeton>
```

## Format du jeton

```
jeton = base64url(JSON payload) + "." + base64url(HMAC-SHA256(secret, corps))
corps = base64url(JSON payload)   // le 1er segment ; pas de préfixe de version
```

- `base64url` = base64 standard sans padding, `+`→`-`, `/`→`_`.
- Le HMAC porte sur `corps` (la chaîne base64url du payload). La vérification recalcule le HMAC
  sur le `corps` **reçu tel quel** — aucune re-sérialisation du JSON. Comparaison à temps constant.
- Validité **60 s** (`exp`). `jti` à usage unique, contrôlé côté Snack.
- Secret partagé : **`PANDA_SNACK_PONT_SECRET`** (32 octets), posé en Production sur les deux
  projets Vercel (`pandasnack` + `pandattitude-3d`). Jamais dans le code ni les logs.

## Payload

```jsonc
{
  "email": "<email famille, minuscules>",
  "familleId": "<id famille PandApp>",
  "enfants": [ { "prenom": "<prénom>", "nom": "<nom>" } ],
  "tags": ["stages"],          // 'stages' → la famille voit la carte stage même hors eleves_connus
  "exp": <epoch secondes>,      // iat + 60
  "jti": "<uuid, usage unique>"
}
```

## Contrôles côté Snack (réception, `GET /pont?t=`)

1. Signature valide (temps constant) sur le `corps` reçu.
2. `exp >= maintenant` (sinon « expiré »).
3. `jti` jamais vu (table `pont_jetons_consommes`, insert-or-reject) → usage unique.

Échec → page sobre « Lien expiré — repasse par PandApp ou connecte-toi » + lien `/auth`, sans
détail technique (journal `refused`).

Résolution du compte : `pandapp_famille_id` → e-mail du payload. Plusieurs comptes distincts →
celui de l'e-mail, rien fusionné (journal `conflict`). Trouvé → pose `pandapp_famille_id` s'il est
vide (journal `matched`). Rien → création (`createUser` → trigger `handle_new_user` = account
`pandattitude` + wallet 0 + profil parent, puis profils enfants du payload) au premier appui
(journal `created`). Un profil existant n'est jamais modifié ni supprimé ; un compte non concerné
(ex. élève autonome) n'est jamais touché. Session : magic link consommé côté serveur → `/commander`.

## Vecteur de test (pour vérifier la signature à l'identique)

- Secret : `test-secret`
- Payload (JSON exact) :

```json
{"email":"famille@example.com","familleId":"fam_demo","enfants":[{"prenom":"Lou","nom":"Martin"}],"tags":["stages"],"exp":1760000300,"jti":"jti-demo-1"}
```

- Jeton attendu :

```
eyJlbWFpbCI6ImZhbWlsbGVAZXhhbXBsZS5jb20iLCJmYW1pbGxlSWQiOiJmYW1fZGVtbyIsImVuZmFudHMiOlt7InByZW5vbSI6IkxvdSIsIm5vbSI6Ik1hcnRpbiJ9XSwidGFncyI6WyJzdGFnZXMiXSwiZXhwIjoxNzYwMDAwMzAwLCJqdGkiOiJqdGktZGVtby0xIn0.QNQ48f3XasbrQ25mwgl7HiAf7mhHw6BXSdt2w3iBxjg
```

La vérification de ce vecteur ignore `exp` (figé) : seule la **signature** doit correspondre
octet pour octet (`buildPontToken("test-secret", payload)` doit rendre ce jeton).
