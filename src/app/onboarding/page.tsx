import { createServerSupabase } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { OnboardingClient } from "./OnboardingClient"

export const dynamic = "force-dynamic"

export default async function OnboardingPage() {
  const supabase = await createServerSupabase()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/auth")

  // Si le compte existe déjà, on va direct à /commander
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: account } = await (supabase as any)
    .from("accounts")
    .select("id")
    .eq("auth_user_id", user.id)
    .single()

  if (account) redirect("/commander")

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
