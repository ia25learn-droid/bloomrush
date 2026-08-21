import { getStore } from "@netlify/blobs"

type Participant = { id: string; name: string; score: number; ready: boolean; updatedAt: number }
type RoomState = { phase: "waiting" | "playing"; gameId: number; startsAt: number; endsAt: number }

const store = () => getStore({ name: "bloom-rush-rooms", consistency: "strong" })
const clean = (value: unknown, max = 24) => String(value ?? "").replace(/[^a-zA-Z0-9 _-]/g, "").trim().slice(0, max)

async function readRoom() {
  const roomStore = store()
  const state = await roomStore.get("sprout/state", { type: "json" }) as RoomState | null
  const listed = await roomStore.list({ prefix: "sprout/players/" })
  const players = (await Promise.all(listed.blobs.map(({ key }) => roomStore.get(key, { type: "json" }))))
    .filter(Boolean) as Participant[]
  return { state: state ?? { phase: "waiting", gameId: 0, startsAt: 0, endsAt: 0 }, players: players.sort((a, b) => b.score - a.score) }
}

export default defineEventHandler(async (event) => {
  setHeader(event, "cache-control", "no-store")
  if (event.method === "GET") return readRoom()

  const body = await readBody(event)
  const action = clean(body?.action, 12)
  const roomStore = store()

  if (action === "join" || action === "score") {
    const id = clean(body?.id, 48)
    const name = clean(body?.name, 12)
    if (!id || !name) throw createError({ statusCode: 400, statusMessage: "A participant id and name are required" })
    const participant: Participant = {
      id, name,
      ready: action === "join" ? true : Boolean(body?.ready ?? true),
      score: Math.max(0, Math.min(99, Number(body?.score) || 0)),
      updatedAt: Date.now()
    }
    await roomStore.setJSON(`sprout/players/${id}`, participant)
  }

  if (action === "start") {
    const current = await readRoom()
    const startsAt = Date.now() + 3_000
    await roomStore.setJSON("sprout/state", { phase: "playing", gameId: current.state.gameId + 1, startsAt, endsAt: startsAt + 25_000 })
  }

  if (action === "reset") {
    const current = await readRoom()
    await Promise.all(current.players.map(({ id }) => roomStore.delete(`sprout/players/${id}`)))
    await roomStore.setJSON("sprout/state", { phase: "waiting", gameId: current.state.gameId, startsAt: 0, endsAt: 0 })
  }

  return readRoom()
})
