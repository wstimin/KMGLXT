<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import IconFrame from '@/components/IconFrame.vue'
import PageOverview from '@/components/PageOverview.vue'
import { get } from '@/lib/request'
import { fmtTime } from '@/utils/format'

const tab = ref('card')

/* ── 核销流水 ── */
const cardLogs = reactive({ list: [], total: 0, page: 1, pageSize: 20, loading: false })
const cardFilter = reactive({ action: '', project_id: '', keyword: '' })
const projectOptions = ref([])

async function loadCardLogs() {
  cardLogs.loading = true
  try {
    const q = new URLSearchParams({ page: cardLogs.page, pageSize: cardLogs.pageSize })
    if (cardFilter.action) q.set('action', cardFilter.action)
    if (cardFilter.project_id) q.set('project_id', cardFilter.project_id)
    if (cardFilter.keyword) q.set('keyword', cardFilter.keyword)
    const r = await get(`/api/admin/logs/list?${q}`)
    cardLogs.list = r.list || []
    cardLogs.total = r.total
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    cardLogs.loading = false
  }
}

/* ── 操作审计 ── */
const operLogs = reactive({ list: [], total: 0, page: 1, pageSize: 20, loading: false })
const operFilter = reactive({ admin: '', action: '' })

async function loadOperLogs() {
  operLogs.loading = true
  try {
    const q = new URLSearchParams({ page: operLogs.page, pageSize: operLogs.pageSize })
    if (operFilter.admin) q.set('admin', operFilter.admin)
    if (operFilter.action) q.set('action', operFilter.action)
    const r = await get(`/api/admin/audit/list?${q}`)
    operLogs.list = r.list || []
    operLogs.total = r.total
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    operLogs.loading = false
  }
}

function onCardSearch() {
  cardLogs.page = 1
  loadCardLogs()
}
function onOperSearch() {
  operLogs.page = 1
  loadOperLogs()
}

watch(tab, (t) => {
  if (t === 'card' && !cardLogs.total && !cardLogs.loading) loadCardLogs()
  if (t === 'oper' && !operLogs.total && !operLogs.loading) loadOperLogs()
})

onMounted(async () => {
  try {
    const p = await get('/api/admin/projects/options')
    projectOptions.value = p.list || []
  } catch { /* 忽略 */ }
  loadCardLogs()
})

const actionPill = (a) =>
  ({ activate: 'pill-ok', verify: 'pill-used', consume: 'pill-unused', freeze: 'pill-disabled', unfreeze: 'pill-disabled', query: 'pill-expired' }[a] || 'pill-expired')
</script>

<template>
  <div class="logs-page">
    <div class="page-head">
      <h2 class="page-title"><IconFrame name="logs" :size="22" /> 日志中心</h2>
    </div>

    <!-- 本页数据总览 -->
    <PageOverview scope="logs" />

    <el-tabs v-model="tab" class="glass log-tabs">
      <el-tab-pane label="核销流水" name="card">
        <div class="filter-bar glass">
          <el-select v-model="cardFilter.action" placeholder="全部动作" clearable style="width: 130px">
            <el-option label="激活" value="activate" />
            <el-option label="验卡" value="verify" />
            <el-option label="扣次" value="consume" />
            <el-option label="冻结" value="freeze" />
            <el-option label="解冻" value="unfreeze" />
            <el-option label="查询" value="query" />
          </el-select>
          <el-select v-model="cardFilter.project_id" placeholder="全部项目" clearable style="width: 180px">
            <el-option v-for="p in projectOptions" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
          <el-input v-model="cardFilter.keyword" placeholder="卡号关键词" clearable style="width: 220px" @keyup.enter="onCardSearch" />
          <el-button class="glow-btn" @click="onCardSearch"><IconFrame name="search" :size="13" /> 查询</el-button>
        </div>

        <div v-loading="cardLogs.loading" class="table-card">
          <el-table :data="cardLogs.list" style="width: 100%">
            <el-table-column prop="id" label="ID" width="70" />
            <el-table-column label="卡号" min-width="200">
              <template #default="{ row }"><span class="mono">{{ row.card || '(卡已删除)' }}</span></template>
            </el-table-column>
            <el-table-column label="动作" width="90">
              <template #default="{ row }">
                <span :class="['pill', actionPill(row.action)]">{{ row.action_text }}</span>
              </template>
            </el-table-column>
            <el-table-column label="项目" min-width="140">
              <template #default="{ row }">{{ row.project_name || '—' }}</template>
            </el-table-column>
            <el-table-column label="详情" min-width="160">
              <template #default="{ row }"><span class="dim">{{ row.detail }}</span></template>
            </el-table-column>
            <el-table-column label="IP" width="130">
              <template #default="{ row }"><span class="mono dim">{{ row.ip || '—' }}</span></template>
            </el-table-column>
            <el-table-column label="时间" width="170">
              <template #default="{ row }"><span class="dim">{{ fmtTime(row.created_at) }}</span></template>
            </el-table-column>
          </el-table>
          <div class="pager">
            <el-pagination
              v-model:current-page="cardLogs.page"
              :page-size="cardLogs.pageSize"
              :total="cardLogs.total"
              layout="total, prev, pager, next"
              background
              @current-change="loadCardLogs"
            />
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="操作审计" name="oper">
        <div class="filter-bar glass">
          <el-input v-model="operFilter.admin" placeholder="操作人" clearable style="width: 160px" @keyup.enter="onOperSearch" />
          <el-input v-model="operFilter.action" placeholder="动作(如 cards:generate)" clearable style="width: 220px" @keyup.enter="onOperSearch" />
          <el-button class="glow-btn" @click="onOperSearch"><IconFrame name="search" :size="13" /> 查询</el-button>
        </div>

        <div v-loading="operLogs.loading" class="table-card">
          <el-table :data="operLogs.list" style="width: 100%">
            <el-table-column prop="id" label="ID" width="70" />
            <el-table-column label="操作人" width="120">
              <template #default="{ row }">{{ row.admin_name || 'system' }}</template>
            </el-table-column>
            <el-table-column label="动作" min-width="150">
              <template #default="{ row }"><span class="mono">{{ row.action }}</span></template>
            </el-table-column>
            <el-table-column label="对象" min-width="120">
              <template #default="{ row }">{{ row.target }}</template>
            </el-table-column>
            <el-table-column label="详情" min-width="200">
              <template #default="{ row }"><span class="dim">{{ row.detail }}</span></template>
            </el-table-column>
            <el-table-column label="IP" width="130">
              <template #default="{ row }"><span class="mono dim">{{ row.ip || '—' }}</span></template>
            </el-table-column>
            <el-table-column label="时间" width="170">
              <template #default="{ row }"><span class="dim">{{ fmtTime(row.created_at) }}</span></template>
            </el-table-column>
          </el-table>
          <div class="pager">
            <el-pagination
              v-model:current-page="operLogs.page"
              :page-size="operLogs.pageSize"
              :total="operLogs.total"
              layout="total, prev, pager, next"
              background
              @current-change="loadOperLogs"
            />
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.logs-page {
  display: flex;
  flex-direction: column;
  gap: var(--space);
}
.page-head {
  display: flex;
  align-items: center;
}
.page-title {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 22px;
  font-weight: 800;
}
.log-tabs {
  padding: 14px 20px 18px;
}
:deep(.el-tabs__nav-wrap::after) {
  height: 1px;
  background: rgba(79, 124, 255, 0.12);
}
:deep(.el-tabs__item) {
  color: var(--ink-2);
}
:deep(.el-tabs__item.is-active) {
  color: var(--brand-blue);
  font-weight: 700;
}
.filter-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 14px 16px;
  margin-bottom: 14px;
  border-radius: 14px;
}
.table-card {
  padding: 6px 4px;
}
.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}
.mono {
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12.5px;
}
.dim {
  color: var(--ink-3);
  font-size: 12.5px;
}
:deep(.el-table) {
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-header-bg-color: rgba(79, 124, 255, 0.06);
  --el-table-border-color: rgba(79, 124, 255, 0.1);
  --el-table-row-hover-bg-color: rgba(255, 255, 255, 0.6);
}
</style>