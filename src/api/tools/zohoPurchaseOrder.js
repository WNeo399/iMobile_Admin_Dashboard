import request from '@/utils/request'

// Create a draft Zoho Inventory purchase order from the Tools page's Create
// Purchase Order tool. Body: { lineItems: [{ itemId, quantity }], notes?,
// vendorId? } — without a vendorId the order sits under "Vendor Placeholder"
// until staff re-assign it in Zoho.
export function createZohoPurchaseOrder(data) {
    return request({
        url: '/zoho/purchaseOrder/create',
        method: 'post',
        data,
        timeout: 30000
    })
}
