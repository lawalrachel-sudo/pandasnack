import Link from "next/link"
import { createServerSupabase } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { NavbarServer } from "@/components/NavbarServer"

export const dynamic = "force-dynamic"

function fmtPrice(c: number): string {
  return `${(c / 100).toFixed(2).replace(".", ",")} €`
}

function fmtDate(d: string): string {
  const dt = new Date(d + "T12:00:00")
  const wd = dt.toLocaleDateString("fr-FR", { weekday: "long" })
  const dm = dt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
  return `${wd.charAt(0).toUpperCase() + wd.slice(1)} ${dm}`
}

interface OrderItem {
  id: string
  notes: string
  quantity: number
  line_total_cents: number
  takeaway: boolean
  profil_id: string | null
  prenom_libre: string | null
  profils: { prenom: string } | null
}

interface PlanningOrder {
  id: string
  order_number: string
  status: string
  total_cents: number
  service_slots: {
    service_date: string
    day_type: string
    delivery_points: { name: string } | null
  }
  order_items: OrderItem[]
}

export default async function PlanningPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth")

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: account } = await (supabase as any)
    .from("accounts")
    .select("id")
    .eq("auth_user_id", user.id)
    .single()
  if (!account) redirect("/onboarding")

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ordersRaw } = await (supabase as any)
    .from("orders")
    .select(`
      id, order_number, status, total_cents,
      service_slots!inner(service_date, day_type, delivery_points(name)),
      order_items(id, notes, quantity, line_total_cents, takeaway, profil_id, prenom_libre, profils(prenom))
    `)
    .eq("account_id", account.id)
    .eq("status", "pending_payment")

  const orders = (ordersRaw || []) as PlanningOrder[]

  // Group by service_date (utilise service_slots.service_date, jamais orders.pickup_date)
  const byDate: Record<string, { deliveryName: string | null; orders: PlanningOrder[] }> = {}
  for (const o of orders) {
    const date = o.service_slots?.service_date || "sans-date"
    if (!byDate[date]) {
      byDate[date] = {
        deliveryName: o.service_slots?.delivery_points?.name || null,
        orders: [],
      }
    }
    byDate[date].orders.push(o)
  }
  const sortedDates = Object.keys(byDate).sort()

  return (
    <div className="min-h-screen pb-28 max-w-lg mx-auto">
      <NavbarServer />

      <div className="px-4 pt-6">
        <h1 className="text-xl font-bold mb-1" style={{ color: "var(--ink)" }}>Planning</h1>
        <p className="text-xs mb-5" style={{ color: "var(--ink-soft)" }}>
          Tes commandes en attente de paiement
        </p>

        {sortedDates.length === 0 ? (
          <div className="text-center py-12 rounded-xl" style={{ background: "var(--bg-alt)" }}>
            <div className="text-4xl mb-3">📅</div>
            <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
              Aucune commande en attente
            </p>
            <p className="text-xs mt-1 mb-4" style={{ color: "var(--ink-soft)" }}>
              Retrouve le menu pour composer un repas.
            </p>
            <Link
              href="/commander"
              className="inline-block px-6 py-3 rounded-xl font-semibold text-white text-sm"
              style={{ background: "var(--accent)" }}
            >
              Voir le menu
            </Link>
          </div>
        ) : (
          <div className="space-y-5">
            {sortedDates.map(date => {
              const { deliveryName, orders: dayOrders } = byDate[date]

              // Group items par profil (key = profil_id ou prenom_libre)
              const byProfil: Record<string, { prenom: string; items: OrderItem[] }> = {}
              for (const o of dayOrders) {
                for (const item of o.order_items || []) {
                  const key = item.profil_id || `__libre_${item.prenom_libre || "anon"}`
                  const prenom = item.profils?.prenom || item.prenom_libre || "—"
                  if (!byProfil[key]) byProfil[key] = { prenom, items: [] }
                  byProfil[key].items.push(item)
                }
              }
              const profilGroups = Object.values(byProfil)

              const dayTotal = dayOrders.reduce((s, o) => s + (o.total_cents || 0), 0)

              return (
                <div
                  key={date}
                  className="rounded-xl border overflow-hidden"
                  style={{ borderColor: "var(--border)", background: "var(--card)" }}
                >
                  {/* Header jour */}
                  <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)", background: "var(--bg-alt)" }}>
                    <p className="font-bold text-sm" style={{ color: "var(--ink)" }}>
                      📅 {fmtDate(date)}
                    </p>
                    {deliveryName && (
                      <p className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>
                        📍 {deliveryName}
                      </p>
                    )}
                  </div>

                  {/* Items groupés par profil */}
                  <div className="px-4 py-3 space-y-3">
                    {profilGroups.map(({ prenom, items }, gi) => (
                      <div key={gi}>
                        <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--accent)" }}>
                          🧒 {prenom}
                        </p>
                        <div className="space-y-1.5 pl-3 border-l-2" style={{ borderColor: "var(--border)" }}>
                          {items.map(it => (
                            <div key={it.id} className="flex justify-between items-start text-sm gap-2">
                              <span className="flex-1 min-w-0">
                                {it.notes}
                                {it.takeaway && (
                                  <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "var(--bg-alt)", color: "var(--ink-soft)" }}>
                                    À emporter
                                  </span>
                                )}
                              </span>
                              <span className="font-semibold whitespace-nowrap shrink-0" style={{ color: "var(--ink)" }}>
                                {fmtPrice(it.line_total_cents)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}

                    {/* Footer jour : statut + total */}
                    <div className="pt-2 border-t flex items-center justify-between gap-2" style={{ borderColor: "var(--border)" }}>
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                        style={{ background: "#FEF3E2", color: "#B45309" }}
                      >
                        🟡 En attente de paiement
                      </span>
                      <span className="text-sm font-bold" style={{ color: "var(--accent)" }}>
                        {fmtPrice(dayTotal)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
