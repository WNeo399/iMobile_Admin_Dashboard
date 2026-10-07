<template>
    <!--
        Picking product images for a Zoho upload — the Missing Images upload
        dialog and the New Products create dialog share it (2026-10-07). A
        drop zone / file picker with Zoho's limits, then the picked images in
        upload order (Zoho keeps it; with no main image yet the first becomes
        it): drag a thumbnail to reorder, click it to see it full size, × to
        remove, "Set as main" moves one to the front.
        v-model = [{ key, file, url }] (url is a local preview — the parent
        revokes it when it clears the list). add(files) takes pasted files too.
        An entry may also be a photo saved earlier ({ key, id, url, name },
        no file — a New Products draft's): shown and ordered like the rest.
        `compact`: a smaller drop zone and thumbnails (New Products dialog).
    -->
    <div :class="['ip', { 'is-compact': compact }]">
        <div :class="['ip-drop', { over, 'is-disabled': disabled }]" @click="pick"
            @dragover.prevent="over = !disabled" @dragleave.prevent="over = false" @drop.prevent="onDrop">
            <i class="el-icon-upload" />
            <div>{{ $tp('Drop images here or') }} <em>{{ $tp('choose files') }}</em></div>
            <div class="ip-dim">{{ $tp('gif, png, jpeg, bmp or webp · up to 7 MB each · {n} at most', { n: max }) }}</div>
        </div>
        <input ref="input" type="file" multiple accept="image/gif,image/png,image/jpeg,image/bmp,image/webp"
            class="ip-hidden" @change="onPick">

        <template v-if="value.length">
            <div class="ip-hint">
                <i class="el-icon-rank" />
                {{ hasImage
                    ? $tp('Drag to change the order — they are added after the current main image in this order')
                    : $tp('Drag to change the order — the first becomes the main image') }}
            </div>
            <draggable :value="value" class="ip-grid" :animation="180" :disabled="disabled"
                ghost-class="ip-ghost" chosen-class="ip-chosen" filter=".ip-remove,.ip-act" :prevent-on-filter="false"
                @input="v => $emit('input', v)">
                <div v-for="(f, i) in value" :key="f.key" :class="['ip-card', { main: i === 0 && !hasImage }]">
                    <span class="ip-pos">{{ i + 1 }}</span>
                    <i class="el-icon-close ip-remove" :title="$tp('Remove')" @click="remove(i)" />
                    <div class="ip-thumb" :title="$tp('Click to enlarge')" @click="view(i)">
                        <img :src="f.url" alt="" draggable="false">
                    </div>
                    <div class="ip-name" :title="nameOf(f)">{{ nameOf(f) }}</div>
                    <div class="ip-foot">
                        <span class="ip-dim">{{ f.file ? sizeText(f.file.size) : $tp('Saved') }}</span>
                        <span v-if="i === 0 && !hasImage" class="ip-main">{{ $tp('Main image') }}</span>
                        <el-button v-else-if="!hasImage" type="text" size="mini" class="ip-act" @click="makeMain(i)">{{ $tp('Set as main') }}</el-button>
                    </div>
                </div>
            </draggable>
        </template>
        <div v-if="hasImage" class="ip-note">
            <img v-if="currentUrl" :src="currentUrl" :title="$tp('Current main image')" class="ip-current" alt="" @click="viewCurrent">
            <i v-else class="el-icon-info" />
            <span>{{ $tp('This product already has a main image — these are added after it.') }}</span>
        </div>

        <!-- full size, above the dialog -->
        <image-viewer v-if="viewer.urls.length" :url-list="viewer.urls" :initial-index="viewer.index"
            :z-index="viewer.zIndex" :on-close="closeViewer" />
    </div>
</template>

<script>
import draggable from 'vuedraggable'
import ImageViewer from 'element-ui/packages/image/src/image-viewer'
import { PopupManager } from 'element-ui/lib/utils/popup' // the dialogs' own counter

// Zoho's upload limits (the backends check the same).
const UPLOAD_TYPES = /^image\/(gif|png|jpe?g|bmp|webp)$/i
const MAX_UPLOAD_BYTES = 7 * 1024 * 1024

export default {
    name: 'ImagePicker',
    components: { draggable, ImageViewer },
    props: {
        // the picked images, in upload order: [{ key, file, url }]
        value: { type: Array, default: () => [] },
        max: { type: Number, default: 10 },
        // the product has a main image already: these go after it
        hasImage: { type: Boolean, default: false },
        currentUrl: { type: String, default: '' },
        disabled: { type: Boolean, default: false },
        compact: { type: Boolean, default: false }
    },
    data() {
        return {
            over: false,
            viewer: { urls: [], index: 0, zIndex: 2000 }
        }
    },
    methods: {
        pick() {
            if (!this.disabled) this.$refs.input.click()
        },
        onPick(e) {
            this.add(e.target.files)
            e.target.value = '' // picking the same file again still fires change
        },
        onDrop(e) {
            this.over = false
            if (!this.disabled) this.add(e.dataTransfer && e.dataTransfer.files)
        },
        // Same checks as the backend (and Zoho): type, 7 MB, how many.
        add(fileList) {
            const skipped = []
            const next = this.value.slice()
            for (const file of Array.from(fileList || [])) {
                if (!UPLOAD_TYPES.test(file.type)) { skipped.push(this.$tp('{name} (not an image type Zoho takes)', { name: file.name })); continue }
                if (file.size > MAX_UPLOAD_BYTES) { skipped.push(this.$tp('{name} (over 7 MB)', { name: file.name })); continue }
                if (next.length >= this.max) { skipped.push(this.$tp('{name} ({n} at most)', { name: file.name, n: this.max })); continue }
                next.push({ key: `${Date.now()}-${Math.random()}`, file, url: URL.createObjectURL(file) })
            }
            if (next.length !== this.value.length) this.$emit('input', next)
            if (skipped.length) this.$message.warning(this.$tp('Skipped: {list}', { list: skipped.join(', ') }))
        },
        remove(i) {
            const next = this.value.slice()
            const [f] = next.splice(i, 1)
            if (f && f.file) URL.revokeObjectURL(f.url)
            this.$emit('input', next)
        },
        // The first image is the one Zoho makes the main image.
        makeMain(i) {
            const next = this.value.slice()
            const [f] = next.splice(i, 1)
            next.unshift(f)
            this.$emit('input', next)
        },
        view(i) {
            this.openViewer(this.value.map(f => f.url), i)
        },
        viewCurrent() {
            if (this.currentUrl) this.openViewer([this.currentUrl], 0)
        },
        openViewer(urls, index) {
            this.viewer = { urls, index, zIndex: PopupManager.nextZIndex() } // above the dialog
        },
        closeViewer() {
            this.viewer = { urls: [], index: 0, zIndex: 2000 }
        },
        nameOf(f) {
            return (f.file && f.file.name) || f.name || ''
        },
        sizeText(bytes) {
            return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
        }
    }
}
</script>

<style lang="scss" scoped>
/* el-dialog__body sets word-break: break-all — words wrap whole here */
.ip { word-break: normal; }
.ip-hidden { display: none; }
.ip-dim { font-size: 12px; color: #909399; }
.ip-drop {
    border: 1px dashed #c0c4cc; border-radius: 6px; padding: 18px; text-align: center; cursor: pointer;
    color: #606266; font-size: 13px; line-height: 1.7; transition: border-color .15s, background .15s;
    i { font-size: 30px; color: #c0c4cc; }
    em { color: #409eff; font-style: normal; }
    &:hover, &.over { border-color: #409eff; background: #f5faff; }
    &.is-disabled { cursor: not-allowed; opacity: .6; }
}
.ip-hint { margin-top: 14px; font-size: 12px; color: #909399; i { margin-right: 4px; } }
.ip-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; margin-top: 8px; }
.ip-card {
    position: relative; border: 1px solid #ebeef5; border-radius: 4px; padding: 6px; background: #fff;
    cursor: grab; user-select: none; transition: border-color .15s, box-shadow .15s;
    &:hover { border-color: #c0c4cc; }
    &.main { border-color: #409eff; box-shadow: 0 0 0 1px #409eff inset; }
}
.ip-thumb {
    height: 110px; border-radius: 3px; background: #f5f7fa; cursor: zoom-in;
    img { display: block; width: 100%; height: 100%; object-fit: contain; pointer-events: none; }
}
.ip-pos {
    position: absolute; top: 4px; left: 4px; z-index: 1; min-width: 20px; height: 20px; padding: 0 5px;
    border-radius: 10px; background: rgba(48, 49, 51, .75); color: #fff; font-size: 12px; line-height: 20px; text-align: center;
}
.ip-card.main .ip-pos { background: #409eff; }
.ip-ghost { opacity: .35; border-style: dashed; }
.ip-chosen { cursor: grabbing; box-shadow: 0 4px 14px rgba(0, 0, 0, .15); }
.ip-remove {
    position: absolute; top: 4px; right: 4px; z-index: 1; padding: 2px; border-radius: 50%;
    background: rgba(255, 255, 255, .9); color: #909399; cursor: pointer;
    &:hover { color: #f56c6c; }
}
.ip-name { font-size: 12px; color: #606266; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ip-foot { display: flex; align-items: center; justify-content: space-between; min-height: 22px; font-size: 12px; }
.ip-main { color: #409eff; font-weight: 600; }
.ip-note { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 12px; color: #909399; }
.ip-current { width: 44px; height: 44px; object-fit: contain; border: 1px solid #ebeef5; border-radius: 3px; background: #fff; cursor: zoom-in; flex: none; }
/* compact */
.ip.is-compact {
    .ip-drop { padding: 12px 10px; font-size: 12px; line-height: 1.6; i { font-size: 24px; } }
    .ip-hint { margin-top: 10px; }
    .ip-grid { grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px; }
    .ip-thumb { height: 80px; }
    .ip-name { font-size: 11px; }
    .ip-foot { font-size: 11px; min-height: 20px; }
}
</style>
