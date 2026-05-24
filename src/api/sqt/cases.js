import request from '@/utils/request'

export function listCases(query) {
  return request({
    url: '/sqt/cases/list',
    method: 'get',
    params: query
  })
}

export function getCaseCounts(query) {
  return request({
    url: '/sqt/cases/counts',
    method: 'get',
    params: query
  })
}

export function getCase(id) {
  return request({
    url: `/sqt/cases/detail/${id}`,
    method: 'get'
  })
}

export function changeCaseStatus(id, data) {
  return request({
    url: `/sqt/cases/status/${id}`,
    method: 'post',
    data
  })
}

export function addCaseNote(id, data) {
  return request({
    url: `/sqt/cases/${id}/notes`,
    method: 'post',
    data
  })
}

export function updateCaseDevice(id, data) {
  return request({
    url: `/sqt/cases/${id}/device`,
    method: 'put',
    data
  })
}

export function sendCaseParts(id, data) {
  return request({
    url: `/sqt/cases/${id}/sendParts`,
    method: 'post',
    data
  })
}

export function markPartsReceived(id, data) {
  return request({
    url: `/sqt/cases/${id}/partsReceived`,
    method: 'post',
    data
  })
}

export function markCaseRepaired(id, data) {
  return request({
    url: `/sqt/cases/${id}/markRepaired`,
    method: 'post',
    data
  })
}

export function selectCaseParts(id, data) {
  return request({
    url: `/sqt/cases/${id}/parts`,
    method: 'post',
    data
  })
}
