"use client"

import { useMemo, useState, useCallback, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Navbar } from "@/components/Navbar"
import { ProductCard } from "@/components/ProductCard"
import { useCart } from "@/lib/cart-context"
import { HeaderMetier } from "@/components/HeaderMetier"
import { sauceCheckboxApplies, setSauceInNotes } from "@/lib/menu-options"
import { visForSource as visForSourceShared, isMenuPlatSku } from "@/lib/visibility"
import { RENTREE_BANNER, SECTION_LABELS, SNACK_SECTION, HOWTO_STEPS, HOWTO_TITLE, HOWTO_PILL } from "@/lib/banner"
import { InfoParentsBanner } from "@/components/InfoParentsBanner"
import { profilCommandable } from "@/lib/profil-gate"

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
  coming_soon?: boolean | null  // PS-01 — visible mais non sélectionnable (badge « Bientôt disponible ! »)
}
interface Category { id: string; name: string; emoji: string | null; sort_order: number; morning_available: boolean | null; catalog_items: CatalogItem[] }
interface MenuFormula { id: string; code: string; name: string; description: string | null; price_cents: number; image_url: string | null; emoji: string | null; active: boolean; sort_order: number }
interface Topping { id: string; name: string; emoji: string | null; active: boolean; sort_order: number; applies_to_category_ids: string[] | null }
interface Profil { id: string; account_id: string; prenom: string; classe: Classe | null; metier: Metier; is_default: boolean; active: boolean; notes_allergies: string | null; type_profil?: string | null; archived_at?: string | null }
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
  // §5 — case "Sauce piment" indépendante (burgers/bento/salades/menu croque)
  const [mfSauce, setMfSauce] = useState(false)

  // --- À la carte topping modal state ---
  const [alcTopOpen, setAlcTopOpen] = useState(false)
  const [alcItem, setAlcItem] = useState<CatalogItem | null>(null)
  const [alcToppings, setAlcToppings] = useState<string[]>([])
  const [alcSauce, setAlcSauce] = useState(false)

  // PS-02 B — toast « Comment ça marche ? » (auto 2 s après l'arrivée, rappel via pilule) +
  // pulsation du bloc « Choisis ton plat » à la fermeture.
  const [howOpen, setHowOpen] = useState(false)
  const [platPulse, setPlatPulse] = useState(false)
  const platRef = useRef<HTMLDivElement | null>(null)
  // PS-03c — ouverture automatique UNE fois par appareil (localStorage ps_howto_seen = '1' à la
  // première fermeture). howAuto = true seulement pour cette première ouverture (→ pulsation).
  const HOWTO_SEEN_KEY = "ps_howto_seen"
  const howAutoRef = useRef(false)
  useEffect(() => {
    let seen = false
    try { seen = localStorage.getItem(HOWTO_SEEN_KEY) === "1" } catch { /* stockage indisponible : on affiche */ }
    if (seen) return
    const t = setTimeout(() => { howAutoRef.current = true; setHowOpen(true) }, 2000)
    return () => clearTimeout(t)
  }, [])
  // Pilule : réouverture à la demande, jamais de pulsation
  function openHow() { howAutoRef.current = false; setHowOpen(true) }
  function closeHow() {
    setHowOpen(false)
    if (!howAutoRef.current) return
    howAutoRef.current = false
    try { localStorage.setItem(HOWTO_SEEN_KEY, "1") } catch { /* non persisté : réaffiché à la prochaine visite */ }
    // Après démontage du toast : centrer le bloc plat puis pulser 3 fois (animation CSS .ps-pulse)
    requestAnimationFrame(() => {
      platRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
      setPlatPulse(true)
    })
  }

  // PS-02 C — carrousel « Article seul » : index courant pour l'indicateur (points)
  const alcCarouselRef = useRef<HTMLDivElement | null>(null)
  const [alcIdx, setAlcIdx] = useState(0)
  function onAlcScroll() {
    const el = alcCarouselRef.current
    const first = el?.firstElementChild as HTMLElement | null
    if (!el || !first) return
    const step = first.offsetWidth + 12  // largeur carte + --grid-gap
    setAlcIdx(Math.max(0, Math.round(el.scrollLeft / step)))
  }
  function scrollAlcTo(i: number) {
    const el = alcCarouselRef.current
    const first = el?.firstElementChild as HTMLElement | null
    if (!el || !first) return
    el.scrollTo({ left: i * (first.offsetWidth + 12), behavior: "smooth" })
  }

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
      const pr = profils.find((p) => p.id === selectedProfilId && profilCommandable(p, sgToMetier(account.source_group))) || null
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
  // Bug 2+3 — exclure le profil parent (classe NULL sur ecole/pandattitude). Sur panda_guest,
  // tout le monde commande (pas de notion parent/enfant). Le parent reste éditable via /mon-espace.
  // PS-05c — un seul prédicat, partagé avec la garde serveur (/commander, /auth/*) :
  // profil actif, non archivé, du bon métier, type_profil='eleve' et classe appartenant
  // au référentiel. Exclut le profil parent 'adulte' du trigger, même réactivé ou doté
  // d'une classe en texte libre ('Pandattitude') par l'ancien éditeur admin.
  const activeProfils = useMemo(
    () => profils.filter((p) => profilCommandable(p, pageMetier)),
    [profils, pageMetier]
  )
  const selectedProfil = useMemo(() => {
    if (selectedProfilId) return activeProfils.find((p) => p.id === selectedProfilId) || activeProfils[0] || null
    return activeProfils.find((p) => p.is_default) || activeProfils[0] || null
  }, [activeProfils, selectedProfilId])
  // FIX 5 — restaure le profil actif depuis localStorage au montage (sync one-shot SSR-safe
  // via le garde window ; pas de cascade de rendus).
  /* eslint-disable react-hooks/set-state-in-effect */
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
  /* eslint-enable react-hooks/set-state-in-effect */

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

  // PS-01 — source unique dans src/lib/visibility.ts (partagée avec PanierClient).
  // PS-02 §6 — MÊME prédicat de base pour le slot plat du Menu Panda ET le carrousel Article seul :
  // catalog_items.active + visibilité public. Ensuite seul le flag diffère (sellable_in_menu vs
  // sellable_alone) ; coming_soon est porté tel quel par ProductCard (grisé « Bientôt ! » des deux côtés).
  function visForSource(item: CatalogItem): boolean {
    return item.active && visForSourceShared(item, sg, sd)
  }

  function visForSlot(item: CatalogItem): boolean {
    if (!visForSource(item)) return false
    if (!item.sellable_alone) return false
    return true
  }

  const menuPlatItems = useMemo(() => {
    return categories.flatMap((c) => c.catalog_items)
      .filter((i) => i.sellable_in_menu && visForSource(i))
      // BRIEF Menu Panda (17/06) + PS-01 — SKUs « Plat principal » (BURGER/CLUB/SOUP inclus), cf. visibility.ts
      .filter((i) => isMenuPlatSku(i.sku, sg))
      .sort((a, b) => a.sort_order - b.sort_order)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, sg, sd])

  // PS-01 Opération Beauty — sections « article seul » par catégorie (ordre catalog_categories.sort_order,
  // titre = SECTION_LABELS[id] ou name DB, emoji DB) + snacks (ui_group snack_gourmand) à part.
  const { alcSections, snackItems } = useMemo(() => {
    const snacks: CatalogItem[] = []
    const sections: { id: string; title: string; emoji: string | null; items: CatalogItem[] }[] = []
    // Pandattitude : Bubble Tea + Thé maison repoussés en fin de section Boissons
    const PANDATTITUDE_END_SKUS = ["DRINK-BBL", "DRINK-TEA_MAISON_50CL"]
    const bySort = (a: CatalogItem, b: CatalogItem) => {
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
    }
    for (const cat of [...categories].sort((a, b) => a.sort_order - b.sort_order)) {
      const vis = (cat.catalog_items || []).filter(visForSlot)
      snacks.push(...vis.filter((i) => i.ui_group === "snack_gourmand"))
      const items = vis.filter((i) => i.ui_group !== "snack_gourmand").sort(bySort)
      if (items.length > 0) sections.push({ id: cat.id, title: SECTION_LABELS[cat.id] || cat.name, emoji: cat.emoji, items })
    }
    snacks.sort((a, b) => a.sort_order - b.sort_order)
    return { alcSections: sections, snackItems: snacks }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, sg, sd])

  // PS-02 C — carrousel Article seul : sections aplaties (ordre catégorie puis item), Bubble Tea
  // extrait (§7 : bloc fixe sous le carrousel, jamais dans le swipe).
  const BBL_SKU = "DRINK-BBL"
  const { alcCarouselItems, bblItem } = useMemo(() => {
    const flat = alcSections.flatMap((sec) => sec.items.map((item) => ({ item, kicker: `${sec.emoji ? `${sec.emoji} ` : ""}${sec.title}` })))
    const bbl = flat.find((x) => x.item.sku === BBL_SKU)?.item ?? null
    return { alcCarouselItems: flat.filter((x) => x.item.sku !== BBL_SKU), bblItem: bbl }
  }, [alcSections])

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
    setMfFormula(formula); setMfPlat(null); setMfToppings([]); setMfSauce(false); setMfStep("plat"); setMfOpen(true)
  }

  function selectPlat(item: CatalogItem) {
    if (item.coming_soon) return  // PS-01
    setMfPlat(item)
    const c = skuCat(item.sku || "")
    const has = c && toppings.some((t) => t.applies_to_category_ids?.includes(c))
    // §5 — l'étape "garnitures" sert aussi de porte d'entrée à la case sauce piment :
    // on l'ouvre même sans topping si le plat est éligible à la sauce.
    if (has || sauceCheckboxApplies(item.sku)) { setMfToppings([]); setMfSauce(false); setMfStep("garnitures") }
    else { finishMenu(item, []) }
  }

  // BRIEF Menu Panda (17/06) — pandattitude : sélection inline du plat (swipe sous le hero).
  // Le plat choisi est ajouté DANS le Menu Panda (10€), jamais à la carte. Si le plat a des
  // garnitures (toppings), on ouvre l'étape garnitures ; sinon ajout direct (formula passée
  // explicitement pour éviter un état mfFormula obsolète).
  function pickMenuPandaPlat(item: CatalogItem) {
    if (item.coming_soon) return  // PS-01 — « Bientôt disponible ! » : jamais sélectionnable
    const mp = visFormulas.find((f) => f.code === "MENU_PANDA")
    if (!mp) return
    setMfFormula(mp)
    const c = skuCat(item.sku || "")
    const has = c && toppings.some((t) => t.applies_to_category_ids?.includes(c))
    if (has || sauceCheckboxApplies(item.sku)) { setMfPlat(item); setMfToppings([]); setMfSauce(false); setMfStep("garnitures"); setMfOpen(true) }
    else { finishMenu(item, [], mp) }
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
  function finishMenu(plat: CatalogItem, tops: string[], formula?: MenuFormula) {
    const f = formula || mfFormula
    if (!f) return
    const tn = tops.map((id) => toppings.find((t) => t.id === id)?.name).filter(Boolean)
    const baseLabel = `${f.name} — ${plat.name}${tn.length > 0 ? ` (${tn.join(", ")})` : ""}`
    // §5 — sauce piment portée par `notes` (ligne dédiée), uniquement si le plat est éligible.
    const sauceOn = mfSauce && sauceCheckboxApplies(plat.sku)
    const notes = setSauceInNotes(baseLabel, sauceOn)
    const toast = sauceOn ? `${baseLabel} + sauce piment` : baseLabel
    addToCartAsync({
      menuFormulaId: f.id,
      selectedPlatSku: plat.sku,
      selectedToppings: tops,
      notes,
    }, toast)
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
    if (item.coming_soon) return  // PS-01 — « Bientôt disponible ! » : jamais sélectionnable

    // Check if this item has toppings → open modal
    const c = skuCat(item.sku || "")
    const hasTops = c && toppings.some((t) => t.applies_to_category_ids?.includes(c))
    if (hasTops || sauceCheckboxApplies(item.sku)) {
      setAlcItem(item)
      setAlcToppings([])
      setAlcSauce(false)
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
    const baseLabel = `${alcItem.name}${tn.length > 0 ? ` (${tn.join(", ")})` : ""}`
    const sauceOn = alcSauce && sauceCheckboxApplies(alcItem.sku)
    const notes = setSauceInNotes(baseLabel, sauceOn)
    const toast = sauceOn ? `${baseLabel} + sauce piment` : baseLabel
    addToCartAsync({
      catalogItemId: alcItem.id,
      selectedToppings: alcToppings,
      notes,
    }, toast)
    setAlcTopOpen(false)
  }

  const showALC = !(isMaternelle && sg === "ecole_la_patience")
  const dateLabel = selectedSlot ? fmtDate(selectedSlot.service_date) : ""
  const bentoToupitiFormula = visFormulas.find((f) => f.code === "BENTO_TOUPITI")

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    // PS-02 — largeur portée par la coque (.ps-shell : 430 px mobile / 1100 px vue ordinateur)
    <div className="min-h-screen pb-20 ps-page overflow-x-hidden">
      <Navbar walletBalance={wallet?.balance_cents} familyName={account.nom_compte} pendingCount={pendingCount}
        greeting="Bienvenue chez Panda Snack 🐼 — Compose ton menu, choisis tes jours, c'est prêt." />

      {/* T3 (3-E) — HeaderMetier composant réutilisable */}
      <HeaderMetier sg={sg} />

      {/* PS-01 — Bandeau rentrée permanent (texte dans src/lib/banner.ts). Remplace le HERO Portes Ouvertes. */}
      <section aria-label="Rentrée" className="px-4 pt-2 pb-4">
        <div className="rounded-2xl px-4 py-4 text-center" style={{ background: "var(--accent)", color: "var(--ink-on-accent)", boxShadow: "0 2px 16px var(--shadow)" }}>
          <h2 className="font-display font-semibold text-lg leading-snug">{RENTREE_BANNER.title}</h2>
          <p className="text-sm mt-1.5 opacity-95">{RENTREE_BANNER.subtitle}</p>
        </div>
      </section>
      {/* PS-04 — Info parents (commande la veille avant 20h), juste sous le bandeau horaires */}
      <InfoParentsBanner />
      <section aria-label="Aide" className="px-4 pb-4">
        {/* PS-02 — pilule discrète de rappel du toast pédagogique, à droite sous le bandeau */}
        <div className="flex justify-end">
          <button type="button" className="howto-pill focus-ring" onClick={openHow}>
            <span aria-hidden="true">💡</span> {HOWTO_PILL}
          </button>
        </div>
      </section>

      {/* PS-02 B — Toast plein écran « Comment ça marche ? » */}
      {howOpen && (
        <div className="howto-overlay" role="dialog" aria-modal="true" aria-labelledby="howto-title">
          <div className="howto-card">
            <button type="button" className="howto-close focus-ring" onClick={closeHow} aria-label="Fermer">&times;</button>
            <h2 id="howto-title" className="font-display font-semibold text-xl pr-8" style={{ color: "var(--accent)" }}>{HOWTO_TITLE}</h2>
            <ol className="howto-list">
              {HOWTO_STEPS.map((st) => (
                <li key={st.text} className={`howto-row${st.key ? " is-key" : ""}`}>
                  <span className="howto-icon" aria-hidden="true">{st.icon}</span>
                  <span>{st.text}</span>
                </li>
              ))}
            </ol>
            <button type="button" onClick={closeHow} className="pcard-btn mt-5 text-sm focus-ring">C&apos;est parti !</button>
          </div>
        </div>
      )}

      {addedToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-lg animate-fade-in" style={{ background: "var(--accent-2)" }}>
          {addedToast} ajouté
        </div>
      )}

      {/* Profil */}
      {activeProfils.length > 1 && (
        <div className="px-4 pt-2 pb-4">
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
        <div className="px-4 pt-2 pb-4">
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

      {/* Slot — PS-01b : une décision par bloc, 16 px entre blocs */}
      <div className="px-4 pb-4">
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
        <div className="px-4 mb-4">
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
            <div ref={platRef}>
            {/* P0a #6 — titre section École en bleu. PS-03b : pulsation sur le titre seul */}
            <h2 className={`font-bold text-lg mb-1 text-center${platPulse ? " ps-pulse" : ""}`} style={{ color: "#1D4ED8" }} onAnimationEnd={() => setPlatPulse(false)}>Menu Panda du jour</h2>
            {/* UX 1 — sous-titre composition unifiée */}
            <p className="text-sm font-bold mb-1" style={{ color: "#B91C1C" }}>PLAT (au choix) + BOISSON DU JOUR + DESSERT DU JOUR</p>
            {bento && (
              <div className="rounded-2xl overflow-hidden mb-3" style={{ background: "var(--card)", boxShadow: "0 2px 16px var(--shadow)" }}>
                <div className="aspect-[16/9] overflow-hidden md:max-h-[360px]">
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
                    <button onClick={() => addFormulaDirect(bento)} className="flex-1 h-11 rounded-xl font-display font-semibold text-white text-sm" style={{ background: "var(--accent)" }}>Ajouter au panier</button>
                    {canChange && mp && (
                      <button onClick={() => openMenuFlow(mp)} className="h-11 px-3 rounded-xl font-display font-semibold text-xs border leading-tight" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
                        Changer de plat<br/>dans le Menu Panda
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
            </div>
          </div>
        )
      })()}

      {/* PANDATTITUDE — BRIEF Menu Panda (17/06) : hero "Menu Panda" + swipe plats inline.
          Le bento n'est plus le hero ; il vit dans le swipe au même niveau que les autres plats. */}
      {visFormulas.length > 0 && sg === "pandattitude" && (() => {
        const mp = visFormulas.find((f) => f.code === "MENU_PANDA")
        if (!mp) return null
        return (
          <div className="px-4 mb-6">
            {/* §2 — Cadre HERO Menu Panda (prix mis en avant, composition réelle) */}
            <div className="rounded-2xl p-4 mb-4 text-center" style={{ background: "var(--card)", border: "2px solid var(--accent)", boxShadow: "0 2px 16px var(--shadow)" }}>
              <h2 className="font-display font-semibold text-2xl" style={{ color: "var(--accent)" }}>🐼 Menu Panda</h2>
              <p className="font-display font-semibold text-xl mt-1" style={{ color: "var(--ink)" }}>{fmtPrice(mp.price_cents)}</p>
              <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>plat + bubble tea + dessert du jour</p>
            </div>
            {/* §3 — Swipe des plats inline, tous sur un pied d'égalité (bento inclus). Tap = ajout dans le Menu Panda à 10€.
                PS-01 : cartes ProductCard compactes, coming_soon → grisé + badge, aucun onClick. */}
            {/* PS-02 B4 — bloc ciblé par scrollIntoView (block center) ; PS-03b : pulsation ×3 sur le TITRE seul,
                titre centré, même style que « Ou juste un article seul » */}
            <div ref={platRef}>
              <h3 className={`font-semibold text-lg text-center mb-2${platPulse ? " ps-pulse" : ""}`} style={{ color: "var(--ink)" }} onAnimationEnd={() => setPlatPulse(false)}>Choisis ton plat</h3>
              <div className="pgrid">
                {menuPlatItems.map((item) => (
                  <ProductCard key={item.id} id={item.id} name={item.name} description={item.description}
                    priceCents={mp.price_cents} priceLabel={fmtPrice(mp.price_cents)} imageUrl={item.image_url} emoji={item.emoji}
                    isMenuOnly={false} allergens={item.allergens} ctaLabel="Choisir"
                    comingSoon={!!item.coming_soon} onSelect={() => pickMenuPandaPlat(item)} />
                ))}
              </div>
            </div>
          </div>
        )
      })()}

      {/* PANDA GUEST — Hero pattern La Patience (BENTO_JOUR + Changer de plat via MENU_PANDA_GUEST, sans Croque) */}
      {visFormulas.length > 0 && sg === "panda_guest" && (() => {
        const bento = visFormulas.find((f) => f.code === "BENTO_JOUR")
        const mp = visFormulas.find((f) => f.code === "MENU_PANDA_GUEST")
        return (
          <div className="px-4 mb-6">
            <div ref={platRef}>
            <h2 className={`font-bold text-lg mb-1 text-center${platPulse ? " ps-pulse" : ""}`} style={{ color: "#1D4ED8" }} onAnimationEnd={() => setPlatPulse(false)}>Menu Panda du jour</h2>
            {/* UX 1 — sous-titre composition unifiée */}
            <p className="text-sm font-bold mb-1" style={{ color: "#B91C1C" }}>PLAT (au choix) + BOISSON DU JOUR + DESSERT DU JOUR</p>
            {bento && (
              <div className="rounded-2xl overflow-hidden mb-3" style={{ background: "var(--card)", boxShadow: "0 2px 16px var(--shadow)" }}>
                <div className="aspect-[16/9] overflow-hidden md:max-h-[360px]">
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
                    <button onClick={() => addFormulaDirect(bento)} className="flex-1 h-11 rounded-xl font-display font-semibold text-white text-sm" style={{ background: "var(--accent)" }}>Ajouter au panier</button>
                    {mp && (
                      <button onClick={() => openMenuFlow(mp)} className="h-11 px-3 rounded-xl font-display font-semibold text-xs border leading-tight" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
                        Changer de plat<br/>dans le Menu Panda
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
            </div>
          </div>
        )
      })()}

      {/* ================================================================ */}
      {/* À LA CARTE — PT2: Bento Toupiti as card, PT3: single title       */}
      {/* ================================================================ */}
      {showALC && (
        <div className="px-4 space-y-6">
          {/* §6 decoy — pour pandattitude, l'à la carte est présentée comme l'option secondaire :
              titre plus discret + ancrage prix vs le Menu Panda (plat seul 5,50€ vs menu complet 10€). */}
          {sg === "pandattitude" ? (
            <div className="text-center">
              <h2 className="font-semibold text-lg" style={{ color: "var(--ink)" }}>Ou juste un article seul</h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>Sans boisson ni dessert. Pour quelques euros de plus, le Menu Panda ajoute le bubble tea et le dessert.</p>
            </div>
          ) : (
            <h2 className="font-bold text-lg text-center">À la carte</h2>
          )}

          {/* PT2: Bento Toupiti as visual card (École / Panda Guest) */}
          {bentoToupitiFormula && (
            <div className="pgrid">
              <ProductCard id={bentoToupitiFormula.id} name={bentoToupitiFormula.name}
                description={'Portion réduite "petits mangeurs". Sans dessert, boisson'} showDescription
                priceCents={bentoToupitiFormula.price_cents}
                imageUrl={bentoToupitiFormula.image_url && !bentoToupitiFormula.image_url.includes("etiquette_emballage") ? bentoToupitiFormula.image_url : null}
                emoji={bentoToupitiFormula.emoji || "🍱"} isMenuOnly={false}
                onSelect={() => addFormulaDirect(bentoToupitiFormula)} />
            </div>
          )}

          {/* PS-02 C — Carrousel « Article seul » : une carte par écran (swipe droite → gauche), image en grand,
              même composant ProductCard que le slot plat (image, nom, prix, allergènes ; crudités via addItem → modal),
              catégorie en kicker, indicateur de position (points). Bubble Tea hors carrousel (§7). */}
          {alcCarouselItems.length > 0 && (
            <section aria-label="Article seul">
              <div ref={alcCarouselRef} className="pcarousel" onScroll={onAlcScroll}>
                {alcCarouselItems.map(({ item, kicker }) => (
                  <ProductCard key={item.id} id={item.id} name={item.name} description={item.description}
                    priceCents={item.price_alone_cents} imageUrl={item.image_url} emoji={item.emoji}
                    isMenuOnly={!item.sellable_alone && item.sellable_in_menu} allergens={item.allergens}
                    comingSoon={!!item.coming_soon} onSelect={addItem} large kicker={kicker} />
                ))}
              </div>
              <div className="pdots" role="tablist" aria-label="Position dans les articles">
                {alcCarouselItems.map(({ item }, i) => (
                  <button key={item.id} type="button" role="tab" aria-selected={i === alcIdx} aria-label={`${i + 1} / ${alcCarouselItems.length} — ${item.name}`}
                    className={`pdot${i === alcIdx ? " is-active" : ""}`} onClick={() => scrollAlcTo(i)} />
                ))}
              </div>
            </section>
          )}

          {/* PS-02 §7 — Bubble Tea : bloc fixe en bas de la section Article seul, jamais dans le swipe */}
          {bblItem && bblItem.price_alone_cents != null && (
            <div className={`bbl-block${bblItem.coming_soon ? " is-soon" : ""}`}>
              <div className="flex items-center gap-3 min-w-0">
                {bblItem.image_url ? (
                  <img src={buildImgUrl(bblItem.image_url)} alt="" className="w-12 h-12 rounded-xl object-cover flex-none" style={{ background: "var(--bg-alt)" }} />
                ) : (
                  <span className="text-2xl flex-none" aria-hidden="true">{bblItem.emoji ?? "🧋"}</span>
                )}
                <div className="min-w-0">
                  <p className="font-display font-semibold text-base leading-tight" style={{ color: "var(--ink)" }}>+ {bblItem.name} {fmtPrice(bblItem.price_alone_cents)}</p>
                  <p className="text-xs" style={{ color: "var(--ink-soft)" }}>{bblItem.coming_soon ? "Bientôt disponible !" : "À ajouter à ton article seul"}</p>
                </div>
              </div>
              <button type="button" className="pcard-btn text-sm focus-ring flex-none" disabled={!!bblItem.coming_soon}
                onClick={() => addItem(bblItem.id)} aria-label={`Ajouter ${bblItem.name}`}>
                {bblItem.coming_soon ? "Bientôt !" : "Ajouter"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Snacks */}
      {snackItems.length > 0 && (
        <section className="px-4 mt-8" aria-label={SNACK_SECTION.title}>
          <h2 className="font-semibold text-lg mb-0.5" style={{ color: "var(--ink)" }}>{SNACK_SECTION.emoji} {SNACK_SECTION.title}</h2>
          <p className="text-xs mb-2" style={{ color: "var(--ink-soft)" }}>Pour {selectedProfil?.prenom ?? "toi"}</p>
          <div className="pgrid">
            {snackItems.map((item) => (
              <ProductCard key={item.id} id={item.id} name={item.name} description={item.description}
                priceCents={item.price_alone_cents} imageUrl={item.image_url} emoji={item.emoji}
                isMenuOnly={false} allergens={item.allergens}
                comingSoon={!!item.coming_soon} onSelect={addItem} />
            ))}
          </div>
        </section>
      )}

      {/* T1 (3-E) — Mini cabas sticky supprimé. Point d'entrée unique = icône caddie BottomNav. */}

      {/* ================================================================ */}
      {/* MENU FLOW MODAL                                                   */}
      {/* ================================================================ */}
      {mfOpen && mfFormula && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center">
          <div className="w-full ps-col rounded-t-2xl max-h-[85vh] overflow-y-auto" style={{ background: "var(--card)" }}>
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
                <div className="pgrid">
                  {menuPlatItems.map((item) => (
                    <ProductCard key={item.id} id={item.id} name={item.name} priceCents={mfFormula.price_cents}
                      priceLabel={fmtPrice(mfFormula.price_cents)} imageUrl={item.image_url} emoji={item.emoji}
                      isMenuOnly={false} allergens={item.allergens} ctaLabel="Choisir"
                      comingSoon={!!item.coming_soon} onSelect={() => selectPlat(item)} />
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
                  {/* §5 — case sauce piment (offerte), indépendante des garnitures */}
                  {sauceCheckboxApplies(mfPlat?.sku) && (
                    <label className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer mb-4"
                      style={{ borderColor: mfSauce ? "var(--accent)" : "var(--border)", background: mfSauce ? "#FEF3E2" : "transparent" }}>
                      <input type="checkbox" checked={mfSauce} onChange={() => setMfSauce((v) => !v)} className="w-5 h-5" style={{ accentColor: "var(--accent)" }} />
                      <span className="text-lg">🌶️</span>
                      <span className="text-sm font-medium">Sauce piment <span style={{ color: "var(--ink-soft)" }}>(offerte)</span></span>
                    </label>
                  )}
                  <button onClick={() => finishMenu(mfPlat!, mfToppings)} className="w-full h-12 rounded-xl font-display font-semibold text-white" style={{ background: "var(--accent)" }}>
                    {`Ajouter au panier${mfSauce ? " · 🌶️ Sauce piment" : ""}`}
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
          <div className="w-full ps-col rounded-t-2xl max-h-[85vh] overflow-y-auto" style={{ background: "var(--card)" }}>
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
              {/* PS-01b — même règle image que les cartes : 4/3, 96/120 px, jamais plus large que le conteneur */}
              {alcItem.image_url && (
                <div className="pcard-img mb-4">
                  <img src={buildImgUrl(alcItem.image_url)} alt={alcItem.name} />
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
              {/* §5 — case sauce piment (offerte) à la carte */}
              {sauceCheckboxApplies(alcItem.sku) && (
                <label className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer mb-4"
                  style={{ borderColor: alcSauce ? "var(--accent)" : "var(--border)", background: alcSauce ? "#FEF3E2" : "transparent" }}>
                  <input type="checkbox" checked={alcSauce} onChange={() => setAlcSauce((v) => !v)} className="w-5 h-5" style={{ accentColor: "var(--accent)" }} />
                  <span className="text-lg">🌶️</span>
                  <span className="text-sm font-medium">Sauce piment <span style={{ color: "var(--ink-soft)" }}>(offerte)</span></span>
                </label>
              )}
              <button onClick={finishAlcItem} className="w-full h-12 rounded-xl font-display font-semibold text-white" style={{ background: "var(--accent)" }}>
                {`Ajouter au panier${alcSauce ? " · 🌶️ Sauce piment" : ""}`}
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
