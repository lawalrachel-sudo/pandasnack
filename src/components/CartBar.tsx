"use client"

interface CartBarProps {
  itemCount: number
  totalCents: number
  onOpen: () => void
}

export function CartBar({ itemCount, totalCents, onOpen }: CartBarProps) {
  if (itemCount === 0) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center pointer-events-none">
      <button
        onClick={onOpen}
        className="w-full max-w-lg pointer-events-auto flex items-center justify-between px-5 py-4 text-white font-semibold"
        style={{ background: 'var(--accent)' }}
      >
        <span className="bg-white/20 rounded-full w-7 h-7 flex items-center justify-center text-sm">
          {itemCount}
        </span>
        <span>Voir mon panier</span>
        <span>{(totalCents / 100).toFixed(2).replace('.', ',')} €</span>
      </button>
    </div>
  )
}
