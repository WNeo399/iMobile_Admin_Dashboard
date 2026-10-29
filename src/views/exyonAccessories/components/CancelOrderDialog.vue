<template>
    <!-- Cancel an order in Neto (user 2026-10-29) — from Orders and Dispatch.
         The whole order: Neto's API can't cancel one line. On open, a dry
         run asks the server what would happen (Neto's status, the pick list
         it is on, its AusPost label) — or why it can't be cancelled. -->
    <el-dialog :title="$tp('Cancel order in Neto')" :visible="visible" width="520px" append-to-body
        :close-on-click-modal="!busy" :close-on-press-escape="!busy" :show-close="!busy" @close="close">
        <div v-if="order" class="xc">
            <div class="xc-head">
                <b class="xc-id">{{ order.orderId }}</b>
                <span v-if="order.channel" class="xc-ch">{{ order.channel }}</span>
                <span class="xc-cust">{{ order.customerName || '—' }}</span>
            </div>
            <div v-if="items.length" class="xc-items">
                <div v-for="(it, i) in items" :key="i" class="xc-item">
                    <span class="xc-name">{{ it.productName || it.sku }}</span>
                    <span class="xc-sku">{{ it.sku }}</span>
                    <b>× {{ it.quantity }}</b>
                </div>
            </div>
            <div v-if="checking" class="xc-check"><i class="el-icon-loading" /> {{ $tp('Checking Neto…') }}</div>
            <div v-else-if="blocked" class="xc-warn xc-block"><i class="el-icon-circle-close" /><div>{{ blocked }}</div></div>
            <div v-else class="xc-warn">
                <i class="el-icon-warning" />
                <div>
                    <div v-if="preview && preview.netoStatus === 'Cancelled'">{{ $tp('Neto has it as Cancelled already — this records it here.') }}</div>
                    <div v-else>{{ $tp('The whole order is cancelled in Neto — every line (Neto can\'t cancel a single line).') }}</div>
                    <div>{{ $tp('The customer is not emailed, and only Neto changes — check the order on the marketplace too.') }}</div>
                    <div v-if="preview && preview.pickDay">{{ $tp('It is taken off the pick list of {day}.', { day: preview.pickDay }) }}</div>
                    <div v-if="preview && preview.auspost">{{ $tp('Its AusPost label {id} is deleted.', { id: preview.auspost }) }}</div>
                </div>
            </div>
            <el-form v-if="!blocked" label-position="top" size="small" class="xc-form" @submit.native.prevent>
                <el-form-item :label="$tp('Reason')" required>
                    <el-radio-group v-model="reason" size="small" class="xc-reasons">
                        <el-radio-button v-for="r in REASONS" :key="r" :label="r">{{ $tp(r) }}</el-radio-button>
                    </el-radio-group>
                </el-form-item>
                <el-form-item :label="$tp('Note')" :required="reason === 'Other'">
                    <el-input v-model="note" type="textarea" :rows="2" maxlength="300" show-word-limit
                        :placeholder="reason === 'Other' ? $tp('Why is it cancelled?') : $tp('Optional')" />
                </el-form-item>
            </el-form>
        </div>
        <span slot="footer">
            <el-button size="small" :disabled="busy" @click="close">{{ $tp('Keep the order') }}</el-button>
            <el-button v-if="!blocked" size="small" type="danger" icon="el-icon-circle-close" :loading="busy" :disabled="!ready" @click="submit">{{ $tp('Cancel order') }}</el-button>
        </span>
    </el-dialog>
</template>

<script>
import { cancelExyonOrder } from '@/api/exyonAccessories'

// as the server takes them (routes/exyonAccessoryRoutes CANCEL_REASONS)
const REASONS = ['Out of stock', 'Customer request', 'Address issue', 'Duplicate order', 'Other']
const errorOf = (e, fallback) => (e.response && e.response.data && e.response.data.message) || e.message || fallback

export default {
    name: 'CancelOrderDialog',
    props: {
        visible: { type: Boolean, default: false },
        // { orderId, channel, customerName, items: [{ sku, productName, quantity }] }
        order: { type: Object, default: null }
    },
    data() {
        return { REASONS, reason: '', note: '', busy: false, checking: false, preview: null, blocked: '' }
    },
    computed: {
        items() {
            return (this.order && this.order.items) || []
        },
        ready() {
            return !this.checking && !this.blocked && !!this.reason && (this.reason !== 'Other' || !!this.note.trim())
        }
    },
    watch: {
        visible(v) {
            if (!v) return
            this.reason = ''
            this.note = ''
            this.check()
        }
    },
    methods: {
        // the dry run: what cancelling would do, or why it can't be done
        async check() {
            const id = this.order && this.order.orderId
            if (!id) return
            this.preview = null
            this.blocked = ''
            this.checking = true
            try {
                const r = await cancelExyonOrder(id, { dryRun: true })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                if (this.order && this.order.orderId === id) {
                    this.preview = r
                    this.blocked = r.blocked || ''
                }
            } catch (e) {
                if (this.order && this.order.orderId === id) this.blocked = errorOf(e, this.$tp('Failed to check the order in Neto'))
            } finally {
                this.checking = false
            }
        },
        close() {
            if (!this.busy) this.$emit('update:visible', false)
        },
        async submit() {
            if (!this.ready || this.busy) return
            const id = this.order.orderId
            this.busy = true
            try {
                const r = await cancelExyonOrder(id, { reason: this.reason, note: this.note.trim() })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(r.outcome === 'already'
                    ? this.$tp('{id} was already cancelled in Neto — recorded', { id })
                    : this.$tp('{id} cancelled in Neto', { id }))
                if (r.warnings && r.warnings.length) {
                    this.$notify({ type: 'warning', title: this.$tp('Check this'), message: r.warnings.join('\n'), duration: 0 })
                }
                this.busy = false
                this.$emit('update:visible', false)
                this.$emit('cancelled', { orderId: id, ...r })
            } catch (e) {
                this.$message.error(errorOf(e, this.$tp('Failed to cancel the order')))
            } finally {
                this.busy = false
            }
        }
    }
}
</script>

<style lang="scss" scoped>
.xc-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.xc-id { font-size: 15px; color: #1f2329; }
.xc-ch { padding: 0 6px; border-radius: 3px; background: #f0f2f5; color: #606266; font-size: 12px; line-height: 20px; }
.xc-cust { color: #606266; font-size: 13px; }
.xc-items { margin-bottom: 10px; border: 1px solid #ebeef5; border-radius: 6px; padding: 4px 10px; }
.xc-item { display: flex; align-items: baseline; gap: 8px; padding: 4px 0; font-size: 13px; color: #303133;
    & + & { border-top: 1px dashed #ebeef5; } }
.xc-name { flex: 1; min-width: 0; word-break: normal; }
.xc-sku { font-family: Menlo, Consolas, monospace; font-size: 12px; color: #909399; white-space: nowrap; }
.xc-check { padding: 8px 10px; margin-bottom: 12px; font-size: 12px; color: #909399; }
.xc-warn { display: flex; gap: 8px; padding: 8px 10px; margin-bottom: 12px; border-radius: 6px; background: #fdf6ec; color: #8a5a00; font-size: 12px; line-height: 1.6; word-break: normal;
    > i { margin-top: 3px; } }
.xc-block { background: #fef0f0; color: #c45656; font-size: 13px; }
.xc-form ::v-deep .el-form-item { margin-bottom: 10px; }
.xc-form ::v-deep .el-form-item__label { padding-bottom: 4px; line-height: 18px; }
.xc-reasons { display: flex; flex-wrap: wrap; gap: 6px;
    ::v-deep .el-radio-button__inner { border-left: 1px solid #dcdfe6; border-radius: 4px !important; box-shadow: none !important; } }
</style>
