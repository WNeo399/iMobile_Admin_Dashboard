import request from '@/utils/request'

// Fetch every iMobile RepairDesk ticket — backend returns them pre-grouped
// into { pending, inProgress, onHold, overDue, repaired, fullfilled,
// notYetRecive } with repaired_date already stamped on repaired tickets.
// Single round trip; the page caches the result and groups via the tree.
export function listRepairTickets() {
    return request({
        url: '/repair/tickets',
        method: 'get',
        // Generous timeout — the backend walks the RepairDesk pagination
        // and pulls invoices, which can take 10–20s on a cold cache.
        timeout: 60000
    })
}

// A ticket-number search over every RepairDesk ticket (the list above only
// holds the saved filter's 60-day window) — same { ticketGrouped } shape.
export function searchRepairTickets(q) {
    return request({
        url: '/repair/tickets/search',
        method: 'get',
        params: { q },
        timeout: 30000
    })
}

// Single-ticket detail for the dialog. Backend surfaces RepairDesk's
// "No Result Found" as a 404.
export function getRepairTicketDetail(id) {
    return request({
        url: `/repair/tickets/${id}`,
        method: 'get',
        timeout: 30000
    })
}

// The statuses a ticket can be set to — [{ name, type, color }], one per name.
export function listRepairStatuses() {
    return request({
        url: '/repair/statuses',
        method: 'get',
        timeout: 30000
    })
}

// Add a note to a RepairDesk ticket — { note, type: 'internal' | 'diagnostic',
// deviceId (one device line, optional), flag }. Answers { note }.
export function addRepairTicketNote(id, data) {
    return request({
        url: `/repair/tickets/${id}/notes`,
        method: 'post',
        data,
        timeout: 30000
    })
}

// Set a ticket's status in RepairDesk: every device line, or only deviceIds.
// Answers { changed, failed, noteAdded, group, ticket } — the ticket re-read
// from RepairDesk in the list's shape and the status group it now falls in.
export function setRepairTicketStatus(id, status, deviceIds) {
    return request({
        url: `/repair/tickets/${id}/status`,
        method: 'post',
        data: deviceIds ? { status, deviceIds } : { status },
        timeout: 60000
    })
}
