import request from '@/utils/request'

// Purchase Order — read-only view over the supplier's Tencent Docs sheet.

export function getPoTabs() {
  return request({
    url: '/purchaseOrder/tabs',
    method: 'get'
  })
}

// The first call of a cache cycle triggers an export on the backend (~10s),
// so allow a generous timeout.
export function getPoTab(title) {
  return request({
    url: '/purchaseOrder/tab',
    method: 'get',
    params: { title },
    timeout: 60000
  })
}

export function refreshPo() {
  return request({
    url: '/purchaseOrder/refresh',
    method: 'post',
    timeout: 60000
  })
}
