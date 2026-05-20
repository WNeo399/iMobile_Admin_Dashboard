import request from '@/utils/request'

export function listModels(query) {
  return request({
    url: '/sqt/models/list',
    method: 'get',
    params: query
  })
}

export function listBrands() {
  return request({
    url: '/sqt/models/brands',
    method: 'get'
  })
}

export function getModel(id) {
  return request({
    url: `/sqt/models/detail/${id}`,
    method: 'get'
  })
}

export function createModel(data) {
  return request({
    url: '/sqt/models/create',
    method: 'post',
    data
  })
}

export function updateModel(id, data) {
  return request({
    url: `/sqt/models/update/${id}`,
    method: 'put',
    data
  })
}

export function deleteModel(id) {
  return request({
    url: '/sqt/models/delete',
    method: 'post',
    data: { id }
  })
}
