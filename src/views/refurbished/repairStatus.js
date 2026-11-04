// The repair status of a Pending Stock device and of its repair batch
// (2026-11-04; backend routes/refurbishedRoutes/precheckRepair.js). Labels go
// through $tp: To process 待处理, In repair 已分配, Processed 已处理,
// In progress 处理中. A record with no status yet is waiting (待处理).
export const DEVICE_STATUS = {
    pending: { label: 'To process', type: 'info' },
    assigned: { label: 'In repair', type: 'warning' },
    done: { label: 'Processed', type: 'success' }
}
export const deviceStatus = row => (row && DEVICE_STATUS[row.status] ? row.status : 'pending')

export const BATCH_STATUS = {
    open: { label: 'In progress', type: 'warning' },
    done: { label: 'Processed', type: 'success' },
    empty: { label: 'Empty', type: 'info' }
}

export function fmtWhen(v) {
    if (!v) return '—'
    const d = new Date(v)
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
}
