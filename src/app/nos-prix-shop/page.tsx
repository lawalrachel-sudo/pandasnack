import { NavbarServer } from "@/components/NavbarServer"

const SNACKS = [
  { name: "Gaufres maison (Cœurs/Biscuits du Panda)", price: "3,90 €" },
  { name: "Pop-corn", price: "1,50 €" },
  { name: "Soda (Royal ou Sprite)", price: "1,50 €" },
  { name: "Mont Pelé", price: "2,50 €" },
  { name: "Eau 0,33 L", price: "0,50 €" },
  { name: "Eau 0,5 L", price: "1,00 €" },
  { name: "Chips", price: "1,00 €" },
  { name: "Snickers, Lions, etc.", price: "1,50 €" },
  { name: "Gaufre emballée Nat/Choc", price: "0,50 €" },
]

export default async function NosPrixShopPage() {
  return (
    <div className="min-h-screen">
      <NavbarServer />
      <div className="max-w-lg mx-auto px-4 py-6">
        <h1 className="text-xl font-bold mb-1">Nos prix shop</h1>
        <p className="text-xs mb-4" style={{ color: 'var(--ink-soft)' }}>
          Produits disponibles au comptoir Panda Snack
        </p>

        <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-sm" style={{ background: 'var(--card)' }}>
            <thead>
              <tr>
                <th className="text-left p-3 text-white font-semibold" style={{ background: 'var(--accent)' }}>
                  Produit
                </th>
                <th className="text-right p-3 text-white font-semibold" style={{ background: 'var(--accent)' }}>
                  Prix
                </th>
              </tr>
            </thead>
            <tbody>
              {SNACKS.map(item => (
                <tr key={item.name} className="border-b" style={{ borderColor: 'var(--bg-alt)' }}>
                  <td className="p-3">{item.name}</td>
                  <td className="p-3 text-right font-bold">{item.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs p-3 rounded-xl" style={{ background: 'var(--bg-alt)', color: 'var(--ink-soft)' }}>
          Tu peux charger ton Pass Panda et le montant sera déduit au fur et à mesure.
          Achat direct possible sur place.
        </p>
      </div>
    </div>
  )
}
