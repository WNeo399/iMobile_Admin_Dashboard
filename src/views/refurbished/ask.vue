<template>
    <div class="ask-page">
        <div class="ask-head">
            <div>
                <div class="ask-title"><i class="el-icon-chat-line-round" /> AI Agent</div>
                <div class="ask-sub">Ask about the Reebelo / JB market data in plain English — Claude writes and runs the SQL.</div>
            </div>
            <el-button size="small" icon="el-icon-delete" @click="clearChat">Clear</el-button>
        </div>
        <ai-chat ref="chat" class="ask-chat" />
    </div>
</template>

<script>
import AiChat from '@/components/AiChat'

export default {
    name: 'RefurbishedAsk',
    components: { AiChat },
    methods: {
        clearChat() {
            if (this.$refs.chat) this.$refs.chat.clear()
        }
    }
}
</script>

<style lang="scss" scoped>
.ask-page {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 84px);
    padding: 12px 16px;
    background: #fff;
}
.ask-head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 10px; }
.ask-title { font-size: 16px; font-weight: 600; color: #303133; i { color: #409eff; } }
.ask-sub { font-size: 12px; color: #909399; margin-top: 3px; }
.ask-chat { flex: 1; min-height: 0; }
</style>
