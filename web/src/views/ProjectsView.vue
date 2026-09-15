<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import IconFrame from '@/components/IconFrame.vue'
import PageOverview from '@/components/PageOverview.vue'
import { get, post, put, del } from '@/lib/request'
import { fmtTime } from '@/utils/format'

const list = ref([])
const loading = ref(false)

const dialog = reactive({ open: false, mode: 'create', id: null, submitting: false })
const form = reactive({
  name: '',
  status: 1,
  callback_url: '',
  ip_whitelist: '',
  rate_limit: 60,
  remark: '',
})

/* ── 密钥展示(创建/重置后仅此一次) ── */
const secretDlg = reactive({ open: false, appKey: '', appSecret: '', name: '' })

async function loadAll() {
  loading.value = true
  try {
    const r = await get('/api/admin/projects/list')
    list.value = r.list || []
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    loading.value = false
  }
}

function openCreate() {
  dialog.mode = 'create'
  dialog.id = null
  Object.assign(form, { name: '', status: 1, callback_url: '', ip_whitelist: '', rate_limit: 60, remark: '' })
  dialog.open = true
}

function openEdit(row) {
  dialog.mode = 'edit'
  dialog.id = row.id
  Object.assign(form, {
    name: row.name,
    status: row.status,
    callback_url: row.callback_url || '',
    ip_whitelist: row.ip_whitelist || '',
    rate_limit: row.rate_limit || 60,
    remark: row.remark || '',
  })
  dialog.open = true
}

async function onSubmit() {
  if (!form.name.trim()) return ElMessage.warning('请输入项目名称')
  dialog.submitting = true
  try {
    const payload = {
      name: form.name.trim(),
      status: form.status,
      callback_url: form.callback_url.trim(),
      ip_whitelist: form.ip_whitelist.trim(),
      rate_limit: form.rate_limit,
      remark: form.remark.trim(),
    }
    if (dialog.mode === 'create') {
      const r = await post('/api/admin/projects/create', payload)
      ElMessage.success('项目创建成功')
      dialog.open = false
      showSecret('新建项目 · 密钥已生成', r.app_key, r.app_secret)
    } else {
      await put(`/api/admin/projects/${dialog.id}`, payload)
      ElMessage.success('项目已更新')
      dialog.open = false
    }
    loadAll()
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    dialog.submitting = false
  }
}

async function onResetSecret(row) {
  try {
    await ElMessageBox.confirm(
      `确定重置「${row.name}」的 Secret?\n旧密钥立即失效,对方网站需要同步更新,请谨慎操作。`,
      '重置密钥确认',
      { type: 'warning', confirmButtonText: '确认重置', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  try {
    const r = await post(`/api/admin/projects/${row.id}/reset-secret`, {})
    showSecret('密钥已重置 · 旧密钥立即失效', row.app_key, r.app_secret)
  } catch (e) {
    ElMessage.error(e.message)
  }
}

async function onDelete(row) {
  try {
    await ElMessageBox.confirm(
      `确定删除项目「${row.name}」?`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  try {
    const r = await del(`/api/admin/projects/${row.id}`)
    ElMessage.success(r?.soft ? `已被 ${r.used} 张卡绑定,已改为停用` : '已删除')
    loadAll()
  } catch (e) {
    ElMessage.error(e.message)
  }
}

function copyText(text, tip) {
  navigator.clipboard?.writeText(text).then(
    () => ElMessage.success(tip || '已复制'),
    () => ElMessage.warning('复制失败,请手动选择复制')
  )
}

function showSecret(title, appKey, appSecret) {
  Object.assign(secretDlg, { open: true, title, appKey, appSecret, name: '' })
}

onMounted(loadAll)
</script>

<template>
  <div class="projects-page">
    <div class="page-head">
      <h2 class="page-title"><IconFrame name="globe" :size="22" /> 项目管理</h2>
      <el-button class="glow-btn" @click="openCreate">
        <IconFrame name="plus" :size="14" /> 新建项目
      </el-button>
    </div>

    <!-- 本页数据总览 -->
    <PageOverview scope="projects" />

    <div class="intro glass">
      <IconFrame name="shield" :size="18" />
      <div>
        <b>接入授权中心</b> —— 每个网站项目领取一组 <span class="mono">app_key / app_secret</span>,
        配置到对方网站的对接代码后,即可通过 <span class="mono">/api/v1/card/*</span> 验卡。
        〔一卡通用〕时激活即归属该项目,其它项目验卡将被拒绝。
      </div>
    </div>

    <div v-loading="loading" class="glass table-card">
      <el-table :data="list" style="width: 100%" row-key="id">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column label="名称" min-width="140">
          <template #default="{ row }">
            <span class="p-name">{{ row.name }}</span>
            <el-tooltip v-if="row.remark" :content="row.remark" placement="top">
              <IconFrame name="doc" :size="13" class="remark-icon" />
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="App Key" min-width="200">
          <template #default="{ row }">
            <div class="key-cell">
              <span class="mono">{{ row.app_key }}</span>
              <el-button size="small" text @click="copyText(row.app_key, 'App Key 已复制')">
                <IconFrame name="copy" :size="13" />
              </el-button>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <span :class="row.status === 1 ? 'pill pill-ok' : 'pill pill-disabled'">
              {{ row.status === 1 ? '启用' : '停用' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="限频" width="90">
          <template #default="{ row }">
            <span class="dim">{{ row.rate_limit }}/分</span>
          </template>
        </el-table-column>
        <el-table-column label="回调地址" min-width="150">
          <template #default="{ row }">
            <span class="dim callback-text">{{ row.callback_url || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="160">
          <template #default="{ row }">
            <span class="dim">{{ fmtTime(row.created_at) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="330" fixed="right">
          <template #default="{ row }">
            <el-button size="small" class="glow-ghost" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" text type="warning" @click="onResetSecret(row)">
              <IconFrame name="refresh" :size="12" /> 重置密钥
            </el-button>
            <el-button size="small" text type="danger" @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 新建 / 编辑 -->
    <el-dialog v-model="dialog.open" :title="dialog.mode === 'create' ? '新建项目' : '编辑项目'" width="520px" align-center>
      <el-form label-width="96px">
        <el-form-item label="项目名称" required>
          <el-input v-model="form.name" maxlength="30" placeholder="如:某某官网 / 某某站" />
        </el-form-item>
        <el-form-item label="回调地址">
          <el-input v-model="form.callback_url" placeholder="https://你的网站.com/api/card-activate(可选)" />
          <div class="form-tip">激活成功时,本系统会向该地址 POST 一条通知(失败重试 3 次)</div>
        </el-form-item>
        <el-form-item label="IP 白名单">
          <el-input v-model="form.ip_whitelist" placeholder="1.2.3.4, 5.6.7.8(逗号分隔,留空 = 不限制)" />
        </el-form-item>
        <el-form-item label="限频">
          <el-input-number v-model="form.rate_limit" :min="0" :max="100000" />
          <div class="form-tip">每分钟最大请求数,0 = 不限制</div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" maxlength="100" type="textarea" :rows="2" placeholder="内部备注(对方不显示)" />
        </el-form-item>
        <el-form-item v-if="dialog.mode === 'edit'" label="状态">
          <el-switch v-model="form.status" :active-value="1" :inactive-value="0" active-text="启用" inactive-text="停用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog.open = false">取消</el-button>
        <el-button class="glow-btn" :loading="dialog.submitting" @click="onSubmit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 密钥展示(仅一次) -->
    <el-dialog v-model="secretDlg.open" :title="secretDlg.title" width="560px" align-center :close-on-click-modal="false">
      <div class="secret-warn glass">
        <IconFrame name="alert" :size="18" />
        <span>Secret 仅在此刻展示一次,请立即复制保存。关闭后无法再次查看,只能重置。</span>
      </div>
      <div class="secret-block">
        <div class="secret-row">
          <span class="secret-label">App Key</span>
          <code class="mono" @click="copyText(secretDlg.appKey, 'App Key 已复制')">{{ secretDlg.appKey }}</code>
        </div>
        <div class="secret-row">
          <span class="secret-label">App Secret</span>
          <code class="mono secret-value" @click="copyText(secretDlg.appSecret, 'App Secret 已复制')">{{ secretDlg.appSecret }}</code>
        </div>
      </div>
      <template #footer>
        <el-button class="glow-btn" @click="copyText(secretDlg.appSecret, 'App Secret 已复制')">
          <IconFrame name="copy" :size="13" /> 复制 Secret
        </el-button>
        <el-button @click="secretDlg.open = false">我已保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.projects-page {
  display: flex;
  flex-direction: column;
  gap: var(--space);
}
.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.page-title {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 22px;
  font-weight: 800;
}
.intro {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  font-size: 13px;
  color: var(--ink-2);
  line-height: 1.7;
}
.intro .mono {
  color: var(--brand-blue);
}
.table-card {
  padding: 10px 14px 16px;
}
.p-name {
  font-weight: 600;
}
.remark-icon {
  margin-left: 6px;
  opacity: 0.65;
}
.key-cell {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 13px;
}
.mono {
  font-family: Consolas, 'Courier New', monospace;
  letter-spacing: 0.01em;
}
.dim {
  color: var(--ink-3);
  font-size: 12.5px;
}
.callback-text {
  display: inline-block;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}
.form-tip {
  font-size: 12px;
  color: var(--ink-3);
  margin-top: 4px;
  line-height: 1.5;
}
.secret-warn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  color: #b45309;
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(245, 158, 11, 0.06));
  font-size: 13px;
  margin-bottom: 14px;
}
.secret-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.secret-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.secret-label {
  width: 86px;
  flex-shrink: 0;
  font-size: 12.5px;
  color: var(--ink-3);
  font-weight: 600;
}
.secret-row code {
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(79, 124, 255, 0.08);
  border: 1px solid rgba(79, 124, 255, 0.15);
  color: var(--brand-blue);
  font-size: 13px;
  word-break: break-all;
  cursor: pointer;
  user-select: all;
  flex: 1;
}
.secret-value {
  color: var(--brand-violet) !important;
}
:deep(.el-table) {
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-header-bg-color: rgba(79, 124, 255, 0.06);
  --el-table-border-color: rgba(79, 124, 255, 0.1);
  --el-table-row-hover-bg-color: rgba(255, 255, 255, 0.6);
}
</style>