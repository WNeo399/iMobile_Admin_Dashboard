<template>
    <!--
        Accessories Stock Monitoring — the exact Spare Parts page, driven
        onto the accessory data set by this route's meta.scope
        ('accessories', read by the inner component via $route). This
        wrapper only exists to give the route its own component name so
        keep-alive / tags-view cache it separately from the Spare Parts
        page.
    -->
    <StockMonitoring />
</template>

<script>
import StockMonitoring from '@/views/zohoInventory/stockmonitoring.vue'

export default {
    name: 'AccessoryStockMonitoring',
    components: { StockMonitoring }
}
</script>
