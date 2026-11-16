import request from '@/utils/request'

// Customer stock chat (2026-11-16).

// ── staff side (refurb:stockchat:manage) ────────────────────────────
const BASE = '/refurbished/stock-chat'

export function listStockChatCustomers() {
  return request({ url: `${BASE}/customers`, method: 'get' })
}
export function addStockChatCustomer(data) {
  return request({ url: `${BASE}/customers`, method: 'post', data })
}
export function updateStockChatCustomer(id, data) {
  return request({ url: `${BASE}/customers/${id}`, method: 'put', data })
}
export function newStockChatLink(id) {
  return request({ url: `${BASE}/customers/${id}/new-link`, method: 'post' })
}
export function deleteStockChatCustomer(id) {
  return request({ url: `${BASE}/customers/${id}`, method: 'delete' })
}
export function getStockChatLog(id, limit) {
  return request({ url: `${BASE}/customers/${id}/log`, method: 'get', params: { limit } })
}
export function listStockChatPrices() {
  return request({ url: `${BASE}/prices`, method: 'get' })
}
export function addStockChatPrice(data) {
  return request({ url: `${BASE}/prices`, method: 'post', data })
}
export function updateStockChatPrice(id, data) {
  return request({ url: `${BASE}/prices/${id}`, method: 'put', data })
}
export function deleteStockChatPrice(id) {
  return request({ url: `${BASE}/prices/${id}`, method: 'delete' })
}
export function importStockChatPrices(rows, mode) {
  return request({ url: `${BASE}/prices/import`, method: 'post', data: { rows, mode } })
}
export function getStockChatSettings() {
  return request({ url: `${BASE}/settings`, method: 'get' })
}
export function saveStockChatSettings(data) {
  return request({ url: `${BASE}/settings`, method: 'put', data })
}
export function getStockChatPreview(fresh) {
  return request({ url: `${BASE}/preview`, method: 'get', params: fresh ? { fresh: 1 } : {} })
}

// ── the customer's page (no login: the token in the link is the key) ─
// Plain fetch, so the dashboard's login handling never kicks in.
const apiBase = () => (process.env.VUE_APP_BASE_API || '').replace(/\/+$/, '')

async function publicCall(path, options) {
  let res
  try {
    res = await fetch(apiBase() + path, options)
  } catch (e) {
    throw new Error('No connection — please check your internet and try again.')
  }
  let body = null
  try { body = await res.json() } catch (e) { body = null }
  if (!res.ok || !body || body.success === false) {
    const err = new Error((body && body.message) || 'Something went wrong — please try again.')
    err.status = res.status
    err.body = body
    throw err
  }
  return body
}

export function getStockChatSession(token) {
  return publicCall(`/stock-chat/${encodeURIComponent(token)}`, { method: 'GET' })
}

export function askStockChat(token, messages) {
  return publicCall(`/stock-chat/${encodeURIComponent(token)}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages })
  })
}
