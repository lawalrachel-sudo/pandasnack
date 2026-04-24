"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const NAV_ITEMS = [
  { href: "/commander", label: "Ma commande", icon: "🍱" },
  { href: "/mes-commandes", label: "Mes commandes", icon: "📋" },
  { href: "/mon-espace", label: "Mon espace", icon: "👤" },
  { href: "mailto:team@pandasnack.online", label: "Contact", icon: "✉️", external: true },
]

export function BottomNav() {
  const pathname = usePathname()
  // Hide on auth/onboarding pages
  if (pathname?.startsWith("/auth") || pathname?.startsWith("/onboarding") || pathname?.startsWith("/connexion")) return null

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 border-t flex justify-around items-center py-2"
      style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
    >
      {NAV_ITEMS.map(item => {
        const active = !item.external && pathname === item.href
        const El = item.external ? "a" : Link
        const extraProps = item.external ? { target: "_blank", rel: "noopener noreferrer" } : {}
        return (
          <El
            key={item.href}
            href={item.href}
            {...(extraProps as any)}
            className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors min-w-[64px]"
            style={active ? { color: 'var(--accent)' } : { color: 'var(--ink-soft)' }}
          >
            <span className="text-lg">{item.icon}</span>
            <span className="text-[10px] font-medium leading-tight text-center">{item.label}</span>
          </El>
        )
      })}
    </nav>
  )
}
