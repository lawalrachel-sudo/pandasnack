import { NextResponse } from "next/server"

export const dynamic = "force-static"

// PS-05b §1 — manifest PWA dédié à l'admin (scope /admin/), distinct du manifest client (/).
// Servi à /admin/manifest.webmanifest et référencé par le layout /admin.
export function GET() {
  const manifest = {
    name: "Admin Panda Snack",
    short_name: "Admin PS",
    description: "Cuisine & comptoir Panda Snack — service du jour, encaissement, étiquettes.",
    start_url: "/admin/dashboard",
    scope: "/admin/",
    display: "standalone",
    background_color: "#FBF5EC",
    theme_color: "#C85A3C",
    orientation: "portrait",
    icons: [
      { src: "/icons/admin-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/admin-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/admin-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
  return NextResponse.json(manifest, {
    headers: { "Content-Type": "application/manifest+json" },
  })
}
