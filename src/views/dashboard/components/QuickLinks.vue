<template>
    <div class="quick-links">
        <router-link
            v-for="link in links"
            :key="link.to"
            :to="link.to"
            class="quick-link"
        >
            <span :class="['ql-icon', `ql-${link.color || 'blue'}`]">
                <i :class="link.icon || 'el-icon-arrow-right'"></i>
            </span>
            <span class="ql-text">
                <span class="ql-title">{{ link.title }}</span>
                <span v-if="link.desc" class="ql-desc">{{ link.desc }}</span>
            </span>
        </router-link>
    </div>
</template>

<script>
// Shortcut grid. The shell sub-components pass a `links` array of
// { to, title, desc, icon, color } objects.
export default {
    name: 'QuickLinks',
    props: {
        links: { type: Array, default: () => [] }
    }
}
</script>

<style scoped>
.quick-links {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 14px;
}
.quick-link {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 18px;
    background: #fff;
    border: 1px solid #ebeef5;
    border-radius: 10px;
    text-decoration: none;
    color: inherit;
    transition: box-shadow 0.18s ease, transform 0.18s ease;
}
.quick-link:hover {
    box-shadow: 0 6px 18px rgba(0,0,0,0.06);
    transform: translateY(-1px);
}
.ql-icon {
    width: 40px; height: 40px;
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-size: 18px;
    flex-shrink: 0;
}
.ql-text { display: flex; flex-direction: column; min-width: 0; }
.ql-title { font-weight: 600; color: #111827; font-size: 14px; }
.ql-desc { color: #909399; font-size: 12px; margin-top: 2px; }

.ql-blue   { background: #eff6ff; color: #1d4ed8; }
.ql-green  { background: #f0fdf4; color: #15803d; }
.ql-orange { background: #fff7ed; color: #c2410c; }
.ql-purple { background: #f5f3ff; color: #6d28d9; }
.ql-teal   { background: #f0fdfa; color: #0f766e; }
.ql-red    { background: #fef2f2; color: #b91c1c; }
</style>
