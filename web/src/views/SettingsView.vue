<script setup>
import { ref, reactive, onMounted } from 'vue'
import {
  ElButton, ElForm, ElFormItem, ElInput, ElMessage, ElMessageBox, ElUpload,
} from 'element-plus'
import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/form/style/css'
import 'element-plus/es/components/input/style/css'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import 'element-plus/es/components/upload/style/css'
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
    await downloadUrl(`/api/admin/backup/download?name=${encodeURIComponent(r.name)}`, r.name)
    ElMessage.success('完整备份已创建并开始下载')
    await loadBackups()
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
      '恢复会整体替换当前数据。完整迁移包还会恢复管理员账号和系统密钥，完成后需使用备份中的账号重新登录。',
      '恢复完整备份',
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
    ElMessage.success(r.portable ? '完整数据已恢复，即将返回登录页' : '数据库已恢复，当前已生效')
    if (r.requiresLogin) {
      await auth.logout()
      setTimeout(() => { window.location.href = '/login' }, 900)
    } else {
      loadBackups()
    }
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
        <el-form class="site-form" label-position="top">
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
            <span class="info-value">{{ site.version || 'v1.0.1' }} · GitHub Release 自动检查</span>
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
          <span class="set-title">完整备份与迁移</span>
          <span class="set-sub">下载后可在新服务器恢复</span>
        </div>
        <div class="migration-note">
          <span class="migration-icon"><IconFrame name="shield" :size="19" /></span>
          <div>
            <b>一份文件，完整迁移</b>
            <p>包含管理员、站点设置、项目、套餐、卡密、日志及系统密钥。新服务器安装后上传即可恢复。</p>
          </div>
        </div>
        <div class="backup-actions">
          <el-button v-if="auth.isSuper" class="glow-btn" :loading="backupLoading" @click="onBackup">
            <IconFrame name="download" :size="14" /> 创建并下载完整备份
          </el-button>
          <el-upload
            v-if="auth.isSuper"
            :auto-upload="false"
            :show-file-list="false"
            :on-change="onRestoreFile"
            accept=".kmbackup,.db"
          >
            <el-button class="glow-ghost" :loading="restoring">
              <IconFrame name="upload" :size="14" /> 上传并恢复
            </el-button>
          </el-upload>
        </div>

        <div v-if="backups.length" class="backup-list">
          <div v-for="b in backups" :key="b.name" class="backup-row hover-strip">
            <IconFrame name="doc" :size="14" />
            <div class="backup-main">
              <span class="backup-name mono" :title="b.name">{{ b.name }}</span>
              <span class="backup-detail">
                <span class="backup-kind">{{ b.kind === 'portable' ? '完整迁移包' : '数据库快照' }}</span>
                <span class="backup-meta">{{ fmtNum(b.size) }} B · {{ fmtTime(b.created_at) }}</span>
              </span>
            </div>
            <el-button v-if="auth.isSuper" size="small" text @click="onDownload(b)">
              <IconFrame name="download" :size="13" /> 下载
            </el-button>
          </div>
        </div>
        <p v-else class="backup-empty">还没有备份。建议创建后下载到本地或云盘妥善保存。</p>
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
:deep(.site-form .el-form-item) { margin-bottom: 18px; }
:deep(.site-form .el-form-item__label) {
  height: auto;
  margin-bottom: 8px;
  padding: 0;
  color: var(--ink-2);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.4;
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
.migration-note {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 15px;
  margin-bottom: 15px;
  border: 1px solid rgba(79,124,255,.1);
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(34,211,238,.08), rgba(139,92,246,.08));
}
.migration-icon {
  display: grid;
  flex: none;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 12px;
  color: var(--brand-blue);
  background: rgba(255,255,255,.72);
  box-shadow: 0 5px 14px rgba(79,124,255,.12);
}
.migration-note b { color: var(--ink-1); font-size: 13.5px; }
.migration-note p { margin: 3px 0 0; color: var(--ink-2); font-size: 11.5px; line-height: 1.65; }
.backup-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 260px;
  overflow: auto;
}
.backup-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 10px;
}
.backup-name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  color: var(--ink-1);
}
.backup-main { min-width: 0; }
.backup-detail { display: flex; align-items: center; gap: 7px; margin-top: 3px; }
.backup-meta {
  font-size: 11.5px;
  color: var(--ink-3);
}
.backup-kind {
  flex: none;
  padding: 2px 7px;
  border-radius: 999px;
  color: var(--brand-blue);
  background: rgba(79,124,255,.09);
  font-size: 10px;
  font-weight: 700;
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
@media (max-width: 620px) {
  .set-card { padding: 20px 18px; }
  .set-head { align-items: flex-start; flex-direction: column; gap: 4px; }
  .backup-actions { align-items: stretch; flex-direction: column; }
  .backup-actions .el-button, .backup-actions :deep(.el-upload) { width: 100%; }
  .backup-row { align-items: flex-start; }
  .backup-detail { align-items: flex-start; flex-direction: column; gap: 4px; }
}
</style>
