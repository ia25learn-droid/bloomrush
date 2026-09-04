import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { writeFile } from 'node:fs/promises'
import { createScoreQueue } from '../app/utils/score-queue.mjs'

const origin = new URL(process.argv[2] ?? 'http://localhost:3000')
assert(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname), 'Only loopback targets allowed; never target a live site')
const room = `load-${Date.now()}`
const endpoint = `${origin.origin}/api/room?room=${room}`
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const metrics = { requests: 0, errors: [], expectedRejections: 0, bytes: 0, times: [], byType: {}, typeTimes: {}, injectedFailures: 0 }
let active = true
async function request(body, view = 'player', expectedStatus = 200) {
  const start = performance.now()
  const type = body?.action ?? view
  metrics.requests++; metrics.byType[type] = (metrics.byType[type] ?? 0) + 1
  try {
    const response = await fetch(`${endpoint}&view=${view}`, {
      method: body ? 'POST' : 'GET', headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(8000)
    })
    const text = await response.text()
    metrics.bytes += Buffer.byteLength(text)
    if (response.status !== expectedStatus) throw Error(`${type}: expected ${expectedStatus}, got ${response.status}: ${text.slice(0, 150)}`)
    if (expectedStatus !== 200) metrics.expectedRejections++
    const data = JSON.parse(text)
    if (view === 'player' && !body) assert.equal(data.players, undefined, 'Participant poll must not contain roster')
    return data
  } catch (error) { metrics.errors.push(String(error)); throw error }
  finally { const elapsed = performance.now() - start; metrics.times.push(elapsed); (metrics.typeTimes[type] ??= []).push(elapsed) }
}
const totalStart = performance.now()
const ids = Array.from({ length: 200 }, (_, i) => `player-${i}`)
const queues = []
const pollTasks = []
let report
try {
  console.log(`Local-only 200-player load test: ${room}`)
  const joinStart = performance.now()
  await Promise.all(ids.map((id, i) => request({ action: 'join', id, name: `Tester ${i}` })))
  const joinMs = performance.now() - joinStart
  const lobby = await request(null, 'host')
  assert.equal(lobby.players.length, 200)
  console.log(`All 200 joined in ${Math.round(joinMs)}ms. Starting shared countdown.`)
  const start = await request({ action: 'start' })
  const gameId = start.state.gameId
  assert.equal(start.state.endsAt - start.state.startsAt, 25000)
  const startDelay = start.state.startsAt - start.serverNow
  let acked = 0, startSeenOnTime = 0
  const acknowledgements = new Set()
  for (let i = 0; i < ids.length; i++) {
    let failedOnce = false
    const queue = createScoreQueue(async batch => {
      // Explicitly inject a temporary transport failure for 20 phones.
      if (i % 10 === 0 && !failedOnce) { failedOnce = true; metrics.injectedFailures++; throw Error('Injected offline transition') }
      return request({ action: 'score', id: ids[i], gameId, ...batch })
    }, { onAck: result => { if (result.score.score === 99 && !acknowledgements.has(ids[i])) { acknowledgements.add(ids[i]); acked++ } } })
    queues.push(queue)
    pollTasks.push((async () => {
      await sleep(i * 5)
      let observed = false
      while (active) {
        const data = await request(null)
        if (!observed && data.state.gameId === gameId) { observed = true; if (Date.now() <= start.state.startsAt) startSeenOnTime++ }
        await sleep(Date.now() < start.state.startsAt ? 1000 : 2500)
      }
    })())
  }
  pollTasks.push((async () => { while (active) { await request(null, 'host'); await sleep(1000) } })())
  await sleep(Math.max(0, startDelay))
  const raceStart = performance.now()
  // 99 individual taps per phone over ~24 seconds, through the production batching queue.
  await Promise.all(queues.map(async (queue, i) => {
    for (let tap = 1; tap <= 99; tap++) {
      await sleep(Math.max(0, raceStart + (tap - 1) * 240 + i % 100 - performance.now()))
      queue.enqueue(tap, tap === 99)
    }
  }))
  const deadline = performance.now() + 7000
  while (acked < 200 && performance.now() < deadline) await sleep(100)
  active = false
  await Promise.all(pollTasks)
  assert.equal(acked, 200, 'Every final score must be acknowledged')
  const board = await request(null, 'host')
  assert.equal(board.players.length, 200)
  assert(board.players.every(p => p.score === 99), 'No final score may be missing')
  console.log('200 final scores saved. Checking ordering and old-round rejection.')
  const current = board.players.find(p => p.id === ids[0])
  await Promise.all([
    request({ action: 'score', id: ids[0], gameId, seq: current.seq + 2, score: 99 }),
    request({ action: 'score', id: ids[0], gameId, seq: 1, score: 1 }),
    request({ action: 'score', id: ids[0], gameId, seq: current.seq + 1, score: 70 })
  ])
  const ordered = (await request(null, 'host')).players.find(p => p.id === ids[0])
  assert.equal(ordered.score, 99)
  assert.equal(ordered.seq, current.seq + 2)
  await request({ action: 'reset' })
  await request({ action: 'score', id: ids[0], gameId, seq: 999, score: 99 }, 'player', 409)
  const second = await request({ action: 'start' })
  assert.notEqual(second.state.gameId, gameId)
  const clean = await request(null, 'host')
  assert(clean.players.every(p => p.score === 0), 'New round must start at zero')
  await request({ action: 'score', id: ids[0], gameId: second.state.gameId, seq: 1, score: 1 }, 'player', 409)
  await request({ action: 'reset' })
  const sorted = [...metrics.times].sort((a, b) => a - b)
  report = {
    passed: true, target: origin.origin, room, players: 200, joinMs: Math.round(joinMs),
    raceAndDrainMs: Math.round(performance.now() - raceStart), totalMs: Math.round(performance.now() - totalStart),
    finalScoresSaved: acked, individualTaps: 19800, scoreRequests: metrics.byType.score,
    playersReceivingStartBeforeDeadline: startSeenOnTime,
    tapRequestReductionPercent: Number(((1 - metrics.byType.score / 19800) * 100).toFixed(1)),
    requests: metrics.requests, unexpectedErrors: metrics.errors.length, injectedFailuresRecovered: metrics.injectedFailures,
    expectedRejections: metrics.expectedRejections, responseBytes: metrics.bytes,
    latencyMs: { p50: Math.round(sorted[Math.floor(sorted.length * .50)]), p95: Math.round(sorted[Math.floor(sorted.length * .95)]), p99: Math.round(sorted[Math.floor(sorted.length * .99)]), max: Math.round(sorted.at(-1)) },
    byType: metrics.byType,
    p95ByTypeMs: Object.fromEntries(Object.entries(metrics.typeTimes).map(([key, times]) => [key, Math.round(times.sort((a,b)=>a-b)[Math.floor(times.length * .95)])])),
    scope: 'Real local Nuxt HTTP endpoint + Netlify local Blobs emulator; not live Netlify, Wi-Fi, or 200 physical phones. Synthetic records retained only under the isolated load-test room.'
  }
} catch (error) {
  process.exitCode = 1
  report = { passed: false, room, error: String(error), requests: metrics.requests, errors: metrics.errors.slice(0, 10) }
} finally {
  active = false
  queues.forEach(q => q.stop())
  await Promise.allSettled(pollTasks)
  await writeFile(new URL('./load-results.json', import.meta.url), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}
