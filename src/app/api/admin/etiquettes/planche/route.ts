import { NextRequest, NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { CELLS_PER_SHEET } from "@/lib/etiquettes-planche"

export const dynamic = "force-dynamic"

// GET/POST /api/admin/etiquettes/planche — PS-12 : état de la planche entamée (cases utilisées).
async function guard() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServerSupabase()
  const auth = await requireAdmin(supabase)
  if ("error" in auth) return { error: auth.error }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return { error: NextResponse.json({ error: "Service indisponible" }, { status: 503 }) }
  return { admin }
}

export async function GET() {
  const g = await guard()
  if ("error" in g) return g.error
  const { data } = await g.admin.from("etiquette_planche").select("used_cells").eq("id", 1).maybeSingle()
  return NextResponse.json({ used_cells: (data?.used_cells as number[]) || [] })
}

export async function POST(req: NextRequest) {
  const g = await guard()
  if ("error" in g) return g.error
  const body = await req.json().catch(() => ({}))
  const raw = Array.isArray(body?.used_cells) ? body.used_cells : []
  // Assainit : entiers uniques 0..9, triés.
  const cleaned = [...new Set(raw.map((n: unknown) => Math.floor(Number(n))).filter((n: number) => Number.isInteger(n) && n >= 0 && n < CELLS_PER_SHEET))].sort((a, b) => (a as number) - (b as number))
  const { error } = await g.admin.from("etiquette_planche")
    .update({ used_cells: cleaned, updated_at: new Date().toISOString() }).eq("id", 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, used_cells: cleaned })
}
