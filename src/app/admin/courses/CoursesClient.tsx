"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AdminBackButton } from "../AdminBackButton"
import { RAYONS, rayonLabel } from "@/lib/courses-rayons"
import { PASTILLES, pastille, prochainFournisseur, quantiteAffichee, trierListe } from "@/lib/courses-liste"
import { listePdf, type PdfGroupe } from "@/lib/courses-pdf"
import { martiniqueToday } from "@/lib/caisse-date"

// PS-28 — Liste de courses cochable : une ligne par article, groupée rayon → fournisseur → alpha.
// Cocher = barré (coche_at + dernier_achat). Préparer / Imprimer (A4, 3 colonnes) / Partager en PDF.
// L'ancienne vue cartes + stepper (PS-25) reste sur /admin/courses/cartes.

interface Item {
  id: string; libelle: string; quantite: number; unite: string | null; quantite_texte: string | null
  categorie: string; fournisseur: string | null; statut: string; archived_at: string | null
}
type Ligne = Item & { coche: boolean }

const RAYON_CLES = new Set(RAYONS.map((r) => r.key))
const rayonDe = (cat: string) => (RAYON_CLES.has(cat) ? cat : "autre")

export function CoursesClient() {
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState<string | null>(null)
  const [saisies, setSaisies] = useState<Record<string, string>>({})

  async function load() {
    const res = await fetch("/api/admin/courses")
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || "Erreur")
    setItems(json.items || [])
  }
  useEffect(() => {
    let annule = false
    ;(async () => {
      try {
        const res = await fetch("/api/admin/courses")
        const json = await res.json()
        if (annule) return
        if (!res.ok) throw new Error(json.error || "Erreur")
        setItems(json.items || [])
      } catch (e) { if (!annule) setError((e as Error).message) }
    })()
    return () => { annule = true }
  }, [])

  async function act(body: Record<string, unknown>) {
    const res = await fetch("/api/admin/courses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || "Erreur")
    return json
  }

  const lignes: Ligne[] = useMemo(
    () => trierListe((items || []).map((i) => ({ ...i, categorie: rayonDe(i.categorie), coche: i.statut === "achete" }))),
    [items],
  )
  const parRayon = useMemo(() => {
    const m = new Map<string, Ligne[]>()
    for (const l of lignes) { const g = m.get(l.categorie) || []; g.push(l); m.set(l.categorie, g) }
    return m
  }, [lignes])
  const restants = lignes.filter((l) => !l.coche)
  const nbCoches = lignes.length - restants.length

  // Cochage optimiste : la ligne se barre tout de suite, rechargement en cas d'erreur.
  async function basculer(l: Ligne) {
    const statut = l.coche ? "a_acheter" : "achete"
    setItems((prev) => (prev || []).map((i) => (i.id === l.id ? { ...i, statut } : i)))
    try { await act(l.coche ? { action: "decocher", id: l.id, reverse: true } : { action: "achete", id: l.id }) }
    catch (e) { setError((e as Error).message); load().catch(() => {}) }
  }

  // PS-29 — tap sur la pastille = fournisseur suivant (optimiste), mémorisé au catalogue.
  async function changerFournisseur(l: Ligne) {
    const fournisseur = prochainFournisseur(l.fournisseur)
    setItems((prev) => (prev || []).map((i) => (i.id === l.id ? { ...i, fournisseur } : i)))
    try { await act({ action: "fournisseur", id: l.id, fournisseur }) }
    catch (e) { setError((e as Error).message); load().catch(() => {}) }
  }

  async function lancer(body: Record<string, unknown>, ok?: (json: Record<string, unknown>) => string | null) {
    setBusy(true); setError(null); setInfo(null)
    try { const json = await act(body); await load(); if (ok) setInfo(ok(json)) }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  function preparer() {
    lancer({ action: "preparer" }, (j) => {
      const n = Number(j.ajoutes) || 0
      return n === 0 ? "Rien de plus à ajouter : la liste est à jour." : `${n} article${n > 1 ? "s" : ""} ajouté${n > 1 ? "s" : ""}.`
    })
  }

  function ajouter(rayon: string) {
    const libelle = (saisies[rayon] || "").trim()
    if (!libelle || busy) return
    setSaisies((s) => ({ ...s, [rayon]: "" }))
    lancer({ action: "ajouter", libelle, categorie: rayon })
  }

  const jour = martiniqueToday()
  const titre = `Courses Panda Snack — ${jour.slice(8, 10)}/${jour.slice(5, 7)}`
  const groupesImpression = RAYONS
    .map((r) => ({ key: r.key, titre: r.label, lignes: (parRayon.get(r.key) || []).filter((l) => !l.coche) }))
    .filter((g) => g.lignes.length > 0)

  async function partagerPdf() {
    const groupes: PdfGroupe[] = groupesImpression.map((g) => ({
      titre: g.titre,
      lignes: g.lignes.map((l) => ({ libelle: l.libelle, quantite: quantiteAffichee(l.quantite, l.unite, l.quantite_texte), couleur: pastille(l.fournisseur).couleur })),
    }))
    const nom = `courses-panda-snack-${jour.slice(8, 10)}-${jour.slice(5, 7)}.pdf`
    const file = new File([listePdf(titre, groupes)], nom, { type: "application/pdf" })
    if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: titre }); return }
      catch (e) { if ((e as Error).name === "AbortError") return }
    }
    // Repli : téléchargement du PDF.
    const url = URL.createObjectURL(file)
    const a = document.createElement("a")
    a.href = url; a.download = nom
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  if (error && !items) return <div style={S.page}><AdminBackButton /><p style={S.err}>{error}</p></div>
  if (!items) return <div style={S.page}><AdminBackButton /><p style={S.muted}>Chargement…</p></div>

  return (
    <>
      <style>{PRINT_CSS}</style>
      <div style={S.page} className="ps28-ecran">
        <AdminBackButton />
        <h1 style={S.h1}>Courses</h1>
        <p style={S.count}>{restants.length} à acheter{nbCoches > 0 ? ` · ${nbCoches} dans le caddie` : ""}</p>
        <p style={S.legende}>
          {PASTILLES.map((p) => (
            <span key={p.cle} style={S.legItem}><span style={{ ...S.dot, background: p.couleur }} />{p.nom}</span>
          ))}
        </p>

        <div style={S.actions}>
          <button onClick={preparer} disabled={busy} style={{ ...S.btn, ...S.btnMain }}>Préparer la liste</button>
          <button onClick={() => window.print()} disabled={restants.length === 0} style={S.btn}>Imprimer</button>
          <button onClick={partagerPdf} disabled={restants.length === 0} style={S.btn}>Partager en PDF</button>
        </div>
        {info && <p style={S.info}>{info}</p>}
        {error && <p style={S.err}>{error}</p>}

        {RAYONS.map((r) => {
          const ls = parRayon.get(r.key) || []
          return (
            <section key={r.key} style={S.rayon}>
              <h2 style={S.h2}>{r.label}{ls.length > 0 && <span style={S.h2n}> {ls.filter((l) => !l.coche).length}</span>}</h2>
              {ls.map((l) => (
                <label key={l.id} style={S.ligne}>
                  <input type="checkbox" checked={l.coche} onChange={() => basculer(l)} style={S.check} />
                  <button
                    type="button" style={S.dotBtn}
                    aria-label={`Fournisseur : ${pastille(l.fournisseur).nom || "aucun"} — changer`}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); changerFournisseur(l) }}
                  >
                    <span style={{ ...S.dot, background: pastille(l.fournisseur).couleur }} />
                  </button>
                  <span style={{ ...S.lib, ...(l.coche ? S.barre : {}) }}>{l.libelle}</span>
                  <span style={{ ...S.qte, ...(l.coche ? S.barre : {}) }}>{quantiteAffichee(l.quantite, l.unite, l.quantite_texte)}</span>
                </label>
              ))}
              <input
                value={saisies[r.key] || ""} placeholder="+ ajouter…" enterKeyHint="done" aria-label={`Ajouter dans ${r.label}`}
                onChange={(e) => setSaisies((s) => ({ ...s, [r.key]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ajouter(r.key) } }}
                style={S.ajout}
              />
            </section>
          )
        })}

        {nbCoches > 0 && (
          <button onClick={() => lancer({ action: "terminer" })} disabled={busy} style={S.terminer}>
            Terminer les courses ({nbCoches})
          </button>
        )}
        <div style={S.liens}>
          <Link href="/admin/courses/cartes" style={S.lien}>Vue cartes (quantités)</Link>
          <Link href="/admin/courses/catalogue" style={S.lien}>Catalogue</Link>
        </div>
      </div>

      {/* Feuille imprimée : A4, 3 colonnes, non cochés uniquement. */}
      <div className="ps28-print" aria-hidden="true">
        <h1>{titre}</h1>
        <div className="ps28-cols">
          {groupesImpression.map((g) => (
            <div key={g.key}>
              <h2>{rayonLabel(g.key)}</h2>
              {g.lignes.map((l) => (
                <div key={l.id} className="ps28-ligne">
                  <span className="ps28-case" />
                  <span className="ps28-dot" style={{ background: pastille(l.fournisseur).couleur }} />
                  <span>{l.libelle} <span className="ps28-qte">{quantiteAffichee(l.quantite, l.unite, l.quantite_texte)}</span></span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

const PRINT_CSS = `
.ps28-print { display: none; }
@media print {
  @page { size: A4; margin: 10mm; }
  body * { visibility: hidden; }
  .ps28-ecran { display: none !important; }
  .ps28-print, .ps28-print * { visibility: visible; }
  .ps28-print { display: block; position: absolute; left: 0; top: 0; width: 100%; color: #000; background: #fff; font-family: Helvetica, Arial, sans-serif; }
  .ps28-print h1 { font-size: 13pt; margin: 0 0 3mm; }
  .ps28-cols { column-count: 3; column-gap: 6mm; }
  .ps28-print h2 { font-size: 8pt; text-transform: uppercase; letter-spacing: .03em; color: #555; margin: 2mm 0 1mm; break-after: avoid; }
  .ps28-ligne { display: flex; align-items: center; gap: 1.6mm; font-size: 9.5pt; line-height: 1.25; padding: .5mm 0; break-inside: avoid; }
  .ps28-case { flex: 0 0 auto; width: 2.8mm; height: 2.8mm; border: .25mm solid #000; }
  .ps28-dot { flex: 0 0 auto; width: 2.5mm; height: 2.5mm; border-radius: 50%; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .ps28-qte { color: #555; }
}
`

const S: Record<string, React.CSSProperties> = {
  page: { maxWidth: 560, margin: "0 auto", padding: "16px 14px 60px", fontFamily: "var(--font-display, Fredoka), system-ui, sans-serif", color: "var(--ink)" },
  h1: { fontSize: 22, fontWeight: 800, margin: "12px 0 2px" },
  count: { fontSize: 13, color: "var(--ink-soft)", margin: "0 0 4px" },
  legende: { display: "flex", gap: 14, fontSize: 12, color: "var(--ink-soft)", margin: "0 0 10px" },
  legItem: { display: "inline-flex", alignItems: "center", gap: 5 },
  err: { color: "#DC2626", fontSize: 14 }, muted: { color: "var(--ink-soft)", fontSize: 14 },
  info: { fontSize: 13, color: "var(--accent-2, #5A7F42)", fontWeight: 700, margin: "4px 0 0" },
  actions: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 },
  btn: { minHeight: 44, borderRadius: 12, border: "1px solid var(--border)", background: "var(--card,#fff)", color: "var(--ink)", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", padding: "0 6px" },
  btnMain: { background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" },
  rayon: { marginTop: 14 },
  h2: { fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".03em", color: "var(--ink-soft)", margin: "0 0 2px", padding: "0 2px" },
  h2n: { fontWeight: 600 },
  ligne: { display: "flex", alignItems: "center", gap: 10, minHeight: 44, padding: "0 2px", borderBottom: "1px solid var(--border)", cursor: "pointer" },
  check: { width: 20, height: 20, flex: "0 0 auto", margin: 0, accentColor: "var(--accent)" },
  dot: { display: "inline-block", width: 8, height: 8, borderRadius: 999, flex: "0 0 auto" },
  dotBtn: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, margin: "-8px -4px", padding: 0, border: "none", background: "transparent", cursor: "pointer", flex: "0 0 auto" },
  lib: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, lineHeight: 1.25 },
  qte: { flex: "0 0 auto", maxWidth: "45%", textAlign: "right", fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.2 },
  barre: { textDecoration: "line-through", opacity: 0.45 },
  ajout: { width: "100%", minHeight: 40, border: "none", borderBottom: "1px dashed var(--border)", background: "transparent", color: "var(--ink)", fontSize: 14, fontFamily: "inherit", padding: "0 2px", outline: "none" },
  terminer: { width: "100%", minHeight: 48, marginTop: 18, borderRadius: 14, border: "none", background: "var(--accent-2, #5A7F42)", color: "#fff", fontSize: 15, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" },
  liens: { display: "flex", gap: 16, justifyContent: "center", marginTop: 14 },
  lien: { color: "var(--ink-soft)", fontSize: 13, fontWeight: 700, textDecoration: "underline" },
}
