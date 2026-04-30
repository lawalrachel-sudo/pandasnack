"use client"

import Link from "next/link"
import { Logo } from "./Logo"

const WALLET_IMG = "https://res.cloudinary.com/dbkpvp9ts/image/upload/w_40,q_auto,f_auto/v1776714727/PANDA_WALLET.jpg"

interface NavbarProps {
  walletBalance?: number
  familyName?: string
  lastRechargeCents?: number
  pendingCount?: number
}

export function Navbar({ walletBalance, lastRechargeCents, pendingCount = 0 }: NavbarProps) {
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
      {/* Row 1 — Logo bannière md (80px) centré */}
      <div className="px-4 pt-2 pb-1 flex items-center justify-center">
        <Logo size="lg" link />
      </div>

      {/* Row 2 — Wallet pill (gauche) + Caddie (droite) */}
      <div className="px-4 pb-2 flex items-center justify-between gap-2">
        <Link
          href="/mon-espace?tab=wallet"
          className="flex items-center gap-2 px-3 py-2 rounded-full text-sm font-bold text-white"
          style={{ background: 'var(--accent-2)' }}
        >
          <img src={WALLET_IMG} alt="" className="w-6 h-6 rounded-full object-cover" />
          <span>{balanceDisplay || "0,00 €"}{palierLabel}</span>
        </Link>

        <Link
          href="/panier"
          aria-label="Voir mon panier"
          className="relative flex items-center justify-center w-10 h-10 rounded-full bg-white shadow-sm border"
          style={{ borderColor: 'var(--border)' }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: 'var(--accent)' }}
          >
            <circle cx="8" cy="21" r="1" />
            <circle cx="19" cy="21" r="1" />
            <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
          </svg>
          {pendingCount > 0 && (
            <span
              className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full text-white text-[10px] font-bold flex items-center justify-center px-1"
              style={{ background: '#DC2626' }}
            >
              {pendingCount > 9 ? '9+' : pendingCount}
            </span>
          )}
        </Link>
      </div>
    </header>
  )
}
