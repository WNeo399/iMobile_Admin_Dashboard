import { login, logout, getInfo } from '@/api/login'
import { getToken, setToken, removeToken } from '@/utils/auth'
import defAva from '@/assets/images/profile.jpg'

const user = {
  state: {
    token: getToken(),
    id: '',
    name: '',
    nickName: '',
    avatar: '',
    roles: [],
    permissions: [],
    // null = unscoped (sees all). An array of shop id strings = restricted.
    accessibleShopIds: null,
    // denormalized shop summaries the user can access (for display)
    shops: []
  },

  mutations: {
    SET_TOKEN: (state, token) => {
      state.token = token
    },
    SET_ID: (state, id) => {
      state.id = id
    },
    SET_NAME: (state, name) => {
      state.name = name
    },
    SET_NICK_NAME: (state, nickName) => {
      state.nickName = nickName
    },
    SET_AVATAR: (state, avatar) => {
      state.avatar = avatar
    },
    SET_ROLES: (state, roles) => {
      state.roles = roles
    },
    SET_PERMISSIONS: (state, permissions) => {
      state.permissions = permissions
    },
    SET_ACCESSIBLE_SHOP_IDS: (state, ids) => {
      state.accessibleShopIds = ids
    },
    SET_SHOPS: (state, shops) => {
      state.shops = shops
    }
  },

  actions: {
    // Login — username may be a username or an email
    Login({ commit }, userInfo) {
      const username = userInfo.username.trim()
      const password = userInfo.password
      return new Promise((resolve, reject) => {
        login(username, password).then(res => {
          setToken(res.token)
          commit('SET_TOKEN', res.token)
          resolve()
        }).catch(error => {
          reject(error)
        })
      })
    },

    // Fetch current user info
    GetInfo({ commit }) {
      return new Promise((resolve, reject) => {
        getInfo().then(res => {
          const u = res.user || {}
          if (res.roles && res.roles.length > 0) {
            commit('SET_ROLES', res.roles)
            commit('SET_PERMISSIONS', res.permissions || [])
          } else {
            commit('SET_ROLES', ['ROLE_DEFAULT'])
            commit('SET_PERMISSIONS', [])
          }
          commit('SET_ID', u.id)
          commit('SET_NAME', u.username)
          commit('SET_NICK_NAME', u.nickName || u.username)
          commit('SET_AVATAR', defAva)
          commit('SET_ACCESSIBLE_SHOP_IDS', res.accessibleShopIds || null)
          commit('SET_SHOPS', res.shops || [])
          resolve(res)
        }).catch(error => {
          reject(error)
        })
      })
    },

    // Logout
    LogOut({ commit, state }) {
      return new Promise((resolve, reject) => {
        logout(state.token).then(() => {
          commit('SET_TOKEN', '')
          commit('SET_ROLES', [])
          commit('SET_PERMISSIONS', [])
          commit('SET_ACCESSIBLE_SHOP_IDS', null)
          commit('SET_SHOPS', [])
          removeToken()
          resolve()
        }).catch(error => {
          reject(error)
        })
      })
    },

    // Front-end only logout (clears token without hitting the server)
    FedLogOut({ commit }) {
      return new Promise(resolve => {
        commit('SET_TOKEN', '')
        commit('SET_ROLES', [])
        commit('SET_PERMISSIONS', [])
        commit('SET_ACCESSIBLE_SHOP_IDS', null)
        commit('SET_SHOPS', [])
        removeToken()
        resolve()
      })
    }
  }
}

export default user
