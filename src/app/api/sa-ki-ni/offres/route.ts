import { NextResponse } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { getSaKiNiHero } from "@/lib/sa-ki-ni-server"

export const dynamic = "force-dynamic"

// GET /api/sa-ki-ni/offres — hero temporel Sa ki ni du jour pour le parent connecté (ou null).
export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authed: any = await createServerSupabase()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ hero: null })
  const hero = await getSaKiNiHero(authed, admin)
  return NextResponse.json({ hero })
}
