<template>
    <!-- A variant's thumbnail (user 2026-11-02): its own photo, else the colour
         its title names, else an empty tile (a "10pc" has no colour) -->
    <span class="vt">
        <img v-if="url" v-zoho-img="itemId" :src="url" alt="">
        <i v-else-if="swatch" class="vt-swatch" :style="{ background: swatch }" />
        <i v-else class="el-icon-picture-outline vt-none" />
    </span>
</template>

<script>
import { variantSwatch } from '../shared'

export default {
    name: 'VariantThumb',
    props: {
        url: { type: String, default: '' },
        // the variant's title
        name: { type: String, default: '' },
        // a product the store hides shows its photo through the backend (v-zoho-img)
        itemId: { type: String, default: '' }
    },
    computed: {
        swatch() {
            return variantSwatch(this.name)
        }
    }
}
</script>

<style lang="scss" scoped>
.vt {
    flex: none; width: 36px; height: 36px; border-radius: 8px; overflow: hidden;
    display: flex; align-items: center; justify-content: center;
    img { display: block; width: 100%; height: 100%; object-fit: contain; background: #f5f7fa; }
}
.vt-swatch { width: 24px; height: 24px; border-radius: 6px; box-shadow: inset 0 0 0 1px rgba(16, 33, 63, .1); }
.vt-none { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #f1f4f9; color: #9aa7b8; font-size: 16px; }
</style>
