<template>
    <!--
        Add a note to a RepairDesk ticket (user 2026-10-27). Opened from a
        row's Note action or the Detail dialog; emits `saved` with the
        ticket id so an open Detail dialog can re-read it.
    -->
    <el-dialog
        :title="ticket ? `Add note — ticket ${ticket.ticketNumber}` : 'Add note'"
        :visible.sync="visible"
        width="520px"
        append-to-body
        :close-on-click-modal="false"
        @closed="reset"
    >
        <el-form label-width="90px" size="small" @submit.native.prevent>
            <el-form-item label="Type">
                <el-radio-group v-model="type">
                    <el-radio-button label="internal">Internal</el-radio-button>
                    <el-radio-button label="diagnostic">Diagnostic</el-radio-button>
                </el-radio-group>
            </el-form-item>
            <!-- RepairDesk can tie a note to one device line -->
            <el-form-item v-if="devices.length > 1" label="Device">
                <el-select v-model="deviceId" class="note-device">
                    <el-option label="Whole ticket" value="" />
                    <el-option
                        v-for="d in devices"
                        :key="d.id"
                        :label="deviceLabel(d)"
                        :value="String(d.id)"
                    />
                </el-select>
            </el-form-item>
            <el-form-item label="Note">
                <el-input
                    ref="noteInput"
                    v-model="note"
                    type="textarea"
                    :rows="5"
                    :maxlength="2000"
                    show-word-limit
                    placeholder="Write the note"
                />
            </el-form-item>
            <el-form-item>
                <el-checkbox v-model="flag">Flag this note</el-checkbox>
                <div class="note-hint">
                    Saved to RepairDesk, signed “— {{ username }} (iMobile dashboard)”.
                </div>
            </el-form-item>
        </el-form>
        <div slot="footer">
            <el-button size="small" @click="visible = false">Cancel</el-button>
            <el-button
                size="small"
                type="primary"
                :loading="saving"
                :disabled="!note.trim()"
                @click="save"
            >Add note</el-button>
        </div>
    </el-dialog>
</template>

<script>
import { addRepairTicketNote } from '@/api/repair/tickets'

export default {
    name: 'NoteDialog',
    data() {
        return {
            visible: false,
            saving: false,
            // { id, ticketNumber, devices }
            ticket: null,
            type: 'internal',
            deviceId: '',
            note: '',
            flag: false
        }
    },
    computed: {
        devices() {
            return (this.ticket && this.ticket.devices) || []
        },
        username() {
            return this.$store.getters.name || 'you'
        }
    },
    methods: {
        open(ticket, deviceId) {
            this.reset()
            this.ticket = ticket
            this.deviceId = deviceId ? String(deviceId) : ''
            this.visible = true
            this.$nextTick(() => this.$refs.noteInput && this.$refs.noteInput.focus())
        },
        reset() {
            this.type = 'internal'
            this.deviceId = ''
            this.note = ''
            this.flag = false
            this.saving = false
        },
        deviceLabel(d) {
            const name = (d.device && d.device.name) || d.name || `Line ${d.id}`
            const status = d.status && d.status.name
            return status ? `${name} (${status})` : name
        },
        async save() {
            const note = this.note.trim()
            if (!note || this.saving) return
            this.saving = true
            try {
                await addRepairTicketNote(this.ticket.id, {
                    note,
                    type: this.type,
                    deviceId: this.deviceId || undefined,
                    flag: this.flag
                })
                this.$message.success(`Note added to ticket ${this.ticket.ticketNumber}`)
                this.$emit('saved', { id: this.ticket.id })
                this.visible = false
            } catch (e) {
                // the request helper has already shown the server's message
                console.warn('Add note failed:', e)
            } finally {
                this.saving = false
            }
        }
    }
}
</script>

<style scoped>
.note-device {
    width: 100%;
}
.note-hint {
    color: #909399;
    font-size: 12px;
    line-height: 1.5;
    margin-top: 4px;
}
</style>
