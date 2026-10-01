<template>
    <!--
        A consignment invoice as it prints / is sent — preview first, then
        Download or Print. open(invoiceRow) reads the invoice with its lines
        (or takes { invoice, lines } already loaded). Shared by
        iMobile Accountant → Dashboard and Consignment → Invoices.
    -->
    <el-dialog :title="title" :visible.sync="visible" width="700px" top="4vh" append-to-body @closed="clear">
        <iframe v-if="url" ref="frame" :src="url" class="cp-frame" title="invoice" />
        <span slot="footer">
            <el-button size="small" icon="el-icon-download" @click="download">{{ $tp('Download') }}</el-button>
            <el-button size="small" icon="el-icon-printer" @click="print">{{ $tp('Print') }}</el-button>
            <el-button size="small" type="primary" @click="visible = false">{{ $tp('Close') }}</el-button>
        </span>
    </el-dialog>
</template>

<script>
import { getConsignInvoiceDetail } from '@/api/consignment'
import { buildConsignmentInvoicePdf, consignmentInvoiceFileName } from '@/utils/consignmentInvoicePdf'

export default {
    name: 'ConsignInvoicePdf',
    data() {
        return { visible: false, url: '', title: '', data: null }
    },
    beforeDestroy() {
        this.clear()
    },
    methods: {
        async open(row, loaded) {
            try {
                let r = loaded
                if (!r) {
                    r = await getConsignInvoiceDetail(row._id)
                    if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                }
                const data = { ...r.invoice, lines: r.lines || [] }
                this.clear()
                this.data = data
                this.url = buildConsignmentInvoicePdf(data).output('bloburl') + '#toolbar=0'
                this.title = this.$tp('Invoice') + ' ' + data.number
                this.visible = true
            } catch (e) {
                const m = (e && e.response && e.response.data && e.response.data.message) || (e && e.message)
                this.$message.error(m || this.$tp('Could not build the PDF'))
            }
        },
        download() {
            if (this.data) buildConsignmentInvoicePdf(this.data).save(consignmentInvoiceFileName(this.data))
        },
        print() {
            const frame = this.$refs.frame
            try { frame.contentWindow.focus(); frame.contentWindow.print() } catch (e) { this.download() }
        },
        clear() {
            if (this.url) URL.revokeObjectURL(this.url.split('#')[0])
            this.url = ''
        }
    }
}
</script>

<style scoped>
.cp-frame { width: 100%; height: 78vh; border: 0; background: #525659; }
</style>
