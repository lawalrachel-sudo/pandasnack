import { describe, expect, it } from "vitest"
import { NOTIFY_MAX_AGE_MS, buildEventLine, formatCreatedAtMartinique, formatServiceDay, isCatchUp } from "./notify"

describe("formatCreatedAtMartinique (PS-06d §3/§4)", () => {
  it("affiche created_at en heure Martinique (UTC-4), pas UTC", () => {
    // 22:48 UTC le 25/09 = 18:48 Martinique le 25/09 (incident PS-20260925-0002).
    expect(formatCreatedAtMartinique("2026-09-25T22:48:11.544Z")).toBe("25/09 à 18h48")
  })

  it("gère le passage de minuit UTC → jour précédent en Martinique", () => {
    // 01:44 UTC le 26/09 = 21:44 Martinique le 25/09.
    expect(formatCreatedAtMartinique("2026-09-26T01:44:52.693Z")).toBe("25/09 à 21h44")
  })

  it("n'utilise jamais l'heure d'envoi : deux appels tardifs sur le même created_at donnent la même heure", () => {
    const created = "2026-09-25T22:48:11.544Z"
    const a = formatCreatedAtMartinique(created)
    const b = formatCreatedAtMartinique(created) // « envoyé » 3 h plus tard, peu importe
    expect(a).toBe(b)
    expect(a).toBe("25/09 à 18h48")
  })
})

describe("formatServiceDay", () => {
  it("formate le jour de service", () => {
    expect(formatServiceDay("2026-09-26")).toMatch(/26\/09/)
  })
  it("chaîne vide si absent", () => {
    expect(formatServiceDay(null)).toBe("")
  })
})

describe("isCatchUp (référence = événement déclencheur, PS-06d/06d-b)", () => {
  const now = Date.parse("2026-09-26T01:44:52Z")
  it("événement 3 h avant → rattrapage", () => {
    expect(isCatchUp("2026-09-25T22:48:11Z", now)).toBe(true)
  })
  it("événement quelques secondes avant → flux normal", () => {
    expect(isCatchUp("2026-09-26T01:44:45Z", now)).toBe(false)
  })
  it("juste sous le seuil → normal ; juste au-dessus → rattrapage", () => {
    expect(isCatchUp(new Date(now - NOTIFY_MAX_AGE_MS + 1000).toISOString(), now)).toBe(false)
    expect(isCatchUp(new Date(now - NOTIFY_MAX_AGE_MS - 1000).toISOString(), now)).toBe(true)
  })
  it("référence absente → pas de blocage (false)", () => {
    expect(isCatchUp(null, now)).toBe(false)
  })
})

describe("buildEventLine (PS-06d-b §2)", () => {
  it("payée bien après la création → « Payée le … »", () => {
    // panier 14:00 MQ (18:00 UTC), payée 17:00 MQ (21:00 UTC)
    const line = buildEventLine("2026-09-25T18:00:00Z", "2026-09-25T21:00:00Z", undefined)
    expect(line).toBe("Payée le 25/09 à 17h00")
  })
  it("payée dans la foulée (<1 min) → pas de ligne", () => {
    expect(buildEventLine("2026-09-25T18:00:00Z", "2026-09-25T18:00:30Z", undefined)).toBe("")
  })
  it("on_site confirmée plus tard → « Confirmée sur place le … »", () => {
    const line = buildEventLine("2026-09-25T18:00:00Z", null, "2026-09-25T21:00:00Z")
    expect(line).toBe("Confirmée sur place le 25/09 à 17h00")
  })
  it("pas d'événement distinct → vide", () => {
    expect(buildEventLine("2026-09-25T18:00:00Z", null, undefined)).toBe("")
  })
})
