"use client"

import Link from "next/link"

const WALLET_IMG = "https://res.cloudinary.com/dbkpvp9ts/image/upload/w_32,q_auto,f_auto/v1776714727/PANDA_WALLET.jpg"

interface NavbarProps {
  walletBalance?: number
  familyName?: string
}

export function Navbar({ walletBalance, familyName }: NavbarProps) {
  const balanceDisplay = walletBalance != null
    ? `${(walletBalance / 100).toFixed(2).replace('.', ',')} €`
    : null

  return (
    <header
      className="sticky top-0 z-50 border-b px-4 py-3 flex items-center justify-between"
      style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
    >
      <Link href="/" className="flex items-center gap-2">
        <img
          src="https://res.cloudinary.com/dbkpvp9ts/image/upload/w_48,q_auto,f_auto/v1776343210/tete_panda_panda_snack.png"
          alt="Panda Snack"
          className="w-10 h-10 rounded-full"
        />
        <span className="font-bold text-lg tracking-tight">Panda Snack</span>
      </Link>

      <Link
        href="/mon-espace?tab=wallet"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white"
        style={{ background: 'var(--accent-2)' }}
      >
        <img src={WALLET_IMG} alt="" className="w-5 h-5 rounded-full object-cover" />
        {balanceDisplay || "0,00 €"}
      </Link>
    </header>
  )
}
