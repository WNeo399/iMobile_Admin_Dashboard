<template>
    <!-- A phone supplier's default price for the device's Model + Storage +
         Grade (user ask 2026-11-05): looked up once a grade is picked and
         filled in (`fill`), and the price typed can be saved as the default.
         `active` only for a supplier's device Blackbelt gave the model and
         storage for. `compact`: a star button for a table row.
         An EXISTING device (2026-11-05) passes its stored price as
         `base-price`: opening it never replaces that price (an empty one is
         filled); a grade change, or "Use default", applies the default, and
         going back to a grade with none puts the stored price back. Give
         the component a :key per device so this state starts fresh. -->
    <span v-if="active && compact" class="rdp-compact">
        <el-tooltip :content="tip" placement="top" :open-delay="300">
            <el-button type="text" size="mini" :icon="isDefault ? 'el-icon-star-on' : 'el-icon-star-off'"
                :class="['rdp-star', { 'is-on': isDefault, 'is-idle': !canSave && !isDefault }]" :loading="saving"
                @click="onStar" />
        </el-tooltip>
    </span>
    <div v-else-if="active" class="rdp">
        <template v-if="gradeSet">
            <span v-if="def" class="rdp-txt">{{ $tp('Default price') }}: <b>{{ def.currency }} {{ money(def.price) }}</b></span>
            <span v-else-if="loaded" class="rdp-txt rdp-dim">{{ $tp('No default price yet for this model, storage and grade') }}</span>
            <el-tag v-if="isDefault" size="mini" type="success" effect="plain" disable-transitions class="rdp-tag"><i class="el-icon-star-on" /> {{ $tp('Default') }}</el-tag>
            <template v-else-if="loaded">
                <!-- the price differs from the default: take it, or make this price the default -->
                <el-button v-if="def" type="text" size="mini" icon="el-icon-bottom" class="rdp-btn" @click="useDefault">{{ $tp('Use default') }}</el-button>
                <el-button type="text" size="mini" icon="el-icon-star-off" class="rdp-btn" :loading="saving" :disabled="!canSave"
                    :title="canSave ? '' : $tp('Enter a price first')" @click="save">{{ $tp(def ? 'Set as new default' : 'Set as default price') }}</el-button>
            </template>
        </template>
        <span v-else class="rdp-dim">{{ $tp('Pick a grade to use the default price') }}</span>
    </div>
</template>

<script>
import { defaultPriceFor, setDefaultPrice, onDefaultPriceSaved, pairKey, gradeKey } from '../defaultPrices'

export default {
    name: 'DefaultPrice',
    props: {
        active: { type: Boolean, default: false },
        model: { type: String, default: '' },
        storage: { type: String, default: '' },
        grade: { type: String, default: '' },
        price: { type: [String, Number], default: '' },
        currency: { type: String, default: 'AUD' },
        compact: { type: Boolean, default: false },
        // an existing device's stored price + currency (null for a new device)
        basePrice: { type: [String, Number], default: null },
        baseCurrency: { type: String, default: '' }
    },
    data() {
        return {
            def: null, // { price, currency } for the combination, or null
            loaded: false,
            saving: false,
            lastFilled: null, // the figure this put in — replaced on a grade change, a typed one never is
            started: false, // the first look-up (opening the device) never replaces a stored price
            seq: 0
        }
    },
    computed: {
        gradeSet() { return !!gradeKey(this.grade) },
        combo() { return [this.active, this.model, this.storage, gradeKey(this.grade)].join('|') },
        priceNum() {
            const v = this.price
            if (v === '' || v == null) return null
            const n = Number(v)
            return Number.isFinite(n) ? n : null
        },
        isDefault() {
            return !!this.def && this.priceNum != null && this.priceNum === this.def.price && this.currency === this.def.currency
        },
        canSave() {
            return this.active && this.gradeSet && this.priceNum != null && this.priceNum > 0 && !this.isDefault
        },
        tip() {
            if (!this.gradeSet) return this.$tp('Pick a grade to use the default price')
            if (this.isDefault) return this.$tp('This is the default price')
            const head = this.def
                ? this.$tp('Default price') + ': ' + this.def.currency + ' ' + this.money(this.def.price)
                : this.$tp('No default price yet for this model, storage and grade')
            return head + ' — ' + (this.canSave ? this.$tp('click to save this price as the default') : this.$tp('enter a price to save it as the default'))
        }
    },
    watch: {
        combo: { handler() { this.refresh('combo') }, immediate: true }
    },
    created() {
        // a default saved elsewhere (another row, another dialog) for the same combination
        this.unlisten = onDefaultPriceSaved((k, g) => {
            if (this.active && k === pairKey(this.model, this.storage) && g === gradeKey(this.grade)) this.refresh('saved')
        })
    },
    beforeDestroy() {
        if (this.unlisten) this.unlisten()
    },
    methods: {
        money(n) {
            return Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        },
        // reason: 'combo' (opened, or the grade / model changed) or 'saved' (a
        // default saved elsewhere — that only ever fills an empty price)
        async refresh(reason) {
            const token = ++this.seq
            const first = !this.started
            if (reason === 'combo') this.started = true
            this.def = null
            this.loaded = false
            if (!this.active || !this.gradeSet || !this.model || !this.storage) return
            const d = await defaultPriceFor(this.model, this.storage, this.grade)
            if (token !== this.seq) return
            this.def = d
            this.loaded = true
            const base = this.basePrice === '' || this.basePrice == null ? null : Number(this.basePrice)
            const p = this.priceNum
            // fill an empty price, or one this filled for an earlier grade; never a
            // typed one. An existing device's stored price counts as replaceable
            // once its grade is changed — never on opening it.
            const untouched = p == null || (this.lastFilled != null && p === this.lastFilled) ||
                (reason === 'combo' && !first && base != null && p === base)
            if (d && untouched) {
                this.lastFilled = d.price
                if (p !== d.price || this.currency !== d.currency) this.$emit('fill', { price: d.price, currency: d.currency })
            } else if (!d && this.lastFilled != null && p === this.lastFilled) {
                // the earlier grade's default doesn't belong to this grade: the
                // stored price back on an existing device, else empty
                this.lastFilled = null
                this.$emit('fill', base != null
                    ? { price: base, currency: this.baseCurrency || this.currency }
                    : { price: null, currency: this.currency })
            }
        },
        // "Use default": the price and currency of the default, now
        useDefault() {
            if (!this.def) return
            this.lastFilled = this.def.price
            this.$emit('fill', { price: this.def.price, currency: this.def.currency })
        },
        // the row star: saves, or says why it can't (a disabled button shows no tooltip)
        onStar() {
            if (this.isDefault || this.saving) return
            if (!this.canSave) { this.$message.info(this.tip); return }
            this.save()
        },
        async save() {
            if (!this.canSave || this.saving) return
            this.saving = true
            try {
                const saved = await setDefaultPrice({
                    model: this.model, storage: this.storage, grade: this.grade, price: this.priceNum, currency: this.currency
                })
                this.def = saved
                this.lastFilled = saved.price
                this.$message.success(this.$tp('Saved as the default price'))
            } catch (e) {
                const m = (e && e.response && e.response.data && e.response.data.message) || (e && e.message)
                this.$message.error(m || this.$tp('Failed to save the default price'))
            } finally {
                this.saving = false
            }
        }
    }
}
</script>

<style lang="scss" scoped>
.rdp { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin-top: 4px; font-size: 12px; line-height: 18px; color: #606266; }
.rdp-dim { color: #909399; }
.rdp-btn { padding: 0; }
.rdp-tag i { color: #e6a23c; }
.rdp-compact { display: inline-block; }
.rdp-star { padding: 0 2px; font-size: 14px; color: #c0c4cc; }
.rdp-star:hover { color: #e6a23c; }
.rdp-star.is-idle:hover { color: #c0c4cc; cursor: default; }
.rdp-star.is-on { color: #e6a23c; cursor: default; }
</style>
