export function createScoreQueue(send, { onError = () => {}, onAck = () => {}, interval = 1000 } = {}) {
  let latest = 0, acknowledged = 0, seq = 0, timer, inFlight = false, stopped = false, final = false, failures = 0
  const schedule = (delay) => {
    if (timer || stopped || inFlight) return
    timer = setTimeout(() => { timer = undefined; flush() }, delay)
  }
  async function flush() {
    if (stopped || inFlight || latest <= acknowledged) return
    if (timer) { clearTimeout(timer); timer = undefined }
    const score = latest
    inFlight = true
    let failed = false
    try {
      const result = await send({ score, seq: ++seq })
      if (stopped) return
      acknowledged = Math.max(acknowledged, result.score.score)
      seq = Math.max(seq, result.score.seq)
      failures = 0
      onAck(result)
    } catch (error) {
      if (stopped) return
      failed = true
      failures++
      onError(error)
    } finally {
      inFlight = false
      if (!stopped && latest > acknowledged && failures < 5) schedule(failed ? Math.min(4000, interval * 2 ** (failures - 1)) : final ? 0 : interval)
    }
  }
  return {
    enqueue(score, isFinal = false) {
      latest = Math.max(latest, score)
      final ||= isFinal
      if (isFinal) { failures = 0; void flush() } else schedule(interval)
    },
    restore(score, sequence) { latest = acknowledged = score; seq = sequence },
    flush,
    stop() { stopped = true; if (timer) clearTimeout(timer) }
  }
}
