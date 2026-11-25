<template>
    <!-- The customer's stock chat (2026-11-16): opened from the link staff send
         on WhatsApp — /stock/<token>, no dashboard login. Ordering (2026-11-25):
         Add on a shown row → the order bar → Place order (a chat order, CO-,
         that our team confirms); My orders lists them. -->
    <div class="sc">
        <header class="sc-head">
            <img :src="logo" alt="iMobile" class="sc-logo">
            <div class="sc-head-text">
                <div class="sc-title">Stock check</div>
                <div v-if="name" class="sc-sub">Hi {{ name }}</div>
            </div>
            <div v-if="state === 'ready'" class="sc-head-acts">
                <button type="button" class="sc-clear" @click="openOrders">
                    <i class="el-icon-tickets" /> My orders
                </button>
                <!-- clears this screen only — the questions stay in our log (user 2026-11-17) -->
                <button v-if="messages.length" type="button" class="sc-clear" :disabled="sending" @click="clearChat">
                    <i class="el-icon-delete" /> Clear chat
                </button>
            </div>
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
                            <span>Storage</span><span>Grade</span><span class="sc-r">Qty</span><span class="sc-r">Price</span><span />
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
                                <button type="button" :class="['sc-ladd', { 'sc-ladded': inCart(r) }]" :aria-label="inCart(r) ? 'In your order' : 'Add to order'"
                                    @click="addToCart(r)">{{ inCart(r) ? '✓' : '+' }}</button>
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
                                <span class="sc-tag sc-grade">{{ gradeText(r.grade) }}</span>
                                <span v-if="r.colors && r.colors.length" class="sc-colors">{{ r.colors.map(titleCase).join(', ') }}</span>
                            </div>
                            <div class="sc-price">
                                <span>
                                    <template v-if="r.price != null">{{ money(r) }}</template>
                                    <span v-else class="sc-contact">Contact us</span>
                                </span>
                                <button type="button" :class="['sc-add', { 'sc-added': inCart(r) }]" @click="addToCart(r)">
                                    {{ inCart(r) ? '✓ ' + inCart(r).qty + ' in order' : 'Add' }}
                                </button>
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
            <div v-if="cart.length" class="sc-orderbar">
                <span class="sc-ob-text"><b>{{ cartUnits }}</b> {{ cartUnits === 1 ? 'item' : 'items' }} · {{ cartTotalText }}</span>
                <button type="button" class="sc-ob-btn" @click="panel = 'cart'">Review order</button>
            </div>
            <form class="sc-input" @submit.prevent="ask(draft)">
                <textarea ref="box" v-model="draft" rows="1" maxlength="500" placeholder="e.g. iPhone 13 128GB in A grade?"
                    :disabled="sending || outOfQuestions" @keydown.enter.exact.prevent="ask(draft)" />
                <button type="submit" class="sc-send" :disabled="sending || !draft.trim() || outOfQuestions" aria-label="Send">
                    <i class="el-icon-s-promotion" />
                </button>
            </form>
            <div class="sc-meta">
                <span v-if="limit">{{ leftText }}</span>
                <span>To order, tap Add on an item</span>
            </div>
        </footer>

        <!-- ── order panel: the cart, the order sent, my orders ───────── -->
        <div v-if="panel" class="sc-sheet-wrap" @click.self="closePanel">
            <div class="sc-sheet" role="dialog" :aria-label="panelTitle">
                <div class="sc-sheet-head">
                    <b>{{ panelTitle }}</b>
                    <button type="button" class="sc-x" aria-label="Close" @click="closePanel">×</button>
                </div>

                <div v-if="panel === 'cart'" class="sc-sheet-body">
                    <p v-if="!cart.length" class="sc-empty">Your order is empty. Tap Add on any item in the chat.</p>
                    <div v-for="(c, i) in cart" :key="c.key" class="sc-cline">
                        <div class="sc-cname">
                            <b>{{ c.model }}</b>
                            <span class="sc-cspec">{{ [c.storage, gradeText(c.grade)].filter(Boolean).join(' · ') }}</span>
                        </div>
                        <div class="sc-cctl">
                            <select v-if="c.colors.length > 1" v-model="c.color" class="sc-csel" @change="saveCart">
                                <option :value="null">Any colour</option>
                                <option v-for="col in c.colors" :key="col" :value="col">{{ titleCase(col) }}</option>
                            </select>
                            <span v-else-if="c.colors.length === 1" class="sc-cspec">{{ titleCase(c.colors[0]) }}</span>
                            <span v-else />
                            <div class="sc-step">
                                <button type="button" :disabled="c.qty <= 1" aria-label="One less" @click="step(c, -1)">−</button>
                                <input v-model.number="c.qty" type="number" min="1" :max="c.max" inputmode="numeric" aria-label="Quantity" @change="clampQty(c)">
                                <button type="button" :disabled="c.qty >= c.max" aria-label="One more" @click="step(c, 1)">+</button>
                            </div>
                            <span class="sc-cprice">
                                <template v-if="c.price != null">{{ money({ price: c.price * c.qty, currency: c.currency }) }}</template>
                                <span v-else class="sc-contact">Price on request</span>
                            </span>
                            <button type="button" class="sc-crm" aria-label="Remove" @click="removeLine(i)">×</button>
                        </div>
                        <div v-if="problems[i]" class="sc-cprob">{{ problems[i] }}</div>
                    </div>
                    <template v-if="cart.length">
                        <textarea v-model="orderNote" class="sc-onote" rows="2" maxlength="500"
                            placeholder="Note for our team (optional) — e.g. delivery address or when you need it" @change="saveCart" />
                        <div class="sc-ctotal">
                            <span>Total <b>{{ cartTotalText }}</b></span>
                            <span class="sc-cnote">{{ priceNote }}</span>
                        </div>
                        <div v-if="orderError" class="sc-oerr">{{ orderError }}</div>
                        <button type="button" class="sc-place" :disabled="placing" @click="placeOrder">
                            <i v-if="placing" class="el-icon-loading" /> {{ placing ? 'Checking…' : 'Place order' }}
                        </button>
                        <p class="sc-fine">Our team confirms your order and arranges delivery and payment with you on WhatsApp. We hold the stock for {{ holdText }} while we confirm.</p>
                    </template>
                </div>

                <div v-else-if="panel === 'placed' && placed" class="sc-sheet-body sc-done">
                    <i class="el-icon-circle-check" />
                    <h3>Order {{ placed.orderNo }} sent</h3>
                    <p>Our team will confirm it and contact you on WhatsApp about delivery and payment.
                        The stock is held for you until {{ when(placed.holdUntil) }}.</p>
                    <p v-if="placed.quoteNeeded">We'll also send you prices for the items marked "price on request".</p>
                    <div class="sc-done-acts">
                        <button type="button" class="sc-clear" @click="openOrders">My orders</button>
                        <button type="button" class="sc-place sc-place-sm" @click="closePanel">Done</button>
                    </div>
                </div>

                <div v-else-if="panel === 'orders'" class="sc-sheet-body">
                    <p v-if="ordersLoading" class="sc-empty"><i class="el-icon-loading" /> Loading…</p>
                    <p v-else-if="ordersError" class="sc-oerr">{{ ordersError }}</p>
                    <p v-else-if="!orders.length" class="sc-empty">No orders yet.</p>
                    <div v-for="o in orders" :key="o.orderNo" class="sc-ord">
                        <div class="sc-ord-top">
                            <b>{{ o.orderNo }}</b>
                            <span :class="['sc-st', 'sc-st-' + o.status]">{{ statusText(o.status) }}</span>
                        </div>
                        <div class="sc-cspec">{{ when(o.createdAt) }}</div>
                        <div v-for="(l, k) in o.items" :key="k" class="sc-ord-line">
                            {{ l.qty }} × {{ l.model }}
                            <span class="sc-cspec">{{ [l.storage, gradeText(l.grade), l.color ? titleCase(l.color) : ''].filter(Boolean).join(' · ') }}</span>
                            <span class="sc-ord-price">{{ l.unitPrice != null ? money({ price: l.lineTotal, currency: l.currency }) : 'price on request' }}</span>
                        </div>
                        <div class="sc-ord-total">
                            <template v-if="o.subtotal != null">Total {{ money({ price: o.subtotal, currency: o.currency }) }}</template>
                            <template v-if="o.quoteNeeded">{{ o.subtotal != null ? ' + ' : '' }}items to quote</template>
                        </div>
                        <div v-if="o.status === 'pending'" class="sc-cspec">Stock held until {{ when(o.holdUntil) }}</div>
                        <div v-if="o.status === 'cancelled' && o.cancelReason" class="sc-ord-why">
                            {{ o.cancelledBy === 'staff' ? 'Cancelled by iMobile' : 'Cancelled' }}: {{ o.cancelReason }}
                        </div>
                        <button v-if="o.status === 'pending'" type="button" class="sc-ord-cancel" :disabled="cancelling === o.orderNo" @click="cancelOrder(o)">
                            {{ cancelling === o.orderNo ? 'Cancelling…' : 'Cancel order' }}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import { IMOBILE_LOGO } from '@/utils/blackbeltLogos'
import { getStockChatSession, askStockChat, placeStockChatOrder, getStockChatOrders, cancelStockChatOrder } from '@/api/stockChat'

const HISTORY = 10
const STATUS_TEXT = {
    pending: 'Waiting for confirmation',
    confirmed: 'Confirmed',
    completed: 'Completed',
    cancelled: 'Cancelled',
    expired: 'Expired'
}

// a unique id for one placement, so a retried call never orders twice
function newRef() {
    try { if (window.crypto && window.crypto.randomUUID) return 'web-' + window.crypto.randomUUID() } catch (e) { /* older browser */ }
    return 'web-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}

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
            orderHoldHours: 24,
            messages: [],
            draft: '',
            sending: false,
            suggestions: ['What iPhones do you have?', 'iPad 9th Gen prices', 'Any iPhone 13 128GB?'],
            // ordering (2026-11-25)
            cart: [],
            orderNote: '',
            panel: '', // '' | cart | placed | orders
            placing: false,
            orderError: '',
            problems: {}, // cart index → what's wrong with that line
            clientRef: '',
            placed: null,
            orders: [],
            ordersLoading: false,
            ordersError: '',
            cancelling: ''
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
            return `Hi${this.name ? ' ' + this.name : ''}! Ask me about iMobile's refurbished stock — what's available, quantities and prices. Tap Add on anything you'd like to order.`
        },
        leftText() {
            return this.left > 0 ? `${this.left} of ${this.limit} questions left today` : "You've used today's questions"
        },
        storeKey() {
            return 'stock-chat:' + this.token
        },
        cartKey() {
            return 'stock-chat-cart:' + this.token
        },
        cartUnits() {
            return this.cart.reduce((s, c) => s + (Number(c.qty) || 0), 0)
        },
        cartTotalText() {
            const priced = this.cart.filter(c => c.price != null)
            const quote = this.cart.length > priced.length
            if (!priced.length) return 'price on request'
            const total = priced.reduce((s, c) => s + c.price * c.qty, 0)
            return this.money({ price: total, currency: priced[0].currency }) + (quote ? ' + items to quote' : '')
        },
        holdText() {
            const h = Number(this.orderHoldHours) || 24
            return h % 24 === 0 ? `${h / 24} day${h === 24 ? '' : 's'}` : `${h} hours`
        },
        panelTitle() {
            return this.panel === 'orders' ? 'My orders' : this.panel === 'placed' ? 'Order sent' : 'Your order'
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
            if (s.orderHoldHours) this.orderHoldHours = s.orderHoldHours
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
        gradeText(g) {
            return !g || g === 'Ungraded' ? 'Ungraded' : 'Grade ' + g
        },
        titleCase(s) {
            return String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
        },
        when(v) {
            if (!v) return '—'
            const d = new Date(v)
            if (isNaN(d.getTime())) return '—'
            return d.toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
        },
        statusText(s) {
            return STATUS_TEXT[s] || s
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
        // The conversation and the order being built survive a refresh (this tab only).
        save() {
            try { sessionStorage.setItem(this.storeKey, JSON.stringify(this.messages.slice(-40))) } catch (e) { /* storage off */ }
        },
        saveCart() {
            try { sessionStorage.setItem(this.cartKey, JSON.stringify({ cart: this.cart, note: this.orderNote })) } catch (e) { /* storage off */ }
        },
        restore() {
            try {
                const m = JSON.parse(sessionStorage.getItem(this.storeKey) || '[]')
                if (Array.isArray(m)) this.messages = m
            } catch (e) { /* storage off */ }
            try {
                const c = JSON.parse(sessionStorage.getItem(this.cartKey) || 'null')
                if (c && Array.isArray(c.cart)) { this.cart = c.cart; this.orderNote = c.note || '' }
            } catch (e) { /* storage off */ }
        },

        // ── ordering ──
        // A shown row is one cart line: model + storage + grade (+ its price,
        // since a priced and a Contact-us row of the same grade are two rows).
        lineKey(r) {
            return [r.model, r.storage || '', r.grade || '', r.price == null ? '-' : r.price].join('|')
        },
        inCart(r) {
            const k = this.lineKey(r)
            return this.cart.find(c => c.key === k) || null
        },
        addToCart(r) {
            if (this.inCart(r)) { this.panel = 'cart'; return }
            this.cart.push({
                key: this.lineKey(r),
                model: r.model,
                storage: r.storage || '',
                grade: r.grade || 'Ungraded',
                colors: (r.colors || []).slice(),
                color: null,
                qty: 1,
                max: Math.max(1, Number(r.qty) || 1),
                price: r.price != null ? Number(r.price) : null,
                currency: r.currency || null
            })
            this.problems = {}
            this.saveCart()
            this.$message({ message: `${r.model} added to your order`, type: 'success', duration: 1500, customClass: 'sc-toast' })
        },
        step(c, d) {
            c.qty = Math.min(c.max, Math.max(1, (Number(c.qty) || 1) + d))
            this.saveCart()
        },
        clampQty(c) {
            const n = Math.floor(Number(c.qty))
            c.qty = Math.min(c.max, Math.max(1, Number.isFinite(n) ? n : 1))
            this.saveCart()
        },
        removeLine(i) {
            this.cart.splice(i, 1)
            this.problems = {}
            this.orderError = ''
            this.saveCart()
        },
        orderItems() {
            return this.cart.map(c => ({
                model: c.model,
                storage: c.storage || undefined,
                grade: c.grade,
                color: c.color || null,
                qty: c.qty,
                expectedPrice: c.price != null ? c.price : undefined
            }))
        },
        // Checked by the server first (stock + prices), confirmed by the
        // customer with the server's summary, then placed.
        async placeOrder() {
            if (!this.cart.length || this.placing) return
            this.placing = true
            this.orderError = ''
            this.problems = {}
            const items = this.orderItems()
            try {
                const preview = await placeStockChatOrder(this.token, { items, note: this.orderNote, dryRun: true })
                this.placing = false
                try {
                    await this.$confirm(this.summary(preview.order), 'Place this order?', {
                        confirmButtonText: 'Place order', cancelButtonText: 'Back', customClass: 'sc-confirm'
                    })
                } catch (e) { return }
                this.placing = true
                if (!this.clientRef) this.clientRef = newRef()
                const r = await placeStockChatOrder(this.token, { items, note: this.orderNote, clientRef: this.clientRef })
                this.placed = r.order
                this.cart = []
                this.orderNote = ''
                this.clientRef = ''
                this.saveCart()
                this.panel = 'placed'
            } catch (e) {
                this.orderFailed(e)
            } finally {
                this.placing = false
            }
        },
        // the server's own figures, for the confirm box
        summary(o) {
            const h = this.$createElement
            const lines = (o.items || []).map(l => h('div', { class: 'sc-sum-line' }, [
                h('span', `${l.qty} × ${l.model} ${[l.storage, this.gradeText(l.grade), l.color ? this.titleCase(l.color) : ''].filter(Boolean).join(' · ')}`),
                h('b', l.unitPrice != null ? this.money({ price: l.lineTotal, currency: l.currency }) : 'on request')
            ]))
            const total = o.subtotal != null ? 'Total ' + this.money({ price: o.subtotal, currency: o.currency }) + (o.quoteNeeded ? ' + items to quote' : '') : 'Prices to be quoted'
            return h('div', { class: 'sc-sum' }, [...lines, h('div', { class: 'sc-sum-total' }, total), h('div', { class: 'sc-sum-note' }, o.priceNote || '')])
        },
        // A refusal → the cart lines it names get a note (and a smaller max /
        // the new price), so the customer can fix and place again.
        orderFailed(e) {
            const b = e.body || {}
            const its = Array.isArray(b.items) ? b.items : []
            const problems = {}
            if (b.code === 'OUT_OF_STOCK') {
                for (const x of its) {
                    const c = this.cart[x.index]
                    if (!c) continue
                    if (x.available > 0) {
                        c.max = x.available
                        if (c.qty > x.available) c.qty = x.available
                        problems[x.index] = `Only ${x.available} available now — quantity changed to ${c.qty}.`
                    } else {
                        problems[x.index] = c.color ? `None left in ${this.titleCase(c.color)} — choose Any colour or remove it.` : 'No longer available — please remove it.'
                    }
                }
                this.orderError = 'Some items changed — check the notes above and place the order again.'
            } else if (b.code === 'PRICE_CHANGED') {
                for (const x of its) {
                    const c = this.cart[x.index]
                    if (!c) continue
                    c.price = x.price != null ? x.price : null
                    c.currency = x.currency || c.currency
                    problems[x.index] = x.price != null ? `The price is now ${this.money({ price: x.price, currency: x.currency })}.` : 'The price is now on request — our team will quote it.'
                }
                this.orderError = 'A price changed — check it and place the order again.'
            } else if (e.status === 404 && b.code === 'NOT_ACTIVE') {
                this.panel = ''
                this.deadMessage = e.message
                this.state = 'dead'
                return
            } else {
                this.orderError = e.message
            }
            this.problems = problems
            this.saveCart()
        },
        closePanel() {
            this.panel = ''
        },
        async openOrders() {
            this.panel = 'orders'
            this.ordersLoading = true
            this.ordersError = ''
            try {
                const r = await getStockChatOrders(this.token)
                this.orders = r.orders || []
            } catch (e) {
                this.ordersError = e.message
            } finally {
                this.ordersLoading = false
            }
        },
        async cancelOrder(o) {
            try {
                await this.$confirm(`Cancel order ${o.orderNo}? The stock we're holding for you is released.`, 'Cancel order', {
                    confirmButtonText: 'Cancel order', cancelButtonText: 'Keep it', type: 'warning', customClass: 'sc-confirm'
                })
            } catch (e) { return }
            this.cancelling = o.orderNo
            try {
                const r = await cancelStockChatOrder(this.token, o.orderNo, 'Cancelled on the stock page')
                const i = this.orders.findIndex(x => x.orderNo === o.orderNo)
                if (i >= 0) this.$set(this.orders, i, r.order)
            } catch (e) {
                this.ordersError = e.message
                if (e.body && e.body.code === 'NOT_CANCELLABLE') this.openOrders()
            } finally {
                this.cancelling = ''
            }
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
.sc-head-acts { margin-left: auto; display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.sc-clear {
    flex: none; display: inline-flex; align-items: center; gap: 4px;
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
.sc-price { margin-top: 8px; font-size: 16px; font-weight: 700; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.sc-add {
    flex: none; border: 1px solid $blue; background: $blue; color: #fff; border-radius: 999px;
    padding: 5px 14px; font-size: 13px; font-weight: 600; cursor: pointer;
}
.sc-added { background: #ecfdf5; border-color: #6ee7b7; color: #047857; }
.sc-contact { font-size: 14px; color: #b45309; font-weight: 600; }
.sc-note { grid-column: 1 / -1; font-size: 12px; color: #6b7280; }
.sc-list {
    width: 100%; max-width: 580px; margin-top: 8px; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;
    padding: 4px 12px 10px; font-size: 14px;
}
.sc-lhead, .sc-lrow { display: grid; grid-template-columns: 64px 1fr 40px 96px 28px; gap: 8px; align-items: center; }
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
.sc-ladd {
    width: 26px; height: 26px; border-radius: 50%; border: 1px solid $blue; background: #fff; color: $blue;
    font-size: 16px; line-height: 1; cursor: pointer; padding: 0;
}
.sc-ladded { background: #ecfdf5; border-color: #6ee7b7; color: #047857; font-size: 13px; }
.sc-lnote { padding-top: 8px; }
.sc-muted { color: #9ca3af; font-weight: 500; }
.sc-r { text-align: right; }
.sc-typing { display: flex; gap: 4px; padding: 14px; }
.sc-typing span { width: 7px; height: 7px; border-radius: 50%; background: #9ca3af; animation: sc-dot 1.2s infinite ease-in-out; }
.sc-typing span:nth-child(2) { animation-delay: .15s; }
.sc-typing span:nth-child(3) { animation-delay: .3s; }
@keyframes sc-dot { 0%, 80%, 100% { opacity: .3; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
.sc-foot { flex: none; background: #fff; border-top: 1px solid #e5e7eb; padding: 10px 16px calc(10px + env(safe-area-inset-bottom)); }
.sc-orderbar {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    max-width: 760px; margin: 0 auto 10px; padding: 8px 8px 8px 14px; border-radius: 12px;
    background: #eef4fd; border: 1px solid #c7d7f2;
}
.sc-ob-text { font-size: 14px; min-width: 0; }
.sc-ob-btn {
    flex: none; border: 0; background: $blue; color: #fff; border-radius: 999px;
    padding: 8px 16px; font-size: 14px; font-weight: 600; cursor: pointer;
}
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

/* ── the order panel: a bottom sheet on a phone, a card on a wide screen ── */
.sc-sheet-wrap {
    position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 20; background: rgba(17, 24, 39, .45);
    display: flex; align-items: flex-end; justify-content: center;
}
.sc-sheet {
    width: 100%; max-width: 560px; max-height: 88vh; display: flex; flex-direction: column;
    background: #fff; border-radius: 16px 16px 0 0; box-shadow: 0 -8px 30px rgba(0, 0, 0, .15);
}
@media (min-width: 640px) {
    .sc-sheet-wrap { align-items: center; }
    .sc-sheet { border-radius: 16px; }
}
.sc-sheet-head {
    display: flex; align-items: center; justify-content: space-between; padding: 14px 16px;
    border-bottom: 1px solid #e5e7eb; font-size: 16px; flex: none;
}
.sc-x { border: 0; background: none; font-size: 26px; line-height: 1; color: #6b7280; cursor: pointer; padding: 0 4px; }
.sc-sheet-body { overflow-y: auto; padding: 12px 16px calc(16px + env(safe-area-inset-bottom)); }
.sc-empty { color: #6b7280; text-align: center; margin: 24px 0; }
.sc-cline { padding: 10px 0; border-bottom: 1px solid #f0f2f5; }
.sc-cname { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; font-size: 15px; }
.sc-cspec { font-size: 12px; color: #6b7280; }
.sc-cctl { display: grid; grid-template-columns: 1fr auto 96px 24px; gap: 8px; align-items: center; margin-top: 6px; }
.sc-csel { font: inherit; font-size: 13px; border: 1px solid #d1d5db; border-radius: 8px; padding: 5px 6px; background: #fff; min-width: 0; }
.sc-step { display: flex; align-items: center; border: 1px solid #d1d5db; border-radius: 8px; overflow: hidden; }
.sc-step button { width: 30px; height: 30px; border: 0; background: #f9fafb; font-size: 16px; cursor: pointer; color: #374151; }
.sc-step button:disabled { color: #d1d5db; cursor: default; }
.sc-step input {
    width: 40px; height: 30px; border: 0; text-align: center; font: inherit; font-size: 15px; -moz-appearance: textfield;
}
.sc-step input::-webkit-outer-spin-button, .sc-step input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.sc-cprice { text-align: right; font-weight: 700; font-size: 14px; white-space: nowrap; }
.sc-cprice .sc-contact { font-size: 12px; }
.sc-crm { border: 0; background: none; color: #9ca3af; font-size: 20px; cursor: pointer; padding: 0; }
.sc-cprob { margin-top: 6px; font-size: 13px; color: #b45309; }
.sc-onote {
    width: 100%; box-sizing: border-box; margin-top: 12px; resize: vertical; border: 1px solid #d1d5db; border-radius: 10px;
    padding: 8px 10px; font: inherit; font-size: 15px; outline: none;
}
.sc-onote:focus { border-color: $blue; }
.sc-ctotal { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; margin-top: 10px; font-size: 15px; }
.sc-cnote { font-size: 12px; color: #6b7280; }
.sc-oerr { margin-top: 10px; padding: 8px 10px; border-radius: 8px; background: #fef2f2; color: #b91c1c; font-size: 14px; }
.sc-place {
    width: 100%; margin-top: 12px; border: 0; border-radius: 12px; background: $blue; color: #fff;
    padding: 12px; font-size: 16px; font-weight: 700; cursor: pointer;
}
.sc-place:disabled { background: #9db5dc; cursor: default; }
.sc-place-sm { width: auto; margin-top: 0; padding: 8px 22px; font-size: 14px; }
.sc-fine { font-size: 12px; color: #6b7280; line-height: 1.5; margin: 10px 0 0; }
.sc-done { text-align: center; }
.sc-done > i { font-size: 48px; color: #10b981; margin-top: 8px; }
.sc-done h3 { margin: 8px 0; }
.sc-done p { color: #4b5563; line-height: 1.5; margin: 6px 0; }
.sc-done-acts { display: flex; justify-content: center; gap: 10px; margin-top: 16px; }
.sc-ord { padding: 12px 0; border-bottom: 1px solid #f0f2f5; font-size: 14px; }
.sc-ord-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.sc-st { font-size: 12px; font-weight: 600; border-radius: 999px; padding: 2px 9px; background: #f3f4f6; color: #4b5563; white-space: nowrap; }
.sc-st-pending { background: #fffbeb; color: #b45309; }
.sc-st-confirmed { background: #eef4fd; color: $blue; }
.sc-st-completed { background: #ecfdf5; color: #047857; }
.sc-st-expired { background: #fef2f2; color: #b91c1c; }
.sc-ord-line { display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; margin-top: 6px; }
.sc-ord-price { margin-left: auto; font-weight: 600; white-space: nowrap; }
.sc-ord-total { margin-top: 6px; text-align: right; font-weight: 700; }
.sc-ord-why { margin-top: 6px; font-size: 13px; color: #6b7280; }
.sc-ord-cancel {
    margin-top: 8px; border: 1px solid #fecaca; background: #fff; color: #b91c1c; border-radius: 999px;
    padding: 5px 12px; font-size: 13px; cursor: pointer;
}
.sc-ord-cancel:disabled { opacity: .6; cursor: default; }
</style>

<style lang="scss">
/* the confirm boxes and toasts live on <body> (outside the scoped styles):
   Element's 420 px box is wider than a phone */
.el-message-box.sc-confirm { width: 420px; max-width: calc(100vw - 32px); }
.el-message.sc-toast { min-width: 0; max-width: calc(100vw - 32px); }
.sc-sum { font-size: 14px; }
.sc-sum-line { display: flex; justify-content: space-between; gap: 10px; padding: 4px 0; border-bottom: 1px solid #f0f2f5; }
.sc-sum-total { margin-top: 8px; text-align: right; font-weight: 700; }
.sc-sum-note { text-align: right; font-size: 12px; color: #6b7280; }
</style>
