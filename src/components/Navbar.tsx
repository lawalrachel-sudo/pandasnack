"use client"

import Link from "next/link"

interface NavbarProps {
  walletBalance?: number // in cents
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

      <div className="flex items-center gap-3">
        {familyName && (
          <Link href="/mon-espace" className="text-sm" style={{ color: 'var(--ink-soft)' }}>
            {familyName}
          </Link>
        )}
        {balanceDisplay && (
          <Link
            href="/mon-espace"
            className="px-3 py-1.5 rounded-full text-xs font-semibold text-white"
            style={{ background: 'var(--accent)' }}
          >
            {balanceDisplay}
          </Link>
        )}
      </div>
    </header>
  )
}
