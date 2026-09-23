<template>
    <div class="category-item">
        <!-- Header — also the handle that drags the whole folder -->
        <div class="category-title entry-handle" @click="toggleExpand">
            <div class="category-left">
                <i class="el-icon-caret-right expand-icon" :class="{
                    expanded: category.expanded !== false
                }" />
                <i class="el-icon-folder folder-icon" />
                <span>{{ category.title }}</span>
            </div>
        </div>

        <!-- One list: the folder's collections and sub-folders in the order
             the tree shows them, so a collection can sit between two
             folders. Anything drags anywhere inside it or into another
             folder (a collection never lands at the top level). -->
        <div v-show="category.expanded !== false">
            <draggable v-model="category.entries" :group="{ name: 'entries', pull: true, put: true }"
                handle=".entry-handle" class="entry-list" :move="checkMove" @add="handleAdd">
                <div v-for="entry in category.entries" :key="entry._id"
                    :class="['entry', isFolder(entry) ? 'folder-entry' : 'collection-entry']">
                    <CategoryNode v-if="isFolder(entry)" :category="entry" @duplicate="$emit('duplicate')" />
                    <div v-else class="child-item entry-handle">
                        <div>
                            <span>{{ entry.title }}</span>
                            <template v-if="entry.note">
                                <br>
                                <span class="child-note">{{ entry.note }}</span>
                            </template>
                        </div>
                    </div>
                </div>
            </draggable>
        </div>
    </div>
</template>

<script>
import draggable from 'vuedraggable'
import { isFolderEntry } from '@/utils/collectionGroupOrder'

export default {
    name: 'CategoryNode',

    components: {
        draggable
    },

    props: {
        // The dialog's working shape: { _id, title, expanded, entries: [...] }
        category: {
            type: Object,
            required: true
        }
    },

    methods: {
        isFolder: isFolderEntry,

        toggleExpand() {
            this.$set(
                this.category,
                'expanded',
                this.category.expanded === false
            )
        },

        // Reorder freely; into another folder only if that folder doesn't
        // already hold the same collection.
        checkMove(evt) {
            if (evt.from === evt.to) return true
            const dragged = evt.draggedContext.element
            if (isFolderEntry(dragged)) return true
            const target = evt.relatedContext.list || []
            return !target.some(item => !isFolderEntry(item) && String(item._id) === String(dragged._id))
        },

        handleAdd(evt) {
            const added = this.category.entries[evt.newIndex]
            if (!added || isFolderEntry(added)) return
            const count = this.category.entries.filter(item => String(item._id) === String(added._id)).length
            if (count > 1) {
                this.category.entries.splice(evt.newIndex, 1)
                this.$emit('duplicate')
            }
        }
    }
}
</script>

<style scoped>
.category-item {
    margin-bottom: 8px;
}

.category-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 9px 12px;
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

.folder-icon {
    color: #e6a23c;
}

.expand-icon {
    transition: 0.2s;
}

.expand-icon.expanded {
    transform: rotate(90deg);
}

/* the folder's contents; kept tall enough when empty to drop into */
.entry-list {
    min-height: 36px;
    margin: 8px 0 0 24px;
    padding: 0 0 0 12px;
    border-left: 1px dashed #dcdfe6;
}

.entry {
    margin-bottom: 8px;
}

.entry.folder-entry > .category-item {
    margin-bottom: 0;
}

.child-item {
    display: flex;
    align-items: center;
    gap: 10px;
    justify-content: space-between;
    padding: 9px 12px;
    border: 1px solid #dcdfe6;
    border-radius: 6px;
    background: #f8fafc;
    cursor: move;
}

.child-item:hover {
    background: #ecf5ff;
    border-color: #409eff;
}

.child-note {
    color: #c0c4cc;
    font-size: 12px;
}
</style>
