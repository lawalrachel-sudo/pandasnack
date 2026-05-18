"use client"

import Link from "next/link"
import { BottomNav } from "@/components/BottomNav"
import { CartProvider } from "@/lib/cart-context"
import LegalAcceptanceGate from "@/components/LegalAcceptanceGate"

export function LayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      {children}
      {/* Footer LCEN (art 6 III Code de la consommation) — accès direct depuis toute page
          aux CGV / CGU / Mentions légales. CSS vars Impeccable, pas de Tailwind couleur en dur. */}
      <footer
        className="text-center text-xs py-3 px-4 border-t mb-16"
        style={{
          borderColor: "var(--border)",
          color: "var(--ink-soft)",
          backgroundColor: "var(--bg)",
        }}
      >
        <Link href="/cgv" className="focus-ring underline" style={{ color: "var(--ink-soft)" }}>CGV</Link>
        {" · "}
        <Link href="/cgu" className="focus-ring underline" style={{ color: "var(--ink-soft)" }}>CGU</Link>
        {" · "}
        <Link href="/mentions-legales" className="focus-ring underline" style={{ color: "var(--ink-soft)" }}>Mentions légales</Link>
      </footer>
      <BottomNav />
      {/* Modal bloquante affichée si user connecté + cgu_version DB ≠ CURRENT_CGU_VERSION */}
      <LegalAcceptanceGate />
    </CartProvider>
  )
}
