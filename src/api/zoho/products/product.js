import request from '@/utils/request'

export function getProductDetail(id) {
  return request({
    url: `/zoho/product/getProductDetail/${id}`,
    method: 'get',
  })
}

export function searchProducts(keyword) {
  return request({
    url: '/zoho/product/searchProduct',
    method: 'get',
    params: { keyword }
  })
}