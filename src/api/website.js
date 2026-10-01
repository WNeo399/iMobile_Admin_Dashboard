import request from '@/utils/request'

// iMobile Website — storefront content. Banners feed the embeddable
// carousel (backend routes/websiteRoutes; public read in
// routes/widgetRoutes/bannerCarousel).

export function listBanners() {
  return request({ url: '/website/banners', method: 'get' })
}
// data is a FormData: desktop / tablet / mobile image files + title, link,
// newTab, active. The multipart Content-Type must be set explicitly — the
// axios instance defaults to application/json, which strips the boundary
// and leaves multer with no files (same trap as api/exploded). Three S3
// uploads, so give them room.
export function createBanner(data) {
  return request({
    url: '/website/banners',
    method: 'post',
    data,
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000
  })
}
// FormData when images are replaced, a plain object for field-only edits.
export function updateBanner(id, data) {
  const multipart = typeof FormData !== 'undefined' && data instanceof FormData
  return request({
    url: `/website/banners/${id}`,
    method: 'put',
    data,
    ...(multipart ? { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 } : {})
  })
}
export function saveBannerOrder(ids) {
  return request({ url: '/website/banners/order', method: 'put', data: { ids } })
}
export function deleteBanner(id) {
  return request({ url: `/website/banners/${id}`, method: 'delete' })
}
// The carousel's Display settings: { maxHeight, maxWidth } in px, null = no limit.
export function saveBannerSettings(data) {
  return request({ url: '/website/banner-settings', method: 'put', data })
}

// What the Spare Parts widget holds (counts, brands → series); the widget
// itself reads the public feed routes/widgetRoutes/spareParts.
export function sparePartsSummary() {
  return request({ url: '/website/spare-parts', method: 'get', timeout: 60000 })
}

// ── Email campaigns (Zoho Campaigns) — backend routes/websiteRoutes/campaigns.js ──
const multipart = { 'Content-Type': 'multipart/form-data' } // same trap as createBanner

export function listCampaigns(tab) {
  return request({ url: '/website/campaigns', method: 'get', params: { tab } })
}
export function campaignOptions(refresh) {
  return request({ url: '/website/campaigns/options', method: 'get', params: refresh ? { refresh: 1 } : {}, timeout: 60000 })
}
export function zohoCampaignHistory() {
  return request({ url: '/website/campaigns/zoho-history', method: 'get', timeout: 60000 })
}
export function zohoCampaignReport(key) {
  return request({ url: `/website/campaigns/zoho/${key}/report`, method: 'get', timeout: 60000 })
}
export function zohoCampaignRecipients(key, action, page) {
  return request({ url: `/website/campaigns/zoho/${key}/recipients`, method: 'get', params: { action, page }, timeout: 60000 })
}
// data: FormData (zip | html + images[], name, subject, fromName, fromEmail, notes)
export function createCampaign(data) {
  return request({ url: '/website/campaigns', method: 'post', data, headers: multipart, timeout: 120000 })
}
export function getCampaign(id) {
  return request({ url: `/website/campaigns/${id}`, method: 'get' })
}
export function updateCampaign(id, data) {
  return request({ url: `/website/campaigns/${id}`, method: 'put', data, headers: multipart, timeout: 120000 })
}
export function deleteCampaign(id) {
  return request({ url: `/website/campaigns/${id}`, method: 'delete' })
}
export function testCampaign(id, listKey) {
  return request({ url: `/website/campaigns/${id}/test`, method: 'post', data: { listKey }, timeout: 120000 })
}
// confirmTotal: the chosen lists' contact count, typed by the reviewer
export function sendCampaign(id, listKeys, confirmTotal) {
  return request({ url: `/website/campaigns/${id}/send`, method: 'post', data: { listKeys, confirmTotal }, timeout: 120000 })
}
export function campaignReport(id, refresh) {
  return request({ url: `/website/campaigns/${id}/report`, method: 'get', params: refresh ? { refresh: 1 } : {}, timeout: 60000 })
}
export function campaignRecipients(id, action, page) {
  return request({ url: `/website/campaigns/${id}/recipients`, method: 'get', params: { action, page }, timeout: 60000 })
}
