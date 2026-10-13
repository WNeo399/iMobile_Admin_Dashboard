import request from '@/utils/request'

// SQT → Call Center: the cases still to phone, the customer's details,
// mark as contacted, notes. Backend routes/sqtRoutes/callCenter.

// params: { tab: 'todo' | 'contacted' | 'all', q, page, pageSize }
export function listCallCenterCases(params) {
  return request({ url: '/sqt/call-center/cases', method: 'get', params })
}
export function getCallCenterCase(id) {
  return request({ url: `/sqt/call-center/cases/${id}`, method: 'get' })
}
export function markCaseContacted(id, note) {
  return request({ url: `/sqt/call-center/cases/${id}/contacted`, method: 'post', data: { note } })
}
export function unmarkCaseContacted(id) {
  return request({ url: `/sqt/call-center/cases/${id}/uncontacted`, method: 'post' })
}
export function markCaseNoCall(id, note) {
  return request({ url: `/sqt/call-center/cases/${id}/no-call`, method: 'post', data: { note } })
}
export function addCallCenterNote(id, text) {
  return request({ url: `/sqt/call-center/cases/${id}/notes`, method: 'post', data: { text } })
}
