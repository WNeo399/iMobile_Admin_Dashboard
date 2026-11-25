import request from '@/utils/request'

// Chat orders (2026-11-25): placed from the WhatsApp chat bot, kept apart
// from Sales Orders. By model / storage / grade (+ colour) and quantity.

// params: status (open | pending | confirmed | completed | cancelled | expired | all), q, page, pageSize
// → { rows, total, counts }
export function getChatOrders(params) {
  return request({ url: '/refurbished/chat-orders', method: 'get', params })
}
export function getChatOrder(id) {
  return request({ url: `/refurbished/chat-orders/${id}`, method: 'get' })
}
// expired → pending again: stock checked again, prices re-read, a new hold
export function reopenChatOrder(id) {
  return request({ url: `/refurbished/chat-orders/${id}/reopen`, method: 'post', timeout: 60000 })
}
// one scan while picking (nothing saved): { code, picks: [{ deviceId, lineIndex }] }
// → { success: true, device, lineIndex } | { success: false, message, reason } (HTTP 200)
export function scanChatOrderDevice(id, code, picks) {
  return request({ url: `/refurbished/chat-orders/${id}/scan`, method: 'post', data: { code, picks } })
}
// pending → confirmed with every unit scanned: picks = [{ deviceId, lineIndex }]
export function confirmChatOrder(id, picks, note) {
  return request({ url: `/refurbished/chat-orders/${id}/confirm`, method: 'post', data: { picks, note }, timeout: 60000 })
}
// confirmed → completed; salesOrderNo (RSO-…) optional
export function completeChatOrder(id, salesOrderNo, note) {
  return request({ url: `/refurbished/chat-orders/${id}/complete`, method: 'post', data: { salesOrderNo, note } })
}
export function cancelChatOrder(id, reason) {
  return request({ url: `/refurbished/chat-orders/${id}/cancel`, method: 'post', data: { reason } })
}
export function saveChatOrderNote(id, staffNote) {
  return request({ url: `/refurbished/chat-orders/${id}/note`, method: 'put', data: { staffNote } })
}
