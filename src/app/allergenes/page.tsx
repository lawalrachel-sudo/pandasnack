import { Navbar } from "@/components/Navbar"

const ALLERGENS = [
  { category: "SANDWICHS (pain blé artisanal)", items: [
    { name: "A · Jambon/Fromage", gluten: true, oeufs: false, poissons: false, lait: true, moutarde: false, celeri: false },
    { name: "B · Thon Mayo", gluten: true, oeufs: true, poissons: true, lait: false, moutarde: true, celeri: false },
    { name: "C · Jambon/Oeuf", gluten: true, oeufs: true, poissons: false, lait: false, moutarde: false, celeri: false },
    { name: "D · Poulet Rôti", gluten: true, oeufs: false, poissons: false, lait: false, moutarde: false, celeri: false },
  ]},
  { category: "GARNITURES", items: [
    { name: "Beurre", gluten: false, oeufs: false, poissons: false, lait: true, moutarde: false, celeri: false },
    { name: "Laitue / Tomates / Carottes", gluten: false, oeufs: false, poissons: false, lait: false, moutarde: false, celeri: false },
    { name: "Sauce piquante", gluten: false, oeufs: false, poissons: false, lait: false, moutarde: false, celeri: false },
  ]},
  { category: "CROQUES (pain de mie blé)", items: [
    { name: "Croque Simple", gluten: true, oeufs: false, poissons: false, lait: true, moutarde: false, celeri: false },
    { name: "Croque Panda · Gourmand", gluten: true, oeufs: false, poissons: false, lait: true, moutarde: false, celeri: false },
  ]},
  { category: "PASTA BOX", items: [
    { name: "Bolognaise maison", gluten: true, oeufs: false, poissons: false, lait: "traces", moutarde: false, celeri: true, note: "Lait si fromage râpé choisi" },
  ]},
  { category: "SALADES (menu uniquement)", items: [
    { name: "Salade Jambon", gluten: false, oeufs: false, poissons: false, lait: false, moutarde: true, celeri: false },
    { name: "Salade Thon", gluten: false, oeufs: false, poissons: true, lait: false, moutarde: true, celeri: false },
    { name: "Salade Poulet Rôti", gluten: false, oeufs: false, poissons: false, lait: false, moutarde: true, celeri: false },
    { name: "Salade Composée", gluten: false, oeufs: false, poissons: false, lait: false, moutarde: true, celeri: false },
  ]},
  { category: "BOISSONS MAISON", items: [
    { name: "Bubble Tea", gluten: false, oeufs: false, poissons: false, lait: false, moutarde: false, celeri: false },
    { name: "Ice Tea Maison", gluten: false, oeufs: false, poissons: false, lait: false, moutarde: false, celeri: false },
  ]},
  { category: "PÂTISSERIE MAISON", items: [
    { name: "Cœurs de Panda / Biscuits du Panda", gluten: true, oeufs: true, poissons: false, lait: false, moutarde: false, celeri: false },
  ]},
]

const COLUMNS = ["GLUTEN (BLÉ)", "ŒUFS", "POISSONS", "LAIT", "MOUTARDE", "CÉLERI"]
const KEYS = ["gluten", "oeufs", "poissons", "lait", "moutarde", "celeri"] as const

function Cell({ value }: { value: boolean | string }) {
  if (value === true) return <span className="text-[var(--accent)] font-bold text-lg">●</span>
  if (value === "traces") return <span className="text-[var(--accent-3)] text-xs">⚠</span>
  return <span className="text-gray-300">—</span>
}

export default function AllergenesPage() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold mb-1">Déclaration des Allergènes</h1>
        <p className="text-xs mb-4" style={{ color: 'var(--ink-soft)' }}>
          Règlement (UE) n°1169/2011 (INCO) · Décret n°2015-447 · Mis à jour le 17/04/2026
        </p>

        <div className="rounded-xl p-3 mb-4 text-xs" style={{ background: '#E8F5E9', color: '#2E7D32' }}>
          <strong>Note :</strong> Nous utilisons exclusivement de la crème végétale (coco).
          Aucune crème laitière. Le lait est uniquement présent via le fromage et le beurre.
        </div>

        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-xs" style={{ background: 'var(--card)' }}>
            <thead>
              <tr>
                <th className="text-left p-2 pl-3 text-white text-[10px] font-bold" style={{ background: 'var(--accent)', minWidth: 160 }}>
                  Produit
                </th>
                {COLUMNS.map(col => (
                  <th
                    key={col}
                    className="p-1 text-white text-[9px] font-bold text-center"
                    style={{ background: 'var(--accent)', writingMode: 'vertical-lr', transform: 'rotate(180deg)', height: 90, minWidth: 32 }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALLERGENS.map(section => (
                <>
                  <tr key={section.category}>
                    <td
                      colSpan={7}
                      className="p-2 pl-3 text-[10px] font-bold uppercase tracking-wider"
                      style={{ background: 'var(--bg-alt)', color: 'var(--accent)' }}
                    >
                      {section.category}
                    </td>
                  </tr>
                  {section.items.map(item => (
                    <tr key={item.name} className="border-b" style={{ borderColor: 'var(--bg-alt)' }}>
                      <td className="p-2 pl-3 font-semibold">{item.name}</td>
                      {KEYS.map(key => (
                        <td key={key} className="text-center p-1">
                          <Cell value={item[key] as boolean | string} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 p-4 rounded-xl border text-xs" style={{ borderColor: 'var(--border)', color: 'var(--ink-soft)' }}>
          <p className="font-bold" style={{ color: 'var(--accent)' }}>Ce tableau couvre uniquement les produits préparés dans notre cuisine.</p>
          <p className="mt-2"><strong>Céleri :</strong> présent dans la sauce bolognaise maison</p>
          <p><strong>Moutarde :</strong> présente dans la mayo ET dans les deux vinaigrettes</p>
          <p><strong>Fromage râpé :</strong> Lait uniquement si le client choisit l&apos;option</p>
          <p><strong>Crème :</strong> exclusivement végétale (coco)</p>
          <p className="mt-3 text-[10px]">Panda Snack · La Tribe Corp SARL · Martinique</p>
        </div>
      </div>
    </div>
  )
}
