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

// PS-06d — garde anti-rattrapage : au-delà de ce délai entre la création de la commande et
// l'appel de notifyNewOrder, on considère que c'est un rattrapage silencieux (code déployé
// après coup, ré-entrée tardive) et on N'ENVOIE PAS. En flux normal, la notif part quelques
// secondes après la création (on_site) ou le paiement (wallet/Stripe), très en deçà du seuil.
export const NOTIFY_MAX_AGE_MS = 2 * 60 * 60 * 1000 // 2 heures

// Heure Martinique (UTC-4, sans heure d'été) d'un created_at, format « JJ/MM à HHhMM ».
export function formatCreatedAtMartinique(iso: string): string {
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "America/Martinique", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d)
  const g = (t: string) => parts.find((p) => p.type === t)?.value || ""
  return `${g("day")}/${g("month")} à ${g("hour")}h${g("minute")}`
}

// Jour de service (service_date, déjà une date calendaire) en « jeu. 26/09 ».
export function formatServiceDay(serviceDate: string | null | undefined): string {
  if (!serviceDate) return ""
  return new Date(serviceDate + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" })
}

// La commande est-elle trop ancienne pour être notifiée (rattrapage) ?
// `ref` = instant de l'ÉVÉNEMENT déclencheur (paiement / confirmation), pas la création.
export function isCatchUp(ref: string | null | undefined, now: number = Date.now()): boolean {
  if (!ref) return false
  const t = new Date(ref).getTime()
  if (!Number.isFinite(t)) return false
  return now - t > NOTIFY_MAX_AGE_MS
}

// PS-06d-b §2 — ligne « Payée le … » / « Confirmée sur place le … » ajoutée quand l'événement
// (paiement wallet/Stripe = paidAt, ou confirmation on_site = eventAt) diffère de la création
// de plus d'une minute. Sinon rien (panier payé dans la foulée).
export function buildEventLine(
  createdAt: string | null | undefined,
  paidAt: string | null | undefined,
  eventAt: string | null | undefined
): string {
  const created = createdAt ? new Date(createdAt).getTime() : NaN
  const different = (iso: string | null | undefined) => {
    if (!iso || !Number.isFinite(created)) return false
    return Math.abs(new Date(iso).getTime() - created) >= 60 * 1000
  }
  if (paidAt && different(paidAt)) return `Payée le ${formatCreatedAtMartinique(paidAt)}`
  if (!paidAt && eventAt && different(eventAt)) return `Confirmée sur place le ${formatCreatedAtMartinique(eventAt)}`
  return ""
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key || key === "xxx") return null
  return createClient(url, key)
}

function euros(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`
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
export async function notifyNewOrder(
  orderId: string,
  opts: { eventAt?: string } = {}
): Promise<{ sent: boolean; reason?: string }> {
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
        id, order_number, total_cents, payment_method, paid_at, created_at,
        service_slots(service_date),
        accounts(nom_compte),
        order_items(quantity, notes, menu_formulas(name), catalog_items(name, sku, category_id), profils(prenom))
      `)
      .eq("id", orderId)
      .single()
    if (!order) { console.error("[notify] commande introuvable:", orderId); return { sent: false, reason: "order_not_found" } }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = order as any

    // PS-06d-b — garde anti-rattrapage mesurée depuis l'ÉVÉNEMENT déclencheur, pas depuis
    // created_at : une commande est créée dès le panier (draft) et peut n'être payée que des
    // heures plus tard. Référence = paid_at (wallet/Stripe) OU eventAt (transition on_site,
    // transmis par checkout-onsite) OU, à défaut, created_at.
    const eventAt: string = o.paid_at || opts.eventAt || o.created_at
    if (isCatchUp(eventAt)) {
      console.error(`[notify] rattrapage évité : commande ${o.order_number}, événement ${eventAt}, non notifiée`)
      return { sent: false, reason: "catch_up" }
    }
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

    // PS-06d §3 — objet : prénom de l'enfant + jour de service.
    const serviceDay = formatServiceDay(serviceDate)
    const subject = `🥘 ${child} · ${serviceDay}`
    // Heure de PASSAGE de la commande (created_at) en clair, heure Martinique — jamais l'heure d'envoi.
    const passeeLe = `Commande passée le ${formatCreatedAtMartinique(o.created_at)} (heure Martinique)`
    // PS-06d-b §2 — quand le paiement/la confirmation a lieu à un moment DIFFÉRENT de la
    // création (panier posé plus tôt), on l'indique en plus.
    const eventLine = buildEventLine(o.created_at, o.paid_at, opts.eventAt)
    const paiement = paiementLabel(o.payment_method, o.paid_at)
    const adminLink = `https://pandasnack.online/admin/dashboard`
    const html = `
      <div style="font-family:system-ui,sans-serif;color:#2b2018;max-width:480px">
        <h2 style="margin:0 0 8px">Nouvelle commande — ${child}</h2>
        <p style="margin:0 0 2px"><strong>Jour de service :</strong> ${serviceDay}</p>
        <p style="margin:0 0 8px;color:#6b5742">${passeeLe}${eventLine ? `<br>${eventLine}` : ""} · ${o.order_number}</p>
        <ul style="padding-left:18px">${lignes.map((l: string) => `<li>${l}</li>`).join("")}</ul>
        <p style="margin:8px 0"><strong>Paiement :</strong> ${paiement}<br><strong>Montant :</strong> ${euros(o.total_cents || 0)}</p>
        <p><a href="${adminLink}" style="color:#C85A3C">Ouvrir le service du jour →</a></p>
      </div>`
    const text = `Nouvelle commande — ${child}\n`
      + `Jour de service : ${serviceDay}\n`
      + `${passeeLe}\n${eventLine ? eventLine + "\n" : ""}${o.order_number}\n\n`
      + lignes.map((l: string) => `- ${l}`).join("\n")
      + `\n\nPaiement : ${paiement}\nMontant : ${euros(o.total_cents || 0)}\n${adminLink}`

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
