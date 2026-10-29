import request from '@/utils/request'

// SQT → Need Attention: SquareTrade follow-up emails, read from the
// Hostinger mailbox and answered from the dashboard. Backend
// routes/sqtRoutes/caseEmails.

// params: { tab: 'open' | 'replied' | 'handled' | 'unmatched', q, page, pageSize }
export function listAttention(params) {
  return request({ url: '/sqt/case-emails/attention', method: 'get', params })
}
export function getAttentionCounts() {
  return request({ url: '/sqt/case-emails/counts', method: 'get' })
}
// { [sqtCaseId]: open email count } for the Cases page badge
export function getOpenEmailCounts(ids) {
  return request({ url: '/sqt/case-emails/open-counts', method: 'get', params: { ids: ids.join(',') } })
}
export function getCaseEmails(sqtCaseId) {
  return request({ url: `/sqt/case-emails/case/${sqtCaseId}`, method: 'get' })
}
export function getEmailContent(emailId) {
  return request({ url: `/sqt/case-emails/${emailId}/content`, method: 'get', timeout: 60000 })
}
export function downloadEmailAttachment(emailId, index) {
  return request({ url: `/sqt/case-emails/${emailId}/attachments/${index}`, method: 'get', responseType: 'blob', timeout: 120000 })
}
// the request the case was created from (no pointer record of its own)
export function getOriginalContent(sqtCaseId) {
  return request({ url: `/sqt/case-emails/case/${sqtCaseId}/original/content`, method: 'get', timeout: 60000 })
}
export function downloadOriginalAttachment(sqtCaseId, index) {
  return request({ url: `/sqt/case-emails/case/${sqtCaseId}/original/attachments/${index}`, method: 'get', responseType: 'blob', timeout: 120000 })
}
// formData: to, cc (JSON arrays), subject, body, replyToEmailId, includeQuote, files[]
export function replyToCaseEmail(sqtCaseId, formData) {
  return request({
    url: `/sqt/case-emails/case/${sqtCaseId}/reply`,
    method: 'post',
    data: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000
  })
}
export function markCaseEmailsHandled(sqtCaseId, note) {
  return request({ url: `/sqt/case-emails/case/${sqtCaseId}/handled`, method: 'post', data: { note } })
}
export function markEmailHandled(emailId, note) {
  return request({ url: `/sqt/case-emails/${emailId}/handled`, method: 'post', data: { note } })
}
export function reopenEmail(emailId) {
  return request({ url: `/sqt/case-emails/${emailId}/reopen`, method: 'post' })
}
export function linkEmailToCase(emailId, caseRef) {
  return request({ url: `/sqt/case-emails/${emailId}/link`, method: 'post', data: { caseRef } })
}
