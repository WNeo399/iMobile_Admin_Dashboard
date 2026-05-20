<template>
    <div class="app-container" v-loading="loading">
        <el-page-header :content="modelTitle" @back="$router.back()" />

        <el-card v-if="model" shadow="never" style="margin-top: 16px">
            <el-descriptions :column="3" size="small" border>
                <el-descriptions-item label="Brand">{{ model.brandName }}</el-descriptions-item>
                <el-descriptions-item label="Code">{{ model.code || '—' }}</el-descriptions-item>
                <el-descriptions-item label="Status">
                    <el-tag :type="model.active ? 'success' : 'info'" size="mini">
                        {{ model.active ? 'Active' : 'Inactive' }}
                    </el-tag>
                </el-descriptions-item>
                <el-descriptions-item label="Slug">{{ model.slug }}</el-descriptions-item>
                <el-descriptions-item label="Created" :span="2">
                    {{ formatDate(model.createdAt) }}
                </el-descriptions-item>
            </el-descriptions>
        </el-card>

        <el-card shadow="never" style="margin-top: 16px">
            <div slot="header" style="display: flex; justify-content: space-between; align-items: center">
                <span style="font-weight: 500">Available Parts ({{ parts.length }})</span>
                <el-button type="primary" size="mini" icon="el-icon-plus" @click="handleAddPart">
                    Add Part
                </el-button>
            </div>

            <el-table v-loading="partsLoading" :data="parts" empty-text="No parts added yet">
                <el-table-column label="Part Name" prop="partName" min-width="160" sortable />
                <el-table-column label="Quality" prop="qualityName" width="140">
                    <template slot-scope="scope">
                        <el-tag size="mini" type="info">{{ scope.row.qualityName }}</el-tag>
                    </template>
                </el-table-column>
                <el-table-column label="Price" width="120" align="right" sortable
                    :sort-method="(a, b) => a.price - b.price">
                    <template slot-scope="scope">
                        AUD {{ Number(scope.row.price).toFixed(2) }}
                    </template>
                </el-table-column>
                <el-table-column label="SKU" prop="identifiers.sku" width="140">
                    <template slot-scope="scope">
                        {{ scope.row.identifiers && scope.row.identifiers.sku || '—' }}
                    </template>
                </el-table-column>
                <el-table-column label="Part Number" width="160">
                    <template slot-scope="scope">
                        {{ scope.row.identifiers && scope.row.identifiers.partNumber || '—' }}
                    </template>
                </el-table-column>
                <el-table-column label="Zoho Name" min-width="200" show-overflow-tooltip>
                    <template slot-scope="scope">
                        {{ scope.row.identifiers && scope.row.identifiers.zohoName || '—' }}
                    </template>
                </el-table-column>
                <el-table-column label="Active" width="80" align="center">
                    <template slot-scope="scope">
                        <i :class="scope.row.active ? 'el-icon-check' : 'el-icon-close'"
                            :style="{ color: scope.row.active ? '#67C23A' : '#909399' }" />
                    </template>
                </el-table-column>
                <el-table-column label="Action" align="center" width="160" class-name="small-padding fixed-width">
                    <template slot-scope="scope">
                        <el-button size="mini" type="text" icon="el-icon-edit"
                            @click="handleEditPart(scope.row)">Edit</el-button>
                        <el-button size="mini" type="text" icon="el-icon-delete"
                            @click="handleDeletePart(scope.row)">Delete</el-button>
                    </template>
                </el-table-column>
            </el-table>
        </el-card>

        <el-dialog :title="partDialogTitle" :visible.sync="partOpen" width="640px" append-to-body
            @close="resetPartForm">
            <el-form ref="partForm" :model="partForm" :rules="partRules" label-width="120px" size="small">
                <el-row :gutter="16">
                    <el-col :span="12">
                        <el-form-item label="Part Name" prop="partName">
                            <el-input v-model="partForm.partName" placeholder="OCTA, Screen, Battery..." />
                        </el-form-item>
                    </el-col>
                    <el-col :span="12">
                        <el-form-item label="Quality" prop="qualityId">
                            <el-select v-model="partForm.qualityId" placeholder="Select quality"
                                style="width: 100%">
                                <el-option v-for="q in qualities" :key="q._id" :label="q.name" :value="q._id" />
                            </el-select>
                        </el-form-item>
                    </el-col>
                </el-row>
                <el-row :gutter="16">
                    <el-col :span="12">
                        <el-form-item label="Price (AUD)" prop="price">
                            <el-input-number v-model="partForm.price" :min="0" :precision="2" :step="1"
                                style="width: 100%" />
                        </el-form-item>
                    </el-col>
                    <el-col :span="12">
                        <el-form-item label="Active" prop="active">
                            <el-switch v-model="partForm.active" />
                        </el-form-item>
                    </el-col>
                </el-row>

                <el-divider content-position="left">Identifiers (any one or more)</el-divider>

                <el-form-item label="SKU">
                    <el-input v-model="partForm.identifiers.sku" placeholder="21077" />
                </el-form-item>
                <el-form-item label="Part Number">
                    <el-input v-model="partForm.identifiers.partNumber" placeholder="GH82-24544A" />
                </el-form-item>
                <el-form-item label="Zoho Name">
                    <el-input v-model="partForm.identifiers.zohoName"
                        placeholder="Samsung Galaxy S21 (G991) LCD..." />
                </el-form-item>
            </el-form>
            <div slot="footer" class="dialog-footer">
                <el-button type="primary" :loading="partSubmitLoading" @click="submitPartForm">Save</el-button>
                <el-button @click="partOpen = false">Cancel</el-button>
            </div>
        </el-dialog>
    </div>
</template>

<script>
import { getModel } from '@/api/sqt/models'
import { listParts, createPart, updatePart, deletePart } from '@/api/sqt/parts'
import { listQualities } from '@/api/sqt/qualities'

function emptyPartForm() {
    return {
        _id: null,
        partName: '',
        qualityId: '',
        price: 0,
        active: true,
        identifiers: { sku: '', partNumber: '', zohoName: '' }
    }
}

export default {
    name: 'SqtModelDetail',
    data() {
        return {
            loading: false,
            partsLoading: false,
            partSubmitLoading: false,
            model: null,
            parts: [],
            qualities: [],
            partOpen: false,
            partDialogTitle: '',
            partForm: emptyPartForm(),
            partRules: {
                partName: [{ required: true, message: 'Part name is required', trigger: 'blur' }],
                qualityId: [{ required: true, message: 'Quality is required', trigger: 'change' }],
                price: [{ required: true, type: 'number', message: 'Price is required', trigger: 'blur' }]
            }
        }
    },
    computed: {
        modelId() {
            return this.$route.params.id
        },
        modelTitle() {
            return this.model ? `${this.model.brandName} — ${this.model.name}` : 'Model Detail'
        }
    },
    created() {
        this.loadAll()
    },
    methods: {
        async loadAll() {
            this.loading = true
            try {
                const [modelRes, qualitiesRes] = await Promise.all([
                    getModel(this.modelId),
                    listQualities()
                ])
                this.model = modelRes.data
                this.qualities = qualitiesRes.data || []
                await this.loadParts()
            } catch (e) {
                console.error(e)
                this.$message.error('Failed to load model')
            } finally {
                this.loading = false
            }
        },
        async loadParts() {
            this.partsLoading = true
            try {
                const res = await listParts(this.modelId)
                this.parts = res.data || []
            } catch (e) {
                console.error(e)
                this.$message.error('Failed to load parts')
            } finally {
                this.partsLoading = false
            }
        },
        handleAddPart() {
            this.partForm = emptyPartForm()
            this.partDialogTitle = 'Add Part'
            this.partOpen = true
        },
        handleEditPart(row) {
            this.partForm = {
                _id: row._id,
                partName: row.partName || '',
                qualityId: row.qualityId || '',
                price: Number(row.price) || 0,
                active: row.active !== false,
                identifiers: {
                    sku: row.identifiers && row.identifiers.sku || '',
                    partNumber: row.identifiers && row.identifiers.partNumber || '',
                    zohoName: row.identifiers && row.identifiers.zohoName || ''
                }
            }
            this.partDialogTitle = 'Edit Part'
            this.partOpen = true
        },
        async handleDeletePart(row) {
            try {
                await this.$confirm(
                    `Delete "${row.partName}" (${row.qualityName})?`,
                    'Warning',
                    {
                        confirmButtonText: 'Confirm',
                        cancelButtonText: 'Cancel',
                        type: 'warning'
                    }
                )
                await deletePart(this.modelId, row._id)
                this.$message.success('Part deleted')
                this.loadParts()
            } catch (e) {
                if (e !== 'cancel') {
                    console.error(e)
                    this.$message.error('Delete failed')
                }
            }
        },
        submitPartForm() {
            this.$refs.partForm.validate(async valid => {
                if (!valid) return
                this.partSubmitLoading = true
                try {
                    const payload = {
                        partName: this.partForm.partName,
                        qualityId: this.partForm.qualityId,
                        price: this.partForm.price,
                        active: this.partForm.active,
                        identifiers: {
                            sku: this.partForm.identifiers.sku || null,
                            partNumber: this.partForm.identifiers.partNumber || null,
                            zohoName: this.partForm.identifiers.zohoName || null
                        }
                    }
                    if (this.partForm._id) {
                        await updatePart(this.modelId, this.partForm._id, payload)
                        this.$message.success('Part updated')
                    } else {
                        await createPart(this.modelId, payload)
                        this.$message.success('Part added')
                    }
                    this.partOpen = false
                    this.loadParts()
                } catch (e) {
                    console.error(e)
                    const msg = (e.response && e.response.data && e.response.data.message) || 'Save failed'
                    this.$message.error(msg)
                } finally {
                    this.partSubmitLoading = false
                }
            })
        },
        resetPartForm() {
            this.partForm = emptyPartForm()
            this.$nextTick(() => {
                this.$refs.partForm && this.$refs.partForm.clearValidate()
            })
        },
        formatDate(d) {
            if (!d) return '—'
            return new Date(d).toLocaleString()
        }
    }
}
</script>
