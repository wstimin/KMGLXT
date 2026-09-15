<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import IconFrame from '@/components/IconFrame.vue'
import StatusPill from '@/components/StatusPill.vue'
import PageOverview from '@/components/PageOverview.vue'
import { get, post, upload, downloadUrl } from '@/lib/request'
import { fmtTime } from '@/utils/format'

/* ---------- 数据 ---------- */
const list = ref([])
const types = ref([])
const projects = ref([])
const total = ref(0)
const loading = ref(false)
const selected = ref([])

const filters = reactive({
  keyword: '',
  type_id: '',
  status: '',
  project: '',
  range: null, // [Date, Date]
})

const page = ref(1)
const pageSize = ref(20)

/* ---------- 加载 ---------- */
async function loadOptions() {
  try {
    const [t, p] = await Promise.all([
      get('/api/admin/cardTypes/options'),
      get('/api/admin/projects/options'),
    ])
    types.value = t.list || []
    projects.value = p.list || []
  } catch (e) {
    ElMessage.error(e.message)
  }
}

function buildQuery() {
  const qs = new URLSearchParams()
  qs.set('page', page.value)
  qs.set('pageSize', pageSize.value)
  if (filters.keyword.trim()) qs.set('keyword', filters.keyword.trim().toUpperCase())
  if (filters.type_id) qs.set('type_id', filters.type_id)
  if (filters.status) qs.set('status', filters.status)
  if (filters.project) qs.set('project', filters.project)
  if (filters.range && filters.range.length === 2) {
    qs.set('from', Math.floor(filters.range[0].getTime() / 1000))
    qs.set('to', Math.floor(filters.range[1].getTime() / 1000))
  }
  return qs
}

async function loadList() {
  loading.value = true
  try {
    const data = await get(`/api/admin/cards/list?${buildQuery()}`)
    list.value = data.list || []
    total.value = data.total || 0
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    loading.value = false
  }
}

function onSearch() {
  page.value = 1
  loadList()
}
function onReset() {
  Object.assign(filters, { keyword: '', type_id: '', status: '', project: '', range: null })
  page.value = 1
  loadList()
}

/* ---------- 批量操作 ---------- */
const BATTER_ACTION = {
  disable: { label: '禁用', confirm: '禁用后卡密将无法被使用,确定继续?', tone: 'warning' },
  enable: { label: '启用', confirm: '恢复已禁用的卡密,确定继续?', tone: 'primary' },
  void: { label: '作废', confirm: '作废后卡密永久失效且不可恢复,确定继续?', tone: 'danger' },
  reset: { label: '重置', confirm: '已使用的卡将回到「未使用」状态(清空归属与时间),确定继续?', tone: 'warning' },
  delete: { label: '删除', confirm: '将物理删除所选卡密,不可恢复,确定继续?', tone: 'danger' },
}

async function batch(action, manualIds) {
  const ids = manualIds || selected.value.map((r) => r.id)
  if (!ids.length) return ElMessage.warning('请先选择卡密')
  const meta = BATTER_ACTION[action]
  try {
    await ElMessageBox.confirm(meta.confirm, `${meta.label}确认`, {
      type: meta.tone === 'danger' ? 'error' : 'warning',
      confirmButtonText: meta.label,
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    const r = await post('/api/admin/cards/batch', { action, ids })
    ElMessage.success(`完成:${r.affected}/${r.total} 张`)
    selected.value = []
    loadList()
  } catch (e) {
    ElMessage.error(e.message)
  }
}

/* ---------- 导出 ---------- */
function onExport(format) {
  const qs = buildQuery()
  qs.delete('page')
  qs.delete('pageSize')
  downloadUrl(`/api/admin/cards/export?format=${format}&${qs}`, `卡密-${format}.txt`).catch((e) =>
    ElMessage.error(e.message)
  )
}

/* ---------- 生成 ---------- */
const genDialog = reactive({ open: false, submitting: false })
const genForm = reactive({
  count: 10,
  length: 16,
  prefix: 'SY',
  charset_mode: 'default',
  custom_charset: '',
  check_digit: false,
  type_id: null,
  remark: '',
})
const genResult = reactive({ open: false, inserted: 0, batchNo: '', cards: [] })

function openGen() {
  if (!types.value.length) {
    ElMessage.warning('请先在「套餐」页面创建套餐')
    return
  }
  genForm.type_id = types.value[0]?.id || null
  genDialog.open = true
}

function typeLabel(t) {
  if (t.kind === 'duration') return `${t.name}(${t.days}天)`
  if (t.kind === 'times') return `${t.name}(${t.times}次)`
  if (t.kind === 'money') return `${t.name}(${t.amount}元)`
  return `${t.name}(永久)`
}

async function onSubmitGen() {
  const c = Number(genForm.count)
  if (!c || c < 1) return ElMessage.warning('生成数量至少 1 张')
  if (c > 10000) return ElMessage.warning('单批最多 10000 张')
  const l = Number(genForm.length)
  if (!l || l < 8 || l > 32) return ElMessage.warning('卡密长度需在 8~32 之间')
  if (genForm.prefix.length > 20) return ElMessage.warning('前缀最长 20 位')
  if (!genForm.type_id) return ElMessage.warning('请选择套餐')
  genDialog.submitting = true
  try {
    const data = await post('/api/admin/cards/generate', {
      count: c,
      length: l,
      prefix: genForm.prefix.toUpperCase(),
      charset_mode: genForm.charset_mode,
      custom_charset: genForm.custom_charset,
      check_digit: genForm.check_digit,
      type_id: genForm.type_id,
      remark: genForm.remark,
    })
    genResult.inserted = data.inserted
    genResult.batchNo = data.batchNo
    genResult.cards = data.cards || []
    genDialog.open = false
    genResult.open = true
    loadList()
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    genDialog.submitting = false
  }
}

function copyAll() {
  if (!genResult.cards.length) return
  navigator.clipboard
    ?.writeText(genResult.cards.join('\n'))
    .then(() => ElMessage.success(`已复制 ${genResult.cards.length} 张`))
    .catch(() => ElMessage.error('复制失败,请手动复制'))
}
function downloadGen() {
  const blob = new Blob([genResult.cards.join('\n')], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${genResult.batchNo}.txt`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

/* ---------- 导入 ---------- */
const impDialog = reactive({ open: false, submitting: false })
const impTypeId = ref(null)
const impFile = ref(null)

function openImport() {
  if (!types.value.length) {
    ElMessage.warning('请先在「套餐」页面创建套餐')
    return
  }
  impTypeId.value = types.value[0]?.id || null
  impFile.value = null
  impDialog.open = true
}
function onFilePick(f, files) {
  impFile.value = files?.[0] || null
  return false // 关闭 el-upload 默认上传
}
const impResult = reactive({ open: false, total: 0, invalid: 0, inserted: 0, skipped: 0, skippedList: [] })

async function onSubmitImp() {
  if (!impFile.value) return ElMessage.warning('请选择 TXT/CSV 文件')
  if (!impTypeId.value) return ElMessage.warning('请选择目标套餐')
  const fd = new FormData()
  fd.append('file', impFile.value)
  fd.append('type_id', impTypeId.value)
  impDialog.submitting = true
  try {
    const data = await upload('/api/admin/import/cards', fd)
    Object.assign(impResult, data)
    impDialog.open = false
    impResult.open = true
    loadList()
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    impDialog.submitting = false
  }
}

/* ---------- 详情 ---------- */
const drawerOpen = ref(false)
const detail = ref(null)
const detailLogs = ref([])
const detailLoading = ref(false)

async function openDetail(row) {
  drawerOpen.value = true
  detailLoading.value = true
  try {
    const d = await get(`/api/admin/cards/${row.id}/detail`)
    detail.value = d.card
    detailLogs.value = d.logs || []
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    detailLoading.value = false
  }
}

const selectionCount = computed(() => selected.value.length)

onMounted(() => {
  loadOptions()
  loadList()
})
</script>

<template>
  <div class="cards-page">
    <div class="page-head">
      <h2 class="page-title"><IconFrame name="cards" :size="22" /> 全局卡池</h2>
      <div class="head-actions">
        <el-button class="glow-ghost" :icon="null" @click="openImport"><IconFrame name="upload" :size="14" /> 导入</el-button>
        <el-button class="glow-ghost" :icon="null" @click="onExport('txt')"><IconFrame name="download" :size="14" /> 导出TXT</el-button>
        <el-button class="glow-ghost" :icon="null" @click="onExport('csv')"><IconFrame name="doc" :size="14" /> 导出明细</el-button>
        <el-button class="glow-btn" :icon="null" @click="openGen"><IconFrame name="sparkles" :size="14" /> 生成卡密</el-button>
      </div>
    </div>

    <!-- 本页数据总览 -->
    <PageOverview scope="cards" />

    <!-- 筛选条 -->
    <div class="glass filter-bar">
      <el-input v-model="filters.keyword" placeholder="卡号关键词" clearable style="width: 200px" @keyup.enter="onSearch" @clear="onSearch" />
      <el-select v-model="filters.type_id" placeholder="套餐" clearable style="width: 150px">
        <el-option v-for="t in types" :key="t.id" :label="typeLabel(t)" :value="t.id" />
      </el-select>
      <el-select v-model="filters.status" placeholder="状态" clearable style="width: 130px">
        <el-option label="未使用" value="unused" />
        <el-option label="已使用" value="used" />
        <el-option label="已过期" value="expired" />
        <el-option label="已禁用" value="disabled" />
        <el-option label="已作废" value="void" />
      </el-select>
      <el-select v-model="filters.project" placeholder="归属项目" clearable style="width: 160px">
        <el-option v-for="p in projects" :key="p.id" :label="p.name" :value="p.id" />
      </el-select>
      <el-date-picker
        v-model="filters.range"
        type="daterange"
        range-separator="→"
        start-placeholder="创建起始"
        end-placeholder="创建结束"
        style="width: 240px"
      />
      <el-button class="glow-btn" @click="onSearch">查询</el-button>
      <el-button text @click="onReset">重置</el-button>
    </div>

    <!-- 批量操作条 -->
    <div v-if="selectionCount" class="glass batch-bar">
      <span class="batch-info">已选 <b class="num">{{ selectionCount }}</b> 张</span>
      <el-button size="small" @click="batch('disable')">禁用</el-button>
      <el-button size="small" @click="batch('enable')">启用</el-button>
      <el-button size="small" type="warning" plain @click="batch('void')">作废</el-button>
      <el-button size="small" @click="batch('reset')">重置为未使用</el-button>
      <el-button size="small" type="danger" plain @click="batch('delete')">删除</el-button>
    </div>

    <!-- 表格 -->
    <div v-loading="loading" class="glass table-card">
      <el-table :data="list" style="width: 100%" row-key="id" @selection-change="(rows) => (selected = rows)">
        <el-table-column type="selection" width="44" />
        <el-table-column label="卡号" min-width="220">
          <template #default="{ row }">
            <span class="card-cell">{{ row.card }}</span>
            <span v-if="row.source" class="src-tag">{{ row.source }}</span>
          </template>
        </el-table-column>
        <el-table-column label="套餐" min-width="110">
          <template #default="{ row }">
            <span class="type-cell">{{ row.type_name || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }"><StatusPill :status="row.status" /></template>
        </el-table-column>
        <el-table-column label="归属项目" min-width="120">
          <template #default="{ row }">
            <span class="project-cell">{{ row.project_name || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="170">
          <template #default="{ row }"><span class="dim">{{ fmtTime(row.created_at) }}</span></template>
        </el-table-column>
        <el-table-column label="操作" width="230" fixed="right">
          <template #default="{ row }">
            <el-button size="small" text type="primary" @click="openDetail(row)">详情</el-button>
            <template v-if="row.status === 'unused'">
              <el-button size="small" text type="warning" @click="batch('disable', [row.id])">禁用</el-button>
              <el-button size="small" text type="danger" @click="batch('void', [row.id])">作废</el-button>
            </template>
            <template v-else-if="row.status === 'used'">
              <el-button size="small" text type="warning" @click="batch('disable', [row.id])">禁用</el-button>
              <el-button size="small" text @click="batch('reset', [row.id])">重置</el-button>
            </template>
            <template v-else-if="row.status === 'disabled'">
              <el-button size="small" text type="success" @click="batch('enable', [row.id])">启用</el-button>
              <el-button size="small" text type="danger" @click="batch('void', [row.id])">作废</el-button>
            </template>
            <template v-else-if="row.status === 'expired'">
              <el-button size="small" text type="danger" @click="batch('void', [row.id])">作废</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @change="loadList"
        />
      </div>
    </div>

    <!-- 生成对话框 -->
    <el-dialog v-model="genDialog.open" title="批量生成卡密" width="480px" align-center>
      <el-form label-width="100px">
        <el-form-item label="生成数量" required>
          <el-input-number v-model="genForm.count" :min="1" :max="10000" />
          <span class="hint">(最多 10000/批)</span>
        </el-form-item>
        <el-form-item label="套餐" required>
          <el-select v-model="genForm.type_id" style="width: 100%">
            <el-option v-for="t in types" :key="t.id" :label="typeLabel(t)" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="卡号前缀">
          <el-input v-model="genForm.prefix" placeholder="可选,仅字母数字" maxlength="20" class="mono-input" />
        </el-form-item>
        <el-form-item label="卡号长度" required>
          <el-input-number v-model="genForm.length" :min="8" :max="32" />
          <span class="hint">(不含前缀)</span>
        </el-form-item>
        <el-form-item label="字符集">
          <el-radio-group v-model="genForm.charset_mode">
            <el-radio-button value="default">默认(剔除易混)</el-radio-button>
            <el-radio-button value="custom">自定义</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="genForm.charset_mode === 'custom'" label="自定义字符">
          <el-input v-model="genForm.custom_charset" placeholder="如:ABC123(≥4个不重复,仅字母数字)" />
        </el-form-item>
        <el-form-item label="校验位">
          <el-switch v-model="genForm.check_digit" />
          <span class="hint">末位追加校验字符,防瞎猜</span>
        </el-form-item>
        <el-form-item label="批次备注">
          <el-input v-model="genForm.remark" maxlength="100" placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="genDialog.open = false">取消</el-button>
        <el-button class="glow-btn" :loading="genDialog.submitting" @click="onSubmitGen">开始生成</el-button>
      </template>
    </el-dialog>

    <!-- 生成结果 -->
    <el-dialog v-model="genResult.open" title="生成完成" width="520px" align-center>
      <div class="gen-ok">
        <IconFrame name="check" :size="30" />
        <div>
          <div class="gen-count num">成功生成 {{ genResult.inserted }} 张</div>
          <div class="gen-meta">{{ genResult.batchNo }} · 卡池已刷新</div>
        </div>
      </div>
      <div v-if="genResult.cards.length" class="gen-preview">
        <div v-for="c in genResult.cards.slice(0, 12)" :key="c" class="gen-item">{{ c }}</div>
        <div v-if="genResult.cards.length > 12" class="gen-more">… 共 {{ genResult.cards.length }} 张</div>
      </div>
      <template #footer>
        <el-button class="glow-ghost" @click="copyAll">复制全部</el-button>
        <el-button class="glow-btn" @click="downloadGen">下载 TXT</el-button>
      </template>
    </el-dialog>

    <!-- 导入对话框 -->
    <el-dialog v-model="impDialog.open" title="导入卡密(接管旧项目)" width="480px" align-center>
      <p class="imp-desc">
        每行一条,支持 <b>TXT / CSV</b>。格式:卡号 或 卡号,状态,备注(状态可写 unused/used/disabled/void 或中文)。重复卡号自动跳过。
      </p>
      <el-form label-width="100px">
        <el-form-item label="目标套餐" required>
          <el-select v-model="impTypeId" style="width: 100%">
            <el-option v-for="t in types" :key="t.id" :label="typeLabel(t)" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="选择文件" required>
          <el-upload :auto-upload="false" :limit="1" :on-change="onFilePick" accept=".txt,.csv">
            <el-button class="glow-ghost"><IconFrame name="upload" :size="14" /> {{
              impFile ? impFile.name : '选择文件'
            }}</el-button>
          </el-upload>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="impDialog.open = false">取消</el-button>
        <el-button class="glow-btn" :loading="impDialog.submitting" @click="onSubmitImp">开始导入</el-button>
      </template>
    </el-dialog>

    <!-- 导入结果 -->
    <el-dialog v-model="impResult.open" title="导入结果" width="520px" align-center>
      <div class="imp-stats">
        <div class="imp-stat"><b class="num">{{ impResult.total }}</b><span>读取</span></div>
        <div class="imp-stat ok"><b class="num">{{ impResult.inserted }}</b><span>成功</span></div>
        <div class="imp-stat warn"><b class="num">{{ impResult.skipped }}</b><span>跳过</span></div>
        <div class="imp-stat"><b class="num">{{ impResult.invalid }}</b><span>格式错误</span></div>
      </div>
      <el-table v-if="impResult.skippedList.length" :data="impResult.skippedList" size="small" max-height="220" style="margin-top: 10px">
        <el-table-column prop="card" label="卡号" min-width="160" />
        <el-table-column prop="reason" label="原因" min-width="100" />
      </el-table>
      <template #footer>
        <el-button class="glow-btn" @click="impResult.open = false">确定</el-button>
      </template>
    </el-dialog>

    <!-- 详情抽屉 -->
    <el-drawer v-model="drawerOpen" title="卡密详情" size="520px" :with-header="true">
      <div v-loading="detailLoading">
        <template v-if="detail">
          <div class="detail-card-cell num">{{ detail.card }}</div>
          <el-descriptions :column="2" border size="small" class="detail-desc">
            <el-descriptions-item label="状态"><StatusPill :status="detail.status" /></el-descriptions-item>
            <el-descriptions-item label="套餐">{{ detail.type_name }}</el-descriptions-item>
            <el-descriptions-item v-if="detail.type_kind === 'money'" label="面额">¥{{ detail.type_amount }}</el-descriptions-item>
            <el-descriptions-item label="归属项目">{{ detail.project_name || '—' }}</el-descriptions-item>
            <el-descriptions-item label="来源">{{ detail.source || '生成' }}</el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ fmtTime(detail.created_at) }}</el-descriptions-item>
            <el-descriptions-item label="激活时间">{{ fmtTime(detail.activated_at) }}</el-descriptions-item>
            <el-descriptions-item label="过期时间">{{ fmtTime(detail.expire_at) }}</el-descriptions-item>
            <el-descriptions-item label="已用次数">{{ detail.times_used }}</el-descriptions-item>
            <el-descriptions-item label="最近IP">{{ detail.last_ip || '—' }}</el-descriptions-item>
            <el-descriptions-item label="备注">{{ detail.remark || '—' }}</el-descriptions-item>
          </el-descriptions>

          <h4 class="log-title">核销流水</h4>
          <el-table :data="detailLogs" size="small">
            <el-table-column prop="action" label="动作" width="90">
              <template #default="{ row }"><span class="action-chip">{{ row.action }}</span></template>
            </el-table-column>
            <el-table-column prop="project_name" label="项目" min-width="90">
              <template #default="{ row }">{{ row.project_name || '后台' }}</template>
            </el-table-column>
            <el-table-column prop="detail" label="说明"> </el-table-column>
            <el-table-column prop="created_at" label="时间" width="150">
              <template #default="{ row }"><span class="dim">{{ fmtTime(row.created_at) }}</span></template>
            </el-table-column>
          </el-table>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.cards-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.page-title {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 22px;
  font-weight: 800;
}
.head-actions {
  display: flex;
  gap: 10px;
}

.filter-bar {
  padding: 14px 16px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.batch-bar {
  padding: 10px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: var(--radius-md);
}
.batch-info {
  font-size: 13.5px;
  color: var(--ink-2);
  margin-right: 6px;
}

.table-card {
  padding: 8px 14px 16px;
}
.card-cell {
  font-family: 'DIN Alternate', 'Consolas', monospace;
  font-weight: 700;
  letter-spacing: 0.06em;
  font-size: 13.5px;
  color: var(--ink-1);
}
.src-tag {
  margin-left: 8px;
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 999px;
  color: #7c3aed;
  background: rgba(139, 92, 246, 0.12);
}
.type-cell {
  color: var(--ink-2);
  font-size: 13px;
}
.project-cell {
  font-size: 13px;
}
.dim {
  color: var(--ink-3);
  font-size: 12.5px;
}

.pager {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
}
.hint {
  margin-left: 10px;
  font-size: 12px;
  color: var(--ink-3);
}
.mono-input :deep(.el-input__inner) {
  font-family: 'DIN Alternate', monospace;
  letter-spacing: 0.06em;
}

.gen-ok {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(52, 211, 153, 0.08));
}
.gen-count {
  font-size: 24px;
  font-weight: 800;
  color: #059669;
}
.gen-meta {
  font-size: 12.5px;
  color: var(--ink-3);
  margin-top: 2px;
}
.gen-preview {
  margin-top: 14px;
  max-height: 240px;
  overflow: auto;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.55);
}
.gen-item {
  font-family: 'DIN Alternate', monospace;
  letter-spacing: 0.04em;
  font-size: 13px;
  padding: 3px 0;
  color: var(--ink-1);
}
.gen-more {
  color: var(--ink-3);
  font-size: 12px;
  padding-top: 6px;
}

.imp-desc {
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--ink-2);
  line-height: 1.7;
}
.imp-stats {
  display: flex;
  gap: 12px;
}
.imp-stat {
  flex: 1;
  text-align: center;
  padding: 12px 6px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.55);
}
.imp-stat b {
  display: block;
  font-size: 22px;
  font-weight: 800;
}
.imp-stat span {
  font-size: 12px;
  color: var(--ink-3);
}
.imp-stat.ok b {
  color: #059669;
}
.imp-stat.warn b {
  color: #d97706;
}

.detail-card-cell {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: 0.08em;
  margin-bottom: 14px;
  padding: 12px 14px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(79, 124, 255, 0.1), rgba(139, 92, 246, 0.08));
}
.detail-desc {
  --el-descriptions-item-bordered-label-background: rgba(79, 124, 255, 0.06);
}
.log-title {
  margin: 18px 0 8px;
  font-size: 14px;
  font-weight: 700;
}
.action-chip {
  font-family: 'DIN Alternate', monospace;
  font-size: 12px;
  padding: 1px 8px;
  border-radius: 6px;
  background: rgba(79, 124, 255, 0.1);
  color: #4f46e5;
}

:deep(.el-table) {
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-header-bg-color: rgba(79, 124, 255, 0.06);
  --el-table-border-color: rgba(79, 124, 255, 0.1);
  --el-table-row-hover-bg-color: rgba(255, 255, 255, 0.6);
}
</style>