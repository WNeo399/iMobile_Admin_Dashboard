import request from "@/utils/request";

export function listCases(query) {
  return request({
    url: "/sqt/cases/list",
    method: "get",
    params: query,
  });
}

// Attach a file (the generated URGENT label PDF) to a Zoho sales
// order created by Send Parts. `formData` carries `salesOrderId` +
// `file`. Same endpoint the Buzztech / Oz tools use; Content-Type is
// overridden so the shared JSON default doesn't clobber the multipart
// boundary.
export function attachCaseOrderFile(formData) {
  return request({
    url: "/zoho/salesOrder/attach",
    method: "post",
    data: formData,
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 60000,
  });
}

export function getCaseCounts(query) {
  return request({
    url: "/sqt/cases/counts",
    method: "get",
    params: query,
  });
}

export function getCase(id) {
  return request({
    url: `/sqt/cases/detail/${id}`,
    method: "get",
  });
}

export function changeCaseStatus(id, data) {
  return request({
    url: `/sqt/cases/status/${id}`,
    method: "post",
    data,
  });
}

export function addCaseNote(id, data) {
  return request({
    url: `/sqt/cases/${id}/notes`,
    method: "post",
    data,
  });
}

export function updateCaseDevice(id, data) {
  return request({
    url: `/sqt/cases/${id}/device`,
    method: "put",
    data,
  });
}

export function sendCaseParts(id, data) {
  return request({
    url: `/sqt/cases/${id}/sendParts`,
    method: "post",
    data,
  });
}

export function markPartsReceived(id, data) {
  return request({
    url: `/sqt/cases/${id}/partsReceived`,
    method: "post",
    data,
  });
}

export function markCaseRepaired(id, data) {
  return request({
    url: `/sqt/cases/${id}/markRepaired`,
    method: "post",
    data,
  });
}

export function selectCaseParts(id, data) {
  return request({
    url: `/sqt/cases/${id}/parts`,
    method: "post",
    data,
  });
}
