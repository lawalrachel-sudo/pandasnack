"use client"

import { useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Navbar } from "@/components/Navbar"

const WALLET_IMG = "https://res.cloudinary.com/dbkpvp9ts/image/upload/v1776714727/PANDA_WALLET.jpg"
const CL: Record<string, string> = { maternelle: "Maternelle", primaire: "Primaire", college: "Collège", lycee: "Lycée", prof: "Prof/Équipe" }
const SG_LABELS: Record<string, string> = { ecole: "École", pandattitude: "Pandattitude", panda_guest: "Panda Guest" }
const TX_LABELS: Record<string, { label: string; color: string }> = {
  credit_purchase: { label: "Recharge", color: "#166534" },
  credit_stripe: { label: "Recharge CB", color: "#166534" },
  debit_order: { label: "Commande", color: "#DC2626" },
  refund: { label: "Remboursement", color: "#0E7490" },
  adjustment: { label: "Ajustement", color: "#6B7280" },
}

function fmtPrice(c: number): string { return `${(Math.abs(c) / 100).toFixed(2).replace(".", ",")} €` }
function fmtDateShort(d: string): string {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  )
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

interface Profil { id: string; prenom: string; classe: string | null; is_default: boolean; active: boolean; notes_allergies: string | null }
interface WalletTx { id: string; type: string; amount_cents: number; balance_after_cents: number; description: string | null; created_at: string }

interface Props {
  account: { id: string; nom_compte: string; email: string; telephone: string | null; source_group: string | null; source_detail: string | null; panda_id: string | null }
  profils: Profil[]
  wallet: { id: string; balance_cents: number; total_credited_cents: number; total_debited_cents: number } | null
  walletTransactions: WalletTx[]
  orderCount: number
  userEmail: string
  pendingCount: number
}

export function MonEspaceClient({ account, profils, wallet, walletTransactions, orderCount, userEmail, pendingCount }: Props) {
  const searchParams = useSearchParams()
  const initialTab = searchParams.get("tab") === "wallet" ? "wallet" : searchParams.get("tab") === "compte" ? "compte" : "profils"
  const [tab, setTab] = useState<"profils" | "wallet" | "compte">(initialTab)
  const [showAddProfil, setShowAddProfil] = useState(false)
  const [newPrenom, setNewPrenom] = useState("")
  const [newClasse, setNewClasse] = useState("")
  const [newAllergies, setNewAllergies] = useState("")
  const [saving, setSaving] = useState(false)

  // Mon Compte state
  const [nomCompte, setNomCompte] = useState(account.nom_compte)
  const [nomSaved, setNomSaved] = useState(false)
  const [phone, setPhone] = useState(account.telephone || "")
  const [phoneSaved, setPhoneSaved] = useState(false)
  const [oldPwd, setOldPwd] = useState("")
  const [newPwd, setNewPwd] = useState("")
  const [confirmPwd, setConfirmPwd] = useState("")
  const [showOldPwd, setShowOldPwd] = useState(false)
  const [showNewPwd, setShowNewPwd] = useState(false)
  const [showConfirmPwd, setShowConfirmPwd] = useState(false)
  const [pwdMsg, setPwdMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)
  const [pwdSaving, setPwdSaving] = useState(false)

  // G3 — Panda ID copy state
  const [pandaIdCopied, setPandaIdCopied] = useState(false)
  async function copyPandaId() {
    if (!account.panda_id) return
    try {
      await navigator.clipboard.writeText(account.panda_id)
      setPandaIdCopied(true)
      setTimeout(() => setPandaIdCopied(false), 2000)
    } catch {
      alert("Impossible de copier — sélectionne et copie manuellement")
    }
  }

  const activeProfils = profils.filter(p => p.active)
  const inactiveProfils = profils.filter(p => !p.active)

  async function addProfil() {
    if (!newPrenom.trim()) return
    setSaving(true)
    try {
      const res = await fetch("/api/profils", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prenom: newPrenom.trim(), classe: newClasse || null, notes_allergies: newAllergies.trim() || null }),
      })
      if (res.ok) window.location.reload()
      else alert("Erreur lors de l'ajout")
    } catch { alert("Erreur réseau") }
    setSaving(false)
  }

  async function toggleProfil(profilId: string, active: boolean) {
    const res = await fetch("/api/profils", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profilId, active }) })
    if (res.ok) window.location.reload()
  }

  async function saveField(field: "phone" | "nom_compte") {
    setSaving(true)
    try {
      const body = field === "phone" ? { phone: phone.trim() } : { nom_compte: nomCompte.trim() }
      const res = await fetch("/api/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      if (res.ok) {
        if (field === "phone") { setPhoneSaved(true); setTimeout(() => setPhoneSaved(false), 2000) }
        else { setNomSaved(true); setTimeout(() => setNomSaved(false), 2000) }
      } else alert("Erreur sauvegarde")
    } catch { alert("Erreur réseau") }
    setSaving(false)
  }

  async function changePassword() {
    setPwdMsg(null)
    if (newPwd.length < 6) { setPwdMsg({ type: "err", text: "Le nouveau mot de passe doit faire au moins 6 caractères" }); return }
    if (newPwd !== confirmPwd) { setPwdMsg({ type: "err", text: "Les mots de passe ne correspondent pas" }); return }
    setPwdSaving(true)
    try {
      const res = await fetch("/api/account", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd }),
      })
      const data = await res.json()
      if (res.ok) { setPwdMsg({ type: "ok", text: "Mot de passe modifié" }); setOldPwd(""); setNewPwd(""); setConfirmPwd("") }
      else setPwdMsg({ type: "err", text: data.error || "Erreur" })
    } catch { setPwdMsg({ type: "err", text: "Erreur réseau" }) }
    setPwdSaving(false)
  }

  const TAB_LABELS = { profils: "Profils", wallet: "Panda Wallet", compte: "Mon compte" } as const

  return (
    <div className="min-h-screen pb-28 max-w-lg mx-auto">
      <Navbar walletBalance={wallet?.balance_cents} familyName={account.nom_compte} pendingCount={pendingCount} />

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
          <div className="flex-1 rounded-xl p-3 text-center flex flex-col items-center justify-center" style={{ background: "rgba(255,255,255,0.15)" }}>
            <img src={WALLET_IMG} alt="" className="w-8 h-8 rounded-full object-cover mb-1" />
            <p className="text-lg font-bold text-white">{wallet ? fmtPrice(wallet.balance_cents) : "—"}</p>
            <p className="text-xs text-white/70">wallet</p>
          </div>
        </div>
      </div>

      {/* G — Encart Mon ID Panda (visible dès l'arrivée) */}
      <div className="px-4 py-4 border-b" style={{ borderColor: "var(--border)", background: "var(--bg-alt)" }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium" style={{ color: "var(--ink-soft)" }}>Mon ID Panda</p>
            <p className="text-2xl font-bold tracking-wider mt-0.5" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: "var(--accent)" }}>
              {account.panda_id || "— en attente —"}
            </p>
          </div>
          <button
            onClick={copyPandaId}
            aria-label="Copier mon ID Panda"
            className="px-4 py-2 rounded-lg text-xs font-semibold text-white whitespace-nowrap transition-colors"
            style={{ background: pandaIdCopied ? "#16A34A" : "var(--accent)" }}
          >
            {pandaIdCopied ? "✓ Copié !" : "Copier"}
          </button>
        </div>
        <p className="text-[11px] mt-2 leading-snug" style={{ color: "var(--ink-soft)" }}>
          Partage cet ID avec mamy, papa, tonton, nounou... ils pourront créditer ton wallet.
        </p>
      </div>

      {/* Tabs — 3 onglets */}
      <div className="flex border-b" style={{ borderColor: "var(--border)" }}>
        {(["profils", "wallet", "compte"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-semibold text-center border-b-2 transition-colors ${tab === t ? "" : "border-transparent"}`}
            style={tab === t ? { borderColor: "var(--accent)", color: "var(--accent)" } : { color: "var(--ink-soft)" }}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* ═══════ Tab: Profils ═══════ */}
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

      {/* ═══════ Tab: Panda Wallet ═══════ */}
      {tab === "wallet" && (
        <div className="px-4 py-4">
          <div className="rounded-xl p-5 mb-4 text-center" style={{ background: "var(--bg-alt)" }}>
            <img src={WALLET_IMG} alt="Panda Wallet" className="w-20 h-20 rounded-full object-cover mx-auto mb-3" />
            <p className="text-3xl font-bold" style={{ color: "var(--accent-2)" }}>
              {wallet ? fmtPrice(wallet.balance_cents) : "0,00 €"}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>Solde disponible</p>
            {wallet && (
              <div className="flex justify-center gap-6 mt-3 text-xs" style={{ color: "var(--ink-soft)" }}>
                <span>Crédité : {fmtPrice(wallet.total_credited_cents)}</span>
                <span>Débité : {fmtPrice(wallet.total_debited_cents)}</span>
              </div>
            )}
          </div>

          <Link href="/recharger" className="block w-full h-12 rounded-xl font-semibold text-white text-center leading-[3rem] mb-4"
            style={{ background: "var(--accent-2)" }}>
            Recharger mon Panda Wallet
          </Link>

          <p className="text-sm text-center mb-4" style={{ color: "var(--ink-soft)" }}>
            Tu peux aussi recharger en espèces ou virement —{" "}
            <Link href="/contact" className="font-bold underline" style={{ color: "var(--accent)" }}>contacte-nous</Link>
          </p>

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

      {/* ═══════ Tab: Mon Compte ═══════ */}
      {tab === "compte" && (
        <div className="px-4 py-4 space-y-6">
          {/* Coordonnées */}
          <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            <h3 className="font-bold text-sm" style={{ color: "var(--ink)" }}>Coordonnées</h3>

            <div>
              <label className="text-xs font-medium" style={{ color: "var(--ink-soft)" }}>Email (identifiant)</label>
              <div className="w-full mt-1 h-10 px-3 rounded-lg border text-sm flex items-center"
                style={{ borderColor: "var(--border)", background: "var(--bg-alt)", color: "var(--ink-soft)" }}>
                {userEmail}
              </div>
              <p className="text-[10px] mt-1" style={{ color: "var(--ink-soft)" }}>Non modifiable — adresse email de connexion</p>
            </div>

            <div>
              <label className="text-xs font-medium" style={{ color: "var(--ink-soft)" }}>Nom du compte</label>
              <div className="flex gap-2 mt-1">
                <input type="text" value={nomCompte} onChange={e => setNomCompte(e.target.value)}
                  className="flex-1 h-10 px-3 rounded-lg border text-sm" style={{ borderColor: "var(--border)" }} />
                <button onClick={() => saveField("nom_compte")} disabled={saving || !nomCompte.trim() || nomCompte === account.nom_compte}
                  className="h-10 px-4 rounded-lg font-semibold text-white text-sm disabled:opacity-50" style={{ background: "var(--accent-2)" }}>
                  {nomSaved ? "✓" : "OK"}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium" style={{ color: "var(--ink-soft)" }}>Téléphone <span style={{ color: "var(--accent)" }}>*</span></label>
              <div className="flex gap-2 mt-1">
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+596 696 ..."
                  className="flex-1 h-10 px-3 rounded-lg border text-sm" style={{ borderColor: "var(--border)" }} />
                <button onClick={() => saveField("phone")} disabled={saving || !phone.trim()}
                  className="h-10 px-4 rounded-lg font-semibold text-white text-sm disabled:opacity-50" style={{ background: "var(--accent-2)" }}>
                  {phoneSaved ? "✓" : "OK"}
                </button>
              </div>
            </div>
          </div>

          {/* Mot de passe */}
          <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            <h3 className="font-bold text-sm" style={{ color: "var(--ink)" }}>Modifier le mot de passe</h3>

            <div>
              <label className="text-xs font-medium" style={{ color: "var(--ink-soft)" }}>Ancien mot de passe</label>
              <div className="relative mt-1">
                <input type={showOldPwd ? "text" : "password"} value={oldPwd} onChange={e => setOldPwd(e.target.value)}
                  className="w-full h-10 px-3 pr-10 rounded-lg border text-sm" style={{ borderColor: "var(--border)" }} />
                <button type="button" onClick={() => setShowOldPwd(!showOldPwd)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded" style={{ color: "var(--ink-soft)" }}>
                  <EyeIcon open={showOldPwd} />
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium" style={{ color: "var(--ink-soft)" }}>Nouveau mot de passe</label>
              <div className="relative mt-1">
                <input type={showNewPwd ? "text" : "password"} value={newPwd} onChange={e => setNewPwd(e.target.value)}
                  className="w-full h-10 px-3 pr-10 rounded-lg border text-sm" style={{ borderColor: "var(--border)" }} />
                <button type="button" onClick={() => setShowNewPwd(!showNewPwd)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded" style={{ color: "var(--ink-soft)" }}>
                  <EyeIcon open={showNewPwd} />
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium" style={{ color: "var(--ink-soft)" }}>Confirmer</label>
              <div className="relative mt-1">
                <input type={showConfirmPwd ? "text" : "password"} value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
                  className="w-full h-10 px-3 pr-10 rounded-lg border text-sm" style={{ borderColor: "var(--border)" }} />
                <button type="button" onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded" style={{ color: "var(--ink-soft)" }}>
                  <EyeIcon open={showConfirmPwd} />
                </button>
              </div>
            </div>

            {pwdMsg && (
              <p className="text-xs font-medium" style={{ color: pwdMsg.type === "ok" ? "#166534" : "#DC2626" }}>{pwdMsg.text}</p>
            )}

            <button onClick={changePassword} disabled={pwdSaving || !oldPwd || !newPwd}
              className="w-full h-10 rounded-lg font-semibold text-white text-sm disabled:opacity-50" style={{ background: "var(--accent)" }}>
              {pwdSaving ? "..." : "Modifier le mot de passe"}
            </button>
          </div>

          {/* Déconnexion */}
          <button onClick={async () => {
            await fetch("/api/account", { method: "DELETE" })
            window.location.href = "/auth"
          }} className="w-full h-10 rounded-lg font-semibold text-sm border" style={{ borderColor: "var(--border)", color: "var(--accent)" }}>
            Se déconnecter
          </button>
        </div>
      )}
    </div>
  )
}
