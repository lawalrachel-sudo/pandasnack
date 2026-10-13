"use client"

import { useEffect, useRef, useState } from "react"
import { AdminBackButton } from "../AdminBackButton"
import { martiniqueToday } from "@/lib/caisse-date"
import {
  CATEGORIES, MOYENS, CATEGORIE_LABEL, MOYEN_LABEL, STATUT_LABEL,
  ecartLignesVsTotal, envoiPennylaneAutorise,
  type TicketCategorie, type TicketMoyen, type TicketStatut, type LigneInput,
} from "@/lib/tickets"

interface TicketRow {
  id: string
  categorie: TicketCategorie
  fournisseur: string | null
  date_ticket: string | null
  montant_ttc: number | null
  moyen_paiement: TicketMoyen | null
  statut: TicketStatut
  created_at: string
  tickets_achats_lignes?: { count: number }[]
}

type LigneUI = LigneInput & { key: number }
function ligneVide(k: number): LigneUI { return { key: k, article: "", quantite: null, unite: "", prix_ttc: null, taux_tva: null } }

function euro(n: number | null | undefined) {
  return n == null ? "—" : `${n.toFixed(2).replace(".", ",")} €`
}

export function TicketsClient() {
  const [photo, setPhoto] = useState<string | null>(null)
  const [categorie, setCategorie] = useState<TicketCategorie | null>(null)
  const [fournisseur, setFournisseur] = useState("")
  const [date, setDate] = useState(martiniqueToday())
  const [montant, setMontant] = useState("")
  const [moyen, setMoyen] = useState<TicketMoyen | "">("")
  const [lignes, setLignes] = useState<LigneUI[]>([ligneVide(0)])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tickets, setTickets] = useState<TicketRow[] | null>(null)
  const keyRef = useRef(1)

  async function loadListe() {
    try {
      const res = await fetch("/api/admin/tickets")
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Erreur")
      setTickets(json.tickets || [])
    } catch (e) { setError((e as Error).message) }
  }
  useEffect(() => {
    let annule = false
    ;(async () => {
      try {
        const res = await fetch("/api/admin/tickets")
        const json = await res.json()
        if (annule) return
        if (!res.ok) throw new Error(json.error || "Erreur")
        setTickets(json.tickets || [])
      } catch (e) { if (!annule) setError((e as Error).message) }
    })()
    return () => { annule = true }
  }, [])

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setPhoto(typeof reader.result === "string" ? reader.result : null)
    reader.readAsDataURL(file)
  }

  function setLigne(k: number, patch: Partial<LigneUI>) {
    setLignes((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)))
  }
  function addLigne() { setLignes((ls) => [...ls, ligneVide(keyRef.current++)]) }
  function delLigne(k: number) { setLignes((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== k) : ls)) }

  function reset() {
    setPhoto(null); setCategorie(null); setFournisseur(""); setDate(martiniqueToday())
    setMontant(""); setMoyen(""); setLignes([ligneVide(keyRef.current++)])
  }

  async function save() {
    if (!categorie) return
    setBusy(true); setError(null)
    try {
      const res = await fetch("/api/admin/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categorie,
          fournisseur: fournisseur.trim() || null,
          date_ticket: date || null,
          montant_ttc: montant === "" ? null : Number(montant),
          moyen_paiement: moyen || null,
          photoDataUrl: photo,
          lignes: lignes.map((l) => ({
            article: l.article, quantite: l.quantite, unite: l.unite, prix_ttc: l.prix_ttc, taux_tva: l.taux_tva,
          })),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Erreur")
      reset()
      await loadListe()
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  const montantNum = montant === "" ? null : Number(montant)
  const { sommeLignes, ecart } = ecartLignesVsTotal(lignes, montantNum)
  const perso = categorie === "perso"

  return (
    <div style={S.page}>
      <AdminBackButton />
      <h1 style={S.h1}>🧾 Tickets de courses</h1>
      <p style={S.intro}>1 photo, 2 usages : dépenses Panda Snack + facture fournisseur Pennylane. Choisis une catégorie avant d’enregistrer.</p>

      {error && <p style={S.err}>⚠ {error}</p>}

      {/* Photo */}
      <label style={S.photoBox}>
        {photo ? <img src={photo} alt="ticket" style={S.photoImg} /> : <span style={S.photoHint}>📸 Prendre / choisir la photo du ticket</span>}
        <input type="file" accept="image/*" capture="environment" onChange={onPhoto} style={{ display: "none" }} />
      </label>

      {/* Catégorie OBLIGATOIRE */}
      <h2 style={S.h2}>Catégorie <span style={S.oblig}>obligatoire</span></h2>
      <div style={S.catRow}>
        {CATEGORIES.map((c) => (
          <button key={c} type="button" onClick={() => setCategorie(c)}
            style={{ ...S.catBtn, ...(categorie === c ? S.catBtnOn : {}) }}>
            {CATEGORIE_LABEL[c]}
          </button>
        ))}
      </div>
      {perso && <p style={S.persoNote}>Perso → exclu des dépenses Snack, jamais envoyé à Pennylane.</p>}

      {/* Champs */}
      <div style={S.grid}>
        <Field label="Fournisseur"><input value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} style={S.input} placeholder="Carrefour…" /></Field>
        <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={S.input} /></Field>
        <Field label="Montant TTC (€)"><input type="number" inputMode="decimal" step="0.01" value={montant} onChange={(e) => setMontant(e.target.value)} style={S.input} placeholder="0,00" /></Field>
        <Field label="Moyen de paiement">
          <select value={moyen} onChange={(e) => setMoyen(e.target.value as TicketMoyen | "")} style={S.input}>
            <option value="">—</option>
            {MOYENS.map((m) => <option key={m} value={m}>{MOYEN_LABEL[m]}</option>)}
          </select>
        </Field>
      </div>

      {/* Lignes */}
      <h2 style={S.h2}>Lignes (facultatif)</h2>
      {lignes.map((l) => (
        <div key={l.key} style={S.ligne}>
          <input value={l.article ?? ""} onChange={(e) => setLigne(l.key, { article: e.target.value })} style={{ ...S.input, flex: 2 }} placeholder="Article" />
          <input type="number" inputMode="decimal" value={l.quantite ?? ""} onChange={(e) => setLigne(l.key, { quantite: e.target.value === "" ? null : Number(e.target.value) })} style={{ ...S.input, flex: 1 }} placeholder="Qté" />
          <input value={l.unite ?? ""} onChange={(e) => setLigne(l.key, { unite: e.target.value })} style={{ ...S.input, width: 56 }} placeholder="u." />
          <input type="number" inputMode="decimal" step="0.01" value={l.prix_ttc ?? ""} onChange={(e) => setLigne(l.key, { prix_ttc: e.target.value === "" ? null : Number(e.target.value) })} style={{ ...S.input, flex: 1 }} placeholder="€ TTC" />
          <input type="number" inputMode="decimal" step="0.1" value={l.taux_tva ?? ""} onChange={(e) => setLigne(l.key, { taux_tva: e.target.value === "" ? null : Number(e.target.value) })} style={{ ...S.input, width: 64 }} placeholder="TVA%" />
          <button type="button" onClick={() => delLigne(l.key)} style={S.del} aria-label="Supprimer la ligne">✕</button>
        </div>
      ))}
      <button type="button" onClick={addLigne} style={S.addLigne}>+ Ajouter une ligne</button>
      {montantNum != null && lignes.some((l) => l.prix_ttc != null) && (
        <p style={{ ...S.ecart, color: ecart && Math.abs(ecart) > 0.01 ? "#DC2626" : "var(--ink-soft)" }}>
          Somme des lignes {euro(sommeLignes)} {ecart != null && Math.abs(ecart) > 0.01 ? `· écart ${euro(ecart)} vs total` : "· OK"}
        </p>
      )}

      <button type="button" onClick={save} disabled={!categorie || busy} style={{ ...S.cta, ...((!categorie || busy) ? S.ctaOff : {}) }}>
        {busy ? "Enregistrement…" : "Enregistrer le ticket"}
      </button>
      {categorie && !perso && <p style={S.plNote}>Envoi vers Pennylane : bientôt (jeton requis).</p>}

      {/* Liste récente */}
      <h2 style={S.h2}>Tickets récents</h2>
      {!tickets && !error && <p style={S.muted}>Chargement…</p>}
      {tickets && tickets.length === 0 && <p style={S.muted}>Aucun ticket enregistré.</p>}
      {tickets?.map((t) => (
        <div key={t.id} style={S.card}>
          <div style={S.cardTop}>
            <span style={S.nom}>{t.fournisseur || "Sans fournisseur"}</span>
            <strong style={S.solde}>{euro(t.montant_ttc)}</strong>
          </div>
          <div style={S.sub}>
            {CATEGORIE_LABEL[t.categorie]} · {t.date_ticket || "—"} · {t.tickets_achats_lignes?.[0]?.count ?? 0} ligne(s)
            {!envoiPennylaneAutorise(t.categorie) ? "" : ""}
          </div>
          <span style={{ ...S.badge, ...(t.statut === "exclu" ? S.badgeMuted : {}) }}>{STATUT_LABEL[t.statut]}</span>
        </div>
      ))}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={S.field}><span style={S.fieldLabel}>{label}</span>{children}</label>
}

const S: Record<string, React.CSSProperties> = {
  page: { maxWidth: 460, margin: "0 auto", padding: "16px 14px 40px", fontFamily: "var(--font-display, Fredoka), system-ui, sans-serif", color: "var(--ink)" },
  h1: { fontSize: 22, fontWeight: 800, margin: "12px 0 8px" },
  intro: { fontSize: 14, color: "var(--ink-soft)", margin: "0 0 14px", lineHeight: 1.5 },
  err: { color: "#DC2626", fontSize: 14 },
  muted: { color: "var(--ink-soft)", fontSize: 14 },
  photoBox: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: 120, border: "2px dashed var(--border)", borderRadius: 16, background: "var(--card, #fff)", cursor: "pointer", overflow: "hidden", marginBottom: 14 },
  photoImg: { width: "100%", maxHeight: 280, objectFit: "contain" },
  photoHint: { color: "var(--ink-soft)", fontSize: 15, fontWeight: 600, padding: 16, textAlign: "center" },
  h2: { fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--ink-soft)", margin: "16px 0 8px" },
  oblig: { color: "var(--accent)", fontWeight: 800 },
  catRow: { display: "flex", gap: 8 },
  catBtn: { flex: 1, minHeight: 50, borderRadius: 12, borderWidth: 1, borderStyle: "solid", borderColor: "var(--border)", background: "var(--card, #fff)", color: "var(--ink)", fontSize: 15, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" },
  catBtnOn: { borderColor: "var(--accent)", background: "#FBF0EA", color: "var(--accent)" },
  persoNote: { fontSize: 13, color: "var(--ink-soft)", margin: "8px 0 0" },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  fieldLabel: { fontSize: 12, color: "var(--ink-soft)", fontWeight: 600 },
  input: { width: "100%", minHeight: 44, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 15, background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit" },
  ligne: { display: "flex", gap: 6, alignItems: "center", marginBottom: 8 },
  del: { minWidth: 36, minHeight: 36, borderRadius: 8, border: "1px solid var(--border)", background: "var(--card, #fff)", color: "var(--ink-soft)", cursor: "pointer" },
  addLigne: { background: "none", border: "none", color: "var(--accent)", fontWeight: 700, fontSize: 14, fontFamily: "inherit", cursor: "pointer", padding: "6px 0" },
  ecart: { fontSize: 13, margin: "4px 0 0" },
  cta: { width: "100%", minHeight: 54, marginTop: 18, borderRadius: 14, border: "none", background: "var(--accent)", color: "#fff", fontSize: 17, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" },
  ctaOff: { background: "var(--bg-alt)", color: "var(--ink-soft)", cursor: "not-allowed" },
  plNote: { fontSize: 12, color: "var(--ink-soft)", textAlign: "center", margin: "8px 0 0" },
  card: { border: "1px solid var(--border)", borderRadius: 14, padding: 14, marginBottom: 10, background: "var(--card, #fff)" },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 },
  nom: { fontWeight: 800, fontSize: 16 },
  solde: { fontSize: 16, color: "var(--accent-2, #5A7F42)" },
  sub: { fontSize: 13, color: "var(--ink-soft)", marginTop: 4 },
  badge: { display: "inline-block", marginTop: 8, fontSize: 12, fontWeight: 700, color: "var(--accent)", background: "#FBF0EA", borderRadius: 8, padding: "3px 8px" },
  badgeMuted: { color: "var(--ink-soft)", background: "var(--bg-alt)" },
}
