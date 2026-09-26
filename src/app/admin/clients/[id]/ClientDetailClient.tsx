"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { bonusForAmount, type RechargeTier } from "@/lib/wallet-bonus"

interface Profil { id: string; prenom: string; classe: string | null; active: boolean; archived_at: string | null; type_profil: string | null; notes_allergies: string | null }
interface Tx { id: string; type: string; amount_cents: number; balance_after_cents: number; description: string | null; stripe_payment_intent_id: string | null; created_at: string }
interface OrderRow { id: string; order_number: string; status: string; payment_method: string | null; total_cents: number; service_date: string | null; created_at: string }
interface Payload {
  account: { id: string; nom_compte: string; email: string; telephone: string | null; is_test: boolean; panda_id: string | null }
  profils: Profil[]
  wallet: { balance_cents: number; total_credited_cents: number; total_debited_cents: number } | null
  transactions: Tx[]
  orders: OrderRow[]
  bonus_tiers: RechargeTier[]
}

function euro(c: number) { return `${(c / 100).toFixed(2).replace(".", ",")} €` }
function dt(iso: string) { return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) }
function jour(iso: string | null) { return iso ? new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—" }

const TX_LABEL: Record<string, string> = {
  credit_purchase: "Recharge CB", credit_stripe: "Recharge CB", debit_order: "Commande",
  refund: "Remboursement", adjustment: "Crédit comptoir",
}
const STATUS_LABEL: Record<string, string> = { paid: "payé", pending_payment: "en attente", cancelled: "annulé" }

export function ClientDetailClient({ accountId }: { accountId: string }) {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Formulaire crédit manuel
  const [montant, setMontant] = useState("")        // en euros, saisie libre
  const [mode, setMode] = useState("especes")
  const [note, setNote] = useState("")
  const [applyBonus, setApplyBonus] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(`/api/admin/clients/${accountId}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Erreur")
      setData(json)
    } catch (e) { setError((e as Error).message) }
  }, [accountId])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const amountCents = useMemo(() => {
    const n = parseFloat(montant.replace(",", "."))
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0
  }, [montant])
  const suggestedBonus = useMemo(
    () => bonusForAmount(amountCents, data?.bonus_tiers || []),
    [amountCents, data?.bonus_tiers]
  )
  const bonusCents = suggestedBonus > 0 && applyBonus ? suggestedBonus : 0

  async function crediter() {
    if (amountCents <= 0) { setMsg({ ok: false, text: "Montant invalide." }); return }
    setSaving(true); setMsg(null)
    try {
      const res = await fetch("/api/admin/wallet/credit", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ accountId, amountCents, bonusCents, mode, note: note.trim() || null }),
      })
      const json = await res.json()
      if (!res.ok) { setMsg({ ok: false, text: json.error || "Erreur" }); return }
      setMsg({ ok: true, text: json.duplicate ? "Déjà crédité." : `Crédité : ${euro(json.total_credit_cents)}.` })
      setMontant(""); setNote(""); setApplyBonus(true)
      await load()
    } catch { setMsg({ ok: false, text: "Erreur réseau" }) }
    finally { setSaving(false) }
  }

  if (error) return <div style={S.page}><Link href="/admin/clients" style={S.back}>← Clients</Link><p style={{ color: "#DC2626" }}>⚠ {error}</p></div>
  if (!data) return <div style={S.page}><Link href="/admin/clients" style={S.back}>← Clients</Link><p style={S.muted}>Chargement…</p></div>

  const { account, profils, wallet, transactions, orders } = data
  const enfantsActifs = profils.filter((p) => p.active && !p.archived_at && p.type_profil === "eleve")
  const autres = profils.filter((p) => !(p.active && !p.archived_at && p.type_profil === "eleve"))

  return (
    <div style={S.page}>
      <Link href="/admin/clients" style={S.back}>← Clients</Link>
      <h1 style={S.h1}>{account.nom_compte}{account.is_test && <span style={S.testTag}> TEST</span>}</h1>
      <p style={S.sub}>{account.email}{account.telephone ? <> · <a href={`tel:${account.telephone}`} style={S.tel}>{account.telephone}</a></> : null}</p>

      {/* Solde */}
      <div style={S.soldeBox}>
        <div><span style={S.soldeBig}>{euro(wallet?.balance_cents || 0)}</span><span style={S.soldeLbl}> solde</span></div>
        <div style={S.muted}>crédité {euro(wallet?.total_credited_cents || 0)} · dépensé {euro(wallet?.total_debited_cents || 0)}</div>
      </div>

      {/* Crédit manuel */}
      <section style={S.creditBox}>
        <h2 style={S.h2}>Créditer le wallet</h2>
        <label style={S.label}>Montant reçu (€)
          <input inputMode="decimal" value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="50" style={S.input} />
        </label>
        <div style={S.modeRow}>
          {[["especes", "💵 Espèces"], ["virement", "🏦 Virement"], ["cb_sumup", "💳 CB SumUp"]].map(([v, l]) => (
            <button key={v} onClick={() => setMode(v)} style={{ ...S.modeBtn, ...(mode === v ? S.modeOn : {}) }}>{l}</button>
          ))}
        </div>
        {suggestedBonus > 0 && (
          <label style={S.bonusRow}>
            <input type="checkbox" checked={applyBonus} onChange={(e) => setApplyBonus(e.target.checked)} style={S.checkbox} />
            Bonus +{euro(suggestedBonus)} à appliquer ?
          </label>
        )}
        <label style={S.label}>Note (optionnel)
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex: règlement de la semaine" style={S.input} />
        </label>
        {amountCents > 0 && (
          <p style={S.recap}>Total crédité : <strong>{euro(amountCents + bonusCents)}</strong>{bonusCents > 0 ? ` (dont bonus ${euro(bonusCents)})` : ""}</p>
        )}
        {msg && <p style={{ fontSize: 13, color: msg.ok ? "#166534" : "#DC2626" }}>{msg.text}</p>}
        <button onClick={crediter} disabled={saving || amountCents <= 0} style={S.creditBtn}>
          {saving ? "…" : "Créditer"}
        </button>
      </section>

      {/* Enfants */}
      <h2 style={S.h2}>Enfants</h2>
      {enfantsActifs.map((p) => (
        <div key={p.id} style={S.row}><span><strong>{p.prenom}</strong>{p.classe ? ` · ${p.classe}` : ""}</span>{p.notes_allergies && <span style={S.allerg}>⚠️ {p.notes_allergies}</span>}</div>
      ))}
      {enfantsActifs.length === 0 && <p style={S.muted}>Aucun enfant actif.</p>}
      {autres.map((p) => (
        <div key={p.id} style={{ ...S.row, color: "var(--ink-soft)" }}><span>{p.prenom}</span><span style={S.muted}>{p.archived_at ? "archivé" : p.type_profil !== "eleve" ? "compte parent" : "inactif"}</span></div>
      ))}

      {/* Wallet historique */}
      <h2 style={S.h2}>Historique wallet</h2>
      {transactions.length === 0 && <p style={S.muted}>Aucune transaction.</p>}
      {transactions.map((t) => (
        <div key={t.id} style={S.txRow}>
          <div>
            <div style={{ fontWeight: 600 }}>{TX_LABEL[t.type] || t.type} <span style={{ color: t.amount_cents < 0 ? "#DC2626" : "#166534" }}>{t.amount_cents < 0 ? "" : "+"}{euro(t.amount_cents)}</span></div>
            {t.description && <div style={S.muted}>{t.description}</div>}
            <div style={S.txMeta}>{dt(t.created_at)} · solde {euro(t.balance_after_cents)}{t.stripe_payment_intent_id ? ` · ${t.stripe_payment_intent_id.slice(0, 18)}…` : ""}</div>
          </div>
        </div>
      ))}

      {/* Commandes */}
      <h2 style={S.h2}>Commandes</h2>
      {orders.length === 0 && <p style={S.muted}>Aucune commande.</p>}
      {orders.map((o) => (
        <div key={o.id} style={S.row}>
          <span>{o.order_number} · {jour(o.service_date)}</span>
          <span style={S.muted}>{STATUS_LABEL[o.status] || o.status} · {euro(o.total_cents)}</span>
        </div>
      ))}
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  page: { maxWidth: 460, margin: "0 auto", padding: "16px 14px 40px", fontFamily: "var(--font-display, Fredoka), system-ui, sans-serif", color: "var(--ink)" },
  back: { color: "var(--accent)", textDecoration: "none", fontSize: 14 },
  h1: { fontSize: 22, fontWeight: 800, margin: "12px 0 2px" },
  h2: { fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--ink-soft)", margin: "22px 0 8px" },
  sub: { fontSize: 13, color: "var(--ink-soft)", margin: 0 },
  tel: { color: "var(--accent)", textDecoration: "none" },
  testTag: { fontSize: 11, color: "var(--ink-soft)", fontWeight: 700 },
  muted: { color: "var(--ink-soft)", fontSize: 13 },
  soldeBox: { background: "var(--bg-alt)", borderRadius: 14, padding: 14, marginTop: 12 },
  soldeBig: { fontSize: 26, fontWeight: 800, color: "var(--accent-2, #5A7F42)" },
  soldeLbl: { fontSize: 14, color: "var(--ink-soft)" },
  creditBox: { border: "1px solid var(--accent)", borderRadius: 14, padding: 14, marginTop: 16, background: "#FEF3E2" },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "var(--ink-soft)", marginTop: 10 },
  input: { width: "100%", height: 44, padding: "0 12px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 16, marginTop: 4, background: "var(--bg)", color: "var(--ink)" },
  modeRow: { display: "flex", gap: 6, marginTop: 10 },
  modeBtn: { flex: 1, minHeight: 44, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "var(--ink)" },
  modeOn: { background: "var(--accent)", color: "#fff", borderColor: "transparent" },
  bonusRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, marginTop: 12, minHeight: 44 },
  checkbox: { width: 22, height: 22 },
  recap: { fontSize: 14, margin: "10px 0 4px" },
  creditBtn: { width: "100%", minHeight: 48, marginTop: 10, background: "var(--accent)", color: "#fff", fontWeight: 800, fontSize: 16, border: "none", borderRadius: 12, cursor: "pointer" },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "10px 0", borderBottom: "1px solid var(--border)", fontSize: 14 },
  allerg: { fontSize: 12, color: "#B45309" },
  txRow: { padding: "10px 0", borderBottom: "1px solid var(--border)", fontSize: 14 },
  txMeta: { fontSize: 11, color: "var(--ink-soft)", marginTop: 2 },
}
