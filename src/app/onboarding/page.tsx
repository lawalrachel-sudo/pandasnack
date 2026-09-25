import { createServerSupabase } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { OnboardingClient } from "./OnboardingClient"
import { destinationApresAuth } from "@/lib/profil-gate"

export const dynamic = "force-dynamic"

export default async function OnboardingPage() {
  const supabase = await createServerSupabase()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/auth")

  // PS-05c — on ne renvoie vers /commander que si le parent a VRAIMENT un profil enfant
  // commandable. L'ancien test portait sur `source_group`, que le trigger de création de
  // compte remplit systématiquement : l'onboarding était donc inaccessible, y compris
  // pour qui y venait à la main.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: account } = await (supabase as any)
    .from("accounts")
    .select("id, source_group, telephone, cgu_accepted_at, profils(active, classe, metier, type_profil, archived_at)")
    .eq("auth_user_id", user.id)
    .maybeSingle()

  if (account && destinationApresAuth(account, account.profils || [], "/commander") === "/commander") {
    redirect("/commander")
  }

  // Données user pour pré-remplir
  const prenom = user.user_metadata?.prenom || ""
  const nom = user.user_metadata?.nom || ""
  const email = user.email || ""

  return (
    <OnboardingClient
      userId={user.id}
      prenom={prenom}
      nom={nom}
      email={email}
    />
  )
}
