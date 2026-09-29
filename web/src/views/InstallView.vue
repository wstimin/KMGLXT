<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElButton, ElForm, ElFormItem, ElInput, ElMessage } from 'element-plus'
import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/form/style/css'
import 'element-plus/es/components/input/style/css'
import 'element-plus/es/components/message/style/css'
import { useInstall } from '@/stores/install'
import { useAuth } from '@/stores/auth'
import { useSite } from '@/stores/site'
import IconFrame from '@/components/IconFrame.vue'

const router = useRouter()
const install = useInstall()
const auth = useAuth()
const site = useSite()
const formRef = ref()
const submitting = ref(false)
const form = reactive({
  siteName: '十夜卡密',
  username: '',
  password: '',
  confirmPassword: '',
})

const rules = {
  siteName: [
    { required: true, message: '请输入站点名称', trigger: 'blur' },
    { min: 2, max: 30, message: '长度需在 2-30 位之间', trigger: 'blur' },
  ],
  username: [
    { required: true, message: '请输入管理员账号', trigger: 'blur' },
    { min: 2, max: 32, message: '长度需在 2-32 位之间', trigger: 'blur' },
    { pattern: /^[\w一-龥-]+$/, message: '仅支持字母、数字、下划线、中文和连字符', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入管理员密码', trigger: 'blur' },
    { min: 8, max: 128, message: '密码至少 8 位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    { validator: (_rule, value, callback) => value === form.password ? callback() : callback(new Error('两次密码输入不一致')), trigger: 'blur' },
  ],
}

onMounted(() => {
  form.siteName = install.defaultSiteName || '十夜卡密'
})

async function submit() {
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  submitting.value = true
  try {
    const data = await install.complete({
      siteName: form.siteName.trim(),
      username: form.username.trim(),
      password: form.password,
    })
    auth.admin = data.admin
    auth.loaded = true
    site.name = data.site.name
    site.loaded = true
    ElMessage.success('安装完成，正在进入管理后台')
    await router.replace('/dashboard')
  } catch (error) {
    ElMessage.error(error.message || '安装失败，请稍后重试')
    if (error.code === 409) await install.fetchStatus(true)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="install-page">
    <div class="aurora" aria-hidden="true" />
    <section class="install-shell">
      <header class="install-brand">
        <span class="brand-icon"><IconFrame name="star" :size="31" /></span>
        <div>
          <p>SHIYEKA SETUP</p>
          <h1>欢迎使用十夜卡密</h1>
          <span>填写基础信息，几十秒完成首次安装</span>
        </div>
      </header>

      <ol class="progress" aria-label="安装步骤">
        <li class="done"><b>1</b><span>环境就绪</span></li>
        <li class="active"><b>2</b><span>创建管理员</span></li>
        <li><b>3</b><span>进入后台</span></li>
      </ol>

      <div class="glass setup-card">
        <div class="card-heading">
          <div>
            <h2>初始化系统</h2>
            <p>这些信息可以在后台继续修改</p>
          </div>
          <span class="ready-badge"><i /> 服务运行正常</span>
        </div>

        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
          <el-form-item label="站点名称" prop="siteName">
            <el-input v-model="form.siteName" size="large" maxlength="30" placeholder="例如：我的卡密平台" />
          </el-form-item>
          <el-form-item label="超级管理员账号" prop="username">
            <el-input v-model="form.username" size="large" maxlength="32" autocomplete="username" placeholder="请输入管理员账号" />
          </el-form-item>
          <div class="password-grid">
            <el-form-item label="管理员密码" prop="password">
              <el-input v-model="form.password" type="password" size="large" show-password autocomplete="new-password" placeholder="至少 8 位" />
            </el-form-item>
            <el-form-item label="确认密码" prop="confirmPassword">
              <el-input v-model="form.confirmPassword" type="password" size="large" show-password autocomplete="new-password" placeholder="再次输入密码" @keyup.enter="submit" />
            </el-form-item>
          </div>
          <el-button class="glow-btn submit-button" size="large" :loading="submitting" @click="submit">
            完成安装并进入后台
          </el-button>
        </el-form>
        <p class="security-tip"><IconFrame name="shield" :size="14" /> 安装完成后，此安装入口会自动关闭</p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.install-page { position: relative; display: grid; min-height: 100vh; place-items: center; padding: 34px 20px; overflow: hidden; }
.aurora { position: fixed; inset: -28%; background: radial-gradient(circle at 34% 34%, rgba(34,211,238,.24), transparent 28%), radial-gradient(circle at 68% 57%, rgba(139,92,246,.24), transparent 30%); filter: blur(28px); pointer-events: none; }
.install-shell { position: relative; z-index: 1; width: min(100%, 680px); animation: enter 280ms cubic-bezier(.23,1,.32,1) both; }
.install-brand { display: flex; align-items: center; gap: 16px; margin-bottom: 22px; }
.brand-icon { display: grid; flex: none; width: 64px; height: 64px; place-items: center; border: 1px solid rgba(255,255,255,.9); border-radius: 20px; color: var(--brand-blue); background: rgba(255,255,255,.72); box-shadow: 0 14px 38px rgba(79,124,255,.2); }
.install-brand p { margin: 0 0 3px; color: var(--brand-violet); font-size: 10px; font-weight: 800; letter-spacing: .25em; }
.install-brand h1 { margin: 0 0 3px; color: var(--ink-1); font-size: 26px; line-height: 1.2; }
.install-brand div > span { color: var(--ink-2); font-size: 13px; }
.progress { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 0 0 12px; padding: 0; list-style: none; }
.progress li { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border: 1px solid rgba(79,124,255,.1); border-radius: 12px; color: var(--ink-3); background: rgba(255,255,255,.4); font-size: 12px; }
.progress b { display: grid; width: 22px; height: 22px; place-items: center; border-radius: 7px; background: rgba(79,124,255,.09); font-size: 10px; }
.progress .done, .progress .active { color: var(--brand-blue); font-weight: 700; }
.progress .active { border-color: rgba(79,124,255,.28); background: rgba(255,255,255,.72); box-shadow: 0 6px 18px rgba(79,124,255,.1); }
.progress .active b { color: #fff; background: var(--grad-main); }
.setup-card { padding: 26px 28px 22px; box-shadow: var(--glass-shadow-lg); }
.card-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 20px; }
.card-heading h2 { margin: 0 0 4px; color: var(--ink-1); font-size: 20px; }
.card-heading p { margin: 0; color: var(--ink-3); font-size: 12px; }
.ready-badge { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; padding: 6px 9px; border-radius: 999px; color: #138a5b; background: rgba(16,185,129,.1); font-size: 11px; font-weight: 700; }
.ready-badge i { width: 6px; height: 6px; border-radius: 50%; background: #10b981; box-shadow: 0 0 0 4px rgba(16,185,129,.12); }
.password-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.submit-button { width: 100%; margin-top: 5px; letter-spacing: .08em; }
.security-tip { display: flex; justify-content: center; align-items: center; gap: 6px; margin: 14px 0 0; color: var(--ink-3); font-size: 11.5px; }
:deep(.el-form-item__label) { color: var(--ink-2); font-size: 12px; font-weight: 700; }
:deep(.el-input__wrapper) { border-radius: 11px; background: rgba(255,255,255,.68); box-shadow: 0 0 0 1px rgba(79,124,255,.1) inset; }
:deep(.el-input__wrapper.is-focus) { box-shadow: 0 0 0 1.5px var(--brand-blue) inset, 0 5px 16px rgba(79,124,255,.14); }
@keyframes enter { from { opacity: 0; transform: translateY(10px) scale(.992); } to { opacity: 1; transform: translateY(0) scale(1); } }
@media (max-width: 560px) {
  .install-page { align-items: start; padding-top: 24px; }
  .progress span { display: none; }
  .progress li { justify-content: center; }
  .setup-card { padding: 22px 18px 18px; }
  .password-grid { grid-template-columns: 1fr; gap: 0; }
  .card-heading { flex-direction: column; gap: 10px; }
}
@media (prefers-reduced-motion: reduce) { .install-shell { animation: none; } }
</style>
