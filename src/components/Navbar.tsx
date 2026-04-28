"use client"

import Link from "next/link"

const WALLET_IMG = "https://res.cloudinary.com/dbkpvp9ts/image/upload/w_40,q_auto,f_auto/v1776714727/PANDA_WALLET.jpg"

interface NavbarProps {
  walletBalance?: number
  familyName?: string
  lastRechargeCents?: number
}

export function Navbar({ walletBalance, familyName, lastRechargeCents }: NavbarProps) {
  const balanceDisplay = walletBalance != null
    ? `${(walletBalance / 100).toFixed(2).replace('.', ',')} €`
    : null

  // Déterminer le palier de prix actif
  const recharge = lastRechargeCents || 0
  let palierLabel = ""
  if (recharge >= 10000) palierLabel = " (menus 8€)"
  else if (recharge >= 5000) palierLabel = " (menus 9€)"

  return (
    <header
      className="sticky top-0 z-50 border-b px-4 py-3 flex items-center justify-between"
      style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
    >
      <Link href="/commander" className="flex items-center">
        <img
          src="https://res.cloudinary.com/dbkpvp9ts/image/upload/q_auto,f_auto/v1777332077/PANDA_SNACK_LOGO.jpg"
          alt="Panda Snack"
          className="h-10 w-auto md:h-12"
        />
      </Link>

      <Link
        href="/mon-espace?tab=wallet"
        className="flex items-center gap-2 px-3 py-2 rounded-full text-sm font-bold text-white"
        style={{ background: 'var(--accent-2)' }}
      >
        <img src={WALLET_IMG} alt="" className="w-6 h-6 rounded-full object-cover" />
        <span>{balanceDisplay || "0,00 €"}{palierLabel}</span>
      </Link>
    </header>
  )
}
