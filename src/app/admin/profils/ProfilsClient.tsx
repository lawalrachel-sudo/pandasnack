"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

interface Profil {
  id: string
  prenom: string
  classe: string | null
  metier: string
  is_default: boolean
  active: boolean
  archived: boolean
  notes_allergies: string | null
  parent_nom: string
  parent_email: string | null
  source_group: string | null
  source_label: string
}

export function ProfilsClient() {
  const [profils, setProfils] = useState<Profil[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string>("")
  const [saving, setSaving] = useState(false)
  const [showInactive, setShowInactive] = useState(false)

  async function load() {
    setLoading(true); setError(null)
    try {
      const res = await fetch("/api/admin/profils")
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Erreur")
      setProfils(json.profils || [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  function startEdit(p: Profil) {
    setEditingId(p.id)
    setEditValue(p.classe || "")
  }
  function cancelEdit() {
    setEditingId(null); setEditValue("")
  }
  async function saveEdit(id: string) {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/profils/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classe: editValue.trim() || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Erreur")
      setProfils(prev => prev.map(p => p.id === id ? { ...p, classe: json.profil?.classe ?? null } : p))
      setEditingId(null); setEditValue("")
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const visible = profils.filter(p => showInactive ? true : (p.active && !p.archived))

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <Link href="/admin/dashboard" className="text-sm text-blue-600 hover:underline">← Dashboard</Link>
            <h1 className="text-xl font-bold text-gray-900 mt-1">Profils enfants</h1>
            <p className="text-xs text-gray-500">{visible.length} profil(s) {showInactive ? "(incluant inactifs)" : "actifs"}</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
            Afficher inactifs
          </label>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6">
        {loading && <p className="text-sm text-gray-500">Chargement…</p>}
        {error && <p className="text-sm text-red-600">⚠ {error}</p>}
        {!loading && !error && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                <tr>
                  <th className="text-left px-3 py-2.5 font-semibold">Prénom</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Parent</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Métier</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Source</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Classe</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Statut</th>
                  <th className="text-right px-3 py-2.5 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-500">Aucun profil.</td></tr>
                )}
                {visible.map(p => {
                  const isEditing = editingId === p.id
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">{p.prenom}{p.is_default && <span className="ml-1 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">défaut</span>}</td>
                      <td className="px-3 py-2 text-xs" title={p.parent_email || ""}>{p.parent_nom}</td>
                      <td className="px-3 py-2 text-xs">{p.metier}</td>
                      <td className="px-3 py-2 text-xs">{p.source_label}</td>
                      <td className="px-3 py-2">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <input
                              autoFocus
                              type="text"
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter") saveEdit(p.id)
                                if (e.key === "Escape") cancelEdit()
                              }}
                              placeholder="ex: CP, CE2, 6e, Adulte…"
                              className="px-2 py-1 text-sm border border-blue-400 rounded w-32"
                            />
                            <button onClick={() => saveEdit(p.id)} disabled={saving}
                              className="px-2 py-1 text-xs bg-green-600 text-white rounded disabled:opacity-50">
                              {saving ? "…" : "✓"}
                            </button>
                            <button onClick={cancelEdit}
                              className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded">
                              ✕
                            </button>
                          </div>
                        ) : (
                          <span className="font-mono text-sm">{p.classe || "—"}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {p.archived ? <span className="text-gray-400">archivé</span>
                          : p.active ? <span className="text-green-700">actif</span>
                          : <span className="text-gray-500">inactif</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {!isEditing && (
                          <button onClick={() => startEdit(p)} className="text-xs text-blue-600 hover:underline">
                            ✏️ Modifier
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
