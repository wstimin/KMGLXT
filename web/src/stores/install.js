import { defineStore } from 'pinia'
import { get, post } from '@/lib/request'

export const useInstall = defineStore('install', {
  state: () => ({
    installed: null,
    defaultSiteName: '十夜卡密',
    loading: false,
  }),
  actions: {
    async fetchStatus(force = false) {
      if (this.installed !== null && !force) return this.installed
      this.loading = true
      try {
        const data = await get('/api/install/status', { redirectOnUnauthorized: false })
        this.installed = Boolean(data.installed)
        this.defaultSiteName = data.defaultSiteName || '十夜卡密'
        return this.installed
      } finally {
        this.loading = false
      }
    },
    async complete(payload) {
      const data = await post('/api/install/complete', payload)
      this.installed = true
      return data
    },
  },
})
