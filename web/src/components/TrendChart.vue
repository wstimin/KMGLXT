<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { get } from '@/lib/request'

const props = defineProps({ days: { type: Number, default: 7 } })

const data = ref([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const r = await get(`/api/admin/stats/trend?days=${props.days}`)
    data.value = r.list || []
  } catch {
    data.value = []
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(() => props.days, load)

/* ── SVG 几何 ── */
const W = 560
const H = 200
const PAD = { l: 34, r: 10, t: 14, b: 26 }

const maxV = computed(() => {
  const m = Math.max(1, ...data.value.flatMap((d) => [d.generated, d.consumed]))
  return Math.ceil(m / 5) * 5
})
const innerW = computed(() => W - PAD.l - PAD.r)
const innerH = computed(() => H - PAD.t - PAD.b)
const xAt = (i) =>
  PAD.l +
  (data.value.length <= 1 ? innerW.value / 2 : (i * innerW.value) / (data.value.length - 1))
const yAt = (v) => PAD.t + (1 - v / maxV.value) * innerH.value

function linePath(key) {
  if (!data.value.length) return ''
  return data.value
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(d[key]).toFixed(1)}`)
    .join(' ')
}
function areaPath(key) {
  if (!data.value.length) return ''
  const n = data.value.length - 1
  return `${linePath(key)} L${xAt(n).toFixed(1)},${(H - PAD.b).toFixed(1)} L${xAt(0).toFixed(1)},${(H - PAD.b).toFixed(1)} Z`
}

/* x 轴刻度:7 天全显,30 天稀疏 */
const xTicks = computed(() => {
  if (!data.value.length) return []
  const step = data.value.length <= 7 ? 1 : Math.ceil(data.value.length / 5)
  return data.value.map((d, i) => ({ ...d, i })).filter((_, i) => i % step === 0)
})
</script>

<template>
  <div v-loading="loading" class="trend">
    <svg :viewBox="`0 0 ${W} ${H}`" class="trend-svg" role="img" aria-label="生成与核销趋势">
      <defs>
        <linearGradient id="grad-gen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.45" />
          <stop offset="100%" stop-color="#22d3ee" stop-opacity="0.02" />
        </linearGradient>
        <linearGradient id="grad-con" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.45" />
          <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0.02" />
        </linearGradient>
        <filter id="glow-line" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#38bdf8" flood-opacity="0.55" />
        </filter>
      </defs>

      <!-- 网格 + y 轴 -->
      <g class="grid">
        <line v-for="v in [0, 0.5, 1]" :key="v" :x1="PAD.l" :y1="yAt(maxV * v)" :x2="W - PAD.r" :y2="yAt(maxV * v)" />
        <text v-for="v in [0, 0.5, 1]" :key="'t' + v" :x="PAD.l - 6" :y="yAt(maxV * v) + 4" class="axis-y">
          {{ Math.round(maxV * v) }}
        </text>
      </g>

      <!-- 面积 + 折线 -->
      <template v-if="data.length">
        <path :d="areaPath('consumed')" fill="url(#grad-con)" />
        <path :d="areaPath('generated')" fill="url(#grad-gen)" />
        <path :d="linePath('consumed')" class="line line-con" filter="url(#glow-line)" />
        <path :d="linePath('generated')" class="line line-gen" filter="url(#glow-line)" />

        <!-- 数据点数据气泡(原生 title) -->
        <g v-for="(d, i) in data" :key="d.date">
          <title>生成 {{ d.generated }} / 核销 {{ d.consumed }} · {{ d.date }}</title>
        </g>
      </template>

      <!-- x 轴日期 -->
      <g class="axis-x">
        <text v-for="t in xTicks" :key="t.date" :x="xAt(t.i)" :y="H - 6">{{ t.date }}</text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.trend {
  min-height: 200px;
}
.trend-svg {
  width: 100%;
  height: auto;
  display: block;
}
.line {
  fill: none;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.line-gen {
  stroke: #22d3ee;
}
.line-con {
  stroke: #8b5cf6;
}
.grid line {
  stroke: rgba(79, 124, 255, 0.1);
  stroke-dasharray: 3 4;
}
.axis-y,
.axis-x {
  font-size: 10px;
  fill: var(--ink-3, #94a3b8);
  text-anchor: end;
}
.axis-x text {
  text-anchor: middle;
  font-size: 10px;
  fill: var(--ink-3, #94a3b8);
}
</style>