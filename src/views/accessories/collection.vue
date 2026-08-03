<template>
    <!--
        Accessories Collections — the exact Spare Parts Collections page,
        driven onto the accessory data set by this route's meta.scope
        ('accessories', read by the inner component via $route). Wrapper
        exists for a distinct component name (separate keep-alive cache).
    -->
    <Collections />
</template>

<script>
import Collections from '@/views/products/collection/index.vue'

export default {
    name: 'AccessoryCollections',
    components: { Collections }
}
</script>
