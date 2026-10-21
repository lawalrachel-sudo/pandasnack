// PS-28 — PDF de la liste de courses, généré côté client sans dépendance (partage WhatsApp hors connexion).
// A4, 3 colonnes : case ☐ + pastille couleur + libellé + quantité, groupés par rayon. Lib pure, testée.

export interface PdfLigne { libelle: string; quantite: string; couleur: string }
export interface PdfGroupe { titre: string; lignes: PdfLigne[] }

const A4_W = 595.28, A4_H = 841.89
const MARGE = 28, GOUTTIERE = 14, COLS = 3
const COL_W = (A4_W - 2 * MARGE - (COLS - 1) * GOUTTIERE) / COLS
const T_TITRE = 14, T_RAYON = 8.5, T_LIGNE = 10
const H_LIGNE = 14, H_RAYON = 18
const RETRAIT = 21  // case + pastille avant le texte
const R_PASTILLE = 3.54  // 2,5 mm de diamètre

// Chasses Helvetica (AFM, /1000) pour 32–126 ; les lettres accentuées prennent la chasse de leur base.
const CHASSES = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584]

// WinAnsi pour les caractères hors Latin-1 courants ; le reste hors table est remplacé.
const WINANSI: Record<string, number> = { "€": 0x80, "…": 0x85, "Œ": 0x8c, "œ": 0x9c, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "–": 0x96, "—": 0x97 }
const REMPLACE: Record<string, string> = { "≈": "~", "☐": "", "●": "" }

function normaliser(s: string): string {
  return [...s].map((c) => REMPLACE[c] ?? c).join("")
}

function code(c: string): number {
  if (WINANSI[c] != null) return WINANSI[c]
  const n = c.charCodeAt(0)
  return n >= 32 && n <= 255 ? n : 63  // « ? »
}

export function largeur(s: string, taille: number): number {
  let w = 0
  for (const c of normaliser(s)) {
    const base = c.normalize("NFD")[0]
    const n = base.charCodeAt(0)
    w += n >= 32 && n <= 126 ? CHASSES[n - 32] : c === "Œ" || c === "œ" ? 1000 : 556
  }
  return (w * taille) / 1000
}

/** Découpe un texte en lignes tenant dans `max` points. */
export function couper(s: string, taille: number, max: number): string[] {
  const mots = s.split(/\s+/).filter(Boolean)
  const out: string[] = []
  let cur = ""
  for (const m of mots) {
    const essai = cur ? `${cur} ${m}` : m
    if (largeur(essai, taille) <= max || !cur) cur = essai
    else { out.push(cur); cur = m }
  }
  if (cur) out.push(cur)
  return out.length ? out : [""]
}

function chaine(s: string): string {
  let out = "("
  for (const c of normaliser(s)) {
    const n = code(c)
    if (c === "(" || c === ")" || c === "\\") out += "\\" + c
    else if (n < 128) out += String.fromCharCode(n)
    else out += "\\" + n.toString(8).padStart(3, "0")
  }
  return out + ")"
}

function rgb(hex: string): string {
  const h = hex.replace("#", "")
  const v = [0, 2, 4].map((i) => (parseInt(h.slice(i, i + 2), 16) / 255).toFixed(3))
  return v.join(" ")
}

function rond(x: number, y: number, r: number): string {
  const k = 0.5523 * r
  const f = (n: number) => n.toFixed(2)
  return `${f(x + r)} ${f(y)} m ${f(x + r)} ${f(y + k)} ${f(x + k)} ${f(y + r)} ${f(x)} ${f(y + r)} c `
    + `${f(x - k)} ${f(y + r)} ${f(x - r)} ${f(y + k)} ${f(x - r)} ${f(y)} c `
    + `${f(x - r)} ${f(y - k)} ${f(x - k)} ${f(y - r)} ${f(x)} ${f(y - r)} c `
    + `${f(x + k)} ${f(y - r)} ${f(x + r)} ${f(y - k)} ${f(x + r)} ${f(y)} c f\n`
}

type Bloc = { kind: "rayon"; titre: string } | { kind: "ligne"; textes: string[]; couleur: string }

/** Mise en page : renvoie le flux de contenu de chaque page (exporté pour les tests). */
export function paginer(titre: string, groupes: PdfGroupe[]): string[] {
  const blocs: Bloc[] = []
  for (const g of groupes) {
    if (!g.lignes.length) continue
    blocs.push({ kind: "rayon", titre: g.titre })
    for (const l of g.lignes) {
      const txt = l.quantite ? `${l.libelle} — ${l.quantite}` : l.libelle
      blocs.push({ kind: "ligne", textes: couper(txt, T_LIGNE, COL_W - RETRAIT), couleur: l.couleur })
    }
  }
  const haut = A4_H - MARGE
  const debutCol = haut - T_TITRE - 14
  const bas = MARGE
  const pages: string[] = []
  let flux = ""
  let col = 0
  let y = debutCol
  const nouvellePage = () => {
    if (flux) pages.push(flux)
    flux = `BT /F2 ${T_TITRE} Tf 0 0 0 rg ${MARGE} ${(haut - T_TITRE).toFixed(2)} Td ${chaine(titre)} Tj ET\n`
    col = 0; y = debutCol
  }
  const hauteur = (b: Bloc) => b.kind === "rayon" ? H_RAYON : b.textes.length * H_LIGNE
  nouvellePage()
  blocs.forEach((b, i) => {
    // Un titre de rayon ne reste jamais seul en bas de colonne.
    const besoin = hauteur(b) + (b.kind === "rayon" && blocs[i + 1] ? hauteur(blocs[i + 1]) : 0)
    if (y - besoin < bas) {
      col += 1; y = debutCol
      if (col >= COLS) nouvellePage()
    }
    const x = MARGE + col * (COL_W + GOUTTIERE)
    if (b.kind === "rayon") {
      const base = y - H_RAYON + 5
      flux += `BT /F2 ${T_RAYON} Tf 0.35 0.35 0.35 rg ${x.toFixed(2)} ${base.toFixed(2)} Td ${chaine(b.titre.toUpperCase())} Tj ET\n`
      y -= H_RAYON
    } else {
      const base = y - H_LIGNE + 3.5
      const milieu = base + T_LIGNE * 0.35
      flux += `0 0 0 RG 0.6 w ${x.toFixed(2)} ${(milieu - 3.5).toFixed(2)} 7 7 re S\n`
      flux += `${rgb(b.couleur)} rg ` + rond(x + 13, milieu, R_PASTILLE)
      b.textes.forEach((t, k) => {
        flux += `BT /F1 ${T_LIGNE} Tf 0 0 0 rg ${(x + RETRAIT).toFixed(2)} ${(base - k * H_LIGNE).toFixed(2)} Td ${chaine(t)} Tj ET\n`
      })
      y -= hauteur(b)
    }
  })
  pages.push(flux)
  return pages
}

/** Document PDF complet (octets). */
export function listePdf(titre: string, groupes: PdfGroupe[]): Uint8Array<ArrayBuffer> {
  const pages = paginer(titre, groupes)
  const objets: string[] = []
  objets[1] = "<< /Type /Catalog /Pages 2 0 R >>"
  objets[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
  objets[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"
  const kids: string[] = []
  pages.forEach((flux, i) => {
    const pageId = 5 + i * 2, contenuId = pageId + 1
    kids.push(`${pageId} 0 R`)
    objets[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_W} ${A4_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contenuId} 0 R >>`
    objets[contenuId] = `<< /Length ${flux.length} >>\nstream\n${flux}endstream`
  })
  objets[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`
  let pdf = "%PDF-1.4\n"
  const offsets: number[] = []
  for (let i = 1; i < objets.length; i++) {
    offsets[i] = pdf.length
    pdf += `${i} 0 obj\n${objets[i]}\nendobj\n`
  }
  const xref = pdf.length
  pdf += `xref\n0 ${objets.length}\n0000000000 65535 f \n`
  for (let i = 1; i < objets.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`
  pdf += `trailer\n<< /Size ${objets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  const bytes = new Uint8Array(new ArrayBuffer(pdf.length))
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i)
  return bytes
}
