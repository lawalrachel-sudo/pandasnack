import { createClient } from "@supabase/supabase-js"
import { itemLine, type SvcItem } from "@/lib/service-du-jour"

// PS-06a §5 — Notification « nouvelle commande » vers le secrétariat, via Resend (REST, pas de SDK).
//
// Appelée aux trois points où une commande entre en production : webhook Stripe (paid),
// débit wallet (paid), création on_site. Contrats :
//   - un seul e-mail par commande (colonne orders.notified_at, posée AVANT l'envoi pour
//     éviter la course entre le webhook et le retour client),
//   - jamais bloquante : toute erreur est loggée en console.error, la commande continue,
//   - désactivée proprement si RESEND_API_KEY manque (log explicite, pas d'erreur).

const NOTIFY_FROM = "Panda Snack <team@pandasnack.online>"
const NOTIFY_TO_DEFAULT = "secretariat@pandattitude.com"

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key || key === "xxx") return null
  return createClient(url, key)
}

function euros(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`
}
function jourCourt(iso: string | null | undefined): string {
  if (!iso) return ""
  return new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" })
}
function paiementLabel(paymentMethod: string | null, paidAt: string | null): string {
  if (paymentMethod === "on_site") return paidAt ? "sur place (encaissé)" : "sur place à encaisser"
  if (paymentMethod === "wallet") return "wallet"
  if (paymentMethod === "wallet_card" || paymentMethod === "card") return "CB"
  return paymentMethod || "—"
}

/**
 * Envoie l'e-mail « nouvelle commande » pour `orderId`, une seule fois.
 * Ne lève jamais : retourne un statut informatif pour les tests/logs.
 */
export async function notifyNewOrder(orderId: string): Promise<{ sent: boolean; reason?: string }> {
  try {
    const db = admin()
    if (!db) { console.error("[notify] SUPABASE_SERVICE_ROLE_KEY manquant — notification ignorée"); return { sent: false, reason: "no_db" } }

    const apiKey = process.env.RESEND_API_KEY
    const to = process.env.NOTIFY_EMAIL || NOTIFY_TO_DEFAULT

    // Clé absente : on ne consomme PAS notified_at (sinon la commande ne pourrait jamais
    // être notifiée une fois la clé posée). Log explicite, non bloquant.
    if (!apiKey) {
      console.error("[notify] notification désactivée : RESEND_API_KEY manquante")
      return { sent: false, reason: "no_api_key" }
    }

    // Anti-doublon : on pose notified_at AVANT l'envoi, conditionné à .is(null).
    // Si 0 ligne touchée, un autre chemin a déjà notifié → on s'arrête (course webhook/client).
    const { data: claimed, error: claimErr } = await db
      .from("orders")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", orderId)
      .is("notified_at", null)
      .select("id")
    if (claimErr) { console.error("[notify] claim notified_at:", claimErr); return { sent: false, reason: "claim_error" } }
    if (!claimed || claimed.length === 0) return { sent: false, reason: "already_notified" }

    // Contenu : enfant, articles + options, paiement, montant, lien admin.
    const { data: order } = await db
      .from("orders")
      .select(`
        id, order_number, total_cents, payment_method, paid_at,
        service_slots(service_date),
        accounts(nom_compte),
        order_items(quantity, notes, menu_formulas(name), catalog_items(name, sku, category_id), profils(prenom))
      `)
      .eq("id", orderId)
      .single()
    if (!order) { console.error("[notify] commande introuvable:", orderId); return { sent: false, reason: "order_not_found" } }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = order as any
    const items = (o.order_items || [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const child = items.find((it: any) => it.profils)?.profils?.prenom || o.accounts?.nom_compte || "?"
    const serviceDate: string | null = o.service_slots?.service_date || null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lignes = items.map((it: any) => {
      const svc: SvcItem = {
        notes: it.notes, menu_formula_name: it.menu_formulas?.name || null,
        catalog_item_name: it.catalog_items?.name || null, catalog_item_sku: it.catalog_items?.sku || null,
        category_id: it.catalog_items?.category_id || null, qty: it.quantity || 1,
      }
      const { label, options } = itemLine(svc)
      return `${(it.quantity || 1) > 1 ? `${it.quantity}× ` : ""}${label}${options.length ? ` — ${options.join(", ")}` : ""}`
    })

    const subject = `🥘 Nouvelle commande ${o.order_number} · ${jourCourt(serviceDate)} · ${child}`
    const paiement = paiementLabel(o.payment_method, o.paid_at)
    const adminLink = `https://pandasnack.online/admin/dashboard`
    const html = `
      <div style="font-family:system-ui,sans-serif;color:#2b2018;max-width:480px">
        <h2 style="margin:0 0 8px">Nouvelle commande — ${child}</h2>
        <p style="margin:0 0 4px;color:#6b5742">${o.order_number} · ${jourCourt(serviceDate)}</p>
        <ul style="padding-left:18px">${lignes.map((l: string) => `<li>${l}</li>`).join("")}</ul>
        <p style="margin:8px 0"><strong>Paiement :</strong> ${paiement}<br><strong>Montant :</strong> ${euros(o.total_cents || 0)}</p>
        <p><a href="${adminLink}" style="color:#C85A3C">Ouvrir le service du jour →</a></p>
      </div>`
    const text = `Nouvelle commande ${o.order_number} · ${jourCourt(serviceDate)} · ${child}\n`
      + lignes.map((l: string) => `- ${l}`).join("\n")
      + `\nPaiement : ${paiement}\nMontant : ${euros(o.total_cents || 0)}\n${adminLink}`

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: NOTIFY_FROM, to: [to], subject, html, text }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      console.error(`[notify] Resend ${res.status}:`, body.slice(0, 300))
      return { sent: false, reason: `resend_${res.status}` }
    }
    return { sent: true }
  } catch (err) {
    // Jamais bloquant pour la commande.
    console.error("[notify] exception:", err)
    return { sent: false, reason: "exception" }
  }
}
