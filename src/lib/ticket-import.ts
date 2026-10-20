// PS-26c — Périmètre d'import des factures fournisseurs Pennylane → tickets Snack. Logique pure,
// testée ; miroir de l'Edge Function pennylane-import. Pennylane reste en LECTURE SEULE.

// Fournisseurs du périmètre (correspondance insensible à la casse, sur le nom OU le libellé).
export const FOURNISSEURS_PERIMETRE = [
  "CLUNYBAM", "Carrefour Cluny", "SADECO", "Carrefour Dillon", "SOCOPOINT", "MG STORE",
  "LE SPECIALISTE DE L'EMBALLAGE", "Gerembal", "SOMABAZ", "EQUIP COMMERCE", "DOMIA DISTRIBUTION",
  "GIMONTAIGNE", "ONLY WORLD", "AU REGAL DE DIDIER", "LE ROYAL", "NOREBAM", "PHYSADIS",
  "ECOCOM@M", "ANTOINE HAYOT", "GRANDES SURFACES", "RETIF", "PLI BEL PRICE JAMBETTE",
]
// Exclu explicitement (travaux des locaux, tranché par Rachel).
export const FOURNISSEURS_EXCLUS = ["SOMABRI"]
// Facture sans fournisseur à inclure (par numéro).
const NUMERO_SANS_FOURNISSEUR = "8658"

function norm(s: string | null | undefined): string {
  return (s || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
}

export interface InvoiceRef { supplier_name?: string | null; label?: string | null; invoice_number?: string | null; date: string }

// Dans le périmètre ? (exclusion SOMABRI prioritaire, puis fournisseur listé, puis facture 8658).
export function dansPerimetre(inv: InvoiceRef): boolean {
  const hay = `${norm(inv.supplier_name)} ${norm(inv.label)}`
  if (FOURNISSEURS_EXCLUS.some((x) => hay.includes(norm(x)))) return false
  if (FOURNISSEURS_PERIMETRE.some((f) => hay.includes(norm(f)))) return true
  // Facture SANS fournisseur n° 8658 : uniquement si aucun fournisseur (évite un faux positif
  // quand « 8658 » apparaît dans le n° d'une facture d'un autre fournisseur, ex. Envato).
  const sansFournisseur = !(inv.supplier_name || "").trim()
  if (sansFournisseur && ((inv.invoice_number || "").includes(NUMERO_SANS_FOURNISSEUR) || (inv.label || "").includes(NUMERO_SANS_FOURNISSEUR))) return true
  return false
}

// Carrefour + Socopoint du 01/07 au 31/08/2026 = achats stages d'été → pro_ltc. Sinon pro_snack.
export function categoriePour(inv: InvoiceRef): "pro_snack" | "pro_ltc" {
  const hay = `${norm(inv.supplier_name)} ${norm(inv.label)}`
  const estStageSupplier = ["clunybam", "carrefour", "sadeco", "socopoint"].some((x) => hay.includes(x))
  const d = inv.date
  const dansEte = d >= "2026-07-01" && d <= "2026-08-31"
  return estStageSupplier && dansEte ? "pro_ltc" : "pro_snack"
}

// GARDE ABSOLUE : un ticket importé (source import_pennylane OU déjà lié à une facture Pennylane)
// n'est JAMAIS envoyé/rapproché par le circuit PS-22.
export function peutEnvoyerPennylane(t: { source?: string | null; pennylane_invoice_id?: string | null }): boolean {
  if (t.source === "import_pennylane") return false
  if (t.pennylane_invoice_id) return false
  return true
}
