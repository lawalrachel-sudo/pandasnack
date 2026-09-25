import { vi } from "vitest"

// Stub de client Supabase pour les tests de route handlers.
//
// On rejoue la forme de l'API postgrest-js : un builder chaînable et « thenable ».
// Chaque appel terminal (await, .single(), .maybeSingle()) demande son résultat au
// resolver passé par le test, avec la table et la trace complète des appels — ce qui
// permet d'assurer non seulement le code de retour mais AUSSI les filtres appliqués
// (ex. `.eq("account_id", …)` sur un UPDATE en service_role).

export interface Call {
  method: string
  args: unknown[]
}

export interface QueryContext {
  table: string
  op: "select" | "insert" | "update" | "delete" | null
  calls: Call[]
  /** Payload du .insert() / .update(). */
  payload?: unknown
  /** Raccourci : valeur passée à .eq(field, value). */
  eq: Record<string, unknown>
  /** Raccourci : valeur passée à .in(field, values). */
  in: Record<string, unknown[]>
}

export type Resolver = (ctx: QueryContext) => { data?: unknown; error?: unknown; count?: number }

export interface StubClient {
  from: (table: string) => unknown
  auth: { getUser: () => Promise<{ data: { user: { id: string; email?: string } | null } }> }
  /** Toutes les requêtes effectivement exécutées, dans l'ordre. */
  queries: QueryContext[]
}

const TERMINAL_SINGLE = new Set(["single", "maybeSingle"])

export function makeSupabaseStub(opts: {
  user?: { id: string; email?: string } | null
  resolve: Resolver
}): StubClient {
  const queries: QueryContext[] = []

  function builder(table: string) {
    const ctx: QueryContext = { table, op: null, calls: [], eq: {}, in: {} }
    queries.push(ctx)

    const run = () => {
      const r = opts.resolve(ctx)
      return { data: r.data ?? null, error: r.error ?? null, count: r.count ?? null }
    }

    const proxy: Record<string, unknown> = {}
    const chain = (method: string) => (...args: unknown[]) => {
      ctx.calls.push({ method, args })
      if (method === "select" && ctx.op === null) ctx.op = "select"
      if (method === "insert" || method === "update" || method === "delete") {
        ctx.op = method
        ctx.payload = args[0]
      }
      if (method === "eq") ctx.eq[String(args[0])] = args[1]
      if (method === "in") ctx.in[String(args[0])] = args[1] as unknown[]
      if (TERMINAL_SINGLE.has(method)) return Promise.resolve(run())
      return proxy
    }

    for (const m of [
      "select", "insert", "update", "delete", "eq", "neq", "in", "is", "or", "gt", "gte",
      "lt", "lte", "ilike", "like", "order", "limit", "range", "single", "maybeSingle",
    ]) {
      proxy[m] = chain(m)
    }
    // Thenable : `await supabase.from(...).update(...).eq(...)` doit se résoudre.
    proxy.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(run()).then(res, rej)

    return proxy
  }

  return {
    from: (table: string) => builder(table),
    auth: { getUser: vi.fn(async () => ({ data: { user: opts.user ?? null } })) },
    queries,
  }
}

/** Requêtes enregistrées pour une table donnée. */
export function queriesOn(client: StubClient, table: string): QueryContext[] {
  return client.queries.filter((q) => q.table === table)
}

/** Construit une Request JSON pour un route handler. */
export function jsonRequest(body: unknown, url = "http://localhost/api/test") {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}
