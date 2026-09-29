import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from '@/stores/auth'
import { useSite } from '@/stores/site'
import { useInstall } from '@/stores/install'
import { get } from '@/lib/request'

const routes = [
  {
    path: '/install',
    name: 'install',
    component: () => import('@/views/InstallView.vue'),
    meta: { public: true, install: true, title: '安装向导' },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { public: true, title: '登录' },
  },
  {
    path: '/',
    component: () => import('@/components/AppLayout.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('@/views/DashboardView.vue'),
        meta: { title: '仪表盘', icon: 'dashboard' },
      },
      {
        path: 'cards',
        name: 'cards',
        component: () => import('@/views/CardsView.vue'),
        meta: { title: '卡密', icon: 'cards' },
      },
      {
        path: 'card-types',
        name: 'cardTypes',
        component: () => import('@/views/CardTypesView.vue'),
        meta: { title: '套餐', icon: 'tag' },
      },
      {
        path: 'projects',
        name: 'projects',
        component: () => import('@/views/ProjectsView.vue'),
        meta: { title: '项目', icon: 'globe' },
      },
      {
        path: 'logs',
        name: 'logs',
        component: () => import('@/views/LogsView.vue'),
        meta: { title: '日志', icon: 'logs' },
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('@/views/SettingsView.vue'),
        meta: { title: '系统设置', icon: 'settings' },
      },
      {
        path: 'deployment',
        name: 'deployment',
        component: () => import('@/views/DeploymentView.vue'),
        meta: { title: '部署与更新', icon: 'server' },
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  const auth = useAuth()
  const site = useSite()
  const install = useInstall()

  if (install.installed === null || !site.loaded || !auth.loaded) {
    try {
      const data = await get('/api/bootstrap', { redirectOnUnauthorized: false })
      install.installed = Boolean(data.installed)
      install.defaultSiteName = data.defaultSiteName || '十夜卡密'
      site.name = data.site?.name || ''
      site.announcement = data.site?.announcement || ''
      site.version = data.site?.version || ''
      site.loaded = true
      auth.admin = data.admin || null
      auth.loaded = true
    } catch {
      // 兼容更新过程中的短暂连接失败，旧接口并行兜底。
      const tasks = [install.fetchStatus()]
      if (!site.loaded) tasks.push(site.fetchSite())
      if (!auth.loaded && !to.meta.public) tasks.push(auth.fetchMe())
      await Promise.allSettled(tasks)
    }
  }

  if (install.installed === false && to.path !== '/install') {
    return { path: '/install' }
  }
  if (install.installed === true && to.path === '/install') {
    return { path: auth.isLoggedIn ? '/dashboard' : '/login' }
  }
  if (!auth.isLoggedIn && !to.meta.public) {
    return { path: '/login' }
  }
  if (auth.isLoggedIn && to.path === '/login') {
    return { path: '/dashboard' }
  }

  // 站点名称(浏览器标签页标题):登录页与后台共用
  document.title = (to.meta?.title ? `${to.meta.title} · ` : '') + (site.name || '十夜卡密')
  return true
})

export default router
