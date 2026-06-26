import request from '@/utils/request'

// Apple SVP genuine-serial list (imb_svp_serials).

export function getSvpSerialStats() {
  return request({
    url: '/svpSerial/stats',
    method: 'get'
  })
}

// Body: { serials: string[], mode: 'replace' | 'merge' }
export function importSvpSerials(data) {
  return request({
    url: '/svpSerial/import',
    method: 'post',
    data,
    timeout: 120000
  })
}

export function checkSvpSerial(serial) {
  return request({
    url: '/svpSerial/check',
    method: 'get',
    params: { serial }
  })
}

// Serials checked on the admin page that weren't on record (for CSV download).
export function getSvpSerialMisses() {
  return request({
    url: '/svpSerial/misses',
    method: 'get'
  })
}

export function clearSvpSerialMisses() {
  return request({
    url: '/svpSerial/misses',
    method: 'delete'
  })
}
