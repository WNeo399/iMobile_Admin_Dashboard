<template>
    <div class="sk-page" v-loading="loading">
        <div class="sk-header">
            <div>
                <div class="sk-title">Agent Skills</div>
                <div class="sk-sub">
                    The knowledge base the AI Agent follows: Core Guidelines apply to every question;
                    each Domain carries its own rules and sub skills. Read-only — updates are applied on request.
                </div>
            </div>
            <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load">Refresh</el-button>
        </div>

        <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" class="sk-alert" />

        <!-- Level 1: Core Guidelines — always applied, shown in full -->
        <div v-for="s in coreSkills" :key="s._id" class="sk-card sk-core">
            <div class="sk-card-head">
                <span class="sk-name">{{ prettyName(s.name) }}</span>
                <el-tag size="mini" type="warning" effect="plain">Core · applies to every question</el-tag>
                <span class="sk-updated">Updated {{ dateStr(s.updatedAt) }}</span>
            </div>
            <div v-if="s.description" class="sk-desc">{{ s.description }}</div>
            <pre class="sk-body">{{ s.body }}</pre>
        </div>
        <div v-if="!loading && !coreSkills.length" class="sk-card sk-core sk-none">
            No core guidelines yet — ask Claude to create them.
        </div>

        <!-- Level 2: Domains — header only when collapsed; click to expand into
             the rules followed by the sub-skill list -->
        <div v-for="d in domainSkills" :key="d._id" class="sk-card sk-domain">
            <div class="sk-card-head sk-domain-head" @click="toggleDomain(d._id)">
                <i class="el-icon-arrow-right sk-caret" :class="{ open: isOpen(d._id) }" />
                <span class="sk-name">{{ prettyName(d.name) }}</span>
                <el-tag size="mini" type="primary" effect="plain">Domain</el-tag>
                <span class="sk-count">{{ subsOf(d).length }} sub skill{{ subsOf(d).length === 1 ? '' : 's' }}</span>
                <span class="sk-updated">Updated {{ dateStr(d.updatedAt) }}</span>
            </div>
            <div v-if="d.description" class="sk-desc sk-desc-click" @click="toggleDomain(d._id)">{{ d.description }}</div>

            <template v-if="isOpen(d._id)">
                <div class="sk-rules-label"><i class="el-icon-collection-tag" /> Domain rules</div>
                <pre class="sk-body">{{ d.body }}</pre>

                <div class="sk-rules-label sk-subs-label"><i class="el-icon-files" /> Sub skills</div>
                <el-collapse v-if="subsOf(d).length" class="sk-collapse">
                    <el-collapse-item v-for="s in subsOf(d)" :key="s._id" :name="s._id">
                        <template slot="title">
                            <span class="sk-item-name"><i class="el-icon-document" /> {{ prettyName(s.name) }}</span>
                            <span class="sk-item-desc">{{ s.description }}</span>
                        </template>
                        <pre class="sk-body">{{ s.body }}</pre>
                        <div class="sk-meta">Updated {{ dateStr(s.updatedAt) }}<template v-if="s.tags && s.tags.length"> · {{ s.tags.join(', ') }}</template></div>
                    </el-collapse-item>
                </el-collapse>
                <div v-else class="sk-none">No sub skills in this domain yet.</div>
            </template>
        </div>

        <!-- Sub skills whose domain doesn't exist yet -->
        <div v-if="orphanSkills.length" class="sk-card">
            <div class="sk-card-head">
                <span class="sk-name">Unassigned sub skills</span>
                <span class="sk-count">{{ orphanSkills.length }}</span>
            </div>
            <el-collapse class="sk-collapse">
                <el-collapse-item v-for="s in orphanSkills" :key="s._id" :name="s._id">
                    <template slot="title">
                        <span class="sk-item-name">{{ prettyName(s.name) }}</span>
                        <span class="sk-item-desc">{{ s.description }}</span>
                    </template>
                    <pre class="sk-body">{{ s.body }}</pre>
                </el-collapse-item>
            </el-collapse>
        </div>
    </div>
</template>

<script>
import { listAiSkills } from '@/api/aiSkills'

// Level of a skill doc; legacy docs used `always` instead of `type`.
function typeOf(s) {
    if (s && (s.type === 'core' || s.type === 'domain' || s.type === 'skill')) return s.type
    return s && s.always === true ? 'core' : 'skill'
}

export default {
    name: 'RefurbishedAiSkills',
    data() {
        return {
            loading: false,
            error: '',
            skills: [],
            openDomains: []
        }
    },
    computed: {
        coreSkills() { return this.skills.filter(s => typeOf(s) === 'core') },
        domainSkills() { return this.skills.filter(s => typeOf(s) === 'domain') },
        orphanSkills() {
            const names = new Set(this.domainSkills.map(d => String(d.name || '').toLowerCase()))
            return this.skills.filter(s => typeOf(s) === 'skill' && !names.has(String(s.domain || '').toLowerCase()))
        }
    },
    created() {
        this.load()
    },
    methods: {
        async load() {
            this.loading = true
            this.error = ''
            try {
                const r = await listAiSkills()
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                // Hide disabled entries — this is the "what the agent follows" view.
                this.skills = (r.skills || []).filter(s => s.enabled !== false)
            } catch (e) {
                this.error = (e.response && e.response.data && e.response.data.message) || e.message || 'Failed to load skills'
            } finally {
                this.loading = false
            }
        },
        isOpen(id) {
            return this.openDomains.indexOf(id) !== -1
        },
        toggleDomain(id) {
            const i = this.openDomains.indexOf(id)
            if (i === -1) this.openDomains.push(id)
            else this.openDomains.splice(i, 1)
        },
        subsOf(domain) {
            const dn = String(domain.name || '').toLowerCase()
            return this.skills.filter(s => typeOf(s) === 'skill' && String(s.domain || '').toLowerCase() === dn)
        },
        prettyName(n) {
            return String(n || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        },
        dateStr(d) {
            if (!d) return '—'
            const x = new Date(d)
            return isNaN(x.getTime()) ? '—' : x.toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' })
        }
    }
}
</script>

<style scoped>
.sk-page { padding: 16px 20px; min-height: calc(100vh - 84px); background: #f6f8fb; }
.sk-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.sk-title { font-size: 20px; font-weight: 700; color: #1f2937; line-height: 1.2; }
.sk-sub { font-size: 13px; color: #909399; margin-top: 3px; max-width: 720px; }
.sk-alert { margin-bottom: 12px; }

.sk-card { background: #fff; border: 1px solid #ebeef5; border-radius: 10px; padding: 16px 18px; margin-bottom: 12px; }
.sk-core { border-left: 3px solid #E6A23C; }
.sk-domain { border-left: 3px solid #409EFF; }
.sk-card-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.sk-name { font-size: 15px; font-weight: 600; color: #303133; }
.sk-count { font-size: 12px; color: #909399; background: #f4f4f5; padding: 0 8px; border-radius: 8px; }
.sk-updated { margin-left: auto; font-size: 12px; color: #c0c4cc; }
.sk-desc { font-size: 13px; color: #909399; margin-top: 4px; }
.sk-body {
    margin: 10px 0 0; padding: 12px 14px;
    background: #fafbfc; border: 1px solid #f0f2f5; border-radius: 8px;
    font-size: 13px; line-height: 1.65; color: #303133;
    white-space: pre-wrap; word-break: break-word;
    font-family: inherit;
}
.sk-none { color: #909399; font-size: 13px; padding: 8px 0 0; }
.sk-meta { font-size: 12px; color: #c0c4cc; margin-top: 8px; }

.sk-domain-head { cursor: pointer; user-select: none; }
.sk-desc-click { cursor: pointer; }
.sk-caret { color: #909399; font-size: 13px; transition: transform 0.18s ease; }
.sk-caret.open { transform: rotate(90deg); }
.sk-rules-label { font-size: 13px; font-weight: 600; color: #606266; margin-top: 12px; }
.sk-rules-label i { color: #409eff; margin-right: 4px; }
.sk-subs-label { margin-top: 14px; }

.sk-collapse { margin-top: 8px; border: none; }
.sk-collapse ::v-deep .el-collapse-item__header { border-bottom: 1px solid #f0f2f5; height: 42px; line-height: 42px; }
.sk-collapse ::v-deep .el-collapse-item__wrap { border-bottom: 1px solid #f0f2f5; }
.sk-item-name { font-weight: 600; color: #303133; flex-shrink: 0; }
.sk-item-name i { color: #909399; margin-right: 4px; }
.sk-item-desc { margin-left: 12px; font-size: 12px; color: #909399; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
