<template>
    <!--
        iMobile Website → Campaign (user ask 2026-10-01): email campaigns through
        Zoho Campaigns, start to finish. Most drafts come from another agent
        (POST /integration/campaigns — it can't send); they can also be made
        here. Every campaign is reviewed here: preview, test send to a small
        list, then the real send (the reviewer types the number of contacts to
        confirm). Once sent: the summary report and who opened / clicked.
        Older campaigns sent straight from Zoho are under "Zoho history".
    -->
    <div class="app-container cp-page">
        <div class="cp-head">
            <div>
                <div class="cp-title">Campaigns</div>
                <div class="cp-sub">Email campaigns through Zoho Campaigns. Drafts come from the agent or are made here — every one is reviewed here before it's sent.</div>
            </div>
            <div class="cp-spacer" />
            <el-button size="small" icon="el-icon-connection" @click="apiVisible = true">Agent API</el-button>
            <el-button v-if="canEdit" size="small" type="primary" icon="el-icon-plus" @click="openEditor(null)">New campaign</el-button>
            <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load">Refresh</el-button>
        </div>

        <div class="cp-card">
            <div class="cp-card-head">
                <el-radio-group v-model="tab" size="small" @change="load">
                    <el-radio-button label="review">Awaiting review ({{ counts.review }})</el-radio-button>
                    <el-radio-button label="sent">Sent ({{ counts.sent }})</el-radio-button>
                    <el-radio-button label="zoho">Zoho history</el-radio-button>
                </el-radio-group>
                <span class="cp-dim">{{ tabHint }}</span>
            </div>

            <el-table v-if="tab !== 'zoho'" v-loading="loading" :data="rows" size="small" border row-class-name="cp-row"
                :empty-text="tab === 'review' ? 'Nothing waiting for review' : 'No campaigns sent from here yet'" @row-click="openCampaign">
                <el-table-column label="Campaign" min-width="280">
                    <template slot-scope="s">
                        <div class="cp-name">{{ s.row.name }}</div>
                        <div class="cp-dim">{{ s.row.subject }}</div>
                    </template>
                </el-table-column>
                <el-table-column label="From" width="170">
                    <template slot-scope="s">
                        <el-tag size="mini" :type="s.row.source === 'agent' ? '' : 'info'">{{ s.row.source === 'agent' ? 'Agent' : 'Dashboard' }}</el-tag>
                        <div class="cp-dim">{{ s.row.agentName || s.row.createdBy || '' }}</div>
                    </template>
                </el-table-column>
                <el-table-column label="Created" width="150">
                    <template slot-scope="s"><span class="cp-mono">{{ when(s.row.createdAt) }}</span></template>
                </el-table-column>
                <el-table-column v-if="tab === 'sent'" label="Sent" width="230">
                    <template slot-scope="s">
                        <div class="cp-mono">{{ when(s.row.send && s.row.send.at) }}</div>
                        <div class="cp-dim">{{ listNames(s.row) }}</div>
                    </template>
                </el-table-column>
                <el-table-column v-if="tab === 'sent'" label="Opens · clicks" width="140" align="right">
                    <template slot-scope="s">
                        <template v-if="s.row.report && s.row.report.data">
                            <b>{{ pct(s.row.report.data.openPct) }}</b> · {{ pct(s.row.report.data.clickPct) }}
                            <div class="cp-dim">{{ (s.row.report.data.delivered || 0).toLocaleString() }} delivered</div>
                        </template>
                        <span v-else class="cp-dim">open to read</span>
                    </template>
                </el-table-column>
                <el-table-column label="Status" width="120" align="center">
                    <template slot-scope="s">
                        <el-tooltip :disabled="!(s.row.send && s.row.send.error)" :content="s.row.send && s.row.send.error" placement="top">
                            <el-tag size="mini" :type="STATUS[s.row.status].tag">{{ STATUS[s.row.status].label }}</el-tag>
                        </el-tooltip>
                        <div v-if="s.row.warnings && s.row.warnings.length" class="cp-warn-dot" :title="s.row.warnings.join('\n')"><i class="el-icon-warning-outline" /> {{ s.row.warnings.length }}</div>
                    </template>
                </el-table-column>
                <el-table-column :width="tab === 'review' && canEdit ? 150 : 96" align="center">
                    <template slot-scope="s">
                        <span class="cp-open">{{ s.row.status === 'sent' ? 'Summary' : 'Review' }} <i class="el-icon-arrow-right" /></span>
                        <!-- drafts (and failed sends) can go; a sent campaign can't -->
                        <el-button v-if="canEdit && (s.row.status === 'draft' || s.row.status === 'failed')" type="text" size="mini"
                            icon="el-icon-delete" class="cp-row-del" @click.stop="remove(s.row)">Delete</el-button>
                    </template>
                </el-table-column>
            </el-table>

            <el-table v-else v-loading="loading" :data="history" size="small" border row-class-name="cp-row" empty-text="No campaigns in Zoho" @row-click="openHistory">
                <el-table-column label="Campaign" min-width="300">
                    <template slot-scope="s">
                        <div class="cp-name">{{ s.row.name }} <el-tag v-if="s.row.campaignId" size="mini" type="success">sent from here</el-tag></div>
                        <div class="cp-dim">{{ s.row.subject }}</div>
                    </template>
                </el-table-column>
                <el-table-column label="Status" width="110" align="center">
                    <template slot-scope="s"><el-tag size="mini" :type="/sent/i.test(s.row.status) ? 'success' : 'info'">{{ s.row.status }}</el-tag></template>
                </el-table-column>
                <el-table-column label="Sent" width="190">
                    <template slot-scope="s"><span class="cp-mono">{{ s.row.sentAt || '—' }}</span></template>
                </el-table-column>
                <el-table-column width="96" align="center">
                    <template slot-scope="s"><span v-if="/sent/i.test(s.row.status)" class="cp-open">Summary <i class="el-icon-arrow-right" /></span></template>
                </el-table-column>
            </el-table>
        </div>

        <!-- ── one campaign: review / summary ── -->
        <el-drawer :visible.sync="drawerOpen" size="78%" :with-header="false" append-to-body @closed="closeDrawer">
            <div v-if="current" v-loading="currentLoading" class="cd">
                <div class="cd-head">
                    <div class="cd-titles">
                        <div class="cd-title">{{ current.name }} <el-tag size="mini" :type="STATUS[current.status].tag">{{ STATUS[current.status].label }}</el-tag></div>
                        <div class="cp-dim">{{ current.subject }}</div>
                    </div>
                    <div class="cp-spacer" />
                    <template v-if="editable">
                        <el-button v-if="canEdit" size="small" icon="el-icon-edit" @click="openEditor(current)">Edit</el-button>
                        <el-button v-if="canEdit" size="small" icon="el-icon-delete" class="cd-del" @click="remove">Delete</el-button>
                        <el-button v-if="canEdit" size="small" icon="el-icon-message" @click="openTest">Send test</el-button>
                        <el-button v-if="canSend" size="small" type="primary" icon="el-icon-s-promotion" @click="openSend">Send campaign…</el-button>
                    </template>
                    <el-button size="small" icon="el-icon-close" @click="drawerOpen = false" />
                </div>

                <div class="cd-info">
                    <div><span class="cd-k">From</span> {{ current.fromName }} &lt;{{ current.fromEmail }}&gt;</div>
                    <div><span class="cd-k">Made by</span> {{ current.source === 'agent' ? `Agent${current.agentName ? ' · ' + current.agentName : ''}` : current.createdBy || 'Dashboard' }} · {{ when(current.createdAt) }}</div>
                    <div v-if="current.updatedBy && current.updatedAt !== current.createdAt"><span class="cd-k">Last edit</span> {{ current.updatedBy }} · {{ when(current.updatedAt) }}</div>
                    <div v-if="current.status === 'sent' && current.send"><span class="cd-k">Sent</span> {{ when(current.send.at) }} by {{ current.send.by || '—' }} to {{ listNames(current) }} ({{ (current.send.total || 0).toLocaleString() }} contacts)</div>
                    <div v-if="current.notes" class="cd-notes"><span class="cd-k">Notes</span> {{ current.notes }}</div>
                </div>
                <el-alert v-for="(w, i) in current.warnings || []" :key="'w' + i" type="warning" :closable="false" show-icon :title="w" class="cd-alert" />
                <el-alert v-if="current.status === 'failed' && current.send && current.send.error" type="error" :closable="false" show-icon
                    :title="`The last send failed: ${current.send.error}`" description="Fix the cause (e.g. contacts' Subscription Type in Zoho) and send again." class="cd-alert" />

                <el-tabs v-model="drawerTab">
                    <el-tab-pane label="Preview" name="preview">
                        <div class="cd-pv-bar">
                            <el-radio-group v-model="device" size="mini">
                                <el-radio-button label="desktop"><i class="el-icon-monitor" /> Desktop</el-radio-button>
                                <el-radio-button label="mobile"><i class="el-icon-mobile-phone" /> Mobile</el-radio-button>
                            </el-radio-group>
                            <span class="cp-dim">As the email's HTML renders — Zoho adds its own header and footer when it sends.</span>
                            <div class="cp-spacer" />
                            <a v-if="current.contentUrl" :href="current.contentUrl" target="_blank" rel="noopener" class="cp-link">Open in a new tab</a>
                        </div>
                        <div class="cd-pv-box">
                            <!-- sandboxed: no scripts, no navigation of this page -->
                            <iframe :key="current._id + current.contentRev" sandbox="allow-popups allow-popups-to-escape-sandbox" :srcdoc="current.html || ''"
                                title="Campaign preview" :class="['cd-pv-frame', device]" />
                        </div>
                    </el-tab-pane>
                    <el-tab-pane v-if="current.status === 'sent'" label="Summary" name="summary">
                        <campaign-summary v-if="drawerTab === 'summary'" :campaign-id="String(current._id)" />
                    </el-tab-pane>
                    <el-tab-pane :label="`Tests (${(current.tests || []).length})`" name="tests">
                        <el-table :data="[...(current.tests || [])].reverse()" size="mini" border empty-text="No test sends yet">
                            <el-table-column label="When" width="160"><template slot-scope="s">{{ when(s.row.at) }}</template></el-table-column>
                            <el-table-column label="By" prop="by" width="140" />
                            <el-table-column label="List" min-width="200"><template slot-scope="s">{{ s.row.listName }} <span class="cp-dim">({{ s.row.contacts }})</span></template></el-table-column>
                            <el-table-column label="Result" min-width="200">
                                <template slot-scope="s">
                                    <span v-if="s.row.error" class="cp-bad">{{ s.row.error }}</span>
                                    <span v-else class="cp-ok"><i class="el-icon-circle-check" /> sent</span>
                                </template>
                            </el-table-column>
                        </el-table>
                    </el-tab-pane>
                    <el-tab-pane :label="`Images (${(current.assets || []).length})`" name="assets">
                        <div class="cd-assets">
                            <a v-for="a in current.assets || []" :key="a.url" :href="a.url" target="_blank" rel="noopener" class="cd-asset" :title="a.name">
                                <img :src="a.url" alt=""><span>{{ a.name }}</span>
                            </a>
                            <span v-if="!(current.assets || []).length" class="cp-dim">The email's images are linked from elsewhere, or it has none.</span>
                        </div>
                    </el-tab-pane>
                </el-tabs>
            </div>
            <div v-else-if="historyItem" class="cd">
                <div class="cd-head">
                    <div class="cd-titles">
                        <div class="cd-title">{{ historyItem.name }} <el-tag size="mini" type="success">{{ historyItem.status }}</el-tag></div>
                        <div class="cp-dim">{{ historyItem.subject }} · sent {{ historyItem.sentAt || '—' }} · from Zoho history</div>
                    </div>
                    <div class="cp-spacer" />
                    <el-button size="small" icon="el-icon-close" @click="drawerOpen = false" />
                </div>
                <campaign-summary :zoho-key="historyItem.key" />
            </div>
        </el-drawer>

        <!-- ── new / edit ── -->
        <el-dialog :title="editor.id ? 'Edit campaign' : 'New campaign'" :visible.sync="editor.open" width="620px" :close-on-click-modal="false" append-to-body>
            <el-form label-width="110px" size="small" @submit.native.prevent>
                <el-form-item label="Name" required><el-input v-model="editor.name" maxlength="120" placeholder="Internal name, e.g. Lid Angle Sensor launch" /></el-form-item>
                <el-form-item label="Subject" required><el-input v-model="editor.subject" maxlength="200" show-word-limit /></el-form-item>
                <el-form-item label="Sender name"><el-input v-model="editor.fromName" maxlength="80" /></el-form-item>
                <el-form-item label="Sender email">
                    <el-select v-model="editor.fromEmail" filterable allow-create default-first-option class="cp-full">
                        <el-option v-for="s in options.senders" :key="s" :label="s" :value="s" />
                    </el-select>
                    <div class="cp-hint">Must be an approved sender address in Zoho Campaigns.</div>
                </el-form-item>
                <el-form-item :label="editor.id ? 'New content' : 'Content'" :required="!editor.id">
                    <div :class="['cp-drop', { over: editor.over }]" @click="$refs.contentInput.click()"
                        @dragover.prevent="editor.over = true" @dragleave.prevent="editor.over = false" @drop.prevent="onDropContent">
                        <i class="el-icon-upload" />
                        <div v-if="editor.file"><b>{{ editor.file.name }}</b> <span class="cp-dim">({{ size(editor.file.size) }})</span></div>
                        <div v-else>Drop the design tool's <b>.zip</b> (an .html file + images) or an <b>.html</b> file, or <em>choose a file</em></div>
                        <div class="cp-dim">{{ editor.id ? 'Leave empty to keep the current email.' : 'Images inside the zip are hosted and linked automatically.' }}</div>
                    </div>
                    <input ref="contentInput" type="file" accept=".zip,.html,.htm" class="cp-hidden" @change="onPickContent">
                    <template v-if="editor.file && /\.html?$/i.test(editor.file.name)">
                        <el-button size="mini" icon="el-icon-picture-outline" class="cp-imgs-btn" @click="$refs.imagesInput.click()">Add its images ({{ editor.images.length }})</el-button>
                        <input ref="imagesInput" type="file" multiple accept="image/*" class="cp-hidden" @change="onPickImages">
                    </template>
                </el-form-item>
                <el-form-item label="Notes"><el-input v-model="editor.notes" type="textarea" :rows="2" maxlength="2000" placeholder="For the reviewer (optional)" /></el-form-item>
            </el-form>
            <span slot="footer">
                <el-button size="small" :disabled="editor.saving" @click="editor.open = false">Cancel</el-button>
                <el-button size="small" type="primary" :loading="editor.saving" @click="saveEditor">{{ editor.id ? 'Save' : 'Create draft' }}</el-button>
            </span>
        </el-dialog>

        <!-- ── test send ── -->
        <el-dialog title="Send a test" :visible.sync="test.open" width="520px" append-to-body>
            <div class="cp-hint cp-mb">The test goes as its own Zoho campaign, subject marked [TEST], to one small list ({{ options.testListMax }} contacts or fewer). Contacts must be "Marketing" in Zoho to receive it.</div>
            <el-radio-group v-model="test.listKey" class="cp-lists">
                <el-radio v-for="l in testLists" :key="l.key" :label="l.key" class="cp-list-row">{{ l.name }} <span class="cp-dim">· {{ l.contacts }} contact{{ l.contacts === 1 ? '' : 's' }}</span></el-radio>
            </el-radio-group>
            <div v-if="!testLists.length" class="cp-dim">No list in Zoho is small enough for a test.</div>
            <span slot="footer">
                <el-button size="small" @click="test.open = false">Cancel</el-button>
                <el-button size="small" type="primary" :loading="test.sending" :disabled="!test.listKey" @click="doTest">Send test</el-button>
            </span>
        </el-dialog>

        <!-- ── the real send ── -->
        <el-dialog title="Send campaign" :visible.sync="send.open" width="580px" :close-on-click-modal="false" append-to-body>
            <div v-if="current" class="cp-mb">
                <b>{{ current.name }}</b><div class="cp-dim">{{ current.subject }} · from {{ current.fromName }} &lt;{{ current.fromEmail }}&gt;</div>
            </div>
            <div class="cp-label">Send to</div>
            <el-checkbox-group v-model="send.listKeys" class="cp-lists">
                <el-checkbox v-for="l in options.lists" :key="l.key" :label="l.key" class="cp-list-row">{{ l.name }} <span class="cp-dim">· {{ l.contacts.toLocaleString() }} contact{{ l.contacts === 1 ? '' : 's' }}</span></el-checkbox>
            </el-checkbox-group>
            <div class="cp-hint">Zoho only delivers to contacts whose Subscription Type is <b>Marketing</b> and who are in the campaign's topic, so fewer may receive it than the count shows.</div>
            <template v-if="send.listKeys.length">
                <el-alert type="warning" :closable="false" show-icon class="cd-alert"
                    :title="`This emails ${sendTotal.toLocaleString()} contact${sendTotal === 1 ? '' : 's'} and can't be undone.`" />
                <div class="cp-label">Type <b>{{ sendTotal }}</b> to confirm</div>
                <el-input v-model="send.confirm" size="small" class="cp-confirm" :placeholder="String(sendTotal)" @keyup.enter.native="doSend" />
            </template>
            <span slot="footer">
                <el-button size="small" :disabled="send.sending" @click="send.open = false">Cancel</el-button>
                <el-button size="small" type="danger" :loading="send.sending" :disabled="!sendReady" @click="doSend">Send to {{ sendTotal.toLocaleString() }}</el-button>
            </span>
        </el-dialog>

        <!-- ── for the agent ── -->
        <el-dialog title="Agent API — create campaign drafts" :visible.sync="apiVisible" width="720px" append-to-body>
            <div class="cp-hint cp-mb">Another agent can create drafts here. It can't send — every draft waits in "Awaiting review" until someone previews and sends it on this page.</div>
            <div class="cp-label">Create a draft</div>
            <pre class="cp-code">POST {{ apiBase }}/integration/campaigns
x-campaign-key: &lt;the CAMPAIGN_AGENT_KEY set on the server&gt;

multipart/form-data:
  name, subject              required
  fromName, fromEmail        optional (default iMobile &lt;sales@imobilestore.com.au&gt;)
  notes, agentName           optional
  zip                        the design tool's zip (an .html file + images/)
  — or html (file) + images (files)

— or JSON (up to 20 MB):
  { "name", "subject", "html" | "zipBase64", "text"?, "notes"?, "agentName"?,
    "images"?: [{ "filename", "contentBase64" }] }</pre>
            <div class="cp-label">Check it later</div>
            <pre class="cp-code">GET {{ apiBase }}/integration/campaigns/&lt;id&gt;   → status: draft · sent · failed, and the summary once sent</pre>
            <div class="cp-hint">Relative image paths (images/x.png) are hosted and linked, other tools' unsubscribe placeholders become Zoho's, scripts are removed, and anything odd comes back as warnings. The key is a server setting (CAMPAIGN_AGENT_KEY) — ask an admin; it isn't shown here.</div>
        </el-dialog>
    </div>
</template>

<script>
import { hasPermission } from '@/utils/permission'
import CampaignSummary from './components/CampaignSummary'
import {
    listCampaigns, campaignOptions, zohoCampaignHistory, createCampaign, getCampaign, updateCampaign,
    deleteCampaign, testCampaign, sendCampaign
} from '@/api/website'

const STATUS = {
    draft: { label: 'Draft', tag: 'warning' },
    sending: { label: 'Sending…', tag: '' },
    failed: { label: 'Send failed', tag: 'danger' },
    sent: { label: 'Sent', tag: 'success' }
}
const emptyEditor = () => ({ open: false, id: null, name: '', subject: '', fromName: 'iMobile', fromEmail: 'sales@imobilestore.com.au', notes: '', file: null, images: [], over: false, saving: false })

export default {
    name: 'WebsiteCampaigns',
    components: { CampaignSummary },
    data() {
        return {
            STATUS,
            tab: 'review',
            rows: [],
            counts: { review: 0, sent: 0 },
            history: [],
            loading: false,
            options: { lists: [], topics: [], senders: ['sales@imobilestore.com.au'], testListMax: 10 },
            drawerOpen: false,
            drawerTab: 'preview',
            current: null,
            currentLoading: false,
            historyItem: null,
            device: 'desktop',
            editor: emptyEditor(),
            test: { open: false, listKey: '', sending: false },
            send: { open: false, listKeys: [], confirm: '', sending: false },
            apiVisible: false
        }
    },
    computed: {
        canEdit() {
            return hasPermission(this.$store.getters.permissions, 'web:campaign:edit')
        },
        canSend() {
            return hasPermission(this.$store.getters.permissions, 'web:campaign:send')
        },
        editable() {
            return this.current && (this.current.status === 'draft' || this.current.status === 'failed')
        },
        tabHint() {
            if (this.tab === 'review') return 'Drafts waiting to be previewed and sent'
            if (this.tab === 'sent') return 'Sent from this page — open one for its summary'
            return 'Every campaign in Zoho, including ones sent straight from Zoho'
        },
        testLists() {
            return this.options.lists.filter(l => l.contacts > 0 && l.contacts <= this.options.testListMax)
        },
        sendTotal() {
            return this.options.lists.filter(l => this.send.listKeys.includes(l.key)).reduce((t, l) => t + l.contacts, 0)
        },
        sendReady() {
            return this.send.listKeys.length > 0 && String(this.send.confirm).trim() === String(this.sendTotal)
        },
        apiBase() {
            const base = process.env.VUE_APP_BASE_API || ''
            return /^https?:/i.test(base) ? base.replace(/\/+$/, '') : `${window.location.origin}${base}`
        }
    },
    watch: {
        '$route.query.id'(id) {
            if (id && this.$route.name === 'WebsiteCampaigns') this.openById(id)
        }
    },
    created() {
        this.load()
        this.loadOptions(false)
        if (this.$route.query.id) this.openById(this.$route.query.id)
    },
    methods: {
        errText(e, fallback) {
            return (e && e.response && e.response.data && e.response.data.message) || (e && e.message) || fallback
        },
        async load() {
            this.loading = true
            try {
                if (this.tab === 'zoho') {
                    const r = await zohoCampaignHistory()
                    this.history = (r && r.rows) || []
                } else {
                    const r = await listCampaigns(this.tab)
                    this.rows = (r && r.rows) || []
                    this.counts = (r && r.counts) || this.counts
                }
            } catch (e) {
                this.$message.error(this.errText(e, 'Could not load the campaigns'))
            } finally {
                this.loading = false
            }
        },
        async loadOptions(refresh) {
            try {
                const r = await campaignOptions(refresh)
                if (r && r.success !== false) this.options = { ...this.options, ...r }
            } catch (e) {
                this.$message.warning(this.errText(e, 'Could not read the Zoho lists'))
            }
        },
        // ── drawer ──
        openCampaign(row) {
            this.openById(String(row._id), row.status === 'sent' ? 'summary' : 'preview')
        },
        async openById(id, tab) {
            this.historyItem = null
            this.drawerTab = tab || 'preview'
            this.drawerOpen = true
            this.currentLoading = true
            try {
                const r = await getCampaign(id)
                this.current = r.campaign
                if (!tab) this.drawerTab = this.current.status === 'sent' ? 'summary' : 'preview'
            } catch (e) {
                this.drawerOpen = false
                this.$message.error(this.errText(e, 'Could not open the campaign'))
            } finally {
                this.currentLoading = false
            }
        },
        openHistory(row) {
            if (row.campaignId) return this.openById(row.campaignId, 'summary')
            if (!/sent/i.test(row.status)) return
            this.current = null
            this.historyItem = row
            this.drawerOpen = true
        },
        closeDrawer() {
            this.current = null
            this.historyItem = null
            if (this.$route.query.id) this.$router.replace({ query: {} })
        },
        async refreshCurrent() {
            if (!this.current) return
            const r = await getCampaign(this.current._id)
            this.current = r.campaign
        },
        // ── new / edit ──
        openEditor(c) {
            this.editor = emptyEditor()
            if (c) Object.assign(this.editor, { id: String(c._id), name: c.name, subject: c.subject, fromName: c.fromName, fromEmail: c.fromEmail, notes: c.notes || '' })
            this.editor.open = true
        },
        setFile(file) {
            if (!file) return
            if (!/\.(zip|html?)$/i.test(file.name)) return this.$message.warning('Choose a .zip or an .html file')
            this.editor.file = file
            this.editor.images = []
        },
        onPickContent(e) {
            this.setFile(e.target.files[0])
            e.target.value = ''
        },
        onDropContent(e) {
            this.editor.over = false
            this.setFile(e.dataTransfer && e.dataTransfer.files[0])
        },
        onPickImages(e) {
            this.editor.images = Array.from(e.target.files || [])
            e.target.value = ''
        },
        async saveEditor() {
            const ed = this.editor
            if (!ed.name.trim() || !ed.subject.trim()) return this.$message.warning('Add a name and a subject')
            if (!ed.id && !ed.file) return this.$message.warning('Add the email content (.zip or .html)')
            const fd = new FormData()
            for (const k of ['name', 'subject', 'fromName', 'fromEmail', 'notes']) fd.append(k, ed[k] || '')
            if (ed.file) fd.append(/\.zip$/i.test(ed.file.name) ? 'zip' : 'html', ed.file, ed.file.name)
            ed.images.forEach(f => fd.append('images', f, f.name))
            ed.saving = true
            try {
                const r = ed.id ? await updateCampaign(ed.id, fd) : await createCampaign(fd)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(ed.id ? 'Saved' : 'Draft created')
                ed.open = false
                this.tab = 'review'
                await this.load()
                if (ed.id && this.current) await this.refreshCurrent()
                else if (r.campaign) this.openById(String(r.campaign._id), 'preview')
            } catch (e) {
                this.$message.error(this.errText(e, 'Could not save the campaign'))
            } finally {
                ed.saving = false
            }
        },
        // From the open campaign, or straight from a row in the list.
        async remove(row) {
            const c = row && row._id ? row : this.current
            if (!c) return
            try {
                await this.$confirm(`Delete the draft "${c.name}"? This can't be undone.`, 'Delete draft', { type: 'warning', confirmButtonText: 'Delete', cancelButtonText: 'Cancel' })
            } catch (e) {
                return
            }
            try {
                await deleteCampaign(c._id)
                this.$message.success('Draft deleted')
                if (this.current && String(this.current._id) === String(c._id)) this.drawerOpen = false
                this.load()
            } catch (e) {
                this.$message.error(this.errText(e, 'Could not delete the draft'))
            }
        },
        // ── test ──
        openTest() {
            this.test = { open: true, listKey: (this.testLists[0] || {}).key || '', sending: false }
            this.loadOptions(true)
        },
        async doTest() {
            this.test.sending = true
            try {
                await testCampaign(this.current._id, this.test.listKey)
                this.$message.success('Test sent — check the inbox')
                this.test.open = false
                this.drawerTab = 'tests'
            } catch (e) {
                this.$message.error(this.errText(e, 'The test could not be sent'))
            } finally {
                this.test.sending = false
                this.refreshCurrent()
            }
        },
        // ── the real send ──
        openSend() {
            this.send = { open: true, listKeys: [], confirm: '', sending: false }
            this.loadOptions(true)
        },
        async doSend() {
            if (!this.sendReady || this.send.sending) return
            this.send.sending = true
            try {
                const r = await sendCampaign(this.current._id, this.send.listKeys, Number(this.send.confirm))
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(`Sent to ${this.sendTotal.toLocaleString()} contacts`)
                this.send.open = false
                this.tab = 'sent'
                this.load()
                await this.refreshCurrent()
                this.drawerTab = 'summary'
            } catch (e) {
                this.$message.error(this.errText(e, 'The campaign could not be sent'))
                this.refreshCurrent()
                this.load()
            } finally {
                this.send.sending = false
            }
        },
        // ── formatting ──
        when(t) {
            if (!t) return '—'
            return new Date(t).toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
        },
        pct(v) {
            return `${Number(v || 0).toFixed(1)}%`
        },
        listNames(c) {
            return ((c.send && c.send.lists) || []).map(l => l.name).join(', ') || '—'
        },
        size(b) {
            return b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`
        }
    }
}
</script>

<style scoped>
.cp-head { display: flex; align-items: flex-end; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
.cp-title { font-size: 18px; font-weight: 600; color: #303133; }
.cp-sub { font-size: 12px; color: #909399; margin-top: 2px; max-width: 760px; }
.cp-spacer { flex: 1; }
.cp-card { background: #fff; border: 1px solid #ebeef5; border-radius: 8px; padding: 12px; }
.cp-card-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
.cp-table >>> .cp-row, .cp-card >>> .cp-row { cursor: pointer; }
.cp-name { color: #303133; font-weight: 500; }
.cp-dim { font-size: 12px; color: #909399; }
.cp-mono { font-variant-numeric: tabular-nums; }
.cp-open { font-size: 12px; color: #409eff; white-space: nowrap; }
.cp-row-del { color: #f56c6c; margin-left: 10px; padding: 0; }
.cp-row-del:hover { color: #f78989; }
.cp-link { font-size: 12px; color: #409eff; }
.cp-warn-dot { font-size: 11px; color: #e6a23c; margin-top: 2px; }
.cp-ok { color: #67c23a; }
.cp-bad { color: #f56c6c; }
.cp-hint { font-size: 12px; color: #909399; line-height: 1.5; }
.cp-mb { margin-bottom: 12px; }
.cp-label { font-size: 13px; font-weight: 600; color: #303133; margin: 12px 0 6px; }
.cp-full { width: 100%; }
.cp-hidden { display: none; }
.cp-drop {
    border: 1px dashed #c0c4cc; border-radius: 6px; padding: 14px; text-align: center; cursor: pointer;
    color: #606266; font-size: 13px; line-height: 1.6; transition: border-color .15s, background .15s;
}
.cp-drop i { font-size: 26px; color: #c0c4cc; }
.cp-drop em { color: #409eff; font-style: normal; }
.cp-drop:hover, .cp-drop.over { border-color: #409eff; background: #f5faff; }
.cp-imgs-btn { margin-top: 6px; }
.cp-lists { display: flex; flex-direction: column; gap: 6px; max-height: 260px; overflow-y: auto; margin-bottom: 8px; }
.cp-list-row { margin-left: 0 !important; }
.cp-confirm { width: 200px; }
.cp-code { background: #f5f7fa; border: 1px solid #ebeef5; border-radius: 6px; padding: 10px 12px; font-size: 12px; white-space: pre-wrap; margin: 0 0 8px; }
.cd { padding: 18px 22px; }
.cd-head { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.cd-title { font-size: 17px; font-weight: 600; color: #303133; }
.cd-del { color: #f56c6c; }
.cd-info { font-size: 13px; color: #606266; display: grid; gap: 4px; margin-bottom: 10px; }
.cd-k { display: inline-block; width: 80px; color: #909399; }
.cd-notes { white-space: pre-wrap; }
.cd-alert { margin-bottom: 8px; }
.cd-pv-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
.cd-pv-box { background: #f0f1f5; border: 1px solid #ebeef5; border-radius: 6px; padding: 12px; display: flex; justify-content: center; }
.cd-pv-frame { border: 0; background: #fff; height: 70vh; box-shadow: 0 1px 4px rgba(0,0,0,.08); transition: width .2s; }
.cd-pv-frame.desktop { width: 100%; max-width: 760px; }
.cd-pv-frame.mobile { width: 390px; }
.cd-assets { display: flex; flex-wrap: wrap; gap: 10px; }
.cd-asset { width: 120px; text-decoration: none; color: #606266; font-size: 11px; }
.cd-asset img { width: 120px; height: 90px; object-fit: contain; background: #f5f7fa; border: 1px solid #ebeef5; border-radius: 4px; display: block; }
.cd-asset span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px; }
</style>
