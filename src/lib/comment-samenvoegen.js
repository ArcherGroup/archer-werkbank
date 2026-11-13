/* Serverrijen zijn bevestigd. De rest blijft zichtbaar, ook bij deels gelukte sync. */
export function voegCommentsSamen(gedeeld = [], lokaal = [], zoekId = () => null) {
  const uit = []
  const ids = new Set()
  const clients = new Map()
  for (const n of gedeeld) {
    if (!n || n.lokaal || ids.has(String(n.id))) continue
    uit.push(n); ids.add(String(n.id))
    if (n.client_id) clients.set(String(n.client_id), n.id)
  }
  for (const n of lokaal) {
    if (!n) continue
    const key = String(n.client_id || n.lokaal_id || n.id)
    if (clients.has(key) || ids.has(String(n.id))) continue
    const ouder = n.parent_id == null ? null : (clients.get(String(n.parent_id)) ?? zoekId(n.parent_id) ?? n.parent_id)
    uit.push({ ...n, parent_id: ouder })
    ids.add(String(n.id)); clients.set(key, n.id)
  }
  return uit
}
