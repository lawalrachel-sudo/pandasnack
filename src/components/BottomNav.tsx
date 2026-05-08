"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCart } from "@/lib/cart-context"

const NAV_ITEMS = [
  { href: "/commander", label: "Le Menu", img: "https://res.cloudinary.com/dbkpvp9ts/image/upload/w_64,q_auto,f_auto/v1777331138/Panda_Chef.jpg", emoji: "👨‍🍳" },
  { href: "/planning", label: "Planning", img: null, emoji: "📅" },
  { href: "/panier", label: "Mon panier", img: null, emoji: "🛒" }, // Brief 3-E — point d'entrée unique panier (SVG canonique render override ci-dessous)
  { href: "/mon-espace", label: "Mon espace", img: "https://res.cloudinary.com/dbkpvp9ts/image/upload/w_64,q_auto,f_auto/v1777024021/MON_ESPACE.jpg", emoji: "🐼" },
  { href: "/contact", label: "Contact", img: "https://res.cloudinary.com/dbkpvp9ts/image/upload/w_64,q_auto,f_auto/v1777335899/Enveloppe.png", emoji: "✉️" },
]

export function BottomNav() {
  const pathname = usePathname()
  const { pendingCount } = useCart()
  if (pathname?.startsWith("/auth") || pathname?.startsWith("/onboarding") || pathname?.startsWith("/connexion") || pathname?.startsWith("/admin")) return null

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
        <div className="max-w-lg mx-auto grid grid-cols-5 items-end py-2 px-1">
          {NAV_ITEMS.map(({ href, label, img, emoji }) => {
            const active = pathname === href || (href !== "/" && pathname?.startsWith(href))
            const size = active ? 32 : 26
            const isPanier = href === "/panier"
            return (
              <Link
                key={href}
                href={href}
                className={`nav-item flex flex-col items-center gap-1 py-1 rounded-xl ${active ? "nav-item-active" : ""}`}
                style={active ? { background: "rgba(200,90,60,0.08)" } : {}}
              >
                {/* Brief 3-E T2 + T8 : icône caddie SVG canonique avec badge cart */}
                {isPanier ? (
                  <span className="relative flex items-center justify-center" style={{ width: size, height: size, transition: "all 0.25s ease" }}>
                    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: active ? "var(--accent)" : "var(--ink-soft)" }}>
                      <circle cx="9" cy="21" r="1" />
                      <circle cx="20" cy="21" r="1" />
                      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                    </svg>
                    {pendingCount > 0 && (
                      <span
                        className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full text-white text-[9px] font-bold flex items-center justify-center px-1"
                        style={{ background: '#DC2626' }}
                      >
                        {pendingCount > 9 ? '9+' : pendingCount}
                      </span>
                    )}
                  </span>
                ) : img ? (
                  <img
                    src={img}
                    alt={label}
                    className="object-cover rounded-full"
                    style={{ width: size, height: size, transition: "all 0.25s ease" }}
                  />
                ) : (
                  <span style={{ fontSize: size, lineHeight: 1, transition: "all 0.25s ease" }}>{emoji}</span>
                )}
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
