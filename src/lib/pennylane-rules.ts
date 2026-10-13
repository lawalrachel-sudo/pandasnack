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

// --- PS-22 corrections (contrôle Cowork 13/10) : fenêtre de retry + anti double rattachement ---

// Jours écoulés entre date_ticket et aujourd'hui (dates ISO YYYY-MM-DD, midi UTC pour éviter la DST).
export function joursEcoules(dateTicket: string, today: string): number {
  const a = new Date(dateTicket + "T12:00:00Z").getTime()
  const b = new Date(today + "T12:00:00Z").getTime()
  return Math.floor((b - a) / 86400000)
}

export type RapprochementDecision =
  | { statut: "rapproche"; transactionId: number }
  | { statut: "a_verifier"; erreur: string }
  | { statut: "envoye" } // reste en attente, retenté au prochain passage

// Décision pour UN ticket (candidats déjà filtrés : montant exact, fenêtre ±5 j, non lettrés, non
// déjà consommés ce passage) :
//  - 1 candidat → rapproché ;
//  - 2+ → a_verifier tout de suite ;
//  - 0 ET aujourd'hui ≤ date_ticket + fenetreJours → rester 'envoye' (retry) ;
//  - 0 après la fenêtre → a_verifier.
export function decideRapprochement(
  candidats: { id: number }[],
  dateTicket: string,
  today: string,
  fenetreJours = 7,
): RapprochementDecision {
  if (candidats.length === 1) return { statut: "rapproche", transactionId: candidats[0].id }
  if (candidats.length >= 2) return { statut: "a_verifier", erreur: `${candidats.length} candidats` }
  if (joursEcoules(dateTicket, today) <= fenetreJours) return { statut: "envoye" }
  return { statut: "a_verifier", erreur: `aucune transaction après ${fenetreJours} j` }
}

// Passage complet : traite les tickets du plus ancien au plus récent ; une transaction déjà assignée
// (rapproché) ne peut plus servir de candidat à un autre ticket dans le même passage.
export function planifierRapprochements(
  tickets: { id: string; date_ticket: string; candidats: { id: number }[] }[],
  today: string,
  fenetreJours = 7,
): { ticketId: string; decision: RapprochementDecision }[] {
  const utilises = new Set<number>()
  const ordered = [...tickets].sort((a, b) => (a.date_ticket || "").localeCompare(b.date_ticket || ""))
  return ordered.map((t) => {
    const dispo = t.candidats.filter((c) => !utilises.has(c.id))
    const decision = decideRapprochement(dispo, t.date_ticket, today, fenetreJours)
    if (decision.statut === "rapproche") utilises.add(decision.transactionId)
    return { ticketId: t.id, decision }
  })
}
