import { supabase } from '../services/supabase.js'

export class MindClutterRepository {
  async list({ includeArchived = false } = {}) {
    const user = await currentUser()
    await flushPending(user.id)
    try {
      let query = supabase.from('mind_clutters').select('*').eq('user_id', user.id).order('updated_at', { ascending: false })
      if (!includeArchived) query = query.eq('archived', false)
      const { data, error } = await query
      if (error) throw error
      const rows = data.map(fromRow)
      await writeCache(user.id, rows)
      return rows
    } catch (error) {
      const cached = await readCache(user.id)
      if (cached) return includeArchived ? cached : cached.filter((mindClutter) => !mindClutter.archived)
      throw error
    }
  }

  async save(mindClutter) {
    const user = await currentUser()
    try {
      const { data, error } = await supabase.from('mind_clutters').upsert(toRow(mindClutter, user.id)).select().single()
      if (error) throw error
      const saved = fromRow(data)
      await updateCache(user.id, saved)
      return saved
    } catch (error) {
      await enqueue(user.id, { type: 'save', updatedAt: mindClutter.updatedAt, mindClutter })
      await updateCache(user.id, mindClutter)
      return mindClutter
    }
  }

  async delete(id) {
    const user = await currentUser()
    try {
      const { error } = await supabase.from('mind_clutters').delete().eq('id', id).eq('user_id', user.id)
      if (error) throw error
      await removeFromCache(user.id, id)
    } catch (error) {
      await enqueue(user.id, { type: 'delete', id, updatedAt: new Date().toISOString() })
      await removeFromCache(user.id, id)
    }
  }
}

const cacheKey = (userId) => `unclut-data-${userId}`
const queueKey = (userId) => `unclut-pending-${userId}`

async function readCache(userId) {
  try { return await decrypt(localStorage.getItem(cacheKey(userId))) } catch { localStorage.removeItem(cacheKey(userId)); return null }
}

async function writeCache(userId, mindClutters) {
  try { localStorage.setItem(cacheKey(userId), await encrypt(mindClutters)) } catch { /* Offline cache is optional when Web Crypto is unavailable. */ }
}

async function updateCache(userId, mindClutter) {
  const cached = await readCache(userId) || []
  await writeCache(userId, [mindClutter, ...cached.filter((item) => item.id !== mindClutter.id)])
}

async function removeFromCache(userId, id) {
  await writeCache(userId, (await readCache(userId) || []).filter((item) => item.id !== id))
}

async function enqueue(userId, operation) {
  const pending = await readQueue(userId)
  await writeQueue(userId, [...pending.filter((item) => item.id !== operation.mindClutter?.id && item.id !== operation.id), operation])
}

async function flushPending(userId) {
  const pending = await readQueue(userId)
  if (!pending.length) return
  try {
    for (const operation of pending) {
      const { data: remote, error: readError } = await supabase.from('mind_clutters').select('updated_at').eq('id', operation.mindClutter?.id || operation.id).eq('user_id', userId).maybeSingle()
      if (readError) return
      if (remote && operation.updatedAt && remote.updated_at > operation.updatedAt) continue
      const request = operation.type === 'delete'
        ? supabase.from('mind_clutters').delete().eq('id', operation.id).eq('user_id', userId)
        : supabase.from('mind_clutters').upsert(toRow(operation.mindClutter, userId))
      const { error } = await request
      if (error) return
    }
  } catch {
    return
  }
  localStorage.removeItem(queueKey(userId))
}

const cryptoDb = new Promise((resolve, reject) => {
  const request = indexedDB.open('unclut-secure-storage', 1)
  request.onupgradeneeded = () => request.result.createObjectStore('keys')
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})

async function encryptionKey() {
  const database = await cryptoDb
  const existing = await idbRequest(database.transaction('keys', 'readonly').objectStore('keys').get('device'))
  if (existing) return existing
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  await idbRequest(database.transaction('keys', 'readwrite').objectStore('keys').put(key, 'device'))
  return key
}

async function encrypt(value) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(JSON.stringify(value))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(), encoded)
  return `${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`
}

async function decrypt(value) {
  if (!value) return null
  const [ivText, encryptedText] = value.split('.')
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(ivText) }, await encryptionKey(), fromBase64(encryptedText))
  return JSON.parse(new TextDecoder().decode(decrypted))
}

async function readQueue(userId) {
  try { return await decrypt(localStorage.getItem(queueKey(userId))) || [] } catch { localStorage.removeItem(queueKey(userId)); return [] }
}

async function writeQueue(userId, pending) {
  localStorage.setItem(queueKey(userId), await encrypt(pending))
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function toBase64(bytes) {
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary)
}

function fromBase64(value) {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function currentUser() {
  const { data: sessionData } = await supabase.auth.getSession()
  if (sessionData.session?.user) return sessionData.session.user
  const { data, error } = await supabase.auth.getUser()
  if (data.user) return data.user
  throw error || new Error('Geen ingelogde gebruiker.')
}

function toRow(mindClutter, userId) {
  return {
    id: mindClutter.id,
    user_id: userId,
    title: mindClutter.title,
    content: mindClutter.content,
    original_content: mindClutter.originalContent,
    created_at: mindClutter.createdAt,
    updated_at: mindClutter.updatedAt,
    weight: mindClutter.weight,
    status: mindClutter.status,
    status_before_archive: mindClutter.statusBeforeArchive,
    category_id: mindClutter.categoryId,
    archived: mindClutter.archived,
    actions: mindClutter.actions || [],
    links: mindClutter.links || [],
    notes: mindClutter.notes || [],
    map_position: mindClutter.mapPosition || null,
  }
}

function fromRow(row) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    originalContent: row.original_content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    weight: row.weight,
    status: row.status,
    statusBeforeArchive: row.status_before_archive || null,
    categoryId: row.category_id,
    archived: row.archived,
    actions: row.actions || [],
    links: row.links || [],
    notes: row.notes || [],
    mapPosition: row.map_position || undefined,
  }
}
