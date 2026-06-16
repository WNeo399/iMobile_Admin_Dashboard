import request from '@/utils/request'

// ── Reference data (brand / category / model / quality) ────────────
export function listBrands() {
    return request({ url: '/catalogue/brands', method: 'get' })
}
export function createBrand(data) {
    return request({ url: '/catalogue/brands', method: 'post', data })
}
export function updateBrand(id, data) {
    return request({ url: `/catalogue/brands/${id}`, method: 'put', data })
}
export function deleteBrand(id) {
    return request({ url: `/catalogue/brands/${id}`, method: 'delete' })
}

// Categories are a fixed set — read only.
export function listCategories() {
    return request({ url: '/catalogue/categories', method: 'get' })
}

export function listModels(params) {
    return request({ url: '/catalogue/models', method: 'get', params })
}
export function createModel(data) {
    return request({ url: '/catalogue/models', method: 'post', data })
}
export function updateModel(id, data) {
    return request({ url: `/catalogue/models/${id}`, method: 'put', data })
}
export function deleteModel(id) {
    return request({ url: `/catalogue/models/${id}`, method: 'delete' })
}

export function listQualities(params) {
    return request({ url: '/catalogue/qualities', method: 'get', params })
}
export function createQuality(data) {
    return request({ url: '/catalogue/qualities', method: 'post', data })
}
export function updateQuality(id, data) {
    return request({ url: `/catalogue/qualities/${id}`, method: 'put', data })
}
export function deleteQuality(id) {
    return request({ url: `/catalogue/qualities/${id}`, method: 'delete' })
}

// ── Products (imb_products) ─────────────────────────────────────────
// listProducts params: { brand, category, quality, model, search, page, pageSize }
export function listProducts(params) {
    return request({ url: '/catalogue/products', method: 'get', params, timeout: 30000 })
}
export function getProduct(id) {
    return request({ url: `/catalogue/products/${id}`, method: 'get' })
}
// create/update payload: { sku, productName, brandId, categoryId, qualityId, modelIds[], color }
export function createProduct(data) {
    return request({ url: '/catalogue/products', method: 'post', data })
}
export function updateProduct(id, data) {
    return request({ url: `/catalogue/products/${id}`, method: 'put', data })
}
export function deleteProduct(id) {
    return request({ url: `/catalogue/products/${id}`, method: 'delete' })
}

// ── Oz matcher ──────────────────────────────────────────────────────
// body: { lines: ResolvedLine[] }; resp: { results: MatchResult[] }
export function matchOzLines(lines) {
    return request({ url: '/catalogue/match', method: 'post', data: { lines }, timeout: 60000 })
}
