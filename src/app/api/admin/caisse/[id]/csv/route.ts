import { NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { buildClotureCsv, buildPennylaneCsv, cloturePath } from "@/lib/export-compta"
import type { Cloture } from "@/lib/caisse"

export const dynamic = "force-dynamic"

// GET /api/admin/caisse/[id]/csv?format=archive|pennylane — PS-08a-b.
// Construit le CSV (UTF-8 BOM), l'archive dans le bucket privé « clotures », mémorise
// csv_path (format archive uniquement) et renvoie le fichier en téléchargement.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServerSupabase()
  const auth = await requireAdmin(supabase)
  if ("error" in auth) return auth.error

  const { id } = await ctx.params
  const format = new URL(req.url).searchParams.get("format") === "pennylane" ? "pennylane" : "archive"

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })

  const { data, error } = await admin.from("caisse_clotures").select("*").eq("id", id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Clôture introuvable" }, { status: 404 })
  const cloture = data as Cloture

  const csv = format === "pennylane" ? buildPennylaneCsv(cloture) : buildClotureCsv(cloture)
  const base = cloturePath(cloture.period_type, cloture.period_start).replace(/\.csv$/, "")
  const objectPath = format === "pennylane" ? `${base}_pennylane.csv` : `${base}.csv`

  const { error: upErr } = await admin.storage
    .from("clotures")
    .upload(objectPath, new Blob([csv], { type: "text/csv; charset=utf-8" }), {
      contentType: "text/csv; charset=utf-8", upsert: true,
    })
  if (upErr) console.error("[caisse/csv] upload", upErr.message)
  else if (format === "archive" && !cloture.csv_path) {
    await admin.from("caisse_clotures").update({ csv_path: objectPath }).eq("id", id)
  }

  const filename = objectPath.split("/").pop()
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
