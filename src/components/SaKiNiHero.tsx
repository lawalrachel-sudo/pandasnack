"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

// PS-14 — Hero temporel « SA KI NI » sur /commander : s'affiche le jour J, entre la clôture et
// 10h30, quand il reste des portions. Voyant rouge, par plat : photo, prix, « il en reste N ».
// Parcours : enfant → plat (seul ou Menu Panda) → paiement Panda Wallet UNIQUEMENT → confirmation.
export interface SaKiNiHeroItem {
  catalog_item_id: string
  name: string
  image_url: string | null
  price_alone_cents: number | null
  allergens: string[]
  remaining: number
  can_menu: boolean
}
export interface SaKiNiHeroData {
  slot_id: string
  service_date: string
  menu_formula_id: string | null
  menu_price_cents: number | null
  sauce_topping_id: string | null
  items: SaKiNiHeroItem[]
}
interface Profil { id: string; prenom: string }

const TOAST_KEY = "ps_skn_toast_seen"
const TOAST = "Les commandes de ce jour sont fermées depuis hier 20h. SA KI NI, c'est ce qu'il reste en cuisine aujourd'hui : jusqu'à 10h30, dans la limite des quantités, payé avec ton Panda Wallet."

function euro(c: number | null): string {
  if (c == null) return "—"
  return (c / 100).toFixed(2).replace(".", ",") + " €"
}

export function SaKiNiHero({ hero, profils }: { hero: SaKiNiHeroData; profils: Profil[] }) {
  const [items, setItems] = useState<SaKiNiHeroItem[]>(hero.items)
  const [openItem, setOpenItem] = useState<SaKiNiHeroItem | null>(null)
  const [showToast, setShowToast] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { if (localStorage.getItem(TOAST_KEY) !== "1") { setShowToast(true); localStorage.setItem(TOAST_KEY, "1") } } catch { /* no-op */ }
  }, [])

  if (items.length === 0) return null

  function onOrdered(catId: string) {
    setItems((prev) => prev
      .map((it) => it.catalog_item_id === catId ? { ...it, remaining: it.remaining - 1 } : it)
      .filter((it) => it.remaining > 0))
    setOpenItem(null)
  }

  return (
    <section aria-label="Sa ki ni" className="px-4 pt-3 pb-4">
      <div className="rounded-2xl p-4" style={{ background: "var(--card, #fff)", border: "2px solid #DC2626", boxShadow: "0 2px 16px rgba(220,38,38,0.18)" }}>
        <div className="flex items-center gap-2">
          <span style={{ width: 12, height: 12, borderRadius: 999, background: "#DC2626", boxShadow: "0 0 0 4px rgba(220,38,38,0.2)", display: "inline-block" }} aria-hidden="true" />
          <h2 className="font-display font-semibold text-2xl" style={{ color: "#DC2626" }}>SA KI NI</h2>
          {/* PS-14b — réafficher l'explication à la demande (pas seulement une fois par appareil) */}
          <button onClick={() => setShowToast(true)} aria-label="C'est quoi Sa ki ni ?"
            style={{ marginLeft: "auto", background: "transparent", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>ℹ️</button>
        </div>
        <p className="text-sm mt-0.5" style={{ color: "var(--ink-soft)" }}>ce qu&apos;il y a aujourd&apos;hui · jusqu&apos;à 10h30, payé au Panda Wallet</p>

        {showToast && (
          <div className="mt-3 rounded-xl p-3 text-sm" style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#991B1B" }}>
            {TOAST}
            <div className="mt-2 text-right">
              <button className="underline font-semibold" onClick={() => setShowToast(false)}>J&apos;ai compris</button>
            </div>
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-3">
          {items.map((it) => (
            <button key={it.catalog_item_id} onClick={() => setOpenItem(it)}
              className="rounded-xl overflow-hidden text-left border"
              style={{ borderColor: "var(--border)", background: "#fff", cursor: "pointer" }}>
              {it.image_url
                ? <img src={it.image_url} alt={it.name} className="w-full h-24 object-cover" />
                : <div className="w-full h-24 flex items-center justify-center text-3xl" style={{ background: "var(--bg-alt)" }}>🍽️</div>}
              <div className="p-2">
                <div className="font-bold text-sm leading-tight" style={{ color: "var(--ink)" }}>{it.name}</div>
                <div className="text-sm mt-0.5" style={{ color: "var(--accent)" }}>
                  {it.price_alone_cents != null ? euro(it.price_alone_cents) : `En Menu ${euro(hero.menu_price_cents)}`}
                </div>
                <div className="text-xs mt-0.5 font-semibold" style={{ color: "#DC2626" }}>il en reste {it.remaining}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {openItem && (
        <SaKiNiModal hero={hero} item={openItem} profils={profils}
          onClose={() => setOpenItem(null)} onOrdered={() => onOrdered(openItem.catalog_item_id)} />
      )}
    </section>
  )
}

function SaKiNiModal({ hero, item, profils, onClose, onOrdered }: {
  hero: SaKiNiHeroData; item: SaKiNiHeroItem; profils: Profil[]
  onClose: () => void; onOrdered: () => void
}) {
  const canAlone = item.price_alone_cents != null
  const canMenu = item.can_menu && !!hero.menu_formula_id
  const [profilId, setProfilId] = useState<string>(profils[0]?.id || "")
  const [mode, setMode] = useState<"alone" | "menu">(canAlone ? "alone" : "menu")
  const [sauce, setSauce] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needRecharge, setNeedRecharge] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const total = mode === "menu" ? hero.menu_price_cents : item.price_alone_cents

  async function confirm() {
    if (!profilId) { setError("Choisis un enfant."); return }
    setBusy(true); setError(null); setNeedRecharge(false)
    try {
      const prenom = profils.find((p) => p.id === profilId)?.prenom || null
      const res = await fetch("/api/sa-ki-ni/commander", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotId: hero.slot_id,
          idempotencyKey: (globalThis.crypto?.randomUUID?.() || String(Date.now())),
          sauceToppingId: hero.sauce_topping_id,
          items: [{
            catalog_item_id: item.catalog_item_id,
            is_formula: mode === "menu",
            menu_formula_id: mode === "menu" ? hero.menu_formula_id : null,
            profil_id: profilId, prenom_libre: prenom, sauce, notes: item.name,
          }],
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json?.error || "La commande a échoué.")
        if (res.status === 402 || json?.code === "SOLDE_INSUFFISANT") setNeedRecharge(true)
        return
      }
      setDone(json?.orderNumber || "OK")
    } catch { setError("Erreur réseau.") } finally { setBusy(false) }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--card, #fff)", width: "100%", maxWidth: 460, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: "18px 16px calc(18px + env(safe-area-inset-bottom, 0px))" }}>
        {done ? (
          <div className="text-center">
            <div className="text-4xl">✅</div>
            <h3 className="font-display font-semibold text-xl mt-2" style={{ color: "var(--ink)" }}>C&apos;est pris !</h3>
            <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>Commande {done} payée avec le Panda Wallet. À récupérer aujourd&apos;hui.</p>
            <button onClick={onOrdered} className="mt-4 w-full rounded-xl py-3 font-bold text-white" style={{ background: "#DC2626" }}>Fermer</button>
          </div>
        ) : (
          <>
            <h3 className="font-display font-semibold text-xl" style={{ color: "var(--ink)" }}>{item.name}</h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>Sa ki ni · payé avec le Panda Wallet</p>

            {profils.length > 1 && (
              <div className="mt-3">
                <div className="text-sm font-bold mb-1" style={{ color: "var(--ink)" }}>Pour qui ?</div>
                <div className="flex flex-wrap gap-2">
                  {profils.map((p) => (
                    <button key={p.id} onClick={() => setProfilId(p.id)}
                      className="px-3 py-2 rounded-xl text-sm font-bold border"
                      style={profilId === p.id ? { background: "var(--accent)", color: "#fff", borderColor: "transparent" } : { borderColor: "var(--border)", color: "var(--ink)" }}>
                      {p.prenom}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(canAlone && canMenu) && (
              <div className="mt-3">
                <div className="text-sm font-bold mb-1" style={{ color: "var(--ink)" }}>Formule</div>
                <div className="flex gap-2">
                  <button onClick={() => setMode("alone")} className="flex-1 px-3 py-2 rounded-xl text-sm font-bold border"
                    style={mode === "alone" ? { background: "var(--accent)", color: "#fff", borderColor: "transparent" } : { borderColor: "var(--border)", color: "var(--ink)" }}>
                    Seul · {euro(item.price_alone_cents)}
                  </button>
                  <button onClick={() => setMode("menu")} className="flex-1 px-3 py-2 rounded-xl text-sm font-bold border"
                    style={mode === "menu" ? { background: "var(--accent)", color: "#fff", borderColor: "transparent" } : { borderColor: "var(--border)", color: "var(--ink)" }}>
                    Menu Panda · {euro(hero.menu_price_cents)}
                  </button>
                </div>
              </div>
            )}

            <label className="mt-3 flex items-center gap-2 text-sm" style={{ color: "var(--ink)" }}>
              <input type="checkbox" checked={sauce} onChange={(e) => setSauce(e.target.checked)} /> Sauce piment (gratuit)
            </label>

            {error && (
              <div className="mt-3 rounded-xl p-3 text-sm" style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#991B1B" }}>
                {error}
                {needRecharge && <div className="mt-2"><Link href="/recharger" className="underline font-semibold">Recharger le Panda Wallet</Link></div>}
              </div>
            )}

            <button onClick={confirm} disabled={busy || !profilId} className="mt-4 w-full rounded-xl py-3 font-bold text-white" style={{ background: "#DC2626", opacity: busy ? 0.7 : 1 }}>
              {busy ? "…" : `Payer ${euro(total)} au Panda Wallet`}
            </button>
            <button onClick={onClose} className="mt-2 w-full rounded-xl py-2 font-semibold" style={{ color: "var(--ink-soft)" }}>Annuler</button>
          </>
        )}
      </div>
    </div>
  )
}
