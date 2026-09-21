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
  // PS-02 — favicon + icône écran d'accueil = panda cuisto (src/app/icon.png, apple-icon.png,
  // favicon.ico générés depuis public/icons/icon-512.png). Next émet aussi les <link> conventionnels.
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
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

// PS-02 — choix « Vue mobile / Vue ordinateur » (localStorage ps_layout, défaut 'mobile') appliqué
// AVANT l'hydratation pour éviter tout flash : data-layout sur <html>, lu par globals.css (.ps-shell).
const LAYOUT_BOOT = `try{var l=localStorage.getItem('ps_layout');document.documentElement.setAttribute('data-layout',l==='desktop'?'desktop':'mobile')}catch(e){document.documentElement.setAttribute('data-layout','mobile')}`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fr" data-layout="mobile" suppressHydrationWarning className={`h-full antialiased overflow-x-hidden ${fredoka.variable} ${nunito.variable}`}>
      <body className="min-h-full flex flex-col overflow-x-hidden">
        <script dangerouslySetInnerHTML={{ __html: LAYOUT_BOOT }} />
        <LayoutClient>{children}</LayoutClient>
      </body>
    </html>
  )
}
