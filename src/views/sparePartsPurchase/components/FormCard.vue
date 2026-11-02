<template>
    <!-- One card of Listing's product dialogs (user's design 2026-11-02): its
         icon, title and a line under it; `hint` is the longer explanation, on hover -->
    <section class="fc">
        <div class="fc-head" :title="hint">
            <span class="fc-icon"><line-icon :name="icon" /></span>
            <div class="fc-text">
                <div class="fc-title">{{ title }}<span v-if="count" class="fc-n">{{ count }}</span><slot name="title" /></div>
                <div v-if="sub" class="fc-sub">{{ sub }}</div>
            </div>
        </div>
        <slot />
    </section>
</template>

<script>
import LineIcon from './LineIcon'

export default {
    name: 'FormCard',
    components: { LineIcon },
    props: {
        icon: { type: String, required: true },
        title: { type: String, required: true },
        sub: { type: String, default: '' },
        hint: { type: String, default: '' },
        count: { type: Number, default: 0 }
    }
}
</script>

<style lang="scss" scoped>
.fc { min-width: 0; padding: 10px 14px 12px; border: 1px solid #e3e8f1; border-radius: 12px; background: #fff; }
.fc-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.fc-icon {
    flex: none; width: 32px; height: 32px; border-radius: 9px; background: #e8f2ff; color: #1890ff;
    display: flex; align-items: center; justify-content: center; font-size: 17px;
}
.fc-text { flex: 1; min-width: 0; }
.fc-title { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 700; line-height: 20px; color: #10213f; }
.fc-n { padding: 0 8px; border-radius: 10px; background: #eef1f6; color: #3b4a63; font-size: 12px; font-weight: 500; line-height: 20px; }
.fc-sub { margin-top: 1px; font-size: 12px; line-height: 16px; color: #66758c; }
</style>
