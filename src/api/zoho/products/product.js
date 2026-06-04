import request from '@/utils/request'

export function getProductDetail(id) {
  return request({
    url: `/zoho/product/getProductDetail/${id}`,
    method: 'get',
  })
}

export function searchProducts(keyword) {
  return request({
    url: '/zoho/product/searchProduct',
    method: 'get',
    params: { keyword }
  })
}

// Resolve a Commerce SKU to the real Inventory item_id + Wholesale price
export function lookupProductBySku(sku) {
  return request({
    url: '/zoho/product/skuLookup',
    method: 'get',
    params: { sku }
  })
}

// Resolve a scanned code (SKU or barcode/UPC) to a Zoho Inventory item.
// Returns { itemId, sku, name, status, scanCode, matchedBy }. Used by the
// scan-on-Enter flow in the Create Sales Order tool.
export function scanProductByCode(code) {
  return request({
    url: '/zoho/product/scanLookup',
    method: 'get',
    params: { code }
  })
}

// Bulk LIKE-search across Zoho for every OCR SKU in one round trip.
// Body: { skus: ['5470', 'a583', ...] }
// Response: { success, data: { '<sku>': [{itemId, sku, name, status}, ...] } }
// Used by the Credit Note review dialog to populate per-row Zoho-item
// pickers so the user can disambiguate partial OCR SKUs.
export function bulkSkuMatches(skus) {
    return request({
        url: '/zoho/product/skuMatches',
        method: 'post',
        data: { skus },
        timeout: 30000
    })
}