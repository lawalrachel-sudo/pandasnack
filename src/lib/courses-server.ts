// PS-28 — Cocher / décocher une ligne de courses (serveur, service_role).
// Cocher : statut achete (+ réassort Bubble Tea via courses_mark_achete), coche_at, et
// courses_catalogue.dernier_achat = aujourd'hui Martinique (valeur précédente gardée pour l'annulation).
import { martiniqueToday } from "./caisse-date"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

export async function cocherCourse(admin: Admin, id: string): Promise<{ error?: string }> {
  const { data: l } = await admin.from("courses_items").select("catalogue_id, coche_at").eq("id", id).maybeSingle()
  const { error } = await admin.rpc("courses_mark_achete", { p_id: id })
  if (error) return { error: error.message }
  if (l?.coche_at) return {}  // déjà coché : ne pas écraser la date d'avant
  const patch: Record<string, unknown> = { coche_at: new Date().toISOString() }
  if (l?.catalogue_id) {
    const { data: c } = await admin.from("courses_catalogue").select("dernier_achat").eq("id", l.catalogue_id).maybeSingle()
    patch.dernier_achat_avant = c?.dernier_achat ?? null
    await admin.from("courses_catalogue").update({ dernier_achat: martiniqueToday(), updated_at: new Date().toISOString() }).eq("id", l.catalogue_id)
  }
  await admin.from("courses_items").update(patch).eq("id", id)
  return {}
}

/** Annule le cochage : coche_at effacé, dernier_achat du catalogue restauré. Le statut est géré par l'appelant. */
export async function annulerCoche(admin: Admin, id: string): Promise<void> {
  const { data: l } = await admin.from("courses_items").select("catalogue_id, coche_at, dernier_achat_avant").eq("id", id).maybeSingle()
  if (!l?.coche_at) return
  if (l.catalogue_id) {
    await admin.from("courses_catalogue").update({ dernier_achat: l.dernier_achat_avant ?? null, updated_at: new Date().toISOString() }).eq("id", l.catalogue_id)
  }
  await admin.from("courses_items").update({ coche_at: null, dernier_achat_avant: null }).eq("id", id)
}
