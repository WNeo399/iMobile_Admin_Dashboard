// The collection-group tree (productCollectionsGroups / accessoryCollectionsGroups)
// keeps a category's contents in two lists — `collections` (collection copies)
// and `children` (sub-folders) — which the tree menus and the server read.
// Their display order, mixed, lives in `order` (ids), written by Manage
// Category; so a collection can sit between two folders.

// A folder carries its own lists (its id starts with "cat-"); a collection
// carries a filter / rules. `entries` is the dialog's working list.
export function isFolderEntry(x) {
    return !!x && typeof x === 'object' && (
        Array.isArray(x.entries) ||
        String(x._id || '').startsWith('cat-') ||
        (Array.isArray(x.collections) && !x.type && !x.filter && !x.rules)
    )
}

// A category's collections and sub-folders in display order. Entries `order`
// does not know (added since, e.g. from the tree menu) follow, in their
// stored order, collections first.
export function orderedEntries(cat) {
    const all = [...((cat && cat.collections) || []), ...((cat && cat.children) || [])]
    const order = Array.isArray(cat && cat.order) ? cat.order.map(String) : []
    if (!order.length) return all
    const pos = new Map(order.map((id, i) => [id, i]))
    return all
        .map((e, i) => ({ e, i, p: pos.has(String(e && e._id)) ? pos.get(String(e._id)) : Infinity }))
        .sort((a, b) => a.p - b.p || a.i - b.i)
        .map(x => x.e)
}

// Stored category → the dialog's working shape: one `entries` list per folder.
export function toEditable(cat) {
    const { collections, children, order, ...rest } = cat || {} // eslint-disable-line no-unused-vars
    return { ...rest, entries: orderedEntries(cat).map(e => (isFolderEntry(e) ? toEditable(e) : e)) }
}

// Back to the stored shape: the two lists, and the mixed order.
export function fromEditable(cat) {
    const { entries, ...rest } = cat || {}
    const list = entries || []
    return {
        ...rest,
        collections: list.filter(e => !isFolderEntry(e)),
        children: list.filter(isFolderEntry).map(fromEditable),
        order: list.map(e => String(e._id))
    }
}
