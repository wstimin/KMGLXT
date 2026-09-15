<script setup>
import { ref, computed, onMounted } from 'vue'
import IconFrame from '@/components/IconFrame.vue'
import HeroStat from '@/components/HeroStat.vue'
import TrendChart from '@/components/TrendChart.vue'
import { get } from '@/lib/request'
import { timeAgo, fmtNum } from '@/utils/format'

const overview = ref(null)
const distribution = ref(null)
const recent = ref([])
const loading = ref(true)
const trendDays = ref(7)

onMounted(async () => {
  try {
    const [ov, dis, rec] = await Promise.all([
      get('/api/admin/stats/overview'),
      get('/api/admin/stats/distribution'),
      get('/api/admin/stats/recent'),
    ])
    overview.value = ov
    distribution.value = dis
    recent.value = rec.list || []
  } catch (e) {
    // request.js 会处理 401;其余错误静默展示空
  } finally {
    loading.value = false
  }
})

const usageRate = computed(() => {
  if (!overview.value?.total) return 0
  return Math.round(((overview.value.status.used + overview.value.status.expired) / overview.value.total) * 100)
})

const stats = computed(() => {
  const o = overview.value
  if (!o) return []
  return [
    { icon: 'cards', label: '卡密总数', value: o.total, unit: '张', caption: '全局统一卡池' },
    { icon: 'clock', label: '未使用', value: o.status.unused, unit: '张', caption: '等待激活' },
    { icon: 'check', label: '已使用', value: o.status.used, unit: '张', caption: '已核销激活' },
    { icon: 'ban', label: '已过期 / 禁用', value: o.status.expired + o.status.disabled, unit: '张', caption: `过期 ${o.status.expired} · 禁用 ${o.status.disabled}` },
    { icon: 'sparkles', label: '今日生成', value: o.today.generated, unit: '张', caption: '今日新增卡密' },
    { icon: 'download', label: '今日核销', value: o.today.consumed, unit: '次', caption: '今日激活与扣次' },
  ]
})

const distTotal = computed(() => distribution.value?.total || 0)
const distTop = computed(() => (distribution.value?.list || []).slice(0, 5))
const restCount = computed(() => Math.max(0, (distribution.value?.list || []).length - 5))

/* 动作 → 颜色 pills */
const actionPill = (a) =>
  ({ activate: 'pill-ok', verify: 'pill-used', consume: 'pill-unused', freeze: 'pill-disabled', unfreeze: 'pill-disabled', query: 'pill-expired' }[a] || 'pill-expired')
</script>

<template>
  <div v-loading="loading" class="dash">
    <!-- 欢迎区 -->
    <section class="welcome glass gradient-border">
      <div class="welcome-inner">
        <div>
          <h2 class="welcome-title">
            你好,{{ overview?.site?.name || '十夜卡密' }} 👋
          </h2>
          <p class="welcome-sub">{{ overview?.site?.announcement }}</p>
        </div>
        <div class="welcome-chips">
          <span class="chip"><IconFrame name="globe" :size="14" />在线项目 {{ overview?.projects ?? 0 }}</span>
          <span class="chip"><IconFrame name="shield" :size="14" />管理员 {{ overview?.admins ?? 1 }}</span>
          <span class="chip"><IconFrame name="server" :size="14" />服务运行中</span>
        </div>
      </div>
    </section>

    <!-- hero 大数字 -->
    <section class="hero-grid">
      <HeroStat v-for="s in stats" :key="s.label" v-bind="s" />
    </section>

    <!-- 趋势图 + 项目占比 -->
    <section class="charts-grid">
      <div class="glass glass-hover chart-card">
        <div class="chart-head">
          <span class="mid-title"><IconFrame name="sparkles" :size="16" /> 生成 vs 核销</span>
          <el-radio-group v-model="trendDays" size="small">
            <el-radio-button :value="7">近 7 天</el-radio-button>
            <el-radio-button :value="30">近 30 天</el-radio-button>
          </el-radio-group>
        </div>
        <div class="legend">
          <span class="lg lg-gen"><i />生成</span>
          <span class="lg lg-con"><i />核销</span>
        </div>
        <TrendChart :days="trendDays" />
      </div>

      <div class="glass glass-hover chart-card">
        <div class="chart-head">
          <span class="mid-title"><IconFrame name="globe" :size="16" /> 项目核销占比</span>
          <span class="mid-tag">{{ fmtNum(distTotal) }} 次</span>
        </div>
        <div v-if="distTop.length" class="dist-list">
          <div v-for="(d, i) in distTop" :key="d.project_id || i" class="dist-row">
            <div class="dist-head">
              <span class="dist-name">#{{ d.project_id }} {{ d.project_name }}</span>
              <span class="dist-num">{{ d.c }} 次 · {{ Math.round((d.c / distTotal) * 100) }}%</span>
            </div>
            <div class="dist-track">
              <div class="dist-bar" :style="{ width: (d.c / distTotal) * 100 + '%' }" :class="`dist-bar-${i % 3}`" />
            </div>
          </div>
          <div v-if="restCount" class="dist-more">+ 其他 {{ restCount }} 个项目</div>
        </div>
        <div v-else class="empty-tip">暂无核销记录 —— 项目接入后会自动统计</div>
      </div>
    </section>

    <!-- 使用率 + 最近动态 -->
    <section class="bottom-grid">
      <div class="glass glass-hover usage-card">
        <div class="mid-head">
          <span class="mid-title">全局使用率</span>
          <span class="mid-tag">{{ usageRate }}%</span>
        </div>
        <el-progress
          :percentage="usageRate"
          :stroke-width="14"
          :show-text="false"
          class="grad-progress"
        />
        <p class="mid-desc">已使用 + 已过期 占全池比例,用于了解卡池消耗情况。</p>
      </div>

      <div class="glass glass-hover usage-card">
        <div class="mid-head">
          <span class="mid-title">最近核销动态</span>
          <IconFrame name="logs" :size="16" />
        </div>
        <div v-if="recent.length" class="feed">
          <div v-for="r in recent" :key="r.id" class="feed-row">
            <span :class="['pill', 'feed-pill', actionPill(r.action)]">{{ r.action_text }}</span>
            <span class="feed-card mono">{{ r.card }}</span>
            <span class="feed-pj">{{ r.project_name || '—' }}</span>
            <span class="feed-time">{{ timeAgo(r.created_at) }}</span>
          </div>
        </div>
        <p v-else class="empty-tip">{{ distribution?.total > 0 ? '加载中…' : '暂无核销记录' }}</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dash {
  display: flex;
  flex-direction: column;
  gap: var(--space);
}

.welcome {
  padding: 26px 30px;
  position: relative;
}
.welcome-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
}
.welcome-title {
  margin: 0;
  font-size: 24px;
  font-weight: 800;
}
.welcome-sub {
  margin: 8px 0 0;
  color: var(--ink-2);
  font-size: 14px;
}
.welcome-chips {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid var(--glass-border);
  font-size: 13px;
  color: var(--ink-2);
}

.hero-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 18px;
}

.charts-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 18px;
}
@media (max-width: 1100px) {
  .charts-grid {
    grid-template-columns: 1fr;
  }
}
.chart-card {
  padding: 20px 22px;
}
.chart-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
}
.mid-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
}
.mid-tag {
  font-size: 18px;
  font-weight: 800;
  background: var(--grad-main);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.legend {
  display: flex;
  gap: 16px;
  margin-bottom: 8px;
}
.lg {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--ink-2);
}
.lg i {
  width: 10px;
  height: 10px;
  border-radius: 3px;
}
.lg-gen i {
  background: linear-gradient(135deg, #22d3ee, #38bdf8);
  box-shadow: 0 0 8px rgba(34, 211, 238, 0.6);
}
.lg-con i {
  background: linear-gradient(135deg, #8b5cf6, #a78bfa);
  box-shadow: 0 0 8px rgba(139, 92, 246, 0.6);
}

/* 占比 */
.dist-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 12px;
}
.dist-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12.5px;
  margin-bottom: 5px;
}
.dist-name {
  font-weight: 600;
  color: var(--ink-1);
}
.dist-num {
  color: var(--ink-3);
  font-size: 11.5px;
}
.dist-track {
  height: 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.7);
  box-shadow: inset 0 1px 3px rgba(79, 124, 255, 0.12);
  overflow: hidden;
}
.dist-bar {
  height: 100%;
  border-radius: 999px;
  transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1);
}
.dist-bar-0 {
  background: linear-gradient(90deg, #22d3ee, #4f7cff);
}
.dist-bar-1 {
  background: linear-gradient(90deg, #4f7cff, #8b5cf6);
}
.dist-bar-2 {
  background: linear-gradient(90deg, #8b5cf6, #c084fc);
}
.dist-more {
  font-size: 12px;
  color: var(--ink-3);
}
.empty-tip {
  margin-top: 18px;
  padding: 26px 0;
  text-align: center;
  color: var(--ink-3);
  font-size: 13px;
  border: 1px dashed rgba(79, 124, 255, 0.2);
  border-radius: 12px;
}

/* 底部区 */
.bottom-grid {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 18px;
}
@media (max-width: 960px) {
  .bottom-grid {
    grid-template-columns: 1fr;
  }
}
.usage-card {
  padding: 22px 24px;
}
.mid-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.mid-desc {
  margin: 12px 0 0;
  font-size: 12.5px;
  color: var(--ink-3);
}

/* 动态流 */
.feed {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.feed-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 10px;
  transition: background 0.2s;
}
.feed-row:hover {
  background: rgba(255, 255, 255, 0.6);
}
.feed-pill {
  flex-shrink: 0;
  padding: 1px 10px;
  font-size: 11px;
}
.feed-card {
  flex: 1;
  font-size: 12.5px;
  color: var(--ink-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.feed-pj {
  font-size: 12px;
  color: var(--ink-2);
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.feed-time {
  font-size: 11.5px;
  color: var(--ink-3);
  flex-shrink: 0;
}

.mono {
  font-family: Consolas, 'Courier New', monospace;
}
</style>