import request from '@/utils/request'

// Refurbished Phones — read-only Reebelo offer data from the scraper MySQL DB.

export function getRefurbSummary(date) {
  return request({
    url: '/refurbished/summary',
    method: 'get',
    params: { date }
  })
}

export function getRefurbFilters(date) {
  return request({
    url: '/refurbished/filters',
    method: 'get',
    params: { date }
  })
}

export function getRefurbOffers(query) {
  return request({
    url: '/refurbished/offers',
    method: 'get',
    params: query
  })
}
