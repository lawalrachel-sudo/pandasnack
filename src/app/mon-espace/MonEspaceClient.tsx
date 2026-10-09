"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { groupBonusByChild, fmtBonusDate, type BonusRow } from "@/lib/panda-bonus"
import { useSearchParams } from "next/navigation"
import { Navbar } from "@/components/Navbar"
import { HeaderMetier } from "@/components/HeaderMetier"
import type { EleveProposable } from "@/lib/eleves-connus"
import { plafondLabel, PLAFOND_MAX_CENTS, PLAFOND_STEP_CENTS } from "@/lib/plafond"
import { isValidIban, maskIban } from "@/lib/iban"
import { PasswordInput } from "@/components/PasswordInput"

const WALLET_IMG = "https://res.cloudinary.com/dbkpvp9ts/image/upload/v1776714727/PANDA_WALLET.jpg"
// BUG B — labels classe scolaires + créneaux pandattitude
const CL: Record<string, string> = { maternelle: "Maternelle", primaire: "Primaire", college: "Collège", lycee: "Lycée", prof: "Prof/Équipe", mercredi: "Mercredi", vendredi: "Vendredi", samedi: "Samedi" }
const SG_LABELS: Record<string, string> = { ecole_la_patience: "École", pandattitude: "Pandattitude", panda_guest: "Panda Guest" }
const TX_LABELS: Record<string, { label: string; color: string }> = {
  credit_purchase: { label: "Recharge", color: "#166534" },
  credit_stripe: { label: "Recharge CB", color: "#166534" },
  debit_order: { label: "Commande", color: "#DC2626" },
  refund: { label: "Remboursement", color: "#0E7490" },
  adjustment: { label: "Ajustement", color: "#6B7280" },
  // PS-08b — débits/remboursements comptoir (Panda Wallet au comptoir).
  debit_boutique: { label: "Comptoir", color: "#DC2626" },
  refund_boutique: { label: "Remb. comptoir", color: "#0E7490" },
}

function fmtPrice(c: number): string { return `${(Math.abs(c) / 100).toFixed(2).replace(".", ",")} €` }
function fmtDateShort(d: string): string {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })
}

interface Profil { id: string; prenom: string; nom?: string | null; classe: string | null; metier: string; is_default: boolean; active: boolean; notes_allergies: string | null; type_profil?: string | null; plafond_gouter_cents?: number | null; devoirs?: boolean | null }
interface ComptoirSale { id: string; sale_number: string; service_date: string; created_at: string; prenom: string | null; items: { name: string; qty: number }[]; payment_mode: string; jeton_qty: number | null; total_cents: number; annulee: boolean }
interface WalletTx { id: string; type: string; amount_cents: number; balance_after_cents: number; description: string | null; created_at: string }

interface Props {
  account: { id: string; nom_compte: string; email: string; telephone: string | null; source_group: string | null; source_detail: string | null; panda_id: string | null; iban: string | null; iban_titulaire: string | null }
  profils: Profil[]
  wallet: { id: string; balance_cents: number; total_credited_cents: number; total_debited_cents: number } | null
  walletTransactions: WalletTx[]
  orderCount: number
  userEmail: string
  pendingCount: number
  pandaBonus: BonusRow[]  // PS-18 — bonus émis (non consommés)
}

export function MonEspaceClient({ account, profils, wallet, walletTransactions, orderCount, userEmail, pendingCount, pandaBonus }: Props) {
  const searchParams = useSearchParams()
  const initialTab = searchParams.get("tab") === "wallet" ? "wallet" : searchParams.get("tab") === "compte" ? "compte" : "profils"
  const [tab, setTab] = useState<"profils" | "wallet" | "compte">(initialTab)
  const [showAddProfil, setShowAddProfil] = useState(false)
  const [newPrenom, setNewPrenom] = useState("")
  const [newNom, setNewNom] = useState("")
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
  const [pwdMsg, setPwdMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)
  const [pwdSaving, setPwdSaving] = useState(false)

  // Modif 6 — Suppression profil (soft delete via archived_at)
  const [pendingDelete, setPendingDelete] = useState<Profil | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function archiveProfil(profilId: string) {
    setDeleting(true)
    try {
      const res = await fetch(`/api/profils?profilId=${profilId}`, { method: "DELETE" })
      const data = await res.json()
      if (res.ok) {
        setPendingDelete(null)
        window.location.reload()
      } else {
        alert(data.error || "Erreur suppression")
        setDeleting(false)
      }
    } catch {
      alert("Erreur réseau")
      setDeleting(false)
    }
  }

  // G3 — Panda ID copy state
  const [pandaIdCopied, setPandaIdCopied] = useState(false)

  // PS-09a — IBAN de remboursement (Panda Wallet). Masqué après enregistrement.
  const [ibanVal, setIbanVal] = useState(account.iban || "")
  const [ibanTit, setIbanTit] = useState(account.iban_titulaire || "")
  const [ibanSaved, setIbanSaved] = useState<string | null>(account.iban || null)
  const [ibanEditing, setIbanEditing] = useState(!account.iban)
  const [ibanMsg, setIbanMsg] = useState<string | null>(null)
  const [ibanSaving, setIbanSaving] = useState(false)

  async function saveIban() {
    setIbanMsg(null)
    if (!ibanTit.trim()) { setIbanMsg("Indique le titulaire du compte."); return }
    if (!isValidIban(ibanVal)) { setIbanMsg("IBAN invalide."); return }
    setIbanSaving(true)
    try {
      const res = await fetch("/api/account", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iban: ibanVal.trim(), iban_titulaire: ibanTit.trim() }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setIbanMsg(j.error || "Erreur"); return }
      setIbanSaved(ibanVal.replace(/\s+/g, "").toUpperCase())
      setIbanEditing(false)
    } finally { setIbanSaving(false) }
  }

  // PS-08b — plafond goûter par enfant (édition locale + enregistrement au relâchement).
  const [plafonds, setPlafonds] = useState<Record<string, number | null>>(
    () => Object.fromEntries(profils.map((p) => [p.id, p.plafond_gouter_cents ?? null])),
  )
  const [plafondSaved, setPlafondSaved] = useState<Record<string, boolean>>({})
  const [showPlafondInfo, setShowPlafondInfo] = useState(false)

  // PS-10a — complétion du nom manquant (bandeau non bloquant).
  const [nomEdits, setNomEdits] = useState<Record<string, string>>({})
  async function saveNom(profilId: string) {
    const v = (nomEdits[profilId] || "").trim()
    if (!v) return
    const res = await fetch("/api/profils", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profilId, nom: v }),
    })
    if (res.ok) window.location.reload()
    else alert("Erreur lors de l'enregistrement du nom")
  }

  async function savePlafond(profilId: string, cents: number | null) {
    setPlafonds((s) => ({ ...s, [profilId]: cents }))
    try {
      const res = await fetch("/api/profils", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profilId, plafond_gouter_cents: cents }),
      })
      if (res.ok) {
        setPlafondSaved((s) => ({ ...s, [profilId]: true }))
        setTimeout(() => setPlafondSaved((s) => ({ ...s, [profilId]: false })), 1500)
      }
    } catch { /* silencieux : le curseur reflète l'intention */ }
  }

  // PS-08b — historique des achats au comptoir (ventes des enfants du compte).
  const [comptoirSales, setComptoirSales] = useState<ComptoirSale[] | null>(null)
  useEffect(() => {
    if (tab !== "wallet" || comptoirSales !== null) return
    let annule = false
    ;(async () => {
      try {
        const res = await fetch("/api/mon-espace/comptoir")
        const json = await res.json()
        if (!annule && res.ok) setComptoirSales(json.sales || [])
        else if (!annule) setComptoirSales([])
      } catch { if (!annule) setComptoirSales([]) }
    })()
    return () => { annule = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  // Toast pédagogique la première fois qu'on ouvre l'onglet Profils.
  useEffect(() => {
    if (tab !== "profils") return
    try {
      if (!localStorage.getItem("ps_plafond_seen")) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setShowPlafondInfo(true)
        localStorage.setItem("ps_plafond_seen", "1")
      }
    } catch { /* localStorage indisponible : pas de toast, pas d'erreur */ }
  }, [tab])
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

  // PS-05c — « Ajouter un enfant » : on propose d'abord les élèves de la liste officielle
  // rattachés à l'e-mail du compte et pas encore ajoutés. Saisie manuelle en repli.
  const [eleves, setEleves] = useState<EleveProposable[] | null>(null)
  const [coches, setCoches] = useState<Record<string, boolean>>({})
  const [creneaux, setCreneaux] = useState<Record<string, string>>({})
  const [elevesMsg, setElevesMsg] = useState<string | null>(null)

  useEffect(() => {
    if (tab !== "profils" || eleves !== null) return
    let annule = false
    ;(async () => {
      try {
        const res = await fetch("/api/eleves-connus")
        const data = await res.json()
        if (annule) return
        const list: EleveProposable[] = res.ok ? data.eleves || [] : []
        setEleves(list)
        setCoches(Object.fromEntries(list.map(e => [e.id, true])))
        setCreneaux(Object.fromEntries(list.map(e => [e.id, e.classe || ""])))
      } catch {
        if (!annule) setEleves([])
      }
    })()
    return () => { annule = true }
  }, [tab, eleves])

  async function addElevesConnus() {
    const choisis = (eleves || []).filter(e => coches[e.id])
    if (choisis.length === 0) { setElevesMsg("Coche au moins un enfant."); return }
    const sansCreneau = choisis.find(e => !creneaux[e.id])
    if (sansCreneau) { setElevesMsg(`Choisis le créneau pour ${sansCreneau.prenom}.`); return }
    setSaving(true)
    setElevesMsg(null)
    try {
      const res = await fetch("/api/eleves-connus", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eleves: choisis.map(e => ({ id: e.id, classe: creneaux[e.id] })) }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) window.location.reload()
      else setElevesMsg(data.error || "Erreur lors de l'ajout")
    } catch { setElevesMsg("Erreur réseau") }
    setSaving(false)
  }

  async function addProfil() {
    if (!newPrenom.trim() || !newNom.trim()) return
    setSaving(true)
    try {
      const res = await fetch("/api/profils", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prenom: newPrenom.trim(), nom: newNom.trim(), classe: newClasse || null, notes_allergies: newAllergies.trim() || null }),
      })
      if (res.ok) window.location.reload()
      else alert("Erreur lors de l'ajout")
    } catch { alert("Erreur réseau") }
    setSaving(false)
  }

  async function toggleProfil(profilId: string, active: boolean) {
    const res = await fetch("/api/profils", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profilId, active }) })
    if (res.ok) { window.location.reload(); return }
    const data = await res.json().catch(() => ({}))
    alert(data.error || "Erreur lors de la modification du profil")
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
    <div className="min-h-screen pb-28 ps-page">
      <Navbar walletBalance={wallet?.balance_cents} familyName={account.nom_compte} pendingCount={pendingCount} />
      <HeaderMetier sg={account.source_group} />

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

      {/* PS-18 — Mes bonus (🎁) : un badge par bonus émis non consommé, avec l'enfant et le libellé. */}
      {pandaBonus.length > 0 && (
        <div className="px-4 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <p className="text-sm font-bold mb-2" style={{ color: "var(--ink)" }}>🎁 Mes bonus</p>
          <div className="flex flex-col gap-2">
            {groupBonusByChild(pandaBonus).map((g) => (
              <div key={g.prenom} className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{g.prenom}</span>
                {g.items.map((it, i) => (
                  <span key={i} className="text-xs font-semibold rounded-full px-3 py-1" style={{ background: "#FEF3E2", color: "#92400E", border: "1px solid #F5D5A0" }}>🎁 {it.libelle} · valable jusqu&apos;au {fmtBonusDate(it.valideJusquAu)}</span>
                ))}
              </div>
            ))}
          </div>
          <p className="text-[11px] mt-2 leading-snug" style={{ color: "var(--ink-soft)" }}>
            Offert par l&apos;école. S&apos;applique tout seul à ta prochaine commande du produit.
          </p>
        </div>
      )}

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

      {/* Tabs — segmented control en pilules (UX-D). Actif : accent + texte blanc ;
          inactifs : fond bg-alt + bordure. min-h-11 = cible tactile confortable mobile. */}
      <div className="flex gap-2 mb-4">
        {(["profils", "wallet", "compte"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className="flex-1 min-h-11 px-2 py-2.5 text-sm font-semibold text-center rounded-xl transition-colors active:scale-[0.98]"
            style={tab === t
              ? { background: "var(--accent)", color: "#fff" }
              : { background: "var(--bg-alt)", color: "var(--ink-soft)", border: "1px solid var(--border)" }}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* ═══════ Tab: Profils ═══════ */}
      {tab === "profils" && (
        <div className="px-4 py-4 space-y-3">
          {showPlafondInfo && (
            <div className="rounded-xl border p-4 text-sm" style={{ borderColor: "var(--accent)", background: "#FEF3E2", color: "var(--ink)" }}>
              <p className="font-bold mb-1">🍪 Plafond goûter</p>
              <p style={{ color: "var(--ink-soft)" }}>
                Le plafond limite ce que votre enfant peut dépenser au comptoir (goûters, Bubble Tea…) avec le Panda Wallet,
                par jour. Sans plafond, il peut utiliser tout le solde. Les repas précommandés ne comptent pas.
              </p>
              <button onClick={() => setShowPlafondInfo(false)} className="mt-2 text-xs font-semibold" style={{ color: "var(--accent)" }}>J’ai compris</button>
            </div>
          )}
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
                <div className="flex flex-col items-end gap-1">
                  <button onClick={() => toggleProfil(p.id, false)} className="text-xs underline" style={{ color: "var(--ink-soft)" }}>Désactiver</button>

                  <button
                    onClick={() => setPendingDelete(p)}
                    title="Supprimer ce profil"
                    className="text-xs underline"
                    style={{ color: "#DC2626" }}
                  >
                    🗑️ Supprimer
                  </button>
                </div>
              </div>

              {p.type_profil === "eleve" && !p.nom && (
                <div className="mt-3 pt-3 border-t rounded-lg p-2" style={{ borderColor: "var(--border)", background: "#FEF3E2" }}>
                  <p className="text-xs font-semibold mb-1" style={{ color: "#92400E" }}>Complète le nom de {p.prenom}</p>
                  <div className="flex gap-2">
                    <input type="text" placeholder="Nom" value={nomEdits[p.id] ?? ""}
                      onChange={e => setNomEdits(s => ({ ...s, [p.id]: e.target.value }))}
                      className="flex-1 h-9 px-2 rounded-lg border text-sm" style={{ borderColor: "var(--border)" }} />
                    <button onClick={() => saveNom(p.id)} disabled={!(nomEdits[p.id] || "").trim()}
                      className="h-9 px-3 rounded-lg text-white text-sm font-semibold disabled:opacity-50" style={{ background: "var(--accent)" }}>OK</button>
                  </div>
                </div>
              )}

              {/* PS-08b — Plafond goûter par jour (curseur, pas de 0,50 €, « Illimité » = null) */}
              <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold" style={{ color: "var(--ink-soft)" }}>Plafond goûter par jour</span>
                  <span className="text-xs font-bold" style={{ color: (plafonds[p.id] ?? null) === null ? "var(--ink-soft)" : "var(--accent-2)" }}>
                    {plafondLabel(plafonds[p.id] ?? null)}{plafondSaved[p.id] ? " ✓" : ""}
                  </span>
                </div>
                <input
                  type="range" min={0} max={PLAFOND_MAX_CENTS + PLAFOND_STEP_CENTS} step={PLAFOND_STEP_CENTS}
                  value={(plafonds[p.id] ?? null) === null ? PLAFOND_MAX_CENTS + PLAFOND_STEP_CENTS : (plafonds[p.id] as number)}
                  onChange={(e) => {
                    const raw = Number(e.target.value)
                    setPlafonds((s) => ({ ...s, [p.id]: raw > PLAFOND_MAX_CENTS ? null : raw }))
                  }}
                  onPointerUp={() => savePlafond(p.id, plafonds[p.id] ?? null)}
                  onTouchEnd={() => savePlafond(p.id, plafonds[p.id] ?? null)}
                  onKeyUp={() => savePlafond(p.id, plafonds[p.id] ?? null)}
                  className="w-full mt-2"
                  style={{ accentColor: "var(--accent)" }}
                  aria-label={`Plafond goûter de ${p.prenom}`}
                />
                <div className="flex justify-between text-[10px]" style={{ color: "var(--ink-soft)" }}>
                  <span>0 €</span><span>Illimité</span>
                </div>
              </div>
            </div>
          ))}

          {inactiveProfils.length > 0 && (
            <div className="pt-2">
              <p className="text-xs font-semibold mb-2" style={{ color: "var(--ink-soft)" }}>Profils désactivés</p>
              {inactiveProfils.map(p => (
                <div key={p.id} className="flex items-center justify-between py-2 px-3 rounded-lg mb-1" style={{ background: "var(--bg-alt)" }}>
                  <span className="text-sm" style={{ color: "var(--ink-soft)" }}>{p.prenom}</span>
                  {/* PS-05c — le profil du compte parent n'est pas réactivable : il ne
                      commande pas. Seuls les profils enfants peuvent l'être. */}
                  {p.type_profil === "eleve" || account.source_group === "panda_guest" ? (
                    <button onClick={() => toggleProfil(p.id, true)} className="text-xs font-medium" style={{ color: "var(--accent)" }}>Réactiver</button>
                  ) : (
                    <span className="text-[11px]" style={{ color: "var(--ink-soft)" }}>profil du compte</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* PS-05c — élèves inscrits pas encore ajoutés au compte */}
          {eleves && eleves.length > 0 && (
            <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--accent)", background: "#FEF3E2" }}>
              <h3 className="font-bold text-sm">Enfants inscrits cette année</h3>
              <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                Trouvés sur la liste avec ton adresse. Coche ceux à ajouter.
              </p>
              {eleves.map(e => (
                <div key={e.id} className="pt-2 border-t" style={{ borderColor: "#F0DCC4" }}>
                  <label className="flex items-center gap-3 min-h-11 text-sm cursor-pointer">
                    <input type="checkbox" checked={!!coches[e.id]} className="w-5 h-5"
                      onChange={ev => setCoches({ ...coches, [e.id]: ev.target.checked })} />
                    <span><strong>{e.prenom}</strong>{e.nom && <span style={{ color: "var(--ink-soft)" }}> {e.nom}</span>}</span>
                  </label>
                  {coches[e.id] && account.source_group !== "panda_guest" && (
                    <label className="block">
                      <span className="text-xs font-medium" style={{ color: "var(--ink-soft)" }}>
                        {account.source_group === "pandattitude" ? "Créneau cours dessin" : "Classe"}
                      </span>
                      <select value={creneaux[e.id] || ""} onChange={ev => setCreneaux({ ...creneaux, [e.id]: ev.target.value })}
                        className="w-full mt-1 h-11 px-3 rounded-lg border text-sm"
                        style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                        <option value="">— choisir —</option>
                        <option value="mercredi">Mercredi</option>
                        <option value="vendredi">Vendredi</option>
                        <option value="samedi">Samedi</option>
                      </select>
                      {!e.classe && e.classeSource && (
                        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
                          Liste : « {e.classeSource} » — confirme le créneau.
                        </span>
                      )}
                    </label>
                  )}
                </div>
              ))}
              {elevesMsg && <p className="text-xs" style={{ color: "#DC2626" }}>{elevesMsg}</p>}
              <button onClick={addElevesConnus} disabled={saving}
                className="w-full h-11 rounded-lg font-semibold text-white text-sm disabled:opacity-50"
                style={{ background: "var(--accent)" }}>
                {saving ? "..." : "Ajouter au compte"}
              </button>
            </div>
          )}

          {!showAddProfil ? (
            <button onClick={() => setShowAddProfil(true)} className="w-full h-12 rounded-xl font-semibold border border-dashed text-sm"
              style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
              {eleves && eleves.length > 0 ? "+ Ajouter un enfant hors liste" : "+ Ajouter un enfant"}
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
                <label className="text-xs font-medium" style={{ color: "var(--ink-soft)" }}>Nom</label>
                <input type="text" value={newNom} onChange={e => setNewNom(e.target.value)} placeholder="Nom de l'enfant"
                  className="w-full mt-1 h-10 px-3 rounded-lg border text-sm" style={{ borderColor: "var(--border)" }} />
              </div>
              {/* BUG B — dropdown contextualisé selon metier du compte */}
              {(() => {
                const sg = account.source_group
                const isEcole = sg === "ecole_la_patience"
                const isPanda = sg === "pandattitude"
                if (!isEcole && !isPanda) return null  // Panda Guest : pas de classe
                return (
                  <div>
                    <label className="text-xs font-medium" style={{ color: "var(--ink-soft)" }}>
                      {isPanda ? "Créneau cours dessin" : "Classe"}
                    </label>
                    <select value={newClasse} onChange={e => setNewClasse(e.target.value)}
                      className="w-full mt-1 h-10 px-3 rounded-lg border text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                      <option value="">— choisir —</option>
                      {isEcole ? (
                        <>
                          <option value="maternelle">Maternelle</option>
                          <option value="primaire">Primaire</option>
                          <option value="college">Collège</option>
                          <option value="lycee">Lycée</option>
                          <option value="prof">Prof / Équipe</option>
                        </>
                      ) : (
                        <>
                          <option value="mercredi">Mercredi</option>
                          <option value="vendredi">Vendredi</option>
                          <option value="samedi">Samedi</option>
                        </>
                      )}
                    </select>
                  </div>
                )
              })()}
              <div>
                <label className="text-xs font-medium" style={{ color: "var(--ink-soft)" }}>Allergies / notes</label>
                <input type="text" value={newAllergies} onChange={e => setNewAllergies(e.target.value)} placeholder="Ex: sans gluten, allergie arachide..."
                  className="w-full mt-1 h-10 px-3 rounded-lg border text-sm" style={{ borderColor: "var(--border)" }} />
              </div>
              <div className="flex gap-2">
                <button onClick={addProfil} disabled={saving || !newPrenom.trim() || !newNom.trim()}
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

          {/* PS-08b — Achats au comptoir (Panda Wallet / espèces / carte / jeton) */}
          <h2 className="font-bold text-sm mt-6 mb-2" style={{ color: "var(--ink)" }}>Achats au comptoir</h2>
          {comptoirSales === null ? (
            <p className="text-sm py-2 text-center" style={{ color: "var(--ink-soft)" }}>Chargement…</p>
          ) : comptoirSales.length === 0 ? (
            <p className="text-sm py-4 text-center" style={{ color: "var(--ink-soft)" }}>Aucun achat au comptoir.</p>
          ) : (
            <div className="space-y-1">
              {comptoirSales.map(s => {
                const mode = s.payment_mode === "wallet" ? "Panda Wallet" : s.payment_mode === "especes" ? "Espèces" : s.payment_mode === "cb_sumup" ? "Carte" : "Jeton"
                const svcDiff = s.service_date && s.service_date.slice(0, 10) !== s.created_at.slice(0, 10)
                const items = (s.items || []).map(i => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ""}`).join(", ")
                return (
                  <div key={s.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg" style={{ background: "var(--card)" }}>
                    <div style={{ minWidth: 0 }}>
                      <p className="text-sm font-medium" style={{ textDecoration: s.annulee ? "line-through" : "none" }}>
                        {s.prenom || "—"} · {items || "—"}
                      </p>
                      <p className="text-[10px]" style={{ color: "var(--ink-soft)" }}>
                        {fmtDateShort(s.created_at)}{svcDiff ? ` · pour ${new Date(s.service_date + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}` : ""} · {mode}{s.annulee ? " · annulée" : ""}
                      </p>
                    </div>
                    <span className="font-bold text-sm flex-none" style={{ color: s.annulee ? "var(--ink-soft)" : "var(--ink)" }}>
                      {s.payment_mode === "jeton" ? `🎋${s.jeton_qty ?? ""}` : fmtPrice(s.total_cents)}
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

          {/* PS-09a — Compte bancaire pour remboursement */}
          <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            <h3 className="font-bold text-sm" style={{ color: "var(--ink)" }}>Compte bancaire pour remboursement</h3>
            {ibanSaved && !ibanEditing ? (
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium" style={{ letterSpacing: 1 }}>{maskIban(ibanSaved)}</p>
                  {ibanTit && <p className="text-xs" style={{ color: "var(--ink-soft)" }}>{ibanTit}</p>}
                </div>
                <button onClick={() => setIbanEditing(true)} className="text-xs font-semibold" style={{ color: "var(--accent)" }}>Modifier</button>
              </div>
            ) : (
              <>
                <div>
                  <label className="text-xs font-medium" style={{ color: "var(--ink-soft)" }}>Titulaire du compte</label>
                  <input type="text" value={ibanTit} onChange={e => setIbanTit(e.target.value)} placeholder="Prénom Nom"
                    className="w-full mt-1 h-10 px-3 rounded-lg border text-sm" style={{ borderColor: "var(--border)" }} />
                </div>
                <div>
                  <label className="text-xs font-medium" style={{ color: "var(--ink-soft)" }}>IBAN</label>
                  <input type="text" value={ibanVal} onChange={e => setIbanVal(e.target.value)} placeholder="FR76 XXXX XXXX XXXX" autoComplete="off"
                    className="w-full mt-1 h-10 px-3 rounded-lg border text-sm" style={{ borderColor: "var(--border)" }} />
                </div>
                {ibanMsg && <p className="text-xs" style={{ color: "#DC2626" }}>{ibanMsg}</p>}
                <div className="flex gap-2">
                  <button onClick={saveIban} disabled={ibanSaving}
                    className="flex-1 h-10 rounded-lg font-semibold text-white text-sm disabled:opacity-50" style={{ background: "var(--accent-2)" }}>
                    {ibanSaving ? "..." : "Enregistrer"}
                  </button>
                  {ibanSaved && <button onClick={() => { setIbanEditing(false); setIbanVal(ibanSaved); setIbanMsg(null) }} className="h-10 px-4 rounded-lg text-sm border" style={{ borderColor: "var(--border)" }}>Annuler</button>}
                </div>
              </>
            )}
            <p className="text-[11px]" style={{ color: "var(--ink-soft)", lineHeight: 1.5 }}>
              Cet IBAN sert uniquement à te rembourser un solde Panda Wallet (fin d&apos;année scolaire ou départ).
              Aucun prélèvement n&apos;est jamais effectué sur ce compte.
            </p>
          </div>

          {/* Mot de passe */}
          <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            <h3 className="font-bold text-sm" style={{ color: "var(--ink)" }}>Modifier le mot de passe</h3>

            <div>
              <label className="text-xs font-medium" style={{ color: "var(--ink-soft)" }}>Ancien mot de passe</label>
              <PasswordInput value={oldPwd} onChange={e => setOldPwd(e.target.value)}
                wrapperClassName="relative mt-1"
                className="w-full h-10 px-3 rounded-lg border text-sm" style={{ borderColor: "var(--border)" }}
                autoComplete="current-password" />
            </div>

            <div>
              <label className="text-xs font-medium" style={{ color: "var(--ink-soft)" }}>Nouveau mot de passe</label>
              <PasswordInput value={newPwd} onChange={e => setNewPwd(e.target.value)}
                wrapperClassName="relative mt-1"
                className="w-full h-10 px-3 rounded-lg border text-sm" style={{ borderColor: "var(--border)" }}
                autoComplete="new-password" />
            </div>

            <div>
              <label className="text-xs font-medium" style={{ color: "var(--ink-soft)" }}>Confirmer</label>
              <PasswordInput value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
                wrapperClassName="relative mt-1"
                className="w-full h-10 px-3 rounded-lg border text-sm" style={{ borderColor: "var(--border)" }}
                autoComplete="new-password" />
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

      {/* Modif 6 — Modal confirmation suppression profil */}
      {pendingDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4">
          <div className="rounded-2xl max-w-sm w-full p-6" style={{ background: "var(--card)" }}>
            <h3 className="font-bold text-lg mb-2" style={{ color: "var(--ink)" }}>
              Supprimer le profil {pendingDelete.prenom} ?
            </h3>
            <p className="text-sm mb-5" style={{ color: "var(--ink-soft)" }}>
              Cette action est définitive. L&apos;historique de commandes lié au profil reste préservé pour la facturation.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => archiveProfil(pendingDelete.id)}
                disabled={deleting}
                className="w-full h-11 rounded-lg font-semibold text-white text-sm disabled:opacity-50"
                style={{ background: "#DC2626" }}
              >
                {deleting ? "Suppression..." : "Supprimer définitivement"}
              </button>
              <button
                onClick={() => setPendingDelete(null)}
                disabled={deleting}
                className="w-full h-10 rounded-lg text-sm font-medium border"
                style={{ borderColor: "var(--border)", color: "var(--ink-soft)" }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
