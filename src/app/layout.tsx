import type { Metadata, Viewport } from "next"
import "./globals.css"
import { LayoutClient } from "@/components/LayoutClient"

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
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <LayoutClient>{children}</LayoutClient>
      </body>
    </html>
  )
}
