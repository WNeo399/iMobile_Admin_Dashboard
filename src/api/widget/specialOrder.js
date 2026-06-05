import request from '@/utils/request'

// Paginated list of widget special-order submissions for the
// /imobile/specialOrder review page. `params` accepts
// { status, search, page, pageSize }. Returns the data array plus a
// `counts` rollup so the tree-panel badges can render without a
// second round trip — same shape as the credit-note list endpoint.
export function listSpecialOrders(params) {
    return request({
        url: '/specialOrder/list',
        method: 'get',
        params,
        timeout: 30000
    })
}

// Update a special order — currently only the status. `data` is
// { status: 'new' | 'reviewed' | 'fulfilled' | 'rejected' }. Backend
// returns the updated row so the caller can patch its local cache
// without a refetch.
export function updateSpecialOrder(id, data) {
    return request({
        url: `/specialOrder/${id}`,
        method: 'patch',
        data,
        timeout: 30000
    })
}
