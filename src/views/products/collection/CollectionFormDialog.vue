<template>
    <!--
        Shared create/edit dialog for product collections.

        Extracted out of products/collection/index.vue so other pages
        (currently Stock Monitoring) can edit a collection in place
        without duplicating the form + picker + submit logic.

        Usage:
            <collection-form-dialog
                :visible.sync="dialogVisible"
                :collection="editingCollection"   <- null/undefined = Add mode
                @saved="onCollectionSaved"
            />

        The `saved` event carries the backend's returned document so
        parents can refresh whatever view they're hosting (collection
        list, stock tree, ...) without a second fetch.
    -->
    <el-dialog
        :title="dialogTitle"
        :visible="visible"
        width="760px"
        append-to-body
        @update:visible="(v) => $emit('update:visible', v)"
        @close="onClose"
    >
        <el-form ref="form" :model="form" :rules="formRules" label-width="100px">
            <!--
                In products-only mode (Stock Monitoring's in-place edit)
                the dialog is scoped to quick add/remove of items: the
                title stays visible as read-only context, while Note /
                Status / Criteria are hidden entirely. Their hydrated
                values are still re-sent verbatim on submit so nothing
                drifts. Full editing lives on the Collections page.
            -->
            <el-form-item label="Title" prop="title">
                <el-input v-model="form.title" placeholder="Please Enter Title" :disabled="productsOnly" />
            </el-form-item>
            <el-form-item v-if="!productsOnly" label="Note" prop="note">
                <el-input v-model="form.note" type="textarea" placeholder="Please Leave a Note" />
            </el-form-item>
            <el-form-item v-if="!productsOnly" label="Status" prop="status">
                <el-select v-model="form.status" placeholder="Select a status">
                    <el-option label="Active" value="Active"></el-option>
                    <el-option label="Inactive" value="Inactive"></el-option>
                    <el-option label="Draft" value="Draft" selected></el-option>
                </el-select>
            </el-form-item>
            <!--
                Collections can combine BOTH sources — a rule over the
                stock register and manually picked products. Either alone
                also works; submitForm enforces "at least one". The Type
                column in the list derives its label from which sources
                are populated (Criteria / Selection / Combined).

                Product picks come from Zoho Commerce search; each is
                translated via SKU into a real Zoho Inventory item_id
                (Commerce id ≠ Inventory id) so downstream stock/sales
                lookups work.
            -->
            <el-form-item label="Products" prop="products">
                <el-autocomplete
                    v-model="productSearchKeyword"
                    :fetch-suggestions="fetchProductSuggestions"
                    :debounce="400"
                    :disabled="productLookupLoading"
                    placeholder="Search Zoho products by name or SKU..."
                    style="width: 100%"
                    value-key="name"
                    :trigger-on-focus="false"
                    clearable
                    prefix-icon="el-icon-search"
                    popper-class="collection-product-suggestions"
                    @select="onProductSelected"
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
                                <div class="product-suggestion-meta">
                                    <span v-if="item.sku">SKU: {{ item.sku }}</span>
                                </div>
                            </div>
                        </div>
                    </template>
                </el-autocomplete>

                <div class="selected-products-wrap">
                    <div v-if="!form.products || form.products.length === 0" class="selected-empty">
                        No products picked — optional if you set a criteria below.
                    </div>
                    <ul v-else class="selected-products">
                        <li v-for="(p, idx) in form.products" :key="p.itemId" class="selected-product">
                            <img
                                v-if="p.imageUrl"
                                :src="p.imageUrl"
                                class="selected-product-img"
                                @error="onSuggestionImgError($event)"
                            />
                            <div v-else class="selected-product-img selected-product-img-placeholder">
                                <i class="el-icon-picture-outline" />
                            </div>
                            <div class="selected-product-info">
                                <div class="selected-product-name">{{ p.name || '(unnamed)' }}</div>
                                <div class="selected-product-meta">
                                    <span v-if="p.sku">SKU: {{ p.sku }}</span>
                                    <span class="selected-product-id">· item {{ p.itemId }}</span>
                                </div>
                            </div>
                            <el-button
                                size="mini"
                                type="text"
                                icon="el-icon-delete"
                                @click="removeSelectedProduct(idx)"
                            />
                        </li>
                    </ul>
                </div>
            </el-form-item>

            <el-form-item v-if="!productsOnly" label="Criteria" prop="criteria">
                <!-- The rule: rows of field / condition / value over the
                     stock register, joined AND / OR (consecutive ANDs group,
                     OR starts a new group). Fields, conditions and the
                     pick-list values come from the backend, which is also
                     what evaluates the rule — there is no raw expression to
                     write (2026-09-22; the Analytics criteria string is
                     gone). -->
                <div v-for="(row, idx) in criteriaRows" :key="idx" class="crit-row">
                    <span v-if="idx === 0" class="crit-join crit-join-first">Where</span>
                    <el-select v-else v-model="row.join" class="crit-join">
                        <el-option label="AND" value="and" />
                        <el-option label="OR" value="or" />
                    </el-select>
                    <el-select v-model="row.field" placeholder="Field" class="crit-field" filterable
                        @change="onCritFieldChange(row)">
                        <el-option v-for="f in filterMeta.fields" :key="f.key" :label="f.label" :value="f.key" />
                    </el-select>
                    <el-select v-model="row.op" placeholder="Condition" class="crit-op"
                        @change="onCritOpChange(row)">
                        <el-option v-for="o in opsFor(row)" :key="o.key" :label="o.label" :value="o.key" />
                    </el-select>
                    <!-- The value input follows the condition: none (is set /
                         is yes), several (any of…), a pick from the register's
                         values (typing a new one is allowed), or free text. -->
                    <span v-if="valueKind(row) === 'none'" class="crit-value crit-value-none" />
                    <el-select v-else-if="valueKind(row) === 'many'" v-model="row.value" multiple filterable
                        allow-create default-first-option placeholder="Values…" class="crit-value" collapse-tags>
                        <el-option v-for="v in optionsFor(row)" :key="v" :label="v" :value="v" />
                    </el-select>
                    <el-select v-else-if="valueKind(row) === 'pick'" v-model="row.value" filterable
                        allow-create default-first-option placeholder="Value" class="crit-value" clearable>
                        <el-option v-for="v in optionsFor(row)" :key="v" :label="v" :value="v" />
                    </el-select>
                    <el-input v-else v-model="row.value" placeholder="Value" class="crit-value" clearable />
                    <el-button size="mini" type="text" icon="el-icon-delete" class="crit-remove"
                        @click="criteriaRows.splice(idx, 1)" />
                </div>
                <div class="crit-bar">
                    <el-button size="mini" plain icon="el-icon-plus" :loading="filterMetaLoading"
                        @click="addCriteriaRow">Add criteria</el-button>
                    <!-- What the rule catches, counted against the register
                         as it is typed. Pinned products are not included. -->
                    <span v-if="validCriteriaRows.length" class="crit-count">
                        <i v-if="previewLoading" class="el-icon-loading" />
                        <template v-else-if="preview.count != null">matches <b>{{ preview.count.toLocaleString() }}</b> items</template>
                    </span>
                </div>
                <div v-if="validCriteriaRows.length && preview.sample.length" class="crit-preview">
                    <span v-for="s in preview.sample" :key="s.sku" class="crit-sample" :title="s.name">{{ s.sku }} · {{ s.name }}</span>
                </div>
                <span class="criteria-help">
                    Matched against every active item in the stock register (this business only,
                    Archive excluded) and combined with the products picked above, duplicates removed.
                    Text matches ignore case.
                </span>
            </el-form-item>
        </el-form>
        <div slot="footer" class="dialog-footer">
            <el-button type="primary" :disabled="submitLoading" @click="submitForm">
                {{ submitLoading ? 'Submiting...' : 'Submit' }}
            </el-button>
            <el-button @click="$emit('update:visible', false)">Cancel</el-button>
        </div>
    </el-dialog>
</template>

<script>
import { createCollection, updateCollection, getFilterOptions, previewFilter } from "@/api/zoho/products/collection";
import { searchProducts, lookupProductBySku } from "@/api/zoho/products/product";

// A rule as stored on the collection: { rows: [{ field, op, value, join }] }
// over the stock register. The vocabulary (fields, conditions per field
// type, and the register's current values for the pick lists) is loaded
// from the backend, which is the single owner of it — see the backend's
// utils/collectionFilter. Conditions that take no value (is set, is yes…)
// or several (is any of…) are told apart by the `value` kind on each op.
const NO_VALUE = new Set(["set", "notset", "yes", "no"]);
const MANY_VALUES = new Set(["in", "nin", "containsAny", "hasAny"]);

export default {
    name: "CollectionFormDialog",
    props: {
        // .sync'd by the parent. The dialog never mutates it directly —
        // every close path goes through $emit('update:visible', false).
        visible: { type: Boolean, default: false },
        // The collection row to edit, or null/undefined for Add mode.
        // Hydration happens on every open so a stale object from a
        // previous edit can't bleed into the next one.
        collection: { type: Object, default: null },
        // Scopes the dialog to product add/remove only. Used by the
        // Stock Monitoring in-place edit: Note / Status / Criteria are
        // hidden, the title shows read-only for context — full editing
        // stays on the Collections page. Submit logic is unchanged:
        // the hidden fields re-send their hydrated values verbatim,
        // and the derived type still recomputes (adding products to a
        // Criteria collection makes it Combined, etc.).
        productsOnly: { type: Boolean, default: false },
        // Which collection data set to save into: '' (default) = Spare
        // Parts (productCollections), 'accessories' = the Accessories
        // set. Passed straight through to the collection API helpers.
        scope: { type: String, default: '' }
    },
    data() {
        return {
            submitLoading: false,
            form: {
                id: "",
                title: "",
                note: "",
                status: "Draft",
                // Each entry: { itemId, sku, name, imageUrl }. `itemId` is
                // the Zoho Inventory product id (resolved via skuLookup).
                products: []
            },
            productSearchKeyword: "",
            productLookupLoading: false,
            // The rule's rows: { field, op, value, join } — join is
            // 'and'/'or' against the PREVIOUS row (first row's ignored).
            criteriaRows: [],
            // Fields / conditions / pick-list values from the backend,
            // loaded once per scope.
            filterMeta: { fields: [], ops: {}, options: {} },
            filterMetaLoading: false,
            // "matches N items", refreshed as the rows change.
            preview: { count: null, sample: [] },
            previewLoading: false,
            previewTimer: null,
            previewSeq: 0,
            formRules: {
                title: [
                    { required: true, message: "Title can not be empty", trigger: "blur" }
                ],
                status: [
                    { required: true, message: "Status can not be empty", trigger: "blur" }
                ]
            }
        };
    },
    computed: {
        isEdit() {
            return !!(this.collection && this.collection._id);
        },
        dialogTitle() {
            if (this.productsOnly) return "Add Product";
            return this.isEdit ? "Edit Collection" : "Add Collection";
        },
        // Rows complete enough to send: a known field and condition, and a
        // value when the condition takes one.
        validCriteriaRows() {
            return this.criteriaRows.filter(r => {
                if (!r.field || !r.op) return false;
                if (NO_VALUE.has(r.op)) return true;
                if (MANY_VALUES.has(r.op)) return Array.isArray(r.value) && r.value.some(v => String(v || "").trim());
                return !!String(r.value || "").trim();
            }).map(r => ({ field: r.field, op: r.op, value: r.value, join: r.join || "and" }));
        }
    },
    watch: {
        visible(val) {
            if (val) this.hydrate();
        },
        validCriteriaRows: {
            deep: true,
            handler() { this.schedulePreview(); }
        }
    },
    methods: {
        hydrate() {
            const row = this.collection;
            if (row && row._id) {
                this.form = {
                    id: row._id,
                    title: row.title || "",
                    note: row.note || "",
                    status: row.status || "Draft",
                    products: Array.isArray(row.products)
                        ? row.products.map(p => ({ ...p }))
                        : []
                };
                // The stored rule, copied so edits never touch the parent's
                // object until Submit.
                this.criteriaRows = ((row.filter && row.filter.rows) || []).map(r => ({
                    field: r.field, op: r.op, join: r.join || "and",
                    value: Array.isArray(r.value) ? [...r.value] : (r.value == null ? "" : r.value)
                }));
            } else {
                this.form = {
                    id: "",
                    title: "",
                    note: "",
                    status: "Draft",
                    products: []
                };
                this.criteriaRows = [];
            }
            this.preview = { count: null, sample: [] };
            if (!this.productsOnly) this.loadFilterMeta().then(() => this.schedulePreview());
            this.productSearchKeyword = "";
            this.$nextTick(() => {
                this.$refs.form && this.$refs.form.clearValidate();
            });
        },
        // ── Criteria builder ────────────────────────────────────────
        fieldDef(row) {
            return this.filterMeta.fields.find(f => f.key === row.field) || { type: "text" };
        },
        opsFor(row) {
            return this.filterMeta.ops[this.fieldDef(row).type] || [];
        },
        // none | many | pick | text — which value input a row shows.
        valueKind(row) {
            if (NO_VALUE.has(row.op)) return "none";
            if (MANY_VALUES.has(row.op)) return "many";
            const t = this.fieldDef(row).type;
            return t === "pick" || t === "list" ? "pick" : "text";
        },
        optionsFor(row) {
            return this.filterMeta.options[row.field] || [];
        },
        addCriteriaRow() {
            this.criteriaRows.push({ field: "name", op: "contains", value: "", join: "and" });
        },
        onCritFieldChange(row) {
            // A new field brings its own conditions and value shape.
            const ops = this.opsFor(row);
            if (!ops.some(o => o.key === row.op)) row.op = ops.length ? ops[0].key : "";
            this.onCritOpChange(row);
        },
        onCritOpChange(row) {
            const kind = this.valueKind(row);
            if (kind === "none") row.value = "";
            else if (kind === "many") { if (!Array.isArray(row.value)) row.value = row.value ? [row.value] : []; }
            else if (Array.isArray(row.value)) row.value = row.value[0] || "";
        },
        async loadFilterMeta() {
            if (this.filterMeta.fields.length || this.filterMetaLoading) return;
            this.filterMetaLoading = true;
            try {
                const res = await getFilterOptions(this.scope);
                if (res && res.data) this.filterMeta = res.data;
            } catch (e) {
                console.error("Filter options load failed:", e);
                this.$message.error("Could not load the criteria fields");
            } finally {
                this.filterMetaLoading = false;
            }
        },
        // Count what the rule catches, a moment after the last edit. A
        // reply that lands after the rows changed again is dropped.
        schedulePreview() {
            clearTimeout(this.previewTimer);
            if (!this.validCriteriaRows.length) { this.preview = { count: null, sample: [] }; return; }
            this.previewTimer = setTimeout(() => this.runPreview(), 400);
        },
        async runPreview() {
            const seq = ++this.previewSeq;
            this.previewLoading = true;
            try {
                const res = await previewFilter(this.validCriteriaRows, this.scope);
                if (seq !== this.previewSeq) return;
                this.preview = (res && res.data) || { count: null, sample: [] };
            } catch (e) {
                if (seq === this.previewSeq) this.preview = { count: null, sample: [] };
            } finally {
                if (seq === this.previewSeq) this.previewLoading = false;
            }
        },
        onClose() {
            // el-dialog fires close on every dismissal path (X button,
            // ESC, modal click) — make sure the parent's .sync flag
            // flips even when the dialog closed itself.
            this.$emit("update:visible", false);
        },
        submitForm() {
            this.$refs.form.validate(async valid => {
                if (!valid) return;

                // Cross-field check el-form can't express per-prop:
                // a collection needs SOMETHING to resolve — a rule,
                // at least one picked product, or both.
                const rows = this.validCriteriaRows;
                const pickedProducts = Array.isArray(this.form.products)
                    ? this.form.products
                    : [];
                if (!rows.length && pickedProducts.length === 0) {
                    this.$message.warning(
                        "Add a criteria, pick at least one product, or both."
                    );
                    return;
                }

                this.submitLoading = true;
                try {
                    // Type label is derived from which sources are
                    // populated — keeps the list page's Type column
                    // meaningful without the user managing a radio.
                    const derivedType = rows.length && pickedProducts.length > 0
                        ? "Combined"
                        : (rows.length ? "Criteria" : "Selection");

                    const payload = {
                        title: this.form.title,
                        type: derivedType,
                        note: this.form.note,
                        status: this.form.status,
                        // ALWAYS send both fields — update only writes
                        // provided keys, so omitting one would make it
                        // impossible to clear a rule (or empty the
                        // product list) on an existing collection.
                        filter: { rows },
                        products: pickedProducts.map(p => ({
                            itemId: p.itemId,
                            sku: p.sku || "",
                            name: p.name || "",
                            imageUrl: p.imageUrl || ""
                        }))
                    };

                    let saved = null;
                    if (this.form.id) {
                        const res = await updateCollection(this.form.id, payload, this.scope);
                        saved = (res && res.data) || null;
                        this.$message.success("Collection updated successfully");
                    } else {
                        const res = await createCollection(payload, this.scope);
                        saved = (res && res.data) || null;
                        this.$message.success("Collection created successfully");
                    }

                    this.$emit("saved", saved);
                    this.$emit("update:visible", false);
                } catch (error) {
                    console.error(error);
                    const msg = (error.response && error.response.data && error.response.data.message) || "Failed to save collection";
                    this.$message.error(msg);
                } finally {
                    this.submitLoading = false;
                }
            });
        },

        // ── Product picker ──────────────────────────────────────────
        // Reuses the Send Parts picker endpoints. Commerce search gives
        // us the list to choose from; SKU lookup translates that pick
        // into the real Zoho Inventory item_id we ultimately save.
        async fetchProductSuggestions(query, cb) {
            const q = (query || "").trim();
            if (!q) { cb([]); return; }
            try {
                const res = await searchProducts(q);
                if (!res || !res.success) { cb([]); return; }
                const products = Array.isArray(res.data) ? res.data : [];
                const suggestions = products.map(p => ({
                    ...p,
                    name: p.name || p.product_name || p.title || "",
                    sku: p.sku
                        || (Array.isArray(p.skus) && p.skus[0] && p.skus[0].sku)
                        || (p.variants && p.variants[0] && p.variants[0].sku)
                        || "",
                    product_id: p.product_id || p.id || "",
                    imgUrl: this.extractProductImage(p)
                }));
                cb(suggestions);
            } catch (e) {
                console.error("Product search failed:", e);
                cb([]);
            }
        },
        extractProductImage(p) {
            const BASE = "https://www.imobilestore.com.au";
            const toAbsolute = (path) => {
                if (!path) return "";
                if (/^https?:\/\//i.test(path)) return path;
                return BASE + (path.startsWith("/") ? "" : "/") + path;
            };
            if (Array.isArray(p.documents) && p.documents[0]) {
                const d = p.documents[0];
                if (d.file_name && d.document_id) {
                    return `${BASE}/product-images/${d.file_name}/${d.document_id}/100x100`;
                }
            }
            if (Array.isArray(p.images) && p.images[0]) {
                const i = p.images[0];
                return toAbsolute(i.image_url || i.url || i.path || i.image_path || "");
            }
            return toAbsolute(p.image_url || p.image || p.image_path || "");
        },
        onSuggestionImgError(e) {
            if (e && e.target) e.target.style.display = "none";
        },
        async onProductSelected(item) {
            if (!item) return;
            // SKU is required — Commerce product_id ≠ Inventory item_id,
            // so we translate via SKU to get the real id we save.
            if (!item.sku) {
                this.$message.error(
                    `"${item.name || "This product"}" has no SKU — add one in Zoho before selecting.`
                );
                this.productSearchKeyword = "";
                return;
            }
            // Dedupe by SKU before the round-trip; final dedupe by itemId below.
            if ((this.form.products || []).some(p => p.sku === item.sku)) {
                this.$message.info(`"${item.name}" is already in this collection`);
                this.productSearchKeyword = "";
                return;
            }
            this.productLookupLoading = true;
            try {
                const res = await lookupProductBySku(item.sku);
                if (!res || !res.success || !res.data || !res.data.itemId) {
                    throw new Error("No inventory item returned for this SKU");
                }
                const itemId = String(res.data.itemId);
                if ((this.form.products || []).some(p => p.itemId === itemId)) {
                    this.$message.info(`"${item.name}" is already in this collection`);
                    return;
                }
                this.form.products.push({
                    itemId,
                    sku: item.sku,
                    name: item.name,
                    imageUrl: item.imgUrl || ""
                });
                this.$message.success(`Added "${item.name}"`);
            } catch (e) {
                console.error("SKU lookup failed:", e);
                const msg = (e.response && e.response.data && e.response.data.message) || e.message || "Failed to add product";
                this.$message.error(msg);
            } finally {
                this.productLookupLoading = false;
                this.productSearchKeyword = "";
            }
        },
        removeSelectedProduct(idx) {
            this.form.products.splice(idx, 1);
        }
    }
};
</script>

<style scoped>
/* Help caption under the criteria rows explaining how the two
   sources combine. */
.criteria-help {
    display: block;
    margin-top: 4px;
    color: #909399;
    font-size: 12px;
    line-height: 1.4;
}

/* Criteria builder rows */
.crit-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
}
.crit-join { width: 78px; flex-shrink: 0; }
.crit-join-first {
    display: inline-block;
    text-align: center;
    font-size: 12px;
    color: #909399;
}
.crit-field { width: 170px; flex-shrink: 0; }
.crit-op { width: 150px; flex-shrink: 0; }
.crit-value { flex: 1; min-width: 0; }
.crit-value-none { display: inline-block; }
.crit-remove { flex-shrink: 0; }
.crit-bar {
    display: flex;
    align-items: center;
    gap: 14px;
}
.crit-count {
    margin-left: auto;
    font-size: 12px;
    color: #606266;
}
.crit-preview {
    margin-top: 6px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    font-size: 12px;
    color: #606266;
    background: #f8f9fb;
    border: 1px solid #ebeef5;
    border-radius: 4px;
    padding: 5px 8px;
    line-height: 1.5;
}
.crit-sample {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* Selected products list inside the collection product picker */
.selected-products-wrap {
    margin-top: 10px;
    border: 1px dashed #dcdfe6;
    border-radius: 6px;
    padding: 8px;
    background: #fafbfc;
    min-height: 56px;
}
.selected-empty {
    color: #909399;
    font-size: 13px;
    text-align: center;
    padding: 12px 0;
}
.selected-products {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.selected-product {
    display: flex;
    align-items: center;
    gap: 10px;
    background: #fff;
    border: 1px solid #ebeef5;
    border-radius: 6px;
    padding: 6px 10px;
}
.selected-product-img {
    width: 36px;
    height: 36px;
    object-fit: cover;
    border-radius: 4px;
    flex-shrink: 0;
    background: #f5f7fa;
}
.selected-product-img-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #c0c4cc;
    font-size: 16px;
}
.selected-product-info {
    flex: 1;
    min-width: 0;
}
.selected-product-name {
    font-weight: 500;
    color: #303133;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.selected-product-meta {
    color: #909399;
    font-size: 12px;
    margin-top: 2px;
}
.selected-product-id {
    margin-left: 6px;
    color: #c0c4cc;
}
</style>

<style>
/* Autocomplete suggestion popup — needs to be unscoped because the popup is
   teleported outside the component root by Element UI. */
.collection-product-suggestions .product-suggestion {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 0;
}
.collection-product-suggestions .product-suggestion-img {
    width: 36px;
    height: 36px;
    object-fit: cover;
    border-radius: 4px;
    flex-shrink: 0;
    background: #f5f7fa;
}
.collection-product-suggestions .product-suggestion-img-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #c0c4cc;
    font-size: 16px;
}
.collection-product-suggestions .product-suggestion-info { min-width: 0; }
.collection-product-suggestions .product-suggestion-name {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.collection-product-suggestions .product-suggestion-meta {
    color: #909399;
    font-size: 12px;
}
</style>
