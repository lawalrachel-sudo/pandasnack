"use client"

import { useEffect } from "react"

// PS-09a — ancien chemin de réinitialisation : on redirige vers /auth/nouveau-mot-de-passe
// en conservant le fragment (#access_token…) et la query (?code=…) pour les liens déjà envoyés.
export default function ResetRedirectPage() {
  useEffect(() => {
    const { search, hash } = window.location
    window.location.replace(`/auth/nouveau-mot-de-passe${search}${hash}`)
  }, [])
  return <div className="min-h-screen flex items-center justify-center text-sm">Redirection…</div>
}
