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

// Duplicate a collection (everything it carries) as a draft named
// "<title> - Copy".
export function copyCollection(id, scope) {
  return request({
    url: `${base(scope)}/copy/${id}`,
    method: 'post'
  })
}

export function deleteCollection(data, scope) {
  return request({
    url: `${base(scope)}/delete`,
    method: 'post',
    data
  })
}

// The criteria builder's vocabulary and value lists — fields, conditions,
// and the register's current values for each pick list in this scope.
export function getFilterOptions(scope) {
  return request({ url: `${base(scope)}/filter-options`, method: 'get' })
}

// "Matches N items" for a rule as it is being built: { count, sample }.
export function previewFilter(rows, scope) {
  return request({ url: `${base(scope)}/filter-preview`, method: 'post', data: { rows } })
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
