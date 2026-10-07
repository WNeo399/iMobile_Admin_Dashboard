// The invoice preview shared by Sales Orders, the customer Statement and
// Order History (user ask 2026-10-07): an order with an InFlow PDF opens it;
// an order without one (hand-entered) gets an invoice drawn in the browser in
// InFlow's layout (utils/inflowInvoicePdf), previewed in the same dialog and
// downloadable. The page provides pdfVisible / pdfUrl / pdfTitle (its preview
// dialog) and loadOrderForPdf(id) → the order with lineItems + invoiceParties.
import { buildInflowInvoicePdf, inflowInvoiceFileName } from '@/utils/inflowInvoicePdf'

export default {
    data() {
        return {
            // the order the preview was drawn from (null: an InFlow PDF is shown)
            pdfGenerated: null,
            pdfBuilding: false
        }
    },
    beforeDestroy() {
        this.releasePdfUrl()
    },
    methods: {
        async openPdf(row) {
            if (!row) return
            if (row.invoicePdfUrl) {
                this.releasePdfUrl()
                this.pdfGenerated = null
                this.pdfUrl = row.invoicePdfUrl
                this.pdfTitle = row.invoiceNumber || ''
                this.pdfVisible = true
                return
            }
            // no InFlow PDF: draw it from the order
            if (this.pdfBuilding) return
            this.pdfBuilding = true
            try {
                let order = row
                if (!Array.isArray(order.lineItems) || !order.invoiceParties) order = await this.loadOrderForPdf(row._id)
                if (!order) throw new Error('Order not found')
                this.showGeneratedPdf(order)
            } catch (e) {
                this.$message.error((e && e.message) || 'Could not make the invoice')
            } finally {
                this.pdfBuilding = false
            }
        },
        showGeneratedPdf(order) {
            this.releasePdfUrl()
            const doc = buildInflowInvoicePdf(order)
            this.pdfGenerated = order
            this.pdfUrl = doc.output('bloburl')
            this.pdfTitle = order.invoiceNumber || ''
            this.pdfVisible = true
        },
        downloadGeneratedPdf() {
            if (!this.pdfGenerated) return
            buildInflowInvoicePdf(this.pdfGenerated).save(inflowInvoiceFileName(this.pdfGenerated))
        },
        releasePdfUrl() {
            if (this.pdfUrl && String(this.pdfUrl).startsWith('blob:')) {
                try { URL.revokeObjectURL(this.pdfUrl) } catch (e) { /* ignore */ }
                this.pdfUrl = ''
            }
        },
        onPdfClosed() {
            this.releasePdfUrl()
            this.pdfGenerated = null
        }
    }
}
