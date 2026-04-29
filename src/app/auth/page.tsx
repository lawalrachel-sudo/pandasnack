'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

function AuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  // Modes : login | signup | forgot
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');

  // Champs
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Etats UI
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Gestion des erreurs dans l'URL (ex: ?error=no_account)
  const urlError = searchParams.get('error');

  // ================ HANDLERS ================

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!prenom.trim() || !nom.trim()) {
      setError('Merci de renseigner ton prénom et ton nom.');
      return;
    }
    if (password.length < 8) {
      setError('Le mot de passe doit faire au moins 8 caractères.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }

    setLoading(true);

    const { error: signupError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          prenom: prenom.trim(),
          nom: nom.trim(),
        },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/commander`,
      },
    });

    setLoading(false);

    if (signupError) {
      setError(signupError.message);
      return;
    }

    setInfo(
      "✉️ Un email de confirmation vient de t'être envoyé. Clique sur le lien pour activer ton compte."
    );
    // On vide les champs sensibles
    setPassword('');
    setPasswordConfirm('');
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    setLoading(false);

    if (loginError) {
      if (loginError.message.includes('Email not confirmed')) {
        setError(
          "Ton email n'est pas encore confirmé. Vérifie ta boîte mail (et les spams)."
        );
      } else if (loginError.message.includes('Invalid login credentials')) {
        setError('Email ou mot de passe incorrect.');
      } else {
        setError(loginError.message);
      }
      return;
    }

    router.push('/commander');
    router.refresh();
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      {
        redirectTo: `${window.location.origin}/auth/reset`,
      }
    );

    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setInfo(
      '✉️ Si un compte existe pour cet email, un lien de réinitialisation vient de partir.'
    );
  }

  // ================ RENDU ================

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={{ ...styles.logoRow, justifyContent: 'center' }}>
          <img
            src="https://res.cloudinary.com/dbkpvp9ts/image/upload/q_auto,f_auto/v1777335338/PANDA_SNACK_LOGO_transparent.png"
            alt="Panda Snack"
            style={{ height: 80, width: 'auto' }}
          />
        </div>

        <h2 style={styles.title}>
          {mode === 'login' && 'Connexion'}
          {mode === 'signup' && 'Créer un compte'}
          {mode === 'forgot' && 'Mot de passe oublié'}
        </h2>

        {mode !== 'forgot' && (
          <p style={styles.subtitle}>
            {mode === 'login'
              ? 'Retrouve ton wallet et commande en quelques clics.'
              : 'Commande tes repas en ligne. Ton wallet te facilite la vie.'}
          </p>
        )}

        {urlError === 'no_account' && (
          <div style={styles.errorBox}>
            Ton compte n'a pas été trouvé. Merci de te reconnecter ou de créer un compte.
          </div>
        )}
        {error && <div style={styles.errorBox}>{error}</div>}
        {info && <div style={styles.infoBox}>{info}</div>}

        {/* FORMULAIRE LOGIN */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} style={styles.form}>
            <label style={styles.label}>
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={styles.input}
                autoComplete="email"
              />
            </label>

            <label style={styles.label}>
              Mot de passe
              <div style={styles.passwordWrap}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ ...styles.input, paddingRight: 44 }}
                  autoComplete="current-password"
                />
               <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={styles.eyeBtn}
                  aria-label={showPassword ? 'Masquer' : 'Afficher'}
                >
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C85A3C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C85A3C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </label>

            <button type="submit" disabled={loading} style={styles.btnPrimary}>
              {loading ? 'Connexion…' : 'Se connecter'}
            </button>

            <div style={styles.links}>
              <button
                type="button"
                onClick={() => {
                  setMode('forgot');
                  setError(null);
                  setInfo(null);
                }}
                style={styles.linkBtn}
              >
                Mot de passe oublié ?
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setError(null);
                  setInfo(null);
                }}
                style={styles.linkBtn}
              >
                Créer un compte
              </button>
            </div>
          </form>
        )}

        {/* FORMULAIRE SIGNUP */}
        {mode === 'signup' && (
          <form onSubmit={handleSignup} style={styles.form}>
            <div style={styles.row}>
              <label style={{ ...styles.label, flex: 1 }}>
                Prénom
                <input
                  type="text"
                  required
                  value={prenom}
                  onChange={(e) => setPrenom(e.target.value)}
                  style={styles.input}
                  autoComplete="given-name"
                />
              </label>
              <label style={{ ...styles.label, flex: 1 }}>
                Nom
                <input
                  type="text"
                  required
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  style={styles.input}
                  autoComplete="family-name"
                />
              </label>
            </div>

            <label style={styles.label}>
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={styles.input}
                autoComplete="email"
              />
            </label>

            <label style={styles.label}>
              Mot de passe <small style={styles.hint}>(min. 8 caractères)</small>
              <div style={styles.passwordWrap}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ ...styles.input, paddingRight: 44 }}
                  autoComplete="new-password"
                />
               <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={styles.eyeBtn}
                  aria-label={showPassword ? 'Masquer' : 'Afficher'}
                >
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C85A3C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C85A3C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </label>

            <label style={styles.label}>
              Confirmer le mot de passe
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                style={styles.input}
                autoComplete="new-password"
              />
            </label>

            <button type="submit" disabled={loading} style={styles.btnPrimary}>
              {loading ? 'Inscription…' : 'Créer mon compte'}
            </button>

            <div style={styles.links}>
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setInfo(null);
                }}
                style={styles.linkBtn}
              >
                J'ai déjà un compte
              </button>
            </div>

            <p style={styles.legal}>
              En créant un compte, tu acceptes nos{' '}
              <Link href="/cgv" style={styles.legalLink}>
                CGV
              </Link>{' '}
              et notre{' '}
              <Link href="/cgu" style={styles.legalLink}>
                politique de confidentialité
              </Link>
              .
            </p>
          </form>
        )}

        {/* FORMULAIRE FORGOT */}
        {mode === 'forgot' && (
          <form onSubmit={handleForgot} style={styles.form}>
            <p style={styles.subtitle}>
              Indique ton email, on t'envoie un lien de réinitialisation.
            </p>
            <label style={styles.label}>
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={styles.input}
                autoComplete="email"
              />
            </label>

            <button type="submit" disabled={loading} style={styles.btnPrimary}>
              {loading ? 'Envoi…' : 'Envoyer le lien'}
            </button>

            <div style={styles.links}>
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setInfo(null);
                }}
                style={styles.linkBtn}
              >
                Retour à la connexion
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ================ STYLES ================

const styles: { [key: string]: React.CSSProperties } = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #FBF5EC 0%, #F0E6D6 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    background: '#fff',
    borderRadius: 18,
    padding: '32px 28px',
    maxWidth: 440,
    width: '100%',
    boxShadow: '0 20px 60px rgba(200, 90, 60, 0.12)',
    border: '1px solid #E8D6BF',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
    justifyContent: 'center',
  },
  logo: { width: 48, height: 48, objectFit: 'contain' },
  brand: {
    fontSize: 22,
    fontWeight: 800,
    color: '#3A2A20',
    margin: 0,
    letterSpacing: '-0.5px',
  },
  title: {
    fontSize: 26,
    fontWeight: 800,
    color: '#3A2A20',
    margin: '0 0 6px',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B5742',
    margin: '0 0 20px',
    textAlign: 'center',
    lineHeight: 1.5,
  },
  form: { display: 'flex', flexDirection: 'column', gap: 14 },
  row: { display: 'flex', gap: 10 },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontSize: 13,
    fontWeight: 600,
    color: '#3A2A20',
  },
  hint: { fontWeight: 400, color: '#9B8A75', fontSize: 11 },
  input: {
    padding: '11px 14px',
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
  passwordWrap: { position: 'relative' },
  eyeBtn: {
    position: 'absolute',
    right: 10,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: 18,
    padding: 4,
  },
  btnPrimary: {
    background: '#C85A3C',
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    padding: '14px 20px',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: 6,
    transition: 'background 0.2s',
  },
  links: {
    display: 'flex',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 6,
  },
  linkBtn: {
    background: 'transparent',
    border: 'none',
    color: '#C85A3C',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    padding: 4,
    textDecoration: 'underline',
    textUnderlineOffset: 3,
  },
  errorBox: {
    background: '#FEF2F0',
    border: '1px solid #F5B5A8',
    color: '#B84A2E',
    padding: '10px 14px',
    borderRadius: 10,
    fontSize: 13,
    marginBottom: 16,
  },
  infoBox: {
    background: '#F0F7EC',
    border: '1px solid #B8D4A5',
    color: '#3E7D4A',
    padding: '10px 14px',
    borderRadius: 10,
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 1.5,
  },
  legal: {
    fontSize: 11,
    color: '#9B8A75',
    textAlign: 'center',
    margin: '8px 0 0',
    lineHeight: 1.5,
  },
  legalLink: { color: '#C85A3C', textDecoration: 'underline' },
};

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div style={styles.page}>
          <div style={styles.card}>Chargement…</div>
        </div>
      }
    >
      <AuthContent />
    </Suspense>
  );
}
