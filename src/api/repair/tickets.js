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

// Single-ticket detail for the dialog. Backend surfaces RepairDesk's
// "No Result Found" as a 404.
export function getRepairTicketDetail(id) {
    return request({
        url: `/repair/tickets/${id}`,
        method: 'get',
        timeout: 30000
    })
}
