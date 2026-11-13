<template>
    <el-dialog :title="$tp('New repair ticket')" :visible="visible" :width="narrow ? '96%' : '760px'" top="5vh" append-to-body
        custom-class="nt-dialog" :close-on-click-modal="false" @open="onOpen" @close="$emit('update:visible', false)">
        <div v-loading="catalogLoading" class="nt">
            <div v-if="shops.length > 1" class="nt-row">
                <label class="nt-label">{{ $tp('Shop') }}</label>
                <el-select v-model="shopId" size="small" filterable class="nt-full" :placeholder="$tp('Pick the shop')">
                    <el-option v-for="s in shops" :key="s.id" :label="s.name" :value="s.id" />
                </el-select>
            </div>

            <!-- one device per ticket (user 2026-11-13) -->
            <div class="nt-dev">
                <div class="nt-grid">
                    <div>
                        <label class="nt-label">{{ $tp('Brand') }}</label>
                        <el-select v-model="line.brandId" size="small" filterable class="nt-full" :placeholder="$tp('Pick the brand')" @change="onBrand(line)">
                            <el-option v-for="b in brands" :key="b.id" :label="b.name" :value="b.id" />
                        </el-select>
                    </div>
                    <div>
                        <label class="nt-label">{{ $tp('Model') }}</label>
                        <el-select v-model="line.deviceId" size="small" filterable class="nt-full" :disabled="!line.brandId" :placeholder="$tp('Pick the model')" @change="onModel(line)">
                            <el-option v-for="d in modelsOf(line)" :key="d.id" :label="d.name" :value="d.id" />
                        </el-select>
                    </div>
                </div>
                <!-- IMEI / serial optional (user 2026-11-13) -->
                <div class="nt-grid nt-grid3">
                    <div>
                        <label class="nt-label">IMEI</label>
                        <el-input v-model="line.imei" size="small" clearable maxlength="20" :placeholder="$tp('Optional')" />
                    </div>
                    <div>
                        <label class="nt-label">{{ $tp('Serial number') }}</label>
                        <el-input v-model="line.serial" size="small" clearable maxlength="40" :placeholder="$tp('Optional')" />
                    </div>
                    <div>
                        <label class="nt-label">{{ $tp('Passcode') }}</label>
                        <el-input v-model="line.passcode" size="small" clearable maxlength="60" :placeholder="$tp('If the repair needs it')" />
                    </div>
                </div>
                <!-- right above the fault description (user 2026-11-13) -->
                <div class="nt-row">
                    <label class="nt-label">{{ $tp('Repair needed') }}</label>
                    <!-- every model ends with "Other" (user 2026-11-13), which needs the fault description -->
                    <el-select v-model="line.serviceIds" size="small" multiple filterable class="nt-full" :disabled="!line.deviceId" :loading="line.servicesLoading"
                        :placeholder="$tp('Pick one or more')">
                        <el-option v-for="s in servicesOf(line)" :key="s.id" :label="s.id === OTHER ? $tp('Other') : s.name" :value="s.id" />
                    </el-select>
                </div>
                <div class="nt-row">
                    <label :class="['nt-label', { 'nt-req': otherPicked }]">{{ $tp('Fault description') }}</label>
                    <el-input v-model="line.fault" type="textarea" :rows="2" maxlength="1000" show-word-limit
                        :placeholder="otherPicked ? $tp('Needed for Other — what is wrong with the device?') : $tp('What is wrong with the device?')" />
                </div>
            </div>
            <div class="nt-hint"><i class="el-icon-info" /> {{ $tp('The ticket starts as Pending — iMobile sees it straight away') }}</div>
        </div>
        <span slot="footer">
            <el-button size="small" @click="$emit('update:visible', false)">{{ $tp('Cancel') }}</el-button>
            <el-button size="small" type="primary" icon="el-icon-check" :loading="saving" @click="submit">{{ $tp('Create ticket') }}</el-button>
        </span>
    </el-dialog>
</template>

<script>
// New ticket for the iMobile Repair shop portal (2026-11-13): the shop (when
// the group has several), then ONE device (user: "one device one ticket") —
// brand → model, IMEI / serial (optional), passcode, the repair services from
// RepairDesk's catalogue (names only — no prices) and the fault. The backend
// checks it all again and creates the RepairDesk ticket as Pending.
import { getRepairPortalCatalog, getRepairPortalServices, createRepairPortalTicket } from '@/api/repair/portal'

// the backend's always-offered "Other" (sent to RepairDesk as "Other Issue: <fault>")
const OTHER = 'other'
const blankLine = () => ({ brandId: '', deviceId: '', serviceIds: [], imei: '', serial: '', passcode: '', fault: '', servicesLoading: false })

export default {
    name: 'RepairPortalNewTicket',
    props: {
        visible: { type: Boolean, default: false },
        shops: { type: Array, default: () => [] },
        defaultShop: { type: String, default: '' }
    },
    data() {
        return {
            OTHER,
            brands: [],
            catalogLoading: false,
            // model id → its services (cached while the page lives)
            services: {},
            shopId: '',
            line: blankLine(),
            saving: false,
            narrow: false
        }
    },
    computed: {
        otherPicked() {
            return this.line.serviceIds.includes(OTHER)
        }
    },
    methods: {
        async onOpen() {
            this.narrow = window.innerWidth < 800
            this.shopId = this.defaultShop || (this.shops.length === 1 ? this.shops[0].id : '')
            if (this.brands.length) return
            this.catalogLoading = true
            try {
                const r = await getRepairPortalCatalog()
                this.brands = (r && r.brands) || []
            } catch (e) {
                // the request layer has said why
            } finally {
                this.catalogLoading = false
            }
        },
        modelsOf(l) {
            const b = this.brands.find(x => x.id === l.brandId)
            return b ? b.devices : []
        },
        servicesOf(l) {
            return this.services[l.deviceId] || []
        },
        onBrand(l) {
            l.deviceId = ''
            l.serviceIds = []
        },
        async onModel(l) {
            l.serviceIds = []
            const id = l.deviceId
            if (!id || this.services[id]) return
            l.servicesLoading = true
            try {
                const r = await getRepairPortalServices(id)
                this.$set(this.services, id, (r && r.services) || [])
            } catch (e) {
                // the request layer has said why
            } finally {
                l.servicesLoading = false
            }
        },
        // the same checks the server makes, said before sending
        problem() {
            const l = this.line
            if (!this.shopId) return this.$tp('Pick the shop')
            if (!l.deviceId) return this.$tp('Pick the model')
            if (!l.serviceIds.length && !l.fault.trim()) return this.$tp('Pick the repair needed, or describe the fault')
            if (l.serviceIds.includes(OTHER) && !l.fault.trim()) return this.$tp('Describe the fault for Other')
            return ''
        },
        async submit() {
            if (this.saving) return
            const p = this.problem()
            if (p) { this.$message.warning(p); return }
            const l = this.line
            this.saving = true
            try {
                const r = await createRepairPortalTicket({
                    shopId: this.shopId,
                    devices: [{ deviceId: l.deviceId, serviceIds: l.serviceIds, imei: l.imei.trim(), serial: l.serial.trim(), passcode: l.passcode.trim(), fault: l.fault.trim() }]
                })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.line = blankLine()
                this.$emit('update:visible', false)
                this.$emit('created', r)
            } catch (e) {
                // the request layer has said why
            } finally {
                this.saving = false
            }
        }
    }
}
</script>

<style lang="scss" scoped>
.nt { word-break: normal; }
.nt-label { display: block; margin-bottom: 4px; font-size: 12px; font-weight: 600; color: #606266; }
.nt-full { width: 100%; }
.nt-req::after { content: ' *'; color: #f56c6c; }
.nt-row { margin-top: 10px; }
.nt-dev { margin-top: 12px; padding: 4px 14px 12px; border: 1px solid #e8ebf0; border-radius: 8px; background: #fafbfc; }
.nt-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px; }
.nt-grid3 { grid-template-columns: 1fr 1fr 1fr; }
.nt-hint { margin-top: 12px; font-size: 12px; color: #909399; }
@media (max-width: 767px) {
    .nt-grid, .nt-grid3 { grid-template-columns: 1fr; }
}
</style>
