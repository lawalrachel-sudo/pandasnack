// PS-09a — IBAN de remboursement du parent (remboursement d'un solde Panda Wallet).
// Validation mod 97 (norme ISO 13616), espaces tolérés. Aucun prélèvement : usage remboursement seul.

/** Normalise : sans espaces, majuscules. */
export function normalizeIban(raw: string): string {
  return (raw || "").replace(/\s+/g, "").toUpperCase()
}

/** Validation IBAN mod 97 (structure + clé). Espaces tolérés en entrée. */
export function isValidIban(raw: string): boolean {
  const iban = normalizeIban(raw)
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban)) return false
  // Déplace les 4 premiers caractères à la fin, convertit les lettres (A=10 … Z=35).
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  let remainder = 0
  for (const ch of rearranged) {
    const code = ch >= "A" && ch <= "Z" ? (ch.charCodeAt(0) - 55).toString() : ch
    for (const d of code) remainder = (remainder * 10 + (d.charCodeAt(0) - 48)) % 97
  }
  return remainder === 1
}

/** Masque pour affichage : « FR76 •••• •••• 1234 » (4 premiers + 4 derniers). */
export function maskIban(raw: string | null | undefined): string {
  const iban = normalizeIban(raw || "")
  if (iban.length < 8) return iban
  return `${iban.slice(0, 4)} •••• •••• ${iban.slice(-4)}`
}
