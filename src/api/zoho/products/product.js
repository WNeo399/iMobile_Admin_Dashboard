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

// Bulk SKU → storage location (Items view "Location"). Used by the Create
// Sales Order "Print List" picking sheet.
// Body: { skus: [...] } → { success, data: { '<sku>': 'A1-A1-L4' | null } }
export function getItemLocations(skus) {
  return request({
    url: '/zoho/product/itemLocations',
    method: 'post',
    data: { skus },
    timeout: 30000
  })
}

// Barcode-label data for one SKU: product name, Selling Price and the
// Platinum-pricebook rate. Used by the Tools → Barcode Generator.
export function getLabelData(sku) {
  return request({
    url: '/zoho/product/labelData',
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
// `force: true` bypasses the backend's short-lived per-SKU cache — used by
// the review dialog's confirm button so re-confirming a SKU always runs a
// genuinely fresh Zoho lookup.
export function bulkSkuMatches(skus, force) {
    return request({
        url: '/zoho/product/skuMatches',
        method: 'post',
        data: force ? { skus, force: true } : { skus },
        timeout: 30000
    })
}