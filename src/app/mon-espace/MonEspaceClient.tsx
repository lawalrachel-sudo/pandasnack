"use client"

import { useState } from "react"
import Link from "next/link"
import { Navbar } from "@/components/Navbar"

const WALLET_IMG = "https://res.cloudinary.com/dbkpvp9ts/image/upload/v1776714727/PANDA_WALLET.jpg"
const CL: Record<string, string> = { maternelle: "Maternelle", primaire: "Primaire", college: "Collège", lycee: "Lycée", prof: "Prof/Équipe" }
const SG_LABELS: Record<string, string> = { ecole: "École", pandattitude: "Pandattitude", panda_guest: "Panda Guest" }
const TX_LABELS: Record<string, { label: string; sign: string; color: string }> = {
  credit_purchase: { label: "Recharge", sign: "+", color: "#166534" },
  debit_order: { label: "Commande", sign: "-", color: "#DC2626" },
  refund: { label: "Remboursement", sign: "+", color: "#0E7490" },
  adjustment: { label: "Ajustement", sign: "", color: "#6B7280" },
}

function fmtPrice(c: number): string { return `${(Math.abs(c) / 100).toFixed(2).replace(".", ",")} €` }
function fmtDateShort(d: string): string {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })
}

interface Profil { id: string; prenom: string; classe: string | null; is_default: boolean; active: boolean; notes_allergies: string | null }
interface WalletTx { id: string; type: string; amount_cents: number; balance_after_cents: number; description: string | null; created_at: string }

interface Props {
  account: { id: string; nom_compte: string; email: string; source_group: string | null; source_detail: string | null }
  profils: Profil[]
  wallet: { id: string; balance_cents: number; total_credited_cents: number; total_debited_cents: number } | null
  walletTransactions: WalletTx[]
  orderCount: number
  userEmail: string
}

export function MonEspaceClient({ account, profils, wallet, walletTransactions, orderCount, userEmail }: Props) {
  const [tab, setTab] = useState<"profils" | "wallet">("profils")
  const [editingProfil, setEditingProfil] = useState<string | null>(null)
  const [showAddProfil, setShowAddProfil] = useState(false)
  const [newPrenom, setNewPrenom] = useState("")
  const [newClasse, setNewClasse] = useState("")
  const [newAllergies, setNewAllergies] = useState("")
  const [saving, setSaving] = useState(false)

  const activeProfils = profils.filter(p => p.active)
  const inactiveProfils = profils.filter(p => !p.active)

  async function addProfil() {
    if (!newPrenom.trim()) return
    setSaving(true)
    try {
      const res = await fetch("/api/profils", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prenom: newPrenom.trim(), classe: newClasse || null, notes_allergies: newAllergies.trim() || null }),
      })
      if (res.ok) { window.location.reload() }
      else { alert("Erreur lors de l'ajout") }
    } catch { alert("Erreur réseau") }
    setSaving(false)
  }

  async function toggleProfil(profilId: string, active: boolean) {
    const res = await fetch("/api/profils", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profilId, active }),
    })
    if (res.ok) window.location.reload()
  }

  return (
    <div className="min-h-screen pb-20 max-w-lg mx-auto">
      <Navbar walletBalance={wallet?.balance_cents} familyName={account.nom_compte} />

      {/* Header profil parent */}
      <div className="px-4 pt-6 pb-4" style={{ background: "linear-gradient(135deg, var(--menu-panda-start), var(--menu-panda-end))" }}>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl font-bold text-white" style={{ background: "rgba(255,255,255,0.2)" }}>
            {account.nom_compte.charAt(0).toUpperCase()}
          </div>
          <div className="text-white">
            <h1 className="text-lg font-bold">{account.nom_compte}</h1>
            <p className="text-sm opacity-80">{userEmail}</p>
            {account.source_group && (
              <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-white/20">
                {SG_LABELS[account.source_group] || account.source_group}
                {account.source_detail && ` · ${account.source_detail}`}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-4 mt-4">
          <div className="flex-1 rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,0.15)" }}>
            <p className="text-2xl font-bold text-white">{orderCount}</p>
            <p className="text-xs text-white/70">commandes</p>
          </div>
          <div className="flex-1 rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,0.15)" }}>
            <p className="text-2xl font-bold text-white">{activeProfils.length}</p>
            <p className="text-xs text-white/70">profils actifs</p>
          </div>
          <div className="flex-1 rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,0.15)" }}>
            <p className="text-2xl font-bold text-white">{wallet ? fmtPrice(wallet.balance_cents) : "—"}</p>
            <p className="text-xs text-white/70">wallet</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b" style={{ borderColor: "var(--border)" }}>
        <button onClick={() => setTab("profils")}
          className={`flex-1 py-3 text-sm font-semibold text-center border-b-2 transition-colors ${tab === "profils" ? "" : "border-transparent"}`}
          style={tab === "profils" ? { borderColor: "var(--accent)", color: "var(--accent)" } : { color: "var(--ink-soft)" }}>
          Profils enfants
        </button>
        <button onClick={() => setTab("wallet")}
          className={`flex-1 py-3 text-sm font-semibold text-center border-b-2 transition-colors ${tab === "wallet" ? "" : "border-transparent"}`}
          style={tab === "wallet" ? { borderColor: "var(--accent)", color: "var(--accent)" } : { color: "var(--ink-soft)" }}>
          Panda Wallet
        </button>
      </div>

      {/* Tab: Profils */}
      {tab === "profils" && (
        <div className="px-4 py-4 space-y-3">
          {activeProfils.map(p => (
            <div key={p.id} className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{p.prenom}</span>
                    {p.is_default && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: "#DCFCE7", color: "#166534" }}>par défaut</span>}
                  </div>
                  {p.classe && <p className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>{CL[p.classe] || p.classe}</p>}
                  {p.notes_allergies && <p className="text-xs mt-1" style={{ color: "#B45309" }}>⚠ {p.notes_allergies}</p>}
                </div>
                <button onClick={() => toggleProfil(p.id, false)} className="text-xs underline" style={{ color: "var(--ink-soft)" }}>Désactiver</button>
              </div>
            </div>
          ))}

          {inactiveProfils.length > 0 && (
            <div className="pt-2">
              <p className="text-xs font-semibold mb-2" style={{ color: "var(--ink-soft)" }}>Profils désactivés</p>
              {inactiveProfils.map(p => (
                <div key={p.id} className="flex items-center justify-between py-2 px-3 rounded-lg mb-1" style={{ background: "var(--bg-alt)" }}>
                  <span className="text-sm" style={{ color: "var(--ink-soft)" }}>{p.prenom}</span>
                  <button onClick={() => toggleProfil(p.id, true)} className="text-xs font-medium" style={{ color: "var(--accent)" }}>Réactiver</button>
                </div>
              ))}
            </div>
          )}

          {/* Ajouter profil */}
          {!showAddProfil ? (
            <button onClick={() => setShowAddProfil(true)} className="w-full h-12 rounded-xl font-semibold border border-dashed text-sm"
              style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
              + Ajouter un profil
            </button>
          ) : (
            <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--accent)", background: "var(--card)" }}>
              <h3 className="font-bold text-sm">Nouveau profil</h3>
              <div>
                <label className="text-xs font-medium" style={{ color: "var(--ink-soft)" }}>Prénom</label>
                <input type="text" value={newPrenom} onChange={e => setNewPrenom(e.target.value)} placeholder="Prénom de l'enfant"
                  className="w-full mt-1 h-10 px-3 rounded-lg border text-sm" style={{ borderColor: "var(--border)" }} />
              </div>
              <div>
                <label className="text-xs font-medium" style={{ color: "var(--ink-soft)" }}>Classe</label>
                <select value={newClasse} onChange={e => setNewClasse(e.target.value)}
                  className="w-full mt-1 h-10 px-3 rounded-lg border text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                  <option value="">— choisir —</option>
                  <option value="maternelle">Maternelle</option>
                  <option value="primaire">Primaire</option>
                  <option value="college">Collège</option>
                  <option value="lycee">Lycée</option>
                  <option value="prof">Prof / Équipe</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium" style={{ color: "var(--ink-soft)" }}>Allergies / notes</label>
                <input type="text" value={newAllergies} onChange={e => setNewAllergies(e.target.value)} placeholder="Ex: sans gluten, allergie arachide..."
                  className="w-full mt-1 h-10 px-3 rounded-lg border text-sm" style={{ borderColor: "var(--border)" }} />
              </div>
              <div className="flex gap-2">
                <button onClick={addProfil} disabled={saving || !newPrenom.trim()}
                  className="flex-1 h-10 rounded-lg font-semibold text-white text-sm disabled:opacity-50" style={{ background: "var(--accent)" }}>
                  {saving ? "..." : "Ajouter"}
                </button>
                <button onClick={() => setShowAddProfil(false)} className="h-10 px-4 rounded-lg text-sm border" style={{ borderColor: "var(--border)" }}>
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Wallet */}
      {tab === "wallet" && (
        <div className="px-4 py-4">
          {/* Solde */}
          <div className="rounded-xl p-5 mb-4 text-center" style={{ background: "var(--bg-alt)" }}>
            <img src={WALLET_IMG} alt="Panda Wallet" className="w-16 h-16 rounded-full object-cover mx-auto mb-3" />
            <p className="text-3xl font-bold" style={{ color: "var(--accent-2)" }}>
              {wallet ? fmtPrice(wallet.balance_cents) : "0,00 €"}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>Solde disponible</p>
            {wallet && (
              <div className="flex justify-center gap-6 mt-3 text-xs" style={{ color: "var(--ink-soft)" }}>
                <span>Crédité : {fmtPrice(wallet.total_credited_cents)}</span>
                <span>Débité : {fmtPrice(wallet.total_debited_cents)}</span>
              </div>
            )}
          </div>

          {/* Recharger */}
          <Link href="/recharger" className="block w-full h-12 rounded-xl font-semibold text-white text-center leading-[3rem] mb-4"
            style={{ background: "var(--accent-2)" }}>
            Recharger mon wallet
          </Link>

          {/* Historique transactions */}
          <h2 className="font-bold text-sm mb-2" style={{ color: "var(--ink)" }}>Historique</h2>
          {walletTransactions.length === 0 ? (
            <p className="text-sm py-4 text-center" style={{ color: "var(--ink-soft)" }}>Aucune transaction.</p>
          ) : (
            <div className="space-y-1">
              {walletTransactions.map(tx => {
                const info = TX_LABELS[tx.type] || TX_LABELS.adjustment
                const isPositive = tx.amount_cents > 0
                return (
                  <div key={tx.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg" style={{ background: "var(--card)" }}>
                    <div>
                      <p className="text-sm font-medium">{info.label}</p>
                      {tx.description && <p className="text-xs" style={{ color: "var(--ink-soft)" }}>{tx.description}</p>}
                      <p className="text-[10px]" style={{ color: "var(--ink-soft)" }}>{fmtDateShort(tx.created_at)}</p>
                    </div>
                    <span className="font-bold text-sm" style={{ color: info.color }}>
                      {isPositive ? "+" : "-"}{fmtPrice(tx.amount_cents)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Navigation bas */}
      <div className="px-4 mt-6 space-y-2">
        <Link href="/mes-commandes" className="block w-full h-11 rounded-xl font-semibold text-center leading-[2.75rem] border text-sm"
          style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
          Mes commandes
        </Link>
        <Link href="/commander" className="block w-full h-11 rounded-xl font-semibold text-white text-center leading-[2.75rem] text-sm"
          style={{ background: "var(--accent)" }}>
          Commander
        </Link>
      </div>
    </div>
  )
}
