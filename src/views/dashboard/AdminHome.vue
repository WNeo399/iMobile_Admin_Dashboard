<template>
    <div>
        <div class="panel">
            <div class="panel-header"><strong>Quick actions</strong></div>
            <QuickLinks :links="quickLinks" />
        </div>
    </div>
</template>

<script>
import QuickLinks from './components/QuickLinks'

// Admin home — intentionally minimal. The full case-pipeline dashboard lives
// under TechEliteAdminHome; Admin gets a hub of shortcuts to every module.
export default {
    name: 'AdminHome',
    components: { QuickLinks },
    data() {
        return {
            quickLinks: [
                { to: '/sqt/cases', title: 'SQT Cases', desc: 'Manage repair cases', icon: 'el-icon-tickets', color: 'blue' },
                { to: '/sqt/shops', title: 'Shops', desc: 'Repair shop directory', icon: 'el-icon-office-building', color: 'purple' },
                { to: '/sqt/models', title: 'Models', desc: 'Device model catalogue', icon: 'el-icon-mobile-phone', color: 'teal' },
                { to: '/zohoInventory/stockMonitoring', title: 'Stock Monitoring', desc: 'Live inventory levels', icon: 'el-icon-goods', color: 'green' },
                { to: '/zohoInventory/collections', title: 'Collections', desc: 'Product collections', icon: 'el-icon-collection', color: 'orange' },
                { to: '/system/users', title: 'Users', desc: 'User & role management', icon: 'el-icon-user', color: 'red' }
            ]
        }
    }
}
</script>

<style scoped>
.panel {
    background: #fff;
    border: 1px solid #ebeef5;
    border-radius: 12px;
    padding: 18px 20px;
}
.panel-header { font-size: 15px; color: #111827; margin-bottom: 12px; }
</style>
