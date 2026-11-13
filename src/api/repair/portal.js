import request from '@/utils/request'

// iMobile Repair shop portal (2026-11-13) — for the Repair Customer role.
// Everything is scoped on the server to the login's shop group; no prices.

// the linked shop group: { linked, group: { id, name }, shops: [{ id, name }] }
export function getRepairPortalMe() {
    return request({ url: '/repair/portal/me', method: 'get' })
}

// ALL the group's tickets (or one shop's), newest first:
// { tickets, complete, notSearchable: [shop names] }
export function listRepairPortalTickets(params) {
    return request({ url: '/repair/portal/tickets', method: 'get', params, timeout: 90000 })
}

// one ticket with its shared notes: { ticket: { …, notes: [{ id, at, from: 'shop' | 'imobile', shop, device, text }] } }
export function getRepairPortalTicket(id) {
    return request({ url: `/repair/portal/tickets/${encodeURIComponent(id)}`, method: 'get', timeout: 60000 })
}

// the 50×40 label's text, one per device:
//   { labels: [{ ticketNumber, title, repair, imei, serial, fault, customer, phone }] }
export function getRepairPortalLabel(id) {
    return request({ url: `/repair/portal/tickets/${encodeURIComponent(id)}/label`, method: 'get', timeout: 60000 })
}

// the shop's note on a ticket (devices waiting for its reply → "Customer Replied"):
//   → { ticket (fresh), replied: n devices moved, statusFailed }
export function addRepairPortalNote(id, text) {
    return request({ url: `/repair/portal/tickets/${encodeURIComponent(id)}/notes`, method: 'post', data: { text }, timeout: 60000 })
}

// New ticket, step by step (2026-11-13; was one slow whole-catalogue call):
// the brands: { brands: [{ id, name, models }] }
export function getRepairPortalBrands() {
    return request({ url: '/repair/portal/catalog/brands', method: 'get', timeout: 60000 })
}

// one brand's models: { brand, models: [{ id, name }] }
export function getRepairPortalModels(brandId) {
    return request({ url: `/repair/portal/catalog/brands/${encodeURIComponent(brandId)}/models`, method: 'get', timeout: 60000 })
}

// a model's repair services: { device, services: [{ id, name }] }
export function getRepairPortalServices(deviceId) {
    return request({ url: `/repair/portal/catalog/devices/${encodeURIComponent(deviceId)}/services`, method: 'get' })
}

// a new ticket: { shopId, devices: [{ deviceId, serviceIds, imei, serial, passcode, fault }] }
//   → { id, ticketNumber }
export function createRepairPortalTicket(data) {
    return request({ url: '/repair/portal/tickets', method: 'post', data, timeout: 90000 })
}
