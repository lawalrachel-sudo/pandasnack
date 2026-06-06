import { createClient } from "@supabase/supabase-js"

// Client service_role (bypass RLS) pour les routes /api/admin/* en LECTURE.
// L'accès admin peut se faire par cookie signé (auth.uid() NULL) → avec le client
// anon+cookies, la RLS masquait toutes les commandes des autres comptes
// (bug découvert au lancement 05/06/2026 : dashboard vide).
// L'autorisation est portée en amont par requireAdmin. Même pattern que mark-paid.
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key || key === "xxx") return null
  return createClient(url, key)
}
