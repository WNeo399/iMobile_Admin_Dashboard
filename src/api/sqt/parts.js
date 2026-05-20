import request from '@/utils/request'

export function listParts(modelId) {
  return request({
    url: `/sqt/models/${modelId}/parts`,
    method: 'get'
  })
}

export function createPart(modelId, data) {
  return request({
    url: `/sqt/models/${modelId}/parts`,
    method: 'post',
    data
  })
}

export function updatePart(modelId, partId, data) {
  return request({
    url: `/sqt/models/${modelId}/parts/${partId}`,
    method: 'put',
    data
  })
}

export function deletePart(modelId, partId) {
  return request({
    url: `/sqt/models/${modelId}/parts/${partId}`,
    method: 'delete'
  })
}
