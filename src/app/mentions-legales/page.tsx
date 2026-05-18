import { NavbarServer } from "@/components/NavbarServer"

export default async function MentionsLegalesPage() {
  return (
    <div className="min-h-screen">
      <NavbarServer />
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold mb-4">Mentions légales</h1>
        <div className="prose prose-sm" style={{ color: "var(--ink)" }}>

          <h2 className="text-base font-bold mt-6 mb-2">1. Éditeur du site</h2>
          <p className="text-sm mb-3">
            Le site pandasnack.online est édité par&nbsp;:
          </p>
          <ul className="text-sm mb-3 list-disc pl-5 space-y-1">
            <li><strong>Raison sociale</strong>&nbsp;: SARL La Tribe Corp (LTC)</li>
            <li><strong>Forme juridique</strong>&nbsp;: Société à responsabilité limitée</li>
            <li><strong>Capital social</strong>&nbsp;: 2&nbsp;000&nbsp;€</li>
            <li><strong>RCS</strong>&nbsp;: 920&nbsp;447&nbsp;125 Fort-de-France</li>
            <li><strong>Siège social</strong>&nbsp;: Didier, Fort-de-France, Martinique</li>
            <li><strong>Gérante</strong>&nbsp;: Rachel Lawal</li>
            <li><strong>Email de contact</strong>&nbsp;: <a href="mailto:team@pandasnack.online" className="underline" style={{ color: "var(--accent)" }}>team@pandasnack.online</a></li>
          </ul>

          <h2 className="text-base font-bold mt-6 mb-2">2. Directrice de la publication</h2>
          <p className="text-sm mb-3">
            Rachel Lawal, en qualité de gérante de la SARL La Tribe Corp.
          </p>

          <h2 className="text-base font-bold mt-6 mb-2">3. Hébergement</h2>
          <p className="text-sm mb-3">
            Le site est hébergé par&nbsp;:
          </p>
          <ul className="text-sm mb-3 list-disc pl-5 space-y-1">
            <li><strong>Vercel Inc.</strong></li>
            <li>340 S Lemon Ave #4133</li>
            <li>Walnut, CA 91789</li>
            <li>États-Unis</li>
            <li>Site&nbsp;: <a href="https://vercel.com" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--accent)" }}>vercel.com</a></li>
          </ul>

          <h2 className="text-base font-bold mt-6 mb-2">4. Propriété intellectuelle</h2>
          <p className="text-sm mb-3">
            L&apos;ensemble du site (textes, images, logos, illustrations, mascotte Panda Snack, code)
            est la propriété exclusive de La Tribe Corp SARL ou de ses partenaires, et est protégé
            par le droit d&apos;auteur et le droit des marques. Toute reproduction, représentation
            ou exploitation sans autorisation préalable écrite est interdite.
          </p>

          <h2 className="text-base font-bold mt-6 mb-2">5. Données personnelles</h2>
          <p className="text-sm mb-3">
            Les données personnelles collectées (compte, profils enfants, historique de commandes,
            paiements) sont traitées dans le respect du RGPD. Vous disposez d&apos;un droit
            d&apos;accès, de rectification, d&apos;effacement et de portabilité de vos données.
            Pour exercer ces droits, contactez-nous à <a href="mailto:team@pandasnack.online" className="underline" style={{ color: "var(--accent)" }}>team@pandasnack.online</a>.
          </p>

          <h2 className="text-base font-bold mt-6 mb-2">6. Paiement</h2>
          <p className="text-sm mb-3">
            Les paiements par carte bancaire sont sécurisés par Stripe, Inc. Aucune donnée
            de carte n&apos;est stockée sur nos serveurs.
          </p>

          <h2 className="text-base font-bold mt-6 mb-2">7. Droit applicable</h2>
          <p className="text-sm mb-3">
            Les présentes mentions sont soumises au droit français.
            En cas de litige, les tribunaux de Fort-de-France sont compétents.
          </p>

          <p className="text-xs mt-8" style={{ color: "var(--ink-soft)" }}>
            Dernière mise à jour&nbsp;: 18 mai 2026 · La Tribe Corp SARL · Martinique
          </p>
        </div>
      </div>
    </div>
  )
}
