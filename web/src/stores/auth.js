import { defineStore } from 'pinia'
import { get, post } from '@/lib/request'

export const useAuth = defineStore('auth', {
  state: () => ({
    admin: null,
    loaded: false,
  }),
  getters: {
    isLoggedIn: (s) => !!s.admin,
    isSuper: (s) => s.admin?.role === 'super',
  },
  actions: {
    async fetchMe() {
      const data = await get('/api/admin/auth/me')
      this.admin = data.admin
      this.loaded = true
      return this.admin
    },
    async login(username, password) {
      const data = await post('/api/admin/auth/login', { username, password })
      this.admin = data.admin
      this.loaded = true
      return data.admin
    },
    async logout() {
      try {
        await post('/api/admin/auth/logout')
      } catch {
        /* 忽略网络异常 */
      }
      this.admin = null
    },
  },
})