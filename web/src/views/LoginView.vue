<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuth } from '@/stores/auth'
import { useSite } from '@/stores/site'
import IconFrame from '@/components/IconFrame.vue'

const auth = useAuth()
const site = useSite()
const router = useRouter()

const form = reactive({ username: '', password: '' })
const loading = ref(false)

const FEATURES = [
  { icon: 'cards', label: '全局统一卡池', caption: '一卡通用 · 多项目共享' },
  { icon: 'shield', label: '原子核销', caption: '激活即归属 · 杜绝重卡' },
  { icon: 'globe', label: '多项目接管', caption: '验卡 · 扣次 · 回调通知' },
]

async function onLogin() {
  if (!form.username || !form.password) {
    ElMessage.warning('请输入账号和密码')
    return
  }
  loading.value = true
  try {
    await auth.login(form.username.trim(), form.password)
    ElMessage.success('登录成功,欢迎回来')
    router.push('/dashboard')
  } catch (e) {
    ElMessage.error(e.message || '登录失败')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-wrap">
    <!-- ── 装饰层:星环光晕 + 漂浮玻璃图标 + 光带 ── -->
    <div class="scene" aria-hidden="true">
      <span class="halo" />
      <span class="beam" />
      <span class="chip chip-1"><IconFrame name="cards" :size="21" /></span>
      <span class="chip chip-2"><IconFrame name="tag" :size="19" /></span>
      <span class="chip chip-3"><IconFrame name="globe" :size="21" /></span>
      <span class="chip chip-4"><IconFrame name="logs" :size="19" /></span>
      <span class="chip chip-5"><IconFrame name="shield" :size="17" /></span>
      <span class="chip chip-6"><IconFrame name="star" :size="18" /></span>
    </div>

    <div class="login-panel">
      <!-- 品牌区 -->
      <div class="brand-block rise">
        <div class="logo-ring">
          <div class="brand-logo">
            <IconFrame name="star" :size="40" />
          </div>
        </div>
        <p class="brand-eyebrow">SHIYEKA · CARD SYSTEM</p>
        <h1 class="brand-title text-gradient">{{ site.name || '十夜卡密' }}</h1>
        <p class="brand-slogan">全局统一卡池 · 一卡通用 · 多项目接管</p>
      </div>

      <!-- 玻璃登录卡 -->
      <div class="glass login-card rise d1">
        <div class="card-top">
          <h2 class="card-title">欢迎回来</h2>
          <p class="card-sub">请输入管理员账号登录后台</p>
        </div>
        <el-form @submit.prevent>
          <el-form-item>
            <el-input
              v-model="form.username"
              size="large"
              placeholder="管理员账号"
              :prefix-icon="null"
              autocomplete="username"
              @keyup.enter="onLogin"
            >
              <template #prefix><span class="prefix-ic"><IconFrame name="user" :size="15" /></span></template>
            </el-input>
          </el-form-item>
          <el-form-item>
            <el-input
              v-model="form.password"
              type="password"
              size="large"
              show-password
              placeholder="登录密码"
              autocomplete="current-password"
              @keyup.enter="onLogin"
            >
              <template #prefix><span class="prefix-ic"><IconFrame name="lock" :size="15" /></span></template>
            </el-input>
          </el-form-item>
          <el-button class="glow-btn login-btn" size="large" :loading="loading" @click="onLogin">
            登 录
          </el-button>
        </el-form>
        <p class="login-tip">默认账号 <b>admin</b> · 首次登录后请在侧栏「账号安全」修改</p>
      </div>

      <!-- 特性亮点 -->
      <div class="feature-row rise d2">
        <div v-for="f in FEATURES" :key="f.label" class="glass feature-cell">
          <IconFrame :name="f.icon" :size="18" />
          <div class="f-text">
            <b>{{ f.label }}</b>
            <span>{{ f.caption }}</span>
          </div>
        </div>
      </div>

      <footer class="login-footer rise d3">© 2026 十夜网络 · 卡密管理系统 v1.0</footer>
    </div>
  </div>
</template>

<style scoped>
.login-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  overflow: hidden;
}

/* ══ 装饰层 ══ */
.scene {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}
.halo {
  position: absolute;
  left: 50%;
  top: 46%;
  width: 640px;
  height: 640px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: conic-gradient(
    from 0deg,
    rgba(139, 92, 246, 0.38),
    rgba(79, 124, 255, 0.32),
    rgba(34, 211, 238, 0.36),
    rgba(56, 189, 248, 0.36),
    rgba(139, 92, 246, 0.38)
  );
  filter: blur(56px);
  opacity: 1;
  animation: haloSpin 22s linear infinite;
}
.beam {
  position: absolute;
  top: -160px;
  left: -140px;
  width: 540px;
  height: 420px;
  transform: rotate(24deg);
  background: linear-gradient(120deg, rgba(56, 189, 248, 0.38), transparent 72%);
  filter: blur(26px);
}
.chip {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.85);
  box-shadow: 0 10px 28px rgba(79, 124, 255, 0.18);
  backdrop-filter: blur(8px);
  animation: chipFloat 6s ease-in-out infinite alternate;
}
.chip-1 { left: 11%; top: 18%; width: 54px; height: 54px; animation-duration: 5.6s; }
.chip-2 { right: 12%; top: 22%; width: 48px; height: 48px; animation-duration: 6.8s; animation-delay: -2s; }
.chip-3 { left: 14%; bottom: 24%; width: 52px; height: 52px; animation-duration: 7.2s; animation-delay: -4s; }
.chip-4 { right: 13%; bottom: 27%; width: 47px; height: 47px; animation-duration: 5.9s; animation-delay: -1s; }
.chip-5 { left: 3.5%; top: 44%; width: 40px; height: 40px; opacity: 0.7; animation-duration: 8s; animation-delay: -3s; }
.chip-6 { right: 4.5%; top: 47%; width: 42px; height: 42px; opacity: 0.7; animation-duration: 7.6s; animation-delay: -5s; }

/* ══ 面板 ══ */
.login-panel {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 402px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
}

/* ── 品牌区 ── */
.brand-block {
  text-align: center;
}
.logo-ring {
  position: relative;
  width: 104px;
  height: 104px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
}
.logo-ring::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 32px;
  background: conic-gradient(from 0deg, #22d3ee, #4f7cff, #8b5cf6, #22d3ee);
  filter: blur(14px);
  opacity: 0.55;
  animation: logoRingSpin 5s linear infinite;
}
.brand-logo {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 86px;
  height: 86px;
  border-radius: 26px;
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.92), rgba(236, 242, 255, 0.85));
  border: 1px solid rgba(255, 255, 255, 0.95);
  box-shadow: 0 14px 44px rgba(79, 124, 255, 0.34);
  animation: logoFloat 5s ease-in-out infinite;
}
.brand-eyebrow {
  margin: 18px 0 2px;
  font-size: 11px;
  letter-spacing: 0.34em;
  color: var(--brand-violet);
  font-weight: 700;
  opacity: 0.85;
}
.brand-title {
  margin: 0 0 6px;
  font-size: 32px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-shadow: 0 6px 24px rgba(79, 124, 255, 0.35);
}
.brand-slogan {
  margin: 0;
  font-size: 13px;
  color: var(--ink-2);
  letter-spacing: 0.06em;
}

/* ── 登录卡 ── */
.login-card {
  position: relative;
  width: 100%;
  padding: 26px 28px 22px;
  box-shadow: var(--glass-shadow-lg);
  overflow: hidden;
}
.login-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 12%;
  right: 12%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.95), transparent);
}
.card-top {
  margin-bottom: 16px;
}
.card-title {
  margin: 0 0 3px;
  font-size: 18px;
  font-weight: 800;
  background: linear-gradient(120deg, var(--brand-blue), var(--brand-violet));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.card-sub {
  margin: 0;
  font-size: 12.5px;
  color: var(--ink-3);
}
.login-btn {
  position: relative;
  width: 100%;
  margin-top: 4px;
  letter-spacing: 0.2em;
  overflow: hidden;
}
.login-btn::after {
  content: '';
  position: absolute;
  top: 0;
  left: -80%;
  bottom: 0;
  width: 45%;
  background: linear-gradient(105deg, transparent, rgba(255, 255, 255, 0.55), transparent);
  transform: skewX(-18deg);
  animation: btnSheen 3.6s ease-in-out infinite;
}
.login-tip {
  margin: 14px 0 0;
  text-align: center;
  font-size: 12px;
  color: var(--ink-3);
}
.login-tip b {
  color: var(--brand-blue);
  font-weight: 700;
}

/* ── 特性亮点 ── */
.feature-row {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.feature-cell {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px 12px;
  border-radius: 14px;
  box-shadow: 0 6px 18px rgba(79, 124, 255, 0.1);
}
.f-text {
  display: flex;
  flex-direction: column;
  line-height: 1.35;
  min-width: 0;
}
.f-text b {
  font-size: 13px;
  font-weight: 700;
  color: var(--ink-1);
}
.f-text span {
  font-size: 11px;
  color: var(--ink-3);
  white-space: normal;
  line-height: 1.3;
  font-weight: 500;
}

/* ── 页脚 ── */
.login-footer {
  font-size: 11.5px;
  color: var(--ink-3);
  letter-spacing: 0.08em;
  opacity: 0.75;
}

/* ══ 入场动画 ══ */
.rise {
  animation: riseIn 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.d1 { animation-delay: 0.12s; }
.d2 { animation-delay: 0.24s; }
.d3 { animation-delay: 0.34s; }

/* Element 输入框:玻璃化 */
.prefix-ic {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 9px;
  background: linear-gradient(135deg, rgba(79, 124, 255, 0.24), rgba(139, 92, 246, 0.24));
  border: 1px solid rgba(255, 255, 255, 0.8);
}
:deep(.el-input__wrapper) {
  background: rgba(255, 255, 255, 0.62);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.85) inset, 0 2px 8px rgba(79, 124, 255, 0.08);
  border-radius: 12px;
  padding-left: 13px;
}
:deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1.5px var(--brand-blue) inset, 0 4px 16px rgba(79, 124, 255, 0.22);
}
:deep(.el-input__inner) {
  font-size: 14.5px;
}

/* ══ 关键帧 ══ */
@keyframes haloSpin {
  from { transform: translate(-50%, -50%) rotate(0deg); }
  to { transform: translate(-50%, -50%) rotate(360deg); }
}
@keyframes logoRingSpin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes chipFloat {
  0% { transform: translateY(0) rotate(-3deg); }
  100% { transform: translateY(-14px) rotate(4deg); }
}
@keyframes logoFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
@keyframes btnSheen {
  0% { left: -80%; }
  55%, 100% { left: 140%; }
}
@keyframes riseIn {
  from { opacity: 0; transform: translateY(20px) scale(0.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* ══ 响应式:小屏收掉装饰 ══ */
@media (max-width: 640px) {
  .chip { display: none; }
  .halo { width: 480px; height: 480px; }
  .feature-cell { padding: 9px 10px; }
  .f-text span { display: none; }
  .feature-row { grid-template-columns: repeat(3, 1fr); }
}
</style>