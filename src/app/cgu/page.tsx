import { NavbarServer } from "@/components/NavbarServer"

export default async function CGUPage() {
  return (
    <div className="min-h-screen">
      <NavbarServer />
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold mb-4">Conditions Générales d&apos;Utilisation</h1>
        <div className="prose prose-sm" style={{ color: 'var(--ink)' }}>

          <h2 className="text-base font-bold mt-6 mb-2">1. Accès au service</h2>
          <p className="text-sm mb-3">
            L&apos;accès à pandasnack.vercel.app est réservé aux familles enregistrées auprès de Panda Snack.
            La connexion se fait par lien magique envoyé par email.
          </p>

          <h2 className="text-base font-bold mt-6 mb-2">2. Compte utilisateur</h2>
          <p className="text-sm mb-3">
            Chaque famille dispose d&apos;un compte unique lié à une adresse email.
            L&apos;utilisateur est responsable de la confidentialité de son accès.
            Un compte peut gérer plusieurs bénéficiaires (enfants).
          </p>

          <h2 className="text-base font-bold mt-6 mb-2">3. Utilisation du Pass Panda</h2>
          <p className="text-sm mb-3">
            Le Pass Panda est personnel et non cessible.
            Il est utilisable uniquement dans le cadre de Panda Snack.
            Toute tentative de fraude entraînera la suspension du compte.
          </p>

          <h2 className="text-base font-bold mt-6 mb-2">4. Données personnelles</h2>
          <p className="text-sm mb-3">
            Nous collectons uniquement les données nécessaires au service : nom, email, bénéficiaires.
            Les données de paiement sont traitées par Stripe et ne sont jamais stockées sur nos serveurs.
            Conformément au RGPD, tu peux demander l&apos;accès, la modification ou la suppression
            de tes données en nous contactant à lawalrachel@gmail.com.
          </p>

          <h2 className="text-base font-bold mt-6 mb-2">5. Propriété intellectuelle</h2>
          <p className="text-sm mb-3">
            La marque Panda Snack, le logo et l&apos;ensemble des contenus du site sont la propriété
            de La Tribe Corp SARL. Toute reproduction est interdite.
          </p>

          <h2 className="text-base font-bold mt-6 mb-2">6. Modification</h2>
          <p className="text-sm mb-3">
            Les présentes CGU peuvent être modifiées à tout moment.
            Les utilisateurs seront informés par email de toute modification substantielle.
          </p>

          <p className="text-xs mt-8" style={{ color: 'var(--ink-soft)' }}>
            Dernière mise à jour : 17 avril 2026 · La Tribe Corp SARL · Martinique
          </p>
        </div>
      </div>
    </div>
  )
}
