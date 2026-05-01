"use client"

import { createContext, useContext, useState, ReactNode } from "react"

export interface CartItem {
  itemId: string
  itemName: string
  priceCents: number
  profilId: string | null
  profilPrenom: string
  isTakeaway: boolean
  isFormula: boolean
  formulaCode: string | null
  selectedPlat: string | null
  selectedToppings: string[]
}

interface CartContextValue {
  cart: CartItem[]
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>
  totalCents: number
  itemCount: number
}

const CartContext = createContext<CartContextValue | undefined>(undefined)

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([])
  const totalCents = cart.reduce((s, i) => s + i.priceCents, 0)
  const itemCount = cart.length

  return (
    <CartContext.Provider value={{ cart, setCart, totalCents, itemCount }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error("useCart must be used within CartProvider")
  return ctx
}
