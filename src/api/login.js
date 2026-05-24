import request from '@/utils/request'

// Login — `username` accepts either a username or an email address
export function login(username, password) {
  const data = {
    username,
    password
  }
  return request({
    url: '/auth/login',
    headers: {
      isToken: false,
      repeatSubmit: false
    },
    method: 'post',
    data: data
  })
}

// Current user info (role, permissions, shop scope)
export function getInfo() {
  return request({
    url: '/auth/getInfo',
    method: 'get'
  })
}

// Logout
export function logout() {
  return request({
    url: '/auth/logout',
    method: 'post'
  })
}

// Change own password
export function changePassword(data) {
  return request({
    url: '/auth/changePassword',
    method: 'post',
    data
  })
}