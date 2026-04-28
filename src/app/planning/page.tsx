import Link from "next/link"
import { createServerSupabase } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Navbar } from "@/components/Navbar"

export const dynamic = "force-dynamic"

export default async function PlanningPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth")

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: account } = await (supabase as any)
    .from("accounts")
    .select("id, nom_compte")
    .eq("auth_user_id", user.id)
    .single()
  if (!account) redirect("/onboarding")

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: wallet } = await (supabase as any)
    .from("wallets")
    .select("balance_cents")
    .eq("account_id", account.id)
    .single()

  return (
    <div className="min-h-screen pb-20 max-w-lg mx-auto">
      <Navbar walletBalance={wallet?.balance_cents} familyName={account.nom_compte} />

      <div className="px-4 pt-8">
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">📅</div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--ink)" }}>
            Planning
          </h1>
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            Vue calendrier de tes commandes par enfant et par jour — bientôt disponible
          </p>
        </div>

        <div className="rounded-xl p-4 mt-8" style={{ background: "var(--bg-alt)" }}>
          <p className="text-sm mb-3" style={{ color: "var(--ink)" }}>
            En attendant, retrouve tes commandes dans Mon panier.
          </p>
          <Link
            href="/panier"
            className="block w-full h-11 rounded-lg font-semibold text-white text-center leading-[2.75rem]"
            style={{ background: "var(--accent)" }}
          >
            Ouvrir Mon panier →
          </Link>
        </div>
      </div>
    </div>
  )
}
