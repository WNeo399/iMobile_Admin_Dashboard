import store from '@/store'

/**
 * Match a granted permission against a required one, supporting segment
 * wildcards. Permissions follow "group:resource:action"; a "*" segment is a
 * wildcard, so "zoho:*:*" matches "zoho:stock:view" and "*:*:*" matches all.
 * @param {String} granted
 * @param {String} required
 * @returns {Boolean}
 */
export function permissionMatches(granted, required) {
  if (granted === required) return true
  const g = String(granted).split(':')
  const r = String(required).split(':')
  if (g.length !== r.length) return false
  return g.every((seg, i) => seg === '*' || seg === r[i])
}

/**
 * Does the user's permission list satisfy the required permission?
 * @param {Array} userPermissions
 * @param {String} required
 * @returns {Boolean}
 */
export function hasPermission(userPermissions, required) {
  if (!Array.isArray(userPermissions)) return false
  if (!required) return true
  return userPermissions.some(p => permissionMatches(p, required))
}

/**
 * 字符权限校验 — true if the user holds ANY of the required permissions.
 * @param {Array} value 校验值
 * @returns {Boolean}
 */
export function checkPermi(value) {
  if (value && value instanceof Array && value.length > 0) {
    const permissions = store.getters && store.getters.permissions
    return value.some(required => hasPermission(permissions, required))
  } else {
    console.error(`need roles! Like checkPermi="['system:user:add','system:user:edit']"`)
    return false
  }
}

/**
 * 角色权限校验
 * @param {Array} value 校验值
 * @returns {Boolean}
 */
export function checkRole(value) {
  if (value && value instanceof Array && value.length > 0) {
    const roles = store.getters && store.getters.roles
    const permissionRoles = value
    const super_admin = "admin"

    const hasRole = roles.some(role => {
      return super_admin === role || permissionRoles.includes(role)
    })

    return hasRole

  } else {
    console.error(`need roles! Like checkRole="['admin','editor']"`)
    return false
  }
}