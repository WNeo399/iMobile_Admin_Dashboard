import request from '@/utils/request'
import { getToken } from '@/utils/auth'

// "AI Agent" — agentic Claude chat over the scraper MySQL.
// `messages` is the thread: [{ role: 'user'|'assistant', content }].

// Non-streaming call (kept for any simple consumer).
export function askData(messages) {
  return request({
    url: '/aiQuery/ask',
    method: 'post',
    data: { messages },
    timeout: 120000
  })
}

// Streaming call — POSTs and reads the newline-delimited JSON the backend emits,
// invoking onProgress(label) as the agent moves through its query rounds, then
// resolving with the final result object ({ answer, result?, steps, ... }).
export async function askDataStream(messages, { onProgress, signal } = {}) {
  // Trailing slash in VUE_APP_BASE_API (e.g. "http://localhost:3000/") would make
  // a double slash — axios normalises it, raw fetch doesn't (and the backend 404s).
  const base = (process.env.VUE_APP_BASE_API || '').replace(/\/+$/, '')
  const resp = await fetch(base + '/aiQuery/ask', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + getToken()
    },
    body: JSON.stringify({ messages }),
    signal
  })

  // Non-2xx (e.g. 503 not_configured, 400, 401) come back as plain JSON.
  if (!resp.ok || !resp.body) {
    let data = {}
    try { data = await resp.json() } catch (e) { /* ignore */ }
    const err = new Error(data.message || ('Request failed (' + resp.status + ')'))
    err.code = data.code
    err.status = resp.status
    throw err
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let final = null
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line) continue
      let evt
      try { evt = JSON.parse(line) } catch (e) { continue }
      if (evt.type === 'progress') {
        if (onProgress) onProgress(evt.label || '')
      } else if (evt.type === 'result') {
        final = evt
      } else if (evt.type === 'error') {
        throw new Error(evt.message || 'AI query failed.')
      }
    }
  }
  if (!final) throw new Error('No answer received from the assistant.')
  return final
}
