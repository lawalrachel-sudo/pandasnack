"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const NAV_ITEMS = [
  { href: "/commander", label: "Ma commande", img: "https://res.cloudinary.com/dbkpvp9ts/image/upload/w_64,q_auto,f_auto/v1777024643/MON_PANIER.jpg" },
  { href: "/mes-commandes", label: "Voir mes commandes", img: "https://res.cloudinary.com/dbkpvp9ts/image/upload/w_64,q_auto,f_auto/v1777024028/MES_COMMANDES.jpg" },
  { href: "/mon-espace", label: "Mon espace", img: "https://res.cloudinary.com/dbkpvp9ts/image/upload/w_64,q_auto,f_auto/v1777024021/MON_ESPACE.jpg" },
  { href: "/contact", label: "Contact", img: "https://res.cloudinary.com/dbkpvp9ts/image/upload/w_64,q_auto,f_auto/v1777023402/CONTACT.jpg" },
]

export function BottomNav() {
  const pathname = usePathname()
  if (pathname?.startsWith("/auth") || pathname?.startsWith("/onboarding") || pathname?.startsWith("/connexion")) return null

  return (
    <>
      <style>{`
        @keyframes navPulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.15); }
          100% { transform: scale(1.08); }
        }
        .nav-item-active {
          animation: navPulse 0.35s ease-out forwards;
        }
        .nav-item {
          transition: transform 0.2s ease;
        }
        .nav-item:active {
          transform: scale(0.92);
        }
      `}</style>
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 border-t shadow-lg"
        style={{ background: '#FFFFFF', borderColor: 'var(--border)' }}
      >
        <div className="max-w-lg mx-auto grid grid-cols-4 items-end py-2 px-1">
          {NAV_ITEMS.map(({ href, label, img }) => {
            const active = pathname === href || (href !== "/" && pathname?.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className={`nav-item flex flex-col items-center gap-1 py-1 rounded-xl ${active ? "nav-item-active" : ""}`}
                style={active ? { background: "rgba(200,90,60,0.08)" } : {}}
              >
                <img
                  src={img}
                  alt={label}
                  className="object-contain"
                  style={{ width: active ? 32 : 26, height: active ? 32 : 26, transition: "all 0.25s ease" }}
                />
                <span
                  className="leading-tight text-center"
                  style={{
                    fontSize: active ? 11 : 10,
                    fontWeight: active ? 800 : 600,
                    color: active ? "var(--accent)" : "var(--ink-soft)",
                    maxWidth: 76,
                    transition: "all 0.25s ease",
                  }}
                >
                  {label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
