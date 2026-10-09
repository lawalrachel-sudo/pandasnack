// PS-17 — Lecture serveur de l'état d'affichage Stage (hero + bandeau), dérivé des créneaux
// day_type='stage' ACTIFS. Aucune date en dur : Claude active les créneaux → le hero apparaît,
// après la semaine il disparaît seul.
import { martiniqueToday } from "./caisse-date"
import { stageDisplayState, type StageDisplay } from "./stage-state"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getStageDisplay(admin: any): Promise<StageDisplay> {
  if (!admin) return { heroUpcoming: false, weekNow: false }
  const { data } = await admin.from("service_slots")
    .select("service_date").eq("day_type", "stage").eq("active", true)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dates = (data || []).map((r: any) => r.service_date as string)
  return stageDisplayState(dates, martiniqueToday())
}
