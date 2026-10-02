const statuses = ['thought', 'developing', 'taking_shape', 'ready_to_act', 'archived']

export function createMindClutter({ title, content, weight = 3, status = 'thought' }) {
  const now = new Date().toISOString()
  const normalizedTitle = (title || '').trim()
  const originalContent = String(content || '')
  const titleFromContent = originalContent.trim().slice(0, 72)
  return { id: crypto.randomUUID(), title: normalizedTitle || titleFromContent || 'Onbenoemde clutter', content: originalContent, originalContent, createdAt: now, updatedAt: now, weight: clampWeight(weight), status: statuses.includes(status) ? status : 'thought', statusBeforeArchive: null, categoryId: null, archived: false, actions: [], links: [], notes: [] }
}

export function updateMindClutter(mindClutter, changes) {
  return { ...mindClutter, ...changes, title: (changes.title ?? mindClutter.title).trim() || mindClutter.title, content: String(changes.content ?? mindClutter.content), weight: clampWeight(changes.weight ?? mindClutter.weight), status: statuses.includes(changes.status ?? mindClutter.status) ? changes.status ?? mindClutter.status : mindClutter.status, updatedAt: new Date().toISOString() }
}

export function addAction(mindClutter, text) {
  const trimmedText = text.trim()
  if (!trimmedText) return mindClutter
  return updateMindClutter(mindClutter, { actions: [...mindClutter.actions, { id: crypto.randomUUID(), text: trimmedText, state: 'unknown' }] })
}

export function updateAction(mindClutter, actionId, text) {
  const trimmedText = text.trim()
  if (!trimmedText) return mindClutter
  return updateMindClutter(mindClutter, { actions: mindClutter.actions.map((action) => action.id === actionId ? { ...action, text: trimmedText } : action) })
}

export function toggleActionDone(mindClutter, actionId) {
  return updateMindClutter(mindClutter, { actions: mindClutter.actions.map((action) => action.id === actionId ? { ...action, state: action.state === 'done' ? 'unknown' : 'done' } : action) })
}

export function removeAction(mindClutter, actionId) {
  return updateMindClutter(mindClutter, { actions: mindClutter.actions.filter((action) => action.id !== actionId) })
}

function clampWeight(weight) { return Math.min(5, Math.max(1, Number(weight) || 3)) }