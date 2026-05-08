import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin, SOURCE_LABELS } from "@/lib/auth/admin"

export const dynamic = "force-dynamic"

// GET /api/admin/labels?service_date=YYYY-MM-DD&source_group=...
// Retourne 1 étiquette par profil par item facturé sur une commande paid donnée date.

interface LabelOut {
  order_number: string
  metier: string
  service_date_short: string
  piece_index: number
  piece_total: number
  profil_prenom: string
  profil_classe: string | null
  produit_principal: string
  composition: string[]
  allergens: string[]
  prepared_at: string
  dlc_at: string
  dlc_hours: number
}

function fmtDateShort(d: string): string {
  const dt = new Date(d + "T12:00:00")
  const wd = dt.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "")
  const dm = dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })
  return `${wd.charAt(0).toUpperCase() + wd.slice(1)} ${dm}`
}

const ALLERGEN_LABELS: Record<string, string> = {
  gluten: "Gluten", lait: "Lactose", lait_traces: "Lactose (traces)", lactose: "Lactose",
  oeuf: "Œuf", arachide: "Arachide", soja: "Soja", celeri: "Céleri",
  moutarde: "Moutarde", sesame: "Sésame", poisson: "Poisson", crustaces: "Crustacés",
  mollusques: "Mollusques", fruits_coque: "Fruits à coque", sulfites: "Sulfites", lupin: "Lupin",
}

export async function GET(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServerSupabase()
  const auth = await requireAdmin(supabase)
  if ("error" in auth) return auth.error

  const sp = req.nextUrl.searchParams
  const serviceDate = sp.get("service_date")
  if (!serviceDate) {
    return NextResponse.json({ error: "service_date requis (YYYY-MM-DD)" }, { status: 400 })
  }
  const sourceGroup = sp.get("source_group")

  let query = supabase
    .from("orders")
    .select(`
      id, order_number, status,
      service_slots!inner(service_date, target_source_group),
      accounts!inner(source_group),
      order_items(
        id, profil_id, prenom_libre, formula_choices, topping_ids, takeaway,
        menu_formulas(name, dlc_hours),
        catalog_items(name, sku, allergens, dlc_hours),
        profils(prenom, classe)
      )
    `)
    .eq("service_slots.service_date", serviceDate)
    .eq("status", "paid")

  if (sourceGroup) query = query.eq("accounts.source_group", sourceGroup)

  const { data, error } = await query
  if (error) {
    console.error("[admin/labels]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Toppings ref pour composition lisible
  const { data: toppings } = await supabase.from("toppings").select("id, name")
  const topNames: Record<string, string> = Object.fromEntries(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (toppings || []).map((t: any) => [t.id, t.name])
  )

  // prepared_at = service_date 08:00 Martinique (UTC-4) → ISO
  const preparedAt = new Date(`${serviceDate}T08:00:00-04:00`).toISOString()
  const serviceDateShort = fmtDateShort(serviceDate)

  const labels: LabelOut[] = []
  for (const o of (data || [])) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const order = o as any
    const items = order.order_items || []
    const pieceTotal = items.length
    let pieceIndex = 0
    for (const it of items) {
      pieceIndex += 1
      const profilPrenom = it.profils?.prenom || it.prenom_libre || "—"
      const profilClasse = it.profils?.classe || null
      const formulaName = it.menu_formulas?.name
      const platName = it.catalog_items?.name
      const produitPrincipal = (formulaName || platName || "Article").toUpperCase()

      // Composition : plat (si formula) + toppings résolus
      const composition: string[] = []
      if (formulaName && platName) composition.push(platName)
      const tids: string[] = it.topping_ids || []
      for (const tid of tids) {
        const n = topNames[tid]
        if (n) composition.push(n)
      }

      const allergensRaw: string[] = it.catalog_items?.allergens || []
      const allergens = allergensRaw.map(a => ALLERGEN_LABELS[a] || a)

      const dlcHours = it.menu_formulas?.dlc_hours ?? it.catalog_items?.dlc_hours ?? 24
      const dlcAt = new Date(new Date(preparedAt).getTime() + dlcHours * 3600 * 1000).toISOString()

      const sg = order.accounts?.source_group
      const metier = (SOURCE_LABELS[sg] || sg || "").toUpperCase()

      labels.push({
        order_number: order.order_number,
        metier,
        service_date_short: serviceDateShort,
        piece_index: pieceIndex,
        piece_total: pieceTotal,
        profil_prenom: profilPrenom,
        profil_classe: profilClasse,
        produit_principal: produitPrincipal,
        composition,
        allergens,
        prepared_at: preparedAt,
        dlc_at: dlcAt,
        dlc_hours: dlcHours,
      })
    }
  }

  // Tri : order_number ASC puis piece_index
  labels.sort((a, b) => {
    if (a.order_number !== b.order_number) return a.order_number.localeCompare(b.order_number)
    return a.piece_index - b.piece_index
  })

  return NextResponse.json({ service_date: serviceDate, labels })
}
