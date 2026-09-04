// App i18n — English / Chinese, switched from the navbar globe button.
//
// Element UI's own locale pack rides along under the `el` key of each
// language, so component chrome (pagination, date pickers, message boxes,
// table empty text…) follows the switch automatically via the i18n bridge
// wired in main.js.
//
// Page translation is incremental: the $tt global translates a menu/tab
// title when `menu.<title>` exists and returns the raw title otherwise,
// so untranslated pages keep working in English.

import Vue from 'vue'
import VueI18n from 'vue-i18n'
import Cookies from 'js-cookie'
import elementEn from 'element-ui/lib/locale/lang/en'
import elementZh from 'element-ui/lib/locale/lang/zh-CN'
import en from './en'
import zh from './zh'

Vue.use(VueI18n)

const messages = {
  en: { ...en, ...elementEn },
  zh: { ...zh, ...elementZh }
}

export const LANGUAGE_COOKIE = 'language'

export function getLanguage() {
  const saved = Cookies.get(LANGUAGE_COOKIE)
  if (saved && messages[saved]) return saved
  // First visit: follow the browser.
  const nav = (navigator.language || '').toLowerCase()
  return nav.indexOf('zh') === 0 ? 'zh' : 'en'
}

const i18n = new VueI18n({
  locale: getLanguage(),
  fallbackLocale: 'en',
  silentTranslationWarn: true,
  messages
})

export function setLanguage(lang) {
  if (!messages[lang]) return
  i18n.locale = lang
  Cookies.set(LANGUAGE_COOKIE, lang, { expires: 365 })
  document.documentElement.setAttribute('lang', lang === 'zh' ? 'zh-CN' : 'en')
}

// Menu / tab / breadcrumb title translation with graceful fallback.
export function translateTitle(title) {
  const key = 'menu.' + title
  return title && i18n.te(key) ? i18n.t(key) : title
}

export default i18n
