"use client"

interface CartBarProps {
  itemCount: number
  totalCents: number
  onOpen: () => void
}

export function CartBar({ itemCount, totalCents, onOpen }: CartBarProps) {
  if (itemCount === 0) return null

  return (
    <div className="fixed left-0 right-0 z-40 flex justify-center pointer-events-none px-3" style={{ bottom: 60 }}>
      <button
        onClick={onOpen}
        className="w-full max-w-lg pointer-events-auto flex items-center justify-between px-5 py-4 text-white font-bold rounded-2xl shadow-xl"
        style={{ background: 'var(--accent)' }}
      >
        <span className="bg-white/20 rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold">
          {itemCount}
        </span>
        <span className="text-base">Voir mon panier</span>
        <span className="text-base">{(totalCents / 100).toFixed(2).replace('.', ',')} €</span>
      </button>
    </div>
  )
}
