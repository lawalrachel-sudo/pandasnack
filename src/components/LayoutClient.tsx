"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { BottomNav } from "@/components/BottomNav"
import { CartProvider } from "@/lib/cart-context"
import LegalAcceptanceGate from "@/components/LegalAcceptanceGate"

// PS-02 — Mobile-first partout : colonne centrée (430 px) sur fond neutre, « Vue ordinateur »
// (1100 px) sur demande. Choix persistant dans localStorage `ps_layout` ('mobile' | 'desktop'),
// appliqué via data-layout sur <html> (script de boot dans layout.tsx + ce toggle). /admin non concerné.
type PsLayout = "mobile" | "desktop"
const LAYOUT_KEY = "ps_layout"

function readLayout(): PsLayout {
  try { return localStorage.getItem(LAYOUT_KEY) === "desktop" ? "desktop" : "mobile" } catch { return "mobile" }
}

function LayoutToggle() {
  const [layout, setLayout] = useState<PsLayout>("mobile")
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { setLayout(readLayout()) }, [])
  /* eslint-enable react-hooks/set-state-in-effect */
  const toggle = useCallback(() => {
    const next: PsLayout = layout === "desktop" ? "mobile" : "desktop"
    try { localStorage.setItem(LAYOUT_KEY, next) } catch { /* stockage indisponible : choix non persisté */ }
    document.documentElement.setAttribute("data-layout", next)
    setLayout(next)
  }, [layout])
  return (
    <button type="button" onClick={toggle} className="ps-layout-toggle focus-ring" aria-label={layout === "desktop" ? "Passer en vue mobile" : "Passer en vue ordinateur"}>
      {layout === "desktop" ? "🖥️ → 📱 Vue mobile" : "📱 → 🖥️ Vue ordinateur"}
    </button>
  )
}

export function LayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAdmin = !!pathname?.startsWith("/admin")

  const footer = (
    <footer
      className="text-center text-xs py-3 px-4 border-t mb-16"
      style={{
        borderColor: "var(--border)",
        color: "var(--ink-soft)",
        backgroundColor: "var(--bg)",
      }}
    >
      {/* Footer LCEN (art 6 III Code de la consommation) — accès direct depuis toute page
          aux CGV / CGU / Mentions légales. CSS vars Impeccable, pas de Tailwind couleur en dur. */}
      <Link href="/cgv" className="focus-ring underline" style={{ color: "var(--ink-soft)" }}>CGV</Link>
      {" · "}
      <Link href="/cgu" className="focus-ring underline" style={{ color: "var(--ink-soft)" }}>CGU</Link>
      {" · "}
      <Link href="/mentions-legales" className="focus-ring underline" style={{ color: "var(--ink-soft)" }}>Mentions légales</Link>
      {!isAdmin && <div className="mt-2"><LayoutToggle /></div>}
    </footer>
  )

  return (
    <CartProvider>
      {isAdmin ? (
        <>
          {children}
          {footer}
        </>
      ) : (
        <div className="ps-outer">
          <div className="ps-shell">
            {children}
            {footer}
          </div>
        </div>
      )}
      <BottomNav />
      {/* Modal bloquante affichée si user connecté + cgu_version DB ≠ CURRENT_CGU_VERSION */}
      <LegalAcceptanceGate />
    </CartProvider>
  )
}
