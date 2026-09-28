import { NavbarServer } from "@/components/NavbarServer"

export const metadata = { title: "CGU — Panda Snack" }

// PS-09b — CGU révisées : connexion e-mail + mot de passe (fin de l'ancien mode de
// connexion par e-mail sans mot de passe), cohérence avec les CGV (Panda Wallet, IBAN).
const SOMMAIRE: { id: string; t: string }[] = [
  { id: "acces", t: "1. Accès au service" },
  { id: "compte", t: "2. Compte utilisateur" },
  { id: "wallet", t: "3. Utilisation du Panda Wallet" },
  { id: "donnees", t: "4. Données personnelles" },
  { id: "pi", t: "5. Propriété intellectuelle" },
  { id: "modif", t: "6. Modification" },
]

export default async function CGUPage() {
  return (
    <div className="min-h-screen">
      <NavbarServer />
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold mb-1">Conditions Générales d&apos;Utilisation</h1>
        <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>Panda Snack — pandasnack.online</p>

        <nav className="rounded-xl border p-3 mb-6" style={{ borderColor: "var(--border)", background: "var(--bg-alt)" }}>
          <p className="text-xs font-bold mb-2" style={{ color: "var(--ink-soft)" }}>Sommaire</p>
          <ul className="text-sm space-y-1">
            {SOMMAIRE.map((s) => (
              <li key={s.id}><a href={`#${s.id}`} className="underline" style={{ color: "var(--accent)" }}>{s.t}</a></li>
            ))}
          </ul>
        </nav>

        <div className="prose prose-sm" style={{ color: "var(--ink)" }}>
          <h2 id="acces" className="text-base font-bold mt-6 mb-2 scroll-mt-20">1. Accès au service</h2>
          <p className="text-sm mb-3">
            L&apos;accès à pandasnack.online est réservé aux familles enregistrées auprès de Panda Snack.
            La connexion se fait par e-mail et mot de passe. En cas d&apos;oubli, la fonction « Mot de passe
            oublié » envoie un lien par e-mail permettant de choisir un nouveau mot de passe.
          </p>

          <h2 id="compte" className="text-base font-bold mt-6 mb-2 scroll-mt-20">2. Compte utilisateur</h2>
          <p className="text-sm mb-3">
            Chaque famille dispose d&apos;un compte unique lié à une adresse e-mail. L&apos;utilisateur est
            responsable de la confidentialité de son mot de passe. Un compte peut gérer plusieurs enfants.
          </p>

          <h2 id="wallet" className="text-base font-bold mt-6 mb-2 scroll-mt-20">3. Utilisation du Panda Wallet</h2>
          <p className="text-sm mb-3">
            Le Panda Wallet est personnel et non cessible. Il est utilisable uniquement dans le cadre de Panda
            Snack (repas précommandés et achats au comptoir). Les conditions de recharge, de bonus, de plafond,
            de remboursement et de clôture annuelle figurent dans les CGV. Toute tentative de fraude entraînera la
            suspension du compte.
          </p>

          <h2 id="donnees" className="text-base font-bold mt-6 mb-2 scroll-mt-20">4. Données personnelles</h2>
          <p className="text-sm mb-3">
            Nous collectons uniquement les données nécessaires au service : nom, e-mail, enfants, et l&apos;IBAN
            (utilisé uniquement pour les remboursements, jamais pour un prélèvement). Les données de paiement sont
            traitées par Stripe et ne sont jamais stockées sur nos serveurs. Conformément au RGPD, tu peux demander
            l&apos;accès, la modification ou la suppression de tes données à team@pandasnack.online.
          </p>

          <h2 id="pi" className="text-base font-bold mt-6 mb-2 scroll-mt-20">5. Propriété intellectuelle</h2>
          <p className="text-sm mb-3">
            La marque Panda Snack, le logo et l&apos;ensemble des contenus du site sont la propriété de La Tribe
            Corp SARL. Toute reproduction est interdite.
          </p>

          <h2 id="modif" className="text-base font-bold mt-6 mb-2 scroll-mt-20">6. Modification</h2>
          <p className="text-sm mb-3">
            Les présentes CGU peuvent être modifiées à tout moment. Les utilisateurs seront informés de toute
            modification substantielle et invités à accepter la nouvelle version à la connexion.
          </p>

          <p className="text-xs mt-8" style={{ color: "var(--ink-soft)" }}>
            Dernière mise à jour : 28 septembre 2026 · La Tribe Corp SARL · Martinique
          </p>
        </div>
      </div>
    </div>
  )
}
