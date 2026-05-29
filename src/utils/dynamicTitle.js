import store from '@/store'
import defaultSettings from '@/settings'

// Single source of truth for the brand title that appears in the browser
// tab and at the top of the sidebar — kept in sync with Sidebar/Logo.vue.
// TechElite Admin and the two shop-side roles see the TechElite-branded
// title; everyone else (Admin, iMobile Admin, unauthenticated) uses the
// build-time VUE_APP_TITLE.
const TECH_ELITE_ROLES = ['techelite-admin', 'repair-shop', 'shop-owner']

function brandTitle() {
  const roles = (store.state.user && store.state.user.roles) || []
  if (roles.some(r => TECH_ELITE_ROLES.includes(r))) {
    return 'TechElite Dashboard'
  }
  return defaultSettings.title
}

/**
 * Updates document.title. When dynamicTitle is enabled, the page name is
 * prefixed; otherwise just the brand title is shown — which is what the
 * sidebar header displays too, so they always match.
 */
export function useDynamicTitle() {
  const brand = brandTitle()
  if (store.state.settings.dynamicTitle && store.state.settings.title) {
    document.title = store.state.settings.title + ' - ' + brand
  } else {
    document.title = brand
  }
}
