<template>
    <div class="welcome-banner">
        <el-avatar :size="56" class="banner-avatar">{{ initial }}</el-avatar>
        <div class="banner-text">
            <div class="banner-greeting">{{ greeting }}, {{ name }}</div>
            <div class="banner-role">
                <el-tag size="small" type="info" effect="plain">{{ roleLabel }}</el-tag>
                <span class="banner-date">{{ today }}</span>
            </div>
        </div>
    </div>
</template>

<script>
// Top-of-page welcome strip. Lives in the role shell so every dashboard gets
// the same header without each child re-implementing it.
const ROLE_LABEL_MAP = {
    admin: 'Admin',
    'imobile-admin': 'iMobile Admin',
    'techelite-admin': 'TechElite Admin',
    'shop-owner': 'Repair Shop Owner',
    'repair-shop': 'Repair Shop'
}

export default {
    name: 'WelcomeBanner',
    computed: {
        name() {
            return this.$store.state.user.nickName || this.$store.state.user.name || 'there'
        },
        initial() {
            const n = String(this.name || '').trim()
            return n ? n.charAt(0).toUpperCase() : '?'
        },
        roleLabel() {
            const roles = this.$store.state.user.roles || []
            return ROLE_LABEL_MAP[roles[0]] || roles[0] || 'User'
        },
        greeting() {
            const h = new Date().getHours()
            if (h < 12) return 'Good morning'
            if (h < 18) return 'Good afternoon'
            return 'Good evening'
        },
        today() {
            return new Date().toLocaleDateString(undefined, {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            })
        }
    }
}
</script>

<style scoped>
.welcome-banner {
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 22px 26px;
    border-radius: 14px;
    margin-bottom: 22px;
    background: linear-gradient(135deg, #4776E6 0%, #8E54E9 100%);
    color: #fff;
}
.banner-avatar {
    background: rgba(255,255,255,0.18) !important;
    color: #fff !important;
    font-size: 22px !important;
    font-weight: 600 !important;
    border: 2px solid rgba(255,255,255,0.25);
}
.banner-text { display: flex; flex-direction: column; gap: 6px; }
.banner-greeting { font-size: 22px; font-weight: 600; line-height: 1.2; }
.banner-role {
    display: flex; align-items: center; gap: 12px;
    color: rgba(255,255,255,0.85); font-size: 13px;
}
.banner-role ::v-deep .el-tag {
    background: rgba(255,255,255,0.2); color: #fff; border-color: rgba(255,255,255,0.35);
}
.banner-date { font-size: 13px; }
</style>
