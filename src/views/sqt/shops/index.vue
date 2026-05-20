<template>
    <div class="app-container">
        <el-form :model="queryParams" ref="queryForm" size="small" :inline="true" v-show="showSearch">
            <el-form-item label="Search" prop="search">
                <el-input v-model="queryParams.search" placeholder="Name, slug, email, address" clearable
                    style="width: 260px" @keyup.enter.native="handleQuery" />
            </el-form-item>
            <el-form-item label="Status" prop="status">
                <el-select v-model="queryParams.status" placeholder="Any status" clearable style="width: 160px">
                    <el-option label="Active" value="active" />
                    <el-option label="Inactive" value="inactive" />
                    <el-option label="Pending" value="pending" />
                </el-select>
            </el-form-item>
            <el-form-item>
                <el-button type="primary" icon="el-icon-search" size="mini" @click="handleQuery">Search</el-button>
                <el-button icon="el-icon-refresh" size="mini" @click="resetQuery">Reset</el-button>
            </el-form-item>
        </el-form>

        <el-row :gutter="10" class="mb8">
            <el-col :span="1.5">
                <el-button type="primary" plain icon="el-icon-plus" size="mini" @click="handleAdd">Add Shop</el-button>
            </el-col>
            <right-toolbar :showSearch.sync="showSearch" @queryTable="getList"></right-toolbar>
        </el-row>

        <el-table v-loading="loading" :data="list">
            <el-table-column label="Store Name" prop="storeName" min-width="200">
                <template slot-scope="scope">
                    <div>
                        <span style="font-weight: 500">{{ scope.row.storeName }}</span>
                        <br />
                        <span style="color: #999; font-size: 12px">{{ scope.row.slug }}</span>
                    </div>
                </template>
            </el-table-column>
            <el-table-column label="Address" min-width="240">
                <template slot-scope="scope">
                    <span>{{ scope.row.address && scope.row.address.raw || '—' }}</span>
                </template>
            </el-table-column>
            <el-table-column label="Contacts" min-width="200">
                <template slot-scope="scope">
                    <div v-if="scope.row.emails && scope.row.emails.length">
                        <i class="el-icon-message" /> {{ scope.row.emails[0] }}
                        <span v-if="scope.row.emails.length > 1" style="color: #999">
                            +{{ scope.row.emails.length - 1 }}
                        </span>
                    </div>
                    <div v-if="scope.row.phones && scope.row.phones.length" style="font-size: 12px; color: #666">
                        <i class="el-icon-phone" /> {{ scope.row.phones[0].number }}
                        <span v-if="scope.row.phones.length > 1" style="color: #999">
                            +{{ scope.row.phones.length - 1 }}
                        </span>
                    </div>
                </template>
            </el-table-column>
            <el-table-column label="Status" prop="status" width="100" align="center">
                <template slot-scope="scope">
                    <el-tag :type="getStatusType(scope.row.status)" size="mini" effect="light">
                        {{ scope.row.status }}
                    </el-tag>
                </template>
            </el-table-column>
            <el-table-column label="Action" align="center" width="180" class-name="small-padding fixed-width">
                <template slot-scope="scope">
                    <el-button size="mini" type="text" icon="el-icon-edit"
                        @click="handleUpdate(scope.row)">Edit</el-button>
                    <el-button size="mini" type="text" icon="el-icon-delete"
                        @click="handleDelete(scope.row)">Delete</el-button>
                </template>
            </el-table-column>
        </el-table>

        <pagination v-show="total > 0" :total="total" :page.sync="queryParams.page" :limit.sync="queryParams.pageSize"
            @pagination="getList" />

        <el-dialog :title="title" :visible.sync="open" width="780px" append-to-body @close="resetForm">
            <el-form ref="form" :model="form" :rules="rules" label-width="120px" size="small">
                <el-row :gutter="16">
                    <el-col :span="12">
                        <el-form-item label="Store Name" prop="storeName">
                            <el-input v-model="form.storeName" />
                        </el-form-item>
                    </el-col>
                    <el-col :span="12">
                        <el-form-item label="Slug" prop="slug">
                            <el-input v-model="form.slug" placeholder="myfone-repairs-crown" />
                        </el-form-item>
                    </el-col>
                </el-row>

                <el-row :gutter="16">
                    <el-col :span="12">
                        <el-form-item label="Status" prop="status">
                            <el-select v-model="form.status" style="width: 100%">
                                <el-option label="Active" value="active" />
                                <el-option label="Inactive" value="inactive" />
                                <el-option label="Pending" value="pending" />
                            </el-select>
                        </el-form-item>
                    </el-col>
                    <el-col :span="12">
                        <el-form-item label="Google Maps">
                            <el-input v-model="form.googleMapsLink" placeholder="https://maps..." />
                        </el-form-item>
                    </el-col>
                </el-row>

                <el-row :gutter="16">
                    <el-col :span="12">
                        <el-form-item label="Zoho ID">
                            <el-input v-model="form.externalIds.zohoId" />
                        </el-form-item>
                    </el-col>
                    <el-col :span="12">
                        <el-form-item label="RepairDesk ID">
                            <el-input v-model="form.externalIds.repairDeskId" />
                        </el-form-item>
                    </el-col>
                </el-row>

                <el-divider content-position="left">Address</el-divider>

                <el-form-item label="Raw">
                    <el-input v-model="form.address.raw" type="textarea" :rows="2"
                        placeholder="Kiosk 1/8 Whiteman St, Southbank VIC 3006" />
                </el-form-item>
                <el-form-item label="Street">
                    <el-input v-model="form.address.street" />
                </el-form-item>
                <el-row :gutter="16">
                    <el-col :span="10">
                        <el-form-item label="Suburb">
                            <el-input v-model="form.address.suburb" />
                        </el-form-item>
                    </el-col>
                    <el-col :span="7">
                        <el-form-item label="State" label-width="60px">
                            <el-input v-model="form.address.state" />
                        </el-form-item>
                    </el-col>
                    <el-col :span="7">
                        <el-form-item label="Postcode" label-width="90px">
                            <el-input v-model="form.address.postcode" />
                        </el-form-item>
                    </el-col>
                </el-row>

                <el-divider content-position="left">Contacts</el-divider>

                <el-form-item label="Emails">
                    <div v-for="(email, idx) in form.emails" :key="`email-${idx}`" style="margin-bottom: 4px">
                        <el-input v-model="form.emails[idx]" style="width: 360px" />
                        <el-button size="mini" type="text" icon="el-icon-delete"
                            @click="form.emails.splice(idx, 1)" />
                    </div>
                    <el-button size="mini" icon="el-icon-plus" @click="form.emails.push('')">Add email</el-button>
                </el-form-item>

                <el-form-item label="Phones">
                    <div v-for="(phone, idx) in form.phones" :key="`phone-${idx}`" style="margin-bottom: 4px">
                        <el-input v-model="form.phones[idx].name" placeholder="Name" style="width: 140px" />
                        <el-input v-model="form.phones[idx].number" placeholder="Number" style="width: 220px" />
                        <el-button size="mini" type="text" icon="el-icon-delete"
                            @click="form.phones.splice(idx, 1)" />
                    </div>
                    <el-button size="mini" icon="el-icon-plus"
                        @click="form.phones.push({ name: '', number: '' })">Add phone</el-button>
                </el-form-item>

                <el-form-item label="Notes">
                    <el-input v-model="form.notes" type="textarea" :rows="2" />
                </el-form-item>
            </el-form>

            <div slot="footer" class="dialog-footer">
                <el-button type="primary" :loading="submitLoading" @click="submitForm">Save</el-button>
                <el-button @click="open = false">Cancel</el-button>
            </div>
        </el-dialog>
    </div>
</template>

<script>
import { listShops, createShop, updateShop, deleteShop } from '@/api/sqt/shops'

function emptyForm() {
    return {
        _id: null,
        storeName: '',
        slug: '',
        status: 'pending',
        googleMapsLink: '',
        externalIds: { zohoId: '', repairDeskId: '' },
        address: {
            raw: '', street: '', suburb: '', state: '', postcode: '', country: 'Australia'
        },
        emails: [],
        phones: [],
        notes: ''
    }
}

export default {
    name: 'SqtShops',
    data() {
        return {
            showSearch: true,
            loading: false,
            submitLoading: false,
            list: [],
            total: 0,
            queryParams: {
                page: 1,
                pageSize: 20,
                search: '',
                status: ''
            },
            open: false,
            title: '',
            form: emptyForm(),
            rules: {
                storeName: [{ required: true, message: 'Store name is required', trigger: 'blur' }],
                status: [{ required: true, message: 'Status is required', trigger: 'change' }]
            }
        }
    },
    created() {
        this.getList()
    },
    methods: {
        async getList() {
            this.loading = true
            try {
                const params = {
                    page: this.queryParams.page,
                    pageSize: this.queryParams.pageSize
                }
                if (this.queryParams.search) params.search = this.queryParams.search
                if (this.queryParams.status) params.status = this.queryParams.status

                const res = await listShops(params)
                this.list = res.data || []
                this.total = res.totalDocs || 0
            } catch (e) {
                console.error(e)
                this.$message.error('Failed to load shops')
            } finally {
                this.loading = false
            }
        },
        handleQuery() {
            this.queryParams.page = 1
            this.getList()
        },
        resetQuery() {
            this.queryParams = { page: 1, pageSize: 20, search: '', status: '' }
            this.getList()
        },
        handleAdd() {
            this.form = emptyForm()
            this.title = 'Add Shop'
            this.open = true
        },
        handleUpdate(row) {
            this.form = {
                _id: row._id,
                storeName: row.storeName || '',
                slug: row.slug || '',
                status: row.status || 'pending',
                googleMapsLink: row.googleMapsLink || '',
                externalIds: {
                    zohoId: row.externalIds && row.externalIds.zohoId || '',
                    repairDeskId: row.externalIds && row.externalIds.repairDeskId || ''
                },
                address: {
                    raw: row.address && row.address.raw || '',
                    street: row.address && row.address.street || '',
                    suburb: row.address && row.address.suburb || '',
                    state: row.address && row.address.state || '',
                    postcode: row.address && row.address.postcode || '',
                    country: row.address && row.address.country || 'Australia'
                },
                emails: (row.emails || []).slice(),
                phones: (row.phones || []).map(p => ({ name: p.name || '', number: p.number || '' })),
                notes: row.notes || ''
            }
            this.title = 'Edit Shop'
            this.open = true
        },
        async handleDelete(row) {
            try {
                await this.$confirm(`Delete "${row.storeName}"?`, 'Warning', {
                    confirmButtonText: 'Confirm',
                    cancelButtonText: 'Cancel',
                    type: 'warning'
                })
                await deleteShop(row._id)
                this.$message.success('Shop deleted')
                this.getList()
            } catch (e) {
                if (e !== 'cancel') {
                    console.error(e)
                    this.$message.error('Delete failed')
                }
            }
        },
        submitForm() {
            this.$refs.form.validate(async valid => {
                if (!valid) return
                this.submitLoading = true
                try {
                    const payload = { ...this.form }
                    // strip empty email strings
                    payload.emails = payload.emails.filter(e => e && e.trim())
                    payload.phones = payload.phones.filter(p => p.number && p.number.trim())

                    if (this.form._id) {
                        await updateShop(this.form._id, payload)
                        this.$message.success('Shop updated')
                    } else {
                        await createShop(payload)
                        this.$message.success('Shop created')
                    }
                    this.open = false
                    this.getList()
                } catch (e) {
                    console.error(e)
                    const msg = (e.response && e.response.data && e.response.data.message) || 'Save failed'
                    this.$message.error(msg)
                } finally {
                    this.submitLoading = false
                }
            })
        },
        resetForm() {
            this.form = emptyForm()
            this.$nextTick(() => {
                this.$refs.form && this.$refs.form.clearValidate()
            })
        },
        getStatusType(status) {
            switch (status) {
                case 'active': return 'success'
                case 'inactive': return 'danger'
                case 'pending': return 'warning'
                default: return 'info'
            }
        }
    }
}
</script>
