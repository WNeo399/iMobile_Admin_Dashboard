<template>
    <!--
        Spare Parts Purchase → New Products (user ask 2026-10-06; laid out like
        Browse Items 2026-10-07): the device models we want parts for, in a
        Brand › Series › Model tree. A model shows its items grouped by
        classification, with the parts every model of the brand needs first
        (Motorola: Screen, Battery, Charging Port) and a warning when one of
        them is missing — which is then created in Zoho from here. A brand
        shows its series and a series its models, as tiles to pick from (user
        2026-10-07: no list).
    -->
    <div class="spn-page">
        <tree-panel ref="treeRef" :tree-data="tree" :title="$tp('Device Model')" title-icon-class="el-icon-mobile-phone"
            node-key="id" :show-search="true" :search-placeholder="$tp('Find a model, code or series')" storage-key="new-products-tree-width"
            :default-expanded-keys="expandedKeys" :default-width="260" :accordion="true" :filter-method="treeFilter" @node-click="onNode">
            <template #node="{ data }">
                <span :class="['spn-node', 'is-' + data.type]">
                    <brand-icon v-if="data.type === 'brand'" :brand="data.brand" :label="data.label" :size="16" class="spn-node-icon" />
                    <span class="spn-node-label" :title="data.title || data.label">{{ data.label }}</span>
                    <template v-if="data.type === 'model'">
                        <i v-if="data.drafts" class="el-icon-edit-outline spn-node-draft" :title="$tp('{n} draft(s)', { n: data.drafts })" />
                        <i v-if="data.missing" class="el-icon-warning spn-node-warn" :title="data.missingText" />
                        <i v-else class="el-icon-success spn-node-ok" :title="$tp('Complete')" />
                    </template>
                    <span v-else class="spn-node-count">
                        <em v-if="data.missing" class="spn-node-miss" :title="$tp('{n} model(s) missing a needed part', { n: data.missing })"><i class="el-icon-warning" />{{ data.missing }}</em>
                        {{ data.count }}
                    </span>
                </span>
            </template>
        </tree-panel>

        <div class="spn-main">
            <!-- where you are -->
            <div class="spn-head">
                <brand-icon v-if="sel.brand" :brand="sel.brand" :size="22" class="spn-head-icon" />
                <div class="spn-head-text">
                    <div class="spn-title">{{ headTitle }}<span class="spn-count">{{ headCount }}</span></div>
                    <div class="spn-sub" :title="headSub">{{ headSub }}</div>
                </div>
                <!-- every open draft (not in Zoho yet) -->
                <el-popover v-if="canCreate && drafts.length" v-model="draftsOpen" placement="bottom-end" width="460" trigger="click" popper-class="spn-drafts-pop">
                    <div class="spn-dl-title">{{ $tp('Drafts') }} <span class="spn-dim">— {{ $tp('not in Zoho until submitted') }}</span></div>
                    <div class="spn-dl">
                        <div v-for="d in drafts" :key="d._id" class="spn-dl-row" @click="draftsOpen = false; openDraft(d)">
                            <div class="spn-dl-thumb"><img v-if="d.thumb" :src="d.thumb" alt=""><i v-else class="el-icon-picture-outline" /></div>
                            <div class="spn-dl-main">
                                <div class="spn-dl-name">{{ d.name || $tp('(no name yet)') }}</div>
                                <div class="spn-dim">{{ draftModelName(d) }} · {{ partLabel(d) }} · {{ draftWhen(d) }}</div>
                            </div>
                            <el-button type="text" size="mini" icon="el-icon-delete" class="spn-dl-del" :title="$tp('Delete draft')" @click.stop="deleteDraft(d)" />
                        </div>
                    </div>
                    <el-button slot="reference" size="small" icon="el-icon-edit-outline">{{ $tp('Drafts') }} <b class="spn-dl-n">{{ drafts.length }}</b></el-button>
                </el-popover>
                <template v-if="model && canCreate">
                    <el-button size="small" icon="el-icon-edit" @click="openModel(model)">{{ $tp('Edit model') }}</el-button>
                    <el-button size="small" icon="el-icon-close" :title="$tp('Hide this model')" @click="hideModel(model)">{{ $tp('Hide') }}</el-button>
                </template>
                <el-button v-if="canCreate" type="primary" size="small" icon="el-icon-plus" @click="openModel()">{{ $tp('Add model') }}</el-button>
                <el-button size="small" icon="el-icon-refresh" :loading="loading || itemsLoading" :title="$tp('Refresh')" @click="refresh" />
            </div>

            <div class="spn-body">
                <!-- ── a model: its items by classification ─────────────── -->
                <template v-if="model">
                    <div v-if="model.note" class="spn-note"><i class="el-icon-info" /> {{ model.note }}</div>
                    <!-- the model's store category: every item created for it goes there -->
                    <div :class="['spn-catline', { 'is-unlinked': !model.categoryId }]">
                        <i class="el-icon-collection-tag" />
                        <span class="spn-catline-label">{{ $tp('Store category') }}:</span>
                        <span v-if="model.categoryId" class="spn-cat-path" :title="categoryPathOf(model)">{{ categoryPathOf(model) }}</span>
                        <span v-else class="spn-catline-none">{{ $tp('Not linked yet — items can be created once it is') }}</span>
                        <el-button v-if="canCreate" type="text" size="mini" :icon="model.categoryId ? 'el-icon-edit' : 'el-icon-link'" @click="openLink(model)">
                            {{ model.categoryId ? $tp('Change') : $tp('Link a category') }}</el-button>
                    </div>
                    <el-alert v-if="modelMissing.length" type="warning" show-icon :closable="false" class="spn-alert"
                        :title="$tp('Missing: {parts}', { parts: modelMissing.map(p => $tp(p.label)).join(', ') })"
                        :description="$tp('Every {brand} model needs a {parts}.', { brand: model.brand, parts: neededText(model.brand) })" />
                    <div v-loading="itemsLoading" class="spn-groups">
                        <section v-for="g in groups" :key="g.key" :class="['spn-group', { 'is-required': g.required, 'is-missing': g.required && !g.items.length }]">
                            <div class="spn-group-head">
                                <span class="spn-group-title">{{ $tp(g.label) }}</span>
                                <span class="spn-group-count">{{ g.items.length }}</span>
                                <span v-if="g.required" :class="['spn-req', g.items.length ? 'ok' : 'miss']">
                                    <i :class="g.items.length ? 'el-icon-success' : 'el-icon-warning'" /> {{ g.items.length ? $tp('Needed') : $tp('Missing') }}
                                </span>
                                <span class="spn-spacer" />
                                <!-- always there for a needed part (another quality, a colour …);
                                     red while the model has none -->
                                <el-button v-if="g.required && canCreate" :type="g.items.length ? 'primary' : 'danger'" :plain="!!g.items.length"
                                    size="mini" icon="el-icon-plus" @click="openCreate(model, g.part)">{{ $tp('Create') }}</el-button>
                            </div>
                            <div v-if="!g.items.length && !partDrafts(g).length" class="spn-none">{{ $tp('No {part} for this model yet', { part: $tp(g.label) }) }}</div>
                            <!-- drafts for this part — not in Zoho yet -->
                            <div v-for="d in partDrafts(g)" :key="d._id" class="spn-item spn-draft" @click="openDraft(d)">
                                <div class="spn-thumb">
                                    <img v-if="d.thumb" :src="d.thumb" alt="" loading="lazy">
                                    <i v-else class="el-icon-edit-outline" />
                                </div>
                                <div class="spn-item-main">
                                    <div class="spn-item-name" :title="d.name">{{ d.name || $tp('(no name yet)') }}</div>
                                    <div class="spn-item-meta">
                                        <span class="spn-draft-tag">{{ $tp('Draft') }}</span>
                                        <span class="spn-dim">{{ draftWhen(d) }}</span>
                                    </div>
                                </div>
                                <el-button v-if="canCreate" type="text" size="mini" icon="el-icon-edit" @click.stop="openDraft(d)">{{ $tp('Edit') }}</el-button>
                                <el-button v-if="canCreate" type="text" size="mini" icon="el-icon-delete" class="spn-dl-del" :title="$tp('Delete draft')" @click.stop="deleteDraft(d)" />
                            </div>
                            <div v-for="it in g.items" :key="it.itemId" class="spn-item">
                                <div class="spn-thumb">
                                    <img v-if="it.imageUrl" :src="it.imageUrl" alt="" loading="lazy">
                                    <i v-else class="el-icon-picture-outline" />
                                </div>
                                <div class="spn-item-main">
                                    <div class="spn-item-name" :title="it.name">{{ it.name }}</div>
                                    <div class="spn-item-meta">
                                        <a class="spn-link" :href="zohoLink(it.itemId)" target="_blank" rel="noopener" :title="$tp('Open in Zoho')">{{ it.sku || '—' }}</a>
                                        <span v-if="!g.required && it.subClassification" class="spn-type">{{ it.subClassification }}</span>
                                        <el-tag v-if="it.quality" size="mini" type="info" effect="plain">{{ it.quality }}</el-tag>
                                        <el-tag v-if="it.createdHere" size="mini" type="success" effect="plain">{{ $tp('created here') }}</el-tag>
                                        <span v-if="it.compatibleModels.length > 1" class="spn-fits" :title="it.compatibleModels.join('\n')">
                                            {{ $tp('fits {n} models', { n: it.compatibleModels.length }) }}</span>
                                    </div>
                                </div>
                                <div class="spn-stock">
                                    <em>{{ $tp('Stock') }}</em>
                                    <b :class="stockTone(it)">{{ it.available == null ? '—' : it.available }}</b>
                                </div>
                            </div>
                        </section>
                    </div>
                </template>

                <!-- ── a brand: its series · a series: its models — tiles to
                     pick from (no list, user 2026-10-07) ──────────────────── -->
                <div v-else v-loading="loading" class="spn-pickview">
                    <div class="spn-summary">
                        <span>{{ $tp('{n} model(s)', { n: nodeRows.length }) }}</span>
                        <span class="spn-dot">·</span>
                        <span class="spn-ok">{{ $tp('{n} complete', { n: nodeSummary.complete }) }}</span>
                        <span class="spn-dot">·</span>
                        <span class="spn-miss">{{ $tp('{n} part(s) still to create', { n: nodeSummary.missingCells }) }}</span>
                        <span v-for="p in nodeParts" :key="p.key" class="spn-partcount">{{ $tp(p.label) }} {{ haveCount(p.key) }}/{{ nodeRows.length }}</span>
                    </div>
                    <div class="spn-pick-hint">{{ sel.type === 'series' ? $tp('Pick a model') : $tp('Pick a series') }}</div>

                    <div v-if="sel.type === 'brand'" class="spn-tiles">
                        <div v-for="s in seriesTiles" :key="s.id" :class="['spn-tile', { 'is-missing': s.missing }]" @click="openSeries(s)">
                            <div class="spn-tile-title">{{ s.label }}</div>
                            <div class="spn-tile-sub">{{ $tp('{n} model(s)', { n: s.count }) }}</div>
                            <div class="spn-bar"><span :style="{ width: Math.round(100 * (s.count - s.missing) / (s.count || 1)) + '%' }" /></div>
                            <div class="spn-tile-foot">
                                <span v-if="s.missing" class="spn-warn"><i class="el-icon-warning" /> {{ $tp('{n} missing', { n: s.missing }) }}</span>
                                <span v-else class="spn-good"><i class="el-icon-success" /> {{ $tp('All complete') }}</span>
                                <span class="spn-tile-done">{{ $tp('{done}/{n} complete', { done: s.count - s.missing, n: s.count }) }}</span>
                            </div>
                        </div>
                    </div>

                    <div v-else class="spn-tiles">
                        <div v-for="r in nodeRows" :key="r._id" :class="['spn-tile', { 'is-missing': r.missing.length }]" @click="selectModel(r)">
                            <div class="spn-tile-title">
                                <i v-if="r.missing.length" class="el-icon-warning spn-node-warn" />
                                <i v-else class="el-icon-success spn-node-ok" />
                                {{ r.model }}
                            </div>
                            <div class="spn-tile-sub" :title="(r.codes || []).join(' / ')">{{ (r.codes || []).join(' / ') || '—' }}
                                <span v-if="(draftsByModel[r._id] || []).length" class="spn-draft-tag">{{ $tp('{n} draft(s)', { n: draftsByModel[r._id].length }) }}</span></div>
                            <!-- its store category, or that it has none yet -->
                            <div :class="['spn-tile-cat', { 'is-unlinked': !r.categoryId }]" :title="r.categoryId ? categoryPathOf(r) : ''">
                                <i class="el-icon-collection-tag" /> {{ r.categoryId ? (r.categoryName || categoryPathOf(r)) : $tp('No store category') }}</div>
                            <div class="spn-tile-parts">
                                <span v-for="p in nodeParts" :key="p.key" :class="['spn-part', (r.have[p.key] || []).length ? 'ok' : 'miss']">
                                    <i :class="(r.have[p.key] || []).length ? 'el-icon-check' : 'el-icon-close'" /> {{ $tp(p.label) }}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div v-if="!loading && !(sel.type === 'brand' ? seriesTiles.length : nodeRows.length)" class="spn-none-here">{{ $tp('No models here') }}</div>
                </div>
            </div>
        </div>

        <!-- ── Create one Zoho item ──────────────────────────────────── -->
        <el-dialog :visible.sync="createVisible" :width="createNarrow ? '96%' : '860px'" top="5vh" append-to-body
            :close-on-click-modal="false" custom-class="spn-create-dlg" @closed="clearCreateFiles">
            <!-- what is being made: the model, the part and its Zoho fields -->
            <div slot="title" class="spn-ct">
                <div class="spn-ct-title"><i class="el-icon-plus" /> {{ $tp('Create in Zoho Inventory') }}
                    <span v-if="createDraftId" class="spn-draft-tag">{{ $tp('Draft') }}</span></div>
                <div v-if="createRow" class="spn-ct-sub">
                    <b>{{ createRow.compatibleModel }}</b>
                    <span v-if="createPart" class="spn-ct-part">{{ $tp(createPart.label) }}</span>
                    <span v-if="createDefaults" class="spn-dim">
                        {{ $tp('Classification') }}: {{ createDefaults.classification }}<template v-if="createDefaults.subClassification"> / {{ createDefaults.subClassification }}</template>
                        · {{ $tp('Device Brand') }}: {{ createDefaults.deviceBrand }}
                        <template v-if="createSeries"> · {{ $tp('Device Series') }}: {{ createSeries }}</template>
                    </span>
                </div>
            </div>

            <!-- a screenshot pasted anywhere in the form becomes a photo -->
            <el-form label-position="top" size="small" class="spn-cf" @submit.native.prevent @paste.native="onCreatePaste">
                <div class="spn-cf-main">
                    <div class="spn-sec">{{ $tp('Item') }}</div>
                    <el-form-item :label="$tp('Item name')">
                        <!-- long names (models, codes, quality) read whole; Enter doesn't break the line -->
                        <el-input v-model="createForm.name" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" resize="none"
                            maxlength="200" show-word-limit class="spn-name" @keydown.native.enter.prevent />
                    </el-form-item>
                    <div class="spn-row">
                        <el-form-item class="spn-col">
                            <span slot="label">{{ $tp('SKU') }}
                                <el-tooltip :content="$tp('The next free number in the parts range; checked in Zoho before creating.')" placement="top">
                                    <i class="el-icon-info spn-help" /></el-tooltip></span>
                            <!-- the only field that asks Zoho: it fills in on its own -->
                            <el-input v-model="createForm.sku" :placeholder="skuLoading ? $tp('Finding the next free SKU…') : ''"
                                :suffix-icon="skuLoading ? 'el-icon-loading' : ''" />
                        </el-form-item>
                        <el-form-item :label="$tp('Quality')" class="spn-col">
                            <!-- the register's qualities, most used first; a new one can be typed -->
                            <el-select v-model="createForm.quality" clearable filterable allow-create default-first-option
                                :placeholder="$tp('None')" style="width:100%" @change="onQuality">
                                <el-option v-for="q in qualities.filter(Boolean)" :key="q" :label="q" :value="q" />
                            </el-select>
                        </el-form-item>
                    </div>
                    <el-form-item>
                        <span slot="label">{{ $tp('Category') }} <span class="spn-req">*</span>
                            <el-tooltip :content="$tp('The store category the model is linked to — every item created for it is filed there.')" placement="top">
                                <i class="el-icon-info spn-help" /></el-tooltip></span>
                        <!-- the model's link (2026-10-16), not picked per item; a model
                             without one is linked here first -->
                        <div v-if="createRow && createRow.categoryId" class="spn-cat-linked">
                            <i class="el-icon-collection-tag" /><span class="spn-cat-path" :title="categoryPathOf(createRow)">{{ categoryPathOf(createRow) }}</span>
                            <el-button v-if="canCreate" type="text" size="mini" icon="el-icon-edit" @click="openLink(createRow)">{{ $tp('Change') }}</el-button>
                        </div>
                        <div v-else class="spn-cat-unlinked">
                            <span><i class="el-icon-warning" /> {{ $tp('{model} is not linked to a store category yet', { model: createRow ? createRow.model : '' }) }}</span>
                            <el-button type="primary" plain size="mini" icon="el-icon-link" @click="openLink(createRow)">{{ $tp('Link a category') }}</el-button>
                        </div>
                    </el-form-item>

                    <div class="spn-sec">{{ $tp('Prices') }}
                        <el-tooltip :content="$tp('The price lists are written to Zoho after the item is made; blank ones stay unset.')" placement="top">
                            <i class="el-icon-info spn-help" /></el-tooltip></div>
                    <!-- the cost: Zoho's purchase price, and what the four lists are worked out from -->
                    <div class="spn-cost">
                        <div class="spn-price">
                            <span class="spn-price-label">{{ $tp('Cost price') }} <span class="spn-req">*</span>
                                <el-tooltip :content="$tp('Goes to Zoho as the purchase price. The four price lists are worked out from it with the pricing formula — they can still be changed.')" placement="top">
                                    <i class="el-icon-info spn-help" /></el-tooltip></span>
                            <el-input-number v-model="createForm.cost" size="small" :min="0" :precision="2" :controls="false" class="spn-money"
                                :placeholder="$tp('Required')" style="width:100%" @change="onCost" />
                        </div>
                        <div class="spn-price">
                            <span class="spn-price-label">{{ $tp('Selling price') }}
                                <el-tooltip :content="$tp('9999.99 is the usual placeholder until the price is set.')" placement="top">
                                    <i class="el-icon-info spn-help" /></el-tooltip></span>
                            <el-input-number v-model="createForm.rate" size="small" :min="0" :precision="2" :controls="false" class="spn-money" style="width:100%" />
                        </div>
                        <el-button v-if="formulaOff" type="text" size="mini" icon="el-icon-refresh" class="spn-formula" @click="applyFormula(true)">{{ $tp('Use the formula prices') }}</el-button>
                    </div>
                    <div class="spn-prices">
                        <div v-for="p in PRICE_LISTS" :key="p.list" class="spn-price">
                            <span class="spn-price-label">{{ p.label }}</span>
                            <el-input-number v-model="createForm.prices[p.list]" size="small" :min="0" :precision="2" :controls="false" class="spn-money"
                                :placeholder="$tp('Not set')" style="width:100%" />
                            <!-- changed from (or blank against) the formula: its price, click to use it -->
                            <span v-if="formulaPrices && offFormula(p.list)" class="spn-ref" :title="$tp('Use the formula price')"
                                @click="createForm.prices[p.list] = formulaPrices[p.list]">{{ $tp('Formula') }} ${{ formulaPrices[p.list].toFixed(2) }}</span>
                        </div>
                    </div>
                    <div v-for="w in priceWarnings" :key="w" class="spn-price-warn"><i class="el-icon-warning-outline" /> {{ w }}</div>

                    <div class="spn-sec">{{ $tp('Compatible Models') }}
                        <el-tooltip :content="$tp('Goes into the Compatible Model field in Zoho. One item can fit several models — it then counts for each of them.')" placement="top">
                            <i class="el-icon-info spn-help" /></el-tooltip></div>
                    <!-- every model of the brand on the page; the part counts for each one picked -->
                    <el-form-item class="spn-fits-item">
                        <el-select v-model="createForm.compatibleModels" multiple filterable style="width:100%"
                            :placeholder="$tp('Pick every model this part fits')">
                            <el-option v-for="m in modelOptions" :key="m" :label="m" :value="m" />
                        </el-select>
                    </el-form-item>
                </div>

                <!-- the Missing Images picker (compact); uploaded to the item
                     once it exists, the first becomes its main image -->
                <div class="spn-cf-side">
                    <div class="spn-sec">{{ $tp('Photos') }}<span v-if="createFiles.length" class="spn-sec-n">{{ createFiles.length }}</span></div>
                    <image-picker ref="photoPicker" v-model="createFiles" :max="MAX_PHOTOS" :disabled="creating" compact />
                </div>
            </el-form>

            <div slot="footer" class="spn-cfoot">
                <el-button v-if="createDraftId" type="text" size="small" icon="el-icon-delete" class="spn-dl-del" :disabled="creating || draftSaving"
                    @click="deleteDraft({ _id: createDraftId, name: createForm.name })">{{ $tp('Delete draft') }}</el-button>
                <span class="spn-cfoot-sum">{{ createSummary }}</span>
                <el-button size="small" :disabled="creating || draftSaving" @click="createVisible = false">{{ $tp('Cancel') }}</el-button>
                <!-- kept here, not in Zoho: open it again later to change or submit -->
                <el-button size="small" icon="el-icon-document" :loading="draftSaving" :disabled="creating" @click="saveDraft()">{{ $tp('Save draft') }}</el-button>
                <!-- a model without a store category creates nothing until it is linked -->
                <el-button type="primary" size="small" icon="el-icon-check" :loading="creating" :disabled="draftSaving || (skuLoading && !createForm.sku) || !(createRow && createRow.categoryId)"
                    @click="submitCreate">{{ $tp('Create item') }}</el-button>
            </div>
        </el-dialog>

        <!-- ── Link a model to its store category (user ask 2026-10-16) ──
             an existing category, or a new one made here under a parent;
             every item created for the model is filed there. -->
        <el-dialog :visible.sync="linkVisible" :width="createNarrow ? '96%' : '600px'" append-to-body top="12vh" :close-on-click-modal="false">
            <div slot="title" class="spn-dlg-head"><i class="el-icon-collection-tag" /> {{ $tp('Store category for {model}', { model: linkRow ? (linkRow.compatibleModel || linkRow.model) : '' }) }}</div>
            <div class="spn-link-text">{{ $tp('Every item created for this model is filed under this category.') }}</div>
            <el-radio-group v-if="canManageCategories" v-model="linkForm.mode" size="small" class="spn-link-mode">
                <el-radio-button label="pick">{{ $tp('Pick an existing one') }}</el-radio-button>
                <el-radio-button label="new">{{ $tp('Create a new one') }}</el-radio-button>
            </el-radio-group>
            <div v-loading="categoriesLoading && !categories.length">
                <template v-if="linkForm.mode === 'pick'">
                    <div class="spn-cat">
                        <!-- any level can be picked; typing searches the whole path -->
                        <el-cascader v-model="linkForm.categoryId" :options="categoryTree" :props="CATEGORY_PROPS" :filter-method="categoryFilter"
                            filterable clearable :placeholder="$tp('Pick the category')" class="spn-cat-pick" />
                        <el-tooltip :content="$tp('Read the categories again from Zoho (after adding one on the Categories page)')" placement="top">
                            <el-button size="small" icon="el-icon-refresh" :loading="categoriesLoading" @click="loadCategories(true)" />
                        </el-tooltip>
                    </div>
                    <!-- one with the model's name, if there is: a click picks it -->
                    <div v-if="linkSuggestion && linkSuggestion !== linkForm.categoryId" class="spn-cat-hint">
                        {{ $tp('Same name as the model') }}: <el-button type="text" size="mini" @click="linkForm.categoryId = linkSuggestion">{{ categoryPath(linkSuggestion) }}</el-button></div>
                </template>
                <el-form v-else label-position="top" size="small" class="spn-link-new" @submit.native.prevent>
                    <el-form-item :label="$tp('Name')">
                        <el-input v-model="linkForm.name" maxlength="200" />
                    </el-form-item>
                    <el-form-item :label="$tp('Under')">
                        <el-cascader v-model="linkForm.parentId" :options="categoryTree" :props="CATEGORY_PROPS" :filter-method="categoryFilter"
                            filterable clearable :placeholder="$tp('Pick the parent category')" style="width:100%" />
                    </el-form-item>
                    <div class="spn-cat-hint">{{ $tp('Visible on the store; not added to the site menu.') }}</div>
                </el-form>
            </div>
            <div slot="footer" class="spn-cfoot">
                <el-button v-if="linkRow && linkRow.categoryId" type="text" size="small" icon="el-icon-close" class="spn-dl-del" :disabled="linkSaving" @click="saveLink(true)">{{ $tp('Unlink') }}</el-button>
                <span class="spn-cfoot-sum" />
                <el-button size="small" :disabled="linkSaving" @click="linkVisible = false">{{ $tp('Cancel') }}</el-button>
                <el-button type="primary" size="small" :icon="linkForm.mode === 'new' ? 'el-icon-plus' : 'el-icon-link'" :loading="linkSaving" @click="saveLink(false)">
                    {{ linkForm.mode === 'new' ? $tp('Create & link') : $tp('Link') }}</el-button>
            </div>
        </el-dialog>

        <!-- ── Add / edit a model ────────────────────────────────────── -->
        <el-dialog :visible.sync="modelVisible" width="560px" append-to-body>
            <div slot="title" class="spn-dlg-head"><i class="el-icon-mobile-phone" /> {{ modelForm._id ? $tp('Edit model') : $tp('Add model') }}</div>
            <el-form label-position="top" size="small" @submit.native.prevent>
                <div class="spn-row">
                    <el-form-item :label="$tp('Brand')" class="spn-col">
                        <el-select v-model="modelForm.brand" :disabled="!!modelForm._id" style="width:100%">
                            <el-option v-for="b in brands" :key="b.value" :label="b.label" :value="b.value" />
                        </el-select>
                    </el-form-item>
                    <el-form-item :label="$tp('Series')" class="spn-col">
                        <el-input v-model="modelForm.series" :placeholder="$tp('e.g. G, Edge, Razr')" />
                    </el-form-item>
                </div>
                <el-form-item :label="$tp('Model')">
                    <el-input v-model="modelForm.model" :placeholder="$tp('e.g. Moto G96')" />
                </el-form-item>
                <el-form-item :label="$tp('Compatible Model')">
                    <el-input v-model="modelForm.compatibleModel" :placeholder="$tp('Leave blank for the brand + model')" />
                </el-form-item>
                <div class="spn-row">
                    <el-form-item :label="$tp('Model codes')" class="spn-col">
                        <el-input v-model="modelForm.codes" :placeholder="$tp('XT…, comma separated')" />
                    </el-form-item>
                    <el-form-item :label="$tp('Other names')" class="spn-col">
                        <el-input v-model="modelForm.aliases" :placeholder="$tp('comma separated')" />
                        <div class="spn-dim">{{ $tp('Other names the same phone goes by — items filed under them count too.') }}</div>
                    </el-form-item>
                </div>
                <el-form-item :label="$tp('Note')">
                    <el-input v-model="modelForm.note" maxlength="200" />
                </el-form-item>
            </el-form>
            <span slot="footer">
                <el-button size="small" @click="modelVisible = false">{{ $tp('Cancel') }}</el-button>
                <el-button type="primary" size="small" icon="el-icon-check" :loading="modelSaving" @click="submitModel">{{ $tp('Save') }}</el-button>
            </span>
        </el-dialog>
    </div>
</template>

<script>
import TreePanel from '@/components/TreePanel'
import BrandIcon from '@/views/zohoInventory/components/BrandIcon'
import ImagePicker from '@/views/zohoInventory/components/ImagePicker'
import { hasPermission } from '@/utils/permission'
import { listNewProducts, addNewProductModel, updateNewProductModel, newProductModelItems, nextNewProductSku, newProductCategories, createNewProductItem, saveNewProductDraft, updateNewProductDraft, getNewProductDraft, deleteNewProductDraft } from '@/api/sparePartsPurchase'
import { createCategory } from '@/api/website'
import { zohoLink } from './shared'

// the order the classifications are shown in after the needed parts
const CLASS_ORDER = ['Screen', 'Housing', 'Middle Frame', 'BackCover', 'Battery', 'Small Parts', 'IC', 'Tools', 'Accessory', 'Other']
const CLASS_LABELS = { BackCover: 'Back Cover', '': 'Unclassified' }
// the four price lists, as Price Monitoring names them
const PRICE_LISTS = [
    { list: 'platinum', label: 'Platinum' },
    { list: 'vip', label: 'VIP' },
    { list: 'svip', label: 'SVIP' },
    { list: 'wholesale', label: 'Wholesale' }
]
const blankPrices = () => ({ platinum: undefined, vip: undefined, svip: undefined, wholesale: undefined })
// photos on a new item — as on Missing Images (types / 7 MB: ImagePicker)
const MAX_PHOTOS = 10
// the Category picker: any level can be picked, the value is the id
const CATEGORY_PROPS = { checkStrictly: true, emitPath: false, value: 'id', label: 'label', children: 'children' }
// a brand's own short name in the store's category names ("MOTO G57")
const BRAND_SHORT = { Motorola: ['moto'] }
// the category list is read again after this long
const CATEGORIES_TTL = 10 * 60 * 1000

export default {
    name: 'SppNewProducts',
    components: { TreePanel, BrandIcon, ImagePicker },
    data() {
        return {
            loading: false,
            brands: [],
            qualities: [],
            rows: [],
            // the picked tree node: { type: brand | series | model, brand, series, modelId }
            sel: { type: '', brand: '', series: '', modelId: '' },
            expandedKeys: [],
            // the picked model's items
            items: [],
            itemsMissing: null,
            itemsLoading: false,
            itemsSeq: 0,
            // create-item dialog
            createVisible: false,
            createRow: null,
            createPart: null,
            createDefaults: null,
            skuLoading: false,
            createFiles: [],
            createNarrow: false,
            // the quality whose [tag] is on the name now
            appliedQuality: '',
            // drafts: the open ones (from the list), and the one in the dialog
            drafts: [],
            draftsOpen: false,
            createDraftId: null,
            draftSaving: false,
            MAX_PHOTOS,
            skuSeq: 0,
            placeholderRate: 9999.99,
            createForm: { name: '', sku: '', quality: '', rate: undefined, cost: undefined, compatibleModels: [], prices: blankPrices() },
            // linking a model to its store category
            linkVisible: false,
            linkRow: null,
            linkForm: { mode: 'pick', categoryId: '', name: '', parentId: '' },
            linkSaving: false,
            PRICE_LISTS,
            // the pricing formula from the server (utils/priceRules PRICE_FORMULAS),
            // and the prices it last filled in (a list still showing them is "untouched")
            priceFormulas: {},
            lastAuto: null,
            // the store categories (Zoho Commerce), flat as the server sends them
            categories: [],
            categoriesAt: 0,
            categoriesLoading: false,
            CATEGORY_PROPS,
            creating: false,
            // add / edit model dialog
            modelVisible: false,
            modelForm: { _id: null, brand: 'Motorola', series: '', model: '', compatibleModel: '', codes: '', aliases: '', note: '' },
            modelSaving: false
        }
    },
    computed: {
        canCreate() {
            return this.can('listing:product:create') // iMobile Listing since 2026-10-16
        },
        // the open drafts by model
        draftsByModel() {
            const map = {}
            for (const d of this.drafts) (map[d.modelId] = map[d.modelId] || []).push(d)
            return map
        },
        // Brand › Series › Model, in the server's order (series order, then model)
        tree() {
            const out = []
            const brandNodes = new Map()
            const seriesNodes = new Map()
            for (const b of this.brands) {
                const node = { id: 'b:' + b.value, type: 'brand', brand: b.value, label: b.label, children: [], count: 0, missing: 0 }
                brandNodes.set(b.value, node)
            }
            for (const r of this.rows) {
                const b = brandNodes.get(r.brand)
                if (!b) continue
                const series = r.series || 'Other'
                const sid = `s:${r.brand}|${series}`
                let s = seriesNodes.get(sid)
                if (!s) {
                    s = { id: sid, type: 'series', brand: r.brand, series, label: series, children: [], count: 0, missing: 0 }
                    seriesNodes.set(sid, s)
                    b.children.push(s)
                }
                const miss = r.missing.length
                s.children.push({
                    id: 'm:' + r._id, type: 'model', brand: r.brand, series, modelId: r._id,
                    label: r.model,
                    title: [r.compatibleModel, (r.codes || []).join(' / ')].filter(Boolean).join(' · '),
                    hay: [r.model, r.compatibleModel, series, ...(r.codes || []), ...(r.aliases || [])].join(' ').toLowerCase(),
                    missing: miss,
                    drafts: (this.draftsByModel[r._id] || []).length,
                    missingText: miss ? this.$tp('Missing: {parts}', { parts: this.partLabels(r.brand, r.missing) }) : ''
                })
                s.count++
                b.count++
                if (miss) { s.missing++; b.missing++ }
            }
            for (const b of brandNodes.values()) if (b.children.length) out.push(b)
            return out
        },
        // the picked model (its row: coverage, codes, note)
        model() {
            if (this.sel.type !== 'model') return null
            return this.rows.find(r => r._id === this.sel.modelId) || null
        },
        // the needed parts the picked model has no item for
        modelMissing() {
            if (!this.model) return []
            const keys = this.itemsMissing || this.model.missing
            return this.partsOf(this.model.brand).filter(p => keys.includes(p.key))
        },
        // the picked model's items: the needed parts first (always shown,
        // empty or not), then the other classifications
        groups() {
            if (!this.model) return []
            const needed = this.partsOf(this.model.brand).map(p => ({ key: 'p:' + p.key, label: p.label, required: true, part: p, items: [] }))
            const byKey = {}
            needed.forEach(g => { byKey[g.key] = g })
            const others = []
            for (const it of this.items) {
                const key = it.part ? 'p:' + it.part : 'c:' + (it.classification || '')
                if (!byKey[key]) {
                    const c = it.classification || ''
                    byKey[key] = { key, label: CLASS_LABELS[c] || c, required: false, items: [], order: CLASS_ORDER.indexOf(c) < 0 ? 99 : CLASS_ORDER.indexOf(c) }
                    others.push(byKey[key])
                }
                byKey[key].items.push(it)
            }
            others.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
            const byName = (a, b) => (a.subClassification || '').localeCompare(b.subClassification || '') || a.name.localeCompare(b.name)
            const all = needed.concat(others)
            all.forEach(g => g.items.sort(byName))
            return all
        },
        // a brand / series: its models
        nodeRows() {
            const { type, brand, series } = this.sel
            return this.rows.filter(r => {
                if (!type) return true
                if (r.brand !== brand) return false
                return type !== 'series' || (r.series || 'Other') === series
            })
        },
        seriesTiles() {
            const b = this.tree.find(n => n.id === 'b:' + this.sel.brand)
            return b ? b.children : []
        },
        nodeParts() {
            const brand = this.sel.brand || (this.brands[0] && this.brands[0].value)
            return this.partsOf(brand)
        },
        nodeSummary() {
            return {
                complete: this.nodeRows.filter(r => !r.missing.length).length,
                missingCells: this.nodeRows.reduce((t, r) => t + r.missing.length, 0)
            }
        },
        headTitle() {
            if (this.model) return this.model.compatibleModel || `${this.model.brand} ${this.model.model}`
            if (this.sel.type === 'series') return `${this.brandLabel(this.sel.brand)} ${this.sel.series}`
            if (this.sel.type === 'brand') return this.brandLabel(this.sel.brand)
            return this.$tt('New Products')
        },
        headCount() {
            if (this.model) return this.itemsLoading ? '' : this.$tp('{n} item(s)', { n: this.items.length })
            return this.$tp('{n} model(s)', { n: this.nodeRows.length })
        },
        headSub() {
            if (this.model) {
                const m = this.model
                const bits = [[this.brandLabel(m.brand), m.series || 'Other', m.model].join(' › ')]
                if (m.codes && m.codes.length) bits.push(m.codes.join(' / '))
                if (m.aliases && m.aliases.length) bits.push(`${this.$tp('also')}: ${m.aliases.join(', ')}`)
                return bits.join(' · ')
            }
            return this.$tp('Every {brand} model needs a {parts}.', { brand: this.brandLabel(this.sel.brand || (this.brands[0] && this.brands[0].value)), parts: this.neededText(this.sel.brand || (this.brands[0] && this.brands[0].value)) })
        },
        // the Device Series the item will get — from the picked models (the
        // server's rule, sent per model with the list)
        createSeries() {
            const byModel = {}
            for (const r of this.rows) if (r.compatibleModel) byModel[r.compatibleModel] = r.deviceSeries
            const all = (this.createForm.compatibleModels || []).flatMap(m => String(byModel[m] || '').split(';').map(x => x.trim())).filter(Boolean)
            return [...new Set(all)].join('; ')
        },
        // the footer: what Create item will make ("SKU 22412 · 2 photos · 3 prices")
        createSummary() {
            const bits = []
            const sku = String(this.createForm.sku || '').trim()
            bits.push(sku ? this.$tp('SKU {sku}', { sku }) : (this.skuLoading ? this.$tp('Finding the next free SKU…') : this.$tp('No SKU yet')))
            if (this.createFiles.length) bits.push(this.$tp('{n} photo(s)', { n: this.createFiles.length }))
            const cost = Number(this.createForm.cost)
            if (cost > 0) bits.push(this.$tp('Cost {cost}', { cost: '$' + cost.toFixed(2) }))
            const prices = Object.values(this.createForm.prices || {}).filter(v => v != null && v !== '').length
            if (prices) bits.push(this.$tp('{n} price list(s)', { n: prices }))
            if (this.createRow && this.createRow.categoryId) bits.push(this.createRow.categoryName || this.categoryPathOf(this.createRow))
            return bits.join(' · ')
        },
        // ── the pricing formula ──
        // which one prices the item: the part's own (from the server), or
        // the service-pack one when the quality / name says "Service Pack"
        priceFamily() {
            const sp = /service pack/i
            if (sp.test(this.createForm.quality || '') || sp.test(this.createForm.name || '')) return 'service-pack'
            return (this.createPart && this.createPart.priceFamily) || 'other'
        },
        // the four lists for the typed cost (null without a cost)
        formulaPrices() {
            const cost = Number(this.createForm.cost)
            const f = this.priceFormulas[this.priceFamily]
            if (!(cost > 0) || !f) return null
            const at = ([add, times]) => Math.round((cost + add) * times * 100) / 100
            return { platinum: at(f.platinum), vip: at(f.vip), svip: at(f.svip), wholesale: at(f.wholesale) }
        },
        // some list differs from the formula (or is blank)
        formulaOff() {
            return !!this.formulaPrices && PRICE_LISTS.some(p => this.offFormula(p.list))
        },
        // ── the store category ──
        categoryById() {
            const map = {}
            for (const c of this.categories) map[c.id] = c
            return map
        },
        // the categories that can be picked: shown on the store — a hidden
        // one is left out with everything under it
        pickableCategories() {
            const shown = c => {
                for (let x = c, n = 0; x && n < 20; x = this.categoryById[x.parentId], n++) if (!x.visible) return false
                return true
            }
            return this.categories.filter(shown)
        },
        // those as a tree for the picker (by the store's own order)
        categoryTree() {
            const kids = {}
            const sorted = [...this.pickableCategories].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
            for (const c of sorted) (kids[c.parentId] = kids[c.parentId] || []).push(c)
            const build = (parentId, seen) => (kids[parentId] || []).filter(c => !seen.has(c.id)).map(c => {
                const node = { id: c.id, label: c.name }
                const below = build(c.id, new Set([...seen, c.id]))
                if (below.length) node.children = below
                return node
            })
            return build('-1', new Set())
        },
        // may make store categories (the Categories page's right) — "Create a new one" in the link dialog
        canManageCategories() {
            return this.can('listing:category:manage')
        },
        // in the link dialog: a category with the model's own name, offered as a one-click pick
        linkSuggestion() {
            return this.linkRow ? this.suggestCategoryFor(this.linkRow) : ''
        },
        // the typed price lists against the tier order (advisory, as on Price
        // Monitoring: SVIP & Wholesale ≤ VIP ≤ Platinum; SVIP vs Wholesale free)
        priceWarnings() {
            const p = this.createForm.prices || {}
            const has = k => p[k] != null && p[k] !== ''
            const out = []
            const rule = (low, high, a, b) => { if (has(low) && has(high) && Number(p[low]) > Number(p[high])) out.push(this.$tp('{a} is above {b}', { a, b })) }
            rule('vip', 'platinum', 'VIP', 'Platinum')
            rule('svip', 'vip', 'SVIP', 'VIP')
            rule('wholesale', 'vip', 'Wholesale', 'VIP')
            if (!has('vip')) { rule('svip', 'platinum', 'SVIP', 'Platinum'); rule('wholesale', 'platinum', 'Wholesale', 'Platinum') }
            // a list under the cost loses money
            const cost = Number(this.createForm.cost)
            if (cost > 0) for (const { list, label } of PRICE_LISTS) if (has(list) && Number(p[list]) < cost) out.push(this.$tp('{a} is below the cost', { a: label }))
            return out
        },
        // the brand's models, for the create dialog's Compatible Model picker
        modelOptions() {
            const brand = this.createRow ? this.createRow.brand : this.sel.brand
            return [...new Set(this.rows.filter(r => r.brand === brand).map(r => r.compatibleModel).filter(Boolean))]
                .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
        }
    },
    watch: {
        // a rebuilt tree (a reload) loses its open branch and
        // highlight: put them back
        tree() {
            this.$nextTick(() => {
                const key = this.selKey()
                if (key) this.revealInTree(key)
            })
        }
    },
    created() {
        this.load()
    },
    methods: {
        zohoLink,
        can(p) {
            return hasPermission(this.$store.getters.permissions, p)
        },
        // the server's own reason first ("SKU 8119 is already used in Zoho"),
        // not axios' "Request failed with status code 400"
        msg(e, fallback) {
            return (e && e.response && e.response.data && e.response.data.message) || (e && e.message) || fallback
        },
        partsOf(brand) {
            return ((this.brands.find(b => b.value === brand) || {}).parts) || []
        },
        partLabels(brand, keys) {
            return this.partsOf(brand).filter(p => keys.includes(p.key)).map(p => this.$tp(p.label)).join(', ')
        },
        // "Screen, Battery and Charging Port"
        neededText(brand) {
            const labels = this.partsOf(brand).map(p => this.$tp(p.label))
            if (labels.length < 2) return labels.join('')
            return labels.slice(0, -1).join(', ') + ' ' + this.$tp('and') + ' ' + labels[labels.length - 1]
        },
        brandLabel(brand) {
            return ((this.brands.find(b => b.value === brand) || {}).label) || brand || ''
        },
        haveCount(partKey) {
            return this.nodeRows.filter(r => (r.have[partKey] || []).length).length
        },
        stockTone(it) {
            const a = Number(it.available) || 0
            return a <= 0 ? 'spn-bad' : a < 3 ? 'spn-warn' : 'spn-good'
        },
        // the tree search also finds model codes and other names
        treeFilter(value, data) {
            if (!value) return true
            const q = String(value).trim().toLowerCase()
            return (data.hay || String(data.label || '').toLowerCase()).includes(q)
        },
        selKey() {
            const { type, brand, series, modelId } = this.sel
            if (type === 'model') return 'm:' + modelId
            if (type === 'series') return `s:${brand}|${series}`
            if (type === 'brand') return 'b:' + brand
            return null
        },
        // ── loading ────────────────────────────────────────────────
        async load() {
            this.loading = true
            try {
                const r = await listNewProducts({})
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.brands = r.brands || []
                this.qualities = r.qualities || []
                if (r.placeholderRate != null) this.placeholderRate = r.placeholderRate
                this.priceFormulas = r.priceFormulas || {}
                this.rows = r.rows || []
                this.drafts = r.drafts || []
                // the first brand to start with; a hidden model falls back to its series
                if (!this.sel.type && this.brands[0]) {
                    this.sel = { type: 'brand', brand: this.brands[0].value, series: '', modelId: '' }
                    this.expandedKeys = ['b:' + this.brands[0].value]
                } else if (this.sel.type === 'model' && !this.model) {
                    this.sel = { ...this.sel, type: 'series', modelId: '' }
                }
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to load the models')))
            } finally {
                this.loading = false
            }
        },
        async loadItems() {
            if (this.sel.type !== 'model') return
            const seq = ++this.itemsSeq
            this.itemsLoading = true
            try {
                const r = await newProductModelItems(this.sel.modelId)
                if (seq !== this.itemsSeq) return
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.items = r.items || []
                this.itemsMissing = r.missing || null
            } catch (e) {
                if (seq === this.itemsSeq) this.$message.error(this.msg(e, this.$tp('Failed to load the parts')))
            } finally {
                if (seq === this.itemsSeq) this.itemsLoading = false
            }
        },
        async refresh() {
            await this.load()
            this.loadItems()
        },
        onNode(data) {
            this.sel = { type: data.type, brand: data.brand, series: data.series || '', modelId: data.modelId || '' }
            this.items = []
            this.itemsMissing = null
            this.loadItems()
        },
        // a series tile → that series (its models), the tree follows
        openSeries(s) {
            this.sel = { type: 'series', brand: s.brand, series: s.series, modelId: '' }
            this.items = []
            this.itemsMissing = null
            this.$nextTick(() => this.revealInTree(s.id))
        },
        // open a model (a tile, or after adding / editing one) and show it in the tree
        selectModel(row) {
            const series = row.series || 'Other'
            this.sel = { type: 'model', brand: row.brand, series, modelId: row._id }
            this.items = []
            this.itemsMissing = null
            this.$nextTick(() => this.revealInTree('m:' + row._id))
            this.loadItems()
        },
        // open the node's branch (one branch per level, as a click leaves
        // it), highlight it and scroll it into view
        revealInTree(key) {
            const tree = this.$refs.treeRef && this.$refs.treeRef.$refs.treeRef
            const node = tree && tree.getNode(key)
            if (!node) return
            // a brand / series opens too; a model opens its parents
            for (let n = node.childNodes.length ? node : node.parent; n && n.level > 0; n = n.parent) {
                (n.parent ? n.parent.childNodes : []).forEach(sib => { if (sib !== n && sib.expanded) sib.collapse() })
                n.expand()
            }
            tree.setCurrentKey(key)
            // after the branch has finished opening
            clearTimeout(this.revealTimer)
            this.revealTimer = setTimeout(() => {
                const el = tree.$el.querySelector('.is-current > .el-tree-node__content')
                if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' })
            }, 350)
        },
        // ── Create a Zoho item ─────────────────────────────────────
        // Opens at once: the name, Zoho fields and price came with the list;
        // the next free SKU (a Zoho check) fills in on its own.
        openCreate(row, part) {
            const brand = this.brands.find(b => b.value === row.brand) || {}
            this.clearCreateFiles()
            this.createDraftId = null
            this.appliedQuality = ''
            this.createNarrow = window.innerWidth < 900
            this.createRow = row
            this.createPart = part
            this.createDefaults = { classification: part.classification, subClassification: part.subClassification, deviceBrand: brand.deviceBrand || row.brand }
            this.createForm = {
                name: (row.defaultNames || {})[part.key] || '',
                sku: '',
                quality: '',
                rate: this.placeholderRate,
                cost: undefined,
                compatibleModels: [row.compatibleModel].filter(Boolean),
                prices: blankPrices()
            }
            this.lastAuto = null
            this.createVisible = true
            this.loadNextSku()
        },
        // ── the pricing formula ──
        // a list that isn't the formula's price (blank counts)
        offFormula(list) {
            const v = this.createForm.prices[list]
            return v == null || v === '' || Math.abs(Number(v) - this.formulaPrices[list]) > 0.004
        },
        // Fill the four lists from the formula: always when asked (`force` —
        // the cost was typed, the button), otherwise only while no list was
        // changed by hand since the formula last filled them.
        applyFormula(force) {
            const f = this.formulaPrices
            if (!f) return
            const p = this.createForm.prices || {}
            const untouched = PRICE_LISTS.every(({ list }) => p[list] == null || p[list] === '' || (this.lastAuto && Number(p[list]) === this.lastAuto[list]))
            if (!force && !untouched) return
            this.createForm.prices = { ...f }
            this.lastAuto = { ...f }
        },
        onCost() {
            this.applyFormula(true)
        },
        // ── the store category ──
        async loadCategories(refresh) {
            if (this.categoriesLoading) return
            this.categoriesLoading = true
            try {
                const r = await newProductCategories(refresh)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.categories = r.categories || []
                this.categoriesAt = Date.now()
            } catch (e) {
                this.$message.warning(this.msg(e, this.$tp('Could not read the categories from Zoho Commerce')))
            } finally {
                this.categoriesLoading = false
            }
        },
        // typing in the picker searches the whole path, any case
        categoryFilter(node, keyword) {
            return String(node.text || '').toLowerCase().includes(String(keyword || '').toLowerCase())
        },
        // The category named after a model: names compared without the brand
        // ("Motorola" / "MOTO"), case or punctuation — "MOTO G57" for Moto G57;
        // the model's own name before its other names (Moto X40 → Edge 40 Pro).
        // Several with that name: the one under the brand's branch, then the
        // one with products; still several → none.
        suggestCategoryFor(row) {
            if (!row || !this.categories.length) return ''
            const brand = this.brands.find(b => b.value === row.brand) || {}
            const words = [...new Set([row.brand, brand.deviceBrand, brand.label, ...(BRAND_SHORT[row.brand] || [])].filter(Boolean).map(w => String(w).toLowerCase()))]
                .sort((a, b) => b.length - a.length)
            const norm = s => {
                let x = ` ${String(s || '').toLowerCase()} `
                for (const w of words) x = x.split(w).join(' ')
                return x.replace(/[^a-z0-9]+/g, '')
            }
            // a category named for several models ("Razr Plus (2024) / Razr 50 Ultra") counts for each
            const keysOf = c => String(c.name || '').split('/').map(norm).filter(Boolean)
            const match = names => {
                const t = new Set(names.map(norm).filter(Boolean))
                return this.pickableCategories.filter(c => keysOf(c).some(k => t.has(k)))
            }
            // the model's own name first; its other names (China / US names) only when that finds none
            let hits = match([row.model, row.compatibleModel])
            if (!hits.length) hits = match(row.aliases || [])
            if (hits.length > 1) {
                const underBrand = hits.filter(c => {
                    for (let p = this.categoryById[c.parentId]; p; p = this.categoryById[p.parentId]) {
                        if (words.some(w => p.name.toLowerCase().includes(w))) return true
                    }
                    return false
                })
                if (underBrand.length) hits = underBrand
                if (hits.length > 1) hits = hits.filter(c => c.hasProducts)
            }
            return hits.length === 1 ? hits[0].id : ''
        },
        // a category's path ("MORE › MOTO › MOTO G Series › MOTO G96") from the list
        categoryPath(id) {
            const names = []
            for (let c = this.categoryById[id], n = 0; c && n < 12; c = this.categoryById[c.parentId], n++) names.unshift(c.name)
            return names.join(' › ')
        },
        // a model's linked category as a path: the live list when it's here, else the one saved with the link
        categoryPathOf(row) {
            if (!row || !row.categoryId) return ''
            return (this.categoryById[row.categoryId] && this.categoryPath(row.categoryId)) || row.categoryPath || row.categoryName || row.categoryId
        },
        // ── Link a model to its store category (2026-10-16) ──
        // A new category's name in the tree's own style: Motorola's
        // "MOTO G96" / "Edge 70 Pro" / "ThinkPhone"; other brands the model.
        newCategoryName(row) {
            const m = String(row.model || '').trim()
            if (row.brand !== 'Motorola') return m
            if (/^(edge|thinkphone)\b/i.test(m)) return m
            return 'MOTO ' + m.replace(/^moto\s+/i, '')
        },
        // where a new category goes: where the series' other models' categories
        // are, else the brand's, else beside the category with the model's name
        newCategoryParent(row) {
            const count = list => {
                const n = {}
                for (const r of list) {
                    const c = r.categoryId && this.categoryById[r.categoryId]
                    if (c) n[c.parentId] = (n[c.parentId] || 0) + 1
                }
                return Object.keys(n).sort((a, b) => n[b] - n[a])[0] || ''
            }
            const others = this.rows.filter(r => r._id !== row._id && r.brand === row.brand)
            const same = this.categoryById[this.suggestCategoryFor(row)]
            return count(others.filter(r => (r.series || 'Other') === (row.series || 'Other'))) || count(others) || (same ? same.parentId : '')
        },
        async openLink(row) {
            if (!row) return
            this.linkRow = row
            this.linkForm = { mode: 'pick', categoryId: row.categoryId || '', name: this.newCategoryName(row), parentId: '' }
            this.createNarrow = window.innerWidth < 900
            this.linkVisible = true
            if (!this.categories.length || Date.now() - this.categoriesAt > CATEGORIES_TTL) await this.loadCategories()
            if (this.linkVisible && this.linkRow === row) this.linkForm.parentId = this.newCategoryParent(row)
        },
        // Link (or unlink) the model; "Create a new one" makes the category
        // first (visible, not in the site menu). The model's row takes the link.
        async saveLink(unlink) {
            const row = this.linkRow
            if (!row || this.linkSaving) return
            let categoryId = ''
            if (!unlink) {
                if (this.linkForm.mode === 'new') {
                    if (!(this.linkForm.name || '').trim()) { this.$message.warning(this.$tp('Enter the category name')); return }
                    if (!this.linkForm.parentId) { this.$message.warning(this.$tp('Pick the parent category')); return }
                } else if (!this.linkForm.categoryId) { this.$message.warning(this.$tp('Pick the category')); return }
            }
            this.linkSaving = true
            try {
                if (!unlink && this.linkForm.mode === 'new') {
                    const c = await createCategory({ name: this.linkForm.name.trim(), parentId: this.linkForm.parentId, visible: true, showInMenu: false })
                    if (!c || c.success === false || !c.category) throw new Error((c && c.message) || 'Failed')
                    categoryId = c.category.id
                    this.$message.success(this.$tp('{name} created', { name: c.category.name }))
                    await this.loadCategories(true)
                } else if (!unlink) categoryId = this.linkForm.categoryId
                const r = await updateNewProductModel(row._id, { categoryId })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                const m = r.model || {}
                // the row everywhere on the page (tree, tiles, the open create dialog)
                for (const x of this.rows.filter(x => x._id === row._id).concat(row)) {
                    this.$set(x, 'categoryId', m.categoryId || null)
                    this.$set(x, 'categoryName', m.categoryName || null)
                    this.$set(x, 'categoryPath', m.categoryPath || null)
                }
                this.$message.success(unlink ? this.$tp('Unlinked') : this.$tp('{model} → {path}', { model: row.model, path: m.categoryPath || this.categoryPath(categoryId) }))
                this.linkVisible = false
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Could not link the category')))
            } finally {
                this.linkSaving = false
            }
        },
        // what Create item needs (a draft can be saved without)
        checkCreate() {
            const warn = text => { this.$message.warning(this.$tp(text)); return false }
            if (!this.createForm.name || this.createForm.name.trim().length < 5) return warn('Enter the item name')
            if (!/^\d{4,6}$/.test(String(this.createForm.sku || '').trim())) return warn('SKU must be a number')
            if (!this.createForm.compatibleModels.length) return warn('Pick every model this part fits')
            if (!(Number(this.createForm.cost) > 0)) return warn('Enter the cost price')
            if (!this.createRow || !this.createRow.categoryId) return warn('Link the model to a store category first')
            return true
        },
        async loadNextSku() {
            const seq = ++this.skuSeq
            this.skuLoading = true
            try {
                const r = await nextNewProductSku()
                if (seq !== this.skuSeq) return
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                // a SKU typed in meanwhile stays
                if (!String(this.createForm.sku || '').trim()) this.createForm.sku = r.sku
            } catch (e) {
                if (seq === this.skuSeq) this.$message.warning(this.$tp('Could not find the next free SKU — type one in'))
            } finally {
                if (seq === this.skuSeq) this.skuLoading = false
            }
        },
        // The quality goes at the end of the name in brackets, the way the
        // team's items read ("… Compatible Battery [Original]"); picking
        // another one swaps it, clearing it takes it off. Only a trailing tag
        // that IS a quality is replaced, so typed wording stays.
        withQuality(name, quality) {
            // the list's qualities, and the one put on last (it may have been typed)
            const known = [...this.qualities.filter(Boolean), this.appliedQuality].filter(Boolean)
            let base = String(name || '').trim()
            for (let m = base.match(/\s*\[([^\]]+)\]$/); m && known.includes(m[1]); m = base.match(/\s*\[([^\]]+)\]$/)) {
                base = base.slice(0, m.index).trim()
            }
            return quality ? `${base} [${quality}]` : base
        },
        onQuality(q) {
            this.createForm.name = this.withQuality(this.createForm.name, q || '')
            this.appliedQuality = q || ''
            // "Service Pack" prices with its own formula: follow it unless a list was changed by hand
            this.applyFormula(false)
        },
        // a screenshot pasted into the form goes to the picker (same checks)
        onCreatePaste(e) {
            const files = Array.from((e.clipboardData && e.clipboardData.files) || []).filter(x => /^image\//i.test(x.type))
            if (!files.length || !this.$refs.photoPicker) return
            e.preventDefault()
            this.$refs.photoPicker.add(files.map((raw, i) => raw.name && raw.name !== 'image.png'
                ? raw : new File([raw], `screenshot-${Date.now() + i}.png`, { type: raw.type })))
        },
        clearCreateFiles() {
            for (const x of this.createFiles) { if (x.url && x.url.startsWith('blob:')) { try { URL.revokeObjectURL(x.url) } catch (e) { /* ignore */ } } }
            this.createFiles = []
        },
        async submitCreate() {
            if (!this.createRow || !this.createPart) return
            if (this.createDraftId) return this.submitDraft()
            if (!this.checkCreate()) return
            this.creating = true
            try {
                const fields = this.createFields()
                // with photos: one multipart request (the item, then its photos)
                const files = this.createFiles.map(x => x.file)
                let data = fields
                if (files.length) {
                    data = new FormData()
                    Object.keys(fields).forEach(k => data.append(k, k === 'compatibleModels' || k === 'prices' ? JSON.stringify(fields[k]) : (fields[k] == null ? '' : fields[k])))
                    files.forEach(f => data.append('images', f, f.name))
                }
                const r = await createNewProductItem(data)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.afterCreated(r)
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Zoho did not create the item')))
            } finally {
                this.creating = false
            }
        },
        // After Zoho made the item (fresh or from a draft): say so, and what didn't make it.
        afterCreated(r) {
            // the item exists either way; a photo that didn't make it is said so
            if (r.photos && r.photos.error) {
                this.$message.warning(this.$tp('{sku} created, but the photos did not upload: {error} — add them from Missing Images', { sku: r.item.sku, error: r.photos.error }))
            }
            const priceErrors = Object.keys((r.prices && r.prices.errors) || {})
            if (priceErrors.length) {
                const names = priceErrors.map(k => (PRICE_LISTS.find(p => p.list === k) || { label: k }).label).join(', ')
                this.$message.warning(this.$tp('{sku} created, but these prices did not save: {lists} — set them on Price Monitoring', { sku: r.item.sku, lists: names }))
            }
            if (r.category && r.category.error) {
                this.$message.warning(this.$tp('{sku} created, but the category did not save: {error} — file it on the Categories page', { sku: r.item.sku, error: r.category.error }))
            }
            const h = this.$createElement
            this.$notify({
                title: this.$tp('Created in Zoho'),
                message: h('span', [`${r.item.sku} · ${r.item.name}${r.countedFor > 1 ? ' · ' + this.$tp('counts for {n} models', { n: r.countedFor }) : ''} `, h('a', { attrs: { href: zohoLink(r.item.itemId), target: '_blank', rel: 'noopener' } }, this.$tp('Open in Zoho'))]),
                type: 'success', duration: 8000
            })
            this.createVisible = false
            this.refresh()
        },
        // ── Drafts ─────────────────────────────────────────────────
        partDrafts(g) {
            if (!g.required || !this.model) return []
            return (this.draftsByModel[this.model._id] || []).filter(d => d.part === g.part.key)
        },
        partLabel(d) {
            const p = this.partsOf(d.brand).find(x => x.key === d.part)
            return p ? this.$tp(p.label) : d.part
        },
        draftModelName(d) {
            const row = this.rows.find(r => r._id === d.modelId)
            return row ? (row.compatibleModel || row.model) : ''
        },
        draftWhen(d) {
            const t = d.updatedAt ? new Date(d.updatedAt) : null
            const when = t && !isNaN(t) ? t.toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''
            return d.updatedBy ? this.$tp('saved {when} by {who}', { when, who: d.updatedBy }) : this.$tp('saved {when}', { when })
        },
        // the dialog's fields as sent (the same for a draft and a create)
        createFields() {
            return {
                modelId: this.createRow._id, part: this.createPart.key,
                // one line in Zoho: a pasted line break becomes a space
                name: String(this.createForm.name || '').replace(/[\r\n]+/g, ' ').trim(), sku: String(this.createForm.sku || '').trim(),
                quality: this.createForm.quality || '', rate: this.createForm.rate,
                // the cost (Zoho's purchase price); the store category is the model's link (server side)
                cost: this.createForm.cost == null ? null : this.createForm.cost,
                compatibleModels: this.createForm.compatibleModels,
                // only the lists given
                prices: Object.fromEntries(Object.entries(this.createForm.prices || {}).filter(([, v]) => v != null && v !== ''))
            }
        },
        // Save the dialog as a draft (new or the one open). The photos go as
        // an order list: saved ones by id, new files by their index.
        async saveDraft({ keepOpen = false } = {}) {
            if (!this.createRow || !this.createPart || this.draftSaving) return null
            const fields = this.createFields()
            const data = new FormData()
            Object.keys(fields).forEach(k => data.append(k, k === 'compatibleModels' || k === 'prices' ? JSON.stringify(fields[k]) : (fields[k] == null ? '' : fields[k])))
            let n = 0
            const order = this.createFiles.map(f => (f.file ? { new: n++ } : { id: f.id }))
            data.append('order', JSON.stringify(order))
            this.createFiles.filter(f => f.file).forEach(f => data.append('images', f.file, f.file.name))
            this.draftSaving = true
            try {
                const r = this.createDraftId ? await updateNewProductDraft(this.createDraftId, data) : await saveNewProductDraft(data)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                const d = r.draft
                this.createDraftId = d._id
                // the photos are saved now: keep them as saved ones
                this.clearCreateFiles()
                this.createFiles = (d.images || []).map(im => ({ key: im.id, id: im.id, url: im.url, name: im.name }))
                if (!keepOpen) {
                    this.$message.success(this.$tp('Draft saved — it is not in Zoho until you submit it'))
                    this.createVisible = false
                    this.load()
                }
                return d
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to save the draft')))
                return null
            } finally {
                this.draftSaving = false
            }
        },
        // Open a draft in the dialog.
        async openDraft(brief) {
            let d
            try {
                const r = await getNewProductDraft(brief._id)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                d = r.draft
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Could not open the draft')))
                this.load()
                return
            }
            const row = this.rows.find(x => x._id === d.modelId)
            const part = row && this.partsOf(row.brand).find(p => p.key === d.part)
            if (!row || !part) { this.$message.error(this.$tp('Could not open the draft')); return }
            this.openCreate(row, part)
            this.createDraftId = d._id
            this.appliedQuality = d.quality || ''
            this.createForm = {
                name: d.name || (row.defaultNames || {})[part.key] || '',
                sku: d.sku || '',
                quality: d.quality || '',
                rate: d.rate != null ? d.rate : this.placeholderRate,
                cost: d.cost != null ? d.cost : undefined,
                compatibleModels: (d.compatibleModels && d.compatibleModels.length) ? d.compatibleModels : [row.compatibleModel].filter(Boolean),
                prices: { ...blankPrices(), ...(d.prices || {}) }
            }
            // the saved prices stand; a quality change re-prices them only while they are the formula's
            this.lastAuto = this.formulaPrices && !this.formulaOff ? { ...this.formulaPrices } : null
            this.createFiles = (d.images || []).map(im => ({ key: im.id, id: im.id, url: im.url, name: im.name }))
            // a SKU saved with the draft stands; none → the next free one, as for a new item
            if (d.sku) { this.skuSeq++; this.skuLoading = false } else this.loadNextSku()
        },
        // Submit a draft: save what the dialog has, then create from it.
        async submitDraft() {
            if (!this.checkCreate()) return
            const saved = await this.saveDraft({ keepOpen: true })
            if (!saved) return
            this.creating = true
            try {
                const r = await createNewProductItem({ ...this.createFields(), draftId: saved._id })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.afterCreated(r)
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Zoho did not create the item')))
                // the draft stays (saved just now) — it can be tried again
                this.load()
            } finally {
                this.creating = false
            }
        },
        async deleteDraft(d) {
            try {
                await this.$confirm(this.$tp('Delete the draft "{name}"? It is not in Zoho, so nothing there changes.', { name: d.name || this.$tp('(no name yet)') }),
                    this.$tp('Delete draft'), { type: 'warning', confirmButtonText: this.$tp('Delete'), cancelButtonText: this.$tp('Keep') })
            } catch (e) { return }
            try {
                const r = await deleteNewProductDraft(d._id)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                if (this.createDraftId === d._id) this.createVisible = false
                this.$message.success(this.$tp('Draft deleted'))
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to delete the draft')))
            }
        },
        // ── Models ─────────────────────────────────────────────────
        openModel(row) {
            this.modelForm = row
                ? { _id: row._id, brand: row.brand, series: row.series || '', model: row.model, compatibleModel: row.compatibleModel || '', codes: (row.codes || []).join(', '), aliases: (row.aliases || []).join(', '), note: row.note || '' }
                : { _id: null, brand: this.sel.brand || (this.brands[0] && this.brands[0].value) || 'Motorola', series: this.sel.series || '', model: '', compatibleModel: '', codes: '', aliases: '', note: '' }
            this.modelVisible = true
        },
        async submitModel() {
            if (!this.modelForm.model.trim()) { this.$message.warning(this.$tp('Enter the model')); return }
            this.modelSaving = true
            try {
                const data = { ...this.modelForm }
                delete data._id
                const r = this.modelForm._id ? await updateNewProductModel(this.modelForm._id, data) : await addNewProductModel(data)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.$message.success(this.$tp('Saved'))
                this.modelVisible = false
                // a new model opens; an edited one keeps its place (its series may have moved)
                if (!this.modelForm._id && r.model) {
                    await this.load()
                    const row = this.rows.find(x => x._id === r.model._id)
                    if (row) this.selectModel(row)
                } else {
                    await this.load()
                    if (this.model) this.selectModel(this.model)
                }
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to save the model')))
            } finally {
                this.modelSaving = false
            }
        },
        async hideModel(row) {
            try {
                await this.$confirm(this.$tp('Hide {model} from this list? Nothing is deleted in Zoho.', { model: row.compatibleModel }), this.$tp('Hide this model'),
                    { type: 'warning', confirmButtonText: this.$tp('Hide'), cancelButtonText: this.$tp('Keep') })
            } catch (e) { return }
            try {
                const r = await updateNewProductModel(row._id, { active: false })
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                this.load()
            } catch (e) {
                this.$message.error(this.msg(e, this.$tp('Failed to save the model')))
            }
        }
    }
}
</script>

<style lang="scss" scoped>
.spn-page { display: flex; height: calc(100vh - 84px); overflow: hidden; }
.spn-main { flex: 1; min-width: 0; display: flex; flex-direction: column; padding: 12px 16px 8px; background: #fff; }
/* tree */
.spn-node { display: flex; align-items: center; gap: 6px; width: 100%; min-width: 0; }
.spn-node.is-brand .spn-node-label { font-weight: 600; color: #303133; }
.spn-node-icon { flex-shrink: 0; }
.spn-node-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.spn-node-count { flex-shrink: 0; margin-left: 8px; font-size: 11px; color: #909399; font-variant-numeric: tabular-nums; }
.spn-node-miss { font-style: normal; color: #e6a23c; margin-right: 6px; i { margin-right: 1px; } }
.spn-node-warn { color: #e6a23c; flex-shrink: 0; }
.spn-node-ok { color: #67c23a; flex-shrink: 0; }
.spn-node-draft { color: #409eff; flex-shrink: 0; }
/* drafts */
.spn-draft-tag { display: inline-block; padding: 0 7px; border-radius: 10px; font-size: 11px; font-weight: normal; color: #409eff; background: #ecf5ff; border: 1px dashed #a0cfff; vertical-align: middle; }
.spn-draft { cursor: pointer; background: #f8fbff; border-top: 1px dashed #c6e2ff; &:hover { background: #ecf5ff; } }
.spn-draft .spn-thumb i { color: #a0cfff; }
.spn-dl-n { margin-left: 2px; color: #409eff; }
.spn-dl-del { color: #c0c4cc; &:hover, &:focus { color: #f56c6c; } }
/* head */
.spn-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.spn-head-icon { flex-shrink: 0; }
.spn-head-text { flex: 1; min-width: 0; }
.spn-title { font-size: 18px; font-weight: 600; color: #303133; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.spn-count { margin-left: 10px; font-size: 12px; font-weight: 400; color: #909399; }
.spn-sub { font-size: 12px; color: #909399; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.spn-head .el-button + .el-button { margin-left: 0; }
.spn-body { flex: 1; min-height: 0; overflow: auto; padding-bottom: 8px; }
/* a model */
.spn-note { font-size: 12px; color: #e6a23c; margin-bottom: 8px; }
.spn-alert { margin-bottom: 12px; }
.spn-groups { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 12px; align-items: start; min-height: 120px; }
.spn-group { border: 1px solid #ebeef5; border-radius: 8px; background: #fff; overflow: hidden; }
.spn-group.is-missing { border-color: #f5dab1; background: #fffcf6; }
.spn-group-head { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: #fafafa; border-bottom: 1px solid #ebeef5; }
.spn-group.is-missing .spn-group-head { background: #fdf6ec; border-bottom-color: #f5dab1; }
.spn-group-title { font-size: 13px; font-weight: 600; color: #303133; }
.spn-group-count { font-size: 11px; color: #909399; padding: 0 7px; border-radius: 9px; background: #f0f2f5; font-variant-numeric: tabular-nums; }
.spn-req { font-size: 11px; i { margin-right: 2px; } &.ok { color: #67c23a; } &.miss { color: #e6a23c; font-weight: 600; } }
.spn-spacer { flex: 1; }
.spn-none { padding: 14px 12px; font-size: 12px; color: #b88230; }
.spn-item { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid #f2f3f5; &:last-child { border-bottom: 0; } }
.spn-thumb { width: 40px; height: 40px; flex-shrink: 0; border-radius: 4px; background: #f5f7fa; display: flex; align-items: center; justify-content: center; overflow: hidden;
    img { max-width: 100%; max-height: 100%; object-fit: contain; } i { color: #c0c4cc; font-size: 18px; } }
.spn-item-main { flex: 1; min-width: 0; }
.spn-item-name { font-size: 12px; color: #303133; line-height: 1.35; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.spn-item-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 6px; margin-top: 3px; font-size: 11px; }
.spn-link { color: #409eff; text-decoration: none; font-weight: 600; font-variant-numeric: tabular-nums; &:hover { text-decoration: underline; } }
.spn-type { padding: 0 7px; border-radius: 10px; color: #606266; background: #f4f4f5; border: 1px solid #e9e9eb; white-space: nowrap; }
.spn-fits { color: #909399; cursor: default; }
.spn-stock { flex-shrink: 0; width: 44px; text-align: right; display: flex; flex-direction: column; font-size: 11px;
    em { font-style: normal; color: #909399; } b { font-size: 13px; font-variant-numeric: tabular-nums; } }
.spn-good { color: #67c23a; }
.spn-warn { color: #e6a23c; }
.spn-bad { color: #f56c6c; }
/* a brand / series: tiles */
.spn-pickview { min-height: 200px; }
.spn-summary { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; color: #606266; margin-bottom: 12px; }
.spn-pick-hint { font-size: 12px; color: #909399; margin-bottom: 8px; }
.spn-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 12px; }
.spn-tile { border: 1px solid #ebeef5; border-radius: 8px; padding: 12px 14px; background: #fff; cursor: pointer; display: flex; flex-direction: column; gap: 6px;
    transition: border-color .15s, box-shadow .15s;
    &:hover { border-color: #c6e2ff; box-shadow: 0 2px 10px rgba(0, 0, 0, .07); }
    &.is-missing { border-left: 3px solid #e6a23c; } }
.spn-tile-title { font-size: 14px; font-weight: 600; color: #303133; line-height: 1.3; i { margin-right: 2px; } }
.spn-tile-sub { font-size: 11px; color: #909399; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.spn-bar { height: 4px; border-radius: 2px; background: #fdf6ec; overflow: hidden; span { display: block; height: 100%; background: #67c23a; } }
.spn-tile-foot { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 2px 6px; font-size: 11px; white-space: nowrap; i { margin-right: 2px; } }
.spn-tile-done { color: #909399; white-space: nowrap; }
.spn-tile-parts { display: flex; flex-wrap: wrap; gap: 4px; }
.spn-part { font-size: 11px; padding: 1px 7px; border-radius: 10px; border: 1px solid; white-space: nowrap; i { margin-right: 1px; }
    &.ok { color: #67c23a; border-color: #c2e7b0; background: #f0f9eb; }
    &.miss { color: #e6a23c; border-color: #f5dab1; background: #fdf6ec; } }
.spn-none-here { text-align: center; color: #909399; padding: 40px 0; }
.spn-dot { color: #c0c4cc; }
.spn-ok { color: #67c23a; }
.spn-miss { color: #f56c6c; }
.spn-partcount { padding: 1px 8px; border-radius: 10px; background: #f4f4f5; color: #606266; }
.spn-model { color: #303133; font-weight: 500; line-height: 1.3; i { margin-right: 2px; } }
.spn-dim { font-size: 11px; color: #909399; line-height: 1.4; }
/* dialogs */
.spn-dlg-head { font-size: 15px; font-weight: 600; color: #303133; i { color: #409eff; margin-right: 4px; } }
.spn-row { display: flex; gap: 12px; }
/* the create dialog */
.spn-ct-title { font-size: 15px; font-weight: 600; color: #303133; i { color: #409eff; margin-right: 4px; } }
.spn-ct-sub { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; margin-top: 4px; font-size: 13px; color: #303133; }
.spn-ct-part { padding: 0 8px; border-radius: 10px; font-size: 12px; color: #409eff; background: #ecf5ff; border: 1px solid #d9ecff; }
.spn-cf { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 0 20px; }
.spn-cf-side { border-left: 1px solid #ebeef5; padding-left: 20px; min-width: 0; }
.spn-sec { display: flex; align-items: center; gap: 4px; margin: 2px 0 8px; font-size: 12px; font-weight: 600; color: #909399; text-transform: uppercase; letter-spacing: .4px; }
.spn-sec:not(:first-child) { margin-top: 14px; padding-top: 12px; border-top: 1px dashed #ebeef5; }
.spn-sec-n { margin-left: 4px; padding: 0 7px; border-radius: 9px; background: #f0f2f5; color: #606266; font-weight: 500; text-transform: none; }
.spn-help { color: #c0c4cc; cursor: help; font-size: 12px; font-weight: normal; &:hover { color: #409eff; } }
.spn-cf ::v-deep .el-form-item { margin-bottom: 12px; }
.spn-cf ::v-deep .el-form-item__label { padding-bottom: 2px; line-height: 22px; }
.spn-fits-item { margin-bottom: 0 !important; }
.spn-name ::v-deep .el-textarea__inner { padding-bottom: 18px; line-height: 1.5; font-family: Arial, Helvetica, sans-serif; /* as the inputs */ }
.spn-prices { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.spn-price { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.spn-price-label { font-size: 12px; color: #606266; line-height: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* a $ in front of a price (el-input-number has no prefix slot) */
.spn-money::before { content: "$"; position: absolute; left: 9px; top: 50%; transform: translateY(-50%); z-index: 1; font-size: 12px; color: #909399; pointer-events: none; }
.spn-money ::v-deep .el-input__inner { padding-left: 20px; text-align: left; }
.spn-price-warn { margin-top: 4px; font-size: 12px; color: #e6a23c; line-height: 1.6; i { margin-right: 2px; } }
/* the cost (the four lists are priced from it) */
.spn-req { color: #f56c6c; font-weight: normal; }
/* cost + selling price on the same columns as the four lists below */
.spn-cost { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; align-items: end; margin-bottom: 10px; }
.spn-formula { grid-column: span 2; justify-self: start; padding: 0 0 8px; }
.spn-ref { font-size: 11px; line-height: 16px; color: #409eff; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; &:hover { text-decoration: underline; } }
/* the store category */
.spn-cat { display: flex; gap: 6px; }
.spn-cat-pick { flex: 1; min-width: 0; }
.spn-cat-hint { margin-top: 4px; font-size: 12px; line-height: 1.5; color: #909399; i { color: #67c23a; } .el-button { padding: 0; } }
/* the model's linked store category (2026-10-16): on the model, its tile, the create dialog */
.spn-cat-path { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #303133; }
.spn-catline { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; font-size: 12px; color: #606266;
    i { color: #409eff; } .el-button { padding: 0; }
    &.is-unlinked { color: #e6a23c; i { color: #e6a23c; } } }
.spn-catline-label { white-space: nowrap; }
.spn-catline-none { color: #e6a23c; }
.spn-tile-cat { font-size: 11px; color: #909399; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    i { color: #409eff; } &.is-unlinked { color: #e6a23c; i { color: #e6a23c; } } }
.spn-cat-linked { display: flex; align-items: center; gap: 6px; padding: 0 10px; min-height: 32px; border: 1px solid #dcdfe6; border-radius: 4px; background: #f5f7fa; font-size: 13px;
    i { color: #409eff; } .spn-cat-path { flex: 1; } }
.spn-cat-unlinked { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px; padding: 6px 10px; border: 1px dashed #f5c36b; border-radius: 4px; background: #fdf6ec; font-size: 12px; color: #b26b00; }
.spn-link-text { margin-bottom: 10px; font-size: 13px; color: #606266; }
.spn-link-mode { margin-bottom: 12px; }
.spn-link-new ::v-deep .el-form-item { margin-bottom: 10px; }
.spn-cfoot { display: flex; align-items: center; gap: 8px; }
.spn-cfoot-sum { flex: 1; min-width: 0; text-align: left; font-size: 12px; color: #909399; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.spn-cfoot .el-button + .el-button { margin-left: 0; }

.spn-col { flex: 1; }
@media (max-width: 899px) {
    .spn-cf { grid-template-columns: 1fr; }
    .spn-cf-side { border-left: 0; padding-left: 0; margin-top: 14px; padding-top: 12px; border-top: 1px dashed #ebeef5; }
    .spn-prices { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .spn-cost { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 767px) {
    .spn-main { padding: 8px 10px 4px; }
    .spn-head { flex-wrap: wrap; }
    .spn-groups { grid-template-columns: 1fr; }
}
</style>

<style lang="scss">
/* the drafts list (a popover, appended to <body>) */
.spn-drafts-pop { padding: 10px 0 6px !important;
    .spn-dl-title { padding: 0 14px 8px; font-size: 13px; font-weight: 600; color: #303133; border-bottom: 1px solid #ebeef5; }
    .spn-dim { font-size: 11px; font-weight: normal; color: #909399; }
    .spn-dl { max-height: 360px; overflow: auto; }
    .spn-dl-row { display: flex; align-items: center; gap: 10px; padding: 8px 14px; cursor: pointer; border-bottom: 1px solid #f2f3f5; &:hover { background: #f5f7fa; } &:last-child { border-bottom: 0; } }
    .spn-dl-thumb { width: 36px; height: 36px; flex-shrink: 0; border-radius: 4px; background: #f5f7fa; display: flex; align-items: center; justify-content: center; overflow: hidden;
        img { max-width: 100%; max-height: 100%; object-fit: contain; } i { color: #c0c4cc; } }
    .spn-dl-main { flex: 1; min-width: 0; }
    .spn-dl-name { font-size: 12px; color: #303133; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .spn-dl-del { color: #c0c4cc; &:hover { color: #f56c6c; } } }
/* the create dialog is appended to <body>: its body scrolls, the footer stays */
.spn-create-dlg { display: flex; flex-direction: column; max-height: 90vh; margin-bottom: 0 !important;
    .el-dialog__header { padding: 16px 20px 10px; border-bottom: 1px solid #ebeef5; }
    .el-dialog__body { flex: 1; min-height: 0; overflow: auto; padding: 14px 20px 6px; word-break: normal; }
    .el-dialog__footer { padding: 10px 20px; border-top: 1px solid #ebeef5; } }
</style>
