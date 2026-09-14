import type { Metadata, Viewport } from "next"
import { Fredoka, Nunito } from "next/font/google"
import "./globals.css"
import { LayoutClient } from "@/components/LayoutClient"

// PS-01 Opération Beauty — polices chargées UNE fois ici (next/font/google, self-hosted au build).
// Fredoka = titres / noms d'items / prix / boutons (token --font-display, classe `font-display`).
// Nunito = corps de texte (token --font-body, appliqué sur body dans globals.css).
const fredoka = Fredoka({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-fredoka", display: "swap" })
const nunito = Nunito({ subsets: ["latin"], weight: ["400", "600", "700", "800"], variable: "--font-nunito", display: "swap" })

export const metadata: Metadata = {
  title: "Panda Snack — Commande en ligne",
  description: "Commande tes repas Panda Snack en ligne. Sandwichs, croques, pasta box, salades et boissons maison.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Panda Snack",
  },
}

export const viewport: Viewport = {
  themeColor: "#C85A3C",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fr" className={`h-full antialiased overflow-x-hidden ${fredoka.variable} ${nunito.variable}`}>
      <body className="min-h-full flex flex-col overflow-x-hidden">
        <LayoutClient>{children}</LayoutClient>
      </body>
    </html>
  )
}
