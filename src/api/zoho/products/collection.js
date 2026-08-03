import request from '@/utils/request'

// Collection management serves two separate data sets with identical
// functionality: the Spare Parts set (default) and the Accessories set.
// Every function takes an optional trailing `scope` — pass 'accessories'
// to hit the accessory endpoints; omit it for the original behaviour.
function base(scope) {
  return scope === 'accessories'
    ? '/zoho/product/accessoryCollections'
    : '/zoho/product/collections'
}

/**
 * Create collection
 */
export function createCollection(data, scope) {
  return request({
    url: `${base(scope)}/create`,
    method: 'post',
    data
  })
}

/**
 * Update collection
 */
export function updateCollection(id, data, scope) {
  return request({
    url: `${base(scope)}/update/${id}`,
    method: 'put',
    data
  })
}

/**
 * Get collection list
 */
export function getCollectionList(query, scope) {
  return request({
    url: `${base(scope)}/list`,
    method: 'get',
    params: query
  })
}

/**
 * Get collection detail
 */
export function getCollectionDetail(id, scope) {
  return request({
    url: `${base(scope)}/detail/${id}`,
    method: 'get'
  })
}

export function deleteCollection(data, scope) {
  return request({
    url: `${base(scope)}/delete`,
    method: 'post',
    data
  })
}

export function getCollectionGroups(scope) {
  return request({
    url: `${base(scope)}/getGroup`,
    method: 'get'
  })
}

export function updateCollectionGroups(data, scope) {
  return request({
    url: `${base(scope)}/updateGroup`,
    method: 'post',
    data
  })
}
