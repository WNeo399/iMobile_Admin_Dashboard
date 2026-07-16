import request from '@/utils/request'

// AI Agent knowledge-base skills — admin-authored guidance the agent consults.
export function listAiSkills() {
  return request({ url: '/aiQuery/skills', method: 'get' })
}
export function createAiSkill(data) {
  return request({ url: '/aiQuery/skills', method: 'post', data })
}
export function updateAiSkill(id, data) {
  return request({ url: '/aiQuery/skills/' + id, method: 'put', data })
}
export function deleteAiSkill(id) {
  return request({ url: '/aiQuery/skills/' + id, method: 'delete' })
}
