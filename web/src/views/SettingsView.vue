<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import IconFrame from '@/components/IconFrame.vue'
import { get, put, post, upload, downloadUrl } from '@/lib/request'
import { useAuth } from '@/stores/auth'
import { useSite } from '@/stores/site'
import { fmtTime, fmtNum } from '@/utils/format'

const auth = useAuth()
const site = useSite()
const form = reactive({ site_name: '', announcement: '' })
const saving = ref(false)

/* 备份 */
const backups = ref([])
const backupLoading = ref(false)
const restoring = ref(false)

onMounted(async () => {
  try {
    const { settings } = await get('/api/admin/settings/all')
    form.site_name = settings.site_name || '十夜卡密'
    form.announcement = settings.announcement || ''
  } catch (e) {
    ElMessage.error(e.message)
  }
  loadBackups()
})

async function onSave() {
  if (!form.site_name.trim()) {
    ElMessage.warning('站点名称不能为空')
    return
  }
  saving.value = true
  try {
    await put('/api/admin/settings/update', {
      site_name: form.site_name.trim(),
      announcement: form.announcement,
    })
    ElMessage.success('保存成功')
    // 立即刷新站点信息(登录页 / 侧边栏 / 浏览器标签同步生效,免刷新)
    await site.fetchSite(true)
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    saving.value = false
  }
}

async function loadBackups() {
  try {
    const r = await get('/api/admin/backup/list')
    backups.value = r.list || []
  } catch (e) {
    ElMessage.error(e.message)
  }
}

async function onBackup() {
  backupLoading.value = true
  try {
    const r = await post('/api/admin/backup/create', {})
    ElMessage.success(`备份完成:${r.name}`)
    loadBackups()
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    backupLoading.value = false
  }
}

function onDownload(row) {
  downloadUrl(`/api/admin/backup/download?name=${encodeURIComponent(row.name)}`, row.name).catch((e) =>
    ElMessage.error(e.message)
  )
}

async function onRestoreFile(file) {
  try {
    await ElMessageBox.confirm(
      '恢复将用上传的备份【整体替换】当前数据库,当前数据会丢失。请确认已再次备份。',
      '危险操作确认',
      { type: 'warning', confirmButtonText: '确认恢复', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  restoring.value = true
  try {
    const fd = new FormData()
    fd.append('file', file.raw)
    const r = await upload('/api/admin/backup/restore', fd)
    ElMessage.success('数据库已恢复,当前已生效')
    loadBackups()
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    restoring.value = false
  }
}
</script>

<template>
  <div class="settings-page">
    <h2 class="page-title"><IconFrame name="settings" :size="22" /> 系统设置</h2>

    <div class="set-grid">
      <!-- 站点信息 -->
      <div class="glass set-card">
        <div class="set-head">
          <span class="set-title">站点信息</span>
          <span class="set-sub">显示在登录页与仪表盘</span>
        </div>
        <el-form label-width="86px">
          <el-form-item label="站点名称">
            <el-input v-model="form.site_name" maxlength="30" show-word-limit placeholder="例如:十夜卡密" />
          </el-form-item>
          <el-form-item label="首页公告">
            <el-input v-model="form.announcement" type="textarea" :rows="3" maxlength="200" show-word-limit placeholder="展示在仪表盘欢迎区" />
          </el-form-item>
          <el-form-item>
            <el-button class="glow-btn" :loading="saving" @click="onSave">保存设置</el-button>
          </el-form-item>
        </el-form>
      </div>

      <!-- 账号与安全 -->
      <div class="glass set-card">
        <div class="set-head">
          <span class="set-title">账号与安全</span>
          <span class="set-sub">当前登录账号</span>
        </div>
        <div class="info-rows">
          <div class="info-row hover-strip">
            <span class="info-label"><IconFrame name="user" :size="15" /> 账号</span>
            <span class="info-value">{{ auth.admin?.username }}</span>
          </div>
          <div class="info-row hover-strip">
            <span class="info-label"><IconFrame name="shield" :size="15" /> 角色</span>
            <span class="info-value">{{ auth.isSuper ? '超级管理员' : '管理员' }}</span>
          </div>
          <div class="info-row hover-strip">
            <span class="info-label"><IconFrame name="ban" :size="15" /> 登录防爆破</span>
            <span class="info-value">连续失败 5 次锁定 15 分钟</span>
          </div>
          <div class="info-row hover-strip">
            <span class="info-label"><IconFrame name="lock" :size="15" /> 会话</span>
            <span class="info-value">7 天有效 · 侧栏菜单可改用户名/密码</span>
          </div>
        </div>
      </div>

      <!-- 关于 -->
      <div class="glass set-card">
        <div class="set-head">
          <span class="set-title">关于系统</span>
          <span class="set-sub">{{ site.name || '十夜卡密' }} · 综合性卡密管理系统</span>
        </div>
        <div class="info-rows">
          <div class="info-row hover-strip">
            <span class="info-label"><IconFrame name="star" :size="15" /> 版本</span>
            <span class="info-value">v1.0</span>
          </div>
          <div class="info-row hover-strip">
            <span class="info-label"><IconFrame name="cards" :size="15" /> 存储</span>
            <span class="info-value">SQLite · 单文件数据库</span>
          </div>
          <div class="info-row hover-strip">
            <span class="info-label"><IconFrame name="doc" :size="15" /> 文档</span>
            <span class="info-value">docs/对接文档.md · SDK</span>
          </div>
        </div>
      </div>

      <!-- 数据与备份 -->
      <div class="glass set-card backup-card">
        <div class="set-head">
          <span class="set-title">数据与备份</span>
          <span class="set-sub">SQLite 热备份(不锁库)</span>
        </div>
        <div class="backup-actions">
          <el-button class="glow-btn" :loading="backupLoading" @click="onBackup">
            <IconFrame name="download" :size="14" /> 立即备份
          </el-button>
          <el-upload
            v-if="auth.isSuper"
            :show-file-list="false"
            :before-upload="onRestoreFile"
            accept=".db"
          >
            <el-button class="glow-ghost" :loading="restoring">
              <IconFrame name="upload" :size="14" /> 恢复备份(超管)
            </el-button>
          </el-upload>
        </div>

        <div v-if="backups.length" class="backup-list">
          <div v-for="b in backups" :key="b.name" class="backup-row hover-strip">
            <IconFrame name="doc" :size="14" />
            <span class="backup-name mono">{{ b.name }}</span>
            <span class="backup-meta">{{ fmtNum(b.size) }} B · {{ fmtTime(b.created_at) }}</span>
            <el-button size="small" text @click="onDownload(b)">
              <IconFrame name="download" :size="13" /> 下载
            </el-button>
          </div>
        </div>
        <p v-else class="backup-empty">还没有备份 —— 建议每日备份一次,部署后可用 cron 自动执行。</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  display: flex;
  flex-direction: column;
  gap: var(--space);
}
.page-title {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 22px;
  font-weight: 800;
}

.set-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}
@media (max-width: 960px) {
  .set-grid {
    grid-template-columns: 1fr;
  }
}
.set-card {
  padding: 24px 26px;
}
.set-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 18px;
}
.set-title {
  font-size: 16px;
  font-weight: 700;
}
.set-sub {
  font-size: 12px;
  color: var(--ink-3);
}

.info-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 14px;
  border-radius: 12px;
}
.info-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
  color: var(--ink-2);
}
.info-value {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--ink-1);
}

:deep(.el-input__wrapper),
:deep(.el-textarea__inner) {
  background: rgba(255, 255, 255, 0.6);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.85) inset, 0 2px 8px rgba(79, 124, 255, 0.08);
  border-radius: 12px;
}
.backup-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 14px;
}
.backup-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 260px;
  overflow: auto;
}
.backup-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 10px;
}
.backup-name {
  flex: 1;
  font-size: 12.5px;
  color: var(--ink-1);
}
.backup-meta {
  font-size: 11.5px;
  color: var(--ink-3);
}
.backup-empty {
  margin: 6px 0 0;
  padding: 14px;
  text-align: center;
  color: var(--ink-3);
  font-size: 12.5px;
  border: 1px dashed rgba(79, 124, 255, 0.2);
  border-radius: 12px;
}
</style>