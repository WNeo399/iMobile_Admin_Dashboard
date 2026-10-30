import request from '@/utils/request'

// Spare Parts Purchase — the in-app purchase process (orders SP-…, shipment
// batches PB-…). Backend: routes/sparePartsPurchaseRoutes.

const BASE = '/sparePartsPurchase'
// A FormData body goes as multipart: the shared JSON Content-Type default
// (utils/request) makes axios turn it into JSON — the photo files dropped
// (Listing's Create / drafts / Edit photos sent none until 2026-10-30).
const asForm = data => (data instanceof FormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {})

// The pick lists: categories and the 供应商 options.
export function getMeta() {
  return request({ url: `${BASE}/meta`, method: 'get' })
}

// ── Orders ───────────────────────────────────────────────────────────
export function listOrders(params) {
  return request({ url: `${BASE}/orders`, method: 'get', params })
}
export function getOrder(id) {
  return request({ url: `${BASE}/orders/${id}`, method: 'get' })
}
// lines: [{ itemId, sku, productName, imageId, category, orderQty, note }]
export function createOrders(lines) {
  return request({ url: `${BASE}/orders`, method: 'post', data: { lines } })
}
// note any time; orderQty / category while pending
export function updateOrder(id, data) {
  return request({ url: `${BASE}/orders/${id}`, method: 'put', data })
}
// { unitPrice, toConfirm?, note? } — with toConfirm the line parks in To Confirm
export function quoteOrder(id, data) {
  return request({ url: `${BASE}/orders/${id}/quote`, method: 'post', data })
}
// 待确认: parked for a decision, the note says what needs confirming
export function toConfirmOrder(id, note) {
  return request({ url: `${BASE}/orders/${id}/to-confirm`, method: 'post', data: { note } })
}
// decision made: back to where the line came from
export function confirmOrder(id, note) {
  return request({ url: `${BASE}/orders/${id}/confirm`, method: 'post', data: { note } })
}
export function placeOrder(id, data) {
  return request({ url: `${BASE}/orders/${id}/place`, method: 'post', data })
}
// Device Brand / Series per item id, for the part labels' short names.
export function deviceTerms(itemIds) {
  return request({ url: `${BASE}/device-terms`, method: 'post', data: { itemIds } })
}
// An ordered line's unit price, changed inline on the Purchase Order page.
export function priceOrder(id, unitPrice) {
  return request({ url: `${BASE}/orders/${id}/price`, method: 'post', data: { unitPrice } })
}
// ── Order batches (下单批次) ─────────────────────────────────────────
export function listOrderBatches(params) {
  return request({ url: `${BASE}/order-batches`, method: 'get', params })
}
export function getOrderBatch(id) {
  return request({ url: `${BASE}/order-batches/${id}`, method: 'get' })
}
// { supplier, note, orderIds } — saved as a DRAFT: the lines stay pending
// until the batch is confirmed.
export function createOrderBatch(data) {
  return request({ url: `${BASE}/order-batches`, method: 'post', data })
}
// Edit a draft: { supplier?, note?, orderIds? }
export function updateOrderBatch(id, data) {
  return request({ url: `${BASE}/order-batches/${id}`, method: 'put', data })
}
// Confirm a draft (optionally with the form's latest supplier / note /
// orderIds): the lines are placed with the supplier, the OB number issued.
export function confirmOrderBatch(id, data) {
  return request({ url: `${BASE}/order-batches/${id}/confirm`, method: 'post', data: data || {} })
}
export function discardOrderBatch(id) {
  return request({ url: `${BASE}/order-batches/${id}`, method: 'delete' })
}
// { lines: [{ orderId, unitPrice }] } — the supplier's prices onto the lines
export function priceOrderBatch(id, data) {
  return request({ url: `${BASE}/order-batches/${id}/prices`, method: 'put', data })
}
export function shortageOrder(id, note) {
  return request({ url: `${BASE}/orders/${id}/shortage`, method: 'post', data: { note } })
}
export function cancelOrder(id, note) {
  return request({ url: `${BASE}/orders/${id}/cancel`, method: 'post', data: { note } })
}
export function reopenOrder(id) {
  return request({ url: `${BASE}/orders/${id}/reopen`, method: 'post' })
}
// a line sent and received outside the system closes as received, no batch (2026-10-13)
export function completeOrder(id, data) {
  return request({ url: `${BASE}/orders/${id}/complete`, method: 'post', data })
}
// Photos on a line (field "image", one per call) — mostly New Product /
// Special Order lines, which have no Zoho item picture.
export function uploadOrderImage(id, formData) {
  return request({ url: `${BASE}/orders/${id}/images`, method: 'post', data: formData, headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 })
}
export function deleteOrderImage(id, imageId) {
  return request({ url: `${BASE}/orders/${id}/images/${imageId}`, method: 'delete' })
}
// Scan-to-batch: the oldest waiting line for a SKU, skipping `exclude` ids.
// `freight` ('sea' | 'air'): only lines a batch of that kind takes
export function lookupOrder(sku, exclude, freight) {
  return request({ url: `${BASE}/orders/lookup`, method: 'get', params: { sku, exclude: (exclude || []).join(','), freight } })
}
// The ordered / pending lines waiting to ship (the batch picker).
export function openLines(search, freight) {
  return request({ url: `${BASE}/orders/open-lines`, method: 'get', params: { search, freight } })
}
// Live parts from the stock register, by name or SKU.
export function searchProducts(q) {
  return request({ url: `${BASE}/products/search`, method: 'get', params: { q } })
}
export function purchasesByItemIds(itemIds) {
  return request({ url: `${BASE}/byItemIds`, method: 'post', data: { itemIds } })
}

// ── Batches ──────────────────────────────────────────────────────────
export function listBatches(params) {
  return request({ url: `${BASE}/batches`, method: 'get', params })
}
export function getBatch(idOrNo) {
  return request({ url: `${BASE}/batches/${idOrNo}`, method: 'get' })
}
// { tracking, shippedAt (YYYY-MM-DD), note, shippingCost (¥, optional), lines: [{ orderId, qty, supplier, unitPrice }] }
// — ships straight away; with draft: true it is saved as a draft instead.
export function createBatch(data) {
  return request({ url: `${BASE}/batches`, method: 'post', data, timeout: 90000 })
}
export function updateBatchDraft(id, data) {
  return request({ url: `${BASE}/batches/${id}/draft`, method: 'put', data })
}
export function shipBatchDraft(id, data) {
  return request({ url: `${BASE}/batches/${id}/ship`, method: 'post', data, timeout: 90000 })
}
export function discardBatchDraft(id) {
  return request({ url: `${BASE}/batches/${id}`, method: 'delete' })
}

// ── New Products: the models we want parts for, and creating the missing
// Zoho items (routes/sparePartsPurchaseRoutes/newProducts.js) ──────────
export function listNewProducts(params) {
  return request({ url: `${BASE}/new-products`, method: 'get', params })
}
export function addNewProductModel(data) {
  return request({ url: `${BASE}/new-products/models`, method: 'post', data })
}
export function updateNewProductModel(id, data) {
  return request({ url: `${BASE}/new-products/models/${id}`, method: 'put', data })
}
// Add Model's Model list: the models Zoho has parts for in a brand + series, not on the page yet
export function newProductModelOptions(brand, series) {
  return request({ url: `${BASE}/new-products/model-options`, method: 'get', params: { brand, series } })
}
// one model's items, every classification ({ model, items, missing })
export function newProductModelItems(id) {
  return request({ url: `${BASE}/new-products/models/${id}/items`, method: 'get' })
}
// A New Product line on the Purchase Order page → a Zoho item: the dialog's
// pick lists (?brand= adds that brand's series and models), and the create
// (FormData: fields, JSON lists, photo order + new photos)
export function getZohoItemOptions(params) {
  return request({ url: `${BASE}/zoho-item/options`, method: 'get', params })
}
// the store categories (Zoho Commerce) for its Category picker
export function getZohoItemCategories(refresh) {
  return request({ url: `${BASE}/zoho-item/categories`, method: 'get', params: refresh ? { refresh: 1 } : {}, timeout: 60000 })
}
export function createZohoItemForOrder(id, data) {
  return request({ url: `${BASE}/orders/${id}/zoho-item`, method: 'post', data, timeout: 120000, ...asForm(data) })
}
// Drafts of the create dialog (kept in our DB, not in Zoho until submitted);
// save / update take FormData (fields, JSON prices / compatibleModels / order, photos)
export function saveNewProductDraft(data) {
  return request({ url: `${BASE}/new-products/drafts`, method: 'post', data, timeout: 120000, ...asForm(data) })
}
export function updateNewProductDraft(id, data) {
  return request({ url: `${BASE}/new-products/drafts/${id}`, method: 'put', data, timeout: 120000, ...asForm(data) })
}
export function getNewProductDraft(id) {
  return request({ url: `${BASE}/new-products/drafts/${id}`, method: 'get' })
}
export function deleteNewProductDraft(id) {
  return request({ url: `${BASE}/new-products/drafts/${id}`, method: 'delete' })
}
// the next free parts SKU (22xxx), checked in Zoho
export function nextNewProductSku() {
  return request({ url: `${BASE}/new-products/next-sku`, method: 'get', timeout: 30000 })
}
// the store categories (Zoho Commerce) a new item can be filed under
export function newProductCategories(refresh) {
  return request({ url: `${BASE}/new-products/categories`, method: 'get', params: refresh ? { refresh: 1 } : {}, timeout: 60000 })
}
// { modelId, part, cost, categoryId, name, sku, quality, rate, prices, compatibleModels }
// → one Zoho Inventory item; a FormData with "images" also uploads its photos
export function createNewProductItem(data) {
  return request({ url: `${BASE}/new-products/items`, method: 'post', data, timeout: 120000, ...asForm(data) })
}
// an existing item (the Edit dialog): read live from Zoho, change it (only
// the fields sent: name, quality, classification, subClassification,
// categoryId, compatibleModels, rate), its photos (FormData: "images" = new
// files, "order" = JSON ["d:<document id>" | "n:<i>"] — the first is the main image)
export function getNewProductItem(itemId) {
  return request({ url: `${BASE}/new-products/items/${itemId}`, method: 'get', timeout: 30000 })
}
export function updateNewProductItem(itemId, data) {
  return request({ url: `${BASE}/new-products/items/${itemId}`, method: 'put', data, timeout: 60000, ...asForm(data) })
}
// more variants for an existing product (2026-10-30) — FormData: variants
// (JSON [{ name }]), itemVariant (the item's own title, for a single
// product), photoVariants (JSON, one per file) + images
export function addNewProductVariants(itemId, data) {
  return request({ url: `${BASE}/new-products/items/${itemId}/variants`, method: 'post', data, timeout: 180000, ...asForm(data) })
}
export function saveNewProductItemPhotos(itemId, data) {
  return request({ url: `${BASE}/new-products/items/${itemId}/photos`, method: 'post', data, timeout: 120000, ...asForm(data) })
}
// what the product dialog needs around an item (brand = a Device Brand):
// naming facts, the brand's models, qualities, classifications, formulas
export function getNewProductEditContext(brand) {
  return request({ url: `${BASE}/new-products/edit-context`, method: 'get', params: { brand } })
}

// Listing → New Products (2026-10-21): every product created in the
// dashboard (search, reviewed=yes|no|changed, by, brand, issues=1, page,
// pageSize), and the Reviewed tick for some of them.
export function listNewItems(params) {
  return request({ url: `${BASE}/new-items`, method: 'get', params, timeout: 60000 })
}
export function reviewNewItems(itemIds, reviewed) {
  return request({ url: `${BASE}/new-items/review`, method: 'post', data: { itemIds, reviewed } })
}
export function updateBatch(id, data) {
  return request({ url: `${BASE}/batches/${id}`, method: 'put', data })
}
// { receivedAt (YYYY-MM-DD), note, lines: [{ orderId, receivedQty }] }
export function receiveBatch(id, data) {
  return request({ url: `${BASE}/batches/${id}/receive`, method: 'post', data })
}
export function cancelBatch(id) {
  return request({ url: `${BASE}/batches/${id}/cancel`, method: 'post' })
}
// Create the Zoho Inventory PO(s) a batch is still missing.
export function retryBatchZoho(id) {
  return request({ url: `${BASE}/batches/${id}/zoho`, method: 'post', timeout: 60000 })
}
