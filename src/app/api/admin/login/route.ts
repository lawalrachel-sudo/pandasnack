import { NextRequest, NextResponse } from "next/server"
import {
  ADMIN_COOKIE_NAME,
  ADMIN_COOKIE_MAX_AGE,
  createAdminSessionValue,
  passwordMatches,
} from "@/lib/auth/admin-cookie"

export const dynamic = "force-dynamic"

// POST /api/admin/login  body: { password }
// Compare au ADMIN_PASSWORD (env var Vercel, jamais exposé côté client).
// OK → pose le cookie admin signé (httpOnly, 30 jours). KO → 401.
export async function POST(req: NextRequest) {
  const expected = process.env.ADMIN_PASSWORD
  if (!expected) {
    console.error("[admin/login] ADMIN_PASSWORD non configuré")
    return NextResponse.json({ error: "Accès admin non configuré" }, { status: 500 })
  }

  let password = ""
  try {
    const body = await req.json()
    password = typeof body?.password === "string" ? body.password : ""
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 })
  }

  if (!password || !passwordMatches(password, expected)) {
    return NextResponse.json({ error: "Mot de passe incorrect" }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE_NAME, createAdminSessionValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_COOKIE_MAX_AGE,
  })
  return res
}
