// PS-19 — Rattachement des Panda Bonus émis par email (avant l'existence du compte Snack).
// À la connexion/activation d'un compte et à la création de ses profils, on rattache les bonus
// 'emis' dont email_famille = email normalisé du compte et profil_id est null : on pose famille_id
// et, si un profil au prénom correspond (normalisé, insensible casse/accents), profil_id.
// AUCUN match approximatif. Idempotent (ne touche que les bonus profil_id null).
import { prenomMatch } from "./panda-bonus"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function attachPendingBonus(admin: any, account: { id: string; email: string | null; pandapp_famille_id?: string | null }) {
  const email = (account?.email || "").trim().toLowerCase()
  if (!admin || !email) return
  const { data: pending } = await admin.from("panda_bonus")
    .select("id, prenom_enfant")
    .eq("email_famille", email).is("profil_id", null).eq("statut", "emis")
  if (!pending || pending.length === 0) return

  const { data: profils } = await admin.from("profils")
    .select("id, prenom").eq("account_id", account.id).is("archived_at", null)
  const list = (profils || []) as Array<{ id: string; prenom: string | null }>

  for (const b of pending as Array<{ id: string; prenom_enfant: string | null }>) {
    const match = list.find((p) => prenomMatch(p.prenom, b.prenom_enfant))
    await admin.from("panda_bonus")
      .update({ famille_id: account.pandapp_famille_id || null, profil_id: match?.id || null })
      .eq("id", b.id)
  }
}
