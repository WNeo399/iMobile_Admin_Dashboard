<template>
    <el-dialog
        title="Repair Service Checklist"
        :visible.sync="visible"
        width="900px"
        append-to-body
        :close-on-click-modal="false"
        custom-class="qc-dialog"
        @close="onClose"
    >
        <div class="qc-body">
            <div class="two-col">
                <section class="col">
                    <div class="col-title">Ticket Summary</div>
                    <el-form size="small" label-width="120px">
                        <el-form-item label="Ticket Number">
                            <el-input v-model="form.ticketNumber" />
                        </el-form-item>
                        <el-form-item label="Customer">
                            <el-input v-model="form.customer" />
                        </el-form-item>
                        <el-form-item label="Contact">
                            <el-input v-model="form.contact" />
                        </el-form-item>
                    </el-form>
                </section>
                <section class="col">
                    <div class="col-title">Device Info</div>
                    <el-form size="small" label-width="120px">
                        <el-form-item label="Device">
                            <el-input v-model="form.device.device" />
                        </el-form-item>
                        <el-form-item label="IMEI">
                            <el-input v-model="form.device.imei" />
                        </el-form-item>
                        <el-form-item label="Issue">
                            <el-input v-model="form.device.repairProdItems" />
                        </el-form-item>
                        <el-form-item label="Status">
                            <el-input v-model="form.device.status" />
                        </el-form-item>
                    </el-form>
                </section>
            </div>

            <div class="section-title">Checklist</div>
            <el-table
                :data="form.checkList"
                size="small"
                class="checklist-table"
            >
                <el-table-column label="Task" min-width="160">
                    <template slot-scope="scope">
                        <el-input
                            v-model="scope.row.task"
                            size="mini"
                            placeholder="Task"
                        />
                    </template>
                </el-table-column>
                <el-table-column label="Pre Condition" min-width="160">
                    <template slot-scope="scope">
                        <!-- Charging Port is a free-text condition in the
                             original (because pass/fail isn't expressive
                             enough for ports). Everything else is radios. -->
                        <el-input
                            v-if="scope.row.task === 'Charging Port'"
                            v-model="scope.row.preCondition"
                            size="mini"
                            placeholder="Pre Condition"
                        />
                        <el-radio-group
                            v-else
                            v-model="scope.row.preCondition"
                            size="mini"
                        >
                            <el-radio :label="1">Pass</el-radio>
                            <el-radio :label="2">Fail</el-radio>
                        </el-radio-group>
                    </template>
                </el-table-column>
                <el-table-column label="Post Condition" min-width="160">
                    <template slot-scope="scope">
                        <el-input
                            v-if="scope.row.task === 'Charging Port'"
                            v-model="scope.row.postCondition"
                            size="mini"
                            placeholder="Post Condition"
                        />
                        <el-radio-group
                            v-else
                            v-model="scope.row.postCondition"
                            size="mini"
                        >
                            <el-radio :label="1">Pass</el-radio>
                            <el-radio :label="2">Fail</el-radio>
                        </el-radio-group>
                    </template>
                </el-table-column>
                <el-table-column label="Remarks" min-width="180">
                    <template slot-scope="scope">
                        <el-input
                            v-model="scope.row.remark"
                            type="textarea"
                            :rows="1"
                            size="mini"
                            placeholder="Remarks"
                        />
                    </template>
                </el-table-column>
                <el-table-column label="" align="center" width="60">
                    <template slot-scope="scope">
                        <el-button
                            size="mini"
                            type="text"
                            icon="el-icon-delete"
                            class="row-remove"
                            @click="removeTask(scope.$index)"
                        />
                    </template>
                </el-table-column>
            </el-table>

            <div class="add-task-row">
                <el-button size="mini" type="text" icon="el-icon-plus" @click="addTask">
                    Add task
                </el-button>
            </div>

            <div class="section-title">Final</div>
            <el-form size="small" label-width="120px" class="final-form">
                <el-form-item label="QC by">
                    <el-input v-model="form.qcBy" />
                </el-form-item>
                <el-form-item label="Final QC">
                    <el-input v-model="form.finalStatus" />
                </el-form-item>
                <el-form-item label="Note">
                    <el-input v-model="form.note" type="textarea" :rows="2" />
                </el-form-item>
                <el-form-item label="Date">
                    {{ today }}
                </el-form-item>
            </el-form>
        </div>

        <div slot="footer">
            <el-button @click="visible = false">Cancel</el-button>
            <el-button type="primary" icon="el-icon-printer" :loading="generating" @click="generate">
                Generate Report
            </el-button>
        </div>
    </el-dialog>
</template>

<script>
// jspdf is added as a frontend dep. Note: jspdf doesn't auto-include
// `doc.table` in v3+, so we pin to ^2.5.1 (which still ships it) — the
// original page relies on doc.table. Switch to autotable plugin if you
// ever upgrade to jspdf 3.
import { jsPDF } from 'jspdf'

// Default checklist — same 10 items as the standalone page, in the same
// order. Edit here to change what shows up when the dialog opens fresh.
function defaultCheckList() {
    return [
        { autoNumber: 0, task: 'Power Button',     preCondition: '', postCondition: '', remark: '' },
        { autoNumber: 1, task: 'Volume Buttons',   preCondition: '', postCondition: '', remark: '' },
        { autoNumber: 2, task: 'Home button',      preCondition: '', postCondition: '', remark: '' },
        { autoNumber: 3, task: 'Touch screen',     preCondition: '', postCondition: '', remark: '' },
        { autoNumber: 4, task: 'Display brightness', preCondition: '', postCondition: '', remark: '' },
        { autoNumber: 5, task: 'Charging Port',    preCondition: '', postCondition: '', remark: '' },
        { autoNumber: 6, task: 'Battery Health',   preCondition: '', postCondition: '', remark: '' },
        { autoNumber: 7, task: 'Wifi/Bluetooth',   preCondition: '', postCondition: '', remark: '' },
        { autoNumber: 8, task: 'Face ID',          preCondition: '', postCondition: '', remark: '' },
        { autoNumber: 9, task: 'Back Cover',       preCondition: '', postCondition: '', remark: '' }
    ]
}

function emptyForm() {
    return {
        customer: '',
        contact: '',
        ticketNumber: '',
        device: { device: '', imei: '', status: '', repairProdItems: '' },
        note: '',
        qcBy: '',
        finalStatus: '',
        checkList: defaultCheckList()
    }
}

export default {
    name: 'QCGenerator',
    data() {
        return {
            visible: false,
            generating: false,
            autoNumber: 10,
            form: emptyForm()
        }
    },
    computed: {
        today() {
            const d = new Date()
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec']
            return `${d.getDate()} ${months[d.getMonth()]}, ${d.getFullYear()}`
        }
    },
    methods: {
        // Parent calls this with an optional seed (a device row from
        // TicketDetail or a full ticket from the main table) to pre-fill
        // the form. Passing null opens an empty dialog.
        open(seed) {
            this.form = emptyForm()
            this.autoNumber = 10
            if (seed) {
                // Tolerant seeding — the seed shape varies. Merge top-level
                // simple fields, then drill into `device` if present.
                const next = { ...this.form }
                if (seed.customer) next.customer = seed.customer
                if (seed.contact) next.contact = seed.contact
                if (seed.ticketNumber) next.ticketNumber = seed.ticketNumber
                if (seed.device) {
                    next.device = { ...next.device, ...seed.device }
                }
                this.form = next
            }
            this.visible = true
        },
        onClose() {
            // No-op for now — open() always resets, so leaving the
            // previous values around between close + reopen is harmless.
        },
        addTask() {
            this.form.checkList.push({
                autoNumber: this.autoNumber,
                task: '',
                preCondition: '',
                postCondition: '',
                remark: ''
            })
            this.autoNumber += 1
        },
        removeTask(index) {
            this.form.checkList.splice(index, 1)
        },
        // Map a numeric Pass/Fail to a label, leaving free-text values as
        // is for the Charging-Port row.
        conditionLabel(value) {
            if (value === 1) return 'Pass'
            if (value === 2) return 'Fail'
            return value || ' '
        },
        buildTableData() {
            return this.form.checkList.map(row => ({
                Task: row.task || ' ',
                'Pre Condition': this.conditionLabel(row.preCondition),
                'Post Condition': this.conditionLabel(row.postCondition),
                Remark: row.remark || ' '
            }))
        },
        // PDF generation mirrors the original QCgenerator.js. doc.table is
        // a jsPDF 2.x feature; v3 dropped it, which is why package.json
        // pins to ^2.5.1.
        generate() {
            this.generating = true
            try {
                const doc = new jsPDF()

                doc.setFontSize(28)
                doc.text('Repair Ticket', 130, 25)
                // Logo intentionally omitted — the original loaded
                // /assets/images/icon.png from the standalone project. If
                // you want the iMobile logo here, drop a copy into the
                // frontend's public/ and uncomment the addImage call.
                // doc.addImage('/icon.png', 'JPEG', 15, 20, 32, 15)

                doc.setFontSize(12).setFont(undefined, 'bold')
                doc.text('iMobile Store Pty Ltd', 15, 45)
                doc.setFontSize(10).setFont(undefined, 400)
                doc.text(
                    'ACN 610 947 281\n' +
                    'Shop 12 105 Cochranes Rd\n' +
                    'Moorabbin Victoria 3189\n' +
                    'Bank: Commonwealth Bank\n' +
                    'Acc Name: iMobile Store Pty Ltd\n' +
                    'BSB: 063-581 Account No.: 10506295',
                    15, 50
                )

                doc.setFontSize(12).setFont(undefined, 400)
                doc.text(
                    `Job Number: ${this.form.ticketNumber}\n` +
                    `Customer: ${this.form.customer}\n` +
                    `Device: ${this.form.device.device}\n` +
                    `IMEI: ${this.form.device.imei}\n` +
                    `Issue: ${this.form.device.repairProdItems}`,
                    130, 32, '', '', 'left'
                )

                doc.setFontSize(20).setFont(undefined, 'bold')
                doc.text('Repair Checklist', 70, 85, '', '', 'center')

                const headers = ['Task', 'Pre Condition', 'Post Condition', 'Remark'].map(k => ({
                    id: k, name: k, prompt: k, width: 65, align: 'center', padding: 0
                }))
                const tableData = this.buildTableData()
                doc.table(8, 90, tableData, headers, {
                    headerBackgroundColor: '#fff',
                    padding: 2
                })

                const noteStr = doc.splitTextToSize(this.form.note || '', 75)
                const textY = 110 + tableData.length * 9 + 40
                doc.text('Note: ', 15, textY)
                doc.text(noteStr, 28, textY)
                doc.text(
                    `Checked By: ${this.form.qcBy}\n` +
                    `Final Result: ${this.form.finalStatus}\n` +
                    `Date: ${this.today}`,
                    145, textY, '', '', 'right'
                )

                doc.autoPrint()
                window.open(doc.output('bloburl'), '_blank')
            } catch (e) {
                console.error('QC PDF generation failed:', e)
                this.$message.error('Failed to generate PDF: ' + (e.message || e))
            } finally {
                this.generating = false
            }
        }
    }
}
</script>

<style scoped>
.qc-body {
    max-height: 70vh;
    overflow-y: auto;
    padding-right: 4px;
}
.two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
    margin-bottom: 8px;
}
.col-title {
    font-size: 15px;
    font-weight: 600;
    color: #111827;
    margin-bottom: 8px;
}
.section-title {
    font-size: 15px;
    font-weight: 600;
    color: #111827;
    margin: 12px 0 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid #ebeef5;
}
.checklist-table {
    border: 1px solid #ebeef5;
    border-radius: 6px;
}
.add-task-row {
    text-align: center;
    padding: 6px 0 4px;
}
.final-form {
    max-width: 480px;
}
.row-remove {
    color: #c0c4cc;
    padding: 4px !important;
}
.row-remove:hover {
    color: #f56c6c;
}
</style>

<style>
.qc-dialog .el-dialog__body {
    padding: 12px 24px;
}
</style>
