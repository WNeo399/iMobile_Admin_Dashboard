import request from '@/utils/request'

export function getProductDetail(id) {
  return request({
    url: `/zoho/product/getProductDetail/${id}`,
    method: 'get',
  })
}