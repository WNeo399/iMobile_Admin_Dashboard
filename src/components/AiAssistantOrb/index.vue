<template>
    <div class="ai-orb-root">
        <transition name="ai-pop">
            <div v-show="open" class="ai-panel">
                <div class="ai-panel-head">
                    <span class="ai-panel-title"><i class="el-icon-magic-stick" /> Ask the Data</span>
                    <span class="ai-panel-actions">
                        <i class="el-icon-delete" title="Clear conversation" @click="clearChat" />
                        <i class="el-icon-close" title="Close" @click="open = false" />
                    </span>
                </div>
                <div class="ai-panel-body">
                    <ai-chat ref="chat" :rows="2" />
                </div>
            </div>
        </transition>

        <button class="ai-orb" :class="{ open }" :title="open ? 'Close assistant' : 'Ask the Data AI'" @click="toggle">
            <i :class="open ? 'el-icon-close' : 'el-icon-chat-dot-round'" />
        </button>
    </div>
</template>

<script>
import AiChat from '@/components/AiChat'

export default {
    name: 'AiAssistantOrb',
    components: { AiChat },
    data() {
        return { open: false }
    },
    methods: {
        toggle() {
            this.open = !this.open
        },
        clearChat() {
            if (this.$refs.chat) this.$refs.chat.clear()
        }
    }
}
</script>

<style lang="scss" scoped>
.ai-orb-root { position: fixed; right: 24px; bottom: 24px; z-index: 1030; }

/* The floating orb button */
.ai-orb {
    position: absolute;
    right: 0;
    bottom: 0;
    width: 56px;
    height: 56px;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    color: #fff;
    font-size: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #409eff 0%, #7b5cff 100%);
    box-shadow: 0 6px 18px rgba(64, 100, 255, 0.45);
    transition: transform 0.18s ease, box-shadow 0.18s ease;
    animation: ai-orb-pulse 2.6s ease-in-out infinite;
}
.ai-orb:hover { transform: scale(1.08); box-shadow: 0 8px 24px rgba(64, 100, 255, 0.55); }
.ai-orb:active { transform: scale(0.96); }
.ai-orb.open { animation: none; background: linear-gradient(135deg, #909399 0%, #606266 100%); box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3); }

@keyframes ai-orb-pulse {
    0%, 100% { box-shadow: 0 6px 18px rgba(64, 100, 255, 0.45); }
    50% { box-shadow: 0 6px 18px rgba(64, 100, 255, 0.45), 0 0 0 8px rgba(123, 92, 255, 0.12); }
}

/* The chat panel that floats above the orb */
.ai-panel {
    position: absolute;
    right: 0;
    bottom: 70px;
    width: 400px;
    height: 600px;
    max-height: calc(100vh - 120px);
    display: flex;
    flex-direction: column;
    background: #fff;
    border: 1px solid #e4e7ed;
    border-radius: 12px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
    overflow: hidden;
}
.ai-panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    color: #fff;
    background: linear-gradient(135deg, #409eff 0%, #7b5cff 100%);
    flex-shrink: 0;
}
.ai-panel-title { font-size: 14px; font-weight: 600; i { margin-right: 5px; } }
.ai-panel-actions i { cursor: pointer; margin-left: 12px; font-size: 15px; opacity: 0.85; }
.ai-panel-actions i:hover { opacity: 1; }
.ai-panel-body { flex: 1; min-height: 0; padding: 10px 12px 12px; display: flex; }
.ai-panel-body ::v-deep .ai-chat { flex: 1; }

/* open/close transition */
.ai-pop-enter-active, .ai-pop-leave-active { transition: opacity 0.18s ease, transform 0.18s ease; transform-origin: bottom right; }
.ai-pop-enter, .ai-pop-leave-to { opacity: 0; transform: translateY(10px) scale(0.96); }

@media (max-width: 600px) {
    .ai-orb-root { right: 16px; bottom: 16px; }
    .ai-panel { width: calc(100vw - 32px); height: 70vh; }
}
</style>
