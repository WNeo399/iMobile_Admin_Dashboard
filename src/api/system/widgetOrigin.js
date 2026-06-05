import request from '@/utils/request'

// Paginated list of widget-origin allowlist entries for the
// System → Widget Origins admin page. `params` accepts
// { widget, search, page, pageSize }. Returns the data array plus
// `widgets` — the distinct widget names currently in the collection
// — so the page's filter dropdown can render them without a second
// round trip.
export function listWidgetOrigins(params) {
    return request({
        url: '/widgetOrigin/list',
        method: 'get',
        params,
        timeout: 30000
    })
}

// Create a new allowlist entry. `data` is
// { widget, origin, label?, enabled? }. Backend normalises the
// origin (URL.origin form) before insert and rejects with 409 if
// the (widget, origin) pair already exists.
export function createWidgetOrigin(data) {
    return request({
        url: '/widgetOrigin',
        method: 'post',
        data,
        timeout: 30000
    })
}

// Update an existing entry. `data` accepts any subset of
// { origin, label, enabled }. widget is immutable server-side.
export function updateWidgetOrigin(id, data) {
    return request({
        url: `/widgetOrigin/${id}`,
        method: 'patch',
        data,
        timeout: 30000
    })
}

export function deleteWidgetOrigin(id) {
    return request({
        url: `/widgetOrigin/${id}`,
        method: 'delete',
        timeout: 30000
    })
}
