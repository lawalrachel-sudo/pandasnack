// PS-24 — Caisse « à compter » : sélection des clôtures jour non encore rapprochées (espèces).
// Logique pure, testée. Le rapprochement réel passe par /api/admin/caisse/reconcile (inchangé).

export interface ClotureACompter {
  id: string
  period_type: string
  period_start: string          // date du service (AAAA-MM-JJ)
  cash_expected_cents: number
  cash_counted_at: string | null
  is_test?: boolean             // défensif : les clôtures prod n'en ont pas (le Z exclut déjà is_test)
}

// Journées jour à compter : non rapprochées, hors test, de la PLUS ANCIENNE à la plus récente.
export function aCompter<T extends ClotureACompter>(clotures: T[]): T[] {
  return clotures
    .filter((c) => c.period_type === "jour" && !c.cash_counted_at && !c.is_test)
    .sort((a, b) => a.period_start.localeCompare(b.period_start))
}

export function nbACompter(clotures: ClotureACompter[]): number {
  return aCompter(clotures).length
}

// Écart de caisse = compté − attendu (positif = excédent, négatif = manquant). null si rien compté.
export function ecartCents(counted: number | null | undefined, expected: number): number | null {
  if (counted == null || !Number.isFinite(counted)) return null
  return counted - expected
}

// Rappel des ventes espèces du jour, depuis le Z (data jsonb de la clôture).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function especesDuJour(data: any): { total_cents: number; comptoir_nb: number } {
  return {
    total_cents: Number(data?.totaux?.ttc_par_mode?.especes ?? data?.totaux?.especes_attendues ?? 0),
    comptoir_nb: Number(data?.comptoir?.nb ?? 0),
  }
}
