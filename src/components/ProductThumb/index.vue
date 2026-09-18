<template>
    <!-- Clicks stop here so a row's own click (e.g. the dashboard's detail
         drawer) doesn't fire under the thumbnail or the open viewer. -->
    <span v-if="shown && !failed" class="pt" :style="box" @click.stop>
        <img :src="shown" loading="lazy" alt="" title="Click to enlarge" @click="openViewer" @error="onError">
        <image-viewer v-if="viewing" :url-list="[shown]" :z-index="zIndex" :on-close="closeViewer" />
    </span>
    <span v-else class="pt pt-none" :style="box" title="No image"><i class="el-icon-picture-outline" /></span>
</template>

<script>
// Product image thumbnail for list tables. A plain <img loading="lazy">
// rather than <el-image lazy>: el-image checks visibility once on mount,
// before the table has laid its rows out, so rows already on screen stay
// on the placeholder until the page scrolls. The browser's own lazy
// loading has no such gap. Click opens Element's full-size viewer.
//
// The store URL only serves images of products the store lists (test and
// special-order items come back empty), and may lag a fresh upload. When
// it fails and an itemId is given, the image is fetched once through the
// backend's Zoho proxy instead — a Zoho call, so only on failure.
import ImageViewer from 'element-ui/packages/image/src/image-viewer'
import { PopupManager } from 'element-ui/src/utils/popup'
import { getItemImage } from '@/api/zoho/stockMonitoring'

export default {
    name: 'ProductThumb',
    components: { ImageViewer },
    props: {
        // Image URL; empty/null renders the "no image" placeholder.
        src: { type: String, default: '' },
        // Zoho item id, for the proxy fallback.
        itemId: { type: String, default: '' },
        // Square edge in px.
        size: { type: Number, default: 36 }
    },
    data() {
        return { failed: false, viewing: false, zIndex: 2000, fallbackUrl: '', triedFallback: false }
    },
    computed: {
        shown() {
            return this.fallbackUrl || this.src
        },
        box() {
            return { width: this.size + 'px', height: this.size + 'px', fontSize: Math.round(this.size * 0.45) + 'px' }
        }
    },
    watch: {
        src() {
            this.dropFallback()
            this.failed = false
            this.triedFallback = false
        }
    },
    beforeDestroy() {
        if (this.viewing) this.closeViewer()
        this.dropFallback()
    },
    methods: {
        async onError() {
            if (this.triedFallback || !this.itemId) {
                this.failed = true
                return
            }
            this.triedFallback = true
            try {
                const blob = await getItemImage(this.itemId)
                if (blob && blob.size) this.fallbackUrl = URL.createObjectURL(blob)
                else this.failed = true
            } catch (e) {
                this.failed = true
            }
        },
        dropFallback() {
            if (this.fallbackUrl) URL.revokeObjectURL(this.fallbackUrl)
            this.fallbackUrl = ''
        },
        // Same body-scroll lock el-image applies while its viewer is open.
        openViewer() {
            this.zIndex = PopupManager.nextZIndex()
            this.prevOverflow = document.body.style.overflow
            document.body.style.overflow = 'hidden'
            this.viewing = true
        },
        closeViewer() {
            document.body.style.overflow = this.prevOverflow || ''
            this.viewing = false
        }
    }
}
</script>

<style scoped>
.pt {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    border: 1px solid #ebeef5;
    border-radius: 3px;
    background: #fff;
    overflow: hidden;
    vertical-align: middle;
}
.pt img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    cursor: zoom-in;
}
.pt-none {
    background: #f5f7fa;
    color: #dcdfe6;
}
</style>
