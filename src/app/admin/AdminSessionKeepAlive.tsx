"use client"

import { useEffect } from "react"

// PS-05b §3 — prolonge la session admin à chaque visite d'une page /admin.
// Monté par le layout admin ; ping unique au montage, non bloquant, silencieux.
export function AdminSessionKeepAlive() {
  useEffect(() => {
    fetch("/api/admin/renew", { method: "POST" }).catch(() => {})
  }, [])
  return null
}
