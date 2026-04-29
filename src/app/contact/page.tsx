import { NavbarServer } from "@/components/NavbarServer"

export default async function ContactPage() {
  return (
    <div className="min-h-screen pb-16 max-w-lg mx-auto">
      <NavbarServer />

      <div className="px-4 pt-10 text-center">
        <img
          src="https://res.cloudinary.com/dbkpvp9ts/image/upload/w_240,q_auto,f_auto/v1777335899/Enveloppe.png"
          alt="Enveloppe"
          className="w-32 h-auto mx-auto mb-3"
        />
        <h1 className="text-xl font-bold mb-2" style={{ color: "var(--ink)" }}>Contacte-nous</h1>
        <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
          Une question, un souci, une suggestion ?
        </p>
        <img
          src="https://res.cloudinary.com/dbkpvp9ts/image/upload/w_160,q_auto,f_auto/v1777331138/Panda_Chef.jpg"
          alt="Panda Chef"
          className="w-24 h-24 rounded-full mx-auto mb-6 object-cover"
        />

        <a
          href="mailto:team@pandasnack.online"
          className="block w-full h-12 rounded-xl font-semibold text-white text-center leading-[3rem] mb-3"
          style={{ background: "var(--accent)" }}
        >
          team@pandasnack.online
        </a>

        <a
          href="tel:+596696074933"
          className="block w-full h-12 rounded-xl font-semibold text-center leading-[3rem] border mb-3"
          style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
        >
          +596 696 07 49 33
        </a>

        <p className="text-xs mt-6" style={{ color: "var(--ink-soft)" }}>
          Panda Snack — La Tribe Corp<br />
          Didier, Fort-de-France, Martinique
        </p>
      </div>
    </div>
  )
}
