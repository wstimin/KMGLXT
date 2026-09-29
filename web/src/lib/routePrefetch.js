const adminViewLoaders = [
  () => import('@/views/DashboardView.vue'),
  () => import('@/views/CardsView.vue'),
  () => import('@/views/CardTypesView.vue'),
  () => import('@/views/ProjectsView.vue'),
  () => import('@/views/LogsView.vue'),
  () => import('@/views/DeploymentView.vue'),
  () => import('@/views/SettingsView.vue'),
]

let started = false

/** 登录后台后利用浏览器空闲时间预加载页面代码，避免首次切换时等待网络。 */
export function prefetchAdminViews() {
  if (started || typeof window === 'undefined') return
  started = true

  const run = () => {
    Promise.allSettled(adminViewLoaders.map((load) => load()))
  }

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 1500 })
  } else {
    window.setTimeout(run, 600)
  }
}
