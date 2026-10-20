// PS-26c — Import rétroactif des factures fournisseurs Snack depuis Pennylane (LECTURE SEULE côté
// Pennylane). mode 'probe' : vérifie le droit de lecture (factures + fichier joint). mode 'run' :
// télécharge chaque justificatif du périmètre → Storage privé 'tickets' + crée l'en-tête
// tickets_achats (source import_pennylane, idempotent sur pennylane_invoice_id). AUCUNE écriture
// Pennylane. Secret PENNYLANE_JUSTIF_TOKEN. Perimètre/catégorie = miroir de src/lib/ticket-import.ts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

const PL = "https://app.pennylane.com/api/external/v2"
const DATE_MIN = "2025-09-01", DATE_MAX = "2026-10-16"
const PERIMETRE = ["CLUNYBAM","CARREFOUR CLUNY","SADECO","CARREFOUR DILLON","SOCOPOINT","MG STORE",
  "LE SPECIALISTE DE L'EMBALLAGE","GEREMBAL","SOMABAZ","EQUIP COMMERCE","DOMIA DISTRIBUTION",
  "GIMONTAIGNE","ONLY WORLD","AU REGAL DE DIDIER","LE ROYAL","NOREBAM","PHYSADIS","ECOCOM@M",
  "ANTOINE HAYOT","GRANDES SURFACES","RETIF","PLI BEL PRICE JAMBETTE"]
const EXCLUS = ["SOMABRI"]
function norm(s: string | null | undefined) { return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase() }
function dansPerimetre(sn: string, label: string, num: string) {
  const hay = `${norm(sn)} ${norm(label)}`
  if (EXCLUS.some((x) => hay.includes(norm(x)))) return false
  if (PERIMETRE.some((f) => hay.includes(norm(f)))) return true
  return (num || "").includes("8658") || (label || "").includes("8658")
}
function categoriePour(sn: string, label: string, date: string) {
  const hay = `${norm(sn)} ${norm(label)}`
  const stageSupplier = ["CLUNYBAM","CARREFOUR","SADECO","SOCOPOINT"].some((x) => hay.includes(x))
  return stageSupplier && date >= "2026-07-01" && date <= "2026-08-31" ? "pro_ltc" : "pro_snack"
}
function H(t: string) { return { Authorization: `Bearer ${t}`, Accept: "application/json" } }

async function listAll(token: string) {
  const filter = JSON.stringify([
    { field: "date", operator: "gteq", value: DATE_MIN },
    { field: "date", operator: "lteq", value: DATE_MAX },
  ])
  const out: Record<string, unknown>[] = []
  let cursor: string | null = null
  for (let i = 0; i < 40; i++) {
    const url = new URL(`${PL}/supplier_invoices`)
    url.searchParams.set("limit", "100"); url.searchParams.set("filter", filter)
    if (cursor) url.searchParams.set("cursor", cursor)
    const res = await fetch(url, { headers: H(token) })
    if (!res.ok) throw new Error(`list ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const j = await res.json()
    for (const it of (j.items || [])) out.push(it)
    cursor = j.next_cursor || null
    if (!cursor) break
  }
  return out
}

// Résout l'URL de téléchargement du justificatif d'une facture (plusieurs formes possibles en v2).
async function fileOf(token: string, inv: Record<string, unknown>): Promise<{ url?: string; ext?: string; faId?: unknown } | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const i = inv as any
  // v2 : la facture fournisseur expose directement public_file_url (+ filename).
  const direct = i.public_file_url ?? i.file_url ?? i.file_attachment?.url ?? null
  if (direct) return { url: direct, ext: extFrom(i.filename) || extFrom(direct) || "pdf", faId: i.id }
  const faId = i.file_attachment_id ?? i.file_attachment?.id ?? i.attachment_id ?? null
  if (!faId) return null
  const res = await fetch(`${PL}/file_attachments/${faId}`, { headers: H(token) })
  if (!res.ok) return null
  const fa = await res.json()
  const url = fa.url ?? fa.download_url ?? fa.file_url ?? fa.public_file_url ?? null
  return url ? { url, ext: extFrom(url) || extFrom(fa.filename) || "pdf", faId } : { faId }
}
function extFrom(s: string | null | undefined): string {
  const m = /\.(pdf|jpe?g|png|webp|heic|heif)(?:\?|$)/i.exec(s || "")
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : ""
}

Deno.serve(async (req) => {
  try {
    const token = Deno.env.get("PENNYLANE_JUSTIF_TOKEN")
    if (!token) return json({ error: "PENNYLANE_JUSTIF_TOKEN manquant", can_read: false }, 500)
    const body = await req.json().catch(() => ({}))
    const mode = body?.mode || "probe"
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)

    if (mode === "probe") {
      const list = await listAll(token)
      const cible = list.find((i) => dansPerimetre(String((i as Record<string,unknown>).supplier_name ?? ""), String((i as Record<string,unknown>).label ?? ""), String((i as Record<string,unknown>).invoice_number ?? "")))
      let canReadFile = false, fileInfo: unknown = null, invKeys: string[] = []
      if (cible) {
        const id = (cible as Record<string, unknown>).id
        const res = await fetch(`${PL}/supplier_invoices/${id}`, { headers: H(token) })
        if (res.ok) { const full = await res.json(); invKeys = Object.keys(full); const f = await fileOf(token, full); fileInfo = f; canReadFile = !!(f && f.url) }
      }
      return json({ can_list: true, total: list.length, perimetre: list.filter((i) => dansPerimetre(String((i as Record<string,unknown>).supplier_name ?? ""), String((i as Record<string,unknown>).label ?? ""), String((i as Record<string,unknown>).invoice_number ?? ""))).length, can_read_file: canReadFile, invoice_keys: invKeys, sample_file: fileInfo })
    }

    if (mode === "manifest") {
      const { data } = await admin.from("tickets_achats")
        .select("pennylane_invoice_id, fournisseur, date_ticket, montant_ttc, categorie, photo_path, statut, erreur")
        .eq("source", "import_pennylane").order("date_ticket")
      const out: Record<string, unknown>[] = []
      for (const t of (data || [])) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = t as any
        let signed: string | null = null
        if (r.photo_path) { const s = await admin.storage.from("tickets").createSignedUrl(r.photo_path, 3600); signed = s.data?.signedUrl ?? null }
        out.push({ ...r, ext: (r.photo_path || "").split(".").pop(), signed_url: signed })
      }
      return json({ count: out.length, manifest: out })
    }

    if (mode === "run") {
      const MAX = Number(body?.max) || 25  // nb max de téléchargements par appel (limite wall-clock edge)
      const list = await listAll(token)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cibles = list.filter((i: any) => dansPerimetre(String(i.supplier_name ?? ""), String(i.label ?? ""), String(i.invoice_number ?? "")))
      const manifest: Record<string, unknown>[] = []
      let imported = 0, skipped = 0, noFile = 0, downloaded = 0
      for (const inv of cibles) {
        if (downloaded >= MAX) break
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const i = inv as any
        const plId = String(i.id)
        const { data: existing } = await admin.from("tickets_achats").select("id, photo_path").eq("pennylane_invoice_id", plId).maybeSingle()
        const cat = categoriePour(String(i.supplier_name ?? ""), String(i.label ?? ""), String(i.date))
        const montant = Number(i.amount)
        const fournisseur = i.supplier_name || (i.label || "").replace(/^Facture\s+/i, "").trim() || null
        // Récupère le justificatif (si pas déjà importé avec photo).
        let photoPath: string | null = existing?.photo_path ?? null
        let ext = "pdf"; let signedUrl: string | null = null; let errNote: string | null = null
        if (!photoPath) {
          downloaded++
          const full = await (await fetch(`${PL}/supplier_invoices/${plId}`, { headers: H(token) })).json().catch(() => i)
          const f = await fileOf(token, full)
          if (f?.url) {
            ext = f.ext || "pdf"
            const fres = await fetch(f.url)
            if (fres.ok) {
              const bytes = new Uint8Array(await fres.arrayBuffer())
              const path = `pennylane/${i.date}_${plId}.${ext}`
              const ct = ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : "image/jpeg"
              const up = await admin.storage.from("tickets").upload(path, new Blob([bytes], { type: ct }), { contentType: ct, upsert: true })
              if (!up.error) photoPath = path
              else errNote = `upload: ${up.error.message}`
            } else { errNote = `download ${fres.status}` }
          } else { noFile++; errNote = "aucun justificatif joint" }
        }
        if (existing) {
          if (photoPath && !existing.photo_path) await admin.from("tickets_achats").update({ photo_path: photoPath }).eq("id", existing.id)
          skipped++
        } else {
          await admin.from("tickets_achats").insert({
            source: "import_pennylane", categorie: cat, fournisseur, date_ticket: i.date,
            montant_ttc: Number.isFinite(montant) ? montant : null, pennylane_invoice_id: plId,
            photo_path: photoPath, statut: "a_verifier",
            erreur: errNote || "importé de Pennylane — lignes à saisir",
          })
          imported++
        }
        if (photoPath) {
          const s = await admin.storage.from("tickets").createSignedUrl(photoPath, 3600)
          signedUrl = s.data?.signedUrl ?? null
        }
        manifest.push({ pennylane_invoice_id: plId, fournisseur, date: i.date, montant, categorie: cat, ext, path: photoPath, signed_url: signedUrl, note: errNote })
      }
      return json({ ok: true, total_periode: list.length, cibles: cibles.length, imported, skipped, no_file: noFile, downloaded, reste: cibles.length - skipped - imported, manifest })
    }

    return json({ error: "mode inconnu" }, 400)
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500)
  }
})
function json(b: unknown, status = 200) { return new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } }) }
