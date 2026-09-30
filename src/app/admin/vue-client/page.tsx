import { requireAdminPage } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { VueClientClient } from "./VueClientClient"

export const dynamic = "force-dynamic"

// PS-13 — « Vue client » : choisir un compte TEST et entrer dans l'appli client.
export default async function VueClientPage() {
  await requireAdminPage()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  const { data } = admin
    ? await admin.from("accounts")
        .select("id, email, nom_compte, profils(prenom, type_profil, active, created_at)")
        .eq("is_test", true)
    : { data: [] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accounts = (data || []).map((a: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enfant = (a.profils || []).filter((p: any) => p.type_profil === "eleve" && p.active)
      .sort((x: any, y: any) => (x.created_at || "").localeCompare(y.created_at || ""))[0]
    return { id: a.id, email: a.email, nom_compte: a.nom_compte, prenom: enfant?.prenom || null }
  })
  return <VueClientClient accounts={accounts} />
}
