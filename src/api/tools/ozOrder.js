import request from '@/utils/request'

// Bulk-resolve catalogue SKUs to Zoho Inventory item_ids in one round
// trip (exact match). Body: { skus: [...] }; resp:
// { success, data: { '<sku>': { itemId, sku } | null } }.
export function bulkSkuLookup(skus) {
    return request({
        url: '/zoho/product/skuLookupBulk',
        method: 'post',
        data: { skus },
        timeout: 60000
    })
}

// Create the Zoho sales order. Reuses the same standalone endpoint the
// Buzztech / Create Sales Order tools use, so there's one source of
// truth for how SOs are placed. Body:
//   { customerId, priceListId, lineItems: [{ itemId, quantity }], notes? }
export function createSalesOrder(data) {
    return request({
        url: '/zoho/salesOrder/create',
        method: 'post',
        data,
        timeout: 60000
    })
}

// Attach a file (the generated label PDF) to an existing Zoho sales
// order. `formData` carries `salesOrderId` + `file`. Same endpoint +
// Content-Type override the Buzztech attach uses.
export function attachToSalesOrder(formData) {
    return request({
        url: '/zoho/salesOrder/attach',
        method: 'post',
        data: formData,
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000
    })
}
