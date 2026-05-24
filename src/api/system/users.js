import request from '@/utils/request'

export function listUsers(query) {
  return request({
    url: '/users/list',
    method: 'get',
    params: query
  })
}

export function getUser(id) {
  return request({
    url: `/users/detail/${id}`,
    method: 'get'
  })
}

export function listRoles() {
  return request({
    url: '/users/roles',
    method: 'get'
  })
}

export function createUser(data) {
  return request({
    url: '/users/create',
    method: 'post',
    data
  })
}

export function updateUser(id, data) {
  return request({
    url: `/users/update/${id}`,
    method: 'put',
    data
  })
}

export function resetUserPassword(id, password) {
  return request({
    url: '/users/resetPassword',
    method: 'post',
    data: { id, password }
  })
}

export function deleteUser(id) {
  return request({
    url: '/users/delete',
    method: 'post',
    data: { id }
  })
}
