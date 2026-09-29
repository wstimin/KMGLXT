import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'

import '@/styles/tokens.css'
import '@/styles/base.css'
import '@/styles/components.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)

// 保留 index.html 的轻量启动画面，路由与首屏数据就绪后再接管。
router.isReady().finally(() => app.mount('#app'))
