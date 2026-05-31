"use client"

import { useState } from "react"
import { Logo } from "@/components/Logo"

export function AdminLoginClient() {
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })

      if (res.ok) {
        // Redirection dure pour que le cookie soit pris en compte côté serveur
        window.location.href = "/admin/dashboard"
        return
      }

      if (res.status === 401) {
        setError("Mot de passe incorrect")
      } else {
        const data = await res.json().catch(() => null)
        setError(data?.error || "Une erreur est survenue. Réessaie.")
      }
    } catch {
      setError("Connexion impossible. Vérifie ta connexion internet.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logoRow}>
          <Logo size="lg" />
        </div>

        <h2 style={styles.title}>Espace admin</h2>
        <p style={styles.subtitle}>Saisis le mot de passe pour accéder au dashboard.</p>

        {error && <div style={styles.errorBox}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>
            Mot de passe
            <div style={styles.passwordWrap}>
              <input
                type={showPassword ? "text" : "password"}
                required
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ ...styles.input, paddingRight: 44 }}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={styles.eyeBtn}
                aria-label={showPassword ? "Masquer" : "Afficher"}
              >
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C85A3C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C85A3C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </label>

          <button type="submit" disabled={loading} style={styles.btnPrimary}>
            {loading ? "Vérification…" : "Entrer"}
          </button>
        </form>
      </div>
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #FBF5EC 0%, #F0E6D6 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    background: "#fff",
    borderRadius: 18,
    padding: "32px 28px",
    maxWidth: 400,
    width: "100%",
    boxShadow: "0 20px 60px rgba(200, 90, 60, 0.12)",
    border: "1px solid #E8D6BF",
  },
  logoRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
    justifyContent: "center",
  },
  title: {
    fontSize: 26,
    fontWeight: 800,
    color: "#3A2A20",
    margin: "0 0 6px",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#6B5742",
    margin: "0 0 20px",
    textAlign: "center",
    lineHeight: 1.5,
  },
  form: { display: "flex", flexDirection: "column", gap: 14 },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontSize: 13,
    fontWeight: 600,
    color: "#3A2A20",
  },
  input: {
    padding: "11px 14px",
    borderRadius: 10,
    border: "1.5px solid #E8D6BF",
    background: "#FBF5EC",
    fontSize: 15,
    color: "#3A2A20",
    outline: "none",
    fontFamily: "inherit",
    width: "100%",
    boxSizing: "border-box",
  },
  passwordWrap: { position: "relative" },
  eyeBtn: {
    position: "absolute",
    right: 10,
    top: "50%",
    transform: "translateY(-50%)",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: 18,
    padding: 4,
  },
  btnPrimary: {
    background: "#C85A3C",
    color: "#fff",
    border: "none",
    borderRadius: 12,
    padding: "14px 20px",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    marginTop: 6,
  },
  errorBox: {
    background: "#FEF2F0",
    border: "1px solid #F5B5A8",
    color: "#B84A2E",
    padding: "10px 14px",
    borderRadius: 10,
    fontSize: 13,
    marginBottom: 16,
    textAlign: "center",
  },
}
