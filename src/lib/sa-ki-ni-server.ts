// PS-14 — SA KI NI côté serveur : construit les données du hero temporel (parent) et le réglage
// admin. Lectures via service_role (routes authentifiées) ; la fenêtre et la dispo sont calculées
// avec la logique pure src/lib/sa-ki-ni.ts. Gating parent : compte pandattitude + enfant inscrit.
import { martiniqueToday } from "./caisse-date"
import { shouldShowSaKiNiHero, remainingPortions } from "./sa-ki-ni"

export interface SaKiNiHeroItem {
  catalog_item_id: string
  name: string
  image_url: string | null
  price_alone_cents: number | null
  allergens: string[]
  remaining: number
  can_menu: boolean
}
export interface SaKiNiHero {
  slot_id: string
  service_date: string
  menu_formula_id: string | null
  menu_price_cents: number | null
  sauce_topping_id: string | null
  items: SaKiNiHeroItem[]
}

/** Créneau pandattitude (hors devoirs) actif pour une date Martinique donnée. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pandattitudeSlot(admin: any, date: string) {
  const { data } = await admin.from("service_slots")
    .select("id, service_date, orders_cutoff_at")
    .eq("service_date", date).eq("target_source_group", "pandattitude").neq("day_type", "devoirs")
    .eq("active", true).limit(1).maybeSingle()
  return data as { id: string; service_date: string; orders_cutoff_at: string } | null
}

/**
 * Données du hero temporel Sa ki ni pour le parent connecté, ou null si rien à afficher
 * (pas pandattitude, pas d'enfant inscrit, hors fenêtre, ou aucune portion restante).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getSaKiNiHero(authed: any, admin: any): Promise<SaKiNiHero | null> {
  const { data: { user } } = await authed.auth.getUser()
  if (!user) return null
  const { data: account } = await admin.from("accounts").select("id, source_group").eq("auth_user_id", user.id).maybeSingle()
  if (!account || account.source_group !== "pandattitude") return null
  const { data: kids } = await admin.from("profils").select("id")
    .eq("account_id", account.id).eq("type_profil", "eleve").eq("active", true).limit(1)
  if (!kids || kids.length === 0) return null

  const slot = await pandattitudeSlot(admin, martiniqueToday())
  if (!slot) return null

  const { data: offersRaw } = await admin.from("sa_ki_ni_offres")
    .select("catalog_item_id, qty_ouverte, qty_vendue").eq("service_slot_id", slot.id)
  const offers = (offersRaw || []) as { catalog_item_id: string; qty_ouverte: number; qty_vendue: number }[]
  if (!shouldShowSaKiNiHero({ now: new Date(), cutoffAt: slot.orders_cutoff_at, serviceDate: slot.service_date, offers })) return null

  const avail = offers.filter((o) => remainingPortions(o) > 0)
  const { data: itemsRaw } = await admin.from("catalog_items")
    .select("id, name, image_url, price_alone_cents, allergens, sellable_in_menu, sa_ki_ni_ok")
    .in("id", avail.map((o) => o.catalog_item_id))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byId: Record<string, any> = Object.fromEntries((itemsRaw || []).map((i: { id: string }) => [i.id, i]))
  const { data: menu } = await admin.from("menu_formulas").select("id, price_cents").eq("code", "MENU_PANDA").eq("active", true).maybeSingle()
  const { data: sauce } = await admin.from("toppings").select("id").ilike("name", "%piment%").limit(1).maybeSingle()

  const items: SaKiNiHeroItem[] = avail
    .map((o) => {
      const c = byId[o.catalog_item_id]
      if (!c || !c.sa_ki_ni_ok) return null
      return {
        catalog_item_id: o.catalog_item_id, name: c.name, image_url: c.image_url,
        price_alone_cents: c.price_alone_cents, allergens: c.allergens || [],
        remaining: remainingPortions(o), can_menu: !!c.sellable_in_menu,
      }
    })
    .filter((x): x is SaKiNiHeroItem => x !== null)
  if (items.length === 0) return null

  return {
    slot_id: slot.id, service_date: slot.service_date,
    menu_formula_id: menu?.id || null, menu_price_cents: menu?.price_cents || null,
    sauce_topping_id: sauce?.id || null, items,
  }
}

export interface SaKiNiAdminPlat {
  catalog_item_id: string
  name: string
  qty_ouverte: number
  qty_vendue: number
}
export interface SaKiNiAdminPanel {
  slot_id: string | null
  service_date: string
  plats: SaKiNiAdminPlat[]
}

/**
 * Panneau admin « Sa ki ni » pour une date : plats sa_ki_ni_ok présents dans les commandes du jour
 * (payées ou à payer sur place) + l'état des offres (portions ouvertes / prises).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getSaKiNiAdminPanel(admin: any, date: string): Promise<SaKiNiAdminPanel> {
  const slot = await pandattitudeSlot(admin, date)
  if (!slot) return { slot_id: null, service_date: date, plats: [] }

  // Commandes du jour à préparer (payées, ou à payer sur place), hors annulées.
  const { data: orders } = await admin.from("orders")
    .select("id, status, payment_method, order_items(catalog_item_id)")
    .eq("service_slot_id", slot.id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const kept = (orders || []).filter((o: any) =>
    o.status === "paid" || (o.status === "pending_payment" && o.payment_method === "on_site"))
  const catIds = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const o of kept) for (const it of (o.order_items || [])) if (it.catalog_item_id) catIds.add(it.catalog_item_id)

  if (catIds.size === 0) return { slot_id: slot.id, service_date: date, plats: [] }

  const { data: cats } = await admin.from("catalog_items")
    .select("id, name, sa_ki_ni_ok").in("id", Array.from(catIds)).eq("sa_ki_ni_ok", true)
  const { data: offersRaw } = await admin.from("sa_ki_ni_offres")
    .select("catalog_item_id, qty_ouverte, qty_vendue").eq("service_slot_id", slot.id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const offerBy: Record<string, any> = Object.fromEntries((offersRaw || []).map((o: { catalog_item_id: string }) => [o.catalog_item_id, o]))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plats: SaKiNiAdminPlat[] = (cats || []).map((c: any) => ({
    catalog_item_id: c.id, name: c.name,
    qty_ouverte: offerBy[c.id]?.qty_ouverte || 0,
    qty_vendue: offerBy[c.id]?.qty_vendue || 0,
  })).sort((a: SaKiNiAdminPlat, b: SaKiNiAdminPlat) => a.name.localeCompare(b.name))

  return { slot_id: slot.id, service_date: date, plats }
}
