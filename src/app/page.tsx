import Link from "next/link"
import { Logo } from "@/components/Logo"

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center px-6 py-16">
      {/* Logo banner xl */}
      <div className="mb-8">
        <Logo size="xl" />
      </div>

      <h1 className="text-2xl font-bold text-center mb-3" style={{ color: 'var(--ink)' }}>
        Commande en ligne
      </h1>
      <p className="text-center mb-8 max-w-sm" style={{ color: 'var(--ink-soft)' }}>
        Sandwichs, croques, pasta box, salades et boissons maison.
      </p>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <Link
          href="/commander"
          className="flex h-12 items-center justify-center rounded-xl font-semibold text-white transition-transform hover:scale-[1.02]"
          style={{ background: 'var(--accent)' }}
        >
          Commander
        </Link>
        <Link
          href="/auth"
          className="flex h-12 items-center justify-center rounded-xl font-semibold border transition-colors"
          style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
        >
          Se connecter
        </Link>
      </div>

      <div className="flex gap-4 mt-10 text-xs" style={{ color: 'var(--ink-soft)' }}>
        <Link href="/allergenes" className="underline underline-offset-2">Allergènes</Link>
        <Link href="/nos-prix-shop" className="underline underline-offset-2">Nos prix shop</Link>
        <Link href="/cgv" className="underline underline-offset-2">CGV</Link>
        <Link href="/cgu" className="underline underline-offset-2">CGU</Link>
      </div>

      <p className="mt-6 text-xs" style={{ color: 'var(--ink-soft)' }}>
        La Tribe Corp SARL · Martinique
      </p>
    </div>
  )
}
