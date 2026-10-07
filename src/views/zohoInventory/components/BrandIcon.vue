<template>
    <!--
        A device brand's mark for the Browse Items tree (user ask 2026-10-07):
        Apple's apple, Microsoft's four squares, and for the rest a small
        rounded square in the brand's colour with its initial. The tree's
        own buckets get plain icons: Tool (a wrench), No device, Other.
    -->
    <span class="bri" :style="{ width: size + 'px', height: size + 'px' }" :title="label">
        <svg v-if="kind === 'apple'" :width="size" :height="size" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#1f1f1f" d="M16.37 12.6c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.89-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.89 2.65 3.24 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.38.81 1.4-.02 2.29-1.27 3.14-2.53.99-1.45 1.4-2.86 1.42-2.93-.03-.01-2.72-1.04-2.75-4.13zM13.79 4.97c.72-.87 1.2-2.07 1.07-3.27-1.03.04-2.28.69-3.02 1.55-.66.77-1.24 2-1.09 3.18 1.15.09 2.32-.58 3.04-1.46z" />
        </svg>
        <svg v-else-if="kind === 'microsoft'" :width="size" :height="size" viewBox="0 0 18 18" aria-hidden="true">
            <rect x="1" y="1" width="7.5" height="7.5" fill="#f25022" />
            <rect x="9.5" y="1" width="7.5" height="7.5" fill="#7fba00" />
            <rect x="1" y="9.5" width="7.5" height="7.5" fill="#00a4ef" />
            <rect x="9.5" y="9.5" width="7.5" height="7.5" fill="#ffb900" />
        </svg>
        <i v-else-if="kind === 'icon'" :class="['bri-i', mark.icon]" :style="{ fontSize: (size - 2) + 'px' }" />
        <svg v-else :width="size" :height="size" viewBox="0 0 18 18" aria-hidden="true">
            <rect width="18" height="18" rx="4" :fill="mark.color" />
            <text x="9" :y="mark.text.length > 1 ? 12 : 13" text-anchor="middle" :font-size="mark.text.length > 1 ? 7.5 : 10.5"
                font-weight="700" font-family="Arial, Helvetica, sans-serif" fill="#fff">{{ mark.text }}</text>
        </svg>
    </span>
</template>

<script>
// brand → its mark (colour + letters); anything else gets a grey initial
const MARKS = {
    samsung: { color: '#1428a0', text: 'S' },
    google: { color: '#4285f4', text: 'G' },
    oppo: { color: '#1ba784', text: 'O' },
    huawei: { color: '#cf0a2c', text: 'H' },
    sony: { color: '#111111', text: 'S' },
    nokia: { color: '#124191', text: 'N' },
    motorola: { color: '#2b5cb8', text: 'M' },
    htc: { color: '#69be28', text: 'h' },
    xiaomi: { color: '#ff6900', text: 'mi' },
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
        mark() {
            return MARKS[this.key] || { color: '#909399', text: (this.brand || '?').charAt(0).toUpperCase() }
        },
        kind() {
            if (this.key === 'apple') return 'apple'
            if (this.key === 'microsoft') return 'microsoft'
            return this.mark.icon ? 'icon' : 'mono'
        }
    }
}
</script>

<style lang="scss" scoped>
.bri { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; vertical-align: middle; }
.bri svg { display: block; }
.bri-i { color: #909399; }
</style>
