import router from './router'
import store from './store'
import { Message } from 'element-ui'
import NProgress from 'nprogress'
import 'nprogress/nprogress.css'
import { getToken } from '@/utils/auth'
import { isPathMatch } from '@/utils/validate'
import { isRelogin } from '@/utils/request'
import auth from '@/plugins/auth'

NProgress.configure({ showSpinner: false })

const whiteList = ['/login']

const isWhiteList = (path) => {
  return whiteList.some(pattern => isPathMatch(pattern, path))
}

// Every matched route record (parent + child) must pass its meta gate.
const isRouteAllowed = (to) => {
  return to.matched.every(record => {
    const meta = record.meta || {}
    if (meta.permissions) return auth.hasPermiOr(meta.permissions)
    if (meta.roles) return auth.hasRoleOr(meta.roles)
    return true
  })
}

router.beforeEach((to, from, next) => {
  NProgress.start()
  if (getToken()) {
    to.meta.title && store.dispatch('settings/setTitle', to.meta.title)
    /* has token*/
    if (to.path === '/login') {
      next({ path: '/' })
      NProgress.done()
    } else if (isWhiteList(to.path)) {
      next()
    } else {
      if (store.getters.roles.length === 0) {
        isRelogin.show = true
        // Load the user's profile/role/permissions, then build the filtered
        // sidebar. Re-enter the route so the permission check below runs.
        store.dispatch('GetInfo').then(() => {
          isRelogin.show = false
          store.dispatch('GenerateRoutes').then(() => {
            next({ ...to, replace: true })
          })
        }).catch(err => {
          store.dispatch('LogOut').then(() => {
            Message.error(err)
            next({ path: '/login' })
          })
        })
      } else if (isRouteAllowed(to)) {
        next()
      } else {
        next({ path: '/401' })
        NProgress.done()
      }
    }
  } else {
    // 没有token
    if (isWhiteList(to.path)) {
      // 在免登录白名单，直接进入
      next()
    } else {
      next(`/login?redirect=${encodeURIComponent(to.fullPath)}`) // 否则全部重定向到登录页
      NProgress.done()
    }
  }
})

router.afterEach(() => {
  NProgress.done()
})
