"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const NAV_ITEMS = [
  { href: "/commander", label: "Ma commande", img: "https://res.cloudinary.com/dbkpvp9ts/image/upload/w_48,q_auto,f_auto/v1777024643/MON_PANIER.jpg" },
  { href: "/mes-commandes", label: "Voir mes commandes", img: "https://res.cloudinary.com/dbkpvp9ts/image/upload/w_48,q_auto,f_auto/v1777024028/MES_COMMANDES.jpg" },
  { href: "/mon-espace", label: "Mon espace", img: "https://res.cloudinary.com/dbkpvp9ts/image/upload/w_48,q_auto,f_auto/v1777024021/MON_ESPACE.jpg" },
  { href: "/contact", label: "Contact", img: "https://res.cloudinary.com/dbkpvp9ts/image/upload/w_48,q_auto,f_auto/v1777023402/CONTACT.jpg" },
]

export function BottomNav() {
  const pathname = usePathname()
  if (pathname?.startsWith("/auth") || pathname?.startsWith("/onboarding") || pathname?.startsWith("/connexion")) return null

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 border-t"
      style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
    >
      <div className="max-w-lg mx-auto grid grid-cols-4 items-center py-1">
        {NAV_ITEMS.map(({ href, label, img }) => {
          const active = pathname === href || (href !== "/" && pathname?.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-0.5 py-1"
              style={{ opacity: active ? 1 : 0.6 }}
            >
              <img src={img} alt={label} className="w-6 h-6 object-contain" style={active ? { filter: 'none' } : { filter: 'grayscale(50%)' }} />
              <span className="text-[9px] font-semibold leading-tight text-center" style={{ color: active ? 'var(--accent)' : 'var(--ink-soft)', maxWidth: 72 }}>{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
