import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin, SOURCE_LABELS } from "@/lib/auth/admin"

export const dynamic = "force-dynamic"

// GET /api/admin/labels?service_date=YYYY-MM-DD&source_group=...
// T7 — 1 étiquette = 1 commande (groupée par order_id, pas par item).
// Affiche tous les items dans la même étiquette + allergènes consolidés + DLC min.

interface LabelItem {
  name: string
}

interface LabelOut {
  order_number: string
  metier: string
  service_date_short: string
  profil_prenom: string  // joint par "·" si plusieurs profils dans la commande
  profil_classe: string | null  // unique si tous identiques, sinon null
  items: LabelItem[]
  allergens: string[]
  prepared_at: string
  dlc_at: string
  dlc_hours: number  // min des items (sécurité)
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
  mollusques: "Mollusques", fruits_coque: "Fruits à coque", fruits_a_coque: "Fruits à coque",
  sulfites: "Sulfites", lupin: "Lupin",
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
      accounts!inner(source_group, nom_compte),
      order_items(
        id, profil_id, prenom_libre, formula_choices, topping_ids, takeaway, notes,
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

  // prepared_at = service_date 08:00 Martinique (UTC-4) → ISO
  const preparedAt = new Date(`${serviceDate}T08:00:00-04:00`).toISOString()
  const serviceDateShort = fmtDateShort(serviceDate)

  const labels: LabelOut[] = []
  for (const o of (data || [])) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const order = o as any
    const items = order.order_items || []
    if (items.length === 0) continue

    // Profils : ensemble unique de prénoms + classes
    const prenomSet = new Set<string>()
    const classeSet = new Set<string>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const it of items as any[]) {
      const prenom = it.profils?.prenom || it.prenom_libre || order.accounts?.nom_compte
      if (prenom) prenomSet.add(prenom)
      if (it.profils?.classe) classeSet.add(it.profils.classe)
    }
    const profilPrenom = prenomSet.size > 0 ? Array.from(prenomSet).join(" · ") : "—"
    const profilClasse = classeSet.size === 1 ? Array.from(classeSet)[0] : null

    // Items : 1 entrée par order_item, libellé court (formula → plat OR catalog item name)
    const labelItems: LabelItem[] = items.map((it: { menu_formulas?: { name?: string }; catalog_items?: { name?: string }; notes?: string }) => {
      const formulaName = it.menu_formulas?.name
      const platName = it.catalog_items?.name
      // Pour formula : "Menu Panda — Steak de légumes"
      // Pour solo : juste le nom catalog
      // Pour formula sans plat : juste le formula name
      let name: string
      if (formulaName && platName) name = `${formulaName} — ${platName}`
      else if (formulaName) name = formulaName
      else if (platName) name = platName
      else name = (it.notes || "Article").slice(0, 60)
      return { name }
    })

    // Allergènes consolidés (unique)
    const allergensSet = new Set<string>()
    for (const it of items) {
      const arr: string[] = it.catalog_items?.allergens || []
      for (const a of arr) allergensSet.add(ALLERGEN_LABELS[a] || a)
    }
    const allergens = Array.from(allergensSet)

    // DLC min : sécurité alimentaire — la plus courte gagne
    let dlcMin = 24
    for (const it of items) {
      const h = it.menu_formulas?.dlc_hours ?? it.catalog_items?.dlc_hours
      if (typeof h === "number" && h > 0) dlcMin = Math.min(dlcMin, h)
    }
    const dlcAt = new Date(new Date(preparedAt).getTime() + dlcMin * 3600 * 1000).toISOString()

    const sg = order.accounts?.source_group
    const metier = (SOURCE_LABELS[sg] || sg || "").toUpperCase()

    labels.push({
      order_number: order.order_number,
      metier,
      service_date_short: serviceDateShort,
      profil_prenom: profilPrenom,
      profil_classe: profilClasse,
      items: labelItems,
      allergens,
      prepared_at: preparedAt,
      dlc_at: dlcAt,
      dlc_hours: dlcMin,
    })
  }

  // Tri par order_number ASC
  labels.sort((a, b) => a.order_number.localeCompare(b.order_number))

  return NextResponse.json({ service_date: serviceDate, labels })
}
