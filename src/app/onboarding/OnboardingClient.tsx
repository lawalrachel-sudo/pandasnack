'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

type SourceGroup = 'ecole' | 'pandattitude' | 'panda_guest'
type Classe = 'maternelle' | 'primaire' | 'college' | 'lycee' | 'prof'

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

  // Étapes : 1=type, 2=profils, 3=recap
  const [step, setStep] = useState(1)
  const [sourceGroup, setSourceGroup] = useState<SourceGroup | null>(null)
  const [telephone, setTelephone] = useState('')
  const [profils, setProfils] = useState<Profil[]>([
    { prenom: '', classe: null, notes_allergies: '' },
  ])
  const [acceptCgu, setAcceptCgu] = useState(false)
  const [acceptMailing, setAcceptMailing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    for (let i = 0; i < profils.length; i++) {
      if (!profils[i].prenom.trim()) {
        setError(`Merci de renseigner le prénom du profil ${i + 1}.`)
        return false
      }
      if (sourceGroup === 'ecole' && !profils[i].classe) {
        setError(`Merci de choisir la classe pour ${profils[i].prenom}.`)
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
        sourceGroup === 'ecole' ? 'fond_lahaye' : null

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: account, error: accErr } = await (supabase as any)
        .from('accounts')
        .update({
          nom_compte: nomCompte,
          telephone: telephone.trim(),
          source_group: sourceGroup,
          source_detail: sourceDetail,
        })
        .eq('auth_user_id', userId)
        .select('id')
        .single()

      if (accErr) throw accErr

      // 2. Créer les profils
      const profilRows = profils.map((p, i) => ({
        account_id: account.id,
        prenom: p.prenom.trim(),
        classe: p.classe,
        notes_allergies: p.notes_allergies.trim() || null,
        is_default: i === 0,
      }))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: profErr } = await (supabase as any)
        .from('profils')
        .insert(profilRows)

      if (profErr) throw profErr

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
    ecole: {
      title: 'École La Patience (Fond Lahaye)',
      desc: 'Parent d\'élève — bento et menus livrés à l\'école',
    },
    pandattitude: {
      title: 'École Pandattitude',
      desc: 'Cours de dessin — menus midi mercredi, vendredi, samedi',
    },
    panda_guest: {
      title: 'Panda Guest',
      desc: 'Commande libre — pickup à Didier ou livraison bureau',
    },
  }

  const classeLabels: Record<Classe, string> = {
    maternelle: 'Maternelle',
    primaire: 'Primaire',
    college: 'Collège',
    lycee: 'Lycée',
    prof: 'Professeur / Équipe',
  }

  // === RENDU ===
  return (
    <div style={S.page}>
      <div style={S.card}>
        {/* Header */}
        <div style={S.logoRow}>
          <img
            src="https://res.cloudinary.com/dbkpvp9ts/image/upload/c_fit,w_80,q_auto,f_auto/v1776343210/tete_panda_panda_snack.png"
            alt="Panda Snack"
            style={{ width: 40, height: 40, objectFit: 'contain' }}
          />
          <span style={S.brand}>Panda Snack</span>
        </div>

        {/* Indicateur d'étapes */}
        <div style={S.steps}>
          {[1, 2, 3].map((n) => (
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
            <p style={S.subtitle}>Comment vas-tu utiliser Panda Snack ?</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(Object.keys(typeLabels) as SourceGroup[]).map((key) => (
                <button
                  key={key}
                  onClick={() => handleChooseType(key)}
                  style={S.typeBtn}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.borderColor = '#C85A3C')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.borderColor = '#E8D6BF')
                  }
                >
                  <strong style={key === 'ecole' ? { color: '#1D4ED8', fontSize: 17, fontWeight: 800 } : { color: '#3A2A20', fontSize: 15 }}>
                    {typeLabels[key].title}
                  </strong>
                  <span style={{ color: '#6B5742', fontSize: 13 }}>
                    {typeLabels[key].desc}
                  </span>
                </button>
              ))}
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
              {sourceGroup === 'ecole'
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

            {/* Profils */}
            {profils.map((p, i) => (
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

                {/* Classe — seulement pour école */}
                {sourceGroup === 'ecole' && (
                  <label style={S.label}>
                    Classe
                    <select
                      value={p.classe || ''}
                      onChange={(e) =>
                        updateProfil(i, 'classe', e.target.value)
                      }
                      style={S.input}
                    >
                      <option value="">Choisir…</option>
                      {(Object.keys(classeLabels) as Classe[]).map((c) => (
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
            {sourceGroup !== 'panda_guest' && (
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
                  J'accepte les{' '}
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

            {/* Navigation */}
            <div style={S.navRow}>
              <button
                onClick={() => {
                  setStep(1)
                  setError(null)
                }}
                style={S.backBtn}
              >
                Retour
              </button>
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
              <div style={S.recapRow}>
                <span style={S.recapLabel}>Type</span>
                <span style={sourceGroup === 'ecole' ? { ...S.recapValue, color: '#1D4ED8', fontSize: 16, fontWeight: 800 } : S.recapValue}>{typeLabels[sourceGroup].title}</span>
              </div>
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
              {sourceGroup === 'panda_guest' ? 'Ton profil' : `Profil${profils.length > 1 ? 's' : ''} (${profils.length})`}
            </h3>
            {profils.map((p, i) => (
              <div key={i} style={S.recapProfil}>
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
