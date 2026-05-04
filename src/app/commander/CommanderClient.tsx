"use client"

import { useMemo, useState, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Navbar } from "@/components/Navbar"
import { ProductCard } from "@/components/ProductCard"
import { useCart } from "@/lib/cart-context"
import { HeaderMetier } from "@/components/HeaderMetier"

// ============================================================================
// TYPES
// ============================================================================

type SourceGroup = "ecole_la_patience" | "pandattitude" | "panda_guest"
type Metier = "ecole" | "pandattitude" | "panda_guest"
// BUG B — classe = scolaire OU créneau pandattitude (mer/ven/sam) OU null pour panda_guest
type Classe = "maternelle" | "primaire" | "college" | "lycee" | "prof" | "mercredi" | "vendredi" | "samedi"

interface CatalogItem {
  id: string; sku: string | null; code: string | null; name: string
  description: string | null; emoji: string | null; price_alone_cents: number | null
  sellable_alone: boolean; sellable_in_menu: boolean; active: boolean; sort_order: number
  allergens: string[] | null; morning_available: boolean | null
  image_url: string | null; ui_group: string | null; category_id: string
}
interface Category { id: string; name: string; emoji: string | null; sort_order: number; morning_available: boolean | null; catalog_items: CatalogItem[] }
interface MenuFormula { id: string; code: string; name: string; description: string | null; price_cents: number; image_url: string | null; emoji: string | null; active: boolean; sort_order: number }
interface Topping { id: string; name: string; emoji: string | null; active: boolean; sort_order: number; applies_to_category_ids: string[] | null }
interface Profil { id: string; account_id: string; prenom: string; classe: Classe | null; metier: Metier; is_default: boolean; active: boolean; notes_allergies: string | null }
interface Account { id: string; nom_compte: string; email: string; source_group: SourceGroup | null; source_detail: string | null }
interface Wallet { balance_cents: number }
interface DeliveryPoint { id: string; name: string; address: string | null; delivery_time_local: string | null }
interface Slot { id: string; service_date: string; day_type: string; active: boolean; morning_delivery: boolean | null; target_source_group: SourceGroup | null; delivery_points: DeliveryPoint | null }

// CartItem type is now imported from @/lib/cart-context

interface Props {
  account: Account; profils: Profil[]; wallet: Wallet | null; categories: Category[]
  menuFormulas: MenuFormula[]; toppings: Topping[]; slots: Slot[]
  pendingCount: number
  pendingTotalCents: number
  weekItemCount: number
  weekTotalCents: number
}

// ============================================================================
// HELPERS
// ============================================================================

function fmtDate(d: string): string {
  const dt = new Date(d + "T12:00:00")
  const wd = dt.toLocaleDateString("fr-FR", { weekday: "long" })
  const dm = dt.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })
  return `${wd.charAt(0).toUpperCase() + wd.slice(1)} ${dm}`
}
function fmtShort(d: string): string {
  const dt = new Date(d + "T12:00:00")
  const wd = dt.toLocaleDateString("fr-FR", { weekday: "short" })
  const dm = dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })
  return `${wd.charAt(0).toUpperCase() + wd.slice(1).replace(".", "")} ${dm}`
}
function fmtPrice(c: number): string { return `${(c / 100).toFixed(2).replace(".", ",")} €` }
function skuCat(sku: string): string | null {
  if (sku.startsWith("SAND-")) return "SAND"
  if (sku.startsWith("CROQ-")) return "CROQ"
  if (sku.startsWith("SAL-")) return "SAL"
  if (sku.startsWith("PASTA-")) return "PASTA"
  return null
}
// BUG B — labels classe pour 3 métiers (scolaire + créneaux pandattitude)
const CL: Record<string, string> = { maternelle: "Mat.", primaire: "Prim.", college: "Coll.", lycee: "Lyc.", prof: "Prof", mercredi: "Mer.", vendredi: "Ven.", samedi: "Sam." }
const CLF: Record<string, string> = { maternelle: "Maternelle", primaire: "Primaire", college: "Collège", lycee: "Lycée", prof: "Prof/Équipe", mercredi: "Mercredi", vendredi: "Vendredi", samedi: "Samedi" }
// Mapping account.source_group → profil.metier (compat ascendante)
function sgToMetier(sg: string | null | undefined): Metier {
  if (sg === "ecole_la_patience") return "ecole"
  if (sg === "pandattitude") return "pandattitude"
  if (sg === "panda_guest") return "panda_guest"
  return "ecole"
}
const WALLET_IMG = "https://res.cloudinary.com/dbkpvp9ts/image/upload/v1776714727/PANDA_WALLET.jpg"

// Crop Cloudinary pour retirer watermark Gemini
const CLOUDINARY_CROP = "c_crop,g_north_west,w_0.93,h_0.88/c_fill,ar_4:3,w_600,q_auto,f_auto"
function buildImgUrl(url: string): string {
  if (url.includes("res.cloudinary.com") && !url.includes("tea_maison")) {
    return url.replace("/upload/", `/upload/${CLOUDINARY_CROP}/`)
  }
  return url
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CommanderClient({ account, profils, wallet, categories, menuFormulas, toppings, slots, pendingCount, pendingTotalCents, weekItemCount, weekTotalCents }: Props) {
  const router = useRouter()
  const { refreshPendingCount } = useCart()
  const [selectedSlotId, setSelectedSlotId] = useState<string>(slots[0]?.id || "")
  const [selectedProfilId, setSelectedProfilId] = useState<string>("")
  const [addedToast, setAddedToast] = useState<string | null>(null)
  const [addInFlight, setAddInFlight] = useState(false)
  const [mfOpen, setMfOpen] = useState(false)
  const [mfFormula, setMfFormula] = useState<MenuFormula | null>(null)
  const [mfStep, setMfStep] = useState<"plat" | "garnitures">("plat")
  const [mfPlat, setMfPlat] = useState<CatalogItem | null>(null)
  const [mfToppings, setMfToppings] = useState<string[]>([])

  // --- À la carte topping modal state ---
  const [alcTopOpen, setAlcTopOpen] = useState(false)
  const [alcItem, setAlcItem] = useState<CatalogItem | null>(null)
  const [alcToppings, setAlcToppings] = useState<string[]>([])

  // Helper d'ajout async — POST /api/order-item avec slotId (find-or-create)
  const addToCartAsync = useCallback(async (payload: {
    catalogItemId?: string | null
    menuFormulaId?: string | null
    selectedPlatSku?: string | null
    selectedToppings?: string[]
    notes: string
    isTakeaway?: boolean
  }, label: string) => {
    if (!selectedSlotId) { alert("Sélectionne un jour de livraison"); return }
    if (addInFlight) return
    setAddInFlight(true)
    try {
      // selectedProfilId courant — find via profils (filter active inline)
      const pr = profils.find((p) => p.active && p.id === selectedProfilId) || null
      const res = await fetch("/api/order-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotId: selectedSlotId,
          profilId: pr?.id ?? null,
          prenomLibre: pr?.prenom ?? account.nom_compte,
          takeaway: payload.isTakeaway || false,
          notes: payload.notes,
          catalogItemId: payload.catalogItemId ?? null,
          menuFormulaId: payload.menuFormulaId ?? null,
          selectedPlatSku: payload.selectedPlatSku ?? null,
          selectedToppings: payload.selectedToppings || [],
        }),
      })
      const data = await res.json()
      if (data.success) {
        setAddedToast(label)
        setTimeout(() => setAddedToast(null), 2000)
        refreshPendingCount()
      } else {
        alert(data.error || "Erreur ajout")
      }
    } catch {
      alert("Erreur réseau. Réessaie.")
    } finally {
      setAddInFlight(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSlotId, selectedProfilId, addInFlight, account.nom_compte, refreshPendingCount, profils])


  const selectedSlot = useMemo(() => slots.find((s) => s.id === selectedSlotId) || null, [slots, selectedSlotId])
  // BUG C — filtrer profils par metier de la page courante (un profil = un seul metier)
  const pageMetier = useMemo<Metier>(() => sgToMetier(account.source_group), [account.source_group])
  const activeProfils = useMemo(() => profils.filter((p) => p.active && p.metier === pageMetier), [profils, pageMetier])
  const selectedProfil = useMemo(() => {
    if (selectedProfilId) return activeProfils.find((p) => p.id === selectedProfilId) || activeProfils[0] || null
    return activeProfils.find((p) => p.is_default) || activeProfils[0] || null
  }, [activeProfils, selectedProfilId])
  // FIX 5 — restaure le profil actif depuis localStorage au montage
  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("panda_active_profil") : null
    if (stored && activeProfils.some((p) => p.id === stored)) {
      setSelectedProfilId(stored)
    } else {
      const fallback = activeProfils.find((p) => p.is_default) || activeProfils[0]
      if (fallback) setSelectedProfilId(fallback.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // FIX 5 — persiste le profil actif dans localStorage
  useEffect(() => {
    if (selectedProfilId && typeof window !== "undefined") {
      localStorage.setItem("panda_active_profil", selectedProfilId)
    }
  }, [selectedProfilId])

  const isMaternelle = selectedProfil?.classe === "maternelle"
  const sg = account.source_group
  const sd = account.source_detail

  // ============================================================================
  // FILTERING
  // ============================================================================

  function visForSource(item: CatalogItem): boolean {
    if (!item.active) return false
    const sku = item.sku || ""
    // Toupiti à la carte dédupliqué : la formula BENTO_TOUPITI assure le rendu École
    if (sku === "BENTO-TOUPITI-CARTE") return false
    // T3 — SAND-VOLAILLE supprimé partout (3 métiers)
    if (sku === "SAND-VOLAILLE") return false
    if (sg === "ecole_la_patience") {
      if (sku.startsWith("CROQ-")) return false
      if (sku === "DRINK-BBL") return false
      if (sku.startsWith("SAL-")) return false
      if (sd === "fond_lahaye" && sku === "SAND-C") return false
      if (sd === "fond_lahaye" && sku === "SAND-A") return false
    }
    if (sg === "pandattitude") {
      if (sku.startsWith("SAL-")) return false
    }
    if (sg === "panda_guest") {
      if (sku.startsWith("SAL-")) return false
      if (sku === "DRINK-BBL") return false  // Bubble Tea exclusif Pandattitude
    }
    return true
  }

  function visForSlot(item: CatalogItem): boolean {
    if (!visForSource(item)) return false
    if (!item.sellable_alone) return false
    return true
  }

  const menuPlatItems = useMemo(() => {
    return categories.flatMap((c) => c.catalog_items)
      .filter((i) => i.active && i.sellable_in_menu && visForSource(i))
      .filter((i) => {
        const s = i.sku || ""
        const baseMatch = s.startsWith("SAND-") || s.startsWith("PASTA-") || s.startsWith("CROQ-") || s.startsWith("SAL-")
        const pandattitudeBonus = sg === "pandattitude" && s === "BENTO-JOUR"
        const pandaGuestBonus = sg === "panda_guest" && s === "BENTO-JOUR"
        // Panda Guest : pas de Croque (école hors-classe pas adaptée)
        if (sg === "panda_guest" && s.startsWith("CROQ-")) return false
        return baseMatch || pandattitudeBonus || pandaGuestBonus
      })
      .sort((a, b) => a.sort_order - b.sort_order)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, sg, sd])

  // Flatten all à-la-carte items (no category titles) + snacks separate
  const { aLaCarteItems, snackItems } = useMemo(() => {
    const snacks: CatalogItem[] = []
    const alcItems: CatalogItem[] = []
    for (const cat of categories) {
      const vis = (cat.catalog_items || []).filter(visForSlot)
      const inSnack = vis.filter((i) => i.ui_group === "snack_gourmand")
      const notSnack = vis.filter((i) => i.ui_group !== "snack_gourmand")
      snacks.push(...inSnack)
      alcItems.push(...notSnack)
    }
    // Pandattitude : Bubble Tea + Thé maison repoussés en toute fin de liste À la carte
    const PANDATTITUDE_END_SKUS = ["DRINK-BBL", "DRINK-TEA_MAISON_50CL"]
    alcItems.sort((a, b) => {
      if (sg === "pandattitude") {
        const aIdx = PANDATTITUDE_END_SKUS.indexOf(a.sku || "")
        const bIdx = PANDATTITUDE_END_SKUS.indexOf(b.sku || "")
        const aEnd = aIdx >= 0
        const bEnd = bIdx >= 0
        if (aEnd && !bEnd) return 1
        if (!aEnd && bEnd) return -1
        if (aEnd && bEnd) return aIdx - bIdx
      }
      return a.sort_order - b.sort_order
    })
    snacks.sort((a, b) => a.sort_order - b.sort_order)
    return { aLaCarteItems: alcItems, snackItems: snacks }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, sg, sd])

  const visFormulas = useMemo(() => {
    return menuFormulas.filter((f) => {
      const c = f.code || ""
      if (c === "BENTO_TOUPITI") return sg === "ecole_la_patience" || sg === "panda_guest"
      if (c === "BENTO_PANDA") return sg === "ecole_la_patience"
      if (c === "BENTO_JOUR") return sg === "pandattitude" || sg === "panda_guest"
      if (c === "MENU_PANDA") return sg === "ecole_la_patience" || sg === "pandattitude"
      if (c === "MENU_PANDA_GUEST") return sg === "panda_guest"
      return false
    })
  }, [menuFormulas, sg])

  const topsForPlat = useMemo(() => {
    if (!mfPlat) return []
    const c = skuCat(mfPlat.sku || "")
    if (!c) return []
    return toppings.filter((t) => !t.applies_to_category_ids || t.applies_to_category_ids.includes(c))
  }, [mfPlat, toppings])

  // Toppings for à-la-carte item
  const topsForAlcItem = useMemo(() => {
    if (!alcItem) return []
    const c = skuCat(alcItem.sku || "")
    if (!c) return []
    return toppings.filter((t) => !t.applies_to_category_ids || t.applies_to_category_ids.includes(c))
  }, [alcItem, toppings])

  // ============================================================================
  // MENU FLOW
  // ============================================================================

  function openMenuFlow(formula: MenuFormula) {
    if (formula.code === "BENTO_PANDA" || formula.code === "BENTO_TOUPITI") { addFormulaDirect(formula); return }
    setMfFormula(formula); setMfPlat(null); setMfToppings([]); setMfStep("plat"); setMfOpen(true)
  }

  function selectPlat(item: CatalogItem) {
    setMfPlat(item)
    const c = skuCat(item.sku || "")
    const has = c && toppings.some((t) => t.applies_to_category_ids?.includes(c))
    if (has) { setMfToppings([]); setMfStep("garnitures") }
    else { finishMenu(item, []) }
  }

  function toggleTop(id: string) {
    const rien = toppings.find((t) => t.name.startsWith("RIEN"))
    if (rien && id === rien.id) { setMfToppings([id]); return }
    setMfToppings((p) => {
      const w = p.filter((x) => x !== rien?.id)
      return w.includes(id) ? w.filter((x) => x !== id) : [...w, id]
    })
  }

  // Brief 3-E B-α — auto-persist via addToCartAsync (POST /api/order-item)
  function finishMenu(plat: CatalogItem, tops: string[]) {
    if (!mfFormula) return
    const tn = tops.map((id) => toppings.find((t) => t.id === id)?.name).filter(Boolean)
    const label = `${mfFormula.name} — ${plat.name}${tn.length > 0 ? ` (${tn.join(", ")})` : ""}`
    addToCartAsync({
      menuFormulaId: mfFormula.id,
      selectedPlatSku: plat.sku,
      selectedToppings: tops,
      notes: label,
    }, label)
    setMfOpen(false)
  }

  function addFormulaDirect(f: MenuFormula) {
    addToCartAsync({
      menuFormulaId: f.id,
      selectedPlatSku: null,
      selectedToppings: [],
      notes: f.name,
    }, f.name)
  }

  // ============================================================================
  // À LA CARTE — with topping modal (PT4)
  // ============================================================================

  function addItem(itemId: string) {
    const item = categories.flatMap((c) => c.catalog_items).find((i) => i.id === itemId)
    if (!item || !item.sellable_alone || item.price_alone_cents == null) return

    // Check if this item has toppings → open modal
    const c = skuCat(item.sku || "")
    const hasTops = c && toppings.some((t) => t.applies_to_category_ids?.includes(c))
    if (hasTops) {
      setAlcItem(item)
      setAlcToppings([])
      setAlcTopOpen(true)
      return
    }

    // No toppings → add directly
    addToCartAsync({
      catalogItemId: item.id,
      selectedToppings: [],
      notes: item.name,
    }, item.name)
  }

  function toggleAlcTop(id: string) {
    const rien = toppings.find((t) => t.name.startsWith("RIEN"))
    if (rien && id === rien.id) { setAlcToppings([id]); return }
    setAlcToppings((p) => {
      const w = p.filter((x) => x !== rien?.id)
      return w.includes(id) ? w.filter((x) => x !== id) : [...w, id]
    })
  }

  function finishAlcItem() {
    if (!alcItem || alcItem.price_alone_cents == null) return
    const tn = alcToppings.map((id) => toppings.find((t) => t.id === id)?.name).filter(Boolean)
    const label = `${alcItem.name}${tn.length > 0 ? ` (${tn.join(", ")})` : ""}`
    addToCartAsync({
      catalogItemId: alcItem.id,
      selectedToppings: alcToppings,
      notes: label,
    }, label)
    setAlcTopOpen(false)
  }

  const showALC = !(isMaternelle && sg === "ecole_la_patience")
  const dateLabel = selectedSlot ? fmtDate(selectedSlot.service_date) : ""
  const bentoToupitiFormula = visFormulas.find((f) => f.code === "BENTO_TOUPITI")

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="min-h-screen pb-20 max-w-lg mx-auto overflow-x-hidden">
      <Navbar walletBalance={wallet?.balance_cents} familyName={account.nom_compte} pendingCount={pendingCount}
        greeting="Bienvenue chez Panda Snack 🐼 — Compose ton menu, choisis tes jours, c'est prêt." />

      {/* T3 (3-E) — HeaderMetier composant réutilisable */}
      <HeaderMetier sg={sg} />

      {addedToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-lg animate-fade-in" style={{ background: "var(--accent-2)" }}>
          {addedToast} ajouté
        </div>
      )}

      {/* Profil */}
      {activeProfils.length > 1 && (
        <div className="px-4 pt-2">
          <h2 className="font-bold text-sm mb-2" style={{ color: "var(--ink-soft)" }}>Commande pour</h2>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {activeProfils.map((p, idx) => {
              const sel = selectedProfil?.id === p.id
              const PASTEL_COLORS = ['#FEF3C7', '#99F6E4', '#FBCFE8', '#BBF7D0']
              const pastelBg = PASTEL_COLORS[idx % PASTEL_COLORS.length]
              return (<button key={p.id} onClick={() => setSelectedProfilId(p.id)}
                className={`px-4 py-2 rounded-xl text-base font-bold whitespace-nowrap border transition-colors ${sel ? "text-white border-transparent" : "border-[var(--border)]"}`}
                style={sel ? { background: "var(--accent)" } : { background: pastelBg, color: "var(--ink)" }}>
                {p.prenom}{p.classe && <span className="ml-1 opacity-75 text-xs font-medium">({CL[p.classe]})</span>}
              </button>)
            })}
          </div>
        </div>
      )}
      {activeProfils.length === 1 && selectedProfil && (
        <div className="px-4 pt-2">
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            Commande pour <strong style={{ color: "var(--ink)" }}>{selectedProfil.prenom}</strong>
            {selectedProfil.classe && <span className="ml-1 text-xs">({CLF[selectedProfil.classe]})</span>}
          </p>
        </div>
      )}
      {/* POINT 3 — état vide : aucun profil pour ce metier → invitation à en créer */}
      {activeProfils.length === 0 && (
        <div className="mx-4 mt-2 rounded-xl p-3 text-sm" style={{ background: "#FEF3E2", border: "1px solid #F5D5A0", color: "#92400E" }}>
          Aucun profil pour ce métier.{" "}
          <Link href="/mon-espace?tab=profils" className="underline font-semibold">Créer un profil</Link>
        </div>
      )}

      {/* Slot */}
      <div className="px-4 py-2">
        <h2 className="font-bold text-sm mb-2" style={{ color: "var(--ink-soft)" }}>Jour de livraison</h2>
        {slots.length === 0 ? (
          <div className="rounded-xl p-4 text-sm" style={{ background: "var(--bg-alt)", color: "var(--ink-soft)" }}>Aucun créneau ouvert pour le moment.</div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {slots.map((sl) => {
              const sel = selectedSlotId === sl.id
              return (<button key={sl.id} onClick={() => setSelectedSlotId(sl.id)}
                className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap border transition-colors ${sel ? "text-white border-transparent" : "border-[var(--border)]"}`}
                style={sel ? { background: "var(--accent)" } : {}}>
                {fmtShort(sl.service_date)}
              </button>)
            })}
          </div>
        )}
        {selectedSlot?.delivery_points?.name && (
          <p className="text-xs mt-2" style={{ color: "var(--ink-soft)" }}>{selectedSlot.delivery_points.name}</p>
        )}
      </div>

      {selectedSlot && (
        <div className="px-4 mb-2">
          <p className="text-xs font-semibold px-3 py-1.5 rounded-lg inline-block" style={{ background: "var(--bg-alt)", color: "var(--ink)" }}>
            {dateLabel}{selectedProfil && <span> — {selectedProfil.prenom}</span>}
          </p>
        </div>
      )}

      {isMaternelle && sg === "ecole_la_patience" && (
        <div className="mx-4 mb-4 rounded-xl p-4 text-sm" style={{ background: "#FEF3E2", border: "1px solid #F5D5A0" }}>
          <strong>{selectedProfil?.prenom}</strong> est en maternelle — le repas est un <strong>Bento du jour</strong> (pas de changement de plat possible).
          Tu peux ajouter des en-cas en plus.
        </div>
      )}

      {/* ================================================================ */}
      {/* ÉCOLE — Hero Bento                                                */}
      {/* ================================================================ */}
      {visFormulas.length > 0 && sg === "ecole_la_patience" && (() => {
        const bento = visFormulas.find((f) => f.code === "BENTO_PANDA")
        const mp = visFormulas.find((f) => f.code === "MENU_PANDA")
        const canChange = !isMaternelle
        // P0a #10/#10b — image hero bento selon profil sélectionné
        const heroBentoImg = isMaternelle
          ? "https://res.cloudinary.com/dbkpvp9ts/image/upload/v1776956118/Bento_TOUPITI_boulette_RIZ_POULET_carottes_cuites.png"
          : "https://res.cloudinary.com/dbkpvp9ts/image/upload/v1776901351/Bento_3boulette_RIZ_POULET_carottes_cuites.png"
        return (
          <div className="px-4 mb-6">
            {/* P0a #6 — titre section École en bleu */}
            <h2 className="font-bold text-lg mb-1 text-center" style={{ color: "#1D4ED8" }}>Menu Panda du jour</h2>
            {/* UX 1 — sous-titre composition unifiée */}
            <p className="text-sm font-bold mb-1" style={{ color: "#B91C1C" }}>PLAT (au choix) + BOISSON (bubble tea au choix sur place) + DESSERT DU JOUR</p>
            <p className="text-xs mb-3" style={{ color: "var(--accent-2)" }}>Infusion maison glacée offerte avec chaque menu.</p>
            {bento && (
              <div className="rounded-2xl overflow-hidden mb-3" style={{ background: "var(--card)", boxShadow: "0 2px 16px var(--shadow)" }}>
                <div className="aspect-[16/9] overflow-hidden">
                  <img src={heroBentoImg} alt={bento.name} className="w-full h-full object-cover" />
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-lg">{bento.name}</h3>
                      {/* UX 2 — descr override invitation à changer de plat */}
                      <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>Clique sur &laquo;&nbsp;Changer de plat&nbsp;&raquo; si tu veux autre chose à la place dans le MENU PANDA&nbsp;!</p>
                    </div>
                    <span className="font-bold text-xl">{fmtPrice(bento.price_cents)}</span>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => addFormulaDirect(bento)} className="flex-1 h-11 rounded-xl font-semibold text-white text-sm" style={{ background: "var(--accent)" }}>Ajouter au panier</button>
                    {canChange && mp && (
                      <button onClick={() => openMenuFlow(mp)} className="h-11 px-3 rounded-xl font-semibold text-xs border leading-tight" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
                        Changer de plat<br/>dans le Menu Panda
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* PANDATTITUDE — Hero pattern La Patience (BENTO_JOUR + Changer de plat) */}
      {visFormulas.length > 0 && sg === "pandattitude" && (() => {
        const bento = visFormulas.find((f) => f.code === "BENTO_JOUR")
        const mp = visFormulas.find((f) => f.code === "MENU_PANDA")
        return (
          <div className="px-4 mb-6">
            <h2 className="font-bold text-lg mb-1 text-center" style={{ color: "#1D4ED8" }}>Menu Panda du jour</h2>
            {/* UX 1 — sous-titre composition unifiée */}
            <p className="text-sm font-bold mb-1" style={{ color: "#B91C1C" }}>PLAT (au choix) + BOISSON (bubble tea au choix sur place) + DESSERT DU JOUR</p>
            <p className="text-xs mb-3" style={{ color: "var(--accent-2)" }}>Infusion maison glacée offerte avec chaque menu.</p>
            {bento && (
              <div className="rounded-2xl overflow-hidden mb-3" style={{ background: "var(--card)", boxShadow: "0 2px 16px var(--shadow)" }}>
                <div className="aspect-[16/9] overflow-hidden">
                  {bento.image_url ? (
                    <img src={bento.image_url} alt={bento.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-6xl" style={{ background: "linear-gradient(135deg, var(--menu-panda-start), var(--menu-panda-end))" }}>🍱</div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-lg">{bento.name}</h3>
                      {/* UX 2 — descr override invitation à changer de plat */}
                      <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>Clique sur &laquo;&nbsp;Changer de plat&nbsp;&raquo; si tu veux autre chose à la place dans le MENU PANDA&nbsp;!</p>
                    </div>
                    <span className="font-bold text-xl">{fmtPrice(bento.price_cents)}</span>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => addFormulaDirect(bento)} className="flex-1 h-11 rounded-xl font-semibold text-white text-sm" style={{ background: "var(--accent)" }}>Ajouter au panier</button>
                    {mp && (
                      <button onClick={() => openMenuFlow(mp)} className="h-11 px-3 rounded-xl font-semibold text-xs border leading-tight" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
                        Changer de plat<br/>dans le Menu Panda
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* PANDA GUEST — Hero pattern La Patience (BENTO_JOUR + Changer de plat via MENU_PANDA_GUEST, sans Croque) */}
      {visFormulas.length > 0 && sg === "panda_guest" && (() => {
        const bento = visFormulas.find((f) => f.code === "BENTO_JOUR")
        const mp = visFormulas.find((f) => f.code === "MENU_PANDA_GUEST")
        return (
          <div className="px-4 mb-6">
            <h2 className="font-bold text-lg mb-1 text-center" style={{ color: "#1D4ED8" }}>Menu Panda du jour</h2>
            {/* UX 1 — sous-titre composition unifiée */}
            <p className="text-sm font-bold mb-1" style={{ color: "#B91C1C" }}>PLAT (au choix) + BOISSON (bubble tea au choix sur place) + DESSERT DU JOUR</p>
            <p className="text-xs mb-3" style={{ color: "var(--accent-2)" }}>Infusion maison glacée offerte avec chaque menu.</p>
            {bento && (
              <div className="rounded-2xl overflow-hidden mb-3" style={{ background: "var(--card)", boxShadow: "0 2px 16px var(--shadow)" }}>
                <div className="aspect-[16/9] overflow-hidden">
                  {bento.image_url ? (
                    <img src={bento.image_url} alt={bento.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-6xl" style={{ background: "linear-gradient(135deg, var(--menu-panda-start), var(--menu-panda-end))" }}>🍱</div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-lg">{bento.name}</h3>
                      {/* UX 2 — descr override invitation à changer de plat */}
                      <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>Clique sur &laquo;&nbsp;Changer de plat&nbsp;&raquo; si tu veux autre chose à la place dans le MENU PANDA&nbsp;!</p>
                    </div>
                    <span className="font-bold text-xl">{fmtPrice(bento.price_cents)}</span>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => addFormulaDirect(bento)} className="flex-1 h-11 rounded-xl font-semibold text-white text-sm" style={{ background: "var(--accent)" }}>Ajouter au panier</button>
                    {mp && (
                      <button onClick={() => openMenuFlow(mp)} className="h-11 px-3 rounded-xl font-semibold text-xs border leading-tight" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
                        Changer de plat<br/>dans le Menu Panda
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* ================================================================ */}
      {/* À LA CARTE — PT2: Bento Toupiti as card, PT3: single title       */}
      {/* ================================================================ */}
      {showALC && (
        <div className="px-4 space-y-4">
          <h2 className="font-bold text-lg text-center">À la carte</h2>

          {/* PT2: Bento Toupiti as visual card in grid alongside other items */}
          <div className="grid grid-cols-2 gap-3">
            {bentoToupitiFormula && (
              <div className="rounded-2xl overflow-hidden cursor-pointer transition-transform hover:scale-[1.02]"
                style={{ background: "var(--card)", boxShadow: "0 2px 12px var(--shadow)" }}
                onClick={() => addFormulaDirect(bentoToupitiFormula)}>
                <div className="aspect-[4/3] overflow-hidden">
                  {bentoToupitiFormula.image_url && !bentoToupitiFormula.image_url.includes("etiquette_emballage") ? (
                    <img src={buildImgUrl(bentoToupitiFormula.image_url)} alt={bentoToupitiFormula.name} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-5xl" style={{ background: "var(--bg-alt)" }}>{bentoToupitiFormula.emoji || "🍱"}</div>
                  )}
                </div>
                <div className="p-3">
                  <h4 className="font-semibold text-sm">{bentoToupitiFormula.name}</h4>
                  <p className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>Portion réduite "petits mangeurs". Sans dessert, boisson</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="font-bold text-base">{fmtPrice(bentoToupitiFormula.price_cents)}</span>
                    <span className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: "var(--accent)" }}>
                      Ajouter
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* PT3: All à-la-carte items in single flat grid — no category subtitles */}
            {aLaCarteItems.map((item) => (
              <ProductCard key={item.id} id={item.id} name={item.name} description={item.description}
                priceCents={item.price_alone_cents} imageUrl={item.image_url} emoji={item.emoji}
                isMenuOnly={!item.sellable_alone && item.sellable_in_menu} allergens={item.allergens}
                onSelect={addItem} />
            ))}
          </div>
        </div>
      )}

      {/* Snacks */}
      {snackItems.length > 0 && (
        <div className="px-4 mt-8">
          <h2 className="font-bold text-lg mb-1 text-center">Un petit en-cas en plus ?</h2>
          <p className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>Pour {selectedProfil?.prenom ?? "toi"}</p>
          <div className="grid grid-cols-2 gap-3">
            {snackItems.map((item) => (
              <ProductCard key={item.id} id={item.id} name={item.name} description={item.description}
                priceCents={item.price_alone_cents} imageUrl={item.image_url} emoji={item.emoji}
                isMenuOnly={false} allergens={item.allergens} onSelect={addItem} />
            ))}
          </div>
        </div>
      )}

      {/* T1 (3-E) — Mini cabas sticky supprimé. Point d'entrée unique = icône caddie BottomNav. */}

      {/* ================================================================ */}
      {/* MENU FLOW MODAL                                                   */}
      {/* ================================================================ */}
      {mfOpen && mfFormula && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center">
          <div className="w-full max-w-lg rounded-t-2xl max-h-[85vh] overflow-y-auto" style={{ background: "var(--card)" }}>
            <div className="sticky top-0 z-10 flex justify-between items-center px-5 py-4 border-b" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div>
                <h3 className="font-bold text-lg">Changer de plat dans le Menu Panda</h3>
                <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                  {mfStep === "plat" && `${fmtPrice(mfFormula.price_cents)} — Choisis ton plat`}
                  {mfStep === "garnitures" && `Garnitures pour ${mfPlat?.name}`}
                </p>
              </div>
              <button onClick={() => setMfOpen(false)} className="text-2xl leading-none" aria-label="Fermer">&times;</button>
            </div>
            <div className="p-5">
              {mfStep === "plat" && (
                <div className="grid grid-cols-2 gap-3">
                  {menuPlatItems.map((item) => (
                    <div key={item.id} className="rounded-2xl overflow-hidden cursor-pointer transition-transform hover:scale-[1.02]"
                      style={{ background: "var(--card)", boxShadow: "0 2px 12px var(--shadow)" }} onClick={() => selectPlat(item)}>
                      <div className="aspect-[4/3] overflow-hidden">
                        {item.image_url ? (<img src={buildImgUrl(item.image_url)} alt={item.name} className="w-full h-full object-cover" loading="lazy" />)
                        : (<div className="w-full h-full flex items-center justify-center text-4xl" style={{ background: "var(--bg-alt)" }}>{item.emoji || "🐼"}</div>)}
                      </div>
                      <div className="p-2"><h4 className="font-semibold text-sm text-center">{item.name}</h4></div>
                    </div>
                  ))}
                </div>
              )}
              {mfStep === "garnitures" && (
                <div>
                  <div className="space-y-2 mb-4">
                    {topsForPlat.map((t) => {
                      const chk = mfToppings.includes(t.id)
                      return (
                        <label key={t.id} className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer"
                          style={{ borderColor: chk ? "var(--accent)" : "var(--border)", background: chk ? "#FEF3E2" : "transparent" }}>
                          <input type="checkbox" checked={chk} onChange={() => toggleTop(t.id)} className="w-5 h-5" style={{ accentColor: "var(--accent)" }} />
                          <span className="text-lg">{t.emoji}</span>
                          <span className="text-sm font-medium">{t.name}</span>
                        </label>
                      )
                    })}
                  </div>
                  <button onClick={() => finishMenu(mfPlat!, mfToppings)} className="w-full h-12 rounded-xl font-semibold text-white" style={{ background: "var(--accent)" }}>
                    {mfToppings.length === 0 ? "Sans garniture — Ajouter au panier" : "Valider et ajouter au panier"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* À LA CARTE TOPPING MODAL (PT4)                                    */}
      {/* ================================================================ */}
      {alcTopOpen && alcItem && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center">
          <div className="w-full max-w-lg rounded-t-2xl max-h-[85vh] overflow-y-auto" style={{ background: "var(--card)" }}>
            <div className="sticky top-0 z-10 flex justify-between items-center px-5 py-4 border-b" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div>
                <h3 className="font-bold text-lg">{alcItem.name}</h3>
                <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                  {fmtPrice(alcItem.price_alone_cents!)} — Choisis tes garnitures
                </p>
              </div>
              <button onClick={() => setAlcTopOpen(false)} className="text-2xl leading-none" aria-label="Fermer">&times;</button>
            </div>
            <div className="p-5">
              {alcItem.image_url && (
                <div className="rounded-xl overflow-hidden mb-4 aspect-[16/9]">
                  <img src={buildImgUrl(alcItem.image_url)} alt={alcItem.name} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="space-y-2 mb-4">
                {topsForAlcItem.map((t) => {
                  const chk = alcToppings.includes(t.id)
                  return (
                    <label key={t.id} className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer"
                      style={{ borderColor: chk ? "var(--accent)" : "var(--border)", background: chk ? "#FEF3E2" : "transparent" }}>
                      <input type="checkbox" checked={chk} onChange={() => toggleAlcTop(t.id)} className="w-5 h-5" style={{ accentColor: "var(--accent)" }} />
                      <span className="text-lg">{t.emoji}</span>
                      <span className="text-sm font-medium">{t.name}</span>
                    </label>
                  )
                })}
              </div>
              <button onClick={finishAlcItem} className="w-full h-12 rounded-xl font-semibold text-white" style={{ background: "var(--accent)" }}>
                {alcToppings.length === 0 ? "Sans garniture — Ajouter au panier" : "Valider et ajouter au panier"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* Brief 3-E B-α — Modal showCart in-memory supprimé. Auto-persist en DB via /api/order-item au moment de l'ajout, panier visible via icône caddie BottomNav → /panier. */}

    </div>
  )
}
