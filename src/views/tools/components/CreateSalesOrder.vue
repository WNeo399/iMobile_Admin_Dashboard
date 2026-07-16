<template>
    <div class="create-so-tool">
        <!-- ── Compose step: search + line items + notes ─────────────── -->
        <div v-if="step === 'compose'" class="step compose-step">
            <div class="intro-note">
                <i class="el-icon-info" />
                Order will be created against Retail / Walk-in customer.
                Re-assign the customer (and any other fields) in Zoho
                Inventory once it's there.
            </div>

            <!-- Product search / barcode input -->
            <el-autocomplete
                ref="searchInput"
                v-model="productKeyword"
                :fetch-suggestions="fetchProductSuggestions"
                :debounce="400"
                :disabled="addingProduct"
                placeholder="Search products or scan a barcode (press Enter)…"
                style="width: 100%"
                :trigger-on-focus="false"
                value-key="name"
                clearable
                prefix-icon="el-icon-search"
                popper-class="create-so-suggestions"
                @select="onProductSelected"
                @keyup.enter.native="onScanEnter"
                @keydown.native="onSearchKeydown"
            >
                <template slot-scope="{ item }">
                    <div class="product-suggestion">
                        <img
                            v-if="item.imgUrl"
                            :src="item.imgUrl"
                            class="product-suggestion-img"
                            @error="onSuggestionImgError($event)"
                        />
                        <div v-else class="product-suggestion-img product-suggestion-img-placeholder">
                            <i class="el-icon-picture-outline" />
                        </div>
                        <div class="product-suggestion-info">
                            <div class="product-suggestion-name">{{ item.name }}</div>
                            <div v-if="item.sku" class="product-suggestion-meta">SKU: {{ item.sku }}</div>
                        </div>
                    </div>
                </template>
            </el-autocomplete>

            <!-- Line items table -->
            <el-table
                :data="lineItems"
                size="small"
                stripe
                empty-text="Search above to add line items"
                max-height="320"
                class="line-items-table"
            >
                <el-table-column label="" width="56" align="center">
                    <template slot-scope="scope">
                        <img
                            v-if="scope.row.imgUrl"
                            :src="scope.row.imgUrl"
                            class="row-img"
                            @error="onSuggestionImgError($event)"
                        />
                        <div v-else class="row-img row-img-placeholder">
                            <i class="el-icon-picture-outline" />
                        </div>
                    </template>
                </el-table-column>
                <el-table-column label="Product" min-width="240">
                    <template slot-scope="scope">
                        <div class="row-name">{{ scope.row.name }}</div>
                        <div v-if="scope.row.sku" class="row-sub">SKU: {{ scope.row.sku }}</div>
                        <!--
                            Show captured scan codes when they aren't just the
                            SKU — gives the cashier a quick visual confirmation
                            of what was actually scanned (e.g. a vendor barcode)
                            without taking up much room.
                        -->
                        <div
                            v-if="otherScanCodes(scope.row).length"
                            class="row-sub row-scan"
                            :title="otherScanCodes(scope.row).join(', ')"
                        >
                            <i class="el-icon-postcard" />
                            Scanned: {{ otherScanCodes(scope.row).join(', ') }}
                        </div>
                    </template>
                </el-table-column>
                <el-table-column label="Qty" width="110" align="center">
                    <template slot-scope="scope">
                        <el-input-number
                            v-model="scope.row.qty"
                            :min="1"
                            :max="9999"
                            size="mini"
                            controls-position="right"
                            style="width: 100%"
                        />
                    </template>
                </el-table-column>
                <el-table-column label="" width="50" align="center">
                    <template slot-scope="scope">
                        <el-button
                            size="mini"
                            type="text"
                            icon="el-icon-delete"
                            class="remove-btn"
                            @click="removeItem(scope.row)"
                        />
                    </template>
                </el-table-column>
            </el-table>

            <!-- Optional notes — appended to the SO. -->
            <el-input
                v-model="notes"
                type="textarea"
                :rows="2"
                placeholder="Notes (optional) — appears on the sales order"
                resize="vertical"
            />

            <el-alert
                v-if="lastError"
                :title="lastError"
                type="error"
                show-icon
                :closable="false"
                class="step-alert"
            />

            <div class="step-actions">
                <el-button
                    :loading="printingList"
                    :disabled="lineItems.length === 0"
                    icon="el-icon-printer"
                    @click="printList"
                >Print List</el-button>
                <el-button
                    type="primary"
                    :loading="creating"
                    :disabled="lineItems.length === 0"
                    icon="el-icon-shopping-cart-2"
                    @click="createOrder"
                >{{ creating ? 'Creating…' : `Create Sales Order (${lineItems.length})` }}</el-button>
            </div>
        </div>

        <!-- ── Done step ──────────────────────────────────────────────── -->
        <div v-else-if="step === 'done'" class="step done-step">
            <div class="done-icon"><i class="el-icon-circle-check" /></div>
            <div class="done-title">Sales order {{ createdSO.salesOrderNumber }} created</div>
            <div class="done-sub">
                {{ lineItems.length }} line item<span v-if="lineItems.length !== 1">s</span>
                sent to Zoho Inventory. Re-assign the customer in Zoho.
            </div>
            <div class="step-actions center">
                <el-button @click="reset">Create another</el-button>
                <el-button type="primary" icon="el-icon-link" @click="openInZoho">
                    Open in Zoho
                </el-button>
            </div>
        </div>
    </div>
</template>

<script>
import { createBuzztechSalesOrder } from '@/api/tools/buzztech'
import { searchProducts, lookupProductBySku, getItemLocations } from '@/api/zoho/products/product'

// Placeholder customer the SO is raised against. Staff are expected to
// re-assign the real customer inside Zoho before the SO is confirmed.
const PLACEHOLDER_CUSTOMER_ID = '2591985000300565735'

const ZOHO_ORG_ID = '746138234'

export default {
    name: 'CreateSalesOrder',
    data() {
        return {
            step: 'compose',
            productKeyword: '',
            addingProduct: false,
            lineItems: [],
            notes: '',
            creating: false,
            lastError: '',
            createdSO: null,
            // Set by onScanEnter when it can't auto-bump (single match but
            // SKU not yet in the list) and consumed by the next call to
            // onProductSelected — so the user's confirming click captures
            // the originally-scanned code on the new row.
            pendingScanCode: '',
            printingList: false,
            // Keystroke-burst tracking to tell a barcode scanner (a rapid
            // burst of characters + Enter) from manual typing. Scanners
            // emit ~10–30ms between keys; humans are far slower.
            scanBurstStart: 0,
            scanBurstCount: 0,
            scanLastKeyTs: 0
        }
    },
    methods: {
        // Track printable keystrokes on the search input. A gap of >400ms
        // starts a new burst — so a scan into a half-typed box still counts
        // only the scanner's own burst.
        onSearchKeydown(e) {
            if (!e || typeof e.key !== 'string' || e.key.length !== 1) return
            const now = Date.now()
            if (now - this.scanLastKeyTs > 400) {
                this.scanBurstStart = now
                this.scanBurstCount = 0
            }
            this.scanBurstCount += 1
            this.scanLastKeyTs = now
        },
        // Does the current input look like it was entered by a scanner?
        // At least 4 chars arriving at an average of ≤40ms per key.
        looksScanned(codeLength) {
            if (this.scanBurstCount < 4 || this.scanBurstCount < Math.min(codeLength, 4)) return false
            const elapsed = this.scanLastKeyTs - this.scanBurstStart
            return elapsed <= this.scanBurstCount * 40
        },
        // ── Product search (same pattern as Buzztech tool) ────────────
        async fetchProductSuggestions(query, cb) {
            const q = (query || '').trim()
            if (!q) { cb([]); return }

            // Skip the network call entirely when the query already matches
            // a SKU or captured scan code on a row in the list. The Enter
            // handler bumps qty locally for these; the debounced suggestion
            // fetch was running unnecessarily and was the only call still
            // appearing in the network log.
            if (this.codeMatchesExistingRow(q)) { cb([]); return }

            try {
                const res = await searchProducts(q)
                // Staleness guard: a scan may have already consumed this query
                // (auto-add cleared the input) by the time the debounced fetch
                // resolves — don't pop a dropdown for it.
                if (q !== (this.productKeyword || '').trim()) { cb([]); return }
                if (!res || !res.success) { cb([]); return }
                const products = Array.isArray(res.data) ? res.data : []
                cb(products.map(p => ({
                    ...p,
                    name: p.name || p.product_name || p.title || '',
                    sku: p.sku
                        || (Array.isArray(p.skus) && p.skus[0] && p.skus[0].sku)
                        || (p.variants && p.variants[0] && p.variants[0].sku)
                        || '',
                    imgUrl: this.extractProductImage(p)
                })))
            } catch (e) {
                console.error('Product search failed:', e)
                cb([])
            }
        },
        // Shared local-match lookup used by both the suggestion fetcher and
        // the Enter-key handler. Case-insensitive against each row's SKU
        // and every code captured in scanCodes. Returns the matching row,
        // or null if no row matches.
        findExistingRowByCode(code) {
            const target = String(code || '').toLowerCase()
            if (!target) return null
            return this.lineItems.find((li) => {
                if (li.sku && li.sku.toLowerCase() === target) return true
                if (Array.isArray(li.scanCodes)) {
                    return li.scanCodes.some(
                        (c) => c && String(c).toLowerCase() === target
                    )
                }
                return false
            }) || null
        },
        codeMatchesExistingRow(code) {
            return !!this.findExistingRowByCode(code)
        },
        extractProductImage(p) {
            const BASE = 'https://www.imobilestore.com.au'
            const toAbsolute = (path) => {
                if (!path) return ''
                if (/^https?:\/\//i.test(path)) return path
                return BASE + (path.startsWith('/') ? '' : '/') + path
            }
            if (Array.isArray(p.documents) && p.documents[0]) {
                const d = p.documents[0]
                if (d.file_name && d.document_id) {
                    return `${BASE}/product-images/${d.file_name}/${d.document_id}/100x100`
                }
            }
            if (Array.isArray(p.images) && p.images[0]) {
                const i = p.images[0]
                return toAbsolute(i.image_url || i.url || i.path || i.image_path || '')
            }
            return toAbsolute(p.image_url || p.image || p.image_path || '')
        },
        onSuggestionImgError(e) {
            if (e && e.target) e.target.style.display = 'none'
        },
        async onProductSelected(item) {
            if (!item) return
            if (!item.sku) {
                this.$message.error(
                    `"${item.name || 'This product'}" has no SKU — add one in Zoho before importing.`
                )
                this.productKeyword = ''
                this.pendingScanCode = ''
                return
            }
            // Consume any code that was left over from a scan that
            // surfaced this suggestion — clear it immediately so a
            // subsequent unrelated pick can't pick it up by mistake.
            const scanCode = this.pendingScanCode
            this.pendingScanCode = ''
            await this.addProductBySku({
                sku: item.sku,
                name: item.name || '',
                imgUrl: item.imgUrl || '',
                scanCode
            })
            this.productKeyword = ''
        },

        // Enter on the search input — treat as a confirm/scan. Runs the
        // Commerce search ourselves (rather than waiting for the
        // autocomplete debounce) and applies a focused policy:
        //   • exactly one result, SKU already in the list → bump qty
        //   • exactly one result, SKU NOT in the list     → user must pick
        //   • zero results                                → toast error
        //   • many results                                → let the user pick
        // The "SKU already in the list" gate keeps scans low-friction while
        // still requiring an explicit click before a new product joins the
        // order — a small but useful guard against the wrong item slipping
        // in on a single ambiguous scan.
        async onScanEnter() {
            const code = (this.productKeyword || '').trim()
            if (!code || this.addingProduct) return
            // Decide scanner-vs-typed NOW, before any await resets the burst.
            const scanned = this.looksScanned(code.length)

            // Local fast path: if this code already matches a row's SKU or
            // one of its captured scan codes, bump qty without calling
            // searchProducts at all.
            const localMatch = this.findExistingRowByCode(code)
            if (localMatch) {
                this.bumpRow(localMatch, { scanCode: code })
                this.productKeyword = ''
                // Keep focus so the scanner can keep firing.
                this.$nextTick(() => {
                    const ref = this.$refs.searchInput
                    if (ref && typeof ref.focus === 'function') ref.focus()
                })
                return
            }

            this.addingProduct = true
            try {
                const res = await searchProducts(code)
                const products = (res && res.success && Array.isArray(res.data)) ? res.data : []

                if (products.length === 0) {
                    this.$message.error(`No product found for "${code}"`)
                    return
                }

                const skuOf = (p) => p.sku
                    || (Array.isArray(p.skus) && p.skus[0] && p.skus[0].sku)
                    || (p.variants && p.variants[0] && p.variants[0].sku)
                    || ''

                // Scanner input + an EXACT SKU match → add it automatically
                // (no manual pick). Typed input keeps the confirm-first flow.
                if (scanned) {
                    const exact = products.filter(p => skuOf(p).toLowerCase() === code.toLowerCase())
                    if (exact.length === 1) {
                        const p = exact[0]
                        await this.addProductBySku({
                            sku: skuOf(p),
                            name: p.name || p.product_name || p.title || '',
                            imgUrl: this.extractProductImage(p),
                            scanCode: code
                        })
                        this.productKeyword = ''
                        this.closeSuggestions()
                        this.$nextTick(() => {
                            const ref = this.$refs.searchInput
                            if (ref && typeof ref.focus === 'function') ref.focus()
                        })
                        return
                    }
                }

                if (products.length > 1) {
                    // Ambiguous — autocomplete will surface the dropdown.
                    return
                }

                const product = products[0]
                const sku = skuOf(product)
                if (!sku) return

                const existing = this.lineItems.find(
                    li => li.sku && li.sku.toLowerCase() === sku.toLowerCase()
                )
                if (!existing) {
                    // Single match but not yet in the list — leave it to
                    // the cashier to pick from the suggestion dropdown so
                    // they can confirm before adding. Stash the scanned
                    // code so the next onProductSelected can attach it to
                    // the new row's scanCodes (otherwise we'd lose the
                    // reference on the very first scan of a barcode).
                    this.pendingScanCode = code
                    return
                }

                this.bumpRow(existing, { scanCode: code })
                this.productKeyword = ''
                // Keep focus on the input so the scanner can keep firing.
                this.$nextTick(() => {
                    const ref = this.$refs.searchInput
                    if (ref && typeof ref.focus === 'function') ref.focus()
                })
            } catch (e) {
                console.error('Scan search failed:', e)
                const msg = (e.response && e.response.data && e.response.data.message) || e.message || 'Search failed'
                this.$message.error(msg)
            } finally {
                this.addingProduct = false
            }
        },

        // ── Shared add / bump-qty logic ──────────────────────────────
        // Picks SKU-match fast path (no network), otherwise looks up the
        // Inventory item_id, then dedupes by that canonical id before
        // pushing or bumping. Used by both the autocomplete pick flow
        // and the Enter-key scan flow.
        async addProductBySku(productLike) {
            // Fast path: if this SKU is already in the list, just bump qty.
            // Avoids the network round-trip to skuLookup entirely when a
            // sales person scans/picks the same product N times.
            const sku = String(productLike.sku || '')
            const scanCode = productLike.scanCode || ''
            const existingBySku = this.lineItems.find(
                li => li.sku && li.sku.toLowerCase() === sku.toLowerCase()
            )
            if (existingBySku) {
                this.bumpRow(existingBySku, { scanCode })
                return
            }

            this.addingProduct = true
            try {
                const res = await lookupProductBySku(sku)
                if (!res || !res.success || !res.data || !res.data.itemId) {
                    throw new Error('No inventory item returned for this SKU')
                }
                this.bumpOrAdd({
                    itemId: String(res.data.itemId),
                    sku,
                    name: productLike.name || '',
                    imgUrl: productLike.imgUrl || '',
                    scanCode
                })
            } catch (e) {
                console.error('Add product failed:', e)
                const msg = (e.response && e.response.data && e.response.data.message) || e.message || 'Failed to add product'
                this.$message.error(msg)
            } finally {
                this.addingProduct = false
            }
        },

        // Decide whether to push a new row or bump an existing one based
        // on the canonical itemId. Centralised so the scan path and the
        // autocomplete path can't diverge.
        bumpOrAdd(productInfo) {
            const existing = this.lineItems.find(
                li => String(li.itemId) === String(productInfo.itemId)
            )
            if (existing) {
                this.bumpRow(existing, productInfo)
                return
            }
            this.lineItems.push({
                itemId: productInfo.itemId,
                name: productInfo.name || '',
                sku: productInfo.sku || '',
                imgUrl: productInfo.imgUrl || '',
                qty: 1,
                // Track the code that originally added this row, so we
                // have a reference if it was a barcode rather than the
                // canonical SKU. Updated on each subsequent scan via the
                // scanCodes list below.
                scanCode: productInfo.scanCode || '',
                scanCodes: productInfo.scanCode ? [productInfo.scanCode] : []
            })
            this.$message.success(`Added "${productInfo.name || productInfo.sku}"`)
        },

        bumpRow(row, productInfo) {
            row.qty = (Number(row.qty) || 0) + 1
            // Append the scan code if it's new — useful when two different
            // barcodes / SKUs both resolve to the same Zoho item and we
            // want to know which ones were actually scanned.
            const scanCode = productInfo && productInfo.scanCode
            if (scanCode) {
                if (!Array.isArray(row.scanCodes)) row.scanCodes = []
                if (!row.scanCodes.includes(scanCode)) row.scanCodes.push(scanCode)
            }
            this.$message.success(
                `${row.name || row.sku || 'Item'} — qty ${row.qty}`
            )
            // No "new" item to surface, so drop the suggestion dropdown
            // immediately — keeps the workflow clean for the next scan.
            this.closeSuggestions()
        },

        // Collapse the autocomplete's suggestion dropdown. Used after a
        // qty bump so the dropdown doesn't keep showing the now-stale
        // search hit.
        //
        // IMPORTANT: only clear the suggestions array — DO NOT touch
        // Element UI's `activated` flag. Forcing it to false deactivates
        // the autocomplete from the current focus session; the next
        // input event then populates suggestions internally but the
        // dropdown stays hidden (because `suggestionVisible` requires
        // both `activated` and a non-empty `suggestions` array). Leaving
        // `activated` as-is means the next keystroke fetches fresh
        // suggestions and the dropdown reappears automatically.
        closeSuggestions() {
            const ref = this.$refs.searchInput
            if (!ref) return
            ref.suggestions = []
        },

        // Return the list of captured scan codes minus the canonical SKU.
        // Used to surface non-SKU codes (i.e. vendor barcodes) in the row
        // as a small reference line.
        otherScanCodes(row) {
            if (!row || !Array.isArray(row.scanCodes)) return []
            const sku = String(row.sku || '').toLowerCase()
            return row.scanCodes.filter(
                c => c && String(c).toLowerCase() !== sku
            )
        },

        removeItem(row) {
            const idx = this.lineItems.indexOf(row)
            if (idx !== -1) this.lineItems.splice(idx, 1)
        },

        // ── Submit ────────────────────────────────────────────────────
        // ── Print List — A4 picking sheet of the current line items ────
        // Three columns: Product (name + SKU), Location (fetched live from
        // the Items view), Quantity. Rendered as HTML in a hidden iframe so
        // the browser paginates long lists across A4 pages natively.
        async printList() {
            if (!this.lineItems.length || this.printingList) return
            this.printingList = true
            try {
                let locations = {}
                try {
                    const r = await getItemLocations(this.lineItems.map(li => li.sku).filter(Boolean))
                    if (r && r.success) locations = r.data || {}
                } catch (e) {
                    console.error('Location lookup failed:', e)
                    this.$message.warning('Could not load locations — printing without them.')
                }

                const escapeHtml = (s) => String(s == null ? '' : s)
                    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
                const now = new Date()
                const p = n => String(n).padStart(2, '0')
                const dateStr = `${p(now.getDate())}/${p(now.getMonth() + 1)}/${now.getFullYear()} ${p(now.getHours())}:${p(now.getMinutes())}`

                const rows = this.lineItems.map(li => `
                    <tr>
                        <td>
                            <div class="pname">${escapeHtml(li.name || '')}</div>
                            <div class="psku">SKU: ${escapeHtml(li.sku || '—')}</div>
                        </td>
                        <td class="loc">${escapeHtml(locations[li.sku] || '—')}</td>
                        <td class="qty">${escapeHtml(li.qty)}</td>
                    </tr>`).join('')

                const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Picking List</title>
                    <style>
                        @page { size: A4; margin: 15mm; }
                        * { box-sizing: border-box; }
                        body { font-family: Helvetica, Arial, sans-serif; color: #111; margin: 0; }
                        h1 { font-size: 18px; margin: 0 0 2px; }
                        .meta { font-size: 12px; color: #555; margin-bottom: 12px; }
                        table { width: 100%; border-collapse: collapse; }
                        thead { display: table-header-group; }
                        th { text-align: left; font-size: 12px; padding: 6px 8px; border-bottom: 2px solid #111; }
                        td { padding: 7px 8px; border-bottom: 1px solid #ccc; vertical-align: top; font-size: 13px; }
                        tr { page-break-inside: avoid; }
                        .pname { font-weight: 600; line-height: 1.3; }
                        .psku { font-size: 11px; color: #555; margin-top: 1px; }
                        th.loc, td.loc { width: 120px; }
                        th.qty, td.qty { width: 70px; text-align: center; }
                        td.loc { font-weight: 600; }
                    </style></head><body>
                    <h1>Picking List</h1>
                    <div class="meta">${this.lineItems.length} item${this.lineItems.length === 1 ? '' : 's'} · ${dateStr}</div>
                    <table>
                        <thead><tr><th>Product</th><th class="loc">Location</th><th class="qty">Quantity</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </body></html>`

                const frame = document.createElement('iframe')
                frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden;'
                document.body.appendChild(frame)
                frame.contentDocument.open()
                frame.contentDocument.write(html)
                frame.contentDocument.close()
                setTimeout(() => {
                    try {
                        frame.contentWindow.focus()
                        frame.contentWindow.print()
                    } finally {
                        // Give the print dialog time to snapshot before removal.
                        setTimeout(() => frame.remove(), 60000)
                        this.printingList = false
                    }
                }, 150)
            } catch (e) {
                console.error('Print list failed:', e)
                this.$message.error('Could not build the picking list.')
                this.printingList = false
            }
        },

        async createOrder() {
            if (this.lineItems.length === 0 || this.creating) return
            this.creating = true
            this.lastError = ''
            try {
                // Re-use the standalone create endpoint. priceListId is now
                // optional — Zoho will fall back to the customer's default
                // pricebook.
                const payload = {
                    customerId: PLACEHOLDER_CUSTOMER_ID,
                    lineItems: this.lineItems.map(li => ({
                        itemId: li.itemId,
                        quantity: li.qty
                    }))
                }
                const trimmedNotes = (this.notes || '').trim()
                if (trimmedNotes) payload.notes = trimmedNotes

                const res = await createBuzztechSalesOrder(payload)
                if (!res || !res.success || !res.data) {
                    throw new Error((res && res.message) || 'Create failed')
                }
                this.createdSO = res.data
                this.step = 'done'
            } catch (e) {
                console.error('SO create failed:', e)
                this.lastError = this.describeError(e)
            } finally {
                this.creating = false
            }
        },
        reset() {
            this.step = 'compose'
            this.productKeyword = ''
            this.lineItems = []
            this.notes = ''
            this.lastError = ''
            this.createdSO = null
            this.pendingScanCode = ''
        },
        openInZoho() {
            if (!this.createdSO || !this.createdSO.salesOrderId) return
            const url = `https://inventory.zoho.com/app/${ZOHO_ORG_ID}#/salesorders/${this.createdSO.salesOrderId}`
            window.open(url, '_blank', 'noopener,noreferrer')
        },
        describeError(e) {
            if (!e) return 'Something went wrong'
            if (e.response && e.response.data) {
                return e.response.data.message || `HTTP ${e.response.status}`
            }
            return e.message || String(e)
        }
    }
}
</script>

<style scoped>
.create-so-tool { padding: 4px 0; }

.step { display: flex; flex-direction: column; gap: 12px; }
.step-alert { margin: 0; }
.step-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 4px;
}
.step-actions.center { justify-content: center; }

/* Compose step */
.intro-note {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 8px 12px;
    background: #ecf5ff;
    border: 1px solid #d9ecff;
    border-radius: 6px;
    color: #1d4ed8;
    font-size: 12px;
    line-height: 1.5;
    i { font-size: 14px; margin-top: 2px; flex-shrink: 0; }
}

.line-items-table { margin-top: 4px; }
.row-img {
    width: 36px;
    height: 36px;
    object-fit: cover;
    border-radius: 4px;
    background: #f5f7fa;
}
.row-img-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #c0c4cc;
    font-size: 16px;
}
.row-name {
    color: #303133;
    font-weight: 500;
    font-size: 13px;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.row-sub {
    color: #909399;
    font-size: 12px;
    margin-top: 2px;
}
.row-scan {
    color: #6d28d9;
    display: flex;
    align-items: center;
    gap: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    i { font-size: 12px; flex-shrink: 0; }
}
.remove-btn {
    padding: 4px !important;
    color: #909399;
}
.remove-btn:hover { color: #f56c6c; }

/* Done step */
.done-step { text-align: center; padding: 16px 0 8px; }
.done-icon { color: #67C23A; font-size: 48px; margin-bottom: 8px; }
.done-title { font-size: 17px; font-weight: 600; color: #111827; margin-bottom: 4px; }
.done-sub { color: #606266; font-size: 13px; margin-bottom: 16px; line-height: 1.5; }

/* Mobile */
@media (max-width: 600px) {
    .step-actions {
        flex-direction: column-reverse;
        gap: 8px;
    }
    .step-actions .el-button {
        width: 100%;
        margin-left: 0 !important;
    }
}
</style>

<style>
/* Suggestion popup — unscoped because Element UI teleports the popper. */
.create-so-suggestions .product-suggestion {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 0;
    line-height: 1.3;
}
.create-so-suggestions .product-suggestion-img {
    width: 40px;
    height: 40px;
    object-fit: cover;
    border-radius: 4px;
    flex-shrink: 0;
    background: #f5f7fa;
}
.create-so-suggestions .product-suggestion-img-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #c0c4cc;
    font-size: 18px;
}
.create-so-suggestions .product-suggestion-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
}
.create-so-suggestions .product-suggestion-name {
    font-weight: 500;
    color: #303133;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.create-so-suggestions .product-suggestion-meta {
    color: #909399;
    font-size: 12px;
}
</style>
