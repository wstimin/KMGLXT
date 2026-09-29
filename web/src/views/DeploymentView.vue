<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElButton, ElMessage, ElMessageBox } from 'element-plus'
import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import IconFrame from '@/components/IconFrame.vue'
import { get, post } from '@/lib/request'
import { useAuth } from '@/stores/auth'

const auth = useAuth()
const status = ref(null)
const loading = ref(true)
const refreshing = ref(false)
const updating = ref(false)
const updateRequested = ref(false)
const activeGuide = ref('baota')
let pollTimer = null
let reloadScheduled = false

const modeLabels = {
  oneclick: '一键安装',
  baota: '宝塔面板',
  '1panel': '1Panel',
  panel: 'Linux 面板',
  docker: 'Docker',
  development: '开发环境',
}

const guides = [
  {
    id: 'baota',
    name: '宝塔面板',
    mark: 'BT',
    intro: '上传专用包后由宝塔管理 Node 进程与域名，首次访问在网页中完成安装。',
    path: '/www/wwwroot/kmglxt',
    steps: [
      { title: '安装运行环境', text: '在软件商店安装 Node.js 版本管理器与 PM2 管理器，选择 Node.js 24。' },
      { title: '上传面板专用包', text: '从 GitHub Releases 下载最新 KMGLXT-v*-panel.tar.gz，上传并解压到 /www/wwwroot/kmglxt。包内已包含生产依赖。' },
      {
        title: '创建 Node 项目',
        text: '项目目录填 /www/wwwroot/kmglxt，启动文件填 server/app.js，端口 1111，并开启异常退出自动重启。',
        command: 'NODE_ENV=production\nPORT=1111\nDATA_DIR=/www/wwwroot/kmglxt/server/data\nTRUST_PROXY=1\nDEPLOY_MODE=baota\nWEB_UPDATE_RESTART=1',
      },
      { title: '绑定域名', text: '在宝塔网站中反向代理到 http://127.0.0.1:1111，并申请 HTTPS 证书。' },
      { title: '网页完成安装', text: '访问绑定的域名会自动显示安装向导；填写站点名称、管理员账号和密码即可进入后台。' },
    ],
  },
  {
    id: '1panel',
    name: '1Panel',
    mark: '1P',
    intro: '上传专用包后由 1Panel 守护 Node 服务，首次访问在网页中完成安装。',
    path: '/opt/kmglxt-panel',
    steps: [
      { title: '创建运行环境', text: '在运行环境中准备 Node.js 24，并创建应用目录 /opt/kmglxt-panel。' },
      { title: '上传面板专用包', text: '从 GitHub Releases 下载最新 KMGLXT-v*-panel.tar.gz，上传并解压到应用目录。包内已包含生产依赖。' },
      {
        title: '创建 Node 网站',
        text: '运行目录填 /opt/kmglxt-panel，启动命令填 node server/app.js，并开启自动重启。',
        command: 'NODE_ENV=production\nPORT=1111\nDATA_DIR=/opt/kmglxt-panel/server/data\nTRUST_PROXY=1\nDEPLOY_MODE=1panel\nWEB_UPDATE_RESTART=1',
      },
      { title: '绑定域名', text: '创建反向代理网站，代理到 http://127.0.0.1:1111，证书由 1Panel 管理。' },
      { title: '网页完成安装', text: '访问绑定的域名会自动显示安装向导；填写站点名称、管理员账号和密码即可进入后台。' },
    ],
  },
  {
    id: 'docker',
    name: 'Docker',
    mark: 'DK',
    intro: '使用 GHCR 官方镜像运行，数据库持久化在宿主机 ./data。',
    path: './data',
    steps: [
      {
        title: '下载 Compose 文件',
        text: '创建独立目录并下载仓库中的 compose.yaml。',
        command: 'mkdir -p kmglxt && cd kmglxt\ncurl -fsSLO https://raw.githubusercontent.com/wstimin/KMGLXT/main/compose.yaml',
      },
      {
        title: '设置代理参数',
        text: '直接使用端口时保持 0；经过宝塔或 1Panel 反向代理时改为 1。',
        command: "printf 'TRUST_PROXY=0\\n' > .env",
      },
      {
        title: '启动容器',
        text: '镜像启动后访问 http://服务器IP:1111，按网页安装向导创建管理员。',
        command: 'docker compose up -d',
      },
      {
        title: '更新容器',
        text: '后台会显示新版本；在 Docker 主机执行下面的命令完成更新。',
        command: 'docker compose pull && docker compose up -d',
      },
    ],
  },
]

const currentGuide = computed(() => guides.find((item) => item.id === activeGuide.value) || guides[0])
const state = computed(() => status.value?.state || { status: 'idle' })
const isBusy = computed(() => updating.value || state.value.status === 'running')
const currentLabel = computed(() => status.value?.current === 'source' ? '源码版' : status.value?.current || '—')
const latestLabel = computed(() => status.value?.latest?.tag || '暂未获取')

function schedulePoll(delay = 1800) {
  clearTimeout(pollTimer)
  pollTimer = setTimeout(() => loadStatus(false, true), delay)
}

async function loadStatus(force = false, polling = false) {
  if (force) refreshing.value = true
  try {
    status.value = await get(`/api/admin/update/status${force ? '?refresh=1' : ''}`)
    const nextState = status.value?.state?.status
    updating.value = nextState === 'running'
    if (nextState === 'running') {
      updateRequested.value = true
      schedulePoll()
    } else if (nextState === 'success' && state.value.phase === 'restarting' && updateRequested.value && !reloadScheduled) {
      reloadScheduled = true
      ElMessage.success('新版本已安装，正在重新连接服务')
      setTimeout(() => location.reload(), 3000)
    } else if (nextState === 'failed' && polling) {
      ElMessage.error(state.value.message || '更新失败')
    }
  } catch (error) {
    if (isBusy.value || polling) schedulePoll(2500)
    else ElMessage.error(error.message || '版本信息加载失败')
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

async function startUpdate() {
  if (!auth.isSuper) return ElMessage.warning('只有超级管理员可以执行更新')
  if (status.value?.mode === 'docker') {
    await copyText(status.value.dockerCommand, 'Docker 更新命令已复制')
    return
  }
  try {
    await ElMessageBox.confirm(
      `将从 ${currentLabel.value} 更新到 ${latestLabel.value}。系统会先自动备份数据库，更新期间可能短暂断开连接。`,
      '安装新版本',
      { type: 'warning', confirmButtonText: '备份并更新', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  updating.value = true
  updateRequested.value = true
  try {
    const result = await post('/api/admin/update/install', {})
    ElMessage.success(result.autoRestart ? '更新已开始，完成后服务会自动重启' : '更新已开始，完成后需在面板重启服务')
    schedulePoll(900)
  } catch (error) {
    updating.value = false
    ElMessage.error(error.message || '无法开始更新')
  }
}

async function copyText(text, message = '已复制') {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(message)
  } catch {
    ElMessage.error('复制失败，请手动选择文本')
  }
}

onMounted(() => loadStatus())
onBeforeUnmount(() => clearTimeout(pollTimer))
</script>

<template>
  <div class="deploy-page">
    <header class="page-head">
      <div>
        <h2 class="page-title"><IconFrame name="server" :size="23" /> 部署与更新</h2>
        <p>面板部署与一键安装相互独立，版本状态来自可安装的 GitHub Release。</p>
      </div>
      <el-button class="glow-ghost" :loading="refreshing" @click="loadStatus(true)">
        <IconFrame name="refresh" :size="14" /> 检查更新
      </el-button>
    </header>

    <section class="update-card gradient-border" :class="{ 'has-update': status?.updateAvailable }">
      <div class="update-copy">
        <span class="eyebrow">SYSTEM RELEASE</span>
        <h3 v-if="loading">正在读取版本信息…</h3>
        <h3 v-else-if="status?.updateAvailable">发现新版本 {{ latestLabel }}</h3>
        <h3 v-else>{{ status?.checkError ? '暂时无法检查更新' : '当前已是最新版本' }}</h3>
        <p v-if="state.status === 'running'" class="progress-line">
          <span class="spinner" /> {{ state.message }}
        </p>
        <p v-else-if="state.status === 'failed'" class="state-error">{{ state.message }}</p>
        <p v-else-if="state.status === 'success' && state.message" class="state-success">{{ state.message }}</p>
        <p v-else>{{ status?.checkError || '更新前自动创建数据库备份，并保留账号、密钥与业务数据。' }}</p>
      </div>

      <div class="version-flow">
        <div class="version-box">
          <span>当前版本</span>
          <strong>{{ currentLabel }}</strong>
        </div>
        <span class="flow-arrow">→</span>
        <div class="version-box latest">
          <span>最新版本</span>
          <strong>{{ latestLabel }}</strong>
        </div>
      </div>

      <div class="update-actions">
        <span class="mode-pill">{{ modeLabels[status?.mode] || status?.mode || '检测中' }}</span>
        <el-button
          v-if="status?.updateAvailable && auth.isSuper"
          class="glow-btn update-button"
          :loading="isBusy"
          :disabled="status?.mode !== 'docker' && !status?.canUpdate"
          @click="startUpdate"
        >
          {{ status?.mode === 'docker' ? '复制更新命令' : '立即更新' }}
        </el-button>
        <a v-if="status?.latest?.url" class="release-link" :href="status.latest.url" target="_blank" rel="noreferrer">查看 Release ↗</a>
      </div>
    </section>

    <section class="guide-shell glass">
      <div class="guide-head">
        <div>
          <span class="eyebrow">DEPLOYMENT GUIDES</span>
          <h3>选择你的部署方式</h3>
        </div>
        <div class="guide-tabs" role="tablist" aria-label="部署方式">
          <button
            v-for="guide in guides"
            :key="guide.id"
            type="button"
            :class="{ active: activeGuide === guide.id }"
            @click="activeGuide = guide.id"
          >
            <span>{{ guide.mark }}</span>{{ guide.name }}
          </button>
        </div>
      </div>

      <div :key="currentGuide.id" class="guide-content">
        <div class="guide-summary">
          <div class="guide-mark">{{ currentGuide.mark }}</div>
          <div>
            <h4>{{ currentGuide.name }}</h4>
            <p>{{ currentGuide.intro }}</p>
          </div>
          <div class="data-path"><span>数据位置</span><code>{{ currentGuide.path }}</code></div>
        </div>

        <div class="steps">
          <article v-for="(step, index) in currentGuide.steps" :key="step.title" class="step-card">
            <span class="step-index">{{ String(index + 1).padStart(2, '0') }}</span>
            <div class="step-main">
              <h5>{{ step.title }}</h5>
              <p>{{ step.text }}</p>
              <div v-if="step.command" class="code-box">
                <pre>{{ step.command }}</pre>
                <button type="button" @click="copyText(step.command)">复制</button>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.deploy-page { display: flex; flex-direction: column; gap: 20px; }
.page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
.page-title { display: flex; align-items: center; gap: 10px; margin: 0; font-size: 22px; font-weight: 800; }
.page-head p { margin: 7px 0 0; color: var(--ink-3); font-size: 13px; }
.eyebrow { color: var(--brand-blue); font-size: 10px; font-weight: 800; letter-spacing: .16em; }

.update-card { position: relative; display: grid; grid-template-columns: minmax(240px, 1fr) auto auto; align-items: center; gap: 34px; padding: 26px 28px; overflow: hidden; }
.update-card::after { content: ''; position: absolute; width: 220px; height: 220px; right: -80px; top: -120px; border-radius: 50%; background: rgba(56, 189, 248, .14); filter: blur(26px); pointer-events: none; }
.update-card.has-update::after { background: rgba(167, 139, 250, .2); }
.update-copy { position: relative; z-index: 1; }
.update-copy h3 { margin: 6px 0 5px; color: var(--ink-1); font-size: 20px; }
.update-copy p { margin: 0; color: var(--ink-2); font-size: 12.5px; }
.progress-line, .state-success { color: var(--ok) !important; }
.state-error { color: var(--danger) !important; }
.spinner { display: inline-block; width: 10px; height: 10px; margin-right: 5px; border: 2px solid rgba(16,185,129,.2); border-top-color: var(--ok); border-radius: 50%; animation: spin .7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.version-flow { display: flex; align-items: center; gap: 12px; }
.version-box { min-width: 96px; padding: 11px 14px; border: 1px solid rgba(79,124,255,.12); border-radius: 13px; background: rgba(255,255,255,.5); }
.version-box span { display: block; margin-bottom: 3px; color: var(--ink-3); font-size: 10.5px; }
.version-box strong { color: var(--ink-1); font-size: 17px; }
.version-box.latest strong { color: var(--brand-violet); }
.flow-arrow { color: var(--brand-blue); font-size: 18px; }
.update-actions { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
.mode-pill { padding: 4px 9px; border-radius: 999px; color: #0369a1; background: rgba(56,189,248,.12); font-size: 11px; font-weight: 700; }
.release-link { color: var(--brand-blue); font-size: 11.5px; text-decoration: none; }
.update-button { min-width: 112px; }

.guide-shell { padding: 26px; }
.guide-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin-bottom: 24px; }
.guide-head h3 { margin: 5px 0 0; font-size: 19px; }
.guide-tabs { display: flex; gap: 5px; padding: 4px; border-radius: 14px; background: rgba(79,124,255,.07); }
.guide-tabs button { display: inline-flex; align-items: center; gap: 7px; padding: 8px 12px; border: 0; border-radius: 10px; color: var(--ink-2); background: transparent; cursor: pointer; font: inherit; font-size: 12.5px; transition: color 160ms ease, background 160ms ease, transform 120ms cubic-bezier(.23,1,.32,1); }
.guide-tabs button span { display: grid; place-items: center; width: 23px; height: 23px; border-radius: 7px; color: var(--brand-blue); background: rgba(255,255,255,.72); font-size: 9px; font-weight: 900; }
.guide-tabs button.active { color: #fff; background: var(--grad-main); box-shadow: 0 5px 14px rgba(79,124,255,.24); }
.guide-tabs button.active span { color: var(--brand-violet); }
.guide-tabs button:active { transform: scale(.97); }
.guide-content { animation: guide-in 200ms cubic-bezier(.23,1,.32,1); }
@keyframes guide-in { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }

.guide-summary { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 15px; padding: 16px 18px; margin-bottom: 14px; border-radius: 16px; background: linear-gradient(135deg, rgba(79,124,255,.08), rgba(139,92,246,.06)); }
.guide-mark { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 14px; color: #fff; background: var(--grad-main); box-shadow: 0 7px 18px rgba(79,124,255,.25); font-size: 13px; font-weight: 900; }
.guide-summary h4 { margin: 0 0 4px; font-size: 16px; }
.guide-summary p { margin: 0; color: var(--ink-2); font-size: 12.5px; }
.data-path { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.data-path span { color: var(--ink-3); font-size: 10px; }
.data-path code { color: var(--brand-blue); font-size: 11.5px; }
.steps { display: grid; gap: 10px; }
.step-card { display: flex; gap: 15px; padding: 15px 16px; border: 1px solid rgba(79,124,255,.09); border-radius: 15px; background: rgba(255,255,255,.42); }
.step-index { flex: none; color: rgba(79,124,255,.42); font-size: 12px; font-weight: 900; letter-spacing: .08em; }
.step-main { min-width: 0; flex: 1; }
.step-main h5 { margin: 0 0 3px; color: var(--ink-1); font-size: 13.5px; }
.step-main p { margin: 0; color: var(--ink-2); font-size: 12.5px; line-height: 1.7; }
.code-box { position: relative; margin-top: 10px; border-radius: 12px; background: #18213a; overflow: hidden; }
.code-box pre { margin: 0; padding: 13px 58px 13px 14px; color: #dbeafe; font: 11.5px/1.65 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
.code-box button { position: absolute; top: 9px; right: 9px; padding: 4px 8px; border: 1px solid rgba(255,255,255,.14); border-radius: 7px; color: #bfdbfe; background: rgba(255,255,255,.08); cursor: pointer; font-size: 10px; transition: background 150ms ease, transform 120ms cubic-bezier(.23,1,.32,1); }
.code-box button:active { transform: scale(.96); }

@media (hover: hover) and (pointer: fine) {
  .code-box button:hover { background: rgba(255,255,255,.15); }
}

@media (max-width: 1100px) {
  .update-card { grid-template-columns: 1fr auto; }
  .update-actions { grid-column: 1 / -1; flex-direction: row; align-items: center; }
}
@media (max-width: 760px) {
  .page-head, .guide-head { align-items: stretch; flex-direction: column; }
  .update-card { grid-template-columns: 1fr; gap: 18px; }
  .version-flow { justify-content: space-between; }
  .version-box { flex: 1; }
  .update-actions { grid-column: auto; }
  .guide-tabs { align-self: stretch; }
  .guide-tabs button { flex: 1; justify-content: center; }
  .guide-summary { grid-template-columns: auto 1fr; }
  .data-path { grid-column: 1 / -1; align-items: flex-start; }
}
@media (prefers-reduced-motion: reduce) {
  .guide-content { animation: none; }
}
</style>
