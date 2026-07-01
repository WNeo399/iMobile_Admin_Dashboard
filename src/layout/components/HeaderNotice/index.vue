<template>
  <div>
    <el-popover ref="noticePopover" placement="bottom-end" width="360" trigger="manual" :value="noticeVisible" popper-class="notice-popover">
      <div class="notice-header">
        <span class="notice-title">Notifications</span>
        <span v-if="noticeList.length" class="notice-mark-all" @click.stop="markAllRead">Mark all read</span>
      </div>
      <div v-if="noticeLoading" class="notice-loading"><i class="el-icon-loading"></i> Loading…</div>
      <div v-else-if="noticeList.length === 0" class="notice-empty"><i class="el-icon-bell"></i><br>No notifications yet</div>
      <div v-else class="notice-scroll">
        <div v-for="n in noticeList" :key="n._id" class="notice-item" :class="{ 'is-read': n.read }" @click="onItemClick(n)">
          <div class="notice-icon"><i :class="iconFor(n.type)" /></div>
          <div class="notice-body">
            <div class="notice-msg">{{ n.message }}</div>
            <div class="notice-time">{{ formatTime(n.createdAt) }}</div>
          </div>
          <span v-if="!n.read" class="notice-dot" />
        </div>
      </div>
    </el-popover>

    <div v-popover:noticePopover class="right-menu-item hover-effect notice-trigger" @mouseenter="onNoticeEnter" @mouseleave="onNoticeLeave">
      <svg-icon icon-class="bell" />
      <span v-if="unreadCount > 0" class="notice-badge">{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
    </div>
  </div>
</template>

<script>
import {
  getTopNotifications,
  markNotificationRead,
  markAllNotificationsRead
} from '@/api/notification'

// How often the bell polls for new notifications.
const POLL_MS = 2 * 60 * 1000

// Per-type rendering: which icon to show and where clicking should go.
// Adding a new notification type is just another entry here.
const caseRoute = (n) => (n.data && n.data.sqtCaseId)
  ? { path: '/sqt/cases', query: { openCase: n.data.sqtCaseId } }
  : null
const TYPE_META = {
  sqt_new_case: { icon: 'el-icon-folder-add', route: caseRoute },
  sqt_waiting_for_parts: { icon: 'el-icon-box', route: caseRoute },
  sqt_require_extra_parts: { icon: 'el-icon-circle-plus', route: caseRoute },
  sqt_return_required: {
    icon: 'el-icon-refresh-left',
    route: (n) => (n.data && n.data.sqtCaseId)
      ? { path: '/sqt/cases', query: { openCase: n.data.sqtCaseId, tab: 'returns' } }
      : null
  },
  svp_enquiry_new: {
    icon: 'el-icon-chat-dot-round',
    route: () => ({ path: '/imobile/svp/enquiries' })
  }
}
const DEFAULT_ICON = 'el-icon-message-solid'

export default {
  name: 'HeaderNotice',
  data() {
    return {
      noticeList: [],
      unreadCount: 0,
      noticeLoading: false,
      noticeVisible: false,
      noticeLeaveTimer: null,
      pollTimer: null,
      lastSeenAt: null // ms timestamp of the newest notification we've shown
    }
  },
  mounted() {
    // Baseline load (no toast for pre-existing items), then start polling.
    this.refresh({ baseline: true })
    this.pollTimer = setInterval(() => this.refresh({}), POLL_MS)
  },
  beforeDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer)
    clearTimeout(this.noticeLeaveTimer)
  },
  methods: {
    iconFor(type) {
      return (TYPE_META[type] && TYPE_META[type].icon) || DEFAULT_ICON
    },
    formatTime(v) {
      if (!v) return ''
      const d = new Date(v)
      if (isNaN(d.getTime())) return ''
      return d.toLocaleString('en-AU', {
        timeZone: 'Australia/Melbourne',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
      })
    },
    // Fetch the latest. baseline = set the "seen" mark without toasting;
    // silent = refresh the list (e.g. on open) without toasting.
    async refresh({ baseline = false, silent = false } = {}) {
      let res
      try {
        res = await getTopNotifications(15)
      } catch (e) {
        return
      }
      if (!res || res.success === false) return
      const list = res.list || []
      this.noticeList = list
      this.unreadCount = res.unreadCount != null ? res.unreadCount : list.filter(n => !n.read).length
      const newestNow = list.length ? new Date(list[0].createdAt).getTime() : 0
      if (!baseline && !silent && this.lastSeenAt != null) {
        const fresh = list.filter(n => new Date(n.createdAt).getTime() > this.lastSeenAt && !n.read)
        if (fresh.length) this.toastNew(fresh)
      }
      if (baseline) this.lastSeenAt = newestNow
      else if (newestNow > (this.lastSeenAt || 0)) this.lastSeenAt = newestNow
    },
    toastNew(fresh) {
      if (fresh.length === 1) {
        const n = fresh[0]
        this.$notify({
          title: n.title || 'New notification',
          message: n.message,
          type: 'info',
          duration: 8000,
          onClick: () => this.go(n)
        })
      } else {
        this.$notify({
          title: 'New notifications',
          message: `You have ${fresh.length} new notifications.`,
          type: 'info',
          duration: 8000,
          onClick: () => { this.noticeVisible = true }
        })
      }
    },
    go(n) {
      const meta = TYPE_META[n.type]
      const loc = meta && meta.route ? meta.route(n) : null
      if (!loc) return
      // Append a changing refresh nonce so re-clicking a notification always
      // counts as a navigation — even when the target's openCase query is
      // unchanged or went stale after switching cases in-page.
      const target = { ...loc, query: { ...(loc.query || {}), _r: Date.now().toString(36) } }
      this.$router.push(target).catch(() => {})
    },
    onItemClick(n) {
      if (!n.read) this.markOneRead(n)
      this.noticeVisible = false
      this.go(n)
    },
    markOneRead(n) {
      markNotificationRead(n._id).catch(() => {})
      const idx = this.noticeList.indexOf(n)
      if (idx !== -1) this.$set(this.noticeList, idx, { ...n, read: true })
      this.unreadCount = Math.max(0, this.unreadCount - 1)
    },
    markAllRead() {
      if (!this.noticeList.length) return
      markAllNotificationsRead().catch(() => {})
      this.noticeList = this.noticeList.map(n => ({ ...n, read: true }))
      this.unreadCount = 0
    },
    onNoticeEnter() {
      clearTimeout(this.noticeLeaveTimer)
      this.noticeVisible = true
      if (!this.noticeList.length) this.noticeLoading = true
      this.refresh({ silent: true }).finally(() => { this.noticeLoading = false })
      this.$nextTick(() => {
        const popper = this.$refs.noticePopover.$refs.popper
        if (popper && !popper._noticeBound) {
          popper._noticeBound = true
          popper.addEventListener('mouseenter', () => clearTimeout(this.noticeLeaveTimer))
          popper.addEventListener('mouseleave', () => {
            this.noticeLeaveTimer = setTimeout(() => { this.noticeVisible = false }, 100)
          })
        }
      })
    },
    onNoticeLeave() {
      this.noticeLeaveTimer = setTimeout(() => { this.noticeVisible = false }, 150)
    }
  }
}
</script>

<style lang="scss" scoped>
.notice-trigger {
  position: relative;
  transform: translateX(-6px);
  .svg-icon { width: 1.2em; height: 1.2em; vertical-align: -0.2em; }
  .notice-badge {
    position: absolute;
    top: 7px;
    right: -3px;
    background: #f56c6c;
    color: #fff;
    border-radius: 10px;
    font-size: 10px;
    height: 16px;
    line-height: 16px;
    padding: 0 4px;
    min-width: 16px;
    text-align: center;
    white-space: nowrap;
    pointer-events: none;
  }
}
.notice-popover {
  padding: 0 !important;
}
.notice-popover .notice-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 14px;
  background: #f7f9fb;
  border-bottom: 1px solid #eee;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}
.notice-popover .notice-mark-all {
  font-size: 12px;
  color: #409EFF;
  font-weight: normal;
  cursor: pointer;
}
.notice-popover .notice-mark-all:hover { color: #2b7cc1; }
.notice-popover .notice-loading,
.notice-popover .notice-empty {
  padding: 28px;
  text-align: center;
  color: #bbb;
  font-size: 13px;
  line-height: 2;
}
.notice-popover .notice-empty i { font-size: 26px; }
.notice-popover .notice-scroll {
  max-height: 420px;
  overflow-y: auto;
}
.notice-popover .notice-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid #f3f4f6;
  cursor: pointer;
  transition: background 0.15s;
}
.notice-popover .notice-item:last-child { border-bottom: none; }
.notice-popover .notice-item:hover { background: #f7f9fb; }
.notice-popover .notice-icon {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: #ecf5ff;
  color: #409EFF;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
}
.notice-popover .notice-item.is-read .notice-icon { background: #f4f4f5; color: #c0c4cc; }
.notice-popover .notice-body { flex: 1; min-width: 0; }
.notice-popover .notice-msg {
  font-size: 13px;
  color: #303133;
  line-height: 1.45;
  word-break: break-word;
}
.notice-popover .notice-item.is-read .notice-msg { color: #909399; }
.notice-popover .notice-time {
  margin-top: 4px;
  font-size: 11px;
  color: #c0c4cc;
}
.notice-popover .notice-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #409EFF;
  margin-top: 6px;
}
</style>
