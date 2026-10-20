// PS-22 — Edge Function push-pennylane : un ticket → facture fournisseur Pennylane avec pièce jointe.
// Secret PENNYLANE_JUSTIF_TOKEN (jamais côté client). Lecture ticket + photo via service_role.
// Idempotent : si pennylane_invoice_id déjà rempli → no-op. Perso → refusé (jamais envoyé).
// Déclenchée par la route admin /api/admin/tickets/[id]/pennylane (service_role).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1"

const PL = "https://app.pennylane.com/api/external/v2"

function plHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, Accept: "application/json" }
}

// Enveloppe l'image (JPEG/PNG) dans un PDF (Pennylane /supplier_invoices/import n'accepte que PDF).
async function imageToPdf(bytes: Uint8Array, contentType: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const img = contentType.includes("png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes)
  const maxW = 595, maxH = 842 // A4 points
  const scale = Math.min(maxW / img.width, maxH / img.height, 1)
  const w = img.width * scale, h = img.height * scale
  const page = pdf.addPage([maxW, maxH])
  page.drawImage(img, { x: (maxW - w) / 2, y: (maxH - h) / 2, width: w, height: h })
  return await pdf.save()
}

async function resolveSupplier(token: string, name: string): Promise<number | null> {
  // Le filtre name ne marche pas côté Pennylane → lister et filtrer localement (peu de fournisseurs).
  const target = name.trim().toLowerCase()
  let cursor: string | null = null
  for (let i = 0; i < 20; i++) {
    const url = new URL(`${PL}/suppliers`)
    url.searchParams.set("limit", "100")
    if (cursor) url.searchParams.set("cursor", cursor)
    const res = await fetch(url, { headers: plHeaders(token) })
    if (!res.ok) break
    const json = await res.json()
    const items = json.items || json.suppliers || []
    const hit = items.find((s: { id: number; name?: string }) => (s.name || "").trim().toLowerCase() === target)
    if (hit) return hit.id
    cursor = json.next_cursor || null
    if (!cursor) break
  }
  const res = await fetch(`${PL}/suppliers`, {
    method: "POST", headers: { ...plHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) return null
  const json = await res.json()
  return json.id ?? json.supplier?.id ?? null
}

Deno.serve(async (req) => {
  try {
    const token = Deno.env.get("PENNYLANE_JUSTIF_TOKEN")
    if (!token) return json({ error: "PENNYLANE_JUSTIF_TOKEN manquant" }, 500)
    const { ticket_id } = await req.json().catch(() => ({}))
    if (!ticket_id) return json({ error: "ticket_id requis" }, 400)

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
    const { data: t } = await admin.from("tickets_achats").select("*").eq("id", ticket_id).maybeSingle()
    if (!t) return json({ error: "Ticket introuvable" }, 404)
    if (t.source === "import_pennylane") return json({ error: "Ticket importé de Pennylane : jamais renvoyé." }, 400)  // PS-26c GARDE
    if (t.categorie === "perso") return json({ error: "Ticket perso : jamais envoyé à Pennylane." }, 400)
    if (t.pennylane_invoice_id) return json({ skipped: true, reason: "déjà envoyé", invoice_id: t.pennylane_invoice_id })
    if (!t.photo_path) return json({ error: "Aucune photo à joindre." }, 400)
    if (!t.fournisseur) return json({ error: "Fournisseur requis (sinon facture bloquée en brouillon)." }, 400)
    if (t.montant_ttc == null) return json({ error: "Montant TTC requis." }, 400)

    // 1) Fournisseur.
    const supplierId = await resolveSupplier(token, t.fournisseur)
    if (!supplierId) return await fail(admin, ticket_id, "Fournisseur Pennylane non résolu.")

    // 2) Photo → PDF → /file_attachments (multipart). Attendre avant l'import (sinon 404/409).
    const { data: blob, error: dlErr } = await admin.storage.from("tickets").download(t.photo_path)
    if (dlErr || !blob) return await fail(admin, ticket_id, "Photo illisible dans le bucket.")
    const ct = blob.type || "image/jpeg"
    if (!/jpe?g|png/i.test(ct)) {
      return await fail(admin, ticket_id, `Format ${ct} non supporté — reprends la photo en JPEG/PNG.`)
    }
    const pdfBytes = await imageToPdf(new Uint8Array(await blob.arrayBuffer()), ct)
    const filename = `ticket-${String(ticket_id).slice(0, 8)}.pdf`
    const form = new FormData()
    form.append("file", new Blob([pdfBytes], { type: "application/pdf" }), filename)
    form.append("filename", filename)
    const faRes = await fetch(`${PL}/file_attachments`, { method: "POST", headers: plHeaders(token), body: form })
    if (!faRes.ok) return await fail(admin, ticket_id, `file_attachments ${faRes.status}`)
    const fileId = (await faRes.json()).id
    await admin.from("tickets_achats").update({ pennylane_file_id: String(fileId) }).eq("id", ticket_id)
    await new Promise((r) => setTimeout(r, 3000))

    // 3) Import facture fournisseur (fournisseur + date + TTC + pièce). Pas d'invoice_lines (évite les
    //    enums de TVA incertains ; la ventilation TVA se fait dans Pennylane / avec Merlini).
    const label = `Ticket ${t.fournisseur}${t.date_ticket ? ` ${t.date_ticket}` : ""}`
    const invoiceNumber = `SNACK-${String(ticket_id).slice(0, 8)}`
    const body = {
      file_attachment_id: fileId, supplier_id: supplierId,
      date: t.date_ticket, deadline: t.date_ticket,
      invoice_number: invoiceNumber, currency: "EUR",
      amount: Number(t.montant_ttc), currency_amount: Number(t.montant_ttc), label,
    }
    const invRes = await fetch(`${PL}/supplier_invoices/import`, {
      method: "POST", headers: { ...plHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!invRes.ok) return await fail(admin, ticket_id, `supplier_invoices/import ${invRes.status}: ${(await invRes.text()).slice(0, 300)}`)
    const invoiceId = (await invRes.json()).id

    await admin.from("tickets_achats").update({
      pennylane_invoice_id: String(invoiceId), statut: "envoye", erreur: null,
    }).eq("id", ticket_id)
    return json({ ok: true, invoice_id: invoiceId, file_id: fileId, supplier_id: supplierId })
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fail(admin: any, id: string, msg: string) {
  await admin.from("tickets_achats").update({ statut: "a_verifier", erreur: msg }).eq("id", id)
  return json({ error: msg }, 502)
}
