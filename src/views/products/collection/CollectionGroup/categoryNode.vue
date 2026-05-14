<template>
    <div class="category-item">
        <!-- Header -->
        <div class="category-title" @click="toggleExpand">
            <div class="category-left">
                <i class="el-icon-caret-right expand-icon" :class="{
                    expanded: category.expanded !== false
                }" />

                <span>{{ category.title }}</span>
            </div>

            <div class="category-actions" @click.stop>
                <el-button type="text" size="mini" @click="$emit('add-sub-category', category)">
                    Add Sub
                </el-button>

                <el-button type="text" size="mini" class="remove-btn" @click="$emit('remove-category', category)">
                    Remove
                </el-button>
            </div>
        </div>

        <!-- Expand -->
        <div v-show="category.expanded !== false">
            <!-- Collections -->
            <draggable v-model="category.collections" :group="{ name: 'collection', pull: true, put: true }"
                class="children-list" handle=".child-item" :move="checkMove" @add="handleAdd">
                <div v-for="child in category.collections" :key="child._id" class="child-item">
               <div>     <span>{{ child.title }}</span>
                    <br>
                    <span style="color:#ccc">{{ child.note }}</span></div>

                    <el-button type="text" size="mini" class="remove-btn" @click.stop="
                        $emit(
                            'remove-collection',
                            category,
                            child._id
                        )
                        ">
                        Remove
                    </el-button>
                </div>
            </draggable>

            <!-- Sub Categories -->
            <draggable v-model="category.children" group="category-sort" handle=".category-title"
                class="sub-category-list">
                <CategoryNode v-for="sub in category.children" :key="sub._id" :category="sub" @add-sub-category="
                    $emit('add-sub-category', $event)
                    " @remove-category="
            $emit('remove-category', $event)
            " @remove-collection="
            $emit('remove-collection', ...arguments)
            " @duplicate="$emit('duplicate')" />
            </draggable>
        </div>
    </div>
</template>

<script>
import draggable from 'vuedraggable'

export default {
    name: 'CategoryNode',

    components: {
        draggable
    },

    props: {
        category: {
            type: Object,
            required: true
        }
    },

    methods: {
        toggleExpand() {
            this.$set(
                this.category,
                'expanded',
                this.category.expanded === false
            )
        },

        checkMove(evt) {
            // Allow reorder inside the same list
            if (evt.from === evt.to) {
                return true
            }

            const draggedItem = evt.draggedContext.element
            const targetList = evt.relatedContext.list || []

            return !targetList.some(item => item._id === draggedItem._id)
        },

        handleAdd(evt) {
            const addedItem =
                this.category.collections[
                evt.newIndex
                ]

            const count =
                this.category.collections.filter(
                    item => item._id === addedItem._id
                ).length

            if (count > 1) {
                this.category.collections.splice(
                    evt.newIndex,
                    1
                )

                this.$emit('duplicate')
            }
        }
    }
}
</script>

<style scoped>
.category-item {
    margin-bottom: 12px;
}

.category-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 9px 12px;
    margin-bottom: 8px;
    border: 1px solid #dcdfe6;
    border-radius: 6px;
    background: #fff;
    cursor: move;
}

.category-title:hover {
    background: #ecf5ff;
    border-color: #409eff;
}

.category-left {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
}

.expand-icon {
    transition: 0.2s;
}

.expand-icon.expanded {
    transform: rotate(90deg);
}

.category-actions {
    display: flex;
    gap: 8px;
}

.children-list {
    min-height: 42px;
    margin-left: 24px;
    padding: 10px 10px 2px;
    border-left: 1px dashed #dcdfe6;
}

.child-item {
    display: flex;
    align-items: center;
    gap: 10px;
    justify-content: space-between;
    padding: 9px 12px;
    margin-bottom: 8px;
    border: 1px solid #dcdfe6;
    border-radius: 6px;
    background: #f8fafc;
    cursor: move;
}

.child-item:hover {
    background: #ecf5ff;
    border-color: #409eff;
}

.sub-category-list {
    margin-left: 24px;
    padding-left: 12px;
    border-left: 1px dashed #dcdfe6;
}

.remove-btn {
    color: #f56c6c;
}
</style>