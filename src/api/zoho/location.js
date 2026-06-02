import request from '@/utils/request'

// Distinct Location values present on Zoho Inventory items. Used to seed
// the location selector at the top of the Location Monitoring page.
export function listLocations() {
    return request({
        url: '/zoho/location/list',
        method: 'get',
        timeout: 30000
    })
}

// Items currently at the given Location. `search` (optional) is a
// case-insensitive substring filter applied to name + SKU server-side.
export function listItemsByLocation(params) {
    return request({
        url: '/zoho/location/items',
        method: 'get',
        params,
        timeout: 60000
    })
}

// Update a single item's Location custom field. body: { location: "..." }.
export function updateItemLocation(itemId, location) {
    return request({
        url: `/zoho/location/items/${itemId}`,
        method: 'put',
        data: { location },
        timeout: 30000
    })
}

// Resolve a Commerce SKU to its Inventory item_id + current Location
// custom-field value. Called once the user picks a product from the
// shared Commerce search (see searchProducts in @/api/zoho/products/product)
// so we can open the right location panel and auto-select the searched
// row. Two-hop Inventory lookup happens server-side.
export function getProductLocation(sku) {
    return request({
        url: '/zoho/location/productLocation',
        method: 'get',
        params: { sku },
        timeout: 30000
    })
}
