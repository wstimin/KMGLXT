<script setup>
import { computed } from 'vue'
import { ICONS } from './icons'

const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 20 },
})

// 每个实例单独一个渐变 id,避免多个 SVG 冲突
let uid = 0
const gid = `ig${++uid}-${Date.now().toString(36)}`

function normalize(raw) {
  if (!raw) return { grad: ['#a5f3fc', '#4f7cff'], paths: [], accent: null, strokes: [], gloss: [] }
  if (Array.isArray(raw)) return { grad: ['#a5f3fc', '#4f7cff'], paths: raw, accent: null, strokes: [], gloss: [] }
  return {
    grad: raw.grad || ['#a5f3fc', '#4f7cff'],
    paths: raw.paths || [],
    accent: raw.accent || null,
    strokes: raw.strokes || [],
    gloss: raw.gloss || [],
  }
}

const spec = computed(() => normalize(ICONS[props.name] || ICONS.help))
const glossTransforms = computed(() =>
  spec.value.gloss.map((g) => (g[4] ? `rotate(${g[4]} ${g[0]} ${g[1]})` : ''))
)
</script>

<template>
  <span class="icon-frame" :style="{ width: size + 'px', height: size + 'px' }">
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient :id="gid" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" :stop-color="spec.grad[0]" />
          <stop offset="100%" :stop-color="spec.grad[1]" />
        </linearGradient>
      </defs>

      <!-- 1. 主形状:渐变填充 + 细白描边,立体主体 -->
      <g :fill="`url(#${gid})`" stroke="rgba(255,255,255,0.55)" stroke-width="0.7" stroke-linejoin="round">
        <path v-for="(d, i) in spec.paths" :key="'p' + i" :d="d" />
      </g>

      <!-- 2. 玻璃高光:顶部白色椭圆,模拟釉面反光 -->
      <ellipse
        v-for="(g, i) in spec.gloss"
        :key="'g' + i"
        :cx="g[0]"
        :cy="g[1]"
        :rx="g[2]"
        :ry="g[3]"
        :transform="glossTransforms[i]"
        fill="rgba(255,255,255,0.5)"
      />

      <!-- 3. 细节色块:芯片/孔位/标记等小零件 -->
      <g v-if="spec.accent" :fill="spec.accent.color">
        <path v-for="(d, i) in spec.accent.paths" :key="'a' + i" :d="d" />
      </g>

      <!-- 4. 描边细节:白色勾线或渐变描线('grad' 表示跟随主渐变) -->
      <path
        v-for="(s, i) in spec.strokes"
        :key="'s' + i"
        :d="s.d"
        :stroke="s.color === 'grad' ? `url(#${gid})` : s.color"
        :stroke-width="s.width || 1.4"
        stroke-linecap="round"
        stroke-linejoin="round"
        fill="none"
      />
    </svg>
  </span>
</template>