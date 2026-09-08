import request from '@/utils/request'

export function listShops(query) {
  return request({
    url: '/sqt/shops/list',
    method: 'get',
    params: query
  })
}

export function getShop(id) {
  return request({
    url: `/sqt/shops/detail/${id}`,
    method: 'get'
  })
}

export function createShop(data) {
  return request({
    url: '/sqt/shops/create',
    method: 'post',
    data
  })
}

export function updateShop(id, data) {
  return request({
    url: `/sqt/shops/update/${id}`,
    method: 'put',
    data
  })
}

export function deleteShop(id) {
  return request({
    url: '/sqt/shops/delete',
    method: 'post',
    data: { id }
  })
}

// ── Shop Groups — shops that belong together, one group per shop ──────
export function listShopGroups() {
  return request({ url: '/sqt/shops/groups/list', method: 'get' })
}

export function createShopGroup(data) {
  return request({ url: '/sqt/shops/groups/create', method: 'post', data })
}

export function updateShopGroup(id, data) {
  return request({ url: `/sqt/shops/groups/update/${id}`, method: 'put', data })
}

export function deleteShopGroup(id) {
  return request({ url: '/sqt/shops/groups/delete', method: 'post', data: { id } })
}

// Adds every shop in the group to a Repair Shop Owner's shop list
// (deduped — safe to run again after the group grows).
export function linkShopGroupOwner(id, userId) {
  return request({ url: `/sqt/shops/groups/${id}/link-owner`, method: 'post', data: { userId } })
}
