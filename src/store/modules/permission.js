import { constantRoutes, moduleRoutes } from '@/router'
import auth from '@/plugins/auth'
import { actsAsPhoneSupplier } from '@/utils/permission'

// `liftForPhoneSupplier`: an account working as a phone supplier sees the
// page one level up in the sidebar, out of its group, and the breadcrumb
// leaves the group out (the route itself — path, guard — stays where it is).
export function liftedForUser(route) {
  return !!(route && route.meta && route.meta.liftForPhoneSupplier) && actsAsPhoneSupplier()
}

// Is the current user allowed to access this route?
function routeAllowed(route) {
  const meta = route.meta || {}
  // `exclusiveRoles` gates a route to specific roles WITHOUT the admin bypass,
  // so portal-only pages don't leak onto the admin sidebar (where they'd be empty).
  if (meta.exclusiveRoles) return auth.hasStrictRoleOr(meta.exclusiveRoles)
  // `excludeRoles` hides a route from specific roles (strict match — admin is
  // unaffected unless listed). Lets a role get its own flattened menu entry
  // for a page without seeing the regular nested one too. An account holding
  // other roles as well still sees it when one of those grants it.
  if (auth.excludedByRoles(meta)) return false
  if (meta.permissions) return auth.hasPermiOr(meta.permissions)
  if (meta.roles) return auth.hasRoleOr(meta.roles)
  return true
}

// Recursively filter the static module routes by the user's permissions.
// A parent group is dropped if all of its children get filtered out; a
// child lifted for this user moves up beside its group.
function filterModuleRoutes(routes) {
  const res = []
  routes.forEach(route => {
    const tmp = { ...route }
    if (!routeAllowed(tmp)) return
    let lifted = []
    if (tmp.children) {
      const hadChildren = tmp.children.length > 0
      const kids = filterModuleRoutes(tmp.children)
      // one level only — the copy loses the flag, or every level above
      // would lift it again
      lifted = kids.filter(liftedForUser).map(k => ({ ...k, meta: { ...k.meta, liftForPhoneSupplier: false } }))
      tmp.children = kids.filter(k => !liftedForUser(k))
      if (hadChildren && tmp.children.length === 0) {
        res.push(...lifted)
        return
      }
    }
    res.push(tmp, ...lifted)
  })
  return res
}

const permission = {
  state: {
    routes: [],
    defaultRoutes: [],
    topbarRouters: [],
    sidebarRouters: []
  },
  mutations: {
    // Callers pass the complete route list (common + filtered modules). The
    // mutations assign as-is — they must NOT re-prepend constantRoutes, or
    // routes get duplicated when a value derived from one is fed into another
    // (e.g. the layout Settings watcher commits defaultRoutes here).
    SET_ROUTES: (state, routes) => {
      state.routes = routes
    },
    SET_DEFAULT_ROUTES: (state, routes) => {
      state.defaultRoutes = routes
    },
    SET_TOPBAR_ROUTES: (state, routes) => {
      state.topbarRouters = routes
    },
    SET_SIDEBAR_ROUTERS: (state, routes) => {
      state.sidebarRouters = routes
    }
  },
  actions: {
    // Filter the static module routes by the logged-in user's permissions.
    // (No backend route fetch — our routes are defined client-side.)
    GenerateRoutes({ commit }) {
      return new Promise(resolve => {
        const accessible = filterModuleRoutes(moduleRoutes)
        const full = constantRoutes.concat(accessible)
        commit('SET_ROUTES', full)
        commit('SET_SIDEBAR_ROUTERS', full)
        commit('SET_DEFAULT_ROUTES', full)
        commit('SET_TOPBAR_ROUTES', full)
        resolve(accessible)
      })
    }
  }
}

export default permission
