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
