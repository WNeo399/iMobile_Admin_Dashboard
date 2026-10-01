import request from '@/utils/request'

// iMobile Accountant — money owed to iMobile (backend routes/accountantRoutes).

// ── My Fone shops ───────────────────────────────────────────────────
// The curated list of My Fone shops with what each owes, from the
// server's cached list of unpaid Zoho invoices (kept 10 minutes — Zoho's
// daily call cap is shared); refresh = read it again.
export function myfoneShops(refresh) {
  return request({
    url: '/accountant/myfone/shops',
    method: 'get',
    params: refresh ? { refresh: 1 } : {},
    timeout: 120000
  })
}

// One shop's whole account history — invoices, payments, credit notes and
// refunds — plus the Zoho contact. Kept 10 minutes on the server.
export function myfoneStatement(contactId, refresh) {
  return request({
    url: `/accountant/myfone/shops/${contactId}/statement`,
    method: 'get',
    params: refresh ? { refresh: 1 } : {},
    timeout: 120000
  })
}

// Zoho customers matching q, to add to the list.
export function myfoneSearchContacts(q) {
  return request({ url: '/accountant/myfone/contacts', method: 'get', params: { q }, timeout: 60000 })
}

export function myfoneAddShop(contactId) {
  return request({ url: '/accountant/myfone/shops', method: 'post', data: { contactId }, timeout: 60000 })
}

export function myfoneRemoveShop(contactId) {
  return request({ url: `/accountant/myfone/shops/${contactId}`, method: 'delete' })
}

// Each shop's invoicing and payments between from and to (YYYY-MM-DD; no
// from = from the start). Worked out from the stored shop histories — no
// Zoho calls; a history over 12 hours old is re-read in the background.
export function myfoneActivity(from, to) {
  return request({ url: '/accountant/myfone/activity', method: 'get', params: { from, to } })
}

export function myfoneSyncStatus() {
  return request({ url: '/accountant/myfone/sync', method: 'get' })
}

// Re-read every shop's history from Zoho now (at most every 30 minutes).
export function myfoneSyncNow() {
  return request({ url: '/accountant/myfone/sync', method: 'post' })
}
