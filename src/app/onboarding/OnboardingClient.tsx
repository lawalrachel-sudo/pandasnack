'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { CURRENT_CGU_VERSION } from '@/lib/legal'
import { ENABLED_SOURCE_GROUPS, type SourceGroup } from '@/lib/visibility'
import type { EleveProposable } from '@/lib/eleves-connus'

// PS-01 — Publics proposés à l'inscription. Un seul public → l'étape de choix est SUPPRIMÉE
// (source_group posé directement, on démarre à l'étape profils). Le code École La Patience /
// Panda Guest reste en place : ajouter la clé dans ENABLED_SOURCE_GROUPS (visibility.ts) pour réactiver.
const SINGLE_SOURCE_GROUP: SourceGroup | null = ENABLED_SOURCE_GROUPS.length === 1 ? ENABLED_SOURCE_GROUPS[0] : null
const FIRST_STEP = SINGLE_SOURCE_GROUP ? 2 : 1
type Metier = 'ecole' | 'pandattitude' | 'panda_guest'
// BUG B — classe = scolaire (ecole) OU créneau (pandattitude) OU null (panda_guest)
type Classe = 'maternelle' | 'primaire' | 'college' | 'lycee' | 'prof' | 'mercredi' | 'vendredi' | 'samedi'

function sgToMetier(sg: SourceGroup): Metier {
  if (sg === 'ecole_la_patience') return 'ecole'
  if (sg === 'pandattitude') return 'pandattitude'
  return 'panda_guest'
}

interface Profil {
  prenom: string
  classe: Classe | null
  notes_allergies: string
}

interface Props {
  userId: string
  prenom: string
  nom: string
  email: string
}

export function OnboardingClient({ userId, prenom, nom, email }: Props) {
  const router = useRouter()
  const supabase = createClient()

  // Étapes : 1=type (masquée si un seul public), 2=profils, 3=recap
  const [step, setStep] = useState(FIRST_STEP)
  const [sourceGroup, setSourceGroup] = useState<SourceGroup | null>(SINGLE_SOURCE_GROUP)
  const [telephone, setTelephone] = useState('')
  const [profils, setProfils] = useState<Profil[]>([
    { prenom: '', classe: null, notes_allergies: '' },
  ])
  const [acceptCgu, setAcceptCgu] = useState(false)
  const [acceptMailing, setAcceptMailing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // PS-05c — élèves déjà inscrits rattachés à l'e-mail du compte (lus en service_role
  // par /api/eleves-connus ; la table n'est pas lisible depuis le navigateur).
  const [eleves, setEleves] = useState<EleveProposable[] | null>(null)   // null = chargement
  const [annee, setAnnee] = useState<string | null>(null)
  const [elevesErr, setElevesErr] = useState<string | null>(null)
  const [coches, setCoches] = useState<Record<string, boolean>>({})
  const [creneaux, setCreneaux] = useState<Record<string, string>>({})
  // Saisie manuelle : systématique quand aucun élève connu, sinon sur demande.
  const [saisieManuelle, setSaisieManuelle] = useState(false)

  useEffect(() => {
    let annule = false
    ;(async () => {
      try {
        const res = await fetch('/api/eleves-connus')
        const data = await res.json()
        if (annule) return
        if (!res.ok) {
          setElevesErr(data.error || 'Liste des élèves indisponible.')
          setEleves([])
          setSaisieManuelle(true)
          return
        }
        const list: EleveProposable[] = data.eleves || []
        setEleves(list)
        setAnnee(data.annee || null)
        // Pré-cochage : tous les enfants trouvés sont proposés cochés.
        setCoches(Object.fromEntries(list.map((e) => [e.id, true])))
        setCreneaux(Object.fromEntries(list.map((e) => [e.id, e.classe || ''])))
        if (list.length === 0) setSaisieManuelle(true)
      } catch {
        if (annule) return
        setElevesErr('Liste des élèves indisponible (réseau).')
        setEleves([])
        setSaisieManuelle(true)
      }
    })()
    return () => { annule = true }
  }, [])

  const elevesCoches = (eleves || []).filter((e) => coches[e.id])
  const profilsManuelsRemplis = profils.filter((p) => p.prenom.trim())

  // === ÉTAPE 1 : Choix du type ===
  function handleChooseType(type: SourceGroup) {
    setSourceGroup(type)
    if (type === 'panda_guest') {
      // Guest = 1 profil adulte, pas de classe
      setProfils([{ prenom: prenom || '', classe: null, notes_allergies: '' }])
    } else if (type === 'pandattitude') {
      // Pandattitude = profils enfants mais pas de classe requise
      setProfils([{ prenom: '', classe: null, notes_allergies: '' }])
    } else {
      // École = profils enfants avec classe
      setProfils([{ prenom: '', classe: null, notes_allergies: '' }])
    }
    setStep(2)
  }

  // === GESTION PROFILS ===
  function updateProfil(index: number, field: keyof Profil, value: string) {
    const updated = [...profils]
    if (field === 'classe') {
      updated[index].classe = value as Classe | null
    } else {
      updated[index][field] = value
    }
    setProfils(updated)
  }

  function addProfil() {
    setProfils([...profils, { prenom: '', classe: null, notes_allergies: '' }])
  }

  function removeProfil(index: number) {
    if (profils.length <= 1) return
    setProfils(profils.filter((_, i) => i !== index))
  }

  // === VALIDATION ÉTAPE 2 ===
  function validateStep2(): boolean {
    if (!telephone.trim()) {
      setError('Merci de renseigner ton numéro de téléphone.')
      return false
    }

    // PS-05c — au moins un enfant : coché dans la liste des élèves connus, ou saisi à la main.
    if (elevesCoches.length === 0 && profilsManuelsRemplis.length === 0) {
      setError(
        (eleves || []).length > 0
          ? 'Coche au moins un enfant, ou ajoute-le à la main.'
          : 'Merci de renseigner au moins un enfant.'
      )
      return false
    }

    // Créneau obligatoire pour chaque élève coché dont la liste ne donne pas le créneau.
    for (const e of elevesCoches) {
      if (!creneaux[e.id]) {
        setError(`Merci de choisir le créneau (Mer/Ven/Sam) pour ${e.prenom}.`)
        return false
      }
    }

    // Les profils saisis à la main sont validés comme avant. Un profil totalement vide
    // est simplement ignoré (le parent a pu ouvrir le bloc sans s'en servir).
    for (const p of profilsManuelsRemplis) {
      if (sourceGroup === 'ecole_la_patience' && !p.classe) {
        setError(`Merci de choisir la classe pour ${p.prenom}.`)
        return false
      }
      if (sourceGroup === 'pandattitude' && !p.classe) {
        setError(`Merci de choisir le créneau (Mer/Ven/Sam) pour ${p.prenom}.`)
        return false
      }
    }

    if (!acceptCgu) {
      setError('Tu dois accepter les CGU/CGV pour continuer.')
      return false
    }
    setError(null)
    return true
  }

  function handleToStep3() {
    if (validateStep2()) setStep(3)
  }

  // === SOUMISSION FINALE ===
  async function handleSubmit() {
    setLoading(true)
    setError(null)

    try {
      // 1. Créer le compte
      const nomCompte = `${prenom} ${nom}`.trim() || email
      const sourceDetail =
        sourceGroup === 'ecole_la_patience' ? 'fond_lahaye' : null

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: account, error: accErr } = await (supabase as any)
        .from('accounts')
        .update({
          nom_compte: nomCompte,
          telephone: telephone.trim(),
          source_group: sourceGroup,
          source_detail: sourceDetail,
          // Preuve d'acceptation CGU/CGV/Mentions légales horodatée + versionnée
          // (la checkbox acceptCgu étape 2 est obligatoire pour atteindre cette étape).
          cgu_accepted_at: new Date().toISOString(),
          cgu_version: CURRENT_CGU_VERSION,
        })
        .eq('auth_user_id', userId)
        .select('id')
        .single()

      if (accErr) throw accErr
      if (!account?.id) throw new Error("Le compte n'a pas pu être mis à jour.")

      // 2. Créer les profils enfants.
      //
      // PS-05c — l'insert direct depuis le navigateur (ancien code) échouait sans
      // qu'on sache pourquoi : les deux chemins passent désormais par des routes
      // serveur qui vérifient l'erreur Postgres et la renvoient au parent.
      //   a) élèves cochés dans la liste officielle → /api/eleves-connus (service_role)
      //   b) profils saisis à la main               → /api/profils
      let crees = 0

      if (elevesCoches.length > 0) {
        const res = await fetch('/api/eleves-connus', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eleves: elevesCoches.map((e) => ({ id: e.id, classe: creneaux[e.id] || e.classe })),
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || "Création des profils impossible.")
        crees += data.created || 0
      }

      for (const p of profilsManuelsRemplis) {
        const res = await fetch('/api/profils', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prenom: p.prenom.trim(),
            classe: p.classe,
            notes_allergies: p.notes_allergies.trim() || null,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || `Création du profil ${p.prenom} impossible.`)
        crees += 1
      }

      // Garde-fou : on ne laisse plus partir un parent vers /commander sans profil
      // utilisable — c'était exactement le scénario « 0 commande » de l'audit PS-05.
      if (crees === 0) throw new Error("Aucun profil n'a été créé. Réessaie ou contacte-nous.")

      // 3. Wallet déjà créé par le trigger DB — pas besoin d'insert

      // Tout bon → commander
      router.push('/commander')
      router.refresh()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur inattendue'
      setError(message)
      setLoading(false)
    }
  }

  // === LABELS ===
  const typeLabels: Record<SourceGroup, { title: string; desc: string }> = {
    ecole_la_patience: {
      title: 'École La Patience (Fond Lahaye)',
      desc: "Livraison à l'école",
    },
    pandattitude: {
      title: 'École Pandattitude',
      desc: '',
    },
    panda_guest: {
      title: 'Panda Guest',
      desc: 'Pickup au Panda Snack ou livraison au bureau (CTM - FdF)',
    },
  }

  const classeLabels: Record<Classe, string> = {
    maternelle: 'Maternelle',
    primaire: 'Primaire',
    college: 'Collège',
    lycee: 'Lycée',
    prof: 'Professeur / Équipe',
    mercredi: 'Mercredi',
    vendredi: 'Vendredi',
    samedi: 'Samedi',
  }
  // BUG B — options classe selon le métier choisi étape 1
  const classeOptionsForMetier: Classe[] = (() => {
    if (sourceGroup === 'ecole_la_patience') return ['maternelle','primaire','college','lycee','prof']
    if (sourceGroup === 'pandattitude') return ['mercredi','vendredi','samedi']
    return []
  })()

  // === RENDU ===
  return (
    <div style={S.page}>
      <div style={S.card}>
        {/* Header */}
        <div style={{ ...S.logoRow, justifyContent: 'center' }}>
          <Logo size="lg" />
        </div>

        {/* Indicateur d'étapes (l'étape 1 n'est pas comptée quand elle est masquée) */}
        <div style={S.steps}>
          {[1, 2, 3].filter((n) => n >= FIRST_STEP).map((n) => (
            <div
              key={n}
              style={{
                ...S.stepDot,
                background: step >= n ? '#C85A3C' : '#E8D6BF',
              }}
            />
          ))}
        </div>

        {error && <div style={S.errorBox}>{error}</div>}

        {/* ========== ÉTAPE 1 : CHOIX TYPE ========== */}
        {step === 1 && (
          <div>
            <h2 style={S.title}>Bienvenue {prenom || ''} !</h2>
            <p style={S.subtitle}>Choisis un groupe pour entrer dans le Panda Snack !</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* PS-01 — seuls les publics ENABLED_SOURCE_GROUPS sont rendus (les autres ne sont pas grisés : absents du DOM) */}
              {(Object.keys(typeLabels) as SourceGroup[]).filter((key) => ENABLED_SOURCE_GROUPS.includes(key)).map((key) => {
                const isEcole = key === 'ecole_la_patience'
                const cardStyle = isEcole
                  ? { ...S.typeBtn, padding: '24px 18px', background: '#DCFCE7', borderColor: '#16A34A', borderWidth: 3 }
                  : S.typeBtn
                const defaultBorder = isEcole ? '#16A34A' : '#E8D6BF'
                return (
                  <button
                    key={key}
                    onClick={() => handleChooseType(key)}
                    style={cardStyle}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#C85A3C')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = defaultBorder)}
                  >
                    <strong style={isEcole ? { color: '#1D4ED8', fontSize: 19, fontWeight: 800 } : { color: '#3A2A20', fontSize: 15 }}>
                      {typeLabels[key].title}
                    </strong>
                    {typeLabels[key].desc && (
                      <span style={{ color: isEcole ? '#15803D' : '#6B5742', fontSize: isEcole ? 14 : 13, fontWeight: isEcole ? 600 : 400 }}>
                        {typeLabels[key].desc}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ========== ÉTAPE 2 : PROFILS + TEL ========== */}
        {step === 2 && sourceGroup && (
          <div>
            <h2 style={S.title}>
              {sourceGroup === 'panda_guest'
                ? 'Tes infos'
                : 'Qui mange ?'}
            </h2>
            <p style={S.subtitle}>
              {sourceGroup === 'ecole_la_patience'
                ? 'Ajoute un profil par enfant avec sa classe.'
                : sourceGroup === 'pandattitude'
                ? 'Ajoute les prénoms de ceux qui mangent.'
                : 'Ton profil de commande.'}
            </p>

            {/* Téléphone */}
            <label style={S.label}>
              Téléphone
              <input
                type="tel"
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
                placeholder="0696 00 00 00"
                style={S.input}
              />
            </label>

            {/* ---- PS-05c : élèves déjà inscrits rattachés à cet e-mail ---- */}
            {eleves === null && (
              <p style={{ ...S.subtitle, margin: '4px 0 12px' }}>Recherche de tes enfants inscrits…</p>
            )}

            {eleves !== null && eleves.length > 0 && (
              <div style={S.elevesBlock}>
                <h3 style={S.elevesTitle}>Vos enfants inscrits</h3>
                <p style={S.elevesHint}>
                  Trouvés sur la liste {annee ? `${annee} ` : ''}avec l&apos;adresse <strong>{email}</strong>.
                  Décoche ceux qui ne mangent pas au Panda Snack.
                </p>
                {eleves.map((e) => (
                  <div key={e.id} style={S.eleveRow}>
                    <label style={S.eleveLabel}>
                      <input
                        type="checkbox"
                        checked={!!coches[e.id]}
                        onChange={(ev) => setCoches({ ...coches, [e.id]: ev.target.checked })}
                        style={S.checkbox}
                      />
                      <span>
                        <strong>{e.prenom}</strong>
                        {e.nom && <span style={{ color: '#6B5742' }}> {e.nom}</span>}
                      </span>
                    </label>

                    {/* Créneau : pré-rempli depuis la liste, à choisir si la liste ne le donne pas. */}
                    {coches[e.id] && classeOptionsForMetier.length > 0 && (
                      <label style={{ ...S.label, marginTop: 6 }}>
                        Créneau cours dessin
                        <select
                          value={creneaux[e.id] || ''}
                          onChange={(ev) => setCreneaux({ ...creneaux, [e.id]: ev.target.value })}
                          style={S.input}
                        >
                          <option value="">Choisir…</option>
                          {classeOptionsForMetier.map((c) => (
                            <option key={c} value={c}>{classeLabels[c]}</option>
                          ))}
                        </select>
                        {!e.classe && e.classeSource && (
                          <span style={{ fontSize: 12, color: '#9B8A75' }}>
                            Liste : « {e.classeSource} » — confirme le créneau.
                          </span>
                        )}
                      </label>
                    )}
                  </div>
                ))}
              </div>
            )}

            {eleves !== null && eleves.length === 0 && (
              <div style={S.elevesBlock}>
                <p style={{ ...S.elevesHint, margin: 0 }}>
                  {elevesErr
                    ? elevesErr
                    : `Aucun élève inscrit cette année à cette adresse (${email}). Ajoute ton enfant ci-dessous.`}
                </p>
              </div>
            )}

            {/* Bascule vers la saisie manuelle quand des élèves ont été trouvés */}
            {eleves !== null && eleves.length > 0 && !saisieManuelle && (
              <button onClick={() => setSaisieManuelle(true)} style={S.addBtn}>
                + Ajouter un enfant qui n&apos;est pas dans la liste
              </button>
            )}

            {/* Profils saisis à la main */}
            {saisieManuelle && profils.map((p, i) => (
              <div key={i} style={S.profilCard}>
                <div style={S.profilHeader}>
                  <span style={{ fontWeight: 700, color: '#3A2A20', fontSize: 14 }}>
                    Profil {i + 1}
                  </span>
                  {profils.length > 1 && (
                    <button
                      onClick={() => removeProfil(i)}
                      style={S.removeBtn}
                    >
                      Retirer
                    </button>
                  )}
                </div>

                <label style={S.label}>
                  Prénom
                  <input
                    type="text"
                    value={p.prenom}
                    onChange={(e) => updateProfil(i, 'prenom', e.target.value)}
                    placeholder={sourceGroup === 'panda_guest' ? prenom || 'Ton prénom' : 'Prénom de l\'enfant'}
                    style={S.input}
                  />
                </label>

                {/* BUG B — Classe (école) ou Créneau (pandattitude). Panda Guest : pas de champ. */}
                {classeOptionsForMetier.length > 0 && (
                  <label style={S.label}>
                    {sourceGroup === 'pandattitude' ? 'Créneau cours dessin' : 'Classe'}
                    <select
                      value={p.classe || ''}
                      onChange={(e) =>
                        updateProfil(i, 'classe', e.target.value)
                      }
                      style={S.input}
                    >
                      <option value="">Choisir…</option>
                      {classeOptionsForMetier.map((c) => (
                        <option key={c} value={c}>
                          {classeLabels[c]}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {/* Allergies */}
                <label style={S.label}>
                  <span>
                    Allergies / remarques{' '}
                    <span style={{ fontWeight: 400, color: '#9B8A75' }}>
                      (optionnel)
                    </span>
                  </span>
                  <input
                    type="text"
                    value={p.notes_allergies}
                    onChange={(e) =>
                      updateProfil(i, 'notes_allergies', e.target.value)
                    }
                    placeholder="ex: sans gluten, allergie arachides"
                    style={S.input}
                  />
                </label>
              </div>
            ))}

            {/* Bouton ajouter profil (pas pour guest) */}
            {saisieManuelle && sourceGroup !== 'panda_guest' && (
              <button onClick={addProfil} style={S.addBtn}>
                + Ajouter un profil
              </button>
            )}

            {/* CGU/CGV + mailing */}
            <div style={{ marginTop: 16 }}>
              <label style={S.checkLabel}>
                <input
                  type="checkbox"
                  checked={acceptCgu}
                  onChange={(e) => setAcceptCgu(e.target.checked)}
                  style={S.checkbox}
                />
                <span>
                  J&apos;accepte les{' '}
                  <Link href="/cgv" style={S.link} target="_blank">
                    CGV
                  </Link>{' '}
                  et la{' '}
                  <Link href="/cgu" style={S.link} target="_blank">
                    politique de confidentialité
                  </Link>
                </span>
              </label>
              <label style={S.checkLabel}>
                <input
                  type="checkbox"
                  checked={acceptMailing}
                  onChange={(e) => setAcceptMailing(e.target.checked)}
                  style={S.checkbox}
                />
                <span>
                  Je souhaite recevoir les nouveautés et menus Panda Snack
                </span>
              </label>
            </div>

            {/* Navigation — pas de « Retour » quand l'étape choix du public est masquée */}
            <div style={S.navRow}>
              {FIRST_STEP === 1 && (
                <button
                  onClick={() => {
                    setStep(1)
                    setError(null)
                  }}
                  style={S.backBtn}
                >
                  Retour
                </button>
              )}
              <button onClick={handleToStep3} style={S.nextBtn}>
                Continuer
              </button>
            </div>
          </div>
        )}

        {/* ========== ÉTAPE 3 : RÉCAP ========== */}
        {step === 3 && sourceGroup && (
          <div>
            <h2 style={S.title}>Tout est bon ?</h2>

            <div style={S.recapBlock}>
              {FIRST_STEP === 1 && (
                <div style={S.recapRow}>
                  <span style={S.recapLabel}>Type</span>
                  <span style={sourceGroup === 'ecole_la_patience' ? { ...S.recapValue, color: '#1D4ED8', fontSize: 16, fontWeight: 800 } : S.recapValue}>{typeLabels[sourceGroup].title}</span>
                </div>
              )}
              <div style={S.recapRow}>
                <span style={S.recapLabel}>Compte</span>
                <span style={S.recapValue}>{prenom} {nom}</span>
              </div>
              <div style={S.recapRow}>
                <span style={S.recapLabel}>Email</span>
                <span style={S.recapValue}>{email}</span>
              </div>
              <div style={S.recapRow}>
                <span style={S.recapLabel}>Téléphone</span>
                <span style={S.recapValue}>{telephone}</span>
              </div>
            </div>

            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#3A2A20', margin: '16px 0 8px' }}>
              {sourceGroup === 'panda_guest'
                ? 'Ton profil'
                : `Profil${elevesCoches.length + profilsManuelsRemplis.length > 1 ? 's' : ''} (${elevesCoches.length + profilsManuelsRemplis.length})`}
            </h3>
            {elevesCoches.map((e) => (
              <div key={e.id} style={S.recapProfil}>
                <strong>{e.prenom}</strong>
                {e.nom && <span style={{ color: '#6B5742' }}> {e.nom}</span>}
                {creneaux[e.id] && (
                  <span style={{ color: '#6B5742' }}>
                    {' '}
                    — {classeLabels[creneaux[e.id] as Classe] || creneaux[e.id]}
                  </span>
                )}
              </div>
            ))}
            {profilsManuelsRemplis.map((p, i) => (
              <div key={`m${i}`} style={S.recapProfil}>
                <strong>{p.prenom}</strong>
                {p.classe && (
                  <span style={{ color: '#6B5742' }}>
                    {' '}
                    — {classeLabels[p.classe]}
                  </span>
                )}
                {p.notes_allergies && (
                  <div style={{ fontSize: 12, color: '#9B8A75', marginTop: 2 }}>
                    {p.notes_allergies}
                  </div>
                )}
              </div>
            ))}

            <div style={S.navRow}>
              <button
                onClick={() => {
                  setStep(2)
                  setError(null)
                }}
                style={S.backBtn}
              >
                Modifier
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                style={{
                  ...S.nextBtn,
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? 'Création…' : 'C\'est parti !'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ================ STYLES ================
const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #FBF5EC 0%, #F0E6D6 100%)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '40px 16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    background: '#fff',
    borderRadius: 18,
    padding: '28px 24px',
    maxWidth: 460,
    width: '100%',
    boxShadow: '0 20px 60px rgba(200, 90, 60, 0.12)',
    border: '1px solid #E8D6BF',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
    justifyContent: 'center',
  },
  brand: {
    fontSize: 20,
    fontWeight: 800,
    color: '#3A2A20',
    letterSpacing: '-0.5px',
  },
  steps: {
    display: 'flex',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 20,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    transition: 'background 0.3s',
  },
  title: {
    fontSize: 22,
    fontWeight: 800,
    color: '#3A2A20',
    margin: '0 0 6px',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B5742',
    margin: '0 0 18px',
    textAlign: 'center',
    lineHeight: 1.5,
  },
  typeBtn: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '16px 18px',
    borderRadius: 14,
    border: '2px solid #E8D6BF',
    background: '#FBF5EC',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'border-color 0.2s',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    fontSize: 13,
    fontWeight: 600,
    color: '#3A2A20',
    marginBottom: 10,
  },
  input: {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1.5px solid #E8D6BF',
    background: '#FBF5EC',
    fontSize: 15,
    color: '#3A2A20',
    outline: 'none',
    fontFamily: 'inherit',
    width: '100%',
    boxSizing: 'border-box',
  },
  profilCard: {
    border: '1px solid #E8D6BF',
    borderRadius: 14,
    padding: '14px 16px',
    marginBottom: 10,
    background: '#FEFBF7',
  },
  // PS-05c — bloc « Vos enfants inscrits »
  elevesBlock: {
    border: '1px solid #C85A3C',
    borderRadius: 14,
    padding: '14px 16px',
    marginBottom: 12,
    background: '#FEF3E2',
  },
  elevesTitle: {
    fontSize: 15,
    fontWeight: 800,
    color: '#3A2A20',
    margin: '0 0 4px',
  },
  elevesHint: {
    fontSize: 13,
    color: '#6B5742',
    lineHeight: 1.45,
    margin: '0 0 10px',
  },
  eleveRow: {
    borderTop: '1px solid #F0DCC4',
    paddingTop: 10,
    marginTop: 10,
  },
  eleveLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontSize: 15,
    color: '#3A2A20',
    minHeight: 44,
    cursor: 'pointer',
  },
  profilHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    color: '#C85A3C',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    textDecoration: 'underline',
  },
  addBtn: {
    width: '100%',
    padding: '10px',
    borderRadius: 10,
    border: '2px dashed #E8D6BF',
    background: 'transparent',
    color: '#C85A3C',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
    marginBottom: 6,
  },
  checkLabel: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    fontSize: 13,
    color: '#3A2A20',
    marginBottom: 8,
    lineHeight: 1.5,
  },
  checkbox: {
    marginTop: 3,
    accentColor: '#C85A3C',
  },
  link: {
    color: '#C85A3C',
    textDecoration: 'underline',
  },
  navRow: {
    display: 'flex',
    gap: 10,
    marginTop: 18,
  },
  backBtn: {
    flex: 1,
    padding: '12px',
    borderRadius: 12,
    border: '1.5px solid #E8D6BF',
    background: '#fff',
    color: '#3A2A20',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
  },
  nextBtn: {
    flex: 2,
    padding: '12px',
    borderRadius: 12,
    border: 'none',
    background: '#C85A3C',
    color: '#fff',
    fontWeight: 700,
    fontSize: 15,
    cursor: 'pointer',
  },
  errorBox: {
    background: '#FEF2F0',
    border: '1px solid #F5B5A8',
    color: '#B84A2E',
    padding: '10px 14px',
    borderRadius: 10,
    fontSize: 13,
    marginBottom: 14,
  },
  recapBlock: {
    background: '#FBF5EC',
    borderRadius: 12,
    padding: '14px 16px',
    marginBottom: 8,
  },
  recapRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '5px 0',
    fontSize: 13,
  },
  recapLabel: { color: '#6B5742', fontWeight: 500 },
  recapValue: { color: '#3A2A20', fontWeight: 600, textAlign: 'right' },
  recapProfil: {
    padding: '8px 14px',
    background: '#FBF5EC',
    borderRadius: 10,
    marginBottom: 6,
    fontSize: 14,
  },
}
