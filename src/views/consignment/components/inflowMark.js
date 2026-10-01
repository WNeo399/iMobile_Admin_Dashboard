// "Recorded in inFlow" for consignment invoices (user ask 2026-10-01): the
// accounts are kept in inFlow, so each invoice is marked once it's been
// entered there — and only then can it be marked paid. A recorded one shows
// an "inFlow" label (click it to undo, unless it's already paid).
// Mixed into iMobile Accountant → Dashboard and Consignment → Invoices.
import { setConsignInvoiceInflow } from '@/api/consignment'

export default {
    methods: {
        async markInflow(row, recorded) {
            // inFlow comes before paid, so a paid invoice keeps its mark
            if (!recorded && row.paymentStatus === 'paid') {
                this.$message.warning(this.$tp('{number} is marked paid — mark it unpaid before taking the inFlow mark off.', { number: row.number }))
                return
            }
            try {
                await this.$confirm(
                    recorded
                        ? this.$tp('Mark {number} ({shop}) as recorded in inFlow?', { number: row.number, shop: row.shopName })
                        : this.$tp('{number} is marked as recorded in inFlow — take the mark off?', { number: row.number }),
                    this.$tp('inFlow'),
                    { confirmButtonText: recorded ? this.$tp('Recorded') : this.$tp('Take it off'), cancelButtonText: this.$tp('Cancel'), type: recorded ? 'info' : 'warning' })
            } catch (e) { return }
            try {
                const r = await setConsignInvoiceInflow(row._id, recorded)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                // the row updates in place — no reload needed
                this.$set(row, 'inflowRecordedAt', r.inflowRecordedAt)
                this.$set(row, 'inflowRecordedBy', r.inflowRecordedBy)
                this.$message.success(recorded ? this.$tp('{number} recorded in inFlow', { number: row.number }) : this.$tp('{number}: inFlow mark taken off', { number: row.number }))
            } catch (e) {
                const m = (e && e.response && e.response.data && e.response.data.message) || (e && e.message)
                this.$message.error(m || this.$tp('Failed to update the invoice'))
            }
        },
        inflowTitle(row) {
            const when = row.inflowRecordedAt ? new Date(row.inflowRecordedAt).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
            return this.$tp('Recorded in inFlow {when}{by} — click to take the mark off', { when, by: row.inflowRecordedBy ? ' by ' + row.inflowRecordedBy : '' })
        }
    }
}
