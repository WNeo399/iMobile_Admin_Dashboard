<template>
    <div class="home">
        <WelcomeBanner />
        <component :is="roleHome" />
    </div>
</template>

<script>
import WelcomeBanner from './dashboard/components/WelcomeBanner'
import AdminHome from './dashboard/AdminHome'
import TechEliteAdminHome from './dashboard/TechEliteAdminHome'
import IMobileAdminHome from './dashboard/IMobileAdminHome'
import ShopOwnerHome from './dashboard/ShopOwnerHome'
import RepairShopHome from './dashboard/RepairShopHome'

// Role-aware home shell. Picks the dashboard variant that matches the user's
// primary role; falls back to an admin-ish view for unknown roles so an
// unexpected role doesn't render an empty page.
const ROLE_TO_COMPONENT = {
    admin: 'AdminHome',
    'imobile-admin': 'IMobileAdminHome',
    'techelite-admin': 'TechEliteAdminHome',
    'shop-owner': 'ShopOwnerHome',
    'repair-shop': 'RepairShopHome'
}

export default {
    name: 'Index',
    components: { WelcomeBanner, AdminHome, TechEliteAdminHome, IMobileAdminHome, ShopOwnerHome, RepairShopHome },
    computed: {
        roleHome() {
            const roles = (this.$store.state.user.roles) || []
            for (const r of roles) {
                if (ROLE_TO_COMPONENT[r]) return ROLE_TO_COMPONENT[r]
            }
            return 'AdminHome'
        }
    }
}
</script>

<style scoped>
.home {
    padding: 18px 20px;
    background: #f5f7fb;
    min-height: 100%;
}
</style>
