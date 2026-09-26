"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  classifySections,
  headerCounts,
  isPaid,
  isToCollect,
  itemLine,
  type SvcOrder,
} from "@/lib/service-du-jour"

// PS-06b — Vue « Service du jour ». Mobile-first 430 px, Fredoka, un écran = un service.
// Les règles (production / encaissement / CA / test / tri) vivent dans src/lib/service-du-jour,
// testées ; ce composant ne fait que les afficher et déclencher les actions admin.

interface Slot {
  id: string
  service_date: string
  orders_cutoff_at: string | null
  cutoff_passed: boolean
  delivery_point: string | null
}
interface Nav { prev: string | null; next: string | null }
interface ServicePayload { slot: Slot | null; nav: Nav; orders: SvcOrder[] }

function euro(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`
}
function jourLong(iso: string): string {
  const d = new Date(iso + "T12:00:00")
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" })
}
function heureCourte(iso: string | null): string {
  if (!iso) return ""
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Martinique" })
}

export function DashboardClient({ userEmail }: { userEmail: string }) {
  const [data, setData] = useState<ServicePayload | null>(null)
  const [date, setDate] = useState<string | null>(null)   // null = laisser le serveur choisir le prochain
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [showNonPayees, setShowNonPayees] = useState(false)
  const [showAnnulees, setShowAnnulees] = useState(false)
  const [showTest, setShowTest] = useState(false)
  const [encaisserFor, setEncaisserFor] = useState<string | null>(null)

  const load = useCallback(async (d: string | null) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/admin/service${d ? `?date=${d}` : ""}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Erreur")
      setData(json)
      setDate(json.slot?.service_date ?? null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(date) }, [date, load])

  const orders = data?.orders ?? []
  const counts = useMemo(() => headerCounts(orders), [orders])
  const sections = useMemo(() => classifySections(orders), [orders])
  const slot = data?.slot ?? null

  async function markPrepared(id: string, prepared: boolean) {
    setBusyId(id)
    try {
      const res = await fetch("/api/admin/mark-prepared", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: id, prepared }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || "Erreur"); return }
      await load(date)
    } finally { setBusyId(null) }
  }

  async function markPaid(id: string, mode: "especes" | "cb_sumup") {
    setBusyId(id)
    try {
      const res = await fetch("/api/admin/mark-paid", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: id, mode }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || "Erreur"); return }
      setEncaisserFor(null)
      await load(date)
    } finally { setBusyId(null) }
  }

  return (
    <div style={S.page}>
      {/* ── Nav admin ── */}
      <nav style={S.nav}>
        <span style={S.navActive}>🥘 Service du jour</span>
        <Link href="/admin/clients" style={S.navLink}>Clients</Link>
        <a href="/calculette-prix-revient-panda-snack.html" style={S.navLink}>Calculette</a>
        <button
          onClick={async () => { await fetch("/api/admin/logout", { method: "POST" }).catch(() => {}); window.location.href = "/admin" }}
          style={S.navLink}
        >Déconnexion</button>
      </nav>
      {userEmail && <p style={S.email}>{userEmail}</p>}

      {/* ── Sélecteur de jour ── */}
      <div style={S.dayNav}>
        <button
          aria-label="Service précédent"
          disabled={!data?.nav.prev}
          onClick={() => data?.nav.prev && setDate(data.nav.prev)}
          style={{ ...S.arrow, opacity: data?.nav.prev ? 1 : 0.3 }}
        >‹</button>
        <span style={S.dayLabel}>{slot ? jourLong(slot.service_date) : "—"}</span>
        <button
          aria-label="Service suivant"
          disabled={!data?.nav.next}
          onClick={() => data?.nav.next && setDate(data.nav.next)}
          style={{ ...S.arrow, opacity: data?.nav.next ? 1 : 0.3 }}
        >›</button>
      </div>

      {/* ── Bandeau cutoff (§11) ── */}
      {slot && (
        <div style={{ ...S.cutoff, background: slot.cutoff_passed ? "var(--bg-alt)" : "#E8F5E9", color: slot.cutoff_passed ? "var(--ink-soft)" : "#166534" }}>
          {slot.cutoff_passed
            ? "🔒 Liste figée — commandes fermées"
            : `🟢 Commandes ouvertes jusqu'à ${heureCourte(slot.orders_cutoff_at)}`}
        </div>
      )}

      {loading && <p style={S.muted}>Chargement…</p>}
      {error && <p style={S.err}>⚠ {error}</p>}

      {!loading && !error && slot && (
        <>
          {/* ── Compteurs d'en-tête (§2/§10) ── */}
          <div style={S.counts}>
            <div style={S.countBig}><strong>{counts.aPreparer}</strong><span>à préparer</span></div>
            <div style={S.countBig}><strong>{counts.aEncaisser}</strong><span>à encaisser</span></div>
            <div style={S.countBig}><strong>{euro(counts.caCents)}</strong><span>CA</span></div>
          </div>
          {counts.bubbleTea > 0 && <p style={S.bbl}>🧋 {counts.bubbleTea} Bubble Tea à préparer</p>}

          {/* ── CTA (§6) ── */}
          <div style={S.ctaRow}>
            <Link href={`/admin/veille/${slot.service_date}`} style={S.ctaPrimary}>🖨️ Feuille de route</Link>
            <Link href={`/admin/etiquettes/${slot.service_date}`} style={S.ctaSecondary}>🏷️ Étiquettes</Link>
          </div>

          {/* ── À PRÉPARER ── */}
          <h2 style={S.h2}>À préparer ({sections.aPreparer.length})</h2>
          {sections.aPreparer.length === 0 && <p style={S.muted}>Aucune commande à préparer.</p>}
          {sections.aPreparer.map((o) => (
            <OrderCard
              key={o.id} o={o} busy={busyId === o.id}
              encaisserOpen={encaisserFor === o.id}
              onEncaisserToggle={() => setEncaisserFor(encaisserFor === o.id ? null : o.id)}
              onMarkPaid={markPaid} onMarkPrepared={markPrepared}
            />
          ))}

          {/* ── NON PAYÉES (§4) ── */}
          {sections.nonPayees.length > 0 && (
            <Collapsible open={showNonPayees} onToggle={() => setShowNonPayees(!showNonPayees)}
              title={`Non payées (${sections.nonPayees.length})`} hint="brouillons abandonnés — jamais en production">
              {sections.nonPayees.map((o) => (
                <div key={o.id} style={S.lightRow}>
                  <span><strong>{o.child_prenom}</strong> · {euro(o.total_cents)}</span>
                  <span style={S.muted}>{o.parent_nom} · {heureCourte(o.created_at)}</span>
                </div>
              ))}
            </Collapsible>
          )}

          {/* ── ANNULÉES (§5) ── */}
          {sections.annulees.length > 0 && (
            <Collapsible open={showAnnulees} onToggle={() => setShowAnnulees(!showAnnulees)}
              title={`Annulées (${sections.annulees.length})`} grey>
              {sections.annulees.map((o) => (
                <div key={o.id} style={{ ...S.lightRow, color: "var(--ink-soft)" }}>
                  <span>{o.child_prenom} · {euro(o.total_cents)}</span>
                  <span style={S.muted}>{o.order_number}</span>
                </div>
              ))}
            </Collapsible>
          )}

          {/* ── TEST (§7) ── */}
          {sections.test.length > 0 && (
            <Collapsible open={showTest} onToggle={() => setShowTest(!showTest)}
              title={`Test (${sections.test.length})`} grey hint="comptes internes, hors compteurs">
              {sections.test.map((o) => (
                <div key={o.id} style={{ ...S.lightRow, color: "var(--ink-soft)" }}>
                  <span>{o.child_prenom} · {euro(o.total_cents)}</span>
                  <span style={S.muted}>{o.parent_nom}</span>
                </div>
              ))}
            </Collapsible>
          )}

          <Link href="/admin/historique" style={S.histLink}>📊 Historique (CA par service)</Link>
        </>
      )}

      {!loading && !error && !slot && <p style={S.muted}>Aucun service programmé.</p>}
    </div>
  )
}

// ── Carte commande ──────────────────────────────────────────────────────────

function OrderCard({
  o, busy, encaisserOpen, onEncaisserToggle, onMarkPaid, onMarkPrepared,
}: {
  o: SvcOrder
  busy: boolean
  encaisserOpen: boolean
  onEncaisserToggle: () => void
  onMarkPaid: (id: string, mode: "especes" | "cb_sumup") => void
  onMarkPrepared: (id: string, prepared: boolean) => void
}) {
  const prepared = !!o.prepared_at
  const toCollect = isToCollect(o)
  const paid = isPaid(o)
  const notes: string[] = []
  if (o.notes_allergies) notes.push(`⚠️ ${o.notes_allergies}`)
  if (o.special_request) notes.push(`📝 ${o.special_request}`)

  return (
    <div style={{ ...S.card, opacity: prepared ? 0.55 : 1 }}>
      <div style={S.cardHead}>
        <div>
          <div style={S.childName}>{o.child_prenom}{o.child_classe ? <span style={S.childClasse}> · {o.child_classe}</span> : null}</div>
          <div style={S.parentLine}>
            <Link href={`/admin/clients/${o.account_id}`} style={S.parentLink}>{o.parent_nom}</Link>
            {o.parent_telephone && <> · <a href={`tel:${o.parent_telephone}`} style={S.tel}>📞 {o.parent_telephone}</a></>}
          </div>
        </div>
        {paid
          ? <span style={S.badgePaid}>✅ Payé</span>
          : toCollect
            ? <span style={S.badgeCollect}>💶 À encaisser</span>
            : <span style={S.badgeMuted}>—</span>}
      </div>

      <ul style={S.items}>
        {o.items.map((it, i) => {
          const { label, options } = itemLine(it)
          return (
            <li key={i} style={S.itemLi}>
              {it.qty > 1 ? `${it.qty}× ` : ""}{label}
              {options.length > 0 && (
                <span style={S.opts}> — {options.map((op, k) => (
                  <span key={k} style={/piment/i.test(op) ? S.optHot : undefined}>{op}{k < options.length - 1 ? ", " : ""}</span>
                ))}</span>
              )}
            </li>
          )
        })}
      </ul>

      {notes.length > 0 && (
        <div style={S.notes}>{notes.map((n, i) => <div key={i}>{n}</div>)}</div>
      )}

      <div style={S.cardActions}>
        <label style={S.prepLabel}>
          <input type="checkbox" checked={prepared} disabled={busy} onChange={(e) => onMarkPrepared(o.id, e.target.checked)} style={S.checkbox} />
          Préparé
        </label>

        {toCollect && !encaisserOpen && (
          <button onClick={onEncaisserToggle} disabled={busy} style={S.encBtn}>Encaissé…</button>
        )}
        {toCollect && encaisserOpen && (
          <div style={S.modeRow}>
            <span style={S.modeAsk}>Mode&nbsp;:</span>
            <button onClick={() => onMarkPaid(o.id, "especes")} disabled={busy} style={S.modeBtn}>💵 Espèces</button>
            <button onClick={() => onMarkPaid(o.id, "cb_sumup")} disabled={busy} style={S.modeBtn}>💳 CB SumUp</button>
          </div>
        )}
        {paid && o.payment_mode && (
          <span style={S.paidMode}>{o.payment_mode === "especes" ? "💵 espèces" : "💳 CB"}</span>
        )}
      </div>
      <div style={S.orderNum}>{o.order_number}</div>
    </div>
  )
}

function Collapsible({ open, onToggle, title, hint, grey, children }: {
  open: boolean; onToggle: () => void; title: string; hint?: string; grey?: boolean; children: React.ReactNode
}) {
  return (
    <div style={{ marginTop: 16 }}>
      <button onClick={onToggle} style={{ ...S.collapseHead, color: grey ? "var(--ink-soft)" : "var(--ink)" }}>
        <span>{open ? "▾" : "▸"} {title}</span>
        {hint && <span style={S.collapseHint}>{hint}</span>}
      </button>
      {open && <div style={{ marginTop: 8 }}>{children}</div>}
    </div>
  )
}

// ── Styles (charte, Fredoka via globals) ─────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  page: { maxWidth: 460, margin: "0 auto", padding: "12px 14px 40px", fontFamily: "var(--font-display, Fredoka), system-ui, sans-serif", color: "var(--ink)" },
  nav: { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", justifyContent: "space-between" },
  navActive: { fontWeight: 800, fontSize: 15, color: "var(--ink)" },
  navLink: { fontSize: 13, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", textDecoration: "none", padding: "6px 4px" },
  email: { fontSize: 11, color: "var(--ink-soft)", margin: "2px 0 10px" },
  dayNav: { display: "flex", alignItems: "center", justifyContent: "center", gap: 16, margin: "6px 0" },
  arrow: { fontSize: 30, lineHeight: 1, width: 44, height: 44, border: "1px solid var(--border)", borderRadius: 12, background: "var(--bg)", cursor: "pointer", color: "var(--ink)" },
  dayLabel: { fontSize: 22, fontWeight: 800, minWidth: 140, textAlign: "center", textTransform: "capitalize" },
  cutoff: { textAlign: "center", fontSize: 13, fontWeight: 600, borderRadius: 10, padding: "6px 10px", margin: "4px 0 12px" },
  counts: { display: "flex", gap: 8 },
  countBig: { flex: 1, background: "var(--bg-alt)", borderRadius: 14, padding: "12px 6px", textAlign: "center", display: "flex", flexDirection: "column", gap: 2 },
  bbl: { textAlign: "center", fontSize: 14, fontWeight: 600, margin: "8px 0 0" },
  ctaRow: { display: "flex", gap: 8, margin: "14px 0 4px" },
  ctaPrimary: { flex: 2, textAlign: "center", background: "var(--accent)", color: "#fff", fontWeight: 700, borderRadius: 12, padding: "12px", textDecoration: "none", minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" },
  ctaSecondary: { flex: 1, textAlign: "center", background: "var(--bg-alt)", color: "var(--ink)", fontWeight: 700, borderRadius: 12, padding: "12px", textDecoration: "none", minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--border)" },
  h2: { fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--ink-soft)", margin: "20px 0 8px" },
  muted: { color: "var(--ink-soft)", fontSize: 14 },
  err: { color: "#DC2626", fontSize: 14 },
  card: { border: "1px solid var(--border)", borderRadius: 16, padding: 14, marginBottom: 10, background: "var(--card, #fff)" },
  cardHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  childName: { fontSize: 20, fontWeight: 800, lineHeight: 1.1 },
  childClasse: { fontSize: 13, fontWeight: 500, color: "var(--ink-soft)" },
  parentLine: { fontSize: 12, color: "var(--ink-soft)", marginTop: 2 },
  parentLink: { color: "var(--accent)", textDecoration: "none" },
  tel: { color: "var(--accent)", textDecoration: "none", whiteSpace: "nowrap" },
  badgePaid: { fontSize: 12, fontWeight: 700, color: "#166534", background: "#DCFCE7", borderRadius: 999, padding: "4px 10px", whiteSpace: "nowrap" },
  badgeCollect: { fontSize: 12, fontWeight: 700, color: "#92400E", background: "#FEF3E2", borderRadius: 999, padding: "4px 10px", whiteSpace: "nowrap" },
  badgeMuted: { fontSize: 12, color: "var(--ink-soft)" },
  items: { listStyle: "none", padding: 0, margin: "10px 0 0", fontSize: 15, lineHeight: 1.5 },
  itemLi: { padding: "2px 0" },
  opts: { color: "var(--ink-soft)", fontSize: 14 },
  optHot: { color: "#C2410C", fontWeight: 700 },
  notes: { marginTop: 8, background: "#FEF3E2", border: "1px solid #F5D5A0", borderRadius: 10, padding: "6px 10px", fontSize: 13, color: "#92400E" },
  cardActions: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 12, flexWrap: "wrap" },
  prepLabel: { display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 600, minHeight: 44, cursor: "pointer" },
  checkbox: { width: 22, height: 22 },
  encBtn: { background: "#92400E", color: "#fff", fontWeight: 700, border: "none", borderRadius: 10, padding: "10px 14px", minHeight: 44, cursor: "pointer" },
  modeRow: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  modeAsk: { fontSize: 13, color: "var(--ink-soft)" },
  modeBtn: { background: "var(--bg-alt)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 10px", minHeight: 44, fontWeight: 600, cursor: "pointer", color: "var(--ink)" },
  paidMode: { fontSize: 12, color: "var(--ink-soft)" },
  orderNum: { fontSize: 10, color: "var(--ink-soft)", marginTop: 8, textAlign: "right" },
  lightRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: "var(--bg-alt)", borderRadius: 8, marginBottom: 4, fontSize: 14 },
  collapseHead: { width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", padding: "10px 0", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  collapseHint: { fontSize: 11, fontWeight: 400, color: "var(--ink-soft)" },
  histLink: { display: "block", textAlign: "center", marginTop: 24, fontSize: 14, color: "var(--accent)", textDecoration: "none" },
}
