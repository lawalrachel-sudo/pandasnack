import { NavbarServer } from "@/components/NavbarServer"

export default async function CGVPage() {
  return (
    <div className="min-h-screen">
      <NavbarServer />
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold mb-4">Conditions Générales de Vente</h1>
        <div className="prose prose-sm" style={{ color: 'var(--ink)' }}>

          <h2 className="text-base font-bold mt-6 mb-2">1. Exploitant</h2>
          <p className="text-sm mb-3">
            La Tribe Corp SARL, immatriculée en Martinique.
            Adresse email : lawalrachel@gmail.com.
            Activité : vente de repas préparés et snacks sous la marque Panda Snack.
          </p>

          <h2 className="text-base font-bold mt-6 mb-2">2. Objet</h2>
          <p className="text-sm mb-3">
            Les présentes CGV régissent les ventes de repas et la recharge du Pass Panda (porte-monnaie prépayé)
            effectuées via le site pandasnack.vercel.app.
          </p>

          <h2 className="text-base font-bold mt-6 mb-2">3. Pass Panda (Wallet)</h2>
          <p className="text-sm mb-3">
            Le Pass Panda est un porte-monnaie prépayé rechargeable par carte bancaire.
            Montant libre, minimum 10 €.
            Le solde est utilisable pour les commandes de repas et les achats au comptoir Panda Snack.
            Validité : jusqu&apos;au 30 juin 2026 (période scolaire en cours).
            Le solde non utilisé est remboursable sur demande à la fin de la période.
          </p>

          <h2 className="text-base font-bold mt-6 mb-2">4. Commandes</h2>
          <p className="text-sm mb-3">
            Les commandes doivent être passées avant l&apos;heure limite indiquée pour chaque jour de service.
            La confirmation de commande est envoyée par email.
            L&apos;annulation est possible jusqu&apos;à l&apos;heure limite. Au-delà, la commande est due.
          </p>

          <h2 className="text-base font-bold mt-6 mb-2">5. Prix et paiement</h2>
          <p className="text-sm mb-3">
            Les prix sont indiqués en euros, toutes taxes comprises (TTC). Le prix affiché est le prix final.
            Le paiement s&apos;effectue par carte bancaire via Stripe ou par débit du Pass Panda.
          </p>

          <h2 className="text-base font-bold mt-6 mb-2">6. Allergènes</h2>
          <p className="text-sm mb-3">
            La liste des allergènes est disponible sur la page dédiée et au comptoir.
            En cas d&apos;allergie grave, merci de nous contacter directement.
          </p>

          <h2 className="text-base font-bold mt-6 mb-2">7. Droit applicable</h2>
          <p className="text-sm mb-3">
            Les présentes CGV sont soumises au droit français.
            En cas de litige, les tribunaux de Fort-de-France sont compétents.
          </p>

          <p className="text-xs mt-8" style={{ color: 'var(--ink-soft)' }}>
            Dernière mise à jour : 17 avril 2026 · La Tribe Corp SARL · Martinique
          </p>
        </div>
      </div>
    </div>
  )
}
