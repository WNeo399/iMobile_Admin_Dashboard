import request from '@/utils/request'

export function listQualities() {
  return request({
    url: '/sqt/qualities/list',
    method: 'get'
  })
}
