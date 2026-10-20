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
                    <!-- any product beyond the needed parts (a lens, a SIM tray, a tool …) -->
                    <el-button type="primary" plain size="small" icon="el-icon-plus" :title="$tp('Create any other product for this model in Zoho')" @click="openCreateOther(model)">{{ $tp('Add product') }}</el-button>
                    <el-button size="small" icon="el-icon-edit" @click="openModel(model)">{{ $tp('Edit model') }}</el-button>
                    <el-button size="small" icon="el-icon-close" :title="$tp('Hide this model')" @click="hideModel(model)">{{ $tp('Hide') }}</el-button>
                </template>
                <el-button v-if="canCreate" type="primary" size="small" icon="el-icon-plus" @click="openModel()">{{ $tp('Add model') }}</el-button>
                <el-button size="small" icon="el-icon-refresh" :loading="loading || itemsLoading" :title="$tp('Refresh')" @click="refresh" />
            </div>

            <div ref="body" class="spn-body">
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
                    <!-- masonry (user 2026-10-20): each part's card into the shortest column -->
                    <div v-loading="itemsLoading" class="spn-groups">
                      <div v-for="(col, ci) in groupColumns" :key="ci" class="spn-mcol">
                        <section v-for="g in col" :key="g.key" :class="['spn-group', { 'is-required': g.required, 'is-missing': g.required && !g.items.length }]">
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
                                <!-- another of this classification (picked in the dialog, can be changed) -->
                                <el-button v-else-if="canCreate && classificationValues.includes(g.classification)" plain size="mini" icon="el-icon-plus"
                                    @click="openCreateOther(model, g.classification)">{{ $tp('Create') }}</el-button>
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
                                <!-- the item as Zoho has it, to change (user ask 2026-10-20) -->
                                <el-button v-if="canCreate" type="text" size="mini" icon="el-icon-edit" class="spn-fits-btn"
                                    :title="$tp('See and change this item in Zoho')" @click="openEdit(it)">{{ $tp('Edit') }}</el-button>                            </div>
                        </section>
                      </div>
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
            :close-on-click-modal="false" custom-class="spn-create-dlg" @opened="onCreateOpened" @closed="clearCreateFiles">
            <!-- what is being made: the model, the part and its Zoho fields -->
            <div slot="title" class="spn-ct">
                <div class="spn-ct-title"><i class="el-icon-plus" /> {{ $tp('Create in Zoho Inventory') }}
                    <span v-if="createDraftId" class="spn-draft-tag">{{ $tp('Draft') }}</span></div>
                <div v-if="createRow" class="spn-ct-sub">
                    <b>{{ createRow.compatibleModel }}</b>
                    <span v-if="createPart" class="spn-ct-part">{{ $tp(createPart.label) }}</span>
                    <span v-if="createDefaults" class="spn-dim">
                        <template v-if="createClass.classification">{{ $tp('Classification') }}: {{ createClass.classification }}<template v-if="createClass.subClassification"> / {{ createClass.subClassification }}</template> · </template>
                        {{ $tp('Device Brand') }}: {{ createDefaults.deviceBrand }}
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
                        <el-input ref="nameInput" v-model="createForm.name" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" resize="none"
                            maxlength="200" show-word-limit class="spn-name" @keydown.native.enter.prevent />
                    </el-form-item>
                    <!-- the models in the name follow the Compatible Models (2026-10-20) -->
                    <div v-if="nameFollow.create.note === 'updated'" class="spn-follow"><i class="el-icon-refresh" />
                        {{ $tp('The models in the name follow the Compatible Models below.') }}
                        <el-button type="text" size="mini" @click="undoFollow('create')">{{ $tp('Undo') }}</el-button></div>
                    <div v-else-if="nameFollow.create.note === 'manual'" class="spn-price-warn"><i class="el-icon-warning-outline" />
                        {{ $tp('This name has no "… Compatible …" — change the models in it by hand.') }}</div>
                    <div v-if="createForm.name.length > 200" class="spn-price-warn"><i class="el-icon-warning-outline" />
                        {{ $tp('{n} characters — Zoho takes 200 at most', { n: createForm.name.length }) }}</div>
                    <!-- any other product: its Zoho classification (sets the qualities and the price formula) -->
                    <div v-if="isOther" class="spn-row">
                        <el-form-item class="spn-col">
                            <span slot="label">{{ $tp('Classification') }} <span class="spn-req">*</span></span>
                            <el-select v-model="createForm.classification" filterable :placeholder="$tp('Pick the classification')" style="width:100%" @change="onClassification">
                                <el-option v-for="c in classifications" :key="c.value" :label="classLabel(c.value)" :value="c.value" />
                            </el-select>
                        </el-form-item>
                        <el-form-item class="spn-col">
                            <span slot="label">{{ $tp('Sub Classification') }}
                                <el-tooltip :content="$tp('The ones Zoho items of this classification use; a new one can be typed.')" placement="top">
                                    <i class="el-icon-info spn-help" /></el-tooltip></span>
                            <el-select v-model="createForm.subClassification" filterable allow-create clearable default-first-option
                                :disabled="!createForm.classification" :placeholder="$tp('None')" style="width:100%">
                                <el-option v-for="s in subOptions" :key="s" :label="s" :value="s" />
                            </el-select>
                        </el-form-item>
                    </div>
                    <div class="spn-row">
                        <el-form-item class="spn-col">
                            <span slot="label">{{ $tp('SKU') }}
                                <el-tooltip :content="$tp('The next free number in the parts range; checked in Zoho before creating.')" placement="top">
                                    <i class="el-icon-info spn-help" /></el-tooltip></span>
                            <!-- the only field that asks Zoho: it fills in on its own -->
                            <el-input v-model="createForm.sku" :placeholder="skuLoading ? $tp('Finding the next free SKU…') : ''"
                                :suffix-icon="skuLoading ? 'el-icon-loading' : ''" />
                        </el-form-item>
                        <el-form-item class="spn-col">
                            <span slot="label">{{ $tp('Quality') }}
                                <el-tooltip :content="qualityListed ? $tp('The qualities this classification comes in (iMobile Listing → Qualities).') : $tp('Every quality in use — this classification has no list on iMobile Listing → Qualities yet.')" placement="top">
                                    <i class="el-icon-info spn-help" /></el-tooltip></span>
                            <!-- the part's classification's qualities (iMobile Listing → Qualities);
                                 with no list there: the register's, most used first, and a new one can be typed -->
                            <el-select v-model="createForm.quality" clearable filterable :allow-create="!qualityListed" default-first-option
                                :placeholder="$tp('None')" style="width:100%" @change="onQuality">
                                <el-option v-for="q in qualityOptions" :key="q" :label="q" :value="q" />
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
                            :placeholder="$tp('Pick every model this part fits')" @change="followModels('create')">
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

        <!-- ── An existing item, as Zoho has it (user ask 2026-10-20: "a dialog
             like Create in Zoho Inventory that shows the product detail and can
             update the item") — only what is changed goes to Zoho ────────── -->
        <el-dialog :visible.sync="editVisible" :width="createNarrow ? '96%' : '860px'" top="5vh" append-to-body
            :close-on-click-modal="false" custom-class="spn-create-dlg" @closed="clearEditFiles">
            <div slot="title" class="spn-ct">
                <div class="spn-ct-title"><i class="el-icon-edit" /> {{ $tp('Edit in Zoho Inventory') }}
                    <el-tag v-if="editItem && editItem.status && editItem.status !== 'active'" size="mini" type="info">{{ editItem.status }}</el-tag></div>
                <div v-if="editItem" class="spn-ct-sub">
                    <b>{{ $tp('SKU {sku}', { sku: editItem.sku || '—' }) }}</b>
                    <span class="spn-dim">{{ $tp('Device Brand') }}: {{ editItem.deviceBrand || '—' }}
                        <template v-if="editItem.deviceSeries"> · {{ $tp('Device Series') }}: {{ editItem.deviceSeries }}</template></span>
                    <a class="spn-link" :href="zohoLink(editItem.itemId)" target="_blank" rel="noopener">{{ $tp('Open in Zoho') }}</a>
                </div>
            </div>

            <div v-loading="editLoading" class="spn-edit-body">
                <div v-if="editError" class="spn-none">{{ editError }}</div>
                <el-form v-if="editItem" label-position="top" size="small" class="spn-cf" @submit.native.prevent @paste.native="onEditPaste">
                    <div class="spn-cf-main">
                        <div class="spn-sec">{{ $tp('Item') }}</div>
                        <el-form-item :label="$tp('Item name')">
                            <el-input v-model="editForm.name" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" resize="none"
                                maxlength="200" show-word-limit class="spn-name" @keydown.native.enter.prevent />
                        </el-form-item>
                        <!-- the models in the name follow the Compatible Models (2026-10-20) -->
                        <div v-if="nameFollow.edit.note === 'updated'" class="spn-follow"><i class="el-icon-refresh" />
                            {{ $tp('The models in the name follow the Compatible Models below.') }}
                            <el-button type="text" size="mini" @click="undoFollow('edit')">{{ $tp('Undo') }}</el-button></div>
                        <div v-else-if="nameFollow.edit.note === 'manual'" class="spn-price-warn"><i class="el-icon-warning-outline" />
                            {{ $tp('This name has no "… Compatible …" — change the models in it by hand.') }}</div>
                        <div v-if="editForm.name.length > 200" class="spn-price-warn"><i class="el-icon-warning-outline" />
                            {{ $tp('{n} characters — Zoho takes 200 at most', { n: editForm.name.length }) }}</div>
                        <div class="spn-row">
                            <el-form-item class="spn-col" :label="$tp('Classification')">
                                <el-select v-model="editForm.classification" filterable style="width:100%" @change="onEditClassification">
                                    <el-option v-for="c in classifications" :key="c.value" :label="classLabel(c.value)" :value="c.value" />
                                </el-select>
                            </el-form-item>
                            <el-form-item class="spn-col">
                                <span slot="label">{{ $tp('Sub Classification') }}
                                    <el-tooltip :content="$tp('The ones Zoho items of this classification use; a new one can be typed.')" placement="top">
                                        <i class="el-icon-info spn-help" /></el-tooltip></span>
                                <el-select v-model="editForm.subClassification" filterable allow-create clearable default-first-option
                                    :placeholder="$tp('None')" style="width:100%">
                                    <el-option v-for="x in editSubOptions" :key="x" :label="x" :value="x" />
                                </el-select>
                            </el-form-item>
                        </div>
                        <div class="spn-row">
                            <el-form-item class="spn-col">
                                <span slot="label">{{ $tp('SKU') }}
                                    <el-tooltip :content="$tp('Not changed here — it is on the labels and barcodes.')" placement="top">
                                        <i class="el-icon-info spn-help" /></el-tooltip></span>
                                <el-input :value="editItem.sku" disabled />
                            </el-form-item>
                            <el-form-item class="spn-col" :label="$tp('Quality')">
                                <el-select v-model="editForm.quality" clearable filterable :allow-create="!editQualityListed" default-first-option
                                    :placeholder="$tp('None')" style="width:100%" @change="onEditQuality">
                                    <el-option v-for="q in editQualityOptions" :key="q" :label="q" :value="q" />
                                </el-select>
                            </el-form-item>
                        </div>
                        <el-form-item>
                            <span slot="label">{{ $tp('Category') }}
                                <el-tooltip :content="$tp('The store category the item is filed under.')" placement="top">
                                    <i class="el-icon-info spn-help" /></el-tooltip></span>
                            <div class="spn-cat">
                                <!-- a hidden category can't be picked: its name shows until another is chosen -->
                                <el-cascader v-model="editForm.categoryId" :options="categoryTree" :props="CATEGORY_PROPS" :filter-method="categoryFilter"
                                    filterable :placeholder="editItem.categoryName || $tp('Pick the category')" class="spn-cat-pick" />
                                <el-tooltip :content="$tp('Read the categories again from Zoho (after adding one on the Categories page)')" placement="top">
                                    <el-button size="small" icon="el-icon-refresh" :loading="categoriesLoading" @click="loadCategories(true)" />
                                </el-tooltip>
                            </div>
                            <div v-if="model && model.categoryId && editForm.categoryId !== model.categoryId" class="spn-cat-hint">
                                {{ $tp('This model\'s category') }}: <el-button type="text" size="mini" @click="editForm.categoryId = model.categoryId">{{ categoryPathOf(model) }}</el-button></div>
                        </el-form-item>

                        <!-- the cost and prices: with the Price Monitoring right only, read live -->
                        <template v-if="editCanPrice">
                            <div class="spn-sec">{{ $tp('Prices') }}
                                <el-tooltip :content="$tp('Read live from Zoho. Only the prices you change are saved, as on Price Monitoring.')" placement="top">
                                    <i class="el-icon-info spn-help" /></el-tooltip></div>
                            <div v-if="editPricesError" class="spn-price-warn"><i class="el-icon-warning-outline" /> {{ editPricesError }}</div>
                            <div v-loading="editPricesLoading">
                                <div class="spn-cost">
                                    <div class="spn-price">
                                        <span class="spn-price-label">{{ $tp('Cost price') }}
                                            <el-tooltip :content="$tp('Zoho\'s purchase price — what the formula prices are worked out from.')" placement="top">
                                                <i class="el-icon-info spn-help" /></el-tooltip></span>
                                        <el-input-number v-model="editForm.cost" size="small" :min="0" :precision="2" :controls="false" class="spn-money"
                                            :disabled="!editPricesReady" style="width:100%" />
                                    </div>
                                    <div class="spn-price">
                                        <span class="spn-price-label">{{ $tp('Selling price') }}
                                            <el-tooltip :content="$tp('9999.99 is the usual placeholder until the price is set.')" placement="top">
                                                <i class="el-icon-info spn-help" /></el-tooltip></span>
                                        <el-input-number v-model="editForm.rate" size="small" :min="0" :precision="2" :controls="false" class="spn-money" style="width:100%" />
                                    </div>
                                    <el-button v-if="editFormulaOff && editPricesReady" type="text" size="mini" icon="el-icon-refresh" class="spn-formula"
                                        @click="editForm.prices = { ...editFormula }">{{ $tp('Use the formula prices') }}</el-button>
                                </div>
                                <div class="spn-prices">
                                    <div v-for="p in PRICE_LISTS" :key="p.list" class="spn-price">
                                        <span class="spn-price-label">{{ p.label }}</span>
                                        <el-input-number v-model="editForm.prices[p.list]" size="small" :min="0" :precision="2" :controls="false" class="spn-money"
                                            :disabled="!editPricesReady" :placeholder="$tp('Not set')" style="width:100%" />
                                        <span v-if="editFormula && editOffFormula(p.list)" class="spn-ref" :title="$tp('Use the formula price')"
                                            @click="editForm.prices[p.list] = editFormula[p.list]">{{ $tp('Formula') }} ${{ editFormula[p.list].toFixed(2) }}</span>
                                    </div>
                                </div>
                                <div v-for="w in editPriceWarnings" :key="w" class="spn-price-warn"><i class="el-icon-warning-outline" /> {{ w }}</div>
                            </div>
                        </template>

                        <div class="spn-sec">{{ $tp('Compatible Models') }}
                            <el-tooltip :content="$tp('Goes into the Compatible Model field in Zoho. One item can fit several models — it then counts for each of them.')" placement="top">
                                <i class="el-icon-info spn-help" /></el-tooltip></div>
                        <!-- the brand's models on the page, or typed ("A; B" adds both) -->
                        <el-form-item class="spn-fits-item">
                            <el-select v-model="editForm.compatibleModels" multiple filterable allow-create default-first-option style="width:100%"
                                :placeholder="$tp('Pick every model this part fits')" @change="onEditModels">
                                <el-option v-for="m in editModelOptions" :key="m" :label="m" :value="m" />
                            </el-select>
                        </el-form-item>
                        <div v-if="editDropsOpen" class="spn-price-warn"><i class="el-icon-warning-outline" />
                            {{ $tp('{model} is not on the list — this part will no longer show for it', { model: model.compatibleModel || model.model }) }}</div>
                        <div v-if="editModelsChanged" class="spn-cat-hint">{{ $tp('The Device Series follows the models when saved.') }}</div>
                    </div>

                    <!-- its photos (main first, not changed here) and new ones to add -->
                    <div class="spn-cf-side">
                        <div class="spn-sec">{{ $tp('Photos') }}<span v-if="editItem.photos.length" class="spn-sec-n">{{ editItem.photos.length }}</span></div>
                        <div v-if="editItem.photos.length" class="spn-photos">
                            <a v-for="p in editItem.photos" :key="p.id" :href="p.url" target="_blank" rel="noopener" class="spn-photo" :title="p.name">
                                <img :src="p.url" alt="" loading="lazy">
                                <span v-if="p.main" class="spn-photo-main">{{ $tp('Main') }}</span>
                            </a>
                        </div>
                        <div v-else class="spn-dim">{{ $tp('No photos yet') }}</div>
                        <div class="spn-sec">{{ $tp('Add photos') }}<span v-if="editFiles.length" class="spn-sec-n">{{ editFiles.length }}</span></div>
                        <image-picker ref="editPhotoPicker" v-model="editFiles" :max="MAX_PHOTOS" :disabled="editSaving" compact />
                        <el-checkbox v-if="editFiles.length && editItem.photos.length" v-model="editMainFirst" class="spn-main-first">
                            {{ $tp('Make the first new photo the main image') }}</el-checkbox>
                    </div>
                </el-form>
            </div>

            <div slot="footer" class="spn-cfoot">
                <span class="spn-cfoot-sum">{{ editSummary }}</span>
                <el-button size="small" :disabled="editSaving" @click="editVisible = false">{{ $tp('Cancel') }}</el-button>
                <el-button type="primary" size="small" icon="el-icon-check" :loading="editSaving" :disabled="editLoading || !editChangeCount"
                    @click="saveEdit">{{ $tp('Save to Zoho') }}</el-button>
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
        <!-- user 2026-10-19: any brand, the series picked from the brand's
             list, the store category linked here; no Compatible Model / Other
             names (the brand's rule fills the Compatible Model) -->
        <el-dialog :visible.sync="modelVisible" :width="createNarrow ? '96%' : '600px'" append-to-body :close-on-click-modal="false">
            <div slot="title" class="spn-dlg-head"><i class="el-icon-mobile-phone" /> {{ modelForm._id ? $tp('Edit model') : $tp('Add model') }}</div>
            <el-form label-position="top" size="small" @submit.native.prevent>
                <div class="spn-row">
                    <el-form-item class="spn-col">
                        <span slot="label">{{ $tp('Brand') }} <span class="spn-req">*</span></span>
                        <el-select v-model="modelForm.brand" :disabled="!!modelForm._id" filterable :placeholder="$tp('Pick the brand')" style="width:100%" @change="onModelBrand">
                            <el-option v-for="b in brands" :key="b.value" :label="b.label" :value="b.value" />
                        </el-select>
                    </el-form-item>
                    <el-form-item class="spn-col">
                        <span slot="label">{{ $tp('Series') }} <span class="spn-req">*</span></span>
                        <!-- the brand's series (this page's, then Zoho's Device Series); a new one can be typed -->
                        <el-select v-model="modelForm.series" filterable allow-create default-first-option :disabled="!modelForm.brand"
                            :placeholder="modelForm.brand ? $tp('Pick or type a series') : $tp('Pick the brand first')" style="width:100%" @change="onModelSeries">
                            <el-option v-for="s in modelBrandSeries" :key="s" :label="s" :value="s" />
                        </el-select>
                    </el-form-item>
                </div>
                <div class="spn-row">
                    <el-form-item class="spn-col">
                        <span slot="label">{{ $tp('Model') }} <span class="spn-req">*</span>
                            <el-tooltip :content="$tp('The models Zoho already has parts for in this series (not on this page yet) — or type a new one.')" placement="top">
                                <i class="el-icon-info spn-help" /></el-tooltip></span>
                        <!-- user 2026-10-19: picked from what Zoho has in the series, or typed new -->
                        <el-select v-model="modelForm.pick" filterable allow-create default-first-option clearable :loading="zohoModelsLoading"
                            :placeholder="modelForm.series ? (modelBrand.modelHint || $tp('Pick or type the model')) : $tp('Pick the series first')"
                            :no-data-text="$tp('Type the model name')" popper-class="spn-model-pop" style="width:100%" @change="onModelPick">
                            <el-option v-for="o in zohoModels" :key="o.compatibleModel" :label="o.model + (o.codes.length ? ' (' + o.codes.join(' / ') + ')' : '')" :value="o.compatibleModel">
                                <span>{{ o.model }}</span><span v-if="o.codes.length" class="spn-dim"> ({{ o.codes.join(' / ') }})</span>
                                <span class="spn-opt-meta">{{ $tp('{n} part(s) in Zoho', { n: o.items }) }}</span>
                            </el-option>
                        </el-select>
                    </el-form-item>
                    <el-form-item :label="$tp('Model codes')" class="spn-col">
                        <el-input v-model="modelForm.codes" :placeholder="modelBrand.codesHint ? $tp('{hint}, comma separated', { hint: modelBrand.codesHint }) : $tp('comma separated')" @input="modelForm.cm = ''" />
                    </el-form-item>
                </div>

                <!-- the store category every item of the model is filed under -->
                <el-form-item>
                    <span slot="label">{{ $tp('Store category') }} <span v-if="!modelForm._id" class="spn-req">*</span>
                        <el-tooltip :content="$tp('Every item created for this model is filed under this category.')" placement="top">
                            <i class="el-icon-info spn-help" /></el-tooltip></span>
                    <el-radio-group v-if="canManageCategories" v-model="modelForm.catMode" size="mini" class="spn-link-mode" @change="onModelCatMode">
                        <el-radio-button label="pick">{{ $tp('Pick an existing one') }}</el-radio-button>
                        <el-radio-button label="new">{{ $tp('Create a new one') }}</el-radio-button>
                    </el-radio-group>
                    <div v-loading="categoriesLoading && !categories.length">
                        <template v-if="modelForm.catMode === 'pick'">
                            <div class="spn-cat">
                                <el-cascader v-model="modelForm.categoryId" :options="categoryTree" :props="CATEGORY_PROPS" :filter-method="categoryFilter"
                                    filterable clearable :placeholder="$tp('Pick the category')" class="spn-cat-pick" />
                                <el-tooltip :content="$tp('Read the categories again from Zoho (after adding one on the Categories page)')" placement="top">
                                    <el-button size="small" icon="el-icon-refresh" :loading="categoriesLoading" @click="loadCategories(true)" />
                                </el-tooltip>
                            </div>
                            <!-- one with the model's name, if there is: a click picks it -->
                            <div v-if="!modelForm.partsCategory && modelCatSuggestion && modelCatSuggestion !== modelForm.categoryId" class="spn-cat-hint">
                                {{ $tp('Same name as the model') }}: <el-button type="text" size="mini" @click="modelForm.categoryId = modelCatSuggestion">{{ categoryPath(modelCatSuggestion) }}</el-button></div>
                            <div v-else-if="!modelForm.partsCategory && !modelForm.categoryId && !modelForm._id && canManageCategories && modelForm.model.trim()" class="spn-cat-hint">
                                {{ $tp('No category with the model\'s name yet') }} — <el-button type="text" size="mini" @click="modelForm.catMode = 'new'; onModelCatMode('new')">{{ $tp('Create a new one') }}</el-button></div>
                        </template>
                        <div v-else class="spn-row">
                            <el-input v-model="modelForm.catName" maxlength="200" class="spn-col" :placeholder="$tp('Name')" @input="modelForm.catNameTouched = true" />
                            <el-cascader v-model="modelForm.catParentId" :options="categoryTree" :props="CATEGORY_PROPS" :filter-method="categoryFilter"
                                filterable clearable :placeholder="$tp('Under')" class="spn-col" @change="modelForm.catParentTouched = true" />
                        </div>
                        <div v-if="modelForm.catMode === 'new'" class="spn-cat-hint">{{ $tp('Visible on the store; not added to the site menu.') }}</div>
                        <!-- the model picked from Zoho's list: where its parts already are (linking never moves them) -->
                        <template v-if="modelForm.partsCategory">
                            <div v-if="!partsElsewhere()" class="spn-cat-hint"><i class="el-icon-success" />
                                {{ $tp('{n} of its {total} parts in Zoho are in this category already.', { n: modelForm.partsCategory.parts, total: modelForm.partsCategory.total }) }}</div>
                            <div v-else class="spn-cat-warn"><i class="el-icon-warning" />
                                {{ $tp('{n} of its parts in Zoho are in {path} and stay there — only items created from this page go to the category above.', { n: modelForm.partsCategory.parts, path: partsCategoryPath() }) }}
                                <el-button type="text" size="mini" @click="modelForm.catMode = 'pick'; modelForm.categoryId = modelForm.partsCategory.id">{{ $tp('Use that one') }}</el-button></div>
                        </template>
                    </div>
                </el-form-item>

                <el-form-item :label="$tp('Note')">
                    <el-input v-model="modelForm.note" maxlength="200" />
                </el-form-item>
            </el-form>
            <span slot="footer">
                <el-button size="small" :disabled="modelSaving" @click="modelVisible = false">{{ $tp('Cancel') }}</el-button>
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
import { listNewProducts, addNewProductModel, updateNewProductModel, newProductModelItems, newProductModelOptions, nextNewProductSku, newProductCategories, createNewProductItem, getNewProductItem, updateNewProductItem, addNewProductItemPhotos, saveNewProductDraft, updateNewProductDraft, getNewProductDraft, deleteNewProductDraft } from '@/api/sparePartsPurchase'
import { createCategory } from '@/api/website'
import { getStockItemPrices, pushStockItemPrices } from '@/api/stockMonitor'
import { zohoLink, formulaPricesFor, priceFamilyOf, CATEGORY_PROPS, categoryIndex, pickableCategories as pickableOf, categoryTreeOf, categoryPathIn, categoryFilter } from './shared'

// the order the classifications are shown in after the needed parts
const CLASS_ORDER = ['Screen', 'Housing', 'Middle Frame', 'BackCover', 'Battery', 'Small Parts', 'IC', 'Tools', 'Accessory', 'Other']
const CLASS_LABELS = { BackCover: 'Back Cover', '': 'Unclassified' }
// any product beyond the brand's needed parts: its classification is picked
// in the dialog (part "other" on the server)
const OTHER = 'other'
// a model's part cards (masonry): the narrowest a card gets, and the gap
const GROUP_MIN = 360
const GROUP_GAP = 12
const otherPart = () => ({ key: OTHER, label: 'Other product', classification: '', subClassification: '', priceFamily: null })
// the Add / Edit Model dialog: the model, and its store category — an
// existing one (pick) or one made here (new: name + parent; the *Touched
// flags stop the suggestions overwriting what was typed / picked)
// `pick` is the Model list's value (a Zoho Compatible Model, or the typed
// name); `cm` the Compatible Model picked from Zoho, sent on save
// `partsCategory`: where the picked model's parts already sit in Zoho
// ({ id, name, parts, total }) — linked by default, a warning if another is chosen
const blankModelForm = () => ({ _id: null, brand: '', series: '', model: '', pick: '', cm: '', codes: '', note: '', catMode: 'pick', categoryId: '', catName: '', catParentId: '', catNameTouched: false, catParentTouched: false, linkedId: '', partsCategory: null })
// names compared without case, spaces or punctuation
const looseName = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
// a model name reduced to what identifies the phone — the server's modelKey
const fitKey = s => String(s || '').toLowerCase()
    .replace(/\b(xt|pb|pa)[-\w]*\d[\w-]*/g, ' ')
    .replace(/\b(motorola|moto|samsung|galaxy|google|apple|oppo|xiaomi|huawei|sony|nokia|5g|4g|us)\b/g, ' ')
    .replace(/[^a-z0-9()]+/g, '')
// the four price lists, as Price Monitoring names them
const PRICE_LISTS = [
    { list: 'platinum', label: 'Platinum' },
    { list: 'vip', label: 'VIP' },
    { list: 'svip', label: 'SVIP' },
    { list: 'wholesale', label: 'Wholesale' }
]
const blankPrices = () => ({ platinum: undefined, vip: undefined, svip: undefined, wholesale: undefined })
// The models in an item name (2026-10-20, "editing compatible models
// reflects in the product name"): the team's names read "<models> Compatible
// <part>", so what comes before "Compatible" is swapped for the new list; a
// name without it follows only while it still starts with the models last put
// there. null = left as it is (changed by hand).
const swapModelsInName = (name, lastPart, part) => {
    const n = String(name || '')
    if (!part) return null
    const m = n.match(/\s+compatible\b/i)
    if (m && m.index > 0) return part + n.slice(m.index)
    if (lastPart && n.toLowerCase().startsWith(lastPart.toLowerCase())) return part + n.slice(lastPart.length)
    return null
}
// per dialog: the model part last put in the name, the name before (Undo), the note shown
const blankFollow = () => ({ part: '', undo: null, note: '' })
const blankEditForm = () => ({ name: '', quality: '', classification: '', subClassification: '', categoryId: '', compatibleModels: [], rate: undefined, cost: undefined, prices: blankPrices() })
// two prices the same (blank = blank)
const samePrice = (a, b) => (a == null || a === '') ? (b == null || b === '') : (b != null && b !== '' && Math.abs(Number(a) - Number(b)) < 0.005)
// photos on a new item — as on Missing Images (types / 7 MB: ImagePicker)
const MAX_PHOTOS = 10
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
            // the page body's width — how many masonry columns the part cards get
            bodyWidth: 0,
            brands: [],
            qualities: [],
            // { classification: [qualities] } from iMobile Listing → Qualities
            qualitiesByClass: {},
            // any other product: Zoho's classifications [{ value, subs: [{ value }] }]
            // and the price formula each takes
            classifications: [],
            priceFamilies: {},
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
            createForm: { name: '', sku: '', quality: '', rate: undefined, cost: undefined, compatibleModels: [], prices: blankPrices(), classification: '', subClassification: '' },
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
            modelForm: blankModelForm(),
            // the Model list: what Zoho has in the picked brand + series
            zohoModels: [],
            zohoModelsLoading: false,
            zohoModelsSeq: 0,
            modelSaving: false,
            // the Edit dialog: the item as Zoho has it (editItem), the form,
            // and what was loaded into it (to send only what changed)
            editVisible: false,
            editLoading: false,
            editError: '',
            editItem: null,
            editForm: blankEditForm(),
            editOrig: blankEditForm(),
            editAppliedQuality: '',
            editServerCanPrice: false,
            editPricesLoading: false,
            editPricesReady: false,
            editPricesError: '',
            editFiles: [],
            editMainFirst: false,
            editSaving: false,
            editSeq: 0,
            // the name following the Compatible Models, per dialog
            nameFollow: { create: blankFollow(), edit: blankFollow() }
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
        // empty or not), then the other classifications; the model's drafts
        // go with the group they will land in
        groups() {
            if (!this.model) return []
            const parts = this.partsOf(this.model.brand)
            const needed = parts.map(p => ({ key: 'p:' + p.key, label: p.label, required: true, part: p, classification: p.classification, items: [], drafts: [] }))
            const byKey = {}
            needed.forEach(g => { byKey[g.key] = g })
            const others = []
            const groupOf = (key, c) => {
                if (!byKey[key]) {
                    byKey[key] = { key, label: CLASS_LABELS[c] || c, required: false, classification: c, items: [], drafts: [], order: CLASS_ORDER.indexOf(c) < 0 ? 99 : CLASS_ORDER.indexOf(c) }
                    others.push(byKey[key])
                }
                return byKey[key]
            }
            for (const it of this.items) {
                groupOf(it.part ? 'p:' + it.part : 'c:' + (it.classification || ''), it.classification || '').items.push(it)
            }
            for (const d of this.draftsByModel[this.model._id] || []) {
                // an other-product draft of a needed part's classification counts as that part (as the server does)
                const p = d.part === OTHER ? parts.find(x => x.classification === d.classification && (!x.subClassification || x.subClassification === d.subClassification)) : parts.find(x => x.key === d.part)
                if (!p && d.part !== OTHER) continue
                groupOf(p ? 'p:' + p.key : 'c:' + (d.classification || ''), d.classification || '').drafts.push(d)
            }
            others.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
            const byName = (a, b) => (a.subClassification || '').localeCompare(b.subClassification || '') || a.name.localeCompare(b.name)
            const all = needed.concat(others)
            all.forEach(g => g.items.sort(byName))
            return all
        },
        // The part cards in masonry columns (user 2026-10-20): as many columns
        // as fit (cards at least GROUP_MIN wide), each card into the shortest
        // column so far — the leftmost on a tie, so the needed parts lead.
        groupColumns() {
            const count = Math.max(1, Math.floor((this.bodyWidth + GROUP_GAP) / (GROUP_MIN + GROUP_GAP)))
            const cols = Array.from({ length: count }, () => ({ h: 0, cards: [] }))
            for (const g of this.groups) {
                let c = cols[0]
                for (const x of cols) if (x.h < c.h) c = x
                c.cards.push(g)
                // a card's rough height: its head, then a row per item / draft (or the "none yet" line)
                const rows = g.items.length + this.partDrafts(g).length
                c.h += 38 + (rows ? rows * 60 : 34) + GROUP_GAP
            }
            return cols.map(c => c.cards)
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
        // ── any other product ──
        isOther() {
            return !!this.createPart && this.createPart.key === OTHER
        },
        classificationValues() {
            return this.classifications.map(c => c.value)
        },
        // the item's classification: the needed part's, or the one picked
        createClass() {
            if (!this.createPart) return { classification: '', subClassification: '' }
            if (!this.isOther) return { classification: this.createPart.classification, subClassification: this.createPart.subClassification }
            return { classification: this.createForm.classification || '', subClassification: String(this.createForm.subClassification || '').trim() }
        },
        // the picked classification's sub classifications in use, most used first
        subOptions() {
            const c = this.classifications.find(x => x.value === this.createForm.classification)
            return c ? c.subs.map(s => s.value) : []
        },
        // the item's classification's qualities (iMobile Listing → Qualities), or null
        qualityListed() {
            const list = this.createClass.classification && this.qualitiesByClass[this.createClass.classification]
            return list && list.length ? list : null
        },
        // the Quality dropdown: that list, else every quality in use
        qualityOptions() {
            return this.qualityListed || this.qualities.filter(Boolean)
        },
        // ── the pricing formula ──
        // which one prices the item: the part's own (from the server), or
        // the service-pack one when the quality / name says "Service Pack"
        priceFamily() {
            const family = this.isOther ? this.priceFamilies[this.createForm.classification] : this.createPart && this.createPart.priceFamily
            return priceFamilyOf({ quality: this.createForm.quality, name: this.createForm.name, family })
        },
        // the four lists for the typed cost (null without a cost)
        formulaPrices() {
            return formulaPricesFor(this.createForm.cost, this.priceFormulas[this.priceFamily])
        },
        // some list differs from the formula (or is blank)
        formulaOff() {
            return !!this.formulaPrices && PRICE_LISTS.some(p => this.offFormula(p.list))
        },
        // ── the store category ──
        categoryById() {
            return categoryIndex(this.categories)
        },
        // the categories that can be picked: shown on the store — a hidden
        // one is left out with everything under it
        pickableCategories() {
            return pickableOf(this.categories, this.categoryById)
        },
        // those as a tree for the picker (by the store's own order)
        categoryTree() {
            return categoryTreeOf(this.pickableCategories)
        },
        // may make store categories (the Categories page's right) — "Create a new one" in the link dialog
        canManageCategories() {
            return this.can('listing:category:manage')
        },
        // in the link dialog: a category with the model's own name, offered as a one-click pick
        linkSuggestion() {
            return this.linkRow ? this.suggestCategoryFor(this.linkRow) : ''
        },
        // ── the Add / Edit Model dialog ──
        modelBrand() {
            return this.brands.find(b => b.value === this.modelForm.brand) || {}
        },
        // the brand's series: this page's, then Zoho's Device Series (from the server)
        modelBrandSeries() {
            const list = this.modelBrand.series || []
            return this.modelForm.series && !list.includes(this.modelForm.series) ? [this.modelForm.series, ...list] : list
        },
        // the model as the dialog has it, shaped like a row (for the category suggestions)
        modelDraft() {
            const f = this.modelForm
            return { _id: f._id, brand: f.brand, series: f.series, model: f.model.trim(), codes: String(f.codes || '').split(',').map(s => s.trim()).filter(Boolean), aliases: [] }
        },
        modelCatSuggestion() {
            return this.modelDraft.model ? this.suggestCategoryFor(this.modelDraft) : ''
        },
        // the typed price lists against the tier order (advisory, as on Price
        // Monitoring: SVIP & Wholesale ≤ VIP ≤ Platinum; SVIP vs Wholesale free)
        priceWarnings() {
            return this.priceWarningsOf(this.createForm.prices, this.createForm.cost)
        },
        // the brand's models, for the create dialog's Compatible Model picker
        modelOptions() {
            return this.modelOptionsOf(this.createRow ? this.createRow.brand : this.sel.brand)
        },
        // ── the Edit dialog ──
        // prices: the Price Monitoring right (the server agrees when it reads the item)
        editCanPrice() {
            return this.can('zoho:stock:edit') && this.editServerCanPrice
        },
        editSubOptions() {
            const c = this.classifications.find(x => x.value === this.editForm.classification)
            const list = c ? c.subs.map(x => x.value) : []
            const cur = this.editOrig.subClassification
            return cur && this.editForm.classification === this.editOrig.classification && !list.includes(cur) ? [cur, ...list] : list
        },
        editQualityListed() {
            const list = this.editForm.classification && this.qualitiesByClass[this.editForm.classification]
            return list && list.length ? list : null
        },
        // its classification's qualities (or every one in use), its own kept in the list
        editQualityOptions() {
            const list = this.editQualityListed || this.qualities.filter(Boolean)
            const cur = this.editOrig.quality
            return cur && !list.includes(cur) ? [cur, ...list] : list
        },
        // the page brand of the item (its Device Brand), else the open model's
        editBrand() {
            return (this.brands.find(b => b.deviceBrand && this.editItem && b.deviceBrand.toLowerCase() === String(this.editItem.deviceBrand || '').toLowerCase()) || {}).value ||
                (this.model ? this.model.brand : this.sel.brand)
        },
        createBrand() {
            return this.createRow ? this.createRow.brand : this.sel.brand
        },
        // the brand's models on the page, and the ones the item lists
        editModelOptions() {
            const list = this.modelOptionsOf(this.editBrand)
            const have = new Set(list.map(fitKey))
            return [...this.editForm.compatibleModels.filter(m => !have.has(fitKey(m))), ...list]
        },
        editModelsChanged() {
            return this.editForm.compatibleModels.join('; ') !== this.editOrig.compatibleModels.join('; ')
        },
        // the open model is off the list (the part leaves this model)
        editDropsOpen() {
            return !!this.editItem && !!this.model && !this.editForm.compatibleModels.some(m => this.isOpenModel(m))
        },
        editPriceFamily() {
            return priceFamilyOf({ quality: this.editForm.quality, name: this.editForm.name, family: this.priceFamilies[this.editForm.classification] })
        },
        editFormula() {
            return formulaPricesFor(this.editForm.cost, this.priceFormulas[this.editPriceFamily])
        },
        editFormulaOff() {
            return !!this.editFormula && PRICE_LISTS.some(p => this.editOffFormula(p.list))
        },
        editPriceWarnings() {
            return this.editCanPrice && this.editPricesReady ? this.priceWarningsOf(this.editForm.prices, this.editForm.cost) : []
        },
        // the item's fields that differ from Zoho's (what PUT /items/:id gets)
        editFieldChanges() {
            const f = this.editForm
            const o = this.editOrig
            const out = {}
            const name = String(f.name || '').replace(/\s+/g, ' ').trim()
            if (name !== o.name) out.name = name
            if ((f.quality || '') !== o.quality) out.quality = f.quality || ''
            if (f.classification !== o.classification) out.classification = f.classification
            const sub = String(f.subClassification || '').trim()
            if (sub !== o.subClassification) out.subClassification = sub
            if (f.categoryId && f.categoryId !== o.categoryId) out.categoryId = f.categoryId
            if (this.editModelsChanged) out.compatibleModels = [...f.compatibleModels]
            if (this.editCanPrice && f.rate != null && f.rate !== '' && !samePrice(f.rate, o.rate)) out.rate = Number(f.rate)
            return out
        },
        // the cost and price lists that differ (Price Monitoring's bulk route); a blank stays as it is
        editPriceChanges() {
            if (!this.editCanPrice || !this.editPricesReady || !this.editItem) return []
            const out = []
            const itemId = this.editItem.itemId
            for (const { list } of PRICE_LISTS) {
                const v = this.editForm.prices[list]
                if (v != null && v !== '' && !samePrice(v, this.editOrig.prices[list])) out.push({ itemId, list, rate: Number(v) })
            }
            const c = this.editForm.cost
            if (c != null && c !== '' && !samePrice(c, this.editOrig.cost)) out.push({ itemId, list: 'purchase', rate: Number(c) })
            return out
        },
        editChangeCount() {
            return Object.keys(this.editFieldChanges).length + this.editPriceChanges.length + (this.editFiles.length ? 1 : 0)
        },
        // the footer: what Save will do
        editSummary() {
            if (this.editLoading || !this.editItem) return ''
            const bits = []
            const fields = Object.keys(this.editFieldChanges).length + this.editPriceChanges.length
            if (fields) bits.push(this.$tp('{n} change(s)', { n: fields }))
            if (this.editFiles.length) bits.push(this.$tp('{n} photo(s) to add', { n: this.editFiles.length }))
            return bits.length ? bits.join(' · ') : this.$tp('Nothing changed yet')
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
    mounted() {
        this.measureBody()
        window.addEventListener('resize', this.measureBody)
        // the tree folding / unfolding changes the width without a window resize
        if (window.ResizeObserver && this.$refs.body) {
            this.bodyObs = new ResizeObserver(() => this.measureBody())
            this.bodyObs.observe(this.$refs.body)
        }
    },
    beforeDestroy() {
        window.removeEventListener('resize', this.measureBody)
        if (this.bodyObs) this.bodyObs.disconnect()
    },
    methods: {
        zohoLink,
        // the width the part cards share (masonry columns)
        measureBody() {
            const el = this.$refs.body
            if (el && el.clientWidth) this.bodyWidth = el.clientWidth
        },
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
                this.qualitiesByClass = r.qualitiesByClass || {}
                this.classifications = r.classifications || []
                this.priceFamilies = r.priceFamilies || {}
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
        // The model part of a name for a Compatible Model list: each model the
        // way the page names it — the first in full ("Samsung Galaxy S24
        // (S921)"), the rest short ("S24 Plus (S926)"), " / " between. A model
        // not on the page: its Compatible Model without the brand's words, the
        // brand's lead before the first ("MOTO", "Samsung Galaxy").
        modelsNamePart(brand, models) {
            const b = this.brands.find(x => x.value === brand) || {}
            const rows = this.rows.filter(r => r.brand === brand && r.nameModel)
            const words = (b.words || []).map(w => String(w).toLowerCase())
            return (models || []).map((cm, i) => {
                let row = rows.find(r => r.compatibleModel === cm)
                if (!row) {
                    const k = fitKey(cm)
                    const hits = k ? rows.filter(r => [r.compatibleModel, r.model, ...(r.aliases || [])].some(x => fitKey(x) === k)) : []
                    if (hits.length === 1) row = hits[0]
                }
                if (row) return i === 0 ? row.nameModel.full : row.nameModel.short
                let short = String(cm || '').trim()
                for (let again = true; again;) {
                    again = false
                    for (const w of words) {
                        const rx = new RegExp('^' + w + '\\s+', 'i')
                        if (rx.test(short)) { short = short.replace(rx, ''); again = true }
                    }
                }
                if (i > 0 || !b.nameLead || /^(realme|oneplus)\b/i.test(short)) return short
                return `${b.nameLead} ${short}`
            }).filter(Boolean).join(' / ')
        },
        // the models changed: the name follows (swapModelsInName) — the name it
        // had is kept for Undo — or a note says to change it by hand
        followModels(kind) {
            const form = kind === 'edit' ? this.editForm : this.createForm
            const st = this.nameFollow[kind]
            const part = this.modelsNamePart(kind === 'edit' ? this.editBrand : this.createBrand, form.compatibleModels)
            if (!part) return
            const next = swapModelsInName(form.name, st.part, part)
            if (next == null) { st.note = 'manual'; return }
            if (next !== form.name) {
                if (st.undo == null) st.undo = form.name
                form.name = next
                st.note = 'updated'
            }
            st.part = part
        },
        // back to the name before the models changed it (with the quality tag as it is now)
        undoFollow(kind) {
            const form = kind === 'edit' ? this.editForm : this.createForm
            const st = this.nameFollow[kind]
            if (st.undo == null) return
            form.name = this.withQuality(st.undo, form.quality || '', kind === 'edit' ? this.editAppliedQuality : this.appliedQuality)
            this.nameFollow[kind] = blankFollow()
        },
        // a brand's models on the page (their Compatible Model), sorted
        modelOptionsOf(brand) {
            return [...new Set(this.rows.filter(r => r.brand === brand).map(r => r.compatibleModel).filter(Boolean))]
                .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
        },
        // the typed price lists against the tier order (advisory, as on Price
        // Monitoring: SVIP & Wholesale ≤ VIP ≤ Platinum; SVIP vs Wholesale free)
        priceWarningsOf(prices, costValue) {
            const p = prices || {}
            const has = k => p[k] != null && p[k] !== ''
            const out = []
            const rule = (low, high, a, b) => { if (has(low) && has(high) && Number(p[low]) > Number(p[high])) out.push(this.$tp('{a} is above {b}', { a, b })) }
            rule('vip', 'platinum', 'VIP', 'Platinum')
            rule('svip', 'vip', 'SVIP', 'VIP')
            rule('wholesale', 'vip', 'Wholesale', 'VIP')
            if (!has('vip')) { rule('svip', 'platinum', 'SVIP', 'Platinum'); rule('wholesale', 'platinum', 'Wholesale', 'Platinum') }
            // a list under the cost loses money
            const cost = Number(costValue)
            if (cost > 0) for (const { list, label } of PRICE_LISTS) if (has(list) && Number(p[list]) < cost) out.push(this.$tp('{a} is below the cost', { a: label }))
            return out
        },
        // ── Edit an existing item (2026-10-20) ──
        // a model name is the open model (its name, Compatible Model or another name)
        isOpenModel(m) {
            const k = fitKey(m)
            return !!this.model && !!k && [this.model.model, this.model.compatibleModel, ...(this.model.aliases || [])].some(x => fitKey(x) === k)
        },
        // Open it: the item live from Zoho, and — with the price right — its
        // cost and four price lists (Price Monitoring's live read)
        async openEdit(it) {
            const seq = ++this.editSeq
            this.clearEditFiles()
            this.editMainFirst = false
            this.editItem = null
            this.editError = ''
            this.editForm = blankEditForm()
            this.editOrig = blankEditForm()
            this.editPricesReady = false
            this.editPricesError = ''
            this.createNarrow = window.innerWidth < 900
            this.editVisible = true
            this.editLoading = true
            if (!this.categories.length || Date.now() - this.categoriesAt > CATEGORIES_TTL) this.loadCategories()
            try {
                const r = await getNewProductItem(it.itemId)
                if (seq !== this.editSeq) return
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                const x = r.item
                this.editServerCanPrice = !!r.canPrice
                const form = {
                    name: x.name || '',
                    quality: x.quality || '',
                    classification: x.classification || '',
                    subClassification: x.subClassification || '',
                    categoryId: x.categoryId || '',
                    compatibleModels: [...(x.compatibleModels || [])],
                    rate: x.rate == null ? undefined : x.rate,
                    cost: undefined,
                    prices: blankPrices()
                }
                this.editOrig = JSON.parse(JSON.stringify(form))
                this.editForm = form
                this.editAppliedQuality = form.quality
                this.editItem = x
                this.nameFollow.edit = { ...blankFollow(), part: this.modelsNamePart(this.editBrand, form.compatibleModels) }
                if (this.editCanPrice) this.loadEditPrices(seq, x.itemId)
            } catch (e) {
                if (seq === this.editSeq) this.editError = this.msg(e, this.$tp('Could not read the item from Zoho'))
            } finally {
                if (seq === this.editSeq) this.editLoading = false
            }
        },
        async loadEditPrices(seq, itemId) {
            this.editPricesLoading = true
            try {
                const r = await getStockItemPrices(itemId)
                if (seq !== this.editSeq) return
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                const prices = blankPrices()
                for (const { list } of PRICE_LISTS) prices[list] = r.prices && r.prices[list] != null ? r.prices[list] : undefined
                const cost = r.purchasePrice != null ? r.purchasePrice : undefined
                this.editOrig.prices = { ...prices }
                this.editOrig.cost = cost
                this.editForm.prices = { ...prices }
                this.editForm.cost = cost
                this.editPricesReady = true
            } catch (e) {
                if (seq === this.editSeq) this.editPricesError = this.msg(e, this.$tp('Could not read the prices from Zoho — they are not changed here'))
            } finally {
                if (seq === this.editSeq) this.editPricesLoading = false
            }
        },
        editOffFormula(list) {
            const v = this.editForm.prices[list]
            return v == null || v === '' || Math.abs(Number(v) - this.editFormula[list]) > 0.004
        },
        onEditClassification() {
            const f = this.editForm
            if (f.subClassification && !this.editSubOptions.includes(f.subClassification)) f.subClassification = ''
            if (f.quality && this.editQualityListed && !this.editQualityListed.includes(f.quality)) {
                f.quality = ''
                this.onEditQuality('')
            }
        },
        // the quality's [tag] on the name follows it, as in the create dialog
        onEditQuality(q) {
            this.editForm.name = this.withQuality(this.editForm.name, q || '', this.editAppliedQuality)
            this.editAppliedQuality = q || ''
        },
        // picked or typed: "A; B" becomes two, the same model twice (any case) once
        onEditModels(list) {
            const out = []
            for (const raw of list || []) {
                for (const part of String(raw).split(';')) {
                    const m = part.trim().replace(/\s+/g, ' ')
                    if (!m) continue
                    if (m.length > 80) { this.$message.warning(this.$tp('A model name is 80 characters at most')); continue }
                    if (!out.some(x => x.toLowerCase() === m.toLowerCase())) out.push(m)
                }
            }
            this.editForm.compatibleModels = out
            this.followModels('edit')
        },
        onEditPaste(e) {
            const files = Array.from((e.clipboardData && e.clipboardData.files) || []).filter(x => /^image\//i.test(x.type))
            if (!files.length || !this.$refs.editPhotoPicker) return
            e.preventDefault()
            this.$refs.editPhotoPicker.add(files.map((raw, i) => raw.name && raw.name !== 'image.png'
                ? raw : new File([raw], `screenshot-${Date.now() + i}.png`, { type: raw.type })))
        },
        clearEditFiles() {
            for (const x of this.editFiles) { if (x.url && x.url.startsWith('blob:')) { try { URL.revokeObjectURL(x.url) } catch (e) { /* ignore */ } } }
            this.editFiles = []
        },
        // Save: the item's fields (one Zoho update), then the prices, then the
        // photos — a step that fails is said so; the ones before it are saved
        async saveEdit() {
            if (!this.editItem || this.editSaving || !this.editChangeCount) return
            const fields = this.editFieldChanges
            if (fields.name !== undefined && fields.name.length < 5) return this.$message.warning(this.$tp('Item name is too short'))
            if (fields.compatibleModels && !fields.compatibleModels.length) {
                try {
                    await this.$confirm(this.$tp('Save with no models? The part will not show for any model on this page.'), this.$tp('Compatible Models'),
                        { type: 'warning', confirmButtonText: this.$tp('Save to Zoho'), cancelButtonText: this.$tp('Cancel') })
                } catch (e) { return }
            }
            const itemId = this.editItem.itemId
            const sku = this.editItem.sku
            const prices = this.editPriceChanges
            const files = this.editFiles.map(x => x.file)
            const done = []
            const failed = []
            this.editSaving = true
            try {
                if (Object.keys(fields).length) {
                    try {
                        const r = await updateNewProductItem(itemId, fields)
                        if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                        done.push(this.$tp('details'))
                    } catch (e) {
                        // nothing else is sent: the dialog stays open to fix it
                        this.$message.error(this.msg(e, this.$tp('Zoho did not update the item')))
                        return
                    }
                }
                if (prices.length) {
                    try {
                        const r = await pushStockItemPrices(prices)
                        const bad = ((r && r.results) || []).filter(x => !x.ok)
                        if (!r || r.success === false || bad.length) {
                            const names = (bad.length ? bad : prices).map(x => x.list === 'purchase' ? this.$tp('Cost price') : (PRICE_LISTS.find(p => p.list === x.list) || { label: x.list }).label)
                            failed.push(this.$tp('prices: {lists}', { lists: names.join(', ') }))
                        } else done.push(this.$tp('prices'))
                    } catch (e) {
                        failed.push(this.$tp('prices: {lists}', { lists: this.msg(e, '') }))
                    }
                }
                if (files.length) {
                    try {
                        const data = new FormData()
                        files.forEach(file => data.append('images', file, file.name))
                        data.append('main', this.editMainFirst || !this.editItem.photos.length ? '1' : '0')
                        const r = await addNewProductItemPhotos(itemId, data)
                        if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                        done.push(this.$tp('{n} photo(s)', { n: files.length }))
                    } catch (e) {
                        failed.push(this.$tp('photos: {error}', { error: this.msg(e, '') }))
                    }
                }
                if (failed.length) this.$message.warning(this.$tp('{sku}: not saved — {what}', { sku, what: failed.join('; ') }))
                if (done.length) this.$message.success(this.$tp('{sku} saved to Zoho: {what}', { sku, what: done.join(', ') }))
                this.editVisible = false
                this.refresh()
            } finally {
                this.editSaving = false
            }
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
                prices: blankPrices(),
                // any other product only
                classification: '',
                subClassification: ''
            }
            this.lastAuto = null
            this.nameFollow.create = { ...blankFollow(), part: this.modelsNamePart(row.brand, this.createForm.compatibleModels) }
            this.createVisible = true
            this.loadNextSku()
        },
        // Any other product for the model: the same dialog, the name started
        // ("MOTO G96 (XT…) Compatible "), the classification picked there —
        // given when opened from that classification's box.
        openCreateOther(row, classification) {
            this.openCreate(row, otherPart())
            this.createForm.classification = this.classificationValues.includes(classification) ? classification : ''
        },
        // a new other product: the cursor at the end of the name, to type what it is
        onCreateOpened() {
            if (!this.isOther || this.createDraftId) return
            const el = this.$refs.nameInput && this.$refs.nameInput.$refs.textarea
            if (!el) return
            el.focus()
            el.setSelectionRange(el.value.length, el.value.length)
        },
        classLabel(c) {
            return this.$tp(CLASS_LABELS[c] || c)
        },
        // another classification: its own sub classifications and qualities —
        // a sub or quality that isn't one of them is cleared; the prices
        // follow its formula unless changed by hand
        onClassification() {
            if (this.createForm.subClassification && !this.subOptions.includes(this.createForm.subClassification)) this.createForm.subClassification = ''
            if (this.createForm.quality && this.qualityListed && !this.qualityListed.includes(this.createForm.quality)) {
                this.createForm.quality = ''
                this.onQuality('')
            } else this.applyFormula(false)
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
        categoryFilter,
        // The category named after a model: names compared without the brand
        // ("Motorola" / "MOTO"), case or punctuation — "MOTO G57" for Moto G57;
        // the model's own name before its other names (Moto X40 → Edge 40 Pro).
        // Several with that name: the one under the brand's branch, then the
        // one with products; still several → none.
        suggestCategoryFor(row) {
            if (!row || !this.categories.length) return ''
            const brand = this.brands.find(b => b.value === row.brand) || {}
            const words = [...new Set([row.brand, brand.deviceBrand, brand.label, ...(brand.words || []), ...(BRAND_SHORT[row.brand] || [])].filter(Boolean).map(w => String(w).toLowerCase()))]
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
            return categoryPathIn(this.categoryById, id)
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
            if (row.brand === 'Motorola') {
                if (/^(edge|thinkphone)\b/i.test(m)) return m
                return 'MOTO ' + m.replace(/^moto\s+/i, '')
            }
            // the other brands, the store's way: "Galaxy Z Fold 8", "Google Pixel 11", "iPhone 17 Pro", "Xiaomi …"
            const brand = this.brands.find(b => b.value === row.brand) || {}
            let short = m
            for (let again = true; again;) {
                again = false
                for (const w of brand.words || []) {
                    const rx = new RegExp(`^${w}\\s+`, 'i')
                    if (rx.test(short)) { short = short.replace(rx, ''); again = true }
                }
            }
            // a Realme / OnePlus under OPPO keeps its own name
            if (row.brand === 'OPPO' && /^(realme|oneplus)\b/i.test(short)) return short
            return (brand.categoryPrefix || '') + short
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
            return count(others.filter(r => (r.series || 'Other') === (row.series || 'Other'))) || count(others) || (same ? same.parentId : '') || this.brandRootCategory(row.brand, row.series)
        },
        // For a brand's first models: its own branch at the top of the store
        // ("SAMSUNG", "GOOGLE", "Apple" …) — the folder there named for the
        // series when there is one ("Fold Series" → "Galaxy Z (Fold / Flip)",
        // "S Series" → "Galaxy S", "Reno Series" → "OPPO Reno").
        brandRootCategory(brandValue, series) {
            const brand = this.brands.find(b => b.value === brandValue) || {}
            const names = [brandValue, brand.label, brand.deviceBrand].filter(Boolean).map(s => String(s).toLowerCase())
            const top = this.pickableCategories.find(c => !this.categoryById[c.parentId] && names.includes(String(c.name || '').toLowerCase()))
            if (!top) return ''
            const word = String(series || '').toLowerCase().replace(/\bseries\b/g, ' ').trim().split(/\s+/)[0]
            // a folder (it has categories under it) — not a model's own category ("Google Pixel 11 Pro Fold")
            const isFolder = c => this.pickableCategories.some(k => k.parentId === c.id)
            const folder = word && this.pickableCategories.find(c => c.parentId === top.id && isFolder(c) && String(c.name || '').toLowerCase().split(/[^a-z0-9]+/).includes(word))
            return folder ? folder.id : top.id
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
            if (this.isOther) {
                if (!this.createForm.classification) return warn('Pick the classification')
                const start = String(((this.createRow && this.createRow.defaultNames) || {})[OTHER] || '').trim().toLowerCase()
                if (start && this.createForm.name.trim().toLowerCase() === start) return warn('Type what the product is after the model')
                if (/[[\]]/.test(this.createForm.subClassification || '')) return warn('Sub classification can\'t contain [ or ]')
            }
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
        withQuality(name, quality, applied = this.appliedQuality) {
            // the list's qualities, and the one put on last (it may have been typed)
            const known = [...this.qualities.filter(Boolean), applied].filter(Boolean)
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
            return g.drafts || []
        },
        partLabel(d) {
            if (d.part === OTHER) {
                if (!d.classification) return this.$tp('Other product')
                return this.classLabel(d.classification) + (d.subClassification ? ' / ' + d.subClassification : '')
            }
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
                prices: Object.fromEntries(Object.entries(this.createForm.prices || {}).filter(([, v]) => v != null && v !== '')),
                // any other product: the classification picked
                ...(this.isOther ? { classification: this.createClass.classification, subClassification: this.createClass.subClassification } : {})
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
            const part = row && (d.part === OTHER ? otherPart() : this.partsOf(row.brand).find(p => p.key === d.part))
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
                prices: { ...blankPrices(), ...(d.prices || {}) },
                classification: d.classification || '',
                subClassification: d.subClassification || ''
            }
            this.nameFollow.create = { ...blankFollow(), part: this.modelsNamePart(row.brand, this.createForm.compatibleModels) }
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
        async openModel(row) {
            this.modelForm = row
                ? { ...blankModelForm(), _id: row._id, brand: row.brand, series: row.series || '', model: row.model, pick: row.model, codes: (row.codes || []).join(', '), note: row.note || '', categoryId: row.categoryId || '', linkedId: row.categoryId || '' }
                : blankModelForm() // no brand picked for you (user 2026-10-19)
            this.createNarrow = window.innerWidth < 900
            this.zohoModels = []
            this.modelVisible = true
            this.loadModelOptions()
            if (!this.categories.length || Date.now() - this.categoriesAt > CATEGORIES_TTL) await this.loadCategories()
        },
        // the Model list for the dialog's brand + series (none until a series is picked)
        async loadModelOptions() {
            const { brand, series } = this.modelForm
            const seq = ++this.zohoModelsSeq
            if (!brand || !String(series || '').trim()) { this.zohoModels = []; this.zohoModelsLoading = false; return }
            this.zohoModelsLoading = true
            try {
                const r = await newProductModelOptions(brand, series)
                if (seq !== this.zohoModelsSeq) return
                this.zohoModels = (r && r.options) || []
            } catch (e) {
                if (seq === this.zohoModelsSeq) this.zohoModels = []
            } finally {
                if (seq === this.zohoModelsSeq) this.zohoModelsLoading = false
            }
        },
        // A model from the list brings its codes and Zoho's own Compatible
        // Model (its parts then count at once); a typed name that is one of
        // the list's ("Z Fold 8") is taken as that one; anything else is new.
        onModelPick(v) {
            const f = this.modelForm
            const typed = String(v || '').trim()
            const o = this.zohoModels.find(x => x.compatibleModel === v) ||
                (typed ? this.zohoModels.find(x => looseName(x.model) === looseName(typed) || looseName(x.compatibleModel) === looseName(typed)) : null)
            if (o) {
                f.pick = o.compatibleModel
                f.model = o.model
                f.codes = o.codes.join(', ')
                f.cm = o.compatibleModel
                // its parts are filed under a store category already: link the model there too
                f.partsCategory = o.category ? { ...o.category, total: o.items } : null
                if (o.category) { f.catMode = 'pick'; f.categoryId = o.category.id }
            } else {
                // a new name: the codes a pick filled in were that model's
                if (f.cm) f.codes = ''
                f.model = typed
                f.cm = ''
                f.partsCategory = null
            }
            this.refreshModelCat()
        },
        // the category picked above is not the one the model's parts are in
        partsElsewhere() {
            const f = this.modelForm
            return !!f.partsCategory && (f.catMode === 'new' || f.categoryId !== f.partsCategory.id)
        },
        partsCategoryPath() {
            const c = this.modelForm.partsCategory
            return c ? (this.categoryById[c.id] ? this.categoryPath(c.id) : c.name) : ''
        },
        // the suggestions follow the typed model / brand / series until changed by hand
        refreshModelCat() {
            const f = this.modelForm
            if (f.catMode !== 'new') return
            if (!f.catNameTouched) f.catName = this.modelDraft.model ? this.newCategoryName(this.modelDraft) : ''
            if (!f.catParentTouched) f.catParentId = this.newCategoryParent(this.modelDraft)
        },
        // another series / brand: its own Model list (a model picked from the old one is let go)
        onModelSeries() {
            if (this.modelForm.cm) { this.modelForm.pick = ''; this.modelForm.model = ''; this.modelForm.codes = ''; this.modelForm.cm = ''; this.modelForm.partsCategory = null }
            this.loadModelOptions()
            this.refreshModelCat()
        },
        onModelBrand() {
            // another brand's series list
            if (this.modelForm.series && !(this.modelBrand.series || []).includes(this.modelForm.series)) this.modelForm.series = ''
            this.onModelSeries()
        },
        onModelCatMode(mode) {
            if (mode === 'new') this.refreshModelCat()
        },
        async submitModel() {
            const f = this.modelForm
            const warn = text => { this.$message.warning(this.$tp(text)); return false }
            if (!f.brand) return warn('Pick the brand')
            if (!String(f.series || '').trim()) return warn('Pick the series')
            if (!f.model.trim()) return warn('Enter the model')
            // a new model is linked at once (items can only be created once it is)
            if (f.catMode === 'new') {
                if (!f.catName.trim()) return warn('Enter the category name')
                if (!f.catParentId) return warn('Pick the parent category')
            } else if (!f._id && !f.categoryId) return warn('Pick the store category')
            this.modelSaving = true
            try {
                let categoryId = f.categoryId || ''
                if (f.catMode === 'new') {
                    const c = await createCategory({ name: f.catName.trim(), parentId: f.catParentId, visible: true, showInMenu: false })
                    if (!c || c.success === false || !c.category) throw new Error((c && c.message) || 'Failed')
                    categoryId = c.category.id
                    this.$message.success(this.$tp('{name} created', { name: c.category.name }))
                    this.loadCategories(true)
                }
                const data = { brand: f.brand, series: f.series.trim(), model: f.model.trim(), codes: f.codes, note: f.note }
                // picked from Zoho's list: its own Compatible Model, so the parts it has count straight away
                if (f.cm) data.compatibleModel = f.cm
                // an edit sends the category only when it changed (clearing it is the link dialog's Unlink)
                if (!f._id || (categoryId && categoryId !== f.linkedId)) data.categoryId = categoryId
                const r = f._id ? await updateNewProductModel(f._id, data) : await addNewProductModel(data)
                if (!r || r.success === false) throw new Error((r && r.message) || 'Failed')
                // a category made here is kept in the form, so a retry after an error links it rather than making another
                if (f.catMode === 'new') { f.catMode = 'pick'; f.categoryId = categoryId }
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
/* masonry: columns side by side, each card into the shortest (groupColumns) */
.spn-groups { display: flex; align-items: flex-start; gap: 12px; min-height: 120px; }
.spn-mcol { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
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
.spn-fits-btn { padding: 0 !important; flex-shrink: 0; }
.spn-edit-body { min-height: 120px; }
.spn-follow { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; margin: -6px 0 10px; font-size: 12px; color: #67c23a; line-height: 1.5;
    .el-button { padding: 0; } }
.spn-photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 6px; margin-bottom: 4px; }
.spn-photo { position: relative; display: flex; align-items: center; justify-content: center; aspect-ratio: 1; border: 1px solid #ebeef5; border-radius: 4px; background: #f5f7fa; overflow: hidden;
    img { max-width: 100%; max-height: 100%; object-fit: contain; } &:hover { border-color: #409eff; } }
.spn-photo-main { position: absolute; left: 3px; top: 3px; padding: 0 5px; border-radius: 3px; font-size: 10px; line-height: 16px; color: #fff; background: #409eff; }
.spn-main-first { margin-top: 8px; ::v-deep .el-checkbox__label { font-size: 12px; } }
.spn-good { color: #67c23a; }
.spn-warn { color: #e6a23c; }
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
.spn-cat-warn { margin-top: 4px; font-size: 12px; line-height: 1.5; color: #b88230; i { color: #e6a23c; } .el-button { padding: 0; } }
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
/* Add Model's Model list (appended to <body>): the code dimmed, the part count on the right */
.spn-model-pop {
    .spn-dim { font-size: 12px; color: #909399; }
    .spn-opt-meta { float: right; margin-left: 16px; font-size: 12px; color: #909399; } }
</style>
