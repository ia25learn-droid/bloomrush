import { getStore } from "@netlify/blobs"
import { handleRoom } from "../lib/room-service.mjs"

export default defineEventHandler(async (event) => {
  setHeader(event, "cache-control", "no-store")
  const query = getQuery(event)
  try {
    return await handleRoom(getStore({ name: "bloom-rush-rooms", consistency: "strong" }), {
      method: event.method,
      room: query.room ?? "sprout",
      view: query.view ?? "player",
      id: query.id,
      body: event.method === "POST" ? await readBody(event) : undefined
    })
  } catch (error: any) {
    throw createError({ statusCode: error.statusCode || 500, statusMessage: error.message })
  }
})
