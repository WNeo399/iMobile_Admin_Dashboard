<template>
    <!--
        A device brand's mark for the Browse Items and New Products trees
        (user ask 2026-10-07): the brand's own logo (src/assets/brand-logos,
        supplied by the user 2026-10-07), and for a brand without one a small
        rounded square in its colour with its initial. The tree's own buckets
        get plain icons: Tool (a wrench), No device, Other.
    -->
    <span class="bri" :style="{ width: size + 'px', height: size + 'px' }" :title="label">
        <img v-if="logo" :src="logo" :width="size" :height="size" alt="" draggable="false">
        <i v-else-if="mark.icon" :class="['bri-i', mark.icon]" :style="{ fontSize: (size - 2) + 'px' }" />
        <svg v-else :width="size" :height="size" viewBox="0 0 18 18" aria-hidden="true">
            <rect width="18" height="18" rx="4" :fill="mark.color" />
            <text x="9" :y="mark.text.length > 1 ? 12 : 13" text-anchor="middle" :font-size="mark.text.length > 1 ? 7.5 : 10.5"
                font-weight="700" font-family="Arial, Helvetica, sans-serif" fill="#fff">{{ mark.text }}</text>
        </svg>
    </span>
</template>

<script>
// brand → its logo (square SVGs; Sony's is a wide wordmark, so it keeps its
// badge; Samsung and Nokia keep theirs by the user's choice)
const LOGOS = {
    apple: require('@/assets/brand-logos/apple.svg'),
    google: require('@/assets/brand-logos/google.svg'),
    htc: require('@/assets/brand-logos/htc.svg'),
    huawei: require('@/assets/brand-logos/huawei.svg'),
    microsoft: require('@/assets/brand-logos/microsoft.svg'),
    motorola: require('@/assets/brand-logos/motorola.svg'),
    oppo: require('@/assets/brand-logos/oppo.svg'),
    xiaomi: require('@/assets/brand-logos/xiaomi.svg')
}
// a brand without a logo → its badge (colour + letters); anything else a grey initial
const MARKS = {
    samsung: { color: '#1428a0', text: 'S' },
    nokia: { color: '#124191', text: 'N' },
    sony: { color: '#111111', text: 'S' },
    lg: { color: '#a50034', text: 'LG' },
    vivo: { color: '#415fff', text: 'V' },
    oneplus: { color: '#eb0028', text: '1+' },
    realme: { color: '#d4a200', text: 'R' },
    honor: { color: '#0a6cff', text: 'H' },
    nintendo: { color: '#e60012', text: 'N' },
    // the tree's own buckets
    __tool__: { icon: 'el-icon-s-tools' },
    __none__: { icon: 'el-icon-remove-outline' },
    other: { icon: 'el-icon-more-outline' }
}

export default {
    name: 'BrandIcon',
    props: {
        // the brand as the tree has it ('Apple', 'Samsung' … '__tool__', '__none__')
        brand: { type: String, default: '' },
        label: { type: String, default: '' },
        size: { type: Number, default: 16 }
    },
    computed: {
        key() { return String(this.brand || '__none__').toLowerCase() },
        logo() { return LOGOS[this.key] || null },
        mark() {
            return MARKS[this.key] || { color: '#909399', text: (this.brand || '?').charAt(0).toUpperCase() }
        }
    }
}
</script>

<style lang="scss" scoped>
.bri { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; vertical-align: middle; }
.bri svg, .bri img { display: block; object-fit: contain; }
.bri-i { color: #909399; }
</style>
