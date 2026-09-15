<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import IconFrame from '@/components/IconFrame.vue'
import PageOverview from '@/components/PageOverview.vue'
import { get, post, put, del } from '@/lib/request'
import { fmtTime } from '@/utils/format'

const list = ref([])
const projects = ref([])
const loading = ref(false)

const dialog = reactive({ open: false, mode: 'create', id: null, submitting: false })
const form = reactive({
  name: '',
  kind: 'duration',
  days: 30,
  times: 100,
  price: 0,
  scope: [], // [] = 全部项目
  status: 1,
  sort: 0,
})

async function loadAll() {
  loading.value = true
  try {
    const [t, p] = await Promise.all([
      get('/api/admin/cardTypes/list'),
      get('/api/admin/projects/options'),
    ])
    list.value = t.list || []
    projects.value = p.list || []
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    loading.value = false
  }
}

function kindText(t) {
  if (t.kind === 'duration') return `时长 · ${t.days} 天`
  if (t.kind === 'times') return `次数 · ${t.times} 次`
  return '永久'
}

function scopeText(t) {
  const arr = t.scope_projects || []
  if (!arr.length) return '全部项目'
  const names = arr.map((id) => projects.value.find((p) => p.id === Number(id))?.name || `#${id}`)
  return names.join('、') || '已指定'
}

function openCreate() {
  dialog.mode = 'create'
  dialog.id = null
  Object.assign(form, { name: '', kind: 'duration', days: 30, times: 100, price: 0, scope: [], status: 1, sort: 0 })
  dialog.open = true
}

function openEdit(row) {
  dialog.mode = 'edit'
  dialog.id = row.id
  Object.assign(form, {
    name: row.name,
    kind: row.kind,
    days: row.days,
    times: row.times,
    price: row.price,
    scope: (row.scope_projects || []).map((x) => Number(x)),
    status: row.status,
    sort: row.sort,
  })
  dialog.open = true
}

async function onSubmit() {
  if (!form.name.trim()) return ElMessage.warning('请输入套餐名称')
  if (form.kind === 'duration' && (!form.days || form.days < 1)) return ElMessage.warning('请填写有效的时长天数')
  if (form.kind === 'times' && (!form.times || form.times < 1)) return ElMessage.warning('请填写有效的次数')
  dialog.submitting = true
  try {
    const payload = {
      name: form.name.trim(),
      kind: form.kind,
      days: form.kind === 'duration' ? form.days : 0,
      times: form.kind === 'times' ? form.times : 0,
      price: Number(form.price) || 0,
      scope_projects: form.scope,
      sort: Number(form.sort) || 0,
    }
    if (dialog.mode === 'create') {
      await post('/api/admin/cardTypes/create', payload)
      ElMessage.success('套餐创建成功')
    } else {
      await put(`/api/admin/cardTypes/${dialog.id}`, { ...payload, status: form.status })
      ElMessage.success('套餐已更新')
    }
    dialog.open = false
    loadAll()
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    dialog.submitting = false
  }
}

async function onDelete(row) {
  const used = row.status === 0 ? '' : '该套餐可能已被卡密引用,删除时将被自动停用。'
  try {
    await ElMessageBox.confirm(`确定删除套餐「${row.name}」?${used}`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    const r = await del(`/api/admin/cardTypes/${row.id}`)
    ElMessage.success(r?.soft ? `已被 ${r.used} 张卡引用,已改为停用` : '已删除')
    loadAll()
  } catch (e) {
    ElMessage.error(e.message)
  }
}

onMounted(loadAll)
</script>

<template>
  <div class="types-page">
    <div class="page-head">
      <h2 class="page-title"><IconFrame name="tag" :size="22" /> 套餐管理</h2>
      <el-button class="glow-btn" @click="openCreate">
        <IconFrame name="plus" :size="14" /> 新建套餐
      </el-button>
    </div>

    <!-- 本页数据总览 -->
    <PageOverview scope="types" />

    <div v-loading="loading" class="glass table-card">
      <el-table :data="list" style="width: 100%" row-key="id">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column label="名称" min-width="140">
          <template #default="{ row }">
            <span class="type-name">{{ row.name }}</span>
            <span v-if="row.status !== 1" class="off-tag">停用</span>
          </template>
        </el-table-column>
        <el-table-column label="类型" min-width="120">
          <template #default="{ row }">{{ kindText(row) }}</template>
        </el-table-column>
        <el-table-column label="价格" width="100">
          <template #default="{ row }">
            <span class="num">¥{{ row.price }}</span>
          </template>
        </el-table-column>
        <el-table-column label="适用范围" min-width="160">
          <template #default="{ row }">
            <el-tooltip :content="scopeText(row)" placement="top">
              <span class="scope-text">{{ scopeText(row) }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="170">
          <template #default="{ row }">
            <span class="dim">{{ fmtTime(row.created_at) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <el-button size="small" class="glow-ghost" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" text type="danger" @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog
      v-model="dialog.open"
      :title="dialog.mode === 'create' ? '新建套餐' : '编辑套餐'"
      width="480px"
      align-center
    >
      <el-form label-width="90px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" maxlength="20" placeholder="如:30天卡 / 10次体验卡" />
        </el-form-item>
        <el-form-item label="类型" required>
          <el-radio-group v-model="form.kind">
            <el-radio-button value="duration">时长卡</el-radio-button>
            <el-radio-button value="times">次数卡</el-radio-button>
            <el-radio-button value="permanent">永久卡</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.kind === 'duration'" label="时长(天)">
          <el-input-number v-model="form.days" :min="1" :max="36500" />
        </el-form-item>
        <el-form-item v-if="form.kind === 'times'" label="次数">
          <el-input-number v-model="form.times" :min="1" :max="10000000" />
        </el-form-item>
        <el-form-item label="价格">
          <el-input-number v-model="form.price" :min="0" :precision="2" :step="1" />
        </el-form-item>
        <el-form-item label="适用范围">
          <el-select v-model="form.scope" multiple clearable collapse-tags collapse-tags-tooltip placeholder="留空 = 全部项目通用" style="width: 100%">
            <el-option v-for="p in projects" :key="p.id" :label="p.name" :value="p.id" :disabled="p.disabled" />
          </el-select>
          <div class="form-tip">不选择任何项目时,该套餐可被所有接入项目使用(一卡通用)</div>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" :max="9999" />
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
  </div>
</template>

<style scoped>
.types-page {
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
.table-card {
  padding: 10px 14px 16px;
}
.type-name {
  font-weight: 600;
}
.off-tag {
  margin-left: 8px;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  color: #dc2626;
  background: rgba(239, 68, 68, 0.1);
}
.scope-text {
  max-width: 150px;
  display: inline-block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
  color: var(--ink-2);
}
.dim {
  color: var(--ink-3);
  font-size: 12.5px;
}
.form-tip {
  font-size: 12px;
  color: var(--ink-3);
  margin-top: 4px;
}

:deep(.el-table) {
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-header-bg-color: rgba(79, 124, 255, 0.06);
  --el-table-border-color: rgba(79, 124, 255, 0.1);
  --el-table-row-hover-bg-color: rgba(255, 255, 255, 0.6);
}
</style>