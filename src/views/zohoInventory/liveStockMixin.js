// Live stock for the rows a page has just loaded.
//
// The list, tiles and sort come from the stock register (as of its last
// refresh); the number in the Stock column is then replaced by Zoho's
// current figure — one Inventory call per page — and marked so the two can
// be told apart. A read that lands after the page has moved on to another
// list is dropped rather than painted onto the wrong rows. If Zoho is slow
// or down the stored figure simply stands.
import { getLiveStock } from '@/api/stockMonitor'

export default {
    data() {
        return { liveAt: null, liveSeq: 0 }
    },
    methods: {
        async overlayLiveStock(rows) {
            const ids = (rows || []).map(r => r.itemId).filter(Boolean)
            if (!ids.length) return
            const seq = ++this.liveSeq
            try {
                const r = await getLiveStock(ids)
                if (seq !== this.liveSeq || !r || !r.stock) return
                for (const row of rows) {
                    const s = r.stock[row.itemId]
                    if (!s) continue
                    this.$set(row, 'storedAvailable', row.available)
                    this.$set(row, 'available', s.available)
                    this.$set(row, 'stockOnHand', s.stockOnHand)
                    this.$set(row, 'committed', s.committed)
                    this.$set(row, '__stockLive', true)
                }
                this.liveAt = r.at || new Date().toISOString()
            } catch (e) {
                // The stored figure stands.
            }
        },
        liveTitle(row) {
            if (!row.__stockLive) return 'As of the last refresh'
            return row.storedAvailable === row.available
                ? 'Live from Zoho'
                : `Live from Zoho (was ${row.storedAvailable} at the last refresh)`
        }
    }
}
