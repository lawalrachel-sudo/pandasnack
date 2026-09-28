import { createServerSupabase } from "@/lib/supabase/server"
import { buildVitrine, type VitrineRow, type VitrineCard } from "@/lib/vitrine"

export const dynamic = "force-dynamic"

// PS-08b — Vitrine boutique publique (lecture seule, mobile-first). On regarde, on règle
// au comptoir : aucun bouton d'achat, aucun encaissement en ligne.

function euro(c: number) { return `${(c / 100).toFixed(2).replace(".", ",")} €` }

function Photo({ card, big }: { card: VitrineCard; big?: boolean }) {
  const h = big ? "h-48" : "h-28"
  if (card.image_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={card.image_url} alt={card.name} className={`w-full ${h} object-cover`} />
  }
  return (
    <div className={`w-full ${h} flex items-center justify-center`} style={{ background: "var(--bg-alt)" }}>
      <span style={{ fontSize: big ? 56 : 36 }}>🍪</span>
    </div>
  )
}

function Allergs({ a }: { a: string[] }) {
  if (!a.length) return null
  return <p className="text-[11px] mt-1" style={{ color: "var(--ink-soft)" }}>Allergènes : {a.join(", ")}</p>
}

export default async function BoutiqueVitrinePage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = await createServerSupabase()
  const { data } = await supabase
    .from("catalog_items")
    .select("id, sku, name, price_alone_cents, image_url, allergens, is_special, active, is_hero, hero_text, parent_id")
    .eq("sellable_comptoir", true).eq("active", true).order("sort_order")
  const { hero, cards } = buildVitrine((data || []) as VitrineRow[])

  return (
    <div className="ps-col mx-auto px-4 pt-4 pb-28" style={{ maxWidth: 460 }}>
      <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--ink)" }}>🛍️ La Boutique</h1>
      <p className="text-sm mb-4" style={{ color: "var(--ink-soft)" }}>Goûters, boissons et douceurs maison, à savourer au comptoir.</p>

      {hero && (
        <section className="rounded-2xl overflow-hidden border mb-6" style={{ borderColor: "var(--accent)", background: "var(--card)" }}>
          <Photo card={hero} big />
          <div className="p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--accent)" }}>Le produit maison du moment</p>
            <div className="flex items-baseline justify-between mt-1">
              <h2 className="text-lg font-bold">{hero.is_special ? "⭐ " : ""}{hero.name}</h2>
              <span className="font-bold" style={{ color: "var(--accent-2)" }}>{euro(hero.price_alone_cents)}</span>
            </div>
            {hero.hero_text && <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>{hero.hero_text}</p>}
            {hero.variants.length > 0 && (
              <p className="text-xs mt-2" style={{ color: "var(--ink-soft)" }}>Parfums : {hero.variants.map((v) => v.name).join(" · ")}</p>
            )}
            <Allergs a={hero.allergens} />
          </div>
        </section>
      )}

      <h2 className="text-sm font-bold uppercase tracking-wide mb-3" style={{ color: "var(--ink-soft)" }}>La carte</h2>
      {cards.length === 0 && !hero && <p className="text-sm" style={{ color: "var(--ink-soft)" }}>La boutique arrive bientôt.</p>}
      <div className="grid grid-cols-2 gap-3">
        {cards.map((c) => (
          <div key={c.id} className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            <Photo card={c} />
            <div className="p-2.5">
              <div className="flex items-baseline justify-between gap-1">
                <span className="font-semibold text-sm leading-tight">{c.is_special ? "⭐ " : ""}{c.name}</span>
                <span className="font-bold text-sm flex-none" style={{ color: "var(--accent-2)" }}>{euro(c.price_alone_cents)}</span>
              </div>
              {c.variants.length > 0 && (
                <p className="text-[11px] mt-1" style={{ color: "var(--ink-soft)" }}>{c.variants.map((v) => v.name).join(" · ")}</p>
              )}
              <Allergs a={c.allergens} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl p-4 text-center text-sm" style={{ background: "var(--bg-alt)", color: "var(--ink-soft)" }}>
        Se règle <strong style={{ color: "var(--ink)" }}>au comptoir</strong> avec le Panda Wallet, en espèces ou par carte.
      </div>
    </div>
  )
}
