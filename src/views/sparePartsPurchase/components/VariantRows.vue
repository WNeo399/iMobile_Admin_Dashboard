<template>
    <!--
        Listing → Create: a product with variants (user 2026-10-30) — a colour,
        a pack size, anything. A variant is its title and its photos only (no
        price of its own, no "varies by": user 2026-10-30); in Zoho the option
        is named "Option". One row per variant — its title (plain text, no
        suggestion list: user 2026-10-30), the SKU it gets in
        Zoho (<base>-<variant>) and its own photos (the store shows them when
        it is picked). Photos: click + or drop files on the row; same limits as
        the product photos.
        v-model = [{ key, name, files: [{ key, file?, id?, url, name }] }]
        (a file without `file` is a draft's saved photo).
        The row's first photo is its thumbnail (user 2026-11-02), else its
        colour (VariantThumb); the others follow its SKU.
    -->
    <div class="vr">
        <div v-for="(c, i) in value" :key="c.key" :class="['vr-row', { over: overKey === c.key, current: isItem(i) }]"
            @dragover.prevent="overKey = disabled ? '' : c.key" @dragleave.prevent="overKey = ''" @drop.prevent="onDrop($event, i)">
            <div :class="['vr-tile', { clickable: !disabled || thumbOf(c, i) }]" :title="thumbOf(c, i) ? '' : $tp('Add photos of this variant (or drop them on the row)')" @click="openThumb(c, i)">
                <variant-thumb :url="thumbOf(c, i)" :name="c.name" :item-id="isItem(i) ? firstItemId : ''" />
                <i v-if="c.files.length && !disabled" class="el-icon-close vr-x" :title="$tp('Remove')" @click.stop="removePhoto(i, 0)" />
            </div>
            <div class="vr-main">
                <!-- the variant's title -->
                <el-input :value="c.name" size="small" :disabled="disabled" :maxlength="30"
                    :placeholder="$tp('Variant, e.g. Black or 10pc')" class="vr-name" @input="v => set(i, { name: v })" />
                <!-- its SKU in Zoho and its other photos -->
                <div class="vr-line2">
                    <span class="vr-sku" :title="isItem(i) ? $tp('This item takes this SKU too — {sku} now', { sku: firstSku }) : $tp('The SKU this variant gets in Zoho')">{{ skuOf(c, i) }}</span>
                    <div class="vr-photos">
                        <div v-for="(f, j) in c.files.slice(1)" :key="f.key" class="vr-thumb">
                            <img :src="f.url" alt="" :title="f.name || (f.file && f.file.name) || ''" @click="view(c, j + 1)">
                            <i v-if="!disabled" class="el-icon-close vr-x" :title="$tp('Remove')" @click="removePhoto(i, j + 1)" />
                        </div>
                        <div v-if="c.files.length < max && !disabled" class="vr-add" :title="$tp('Add photos of this variant (or drop them on the row)')" @click="pick(i)">
                            <i class="el-icon-picture-outline" /><span v-if="!c.files.length">{{ $tp('Photos') }}</span>
                        </div>
                    </div>
                </div>
            </div>
            <span v-if="isItem(i)" class="vr-this">{{ $tp('This item') }}</span>
            <el-button v-else type="text" size="mini" icon="el-icon-delete" class="vr-del" :disabled="disabled" :title="$tp('Remove this variant')" @click="remove(i)" />
        </div>
        <el-button size="small" icon="el-icon-plus" class="vr-addrow" :disabled="disabled || value.length >= maxVariants" @click="add">{{ $tp('Add variant') }}</el-button>
        <input ref="input" type="file" multiple accept="image/gif,image/png,image/jpeg,image/bmp,image/webp" class="vr-hidden" @change="onPick">

        <image-viewer v-if="viewer.urls.length" :url-list="viewer.urls" :initial-index="viewer.index"
            :z-index="viewer.zIndex" :on-close="closeViewer" />
    </div>
</template>

<script>
import ImageViewer from 'element-ui/packages/image/src/image-viewer'
import { PopupManager } from 'element-ui/lib/utils/popup'
import VariantThumb from './VariantThumb'
import { blankVariant } from '../shared'

// Zoho's upload limits (the backend checks the same)
const UPLOAD_TYPES = /^image\/(gif|png|jpe?g|bmp|webp)$/i
const MAX_UPLOAD_BYTES = 7 * 1024 * 1024
export default {
    name: 'VariantRows',
    components: { ImageViewer, VariantThumb },
    props: {
        value: { type: Array, default: () => [] },
        // the SKU typed / found for the product — each variant's is <base>-<variant>
        baseSku: { type: String, default: '' },
        // Edit → a single product (2026-10-30): the first row is the item itself,
        // which can't be removed; its SKU takes the suffix too, like every
        // variant (user 2026-11-09): 22460 → 22460-Black
        firstSku: { type: String, default: '' },
        // … and its photo, while the row has none of its own to add
        firstImage: { type: String, default: '' },
        firstItemId: { type: String, default: '' },
        disabled: { type: Boolean, default: false },
        max: { type: Number, default: 10 },
        maxVariants: { type: Number, default: 20 }
    },
    data() {
        return {
            overKey: '',
            pickIndex: -1,
            viewer: { urls: [], index: 0, zIndex: 2000 }
        }
    },
    methods: {
        isItem(i) {
            return i === 0 && !!this.firstSku
        },
        thumbOf(c, i) {
            if (c.files.length) return c.files[0].url
            return this.isItem(i) ? this.firstImage : ''
        },
        // a photo is enlarged, no photo yet picks one
        openThumb(c, i) {
            const url = this.thumbOf(c, i)
            if (c.files.length) this.view(c, 0)
            else if (url) this.viewer = { urls: [url], index: 0, zIndex: PopupManager.nextZIndex() }
            else this.pick(i)
        },
        skuOf(c, i) {
            const name = String(c.name || '').replace(/\s+/g, ' ').trim()
            if (this.isItem(i)) return `${this.firstSku}-${name || '…'}`
            return `${this.baseSku || '…'}-${name || '…'}`
        },
        set(i, patch) {
            const next = this.value.slice()
            next[i] = { ...next[i], ...patch }
            this.$emit('input', next)
        },
        add() {
            this.$emit('input', [...this.value, blankVariant()])
        },
        remove(i) {
            const next = this.value.slice()
            const [c] = next.splice(i, 1)
            for (const f of (c && c.files) || []) if (f.file && f.url) URL.revokeObjectURL(f.url)
            this.$emit('input', next)
        },
        // ── photos ──
        pick(i) {
            if (this.disabled) return
            this.pickIndex = i
            this.$refs.input.click()
        },
        onPick(e) {
            if (this.pickIndex >= 0) this.addPhotos(this.pickIndex, e.target.files)
            e.target.value = '' // the same file again still fires change
        },
        onDrop(e, i) {
            this.overKey = ''
            if (!this.disabled) this.addPhotos(i, e.dataTransfer && e.dataTransfer.files)
        },
        addPhotos(i, fileList) {
            const c = this.value[i]
            if (!c) return
            const skipped = []
            const files = c.files.slice()
            for (const file of Array.from(fileList || [])) {
                if (!UPLOAD_TYPES.test(file.type)) { skipped.push(this.$tp('{name} (not an image type Zoho takes)', { name: file.name })); continue }
                if (file.size > MAX_UPLOAD_BYTES) { skipped.push(this.$tp('{name} (over 7 MB)', { name: file.name })); continue }
                if (files.length >= this.max) { skipped.push(this.$tp('{name} ({n} at most)', { name: file.name, n: this.max })); continue }
                files.push({ key: `${Date.now()}-${Math.random()}`, file, url: URL.createObjectURL(file) })
            }
            if (files.length !== c.files.length) this.set(i, { files })
            if (skipped.length) this.$message.warning(this.$tp('Skipped: {list}', { list: skipped.join(', ') }))
        },
        removePhoto(i, j) {
            const files = this.value[i].files.slice()
            const [f] = files.splice(j, 1)
            if (f && f.file && f.url) URL.revokeObjectURL(f.url)
            this.set(i, { files })
        },
        view(c, j) {
            this.viewer = { urls: c.files.map(f => f.url), index: j, zIndex: PopupManager.nextZIndex() } // above the dialog
        },
        closeViewer() {
            this.viewer = { urls: [], index: 0, zIndex: 2000 }
        }
    }
}
</script>

<style lang="scss" scoped>
.vr { word-break: normal; }
.vr-hidden { display: none; }
.vr-row {
    display: flex; align-items: flex-start; gap: 10px; padding: 8px 10px; margin-bottom: 8px;
    border: 1px solid #e3e8f1; border-radius: 9px; background: #fff; transition: border-color .15s, background .15s;
    &.current { border-color: #cfe0fb; background: #eff5ff; }
    &.over { border-color: #1890ff; background: #f5faff; }
}
.vr-tile { position: relative; flex: none; &.clickable { cursor: pointer; } }
.vr-main { flex: 1; min-width: 0; }
.vr-line2 { display: flex; align-items: center; gap: 8px; margin-top: 4px; min-height: 28px; }
.vr-name { display: block; }
.vr-sku { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: #66758c; }
.vr-photos { flex: 1 0 auto; max-width: 100%; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px; }
.vr-thumb {
    position: relative; width: 28px; height: 28px; border: 1px solid #e3e8f1; border-radius: 5px; background: #fff;
    img { display: block; width: 100%; height: 100%; border-radius: 4px; object-fit: contain; cursor: zoom-in; }
}
.vr-x {
    position: absolute; top: -6px; right: -6px; padding: 1px; border-radius: 50%; font-size: 11px;
    background: #fff; color: #909399; box-shadow: 0 0 0 1px #dcdfe6; cursor: pointer;
    &:hover { color: #f56c6c; }
}
.vr-add {
    height: 28px; min-width: 28px; padding: 0 7px; display: flex; align-items: center; justify-content: center; gap: 4px;
    border: 1px dashed #c0c9d6; border-radius: 5px; color: #66758c; font-size: 12px; cursor: pointer;
    i { font-size: 14px; }
    &:hover { border-color: #1890ff; color: #1890ff; }
}
.vr-del { flex: none; margin-top: 6px; padding: 0 2px; color: #909399; &:hover { color: #f56c6c; } }
.vr-this { flex: none; margin-top: 6px; padding: 2px 9px; border-radius: 6px; background: #dce9fd; color: #1890ff; font-size: 12px; font-weight: 500; white-space: nowrap; }
.vr-addrow.el-button { padding: 0 14px; height: 34px; border-radius: 8px; color: #1890ff; font-weight: 600; }
</style>
