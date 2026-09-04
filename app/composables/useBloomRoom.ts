import QRCode from 'qrcode'
import { createScoreQueue } from '../utils/score-queue.mjs'

export function useBloomRoom() {
  type Participant = { id: string; name: string; score: number; ready: boolean; color?: string }
  const role = ref<'host' | 'player'>('host'), screen = ref<'lobby' | 'waiting' | 'play'>('lobby')
  const qr = ref(''), name = ref('You'), ready = ref(false), taps = ref(0), seconds = ref(25)
  const players = ref<Participant[]>([]), gameId = ref(0), participantId = ref(''), started = ref(false)
  const connectionError = ref(''), busy = ref(false)
  const growth = computed(() => Math.round(taps.value / 99 * 100)), finished = computed(() => taps.value >= 99)
  const stage = computed(() => growth.value > 84 ? '🌻' : growth.value > 60 ? '🌿' : growth.value > 32 ? '🌱' : '🌰')
  const allRacers = computed(() => players.value.map((p, i) => ({ ...p, score: Math.round(p.score / 99 * 100), color: ['#ff6b55', '#f4b83f', '#8e78df', '#49a96e'][i % 4] })).sort((a, b) => b.score - a.score))
  const rank = computed(() => allRacers.value.findIndex(p => p.id === participantId.value) + 1)
  let timer: ReturnType<typeof setInterval>, poller: ReturnType<typeof setTimeout>, stopped = false, syncing = false
  let offset = 0, newestServerTime = 0, queue: ReturnType<typeof createScoreQueue> | undefined
  let pendingScore = false, pollFailures = 0
  const serverTime = () => Date.now() + offset

  function apply(data: any, requestedAt: number) {
    if (data.state.gameId < gameId.value) return
    if (data.serverNow < newestServerTime) return // stale overlapping responses must not rewind the room
    newestServerTime = data.serverNow
    // Exclude server processing time so a slow storage response cannot advance a phone's clock.
    offset = ((data.serverReceivedAt - requestedAt) + (data.serverNow - Date.now())) / 2
    if (data.players) players.value = data.players
    if (data.participant) { name.value = data.participant.name; ready.value = true }
    const state = data.state
    if (state.phase === 'waiting') {
      queue?.stop(); queue = undefined; pendingScore = false
      if (timer) clearInterval(timer)
      started.value = false
      gameId.value = state.gameId
      screen.value = role.value === 'host' ? 'lobby' : 'waiting'
      return
    }
    if (role.value === 'player' && !ready.value) return
    if (screen.value !== 'play' || gameId.value !== state.gameId) {
      queue?.stop()
      const round = state.gameId
      gameId.value = round
      taps.value = data.score?.score ?? 0
      screen.value = 'play'
      pendingScore = false
      if (role.value === 'player') {
        queue = createScoreQueue(async (batch: any) => {
          const sentAt = Date.now()
          const result: any = await $fetch('/api/room', { method: 'POST', timeout: 8000, retry: 0, body: { action: 'score', id: participantId.value, gameId: round, ...batch } })
          return { ...result, sentAt }
        }, {
          onError: () => { connectionError.value = 'Score not saved yet. Retrying—keep this page open.' },
          onAck: (result: any) => {
            if (gameId.value !== round) return
            pendingScore = result.score.score < taps.value
            connectionError.value = ''
            apply(result, result.sentAt)
          }
        })
        queue.restore(taps.value, data.score?.seq ?? 0)
      }
      if (timer) clearInterval(timer)
      timer = setInterval(() => {
        started.value = serverTime() >= state.startsAt
        const previous = seconds.value
        seconds.value = Math.max(0, Math.min(25, Math.ceil((state.endsAt - serverTime()) / 1000)))
        if (previous > 0 && seconds.value === 0) queue?.enqueue(taps.value, true)
      }, 100)
      started.value = serverTime() >= state.startsAt
      seconds.value = Math.max(0, Math.min(25, Math.ceil((state.endsAt - serverTime()) / 1000)))
    }
  }
  async function syncRoom(recover = false) {
    if (syncing || stopped) return
    syncing = true
    const sentAt = Date.now()
    try {
      const data: any = await $fetch('/api/room', { query: { view: role.value, ...(recover ? { id: participantId.value } : {}) }, timeout: 8000, retry: 0 })
      apply(data, sentAt)
      pollFailures = 0
      if (!pendingScore) connectionError.value = ''
    } catch { pollFailures++; connectionError.value = 'Connection interrupted. Reconnecting…' }
    finally { syncing = false }
  }
  async function poll() {
    await syncRoom()
    if (!stopped) poller = setTimeout(poll, Math.min(8000, (screen.value === 'play' && role.value === 'player' ? 2500 : 1000) * 2 ** Math.min(pollFailures, 3)) + Math.random() * 150)
  }
  async function action(body: any) {
    const sentAt = Date.now()
    const data = await $fetch('/api/room', { method: 'POST', body, timeout: 8000, retry: 0 })
    apply(data, sentAt)
  }
  async function joinRoom() {
    if (busy.value) return
    busy.value = true
    try { await action({ action: 'join', id: participantId.value, name: name.value.trim() || 'Gardener' }); connectionError.value = '' }
    catch { connectionError.value = 'Could not join. Please try again.' }
    finally { busy.value = false }
  }
  async function startGame() {
    if (busy.value) return
    busy.value = true
    try { await action({ action: 'start' }) } catch { connectionError.value = 'Could not start. Please try again.' }
    finally { busy.value = false }
  }
  async function leaveGame() {
    if (role.value === 'host') {
      try { await action({ action: 'reset' }) } catch { connectionError.value = 'Could not reset. Please try again.' }
    }
  }
  function water() {
    if (!started.value || seconds.value <= 0 || finished.value) return
    taps.value++
    if (role.value === 'player') { pendingScore = true; queue?.enqueue(taps.value, finished.value) }
  }
  onMounted(async () => {
    const isPlayer = new URLSearchParams(location.search).has('join')
    role.value = isPlayer ? 'player' : 'host'
    screen.value = isPlayer ? 'waiting' : 'lobby'
    participantId.value = sessionStorage.getItem('bloom-rush-player') || crypto.randomUUID()
    sessionStorage.setItem('bloom-rush-player', participantId.value)
    qr.value = await QRCode.toDataURL(`${location.origin}${location.pathname}?join=SPROUT`, { width: 320, margin: 2, color: { dark: '#173e2d', light: '#ffffff' }, errorCorrectionLevel: 'H' })
    await syncRoom(isPlayer)
    poller = setTimeout(poll, 1000 + Math.random() * 150)
  })
  onBeforeUnmount(() => { stopped = true; clearInterval(timer); clearTimeout(poller); queue?.stop() })
  return { role, screen, qr, name, ready, taps, seconds, players, started, growth, finished, stage, rank, allRacers, connectionError, busy, joinRoom, startGame, leaveGame, water }
}
