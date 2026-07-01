import request from '@/utils/request'

// Per-user in-app notifications (bell + toast).

export function getUnreadCount() {
  return request({
    url: '/notifications/unreadCount',
    method: 'get'
  })
}

export function getTopNotifications(limit) {
  return request({
    url: '/notifications/top',
    method: 'get',
    params: { limit }
  })
}

export function listNotifications(query) {
  return request({
    url: '/notifications',
    method: 'get',
    params: query
  })
}

export function markNotificationRead(id) {
  return request({
    url: `/notifications/${id}/read`,
    method: 'post'
  })
}

export function markAllNotificationsRead() {
  return request({
    url: '/notifications/readAll',
    method: 'post'
  })
}
