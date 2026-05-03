"use client"

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react"

interface CartContextValue {
  /** Nombre total d'order_items dans les orders pending_payment du compte (lu DB, badge BottomNav) */
  pendingCount: number
  /** Re-fetch /api/orders/pending-count → mise à jour pendingCount */
  refreshPendingCount: () => Promise<void>
}

const CartContext = createContext<CartContextValue | undefined>(undefined)

export function CartProvider({ children }: { children: ReactNode }) {
  const [pendingCount, setPendingCount] = useState<number>(0)

  const refreshPendingCount = useCallback(async () => {
    try {
      const res = await fetch("/api/orders/pending-count", { cache: "no-store" })
      if (res.ok) {
        const data = await res.json()
        setPendingCount(data.count || 0)
      }
    } catch {
      // silencieux : pas critique pour le rendu
    }
  }, [])

  // Initial fetch au mount
  useEffect(() => {
    refreshPendingCount()
  }, [refreshPendingCount])

  return (
    <CartContext.Provider value={{ pendingCount, refreshPendingCount }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error("useCart must be used within CartProvider")
  return ctx
}
