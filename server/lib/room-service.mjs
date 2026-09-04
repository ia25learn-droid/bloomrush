const fail = (statusCode, message) => { throw Object.assign(new Error(message), { statusCode }) }
const identifier = (value) => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(value)) fail(400, 'Invalid identifier')
  return value
}
const initialState = () => ({ phase: 'waiting', gameId: 0, startsAt: 0, endsAt: 0 })

const writes = new Map()
// Serialize same-player requests in one process (also protects the file-based local
// emulator). CAS below remains essential across separate production function instances.
async function update(store, key, transform) {
  const previous = writes.get(key) ?? Promise.resolve()
  let release
  const current = new Promise(resolve => { release = resolve })
  writes.set(key, current)
  await previous
  try { return await updateAtomic(store, key, transform) }
  finally { release(); if (writes.get(key) === current) writes.delete(key) }
}

async function updateAtomic(store, key, transform) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const current = await store.getWithMetadata(key, { type: 'json' })
    const next = transform(current?.data ?? null)
    if (next === null) return current?.data
    const result = await store.setJSON(key, next, current ? { onlyIfMatch: current.etag } : { onlyIfNew: true })
    if (result.modified) return next
    await new Promise(resolve => setTimeout(resolve, 5 + Math.random() * 20))
  }
  fail(503, 'Room busy. Please retry.')
}

export async function handleRoom(store, request, now = Date.now) {
  const serverReceivedAt = now()
  const root = `v2/${identifier(request.room ?? 'sprout')}`
  const stateKey = `${root}/state`
  let state = await store.get(stateKey, { type: 'json' }) ?? initialState()
  const rosterPrefix = `${root}/players/`
  const reply = (extra = {}) => ({ state, serverReceivedAt, serverNow: now(), ...extra })

  if (request.method === 'GET') {
    if (request.view === 'host') {
      const { blobs } = await store.list({ prefix: rosterPrefix })
      const players = (await Promise.all(blobs.map(async ({ key }) => {
        const player = await store.get(key, { type: 'json' })
        if (!player) return null
        const currentRound = state.phase === 'playing' && player.gameId === state.gameId
        return { ...player, score: currentRound ? player.score : 0, seq: currentRound ? player.seq : 0 }
      }))).filter(Boolean).sort((a, b) => b.score - a.score)
      return reply({ players })
    }
    // Recovery reads fetch only this player's record. Normal polls read state only.
    if (request.id) {
      const id = identifier(request.id)
      const participant = await store.get(`${rosterPrefix}${id}`, { type: 'json' })
      const score = participant?.gameId === state.gameId ? participant : null
      return reply({ participant, score })
    }
    return reply()
  }
  if (request.method !== 'POST') fail(405, 'Method not allowed')
  const body = request.body ?? {}
  if (body.action === 'join') {
    if (state.phase !== 'waiting') fail(409, 'The race has already started')
    const id = identifier(body.id)
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 12) : ''
    if (!name) fail(400, 'Please enter a nickname')
    const participant = await update(store, `${rosterPrefix}${id}`, old => old ?? { id, name, ready: true })
    return reply({ participant })
  }
  if (body.action === 'score') {
    const id = identifier(body.id)
    if (body.gameId !== state.gameId || state.phase !== 'playing') fail(409, 'This race is no longer active')
    if (now() < state.startsAt || now() > state.endsAt + 10_000) fail(409, 'Outside score submission window')
    if (!Number.isInteger(body.seq) || body.seq < 1 || !Number.isInteger(body.score) || body.score < 0 || body.score > 99) fail(400, 'Invalid score update')
    const score = await update(store, `${rosterPrefix}${id}`, old => {
      if (!old) fail(403, 'Join the room first')
      if (old.gameId > state.gameId) return null
      const sameRound = old.gameId === state.gameId
      if (sameRound && body.seq <= old.seq) return null
      return { ...old, gameId: state.gameId, seq: body.seq, score: Math.max(sameRound ? old.score : 0, body.score), updatedAt: now() }
    })
    return reply({ score })
  }
  if (body.action === 'start') {
    state = await update(store, stateKey, old => {
      const current = old ?? initialState()
      if (current.phase === 'playing') return null
      const startsAt = now() + 3_000
      return { phase: 'playing', gameId: current.gameId + 1, startsAt, endsAt: startsAt + 25_000 }
    })
    return reply()
  }
  if (body.action === 'reset') {
    state = await update(store, stateKey, old => ({ ...initialState(), gameId: (old?.gameId ?? 0) + 1 }))
    return reply()
  }
  fail(400, 'Unknown room action')
}
