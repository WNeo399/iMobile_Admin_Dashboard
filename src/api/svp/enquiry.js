import request from '@/utils/request'

// Apple SVP genuine-parts lookup enquiries (imb_svp_enquiry).

export function listSvpEnquiries(query) {
  return request({
    url: '/svpEnquiry/list',
    method: 'get',
    params: query
  })
}

// Body: { status?, adminNote? }
export function updateSvpEnquiry(id, data) {
  return request({
    url: `/svpEnquiry/${id}`,
    method: 'patch',
    data
  })
}

export function deleteSvpEnquiry(id) {
  return request({
    url: `/svpEnquiry/${id}`,
    method: 'delete'
  })
}
