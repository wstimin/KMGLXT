<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuth } from '@/stores/auth'
import { useSite } from '@/stores/site'
import { post } from '@/lib/request'
import IconFrame from './IconFrame.vue'

const auth = useAuth()
const site = useSite()
const router = useRouter()

// 侧边导航
const navs = [
  { path: '/dashboard', label: '仪表盘', icon: 'dashboard' },
  { path: '/cards', label: '卡密', icon: 'cards' },
  { path: '/card-types', label: '套餐', icon: 'tag' },
  { path: '/projects', label: '项目', icon: 'globe' },
  { path: '/logs', label: '日志', icon: 'logs' },
  { path: '/settings', label: '系统设置', icon: 'settings' },
]

/* 账号安全(改用户名 / 改密码) */
const showAccount = ref(false)
const acctTab = ref('username')
const acct = reactive({ newUsername: '', password: '' })
const pwd = reactive({ oldPassword: '', newPassword: '', confirm: '' })
const saving = ref(false)

function onCommand(cmd) {
  if (cmd === 'logout') doLogout()
  else if (cmd === 'account') {
    acct.newUsername = ''
    acct.password = ''
    pwd.oldPassword = ''
    pwd.newPassword = ''
    pwd.confirm = ''
    acctTab.value = 'username'
    showAccount.value = true
  }
}

async function doLogout() {
  await auth.logout()
  router.push('/login')
}

async function saveAccount() {
  // 修改用户名
  if (acctTab.value === 'username') {
    const name = acct.newUsername.trim()
    if (!name) return ElMessage.warning('请输入新的用户名')
    if (name.length < 2 || name.length > 32) return ElMessage.warning('用户名长度需在 2-32 位之间')
    if (!acct.password) return ElMessage.warning('请输入当前密码确认')
    saving.value = true
    try {
      const r = await post('/api/admin/auth/change-username', {
        newUsername: name,
        password: acct.password,
      })
      auth.admin = r.admin
      ElMessage.success(`用户名已更新为「${name}」`)
      showAccount.value = false
    } catch (e) {
      ElMessage.error(e.message)
    } finally {
      saving.value = false
    }
    return
  }

  // 修改密码
  if (!pwd.oldPassword || !pwd.newPassword) return ElMessage.warning('请填写原密码与新密码')
  if (pwd.newPassword.length < 6) return ElMessage.warning('新密码至少 6 位')
  if (pwd.newPassword !== pwd.confirm) return ElMessage.warning('两次输入的新密码不一致')
  saving.value = true
  try {
    await post('/api/admin/auth/change-password', {
      oldPassword: pwd.oldPassword,
      newPassword: pwd.newPassword,
    })
    ElMessage.success('密码修改成功,下次登录请用新密码')
    showAccount.value = false
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="shell">
    <!-- 左侧玻璃侧边栏 -->
    <aside class="sidebar glass">
      <div class="brand" @click="router.push('/dashboard')">
        <span class="brand-mark"><IconFrame name="star" :size="22" /></span>
        <span class="brand-text">
          <span class="brand-name text-gradient">{{ site.name || '十夜卡密' }}</span>
          <span class="brand-sub">统一卡池 · 一卡通用</span>
        </span>
      </div>

      <nav class="navs">
        <router-link
          v-for="n in navs"
          :key="n.path"
          :to="n.path"
          class="nav-item"
          active-class="active"
        >
          <IconFrame :name="n.icon" :size="18" />
          <span class="nav-label">{{ n.label }}</span>
        </router-link>
      </nav>

      <div class="sidebar-foot">
        <el-dropdown trigger="click" @command="onCommand" popper-class="glass-popper" placement="top">
          <div class="user-chip hover-strip">
            <span class="avatar"><IconFrame name="user" :size="17" /></span>
            <span class="user-meta">
              <span class="user-name">{{ auth.admin?.username }}</span>
              <span class="role-text" :class="auth.isSuper ? 'role-super' : 'role-admin'">
                {{ auth.isSuper ? '超级管理员' : '管理员' }}
              </span>
            </span>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="account">
                <div class="dd-item"><IconFrame name="shield" :size="14" /><span>账号安全(改用户名/密码)</span></div>
              </el-dropdown-item>
              <el-dropdown-item command="logout" divided>
                <div class="dd-item"><IconFrame name="logout" :size="14" /><span>退出登录</span></div>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </aside>

    <main class="content">
      <router-view v-slot="{ Component }">
        <transition name="page" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>

    <!-- 账号安全 -->
    <el-dialog v-model="showAccount" title="账号安全" width="480px" align-center>
      <el-tabs v-model="acctTab">
        <el-tab-pane label="修改用户名" name="username">
          <el-form label-width="88px" @submit.prevent>
            <el-form-item label="新的用户名">
              <el-input v-model="acct.newUsername" maxlength="32" placeholder="2-32 位:字母 / 数字 / 下划线 / 中文" />
            </el-form-item>
            <el-form-item label="当前密码">
              <el-input v-model="acct.password" type="password" show-password placeholder="输入当前密码确认身份" />
            </el-form-item>
          </el-form>
        </el-tab-pane>
        <el-tab-pane label="修改密码" name="password">
          <el-form label-width="88px" @submit.prevent>
            <el-form-item label="原密码">
              <el-input v-model="pwd.oldPassword" type="password" show-password placeholder="请输入原密码" />
            </el-form-item>
            <el-form-item label="新密码">
              <el-input v-model="pwd.newPassword" type="password" show-password placeholder="至少 6 位" />
            </el-form-item>
            <el-form-item label="确认新密码">
              <el-input v-model="pwd.confirm" type="password" show-password placeholder="再次输入新密码" />
            </el-form-item>
          </el-form>
        </el-tab-pane>
      </el-tabs>
      <template #footer>
        <el-button @click="showAccount = false">取消</el-button>
        <el-button class="glow-btn" :loading="saving" @click="saveAccount">
          {{ acctTab === 'username' ? '确认修改用户名' : '确认修改密码' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  display: flex;
}

/* ── 左侧玻璃侧边栏 ── */
.sidebar {
  position: fixed;
  top: 14px;
  bottom: 14px;
  left: 14px;
  width: 236px;
  z-index: 50;
  display: flex;
  flex-direction: column;
  padding: 18px 14px 16px;
  border-radius: 22px;
  box-sizing: border-box;
  overflow: hidden;
}
.brand {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 4px 8px 16px;
  cursor: pointer;
  user-select: none;
}
.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  flex: none;
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.9), 0 5px 16px rgba(79, 124, 255, 0.32);
}
.brand-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.brand-name {
  font-size: 19px;
  font-weight: 800;
  letter-spacing: 0.02em;
}
.brand-sub {
  font-size: 11.5px;
  color: var(--ink-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.navs {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding-top: 8px;
  overflow-y: auto;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10.5px 14px;
  border-radius: 13px;
  font-size: 14.5px;
  font-weight: 500;
  color: var(--ink-2);
  text-decoration: none;
  transition: all 0.22s ease;
}
.nav-item .icon-frame {
  filter: drop-shadow(0 2px 4px rgba(79, 124, 255, 0.28));
  flex: none;
}
.nav-item:hover {
  color: var(--brand-blue);
  background: rgba(255, 255, 255, 0.62);
}
.nav-item.active {
  color: #fff;
  background: var(--grad-main);
  box-shadow: 0 8px 20px rgba(79, 124, 255, 0.36);
}
.nav-item.active .icon-frame {
  filter: drop-shadow(0 2px 6px rgba(255, 255, 255, 0.55));
}

.sidebar-foot {
  padding-top: 12px;
  border-top: 1px solid rgba(79, 124, 255, 0.14);
}
.user-chip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 13px;
  cursor: pointer;
  outline: none;
  transition: background 0.2s ease;
}
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: 50%;
  background: var(--grad-main);
  box-shadow: 0 4px 12px rgba(79, 124, 255, 0.35);
}
.avatar .icon-frame {
  filter: drop-shadow(0 1px 3px rgba(255, 255, 255, 0.6));
}
.user-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.user-name {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--ink-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.role-text {
  font-size: 11px;
  line-height: 1.2;
}
.role-super {
  color: #8b5cf6;
}
.role-admin {
  color: #64748b;
}

/* ── 内容区:大气留白 ── */
.content {
  flex: 1;
  min-width: 0;
  margin-left: 264px;
  padding: 28px 36px 60px;
}

.dd-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

/* ── 窄屏:收成纯图标栏 ── */
@media (max-width: 900px) {
  .sidebar {
    width: 74px;
    padding: 16px 10px 14px;
  }
  .brand {
    justify-content: center;
    padding: 4px 0 14px;
  }
  .brand-text,
  .nav-label,
  .user-meta {
    display: none;
  }
  .user-chip {
    justify-content: center;
  }
  .nav-item {
    justify-content: center;
    padding: 11px;
  }
  .content {
    margin-left: 92px;
    padding: 24px 20px 50px;
  }
}
</style>

<style>
/* 下拉菜单玻璃质感(非 scoped,作用于 popper 挂载层) */
.glass-popper {
  background: rgba(255, 255, 255, 0.94) !important;
  backdrop-filter: blur(16px);
  border: 1px solid var(--glass-border) !important;
  border-radius: 14px;
  box-shadow: var(--glass-shadow) !important;
}
.glass-popper .el-dropdown-menu__item {
  border-radius: 8px;
  margin: 0 6px;
  padding: 7px 10px;
}
.glass-popper .el-dropdown-menu__item:not(.is-disabled):hover {
  color: var(--brand-blue);
  background: rgba(79, 124, 255, 0.08);
}
/* 账号安全弹窗:输入框玻璃化 */
.account-tabs .el-tabs__nav-wrap::after {
  height: 1px;
  background: rgba(79, 124, 255, 0.15);
}
</style>