import { defineStore } from 'pinia'
import { get } from '@/lib/request'

/** 站点信息(系统名称 / 首页公告):登录页与各品牌位共用,改设置后立即刷新 */
export const useSite = defineStore('site', {
  state: () => ({
    name: '',
    announcement: '',
    loaded: false,
  }),
  actions: {
    async fetchSite(force = false) {
      if (this.loaded && !force) return this
      try {
        const data = await get('/api/site')
        this.name = data?.name || ''
        this.announcement = data?.announcement || ''
      } catch {
        /* 失败时维持空值,显示层用「十夜卡密」兜底 */
      }
      this.loaded = true
      return this
    },
  },
})