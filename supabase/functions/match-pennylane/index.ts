// PS-22 (+ corrections Cowork 13/10) — Edge Function match-pennylane (quotidienne) : rapproche les
// factures envoyées payées carte LTC avec la transaction bancaire (montant exact au centime, ±5 j).
// Règles (miroir de src/lib/pennylane-rules.ts) : 1 candidat → matched_transactions (204) →
// 'rapproche' ; 2+ → 'a_verifier' tout de suite ; 0 ET aujourd'hui ≤ date_ticket+7 j → reste 'envoye'
// (retenté) ; 0 après J+7 → 'a_verifier'. Anti double rattachement : une transaction assignée ce
// passage ne resert pas (tickets traités du plus ancien au plus récent). Secret PENNYLANE_JUSTIF_TOKEN.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

const PL = "https://app.pennylane.com/api/external/v2"
const FENETRE_J = 7
function plHeaders(token: string) { return { Authorization: `Bearer ${token}`, Accept: "application/json" } }

function addDays(iso: string, d: number): string {
  const dt = new Date(iso + "T12:00:00Z"); dt.setUTCDate(dt.getUTCDate() + d)
  return dt.toISOString().slice(0, 10)
}
function joursEcoules(dateTicket: string, today: string): number {
  return Math.floor((new Date(today + "T12:00:00Z").getTime() - new Date(dateTicket + "T12:00:00Z").getTime()) / 86400000)
}
function todayMartinique(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Martinique" }).format(new Date())
}

// Transactions non lettrées dans [date-5 ; date+5] dont |montant| == montant_ttc (au centime).
async function candidates(token: string, dateIso: string, montant: number) {
  const filter = JSON.stringify([
    { field: "date", operator: "gteq", value: addDays(dateIso, -5) },
    { field: "date", operator: "lteq", value: addDays(dateIso, 5) },
  ])
  const out: { id: number }[] = []
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
      // Transaction sans pièce ⇔ outstanding_balance = |amount| (skill pennylane-ltc §2).
      if (Math.round(amt * 100) === Math.round(montant * 100) && Math.round(outstanding * 100) === Math.round(amt * 100)) {
        out.push({ id: tx.id })
      }
    }
    cursor = json.next_cursor || null
    if (!cursor) break
  }
  return out
}

Deno.serve(async () => {
  const token = Deno.env.get("PENNYLANE_JUSTIF_TOKEN")
  if (!token) return json({ error: "PENNYLANE_JUSTIF_TOKEN manquant" }, 500)
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
  const today = todayMartinique()

  // Du plus ancien au plus récent (anti double rattachement déterministe).
  const { data: tickets } = await admin.from("tickets_achats")
    .select("id, date_ticket, montant_ttc, pennylane_invoice_id")
    .eq("statut", "envoye").eq("moyen_paiement", "carte_ltc")
    .not("pennylane_invoice_id", "is", null)
    .order("date_ticket", { ascending: true })

  const utilises = new Set<number>()
  let rapproches = 0, aVerifier = 0, enAttente = 0
  for (const t of (tickets || [])) {
    if (!t.date_ticket || t.montant_ttc == null) {
      await admin.from("tickets_achats").update({ statut: "a_verifier", erreur: "date ou montant manquant" }).eq("id", t.id)
      aVerifier++; continue
    }
    const cands = (await candidates(token, t.date_ticket, Number(t.montant_ttc))).filter((c) => !utilises.has(c.id))

    if (cands.length >= 2) {
      await admin.from("tickets_achats").update({ statut: "a_verifier", erreur: `${cands.length} candidats` }).eq("id", t.id)
      aVerifier++
    } else if (cands.length === 0) {
      if (joursEcoules(t.date_ticket, today) <= FENETRE_J) { enAttente++ /* reste 'envoye' */ }
      else {
        await admin.from("tickets_achats").update({ statut: "a_verifier", erreur: `aucune transaction après ${FENETRE_J} j` }).eq("id", t.id)
        aVerifier++
      }
    } else {
      const txId = cands[0].id
      utilises.add(txId) // réservé pour ce passage, même si l'API échoue
      const res = await fetch(`${PL}/supplier_invoices/${t.pennylane_invoice_id}/matched_transactions`, {
        method: "POST", headers: { ...plHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({ transaction_id: txId }),
      })
      if (res.status === 204) {
        await admin.from("tickets_achats").update({ statut: "rapproche", pennylane_tx_id: String(txId), erreur: null }).eq("id", t.id)
        rapproches++
      } else {
        await admin.from("tickets_achats").update({ statut: "a_verifier", erreur: `match ${res.status}` }).eq("id", t.id)
        aVerifier++
      }
    }
  }
  return json({ ok: true, today, traites: (tickets || []).length, rapproches, aVerifier, enAttente })
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}
