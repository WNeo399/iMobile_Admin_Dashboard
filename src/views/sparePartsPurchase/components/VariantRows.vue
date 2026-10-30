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
    -->
    <div class="vr">
        <div v-for="(c, i) in value" :key="c.key" :class="['vr-row', { over: overKey === c.key }]"
            @dragover.prevent="overKey = disabled ? '' : c.key" @dragleave.prevent="overKey = ''" @drop.prevent="onDrop($event, i)">
            <span class="vr-n">{{ i + 1 }}</span>
            <div class="vr-main">
                <!-- the variant's title -->
                <div class="vr-line">
                    <el-input :value="c.name" size="small" :disabled="disabled" :maxlength="30"
                        :placeholder="$tp('Variant, e.g. Black or 10pc')" class="vr-name" @input="v => set(i, { name: v })" />
                    <el-button type="text" size="mini" icon="el-icon-delete" class="vr-del" :disabled="disabled" :title="$tp('Remove this variant')" @click="remove(i)" />
                </div>
                <!-- its SKU in Zoho and its own photos -->
                <div class="vr-line vr-line2">
                    <span class="vr-sku" :title="$tp('The SKU this variant gets in Zoho')">{{ skuOf(c) }}</span>
                    <div class="vr-photos">
                        <div v-for="(f, j) in c.files" :key="f.key" class="vr-thumb">
                            <img :src="f.url" alt="" :title="f.name || (f.file && f.file.name) || ''" @click="view(c, j)">
                            <i v-if="!disabled" class="el-icon-close vr-x" :title="$tp('Remove')" @click="removePhoto(i, j)" />
                        </div>
                        <div v-if="c.files.length < max && !disabled" class="vr-add" :title="$tp('Add photos of this variant (or drop them on the row)')" @click="pick(i)">
                            <i class="el-icon-picture-outline" /><span v-if="!c.files.length">{{ $tp('Photos') }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <el-button size="mini" icon="el-icon-plus" :disabled="disabled || value.length >= maxVariants" @click="add">{{ $tp('Add variant') }}</el-button>
        <input ref="input" type="file" multiple accept="image/gif,image/png,image/jpeg,image/bmp,image/webp" class="vr-hidden" @change="onPick">

        <image-viewer v-if="viewer.urls.length" :url-list="viewer.urls" :initial-index="viewer.index"
            :z-index="viewer.zIndex" :on-close="closeViewer" />
    </div>
</template>

<script>
import ImageViewer from 'element-ui/packages/image/src/image-viewer'
import { PopupManager } from 'element-ui/lib/utils/popup'
import { blankVariant } from '../shared'

// Zoho's upload limits (the backend checks the same)
const UPLOAD_TYPES = /^image\/(gif|png|jpe?g|bmp|webp)$/i
const MAX_UPLOAD_BYTES = 7 * 1024 * 1024
export default {
    name: 'VariantRows',
    components: { ImageViewer },
    props: {
        value: { type: Array, default: () => [] },
        // the SKU typed / found for the product — each variant's is <base>-<variant>
        baseSku: { type: String, default: '' },
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
        skuOf(c) {
            const name = String(c.name || '').replace(/\s+/g, ' ').trim()
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
    display: flex; align-items: flex-start; gap: 8px; padding: 8px; margin-bottom: 6px;
    border: 1px solid #ebeef5; border-radius: 6px; background: #fafbfc; transition: border-color .15s, background .15s;
    &.over { border-color: #409eff; background: #f5faff; }
}
.vr-n {
    flex: none; width: 20px; height: 20px; margin-top: 6px; border-radius: 10px; background: #909399; color: #fff;
    font-size: 12px; line-height: 20px; text-align: center;
}
.vr-main { flex: 1; min-width: 0; }
.vr-line { display: flex; align-items: center; gap: 8px; }
.vr-line2 { margin-top: 6px; align-items: flex-start; }
.vr-name { flex: 1; min-width: 0; }
.vr-sku {
    flex: 0 0 auto; max-width: 45%; margin-top: 9px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-family: Menlo, Consolas, monospace; font-size: 12px; color: #606266;
    padding: 2px 6px; border-radius: 3px; background: #f0f2f5;
}
.vr-photos { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; gap: 4px; }
.vr-thumb {
    position: relative; width: 36px; height: 36px; border: 1px solid #ebeef5; border-radius: 3px; background: #fff;
    img { display: block; width: 100%; height: 100%; object-fit: contain; cursor: zoom-in; }
}
.vr-x {
    position: absolute; top: -6px; right: -6px; padding: 1px; border-radius: 50%; font-size: 11px;
    background: #fff; color: #909399; box-shadow: 0 0 0 1px #dcdfe6; cursor: pointer;
    &:hover { color: #f56c6c; }
}
.vr-add {
    height: 36px; min-width: 36px; padding: 0 8px; display: flex; align-items: center; justify-content: center; gap: 4px;
    border: 1px dashed #c0c4cc; border-radius: 3px; color: #909399; font-size: 12px; cursor: pointer;
    i { font-size: 16px; }
    &:hover { border-color: #409eff; color: #409eff; }
}
.vr-del { flex: none; padding: 0 2px; color: #909399; &:hover { color: #f56c6c; } }
</style>
