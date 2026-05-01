"use client"

import Link from "next/link"
import { Logo } from "./Logo"

const WALLET_IMG = "https://res.cloudinary.com/dbkpvp9ts/image/upload/w_40,q_auto,f_auto/v1776714727/PANDA_WALLET.jpg"

interface NavbarProps {
  walletBalance?: number
  familyName?: string
  lastRechargeCents?: number
  /** @deprecated Brief 3-E : caddie déplacé en BottomNav avec badge cart Context. Conservé en prop pour compat ascendante uniquement. */
  pendingCount?: number
}

export function Navbar({ walletBalance, lastRechargeCents }: NavbarProps) {
  const balanceDisplay = walletBalance != null
    ? `${(walletBalance / 100).toFixed(2).replace('.', ',')} €`
    : null

  // Palier de prix actif
  const recharge = lastRechargeCents || 0
  let palierLabel = ""
  if (recharge >= 10000) palierLabel = " (menus 8€)"
  else if (recharge >= 5000) palierLabel = " (menus 9€)"

  return (
    <header
      className="sticky top-0 z-50 border-b"
      style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
    >
      {/* Row 1 — Logo bannière 2xl centré */}
      <div className="px-4 pt-2 pb-1 flex items-center justify-center">
        <Logo size="2xl" link />
      </div>

      {/* Row 2 — Wallet pill seul (caddie déplacé en BottomNav, Brief 3-E) */}
      <div className="px-4 pb-2 flex items-center justify-center">
        <Link
          href="/mon-espace?tab=wallet"
          className="flex items-center gap-2 px-3 py-2 rounded-full text-sm font-bold text-white"
          style={{ background: 'var(--accent-2)' }}
        >
          <img src={WALLET_IMG} alt="" className="w-6 h-6 rounded-full object-cover" />
          <span>{balanceDisplay || "0,00 €"}{palierLabel}</span>
        </Link>
      </div>
    </header>
  )
}
