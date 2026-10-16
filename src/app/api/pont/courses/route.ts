import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { checkPontBearer } from "@/lib/pont-secret"

export const dynamic = "force-dynamic"

// PS-23b — Lecture de la liste de courses par EXONA (PandApp). Garde Bearer (secret pont PS-15).
export async function GET(req: NextRequest) {
  if (!checkPontBearer(req.headers.get("authorization"))) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: "Service indisponible" }, { status: 503 })
  await admin.rpc("courses_sync_bubble")
  const { data } = await admin.from("courses_items")
    .select("id, libelle, quantite, unite, statut, source, categorie, fournisseur")
    .in("statut", ["suggere", "a_acheter"]).order("created_at", { ascending: true })
  return NextResponse.json({ items: data || [] })
}
