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
