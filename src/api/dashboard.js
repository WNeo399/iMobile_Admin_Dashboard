import request from '@/utils/request'

// Aggregated SQT summary — used by Admin / TechElite Admin / Shop home pages.
export function getSqtDashboard() {
  return request({
    url: '/dashboard/sqt',
    method: 'get'
  })
}

// Per-shop breakdown + shop-side action queue — Shop Owner / Repair Shop home.
export function getShopDashboard() {
  return request({
    url: '/dashboard/shop',
    method: 'get'
  })
}

// Admin-only extras (shop / user counts).
export function getAdminCounts() {
  return request({
    url: '/dashboard/admin',
    method: 'get'
  })
}
