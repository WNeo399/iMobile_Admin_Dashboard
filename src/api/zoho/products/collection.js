import request from '@/utils/request'

/**
 * Create collection
 */
export function createCollection(data) {
  return request({
    url: '/zoho/product/collections/create',
    method: 'post',
    data
  })
}

/**
 * Update collection
 */
export function updateCollection(id, data) {
  return request({
    url: `/zoho/product/collections/update/${id}`,
    method: 'put',
    data
  })
}

/**
 * Get collection list
 */
export function getCollectionList(query) {
  return request({
    url: '/zoho/product/collections/list',
    method: 'get',
    params: query
  })
}

/**
 * Get collection detail
 */
export function getCollectionDetail(id) {
  return request({
    url: `/zoho/product/collections/detail/${id}`,
    method: 'get'
  })
}

export function deleteCollection(data){
  return request({
    url: '/zoho/product/collections/delete',
    method: 'post',
    data
  })
  
}

export function getCollectionGroups() {
  return request({
    url: '/zoho/product/collections/getGroup',
    method: 'get'
  })
}

export function updateCollectionGroups(data) {
  return request({
    url: '/zoho/product/collections/updateGroup',
    method: 'post',
    data
  })
}