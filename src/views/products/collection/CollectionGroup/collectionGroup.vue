<template>
  <el-dialog title="Manage Category" :visible="visible" width="900px" @close="handleClose" :close-on-click-modal="false">
    <div class="collection-dialog">
      <!-- Left -->
      <div class="panel">
        <div class="panel-title">Collection</div>

        <el-input
          v-model="collectionSearch"
          size="small"
          clearable
          placeholder="Search collection by title"
          class="collection-search"
        />

        <draggable
          v-model="filteredCollections"
          :group="{ name: 'collection', pull: 'clone', put: false }"
          :sort="false"
          class="drag-list"
        >
          <div v-for="item in filteredCollections" :key="item._id" class="drag-item">
            {{ item.title }}
            <p style="color: #ccc">{{ item.note }}</p>
          </div>
        </draggable>
      </div>

      <!-- Right -->
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Category</div>

          <el-button size="mini" type="primary" @click="addRootCategory">
            Add Category
          </el-button>
        </div>

        <draggable v-model="categories" group="category-sort" handle=".category-title" class="category-list">
          <CategoryNode
            v-for="category in categories"
            :key="category._id"
            :category="category"
            @add-sub-category="addSubCategory"
            @remove-category="removeCategory"
            @remove-collection="removeCollection"
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
import { getCollectionList, getCollectionGroups , updateCollectionGroups } from '../../../../api/zoho/products/collection'

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
    }
  },

  data() {
    return {
      collectionSearch: '',

      collections: [],

      categories: [
  
      ]
    }
  },

  computed: {
    filteredCollections: {
      get() {
        const keyword = this.collectionSearch
          .trim()
          .toLowerCase()

        if (!keyword) {
          return this.collections
        }

        return this.collections.filter(item =>
          String(item.title || '')
            .toLowerCase()
            .includes(keyword)
        )
      },

      // draggable requires setter
      set() {}
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
        const res = await getCollectionList({
          pageNum: 1,
          pageSize: 999
        })

        this.collections = res.data || []

        const gruop = await getCollectionGroups()
        this.categories = gruop.data
      } catch (err) {
        console.error(err)
        this.$message.error('Failed to fetch collections')
      }
    },

    createCategory(title) {
      return {
        _id:
          'cat-' +
          Date.now() +
          '-' +
          Math.random().toString(36).slice(2),

        title,
        expanded: true,
        collections: [],
        children: []
      }
    },

    addRootCategory() {
      this.$prompt('Category name', 'Add Category', {
        confirmButtonText: 'Add',
        cancelButtonText: 'Cancel'
      }).then(({ value }) => {
        if (!value) return

        this.categories.push(
          this.createCategory(value)
        )
      })
    },

    addSubCategory(parentCategory) {
      this.$prompt('Sub category name', 'Add Sub Category', {
        confirmButtonText: 'Add',
        cancelButtonText: 'Cancel'
      }).then(({ value }) => {
        if (!value) return

        parentCategory.children.push(
          this.createCategory(value)
        )
      })
    },

    removeCategory(category) {
      const removeFromTree = list => {
        const index = list.findIndex(
          item => item._id === category._id
        )

        if (index !== -1) {
          list.splice(index, 1)
          return true
        }

        return list.some(item =>
          removeFromTree(item.children)
        )
      }

      removeFromTree(this.categories)
    },

    removeCollection(category, collectionId) {
      category.collections =
        category.collections.filter(
          item => item._id !== collectionId
        )
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
    await updateCollectionGroups(this.categories)

    this.$message.success(
      'Groups updated successfully'
    )

    this.$emit('save', this.categories)

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
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
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