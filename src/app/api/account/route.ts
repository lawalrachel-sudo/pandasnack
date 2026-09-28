import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase as createClient } from "@/lib/supabase/server"
import { isValidIban, normalizeIban } from "@/lib/iban"

export async function PATCH(req: NextRequest) {
  try {
    const supabase: any = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 })

    const body = await req.json()

    // Update telephone
    if (body.phone !== undefined) {
      const { error } = await supabase.from("accounts").update({ telephone: body.phone }).eq("auth_user_id", user.id)
      if (error) return NextResponse.json({ error: "Erreur mise à jour téléphone" }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    // Update nom_compte
    if (body.nom_compte !== undefined) {
      const { error } = await supabase.from("accounts").update({ nom_compte: body.nom_compte }).eq("auth_user_id", user.id)
      if (error) return NextResponse.json({ error: "Erreur mise à jour nom" }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    // PS-09a — IBAN de remboursement (propriétaire du compte uniquement, via auth_user_id).
    if (body.iban !== undefined || body.iban_titulaire !== undefined) {
      const iban = normalizeIban(String(body.iban || ""))
      if (iban && !isValidIban(iban)) {
        return NextResponse.json({ error: "IBAN invalide" }, { status: 400 })
      }
      const titulaire = typeof body.iban_titulaire === "string" ? body.iban_titulaire.trim() : null
      const { error } = await supabase.from("accounts")
        .update({ iban: iban || null, iban_titulaire: titulaire || null })
        .eq("auth_user_id", user.id)
      if (error) return NextResponse.json({ error: "Erreur mise à jour IBAN" }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    // Update password
    if (body.newPassword) {
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: user.email, password: body.oldPassword })
      if (signInErr) return NextResponse.json({ error: "Ancien mot de passe incorrect" }, { status: 400 })
      const { error: updateErr } = await supabase.auth.updateUser({ password: body.newPassword })
      if (updateErr) return NextResponse.json({ error: "Erreur changement de mot de passe" }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Rien à mettre à jour" }, { status: 400 })
  } catch (err) {
    console.error("Account update error:", err)
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const supabase: any = await createClient()
    await supabase.auth.signOut()
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Erreur déconnexion" }, { status: 500 })
  }
}
