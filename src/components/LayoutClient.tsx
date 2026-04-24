"use client"

import { BottomNav } from "@/components/BottomNav"

export function LayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <BottomNav />
    </>
  )
}
