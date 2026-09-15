import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from '@/stores/auth'
import { useSite } from '@/stores/site'

const routes = [
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
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  const auth = useAuth()

  if (!auth.loaded && !to.meta.public) {
    try {
      await auth.fetchMe()
    } catch {
      /* 401 已由 request.js 处理 */
    }
  }

  if (!auth.isLoggedIn && !to.meta.public) {
    return { path: '/login' }
  }
  if (auth.isLoggedIn && to.path === '/login') {
    return { path: '/dashboard' }
  }

  // 站点名称(浏览器标签页标题):登录页与后台共用
  const site = useSite()
  if (!site.loaded) await site.fetchSite()
  document.title = (to.meta?.title ? `${to.meta.title} · ` : '') + (site.name || '十夜卡密')
  return true
})

export default router