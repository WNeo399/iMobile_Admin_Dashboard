import { constantRoutes, moduleRoutes } from '@/router'
import auth from '@/plugins/auth'

// Is the current user allowed to access this route?
function routeAllowed(route) {
  const meta = route.meta || {}
  if (meta.permissions) return auth.hasPermiOr(meta.permissions)
  if (meta.roles) return auth.hasRoleOr(meta.roles)
  return true
}

// Recursively filter the static module routes by the user's permissions.
// A parent group is dropped if all of its children get filtered out.
function filterModuleRoutes(routes) {
  const res = []
  routes.forEach(route => {
    const tmp = { ...route }
    if (!routeAllowed(tmp)) return
    if (tmp.children) {
      const hadChildren = tmp.children.length > 0
      tmp.children = filterModuleRoutes(tmp.children)
      if (hadChildren && tmp.children.length === 0) return
    }
    res.push(tmp)
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
