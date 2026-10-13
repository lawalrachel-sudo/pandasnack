// PS-22 — Edge Function match-pennylane (quotidienne) : rapproche les factures envoyées payées
// carte LTC avec la transaction bancaire correspondante (montant exact au centime, date ±5 j).
// UN SEUL candidat → POST /supplier_invoices/{id}/matched_transactions (204) → statut 'rapproche'.
// 0 ou 2+ candidats → statut 'a_verifier', rien forcé. Secret PENNYLANE_JUSTIF_TOKEN.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

const PL = "https://app.pennylane.com/api/external/v2"
function plHeaders(token: string) { return { Authorization: `Bearer ${token}`, Accept: "application/json" } }

function addDays(iso: string, d: number): string {
  const dt = new Date(iso + "T12:00:00Z"); dt.setUTCDate(dt.getUTCDate() + d)
  return dt.toISOString().slice(0, 10)
}

// Transactions non lettrées dans la fenêtre [date-5 ; date+5] dont |montant| == montant_ttc (au centime).
async function candidates(token: string, dateIso: string, montant: number) {
  const filter = JSON.stringify([
    { field: "date", operator: "gteq", value: addDays(dateIso, -5) },
    { field: "date", operator: "lteq", value: addDays(dateIso, 5) },
  ])
  const out: { id: number; amount: number; outstanding: number }[] = []
  let cursor: string | null = null
  for (let i = 0; i < 20; i++) {
    const url = new URL(`${PL}/transactions`)
    url.searchParams.set("limit", "100"); url.searchParams.set("filter", filter)
    if (cursor) url.searchParams.set("cursor", cursor)
    const res = await fetch(url, { headers: plHeaders(token) })
    if (!res.ok) break
    const json = await res.json()
    for (const tx of (json.items || [])) {
      const amt = Math.abs(Number(tx.amount))
      const outstanding = Math.abs(Number(tx.outstanding_balance ?? tx.amount))
      if (Math.round(amt * 100) === Math.round(montant * 100)) out.push({ id: tx.id, amount: amt, outstanding })
    }
    cursor = json.next_cursor || null
    if (!cursor) break
  }
  // Transaction sans pièce ⇔ outstanding_balance = |amount| (skill pennylane-ltc §2).
  return out.filter((t) => Math.round(t.outstanding * 100) === Math.round(t.amount * 100))
}

Deno.serve(async () => {
  const token = Deno.env.get("PENNYLANE_JUSTIF_TOKEN")
  if (!token) return json({ error: "PENNYLANE_JUSTIF_TOKEN manquant" }, 500)
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)

  const { data: tickets } = await admin.from("tickets_achats")
    .select("id, date_ticket, montant_ttc, pennylane_invoice_id")
    .eq("statut", "envoye").eq("moyen_paiement", "carte_ltc")
    .not("pennylane_invoice_id", "is", null)
  let rapproches = 0, aVerifier = 0
  for (const t of (tickets || [])) {
    if (!t.date_ticket || t.montant_ttc == null) { aVerifier++; continue }
    const cands = await candidates(token, t.date_ticket, Number(t.montant_ttc))
    if (cands.length === 1) {
      const res = await fetch(`${PL}/supplier_invoices/${t.pennylane_invoice_id}/matched_transactions`, {
        method: "POST", headers: { ...plHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({ transaction_id: cands[0].id }),
      })
      if (res.status === 204) {
        await admin.from("tickets_achats").update({ statut: "rapproche", pennylane_tx_id: String(cands[0].id), erreur: null }).eq("id", t.id)
        rapproches++
      } else {
        await admin.from("tickets_achats").update({ statut: "a_verifier", erreur: `match ${res.status}` }).eq("id", t.id)
        aVerifier++
      }
    } else {
      await admin.from("tickets_achats").update({ statut: "a_verifier", erreur: `${cands.length} candidat(s)` }).eq("id", t.id)
      aVerifier++
    }
  }
  return json({ ok: true, traites: (tickets || []).length, rapproches, aVerifier })
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}
