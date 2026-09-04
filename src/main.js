import Vue from 'vue'

import Cookies from 'js-cookie'

import Element from 'element-ui'
import './assets/styles/element-variables.scss'
import i18n, { translateTitle, getLanguage } from './lang'

import '@/assets/styles/index.scss' // global css
import '@/assets/styles/ruoyi.scss' // ruoyi css
import App from './App'
import store from './store'
import router from './router'
import directive from './directive' // directive
import plugins from './plugins' // plugins
import { download } from '@/utils/request'

import './assets/icons' // icon
import './permission' // permission control
import { parseTime, resetForm, addDateRange, selectDictLabel, selectDictLabels, handleTree } from "@/utils/ruoyi"
// 分页组件
import Pagination from "@/components/Pagination"
// 自定义表格工具组件
import RightToolbar from "@/components/RightToolbar"
// 富文本组件
import Editor from "@/components/Editor"
// 文件上传组件
import FileUpload from "@/components/FileUpload"
// 图片上传组件
import ImageUpload from "@/components/ImageUpload"
// 图片预览组件
import ImagePreview from "@/components/ImagePreview"

// 全局方法挂载
Vue.prototype.parseTime = parseTime
Vue.prototype.resetForm = resetForm
Vue.prototype.addDateRange = addDateRange
Vue.prototype.selectDictLabel = selectDictLabel
Vue.prototype.selectDictLabels = selectDictLabels
Vue.prototype.download = download
Vue.prototype.handleTree = handleTree

// 全局组件挂载
Vue.component('Pagination', Pagination)
Vue.component('RightToolbar', RightToolbar)
Vue.component('Editor', Editor)
Vue.component('FileUpload', FileUpload)
Vue.component('ImageUpload', ImageUpload)
Vue.component('ImagePreview', ImagePreview)

Vue.use(directive)
Vue.use(plugins)

/**
 * If you don't want to use mock-server
 * you want to use MockJs for mock api
 * you can execute: mockXHR()
 *
 * Currently MockJs will be used in the production environment,
 * please remove it before going online! ! !
 */

Vue.use(Element, {
  size: Cookies.get('size') || 'medium', // set element-ui default size
  // Element chrome (pagination, pickers, message boxes…) follows the app
  // language via the i18n bridge.
  i18n: (key, value) => i18n.t(key, value)
})

// Menu / tab / breadcrumb title translation with English fallback —
// see src/lang/index.js. Usable anywhere as $tt('Stock').
Vue.prototype.$tt = translateTitle
document.documentElement.setAttribute('lang', getLanguage() === 'zh' ? 'zh-CN' : 'en')

// Project-wide: el-dialog does NOT close when the overlay/modal is clicked, so a
// dialog can't be dismissed by an accidental outside click (losing entered data).
// Overriding the component's default prop applies to every <el-dialog>; any dialog
// can still opt back in with :close-on-click-modal="true".
if (Element.Dialog && Element.Dialog.props && Element.Dialog.props.closeOnClickModal) {
  Element.Dialog.props.closeOnClickModal.default = false
}

Vue.config.productionTip = false

new Vue({
  el: '#app',
  router,
  store,
  i18n,
  render: h => h(App)
})
