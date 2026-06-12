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
        width="720px"
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
                Collections can combine BOTH sources — a criteria
                expression (resolved via Zoho Analytics) and manually
                picked products. Either alone also works; submitForm
                enforces "at least one". The Type column in the list
                derives its label from which sources are populated
                (Criteria / Selection / Combined).

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
                <el-input
                    v-model="form.criteria"
                    type="textarea"
                    :rows="2"
                    placeholder="Optional — Zoho Analytics criteria, e.g. &quot;SKU&quot; LIKE '5470%'"
                />
                <span class="criteria-help">
                    Items matching the criteria are combined with the
                    manually picked products above (duplicates removed).
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
import { createCollection, updateCollection } from "@/api/zoho/products/collection";
import { searchProducts, lookupProductBySku } from "@/api/zoho/products/product";

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
        productsOnly: { type: Boolean, default: false }
    },
    data() {
        return {
            submitLoading: false,
            form: {
                id: "",
                title: "",
                note: "",
                status: "Draft",
                // Criteria + products are BOTH optional individually —
                // submitForm enforces "at least one" since el-form's
                // per-prop validators can't express the cross-field
                // rule cleanly.
                criteria: "",
                // Each entry: { itemId, sku, name, imageUrl }. `itemId` is
                // the Zoho Inventory product id (resolved via skuLookup).
                products: []
            },
            productSearchKeyword: "",
            productLookupLoading: false,
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
        }
    },
    watch: {
        visible(val) {
            if (val) this.hydrate();
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
                    // Hydrate criteria regardless of the stored type — a
                    // legacy Selection collection just has no rules, so
                    // this resolves to "". Combined collections get both
                    // fields populated.
                    criteria: (row.rules && row.rules[0] && row.rules[0].criteria
                        && row.rules[0].criteria.equals) || "",
                    products: Array.isArray(row.products)
                        ? row.products.map(p => ({ ...p }))
                        : []
                };
            } else {
                this.form = {
                    id: "",
                    title: "",
                    note: "",
                    status: "Draft",
                    criteria: "",
                    products: []
                };
            }
            this.productSearchKeyword = "";
            this.$nextTick(() => {
                this.$refs.form && this.$refs.form.clearValidate();
            });
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
                // a collection needs SOMETHING to resolve — a criteria,
                // at least one picked product, or both.
                const criteriaText = String(this.form.criteria || "").trim();
                const pickedProducts = Array.isArray(this.form.products)
                    ? this.form.products
                    : [];
                if (!criteriaText && pickedProducts.length === 0) {
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
                    const derivedType = criteriaText && pickedProducts.length > 0
                        ? "Combined"
                        : (criteriaText ? "Criteria" : "Selection");

                    const payload = {
                        title: this.form.title,
                        type: derivedType,
                        note: this.form.note,
                        status: this.form.status,
                        // ALWAYS send both fields — update only writes
                        // provided keys, so omitting one would make it
                        // impossible to clear a criteria (or empty the
                        // product list) on an existing collection.
                        rules: criteriaText
                            ? [{ criteria: { equals: criteriaText } }]
                            : [],
                        products: pickedProducts.map(p => ({
                            itemId: p.itemId,
                            sku: p.sku || "",
                            name: p.name || "",
                            imageUrl: p.imageUrl || ""
                        }))
                    };

                    let saved = null;
                    if (this.form.id) {
                        const res = await updateCollection(this.form.id, payload);
                        saved = (res && res.data) || null;
                        this.$message.success("Collection updated successfully");
                    } else {
                        const res = await createCollection(payload);
                        saved = (res && res.data) || null;
                        this.$message.success("Collection created successfully");
                    }

                    this.$emit("saved", saved);
                    this.$emit("update:visible", false);
                } catch (error) {
                    console.error(error);
                    this.$message.error("Failed to save collection");
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
/* Help caption under the Criteria textarea explaining how the two
   sources combine. */
.criteria-help {
    display: block;
    margin-top: 4px;
    color: #909399;
    font-size: 12px;
    line-height: 1.4;
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
