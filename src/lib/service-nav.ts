// PS-17 — Navigation ‹ › du Service du jour : résolution de la date affichée + préc./suiv.
// Pur, testable. Les créneaux sont déjà filtrés (pandattitude actifs + devoirs) côté route ;
// les jours de stage (day_type='stage', target pandattitude) en font partie → la nav les atteint.
export interface NavSlot { service_date: string }

export function resolveServiceNav<T extends NavSlot>(
  slots: T[], askedDate: string | null, today: string,
): { idx: number; prev: string | null; next: string | null } {
  if (!slots || slots.length === 0) return { idx: -1, prev: null, next: null }
  let idx = -1
  if (askedDate) idx = slots.findIndex((s) => s.service_date === askedDate)
  if (idx === -1) {
    idx = slots.findIndex((s) => s.service_date >= today)
    if (idx === -1) idx = slots.length - 1
  }
  return {
    idx,
    prev: idx > 0 ? slots[idx - 1].service_date : null,
    next: idx < slots.length - 1 ? slots[idx + 1].service_date : null,
  }
}
