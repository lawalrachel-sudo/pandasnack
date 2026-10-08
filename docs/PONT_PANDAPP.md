# Pont PandApp → Panda Snack — contrat du jeton (PS-15)

Depuis PandApp (`/famille`), la tuile panda cuisto signe un jeton et redirige vers :

```
https://pandasnack.online/auth/pandapp?t=<jeton>
```

Côté Panda Snack : réception uniquement (PS-15). Côté PandApp : émission (brief **B-PA-26**, plus tard).
**Un seul compte Snack par famille.**

## Format du jeton

```
"v1." + base64url(payload) + "." + base64url(HMAC-SHA256(secret, "v1." + base64url(payload)))
```

- `base64url` = base64 standard sans padding, `+`→`-`, `/`→`_`.
- **signing input** = la chaîne littérale `"v1." + base64url(payload)`.
- La signature porte sur cette chaîne reçue. **Ni PandApp ni Snack ne re-sérialisent le JSON pour
  vérifier** : Snack recalcule le HMAC sur le `base64url(payload)` reçu tel quel. La sérialisation
  canonique ci-dessous ne sert qu'à *fabriquer* le jeton.
- Secret partagé : variable d'environnement **`PANDA_SNACK_PONT_SECRET`** (32 octets), posée en
  Production dans les deux projets Vercel. Jamais dans le code ni les logs.

## Payload

```jsonc
{
  "v": 1,
  "famille_id": "<id famille PandApp>",
  "email_titulaire": "<email du parent titulaire>",
  "email_parent2": "<email parent 2> | null",
  "email_connecte": "<email du parent connecté dans PandApp>",
  "enfants": [ { "profil_id": "<id>", "prenom": "<prénom>", "nom": "<nom>" } ],
  "iat": <epoch secondes>,
  "exp": <epoch secondes = iat + 300>,
  "nonce": "<aléatoire, à usage unique>"
}
```

Sérialisation canonique (ordre des clés figé, JSON compact, UTF-8) pour fabriquer le jeton :
`v, famille_id, email_titulaire, email_parent2, email_connecte, enfants, iat, exp, nonce` ;
chaque enfant : `profil_id, prenom, nom`.

## Contrôles côté Snack (réception)

1. Signature valide (comparaison à temps constant), `v = 1`.
2. `exp > maintenant` (sinon « expiré »).
3. `iat <= maintenant + 60 s` (tolérance d'horloge ; sinon « iat futur »).
4. `nonce` jamais vu (table `pont_nonces`) → enregistré à usage unique.

Échec → page sobre « Lien expiré ou invalide — reviens depuis PandApp ou connecte-toi » + lien
`/auth`, sans détail technique (journal `refused`).

Résolution du compte : `pandapp_famille_id` → `email_titulaire` → `email_parent2`. Plusieurs
comptes → celui du titulaire, rien fusionné (journal `conflict`). Trouvé → pose `pandapp_famille_id`
s'il est vide (journal `matched`). Rien → création (account `pandattitude` + wallet 0 + profils
enfants) au premier appui (journal `created`). Les profils existants ne sont jamais modifiés ni
supprimés ; un compte non concerné n'est jamais touché.

## Vecteur de test (pour que PandApp vérifie sa signature à l'identique)

- Secret : `test-secret`
- Payload (JSON canonique exact) :

```json
{"v":1,"famille_id":"fam_demo","email_titulaire":"titulaire@example.com","email_parent2":null,"email_connecte":"titulaire@example.com","enfants":[{"profil_id":"p1","prenom":"Lou","nom":"Martin"}],"iat":1760000000,"exp":1760000300,"nonce":"nonce-demo-1"}
```

- Jeton attendu :

```
v1.eyJ2IjoxLCJmYW1pbGxlX2lkIjoiZmFtX2RlbW8iLCJlbWFpbF90aXR1bGFpcmUiOiJ0aXR1bGFpcmVAZXhhbXBsZS5jb20iLCJlbWFpbF9wYXJlbnQyIjpudWxsLCJlbWFpbF9jb25uZWN0ZSI6InRpdHVsYWlyZUBleGFtcGxlLmNvbSIsImVuZmFudHMiOlt7InByb2ZpbF9pZCI6InAxIiwicHJlbm9tIjoiTG91Iiwibm9tIjoiTWFydGluIn1dLCJpYXQiOjE3NjAwMDAwMDAsImV4cCI6MTc2MDAwMDMwMCwibm9uY2UiOiJub25jZS1kZW1vLTEifQ.HaFFGoO_1Rv3MlYvtEpvcw7hguSEpPNLnoco4ep1kqI
```

La vérification de ce jeton ignore `exp`/`iat` (vecteur figé) : seule la **signature** doit
correspondre octet pour octet.
