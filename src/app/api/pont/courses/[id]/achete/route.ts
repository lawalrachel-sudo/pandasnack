import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { checkPontBearer } from "@/lib/pont-secret"
import { cocherCourse } from "@/lib/courses-server"

export const dynamic = "force-dynamic"

// PS-23b — EXONA coche « acheté » (réassort auto une seule fois pour une ligne auto_bubble).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!checkPontBearer(req.headers.get("authorization"))) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })
  const { id } = await ctx.params
  // PS-28 : même cochage que l'écran (coche_at + dernier_achat du catalogue).
  const { error } = await cocherCourse(admin, id)
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
