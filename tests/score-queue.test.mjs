import test from 'node:test'
import assert from 'node:assert/strict'
import { createScoreQueue } from '../app/utils/score-queue.mjs'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

test('rapid taps coalesce, final score flushes, and only one request is in flight', async () => {
  let active = 0, peak = 0
  const batches = []
  const queue = createScoreQueue(async batch => {
    active++; peak = Math.max(peak, active); batches.push(batch)
    await sleep(20); active--
    return { score: batch }
  }, { interval: 20 })
  for (let i = 1; i <= 50; i++) queue.enqueue(i)
  await sleep(25)
  for (let i = 51; i <= 99; i++) queue.enqueue(i, i === 99)
  await sleep(100)
  queue.stop()
  assert.equal(peak, 1)
  assert.equal(batches.length, 2)
  assert.equal(batches.at(-1).score, 99)
  assert(batches[1].seq > batches[0].seq)
})

test('failed final upload is retried and acknowledged', async () => {
  let attempts = 0, errors = 0, saved = 0
  const queue = createScoreQueue(async batch => {
    if (++attempts === 1) throw Error('temporary outage')
    return { score: batch }
  }, { interval: 10, onError: () => errors++, onAck: result => saved = result.score.score })
  queue.enqueue(99, true)
  await sleep(100)
  queue.stop()
  assert.equal(attempts, 2)
  assert.equal(errors, 1)
  assert.equal(saved, 99)
})

test('stopping an old round suppresses its delayed acknowledgement', async () => {
  let acknowledgements = 0
  const queue = createScoreQueue(async batch => { await sleep(30); return { score: batch } }, { onAck: () => acknowledgements++ })
  queue.enqueue(99, true)
  queue.stop()
  await sleep(60)
  assert.equal(acknowledgements, 0)
})
