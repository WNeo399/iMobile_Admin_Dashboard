// Shared label / colour map for SQT case statuses, used by every home page that
// renders a status pill. Mirrors the backend VALID_STATUSES.

export const STATUS_LABELS = {
    'on-hold': 'On Hold',
    pending: 'Pending',
    'waiting-for-parts': 'Waiting for Parts',
    'parts-arrived': 'Parts Arrived',
    'waiting-for-drop-off': 'Awaiting Drop-Off',
    repairing: 'Repairing',
    repaired: 'Repaired',
    'repaired-and-collected': 'Collected',
    'waiting-solvup': 'Waiting Solvup',
    unrepairable: 'Unrepairable',
    ber: 'BER',
    completed: 'Completed',
    cancelled: 'Cancelled'
}

// Element UI tag types — kept narrow so the palette stays readable.
export const STATUS_TAG_TYPES = {
    'on-hold': 'warning',
    pending: 'info',
    'waiting-for-parts': 'warning',
    'parts-arrived': 'warning',
    'waiting-for-drop-off': 'warning',
    repairing: 'primary',
    repaired: 'success',
    'repaired-and-collected': 'success',
    'waiting-solvup': 'warning',
    unrepairable: 'danger',
    ber: 'danger',
    completed: 'success',
    cancelled: 'info'
}

export function statusLabel(s) {
    return STATUS_LABELS[s] || s || '—'
}

export function statusTag(s) {
    return STATUS_TAG_TYPES[s] || 'info'
}
