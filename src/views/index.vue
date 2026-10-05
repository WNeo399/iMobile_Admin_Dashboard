<template>
    <div class="home">
        <WelcomeBanner />

        <!--
            Admin-only "View as" switcher. Lets a super-admin preview
            the home page each non-admin role sees, without having to
            sign in as a different account. The choice persists per
            browser via localStorage so reloads keep the selected view.
        -->
        <div v-if="isAdmin" class="view-as-bar">
            <span class="view-as-label">
                <i class="el-icon-view" /> Viewing as
            </span>
            <el-select v-model="viewAsRole" size="small" style="width: 220px">
                <el-option label="Admin overview" value="" />
                <el-option label="iMobile Admin" value="imobile-admin" />
                <el-option label="iMobile Repair Admin" value="imobile-repair-admin" />
                <el-option label="TechElite Admin" value="techelite-admin" />
            </el-select>
            <span v-if="viewAsRole" class="view-as-hint">
                Preview only — your own permissions are unchanged.
            </span>
        </div>

        <div v-else-if="homeRoles.length > 1" class="view-as-bar">
            <!--
                An account holding several roles (staff roles can be
                combined) picks which role's home it looks at; the main
                role's shows first and the choice is remembered per browser.
            -->
            <span class="view-as-label">
                <i class="el-icon-s-home" /> {{ $tp('Home for') }}
            </span>
            <el-radio-group v-model="homeRole" size="small">
                <el-radio-button v-for="r in homeRoles" :key="r.value" :label="r.value">{{ $tp(r.label) }}</el-radio-button>
            </el-radio-group>
        </div>

        <component :is="roleHome" />
    </div>
</template>

<script>
import WelcomeBanner from './dashboard/components/WelcomeBanner'
import AdminHome from './dashboard/AdminHome'
import TechEliteAdminHome from './dashboard/TechEliteAdminHome'
import IMobileAdminHome from './dashboard/IMobileAdminHome'
import IMobileRepairAdminHome from './dashboard/IMobileRepairAdminHome'
import ShopOwnerHome from './dashboard/ShopOwnerHome'
import RepairShopHome from './dashboard/RepairShopHome'
import InflowCustomerHome from './dashboard/InflowCustomerHome'
import PhoneSupplierHome from './dashboard/PhoneSupplierHome'
import ConsignmentShopHome from './dashboard/ConsignmentShopHome'
import ImobilePurchaseHome from './dashboard/ImobilePurchaseHome'
import PartsSupplierHome from './dashboard/PartsSupplierHome'
import AccountantHome from './dashboard/AccountantHome'
import WarehouseHome from './dashboard/WarehouseHome'
import FrontDeskHome from './dashboard/FrontDeskHome'

// Role-aware home shell. Picks the dashboard variant that matches the user's
// primary role; falls back to an admin-ish view for unknown roles so an
// unexpected role doesn't render an empty page.
const ROLE_TO_COMPONENT = {
    admin: 'AdminHome',
    'imobile-admin': 'IMobileAdminHome',
    'imobile-repair-admin': 'IMobileRepairAdminHome',
    'techelite-admin': 'TechEliteAdminHome',
    'shop-owner': 'ShopOwnerHome',
    'repair-shop': 'RepairShopHome',
    'inflow-customer': 'InflowCustomerHome',
    'phone-supplier': 'PhoneSupplierHome',
    'consignment-shop': 'ConsignmentShopHome',
    'imobile-purchase': 'ImobilePurchaseHome',
    'parts-supplier': 'PartsSupplierHome',
    'imobile-accountant': 'AccountantHome',
    'imobile-warehouse': 'WarehouseHome',
    'imobile-front-desk': 'FrontDeskHome'
}

// localStorage key for the admin "view as" preference. Per-browser so two
// admins on different machines can keep different preferred views.
const VIEW_AS_STORAGE_KEY = 'home-view-as-role'
// …and the home a multi-role account last picked.
const HOME_ROLE_STORAGE_KEY = 'home-role'

export default {
    name: 'Index',
    components: {
        WelcomeBanner, AdminHome, TechEliteAdminHome,
        IMobileAdminHome, IMobileRepairAdminHome,
        ShopOwnerHome, RepairShopHome, InflowCustomerHome,
        PhoneSupplierHome, ConsignmentShopHome, ImobilePurchaseHome, PartsSupplierHome, AccountantHome,
        WarehouseHome, FrontDeskHome
    },
    data() {
        // Hydrate from localStorage so a reload keeps the chosen view.
        // Empty string means "fall through to the default AdminHome".
        let saved = ''
        let savedHome = ''
        try {
            saved = localStorage.getItem(VIEW_AS_STORAGE_KEY) || ''
            savedHome = localStorage.getItem(HOME_ROLE_STORAGE_KEY) || ''
        } catch (_) { /* SSR / private mode */ }
        return {
            viewAsRole: saved,
            pickedHomeRole: savedHome
        }
    },
    computed: {
        isAdmin() {
            return (this.$store.state.user.roles || []).includes('admin')
        },
        roleHome() {
            // Admin can preview other roles via the view-as switcher.
            // Non-admins always see their own role's dashboard regardless
            // of any saved localStorage value (defensive — the switcher
            // is hidden but the value could otherwise still take effect
            // if their role was changed mid-session).
            if (this.isAdmin && this.viewAsRole && ROLE_TO_COMPONENT[this.viewAsRole]) {
                return ROLE_TO_COMPONENT[this.viewAsRole]
            }
            return this.homeRole ? ROLE_TO_COMPONENT[this.homeRole] : 'AdminHome'
        },
        // The account's roles that have a home of their own, main role first.
        homeRoles() {
            const roles = (this.$store.state.user.roles) || []
            const labels = this.$store.state.user.roleLabels || {}
            return roles.filter(r => ROLE_TO_COMPONENT[r]).map(r => ({ value: r, label: labels[r] || r }))
        },
        // The role whose home shows: the one picked, while the account still
        // holds it; the main role otherwise.
        homeRole: {
            get() {
                const held = this.homeRoles.map(r => r.value)
                return held.includes(this.pickedHomeRole) ? this.pickedHomeRole : (held[0] || '')
            },
            set(val) {
                this.pickedHomeRole = val
                try { localStorage.setItem(HOME_ROLE_STORAGE_KEY, val) } catch (_) { /* not remembered */ }
            }
        }
    },
    watch: {
        viewAsRole(val) {
            try {
                if (val) localStorage.setItem(VIEW_AS_STORAGE_KEY, val)
                else localStorage.removeItem(VIEW_AS_STORAGE_KEY)
            } catch (_) { /* localStorage disabled — non-fatal */ }
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
.view-as-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 10px 14px;
    margin-bottom: 12px;
    background: #fff;
    border: 1px solid #ebeef5;
    border-radius: 8px;
    color: #606266;
    font-size: 13px;
}
.view-as-label {
    font-weight: 500;
    color: #303133;
    display: inline-flex;
    align-items: center;
    gap: 6px;
}
.view-as-label i {
    color: #2563eb;
}
.view-as-hint {
    color: #909399;
    font-size: 12px;
}
</style>
