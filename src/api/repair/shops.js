import request from '@/utils/request'

// iMobile Repair → Shops: RepairDesk customers (shops) grouped under one
// customer — [{ id, name, customers: [{ id, name, organization }] }], A–Z.
export function listShopGroups() {
    return request({ url: '/repair/shops', method: 'get' })
}

// RepairDesk's customer search (name, phone, email, organization) for the
// group dialog — [{ id, name, organization, phone, email, tickets, group }]
export function searchRepairCustomers(q) {
    return request({ url: '/repair/shops/customers', method: 'get', params: { q }, timeout: 30000 })
}

export function createShopGroup(data) {
    return request({ url: '/repair/shops', method: 'post', data })
}

export function updateShopGroup(id, data) {
    return request({ url: `/repair/shops/${id}`, method: 'put', data })
}

// the group only — RepairDesk is untouched
export function deleteShopGroup(id) {
    return request({ url: `/repair/shops/${id}`, method: 'delete' })
}
