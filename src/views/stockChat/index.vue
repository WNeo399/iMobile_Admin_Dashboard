<template>
    <!-- The customer's stock chat (2026-11-16): opened from the link staff send
         on WhatsApp — /stock/<token>, no dashboard login. -->
    <div class="sc">
        <header class="sc-head">
            <img :src="logo" alt="iMobile" class="sc-logo">
            <div class="sc-head-text">
                <div class="sc-title">Stock check</div>
                <div v-if="name" class="sc-sub">Hi {{ name }}</div>
            </div>
            <!-- clears this screen only — the questions stay in our log (user 2026-11-17) -->
            <button v-if="state === 'ready' && messages.length" type="button" class="sc-clear" :disabled="sending" @click="clearChat">
                <i class="el-icon-delete" /> Clear chat
            </button>
        </header>

        <main ref="list" class="sc-body">
            <div v-if="state === 'loading'" class="sc-center"><i class="el-icon-loading" /> Loading…</div>
            <div v-else-if="state === 'dead'" class="sc-center sc-dead">
                <i class="el-icon-lock" />
                <p>{{ deadMessage }}</p>
            </div>
            <template v-else>
                <div class="sc-msg sc-bot">
                    <div class="sc-bubble">{{ welcome }}</div>
                    <div v-if="!messages.length" class="sc-chips">
                        <button v-for="s in suggestions" :key="s" type="button" class="sc-chip" :disabled="sending" @click="ask(s)">{{ s }}</button>
                    </div>
                </div>

                <div v-for="(m, i) in messages" :key="i" :class="['sc-msg', m.role === 'user' ? 'sc-me' : 'sc-bot']">
                    <div v-if="m.text" :class="['sc-bubble', { 'sc-error': m.error }]">{{ m.text }}</div>
                    <!-- broad questions: a compact list grouped by model (user 2026-11-16) -->
                    <div v-if="m.rows && m.rows.length && isList(m)" class="sc-list">
                        <div class="sc-lhead">
                            <span>Storage</span><span>Grade</span><span class="sc-r">Qty</span><span class="sc-r">Price</span>
                        </div>
                        <div v-for="(grp, j) in grouped(m.rows)" :key="j" class="sc-lgroup">
                            <div class="sc-lmodel">
                                <span>{{ grp.model }}</span>
                                <span class="sc-lcount">{{ grp.qty }} available</span>
                            </div>
                            <div v-for="(r, k) in grp.rows" :key="k" class="sc-lrow">
                                <span>{{ r.storage || '—' }}</span>
                                <span :class="['sc-lgrade', { 'sc-muted': r.grade === 'Ungraded' }]">{{ r.grade }}</span>
                                <span class="sc-r">{{ r.qty }}</span>
                                <span class="sc-r sc-lprice">
                                    <template v-if="r.price != null">{{ money(r) }}</template>
                                    <span v-else class="sc-contact">Contact us</span>
                                </span>
                            </div>
                        </div>
                        <div v-if="priceNote" class="sc-note sc-lnote">{{ priceNote }}</div>
                    </div>
                    <div v-else-if="m.rows && m.rows.length" class="sc-cards">
                        <div v-for="(r, j) in m.rows" :key="j" class="sc-card">
                            <div class="sc-card-top">
                                <span class="sc-model">{{ r.model }}</span>
                                <span class="sc-qty">{{ r.qty }} available</span>
                            </div>
                            <div class="sc-specs">
                                <span v-if="r.storage" class="sc-tag">{{ r.storage }}</span>
                                <span class="sc-tag sc-grade">{{ r.grade === 'Ungraded' ? 'Ungraded' : 'Grade ' + r.grade }}</span>
                                <span v-if="r.colors && r.colors.length" class="sc-colors">{{ r.colors.map(titleCase).join(', ') }}</span>
                            </div>
                            <div class="sc-price">
                                <template v-if="r.price != null">{{ money(r) }}</template>
                                <span v-else class="sc-contact">Contact us</span>
                            </div>
                        </div>
                        <div v-if="priceNote" class="sc-note">{{ priceNote }}</div>
                    </div>
                </div>

                <div v-if="sending" class="sc-msg sc-bot">
                    <div class="sc-bubble sc-typing"><span /><span /><span /></div>
                </div>
            </template>
        </main>

        <footer v-if="state === 'ready'" class="sc-foot">
            <form class="sc-input" @submit.prevent="ask(draft)">
                <textarea ref="box" v-model="draft" rows="1" maxlength="500" placeholder="e.g. iPhone 13 128GB in A grade?"
                    :disabled="sending || outOfQuestions" @keydown.enter.exact.prevent="ask(draft)" />
                <button type="submit" class="sc-send" :disabled="sending || !draft.trim() || outOfQuestions" aria-label="Send">
                    <i class="el-icon-s-promotion" />
                </button>
            </form>
            <div class="sc-meta">
                <span v-if="limit">{{ leftText }}</span>
                <span>To order, message us on WhatsApp</span>
            </div>
        </footer>
    </div>
</template>

<script>
import { IMOBILE_LOGO } from '@/utils/blackbeltLogos'
import { getStockChatSession, askStockChat } from '@/api/stockChat'

const HISTORY = 10

export default {
    name: 'StockChatPublic',
    data() {
        return {
            logo: IMOBILE_LOGO,
            token: this.$route.params.token,
            state: 'loading', // loading | ready | dead
            deadMessage: '',
            name: '',
            priceNote: '',
            used: 0,
            limit: 0,
            messages: [],
            draft: '',
            sending: false,
            suggestions: ['What iPhones do you have?', 'iPad 9th Gen prices', 'Any iPhone 13 128GB?']
        }
    },
    computed: {
        left() {
            return Math.max(this.limit - this.used, 0)
        },
        // a limit of 0 = no limit
        outOfQuestions() {
            return this.limit > 0 && this.used >= this.limit
        },
        welcome() {
            return `Hi${this.name ? ' ' + this.name : ''}! Ask me about iMobile's refurbished stock — what's available, quantities and prices.`
        },
        leftText() {
            return this.left > 0 ? `${this.left} of ${this.limit} questions left today` : "You've used today's questions"
        },
        storeKey() {
            return 'stock-chat:' + this.token
        }
    },
    async mounted() {
        document.title = 'iMobile — Stock check'
        try {
            const s = await getStockChatSession(this.token)
            this.name = s.name || ''
            this.priceNote = s.priceNote || ''
            this.used = s.used || 0
            this.limit = s.limit || 0
            this.restore()
            this.state = 'ready'
            this.scrollDown()
        } catch (e) {
            this.deadMessage = e.message
            this.state = 'dead'
        }
    },
    methods: {
        async ask(text) {
            const q = String(text || '').trim()
            if (!q || this.sending || this.outOfQuestions) return
            this.messages.push({ role: 'user', text: q })
            this.draft = ''
            this.sending = true
            this.scrollDown()
            try {
                const r = await askStockChat(this.token, this.history())
                this.messages.push({ role: 'assistant', text: r.answer || '', rows: r.rows || [], layout: r.layout || 'cards' })
                if (r.priceNote !== undefined) this.priceNote = r.priceNote
                this.used = r.used
                this.limit = r.limit
            } catch (e) {
                this.messages.push({ role: 'assistant', text: e.message, error: true })
                if (e.body && e.body.used !== undefined) { this.used = e.body.used; this.limit = e.body.limit }
                if (e.status === 404) { this.deadMessage = e.message; this.state = 'dead' }
            } finally {
                this.sending = false
                this.save()
                this.scrollDown()
            }
        },
        // What the server gets: the last few turns as text — a shown table
        // summarised, so a follow-up ("any in blue?") has its context.
        history() {
            return this.messages
                .filter(m => !m.error)
                .slice(-(HISTORY + 1))
                .map(m => {
                    let text = m.text || ''
                    if (m.role === 'assistant' && m.rows && m.rows.length) {
                        // a long list only by model, so the context stays small
                        text += m.rows.length > 12
                            ? `\n(List shown: ${m.rows.length} rows — ${[...new Set(m.rows.map(r => r.model))].join(', ')})`.slice(0, 1500)
                            : '\n(Table shown: ' + m.rows.map(r => `${r.model} ${r.storage || ''} grade ${r.grade} x${r.qty}`).join('; ') + ')'
                    }
                    return { role: m.role, text }
                })
        },
        isList(m) {
            return m.layout === 'list' || (!m.layout && m.rows.length > 8)
        },
        // consecutive rows of one model under one heading (the server sorts them)
        grouped(rows) {
            const out = []
            for (const r of rows) {
                let g = out[out.length - 1]
                if (!g || g.model !== r.model) { g = { model: r.model, qty: 0, rows: [] }; out.push(g) }
                g.qty += r.qty
                g.rows.push(r)
            }
            return out
        },
        money(r) {
            const n = Number(r.price)
            return `${r.currency || 'AUD'} ${n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        },
        titleCase(s) {
            return String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
        },
        scrollDown() {
            this.$nextTick(() => {
                const el = this.$refs.list
                if (el) el.scrollTop = el.scrollHeight
            })
        },
        // Clear the conversation on this screen and start fresh: the AI no
        // longer sees the earlier questions. Our question log (Stock Chat →
        // Questions asked) and today's count are untouched.
        clearChat() {
            if (this.sending || !this.messages.length) return
            this.$confirm('Clear this chat? Your questions and answers are removed from this screen.', 'Clear chat', {
                confirmButtonText: 'Clear', cancelButtonText: 'Cancel', type: 'warning', customClass: 'sc-confirm'
            }).then(() => {
                this.messages = []
                try { sessionStorage.removeItem(this.storeKey) } catch (e) { /* storage off */ }
                this.scrollDown()
            }).catch(() => {})
        },
        // The conversation survives a refresh (this tab only).
        save() {
            try { sessionStorage.setItem(this.storeKey, JSON.stringify(this.messages.slice(-40))) } catch (e) { /* storage off */ }
        },
        restore() {
            try {
                const m = JSON.parse(sessionStorage.getItem(this.storeKey) || '[]')
                if (Array.isArray(m)) this.messages = m
            } catch (e) { /* storage off */ }
        }
    }
}
</script>

<style lang="scss" scoped>
$blue: #1f5fbf;
.sc {
    position: fixed; top: 0; right: 0; bottom: 0; left: 0; display: flex; flex-direction: column;
    background: #f3f5f9; color: #1f2937;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
}
.sc-head {
    display: flex; align-items: center; gap: 12px; padding: 10px 16px;
    background: #fff; border-bottom: 1px solid #e5e7eb; flex: none;
}
.sc-logo { height: 30px; width: auto; }
.sc-title { font-size: 16px; font-weight: 700; }
.sc-sub { font-size: 12px; color: #6b7280; }
.sc-clear {
    margin-left: auto; flex: none; display: inline-flex; align-items: center; gap: 4px;
    border: 1px solid #d1d5db; background: #fff; color: #4b5563; border-radius: 999px;
    padding: 6px 12px; font-size: 13px; cursor: pointer;
}
.sc-clear:disabled { opacity: .5; cursor: default; }
.sc-body { flex: 1; overflow-y: auto; padding: 16px; -webkit-overflow-scrolling: touch; }
.sc-body > * { max-width: 760px; margin-left: auto; margin-right: auto; }
.sc-center { text-align: center; color: #6b7280; margin-top: 30vh; }
.sc-dead i { font-size: 34px; color: #9ca3af; }
.sc-dead p { max-width: 320px; margin: 12px auto; line-height: 1.5; }
.sc-msg { display: flex; flex-direction: column; margin-bottom: 14px; }
.sc-me { align-items: flex-end; }
.sc-bot { align-items: flex-start; }
.sc-bubble {
    max-width: 85%; padding: 10px 14px; border-radius: 16px; line-height: 1.5; font-size: 15px;
    white-space: pre-wrap; word-break: break-word;
}
.sc-bot .sc-bubble { background: #fff; border: 1px solid #e5e7eb; border-top-left-radius: 4px; }
.sc-me .sc-bubble { background: $blue; color: #fff; border-top-right-radius: 4px; }
.sc-error { background: #fef2f2 !important; border-color: #fecaca !important; color: #b91c1c; }
.sc-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.sc-chip {
    border: 1px solid #c7d7f2; background: #fff; color: $blue; border-radius: 999px;
    padding: 7px 12px; font-size: 13px; cursor: pointer;
}
.sc-chip:disabled { opacity: .5; }
.sc-cards {
    width: 100%; margin-top: 8px; display: grid; gap: 8px;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
}
.sc-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 10px 12px; }
.sc-card-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.sc-model { font-weight: 700; font-size: 14px; }
.sc-qty { font-size: 12px; color: #047857; white-space: nowrap; font-weight: 600; }
.sc-specs { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 6px; }
.sc-tag { font-size: 12px; background: #eef2f7; border-radius: 6px; padding: 2px 7px; }
.sc-grade { background: #e8f0fc; color: $blue; }
.sc-colors { font-size: 12px; color: #6b7280; }
.sc-price { margin-top: 8px; font-size: 16px; font-weight: 700; }
.sc-contact { font-size: 14px; color: #b45309; font-weight: 600; }
.sc-note { grid-column: 1 / -1; font-size: 12px; color: #6b7280; }
.sc-list {
    width: 100%; max-width: 560px; margin-top: 8px; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;
    padding: 4px 12px 10px; font-size: 14px;
}
.sc-lhead, .sc-lrow { display: grid; grid-template-columns: 70px 1fr 44px 104px; gap: 8px; align-items: baseline; }
.sc-lhead {
    font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: .03em;
    padding: 6px 0; border-bottom: 1px solid #e5e7eb;
}
.sc-lgroup { padding: 8px 0 4px; border-bottom: 1px solid #f0f2f5; }
.sc-lgroup:last-of-type { border-bottom: 0; }
.sc-lmodel { display: flex; justify-content: space-between; gap: 8px; font-weight: 700; margin-bottom: 2px; }
.sc-lcount { font-size: 12px; font-weight: 600; color: #047857; white-space: nowrap; }
.sc-lrow { padding: 3px 0; color: #374151; }
.sc-lgrade { color: $blue; font-weight: 600; }
.sc-lprice { font-weight: 700; white-space: nowrap; }
.sc-lprice .sc-contact { font-size: 13px; }
.sc-lnote { padding-top: 8px; }
.sc-muted { color: #9ca3af; font-weight: 500; }
.sc-r { text-align: right; }
.sc-typing { display: flex; gap: 4px; padding: 14px; }
.sc-typing span { width: 7px; height: 7px; border-radius: 50%; background: #9ca3af; animation: sc-dot 1.2s infinite ease-in-out; }
.sc-typing span:nth-child(2) { animation-delay: .15s; }
.sc-typing span:nth-child(3) { animation-delay: .3s; }
@keyframes sc-dot { 0%, 80%, 100% { opacity: .3; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
.sc-foot { flex: none; background: #fff; border-top: 1px solid #e5e7eb; padding: 10px 16px calc(10px + env(safe-area-inset-bottom)); }
.sc-input { display: flex; gap: 8px; align-items: flex-end; max-width: 760px; margin: 0 auto; }
.sc-input textarea {
    flex: 1; resize: none; border: 1px solid #d1d5db; border-radius: 12px; padding: 10px 12px;
    font: inherit; font-size: 16px; line-height: 1.4; max-height: 120px; outline: none;
}
.sc-input textarea:focus { border-color: $blue; }
.sc-send {
    flex: none; width: 44px; height: 44px; border: 0; border-radius: 50%; background: $blue; color: #fff;
    font-size: 20px; cursor: pointer;
}
.sc-send:disabled { background: #9db5dc; cursor: default; }
.sc-meta {
    display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap;
    max-width: 760px; margin: 6px auto 0; font-size: 12px; color: #6b7280;
}
</style>

<style lang="scss">
/* the Clear chat confirm box lives on <body> (outside the scoped styles):
   Element's 420 px box is wider than a phone */
.el-message-box.sc-confirm { width: 420px; max-width: calc(100vw - 32px); }
</style>
