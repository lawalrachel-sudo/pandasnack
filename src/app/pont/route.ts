import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { verifyPontToken, pickPontAccount, childrenToCreate, type PontAccount } from "@/lib/pont-pandapp"

export const dynamic = "force-dynamic"

// PS-15 — Réception du pont PandApp → Panda Snack. GET /pont?t=<jeton>
// Vérifie le jeton (signature + exp), rejette le rejeu (jti), résout/crée le compte (+ wallet +
// profils enfants du payload), ouvre la session (magic link consommé côté serveur, aucun mot de
// passe en code) → /commander. Un seul compte Snack par famille. Jamais un compte non concerné.

const ERROR_HTML = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Lien expiré</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#FBF5EC,#F0E6D6);font-family:-apple-system,system-ui,sans-serif;color:#3A2A20}
.card{background:#fff;border:1px solid #E8D6BF;border-radius:18px;padding:28px 24px;max-width:360px;margin:16px;text-align:center;box-shadow:0 20px 60px rgba(200,90,60,.12)}
h1{font-size:20px;margin:0 0 8px}p{font-size:14px;color:#6B5742;line-height:1.5;margin:0 0 18px}
a{display:inline-block;background:#C85A3C;color:#fff;text-decoration:none;border-radius:12px;padding:12px 20px;font-weight:700}</style>
</head><body><div class="card"><h1>Lien expiré</h1>
<p>Repasse par PandApp pour ouvrir Panda Snack, ou connecte-toi.</p><a href="/auth">Se connecter</a></div></body></html>`

function errorPage() {
  return new NextResponse(ERROR_HTML, { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function logPont(admin: any, famille_id: string | null, account_id: string | null, action: string, detail?: string) {
  try { await admin.from("pont_log").insert({ famille_id, account_id, action, detail: detail || null }) } catch { /* non bloquant */ }
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t")
  const secret = process.env.PANDA_SNACK_PONT_SECRET

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return errorPage()

  const verified = await verifyPontToken(token, secret)
  if (!verified.ok) {
    await logPont(admin, null, null, "refused", verified.reason)
    return errorPage()
  }
  const p = verified.payload
  const email = p.email.trim().toLowerCase()

  // jti à usage unique : insertion = réservation. Conflit → rejeu → refus.
  const { error: jtiErr } = await admin.from("pont_jetons_consommes").insert({ jti: p.jti, famille_id: p.familleId })
  if (jtiErr) {
    await logPont(admin, p.familleId, null, "refused", "jti_replay")
    return errorPage()
  }

  // Résolution : famille_id → e-mail du payload.
  const sel = "id, email, pandapp_famille_id, archived_at"
  const { data: byFamilleRow } = await admin.from("accounts").select(sel).eq("pandapp_famille_id", p.familleId).maybeSingle()
  const { data: byEmail } = await admin.from("accounts").select(sel).ilike("email", email)
  const picked = pickPontAccount(byFamilleRow || null, byEmail || [])

  let account: PontAccount | null = picked.account
  let action: "matched" | "created" | "conflict" = picked.action === "conflict" ? "conflict" : "matched"

  if (!account) {
    // Création au premier appui : createUser déclenche handle_new_user (account + wallet 0 + profil parent).
    const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, email_confirm: true })
    if (cErr || !created?.user) {
      const { data: again } = await admin.from("accounts").select(sel).ilike("email", email).maybeSingle()
      if (!again) { await logPont(admin, p.familleId, null, "refused", "create_failed"); return errorPage() }
      account = again
      action = "matched"
    } else {
      const { data: acc } = await admin.from("accounts").select(sel).eq("auth_user_id", created.user.id).maybeSingle()
      account = acc || null
      action = "created"
      if (!account) { await logPont(admin, p.familleId, null, "refused", "account_missing"); return errorPage() }
    }
  }

  if (!account) return errorPage()

  // Lien famille posé s'il est vide.
  if (!account.pandapp_famille_id) {
    await admin.from("accounts").update({ pandapp_famille_id: p.familleId }).eq("id", account.id)
  }

  // Profils enfants manquants (jamais de modification/suppression d'un profil existant).
  const { data: existing } = await admin.from("profils").select("prenom, nom").eq("account_id", account.id)
  const toCreate = childrenToCreate(existing || [], p.enfants || [])
  if (toCreate.length > 0) {
    await admin.from("profils").insert(toCreate.map((e) => ({
      account_id: account!.id, prenom: e.prenom, nom: e.nom,
      metier: "pandattitude", type_profil: "eleve", active: true, is_default: false,
    })))
    if (account.archived_at) await admin.from("accounts").update({ archived_at: null }).eq("id", account.id)
  }

  await logPont(admin, p.familleId, account.id, action, `tags=${(p.tags || []).join("|")};enfants+${toCreate.length}`)

  // Session : magic link consommé côté serveur (aucun mot de passe en code), comme PS-13.
  if (!account.email) return errorPage()
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email: account.email })
  const tokenHash: string | undefined = linkData?.properties?.hashed_token
  if (linkErr || !tokenHash) return NextResponse.redirect(new URL("/auth", req.url))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ssr: any = await createServerSupabase()
  const { error: vErr } = await ssr.auth.verifyOtp({ token_hash: tokenHash, type: "email" })
  if (vErr) return NextResponse.redirect(new URL("/auth", req.url))

  return NextResponse.redirect(new URL("/commander", req.url))
}
