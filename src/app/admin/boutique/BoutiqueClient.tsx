"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AdminBackButton } from "../AdminBackButton"
import { JETON_OPTIONS, cartTotalCents, type PaymentMode } from "@/lib/comptoir"
import { martiniqueToday } from "@/lib/caisse-date"

interface Variant { id: string; sku: string; name: string; stock_qty: number | null }
interface Article { id: string; sku: string; name: string; price_alone_cents: number; stock_qty: number | null; is_special: boolean; allergens: string[]; parent_id?: string | null; variants?: Variant[] }
// Unité vendable : un article sans variante, ou une variante précise. C'est l'id envoyé à comptoir_sell.
interface Unit { id: string; name: string; unit_price_cents: number; stock_qty: number | null }
interface Enfant { id: string; prenom: string; classe: string | null; account_id: string; plafond_gouter_cents: number | null }
interface Sale { id: string; sale_number: string; prenom: string | null; items: { name: string; qty: number }[]; total_cents: number; payment_mode: string; jeton_qty: number | null; reverses_sale_id: string | null; service_date?: string }
interface ChildCtx { profil_id: string; prenom: string; classe: string | null; account_id: string; balance_cents: number; plafond_gouter_cents: number | null; consumed_cents: number }

function euro(c: number) { return `${(c / 100).toFixed(2).replace(".", ",")} €` }
function uuid() { try { return crypto.randomUUID() } catch { return `k${Date.now()}${Math.random()}` } }
// « sam. 03/10 » à partir d'un AAAA-MM-JJ.
function jourCourt(iso: string): string {
  const d = new Date(iso + "T12:00:00")
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" }).replace(".", "")
}

export function BoutiqueClient() {
  // PS-08a-c — jour de service = jour civil Martinique (pas UTC), cohérent avec le comptoir SQL.
  const today = useMemo(() => martiniqueToday(), [])
  const [articles, setArticles] = useState<Article[]>([])
  const [enfantsJour, setEnfantsJour] = useState<Enfant[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [error, setError] = useState<string | null>(null)

  const [child, setChild] = useState<ChildCtx | null>(null)
  const [q, setQ] = useState("")
  const [results, setResults] = useState<Enfant[]>([])

  const [cart, setCart] = useState<Record<string, number>>({})   // article id → qty
  const [mode, setMode] = useState<PaymentMode>("wallet")
  const [jetonValue, setJetonValue] = useState(5)
  const [sumup, setSumup] = useState("")
  const [idemKey, setIdemKey] = useState(uuid())
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [reverseFor, setReverseFor] = useState<string | null>(null)
  const [variantsFor, setVariantsFor] = useState<Article | null>(null)   // sélecteur de variantes ouvert
  // PS-08a-e — date de service (« pour quand »), défaut = aujourd'hui Martinique.
  const [serviceDate, setServiceDate] = useState<string>(today)
  const [serviceDays, setServiceDays] = useState<string[]>([])
  const [dateOpen, setDateOpen] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(`/api/admin/boutique?date=${today}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Erreur")
      setArticles(json.articles || [])
      setEnfantsJour(json.enfants_du_jour || [])
      setSales(json.sales || [])
      setServiceDays(json.service_days || [])
    } catch (e) { setError((e as Error).message) }
  }, [today])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  // Recherche profils (debounce léger).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (q.trim().length < 1) { setResults([]); return }
    let annule = false
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/boutique/search?q=${encodeURIComponent(q.trim())}`)
        const json = await res.json()
        if (!annule && res.ok) setResults(json.profils || [])
      } catch { /* ignore */ }
    }, 250)
    return () => { annule = true; clearTimeout(t) }
  }, [q])
  /* eslint-enable react-hooks/set-state-in-effect */

  async function selectChild(profilId: string) {
    const res = await fetch(`/api/admin/boutique/child?profilId=${profilId}&date=${today}`)
    const json = await res.json()
    if (res.ok) { setChild(json); setMode("wallet"); setQ(""); setResults([]) }
  }

  // Unités vendables : article sans variante = lui-même ; article à variantes = ses variantes.
  const unitsById = useMemo(() => {
    const m = new Map<string, Unit>()
    for (const a of articles) {
      if (a.variants && a.variants.length > 0) {
        for (const v of a.variants) m.set(v.id, { id: v.id, name: `${a.name} · ${v.name}`, unit_price_cents: a.price_alone_cents, stock_qty: v.stock_qty })
      } else {
        m.set(a.id, { id: a.id, name: a.name, unit_price_cents: a.price_alone_cents, stock_qty: a.stock_qty })
      }
    }
    return m
  }, [articles])

  const lines = useMemo(() =>
    Object.entries(cart).map(([id, qty]) => {
      const u = unitsById.get(id)
      return { catalog_item_id: id, qty, unit_price_cents: u?.unit_price_cents ?? 0, name: u?.name ?? "" }
    }).filter((l) => l.qty > 0), [cart, unitsById])
  const total = cartTotalCents(lines, mode)

  function addUnit(u: Unit) {
    if (u.stock_qty !== null && (cart[u.id] || 0) >= u.stock_qty) return
    setCart((c) => ({ ...c, [u.id]: (c[u.id] || 0) + 1 }))
  }
  function setQty(id: string, qty: number) {
    setCart((c) => { const n = { ...c }; if (qty <= 0) delete n[id]; else n[id] = qty; return n })
  }
  function resetCart() { setCart({}); setSumup(""); setIdemKey(uuid()); setServiceDate(today); setDateOpen(false) }

  async function sell() {
    if (lines.length === 0) return
    setBusy(true); setError(null)
    try {
      const payload = {
        idempotency_key: idemKey,
        payment_mode: mode,
        service_date: serviceDate,
        // PS-08a-d : toujours transmettre le compte du profil (is_test hérité), quel que soit le mode.
        account_id: child?.account_id ?? null,
        profil_id: child?.profil_id ?? null,
        prenom: child?.prenom ?? null,
        jeton_qty: mode === "jeton" ? jetonValue : null,
        sumup_receipt: mode === "cb_sumup" ? sumup.trim() || null : null,
        items: lines.map((l) => ({ catalog_item_id: l.catalog_item_id, qty: l.qty })),
      }
      const res = await fetch("/api/admin/boutique/sell", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || "Vente impossible")
        if (json.code === "SOLDE_INSUFFISANT") setMode("cb_sumup")
        return
      }
      setToast(`✅ Vente ${json.sale?.sale_number}${serviceDate !== today ? ` pour ${jourCourt(serviceDate)}` : ""}`)
      setTimeout(() => setToast(null), 2500)
      resetCart()
      if (child) await selectChild(child.profil_id)
      await load()
    } catch { setError("Erreur réseau") }
    finally { setBusy(false) }
  }

  async function reverse(saleId: string) {
    setBusy(true)
    try {
      const res = await fetch("/api/admin/boutique/reverse", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ saleId }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || "Annulation impossible"); return }
      setReverseFor(null)
      if (child) await selectChild(child.profil_id)
      await load()
    } finally { setBusy(false) }
  }

  const reversedIds = new Set(sales.filter((s) => s.reverses_sale_id).map((s) => s.reverses_sale_id!))
  const walletDisabled = !child || (mode === "wallet" && child.balance_cents < total)
  const plafondLabel = child
    ? (child.plafond_gouter_cents == null ? "plafond illimité"
       : `reste ${euro(Math.max(0, child.plafond_gouter_cents - child.consumed_cents))} sur ${euro(child.plafond_gouter_cents)}`)
    : ""

  return (
    <div style={S.page}>
      <AdminBackButton />
      <div style={S.headRow}>
        <h1 style={S.h1}>🛒 Boutique</h1>
        <Link href="/admin/boutique/catalogue" style={S.catLink}>Catalogue →</Link>
      </div>

      {/* Enfant */}
      <h2 style={S.h2}>Enfant</h2>
      <div style={S.chips}>
        {enfantsJour.map((e) => (
          <button key={e.id} onClick={() => selectChild(e.id)} style={{ ...S.chip, ...(child?.profil_id === e.id ? S.chipOn : {}) }}>{e.prenom}</button>
        ))}
        {enfantsJour.length === 0 && <span style={S.muted}>Aucun enfant du jour</span>}
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un enfant…" style={S.search} />
      {results.length > 0 && (
        <div style={S.results}>
          {results.map((r) => <button key={r.id} onClick={() => selectChild(r.id)} style={S.resultRow}>{r.prenom}{r.classe ? ` · ${r.classe}` : ""}</button>)}
        </div>
      )}

      {child && (
        <div style={S.childBanner}>
          <strong>{child.prenom}</strong> · solde {euro(child.balance_cents)} · {plafondLabel}
          <button onClick={() => { setChild(null); setMode("especes") }} style={S.clearChild}>×</button>
        </div>
      )}
      {!child && <p style={S.muted}>Client de passage : espèces ou CB SumUp uniquement.</p>}

      {/* PS-08a-e — Pilule « Pour : … » (jour de consommation) */}
      <div style={S.dateWrap}>
        <button onClick={() => setDateOpen((o) => !o)} style={{ ...S.datePill, ...(serviceDate !== today ? S.datePillOn : {}) }}>
          Pour : {serviceDate === today ? "aujourd'hui" : jourCourt(serviceDate)} ▾
        </button>
        {dateOpen && (
          <div style={S.chips}>
            {[today, ...serviceDays.filter((d) => d !== today)].slice(0, 5).map((d) => (
              <button key={d} onClick={() => { setServiceDate(d); setDateOpen(false) }}
                style={{ ...S.chip, ...(serviceDate === d ? S.chipOn : {}) }}>
                {d === today ? "Aujourd'hui" : jourCourt(d)}
              </button>
            ))}
            <label style={{ ...S.chip, display: "inline-flex", alignItems: "center", gap: 6 }}>
              Autre date
              <input type="date" min={today} value={serviceDate}
                onChange={(e) => { if (e.target.value && e.target.value >= today) { setServiceDate(e.target.value); setDateOpen(false) } }}
                style={{ border: "none", background: "transparent", font: "inherit", color: "inherit" }} />
            </label>
          </div>
        )}
      </div>

      {/* Articles */}
      <h2 style={S.h2}>Articles</h2>
      <div style={S.grid}>
        {articles.map((a) => {
          const hasVariants = !!(a.variants && a.variants.length > 0)
          const out = a.stock_qty !== null && a.stock_qty <= 0
          if (hasVariants) {
            return (
              <button key={a.id} onClick={() => setVariantsFor(a)} style={{ ...S.article, ...(out ? S.articleOut : {}) }}>
                <span style={S.artName}>{a.is_special ? "⭐ " : ""}{a.name}</span>
                <span style={S.artPrice}>{euro(a.price_alone_cents)}</span>
                <span style={S.artStock}>{a.variants!.length} variante{a.variants!.length > 1 ? "s" : ""}{a.stock_qty !== null ? ` · stock ${a.stock_qty}` : ""} ›</span>
              </button>
            )
          }
          return (
            <button key={a.id} onClick={() => !out && addUnit({ id: a.id, name: a.name, unit_price_cents: a.price_alone_cents, stock_qty: a.stock_qty })} disabled={out} style={{ ...S.article, ...(out ? S.articleOut : {}) }}>
              <span style={S.artName}>{a.is_special ? "⭐ " : ""}{a.name}</span>
              <span style={S.artPrice}>{euro(a.price_alone_cents)}</span>
              {a.stock_qty !== null && <span style={{ ...S.artStock, color: out ? "#DC2626" : "var(--ink-soft)" }}>stock {a.stock_qty}</span>}
            </button>
          )
        })}
      </div>

      {/* Sélecteur de variantes */}
      {variantsFor && (
        <div style={S.variantSheet}>
          <div style={S.variantHead}>
            <strong>{variantsFor.name}</strong>
            <button onClick={() => setVariantsFor(null)} style={S.clearChild}>×</button>
          </div>
          <div style={S.chips}>
            {variantsFor.variants!.map((v) => {
              const vout = v.stock_qty !== null && v.stock_qty <= 0
              return (
                <button key={v.id} disabled={vout}
                  onClick={() => { addUnit({ id: v.id, name: `${variantsFor.name} · ${v.name}`, unit_price_cents: variantsFor.price_alone_cents, stock_qty: v.stock_qty }) }}
                  style={{ ...S.chip, ...(vout ? { opacity: 0.4 } : {}) }}>
                  {v.name}{v.stock_qty !== null ? ` · ${v.stock_qty}` : ""}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Panier */}
      {lines.length > 0 && (
        <div style={S.cart}>
          {serviceDate !== today && <div style={S.cartFor}>Pour {jourCourt(serviceDate)}</div>}
          {lines.map((l) => (
            <div key={l.catalog_item_id} style={S.cartLine}>
              <span style={{ flex: 1 }}>{l.name}</span>
              <button onClick={() => setQty(l.catalog_item_id, l.qty - 1)} style={S.qtyBtn}>−</button>
              <span style={S.qty}>{l.qty}</span>
              <button onClick={() => setQty(l.catalog_item_id, l.qty + 1)} style={S.qtyBtn}>+</button>
              <span style={S.lineTotal}>{mode === "jeton" ? "🎋" : euro(l.unit_price_cents * l.qty)}</span>
            </div>
          ))}
          <div style={S.cartTotal}><span>Total</span><strong>{mode === "jeton" ? "0,00 € (jeton)" : euro(total)}</strong></div>

          {/* Modes */}
          <div style={S.modeRow}>
            {(["wallet", "especes", "cb_sumup", "jeton"] as PaymentMode[]).map((m) => {
              const disabled = m === "wallet" && !child
              return (
                <button key={m} disabled={disabled} onClick={() => setMode(m)}
                  style={{ ...S.modeBtn, ...(mode === m ? S.modeOn : {}), ...(disabled ? { opacity: 0.4 } : {}) }}>
                  {m === "wallet" ? "💳 Wallet" : m === "especes" ? "💶 Espèces" : m === "cb_sumup" ? "💳 SumUp" : "🎋 Jeton"}
                </button>
              )
            })}
          </div>
          {mode === "cb_sumup" && (
            <input value={sumup} onChange={(e) => setSumup(e.target.value)} placeholder="N° reçu SumUp (optionnel)" style={S.search} />
          )}
          {mode === "jeton" && (
            <div style={S.modeRow}>
              {JETON_OPTIONS.map((j) => (
                <button key={j.value} onClick={() => setJetonValue(j.value)} style={{ ...S.modeBtn, ...(jetonValue === j.value ? S.modeOn : {}) }}>{j.value} · {j.label}</button>
              ))}
            </div>
          )}

          {error && <p style={S.err}>{error}</p>}
          <button onClick={sell} disabled={busy || walletDisabled} style={S.sellBtn}>
            {busy ? "…" : mode === "wallet" ? `💳 Débiter le wallet ${euro(total)}`
              : mode === "especes" ? `💶 Encaisser espèces ${euro(total)}`
              : mode === "cb_sumup" ? `💳 CB SumUp ${euro(total)}`
              : `🎋 Jeton (0 €)`}
          </button>
        </div>
      )}

      {toast && <div style={S.toast}>{toast}</div>}

      {/* Ventes du jour */}
      <h2 style={S.h2}>Ventes du jour</h2>
      {sales.length === 0 && <p style={S.muted}>Aucune vente.</p>}
      {sales.filter((s) => !s.reverses_sale_id).map((s) => {
        const annulee = reversedIds.has(s.id)
        return (
          <div key={s.id} style={{ ...S.saleRow, ...(annulee ? S.saleReversed : {}) }}>
            <div style={{ flex: 1 }}>
              <div style={{ textDecoration: annulee ? "line-through" : "none" }}>
                {s.prenom || "—"} · {s.items.map((i) => `${i.qty > 1 ? i.qty + "× " : ""}${i.name}`).join(", ")}
              </div>
              <div style={S.saleMeta}>{s.sale_number} · {s.payment_mode === "jeton" ? `🎋 ${s.jeton_qty}` : euro(s.total_cents)}{s.service_date && s.service_date !== today ? ` · pour ${jourCourt(s.service_date)}` : ""}{annulee ? " · annulée" : ""}</div>
            </div>
            {!annulee && (reverseFor === s.id
              ? <span style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => reverse(s.id)} disabled={busy} style={S.revYes}>Oui</button>
                  <button onClick={() => setReverseFor(null)} style={S.revNo}>Non</button>
                </span>
              : <button onClick={() => setReverseFor(s.id)} style={S.annuler}>Annuler</button>)}
          </div>
        )
      })}
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  page: { maxWidth: 460, margin: "0 auto", padding: "12px 14px 60px", fontFamily: "var(--font-display, Fredoka), system-ui, sans-serif", color: "var(--ink)" },
  headRow: { display: "flex", justifyContent: "space-between", alignItems: "baseline" },
  h1: { fontSize: 22, fontWeight: 800, margin: "8px 0 12px" },
  catLink: { color: "var(--accent)", textDecoration: "none", fontSize: 14 },
  h2: { fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--ink-soft)", margin: "18px 0 8px" },
  muted: { color: "var(--ink-soft)", fontSize: 14 },
  err: { color: "#DC2626", fontSize: 14, margin: "8px 0" },
  chips: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  chip: { minHeight: 44, padding: "8px 14px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--bg-alt)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: "var(--ink)" },
  chipOn: { background: "var(--accent)", color: "#fff", borderColor: "transparent" },
  search: { width: "100%", height: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 15, background: "var(--bg)", color: "var(--ink)", marginTop: 6 },
  results: { border: "1px solid var(--border)", borderRadius: 12, marginTop: 6, overflow: "hidden" },
  resultRow: { display: "block", width: "100%", textAlign: "left", padding: "12px", background: "var(--bg)", border: "none", borderBottom: "1px solid var(--border)", cursor: "pointer", fontFamily: "inherit", color: "var(--ink)", minHeight: 44 },
  childBanner: { display: "flex", alignItems: "center", gap: 8, background: "#E8F5E9", border: "1px solid #A5D6A7", borderRadius: 12, padding: "10px 12px", marginTop: 10, fontSize: 14, color: "#166534" },
  clearChild: { marginLeft: "auto", background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#166534" },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  article: { display: "flex", flexDirection: "column", gap: 2, minHeight: 64, padding: "10px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card, #fff)", cursor: "pointer", fontFamily: "inherit", color: "var(--ink)", textAlign: "left" },
  articleOut: { opacity: 0.5, cursor: "not-allowed" },
  artName: { fontWeight: 700, fontSize: 14 },
  artPrice: { fontWeight: 700, color: "var(--accent-2, #5A7F42)" },
  artStock: { fontSize: 11 },
  dateWrap: { margin: "12px 0 4px" },
  datePill: { minHeight: 44, padding: "8px 16px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--bg-alt)", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", color: "var(--ink)", fontSize: 14 },
  datePillOn: { background: "#FEF3C7", borderColor: "#FCD34D", color: "#92400E" },
  cartFor: { fontWeight: 800, color: "#92400E", fontSize: 14, marginBottom: 6 },
  variantSheet: { marginTop: 10, border: "1px solid var(--accent)", borderRadius: 14, padding: 12, background: "#FEF9F2" },
  variantHead: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, fontSize: 15 },
  cart: { marginTop: 14, border: "1px solid var(--accent)", borderRadius: 14, padding: 12, background: "#FEF9F2" },
  cartLine: { display: "flex", alignItems: "center", gap: 8, padding: "6px 0", fontSize: 15 },
  qtyBtn: { width: 36, height: 36, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", fontSize: 18, cursor: "pointer", color: "var(--ink)" },
  qty: { minWidth: 24, textAlign: "center", fontWeight: 700 },
  lineTotal: { minWidth: 60, textAlign: "right", fontWeight: 600 },
  cartTotal: { display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 17, borderTop: "1px solid var(--border)", marginTop: 4 },
  modeRow: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 },
  modeBtn: { flex: 1, minWidth: 72, minHeight: 44, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: "var(--ink)" },
  modeOn: { background: "var(--accent)", color: "#fff", borderColor: "transparent" },
  sellBtn: { width: "100%", minHeight: 50, marginTop: 10, background: "var(--accent)", color: "#fff", fontWeight: 800, fontSize: 16, border: "none", borderRadius: 12, cursor: "pointer", fontFamily: "inherit" },
  toast: { position: "fixed", left: "50%", bottom: 20, transform: "translateX(-50%)", background: "#166534", color: "#fff", padding: "10px 18px", borderRadius: 999, fontWeight: 700, zIndex: 50 },
  saleRow: { display: "flex", alignItems: "center", gap: 8, padding: "10px 0", borderBottom: "1px solid var(--border)", fontSize: 14 },
  saleReversed: { opacity: 0.6 },
  saleMeta: { fontSize: 11, color: "var(--ink-soft)", marginTop: 2 },
  annuler: { background: "none", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", fontSize: 12, color: "var(--ink-soft)", cursor: "pointer", fontFamily: "inherit", minHeight: 40 },
  revYes: { background: "#92400E", color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", minHeight: 40, cursor: "pointer", fontFamily: "inherit" },
  revNo: { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px", minHeight: 40, cursor: "pointer", fontFamily: "inherit", color: "var(--ink)" },
}
