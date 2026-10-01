<template>
    <!--
        A sent campaign's summary report from Zoho Campaigns — the headline
        numbers, then who opened / clicked / bounced / unsubscribed. For one of
        our campaigns (campaignId) or any campaign in Zoho (zohoKey).
    -->
    <div class="cs">
        <div class="cs-bar">
            <span class="cs-dim">
                <template v-if="report">From Zoho Campaigns · updated {{ ago(report.at) }}</template>
                <template v-else-if="loading">Reading the report from Zoho…</template>
            </span>
            <div class="cs-spacer" />
            <el-button size="mini" icon="el-icon-refresh" :loading="loading" @click="load(true)">Refresh</el-button>
        </div>
        <el-alert v-if="error" type="warning" :closable="false" show-icon :title="error" class="cs-alert" />

        <div v-if="r" class="cs-tiles">
            <div v-for="t in tiles" :key="t.label" :class="['cs-tile', t.tone]">
                <div class="cs-tile-label">{{ t.label }}</div>
                <div class="cs-tile-value">{{ t.value }}</div>
                <div class="cs-dim">{{ t.note }}</div>
            </div>
        </div>

        <template v-if="r">
            <div class="cs-who">
                <el-radio-group v-model="action" size="mini" @change="loadPeople(1)">
                    <el-radio-button v-for="a in ACTIONS" :key="a.key" :label="a.key">{{ a.label }}</el-radio-button>
                </el-radio-group>
            </div>
            <el-table v-loading="peopleLoading" :data="people" size="mini" border max-height="360" :empty-text="peopleLoading ? 'Loading…' : 'Nobody here'">
                <el-table-column label="Email" prop="email" min-width="220" />
                <el-table-column label="Name" min-width="150">
                    <template slot-scope="s">{{ [s.row.firstName, s.row.lastName].filter(Boolean).join(' ') || '—' }}</template>
                </el-table-column>
                <el-table-column label="Company" prop="company" min-width="140">
                    <template slot-scope="s">{{ s.row.company || '—' }}</template>
                </el-table-column>
                <el-table-column label="Time" prop="at" width="170" />
            </el-table>
            <div class="cs-pager">
                <el-button size="mini" :disabled="page <= 1 || peopleLoading" @click="loadPeople(page - 1)">Previous</el-button>
                <span class="cs-dim">Page {{ page }}</span>
                <el-button size="mini" :disabled="people.length < 50 || peopleLoading" @click="loadPeople(page + 1)">Next</el-button>
            </div>
        </template>
    </div>
</template>

<script>
import { campaignReport, campaignRecipients, zohoCampaignReport, zohoCampaignRecipients } from '@/api/website'

const ACTIONS = [
    { key: 'openedcontacts', label: 'Opened' },
    { key: 'clickedcontacts', label: 'Clicked' },
    { key: 'unopenedcontacts', label: 'Not opened' },
    { key: 'senthardbounce', label: 'Hard bounced' },
    { key: 'sentsoftbounce', label: 'Soft bounced' },
    { key: 'optoutcontacts', label: 'Unsubscribed' },
    { key: 'spamcontacts', label: 'Marked spam' },
    { key: 'sentcontacts', label: 'All sent' }
]

export default {
    name: 'CampaignSummary',
    props: {
        campaignId: { type: String, default: '' },
        zohoKey: { type: String, default: '' }
    },
    data() {
        return { ACTIONS, report: null, loading: false, error: '', action: 'openedcontacts', people: [], page: 1, peopleLoading: false, nowTick: Date.now() }
    },
    computed: {
        r() {
            return this.report && this.report.data
        },
        tiles() {
            const r = this.r
            const n = (v) => Number(v || 0).toLocaleString()
            const p = (v) => `${Number(v || 0).toFixed(1)}%`
            return [
                { label: 'Sent', value: n(r.sent), note: r.unsent ? `${n(r.unsent)} not sent` : 'emails sent' },
                { label: 'Delivered', value: n(r.delivered), note: p(r.deliveredPct), tone: 'ok' },
                { label: 'Opens', value: n(r.opens), note: `${p(r.openPct)} open rate`, tone: 'ok' },
                { label: 'Unique clicks', value: n(r.uniqueClicks), note: `${p(r.clickPct)} · ${p(r.clicksPerOpen)} of opens`, tone: 'ok' },
                { label: 'Bounces', value: n(r.bounces), note: `${n(r.hardBounces)} hard · ${n(r.softBounces)} soft`, tone: r.bounces ? 'warn' : '' },
                { label: 'Unsubscribes', value: n(r.unsubscribes), note: p(r.unsubscribePct), tone: r.unsubscribes ? 'warn' : '' },
                { label: 'Spam / complaints', value: `${n(r.spam)} / ${n(r.complaints)}`, note: r.forwards ? `${n(r.forwards)} forwarded` : '', tone: r.spam || r.complaints ? 'bad' : '' }
            ]
        }
    },
    watch: {
        campaignId() { this.reset() },
        zohoKey() { this.reset() }
    },
    created() {
        this.load(false)
        this.ticker = setInterval(() => { this.nowTick = Date.now() }, 30000)
    },
    beforeDestroy() {
        clearInterval(this.ticker)
    },
    methods: {
        reset() {
            this.report = null
            this.people = []
            this.page = 1
            this.load(false)
        },
        errText(e, fallback) {
            return (e && e.response && e.response.data && e.response.data.message) || (e && e.message) || fallback
        },
        async load(refresh) {
            this.loading = true
            this.error = ''
            try {
                const r = this.campaignId ? await campaignReport(this.campaignId, refresh) : await zohoCampaignReport(this.zohoKey)
                if (!r || r.success === false) throw new Error((r && r.message) || 'No report yet')
                this.report = r.report
                this.nowTick = Date.now()
                this.loadPeople(1)
            } catch (e) {
                this.error = this.errText(e, 'Could not read the report')
            } finally {
                this.loading = false
            }
        },
        async loadPeople(page) {
            this.peopleLoading = true
            try {
                const r = this.campaignId
                    ? await campaignRecipients(this.campaignId, this.action, page)
                    : await zohoCampaignRecipients(this.zohoKey, this.action, page)
                this.people = (r && r.rows) || []
                this.page = page
            } catch (e) {
                this.people = []
                this.$message.error(this.errText(e, 'Could not read the recipients'))
            } finally {
                this.peopleLoading = false
            }
        },
        ago(t) {
            const mins = Math.max(0, Math.round((this.nowTick - new Date(t).getTime()) / 60000))
            return mins < 1 ? 'just now' : mins === 1 ? '1 min ago' : `${mins} min ago`
        }
    }
}
</script>

<style scoped>
.cs-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.cs-spacer { flex: 1; }
.cs-dim { font-size: 12px; color: #909399; }
.cs-alert { margin-bottom: 10px; }
.cs-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; margin-bottom: 14px; }
.cs-tile { background: #fff; border: 1px solid #ebeef5; border-radius: 8px; padding: 10px 12px; border-top: 3px solid #dcdfe6; }
.cs-tile.ok { border-top-color: #67c23a; }
.cs-tile.warn { border-top-color: #e6a23c; }
.cs-tile.bad { border-top-color: #f56c6c; }
.cs-tile-label { font-size: 12px; color: #909399; }
.cs-tile-value { font-size: 20px; font-weight: 600; color: #303133; margin: 2px 0; font-variant-numeric: tabular-nums; }
.cs-who { margin-bottom: 8px; overflow-x: auto; white-space: nowrap; }
.cs-pager { display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding-top: 8px; }
</style>
