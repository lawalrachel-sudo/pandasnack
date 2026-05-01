"use client"

import { BottomNav } from "@/components/BottomNav"
import { CartProvider } from "@/lib/cart-context"

export function LayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      {children}
      <BottomNav />
    </CartProvider>
  )
}
