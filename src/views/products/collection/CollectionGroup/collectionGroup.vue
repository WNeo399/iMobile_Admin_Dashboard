<template>
  <!-- Rearrangement only: category structure and order. Creating /
       placing collections is handled by the tree's ⋯ menus on Stock
       Monitoring, so the old drag-source Collection panel is gone —
       collections can still be dragged BETWEEN categories here. -->
  <el-dialog title="Manage Category" :visible="visible" width="560px" @close="handleClose" :close-on-click-modal="false">
    <div class="collection-dialog">
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Category</div>
        </div>

        <!-- Top level: folders only (a collection dragged here is refused). -->
        <draggable v-model="categories" :group="{ name: 'entries', pull: true, put: acceptsAtRoot }" handle=".entry-handle" class="category-list">
          <CategoryNode
            v-for="category in categories"
            :key="category._id"
            :category="category"
            @duplicate="showDuplicateMessage"
          />
        </draggable>
      </div>
    </div>

    <span slot="footer">
      <el-button @click="handleClose">Cancel</el-button>
      <el-button type="primary" @click="handleSave">Save</el-button>
    </span>
  </el-dialog>
</template>


<script>
import draggable from 'vuedraggable'
import CategoryNode from './categoryNode.vue'
import { getCollectionGroups, updateCollectionGroups } from '../../../../api/zoho/products/collection'
import { toEditable, fromEditable } from '@/utils/collectionGroupOrder'

export default {
  name: 'CollectionCategoryDialog',

  components: {
    draggable,
    CategoryNode
  },

  props: {
    visible: {
      type: Boolean,
      default: false
    },
    // '' = Spare Parts set (default), 'accessories' = the Accessories
    // set. Forwarded to the collection API helpers so this dialog
    // manages the right group tree.
    scope: {
      type: String,
      default: ''
    }
  },

  data() {
    return {
      categories: []
    }
  },

  watch: {
    visible(val) {
      if (val) {
        this.fetchData()
      }
    }
  },

  methods: {
    async fetchData() {
      try {
        const gruop = await getCollectionGroups(this.scope)
        // one mixed list per folder, in the order the tree shows it
        this.categories = (gruop.data || []).map(toEditable)
      } catch (err) {
        console.error(err)
        this.$message.error('Failed to fetch categories')
      }
    },

    // Only a folder may be dropped at the top level.
    acceptsAtRoot(to, from, dragEl) {
      return !!dragEl && (dragEl.classList.contains('folder-entry') || dragEl.classList.contains('category-item'))
    },

    showDuplicateMessage() {
      this.$message.warning(
        'This collection already exists in this category'
      )
    },

    handleClose() {
      this.$emit('update:visible', false)
    },

async handleSave() {
  try {
    const groups = this.categories.map(fromEditable)
    await updateCollectionGroups(groups, this.scope)

    this.$message.success(
      'Groups updated successfully'
    )

    this.$emit('save', groups)

    this.handleClose()
  } catch (err) {
    console.error(err)

    this.$message.error(
      'Failed to update groups'
    )
  }
}
  }
}
</script>

<style scoped>
.collection-dialog {
  display: block;
}

.panel {
  min-height: 500px;
  padding: 16px;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  background: #fff;
  max-height: 70vh;
  overflow-y: scroll;
}
.collection-search {
  margin: 12px 0;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.panel-title {
  font-weight: 600;
  font-size: 16px;
}

.drag-item {
  padding: 9px 12px;
  margin-bottom: 8px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  background: #fff;
  cursor: move;
}

.drag-item:hover {
  background: #ecf5ff;
  border-color: #409eff;
}
</style>