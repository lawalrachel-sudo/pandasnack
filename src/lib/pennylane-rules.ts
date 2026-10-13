// PS-22 — Règles pures d'envoi et de rapprochement Pennylane. Les Edge Functions push-pennylane /
// match-pennylane (Deno) appliquent EXACTEMENT ces règles (miroir, comme pandasnack_jour_creneau ↔
// creneau.ts) ; ces fonctions permettent de les tester en Vitest.

export interface TicketEnvoi { categorie: string; pennylane_invoice_id?: string | null }

// Un ticket n'est envoyé que s'il n'est pas perso ET pas déjà envoyé (idempotence).
export function doitEnvoyer(t: TicketEnvoi): { ok: boolean; raison?: string } {
  if (t.categorie === "perso") return { ok: false, raison: "perso" }
  if (t.pennylane_invoice_id) return { ok: false, raison: "deja_envoye" }
  return { ok: true }
}

// Montant au centime près (transaction en valeur absolue).
export function montantMatche(txAmount: number, montantTtc: number): boolean {
  return Math.round(Math.abs(txAmount) * 100) === Math.round(montantTtc * 100)
}

// Rapprochement : UN SEUL candidat → match ; 0 ou 2+ → à vérifier, rien forcé.
export function choisirCandidat<T>(candidats: T[]): { action: "match" | "verifier"; candidat: T | null; raison: string } {
  if (candidats.length === 1) return { action: "match", candidat: candidats[0], raison: "1 candidat" }
  return { action: "verifier", candidat: null, raison: `${candidats.length} candidat(s)` }
}
