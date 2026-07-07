import request from '@/utils/request'

// "Ask the Data" — agentic Claude chat over the scraper MySQL.
// `messages` is the text-only thread: [{ role: 'user'|'assistant', content }].
// The agentic loop can take a while, so allow a generous timeout.
export function askData(messages) {
  return request({
    url: '/aiQuery/ask',
    method: 'post',
    data: { messages },
    timeout: 120000
  })
}
