import { NavbarServer } from "@/components/NavbarServer"

export const metadata = { title: "CGV — Panda Snack" }

// PS-09b — CGV révisées : Panda Wallet, IBAN remboursement, bonus (valeurs du code),
// précommande comptoir, plafond goûter, clôture annuelle, départ, jetons Bambou.
const SOMMAIRE: { id: string; t: string }[] = [
  { id: "exploitant", t: "1. Exploitant" },
  { id: "objet", t: "2. Objet" },
  { id: "compte", t: "3. Compte et connexion" },
  { id: "wallet", t: "4. Panda Wallet" },
  { id: "utilisation", t: "5. Utilisation du solde" },
  { id: "plafond", t: "6. Plafond goûter" },
  { id: "cloture", t: "7. Clôture annuelle (30 juin)" },
  { id: "depart", t: "8. Départ en cours d'année" },
  { id: "comptoir", t: "9. Achats au comptoir sans Panda Wallet" },
  { id: "jetons", t: "10. Jetons Bambou" },
  { id: "prix", t: "11. Prix et paiement" },
  { id: "historique", t: "12. Historique" },
  { id: "allergenes", t: "13. Allergènes" },
  { id: "donnees", t: "14. Données personnelles" },
  { id: "droit", t: "15. Droit applicable" },
]

export default async function CGVPage() {
  return (
    <div className="min-h-screen">
      <NavbarServer />
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold mb-1">Conditions Générales de Vente</h1>
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
          <h2 id="exploitant" className="text-base font-bold mt-6 mb-2 scroll-mt-20">1. Exploitant</h2>
          <p className="text-sm mb-3">
            La Tribe Corp SARL (LTC), immatriculée en Martinique, exploite la marque Panda Snack
            (petite restauration artisanale) via le site pandasnack.online. Contact : team@pandasnack.online.
          </p>

          <h2 id="objet" className="text-base font-bold mt-6 mb-2 scroll-mt-20">2. Objet</h2>
          <p className="text-sm mb-3">
            Les présentes CGV régissent les commandes de repas, les achats au comptoir et la recharge du
            Panda Wallet (porte-monnaie prépayé) effectués via Panda Snack. Elles sont valables pour l&apos;année
            scolaire en cours, jusqu&apos;au 30 juin.
          </p>

          <h2 id="compte" className="text-base font-bold mt-6 mb-2 scroll-mt-20">3. Compte et connexion</h2>
          <p className="text-sm mb-3">
            Chaque famille dispose d&apos;un compte lié à une adresse e-mail, avec un mot de passe personnel.
            En cas d&apos;oubli, la fonction « Mot de passe oublié » envoie un lien par e-mail permettant de
            choisir un nouveau mot de passe. Un compte peut gérer plusieurs enfants.
          </p>

          <h2 id="wallet" className="text-base font-bold mt-6 mb-2 scroll-mt-20">4. Panda Wallet</h2>
          <p className="text-sm mb-3">
            Le Panda Wallet est un solde prépayé, personnel et non cessible. Il se recharge en ligne par carte
            bancaire (via Stripe) ou au comptoir en espèces ou par carte (encaissement par le terminal SumUp,
            reçu remis&nbsp;; le crédit du wallet est effectué au plus tard en fin de journée, le reçu SumUp
            faisant foi). Un IBAN est demandé avant la première recharge, uniquement pour d&apos;éventuels
            remboursements.
          </p>
          <p className="text-sm mb-3">
            Un bonus de recharge est offert par paliers : <strong>30 € rechargés = 1,50 € offerts</strong>,
            <strong> 50 € = 5 € offerts</strong>, <strong>100 € = 15 € offerts</strong>. Le bonus est une
            remise commerciale : il n&apos;est jamais remboursé ni transférable, et il est consommé en premier.
          </p>

          <h2 id="utilisation" className="text-base font-bold mt-6 mb-2 scroll-mt-20">5. Utilisation du solde</h2>
          <p className="text-sm mb-3">
            Le solde règle : les repas précommandés (dans la limite de l&apos;heure limite de commande indiquée
            pour chaque service) et les achats au comptoir (goûters, boissons, suppléments). Une précommande
            au comptoir pour une date future est annulable jusqu&apos;à la veille 20 h avec recrédit immédiat du
            wallet&nbsp;; passé ce délai, elle est due. Si Panda Snack ne peut pas servir une commande, elle est
            recréditée intégralement.
          </p>

          <h2 id="plafond" className="text-base font-bold mt-6 mb-2 scroll-mt-20">6. Plafond goûter</h2>
          <p className="text-sm mb-3">
            Le parent peut fixer, depuis son espace, un plafond journalier de dépenses au comptoir par enfant
            (goûters, boissons, suppléments) réglées avec le Panda Wallet. Sans plafond, l&apos;enfant peut
            utiliser tout le solde. Les repas précommandés ne sont pas concernés.
          </p>

          <h2 id="cloture" className="text-base font-bold mt-6 mb-2 scroll-mt-20">7. Clôture annuelle (30 juin)</h2>
          <p className="text-sm mb-3">
            Au 30 juin, tout solde restant (argent versé non dépensé, le bonus étant consommé en premier) est
            remboursé automatiquement en juillet, par virement sur l&apos;IBAN renseigné. Aucun solde n&apos;est
            reporté d&apos;une année sur l&apos;autre.
          </p>

          <h2 id="depart" className="text-base font-bold mt-6 mb-2 scroll-mt-20">8. Départ en cours d&apos;année</h2>
          <p className="text-sm mb-3">
            En cas de départ en cours d&apos;année, le solde restant (argent versé non dépensé) est remboursé sur
            demande, par virement sous 30 jours sur l&apos;IBAN renseigné.
          </p>

          <h2 id="comptoir" className="text-base font-bold mt-6 mb-2 scroll-mt-20">9. Achats au comptoir sans Panda Wallet</h2>
          <p className="text-sm mb-3">
            Les achats au comptoir peuvent être réglés en espèces ou par carte, encaissés par le terminal SumUp.
            L&apos;application n&apos;encaisse alors aucun montant : elle enregistre uniquement le détail de la
            vente pour le suivi.
          </p>

          <h2 id="jetons" className="text-base font-bold mt-6 mb-2 scroll-mt-20">10. Jetons Bambou</h2>
          <p className="text-sm mb-3">
            Les jetons Bambou sont une récompense obtenue à Pandattitude, sans valeur monétaire : ils ne peuvent
            être ni échangés ni remboursés. Leur barème (nombre de jetons par article) est affiché en classe et
            peut être modifié en cours d&apos;année. Les jetons non utilisés au 30 juin sont reportés sur
            l&apos;année suivante pour les élèves réinscrits.
          </p>

          <h2 id="prix" className="text-base font-bold mt-6 mb-2 scroll-mt-20">11. Prix et paiement</h2>
          <p className="text-sm mb-3">
            Les prix sont indiqués en euros toutes taxes comprises (TTC)&nbsp;; le prix affiché est le prix final.
            Le paiement s&apos;effectue par carte bancaire via Stripe ou par débit du Panda Wallet.
          </p>

          <h2 id="historique" className="text-base font-bold mt-6 mb-2 scroll-mt-20">12. Historique</h2>
          <p className="text-sm mb-3">
            Les recharges, commandes et achats au comptoir sont consultables à tout moment dans l&apos;espace parent.
          </p>

          <h2 id="allergenes" className="text-base font-bold mt-6 mb-2 scroll-mt-20">13. Allergènes</h2>
          <p className="text-sm mb-3">
            La liste des allergènes est disponible sur la page dédiée et au comptoir. En cas d&apos;allergie grave,
            merci de nous contacter directement.
          </p>

          <h2 id="donnees" className="text-base font-bold mt-6 mb-2 scroll-mt-20">14. Données personnelles</h2>
          <p className="text-sm mb-3">
            Nous collectons uniquement les données nécessaires au service (nom, e-mail, enfants). Les données de
            paiement sont traitées par Stripe et ne sont jamais stockées sur nos serveurs. L&apos;IBAN sert
            uniquement aux remboursements, jamais à un prélèvement&nbsp;; il est supprimé à la clôture du compte
            ou sur demande. Conformément au RGPD, tu peux demander l&apos;accès, la modification ou la suppression
            de tes données à team@pandasnack.online.
          </p>

          <h2 id="droit" className="text-base font-bold mt-6 mb-2 scroll-mt-20">15. Droit applicable</h2>
          <p className="text-sm mb-3">
            Les présentes CGV sont soumises au droit français. En cas de litige, les tribunaux de Fort-de-France
            sont compétents.
          </p>

          <p className="text-xs mt-8" style={{ color: "var(--ink-soft)" }}>
            Dernière mise à jour : 28 septembre 2026 · La Tribe Corp SARL · Martinique
          </p>
        </div>
      </div>
    </div>
  )
}
