import request from '@/utils/request'

// Blackbelt — partner accounts + their linked SQT shops.

export function getBlackbeltAccounts() {
  return request({ url: '/blackbelt/accounts', method: 'get' })
}
export function createBlackbeltAccount(data) {
  return request({ url: '/blackbelt/accounts', method: 'post', data })
}
export function updateBlackbeltAccount(id, data) {
  return request({ url: `/blackbelt/accounts/${id}`, method: 'put', data })
}
export function deleteBlackbeltAccount(id) {
  return request({ url: `/blackbelt/accounts/${id}`, method: 'delete' })
}
export function getBlackbeltSqtShops() {
  return request({ url: '/blackbelt/sqtShops', method: 'get' })
}
// Replace the account's linked-shop set.
export function setBlackbeltAccountShops(id, shopIds) {
  return request({ url: `/blackbelt/accounts/${id}/shops`, method: 'post', data: { shopIds } })
}

// ── Invoices ──
export function getBlackbeltInvoices(params) {
  return request({ url: '/blackbelt/invoices', method: 'get', params })
}
export function createBlackbeltInvoice(data) {
  return request({ url: '/blackbelt/invoices', method: 'post', data })
}
export function deleteBlackbeltInvoice(id) {
  return request({ url: `/blackbelt/invoices/${id}`, method: 'delete' })
}
// status: 'paid' | 'unpaid'
export function setBlackbeltInvoicePayment(id, status) {
  return request({ url: `/blackbelt/invoices/${id}/paymentStatus`, method: 'post', data: { status } })
}
// Email the invoice. data: { to, cc, subject, body, pdfBase64,
// attachments: [{filename, dataBase64}] } — PDF rendered client-side.
export function emailBlackbeltInvoice(id, data) {
  return request({ url: `/blackbelt/invoices/${id}/email`, method: 'post', data, timeout: 120000 })
}
