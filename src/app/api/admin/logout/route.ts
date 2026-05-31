import { NextResponse } from "next/server"
import { ADMIN_COOKIE_NAME } from "@/lib/auth/admin-cookie"

export const dynamic = "force-dynamic"

// POST /api/admin/logout — efface le cookie admin.
export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })
  return res
}
