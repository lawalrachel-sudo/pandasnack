import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import {
  ADMIN_COOKIE_NAME,
  adminCookieOptions,
  createAdminSessionValue,
  verifyAdminSessionValue,
} from "@/lib/auth/admin-cookie"

export const dynamic = "force-dynamic"

// POST /api/admin/renew — PS-05b §3 : prolonge la session admin à chaque visite.
// Appelée par <AdminSessionKeepAlive> monté sur toutes les pages /admin. Si le cookie
// (mot de passe signé) est encore valide, on le ré-émet avec un maxAge de 90 jours frais.
// Sinon no-op (l'accès par compte is_admin ne dépend pas de ce cookie).
export async function POST() {
  const store = await cookies()
  const current = store.get(ADMIN_COOKIE_NAME)?.value
  if (!verifyAdminSessionValue(current)) {
    return NextResponse.json({ renewed: false })
  }
  const res = NextResponse.json({ renewed: true })
  res.cookies.set(ADMIN_COOKIE_NAME, createAdminSessionValue(), adminCookieOptions())
  return res
}
